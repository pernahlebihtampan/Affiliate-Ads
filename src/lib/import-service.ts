import { prisma } from "./prisma";
import { computeFileHash, parseTagRaw, parseDateWib } from "./utils";
import { beginImportRows, updateImportProgress } from "./import-progress";
import type { MetaAdRow, ShopeeClickRow, ShopeeCommissionRow } from "./csv-parser";

const BATCH_SIZE = 500;
const PROGRESS_EVERY = 100;
const YIELD_EVERY = 20;

// Platform/perujuk yang dikecualikan saat impor Shopee (klik & komisi) — trafik
// dari dalam Shopee sendiri (video/live), bukan hasil iklan Meta. Dicocokkan
// case-insensitive. Baris ini dilewati (dihitung skipped), tidak masuk DB.
const EXCLUDED_SHOPEE_PLATFORMS = new Set(["shopeevideo-shopee", "shopeelive-shopee"]);

function isExcludedShopeePlatform(value: string): boolean {
  return EXCLUDED_SHOPEE_PLATFORMS.has(value.trim().toLowerCase());
}

// Driver libsql file lokal bersifat sinkron — await-nya resolve seketika,
// sehingga loop impor menjadi rantai microtask yang tak pernah kembali ke
// poll phase event loop: SEMUA request lain (termasuk GET /api/import/progress)
// menggantung sampai impor selesai. setImmediate melepas kendali ke poll phase
// agar server tetap responsif selama impor berjalan.
function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

// Properti file dari browser (File.lastModified/File.size) — dikirim eksplisit
// oleh halaman import karena multipart upload TIDAK membawa lastModified.
export interface ImportFileMeta {
  lastModified?: number; // epoch ms
  size?: number;
}

// Tolak file yang sama/lebih lawas dari import terakhir untuk (type, accountId)
// yang sama. File identik-konten sudah ditolak via fileHash; guard ini menangkap
// ekspor lama yang isinya beda tapi datanya kedaluwarsa.
async function checkFileIsNewer(
  type: string,
  accountId: number,
  fileName: string,
  fileMeta?: ImportFileMeta
): Promise<string | null> {
  if (!fileMeta?.lastModified) return null;
  const prev = await prisma.importBatch.findFirst({
    where: { type, accountId, fileModifiedTime: { not: null } },
    orderBy: { fileModifiedTime: "desc" },
  });
  if (!prev?.fileModifiedTime) return null;

  const incoming = new Date(fileMeta.lastModified);
  if (incoming.getTime() <= prev.fileModifiedTime.getTime()) {
    const fmt = (d: Date) =>
      d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
    return (
      `File "${fileName}" (modifikasi ${fmt(incoming)}) sama atau lebih lawas dari ` +
      `import terakhir "${prev.fileName}" (modifikasi ${fmt(prev.fileModifiedTime)}). ` +
      `Ekspor ulang file yang lebih baru, atau import berurutan dari yang paling lama.`
    );
  }
  return null;
}

function fileMetaData(fileMeta?: ImportFileMeta) {
  return {
    fileModifiedTime: fileMeta?.lastModified ? new Date(fileMeta.lastModified) : null,
    fileSize: fileMeta?.size ?? null,
  };
}

// Helper to save periodic progress
async function saveProgress(batchId: number, result: ImportResult) {
  await prisma.importBatch.update({
    where: { id: batchId },
    data: {
      rowsInserted: result.inserted,
      rowsUpdated: result.updated,
      rowsSkipped: result.skipped,
    },
  });
}

