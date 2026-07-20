import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { spendWithPpn } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const type = url.searchParams.get("type");

  if (id && type) {
    if (type === "meta") {
      const campaign = await prisma.metaCampaign.findUnique({
        where: { id: parseInt(id) },
        include: {
          metaAdAccount: true,
          hubs: { include: { shopeeCampaign: true } },
          dailyStats: { orderBy: { date: "asc" } },
        },
      });

      if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

      // Grain MetaAdDaily kini per-wilayah → agregasikan per tanggal supaya
      // halaman detail tetap menampilkan satu baris per hari.
      const byDate = new Map<string, (typeof campaign.dailyStats)[number]>();
      for (const stat of campaign.dailyStats) {
        const key = stat.date.toISOString();
        const acc = byDate.get(key);
        if (!acc) {
          byDate.set(key, { ...stat, region: "" });
        } else {
          acc.spendIDR += stat.spendIDR;
          acc.impressions += stat.impressions;
          acc.reach += stat.reach;
          acc.uniqueLinkClicks += stat.uniqueLinkClicks;
          acc.results += stat.results;
          acc.shopClicks += stat.shopClicks;
          acc.allClicks += stat.allClicks;
          acc.landingPageViews += stat.landingPageViews;
        }
      }
      const aggregated = [...byDate.values()].map((s) => {
        // spend termasuk PPN 11% (biaya iklan riil) — dipakai untuk tampilan
        // spend harian & semua turunannya (cpc/cpm/cost per result)
        const spendIDR = spendWithPpn(s.spendIDR);
        return {
          ...s,
          spendIDR,
          frequency: s.reach > 0 ? s.impressions / s.reach : 0,
          cpc: s.uniqueLinkClicks > 0 ? spendIDR / s.uniqueLinkClicks : 0,
          ctr: s.impressions > 0 ? s.uniqueLinkClicks / s.impressions : 0,
          cpm: s.impressions > 0 ? (spendIDR / s.impressions) * 1000 : 0,
          costPerResult: s.results > 0 ? spendIDR / s.results : 0,
        };
      });

      // Get linked Shopee data — gabung SEMUA tag Shopee yang tertaut ke Meta
      // ini (1 Meta : banyak Shopee)
      const shopeeData =
        campaign.hubs.length > 0
          ? await getShopeeCampaignDetail(campaign.hubs.map((h) => h.shopeeCampaignId))
          : null;

      return NextResponse.json({
        campaign: { ...campaign, dailyStats: aggregated },
        shopeeData,
      });
    }

    if (type === "shopee") {
      const campaign = await prisma.shopeeCampaign.findUnique({
        where: { id: parseInt(id) },
        include: {
          shopeeAccount: true,
          hub: { include: { metaCampaign: true } },
        },
      });
      return NextResponse.json(campaign);
    }
  }

  // List all with stats summary
  const metaCampaigns = await prisma.metaCampaign.findMany({
    include: {
      metaAdAccount: true,
      hubs: { include: { shopeeCampaign: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(metaCampaigns);
}

async function getShopeeCampaignDetail(campaignIds: number[]) {
  const items = await prisma.shopeeOrderItem.findMany({
    where: { shopeeCampaignId: { in: campaignIds } },
    orderBy: { orderTimeUTC: "desc" },
    take: 50,
  });

  const clicks = await prisma.shopeeClick.findMany({
    where: { shopeeCampaignId: { in: campaignIds } },
    orderBy: { clickTimeUTC: "desc" },
    take: 100,
  });

  // Click hour histogram
  const hourBuckets: Record<number, number> = {};
  for (const click of clicks) {
    if (click.clickTimeUTC) {
      // clickTimeUTC menyimpan WIB-as-UTC → getUTCHours() = jam WIB (bukan jam server WITA).
      const hour = click.clickTimeUTC.getUTCHours();
      hourBuckets[hour] = (hourBuckets[hour] || 0) + 1;
    }
  }
  const clickHourHistogram = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    count: hourBuckets[i] || 0,
  }));

  // Product breakdown
  const productBreakdown: Record<string, { total: number; komisi: number; count: number }> = {};
  for (const item of items) {
    if (!productBreakdown[item.namaBarang]) {
      productBreakdown[item.namaBarang] = { total: 0, komisi: 0, count: 0 };
    }
    productBreakdown[item.namaBarang].total += item.nilaiPembelianRp;
    productBreakdown[item.namaBarang].komisi += item.komisiBersihRp;
    productBreakdown[item.namaBarang].count += item.jumlah;
  }

  // Store breakdown
  const storeBreakdown: Record<string, { total: number; komisi: number; count: number }> = {};
  for (const item of items) {
    if (!storeBreakdown[item.namaToko]) {
      storeBreakdown[item.namaToko] = { total: 0, komisi: 0, count: 0 };
    }
    storeBreakdown[item.namaToko].total += item.nilaiPembelianRp;
    storeBreakdown[item.namaToko].komisi += item.komisiBersihRp;
    storeBreakdown[item.namaToko].count += item.jumlah;
  }

  return {
    items,
    clicks,
    clickHourHistogram,
    productBreakdown: Object.entries(productBreakdown)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.komisi - a.komisi),
    storeBreakdown: Object.entries(storeBreakdown)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.komisi - a.komisi),
  };
}
