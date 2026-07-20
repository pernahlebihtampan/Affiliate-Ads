import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const history = await prisma.importBatch.findMany({
    orderBy: { importedAt: "desc" },
    take: 50,
  });
  return NextResponse.json(history);
}

// Delete a single import batch AND the fact rows it created (firstImportId).
// Only the LATEST batch per (type, accountId) may be deleted — deleting an
// older batch is unsafe because its rows may have been re-touched by a newer
// batch, and removing them would drop the newer batch's data. Rows that this
// batch merely UPDATED (firstImportId != id) are kept; their dangling
// lastImportId pointer is cleared to null.
type FactModel = "metaAdDaily" | "metaAdPlacement" | "shopeeClick" | "shopeeOrderItem";

const TYPE_TO_MODEL: Record<string, FactModel> = {
  meta: "metaAdDaily",
  meta_placement: "metaAdPlacement",
  shopee_click: "shopeeClick",
  shopee_commission: "shopeeOrderItem",
};

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== "number") {
    return NextResponse.json({ error: "id tidak valid" }, { status: 400 });
  }

  const batch = await prisma.importBatch.findUnique({ where: { id } });
  if (!batch) {
    return NextResponse.json({ error: "Riwayat impor tidak ditemukan" }, { status: 404 });
  }

  // Guard: hanya batch terkini per (type, accountId) yang boleh dihapus.
  const latest = await prisma.importBatch.findFirst({
    where: { type: batch.type, accountId: batch.accountId },
    orderBy: [{ importedAt: "desc" }, { id: "desc" }],
  });
  if (!latest || latest.id !== id) {
    return NextResponse.json(
      { error: "Hanya impor terkini per akun & tipe yang bisa dihapus" },
      { status: 409 }
    );
  }

  const model = TYPE_TO_MODEL[batch.type];
  if (!model) {
    return NextResponse.json({ error: `Tipe impor "${batch.type}" tidak dikenal` }, { status: 400 });
  }

  const deleted = await prisma.$transaction(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = tx[model] as any;
    // Hapus baris yang benar-benar lahir dari batch ini.
    const { count } = await m.deleteMany({ where: { firstImportId: id } });
    // Baris yang cuma di-update batch ini tetap ada — bersihkan pointer menggantung.
    await m.updateMany({ where: { lastImportId: id }, data: { lastImportId: null } });
    await tx.importBatch.delete({ where: { id } });
    return count as number;
  });

  return NextResponse.json({ success: true, rowsDeleted: deleted });
}
