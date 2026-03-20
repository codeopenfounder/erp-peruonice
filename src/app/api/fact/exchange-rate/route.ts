import { NextResponse } from "next/server";

const CACHE_TTL = 3600000; // 1 hour
let cache: { data: Record<string, unknown>; timestamp: number } | null = null;

export async function GET() {
  try {
    if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
      return NextResponse.json(cache.data);
    }

    const apiKey = process.env.FACTILIZA_API_KEY;
    if (!apiKey) {
      if (cache) return NextResponse.json(cache.data);
      return NextResponse.json(
        { success: false, error: "FACTILIZA_API_KEY not configured" },
        { status: 500 },
      );
    }

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    const res = await fetch(
      `https://api.factiliza.com/v1/tipocambio/info/dia?fecha=${today}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        next: { revalidate: 3600 },
      },
    );

    const fallback = {
      success: true,
      compra: 3.7,
      venta: 3.8,
      rate: 3.75,
      fecha: today,
      source: "fallback",
    };

    if (!res.ok) {
      if (cache) return NextResponse.json(cache.data);
      cache = { data: fallback, timestamp: Date.now() };
      return NextResponse.json(fallback);
    }

    const json = await res.json();

    if (!json.success || !json.data) {
      if (cache) return NextResponse.json(cache.data);
      cache = { data: fallback, timestamp: Date.now() };
      return NextResponse.json(fallback);
    }

    const compra = parseFloat(json.data.compra);
    const venta = parseFloat(json.data.venta);

    if (isNaN(compra) || isNaN(venta)) {
      if (cache) return NextResponse.json(cache.data);
      return NextResponse.json(
        { success: false, error: "Invalid rate values from Factiliza" },
        { status: 502 },
      );
    }

    const data = {
      success: true,
      compra: Math.round(compra * 10000) / 10000,
      venta: Math.round(venta * 10000) / 10000,
      rate: Math.round(((compra + venta) / 2) * 10000) / 10000,
      fecha: json.data.fecha || today,
      source: "factiliza-sbs",
    };

    cache = { data, timestamp: Date.now() };
    return NextResponse.json(data);
  } catch {
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
