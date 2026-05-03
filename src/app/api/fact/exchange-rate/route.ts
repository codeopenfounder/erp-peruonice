import { NextResponse } from "next/server";
import { ApiPeruError, postApiPeru } from "@/lib/apiperu";

const CACHE_TTL = 3600000; // 1 hour
let cache: { data: Record<string, unknown>; timestamp: number } | null = null;

interface ApiPeruExchangeRateData {
  moneda?: string;
  fecha_busqueda?: string;
  venta?: number | string;
  compra?: number | string;
  date?: string;
  sale?: number | string;
  purchase?: number | string;
}

async function getApiPeruExchangeRate(fecha: string) {
  try {
    return await postApiPeru<ApiPeruExchangeRateData>(
      "/tipo-de-cambio",
      { fecha },
      { revalidate: 3600 },
    );
  } catch (err) {
    // The docs currently show /tipo-de-cambio in the endpoint section and
    // /tipo_de_cambio in the PHP sample. Keep a narrow fallback for that drift.
    if (err instanceof ApiPeruError && err.status === 404) {
      return postApiPeru<ApiPeruExchangeRateData>(
        "/tipo_de_cambio",
        { fecha },
        { revalidate: 3600 },
      );
    }
    throw err;
  }
}

export async function GET() {
  try {
    if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
      return NextResponse.json(cache.data);
    }

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    const fallback = {
      success: true,
      compra: 3.7,
      venta: 3.8,
      rate: 3.75,
      fecha: today,
      source: "fallback",
    };

    const { data: rateData } = await getApiPeruExchangeRate(today);
    if (!rateData) {
      if (cache) return NextResponse.json(cache.data);
      cache = { data: fallback, timestamp: Date.now() };
      return NextResponse.json(fallback);
    }

    const compra = Number(rateData.compra ?? rateData.purchase);
    const venta = Number(rateData.venta ?? rateData.sale);

    if (isNaN(compra) || isNaN(venta)) {
      if (cache) return NextResponse.json(cache.data);
      return NextResponse.json(
        { success: false, error: "Invalid rate values from ApiPeru" },
        { status: 502 },
      );
    }

    const data = {
      success: true,
      compra: Math.round(compra * 10000) / 10000,
      venta: Math.round(venta * 10000) / 10000,
      rate: Math.round(((compra + venta) / 2) * 10000) / 10000,
      fecha: rateData.fecha_busqueda || rateData.date || today,
      source: "apiperu-sbs",
    };

    cache = { data, timestamp: Date.now() };
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof ApiPeruError && err.status === 500 && !cache) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }

    if (cache) return NextResponse.json(cache.data);
    const fallbackData = {
      success: true,
      compra: 3.7,
      venta: 3.8,
      rate: 3.75,
      fecha: new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }),
      source: "fallback",
    };
    return NextResponse.json(fallbackData);
  }
}
