import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { spendWithPpn } from "@/lib/utils";

function parseDateUtc(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function parseDateUtcEndOfDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
}

// Gabung gte/lte jadi SATU objek filter (lihat catatan di /api/dashboard —
// dua spread dengan key sama saling menimpa).
function dateRange(fromDate: string | null, toDate: string | null) {
  if (!fromDate && !toDate) return undefined;
  return {
    ...(fromDate ? { gte: parseDateUtc(fromDate) } : {}),
    ...(toDate ? { lte: parseDateUtc(toDate) } : {}),
  };
}

function clickRange(fromDate: string | null, toDate: string | null) {
  if (!fromDate && !toDate) return undefined;
  return {
    ...(fromDate ? { gte: parseDateUtc(fromDate) } : {}),
    ...(toDate ? { lte: parseDateUtcEndOfDay(toDate) } : {}),
  };
}

interface RegionAcc {
  spend: number;
  impressions: number;
  metaClicks: number;
  shopClicks: number;
  landingPageViews: number;
  komisiTertunda: number;
  komisiSelesai: number;
  orders: number; // fraksional (hasil prorata), dibulatkan di akhir
  campaignIds: Set<number>;
}

function emptyAcc(): RegionAcc {
  return {
    spend: 0,
    impressions: 0,
    metaClicks: 0,
    shopClicks: 0,
    landingPageViews: 0,
    komisiTertunda: 0,
    komisiSelesai: 0,
    orders: 0,
    campaignIds: new Set(),
  };
}

