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

  // Try M/d/yyyy H:mm format (Shopee)
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
  let cleaned = value.replace(/[Rp\s]/g, "").replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export function parseIntSafe(value: string): number {
  if (!value || value === "--" || value === "-" || value === "") return 0;
  let cleaned = value.replace(/[Rp\s]/g, "").replace(/\./g, "");
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
