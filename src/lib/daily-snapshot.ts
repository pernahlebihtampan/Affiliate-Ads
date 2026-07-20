import { prisma } from "./prisma";
import { spendWithPpn } from "./utils";

// ========== BENTUK DATA SNAPSHOT ==========
// Identik dengan baris /api/dashboard supaya <ReportTable> bisa dipakai bersama.
export interface TagRow {
  shopeeCampaignId: number;
  shopeeCampaignName: string;
  shopeeAccountName: string;
  shopeeClicks: number;
  orders: number;
  items: number;
  nilaiPembelian: number;
  komisiTertunda: number;
  komisiSelesai: number;
  totalKomisi: number;
}

export interface ReportRow {
  metaCampaignId: number | null; // null = tag Shopee belum tertaut
  metaCampaignName: string;
  metaCampaignStatus: string;
  metaAccountName: string;
  shopeeCampaignId: number;
  shopeeCampaignName: string;
  shopeeAccountName: string;
  spend: number;
  impressions: number;
  metaClicks: number;
  shopeeClicks: number;
  orders: number;
  items: number;
  nilaiPembelian: number;
  komisiTertunda: number;
  komisiSelesai: number;
  totalKomisi: number;
  roas: number;
  cpc: number;
  epc: number;
  cr: number;
  tags: TagRow[];
}

export interface ReportTotals {
  spend: number;
  impressions: number;
  metaClicks: number;
  shopeeClicks: number;
  orders: number;
  items: number;
  nilaiPembelian: number;
  komisiTertunda: number;
  komisiSelesai: number;
  totalKomisi: number;
  profit: number;
  roas: number;
}

export interface SnapshotPayload {
  rows: ReportRow[];
  totals: ReportTotals;
  generatedAt: string;
}

// ========== BANGUN BARIS LAPORAN UNTUK SATU TANGGAL ==========
export async function computeDailyReport(reportDate: Date): Promise<SnapshotPayload> {
  const batches = await prisma.importBatch.findMany({
    where: { reportDate },
    select: { id: true },
  });
  return computeReportForBatchIds(batches.map((b) => b.id));
}

