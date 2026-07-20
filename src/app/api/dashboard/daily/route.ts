import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { spendWithPpn } from "@/lib/utils";

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
  const shopeeAccountId = url.searchParams.get("shopeeAccountId")
    ? parseInt(url.searchParams.get("shopeeAccountId")!)
    : undefined;
  const metaAdAccountId = url.searchParams.get("metaAdAccountId")
    ? parseInt(url.searchParams.get("metaAdAccountId")!)
    : undefined;
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
  // Filter sisi Meta: "Penayangan kampanye" terkini — sama dengan /api/dashboard
  const deliveryFilter = url.searchParams.get("delivery") || "";

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
          clicks: {
            where: {
              ...(clickFilter ? { clickTimeUTC: clickFilter } : {}),
            },
          },
        },
      },
    },
  });

  // Pilihan tautan di UI: `unlinked=0` = hanya tertaut, `unlinked=only` =
  // hanya belum-tertaut (seri spend & komisi hub dikosongkan).
  const linkParam = url.searchParams.get("unlinked");
  const includeLinked = linkParam !== "only";
  const includeUnlinked = linkParam !== "0";

  const hubs = !includeLinked ? [] : allHubs.filter((h) => {
    if (metaAdAccountId && h.metaCampaign.metaAdAccountId !== metaAdAccountId) return false;
    if (shopeeAccountId && h.shopeeCampaign.shopeeAccountId !== shopeeAccountId) return false;
    // Exact match case-insensitive — nilai dikirim UI dari pilihan dropdown
    if (campaignQuery && h.metaCampaign.name.toLowerCase() !== campaignQuery) return false;
    if (tagQuery && h.shopeeCampaign.name.toLowerCase() !== tagQuery) return false;
    if (deliveryFilter && h.metaCampaign.status !== deliveryFilter) return false;
    return true;
  });

  // Kumpulkan spend per tanggal dari MetaAdDaily (hanya wilayah terpilih bila
  // filter aktif), sekaligus rasio prorata per (hub, tanggal) untuk komisi.
  const spendMap = new Map<string, number>();
  const ratioByHubDate = region ? new Map<number, Map<string, number>>() : null;
  // Fallback rasio level periode per Meta — dipakai untuk tanggal tanpa spend
  // agar komisi hari jeda iklan tetap terdistribusi (konsisten /api/dashboard)
  const periodRatioByHub = new Map<number, number>();
  // Spend & rasio dihitung per kampanye Meta UNIK (bukan per hub): beberapa
  // hub bisa berbagi Meta yang sama (1 Meta : banyak Shopee) dan dailyStats-nya
  // identik, sehingga menjumlah per hub akan menggandakan spend.
  const metaById = new Map<number, (typeof hubs)[number]["metaCampaign"]>();
  for (const hub of hubs) metaById.set(hub.metaCampaignId, hub.metaCampaign);
  for (const [metaCampaignId, metaCampaign] of metaById) {
    const regionSpend = new Map<string, number>();
    const totalSpend = new Map<string, number>();
    let regionSum = 0;
    let totalSum = 0;
    for (const stat of metaCampaign.dailyStats) {
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
      ratioByHubDate.set(metaCampaignId, ratios);
      periodRatioByHub.set(metaCampaignId, totalSum > 0 ? regionSum / totalSum : 0);
    }
  }

  // Kampanye Shopee belum-tertaut di Hub — komisinya ikut di seri grafik
  // (konsisten dengan baris terpisah di tabel /api/dashboard). Aturan skip
  // sama: sembunyikan bila filter sisi-Meta aktif (tak ada sisi Meta untuk
  // dicocokkan/diprorata) atau pilihan tautan "Tertaut" (`unlinked=0`); filter
  // tag exact match diterapkan.
  const showUnlinked =
    includeUnlinked && !metaAdAccountId && !campaignQuery && !region && !deliveryFilter;
  const unlinkedCampaigns = showUnlinked
    ? (
        await prisma.shopeeCampaign.findMany({
          where: {
            hub: null,
            ...(shopeeAccountId ? { shopeeAccountId } : {}),
          },
          include: {
            orderItems: { where: itemWhere },
            clicks: {
              where: {
                ...(clickFilter ? { clickTimeUTC: clickFilter } : {}),
              },
            },
          },
        })
      ).filter((c) => !tagQuery || c.name.toLowerCase() === tagQuery)
    : [];

  // Kumpulkan komisi per tanggal dari ShopeeOrderItem (clickTimeUTC),
  // dikalikan rasio prorata wilayah bila filter aktif.
  // Item Dibatalkan masuk seri terpisah: estimasi komisi yang hilang
  // (komisiBersihRp-nya 0) = hargaRp × (pctShopee + pctXtra) / 100.
  const komisiMap = new Map<string, number>();
  const komisiSelesaiMap = new Map<string, number>();
  const komisiBatalMap = new Map<string, number>();
  // Klik & pesanan per tanggal (prorata wilayah sama seperti komisi). Pesanan
  // = jumlah pesanan UNIK per tanggal klik (dedup idPemesanan, bobot = ratio
  // tanggal klik item pertamanya), mengikuti cara /api/dashboard menghitung
  // totalOrders. Klik dari ShopeeClick per clickTimeUTC.
  const klikMap = new Map<string, number>();
  const pesananMap = new Map<string, number>();
  // (items, clicks, ratios?, periodRatio) per sumber: hub pakai prorata wilayah;
  // belum-tertaut selalu rasio 1 (region aktif → sudah di-skip di atas).
  const itemSources = [
    ...hubs.map((hub) => ({
      items: hub.shopeeCampaign.orderItems,
      clicks: hub.shopeeCampaign.clicks,
      ratios: ratioByHubDate?.get(hub.metaCampaignId),
      periodRatio: periodRatioByHub.get(hub.metaCampaignId) ?? 0,
    })),
    ...unlinkedCampaigns.map((c) => ({
      items: c.orderItems,
      clicks: c.clicks,
      ratios: undefined,
      periodRatio: 1,
    })),
  ];
  const ratioForDate = (
    ratios: Map<string, number> | undefined,
    periodRatio: number,
    dateKey: string
  ): number => (ratioByHubDate ? ratios?.get(dateKey) ?? periodRatio : 1);
  for (const { items, clicks, ratios, periodRatio } of itemSources) {
    // Klik per tanggal
    for (const click of clicks) {
      if (!click.clickTimeUTC) continue;
      const dateKey = click.clickTimeUTC.toISOString().split("T")[0];
      const ratio = ratioForDate(ratios, periodRatio, dateKey);
      if (ratio === 0) continue;
      klikMap.set(dateKey, (klikMap.get(dateKey) || 0) + ratio);
    }
    // Pesanan unik per tanggal (dedup idPemesanan; pakai clickTimeUTC item
    // pertama pesanan itu). Semua status dihitung (Dibatalkan tetap pesanan).
    const seenOrders = new Map<string, Date | null>();
    for (const item of items) {
      if (!seenOrders.has(item.idPemesanan))
        seenOrders.set(item.idPemesanan, item.clickTimeUTC);
    }
    for (const clickTime of seenOrders.values()) {
      if (!clickTime) continue;
      const dateKey = clickTime.toISOString().split("T")[0];
      const ratio = ratioForDate(ratios, periodRatio, dateKey);
      if (ratio === 0) continue;
      pesananMap.set(dateKey, (pesananMap.get(dateKey) || 0) + ratio);
    }
    for (const item of items) {
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
    klik: number;
    pesanan: number;
  }[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    const dateKey = current.toISOString().split("T")[0];
    const komisi = komisiMap.get(dateKey) || 0;
    const komisiSelesai = komisiSelesaiMap.get(dateKey) || 0;
    // spend grafik termasuk PPN 11% (biaya iklan riil) — sejajar dashboard
    const spend = spendWithPpn(spendMap.get(dateKey) || 0);
    dailyData.push({
      date: dateKey,
      komisi,
      spend,
      profit: komisi - spend,
      profitSelesai: komisiSelesai - spend,
      komisiDibatalkan: komisiBatalMap.get(dateKey) || 0,
      klik: Math.round(klikMap.get(dateKey) || 0),
      pesanan: Math.round(pesananMap.get(dateKey) || 0),
    });
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return NextResponse.json(dailyData);
}

