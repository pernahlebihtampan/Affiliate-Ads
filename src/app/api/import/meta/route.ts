import { NextRequest, NextResponse } from "next/server";
import { parseMetaAdCsv } from "@/lib/csv-parser";
import { importMetaAdCsv } from "@/lib/import-service";
import { startImportProgress, finishImportProgress } from "@/lib/import-progress";

export async function POST(request: NextRequest) {
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

    startImportProgress("meta", file.name);
    // Parse inline agar string CSV mentah tidak tertahan di scope selama impor
    const { rows, errors: parseErrors } = parseMetaAdCsv(await file.text());

    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid rows found", parseErrors }, { status: 400 });
    }

    const result = await importMetaAdCsv(metaAdAccountId, file.name, rows, fileMeta);

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
