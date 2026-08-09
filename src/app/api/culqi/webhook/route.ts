import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Characters for access code generation (unambiguous charset, same as poi-lector)
const ACCESS_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateAccessCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += ACCESS_CHARS[Math.floor(Math.random() * ACCESS_CHARS.length)];
  }
  return code;
}

export async function POST(request: Request) {
  try {
    const payload = await request.text();
    console.log("[Culqi Webhook] Received:", payload.substring(0, 500));

    // Parse the event wrapper
    const event = JSON.parse(payload);

    // CRITICAL: Culqi sends `data` as a JSON STRING, not an object
    // Must double-parse: first the event body, then the data field
    let chargeData: Record<string, unknown>;
    if (typeof event.data === "string") {
      chargeData = JSON.parse(event.data);
    } else {
      chargeData = event.data || event;
    }

    const eventType = event.type || "";
    console.log("[Culqi Webhook] Event type:", eventType, "Charge ID:", chargeData.id);

    // Only process successful charges
    if (eventType === "charge.creation.failed") {
      // Try to find and mark as failed
      await handleFailed(chargeData);
      return NextResponse.json({ received: true, message: "Charge failed noted" });
    }

    if (eventType !== "charge.creation.succeeded") {
      return NextResponse.json({ received: true, message: `Unhandled event: ${eventType}` });
    }

    // Process successful payment
    return await processSuccessfulCharge(chargeData);
  } catch (err) {
    console.error("[Culqi Webhook] Error:", err);
    // Always return 200 to prevent Culqi from retrying
    return NextResponse.json({ received: true, error: "Processing error" });
  }
}

