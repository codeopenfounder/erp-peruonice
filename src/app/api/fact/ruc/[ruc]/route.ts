import { NextResponse } from "next/server";
import { validateFactUser } from "@/lib/fact-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ruc: string }> },
) {
  try {
    await validateFactUser(request);
    const { ruc } = await params;

    // Validate RUC format (11 digits)
    if (!/^\d{11}$/.test(ruc)) {
      return NextResponse.json(
        { success: false, error: "RUC inválido: debe tener 11 dígitos" },
        { status: 400 },
      );
    }

    const apiKey = process.env.FACTILIZA_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "FACTILIZA_API_KEY no configurada" },
        { status: 500 },
      );
    }

    // Query Factiliza API for RUC info
    const apiUrl = `https://api.factiliza.com/v1/ruc/info/${ruc}`;
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: `Error consultando RUC: ${response.status}` },
        { status: 502 },
      );
    }

    const raw = await response.json();
    const factData = raw.data;

    if (!factData) {
      return NextResponse.json(
        { success: false, error: "No se encontraron datos para este RUC" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ruc: factData.numero || ruc,
        razon_social: factData.nombre_o_razon_social || null,
        nombre_comercial: null,
        direccion: factData.direccion_completa || null,
        ubigeo: factData.ubigeo_sunat || null,
        departamento: factData.departamento || null,
        provincia: factData.provincia || null,
        distrito: factData.distrito || null,
        estado: factData.estado || null,
        condicion: factData.condicion || null,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    const status =
      message.includes("token") || message.includes("authorized") ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
