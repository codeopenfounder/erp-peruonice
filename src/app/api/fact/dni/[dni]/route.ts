import { NextResponse } from "next/server";
import { validateFactUser } from "@/lib/fact-auth";
import { ApiPeruError, postApiPeru } from "@/lib/apiperu";

interface ApiPeruDniData {
  numero?: string;
  nombre_completo?: string;
  nombres?: string;
  apellido_paterno?: string;
  apellido_materno?: string;
  codigo_verificacion?: string;
}

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

    const { data } = await postApiPeru<ApiPeruDniData>("/dni", { dni });

    if (!data) {
      return NextResponse.json(
        { success: false, error: "No se encontraron datos para este DNI" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        dni: data.numero || dni,
        nombres: data.nombres || null,
        apellido_paterno: data.apellido_paterno || null,
        apellido_materno: data.apellido_materno || null,
        nombre_completo: data.nombre_completo || null,
        direccion: null,
        ubigeo: null,
        departamento: null,
        provincia: null,
        distrito: null,
      },
    });
  } catch (err: unknown) {
    if (err instanceof ApiPeruError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }

    const message = err instanceof Error ? err.message : "Error interno";
    const status =
      message.includes("token") || message.includes("authorized") ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
