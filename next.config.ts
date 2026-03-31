import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/api/fact/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
        ],
      },
      {
        source: "/api/lector/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
        ],
      },
      {
        source: "/api/culqi/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, X-Culqi-Signature",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/ventas",
        destination: "/ventas/comprobantes",
        permanent: false,
      },
      {
        source: "/inventario",
        destination: "/inventario/productos",
        permanent: false,
      },
      {
        source: "/finanzas",
        destination: "/finanzas/movimientos",
        permanent: false,
      },
      {
        source: "/gastos",
        destination: "/gastos/fondos",
        permanent: false,
      },
      {
        source: "/config",
        destination: "/config/general",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
