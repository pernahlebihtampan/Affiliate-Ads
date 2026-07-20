import { NextRequest, NextResponse } from "next/server";
import { parseMetaAdPlacementCsv } from "@/lib/csv-parser";
import { importMetaAdPlacementCsv } from "@/lib/import-service";
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
    const metaAdAccountId = parseInt(formData.get("accountId") as string);

    if (!file || !metaAdAccountId) {
      return NextResponse.json({ error: "File and accountId required" }, { status: 400 });
    }

    // Properti file dikirim eksplisit oleh halaman import (multipart tidak membawa lastModified)
    const lastModifiedRaw = formData.get("fileLastModified");
    const fileSizeRaw = formData.get("fileSize");
    const fileMeta = {
      lastModified: lastModifiedRaw ? parseInt(lastModifiedRaw as string) : undefined,
      size: fileSizeRaw ? parseInt(fileSizeRaw as string) : undefined,
    };

    startImportProgress("meta_placement", file.name);
    // Parse inline agar string CSV mentah tidak tertahan di scope selama impor
    const { rows, errors: parseErrors } = parseMetaAdPlacementCsv(await file.text());

    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid rows found", parseErrors }, { status: 400 });
    }

    const result = await importMetaAdPlacementCsv(metaAdAccountId, file.name, rows, fileMeta);

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
