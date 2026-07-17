import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Izinkan akses dev server dari komputer lain di LAN (satu jaringan ethernet).
  // Next.js memblokir cross-origin ke aset dev secara default; daftarkan subnet LAN.
  allowedDevOrigins: ["192.168.2.46", "192.168.2.*", "192.168.1.*", "10.*"],
};

export default nextConfig;
