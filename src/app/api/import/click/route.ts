import { NextRequest, NextResponse } from "next/server";
import { parseShopeeClickCsv } from "@/lib/csv-parser";
import { importShopeeClickCsv } from "@/lib/import-service";
import { parseDateWib } from "@/lib/utils";
import { computeAndStoreDailySnapshot } from "@/lib/daily-snapshot";
import {
  startImportProgress,
  finishImportProgress,
  getImportProgress,
} from "@/lib/import-progress";

export async function POST(request: NextRequest) {
  // Slot progres tunggal tolak impor baru selama impor lain masih berjalan
  // (mis. dari komputer/tab lain). Harus SEBELUM try/finally di bawah, karena
  // finally-nya akan mematikan progres impor yang sedang berjalan itu.
  const running = getImportProgress();
  if (running?.active) {
    return NextResponse.json(
      { error: `Impor lain sedang berjalan (${running.fileName}). Tunggu sampai selesai.` },
      { status: 409 }
    );
  }
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const shopeeAccountId = parseInt(formData.get("accountId") as string);

    if (!file || !shopeeAccountId) {
      return NextResponse.json({ error: "File and accountId required" }, { status: 400 });
    }

    // Properti file dikirim eksplisit oleh halaman import (multipart tidak membawa lastModified)
    const lastModifiedRaw = formData.get("fileLastModified");
    const fileSizeRaw = formData.get("fileSize");
    const fileMeta = {
      lastModified: lastModifiedRaw ? parseInt(lastModifiedRaw as string) : undefined,
      size: fileSizeRaw ? parseInt(fileSizeRaw as string) : undefined,
    };
    // Tanggal laporan dari Dasbor Harian (opsional; halaman /import lama tidak mengirimnya)
    const reportDateRaw = formData.get("reportDate");
    const reportDate = reportDateRaw ? parseDateWib(reportDateRaw as string) ?? undefined : undefined;

    startImportProgress("shopee_click", file.name);
    // Parse inline agar string CSV mentah tidak tertahan di scope selama impor
    const { rows, errors: parseErrors } = parseShopeeClickCsv(await file.text());

    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid rows found", parseErrors }, { status: 400 });
    }

    const result = await importShopeeClickCsv(shopeeAccountId, file.name, rows, fileMeta, reportDate);

    // Bekukan ulang snapshot laporan harian untuk tanggal ini setelah impor
    if (reportDate) await computeAndStoreDailySnapshot(reportDate);

    return NextResponse.json({
      ...result,
      parseErrors,
      totalParsed: rows.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    finishImportProgress();
  }
}
