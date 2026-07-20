import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateWib } from "@/lib/utils";
import type { SnapshotPayload } from "@/lib/daily-snapshot";

// GET /api/daily?date=YYYY-MM-DD
// Status impor per (tipe, akun) untuk tanggal itu (untuk kartu impor) + snapshot
// laporan beku (bila sudah ada). Snapshot dibuat saat impor, bukan di sini.
export async function GET(request: NextRequest) {
  const dateStr = new URL(request.url).searchParams.get("date");
  const reportDate = dateStr ? parseDateWib(dateStr) : null;
  if (!reportDate) {
    return NextResponse.json({ error: "Parameter date (YYYY-MM-DD) wajib" }, { status: 400 });
  }

  const [batchRows, shopeeAccounts, metaAdAccounts, snapshotRow] = await Promise.all([
    prisma.importBatch.findMany({
      where: { reportDate },
      orderBy: { importedAt: "asc" },
      select: { type: true, accountId: true, accountType: true, fileName: true, importedAt: true },
    }),
    prisma.shopeeAccount.findMany({ select: { id: true, name: true } }),
    prisma.metaAdAccount.findMany({ select: { id: true, name: true } }),
    prisma.dailySnapshot.findUnique({ where: { reportDate } }),
  ]);

  const shopeeNames = new Map(shopeeAccounts.map((a) => [a.id, a.name]));
  const metaNames = new Map(metaAdAccounts.map((a) => [a.id, a.name]));
  const nameFor = (accountType: string, accountId: number) =>
    (accountType === "shopee" ? shopeeNames.get(accountId) : metaNames.get(accountId)) ?? "";

  const batches = batchRows.map((b) => ({
    type: b.type,
    accountId: b.accountId,
    accountType: b.accountType,
    accountName: nameFor(b.accountType, b.accountId),
    fileName: b.fileName,
    importedAt: b.importedAt,
  }));

  const snapshot: Pick<SnapshotPayload, "rows" | "totals" | "generatedAt"> | null =
    snapshotRow ? JSON.parse(snapshotRow.payload) : null;

  return NextResponse.json({ reportDate: dateStr, batches, snapshot });
}
