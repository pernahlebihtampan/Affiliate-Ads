import { NextRequest, NextResponse } from "next/server";
import { parseDateWib } from "@/lib/utils";
import { computeAndStoreDailySnapshot } from "@/lib/daily-snapshot";

// POST /api/daily/recompute  body { date: "YYYY-MM-DD" }
// Hitung ulang & bekukan ulang snapshot untuk satu tanggal (tombol manual).
// Catatan: andal untuk tanggal yang baru diimpor hari ini. Untuk tanggal lama,
// pesanan yang di-re-import di hari berikutnya sudah pindah lastImportId → hasil
// bisa undercount. Snapshot JSON lama tetap benar sampai tombol ini ditekan.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const reportDate = body?.date ? parseDateWib(body.date) : null;
  if (!reportDate) {
    return NextResponse.json({ error: "Body { date: 'YYYY-MM-DD' } wajib" }, { status: 400 });
  }
  const snapshot = await computeAndStoreDailySnapshot(reportDate);
  return NextResponse.json({ reportDate: body.date, snapshot });
}
