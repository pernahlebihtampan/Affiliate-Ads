import { NextRequest, NextResponse } from "next/server";
import { parseMetaAdCsv } from "@/lib/csv-parser";
import { importMetaAdCsv } from "@/lib/import-service";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const metaAdAccountId = parseInt(formData.get("accountId") as string);

    if (!file || !metaAdAccountId) {
      return NextResponse.json({ error: "File and accountId required" }, { status: 400 });
    }

    const content = await file.text();
    const { rows, errors: parseErrors } = parseMetaAdCsv(content);

    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid rows found", parseErrors }, { status: 400 });
    }

    const result = await importMetaAdCsv(metaAdAccountId, file.name, rows);

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
