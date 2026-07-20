import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateWib } from "@/lib/utils";
import type { SnapshotPayload } from "@/lib/daily-snapshot";

// GET /api/daily/range?from=YYYY-MM-DD&to=YYYY-MM-DD
// Kembalikan satu tabel per tanggal (snapshot beku) dalam rentang, TERKINI DULU.
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  const fromDate = from ? parseDateWib(from) : null;
  const toDate = to ? parseDateWib(to) : null;

  const snapshots = await prisma.dailySnapshot.findMany({
    where: {
      ...(fromDate || toDate
        ? {
            reportDate: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    },
    orderBy: { reportDate: "desc" },
  });

  const tables = snapshots.map((s) => {
    const payload: SnapshotPayload = JSON.parse(s.payload);
    return {
      reportDate: s.reportDate.toISOString().slice(0, 10),
      rows: payload.rows,
      totals: payload.totals,
      generatedAt: payload.generatedAt,
    };
  });

  return NextResponse.json({ tables });
}
