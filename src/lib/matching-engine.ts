// =========== MATCHING ENGINE ===========
// Mesin pencocokan MetaCampaign ↔ ShopeeCampaign untuk Campaign Hub.
// Dua sinyal: (1) kemiripan nama (brand/keyword/substring/n-gram),
// (2) pola aktivitas harian — ko-aktivitas spend Meta vs pesanan Shopee
//     (per tanggal klik, dari laporan komisi).
// Murni (tanpa I/O) supaya bisa diuji/dievaluasi di luar route handler.

// Known brand prefixes on Meta side — these tell us the "channel"
export const META_BRAND_PREFIXES = ["SM", "RV", "OOTD", "CR", "VN", "Demik", "DuniaSukaViral", "SukaViral", "Suka Viral", "ViralNih", "SerbaMurah", "RandomViral", "Spilin"];

// Map Meta brand prefixes to their Shopee brand/category equivalents
const BRAND_MAP = new Map<string, string[]>([
  ["SM", ["SM", "SerbaMurah"]],
  ["RV", ["RV", "RandomViral"]],
  ["OOTD", ["OOTD", "ootd"]],
  ["CR", ["CR", "CeritaReceh", "SerbaMurah"]],
  ["VN", ["VN", "ViralNih"]],
  ["Demik", ["Demik"]],
  ["DuniaSukaViral", ["SukaViral", "DuniaSukaViral"]],
  ["SukaViral", ["SukaViral", "DuniaSukaViral"]],
  ["Suka Viral", ["SukaViral", "DuniaSukaViral"]],
  ["ViralNih", ["ViralNih", "VN"]],
  ["SerbaMurah", ["SM", "SerbaMurah", "CR"]],
  ["RandomViral", ["RV", "RandomViral"]],
  ["Spilin", ["Spilin"]],
]);

