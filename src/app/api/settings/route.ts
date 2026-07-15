import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const settings = await prisma.setting.findMany();
  const map: Record<string, string> = {};
  for (const s of settings) {
    map[s.key] = s.value;
  }
  return NextResponse.json(map);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { key, value } = body;

  if (!key) return NextResponse.json({ error: "Key required" }, { status: 400 });

  const setting = await prisma.setting.upsert({
    where: { key },
    update: { value: value || "" },
    create: { key, value: value || "" },
  });

  return NextResponse.json(setting);
}
