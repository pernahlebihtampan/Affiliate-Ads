import { prisma } from "./prisma";
import { computeFileHash, parseTagRaw, parseDateSafe, wibToUtc } from "./utils";
import type { MetaAdRow, ShopeeClickRow, ShopeeCommissionRow } from "./csv-parser";

export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

// ========== META ADS IMPORT ==========
export async function importMetaAdCsv(
  metaAdAccountId: number,
  fileName: string,
  rows: MetaAdRow[]
): Promise<ImportResult> {
  const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  const fileContent = JSON.stringify(rows);
  const fileHash = computeFileHash(fileContent);

  // Check duplicate file
  const existing = await prisma.importBatch.findUnique({ where: { fileHash } });
  if (existing) {
    result.skipped = rows.length;
    result.errors.push(`File "${fileName}" sudah pernah diimpor sebelumnya.`);
    return result;
  }

  const importBatch = await prisma.importBatch.create({
    data: {
      type: "meta",
      accountId: metaAdAccountId,
      accountType: "meta",
      fileName,
      fileHash,
    },
  });

  for (const row of rows) {
    const startDate = parseDateSafe(row.startDate);
    if (!startDate) {
      result.skipped++;
      continue;
    }
    startDate.setHours(0, 0, 0, 0);

    // Get or create MetaCampaign
    let campaign = await prisma.metaCampaign.findFirst({
      where: { metaAdAccountId, name: row.campaignName },
    });

    if (!campaign) {
      campaign = await prisma.metaCampaign.create({
        data: {
          metaAdAccountId,
          name: row.campaignName,
          status: row.delivery,
        },
      });
    } else if (campaign.status !== row.delivery) {
      await prisma.metaCampaign.update({
        where: { id: campaign.id },
        data: { status: row.delivery },
      });
    }

    // Upsert daily stat
    const existingDaily = await prisma.metaAdDaily.findUnique({
      where: { metaCampaignId_date: { metaCampaignId: campaign.id, date: startDate } },
    });

    if (existingDaily) {
      await prisma.metaAdDaily.update({
        where: { id: existingDaily.id },
        data: {
          spendIDR: row.spend,
          impressions: row.impressions,
          reach: row.reach,
          frequency: row.frequency,
          uniqueLinkClicks: row.uniqueLinkClicks,
          results: row.results,
          resultIndicator: row.resultIndicator,
          costPerResult: row.costPerResult,
          delivery: row.delivery,
          lastImportId: importBatch.id,
        },
      });
      result.updated++;
    } else {
      await prisma.metaAdDaily.create({
        data: {
          metaCampaignId: campaign.id,
          date: startDate,
          spendIDR: row.spend,
          impressions: row.impressions,
          reach: row.reach,
          frequency: row.frequency,
          uniqueLinkClicks: row.uniqueLinkClicks,
          results: row.results,
          resultIndicator: row.resultIndicator,
          costPerResult: row.costPerResult,
          delivery: row.delivery,
          lastImportId: importBatch.id,
        },
      });
      result.inserted++;
    }
  }

  await prisma.importBatch.update({
    where: { id: importBatch.id },
    data: {
      rowsInserted: result.inserted,
      rowsUpdated: result.updated,
      rowsSkipped: result.skipped,
    },
  });

  return result;
}

// ========== SHOPEE CLICK IMPORT ==========
export async function importShopeeClickCsv(
  shopeeAccountId: number,
  fileName: string,
  rows: ShopeeClickRow[]
): Promise<ImportResult> {
  const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  const fileContent = JSON.stringify(rows);
  const fileHash = computeFileHash(fileContent);

  const existing = await prisma.importBatch.findUnique({ where: { fileHash } });
  if (existing) {
    result.skipped = rows.length;
    result.errors.push(`File "${fileName}" sudah pernah diimpor sebelumnya.`);
    return result;
  }

  const importBatch = await prisma.importBatch.create({
    data: {
      type: "shopee_click",
      accountId: shopeeAccountId,
      accountType: "shopee",
      fileName,
      fileHash,
    },
  });

  for (const row of rows) {
    const { tag1, tag2 } = parseTagRaw(row.tagRaw);
    const clickTime = parseDateSafe(row.waktuKlik);

    // Get or create ShopeeCampaign from tag1
    let campaignId: number | null = null;
    if (tag1) {
      let campaign = await prisma.shopeeCampaign.findFirst({
        where: { shopeeAccountId, name: tag1 },
      });
      if (!campaign) {
        campaign = await prisma.shopeeCampaign.create({
          data: { shopeeAccountId, name: tag1 },
        });
      }
      campaignId = campaign.id;
    }

    // Insert or ignore by klikId
    const existingClick = await prisma.shopeeClick.findUnique({
      where: { klikId: row.klikId },
    });

    if (existingClick) {
      result.skipped++;
    } else {
      await prisma.shopeeClick.create({
        data: {
          klikId: row.klikId,
          shopeeAccountId,
          waktuKlik: row.waktuKlik,
          clickTimeUTC: clickTime ? wibToUtc(clickTime) : null,
          wilayah: row.wilayah,
          tagRaw: row.tagRaw,
          tag1,
          tag2,
          shopeeCampaignId: campaignId,
          perujuk: row.perujuk,
          lastImportId: importBatch.id,
        },
      });
      result.inserted++;
    }
  }

  await prisma.importBatch.update({
    where: { id: importBatch.id },
    data: {
      rowsInserted: result.inserted,
      rowsUpdated: result.updated,
      rowsSkipped: result.skipped,
    },
  });

  return result;
}

