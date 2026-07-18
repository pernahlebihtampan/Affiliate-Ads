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

interface BucketAgg {
  klik: number;
  pesanan: number;
  komisi: number;
}

function emptyBucket(): BucketAgg {
  return { klik: 0, pesanan: 0, komisi: 0 };
}

// Performa Klik analisis data ShopeeClick (1 baris CSV = 1 klik) per
// tanggal, jam WIB, tag, perujuk, dan negara, disandingkan dengan pesanan &
// komisi ShopeeOrderItem pada bucket yang sama (via tanggal/jam klik item).
// Kosakata `ShopeeClick.perujuk` = `ShopeeOrderItem.platform` (Facebook,
// Instagram, Shopeevideo-Shopee, …) sehingga konversi per perujuk bisa
// dihitung. Data klik hanya mencakup beberapa hari (CSV klik Shopee terbatas)
// bila from/to tidak dikirim, rentang default = cakupan data klik supaya
// CR/EPC tidak menyesatkan.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  let fromDate = url.searchParams.get("from");
  let toDate = url.searchParams.get("to");
  const shopeeAccountId = url.searchParams.get("shopeeAccountId")
    ? parseInt(url.searchParams.get("shopeeAccountId")!)
    : undefined;
  const tagQuery = url.searchParams.get("tag")?.trim().toLowerCase() || "";
  const perujukFilter = url.searchParams.get("perujuk") || "";

  const accountWhere = shopeeAccountId ? { shopeeAccountId } : {};

  // Cakupan data klik (per akun bila difilter) dipakai sebagai rentang
  // default dan ditampilkan di UI sebagai peringatan cakupan
  const [minRow, maxRow] = await Promise.all([
    prisma.shopeeClick.findFirst({
      where: { clickTimeUTC: { not: null }, ...accountWhere },
      orderBy: { clickTimeUTC: "asc" },
      select: { clickTimeUTC: true },
    }),
    prisma.shopeeClick.findFirst({
      where: { clickTimeUTC: { not: null }, ...accountWhere },
      orderBy: { clickTimeUTC: "desc" },
      select: { clickTimeUTC: true },
    }),
  ]);
  const coverage =
    minRow?.clickTimeUTC && maxRow?.clickTimeUTC
      ? {
          from: minRow.clickTimeUTC.toISOString().slice(0, 10),
          to: maxRow.clickTimeUTC.toISOString().slice(0, 10),
        }
      : null;

  if (!fromDate && !toDate && coverage) {
    fromDate = coverage.from;
    toDate = coverage.to;
  }
  const clickFilter =
    fromDate || toDate
      ? {
          ...(fromDate ? { gte: parseDateUtc(fromDate) } : {}),
          ...(toDate ? { lte: parseDateUtcEndOfDay(toDate) } : {}),
        }
      : undefined;

  // Filter tag → id kampanye Shopee (exact case-insensitive, seperti dashboard)
  let tagCampaignIds: number[] | null = null;
  if (tagQuery) {
    const campaigns = await prisma.shopeeCampaign.findMany({
      where: { ...(shopeeAccountId ? { shopeeAccountId } : {}) },
      select: { id: true, name: true },
    });
    tagCampaignIds = campaigns
      .filter((c) => c.name.toLowerCase() === tagQuery)
      .map((c) => c.id);
  }

  const clicks = await prisma.shopeeClick.findMany({
    where: {
      ...accountWhere,
      ...(clickFilter ? { clickTimeUTC: clickFilter } : {}),
      ...(tagCampaignIds ? { shopeeCampaignId: { in: tagCampaignIds } } : {}),
      ...(perujukFilter ? { perujuk: perujukFilter } : {}),
    },
    select: {
      clickTimeUTC: true,
      wilayah: true,
      perujuk: true,
      shopeeCampaignId: true,
      shopeeCampaign: { select: { name: true } },
    },
  });

  // Pesanan pada bucket yang sama. Filter perujuk dipetakan ke kolom
  // `platform` item (kosakata sama). Exclude Dibatalkan (aturan bisnis).
  const items = await prisma.shopeeOrderItem.findMany({
    where: {
      statusPesanan: { not: "Dibatalkan" },
      ...accountWhere,
      ...(clickFilter ? { clickTimeUTC: clickFilter } : {}),
      ...(tagCampaignIds ? { shopeeCampaignId: { in: tagCampaignIds } } : {}),
      ...(perujukFilter ? { platform: perujukFilter } : {}),
    },
    select: {
      idPemesanan: true,
      clickTimeUTC: true,
      komisiBersihRp: true,
      platform: true,
      shopeeCampaignId: true,
      shopeeCampaign: { select: { name: true } },
    },
  });

  const ORGANIK = "(Organik / tanpa tag)";
  const daily = new Map<string, BucketAgg>();
  const byHour = new Map<number, BucketAgg>();
  const byTag = new Map<string, BucketAgg>();
  const byPerujuk = new Map<string, BucketAgg>();
  const byNegara = new Map<string, { klik: number }>();

  const bucket = <K,>(m: Map<K, BucketAgg>, k: K): BucketAgg => {
    let b = m.get(k);
    if (!b) {
      b = emptyBucket();
      m.set(k, b);
    }
    return b;
  };

  for (const c of clicks) {
    const t = c.clickTimeUTC;
    if (t) {
      // WIB-as-UTC: bagian tanggal/jam ISO = tanggal/jam kalender WIB
      bucket(daily, t.toISOString().slice(0, 10)).klik++;
      bucket(byHour, t.getUTCHours()).klik++;
    }
    bucket(byTag, c.shopeeCampaign?.name || ORGANIK).klik++;
    bucket(byPerujuk, c.perujuk || "(kosong)").klik++;
    const negara = c.wilayah && c.wilayah !== "-" ? c.wilayah : "(tidak diketahui)";
    const n = byNegara.get(negara);
    if (n) n.klik++;
    else byNegara.set(negara, { klik: 1 });
  }

  // Pesanan unik dihitung pada item PERTAMA per idPemesanan (konsisten dengan
  // dashboard); komisi dijumlah semua item
  const seenOrders = new Set<string>();
  for (const o of items) {
    const isFirst = !seenOrders.has(o.idPemesanan);
    if (isFirst) seenOrders.add(o.idPemesanan);
    const t = o.clickTimeUTC;
    const tag = o.shopeeCampaign?.name || ORGANIK;
    const perujuk = o.platform || "(kosong)";
    const targets = [
      t ? bucket(daily, t.toISOString().slice(0, 10)) : null,
      t ? bucket(byHour, t.getUTCHours()) : null,
      bucket(byTag, tag),
      bucket(byPerujuk, perujuk),
    ];
    for (const b of targets) {
      if (!b) continue;
      b.komisi += o.komisiBersihRp;
      if (isFirst) b.pesanan++;
    }
  }

  const derive = (b: BucketAgg) => ({
    ...b,
    cr: b.klik > 0 ? b.pesanan / b.klik : 0,
    epc: b.klik > 0 ? b.komisi / b.klik : 0,
  });

  const totals = derive(
    [...byTag.values()].reduce((acc, b) => {
      acc.klik += b.klik;
      acc.pesanan += b.pesanan;
      acc.komisi += b.komisi;
      return acc;
    }, emptyBucket())
  );

  // Opsi dropdown dihitung TANPA filter tag/perujuk (hanya akun) supaya
  // daftar tetap lengkap saat salah satu filter sedang aktif
  const [tagRows, perujukRows] = await Promise.all([
    prisma.shopeeClick.findMany({
      where: { ...accountWhere, shopeeCampaignId: { not: null } },
      distinct: ["shopeeCampaignId"],
      select: { shopeeCampaign: { select: { name: true } } },
    }),
    prisma.shopeeClick.findMany({
      where: { ...accountWhere, perujuk: { not: "" } },
      distinct: ["perujuk"],
      select: { perujuk: true },
    }),
  ]);
  const tagOptions = tagRows
    .map((r) => r.shopeeCampaign?.name)
    .filter((n): n is string => !!n)
    .sort((a, b) => a.localeCompare(b, "id-ID"));
  const perujukOptions = perujukRows
    .map((r) => r.perujuk)
    .sort((a, b) => a.localeCompare(b, "id-ID"));

  return NextResponse.json({
    coverage,
    range: { from: fromDate, to: toDate },
    totals,
    daily: [...daily.entries()]
      .map(([date, b]) => ({ date, ...derive(b) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    byHour: Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      ...derive(byHour.get(h) || emptyBucket()),
    })),
    byTag: [...byTag.entries()]
      .map(([tag, b]) => ({ tag, ...derive(b) }))
      .sort((a, b) => b.klik - a.klik),
    byPerujuk: [...byPerujuk.entries()]
      .map(([perujuk, b]) => ({ perujuk, ...derive(b) }))
      .sort((a, b) => b.klik - a.klik),
    byNegara: [...byNegara.entries()]
      .map(([negara, v]) => ({
        negara,
        klik: v.klik,
        share: totals.klik > 0 ? v.klik / totals.klik : 0,
      }))
      .sort((a, b) => b.klik - a.klik),
    tagOptions,
    perujukOptions,
  });
}
