import { NextResponse } from "next/server";
import { validateFactUser } from "@/lib/fact-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ cee: string }> },
) {
  try {
    await validateFactUser(request);
    const { cee } = await params;

    // Validate CEE format (9 digits)
    if (!/^\d{9}$/.test(cee)) {
      return NextResponse.json(
        { success: false, error: "CE invalido: debe tener 9 digitos" },
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

    const apiUrl = `https://api.factiliza.com/v1/cee/info/${cee}`;
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: `Error consultando CE: ${response.status}` },
        { status: 502 },
      );
    }

    const raw = await response.json();
    const factData = raw.data;

    if (!factData) {
      return NextResponse.json(
        { success: false, error: "No se encontraron datos para este CE" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        cee: factData.numero || cee,
        nombres: factData.nombres || null,
        apellido_paterno: factData.apellido_paterno || null,
        apellido_materno: factData.apellido_materno || null,
        nombre_completo: `${factData.apellido_paterno || ""} ${factData.apellido_materno || ""}, ${factData.nombres || ""}`.trim(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    const status =
      message.includes("token") || message.includes("authorized") ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