async function processSuccessfulCharge(charge: Record<string, unknown>) {
  const adminClient = createAdminClient();
  const chargeId = String(charge.id || "");
  const amountCents = Number(charge.amount || charge.current_amount || 0);
  const amountSoles = amountCents / 100;
  const description = String(charge.description || "");
  const customerEmail = String(charge.email || "");

  // Strategy to find the payment_link:
  // 1. Check metadata.payment_link_id (if charge was created via our API)
  // 2. Match by description (we embed payment_link_id in the link description)
  // 3. Match by amount + status=pending (fallback)

  let paymentLinkId: string | null = null;

  // Strategy 1: metadata
  const metadata = (charge.metadata || {}) as Record<string, unknown>;
  if (metadata.payment_link_id) {
    paymentLinkId = String(metadata.payment_link_id);
  }

  // Strategy 2: search description for UUID pattern
  if (!paymentLinkId && description) {
    const uuidMatch = description.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
    if (uuidMatch) {
      const { data: found } = await adminClient
        .from("payment_links")
        .select("id")
        .eq("id", uuidMatch[0])
        .eq("status", "pending")
        .single();
      if (found) paymentLinkId = found.id;
    }
  }

  // Strategy 3: match by amount and pending status (most recent)
  if (!paymentLinkId) {
    const { data: candidates } = await adminClient
      .from("payment_links")
      .select("id")
      .eq("status", "pending")
      .eq("amount", amountSoles)
      .order("created_at", { ascending: false })
      .limit(1);
    if (candidates && candidates.length > 0) {
      paymentLinkId = candidates[0].id;
    }
  }

  if (!paymentLinkId) {
    console.log("[Culqi Webhook] No matching payment_link found for charge", chargeId);
    return NextResponse.json({ received: true, message: "No matching link found" });
  }

  // Fetch the payment link
  const { data: link } = await adminClient
    .from("payment_links")
    .select("*")
    .eq("id", paymentLinkId)
    .single();

  if (!link) {
    return NextResponse.json({ received: true, message: "Link not found" });
  }

  // Idempotency: already processed
  if (link.status === "paid") {
    return NextResponse.json({ received: true, message: "Already processed" });
  }

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
            email: link.customer_email || customerEmail || null,
            phone: link.customer_phone,
          })
          .select("id")
          .single();
        customerId = newCust?.id || null;
      }
    }

    // 2. Create invoice (boleta with card payment)
    let invoiceId: string | null = null;

    // Un pago online no viene de ninguna caja física, así que se emite sobre la
    // primera serie de boleta por código (B001 antes que B002). El `order` no es
    // cosmético: con varias cajas, `limit(1)` sin ordenar devolvía una serie u
    // otra según el plan de PostgREST, y el comprobante de un pago online podía
    // caer en la serie de una caja distinta cada vez.
    const { data: series } = await adminClient
      .from("invoice_series")
      .select("id")
      .eq("tenant_id", link.tenant_id)
      .eq("document_type", "boleta")
      .eq("is_active", true)
      .order("series_code", { ascending: true })
      .limit(1)
      .single();

    if (series) {
      const { data: corrData } = await adminClient.rpc("fn_next_correlative", {
        p_series_id: series.id,
      });
      const correlative = corrData as number;

      const total = Number(link.amount);
      const opGravada = Math.round((total / 1.18) * 100) / 100;
      const igvTotal = Math.round((total - opGravada) * 100) / 100;

      const peruNow = new Date(
        new Date().toLocaleString("en-US", { timeZone: "America/Lima" })
      );
      const issueDate = `${peruNow.getFullYear()}-${String(peruNow.getMonth() + 1).padStart(2, "0")}-${String(peruNow.getDate()).padStart(2, "0")}`;

      // `branch_id` NO va aquí: la columna no existe en `invoices` (la que sí se
      // añadió es `products.branch_id`, migración 00015). PostgREST rechazaba el
      // INSERT entero con 42703, el error no se comprobaba y **cada pago online
      // se quedaba sin comprobante en silencio**, consumiendo además un
      // correlativo de boleta que quedaba como hueco.
      const { data: inv, error: invError } = await adminClient
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
          notes: `Pago online Culqi - ${chargeId}`,
          created_at: now,
        })
        .select("id")
        .single();

      if (invError) {
        // Se registra y se sigue: la reserva ya está pagada y confirmarla importa
        // más que el comprobante, que puede reemitirse. Lo que no es aceptable es
        // que el fallo sea invisible, como lo era hasta ahora.
        console.error("[culqi-webhook] No se pudo crear el comprobante:", invError);
      }

      invoiceId = inv?.id || null;

      // Create invoice item
      if (invoiceId && link.product_id) {
        const { data: prod } = await adminClient
          .from("products")
          .select("name, unit_price, tax_type, igv_rate, cost_price")
          .eq("id", link.product_id)
          .single();

        if (prod) {
          const unitPrice = Number(prod.unit_price);
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
          p_notes: `Reserva online - Culqi ${chargeId}`,
        }
      );

      reservationId = resData as string | null;

      if (reservationId) {
        await adminClient
          .from("reservations")
          .update({ access_code: accessCode })
          .eq("id", reservationId);
      }
    }

    // 4. Update payment link
    await adminClient
      .from("payment_links")
      .update({
        status: "paid",
        culqi_order_id: chargeId,
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
        // `"system"` no es un uuid: como actor reventaba el INSERT completo con
        // 22P02 y se perdía la notificación de TODOS los destinatarios. Vacío
        // significa "sin actor" y ya no se añade a la lista.
        actorId: link.created_by || "",
        moduleCodes: ["reservas.links", "ventas.comprobantes"],
        title: "Pago online recibido",
        message: `${link.customer_name} pago S/ ${link.amount} por ${link.description || "reserva"}`,
        resourceType: "payment_link",
        resourceId: paymentLinkId,
        type: "success",
        // El webhook es PÚBLICO y sin sesión de ningún tipo: sin el cliente admin
        // esta notificación nunca se insertaba.
        asSystem: true,
      });
    } catch {
      // Non-critical
    }

    console.log("[Culqi Webhook] Processed:", { paymentLinkId, invoiceId, reservationId });
    return NextResponse.json({
      received: true,
      processed: true,
      invoice_id: invoiceId,
      reservation_id: reservationId,
    });
  } catch (err) {
    console.error("[Culqi Webhook] Processing error:", err);
    await adminClient
      .from("payment_links")
      .update({ status: "failed" })
      .eq("id", paymentLinkId);
    return NextResponse.json({ received: true, error: "Processing failed" });
  }
}

async function handleFailed(charge: Record<string, unknown>) {
  const adminClient = createAdminClient();
  const description = String(charge.description || "");

  // Try to find by description UUID
  const uuidMatch = description.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  );
  if (uuidMatch) {
    await adminClient
      .from("payment_links")
      .update({ status: "failed" })
      .eq("id", uuidMatch[0])
      .eq("status", "pending");
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
