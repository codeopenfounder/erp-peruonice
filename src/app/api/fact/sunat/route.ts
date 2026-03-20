import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateFactUser } from "@/lib/fact-auth";
import { submitToSunat, voidDocument, checkStatus } from "@/lib/sunat/apisunat";

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
      .select("id, series_id, correlative_number, document_type, customer_id, op_gravada, op_exonerada, op_inafecta, igv_total, total, status, sunat_document_id, reference_invoice_id, reference_reason, created_at, customer_document_type, customer_document_number, customer_name, customer_address, cash_register_id")
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
    const { data: factConfig } = await adminClient
      .from("fact_config")
      .select("ruc, razon_social, direccion_fiscal, ubigeo, departamento, provincia, distrito, api_token, is_production")
      .eq("tenant_id", ctx.tenantId)
      .eq("is_active", true)
      .single();

    if (!factConfig?.api_token) {
      return NextResponse.json(
        { success: false, error: "Configuracion SUNAT no encontrada" },
        { status: 400 },
      );
    }

    // Get series code (needed for all actions)
    const { data: seriesData } = await adminClient
      .from("invoice_series")
      .select("series_code")
      .eq("id", invoice.series_id)
      .single();

    const seriesCode = seriesData?.series_code || "B001";

    if (action === "void") {
      const reason = body?.reason || "Anulacion de la operacion";
      const result = await voidDocument(
        factConfig,
        invoice.document_type,
        seriesCode,
        invoice.correlative_number,
        reason,
      );

      if (result.success) {
        await adminClient
          .from("invoices")
          .update({ status: "voided" })
          .eq("id", invoiceId);
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

      // Get invoice items (include supply_id for gratuito reference_value lookup)
      const { data: items } = await adminClient
        .from("invoice_items")
        .select("description, quantity, unit_price, unit_of_measure, igv_rate, igv_amount, subtotal, total, tax_type, supply_id")
        .eq("invoice_id", invoiceId)
        .order("sort_order");

      // Lookup cost_prices for supply items (SUNAT valor referencial for gratuito items)
      const retrySupplyIds = (items || []).filter(i => i.supply_id).map(i => i.supply_id!);
      const retrySupplyCostMap = new Map<string, number>();
      if (retrySupplyIds.length > 0) {
        const { data: supplyCosts } = await adminClient
          .from("supplies")
          .select("id, cost_price")
          .in("id", retrySupplyIds);
        for (const s of supplyCosts || []) {
          retrySupplyCostMap.set(s.id, parseFloat(String(s.cost_price)) || 0.01);
        }
      }

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
          reference_value: item.supply_id ? retrySupplyCostMap.get(item.supply_id) : undefined,
        })),
        reference_series: refSeries,
        reference_correlative: refCorrelative,
        reference_document_type: refDocType,
        reference_reason: invoice.reference_reason || undefined,
        created_at: invoice.created_at,
      };

      const result = await submitToSunat(factConfig, invoice.id, invoiceForSunat);

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
      const result = await checkStatus(
        factConfig,
        invoice.document_type,
        seriesCode,
        invoice.correlative_number,
      );

      // If found at SUNAT and currently not accepted, update status
      if (result.success && invoice.status !== "accepted") {
        await adminClient
          .from("invoices")
          .update({
            status: "accepted",
            hash_code: result.hash,
            xml_url: result.xmlUrl,
            cdr_url: result.cdrUrl,
          })
          .eq("id", invoiceId);
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
