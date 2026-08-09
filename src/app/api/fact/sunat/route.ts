import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateFactUser } from "@/lib/fact-auth";
import { getSunatProvider } from "@/lib/sunat/factory";
import { persistSunatResult, registerSunatAttempt } from "@/lib/sunat/persist";
import {
  createBranchCache,
  insertInventoryMovement,
  resolveMovementBranchId,
} from "@/lib/inventory-movement";
import { buildReferenceValueMap } from "@/lib/sunat/reference-values";
import { isEmisorRucValid } from "@/lib/sunat/ruc";

export async function POST(request: Request) {
  try {
    const ctx = await validateFactUser(request);
    const body = await request.json();
    const action: string = body?.action;
    const invoiceId: string = body?.invoice_id;

    if (!action || !invoiceId) {
      return NextResponse.json(
        { success: false, error: "action e invoice_id son requeridos" },
        { status: 400 },
      );
    }

    const adminClient = createAdminClient();

    // Verify invoice belongs to tenant
    const { data: invoice, error: invError } = await adminClient
      .from("invoices")
      // `payment_method` decide si la devolución sale del cajón o va por el
      // adquirente; sin él la anulación la forzaba siempre a efectivo.
      .select("id, series_id, correlative_number, document_type, customer_id, op_gravada, op_exonerada, op_inafecta, igv_total, total, status, payment_method, sunat_document_id, reference_invoice_id, reference_reason, created_at, customer_document_type, customer_document_number, customer_name, customer_address, cash_register_id, opening_id, has_detraction, detraction_code, detraction_percentage, detraction_amount, detraction_payment_method")
      .eq("id", invoiceId)
      .eq("tenant_id", ctx.tenantId)
      .single();

    if (invError || !invoice) {
      return NextResponse.json(
        { success: false, error: "Comprobante no encontrado" },
        { status: 404 },
      );
    }

    // Get fact config
    const { data: factConfigRaw } = await adminClient
      .from("fact_config")
      .select("ruc, razon_social, direccion_fiscal, ubigeo, departamento, provincia, distrito, api_token, is_production, provider, detraction_account, emit_free_lines")
      .eq("tenant_id", ctx.tenantId)
      .eq("is_active", true)
      .single();

    if (!factConfigRaw?.api_token) {
      return NextResponse.json(
        { success: false, error: "Configuracion SUNAT no encontrada" },
        { status: 400 },
      );
    }

    // Las tres acciones —retry, void y status— hablan con el proveedor usando el
    // RUC del emisor. Se comprueba una vez, aquí. El regex del formulario sólo
    // exigía 11 dígitos, así que en la base puede haber un RUC que no exista, y
    // Billme no lo detecta: verificado, aceptó una boleta con un RUC ajeno.
    if (!isEmisorRucValid(factConfigRaw.ruc)) {
      return NextResponse.json(
        {
          success: false,
          error:
            `El RUC del emisor configurado (${factConfigRaw.ruc}) no pasa el dígito verificador ` +
            `de SUNAT. Corrígelo en Configuración › POI Fact antes de emitir o anular.`,
        },
        { status: 400 },
      );
    }

    const factConfig = { ...factConfigRaw, tenant_id: ctx.tenantId };
    const provider = getSunatProvider(factConfig.provider);

    // Get series code (needed for all actions)
    const { data: seriesData } = await adminClient
      .from("invoice_series")
      .select("series_code")
      .eq("id", invoice.series_id)
      .single();

    const seriesCode = seriesData?.series_code || "B001";

    if (action === "void") {
      // Enforce same-day restriction (Peru timezone UTC-5, no DST)
      const peruNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
      const peruToday = `${peruNow.getFullYear()}-${String(peruNow.getMonth() + 1).padStart(2, "0")}-${String(peruNow.getDate()).padStart(2, "0")}`;
      const invoiceCreated = new Date(invoice.created_at);
      const invoicePeruDate = new Date(invoiceCreated.toLocaleString("en-US", { timeZone: "America/Lima" }));
      const invoiceDateStr = `${invoicePeruDate.getFullYear()}-${String(invoicePeruDate.getMonth() + 1).padStart(2, "0")}-${String(invoicePeruDate.getDate()).padStart(2, "0")}`;

      if (invoiceDateStr !== peruToday) {
        return NextResponse.json(
          { success: false, error: "Solo se puede anular comprobantes emitidos hoy" },
          { status: 400 },
        );
      }

      // Sólo se anula lo que SUNAT aceptó.
      //
      // Sin esta comprobación se podía anular dos veces el mismo comprobante: la
      // segunda pasada volvía a incrementar el stock, volvía a crear el
      // movimiento de devolución en caja y quemaba un segundo correlativo de RA.
      // Y anular algo que SUNAT nunca aceptó no tiene sentido: un `issued` o un
      // `rejected` no existe para SUNAT, así que no hay nada que dar de baja.
      //
      // Es además el invariante en el que se apoya el polling: si el ticket
      // vuelve rechazado, el comprobante regresa a `accepted`, que es el único
      // estado del que pudo haber salido.
      const VOIDABLE_STATUSES = ["accepted"];
      if (!VOIDABLE_STATUSES.includes(invoice.status)) {
        const explanation: Record<string, string> = {
          voided: "El comprobante ya está anulado.",
          pending_void:
            "Ya hay una baja en curso para este comprobante, esperando la respuesta de SUNAT.",
          issued:
            "El comprobante todavía no llegó a SUNAT. Reenvíalo primero; si SUNAT lo rechaza, no hay nada que anular.",
          sent_to_sunat:
            "El comprobante sigue viajando a SUNAT. Consulta su estado antes de anularlo.",
          rejected:
            "SUNAT rechazó este comprobante, así que no existe para SUNAT y no hay nada que dar de baja.",
          draft: "Un borrador no se anula: se descarta.",
        };
        return NextResponse.json(
          {
            success: false,
            error:
              explanation[invoice.status] ??
              `No se puede anular un comprobante en estado "${invoice.status}".`,
          },
          { status: 400 },
        );
      }

      // Una boleta no se da de baja por Resumen de Bajas: el RA (VoidedDocuments)
      // cubre facturas y las notas vinculadas a factura, y la baja de una boleta
      // iría dentro de un Resumen Diario con el ítem en estado 3, que es otro
      // documento y otro flujo (no construido).
      //
      // El corte estaba SOLO dentro del adapter de Billme, y para entonces ya se
      // había consumido un correlativo de RA y se había insertado la fila en
      // `sunat_summaries`: cada intento de anular una boleta quemaba un
      // identificador de resumen sin mandar un solo byte. Ahora se corta antes.
      // El del adapter se conserva como defensa en profundidad.
      if (invoice.document_type === "boleta") {
        return NextResponse.json(
          {
            success: false,
            error:
              "Una boleta no se anula por Resumen de Bajas. Emite una nota de crédito con motivo 01 (anulación de la operación).",
          },
          { status: 400 },
        );
      }

      const reason = body?.reason || "Anulación de la operación";
      const authorization = body?.authorization;

      // Correlativo del resumen de bajas (RA). SUNAT identifica el resumen por
      // `RA-AAAAMMDD-N` y N tiene que ser propio y creciente dentro del día: el
      // adapter lo mandaba fijo a 1, así que la segunda baja de la jornada
      // reutilizaba el identificador de la primera. Se resuelve aquí porque los
      // adapters son puros y no tocan la base.
      //
      // apisunat gestiona su propio correlativo de resumen y lo ignora; pedirlo
      // igualmente no cuesta nada y mantiene el registro completo.
      let summaryRef: { correlative: number; referenceDate: string } | undefined;
      const { data: summaryCorrelative, error: summaryCorrError } = await adminClient.rpc(
        "fn_next_summary_correlative",
        {
          p_tenant_id: ctx.tenantId,
          p_summary_type: "RA",
          p_reference_date: peruToday,
        },
      );
      if (!summaryCorrError && typeof summaryCorrelative === "number") {
        summaryRef = { correlative: summaryCorrelative, referenceDate: peruToday };
      } else if (summaryCorrError) {
        console.error("[sunat-void] No se pudo obtener el correlativo del resumen:", summaryCorrError);
      }

      const result = await provider.void(
        factConfig,
        invoice.document_type,
        seriesCode,
        invoice.correlative_number,
        reason,
        summaryRef,
      );

      // El resumen se registra tanto si SUNAT lo aceptó como si no: un RA que se
      // envió y falló ya consumió su correlativo, y sin el registro no habría
      // forma de saber qué se mandó ni con qué ticket consultarlo después.
      //
      // `result.summary` sólo viene cuando el adapter llegó a construir y enviar
      // el resumen. Si cortó antes (tipo de documento no anulable), no hay nada
      // que registrar y el correlativo, aunque pedido, no se ata a ninguna
      // identidad publicada.
      const sentSummary = result.summary ?? (result.ticket ? summaryRef : null);
      let summaryId: string | null = null;
      if (sentSummary) {
        const { data: summaryRow, error: summaryInsertError } = await adminClient
          .from("sunat_summaries")
          .insert({
            tenant_id: ctx.tenantId,
            summary_type: "RA",
            reference_date: sentSummary.referenceDate,
            correlative: sentSummary.correlative,
            ticket: result.ticket,
            status: result.success ? "pending" : "failed",
            response_desc: result.error,
            created_by: ctx.userId,
          })
          .select("id")
          .single();
        if (summaryInsertError) {
          console.error("[sunat-void] No se pudo registrar el resumen:", summaryInsertError);
        } else {
          summaryId = summaryRow?.id ?? null;
        }
      }

      if (result.success) {
        // Qué comprobantes informa este resumen. Sin este enlace el polling del
        // ticket sabe si SUNAT aceptó la baja pero no a qué comprobante
        // aplicarla: `sunat_summaries` e `invoices` eran dos hechos sin relación.
        if (summaryId) {
          const { error: itemLinkError } = await adminClient
            .from("sunat_summary_items")
            .insert({ summary_id: summaryId, invoice_id: invoiceId });
          if (itemLinkError) {
            console.error(
              "[sunat-void] No se pudo enlazar el comprobante con el resumen:",
              itemLinkError.message,
            );
          }
        }

        // Con ticket la baja está sólo RECIBIDA, no aceptada: el comprobante
        // queda en `pending_void` (estado que existe en el CHECK desde 00001 y
        // que hasta ahora no escribía nadie) hasta que `pollPendingSummaries`
        // consulte el ticket. Sin ticket —apisunat resuelve en la misma
        // llamada— la baja es firme y pasa directo a `voided`.
        await adminClient
          .from("invoices")
          .update({
            status: result.ticket ? "pending_void" : "voided",
            sunat_ticket_status: result.ticket ? "pending" : null,
            authorized_by: authorization?.authorizer_id || ctx.userId,
            authorized_by_name: authorization?.authorizer_name || ctx.userName,
            authorized_at: new Date().toISOString(),
          })
          .eq("id", invoiceId);

        // Audit trail
        await adminClient.from("audit_log").insert({
          tenant_id: ctx.tenantId,
          user_id: ctx.userId,
          action: "void_invoice",
          resource: "invoices",
          resource_id: invoiceId,
          new_data: {
            reason,
            authorized_by: authorization?.authorizer_id || ctx.userId,
            authorizer_name: authorization?.authorizer_name || ctx.userName,
            self_authorized: authorization?.self_authorized ?? true,
          },
        });

        // --- Return stock and create refund movements ---
        const { data: voidItems } = await adminClient
          .from("invoice_items")
          .select("product_id, supply_id, quantity, description, is_cortesia")
          .eq("invoice_id", invoiceId);

        // Sede de los movimientos de devolución.
        //
        // Antes esto era sólo `cash_registers.branch_id` de la caja del
        // comprobante, SIN cadena de fallback. Un comprobante sin caja —un pago
        // online de Culqi, por ejemplo— dejaba `voidBranchId` en `null`, y como
        // `inventory_movements.branch_id` es NOT NULL y ninguno de los tres
        // INSERT comprobaba el error, **la anulación devolvía el stock y perdía
        // los tres movimientos en silencio**: el saldo cambiaba y el kardex no lo
        // explicaba. Justo en el camino que más traza fiscal necesita.
        const branchCache = createBranchCache();
        const voidBranchId = await resolveMovementBranchId(
          adminClient,
          ctx.tenantId,
          { cashRegisterId: invoice.cash_register_id, userId: ctx.userId },
          branchCache,
        );

        // Avisos de lo que falló DESPUÉS de que SUNAT recibiera la baja. No
        // pueden convertir la respuesta en un fallo —la anulación ya está
        // enviada— pero tampoco pueden desaparecer.
        const voidWarnings: string[] = [];

        // Get product metadata (type, kind) to skip services and handle composites
        const voidProductIds = (voidItems || []).filter(i => i.product_id).map(i => i.product_id!);
        const voidServiceIds = new Set<string>();
        const voidCompositeIds = new Set<string>();
        const voidRecipeMap = new Map<string, { supply_id: string; quantity_needed: number }[]>();

        if (voidProductIds.length > 0) {
          const { data: prodMeta } = await adminClient
            .from("products")
            .select("id, type, product_kind")
            .in("id", voidProductIds);
          for (const p of prodMeta || []) {
            if (p.type === "service") voidServiceIds.add(p.id);
            if (p.product_kind === "composite") voidCompositeIds.add(p.id);
          }
          if (voidCompositeIds.size > 0) {
            const { data: recipes } = await adminClient
              .from("recipe_items")
              .select("product_id, supply_id, quantity_needed")
              .in("product_id", Array.from(voidCompositeIds));
            for (const r of recipes || []) {
              if (!voidRecipeMap.has(r.product_id)) voidRecipeMap.set(r.product_id, []);
              voidRecipeMap.get(r.product_id)!.push({ supply_id: r.supply_id, quantity_needed: Number(r.quantity_needed) });
            }
          }
        }

        // Increment stock for each item
        for (const item of voidItems || []) {
          if (item.product_id && !voidServiceIds.has(item.product_id)) {
            await adminClient.rpc("fn_increment_stock", {
              p_product_id: item.product_id,
              p_quantity: item.quantity,
            });
          }
          if (item.supply_id && !item.product_id) {
            await adminClient.rpc("fn_increment_supply_stock", {
              p_supply_id: item.supply_id,
              p_quantity: item.quantity,
            });
          }
        }

        // Create inventory movements (nc_return)
        for (const item of voidItems || []) {
          if (item.product_id && voidServiceIds.has(item.product_id)) continue;

          if (item.product_id && voidCompositeIds.has(item.product_id)) {
            for (const ri of voidRecipeMap.get(item.product_id) || []) {
              const { error: movErr } = await insertInventoryMovement(
                adminClient,
                {
                  tenant_id: ctx.tenantId,
                  entity_type: "supply",
                  entity_id: ri.supply_id,
                  quantity: Math.round(item.quantity * ri.quantity_needed * 10000) / 10000,
                  movement_type: "nc_return",
                  reason: `Anulación: ${item.description}`,
                  branch_id: voidBranchId,
                  invoice_id: invoiceId,
                  created_by: ctx.userId,
                },
                { cashRegisterId: invoice.cash_register_id, userId: ctx.userId },
                branchCache,
              );
              if (movErr) voidWarnings.push(movErr);
            }
            continue;
          }

          if (item.supply_id && !item.product_id) {
            const { error: movErr } = await insertInventoryMovement(
              adminClient,
              {
                tenant_id: ctx.tenantId,
                entity_type: "supply",
                entity_id: item.supply_id,
                quantity: item.quantity,
                movement_type: "nc_return",
                reason: `Anulación: ${item.description}`,
                branch_id: voidBranchId,
                invoice_id: invoiceId,
                created_by: ctx.userId,
              },
              { cashRegisterId: invoice.cash_register_id, userId: ctx.userId },
              branchCache,
            );
            if (movErr) voidWarnings.push(movErr);
            continue;
          }

          if (item.product_id) {
            const { error: movErr } = await insertInventoryMovement(
              adminClient,
              {
                tenant_id: ctx.tenantId,
                entity_type: "product",
                entity_id: item.product_id,
                quantity: item.quantity,
                movement_type: "nc_return",
                reason: `Anulación: ${item.description}`,
                branch_id: voidBranchId,
                invoice_id: invoiceId,
                created_by: ctx.userId,
              },
              { cashRegisterId: invoice.cash_register_id, userId: ctx.userId },
              branchCache,
            );
            if (movErr) voidWarnings.push(movErr);
          }
        }

        // Movimiento de devolución en caja.
        //
        // Antes se cargaba a la apertura de la VENTA ORIGINAL y, si esa apertura
        // ya no existía, se creaba sintéticamente con `status: "open"` y saldo 0
        // — es decir, se reabría una caja cerrada y arqueada, cuyo arqueo ya
        // había sido firmado. Una devolución diferida va a la caja abierta hoy,
        // con referencia cruzada al comprobante original.
        //
        // Y el método de pago iba forzado a "cash": devolver una venta cobrada
        // con tarjeta descuadraba el efectivo, porque esa devolución va por el
        // adquirente y no toca el cajón.
        const documentLabel = `${seriesCode}-${String(invoice.correlative_number).padStart(8, "0")}`;

        const { data: openOpening } = invoice.cash_register_id
          ? await adminClient
              .from("cash_register_openings")
              .select("id")
              .eq("tenant_id", ctx.tenantId)
              .eq("cash_register_id", invoice.cash_register_id)
              .eq("status", "open")
              .order("opened_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          : { data: null };

        if (openOpening) {
          const { error: movementError } = await adminClient
            .from("cash_register_movements")
            .insert({
              tenant_id: ctx.tenantId,
              opening_id: openOpening.id,
              type: "refund",
              amount: invoice.total,
              description: `Anulación: ${documentLabel}`,
              invoice_id: invoiceId,
              payment_method: invoice.payment_method || "cash",
              created_by: ctx.userId,
              cash_register_id: invoice.cash_register_id,
            });
          if (movementError) {
            voidWarnings.push(
              `La devolución no se pudo registrar en caja: ${movementError.message}`,
            );
            console.error("[sunat/void] Refund movement insert failed:", movementError.message);
          }
        } else {
          // La anulación ante SUNAT es el acto fiscal y ya está hecha: no se
          // bloquea por no poder anotar la caja, pero tampoco se inventa una.
          voidWarnings.push(
            "La devolución no se anotó en caja porque no hay ninguna caja abierta. Ábrela y registra el egreso a mano.",
          );
          console.warn(`[sunat/void] ${documentLabel}: sin apertura abierta para registrar el refund`);
        }

        return NextResponse.json({
          success: result.success,
          data: {
            ...result,
            // El comprobante NO queda anulado todavía si hay ticket: el POS y el
            // ERP tienen que reflejar `pending_void` y esperar al polling.
            invoice_status: result.ticket ? "pending_void" : "voided",
            ticket_status: result.ticket ? "pending" : null,
          },
          warning:
            voidWarnings.length > 0
              ? `La anulación se envió a SUNAT, pero: ${voidWarnings.join(" · ")}`
              : null,
        });
      }

      return NextResponse.json({
        success: result.success,
        data: result,
      });
    }

    if (action === "retry") {
      if (invoice.status !== "rejected" && invoice.status !== "issued") {
        return NextResponse.json(
          { success: false, error: "Solo se pueden reenviar comprobantes rechazados o emitidos" },
          { status: 400 },
        );
      }

      // Use denormalized customer data from invoice (populated during push)
      // Fallback to customer lookup for old invoices pre-migration
      let customerDocType = invoice.customer_document_type;
      let customerDocNumber = invoice.customer_document_number;
      let customerName = invoice.customer_name;
      let customerAddress = invoice.customer_address;

      if (!customerDocType && invoice.customer_id) {
        const { data: cust } = await adminClient
          .from("customers")
          .select("document_type, document_number, legal_name, address")
          .eq("id", invoice.customer_id)
          .single();
        if (cust) {
          customerDocType = cust.document_type;
          customerDocNumber = cust.document_number;
          customerName = cust.legal_name;
          customerAddress = cust.address;
        }
      }

      // Fallback: accept customer data from request body (old invoices pre-migration)
      if (!customerDocType && body?.customer_document_type) {
        customerDocType = body.customer_document_type;
        customerDocNumber = body.customer_document_number;
        customerName = body.customer_name;
      }

      // Backfill denormalized customer data on Supabase for future retries
      if (customerDocType && !invoice.customer_document_type) {
        await adminClient
          .from("invoices")
          .update({
            customer_document_type: customerDocType,
            customer_document_number: customerDocNumber,
            customer_name: customerName,
            customer_address: customerAddress,
          })
          .eq("id", invoiceId);
      }

      // Resolve branch address for fallback chain: customer → branch → fiscal
      let branchAddress: string | null = null;
      if (invoice.cash_register_id) {
        const { data: reg } = await adminClient
          .from("cash_registers")
          .select("branch_id")
          .eq("id", invoice.cash_register_id)
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

      // Get invoice items. `supply_id`, `is_cortesia` y `original_unit_price`
      // deciden el valor referencial de las líneas gratuitas.
      const { data: items } = await adminClient
        .from("invoice_items")
        .select("description, quantity, unit_price, unit_of_measure, igv_rate, igv_amount, subtotal, total, tax_type, supply_id, is_cortesia, original_unit_price")
        .eq("invoice_id", invoiceId)
        .order("sort_order");

      const referenceValueOf = await buildReferenceValueMap(adminClient, items || []);

      // Resolve reference invoice for NC/ND
      let refSeries: string | undefined;
      let refCorrelative: number | undefined;
      let refDocType: string | undefined;
      if ((invoice.document_type === "nota_credito" || invoice.document_type === "nota_debito")
          && invoice.reference_invoice_id) {
        const { data: refInv } = await adminClient
          .from("invoices")
          .select("series_id, correlative_number, document_type")
          .eq("id", invoice.reference_invoice_id)
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
        id: invoice.id,
        document_type: invoice.document_type,
        series_code: seriesCode,
        correlative_number: invoice.correlative_number,
        customer_document_type: customerDocType || null,
        customer_document_number: customerDocNumber || null,
        customer_name: customerName || null,
        customer_address: customerAddress || branchAddress || factConfig?.direccion_fiscal || null,
        op_gravada: invoice.op_gravada,
        op_exonerada: invoice.op_exonerada,
        op_inafecta: invoice.op_inafecta,
        igv_total: invoice.igv_total,
        total: invoice.total,
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
          reference_value: referenceValueOf(item),
        })),
        reference_series: refSeries,
        reference_correlative: refCorrelative,
        reference_document_type: refDocType,
        reference_reason: invoice.reference_reason || undefined,
        created_at: invoice.created_at,
        has_detraction: invoice.has_detraction || false,
        detraction_code: invoice.detraction_code || null,
        detraction_percentage: invoice.detraction_percentage ?? null,
        detraction_amount: invoice.detraction_amount ?? null,
        detraction_payment_method: invoice.detraction_payment_method || null,
        detraction_account: factConfigRaw.detraction_account || null,
      };

      await registerSunatAttempt(invoice.id);
      const result = await provider.submit(factConfig, invoice.id, invoiceForSunat);
      await persistSunatResult(invoice.id, result);

      return NextResponse.json({
        success: result.success,
        error: result.success ? undefined : (result.sunatResponseDesc || "Documento rechazado por SUNAT"),
        data: {
          status: result.status,
          sunat_document_id: result.documentId,
          sunat_response_code: result.sunatResponseCode,
          sunat_response_desc: result.sunatResponseDesc,
        },
      });
    }

    if (action === "status") {
      // Check status at SUNAT via API
      const result = await provider.status(
        factConfig,
        invoice.document_type,
        seriesCode,
        invoice.correlative_number,
      );

      // If found at SUNAT and currently not accepted, update status.
      // Solo se escriben los campos que el proveedor devolvió con valor: una
      // consulta puede no traer hash/XML/CDR, y pisarlos con null borraría los
      // que se guardaron al emitir.
      if (result.success && invoice.status !== "accepted") {
        const patch: Record<string, unknown> = { status: "accepted" };
        if (result.hash) patch.hash_code = result.hash;
        if (result.xmlUrl) patch.xml_url = result.xmlUrl;
        if (result.cdrUrl) patch.cdr_url = result.cdrUrl;

        const { error: statusErr } = await adminClient
          .from("invoices")
          .update(patch)
          .eq("id", invoiceId);
        if (statusErr) {
          return NextResponse.json(
            { success: false, error: `No se pudo actualizar el comprobante: ${statusErr.message}` },
            { status: 500 },
          );
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          found: result.success,
          status: result.success ? "accepted" : invoice.status,
          message: result.message,
          sunat_document_id: invoice.sunat_document_id,
          hash: result.hash,
          xml_url: result.xmlUrl,
          cdr_url: result.cdrUrl,
        },
      });
    }

    return NextResponse.json(
      { success: false, error: "Accion no valida. Usa 'void', 'retry' o 'status'" },
      { status: 400 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    const status =
      message.includes("token") || message.includes("authorized") ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
