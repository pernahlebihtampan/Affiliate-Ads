import Papa from "papaparse";

// ========== META ADS CAMPAIGN REPORT ==========
export interface MetaAdRow {
  campaignName: string;
  delivery: string;
  results: number;
  resultIndicator: string;
  costPerResult: number;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  uniqueLinkClicks: number;
  startDate: string;
  endDate: string;
  budget: string;
  budgetType: string;
  ends: string;
  attribution: string;
  resultsInitial: string;
  resultIndicatorInitial: string;
}

export function parseMetaAdCsv(content: string): { rows: MetaAdRow[]; errors: string[] } {
  const result = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,

  });

  const errors: string[] = [];
  const rows: MetaAdRow[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < result.data.length; i++) {
    const raw = result.data[i] as Record<string, string>;
    if (!raw["Nama kampanye"]) {
      errors.push(`Baris ${i + 2}: Nama kampanye kosong, dilewati`);
      continue;
    }

    const name = raw["Nama kampanye"] || "";
    const key = `${name}|${raw["Awal pelaporan"] || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      campaignName: name,
      delivery: raw["Penayangan kampanye"] || "",
      results: parseIntSafe(raw["Hasil"]),
      resultIndicator: raw["Indikator Hasil"] || "",
      costPerResult: parseFloatSafe(raw["Biaya per Hasil"]),
      spend: parseFloatSafe(raw["Jumlah yang dibelanjakan (IDR)"]),
      impressions: parseIntSafe(raw["Impresi"]),
      reach: parseIntSafe(raw["Jangkauan"]),
      frequency: parseFloatSafe(raw["Frekuensi"]),
      uniqueLinkClicks: parseIntSafe(raw["Klik Tautan Unik"]),
      startDate: raw["Awal pelaporan"] || "",
      endDate: raw["Akhir pelaporan"] || "",
      budget: raw["Anggaran Set Iklan"] || "",
      budgetType: raw["Jenis Anggaran Set Iklan"] || "",
      ends: raw["Berakhir"] || "",
      attribution: raw["Pengaturan atribusi"] || "",
      resultsInitial: raw["Hasil (awal)"] || "",
      resultIndicatorInitial: raw["Indikator hasil (awal)"] || "",
    });
  }

  return { rows, errors };
}

// ========== SHOPEE WEBSITE CLICK REPORT ==========
export interface ShopeeClickRow {
  klikId: string;
  waktuKlik: string;
  wilayah: string;
  tagRaw: string;
  perujuk: string;
}

export function parseShopeeClickCsv(content: string): { rows: ShopeeClickRow[]; errors: string[] } {
  const result = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,

  });

  const errors: string[] = [];
  const rows: ShopeeClickRow[] = [];

  // Find the actual header - sometimes there's BOM or extra rows
  const data = result.data as Record<string, string>[];

  for (let i = 0; i < data.length; i++) {
    const raw = data[i];
    const klikId = raw["Klik ID"] || raw["\ufeffKlik ID"] || "";
    if (!klikId) {
      errors.push(`Baris ${i + 2}: Klik ID kosong, dilewati`);
      continue;
    }

    rows.push({
      klikId,
      waktuKlik: raw["Waktu Klik"] || "",
      wilayah: raw["Wilayah Klik"] || "",
      tagRaw: raw["Tag_link"] || "",
      perujuk: raw["Perujuk"] || "",
    });
  }

  return { rows, errors };
}

// ========== SHOPEE AFFILIATE COMMISSION REPORT ==========
export interface ShopeeCommissionRow {
  idPemesanan: string;
  statusPesanan: string;
  kodePesananAffiliate: string;
  waktuPemesanan: string;
  waktuTerselesaikan: string;
  waktuKlik: string;
  namaToko: string;
  idShop: string;
  tipeToko: string;
  idBarang: string;
  namaBarang: string;
  idModel: string;
  tipeProduk: string;
  idPromosi: string;
  l1Kategori: string;
  l2Kategori: string;
  l3Kategori: string;
  hargaRp: number;
  jumlah: number;
  tipePenawaran: string;
  kampanyePartner: string;
  nilaiPembelianRp: number;
  refundRp: number;
  komisiBersihRp: number;
  statusProdukAffiliate: string;
  catatanProduk: string;
  tipePesanan: string;
  statusPembelian: string;
  tag1: string;
  tag2: string;
  tag3: string;
  tag4: string;
  tag5: string;
  platform: string;
}

export function parseShopeeCommissionCsv(content: string): { rows: ShopeeCommissionRow[]; errors: string[] } {
  const result = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,

  });

  const errors: string[] = [];
  const rows: ShopeeCommissionRow[] = [];

  const data = result.data as Record<string, string>[];

  for (let i = 0; i < data.length; i++) {
    const raw = data[i];
    const idPemesanan = raw["ID Pemesanan"] || "";
    const idBarang = raw["ID Barang"] || "";
    const idModel = raw["ID Model"] || "";
    const idPromosi = raw["ID Promosi"] || "";

    if (!idPemesanan || !idBarang) {
      errors.push(`Baris ${i + 2}: ID Pemesanan atau ID Barang kosong, dilewati`);
      continue;
    }

    rows.push({
      idPemesanan,
      statusPesanan: raw["Status Pesanan"] || "",
      kodePesananAffiliate: raw["Kode Pesanan Affiliate"] || "",
      waktuPemesanan: raw["Waktu Pemesanan"] || "",
      waktuTerselesaikan: raw["Waktu Terselesaikan"] || "",
      waktuKlik: raw["Waktu Klik"] || "",
      namaToko: raw["Nama Toko"] || "",
      idShop: raw["ID Shop"] || "",
      tipeToko: raw["Tipe toko."] || "",
      idBarang,
      namaBarang: raw["Nama Barange"] || "",
      idModel,
      tipeProduk: raw["Tipe Produk"] || "",
      idPromosi,
      l1Kategori: raw["L1 Kategori Global"] || "",
      l2Kategori: raw["L2 Kategori Global"] || "",
      l3Kategori: raw["L3 Kategori Global"] || "",
      hargaRp: parseFloatSafe(raw["Harga(Rp)"]),
      jumlah: parseIntSafe(raw["Jumlah"]),
      tipePenawaran: raw["Tipe Penawaran"] || "",
      kampanyePartner: raw["Kampanye Partnerr"] || "",
      nilaiPembelianRp: parseFloatSafe(raw["Nilai Pembelian(Rp)"]),
      refundRp: parseFloatSafe(raw["Jumlah Pengembalian Dana(Rp)"]),
      komisiBersihRp: parseFloatSafe(raw["Komisi Bersih Affiliate (Rp)"]),
      statusProdukAffiliate: raw["Status Produk Affiliate"] || "",
      catatanProduk: raw["Catatan Produk"] || "",
      tipePesanan: raw["Tipe Pesanan"] || "",
      statusPembelian: raw["Status Pemebelian"] || "",
      tag1: raw["Tag_link1"] || "",
      tag2: raw["Tag_link2"] || "",
      tag3: raw["Tag_link3"] || "",
      tag4: raw["Tag_link4"] || "",
      tag5: raw["Tag_link5"] || "",
      platform: raw["Platform"] || "",
    });
  }

  return { rows, errors };
}

// Helper functions for parsing
function parseIntSafe(value: string): number {
  if (!value || value === "--" || value === "-" || value === "") return 0;
  let cleaned = value.replace(/[Rp\s]/g, "").replace(/\./g, "");
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}

function parseFloatSafe(value: string): number {
  if (!value || value === "--" || value === "-" || value === "") return 0;
  let cleaned = value.replace(/[Rp\s]/g, "").replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}
