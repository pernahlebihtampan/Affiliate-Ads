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
  // Filter opsional: substring nama kampanye Meta (case-insensitive) & wilayah Meta.
  // Data Shopee tidak punya dimensi wilayah (CSV komisi tanpa kolom wilayah;
  // "Wilayah Klik" = negara). Saat filter wilayah aktif, metrik Shopee
  // di-PRORATA per (kampanye, tanggal klik) mengikuti porsi spend wilayah:
  //   komisi_wilayah ≈ komisi × spend_wilayah / spend_total  → ESTIMASI.
  const campaignQuery = url.searchParams.get("campaign")?.trim().toLowerCase() || "";
  const region = url.searchParams.get("region") || "";
  // Filter sisi Shopee: substring Tag_link1 (eksklusif dengan `campaign` — UI
  // yang menjaga), plus filter exact level-item pesanan.
  const tagQuery = url.searchParams.get("tag")?.trim().toLowerCase() || "";
  const statusFilter = url.searchParams.get("status") || "";
  const l1Filter = url.searchParams.get("l1") || "";
  const l3Filter = url.searchParams.get("l3") || "";
  const platformFilter = url.searchParams.get("platform") || "";

  const dateFilter = dateRange(fromDate, toDate);
  const clickFilter = clickRange(fromDate, toDate);

  // Filter level-item Shopee. statusPesanan HARUS satu key (aturan spread di
  // atas): filter status menggantikan { not: "Dibatalkan" } — termasuk saat
  // user sengaja memilih "Dibatalkan" untuk meninjau pesanan batal.
  const itemWhere = {
    statusPesanan: statusFilter || { not: "Dibatalkan" },
    ...(l1Filter ? { l1Kategori: l1Filter } : {}),
    // L3 dari input bebas (datalist) → substring, bukan exact
    ...(l3Filter ? { l3Kategori: { contains: l3Filter } } : {}),
    ...(platformFilter ? { platform: platformFilter } : {}),
    ...(clickFilter ? { clickTimeUTC: clickFilter } : {}),
  };

  // Get all campaign hubs with their linked campaigns.
  // dailyStats TIDAK difilter wilayah di query — spend total per tanggal tetap
  // dibutuhkan sebagai penyebut rasio prorata; penyaringan wilayah di JS.
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
            where: itemWhere,
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

  // Filter by account / campaign name / tag Shopee if specified
  const filteredHubs = hubs.filter((hub) => {
    if (metaAdAccountId && hub.metaCampaign.metaAdAccountId !== metaAdAccountId) return false;
    if (shopeeAccountId && hub.shopeeCampaign.shopeeAccountId !== shopeeAccountId) return false;
    if (campaignQuery && !hub.metaCampaign.name.toLowerCase().includes(campaignQuery)) return false;
    if (tagQuery && !hub.shopeeCampaign.name.toLowerCase().includes(tagQuery)) return false;
    return true;
  });

  const rows = filteredHubs.map((hub) => {
    const allStats = hub.metaCampaign.dailyStats;
    const dailyStats = region ? allStats.filter((d) => d.region === region) : allStats;
    const orderItems = hub.shopeeCampaign.orderItems;
    const clicks = hub.shopeeCampaign.clicks;

    // Rasio prorata per tanggal: porsi spend wilayah terhadap spend total
    // kampanye ini. null = filter wilayah tidak aktif (rasio 1).
    // Hari tanpa spend / klik tanpa tanggal memakai fallback rasio level
    // periode — supaya Σ komisi semua wilayah = komisi total (tidak ada
    // komisi yang "hilang" hanya karena jatuh di hari jeda iklan).
    let ratioByDate: Map<string, number> | null = null;
    let periodRatio = 0;
    if (region) {
      const regionSpend = new Map<string, number>();
      const totalSpendByDate = new Map<string, number>();
      let regionSum = 0;
      let totalSum = 0;
      for (const d of allStats) {
        const k = d.date.toISOString().slice(0, 10);
        totalSpendByDate.set(k, (totalSpendByDate.get(k) || 0) + d.spendIDR);
        totalSum += d.spendIDR;
        if (d.region === region) {
          regionSpend.set(k, (regionSpend.get(k) || 0) + d.spendIDR);
          regionSum += d.spendIDR;
        }
      }
      periodRatio = totalSum > 0 ? regionSum / totalSum : 0;
      ratioByDate = new Map();
      for (const [k, tot] of totalSpendByDate) {
        if (tot > 0) ratioByDate.set(k, (regionSpend.get(k) || 0) / tot);
      }
    }
    const ratioFor = (dt: Date | null): number => {
      if (!ratioByDate) return 1;
      if (!dt) return periodRatio;
      return ratioByDate.get(dt.toISOString().slice(0, 10)) ?? periodRatio;
    };

    const totalSpend = dailyStats.reduce((s, d) => s + d.spendIDR, 0);
    const totalImpressions = dailyStats.reduce((s, d) => s + d.impressions, 0);
    const totalUniqueClicks = dailyStats.reduce((s, d) => s + d.uniqueLinkClicks, 0);

    // Pesanan unik: prorata per pesanan berdasar tanggal klik item pertamanya
    const orderClickTime = new Map<string, Date | null>();
    for (const o of orderItems) {
      if (!orderClickTime.has(o.idPemesanan)) orderClickTime.set(o.idPemesanan, o.clickTimeUTC);
    }
    const totalOrders = Math.round(
      [...orderClickTime.values()].reduce((s, t) => s + ratioFor(t), 0)
    );
    const totalItems = Math.round(
      orderItems.reduce((s, o) => s + ratioFor(o.clickTimeUTC), 0)
    );
    const totalNilaiPembelian = orderItems.reduce(
      (s, o) => s + o.nilaiPembelianRp * ratioFor(o.clickTimeUTC), 0
    );

    // Split komisi by status (× rasio prorata wilayah)
    const komisiTertunda = orderItems
      .filter((o) => o.statusPesanan === "Tertunda")
      .reduce((s, o) => s + o.komisiBersihRp * ratioFor(o.clickTimeUTC), 0);
    const komisiSelesai = orderItems
      .filter((o) => o.statusPesanan === "Selesai")
      .reduce((s, o) => s + o.komisiBersihRp * ratioFor(o.clickTimeUTC), 0);
    const totalKomisi = komisiTertunda + komisiSelesai;

    const shopeeClicks = Math.round(
      clicks.reduce((s, c) => s + ratioFor(c.clickTimeUTC), 0)
    );

    return {
      metaCampaignId: hub.metaCampaign.id,
      metaCampaignName: hub.metaCampaign.name,
      // "Penayangan kampanye" terkini (active/inactive/archived) — di-update
      // tiap import Meta
      metaCampaignStatus: hub.metaCampaign.status,
      metaAccountName: hub.metaCampaign.metaAdAccount.name,
      shopeeCampaignId: hub.shopeeCampaign.id,
      shopeeCampaignName: hub.shopeeCampaign.name,
      shopeeAccountName: hub.shopeeCampaign.shopeeAccount.name,
      spend: totalSpend,
      impressions: totalImpressions,
      metaClicks: totalUniqueClicks,
      shopeeClicks,
      orders: totalOrders,
      items: totalItems,
      nilaiPembelian: totalNilaiPembelian,
      komisiTertunda,
      komisiSelesai,
      totalKomisi,
      roas: totalSpend > 0 ? totalKomisi / totalSpend : 0,
      cpc: totalUniqueClicks > 0 ? totalSpend / totalUniqueClicks : 0,
      epc: shopeeClicks > 0 ? totalKomisi / shopeeClicks : 0,
      cr: shopeeClicks > 0 ? totalOrders / shopeeClicks : 0,
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

  // Get unmapped (organic) data — filter level-item ikut diterapkan;
  // filter campaign/tag tidak (organik = tanpa kampanye)
  const organicStats = await getOrganicStats(shopeeAccountId, fromDate ?? undefined, toDate ?? undefined, {
    status: statusFilter, l1: l1Filter, l3: l3Filter, platform: platformFilter,
  });

  // Daftar nilai untuk dropdown filter ("" = nilai kosong, dikecualikan).
  // "Dibatalkan" ikut ditawarkan — memilihnya sengaja menembus aturan exclude
  // untuk meninjau pesanan batal (komisiBersihRp-nya 0; lihat seri estimasi
  // komisi dibatalkan di grafik harian).
  const [regionRows, statusRows, l1Rows, l3Rows, platformRows] = await Promise.all([
    prisma.metaAdDaily.findMany({
      where: { region: { not: "" } },
      distinct: ["region"], select: { region: true }, orderBy: { region: "asc" },
    }),
    prisma.shopeeOrderItem.findMany({
      where: { statusPesanan: { not: "" } },
      distinct: ["statusPesanan"], select: { statusPesanan: true }, orderBy: { statusPesanan: "asc" },
    }),
    prisma.shopeeOrderItem.findMany({
      where: { l1Kategori: { not: "" } },
      distinct: ["l1Kategori"], select: { l1Kategori: true }, orderBy: { l1Kategori: "asc" },
    }),
    prisma.shopeeOrderItem.findMany({
      where: { l3Kategori: { not: "" } },
      distinct: ["l3Kategori"], select: { l3Kategori: true }, orderBy: { l3Kategori: "asc" },
    }),
    prisma.shopeeOrderItem.findMany({
      where: { platform: { not: "" } },
      distinct: ["platform"], select: { platform: true }, orderBy: { platform: "asc" },
    }),
  ]);
  const regions = regionRows.map((r) => r.region);

  // estimated: metrik Shopee (komisi/pesanan/klik) adalah hasil prorata wilayah
  return NextResponse.json({
    rows, totals, organicStats, regions,
    statuses: statusRows.map((r) => r.statusPesanan),
    l1Categories: l1Rows.map((r) => r.l1Kategori),
    l3Categories: l3Rows.map((r) => r.l3Kategori),
    platforms: platformRows.map((r) => r.platform),
    estimated: !!region,
  });
}

async function getOrganicStats(
  shopeeAccountId: number | undefined,
  fromDate: string | undefined,
  toDate: string | undefined,
  itemFilters: { status: string; l1: string; l3: string; platform: string }
) {
  const clickFilter = clickRange(fromDate ?? null, toDate ?? null);

  const orderItems = await prisma.shopeeOrderItem.findMany({
    where: {
      shopeeCampaignId: null,
      statusPesanan: itemFilters.status || { not: "Dibatalkan" },
      ...(itemFilters.l1 ? { l1Kategori: itemFilters.l1 } : {}),
      ...(itemFilters.l3 ? { l3Kategori: { contains: itemFilters.l3 } } : {}),
      ...(itemFilters.platform ? { platform: itemFilters.platform } : {}),
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