// Bangun laporan dari sekumpulan batch impor. Sumber fakta = tabel riwayat
// insert-only (MetaAdDailyHistory / ShopeeOrderItemHistory) ber-importBatchId,
// jadi hitung-ulang tanggal lama selalu mereproduksi isi file saat itu — tak
// terpengaruh upsert impor berikutnya pada tabel utama. Klik Shopee tidak punya
// tabel riwayat: barisnya insert-only, atribusi via firstImportId (tak pernah
// berubah). Tanpa prorata wilayah (ratio = 1). PPN 11% via spendWithPpn().
export async function computeReportForBatchIds(batchIds: number[]): Promise<SnapshotPayload> {
  if (batchIds.length === 0) {
    return { rows: [], totals: emptyTotals(), generatedAt: new Date().toISOString() };
  }

  const batches = await prisma.importBatch.findMany({
    where: { id: { in: batchIds } },
    select: { id: true, type: true, accountId: true, importedAt: true },
  });

  // Guard dobel-hitung: bila (type, accountId) yang sama punya beberapa batch
  // pada tanggal ini (file koreksi diimpor ulang — lolos checkFileIsNewer),
  // baris riwayat kedua batch sama-sama tersimpan. Pakai hanya batch TERBARU
  // per grup. Klik tidak perlu guard: klikId unik, impor ulang cuma menyisipkan
  // klik baru — justru semua batch klik harus disertakan.
  const newestPerGroup = new Map<string, { id: number; importedAt: Date }>();
  for (const b of batches) {
    if (b.type !== "meta" && b.type !== "shopee_commission") continue;
    const key = `${b.type}|${b.accountId}`;
    const cur = newestPerGroup.get(key);
    if (
      !cur ||
      b.importedAt.getTime() > cur.importedAt.getTime() ||
      (b.importedAt.getTime() === cur.importedAt.getTime() && b.id > cur.id)
    ) {
      newestPerGroup.set(key, b);
    }
  }
  const histBatchIds = [...newestPerGroup.values()].map((b) => b.id);
  const clickBatchIds = batches.filter((b) => b.type === "shopee_click").map((b) => b.id);

  // Fallback legacy: batch pra-tabel-riwayat tidak punya baris riwayat sama
  // sekali — hitung dengan atribusi lastImportId lama supaya "Hitung ulang"
  // tanggal lama tidak menimpa payload bagus dengan laporan kosong. (Juga
  // menyerap kasus langka impor gagal di tengah sebelum flush riwayat.)
  if (histBatchIds.length > 0) {
    const [metaHistCount, shopHistCount] = await Promise.all([
      prisma.metaAdDailyHistory.count({ where: { importBatchId: { in: histBatchIds } } }),
      prisma.shopeeOrderItemHistory.count({ where: { importBatchId: { in: histBatchIds } } }),
    ]);
    if (metaHistCount + shopHistCount === 0) {
      return computeReportForBatchIdsLegacy(batchIds);
    }
  }

  const [metaHist, shopHist, clicks, hubs, unlinked] = await Promise.all([
    prisma.metaAdDailyHistory.findMany({ where: { importBatchId: { in: histBatchIds } } }),
    // Organik (shopeeCampaignId null) & Dibatalkan dikecualikan saat baca —
    // sama seperti join relasi + filter status pada implementasi lama.
    prisma.shopeeOrderItemHistory.findMany({
      where: {
        importBatchId: { in: histBatchIds },
        statusPesanan: { not: "Dibatalkan" },
        shopeeCampaignId: { not: null },
      },
    }),
    prisma.shopeeClick.findMany({
      where: { firstImportId: { in: clickBatchIds }, shopeeCampaignId: { not: null } },
      select: { shopeeCampaignId: true },
    }),
    prisma.campaignHub.findMany({
      include: {
        metaCampaign: { include: { metaAdAccount: true } },
        shopeeCampaign: { include: { shopeeAccount: true } },
      },
    }),
    prisma.shopeeCampaign.findMany({
      where: { hub: null },
      include: { shopeeAccount: true },
    }),
  ]);

  // Agregasi Meta per kampanye. Status "Penayangan" dibekukan dari kolom
  // delivery baris riwayat bertanggal terbaru (bukan MetaCampaign.status yang
  // hidup) — recompute mereproduksi status saat impor itu.
  type MetaAgg = {
    spend: number; impressions: number; clicks: number;
    latestDate: number; latestDelivery: string;
  };
  const metaAgg = new Map<number, MetaAgg>();
  for (const h of metaHist) {
    let a = metaAgg.get(h.metaCampaignId);
    if (!a) {
      metaAgg.set(
        h.metaCampaignId,
        (a = { spend: 0, impressions: 0, clicks: 0, latestDate: -1, latestDelivery: "" })
      );
    }
    a.spend += h.spendIDR;
    a.impressions += h.impressions;
    a.clicks += h.uniqueLinkClicks;
    const t = h.date.getTime();
    if (h.delivery !== "" && t >= a.latestDate) {
      a.latestDate = t;
      a.latestDelivery = h.delivery;
    }
  }

  type HistItem = (typeof shopHist)[number];
  const itemsByTag = new Map<number, HistItem[]>();
  for (const o of shopHist) {
    const tagId = o.shopeeCampaignId!;
    let list = itemsByTag.get(tagId);
    if (!list) itemsByTag.set(tagId, (list = []));
    list.push(o);
  }

  const clicksByTag = new Map<number, number>();
  for (const c of clicks) {
    clicksByTag.set(c.shopeeCampaignId!, (clicksByTag.get(c.shopeeCampaignId!) ?? 0) + 1);
  }

  // Kelompokkan hub per kampanye Meta (1 Meta : banyak Shopee) — sama seperti
  // /api/dashboard.
  type Hub = (typeof hubs)[number];
  type MetaGroup = {
    metaCampaign: Hub["metaCampaign"];
    shopeeCampaigns: Hub["shopeeCampaign"][];
  };
  const groupMap = new Map<number, MetaGroup>();
  for (const hub of hubs) {
    let g = groupMap.get(hub.metaCampaignId);
    if (!g)
      groupMap.set(
        hub.metaCampaignId,
        (g = { metaCampaign: hub.metaCampaign, shopeeCampaigns: [] })
      );
    g.shopeeCampaigns.push(hub.shopeeCampaign);
  }

  const linkedRows: ReportRow[] = [...groupMap.values()].map((group) => {
    const metaCampaign = group.metaCampaign;
    const agg = metaAgg.get(metaCampaign.id);
    const orderItems = group.shopeeCampaigns.flatMap((s) => itemsByTag.get(s.id) ?? []);

    const totalSpend = spendWithPpn(agg?.spend ?? 0);
    const totalImpressions = agg?.impressions ?? 0;
    const totalUniqueClicks = agg?.clicks ?? 0;

    const uniqueOrders = new Set(orderItems.map((o) => o.idPemesanan)).size;
    const totalItems = orderItems.length;
    const totalNilaiPembelian = orderItems.reduce((s, o) => s + o.nilaiPembelianRp, 0);

    const komisiTertunda = orderItems
      .filter((o) => o.statusPesanan === "Tertunda")
      .reduce((s, o) => s + o.komisiBersihRp, 0);
    const komisiSelesai = orderItems
      .filter((o) => o.statusPesanan === "Selesai")
      .reduce((s, o) => s + o.komisiBersihRp, 0);
    const totalKomisi = komisiTertunda + komisiSelesai;
    const shopeeClicks = group.shopeeCampaigns.reduce(
      (s, c) => s + (clicksByTag.get(c.id) ?? 0),
      0
    );

    const tags: TagRow[] = group.shopeeCampaigns.map((s) => {
      const items = itemsByTag.get(s.id) ?? [];
      const tagTertunda = items
        .filter((o) => o.statusPesanan === "Tertunda")
        .reduce((sum, o) => sum + o.komisiBersihRp, 0);
      const tagSelesai = items
        .filter((o) => o.statusPesanan === "Selesai")
        .reduce((sum, o) => sum + o.komisiBersihRp, 0);
      return {
        shopeeCampaignId: s.id,
        shopeeCampaignName: s.name,
        shopeeAccountName: s.shopeeAccount.name,
        shopeeClicks: clicksByTag.get(s.id) ?? 0,
        orders: new Set(items.map((o) => o.idPemesanan)).size,
        items: items.length,
        nilaiPembelian: items.reduce((sum, o) => sum + o.nilaiPembelianRp, 0),
        komisiTertunda: tagTertunda,
        komisiSelesai: tagSelesai,
        totalKomisi: tagTertunda + tagSelesai,
      };
    });

    return {
      metaCampaignId: metaCampaign.id,
      metaCampaignName: metaCampaign.name,
      metaCampaignStatus: agg?.latestDelivery || metaCampaign.status,
      metaAccountName: metaCampaign.metaAdAccount.name,
      shopeeCampaignId: group.shopeeCampaigns[0].id,
      shopeeCampaignName: group.shopeeCampaigns.map((s) => s.name).join(", "),
      shopeeAccountName: [
        ...new Set(group.shopeeCampaigns.map((s) => s.shopeeAccount.name)),
      ].join(", "),
      spend: totalSpend,
      impressions: totalImpressions,
      metaClicks: totalUniqueClicks,
      shopeeClicks,
      orders: uniqueOrders,
      items: totalItems,
      nilaiPembelian: totalNilaiPembelian,
      komisiTertunda,
      komisiSelesai,
      totalKomisi,
      roas: totalSpend > 0 ? totalKomisi / totalSpend : 0,
      cpc: totalUniqueClicks > 0 ? totalSpend / totalUniqueClicks : 0,
      epc: shopeeClicks > 0 ? totalKomisi / shopeeClicks : 0,
      cr: shopeeClicks > 0 ? uniqueOrders / shopeeClicks : 0,
      tags,
    };
  });

  // Kampanye Shopee bertag yang BELUM tertaut — komisinya tetap tampil (spend 0)
  // supaya tidak "hilang".
  const unlinkedRows: ReportRow[] = unlinked
    .map((c) => {
      const orderItems = itemsByTag.get(c.id) ?? [];
      const komisiTertunda = orderItems
        .filter((o) => o.statusPesanan === "Tertunda")
        .reduce((s, o) => s + o.komisiBersihRp, 0);
      const komisiSelesai = orderItems
        .filter((o) => o.statusPesanan === "Selesai")
        .reduce((s, o) => s + o.komisiBersihRp, 0);
      const totalKomisi = komisiTertunda + komisiSelesai;
      const orders = new Set(orderItems.map((o) => o.idPemesanan)).size;
      const shopeeClicks = clicksByTag.get(c.id) ?? 0;
      return {
        metaCampaignId: null,
        metaCampaignName: "",
        metaCampaignStatus: "",
        metaAccountName: "",
        shopeeCampaignId: c.id,
        shopeeCampaignName: c.name,
        shopeeAccountName: c.shopeeAccount.name,
        spend: 0,
        impressions: 0,
        metaClicks: 0,
        shopeeClicks,
        orders,
        items: orderItems.length,
        nilaiPembelian: orderItems.reduce((s, o) => s + o.nilaiPembelianRp, 0),
        komisiTertunda,
        komisiSelesai,
        totalKomisi,
        roas: 0,
        cpc: 0,
        epc: shopeeClicks > 0 ? totalKomisi / shopeeClicks : 0,
        cr: shopeeClicks > 0 ? orders / shopeeClicks : 0,
        tags: [],
      };
    })
    .filter((r) => r.totalKomisi > 0 || r.orders > 0 || r.shopeeClicks > 0);

  return buildPayload([...linkedRows, ...unlinkedRows]);
}