// Known product name synonyms / aliases for fuzzy matching
const PRODUCT_SYNONYMS = new Map<string, string[]>([
  ["lembesi", ["lembesi", "setrika", "iron"]],
  ["pagarjaring", ["pagarjaring", "pagar jaring"]],
  ["cubickitchen", ["cubickitchen", "cubic kitchen"]],
  ["waterheater", ["waterheater", "water heater", "pemanas air"]],
  ["guntingpotongsudut", ["guntingpotongsudut", "gunting potong sudut"]],
  ["gunting", ["gunting", "gunting dapur"]],
  ["pembersihbulu", ["pembersihbulu", "pembersih bulu ayam", "pencabut bulu"]],
  ["pembersihbuluayam", ["pembersihbuluayam", "pembersih bulu ayam", "pencabut bulu"]],
  ["pelapiskaca", ["pelapiskaca", "pelapis kaca"]],
  ["penanambenih", ["penanambenih", "penanam benih"]],
  ["tabungpenyusutpanas", ["tabungpenyusutpanas", "tabung penyusut panas", "heat shrink"]],
  ["lampuledstrip", ["lampuledstrip", "lampu led strip"]],
  ["lamputumbler", ["lamputumbler", "lampu tumbler", "lamputumblr"]],
  ["pintukabineldapur", ["pintukabineldapur", "pintu kabinet dapur"]],
  ["sofacantik", ["sofacantik", "sofa", "sofa maharaja"]],
  ["sofa", ["sofa", "sofacantik", "sofa maharaja"]],
  ["eyeshadow", ["eyeshadow", "eyeshadowstik"]],
  ["gordenjepang", ["gordenjepang", "gorden jepang", "gorden"]],
  ["gordenponi", ["gordenponi", "gorden poni", "ponigorden"]],
  ["gordenpintuponi", ["gordenpintuponi", "gorden pintu poni", "gordenponi"]],
  ["gordenmagic", ["gordenmagic", "gorden magic"]],
  ["mesinimpact", ["mesinimpact", "mesin impact", "impact"]],
  ["kitchen", ["kitchen", "cubickitchen", "dapur"]],
  ["pistolpakubeton", ["pistolpakubeton", "pistol paku beton"]],
  ["bracketsiku", ["bracketsiku", "bracket siku"]],
  ["penggarissiku", ["penggarissiku", "penggaris siku"]],
  ["coversofa", ["coversofa", "cover sofa", "sofa"]],
  ["flashgun", ["flashgun", "flame gun", "flamegun"]],
  ["flamegun", ["flamegun", "flame gun", "flashgun"]],
  ["tirainyamuk", ["tirainyamuk", "tirai nyamuk"]],
  ["kasur", ["kasur", "kasur lipat"]],
  ["mesinpengaduksemen", ["mesinpengaduksemen", "mesin pengaduk semen", "aduk semen"]],
  ["komportanam", ["komportanam", "kompor tanam", "kompor"]],
  ["cetakanbakso", ["cetakanbakso", "cetakan bakso"]],
  ["pembersihkaca", ["pembersihkaca", "pembersih kaca"]],
  ["pembersihsepatu", ["pembersihsepatu", "pembersih sepatu"]],
  ["peganganamplas", ["peganganamplas", "pegangan amplas"]],
  ["pembersihtoilet", ["pembersihtoilet", "pembersih toilet"]],
  ["tangankabel", ["tangkabel", "tang kabel", "tangkabel"]],
  ["tangkabel", ["tangkabel", "tang kabel"]],
  ["tirapintubunga", ["tirapintubunga", "tirai pintu bunga"]],
  ["tiraipintumerak", ["tiraipintumerak", "tirai pintu merak"]],
  ["lembaridapur", ["lembaridapur", "lemari dapur"]],
  ["sarungtangan", ["sarungtangan", "sarung tangan", "sarung tangancendol"]],
  ["sarungtangancendol", ["sarungtangancendol", "sarung tangan"]],
  ["pembersihayam", ["pembersihayam", "pembersih ayam"]],
  ["cukurrambut", ["cukurrambut", "cukur rambut", "alat cukur"]],
  ["rakkolong", ["rakkolong", "rak kolong", "rakkolongdapur"]],
  ["rakkolongdapur", ["rakkolongdapur", "rak kolong dapur"]],
  ["mejamarmer", ["mejamarmer", "meja marmer", "meja makan marmer"]],
  ["mejamakanmarmer", ["mejamakanmarmer", "meja makan marmer"]],
  ["kacaspionbulat", ["kacaspionbulat", "kaca spion bulat", "kaca spion"]],
  ["tiraigulung", ["tiraigulung", "tirai gulung lipat"]],
  ["keyboardmini", ["keyboardmini", "keyboard mini"]],
  ["keyboardlipat", ["keyboardlipat", "keyboard lipat"]],
  ["kipaslampu", ["kipaslampu", "kipas lampu"]],
  ["batanglas", ["batanglas", "batang las"]],
  ["alatalatpijat", ["alatpijat", "alat pijat", "pemijat"]],
  ["alatpijat", ["alatpijat", "alat pijat", "pemijat"]],
  ["pemijat", ["pemijat", "alat pijat", "alatpijat"]],
  ["tutupbotolpeniramtanaman", ["tutupbotolpeniramtanaman", "tutup botol penyiram"]],
  ["tutupbotolpenyiram", ["tutupbotolpenyiram", "tutup botol penyiram"]],
  ["printerfood", ["printerfood", "food printer"]],
  ["foodprinter", ["foodprinter", "food printer", "printerfood"]],
  ["casechargerhape", ["casechargerhape", "case charger hp", "casechargerhp", "pelindung charger"]],
  ["pelindungcharger", ["pelindungcharger", "case charger hp", "pelindung charger"]],
  ["pintudapurbawah", ["pintudapurbawah", "pintu dapur bawah"]],
  ["semprotanantikarat", ["semprotanantikarat", "semprotan anti karat"]],
  ["sprayhelm", ["sprayhelm", "spray helm"]],
  ["cectvbohlam", ["cctvbohlam", "cctv bohlam"]],
  ["cctv", ["cctv", "cctvbohlam"]],
  ["inkjetprinter", ["inkjetprinter", "ink jet printer"]],
  ["gergajimesin", ["gergajimesin", "gergaji mesin", "gergajimesin2"]],
  ["magnetbesi", ["magnetbesi", "magnet besi"]],
  ["mataobeng", ["mataobeng", "mata obeng"]],
  ["jaketuv", ["jaketuv", "jaket uv", "jaket anti uv", "jaketantiuv"]],
  ["jasukehujann", ["jasukehujann", "jaket uv"]],
  ["dastermotif", ["dastermotif", "daster motif"]],
  ["tas", ["tas", "tas wanita", "tas motif"]],
  ["daster", ["daster", "daster motif"]],
  ["sarbenpayung", ["sarbenpayung", "sarben payung"]],
  ["payungcover", ["payungcover", "payung cover"]],
  ["sepatubayi", ["sepatubayi", "sepatu bayi"]],
  ["sepatuputih", ["sepatuputih", "sepatu putih"]],
  ["pancigagangstainless", ["pancigagangstainless", "panci gagang stainless"]],
  ["penyiraman tanaman", ["penyiraman tanaman", "tutup botol penyiram"]],
  ["lembesiabum", ["lembesiabum", "lembesi abu"]],
  ["lembesiabu", ["lembesiabu", "lembesi abu"]],
  ["whaterheater", ["whaterheater", "water heater"]],
]);

