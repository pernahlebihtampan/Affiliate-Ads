import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseDateUtc(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function parseDateUtcEndOfDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
}

// Gabung gte/lte jadi SATU objek filter. Jangan pakai dua spread `{clickTimeUTC:{gte}}`
// dan `{clickTimeUTC:{lte}}` terpisah — key yang sama saling menimpa (lte menghapus gte),
// sehingga batas bawah rentang hilang.
function dateRange(fromDate: string | null, toDate: string | null) {
  if (!fromDate && !toDate) return undefined;
  return {
    ...(fromDate ? { gte: parseDateUtc(fromDate) } : {}),
    ...(toDate ? { lte: parseDateUtc(toDate) } : {}),
  };
}

// Untuk kolom bertimestamp (clickTimeUTC), batas atas pakai akhir-hari.
function clickRange(fromDate: string | null, toDate: string | null) {
  if (!fromDate && !toDate) return undefined;
  return {
    ...(fromDate ? { gte: parseDateUtc(fromDate) } : {}),
    ...(toDate ? { lte: parseDateUtcEndOfDay(toDate) } : {}),
  };
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const fromDate = url.searchParams.get("from");
  const toDate = url.searchParams.get("to");
  const shopeeAccountId = url.searchParams.get("shopeeAccountId")
    ? parseInt(url.searchParams.get("shopeeAccountId")!)
    : undefined;
  const metaAdAccountId = url.searchParams.get("metaAdAccountId")
    ? parseInt(url.searchParams.get("metaAdAccountId")!)
    : undefined;

  const dateFilter = dateRange(fromDate, toDate);
  const clickFilter = clickRange(fromDate, toDate);

  // Get all campaign hubs with their linked campaigns
  const hubs = await prisma.campaignHub.findMany({
    include: {
      metaCampaign: {
        include: {
          metaAdAccount: true,
          dailyStats: {
            where: {
              ...(dateFilter ? { date: dateFilter } : {}),
            },
          },
        },
      },
      shopeeCampaign: {
        include: {
          shopeeAccount: true,
          orderItems: {
            where: {
              statusPesanan: { not: "Dibatalkan" },
              ...(clickFilter ? { clickTimeUTC: clickFilter } : {}),
            },
          },
          clicks: {
            where: {
              ...(clickFilter ? { clickTimeUTC: clickFilter } : {}),
            },
          },
        },
      },
    },
  });

  // Filter by account if specified
  const filteredHubs = hubs.filter((hub) => {
    if (metaAdAccountId && hub.metaCampaign.metaAdAccountId !== metaAdAccountId) return false;
    if (shopeeAccountId && hub.shopeeCampaign.shopeeAccountId !== shopeeAccountId) return false;
    return true;
  });

  const rows = filteredHubs.map((hub) => {
    const dailyStats = hub.metaCampaign.dailyStats;
    const orderItems = hub.shopeeCampaign.orderItems;
    const clicks = hub.shopeeCampaign.clicks;

    const totalSpend = dailyStats.reduce((s, d) => s + d.spendIDR, 0);
    const totalImpressions = dailyStats.reduce((s, d) => s + d.impressions, 0);
    const totalUniqueClicks = dailyStats.reduce((s, d) => s + d.uniqueLinkClicks, 0);
    const totalOrders = new Set(orderItems.map((o) => o.idPemesanan)).size;
    const totalItems = orderItems.length;
    const totalNilaiPembelian = orderItems.reduce((s, o) => s + o.nilaiPembelianRp, 0);

    // Split komisi by status
    const komisiTertunda = orderItems
      .filter((o) => o.statusPesanan === "Tertunda")
      .reduce((s, o) => s + o.komisiBersihRp, 0);
    const komisiSelesai = orderItems
      .filter((o) => o.statusPesanan === "Selesai")
      .reduce((s, o) => s + o.komisiBersihRp, 0);
    const totalKomisi = komisiTertunda + komisiSelesai;

    return {
      metaCampaignId: hub.metaCampaign.id,
      metaCampaignName: hub.metaCampaign.name,
      metaAccountName: hub.metaCampaign.metaAdAccount.name,
      shopeeCampaignId: hub.shopeeCampaign.id,
      shopeeCampaignName: hub.shopeeCampaign.name,
      shopeeAccountName: hub.shopeeCampaign.shopeeAccount.name,
      spend: totalSpend,
      impressions: totalImpressions,
      metaClicks: totalUniqueClicks,
      shopeeClicks: clicks.length,
      orders: totalOrders,
      items: totalItems,
      nilaiPembelian: totalNilaiPembelian,
      komisiTertunda,
      komisiSelesai,
      totalKomisi,
      roas: totalSpend > 0 ? totalKomisi / totalSpend : 0,
      cpc: totalUniqueClicks > 0 ? totalSpend / totalUniqueClicks : 0,
      epc: clicks.length > 0 ? totalKomisi / clicks.length : 0,
      cr: clicks.length > 0 ? totalOrders / clicks.length : 0,
    };
  });

  // Calculate totals
  const totals = {
    spend: rows.reduce((s, r) => s + r.spend, 0),
    impressions: rows.reduce((s, r) => s + r.impressions, 0),
    metaClicks: rows.reduce((s, r) => s + r.metaClicks, 0),
    shopeeClicks: rows.reduce((s, r) => s + r.shopeeClicks, 0),
    orders: rows.reduce((s, r) => s + r.orders, 0),
    items: rows.reduce((s, r) => s + r.items, 0),
    nilaiPembelian: rows.reduce((s, r) => s + r.nilaiPembelian, 0),
    komisiTertunda: rows.reduce((s, r) => s + r.komisiTertunda, 0),
    komisiSelesai: rows.reduce((s, r) => s + r.komisiSelesai, 0),
    totalKomisi: rows.reduce((s, r) => s + r.totalKomisi, 0),
    roas: 0,
  };
  totals.roas = totals.spend > 0 ? totals.totalKomisi / totals.spend : 0;

  // Get unmapped (organic) data
  const organicStats = await getOrganicStats(shopeeAccountId, fromDate ?? undefined, toDate ?? undefined);

  return NextResponse.json({ rows, totals, organicStats });
}

