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
  // Filter opsional: nama kampanye Meta EXACT match case-insensitive (nilai
  // dikirim UI dari pilihan dropdown, bukan ketikan bebas) & wilayah Meta.
  // Data Shopee tidak punya dimensi wilayah (CSV komisi tanpa kolom wilayah;
  // "Wilayah Klik" = negara). Saat filter wilayah aktif, metrik Shopee
  // di-PRORATA per (kampanye, tanggal klik) mengikuti porsi spend wilayah:
  //   komisi_wilayah ≈ komisi × spend_wilayah / spend_total  → ESTIMASI.
  const campaignQuery = url.searchParams.get("campaign")?.trim().toLowerCase() || "";
  const region = url.searchParams.get("region") || "";
  // Filter sisi Shopee: Tag_link1 exact match (eksklusif dengan `campaign` —
  // UI yang menjaga), plus filter exact level-item pesanan.
  const tagQuery = url.searchParams.get("tag")?.trim().toLowerCase() || "";
  const statusFilter = url.searchParams.get("status") || "";
  const l1Filter = url.searchParams.get("l1") || "";
  const l3Filter = url.searchParams.get("l3") || "";
  const platformFilter = url.searchParams.get("platform") || "";
  // Filter sisi Meta: "Penayangan kampanye" terkini (active/inactive/archived)
  const deliveryFilter = url.searchParams.get("delivery") || "";

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

  // === Kelompokkan hub per kampanye Meta (1 Meta : banyak Shopee) ===
  // ROAS di level Meta: satu baris per kampanye Meta, komisi/klik dari SEMUA
  // tag Shopee yang tertaut digabung. dailyStats identik untuk tiap hub Meta
  // yang sama (query menyertakan metaCampaign penuh) → ambil dari yang pertama.
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
  const groups = [...groupMap.values()];

  // Opsi autocomplete filter kampanye/tag di UI — dari grup yang PUNYA data
  // (spend/pesanan/klik) di rentang tanggal terpilih. Dihitung SEBELUM filter
  // akun/kampanye/tag diterapkan supaya list tetap lengkap saat salah satu
  // filter tsb sedang aktif. Tag = tiap nama Shopee yang aktif (grup punya
  // spend, atau tag itu punya pesanan/klik).
  const campaignOptions = [
    ...new Set(
      groups
        .filter(
          (g) =>
            g.metaCampaign.dailyStats.length > 0 ||
            g.shopeeCampaigns.some(
              (s) => s.orderItems.length > 0 || s.clicks.length > 0
            )
        )
        .map((g) => g.metaCampaign.name)
    ),
  ].sort((a, b) => a.localeCompare(b, "id-ID"));
  const tagOptions = [
    ...new Set(
      groups.flatMap((g) => {
        const metaActive = g.metaCampaign.dailyStats.length > 0;
        return g.shopeeCampaigns
          .filter(
            (s) => metaActive || s.orderItems.length > 0 || s.clicks.length > 0
          )
          .map((s) => s.name);
      })
    ),
  ].sort((a, b) => a.localeCompare(b, "id-ID"));

  // Filter by account / campaign name / tag Shopee if specified. Filter sisi
  // Shopee (akun/tag) meloloskan grup bila ADA satu tag yang cocok — komisi
  // seluruh tag Meta itu tetap diagregasi (ROAS level Meta).
  const filteredGroups = groups.filter((g) => {
    if (metaAdAccountId && g.metaCampaign.metaAdAccountId !== metaAdAccountId) return false;
    if (campaignQuery && g.metaCampaign.name.toLowerCase() !== campaignQuery) return false;
    if (deliveryFilter && g.metaCampaign.status !== deliveryFilter) return false;
    if (
      shopeeAccountId &&
      !g.shopeeCampaigns.some((s) => s.shopeeAccountId === shopeeAccountId)
    )
      return false;
    if (tagQuery && !g.shopeeCampaigns.some((s) => s.name.toLowerCase() === tagQuery))
      return false;
    return true;
  });

  const rows = filteredGroups.map((group) => {
    const metaCampaign = group.metaCampaign;
    const allStats = metaCampaign.dailyStats;
    const dailyStats = region ? allStats.filter((d) => d.region === region) : allStats;
    // Gabung pesanan & klik dari semua tag Shopee milik Meta ini
    const orderItems = group.shopeeCampaigns.flatMap((s) => s.orderItems);
    const clicks = group.shopeeCampaigns.flatMap((s) => s.clicks);

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

    // spend termasuk PPN 11% (biaya iklan riil) → menular ke roas/cpc & totals
    const totalSpend = spendWithPpn(dailyStats.reduce((s, d) => s + d.spendIDR, 0));
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

    // Rincian per tag Shopee (untuk baris expand di dashboard). Spend/klik Meta
    // ada di level Meta → tidak dibagi per tag; hanya metrik sisi Shopee yang
    // dirinci. Prorata wilayah ikut diterapkan sama seperti agregat di atas.
    const tags = group.shopeeCampaigns.map((s) => {
      const items = s.orderItems;
      const tagOrderClickTime = new Map<string, Date | null>();
      for (const o of items) {
        if (!tagOrderClickTime.has(o.idPemesanan))
          tagOrderClickTime.set(o.idPemesanan, o.clickTimeUTC);
      }
      const tagKomisiTertunda = items
        .filter((o) => o.statusPesanan === "Tertunda")
        .reduce((sum, o) => sum + o.komisiBersihRp * ratioFor(o.clickTimeUTC), 0);
      const tagKomisiSelesai = items
        .filter((o) => o.statusPesanan === "Selesai")
        .reduce((sum, o) => sum + o.komisiBersihRp * ratioFor(o.clickTimeUTC), 0);
      return {
        shopeeCampaignId: s.id,
        shopeeCampaignName: s.name,
        shopeeAccountName: s.shopeeAccount.name,
        shopeeClicks: Math.round(
          s.clicks.reduce((sum, c) => sum + ratioFor(c.clickTimeUTC), 0)
        ),
        orders: Math.round(
          [...tagOrderClickTime.values()].reduce((sum, t) => sum + ratioFor(t), 0)
        ),
        items: Math.round(items.reduce((sum, o) => sum + ratioFor(o.clickTimeUTC), 0)),
        nilaiPembelian: items.reduce(
          (sum, o) => sum + o.nilaiPembelianRp * ratioFor(o.clickTimeUTC), 0
        ),
        komisiTertunda: tagKomisiTertunda,
        komisiSelesai: tagKomisiSelesai,
        totalKomisi: tagKomisiTertunda + tagKomisiSelesai,
      };
    });

    return {
      metaCampaignId: metaCampaign.id,
      metaCampaignName: metaCampaign.name,
      // "Penayangan kampanye" terkini (active/inactive/archived) — di-update
      // tiap import Meta
      metaCampaignStatus: metaCampaign.status,
      metaAccountName: metaCampaign.metaAdAccount.name,
      // Gabungan semua tag Shopee yang tertaut ke Meta ini (satu baris/Meta)
      shopeeCampaignId: group.shopeeCampaigns[0].id,
      shopeeCampaignName: group.shopeeCampaigns.map((s) => s.name).join(", "),
      shopeeAccountName: [
        ...new Set(group.shopeeCampaigns.map((s) => s.shopeeAccount.name)),
      ].join(", "),
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
      tags,
    };
  });

  // Kampanye Shopee bertag yang BELUM ditautkan di Campaign Hub — komisinya
  // tetap ditampilkan sebagai baris terpisah (spend 0) supaya tidak "hilang"
  // dari dashboard. Disembunyikan bila filter sisi-Meta aktif (akun Meta /
  // kampanye / wilayah / penayangan) karena tidak ada sisi Meta untuk
  // dicocokkan/diprorata, atau saat toggle "Belum tertaut" di UI dimatikan
  // (`unlinked=0` — totals & grafik ikut mengecualikan agar konsisten dengan
  // tabel).
  const includeUnlinked = url.searchParams.get("unlinked") !== "0";
  const showUnlinked =
    includeUnlinked && !metaAdAccountId && !campaignQuery && !region && !deliveryFilter;
  const unlinkedCampaigns = showUnlinked
    ? await prisma.shopeeCampaign.findMany({
        where: {
          hub: null,
          ...(shopeeAccountId ? { shopeeAccountId } : {}),
        },
        include: {
          shopeeAccount: true,
          orderItems: { where: itemWhere },
          clicks: {
            where: {
              ...(clickFilter ? { clickTimeUTC: clickFilter } : {}),
            },
          },
        },
      })
    : [];

  const unlinkedWithData = unlinkedCampaigns
    .map((c) => {
      const orderItems = c.orderItems;
      const komisiTertunda = orderItems
        .filter((o) => o.statusPesanan === "Tertunda")
        .reduce((s, o) => s + o.komisiBersihRp, 0);
      const komisiSelesai = orderItems
        .filter((o) => o.statusPesanan === "Selesai")
        .reduce((s, o) => s + o.komisiBersihRp, 0);
      const totalKomisi = komisiTertunda + komisiSelesai;
      const totalOrders = new Set(orderItems.map((o) => o.idPemesanan)).size;
      const shopeeClicks = c.clicks.length;

      return {
        metaCampaignId: null as number | null,
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
        orders: totalOrders,
        items: orderItems.length,
        nilaiPembelian: orderItems.reduce((s, o) => s + o.nilaiPembelianRp, 0),
        komisiTertunda,
        komisiSelesai,
        totalKomisi,
        roas: 0,
        cpc: 0,
        epc: shopeeClicks > 0 ? totalKomisi / shopeeClicks : 0,
        cr: shopeeClicks > 0 ? totalOrders / shopeeClicks : 0,
        tags: [] as (typeof rows)[number]["tags"],
      };
    })
    // Hanya yang punya data di rentang terpilih — tag mati tidak memenuhi tabel
    .filter((r) => r.totalKomisi > 0 || r.orders > 0 || r.shopeeClicks > 0);

  const unlinkedRows = unlinkedWithData.filter(
    (r) => !tagQuery || r.shopeeCampaignName.toLowerCase() === tagQuery
  );

  const allRows = [...rows, ...unlinkedRows];

  // Tag belum-tertaut ikut ditawarkan di dropdown filter Tag Shopee —
  // dari unlinkedWithData (sebelum filter tag) supaya list tetap lengkap
  // saat sebuah tag sedang dipilih
  const allTagOptions = [
    ...new Set([...tagOptions, ...unlinkedWithData.map((r) => r.shopeeCampaignName)]),
  ].sort((a, b) => a.localeCompare(b, "id-ID"));

  // Calculate totals (termasuk baris belum-tertaut)
  const totals = {
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
  // Keuntungan = komisi − spend pada cakupan tabel (hub tertaut + baris
  // belum-tertaut). Komisi organik TIDAK termasuk (panel terpisah), dan spend
  // kampanye Meta yang belum tertaut di Hub juga tidak — sama seperti ROAS.
  totals.profit = totals.totalKomisi - totals.spend;
  totals.roas = totals.spend > 0 ? totals.totalKomisi / totals.spend : 0;

  // Spend kampanye Meta yang BELUM ditautkan di Campaign Hub — tidak punya
  // sisi Shopee sehingga tidak tampil sebagai baris, tapi jumlahnya dilaporkan
  // sebagai catatan supaya user tahu keuntungan riil lebih rendah dari card.
  // Disembunyikan saat filter sisi-Shopee (akun Shopee / tag) atau filter
  // kampanye aktif — cakupannya tidak relevan dengan spend di luar pilihan itu.
  const spendTanpaTautan = { spend: 0, campaigns: 0 };
  if (!campaignQuery && !tagQuery && !shopeeAccountId) {
    const unlinkedMeta = await prisma.metaCampaign.findMany({
      where: {
        hubs: { none: {} },
        ...(metaAdAccountId ? { metaAdAccountId } : {}),
        ...(deliveryFilter ? { status: deliveryFilter } : {}),
      },
      include: {
        dailyStats: {
          where: {
            ...(dateFilter ? { date: dateFilter } : {}),
            ...(region ? { region } : {}),
          },
        },
      },
    });
    for (const c of unlinkedMeta) {
      const s = spendWithPpn(c.dailyStats.reduce((sum, d) => sum + d.spendIDR, 0));
      if (s > 0) {
        spendTanpaTautan.spend += s;
        spendTanpaTautan.campaigns++;
      }
    }
  }

  // Get unmapped (organic) data — filter level-item ikut diterapkan;
  // filter campaign/tag tidak (organik = tanpa kampanye)
  const organicStats = await getOrganicStats(shopeeAccountId, fromDate ?? undefined, toDate ?? undefined, {
    status: statusFilter, l1: l1Filter, l3: l3Filter, platform: platformFilter,
  });

  // Daftar nilai untuk dropdown filter ("" = nilai kosong, dikecualikan).
  // "Dibatalkan" ikut ditawarkan — memilihnya sengaja menembus aturan exclude
  // untuk meninjau pesanan batal (komisiBersihRp-nya 0; lihat seri estimasi
  // komisi dibatalkan di grafik harian).
  const [regionRows, statusRows, l1Rows, l3Rows, platformRows, deliveryRows] = await Promise.all([
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
      // L3 dibatasi rentang tanggal terpilih (datalist pencarian — kategori
      // di luar rentang tidak relevan untuk disarankan)
      where: {
        l3Kategori: { not: "" },
        ...(clickFilter ? { clickTimeUTC: clickFilter } : {}),
      },
      distinct: ["l3Kategori"], select: { l3Kategori: true }, orderBy: { l3Kategori: "asc" },
    }),
    prisma.shopeeOrderItem.findMany({
      where: { platform: { not: "" } },
      distinct: ["platform"], select: { platform: true }, orderBy: { platform: "asc" },
    }),
    prisma.metaCampaign.findMany({
      where: { status: { not: "" } },
      distinct: ["status"], select: { status: true },
    }),
  ]);
  const regions = regionRows.map((r) => r.region);
  // Urutan tetap active → inactive → archived (bukan alfabetis) — nilai lain
  // yang tak dikenal jatuh di belakang
  const DELIVERY_ORDER = ["active", "inactive", "archived"];
  const deliveries = deliveryRows
    .map((r) => r.status)
    .sort((a, b) => {
      const ia = DELIVERY_ORDER.indexOf(a);
      const ib = DELIVERY_ORDER.indexOf(b);
      return (ia === -1 ? DELIVERY_ORDER.length : ia) - (ib === -1 ? DELIVERY_ORDER.length : ib);
    });

  // estimated: metrik Shopee (komisi/pesanan/klik) adalah hasil prorata wilayah
  return NextResponse.json({
    rows: allRows, totals, spendTanpaTautan, organicStats, regions, campaignOptions,
    tagOptions: allTagOptions,
    statuses: statusRows.map((r) => r.statusPesanan),
    l1Categories: l1Rows.map((r) => r.l1Kategori),
    l3Categories: l3Rows.map((r) => r.l3Kategori),
    platforms: platformRows.map((r) => r.platform),
    deliveries,
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
