import { NextRequest, NextResponse } from "next/server";
import { parseMetaAdCsv, parseShopeeClickCsv, parseShopeeCommissionCsv } from "@/lib/csv-parser";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const type = formData.get("type") as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const content = await file.text();

    let result;
    switch (type) {
      case "meta":
        result = parseMetaAdCsv(content);
        break;
      case "shopee_click":
        result = parseShopeeClickCsv(content);
        break;
      case "shopee_commission":
        result = parseShopeeCommissionCsv(content);
        break;
      default:
        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    return NextResponse.json({
      rows: result.rows.slice(0, 20),
      totalRows: result.rows.length,
      errors: result.errors.slice(0, 20),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