// STOP WORDS — noise words to strip from matching
const STOP_WORDS = new Set([
  "duplikat", "duplicate", "duplikat1", "duplikat2", "duplikat3", "duplikat4", "duplikat5",
  "jan", "feb", "mar", "apr", "mei", "jun", "jul", "agu", "sep", "okt", "nov", "des",
  "januari", "februari", "maret", "april", "juni", "juli", "agustus", "september", "oktober", "november", "desember",
  "baru", "new", "mini", "viral", "terbaru",
]);

/**
 * Extract brand prefix from Meta campaign name
 * e.g. "SM CubicKitchen 26 Juni" → "SM"
 * e.g. "OOTD LampuLEDStrip 09Juli" → "OOTD"
 */
export function extractMetaBrand(name: string): string | null {
  const upper = name.trim().toUpperCase();
  for (const prefix of META_BRAND_PREFIXES) {
    if (upper.startsWith(prefix.toUpperCase())) {
      return prefix;
    }
  }
  return null;
}

/**
 * Check if a Shopee campaign name matches any of the brand names associated with a Meta brand
 */
function brandMatches(metaBrand: string | null, shopeeName: string): boolean {
  if (!metaBrand) return true; // no brand info -> don't filter by brand
  const allowedBrands = BRAND_MAP.get(metaBrand);
  if (!allowedBrands) return true;
  const upperShopee = shopeeName.toLowerCase();
  return allowedBrands.some(b => upperShopee.includes(b.toLowerCase()));
}

/**
 * Extract product keywords (tokens) from a campaign name, removing brand prefixes, dates, numbers, stop words
 */
