import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Samo za `npm run dev`: dopusti otvaranje s mobitela na istoj Wi-Fi mreži
  // (http://192.168.x.x:3000) i preko 127.0.0.1 — inače Next blokira dev skripte.
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*", "10.*.*.*", "*.local"],
};

export default nextConfig;
