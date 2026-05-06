import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateFactUser } from "@/lib/fact-auth";
import { broadcastBatchStockUpdate } from "@/lib/stock-broadcast";
import { getSunatProvider } from "@/lib/sunat/factory";

/** Convert empty strings to null (prevents "invalid input syntax for type uuid" errors). */
function nullIfEmpty(v: unknown): string | null {
  if (typeof v === "string" && v.trim() !== "") return v;
  return null;
}

interface PushInvoiceItem {
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  unit_of_measure: string;
  discount_percentage: number;
  discount_amount: number;
  tax_type: string;
  igv_rate: number;
  igv_amount: number;
  isc_amount: number;
  icbper_amount: number;
  subtotal: number;
  total: number;
  sort_order: number;
  // Cortesía + supply fields
  is_cortesia?: boolean;
  cortesia_reason?: string | null;
  original_unit_price?: number | null;
  supply_id?: string | null;
}

interface PushInvoice {
  local_id: string;
  series_id: string;
  document_type: string;
  customer_id: string | null;
  op_gravada: number;
  op_exonerada: number;
  op_inafecta: number;
  igv_total: number;
  isc_total: number;
  icbper_total: number;
  discount_total: number;
  total: number;
  payment_method: string;
  currency?: string;
  exchange_rate?: number;
  cash_register_id: string | null;
  opening_id: string | null;
  reference_invoice_id: string | null;
  reference_reason: string | null;
  promotion_id: string | null;
  promotion_discount: number;
  promotion_uses: number;
  customer_document_type: string | null;
  customer_document_number: string | null;
  customer_name: string | null;
  customer_address: string | null;
  authorized_by: string | null;
  authorized_by_name: string | null;
  authorized_at: string | null;
  items: PushInvoiceItem[];
  created_at: string;
}

interface PushMovement {
  local_id: string;
  opening_id: string;
  type: string;
  amount: number;
  description: string | null;
  invoice_id: string | null;
  payment_method: string | null;
  created_at: string;
  reason: string | null;
  receipt_number: string | null;
  cash_register_id: string | null;
  authorized_by: string | null;
  authorized_name: string | null;
}