function extractKeywords(name: string): string[] {
  // Remove common date patterns
  let cleaned = name
    .replace(/\d+\s*(jan|feb|mar|apr|mei|jun|jul|agu|sep|okt|nov|des)\w*/gi, " ")
    .replace(/\d+/g, " ")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Remove known brand prefixes from the start
  for (const brand of META_BRAND_PREFIXES) {
    if (cleaned.toUpperCase().startsWith(brand.toUpperCase())) {
      cleaned = cleaned.slice(brand.length).trim();
      break;
    }
  }

  // Split by capital letters (CamelCase) AND spaces — important for names like "PagarJaring", "CubicKitchen"
  const words: string[] = [];
  // First split by whitespace
  const parts = cleaned.split(/\s+/);
  for (const part of parts) {
    if (!part) continue;
    // Then split CamelCase
    const subWords = part.split(/(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/);
    for (const w of subWords) {
      const lower = w.toLowerCase().trim();
      if (lower && !STOP_WORDS.has(lower) && lower.length > 1) {
        words.push(lower);
      }
    }
  }

  // Remove duplicates while preserving order
  return [...new Set(words)];
}

/**
 * Get all synonyms for a given keyword
 */
function getSynonyms(word: string): Set<string> {
  const result = new Set<string>([word]);
  const syns = PRODUCT_SYNONYMS.get(word);
  if (syns) {
    for (const s of syns) result.add(s);
  }
  // Also check if this word is a synonym of something else (reverse lookup)
  for (const [key, values] of PRODUCT_SYNONYMS) {
    if (values.includes(word) && key !== word) {
      result.add(key);
      for (const v of values) result.add(v);
    }
  }
  return result;
}

/**
 * Compute a semantic match score between two sets of keywords
 */
function keywordMatchScore(metaWords: string[], shopeeWords: string[]): number {
  if (metaWords.length === 0 || shopeeWords.length === 0) return 0;

  let matchCount = 0;
  const matchedShopee = new Set<number>();

  for (const mw of metaWords) {
    const mwSyns = getSynonyms(mw);
    let found = false;
    for (let j = 0; j < shopeeWords.length; j++) {
      if (matchedShopee.has(j)) continue;
      const sw = shopeeWords[j];
      const swSyns = getSynonyms(sw);
      // Check if any synonym overlaps
      for (const ms of mwSyns) {
        if (swSyns.has(ms) || sw.includes(ms) || ms.includes(sw)) {
          matchCount++;
          matchedShopee.add(j);
          found = true;
          break;
        }
      }
      if (found) break;
    }
  }

  // F1-like score
  const precision = metaWords.length > 0 ? matchCount / metaWords.length : 0;
  const recall = shopeeWords.length > 0 ? matchCount / shopeeWords.length : 0;
  if (precision + recall === 0) return 0;
  return 2 * (precision * recall) / (precision + recall);
}

/**
 * N-gram similarity (character-level)
 */
function charNgramSimilarity(a: string, b: string, n: number = 3): number {
  const aNgrams = new Set<string>();
  const bNgrams = new Set<string>();

  for (let i = 0; i <= a.length - n; i++) aNgrams.add(a.substring(i, i + n));
  for (let i = 0; i <= b.length - n; i++) bNgrams.add(b.substring(i, i + n));

  if (aNgrams.size === 0 || bNgrams.size === 0) return 0;

  let common = 0;
  for (const ng of aNgrams) {
    if (bNgrams.has(ng)) common++;
  }

  return common / Math.max(aNgrams.size, bNgrams.size);
}

function cleanName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize name for simple substring checks
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/(duplikat|duplicate)/g, "duplikat")
    .replace(/(\d+)(jan|feb|mar|apr|mei|jun|jul|agu|sep|okt|nov|des)/g, "$1");
}

// =========== SINYAL DATA: KO-AKTIVITAS HARIAN ===========
// Deret harian = Map "yyyy-MM-dd" (tanggal WIB, lihat aturan WIB-as-UTC) → nilai.
// Meta: hari dengan spend > 0. Shopee: jumlah item pesanan per tanggal klik
// (statusPesanan != "Dibatalkan").
//
// Hasil kalibrasi pada tautan tersimpan vs pasangan acak (Jul 2026):
// - |selisih tanggal mulai| ≤ 2 hari:  39% vs 7%
// - cover ≥ 0.6:                       42% vs 14%
// - konsentrasi ≥ 0.5:                 41% vs 9%
// Korelasi Pearson bentuk-kurva harian TIDAK diskriminatif (jangan dipakai).

export type DailySeries = Map<string, number>;

const DAY_MS = 86400000;

