import { NextRequest, NextResponse } from "next/server";
import { parseShopeeCommissionCsv } from "@/lib/csv-parser";
import { importShopeeCommissionCsv } from "@/lib/import-service";

export async function POST(request: NextRequest) {
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

    const content = await file.text();
    const { rows, errors: parseErrors } = parseShopeeCommissionCsv(content);

    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid rows found", parseErrors }, { status: 400 });
    }

    const result = await importShopeeCommissionCsv(shopeeAccountId, file.name, rows, fileMeta);

    return NextResponse.json({
      ...result,
      parseErrors,
      totalParsed: rows.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