// ========== META ADS IMPORT ==========
export async function importMetaAdCsv(
  metaAdAccountId: number,
  fileName: string,
  rows: MetaAdRow[],
  fileMeta?: ImportFileMeta
): Promise<ImportResult> {
  const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  // Inline agar string JSON besar tidak tertahan di scope selama impor berjalan
  const fileHash = computeFileHash(JSON.stringify(rows));

  const existing = await prisma.importBatch.findUnique({ where: { fileHash } });
  if (existing) {
    result.skipped = rows.length;
    result.errors.push(`File "${fileName}" sudah pernah diimpor sebelumnya.`);
    return result;
  }

  const staleError = await checkFileIsNewer("meta", metaAdAccountId, fileName, fileMeta);
  if (staleError) {
    result.skipped = rows.length;
    result.errors.push(staleError);
    return result;
  }

  const importBatch = await prisma.importBatch.create({
    data: {
      type: "meta", accountId: metaAdAccountId, accountType: "meta",
      fileName, fileHash, ...fileMetaData(fileMeta),
    },
  });

  beginImportRows(rows.length);

  // Pre-fetch existing campaigns for cache
  const existingCampaigns = await prisma.metaCampaign.findMany({ where: { metaAdAccountId } });
  const campaignMap = new Map(existingCampaigns.map(c => [c.name, c]));

  // (kampanye, tanggal) yang baris agregat lamanya (region="") sudah dibersihkan
  const legacyCleaned = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Tanggal Meta (WIB) disimpan sebagai 00:00Z tanggal kalender → bucket harian = tanggal WIB.
    const startDate = parseDateWib(row.startDate);
    if (!startDate) {
      // Jangan skip diam-diam — laporkan agar baris yang gagal terlihat
      result.skipped++;
      result.errors.push(
        `Baris "${row.campaignName}" dilewati: tanggal "${row.startDate}" tidak terparse.`
      );
      continue;
    }

    let campaign = campaignMap.get(row.campaignName);
    if (!campaign) {
      campaign = await prisma.metaCampaign.create({
        data: { metaAdAccountId, name: row.campaignName, status: row.delivery },
      });
      campaignMap.set(row.campaignName, campaign);
    } else if (campaign.status !== row.delivery) {
      await prisma.metaCampaign.update({ where: { id: campaign.id }, data: { status: row.delivery } });
      campaign.status = row.delivery;
    }

    // Baris agregat lama (region="") untuk (kampanye, tanggal) ini harus dihapus
    // saat data per-wilayah masuk — kalau tidak, spend terhitung dobel.
    if (row.region !== "") {
      const legacyKey = `${campaign.id}|${startDate.toISOString()}`;
      if (!legacyCleaned.has(legacyKey)) {
        await prisma.metaAdDaily.deleteMany({
          where: { metaCampaignId: campaign.id, date: startDate, region: "" },
        });
        legacyCleaned.add(legacyKey);
      }
    }

    const existingDaily = await prisma.metaAdDaily.findUnique({
      where: {
        metaCampaignId_date_region: {
          metaCampaignId: campaign.id, date: startDate, region: row.region,
        },
      },
    });

    const dailyData = {
      spendIDR: row.spend, impressions: row.impressions, reach: row.reach,
      frequency: row.frequency, uniqueLinkClicks: row.uniqueLinkClicks,
      results: row.results, resultIndicator: row.resultIndicator,
      costPerResult: row.costPerResult, delivery: row.delivery,
      region: row.region, shopClicks: row.shopClicks, cpc: row.cpc, ctr: row.ctr,
      allClicks: row.allClicks, allCtr: row.allCtr, allCpc: row.allCpc,
      landingPageViews: row.landingPageViews, costPerLpv: row.costPerLpv, cpm: row.cpm,
      lastImportId: importBatch.id,
    };

    if (existingDaily) {
      await prisma.metaAdDaily.update({ where: { id: existingDaily.id }, data: dailyData });
      result.updated++;
    } else {
      await prisma.metaAdDaily.create({ data: { metaCampaignId: campaign.id, date: startDate, ...dailyData } });
      result.inserted++;
    }

    rows[i] = null as never; // lepaskan baris terproses agar bisa di-GC (file besar)
    if ((i + 1) % YIELD_EVERY === 0) {
      await yieldEventLoop();
    }
    if ((i + 1) % PROGRESS_EVERY === 0) {
      updateImportProgress(i + 1, result);
    }
    if ((i + 1) % BATCH_SIZE === 0) {
      await saveProgress(importBatch.id, result);
    }
  }

  await saveProgress(importBatch.id, result);
  return result;
}