// ========== JALUR LEGACY (pra-tabel riwayat) ==========
// Implementasi lama: atribusi lastImportId ∈ batch tanggal itu. Rapuh (impor
// berikutnya memindahkan lastImportId) — dipertahankan HANYA sebagai fallback
// recompute untuk batch lama yang tidak punya baris riwayat.
async function computeReportForBatchIdsLegacy(batchIds: number[]): Promise<SnapshotPayload> {
  const factWhere = { lastImportId: { in: batchIds } };

  const hubs = await prisma.campaignHub.findMany({
    include: {
      metaCampaign: {
        include: {
          metaAdAccount: true,
          dailyStats: { where: factWhere },
        },
      },
      shopeeCampaign: {
        include: {
          shopeeAccount: true,
          orderItems: { where: { ...factWhere, statusPesanan: { not: "Dibatalkan" } } },
          clicks: { where: factWhere },
        },
      },
    },
  });

  // Kelompokkan hub per kampanye Meta (1 Meta : banyak Shopee) — sama seperti
  // /api/dashboard. dailyStats identik untuk tiap hub Meta yang sama.
  type Hub = (typeof hubs)[number];
  type MetaGroup = {
    metaCampaign: Hub["metaCampaign"];
    shopeeCampaigns: Hub["shopeeCampaign"][];
  };
  const groupMap = new Map<number, MetaGroup>();
  for (const hub of hubs) {
    let g = groupMap.get(hub.metaCampaignId);
    if (!g)
      groupMap.set(
        hub.metaCampaignId,
        (g = { metaCampaign: hub.metaCampaign, shopeeCampaigns: [] })
      );
    g.shopeeCampaigns.push(hub.shopeeCampaign);
  }

  const linkedRows: ReportRow[] = [...groupMap.values()].map((group) => {
    const metaCampaign = group.metaCampaign;
    const dailyStats = metaCampaign.dailyStats;
    const orderItems = group.shopeeCampaigns.flatMap((s) => s.orderItems);
    const clicks = group.shopeeCampaigns.flatMap((s) => s.clicks);

    const totalSpend = spendWithPpn(dailyStats.reduce((s, d) => s + d.spendIDR, 0));
    const totalImpressions = dailyStats.reduce((s, d) => s + d.impressions, 0);
    const totalUniqueClicks = dailyStats.reduce((s, d) => s + d.uniqueLinkClicks, 0);

    const uniqueOrders = new Set(orderItems.map((o) => o.idPemesanan)).size;
    const totalItems = orderItems.length;
    const totalNilaiPembelian = orderItems.reduce((s, o) => s + o.nilaiPembelianRp, 0);

    const komisiTertunda = orderItems
      .filter((o) => o.statusPesanan === "Tertunda")
      .reduce((s, o) => s + o.komisiBersihRp, 0);
    const komisiSelesai = orderItems
      .filter((o) => o.statusPesanan === "Selesai")
      .reduce((s, o) => s + o.komisiBersihRp, 0);
    const totalKomisi = komisiTertunda + komisiSelesai;
    const shopeeClicks = clicks.length;

    const tags: TagRow[] = group.shopeeCampaigns.map((s) => {
      const items = s.orderItems;
      const tagTertunda = items
        .filter((o) => o.statusPesanan === "Tertunda")
        .reduce((sum, o) => sum + o.komisiBersihRp, 0);
      const tagSelesai = items
        .filter((o) => o.statusPesanan === "Selesai")
        .reduce((sum, o) => sum + o.komisiBersihRp, 0);
      return {
        shopeeCampaignId: s.id,
        shopeeCampaignName: s.name,
        shopeeAccountName: s.shopeeAccount.name,
        shopeeClicks: s.clicks.length,
        orders: new Set(items.map((o) => o.idPemesanan)).size,
        items: items.length,
        nilaiPembelian: items.reduce((sum, o) => sum + o.nilaiPembelianRp, 0),
        komisiTertunda: tagTertunda,
        komisiSelesai: tagSelesai,
        totalKomisi: tagTertunda + tagSelesai,
      };
    });

    return {
      metaCampaignId: metaCampaign.id,
      metaCampaignName: metaCampaign.name,
      metaCampaignStatus: metaCampaign.status,
      metaAccountName: metaCampaign.metaAdAccount.name,
      shopeeCampaignId: group.shopeeCampaigns[0].id,
      shopeeCampaignName: group.shopeeCampaigns.map((s) => s.name).join(", "),
      shopeeAccountName: [
        ...new Set(group.shopeeCampaigns.map((s) => s.shopeeAccount.name)),
      ].join(", "),
      spend: totalSpend,
      impressions: totalImpressions,
      metaClicks: totalUniqueClicks,
      shopeeClicks,
      orders: uniqueOrders,
      items: totalItems,
      nilaiPembelian: totalNilaiPembelian,
      komisiTertunda,
      komisiSelesai,
      totalKomisi,
      roas: totalSpend > 0 ? totalKomisi / totalSpend : 0,
      cpc: totalUniqueClicks > 0 ? totalSpend / totalUniqueClicks : 0,
      epc: shopeeClicks > 0 ? totalKomisi / shopeeClicks : 0,
      cr: shopeeClicks > 0 ? uniqueOrders / shopeeClicks : 0,
      tags,
    };
  });

  // Kampanye Shopee bertag yang BELUM tertaut — komisinya tetap tampil (spend 0)
  // supaya tidak "hilang". Di dashboard harian selalu disertakan (tak ada filter
  // sisi-Meta yang menyembunyikannya).
  const unlinked = await prisma.shopeeCampaign.findMany({
    where: { hub: null },
    include: {
      shopeeAccount: true,
      orderItems: { where: { ...factWhere, statusPesanan: { not: "Dibatalkan" } } },
      clicks: { where: factWhere },
    },
  });

  const unlinkedRows: ReportRow[] = unlinked
    .map((c) => {
      const orderItems = c.orderItems;
      const komisiTertunda = orderItems
        .filter((o) => o.statusPesanan === "Tertunda")
        .reduce((s, o) => s + o.komisiBersihRp, 0);
      const komisiSelesai = orderItems
        .filter((o) => o.statusPesanan === "Selesai")
        .reduce((s, o) => s + o.komisiBersihRp, 0);
      const totalKomisi = komisiTertunda + komisiSelesai;
      const orders = new Set(orderItems.map((o) => o.idPemesanan)).size;
      const shopeeClicks = c.clicks.length;
      return {
        metaCampaignId: null,
        metaCampaignName: "",
        metaCampaignStatus: "",
        metaAccountName: "",
        shopeeCampaignId: c.id,
        shopeeCampaignName: c.name,
        shopeeAccountName: c.shopeeAccount.name,
        spend: 0,
        impressions: 0,
        metaClicks: 0,
        shopeeClicks,
        orders,
        items: orderItems.length,
        nilaiPembelian: orderItems.reduce((s, o) => s + o.nilaiPembelianRp, 0),
        komisiTertunda,
        komisiSelesai,
        totalKomisi,
        roas: 0,
        cpc: 0,
        epc: shopeeClicks > 0 ? totalKomisi / shopeeClicks : 0,
        cr: shopeeClicks > 0 ? orders / shopeeClicks : 0,
        tags: [],
      };
    })
    .filter((r) => r.totalKomisi > 0 || r.orders > 0 || r.shopeeClicks > 0);

  return buildPayload([...linkedRows, ...unlinkedRows]);
}

