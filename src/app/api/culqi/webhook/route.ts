import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

// Characters for access code generation (unambiguous charset)
const ACCESS_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateAccessCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += ACCESS_CHARS[Math.floor(Math.random() * ACCESS_CHARS.length)];
  }
  return code;
}

function verifySignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;
  try {
    const computed = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(computed)
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.text();

    // Verify webhook signature if secret is configured
    const webhookSecret = process.env.CULQI_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = request.headers.get("X-Culqi-Signature");
      if (!verifySignature(payload, signature, webhookSecret)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const body = JSON.parse(payload);
    const adminClient = createAdminClient();

    // Culqi sends different event structures. Extract relevant data.
    // The key fields: object type, status, metadata
    const eventType = body.type || body.event || "";
    const data = body.data || body.object || body;

    // Look for our payment_link_id in metadata
    const metadata = data.metadata || {};
    const paymentLinkId = metadata.payment_link_id;

    if (!paymentLinkId) {
      // Try to find by culqi_link_id
      const culqiLinkId = data.link_id || data.id;
      if (!culqiLinkId) {
        return NextResponse.json({ received: true, message: "No payment_link_id found" });
      }

      // Look up by culqi_link_id
      const { data: link } = await adminClient
        .from("payment_links")
        .select("id")
        .eq("culqi_link_id", culqiLinkId)
        .single();

      if (!link) {
        return NextResponse.json({ received: true, message: "Link not found" });
      }

      return await processPayment(adminClient, link.id, data);
    }

    return await processPayment(adminClient, paymentLinkId, data);
  } catch (err) {
    console.error("[Culqi Webhook] Error:", err);
    // Always return 200 to prevent Culqi from retrying
    return NextResponse.json({ received: true, error: "Processing error" });
  }
}