// ========== SHOPEE CLICK IMPORT ==========
export async function importShopeeClickCsv(
  shopeeAccountId: number,
  fileName: string,
  rows: ShopeeClickRow[],
  fileMeta?: ImportFileMeta
): Promise<ImportResult> {
  const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  // Inline agar string JSON besar tidak tertahan di scope selama impor berjalan
  const fileHash = computeFileHash(JSON.stringify(rows));

  const existing = await prisma.importBatch.findUnique({ where: { fileHash } });
  if (existing) {
    result.skipped = rows.length;
    result.errors.push(`File "${fileName}" sudah pernah diimpor sebelumnya.`);
    return result;
  }

  const staleError = await checkFileIsNewer("shopee_click", shopeeAccountId, fileName, fileMeta);
  if (staleError) {
    result.skipped = rows.length;
    result.errors.push(staleError);
    return result;
  }

  const importBatch = await prisma.importBatch.create({
    data: {
      type: "shopee_click", accountId: shopeeAccountId, accountType: "shopee",
      fileName, fileHash, ...fileMetaData(fileMeta),
    },
  });

  beginImportRows(rows.length);

  // Pre-fetch campaigns
  const existingCampaigns = await prisma.shopeeCampaign.findMany({ where: { shopeeAccountId } });
  const campaignMap = new Map(existingCampaigns.map(c => [c.name.toLowerCase(), c.id]));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Kecualikan trafik internal Shopee (video/live) — lewati, jangan masuk DB.
    if (isExcludedShopeePlatform(row.perujuk)) {
      result.skipped++;
      rows[i] = null as never;
      if ((i + 1) % PROGRESS_EVERY === 0) updateImportProgress(i + 1, result);
      continue;
    }

    const { tag1, tag2 } = parseTagRaw(row.tagRaw);
    const clickTime = parseDateWib(row.waktuKlik);

    let campaignId: number | null = null;
    if (tag1) {
      const key = tag1.toLowerCase();
      if (campaignMap.has(key)) {
        campaignId = campaignMap.get(key)!;
      } else {
        const campaign = await prisma.shopeeCampaign.create({ data: { shopeeAccountId, name: tag1 } });
        campaignId = campaign.id;
        campaignMap.set(key, campaignId);
      }
    }

    const existingClick = await prisma.shopeeClick.findUnique({ where: { klikId: row.klikId } });
    if (existingClick) {
      result.skipped++;
    } else {
      await prisma.shopeeClick.create({
        data: {
          klikId: row.klikId, shopeeAccountId, waktuKlik: row.waktuKlik,
          clickTimeUTC: clickTime,
          wilayah: row.wilayah, tagRaw: row.tagRaw, tag1, tag2,
          shopeeCampaignId: campaignId, perujuk: row.perujuk,
          lastImportId: importBatch.id,
        },
      });
      result.inserted++;
    }

    rows[i] = null as never; // lepaskan baris terproses agar bisa di-GC (file besar)
    if ((i + 1) % YIELD_EVERY === 0) {
      await yieldEventLoop();
    }
    if ((i + 1) % PROGRESS_EVERY === 0) {
      updateImportProgress(i + 1, result);
    }
    if ((i + 1) % BATCH_SIZE === 0) {
      await saveProgress(importBatch.id, result);
    }
  }

  await saveProgress(importBatch.id, result);
  return result;
}