// ========== SHOPEE COMMISSION IMPORT ==========
export async function importShopeeCommissionCsv(
  shopeeAccountId: number,
  fileName: string,
  rows: ShopeeCommissionRow[]
): Promise<ImportResult> {
  const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  const fileContent = JSON.stringify(rows);
  const fileHash = computeFileHash(fileContent);

  const existing = await prisma.importBatch.findUnique({ where: { fileHash } });
  if (existing) {
    result.skipped = rows.length;
    result.errors.push(`File "${fileName}" sudah pernah diimpor sebelumnya.`);
    return result;
  }

  const importBatch = await prisma.importBatch.create({
    data: {
      type: "shopee_commission",
      accountId: shopeeAccountId,
      accountType: "shopee",
      fileName,
      fileHash,
    },
  });

  for (const row of rows) {
    // Get or create ShopeeCampaign from tag1
    let campaignId: number | null = null;
    if (row.tag1) {
      let campaign = await prisma.shopeeCampaign.findFirst({
        where: { shopeeAccountId, name: row.tag1 },
      });
      if (!campaign) {
        campaign = await prisma.shopeeCampaign.create({
          data: { shopeeAccountId, name: row.tag1 },
        });
      }
      campaignId = campaign.id;
    }

    const clickTime = parseDateSafe(row.waktuKlik);
    const orderTime = parseDateSafe(row.waktuPemesanan);
    const completeTime = parseDateSafe(row.waktuTerselesaikan);

    const pk = {
      idPemesanan: row.idPemesanan,
      idBarang: row.idBarang,
      idModel: row.idModel,
      idPromosi: row.idPromosi,
    };

    const existingOrder = await prisma.shopeeOrderItem.findUnique({
      where: { idPemesanan_idBarang_idModel_idPromosi: pk },
    });

    const data = {
      shopeeAccountId,
      statusPesanan: row.statusPesanan,
      waktuKlik: row.waktuKlik,
      waktuPemesanan: row.waktuPemesanan,
      waktuTerselesaikan: row.waktuTerselesaikan,
      namaToko: row.namaToko,
      idShop: row.idShop,
      tipeToko: row.tipeToko,
      namaBarang: row.namaBarang,
      l1Kategori: row.l1Kategori,
      l2Kategori: row.l2Kategori,
      l3Kategori: row.l3Kategori,
      hargaRp: row.hargaRp,
      jumlah: row.jumlah,
      nilaiPembelianRp: row.nilaiPembelianRp,
      refundRp: row.refundRp,
      komisiBersihRp: row.komisiBersihRp,
      statusProdukAffiliate: row.statusProdukAffiliate,
      tipePesanan: row.tipePesanan,
      statusPembelian: row.statusPembelian,
      tag1: row.tag1,
      tag2: row.tag2,
      tag3: row.tag3,
      tag4: row.tag4,
      tag5: row.tag5,
      platform: row.platform,
      shopeeCampaignId: campaignId,
      clickTimeUTC: clickTime ? wibToUtc(clickTime) : null,
      orderTimeUTC: orderTime ? wibToUtc(orderTime) : null,
      completeTimeUTC: completeTime ? wibToUtc(completeTime) : null,
      lastImportId: importBatch.id,
    };

    if (existingOrder) {
      await prisma.shopeeOrderItem.update({
        where: { idPemesanan_idBarang_idModel_idPromosi: pk },
        data,
      });
      result.updated++;
    } else {
      await prisma.shopeeOrderItem.create({
        data: { ...pk, ...data },
      });
      result.inserted++;
    }
  }

  await prisma.importBatch.update({
    where: { id: importBatch.id },
    data: {
      rowsInserted: result.inserted,
      rowsUpdated: result.updated,
      rowsSkipped: result.skipped,
    },
  });

  return result;
}
