import { NextResponse } from "next/server";
import { validateFactUser } from "@/lib/fact-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ dni: string }> },
) {
  try {
    await validateFactUser(request);
    const { dni } = await params;

    // Validate DNI format (8 digits)
    if (!/^\d{8}$/.test(dni)) {
      return NextResponse.json(
        { success: false, error: "DNI inválido: debe tener 8 dígitos" },
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

    // Query Factiliza API for DNI info
    const apiUrl = `https://api.factiliza.com/v1/dni/info/${dni}`;
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: `Error consultando DNI: ${response.status}` },
        { status: 502 },
      );
    }

    const raw = await response.json();
    const factData = raw.data;

    if (!factData) {
      return NextResponse.json(
        { success: false, error: "No se encontraron datos para este DNI" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        dni: factData.numero || dni,
        nombres: factData.nombres || null,
        apellido_paterno: factData.apellido_paterno || null,
        apellido_materno: factData.apellido_materno || null,
        nombre_completo: factData.nombre_completo || null,
        direccion: factData.direccion_completa || null,
        ubigeo: factData.ubigeo_sunat || null,
        departamento: factData.departamento || null,
        provincia: factData.provincia || null,
        distrito: factData.distrito || null,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    const status =
      message.includes("token") || message.includes("authorized") ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