export async function POST(request: Request) {
  try {
    const ctx = await validateFactUser(request);
    const body = await request.json();
    const invoices: PushInvoice[] = body?.invoices || [];
    const movements: PushMovement[] = body?.movements || [];

    const reservations: unknown[] = body?.reservations || [];

    const adminClient = createAdminClient();

    // Upsert customers from poi-fact
    const customerResults: { id: string; success: boolean }[] = [];
    for (const cust of (body.customers || []) as Array<{id: string; document_type: string; document_number: string; legal_name: string; trade_name?: string; address?: string; ubigeo?: string; email?: string; phone?: string}>) {
      try {
        await adminClient.from("customers").upsert({
          id: cust.id,
          tenant_id: ctx.tenantId,
          document_type: cust.document_type,
          document_number: cust.document_number,
          legal_name: cust.legal_name,
          trade_name: cust.trade_name || null,
          address: cust.address || null,
          ubigeo: cust.ubigeo || null,
          email: cust.email || null,
          phone: cust.phone || null,
        }, { onConflict: "id" });
        customerResults.push({ id: cust.id, success: true });
      } catch {
        customerResults.push({ id: cust.id, success: false });
      }
    }

    // Resolve branch_id: try invoices first, then user assignment, then first branch
    let branchId: string | null = null;
    const firstCashRegisterId = invoices.find((i) => i.cash_register_id)?.cash_register_id;
    if (firstCashRegisterId) {
      const { data: reg } = await adminClient
        .from("cash_registers")
        .select("branch_id")
        .eq("id", firstCashRegisterId)
        .single();
      branchId = reg?.branch_id || null;
    }
    if (!branchId) {
      const { data: assignment } = await adminClient
        .from("fact_user_assignments")
        .select("cash_register_id")
        .eq("user_id", ctx.userId)
        .eq("is_active", true)
        .single();
      if (assignment?.cash_register_id) {
        const { data: reg } = await adminClient
          .from("cash_registers")
          .select("branch_id")
          .eq("id", assignment.cash_register_id)
          .single();
        branchId = reg?.branch_id || null;
      }
    }
    if (!branchId) {
      const { data: branch } = await adminClient
        .from("branches")
        .select("id")
        .eq("tenant_id", ctx.tenantId)
        .limit(1)
        .single();
      branchId = branch?.id || null;
    }

    const results: {
      local_id: string;
      server_id: string | null;
      correlative: number | null;
      success: boolean;
      error?: string;
      sunat_status?: string | null;
      sunat_document_id?: string | null;
      sunat_response_code?: string | null;
    }[] = [];

    const stockUpdates: { product_id: string; stock_quantity: number }[] = [];

    // Process invoices sequentially (correlative must be atomic)
    for (const inv of invoices) {
      try {
        // Idempotency: skip if invoice already exists in Supabase
        if (inv.local_id) {
          const { data: existing } = await adminClient
            .from("invoices")
            .select("id")
            .eq("id", inv.local_id)
            .maybeSingle();

          if (existing) {
            results.push({
              local_id: inv.local_id,
              server_id: existing.id,
              correlative: null,
              success: true,
            });
            continue;
          }
        }

        // Get next correlative atomically
        const { data: corrData, error: corrError } = await adminClient.rpc(
          "fn_next_correlative",
          { p_series_id: inv.series_id },
        );

        if (corrError || corrData == null) {
          results.push({
            local_id: inv.local_id,
            server_id: null,
            correlative: null,
            success: false,
            error: corrError?.message || "Error obteniendo correlativo",
          });
          continue;
        }

        const correlative = corrData as number;

        // Insert invoice
        const { data: inserted, error: insertError } = await adminClient
          .from("invoices")
          .insert({
            id: inv.local_id,
            tenant_id: ctx.tenantId,
            series_id: inv.series_id,
            correlative_number: correlative,
            document_type: inv.document_type,
            customer_id: inv.customer_id,
            op_gravada: inv.op_gravada,
            op_exonerada: inv.op_exonerada,
            op_inafecta: inv.op_inafecta,
            igv_total: inv.igv_total,
            isc_total: inv.isc_total,
            icbper_total: inv.icbper_total,
            discount_total: inv.discount_total,
            total: inv.total,
            status: "issued",
            payment_method: inv.payment_method,
            currency: inv.currency || "PEN",
            exchange_rate: inv.exchange_rate || 1.0,
            cash_register_id: inv.cash_register_id,
            opening_id: inv.opening_id,
            cashier_id: ctx.userId,
            reference_invoice_id: inv.reference_invoice_id,
            reference_reason: inv.reference_reason,
            promotion_id: inv.promotion_id,
            promotion_discount: inv.promotion_discount,
            promotion_uses: inv.promotion_uses || 0,
            customer_document_type: inv.customer_document_type || null,
            customer_document_number: inv.customer_document_number || null,
            customer_name: inv.customer_name || null,
            customer_address: inv.customer_address || null,
            authorized_by: inv.authorized_by || null,
            authorized_by_name: inv.authorized_by_name || null,
            authorized_at: inv.authorized_at || null,
            issue_date: (() => {
              const d = /[TZ+]/.test(inv.created_at)
                ? new Date(inv.created_at)
                : new Date(inv.created_at.replace(" ", "T") + "Z");
              return d.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
            })(),
            created_at: inv.created_at,
          })
          .select("id")
          .single();

        if (insertError || !inserted) {
          results.push({
            local_id: inv.local_id,
            server_id: null,
            correlative,
            success: false,
            error: insertError?.message || "Error insertando comprobante",
          });
          continue;
        }

        // Insert invoice items (with cost_price for report accuracy)
        if (inv.items.length > 0) {
          // Batch-fetch cost_price for all referenced products and supplies
          const productIds = [...new Set(inv.items.filter(i => i.product_id).map(i => i.product_id!))]
          const supplyIds = [...new Set(inv.items.filter(i => i.supply_id && !i.product_id).map(i => i.supply_id!))]
          const costMap = new Map<string, number>()

          let prodCostRows: { id: string; cost_price: number | null }[] = [];
          let supplyCostRows: { id: string; cost_price: number | null }[] = [];
          if (productIds.length > 0) {
            const { data: prodCosts } = await adminClient
              .from("products")
              .select("id, cost_price")
              .in("id", productIds)
            prodCostRows = prodCosts || [];
            for (const p of prodCostRows) costMap.set(p.id, p.cost_price ?? 0)
          }
          if (supplyIds.length > 0) {
            const { data: supplyCosts } = await adminClient
              .from("supplies")
              .select("id, cost_price")
              .in("id", supplyIds)
            supplyCostRows = supplyCosts || [];
            for (const s of supplyCostRows) costMap.set(s.id, s.cost_price ?? 0)
          }

          // Validate FK references: nullify product_id/supply_id if deleted from server
          const existingProductIds = new Set(prodCostRows.map(p => p.id));
          const existingSupplyIds = new Set(supplyCostRows.map(s => s.id));

          const itemRows = inv.items.map((item) => ({
            invoice_id: inserted.id,
            product_id: item.product_id && existingProductIds.has(item.product_id) ? item.product_id : null,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            unit_of_measure: item.unit_of_measure,
            discount_percentage: item.discount_percentage,
            discount_amount: item.discount_amount,
            tax_type: item.tax_type,
            igv_rate: item.igv_rate,
            igv_amount: item.igv_amount,
            isc_amount: item.isc_amount,
            icbper_amount: item.icbper_amount,
            subtotal: item.subtotal,
            total: item.total,
            sort_order: item.sort_order,
            is_cortesia: item.is_cortesia || false,
            cortesia_reason: item.cortesia_reason || null,
            original_unit_price: item.original_unit_price || null,
            supply_id: item.supply_id && existingSupplyIds.has(item.supply_id) ? item.supply_id : null,
            cost_price: costMap.get(item.product_id || item.supply_id || "") ?? 0,
          }));

          const { error: itemsError } = await adminClient.from("invoice_items").insert(itemRows);
          if (itemsError) {
            console.error("[sync-push] invoice_items insert failed:", itemsError.message);
            // Rollback: delete orphan invoice so POI Fact can retry
            await adminClient.from("invoices").delete().eq("id", inserted.id);
            results.push({
              local_id: inv.local_id,
              server_id: null,
              correlative,
              success: false,
              error: `Items insert failed: ${itemsError.message}`,
            });
            continue;
          }
        }

        // Ensure opening exists before creating cash movement
        if (inv.opening_id) {
          const { data: openingExists } = await adminClient
            .from("cash_register_openings")
            .select("id")
            .eq("id", inv.opening_id)
            .maybeSingle();

          if (!openingExists) {
            try {
              await adminClient.from("cash_register_openings").insert({
                id: inv.opening_id,
                tenant_id: ctx.tenantId,
                cash_register_id: inv.cash_register_id || null,
                opened_by: ctx.userId,
                opening_amount: 0,
                status: "open",
              });
            } catch { /* opening may have been created by another concurrent request */ }
          }
        }

        // Create cash register movement for this invoice
        if (inv.opening_id) {
          const isNc = inv.document_type === "nota_credito";
          const isNd = inv.document_type === "nota_debito";
          const ncReturn = isNc && ["01", "06", "07"].includes(inv.reference_reason || "");
          const ncPriceAdjust = isNc && ["04", "05", "09"].includes(inv.reference_reason || "");
          const shouldCreate = (!isNc && !isNd) || ncReturn || ncPriceAdjust || isNd;

          if (shouldCreate) {
            try {
              await adminClient.from("cash_register_movements").insert({
                tenant_id: ctx.tenantId,
                opening_id: inv.opening_id,
                type: (ncReturn || ncPriceAdjust) ? "refund" : "sale",
                amount: inv.total,
                description: isNc
                  ? (ncReturn ? "Devolución NC" : "Ajuste precio NC")
                  : isNd
                    ? "Ajuste ND"
                    : `Venta ${inv.document_type === "factura" ? "Factura" : "Boleta"}`,
                invoice_id: inserted.id,
                payment_method: inv.payment_method || "cash",
                created_by: ctx.userId,
                created_at: inv.created_at,
              });
            } catch (cashMovErr) {
              console.error("[sync-push] Cash movement insert failed:", cashMovErr);
            }
          }
        }

        // Increment promotion used_count
        if (inv.promotion_id) {
          const promoUses = inv.promotion_uses ?? 1;
          await adminClient.rpc("fn_increment_promotion_used_count", {
            p_promotion_id: inv.promotion_id,
            p_count: promoUses,
          });
          // Record usage for per-customer tracking
          await adminClient.from("promotion_usage").insert({
            tenant_id: ctx.tenantId,
            promotion_id: inv.promotion_id,
            customer_id: inv.customer_id,
            invoice_id: inserted.id,
          });
        }

        const isNcDocument = inv.document_type === "nota_credito";
        const isNdDocument = inv.document_type === "nota_debito";
        const ncStockReturn = isNcDocument && ["01", "06", "07"].includes(inv.reference_reason || "");
        // ND motivo 02 with real product_ids = quantity omission → stock goes out
        const ndStockOut = isNdDocument && inv.reference_reason === "02";

        if (isNcDocument && ncStockReturn) {
          // NC with stock return (motivos 01, 06, 07): INCREMENT stock back
          for (const item of inv.items) {
            if (item.product_id) {
              const { data: remaining, error: incErr } = await adminClient.rpc("fn_increment_stock", {
                p_product_id: item.product_id,
                p_quantity: item.quantity,
              });
              if (incErr) {
                console.error("[sync-push] NC stock increment failed:", incErr.message);
              } else if (typeof remaining === "number" && remaining >= 0) {
                stockUpdates.push({ product_id: item.product_id, stock_quantity: remaining });
              }
            }
          }
          for (const item of inv.items) {
            if (item.supply_id && !item.product_id) {
              const { error: supplyErr } = await adminClient.rpc("fn_increment_supply_stock", {
                p_supply_id: item.supply_id,
                p_quantity: item.quantity,
              });
              if (supplyErr) {
                console.error("[sync-push] NC supply stock increment failed:", supplyErr.message);
              }
              const { error: refreshErr } = await adminClient.rpc("fn_refresh_composite_stock_for_supply", {
                p_supply_id: item.supply_id,
              });
              if (refreshErr) {
                console.error("[sync-push] Composite stock refresh failed:", refreshErr.message);
              }
            }
          }
        } else if (isNdDocument && !ndStockOut) {
          // ND motivos 01, 03 or motivo 02 "price": NO stock changes (financial only)
        } else if (!isNcDocument) {
          // Normal sale or ND motivo 02 "quantity" (items with product_id): decrement stock
          for (const item of inv.items) {
            if (item.product_id) {
              const { data: remaining, error: decErr } = await adminClient.rpc("fn_decrement_stock", {
                p_product_id: item.product_id,
                p_quantity: item.quantity,
              });
              if (decErr) {
                console.error("[sync-push] fn_decrement_stock failed:", decErr.message);
              } else if (typeof remaining === "number" && remaining >= 0) {
                stockUpdates.push({ product_id: item.product_id, stock_quantity: remaining });
              }
            }
          }
          for (const item of inv.items) {
            if (item.supply_id && !item.product_id) {
              const { error: supplyErr } = await adminClient.rpc("fn_decrement_supply_stock", {
                p_supply_id: item.supply_id,
                p_quantity: item.quantity,
              });
              if (supplyErr) {
                console.error("[sync-push] Supply stock decrement failed:", supplyErr.message);
              }
              const { error: refreshErr } = await adminClient.rpc("fn_refresh_composite_stock_for_supply", {
                p_supply_id: item.supply_id,
              });
              if (refreshErr) {
                console.error("[sync-push] Composite stock refresh failed:", refreshErr.message);
              }
            }
          }
        }
        // NC with motivos 02,03,04,05,09,10: NO stock changes (informational/financial only)

        // Identify services + composites (different movement logic)
        const productIdsInInvoice = [...new Set(inv.items.filter(i => i.product_id).map(i => i.product_id!))];
        const serviceIds = new Set<string>();
        const compositeIds = new Set<string>();
        const recipeMap = new Map<string, Array<{ supply_id: string; quantity_needed: number }>>();

        if (productIdsInInvoice.length > 0) {
          const { data: productMeta } = await adminClient
            .from("products")
            .select("id, type, product_kind")
            .in("id", productIdsInInvoice);

          for (const p of productMeta || []) {
            if (p.type === "service") serviceIds.add(p.id);
            if (p.product_kind === "composite") compositeIds.add(p.id);
          }

          // Fetch recipes for composite products
          if (compositeIds.size > 0) {
            const { data: recipes } = await adminClient
              .from("recipe_items")
              .select("product_id, supply_id, quantity_needed")
              .in("product_id", Array.from(compositeIds));
            for (const r of recipes || []) {
              if (!recipeMap.has(r.product_id)) recipeMap.set(r.product_id, []);
              recipeMap.get(r.product_id)!.push({ supply_id: r.supply_id, quantity_needed: Number(r.quantity_needed) });
            }
          }
        }

        // Record inventory movements
        // For NC with stock return (01,06,07): movement_type = "nc_return"
        // For normal sales: movement_type = "sale"
        // For cortesia items: movement_type = "cortesia"
        // For NC without stock (02,03,04,05,09,10): skip inventory movements
        const baseMovementType = ncStockReturn ? "nc_return" : "sale";
        const shouldRecordMovements = !isNcDocument || ncStockReturn;

        if (shouldRecordMovements) {
          for (const item of inv.items) {
            // Per-item movement type: cortesia overrides "sale"
            const movementType = (!ncStockReturn && item.is_cortesia) ? "cortesia" : baseMovementType;

            const CORTESIA_LABELS: Record<string, string> = {
              cliente_insatisfecho: "Cliente insatisfecho",
              falla_producto: "Falla de producto",
              promocion: "Promoción",
              otro: "Otro",
            };
            const reasonLabel = item.cortesia_reason
              ? (CORTESIA_LABELS[item.cortesia_reason] || item.cortesia_reason)
              : "Sin motivo";
            const reason = item.is_cortesia ? `Cortesía: ${reasonLabel}` : null;
            const ncNotes = ncStockReturn ? `NC: ${inv.reference_reason === "01" ? "Anulación" : inv.reference_reason === "06" ? "Devolución total" : "Devolución por item"}` : null;

            // Services → skip (no stock)
            if (item.product_id && serviceIds.has(item.product_id)) continue;

            // Composite products → create movements for each recipe supply
            if (item.product_id && compositeIds.has(item.product_id)) {
              const recipeItems = recipeMap.get(item.product_id) || [];
              for (const ri of recipeItems) {
                await adminClient.from("inventory_movements").insert({
                  tenant_id: ctx.tenantId,
                  entity_type: "supply",
                  entity_id: ri.supply_id,
                  quantity: Math.round(item.quantity * ri.quantity_needed * 10000) / 10000,
                  movement_type: movementType,
                  reason: ncNotes || reason,
                  notes: ncStockReturn ? null : (item.is_cortesia ? `Cortesia de ${item.description} (x${item.quantity})` : `Venta de ${item.description} (x${item.quantity})`),
                  branch_id: branchId,
                  invoice_id: inserted.id,
                  created_by: ctx.userId,
                });
              }
              continue;
            }

            // Supply items (adicionales, cortesías) → movement for the supply
            if (item.supply_id && !item.product_id) {
              await adminClient.from("inventory_movements").insert({
                tenant_id: ctx.tenantId,
                entity_type: "supply",
                entity_id: item.supply_id,
                quantity: item.quantity,
                movement_type: movementType,
                reason: ncNotes || reason,
                notes: null,
                branch_id: branchId,
                invoice_id: inserted.id,
                created_by: ctx.userId,
              });
              continue;
            }

            // Simple products → normal movement
            if (item.product_id) {
              await adminClient.from("inventory_movements").insert({
                tenant_id: ctx.tenantId,
                entity_type: "product",
                entity_id: item.product_id,
                quantity: item.quantity,
                movement_type: movementType,
                reason: ncNotes || reason,
                notes: null,
                branch_id: branchId,
                invoice_id: inserted.id,
                created_by: ctx.userId,
              });
            }
          }
        }

        // Submit to SUNAT if valid doc type and API token configured
        let sunatResult: { status: string; documentId: string | null; sunatResponseCode: string | null } | null = null;
        const sunatDocTypes = ['factura', 'boleta', 'nota_credito', 'nota_debito'];
        if (sunatDocTypes.includes(inv.document_type)) {
          try {
            // Get fact config for SUNAT submission
            const { data: factConfigRaw } = await adminClient
              .from("fact_config")
              .select("ruc, razon_social, direccion_fiscal, ubigeo, departamento, provincia, distrito, api_token, is_production, provider")
              .eq("tenant_id", ctx.tenantId)
              .eq("is_active", true)
              .single();

            if (factConfigRaw?.api_token) {
              const factConfig = { ...factConfigRaw, tenant_id: ctx.tenantId };
              const provider = getSunatProvider(factConfig.provider);
              // Get series code
              const { data: seriesData } = await adminClient
                .from("invoice_series")
                .select("series_code")
                .eq("id", inv.series_id)
                .single();

              // Customer data comes directly from the push payload (SQLite JOIN)
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

              // Resolve reference invoice data for NC/ND
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

              const resolvedAddress = inv.customer_address || branchAddress || factConfig.direccion_fiscal || null;

              // Lookup cost_prices for supply items (SUNAT valor referencial for gratuito items)
              const supplyIds = inv.items.filter(i => i.supply_id).map(i => i.supply_id!);
              const supplyCostMap = new Map<string, number>();
              if (supplyIds.length > 0) {
                const { data: supplyCosts } = await adminClient
                  .from("supplies")
                  .select("id, cost_price")
                  .in("id", supplyIds);
                for (const s of supplyCosts || []) {
                  supplyCostMap.set(s.id, parseFloat(String(s.cost_price)) || 0.01);
                }
              }

              const invoiceForSunat = {
                id: inserted.id,
                document_type: inv.document_type,
                series_code: seriesData?.series_code || "B001",
                correlative_number: correlative,
                customer_document_type: inv.customer_document_type || null,
                customer_document_number: inv.customer_document_number || null,
                customer_name: inv.customer_name || null,
                customer_address: resolvedAddress,
                op_gravada: inv.op_gravada,
                op_exonerada: inv.op_exonerada,
                op_inafecta: inv.op_inafecta,
                igv_total: inv.igv_total,
                total: inv.total,
                items: inv.items.map((item) => ({
                  description: item.description,
                  quantity: item.quantity,
                  unit_price: item.unit_price,
                  unit_of_measure: item.unit_of_measure,
                  igv_rate: item.igv_rate,
                  igv_amount: item.igv_amount,
                  subtotal: item.subtotal,
                  total: item.total,
                  tax_type: item.tax_type,
                  reference_value: item.supply_id ? supplyCostMap.get(item.supply_id) : undefined,
                })),
                reference_series: refSeries,
                reference_correlative: refCorrelative,
                reference_document_type: refDocType,
                reference_reason: inv.reference_reason || undefined,
                created_at: inv.created_at,
              };

              // Update invoice with resolved address for future retry
              if (resolvedAddress && resolvedAddress !== inv.customer_address) {
                await adminClient
                  .from("invoices")
                  .update({ customer_address: resolvedAddress })
                  .eq("id", inserted.id);
              }

              sunatResult = await provider.submit(factConfig, inserted.id, invoiceForSunat);
            }
          } catch (sunatErr) {
            // SUNAT submission failure should not fail the sync
            console.error("SUNAT submission error:", sunatErr);
          }
        }

        results.push({
          local_id: inv.local_id,
          server_id: inserted.id,
          correlative,
          success: true,
          sunat_status: sunatResult?.status || null,
          sunat_document_id: sunatResult?.documentId || null,
          sunat_response_code: sunatResult?.sunatResponseCode || null,
        });
      } catch (invErr: unknown) {
        results.push({
          local_id: inv.local_id,
          server_id: null,
          correlative: null,
          success: false,
          error: invErr instanceof Error ? invErr.message : "Error desconocido",
        });
      }
    }

    // Process standalone cash movements (cash_in, cash_out)
    const movementResults: {
      local_id: string;
      server_id: string | null;
      success: boolean;
      error?: string;
    }[] = [];

    for (const mov of movements) {
      try {
        // Skip invoice-linked movements — already created during invoice processing
        if (mov.invoice_id) {
          const { data: existing } = await adminClient
            .from("cash_register_movements")
            .select("id")
            .eq("invoice_id", mov.invoice_id)
            .maybeSingle();

          if (existing) {
            movementResults.push({ local_id: mov.local_id, server_id: existing.id, success: true });
          } else {
            movementResults.push({ local_id: mov.local_id, server_id: null, success: false, error: "Invoice movement not found" });
          }
          continue;
        }

        // Ensure the opening exists in Supabase (POI Fact may push movements
        // before the heartbeat has synced the opening)
        if (mov.opening_id) {
          const { data: openingExists } = await adminClient
            .from("cash_register_openings")
            .select("id")
            .eq("id", mov.opening_id)
            .maybeSingle();

          if (!openingExists) {
            await adminClient.from("cash_register_openings").insert({
              id: mov.opening_id,
              tenant_id: ctx.tenantId,
              cash_register_id: mov.cash_register_id || null,
              opened_by: ctx.userId,
              opening_amount: 0,
              status: "open",
            });
          }
        }

        const { data: inserted, error: movError } = await adminClient
          .from("cash_register_movements")
          .insert({
            tenant_id: ctx.tenantId,
            opening_id: mov.opening_id,
            type: mov.type,
            amount: mov.amount,
            description: mov.description,
            invoice_id: null,
            payment_method: mov.payment_method,
            created_by: ctx.userId,
            created_at: mov.created_at,
            reason: mov.reason,
            receipt_number: mov.receipt_number,
            cash_register_id: mov.cash_register_id || null,
            authorized_by: mov.authorized_by || null,
            authorized_name: mov.authorized_name || null,
          })
          .select("id")
          .single();

        movementResults.push({
          local_id: mov.local_id,
          server_id: inserted?.id || null,
          success: !movError,
          error: movError?.message,
        });
      } catch (movErr: unknown) {
        movementResults.push({
          local_id: mov.local_id,
          server_id: null,
          success: false,
          error: movErr instanceof Error ? movErr.message : "Error desconocido",
        });
      }
    }

    // Process reservations from POS
    const reservationResults: {
      local_id: string;
      server_id: string | null;
      success: boolean;
      exists?: boolean;
      error?: string;
      access_code?: string | null;
    }[] = [];

    for (const res of reservations as Record<string, unknown>[]) {
      try {
        // Idempotency: check if already exists
        const { data: existing } = await adminClient
          .from("reservations")
          .select("id")
          .eq("id", res.id)
          .single();

        if (existing) {
          reservationResults.push({ local_id: res.id as string, server_id: existing.id, success: true, exists: true });
          continue;
        }

        // Get schedule_id from product+branch
        const { data: schedule } = await adminClient
          .from("service_schedules")
          .select("id")
          .eq("tenant_id", ctx.tenantId)
          .eq("product_id", res.product_id)
          .eq("branch_id", res.branch_id)
          .eq("is_active", true)
          .single();

        if (!schedule) {
          reservationResults.push({ local_id: res.id as string, server_id: null, success: false, error: "No schedule found" });
          continue;
        }

        // Use the RPC function for atomic capacity check
        const { data: resId, error: resError } = await adminClient.rpc("fn_create_reservation", {
          p_tenant_id: ctx.tenantId,
          p_product_id: res.product_id,
          p_branch_id: res.branch_id,
          p_customer_id: nullIfEmpty(res.customer_id),
          p_customer_name: nullIfEmpty(res.customer_name),
          p_invoice_id: nullIfEmpty(res.invoice_id),
          p_date: res.reservation_date,
          p_slot_start: res.slot_start,
          p_slot_end: res.slot_end,
          p_quantity: res.quantity,
          p_created_by: ctx.userId,
          p_access_code: nullIfEmpty(res.access_code),
        });

        if (resError) {
          reservationResults.push({ local_id: res.id as string, server_id: null, success: false, error: resError.message });
        } else {
          // Fetch the server-generated access_code
          let serverAccessCode = null;
          if (resId) {
            const { data: resData } = await adminClient
              .from("reservations")
              .select("access_code")
              .eq("id", resId)
              .single();
            serverAccessCode = resData?.access_code ?? null;
          }
          reservationResults.push({ local_id: res.id as string, server_id: resId as string, success: true, access_code: serverAccessCode });
        }
      } catch (e) {
        reservationResults.push({ local_id: res.id as string, server_id: null, success: false, error: String(e) });
      }
    }

    // Process stock outputs (non-sale inventory movements from POS)
    interface PushStockOutput {
      id: string;
      entity_type: string;
      entity_id: string;
      entity_name: string;
      quantity: number;
      reason: string;
      notes: string | null;
      created_by: string | null;
      created_at: string;
    }
    const stockOutputs: PushStockOutput[] = body?.stock_outputs || [];
    const stockOutputResults: { local_id: string; server_id: string | null; success: boolean; error?: string }[] = [];

    for (const so of stockOutputs) {
      try {
        // Idempotency: check if already processed
        const { data: existing } = await adminClient
          .from("inventory_movements")
          .select("id")
          .eq("id", so.id)
          .maybeSingle();

        if (existing) {
          stockOutputResults.push({ local_id: so.id, server_id: existing.id, success: true });
          continue;
        }

        // Insert inventory movement
        const { data: inserted, error: movError } = await adminClient
          .from("inventory_movements")
          .insert({
            id: so.id,
            tenant_id: ctx.tenantId,
            entity_type: so.entity_type,
            entity_id: so.entity_id,
            quantity: so.quantity,
            movement_type: so.reason,
            reason: so.notes || null,
            notes: `POS: ${so.entity_name} (x${so.quantity})`,
            branch_id: branchId,
            created_by: so.created_by || ctx.userId,
            created_at: so.created_at,
          })
          .select("id")
          .single();

        if (movError || !inserted) {
          stockOutputResults.push({ local_id: so.id, server_id: null, success: false, error: movError?.message });
          continue;
        }

        // Decrement stock on server
        if (so.entity_type === "supply") {
          await adminClient.rpc("fn_decrement_supply_stock", {
            p_supply_id: so.entity_id,
            p_quantity: so.quantity,
          });
          await adminClient.rpc("fn_refresh_composite_stock_for_supply", {
            p_supply_id: so.entity_id,
          });
        } else if (so.entity_type === "product") {
          const { data: remaining } = await adminClient.rpc("fn_decrement_stock", {
            p_product_id: so.entity_id,
            p_quantity: so.quantity,
          });
          if (typeof remaining === "number" && remaining >= 0) {
            stockUpdates.push({ product_id: so.entity_id, stock_quantity: remaining });
          }
        }

        stockOutputResults.push({ local_id: so.id, server_id: inserted.id, success: true });
      } catch (e) {
        stockOutputResults.push({ local_id: so.id, server_id: null, success: false, error: String(e) });
      }
    }

    // Process authorization logs
    const authLogs: Array<{
      id: string;
      invoice_id?: string | null;
      operation: string;
      reason_code?: string | null;
      reason_text?: string | null;
      amount?: number | null;
      cashier_id?: string | null;
      cashier_name?: string | null;
      authorizer_id?: string | null;
      authorizer_name?: string | null;
      authorizer_cargo?: string | null;
      self_authorized: boolean;
      cash_register_id?: string | null;
      opening_id?: string | null;
      created_at: string;
    }> = body?.authorization_logs || [];
    const authLogResults: { local_id: string; server_id: string | null; success: boolean }[] = [];

    for (const al of authLogs) {
      try {
        const { data: existing } = await adminClient
          .from("authorization_log")
          .select("id")
          .eq("id", al.id)
          .maybeSingle();

        if (existing) {
          authLogResults.push({ local_id: al.id, server_id: existing.id, success: true });
          continue;
        }

        // Resolve invoice server_id from results
        let invoiceServerId: string | null = al.invoice_id || null;
        if (invoiceServerId) {
          const match = results.find((r) => r.local_id === invoiceServerId);
          if (match?.server_id) invoiceServerId = match.server_id;
        }

        const { data: inserted, error: alError } = await adminClient
          .from("authorization_log")
          .insert({
            id: al.id,
            tenant_id: ctx.tenantId,
            invoice_id: invoiceServerId,
            operation: al.operation,
            reason_code: al.reason_code || null,
            reason_text: al.reason_text || null,
            amount: al.amount || null,
            cashier_id: al.cashier_id || ctx.userId,
            cashier_name: al.cashier_name || null,
            authorizer_id: al.authorizer_id || null,
            authorizer_name: al.authorizer_name || null,
            authorizer_cargo: al.authorizer_cargo || null,
            self_authorized: al.self_authorized ?? false,
            cash_register_id: al.cash_register_id || null,
            opening_id: al.opening_id || null,
            created_at: al.created_at,
          })
          .select("id")
          .single();

        authLogResults.push({
          local_id: al.id,
          server_id: alError ? null : inserted?.id || null,
          success: !alError,
        });
      } catch {
        authLogResults.push({ local_id: al.id, server_id: null, success: false });
      }
    }

    // Broadcast stock updates to all terminals
    if (stockUpdates.length > 0) {
      await broadcastBatchStockUpdate(ctx.tenantId, stockUpdates, ctx.userId);

      // Send Web Push for low-stock products (DB trigger handles in-app notifications)
      try {
        const { notifyLowStockPush } = await import("@/actions/notifications");
        const lowStockIds = stockUpdates.map((s) => s.product_id);
        const { data: lowProducts } = await adminClient
          .from("products")
          .select("id, name, stock_quantity, min_stock")
          .in("id", lowStockIds)
          .not("min_stock", "is", null);

        for (const p of lowProducts || []) {
          if (p.min_stock != null && p.stock_quantity <= p.min_stock) {
            await notifyLowStockPush({
              tenantId: ctx.tenantId,
              productName: p.name,
              currentStock: p.stock_quantity,
              minStock: p.min_stock,
              resourceType: "product",
              resourceId: p.id,
            });
          }
        }
      } catch (pushErr) {
        console.error("[sync-push] low-stock push error:", pushErr);
      }
    }

    // Revalidate inventory pages so poi-one shows updated stock
    revalidatePath("/inventario/insumos");
    revalidatePath("/inventario/productos");
    revalidatePath("/inventario/movimientos");
    revalidatePath("/ventas/comprobantes");
    revalidatePath("/finanzas/movimientos");

    return NextResponse.json({
      success: true,
      data: {
        invoices: results,
        movements: movementResults,
        reservations: reservationResults,
        stock_outputs: stockOutputResults,
        authorization_logs: authLogResults,
        updated_stocks: stockUpdates,
        synced_customers: customerResults.length,
        server_time: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    const status =
      message.includes("token") || message.includes("authorized") ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