async function getOrganicStats(
  shopeeAccountId?: number,
  fromDate?: string,
  toDate?: string
) {
  const clickFilter = clickRange(fromDate ?? null, toDate ?? null);

  const orderItems = await prisma.shopeeOrderItem.findMany({
    where: {
      shopeeCampaignId: null,
      statusPesanan: { not: "Dibatalkan" },
      ...(shopeeAccountId ? { shopeeAccountId } : {}),
      ...(clickFilter ? { clickTimeUTC: clickFilter } : {}),
    },
  });

  const clicks = await prisma.shopeeClick.findMany({
    where: {
      shopeeCampaignId: null,
      ...(shopeeAccountId ? { shopeeAccountId } : {}),
      ...(clickFilter ? { clickTimeUTC: clickFilter } : {}),
    },
  });

  const komisiTertunda = orderItems
    .filter((o) => o.statusPesanan === "Tertunda")
    .reduce((s, o) => s + o.komisiBersihRp, 0);
  const komisiSelesai = orderItems
    .filter((o) => o.statusPesanan === "Selesai")
    .reduce((s, o) => s + o.komisiBersihRp, 0);

  return {
    shopeeClicks: clicks.length,
    orders: new Set(orderItems.map((o) => o.idPemesanan)).size,
    items: orderItems.length,
    nilaiPembelian: orderItems.reduce((s, o) => s + o.nilaiPembelianRp, 0),
    komisiTertunda,
    komisiSelesai,
    totalKomisi: komisiTertunda + komisiSelesai,
  };
}
