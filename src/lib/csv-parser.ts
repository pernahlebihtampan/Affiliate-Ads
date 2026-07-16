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
  
  // New columns from updated CSV (28 columns)
  region: string;
  shopClicks: number;
  cpc: number;
  ctr: number;
  allClicks: number;
  allCtr: number;
  allCpc: number;
  landingPageViews: number;
  costPerLpv: number;
  cpm: number;
}

export function parseMetaAdCsv(content: string): { rows: MetaAdRow[]; errors: string[] } {
  const result = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,

  });

  const errors: string[] = [];

  // CSV Meta versi baru dipecah per-Wilayah: ada ~34 baris (satu per provinsi) untuk
  // tiap (kampanye, tanggal). Jangan dedup ambil-satu-wilayah (dulu membuang ~98% spend);
  // AGREGASIKAN dengan menjumlahkan metrik dasar per (kampanye|tanggal), lalu hitung
  // ulang rasio (cpc/ctr/cpm/frequency) dari hasil penjumlahan.
  const agg = new Map<string, MetaAdRow>();

  for (let i = 0; i < result.data.length; i++) {
    const raw = result.data[i] as Record<string, string>;
    if (!raw["Nama kampanye"]) {
      errors.push(`Baris ${i + 2}: Nama kampanye kosong, dilewati`);
      continue;
    }

    const name = raw["Nama kampanye"] || "";
    const startDate = raw["Awal pelaporan"] || "";
    const key = `${name}|${startDate}`;

    // Handle column name variants (old CSV vs new CSV)
    // Old: "Klik Tautan Unik"  New: "Klik tautan"
    const uniqueLinkClicksRaw = raw["Klik tautan"] || raw["Klik Tautan Unik"] || "0";

    const spend = parseFloatSafe(raw["Jumlah yang dibelanjakan (IDR)"]);
    const impressions = parseIntSafe(raw["Impresi"]);
    const reach = parseIntSafe(raw["Jangkauan"]);
    const uniqueLinkClicks = parseIntSafe(uniqueLinkClicksRaw);
    const results = parseIntSafe(raw["Hasil"]);
    const shopClicks = parseIntSafe(raw["shop_clicks"]);
    const allClicks = parseIntSafe(raw["Klik (semua)"]);
    const landingPageViews = parseIntSafe(raw["Tayangan halaman tujuan"]);

    const existing = agg.get(key);
    if (existing) {
      // Jumlahkan metrik yang aditif lintas wilayah
      existing.spend += spend;
      existing.impressions += impressions;
      existing.reach += reach;
      existing.uniqueLinkClicks += uniqueLinkClicks;
      existing.results += results;
      existing.shopClicks += shopClicks;
      existing.allClicks += allClicks;
      existing.landingPageViews += landingPageViews;
    } else {
      agg.set(key, {
        campaignName: name,
        delivery: raw["Penayangan kampanye"] || "",
        results,
        resultIndicator: raw["Indikator Hasil"] || "",
        costPerResult: 0, // dihitung ulang setelah agregasi
        spend,
        impressions,
        reach,
        frequency: 0, // dihitung ulang
        uniqueLinkClicks,
        startDate,
        endDate: raw["Akhir pelaporan"] || "",
        budget: raw["Anggaran Set Iklan"] || "",
        budgetType: raw["Jenis Anggaran Set Iklan"] || "",
        ends: raw["Berakhir"] || "",
        attribution: raw["Pengaturan atribusi"] || "",
        resultsInitial: raw["Hasil (awal)"] || "",
        resultIndicatorInitial: raw["Indikator hasil (awal)"] || "",

        region: "", // agregat semua wilayah (bukan satu provinsi)
        shopClicks,
        cpc: 0,
        ctr: 0,
        allClicks,
        allCtr: 0,
        allCpc: 0,
        landingPageViews,
        costPerLpv: 0,
        cpm: 0,
      });
    }
  }

  // Hitung ulang rasio turunan dari metrik dasar yang sudah dijumlahkan
  const rows: MetaAdRow[] = [];
  for (const r of agg.values()) {
    r.frequency = r.reach > 0 ? r.impressions / r.reach : 0;
    r.cpc = r.uniqueLinkClicks > 0 ? r.spend / r.uniqueLinkClicks : 0;
    r.ctr = r.impressions > 0 ? r.uniqueLinkClicks / r.impressions : 0;
    r.allCpc = r.allClicks > 0 ? r.spend / r.allClicks : 0;
    r.allCtr = r.impressions > 0 ? r.allClicks / r.impressions : 0;
    r.cpm = r.impressions > 0 ? (r.spend / r.impressions) * 1000 : 0;
    r.costPerResult = r.results > 0 ? r.spend / r.results : 0;
    r.costPerLpv = r.landingPageViews > 0 ? r.spend / r.landingPageViews : 0;
    rows.push(r);
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
  const cleaned = value.replace(/[Rp\s]/g, "").replace(/,.*$/, "").replace(/\./g, "");
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}

function parseFloatSafe(value: string): number {
  if (!value || value === "--" || value === "-" || value === "") return 0;
  let cleaned = value.replace(/[Rp\s]/g, "");
  // Handle ID format: 1.234,56 (thousand sep dot, decimal comma)
  if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}
