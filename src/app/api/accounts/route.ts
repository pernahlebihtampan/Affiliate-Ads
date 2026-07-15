import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const shopeeAccounts = await prisma.shopeeAccount.findMany({ orderBy: { name: "asc" } });
  const metaAdAccounts = await prisma.metaAdAccount.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ shopeeAccounts, metaAdAccounts });
}

export async function POST(request: Request) {
  const body = await request.json();

  if (body.type === "shopee") {
    const account = await prisma.shopeeAccount.upsert({
      where: { name: body.name },
      update: {},
      create: { name: body.name },
    });
    return NextResponse.json(account);
  }

  if (body.type === "meta") {
    const account = await prisma.metaAdAccount.create({
      data: { name: body.name, actId: body.actId || "" },
    });
    return NextResponse.json(account);
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  
  if (body.type === "shopee" && body.id) {
    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: "Nama tidak boleh kosong" }, { status: 400 });
    }
    // Cek apakah nama baru sudah dipakai akun lain
    const existing = await prisma.shopeeAccount.findUnique({
      where: { name: body.name.trim() },
    });
    if (existing && existing.id !== body.id) {
      return NextResponse.json({ error: "Nama akun sudah digunakan" }, { status: 409 });
    }
    const account = await prisma.shopeeAccount.update({
      where: { id: body.id },
      data: { name: body.name.trim() },
    });
    return NextResponse.json(account);
  }

  if (body.type === "meta" && body.id) {
    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: "Nama tidak boleh kosong" }, { status: 400 });
    }
    const account = await prisma.metaAdAccount.update({
      where: { id: body.id },
      data: { name: body.name.trim() },
    });
    return NextResponse.json(account);
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}

export async function DELETE(request: Request) {
  const body = await request.json();
  if (body.type === "shopee" && body.id) {
    await prisma.shopeeAccount.delete({ where: { id: body.id } });
    return NextResponse.json({ success: true });
  }
  if (body.type === "meta" && body.id) {
    await prisma.metaAdAccount.delete({ where: { id: body.id } });
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
