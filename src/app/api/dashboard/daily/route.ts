import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseDateUtc(dateStr: string): Date {
  // Parse YYYY-MM-DD sebagai UTC agar konsisten dengan DateTime di database
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function parseDateUtcEndOfDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
}

// Gabung gte/lte jadi SATU objek filter — dua spread dengan key sama saling menimpa
// sehingga batas bawah rentang (from) hilang.
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

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const fromDate = url.searchParams.get("from");
  const toDate = url.searchParams.get("to");
  // Filter opsional — sama dengan /api/dashboard agar grafik konsisten dengan
  // tabel. Saat filter wilayah aktif, komisi Shopee di-PRORATA per (kampanye,
  // tanggal klik) mengikuti porsi spend wilayah (estimasi — data Shopee tidak
  // punya dimensi wilayah). dailyStats tidak difilter wilayah di query karena
  // spend total dibutuhkan sebagai penyebut rasio.
  const campaignQuery = url.searchParams.get("campaign")?.trim().toLowerCase() || "";
  const region = url.searchParams.get("region") || "";
  // Filter sisi Shopee — sama dengan /api/dashboard
  const tagQuery = url.searchParams.get("tag")?.trim().toLowerCase() || "";
  const statusFilter = url.searchParams.get("status") || "";
  const l1Filter = url.searchParams.get("l1") || "";
  const l3Filter = url.searchParams.get("l3") || "";
  const platformFilter = url.searchParams.get("platform") || "";

  const dateFilter = dateRange(fromDate, toDate);
  const clickFilter = clickRange(fromDate, toDate);

  // Status TIDAK difilter di query — item Dibatalkan tetap diambil untuk seri
  // estimasi komisi dibatalkan (bar abu-abu); pemisahan status di JS.
  const itemWhere = {
    ...(l1Filter ? { l1Kategori: l1Filter } : {}),
    // L3 dari input bebas (datalist) → substring, bukan exact
    ...(l3Filter ? { l3Kategori: { contains: l3Filter } } : {}),
    ...(platformFilter ? { platform: platformFilter } : {}),
    ...(clickFilter ? { clickTimeUTC: clickFilter } : {}),
  };

  // Dapatkan semua campaign hubs yang ter-mapping
  const allHubs = await prisma.campaignHub.findMany({
    include: {
      metaCampaign: {
        include: {
          dailyStats: {
            where: {
              ...(dateFilter ? { date: dateFilter } : {}),
            },
          },
        },
      },
      shopeeCampaign: {
        include: {
          orderItems: {
            where: itemWhere,
          },
        },
      },
    },
  });

  const hubs = allHubs.filter((h) => {
    // Exact match case-insensitive — nilai dikirim UI dari pilihan dropdown
    if (campaignQuery && h.metaCampaign.name.toLowerCase() !== campaignQuery) return false;
    if (tagQuery && h.shopeeCampaign.name.toLowerCase() !== tagQuery) return false;
    return true;
  });

  // Kumpulkan spend per tanggal dari MetaAdDaily (hanya wilayah terpilih bila
  // filter aktif), sekaligus rasio prorata per (hub, tanggal) untuk komisi.
  const spendMap = new Map<string, number>();
  const ratioByHubDate = region ? new Map<number, Map<string, number>>() : null;
  // Fallback rasio level periode per hub — dipakai untuk tanggal tanpa spend
  // agar komisi hari jeda iklan tetap terdistribusi (konsisten /api/dashboard)
  const periodRatioByHub = new Map<number, number>();
  for (const hub of hubs) {
    const regionSpend = new Map<string, number>();
    const totalSpend = new Map<string, number>();
    let regionSum = 0;
    let totalSum = 0;
    for (const stat of hub.metaCampaign.dailyStats) {
      const dateKey = stat.date.toISOString().split("T")[0];
      if (region) {
        totalSpend.set(dateKey, (totalSpend.get(dateKey) || 0) + stat.spendIDR);
        totalSum += stat.spendIDR;
        if (stat.region !== region) continue;
        regionSpend.set(dateKey, (regionSpend.get(dateKey) || 0) + stat.spendIDR);
        regionSum += stat.spendIDR;
      }
      spendMap.set(dateKey, (spendMap.get(dateKey) || 0) + stat.spendIDR);
    }
    if (ratioByHubDate) {
      const ratios = new Map<string, number>();
      for (const [k, tot] of totalSpend) {
        if (tot > 0) ratios.set(k, (regionSpend.get(k) || 0) / tot);
      }
      ratioByHubDate.set(hub.metaCampaignId, ratios);
      periodRatioByHub.set(hub.metaCampaignId, totalSum > 0 ? regionSum / totalSum : 0);
    }
  }

  // Kumpulkan komisi per tanggal dari ShopeeOrderItem (clickTimeUTC),
  // dikalikan rasio prorata wilayah bila filter aktif.
  // Item Dibatalkan masuk seri terpisah: estimasi komisi yang hilang
  // (komisiBersihRp-nya 0) = hargaRp × (pctShopee + pctXtra) / 100.
  const komisiMap = new Map<string, number>();
  const komisiSelesaiMap = new Map<string, number>();
  const komisiBatalMap = new Map<string, number>();
  for (const hub of hubs) {
    const ratios = ratioByHubDate?.get(hub.metaCampaignId);
    const periodRatio = periodRatioByHub.get(hub.metaCampaignId) ?? 0;
    for (const item of hub.shopeeCampaign.orderItems) {
      if (!item.clickTimeUTC) continue;
      const dateKey = item.clickTimeUTC.toISOString().split("T")[0];
      const ratio = ratioByHubDate ? ratios?.get(dateKey) ?? periodRatio : 1;
      if (ratio === 0) continue;
      if (item.statusPesanan === "Dibatalkan") {
        const estimasi =
          (item.hargaRp * (item.komisiShopeePct + item.komisiXtraPct)) / 100;
        komisiBatalMap.set(
          dateKey,
          (komisiBatalMap.get(dateKey) || 0) + estimasi * ratio
        );
        continue;
      }
      // Seri komisi mengikuti filter status (Dibatalkan sudah tersaring di atas)
      if (statusFilter && item.statusPesanan !== statusFilter) continue;
      const komisi = item.komisiBersihRp * ratio;
      komisiMap.set(dateKey, (komisiMap.get(dateKey) || 0) + komisi);
      if (item.statusPesanan === "Selesai") {
        komisiSelesaiMap.set(
          dateKey,
          (komisiSelesaiMap.get(dateKey) || 0) + komisi
        );
      }
    }
  }

  // Tentukan rentang tanggal penuh dari filter yang dipilih
  let startDate: Date, endDate: Date;
  if (fromDate) {
    startDate = parseDateUtc(fromDate);
  } else {
    const allDates = [...spendMap.keys(), ...komisiMap.keys()].sort();
    startDate = allDates.length > 0 ? new Date(allDates[0] + "T00:00:00Z") : new Date();
    startDate.setUTCDate(startDate.getUTCDate() - 30);
  }

  if (toDate) {
    endDate = parseDateUtc(toDate);
  } else {
    endDate = new Date();
  }

  // Generate seluruh rentang tanggal (termasuk tanggal tanpa data)
  const dailyData: {
    date: string;
    komisi: number;
    spend: number;
    profit: number;
    profitSelesai: number;
    komisiDibatalkan: number;
  }[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    const dateKey = current.toISOString().split("T")[0];
    const komisi = komisiMap.get(dateKey) || 0;
    const komisiSelesai = komisiSelesaiMap.get(dateKey) || 0;
    const spend = spendMap.get(dateKey) || 0;
    dailyData.push({
      date: dateKey,
      komisi,
      spend,
      profit: komisi - spend,
      profitSelesai: komisiSelesai - spend,
      komisiDibatalkan: komisiBatalMap.get(dateKey) || 0,
    });
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return NextResponse.json(dailyData);
}

