import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}

export function parseDateSafe(value: string): Date | null {
  if (!value || value === "--" || value === "-") return null;

  // Try yyyy-MM-dd HH:mm:ss format (new Shopee format)
  const ymdhms = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})$/.exec(value);
  if (ymdhms) {
    const [, y, m, d, h, min, s] = ymdhms;
    return new Date(`${y}-${m}-${d}T${h.padStart(2, "0")}:${min}:${s}`);
  }

  // Try M/d/yyyy H:mm format (old Shopee format)
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/.exec(value);
  if (mdy) {
    const [, m, d, y, h, min] = mdy;
    return new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${min}:00`);
  }

  // Try yyyy-MM-dd
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (ymd) {
    return new Date(`${value}T00:00:00`);
  }

  return null;
}

export function parseFloatSafe(value: string): number {
  if (!value || value === "--" || value === "-" || value === "") return 0;
  // Handle both formats: 
  // - US format: 1234.56 (dot as decimal)
  // - ID format: 1.234,56 (dot as thousand separator, comma as decimal)
  let cleaned = value.replace(/[Rp\s]/g, "");
  
  // If contains comma as decimal separator (ID format), convert to US format
  if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }
  // If only dots exist (they could be thousand separators or decimals)
  // We assume no thousand separators since the CSV uses US format
  // But handle the case where multiple dots exist (thousand separators)
  // by keeping only the last dot as decimal
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export function parseIntSafe(value: string): number {
  if (!value || value === "--" || value === "-" || value === "") return 0;
  let cleaned = value.replace(/[Rp\s]/g, "").replace(/,.*$/, "").replace(/\./g, "");
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}

export function parseTagRaw(tagRaw: string): { tag1: string; tag2: string } {
  if (!tagRaw) return { tag1: "", tag2: "" };
  const parts = tagRaw.split("-");
  const tag1 = parts[0] || "";
  const tag2 = parts.length > 1 ? parts[1] : "";
  return { tag1, tag2 };
}

export function wibToUtc(date: Date): Date {
  const utc = new Date(date);
  utc.setHours(utc.getHours() - 7);
  return utc;
}

export function computeFileHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const chr = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