function buildPayload(allRows: ReportRow[]): SnapshotPayload {
  const totals: ReportTotals = {
    spend: allRows.reduce((s, r) => s + r.spend, 0),
    impressions: allRows.reduce((s, r) => s + r.impressions, 0),
    metaClicks: allRows.reduce((s, r) => s + r.metaClicks, 0),
    shopeeClicks: allRows.reduce((s, r) => s + r.shopeeClicks, 0),
    orders: allRows.reduce((s, r) => s + r.orders, 0),
    items: allRows.reduce((s, r) => s + r.items, 0),
    nilaiPembelian: allRows.reduce((s, r) => s + r.nilaiPembelian, 0),
    komisiTertunda: allRows.reduce((s, r) => s + r.komisiTertunda, 0),
    komisiSelesai: allRows.reduce((s, r) => s + r.komisiSelesai, 0),
    totalKomisi: allRows.reduce((s, r) => s + r.totalKomisi, 0),
    profit: 0,
    roas: 0,
  };
  totals.profit = totals.totalKomisi - totals.spend;
  totals.roas = totals.spend > 0 ? totals.totalKomisi / totals.spend : 0;

  return { rows: allRows, totals, generatedAt: new Date().toISOString() };
}

// Hitung + simpan snapshot beku untuk satu tanggal. Dipanggil di akhir tiap
// impor Dasbor Harian yang membawa reportDate, dan setelah hapus riwayat impor.
export async function computeAndStoreDailySnapshot(
  reportDate: Date
): Promise<SnapshotPayload> {
  const payload = await computeDailyReport(reportDate);
  await prisma.dailySnapshot.upsert({
    where: { reportDate },
    update: { payload: JSON.stringify(payload), computedAt: new Date() },
    create: { reportDate, payload: JSON.stringify(payload) },
  });
  return payload;
}

function emptyTotals(): ReportTotals {
  return {
    spend: 0, impressions: 0, metaClicks: 0, shopeeClicks: 0, orders: 0,
    items: 0, nilaiPembelian: 0, komisiTertunda: 0, komisiSelesai: 0,
    totalKomisi: 0, profit: 0, roas: 0,
  };
}
