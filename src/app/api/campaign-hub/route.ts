import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { suggestConnections, type DailySeries } from "@/lib/matching-engine";

export async function GET() {
  // Get all Meta campaigns (1 Meta : banyak Shopee → hubs[])
  const metaCampaigns = await prisma.metaCampaign.findMany({
    include: {
      metaAdAccount: true,
      hubs: { include: { shopeeCampaign: true } },
    },
    orderBy: { name: "asc" },
  });

  // Get all Shopee campaigns
  const shopeeCampaigns = await prisma.shopeeCampaign.findMany({
    include: {
      shopeeAccount: true,
      hub: true,
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ metaCampaigns, shopeeCampaigns });
}

export async function POST(request: NextRequest) {
  try {
  const body = await request.json();

  if (body.action === "link") {
    const { metaCampaignId, shopeeCampaignId } = body;

    // 1 Shopee : 1 Meta (shopeeCampaignId @unique). Satu Meta boleh punya
    // banyak tautan Shopee, jadi upsert by shopeeCampaignId: kalau Shopee ini
    // sudah tertaut (ke Meta manapun), pindahkan ke Meta yang diminta;
    // kalau belum, buat baru.
    const hub = await prisma.campaignHub.upsert({
      where: { shopeeCampaignId },
      update: { metaCampaignId },
      create: { metaCampaignId, shopeeCampaignId },
    });
    return NextResponse.json(hub);
  }

  if (body.action === "unlink") {
    // Putus satu tautan spesifik. Prioritas shopeeCampaignId (unik → satu
    // tautan tepat); fallback ke metaCampaignId (putus semua tautan Meta itu).
    if (body.shopeeCampaignId != null) {
      await prisma.campaignHub.delete({
        where: { shopeeCampaignId: body.shopeeCampaignId },
      });
    } else {
      await prisma.campaignHub.deleteMany({
        where: { metaCampaignId: body.metaCampaignId },
      });
    }
    return NextResponse.json({ success: true });
  }

  if (body.action === "suggest") {
    // Shopee yang belum tertaut ke Meta manapun.
    const shopeeCampaigns = await prisma.shopeeCampaign.findMany({
      where: { hub: null },
      include: { shopeeAccount: true, hub: true },
    });
    // Semua Meta yang punya spend — termasuk yang SUDAH punya tautan, karena
    // satu Meta bisa ditautkan ke beberapa tag Shopee.
    const metaCampaigns = await prisma.metaCampaign.findMany({
      where: { dailyStats: { some: { spendIDR: { gt: 0 } } } },
      include: { metaAdAccount: true, hubs: { include: { shopeeCampaign: true } } },
    });

    // === Deret aktivitas harian untuk sinyal data (lihat lib/matching-engine) ===
    // Kunci tanggal "yyyy-MM-dd" diambil dari ISO string — sesuai aturan
    // WIB-as-UTC, bagian tanggal ISO = tanggal kalender WIB.

    // Meta: hari-hari dengan spend > 0 per kampanye
    const metaDaily = await prisma.metaAdDaily.findMany({
      where: {
        metaCampaignId: { in: metaCampaigns.map((m) => m.id) },
        spendIDR: { gt: 0 },
      },
      select: { metaCampaignId: true, date: true, uniqueLinkClicks: true },
    });
    const metaSeries = new Map<number, DailySeries>();
    for (const row of metaDaily) {
      const day = row.date.toISOString().slice(0, 10);
      let s = metaSeries.get(row.metaCampaignId);
      if (!s) metaSeries.set(row.metaCampaignId, (s = new Map()));
      s.set(day, (s.get(day) || 0) + Math.max(1, row.uniqueLinkClicks));
    }

    // Shopee: jumlah item pesanan per tanggal klik (exclude Dibatalkan)
    const orderRows = await prisma.shopeeOrderItem.findMany({
      where: {
        shopeeCampaignId: { in: shopeeCampaigns.map((s) => s.id) },
        clickTimeUTC: { not: null },
        statusPesanan: { not: "Dibatalkan" },
      },
      select: { shopeeCampaignId: true, clickTimeUTC: true },
    });
    const orderSeries = new Map<number, DailySeries>();
    for (const row of orderRows) {
      const day = row.clickTimeUTC!.toISOString().slice(0, 10);
      let s = orderSeries.get(row.shopeeCampaignId!);
      if (!s) orderSeries.set(row.shopeeCampaignId!, (s = new Map()));
      s.set(day, (s.get(day) || 0) + 1);
    }

    // Batas data pesanan yang tersedia (global, bukan hanya yang unmapped)
    const lastOrder = await prisma.shopeeOrderItem.aggregate({
      _max: { clickTimeUTC: true },
    });
    const maxOrderDate = lastOrder._max.clickTimeUTC
      ? lastOrder._max.clickTimeUTC.toISOString().slice(0, 10)
      : null;

    const suggestions = suggestConnections(
      metaCampaigns,
      shopeeCampaigns,
      metaSeries,
      orderSeries,
      maxOrderDate,
    );

    return NextResponse.json({ suggestions, shopeeCampaigns, metaCampaigns });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("CampaignHub POST error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
