import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { spendWithPpn } from "@/lib/utils";

function parseDateUtc(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// Gabung gte/lte jadi SATU objek filter (dua spread key sama saling menimpa).
function dateRange(fromDate: string | null, toDate: string | null) {
  if (!fromDate && !toDate) return undefined;
  return {
    ...(fromDate ? { gte: parseDateUtc(fromDate) } : {}),
    ...(toDate ? { lte: parseDateUtc(toDate) } : {}),
  };
}

interface PlacementAcc {
  spend: number; // sudah termasuk PPN
  impressions: number;
  reach: number;
  metaClicks: number;
  shopClicks: number;
  results: number;
  landingPageViews: number;
  campaignIds: Set<number>;
}

function emptyAcc(): PlacementAcc {
  return {
    spend: 0,
    impressions: 0,
    reach: 0,
    metaClicks: 0,
    shopClicks: 0,
    results: 0,
    landingPageViews: 0,
    campaignIds: new Set(),
  };
}

// Performa per Penempatan (metrik iklan Meta saja — komisi Shopee tak punya
// dimensi penempatan). Grain data (kampanye, tanggal, platform, penempatan,
// perangkat) dikelompokkan per Penempatan; Platform & Perangkat jadi filter.
// PPN 11% diterapkan saat baca; metrik per-unit (CPC/CPM/cost-per-result)
// dihitung ulang dari spend ber-PPN yang sudah dijumlah.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const fromDate = url.searchParams.get("from");
  const toDate = url.searchParams.get("to");
  const metaAdAccountId = url.searchParams.get("metaAdAccountId")
    ? parseInt(url.searchParams.get("metaAdAccountId")!)
    : undefined;
  const campaignQuery = url.searchParams.get("campaign")?.trim().toLowerCase() || "";
  const deliveryFilter = url.searchParams.get("delivery") || "";
  const platformFilter = url.searchParams.get("platform") || "";
  const deviceFilter = url.searchParams.get("device") || "";

  const dateFilter = dateRange(fromDate, toDate);

  const stats = await prisma.metaAdPlacement.findMany({
    where: {
      ...(dateFilter ? { date: dateFilter } : {}),
      ...(platformFilter ? { platform: platformFilter } : {}),
      ...(deviceFilter ? { devicePlatform: deviceFilter } : {}),
      metaCampaign: {
        ...(metaAdAccountId ? { metaAdAccountId } : {}),
        ...(campaignQuery ? { name: campaignQuery } : {}),
        ...(deliveryFilter ? { status: deliveryFilter } : {}),
      },
    },
    include: { metaCampaign: true },
  });

  const acc = new Map<string, PlacementAcc>();
  const getAcc = (placement: string): PlacementAcc => {
    let a = acc.get(placement);
    if (!a) {
      a = emptyAcc();
      acc.set(placement, a);
    }
    return a;
  };

  for (const d of stats) {
    const a = getAcc(d.placement);
    a.spend += spendWithPpn(d.spendIDR); // biaya iklan riil (termasuk PPN 11%)
    a.impressions += d.impressions;
    a.reach += d.reach;
    a.metaClicks += d.uniqueLinkClicks;
    a.shopClicks += d.shopClicks;
    a.results += d.results;
    a.landingPageViews += d.landingPageViews;
    if (d.spendIDR > 0) a.campaignIds.add(d.metaCampaignId);
  }

  const rows = [...acc.entries()]
    .map(([placement, a]) => ({
      placement,
      campaigns: a.campaignIds.size,
      spend: a.spend,
      impressions: a.impressions,
      reach: a.reach,
      metaClicks: a.metaClicks,
      shopClicks: a.shopClicks,
      results: a.results,
      landingPageViews: a.landingPageViews,
      ctr: a.impressions > 0 ? a.metaClicks / a.impressions : 0,
      cpc: a.metaClicks > 0 ? a.spend / a.metaClicks : 0,
      cpm: a.impressions > 0 ? (a.spend / a.impressions) * 1000 : 0,
      costPerResult: a.results > 0 ? a.spend / a.results : 0,
    }))
    .sort((a, b) => b.spend - a.spend);

  const totals = {
    spend: rows.reduce((s, r) => s + r.spend, 0),
    impressions: rows.reduce((s, r) => s + r.impressions, 0),
    metaClicks: rows.reduce((s, r) => s + r.metaClicks, 0),
    shopClicks: rows.reduce((s, r) => s + r.shopClicks, 0),
    results: rows.reduce((s, r) => s + r.results, 0),
    landingPageViews: rows.reduce((s, r) => s + r.landingPageViews, 0),
  };

  // Opsi dropdown dari SEMUA data (sebelum filter) agar list tetap lengkap.
  const [platformRows, deviceRows, deliveryRows, campaignRows] = await Promise.all([
    prisma.metaAdPlacement.findMany({
      where: { platform: { not: "" } },
      distinct: ["platform"],
      select: { platform: true },
      orderBy: { platform: "asc" },
    }),
    prisma.metaAdPlacement.findMany({
      where: { devicePlatform: { not: "" } },
      distinct: ["devicePlatform"],
      select: { devicePlatform: true },
      orderBy: { devicePlatform: "asc" },
    }),
    prisma.metaCampaign.findMany({
      where: { status: { not: "" }, placementStats: { some: {} } },
      distinct: ["status"],
      select: { status: true },
    }),
    prisma.metaCampaign.findMany({
      where: { placementStats: { some: {} } },
      distinct: ["name"],
      select: { name: true },
      orderBy: { name: "asc" },
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
    platforms: platformRows.map((r) => r.platform),
    devices: deviceRows.map((r) => r.devicePlatform),
    deliveries,
    campaignOptions: campaignRows.map((r) => r.name),
  });
}
