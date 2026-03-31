import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();
    if (!profile?.tenant_id) {
      return NextResponse.json({ error: "Sin tenant" }, { status: 403 });
    }

    const body = await request.json();
    const {
      product_id,
      branch_id,
      reservation_date,
      slot_start,
      slot_end,
      quantity,
      customer_name,
      customer_email,
      customer_phone,
      customer_document_type,
      customer_document_number,
    } = body;

    if (!product_id || !branch_id || !reservation_date || !slot_start || !customer_name) {
      return NextResponse.json(
        { error: "Campos requeridos: product_id, branch_id, reservation_date, slot_start, customer_name" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Get product info for the link description
    const { data: product } = await adminClient
      .from("products")
      .select("name, unit_price")
      .eq("id", product_id)
      .single();

    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    // Get branch name
    const { data: branch } = await adminClient
      .from("branches")
      .select("name")
      .eq("id", branch_id)
      .single();

    const qty = quantity || 1;
    const totalAmount = Number(product.unit_price) * qty;
    const amountCents = Math.round(totalAmount * 100);

    const description = `${product.name} x${qty} - ${reservation_date} ${slot_start}-${slot_end || ""} - ${branch?.name || ""}`;

    // Create payment_link record first to get ID for metadata
    const { data: paymentLink, error: insertError } = await adminClient
      .from("payment_links")
      .insert({
        tenant_id: profile.tenant_id,
        amount: totalAmount,
        currency: "PEN",
        description,
        customer_name,
        customer_email: customer_email || null,
        customer_phone: customer_phone || null,
        customer_document_type: customer_document_type || null,
        customer_document_number: customer_document_number || null,
        product_id,
        branch_id,
        reservation_date,
        slot_start,
        slot_end: slot_end || null,
        quantity: qty,
        status: "pending",
        created_by: user.id,
        expires_at: new Date(
          Date.now() + 24 * 60 * 60 * 1000
        ).toISOString(), // 24h expiry
      })
      .select("id")
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Call Culqi API to create the payment link
    const culqiKey = process.env.CULQI_SECRET_KEY;
    if (!culqiKey) {
      // If no Culqi key configured, return the payment link without Culqi URL
      // This allows testing the flow without Culqi credentials
      return NextResponse.json({
        success: true,
        data: {
          id: paymentLink.id,
          culqi_link_url: null,
          amount: totalAmount,
          description,
          message: "Link creado sin Culqi (API key no configurada). Configure CULQI_SECRET_KEY en variables de entorno.",
        },
      });
    }

    // Embed payment_link_id in the concept for webhook matching
    // (CulqiLink API does not support metadata field)
    const concept = `${description} [${paymentLink.id}]`;

    const culqiResponse = await fetch("https://api.culqi.com/v2/links", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${culqiKey}`,
        "Content-Type": "application/json",
        "x-culqi-product": "link",
      },
      body: JSON.stringify({
        amount: amountCents,
        currency_code: "PEN",
        concept,
        limit_uses: 1,
        payment_methods: ["tarjeta", "yape"],
        expiration_date: Math.floor(Date.now() / 1000) + 86400, // 24h UNIX timestamp
      }),
    });

    if (!culqiResponse.ok) {
      const errData = await culqiResponse.json().catch(() => ({}));
      console.error("[Culqi] Create link failed:", errData);
      // Update payment_link status to failed
      await adminClient
        .from("payment_links")
        .update({ status: "failed" })
        .eq("id", paymentLink.id);
      return NextResponse.json(
        { error: `Error de Culqi: ${errData.merchant_message || errData.user_message || "Error desconocido"}` },
        { status: 502 }
      );
    }

    const culqiData = await culqiResponse.json();

    const culqiUrl = culqiData.url || `https://express.culqi.com/pago/${culqiData.code || culqiData.id}`;

    // Update payment_link with Culqi data
    await adminClient
      .from("payment_links")
      .update({
        culqi_link_id: culqiData.id,
        culqi_link_url: culqiUrl,
      })
      .eq("id", paymentLink.id);

    return NextResponse.json({
      success: true,
      data: {
        id: paymentLink.id,
        culqi_link_url: culqiUrl,
        amount: totalAmount,
        description,
      },
    });
  } catch (err) {
    console.error("[Culqi] Create link error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 }
    );
  }
}
