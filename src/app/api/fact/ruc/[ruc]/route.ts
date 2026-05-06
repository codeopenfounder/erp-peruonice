import { NextResponse } from "next/server";
import { validateFactUser } from "@/lib/fact-auth";
import { ApiPeruError, postApiPeru } from "@/lib/apiperu";

interface ApiPeruRucData {
  ruc?: string;
  nombre_o_razon_social?: string;
  razon_social?: string;
  nombre?: string;
  direccion?: string;
  direccion_completa?: string;
  direccion_simple?: string;
  domicilio_fiscal?: string;
  estado?: string;
  condicion?: string;
  departamento?: string;
  provincia?: string;
  distrito?: string;
  ubigeo_sunat?: string;
  ubigeo?: string[] | string;
}

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

    const { data } = await postApiPeru<ApiPeruRucData>("/ruc", { ruc });

    if (!data) {
      return NextResponse.json(
        { success: false, error: "No se encontraron datos para este RUC" },
        { status: 404 },
      );
    }

    const direccion =
      data.direccion_completa ??
      data.domicilio_fiscal ??
      data.direccion ??
      data.direccion_simple ??
      null;
    const razonSocial =
      data.nombre_o_razon_social ??
      data.razon_social ??
      data.nombre ??
      null;
    const ubigeo =
      data.ubigeo_sunat ??
      (Array.isArray(data.ubigeo) ? data.ubigeo[2] : data.ubigeo) ??
      null;

    return NextResponse.json({
      success: true,
      data: {
        ruc: data.ruc || ruc,
        razon_social: razonSocial,
        nombre_comercial: null,
        direccion,
        ubigeo,
        departamento: data.departamento || null,
        provincia: data.provincia || null,
        distrito: data.distrito || null,
        estado: data.estado || null,
        condicion: data.condicion || null,
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