async function processPayment(
  adminClient: ReturnType<typeof createAdminClient>,
  paymentLinkId: string,
  data: Record<string, unknown>
) {
  // Fetch the payment link
  const { data: link, error } = await adminClient
    .from("payment_links")
    .select("*")
    .eq("id", paymentLinkId)
    .single();

  if (error || !link) {
    return NextResponse.json({ received: true, message: "Link not found" });
  }

  // Already processed
  if (link.status === "paid") {
    return NextResponse.json({ received: true, message: "Already processed" });
  }

  const status = String(data.status || data.state || "").toLowerCase();

  // Handle expired/cancelled
  if (status === "expired" || status === "cancelled") {
    await adminClient
      .from("payment_links")
      .update({ status: status as "expired" | "cancelled" })
      .eq("id", paymentLinkId);
    return NextResponse.json({ received: true });
  }

  // Only process paid status
  if (status !== "paid" && status !== "completed" && status !== "captured") {
    return NextResponse.json({ received: true, message: `Unhandled status: ${status}` });
  }

  const culqiOrderId = String(data.id || data.order_id || "");
  const now = new Date().toISOString();

  try {
    // 1. Upsert customer
    let customerId: string | null = null;
    if (link.customer_document_number) {
      const { data: existing } = await adminClient
        .from("customers")
        .select("id")
        .eq("tenant_id", link.tenant_id)
        .eq("document_number", link.customer_document_number)
        .single();

      if (existing) {
        customerId = existing.id;
      } else {
        const { data: newCust } = await adminClient
          .from("customers")
          .insert({
            tenant_id: link.tenant_id,
            document_type: link.customer_document_type || "dni",
            document_number: link.customer_document_number,
            legal_name: link.customer_name,
            email: link.customer_email,
            phone: link.customer_phone,
          })
          .select("id")
          .single();
        customerId = newCust?.id || null;
      }
    }

    // 2. Get a boleta series for this tenant
    const { data: series } = await adminClient
      .from("invoice_series")
      .select("id")
      .eq("tenant_id", link.tenant_id)
      .eq("document_type", "boleta")
      .eq("is_active", true)
      .limit(1)
      .single();

    let invoiceId: string | null = null;

    if (series) {
      // Get next correlative
      const { data: corrData } = await adminClient.rpc("fn_next_correlative", {
        p_series_id: series.id,
      });
      const correlative = corrData as number;

      // Calculate tax (Peru: prices include IGV)
      const total = Number(link.amount);
      const opGravada = Math.round((total / 1.18) * 100) / 100;
      const igvTotal = Math.round((total - opGravada) * 100) / 100;

      // Peru date
      const peruNow = new Date(
        new Date().toLocaleString("en-US", { timeZone: "America/Lima" })
      );
      const issueDate = `${peruNow.getFullYear()}-${String(peruNow.getMonth() + 1).padStart(2, "0")}-${String(peruNow.getDate()).padStart(2, "0")}`;

      // Create invoice
      const { data: inv } = await adminClient
        .from("invoices")
        .insert({
          tenant_id: link.tenant_id,
          series_id: series.id,
          correlative_number: correlative,
          document_type: "boleta",
          customer_id: customerId,
          customer_document_type: link.customer_document_type || "sin_documento",
          customer_document_number: link.customer_document_number || "",
          customer_name: link.customer_name,
          op_gravada: opGravada,
          op_exonerada: 0,
          op_inafecta: 0,
          igv_total: igvTotal,
          discount_total: 0,
          total,
          status: "issued",
          payment_method: "card",
          currency: link.currency || "PEN",
          issue_date: issueDate,
          branch_id: link.branch_id,
          notes: `Pago online via Culqi - ${link.description || ""}`,
          created_at: now,
        })
        .select("id")
        .single();

      invoiceId = inv?.id || null;

      if (invoiceId && link.product_id) {
        // Get product details for invoice item
        const { data: prod } = await adminClient
          .from("products")
          .select("name, sale_price, tax_type, igv_rate, cost_price")
          .eq("id", link.product_id)
          .single();

        if (prod) {
          const unitPrice = Number(prod.sale_price);
          const qty = link.quantity || 1;
          const lineTotal = unitPrice * qty;
          const lineSubtotal =
            prod.tax_type === "gravado"
              ? Math.round((lineTotal / 1.18) * 100) / 100
              : lineTotal;
          const lineIgv =
            prod.tax_type === "gravado"
              ? Math.round((lineTotal - lineSubtotal) * 100) / 100
              : 0;

          await adminClient.from("invoice_items").insert({
            invoice_id: invoiceId,
            product_id: link.product_id,
            description: prod.name,
            quantity: qty,
            unit_price: unitPrice,
            tax_type: prod.tax_type || "gravado",
            igv_rate: prod.igv_rate || 18,
            igv_amount: lineIgv,
            subtotal: lineSubtotal,
            total: lineTotal,
            cost_price: prod.cost_price || 0,
            sort_order: 1,
          });
        }
      }
    }

    // 3. Create reservation (if product and date specified)
    let reservationId: string | null = null;
    if (link.product_id && link.reservation_date && link.slot_start) {
      const scheduleQuery = await adminClient
        .from("service_schedules")
        .select("id")
        .eq("product_id", link.product_id)
        .eq("branch_id", link.branch_id)
        .eq("is_active", true)
        .limit(1)
        .single();

      if (scheduleQuery.data) {
        const accessCode = generateAccessCode();

        const { data: resData } = await adminClient.rpc(
          "fn_create_reservation",
          {
            p_tenant_id: link.tenant_id,
            p_product_id: link.product_id,
            p_branch_id: link.branch_id,
            p_customer_id: customerId,
            p_customer_name: link.customer_name,
            p_invoice_id: invoiceId,
            p_date: link.reservation_date,
            p_slot_start: link.slot_start,
            p_slot_end: link.slot_end || link.slot_start,
            p_quantity: link.quantity || 1,
            p_created_by: link.created_by,
            p_notes: `Reserva online - Culqi ${culqiOrderId}`,
          }
        );

        reservationId = resData as string | null;

        // Set access code on reservation
        if (reservationId) {
          await adminClient
            .from("reservations")
            .update({ access_code: accessCode })
            .eq("id", reservationId);
        }
      }
    }

    // 4. Update payment link
    await adminClient
      .from("payment_links")
      .update({
        status: "paid",
        culqi_order_id: culqiOrderId,
        invoice_id: invoiceId,
        reservation_id: reservationId,
        paid_at: now,
      })
      .eq("id", paymentLinkId);

    // 5. Notify staff (fire-and-forget)
    try {
      const { notifyModuleAction } = await import("@/actions/notifications");
      await notifyModuleAction({
        tenantId: link.tenant_id,
        actorId: link.created_by || "system",
        moduleCodes: ["reservas.links", "ventas.comprobantes"],
        title: "Pago online recibido",
        message: `${link.customer_name} pago S/ ${link.amount} por ${link.description || "reserva"}`,
        resourceType: "payment_link",
        resourceId: paymentLinkId,
        type: "success",
      });
    } catch {
      // Non-critical
    }

    return NextResponse.json({
      received: true,
      processed: true,
      invoice_id: invoiceId,
      reservation_id: reservationId,
    });
  } catch (err) {
    console.error("[Culqi Webhook] Processing error:", err);
    // Mark as failed
    await adminClient
      .from("payment_links")
      .update({ status: "failed" })
      .eq("id", paymentLinkId);
    return NextResponse.json({ received: true, error: "Processing failed" });
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
