"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dasbor", icon: "📊" },
  { href: "/ringkasan", label: "Ringkasan", icon: "📈" },
  { href: "/klik", label: "Performa Klik", icon: "🖱️" },
  { href: "/wilayah", label: "Performa Wilayah", icon: "🗺️" },
  { href: "/penempatan", label: "Performa Penempatan", icon: "🎯" },
  { href: "/import", label: "Import CSV", icon: "📥" },
  { href: "/campaign-hub", label: "Pusat Kampanye", icon: "🔗" },
  { href: "/akun", label: "Akun", icon: "👤" },
  { href: "/riwayat-impor", label: "Riwayat Impor", icon: "📋" },
  { href: "/data", label: "Data Browser", icon: "🔍" },
  { href: "/settings", label: "Pengaturan", icon: "⚙️" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
      <div className="p-4 border-b border-gray-200">
        <Link href="/" className="text-lg font-bold text-primary">
          Affiliate Ads
        </Link>
        <p className="text-xs text-muted-foreground mt-0.5">
          Shopee + Meta Ads
        </p>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-gray-700 hover:bg-gray-100"
              )}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-gray-200 text-xs text-muted-foreground">
        v1.0.0
      </div>
    </aside>
  );
}