// Performa per Wilayah Meta. Komisi Shopee TIDAK punya dimensi wilayah, jadi
// komisi tiap (kampanye, tanggal klik) di-PRORATA ke wilayah mengikuti porsi
// spend wilayah pada tanggal itu. Sama seperti filter wilayah di /api/dashboard,
// tapi dihitung untuk SEMUA wilayah sekaligus. Hanya kampanye yang sudah
// tertaut di Campaign Hub yang dihitung (tanpa tautan tidak ada komisi yang
// bisa diatribusikan).
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const fromDate = url.searchParams.get("from");
  const toDate = url.searchParams.get("to");
  const metaAdAccountId = url.searchParams.get("metaAdAccountId")
    ? parseInt(url.searchParams.get("metaAdAccountId")!)
    : undefined;
  const campaignQuery = url.searchParams.get("campaign")?.trim().toLowerCase() || "";
  const deliveryFilter = url.searchParams.get("delivery") || "";
  // Filter level-item Shopee (L1 kategori & platform) hanya menyaring sisi
  // komisi/pesanan; spend Meta tetap penuh (ROAS per wilayah turun, tapi
  // perbandingan antar-wilayah tetap bermakna)
  const l1Filter = url.searchParams.get("l1") || "";
  const platformFilter = url.searchParams.get("platform") || "";

  const dateFilter = dateRange(fromDate, toDate);
  const clickFilter = clickRange(fromDate, toDate);

  const hubs = await prisma.campaignHub.findMany({
    include: {
      metaCampaign: {
        include: {
          metaAdAccount: true,
          dailyStats: {
            where: { ...(dateFilter ? { date: dateFilter } : {}) },
          },
        },
      },
      shopeeCampaign: {
        include: {
          orderItems: {
            where: {
              statusPesanan: { not: "Dibatalkan" },
              ...(l1Filter ? { l1Kategori: l1Filter } : {}),
              ...(platformFilter ? { platform: platformFilter } : {}),
              ...(clickFilter ? { clickTimeUTC: clickFilter } : {}),
            },
          },
        },
      },
    },
  });

  // Opsi dropdown kampanye dari hub yang punya data di rentang terpilih,
  // SEBELUM filter akun/kampanye diterapkan agar list tetap lengkap.
  const campaignOptions = [
    ...new Set(
      hubs
        .filter(
          (h) =>
            h.metaCampaign.dailyStats.length > 0 ||
            h.shopeeCampaign.orderItems.length > 0
        )
        .map((h) => h.metaCampaign.name)
    ),
  ].sort((a, b) => a.localeCompare(b, "id-ID"));

  const filteredHubs = hubs.filter((hub) => {
    if (metaAdAccountId && hub.metaCampaign.metaAdAccountId !== metaAdAccountId) return false;
    if (campaignQuery && hub.metaCampaign.name.toLowerCase() !== campaignQuery) return false;
    if (deliveryFilter && hub.metaCampaign.status !== deliveryFilter) return false;
    return true;
  });

  const acc = new Map<string, RegionAcc>();
  const getAcc = (region: string): RegionAcc => {
    let a = acc.get(region);
    if (!a) {
      a = emptyAcc();
      acc.set(region, a);
    }
    return a;
  };
  // Komisi hub tanpa spend sama sekali di rentang tidak bisa diatribusikan
  // ke wilayah mana pun; dilaporkan terpisah supaya user tahu ada selisih
  // dengan total komisi dashboard.
  let komisiTanpaSpend = 0;

  for (const hub of filteredHubs) {
    const stats = hub.metaCampaign.dailyStats;
    const items = hub.shopeeCampaign.orderItems;
    if (stats.length === 0 && items.length === 0) continue;

    // Spend per (tanggal, wilayah) + agregat metrik Meta per wilayah
    const totalSpendByDate = new Map<string, number>();
    const regionSpendByDate = new Map<string, Map<string, number>>();
    const regionSpendSum = new Map<string, number>();
    let totalSum = 0;
    for (const d of stats) {
      const k = d.date.toISOString().slice(0, 10);
      totalSpendByDate.set(k, (totalSpendByDate.get(k) || 0) + d.spendIDR);
      totalSum += d.spendIDR;
      let byDate = regionSpendByDate.get(d.region);
      if (!byDate) {
        byDate = new Map();
        regionSpendByDate.set(d.region, byDate);
      }
      byDate.set(k, (byDate.get(k) || 0) + d.spendIDR);
      regionSpendSum.set(d.region, (regionSpendSum.get(d.region) || 0) + d.spendIDR);

      const a = getAcc(d.region);
      // spend termasuk PPN 11% (biaya iklan riil) → menular ke profit/roas/cpc.
      // regionSpendByDate/regionSpendSum di atas tetap mentah (rasio prorata,
      // faktor 1,11 saling meniadakan).
      a.spend += spendWithPpn(d.spendIDR);
      a.impressions += d.impressions;
      a.metaClicks += d.uniqueLinkClicks;
      a.shopClicks += d.shopClicks;
      a.landingPageViews += d.landingPageViews;
      if (d.spendIDR > 0) a.campaignIds.add(hub.metaCampaignId);
    }

    // Agregat komisi & pesanan per tanggal klik (null = klik tanpa tanggal)
    const byDate = new Map<
      string | null,
      { tertunda: number; selesai: number; orders: number }
    >();
    const dayOf = (t: Date | null) => (t ? t.toISOString().slice(0, 10) : null);
    const seenOrders = new Set<string>();
    for (const o of items) {
      const k = dayOf(o.clickTimeUTC);
      let day = byDate.get(k);
      if (!day) {
        day = { tertunda: 0, selesai: 0, orders: 0 };
        byDate.set(k, day);
      }
      if (o.statusPesanan === "Tertunda") day.tertunda += o.komisiBersihRp;
      else if (o.statusPesanan === "Selesai") day.selesai += o.komisiBersihRp;
      // Pesanan unik dihitung pada tanggal klik item PERTAMA-nya (konsisten
      // dengan /api/dashboard)
      if (!seenOrders.has(o.idPemesanan)) {
        seenOrders.add(o.idPemesanan);
        day.orders += 1;
      }
    }

    // Distribusikan tiap bucket tanggal ke wilayah sesuai porsi spend hari
    // itu; hari tanpa spend / klik tanpa tanggal memakai porsi level periode
    // supaya Σ semua wilayah = total komisi hub (tidak ada yang hilang).
    for (const [k, day] of byDate) {
      const dayTotal = k !== null ? totalSpendByDate.get(k) || 0 : 0;
      const usePeriod = dayTotal <= 0;
      if (usePeriod && totalSum <= 0) {
        komisiTanpaSpend += day.tertunda + day.selesai;
        continue;
      }
      for (const [region, spendMap] of regionSpendByDate) {
        const share = usePeriod
          ? (regionSpendSum.get(region) || 0) / totalSum
          : (spendMap.get(k as string) || 0) / dayTotal;
        if (share <= 0) continue;
        const a = getAcc(region);
        a.komisiTertunda += day.tertunda * share;
        a.komisiSelesai += day.selesai * share;
        a.orders += day.orders * share;
      }
    }
  }

  const rows = [...acc.entries()]
    .map(([region, a]) => {
      const totalKomisi = a.komisiTertunda + a.komisiSelesai;
      return {
        region,
        campaigns: a.campaignIds.size,
        spend: a.spend,
        impressions: a.impressions,
        metaClicks: a.metaClicks,
        shopClicks: a.shopClicks,
        landingPageViews: a.landingPageViews,
        orders: Math.round(a.orders),
        komisiTertunda: a.komisiTertunda,
        komisiSelesai: a.komisiSelesai,
        totalKomisi,
        profit: totalKomisi - a.spend,
        roas: a.spend > 0 ? totalKomisi / a.spend : 0,
        ctr: a.impressions > 0 ? a.metaClicks / a.impressions : 0,
        cpc: a.metaClicks > 0 ? a.spend / a.metaClicks : 0,
      };
    })
    .sort((a, b) => b.spend - a.spend);

  const totals = {
    spend: rows.reduce((s, r) => s + r.spend, 0),
    impressions: rows.reduce((s, r) => s + r.impressions, 0),
    metaClicks: rows.reduce((s, r) => s + r.metaClicks, 0),
    shopClicks: rows.reduce((s, r) => s + r.shopClicks, 0),
    orders: rows.reduce((s, r) => s + r.orders, 0),
    komisiTertunda: rows.reduce((s, r) => s + r.komisiTertunda, 0),
    komisiSelesai: rows.reduce((s, r) => s + r.komisiSelesai, 0),
    totalKomisi: rows.reduce((s, r) => s + r.totalKomisi, 0),
    profit: 0,
    roas: 0,
  };
  totals.profit = totals.totalKomisi - totals.spend;
  totals.roas = totals.spend > 0 ? totals.totalKomisi / totals.spend : 0;

  const [deliveryRows, l1Rows, platformRows] = await Promise.all([
    prisma.metaCampaign.findMany({
      where: { status: { not: "" } },
      distinct: ["status"],
      select: { status: true },
    }),
    prisma.shopeeOrderItem.findMany({
      where: { l1Kategori: { not: "" } },
      distinct: ["l1Kategori"],
      select: { l1Kategori: true },
      orderBy: { l1Kategori: "asc" },
    }),
    prisma.shopeeOrderItem.findMany({
      where: { platform: { not: "" } },
      distinct: ["platform"],
      select: { platform: true },
      orderBy: { platform: "asc" },
    }),
  ]);
  const DELIVERY_ORDER = ["active", "inactive", "archived"];
  const deliveries = deliveryRows
    .map((r) => r.status)
    .sort((a, b) => {
      const ia = DELIVERY_ORDER.indexOf(a);
      const ib = DELIVERY_ORDER.indexOf(b);
      return (ia === -1 ? DELIVERY_ORDER.length : ia) - (ib === -1 ? DELIVERY_ORDER.length : ib);
    });

  return NextResponse.json({
    rows,
    totals,
    campaignOptions,
    deliveries,
    l1Categories: l1Rows.map((r) => r.l1Kategori),
    platforms: platformRows.map((r) => r.platform),
    komisiTanpaSpend,
  });
}