// ========== SHOPEE COMMISSION IMPORT ==========
export async function importShopeeCommissionCsv(
  shopeeAccountId: number,
  fileName: string,
  rows: ShopeeCommissionRow[],
  fileMeta?: ImportFileMeta
): Promise<ImportResult> {
  const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  // Inline agar string JSON besar tidak tertahan di scope selama impor berjalan
  const fileHash = computeFileHash(JSON.stringify(rows));

  const existing = await prisma.importBatch.findUnique({ where: { fileHash } });
  if (existing) {
    result.skipped = rows.length;
    result.errors.push(`File "${fileName}" sudah pernah diimpor sebelumnya.`);
    return result;
  }

  const staleError = await checkFileIsNewer("shopee_commission", shopeeAccountId, fileName, fileMeta);
  if (staleError) {
    result.skipped = rows.length;
    result.errors.push(staleError);
    return result;
  }

  const importBatch = await prisma.importBatch.create({
    data: {
      type: "shopee_commission", accountId: shopeeAccountId, accountType: "shopee",
      fileName, fileHash, ...fileMetaData(fileMeta),
    },
  });

  beginImportRows(rows.length);

  // Pre-fetch campaigns
  const existingCampaigns = await prisma.shopeeCampaign.findMany({ where: { shopeeAccountId } });
  const campaignMap = new Map(existingCampaigns.map(c => [c.name.toLowerCase(), c.id]));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Kecualikan trafik internal Shopee (video/live) — lewati, jangan masuk DB.
    if (isExcludedShopeePlatform(row.platform)) {
      result.skipped++;
      rows[i] = null as never;
      if ((i + 1) % PROGRESS_EVERY === 0) updateImportProgress(i + 1, result);
      continue;
    }

    let campaignId: number | null = null;
    if (row.tag1) {
      const key = row.tag1.toLowerCase();
      if (campaignMap.has(key)) {
        campaignId = campaignMap.get(key)!;
      } else {
        const campaign = await prisma.shopeeCampaign.create({ data: { shopeeAccountId, name: row.tag1 } });
        campaignId = campaign.id;
        campaignMap.set(key, campaignId);
      }
    }

    const clickTime = parseDateWib(row.waktuKlik);
    const orderTime = parseDateWib(row.waktuPemesanan);
    const completeTime = parseDateWib(row.waktuTerselesaikan);

    const pk = { idPemesanan: row.idPemesanan, idBarang: row.idBarang, idModel: row.idModel, idPromosi: row.idPromosi };

    const existingOrder = await prisma.shopeeOrderItem.findUnique({
      where: { idPemesanan_idBarang_idModel_idPromosi: pk },
    });

    const data = {
      shopeeAccountId, statusPesanan: row.statusPesanan,
      waktuKlik: row.waktuKlik, waktuPemesanan: row.waktuPemesanan,
      waktuTerselesaikan: row.waktuTerselesaikan,
      namaToko: row.namaToko, idShop: row.idShop, tipeToko: row.tipeToko,
      namaBarang: row.namaBarang, l1Kategori: row.l1Kategori,
      l2Kategori: row.l2Kategori, l3Kategori: row.l3Kategori,
      hargaRp: row.hargaRp, jumlah: row.jumlah,
      nilaiPembelianRp: row.nilaiPembelianRp, refundRp: row.refundRp,
      komisiBersihRp: row.komisiBersihRp,
      komisiShopeePct: row.komisiShopeePct,
      komisiXtraPct: row.komisiXtraPct,
      kodePesananAffiliate: row.kodePesananAffiliate,
      tipeProduk: row.tipeProduk,
      tipePenawaran: row.tipePenawaran,
      kampanyePartner: row.kampanyePartner,
      komisiBarangShopeeRp: row.komisiBarangShopeeRp,
      komisiXtraProdukRp: row.komisiXtraProdukRp,
      totalKomisiProdukRp: row.totalKomisiProdukRp,
      komisiShopeePesananRp: row.komisiShopeePesananRp,
      komisiXtraPesananRp: row.komisiXtraPesananRp,
      totalKomisiPesananRp: row.totalKomisiPesananRp,
      namaMcn: row.namaMcn,
      idKontrakMcn: row.idKontrakMcn,
      biayaMcnPct: row.biayaMcnPct,
      biayaMcnRp: row.biayaMcnRp,
      pembagianKomisiPct: row.pembagianKomisiPct,
      catatanProduk: row.catatanProduk,
      statusProdukAffiliate: row.statusProdukAffiliate,
      tipePesanan: row.tipePesanan, statusPembelian: row.statusPembelian,
      tag1: row.tag1, tag2: row.tag2, tag3: row.tag3, tag4: row.tag4, tag5: row.tag5,
      platform: row.platform, shopeeCampaignId: campaignId,
      clickTimeUTC: clickTime,
      orderTimeUTC: orderTime,
      completeTimeUTC: completeTime,
      lastImportId: importBatch.id,
    };

    if (existingOrder) {
      await prisma.shopeeOrderItem.update({ where: { idPemesanan_idBarang_idModel_idPromosi: pk }, data });
      result.updated++;
    } else {
      await prisma.shopeeOrderItem.create({ data: { ...pk, ...data } });
      result.inserted++;
    }

    rows[i] = null as never; // lepaskan baris terproses agar bisa di-GC (file besar)
    if ((i + 1) % YIELD_EVERY === 0) {
      await yieldEventLoop();
    }
    if ((i + 1) % PROGRESS_EVERY === 0) {
      updateImportProgress(i + 1, result);
    }
    if ((i + 1) % BATCH_SIZE === 0) {
      await saveProgress(importBatch.id, result);
    }
  }

  await saveProgress(importBatch.id, result);
  return result;
}
