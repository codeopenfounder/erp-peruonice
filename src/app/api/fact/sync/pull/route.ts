import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateFactUser } from "@/lib/fact-auth";
import { getSunatProvider } from "@/lib/sunat/factory";
import {
  MAX_SUNAT_ATTEMPTS,
  persistSunatResult,
  registerSunatAttempt,
} from "@/lib/sunat/persist";

/**
 * Auto-retry SUNAT submission for invoices stuck in 'issued' status.
 * These are invoices that were synced to Supabase but SUNAT submission failed.
 */
async function autoRetrySunat(tenantId: string) {
  const adminClient = createAdminClient();

  // Find invoices in 'issued' status (synced but never sent to SUNAT).
  // El tope de intentos evita que un comprobante que SUNAT rechaza de forma
  // permanente se reenvíe en cada pull para siempre (~720 veces al día).
  const { data: stuckInvoices } = await adminClient
    .from("invoices")
    .select("id, series_id, correlative_number, document_type, customer_id, op_gravada, op_exonerada, op_inafecta, igv_total, total, reference_invoice_id, reference_reason, created_at, customer_document_type, customer_document_number, customer_name, customer_address, cash_register_id, has_detraction, detraction_code, detraction_percentage, detraction_amount, detraction_payment_method")
    .eq("tenant_id", tenantId)
    .eq("status", "issued")
    .lt("sunat_attempts", MAX_SUNAT_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(5); // Process max 5 per pull to avoid timeout

  if (!stuckInvoices?.length) return;

  // Get fact config
  const { data: factConfigRaw } = await adminClient
    .from("fact_config")
    .select("ruc, razon_social, direccion_fiscal, ubigeo, departamento, provincia, distrito, api_token, is_production, provider, detraction_account")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .single();

  if (!factConfigRaw?.api_token) return;

  const factConfig = { ...factConfigRaw, tenant_id: tenantId };
  let provider;
  try {
    provider = getSunatProvider(factConfig.provider);
  } catch (err) {
    console.error("[auto-retry] Invalid provider:", err);
    return;
  }

  for (const inv of stuckInvoices) {
    try {
      // Get series code
      const { data: seriesData } = await adminClient
        .from("invoice_series")
        .select("series_code")
        .eq("id", inv.series_id)
        .single();

      // Use denormalized customer data from invoice, fallback to customer lookup
      let customerDocType = inv.customer_document_type;
      let customerDocNumber = inv.customer_document_number;
      let customerName = inv.customer_name;
      let customerAddress = inv.customer_address;

      if (!customerDocType && inv.customer_id) {
        const { data: cust } = await adminClient
          .from("customers")
          .select("document_type, document_number, legal_name, address")
          .eq("id", inv.customer_id)
          .single();
        if (cust) {
          customerDocType = cust.document_type;
          customerDocNumber = cust.document_number;
          customerName = cust.legal_name;
          customerAddress = cust.address;
        }
      }

      // Resolve branch address for fallback chain: customer → branch → fiscal
      let branchAddress: string | null = null;
      if (inv.cash_register_id) {
        const { data: reg } = await adminClient
          .from("cash_registers")
          .select("branch_id")
          .eq("id", inv.cash_register_id)
          .single();
        if (reg?.branch_id) {
          const { data: branch } = await adminClient
            .from("branches")
            .select("address")
            .eq("id", reg.branch_id)
            .single();
          branchAddress = branch?.address || null;
        }
      }

      // Get items
      const { data: items } = await adminClient
        .from("invoice_items")
        .select("description, quantity, unit_price, unit_of_measure, igv_rate, igv_amount, subtotal, total, tax_type")
        .eq("invoice_id", inv.id)
        .order("sort_order");

      // Resolve reference for NC/ND
      let refSeries: string | undefined;
      let refCorrelative: number | undefined;
      let refDocType: string | undefined;
      if (inv.reference_invoice_id) {
        const { data: refInv } = await adminClient
          .from("invoices")
          .select("series_id, correlative_number, document_type")
          .eq("id", inv.reference_invoice_id)
          .single();
        if (refInv) {
          const { data: refSeriesData } = await adminClient
            .from("invoice_series")
            .select("series_code")
            .eq("id", refInv.series_id)
            .single();
          refSeries = refSeriesData?.series_code;
          refCorrelative = refInv.correlative_number;
          refDocType = refInv.document_type;
        }
      }

      const invoiceForSunat = {
        id: inv.id,
        document_type: inv.document_type,
        series_code: seriesData?.series_code || "B001",
        correlative_number: inv.correlative_number,
        customer_document_type: customerDocType || null,
        customer_document_number: customerDocNumber || null,
        customer_name: customerName || null,
        customer_address: customerAddress || branchAddress || factConfig.direccion_fiscal || null,
        op_gravada: inv.op_gravada,
        op_exonerada: inv.op_exonerada,
        op_inafecta: inv.op_inafecta,
        igv_total: inv.igv_total,
        total: inv.total,
        items: (items || []).map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          unit_of_measure: item.unit_of_measure,
          igv_rate: item.igv_rate,
          igv_amount: item.igv_amount,
          subtotal: item.subtotal,
          total: item.total,
          tax_type: item.tax_type,
        })),
        reference_series: refSeries,
        reference_correlative: refCorrelative,
        reference_document_type: refDocType,
        reference_reason: inv.reference_reason || undefined,
        created_at: inv.created_at,
        // Sin esto, una factura con SPOT reenviada por el auto-retry se emitía
        // sin detracción, es decir: un comprobante distinto del original.
        has_detraction: inv.has_detraction || false,
        detraction_code: inv.detraction_code || null,
        detraction_percentage: inv.detraction_percentage ?? null,
        detraction_amount: inv.detraction_amount ?? null,
        detraction_payment_method: inv.detraction_payment_method || null,
        detraction_account: factConfigRaw.detraction_account || null,
      };

      await registerSunatAttempt(inv.id);
      const result = await provider.submit(factConfig, inv.id, invoiceForSunat);
      await persistSunatResult(inv.id, result);
    } catch (err) {
      console.error(`[auto-retry] SUNAT retry failed for ${inv.id}:`, err);
    }
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await validateFactUser(request);
    const body = await request.json();
    const type: string = body?.type || "full";
    const since: string | null = body?.since || null;

    const adminClient = createAdminClient();

    if (type === "full") {
      // Today in Peru timezone for reservation date filters
      const peruToday = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
      const todayStr = `${peruToday.getFullYear()}-${String(peruToday.getMonth() + 1).padStart(2, "0")}-${String(peruToday.getDate()).padStart(2, "0")}`;

      const [
        productsRes,
        schedulesRes,
        categoriesRes,
        tagsRes,
        customersRes,
        seriesRes,
        registersRes,
        configRes,
        brandingRes,
        promotionsRes,
        branchesRes,
        scheduleTimeRangesRes,
        reservationsRes,
        slotCountsRes,
        capacityGroupsRes,
        capacityGroupMembersRes,
      ] = await Promise.all([
        // All products and services (including inactive for sync soft-deletes)
        adminClient
          .from("products")
          .select("id, sku, name, description, type, product_kind, unit_price, cost_price, currency, tax_type, igv_rate, stock_quantity, min_stock, unit_of_measure, barcode, branch_id, image_url, is_active, is_schedulable")
          .eq("tenant_id", ctx.tenantId),

        // Service schedules (active only)
        adminClient
          .from("service_schedules")
          .select("id, product_id, branch_id, name, interval_minutes, default_capacity, is_active")
          .eq("tenant_id", ctx.tenantId)
          .eq("is_active", true),

        // Product categories (including inactive for sync soft-deletes)
        adminClient
          .from("product_categories")
          .select("id, name, parent_id, type, sort_order, is_active")
          .eq("tenant_id", ctx.tenantId),

        // Product tags (including inactive for sync soft-deletes)
        adminClient
          .from("product_tags")
          .select("id, category_id, name, color, is_active")
          .eq("tenant_id", ctx.tenantId),

        // Customers for invoicing
        adminClient
          .from("customers")
          .select("id, document_type, document_number, legal_name, trade_name, address, ubigeo, email, phone, is_active")
          .eq("tenant_id", ctx.tenantId)
          .eq("is_active", true),

        // Invoice series
        adminClient
          .from("invoice_series")
          .select("id, series_code, document_type, current_correlative, branch_id, cash_register_id")
          .eq("tenant_id", ctx.tenantId)
          .eq("is_active", true),

        // Cash registers
        // branch_id es obligatorio aquí: sync-engine.ts lo usa para resolver la
        // sede de la caja actual y escribir stored_config.branch_id/branch_name.
        // Al no venir, ese `find` nunca encontraba nada y la sede sólo existía en
        // memoria mientras durase la sesión.
        adminClient
          .from("cash_registers")
          .select("id, name, code, is_active, branch_id, petty_cash_amount")
          .eq("tenant_id", ctx.tenantId)
          .eq("is_active", true),

        // Fact config
        adminClient
          .from("fact_config")
          .select("ruc, razon_social, direccion_fiscal, ubigeo, departamento, provincia, distrito, provider, api_token, is_production, logo_url")
          .eq("tenant_id", ctx.tenantId)
          .eq("is_active", true)
          .single(),

        // Tenant branding (include theme colors)
        adminClient
          .from("tenant_branding")
          .select("company_name, logo_url, primary_color")
          .eq("tenant_id", ctx.tenantId)
          .single(),

        // Promotions (including inactive for sync soft-deletes)
        adminClient
          .from("promotions")
          .select(`
            id, code, name, description, discount_type, discount_value,
            applies_to, min_purchase_amount, max_discount_amount, min_quantity,
            applies_every, stock, used_count, max_uses_per_customer,
            valid_from, valid_until, restricted_hour_from, restricted_hour_until,
            is_active, is_combo, combo_price,
            promotion_category_filters(category_id),
            promotion_tag_filters(tag_id),
            promotion_branch_filters(branch_id)
          `)
          .eq("tenant_id", ctx.tenantId),

        // Branches (sedes)
        adminClient
          .from("branches")
          .select("id, name, code, type")
          .eq("tenant_id", ctx.tenantId)
          .eq("is_active", true),

        // Schedule time ranges — placeholder, filtered after Promise.all by tenant's schedule IDs
        Promise.resolve({ data: null as any }),

        // Reservations (today and future, confirmed/completed only)
        adminClient
          .from("reservations")
          .select("id, schedule_id, product_id, branch_id, customer_id, invoice_id, reservation_date, slot_start, slot_end, quantity, status, customer_name, access_code, entries_used")
          .eq("tenant_id", ctx.tenantId)
          .in("status", ["confirmed", "completed"])
          .gte("reservation_date", todayStr),

        // Slot counts (today and future)
        adminClient
          .from("reservation_slot_counts")
          .select("id, schedule_id, slot_date, slot_start, slot_end, reserved_count, capacity")
          .eq("tenant_id", ctx.tenantId)
          .gte("slot_date", todayStr),

        // Capacity groups (shared capacity across services)
        adminClient
          .from("capacity_groups")
          .select("id, branch_id, name, shared_capacity, is_active")
          .eq("tenant_id", ctx.tenantId)
          .eq("is_active", true),

        // Capacity group members
        adminClient
          .from("capacity_group_members")
          .select("id, group_id, schedule_id"),
      ]);

      // Fetch schedule time ranges filtered by tenant's schedule IDs (security: prevents cross-tenant data leak)
      const scheduleIds = (schedulesRes.data || []).map((s: any) => s.id);
      if (scheduleIds.length > 0) {
        const { data } = await adminClient
          .from("schedule_time_ranges")
          .select("id, schedule_id, day_of_week, start_time, end_time, capacity_override")
          .in("schedule_id", scheduleIds);
        scheduleTimeRangesRes.data = data;
      } else {
        scheduleTimeRangesRes.data = [];
      }

      // Get tag assignments and category assignments for products
      const productIds = (productsRes.data || []).map((p) => p.id);
      let tagAssignments: { product_id: string; tag_id: string }[] = [];
      let categoryAssignments: { product_id: string; category_id: string }[] = [];
      if (productIds.length > 0) {
        const [taRes, caRes] = await Promise.all([
          adminClient
            .from("product_tag_assignments")
            .select("product_id, tag_id")
            .in("product_id", productIds),
          adminClient
            .from("product_category_assignments")
            .select("product_id, category_id")
            .in("product_id", productIds),
        ]);
        tagAssignments = taRes.data || [];
        categoryAssignments = caRes.data || [];
      }

      // Fetch combo items for combo promotions
      const { data: allComboItems } = await adminClient
        .from("promotion_combo_items")
        .select("promotion_id, product_id, quantity");

      // Fetch supplies (including inactive for sync soft-deletes)
      const suppliesRes = await adminClient
        .from("supplies")
        .select("id, sku, name, description, unit_of_measure, stock_quantity, min_stock, cost_price, currency, image_url, barcode, available_in_pos, is_active")
        .eq("tenant_id", ctx.tenantId);

      // Fetch recipe items for composite products
      const compositeProductIds = (productsRes.data || [])
        .filter((p: any) => p.product_kind === "composite")
        .map((p: any) => p.id);
      let recipeItemsData: any[] = [];
      if (compositeProductIds.length > 0) {
        const { data: ri } = await adminClient
          .from("recipe_items")
          .select("product_id, supply_id, quantity_needed, unit_of_measure, sort_order")
          .in("product_id", compositeProductIds);
        recipeItemsData = ri || [];
      }

      // Fetch supply category/tag assignments
      const supplyIds = (suppliesRes.data || []).map((s: any) => s.id);
      let supplyCategoryAssignments: any[] = [];
      let supplyTagAssignments: any[] = [];
      if (supplyIds.length > 0) {
        const [scaRes, staRes] = await Promise.all([
          adminClient
            .from("supply_category_assignments")
            .select("supply_id, category_id")
            .in("supply_id", supplyIds),
          adminClient
            .from("supply_tag_assignments")
            .select("supply_id, tag_id")
            .in("supply_id", supplyIds),
        ]);
        supplyCategoryAssignments = scaRes.data || [];
        supplyTagAssignments = staRes.data || [];
      }

      // Calculate monthly petty cash assigned (from petty_cash_in movements this month)
      const cashRegisters = registersRes.data || [];
      if (cashRegisters.length > 0) {
        const peruNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
        const monthStart = `${peruNow.getFullYear()}-${String(peruNow.getMonth() + 1).padStart(2, "0")}-01T05:00:00Z`;
        const crIds = cashRegisters.map((r: { id: string }) => r.id);
        const { data: pettyCashMovs } = await adminClient
          .from("cash_register_movements")
          .select("cash_register_id, amount")
          .in("cash_register_id", crIds)
          .eq("type", "petty_cash_in")
          .gte("created_at", monthStart);

        const monthlyMap: Record<string, number> = {};
        for (const m of pettyCashMovs || []) {
          if (m.cash_register_id) {
            monthlyMap[m.cash_register_id] = (monthlyMap[m.cash_register_id] || 0) + m.amount;
          }
        }
        for (const cr of cashRegisters) {
          (cr as { petty_cash_amount: number }).petty_cash_amount = monthlyMap[cr.id] || 0;
        }
      }

      // Auto-retry stuck invoices (fire-and-forget — don't block sync response)
      autoRetrySunat(ctx.tenantId).catch((err) =>
        console.error("[sync-pull] Auto-retry error:", err)
      );

      // Fetch invoice statuses (pending/recent SUNAT updates)
      const { data: invoiceStatuses } = await adminClient
        .from("invoices")
        .select("id, status, sunat_document_id, sunat_response_code, sunat_response_desc, xml_url, cdr_url, hash_code")
        .eq("tenant_id", ctx.tenantId)
        .or("status.eq.issued,status.eq.sent_to_sunat,status.eq.accepted,status.eq.rejected,status.eq.voided")
        .order("created_at", { ascending: false })
        .limit(200);

      return NextResponse.json({
        success: true,
        type: "full",
        data: {
          products: productsRes.data || [],
          categories: categoriesRes.data || [],
          tags: tagsRes.data || [],
          tag_assignments: tagAssignments,
          category_assignments: categoryAssignments,
          customers: customersRes.data || [],
          series: seriesRes.data || [],
          cash_registers: registersRes.data || [],
          config: configRes.data || null,
          branding: brandingRes.data || null,
          promotions: promotionsRes.data || [],
          promotion_combo_items: allComboItems || [],
          branches: branchesRes.data || [],
          supplies: suppliesRes.data || [],
          recipe_items: recipeItemsData,
          supply_category_assignments: supplyCategoryAssignments,
          supply_tag_assignments: supplyTagAssignments,
          schedules: schedulesRes.data || [],
          schedule_time_ranges: scheduleTimeRangesRes.data || [],
          reservations: reservationsRes.data || [],
          slot_counts: slotCountsRes.data || [],
          capacity_groups: capacityGroupsRes.data || [],
          capacity_group_members: capacityGroupMembersRes.data || [],
          invoice_statuses: invoiceStatuses || [],
          server_time: new Date().toISOString(),
        },
      });
    }

    if (type === "incremental" && since) {
      const sinceDate = new Date(since).toISOString();
      const peruTodayIncr = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
      const todayStrIncr = `${peruTodayIncr.getFullYear()}-${String(peruTodayIncr.getMonth() + 1).padStart(2, "0")}-${String(peruTodayIncr.getDate()).padStart(2, "0")}`;

      const [productsRes, customersRes, seriesRes, promotionsRes, categoriesRes, tagsRes] =
        await Promise.all([
          // Products updated since
          adminClient
            .from("products")
            .select("id, sku, name, description, type, product_kind, unit_price, cost_price, currency, tax_type, igv_rate, stock_quantity, min_stock, unit_of_measure, barcode, branch_id, image_url, is_active, is_schedulable")
            .eq("tenant_id", ctx.tenantId)
            .gt("updated_at", sinceDate),

          // Customers updated since
          adminClient
            .from("customers")
            .select("id, document_type, document_number, legal_name, trade_name, address, ubigeo, email, phone, is_active")
            .eq("tenant_id", ctx.tenantId)
            .gt("updated_at", sinceDate),

          // Series (always include, cheap)
          // Se filtran las inactivas igual que en el pull full: sin el filtro, una
          // serie desactivada en el ERP seguía llegando al POS y quedaba
          // seleccionable, porque el upsert de Rust ni siquiera lee is_active.
          adminClient
            .from("invoice_series")
            .select("id, series_code, document_type, current_correlative, branch_id, cash_register_id, is_active")
            .eq("tenant_id", ctx.tenantId)
            .eq("is_active", true),

          // Active promotions (always include — filters are nested M2M data that must stay fresh)
          adminClient
            .from("promotions")
            .select(`
              id, code, name, description, discount_type, discount_value,
              applies_to, min_purchase_amount, max_discount_amount, min_quantity,
              applies_every, stock, used_count, max_uses_per_customer,
              valid_from, valid_until, restricted_hour_from, restricted_hour_until,
              is_active, is_combo, combo_price,
              promotion_category_filters(category_id),
              promotion_tag_filters(tag_id),
              promotion_branch_filters(branch_id)
            `)
            .eq("tenant_id", ctx.tenantId),

          // Categories (always include, cheap — includes inactive for sync soft-deletes)
          adminClient
            .from("product_categories")
            .select("id, name, parent_id, type, sort_order, is_active")
            .eq("tenant_id", ctx.tenantId),

          // Tags (including inactive for sync soft-deletes)
          adminClient
            .from("product_tags")
            .select("id, category_id, name, color, is_active")
            .eq("tenant_id", ctx.tenantId),
        ]);

      // Always fetch ALL tag/category assignments for the tenant (full replacement strategy)
      // This ensures POI data always wins regardless of updated_at timing
      const { data: allTenantProducts } = await adminClient
        .from("products")
        .select("id")
        .eq("tenant_id", ctx.tenantId);
      const allProductIds = (allTenantProducts || []).map((p: { id: string }) => p.id);

      let categoryAssignments: { product_id: string; category_id: string }[] = [];
      let tagAssignments: { product_id: string; tag_id: string }[] = [];
      if (allProductIds.length > 0) {
        const [caRes, taRes] = await Promise.all([
          adminClient
            .from("product_category_assignments")
            .select("product_id, category_id")
            .in("product_id", allProductIds),
          adminClient
            .from("product_tag_assignments")
            .select("product_id, tag_id")
            .in("product_id", allProductIds),
        ]);
        categoryAssignments = caRes.data || [];
        tagAssignments = taRes.data || [];
      }

      // Fetch combo items for combo promotions (always include, cheap)
      const { data: incrComboItems } = await adminClient
        .from("promotion_combo_items")
        .select("promotion_id, product_id, quantity");

      // Fetch supplies updated since
      const { data: incrSupplies } = await adminClient
        .from("supplies")
        .select("id, sku, name, description, unit_of_measure, stock_quantity, min_stock, cost_price, currency, image_url, barcode, available_in_pos, is_active")
        .eq("tenant_id", ctx.tenantId)
        .gt("updated_at", sinceDate);

      // Recipe items - always fetch all for consistency (cheap query)
      let allRecipeItems: any[] = [];
      if (allProductIds.length > 0) {
        const { data: ri } = await adminClient
          .from("recipe_items")
          .select("product_id, supply_id, quantity_needed, unit_of_measure, sort_order")
          .in("product_id", allProductIds);
        allRecipeItems = ri || [];
      }

      // Supply assignments - always fetch all for consistency (full replacement strategy)
      const { data: allTenantSupplies } = await adminClient
        .from("supplies")
        .select("id")
        .eq("tenant_id", ctx.tenantId);
      const fullSupplyIds = (allTenantSupplies || []).map((s: { id: string }) => s.id);

      let incrSupplyCategoryAssignments: any[] = [];
      let incrSupplyTagAssignments: any[] = [];
      if (fullSupplyIds.length > 0) {
        const [scaRes, staRes] = await Promise.all([
          adminClient
            .from("supply_category_assignments")
            .select("supply_id, category_id")
            .in("supply_id", fullSupplyIds),
          adminClient
            .from("supply_tag_assignments")
            .select("supply_id, tag_id")
            .in("supply_id", fullSupplyIds),
        ]);
        incrSupplyCategoryAssignments = scaRes.data || [];
        incrSupplyTagAssignments = staRes.data || [];
      }

      // Cash registers with monthly petty cash (always include for live balance)
      const { data: incrRegisters } = await adminClient
        .from("cash_registers")
        .select("id, name, code, is_active, branch_id, petty_cash_amount")
        .eq("tenant_id", ctx.tenantId)
        .eq("is_active", true);

      // Branches: el pull incremental no las devolvía, así que el bloque de
      // sync-engine.ts que escribe stored_config.branch_id/branch_name ni
      // siquiera entraba (exige branches Y cash_registers). Son 4 columnas de una
      // tabla con una fila: el coste es irrelevante frente a tener la sede.
      const { data: incrBranches } = await adminClient
        .from("branches")
        .select("id, name, code, type")
        .eq("tenant_id", ctx.tenantId)
        .eq("is_active", true);

      if (incrRegisters?.length) {
        const peruNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
        const monthStart = `${peruNow.getFullYear()}-${String(peruNow.getMonth() + 1).padStart(2, "0")}-01T05:00:00Z`;
        const crIds = incrRegisters.map((r) => r.id);
        const { data: pettyCashMovs } = await adminClient
          .from("cash_register_movements")
          .select("cash_register_id, amount")
          .in("cash_register_id", crIds)
          .eq("type", "petty_cash_in")
          .gte("created_at", monthStart);

        const monthlyMap: Record<string, number> = {};
        for (const m of pettyCashMovs || []) {
          if (m.cash_register_id) {
            monthlyMap[m.cash_register_id] = (monthlyMap[m.cash_register_id] || 0) + m.amount;
          }
        }
        for (const cr of incrRegisters) {
          (cr as { petty_cash_amount: number }).petty_cash_amount = monthlyMap[cr.id] || 0;
        }
      }

      // Auto-retry stuck invoices (fire-and-forget — don't block sync response)
      autoRetrySunat(ctx.tenantId).catch((err) =>
        console.error("[sync-pull] Auto-retry error:", err)
      );

      // Fetch invoice statuses updated since last sync
      const { data: invoiceStatuses } = await adminClient
        .from("invoices")
        .select("id, status, sunat_document_id, sunat_response_code, sunat_response_desc, xml_url, cdr_url, hash_code")
        .eq("tenant_id", ctx.tenantId)
        .gt("updated_at", sinceDate)
        .order("updated_at", { ascending: false })
        .limit(200);

      // Schedules (always include, small table)
      const [incrSchedulesRes, incrTimeRangesRes, incrReservationsRes, incrSlotCountsRes, incrCapGroupsRes, incrCapMembersRes] =
        await Promise.all([
          adminClient
            .from("service_schedules")
            .select("id, product_id, branch_id, name, interval_minutes, default_capacity, is_active")
            .eq("tenant_id", ctx.tenantId)
            .eq("is_active", true),

          // Placeholder — filtered after by tenant's schedule IDs
          Promise.resolve({ data: null as any }),

          adminClient
            .from("reservations")
            .select("id, schedule_id, product_id, branch_id, customer_id, invoice_id, reservation_date, slot_start, slot_end, quantity, status, customer_name, access_code, entries_used")
            .eq("tenant_id", ctx.tenantId)
            .in("status", ["confirmed", "completed"])
            .gte("reservation_date", todayStrIncr)
            .gt("updated_at", sinceDate),

          adminClient
            .from("reservation_slot_counts")
            .select("id, schedule_id, slot_date, slot_start, slot_end, reserved_count, capacity")
            .eq("tenant_id", ctx.tenantId)
            .gte("slot_date", todayStrIncr),

          adminClient
            .from("capacity_groups")
            .select("id, branch_id, name, shared_capacity, is_active")
            .eq("tenant_id", ctx.tenantId)
            .eq("is_active", true),

          adminClient
            .from("capacity_group_members")
            .select("id, group_id, schedule_id"),
        ]);

      // Fetch schedule time ranges filtered by tenant's schedule IDs (security: prevents cross-tenant data leak)
      const incrScheduleIds = (incrSchedulesRes.data || []).map((s: any) => s.id);
      if (incrScheduleIds.length > 0) {
        const { data } = await adminClient
          .from("schedule_time_ranges")
          .select("id, schedule_id, day_of_week, start_time, end_time, capacity_override")
          .in("schedule_id", incrScheduleIds);
        incrTimeRangesRes.data = data;
      } else {
        incrTimeRangesRes.data = [];
      }

      return NextResponse.json({
        success: true,
        type: "incremental",
        data: {
          products: productsRes.data || [],
          categories: categoriesRes.data || [],
          tags: tagsRes.data || [],
          customers: customersRes.data || [],
          series: seriesRes.data || [],
          promotions: promotionsRes.data || [],
          promotion_combo_items: incrComboItems || [],
          cash_registers: incrRegisters || [],
          branches: incrBranches || [],
          category_assignments: categoryAssignments,
          tag_assignments: tagAssignments,
          supplies: incrSupplies || [],
          recipe_items: allRecipeItems,
          supply_category_assignments: incrSupplyCategoryAssignments,
          supply_tag_assignments: incrSupplyTagAssignments,
          schedules: incrSchedulesRes.data || [],
          schedule_time_ranges: incrTimeRangesRes.data || [],
          reservations: incrReservationsRes.data || [],
          slot_counts: incrSlotCountsRes.data || [],
          capacity_groups: incrCapGroupsRes.data || [],
          capacity_group_members: incrCapMembersRes.data || [],
          invoice_statuses: invoiceStatuses || [],
          server_time: new Date().toISOString(),
        },
      });
    }

    return NextResponse.json(
      { success: false, error: "Tipo de sync inválido. Usa 'full' o 'incremental'" },
      { status: 400 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    const status =
      message.includes("token") || message.includes("authorized") ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