function addDaysIso(d: string, n: number): string {
  return new Date(Date.parse(d + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
}

function diffDaysIso(a: string, b: string): number {
  return Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / DAY_MS);
}

export interface DataMatch {
  score: number;     // 0..1
  startDiff: number; // |hari pertama pesanan Shopee − hari pertama spend Meta|
  cover: number;     // porsi hari-aktif-Meta yang punya pesanan Shopee
  conc: number;      // porsi pesanan Shopee yang jatuh di jendela iklan Meta ±1 hari
}

/**
 * Skor kecocokan berbasis pola aktivitas harian.
 * `maxOrderDate` = tanggal pesanan terakhir yang tersedia di DB (global) —
 * hari Meta setelah tanggal itu tidak ikut dihitung (datanya memang belum ada).
 * Return null bila data tidak cukup (< 2 hari Meta ter-cover data, atau < 3 pesanan).
 */
export function dataMatchScore(
  metaS: DailySeries | undefined,
  shopS: DailySeries | undefined,
  maxOrderDate: string | null,
): DataMatch | null {
  if (!metaS || !shopS || !maxOrderDate || metaS.size === 0 || shopS.size === 0) return null;

  const allMetaDates = [...metaS.keys()].sort();
  const metaStart = allMetaDates[0];
  const metaDates = allMetaDates.filter((d) => d <= maxOrderDate);
  if (metaDates.length < 2) return null;

  let totalOrders = 0;
  for (const v of shopS.values()) totalOrders += v;
  if (totalOrders < 3) return null;

  const shopStart = [...shopS.keys()].sort()[0];
  const startDiff = Math.abs(diffDaysIso(shopStart, metaStart));

  const both = metaDates.filter((d) => (shopS.get(d) || 0) > 0).length;
  const cover = both / metaDates.length;

  const lo = addDaysIso(metaDates[0], -1);
  const hi = addDaysIso(metaDates[metaDates.length - 1], 1);
  let inWindow = 0;
  for (const [d, v] of shopS) {
    if (d >= lo && d <= hi) inWindow += v;
  }
  const conc = inWindow / totalOrders;

  const startProx = Math.max(0, 1 - startDiff / 7);
  const score = 0.35 * startProx + 0.35 * cover + 0.3 * conc;
  return { score, startDiff, cover, conc };
}

// =========== SARAN KONEKSI ===========

export interface CampaignLite {
  id: number;
  name: string;
}

export interface SuggestionResult {
  metaCampaignId: number;
  metaCampaignName: string;
  shopeeCampaignId: number;
  shopeeCampaignName: string;
  score: number;            // 0-100, gabungan
  nameScore: number;        // 0-100, sinyal nama saja
  dataScore: number | null; // 0-100, sinyal pola data (null = data tidak cukup)
}

/**
 * Hitung saran koneksi Meta → Shopee (satu kandidat terbaik per kampanye Meta).
 * - Skor nama: brand filter + keyword semantik + substring + char-n-gram (logika lama).
 * - Skor data (opsional): ko-aktivitas harian; menyesuaikan skor nama
 *   (menguatkan bila pola cocok, melemahkan bila bertentangan), dan bisa
 *   menembus filter brand untuk pasangan lintas-brand bila polanya kuat.
 * - Data saja tanpa sinyal nama TIDAK memicu saran — banyak kampanye
 *   diluncurkan serentak sehingga pola harian saja ambigu.
 */
interface NameCtx {
  brand: string | null;
  keywords: string[];
  clean: string;
  norm: string;
}

function buildNameCtx(name: string): NameCtx {
  return {
    brand: extractMetaBrand(name),
    keywords: extractKeywords(name),
    clean: cleanName(name),
    norm: normalizeName(name),
  };
}

/** Skor kemiripan nama (langkah 2–7, tanpa filter brand) — 0..~1. */
function nameScoreCtx(meta: NameCtx, shopee: NameCtx): number {
  let score = 0;

  // 2. Keyword semantic matching (primary)
  const kwScore = keywordMatchScore(meta.keywords, shopee.keywords);
  if (kwScore > 0) {
    score += kwScore * 0.6; // keyword match weight
  }

  // 3. Substring matching (strong signal) — porsi nama panjang yang ter-cover
  //    nama pendek (0..1); dulu rasio terbalik (selalu ≥1) sehingga tag generik
  //    pendek ("ootd") menang telak atas semua nama panjang.
  if (meta.norm.includes(shopee.norm) || shopee.norm.includes(meta.norm)) {
    const subScore = Math.min(shopee.norm.length, meta.norm.length) / Math.max(shopee.norm.length, meta.norm.length);
    score = Math.max(score, subScore * 0.9);
  }

  // 4. N-gram similarity (bonus for partial character overlap)
  const ngScore = charNgramSimilarity(meta.clean, shopee.clean);
  if (ngScore > 0.3) {
    score += ngScore * 0.2;
  }

  // 5. Brand match bonus (same brand prefix = strong signal)
  if (meta.brand && shopee.brand && meta.brand === shopee.brand) {
    score += 0.15;
  }

  // 6. Penalty for very short names (too generic)
  if (meta.keywords.length <= 1 && shopee.keywords.length <= 1) {
    score *= 0.5;
  }

  // 7. Penalty if Meta has many more/fewer keywords than Shopee (mismatch in specificity)
  const kwRatio = Math.min(meta.keywords.length, shopee.keywords.length) / Math.max(meta.keywords.length, shopee.keywords.length);
  if (kwRatio < 0.5 && (meta.keywords.length > 2 || shopee.keywords.length > 2)) {
    score *= 0.7;
  }

  return score;
}

/** Skor nama untuk satu pasangan (utk audit/inspeksi) — tanpa filter brand. */
export function scorePairName(metaName: string, shopeeName: string): number {
  return nameScoreCtx(buildNameCtx(metaName), buildNameCtx(shopeeName));
}

export function suggestConnections(
  metaCampaigns: CampaignLite[],
  shopeeCampaigns: CampaignLite[],
  metaSeries: Map<number, DailySeries>,
  orderSeries: Map<number, DailySeries>,
  maxOrderDate: string | null,
): SuggestionResult[] {
  const suggestions: SuggestionResult[] = [];
  if (shopeeCampaigns.length === 0) return suggestions;

  // Pre-process all Shopee keywords once
  const shopeeKeyed = shopeeCampaigns.map(shopee => ({
    campaign: shopee,
    ctx: buildNameCtx(shopee.name),
  }));

  for (const meta of metaCampaigns) {
    const metaCtx = buildNameCtx(meta.name);
    const mSeries = metaSeries.get(meta.id);

    let bestScore = 0;
    let bestShopee: CampaignLite | null = null;
    let bestName = 0;
    let bestData: DataMatch | null = null;

    for (const sk of shopeeKeyed) {
      const data = dataMatchScore(mSeries, orderSeries.get(sk.campaign.id), maxOrderDate);

      // 1. Brand filter: skip if brands don't match — kecuali pola data kuat
      //    (tag Shopee kadang dipakai lintas-brand, mis. OOTD ↔ RV)
      const brandOk = brandMatches(metaCtx.brand, sk.campaign.name);
      if (!brandOk && (!data || data.score < 0.55)) continue;

      const nameScore = nameScoreCtx(metaCtx, sk.ctx);

      // 8. Blend dengan sinyal data: >0.25 menguatkan, <0.25 melemahkan.
      //    Boost diskalakan dengan keyakinan nama (penuh mulai nama ≥ 0.3) —
      //    kampanye sering diluncurkan serentak, jadi pola harian yang mirip
      //    TANPA sinyal nama yang berarti bukan bukti pasangan.
      let final = nameScore;
      if (data && nameScore >= 0.1) {
        final = nameScore + 0.4 * (data.score - 0.25) * Math.min(1, nameScore / 0.3);
      }
      if (!brandOk) final *= 0.85; // lintas-brand: tetap beri sedikit penalti
      if (final < 0) final = 0;

      if (final > bestScore && final > 0.25) {
        bestScore = final;
        bestShopee = sk.campaign;
        bestName = nameScore;
        bestData = data;
      }
    }

    if (bestScore > 0.3 && bestShopee) {
      suggestions.push({
        metaCampaignId: meta.id,
        metaCampaignName: meta.name,
        shopeeCampaignId: bestShopee.id,
        shopeeCampaignName: bestShopee.name,
        score: Math.round(bestScore * 100),
        nameScore: Math.round(bestName * 100),
        dataScore: bestData ? Math.round(bestData.score * 100) : null,
      });
    }
  }

  // Sort by score descending
  suggestions.sort((a, b) => b.score - a.score);
  return suggestions;
}
