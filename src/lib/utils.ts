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

/**
 * PPN 11% atas biaya iklan Meta. CSV Meta ("Jumlah yang dibelanjakan (IDR)")
 * BELUM termasuk pajak; MetaAdDaily.spendIDR menyimpan angka mentah itu apa
 * adanya (aturan "simpan CSV mentah"). Semua angka biaya/profit/ROAS/CPC/CPM
 * di UI memakai spend TERMASUK PPN, jadi biaya iklan riil = spendIDR × 1,11.
 * Terapkan helper ini di titik AGREGASI spend saat baca (bukan saat impor).
 * Catatan: pada rasio prorata (spend_wilayah / spend_total) faktor 1,11 saling
 * meniadakan — di situ pakai spendIDR mentah, tidak perlu helper ini.
 */
export const PPN_RATE = 0.11;
export function spendWithPpn(spendIdr: number): number {
  return spendIdr * (1 + PPN_RATE);
}

/**
 * Rentang tanggal default untuk halaman analisis: 30 hari sebelum kemarin
 * s/d kemarin. Hari berjalan sengaja dikecualikan — datanya belum lengkap
 * sebelum CSV berikutnya diimpor, sehingga angka hari ini selalu tampak anjlok.
 * Tanggal dihitung dari jam lokal browser (bukan toISOString/UTC yang bisa
 * mundur sehari saat pagi WIB).
 */
export function defaultDateRange(): { from: string; to: string } {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  const from = new Date();
  from.setDate(from.getDate() - 31); // 30 hari sebelum kemarin
  const to = new Date();
  to.setDate(to.getDate() - 1); // kemarin
  return { from: fmt(from), to: fmt(to) };
}

/**
 * Parse waktu Shopee/Meta (WIB, UTC+7) menjadi Date yang instannya = digit apa adanya.
 *
 * Dibangun via Date.UTC(...) sehingga `.toISOString()` mengembalikan digit yang sama
 * dengan string mentah (mis. "2026-07-14 15:50" -> 2026-07-14T15:50:00Z). Artinya
 * tanggal-kalender bisnis (WIB) dibaca langsung dari bagian tanggal ISO — konsisten
 * dengan cara MetaAdDaily.date disimpan (00:00Z dari label tanggal WIB), sehingga
 * spend Meta & komisi Shopee jatuh di bucket tanggal WIB yang SAMA (selisih 0 jam).
 *
 * JANGAN pakai `new Date("...")` tanpa offset lalu geser jam — itu bergantung timezone
 * server (WITA/+8) dan menghasilkan konversi ganda (bug lama: clickTimeUTC meleset -8 jam).
 */
export function parseDateWib(value: string): Date | null {
  if (!value || value === "--" || value === "-") return null;

  // yyyy-MM-dd HH:mm:ss (format Shopee baru)
  const ymdhms = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})$/.exec(value);
  if (ymdhms) {
    const [, y, m, d, h, min, s] = ymdhms;
    return new Date(Date.UTC(+y, +m - 1, +d, +h, +min, +s));
  }

  // M/d/yyyy H:mm (format Shopee lama)
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/.exec(value);
  if (mdy) {
    const [, m, d, y, h, min] = mdy;
    return new Date(Date.UTC(+y, +m - 1, +d, +h, +min, 0));
  }

  // yyyy-MM-dd (tanggal saja, mis. Meta "Awal pelaporan")
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (ymd) {
    const [, y, m, d] = ymd;
    return new Date(Date.UTC(+y, +m - 1, +d, 0, 0, 0));
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
  const cleaned = value.replace(/[Rp\s]/g, "").replace(/,.*$/, "").replace(/\./g, "");
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

export function computeFileHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const chr = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
