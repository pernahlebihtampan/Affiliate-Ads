import { NextResponse } from "next/server";
import { getImportProgress } from "@/lib/import-progress";

export async function GET() {
  return NextResponse.json(getImportProgress());
}
