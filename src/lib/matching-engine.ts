// =========== MATCHING ENGINE ===========
// Mesin pencocokan MetaCampaign ↔ ShopeeCampaign untuk Campaign Hub.
// Dua sinyal: (1) kemiripan nama (brand/keyword/substring/n-gram),
// (2) pola aktivitas harian — ko-aktivitas spend Meta vs pesanan Shopee
//     (per tanggal klik, dari laporan komisi).
// Murni (tanpa I/O) supaya bisa diuji/dievaluasi di luar route handler.

// Known brand prefixes on Meta side — these tell us the "channel"
export const META_BRAND_PREFIXES = ["SM", "RV", "OOTD", "CR", "VN", "Demik", "DuniaSukaViral", "SukaViral", "Suka Viral", "ViralNih", "SerbaMurah", "RandomViral", "Spilin"];

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
      // Check if any synonym overlaps. Substring match hanya untuk token ≥4 huruf
      // supaya keyword pendek ("in" dari "6in1") tak menempel ke kata acak
      // ("pr[in]terfood"). Kecocokan persis/sinonim tetap diterima apa adanya.
      for (const ms of mwSyns) {
        if (swSyns.has(ms) || (Math.min(sw.length, ms.length) >= 4 && (sw.includes(ms) || ms.includes(sw)))) {
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

// =========== SARAN KONEKSI (berbasis containment nama) ===========
// Nama kampanye Meta = GABUNGAN beberapa nama tag Shopee (1 Meta : banyak tag).
// Kadang tag dirangkai tanpa spasi & tanpa mengulang kode brand (RV/SM/…) di
// tengah, mis. "RVLampuMiniGalaxiSikatVelgPompaBanInjak" memuat tag Shopee
// "RVSikatVelg" & "RVPompaBanInjak" (yang di nama Meta hanya "SikatVelg" dst).
// Karena itu untuk tiap Meta kami cari SEMUA tag Shopee yang "terkandung":
//   1. substring persis dari nama Meta ternormalisasi — dicoba dengan DAN tanpa
//      prefix brand tag (menangkap kasus tanpa-spasi/tanpa-brand-tengah);
//   2. fuzzy untuk varian typo/urutan-kata: skor per-segmen (pisah spasi) +
//      gram-recall char-3-gram atas seluruh nama (toleran urutan & tanpa spasi).
// Sinyal data (ko-aktivitas harian) hanya DITAMPILKAN sebagai info per tag,
// tidak memengaruhi pemilihan (pencocokan murni berbasis nama sesuai desain).

export interface CampaignLite {
  id: number;
  name: string;
}

export interface TagCandidate {
  shopeeCampaignId: number;
  shopeeCampaignName: string;
  nameScore: number;        // 0-100, skor nama
  contained: boolean;       // true = substring persis (dengan/tanpa prefix brand)
  dataScore: number | null; // 0-100, info pola data (null = data tidak cukup)
}

export interface MetaTagSuggestion {
  metaCampaignId: number;
  metaCampaignName: string;
  candidates: TagCandidate[]; // urut: terkandung dulu, lalu skor tertinggi
}

// Ambang minimum skor nama fuzzy agar sebuah tag disarankan (terkandung = 1.0).
const NAME_SCORE_THRESHOLD = 0.5;

/** Buang prefix brand dari nama tag ("RVSikatVelg" → "SikatVelg"). */
function stripBrandPrefix(name: string): string {
  const b = extractMetaBrand(name);
  return b ? name.slice(b.length) : name;
}

/**
 * Normalisasi untuk uji containment: buang tanggal/`duplikat`/simbol/angka →
 * hanya huruf a-z tanpa spasi. Sisi Meta & tag dinormalisasi identik supaya
 * "SMKlipKasur" cocok apakah muncul dengan spasi, tanpa spasi, atau tanpa brand.
 */
function normForContainment(name: string): string {
  return name
    .toLowerCase()
    .replace(/\d+\s*(jan|feb|mar|apr|mei|jun|jul|agu|sep|okt|nov|des)\w*/g, " ")
    .replace(/duplikat\d*/g, " ")
    .replace(/[^a-z0-9]/g, "")
    .replace(/[0-9]/g, "");
}

function gramSet(s: string, n = 3): Set<string> {
  const g = new Set<string>();
  for (let i = 0; i <= s.length - n; i++) g.add(s.substring(i, i + n));
  return g;
}

/**
 * Porsi char-3-gram `needle` yang muncul di `hay` (0..1). Toleran urutan kata &
 * tanpa spasi — dipakai mencocokkan tag di nama Meta yang dirangkai tanpa spasi.
 */
function gramRecall(hay: string, needle: string): number {
  if (needle.length < 5) return 0;
  const H = gramSet(hay);
  const N = gramSet(needle);
  if (N.size === 0) return 0;
  let common = 0;
  for (const g of N) if (H.has(g)) common++;
  return common / N.size;
}

/**
 * Pecah nama Meta menjadi segmen ~1 tag: pisah spasi, gabungkan token yang hanya
 * berisi kode brand ("OOTD") ke token berikutnya, buang token brand menggantung.
 * Untuk nama tanpa spasi ini menghasilkan satu segmen — pencocokan fuzzi/
 * containment yang menangani kasus itu (extractKeywords tetap memecah CamelCase).
 */
function metaSegments(name: string): string[] {
  const raw = name.trim().split(/\s+/).filter(Boolean);
  const segs: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    const isBrandOnly = META_BRAND_PREFIXES.some((b) => b.toUpperCase() === t.toUpperCase());
    if (isBrandOnly) {
      if (i + 1 < raw.length && extractMetaBrand(raw[i + 1]) === null) {
        segs.push(t + raw[i + 1]);
        i++;
      }
      continue; // token brand-only menggantung → buang
    }
    segs.push(t);
  }
  return segs.length ? segs : [name];
}

/** Berapa keyword `target` yang cocok (persis/sinonim/substring≥4) di `source`. */
function keywordOverlapCount(source: string[], target: string[]): number {
  let m = 0;
  const used = new Set<number>();
  for (const t of target) {
    const tSyn = getSynonyms(t);
    for (let i = 0; i < source.length; i++) {
      if (used.has(i)) continue;
      const s = source[i];
      const sSyn = getSynonyms(s);
      let hit = false;
      for (const ts of tSyn) {
        if (sSyn.has(ts) || (Math.min(s.length, ts.length) >= 4 && (s.includes(ts) || ts.includes(s)))) {
          hit = true;
          break;
        }
      }
      if (hit) {
        m++;
        used.add(i);
        break;
      }
    }
  }
  return m;
}

/** Skor kemiripan satu segmen Meta vs satu tag (keyword+sinonim, n-gram, brand). */
function segmentScore(seg: string, tag: string): number {
  const kw = keywordMatchScore(extractKeywords(seg), extractKeywords(tag));
  const ng = charNgramSimilarity(cleanName(seg), cleanName(tag));
  let s = kw * 0.7 + (ng > 0.3 ? ng * 0.3 : 0);
  const bs = extractMetaBrand(seg);
  const bt = extractMetaBrand(tag);
  if (bs && bt) s = bs === bt ? s + 0.1 : s * 0.85; // brand cocok menguatkan, beda melemahkan
  return Math.min(1, s);
}

interface TagScore {
  score: number;     // 0..1
  contained: boolean;
}

/** Skor satu tag Shopee terhadap satu nama kampanye Meta. */
function scoreTagInMeta(metaName: string, metaNorm: string, segs: string[], tag: string): TagScore {
  const tagFull = normForContainment(tag);
  const tagStripped = normForContainment(stripBrandPrefix(tag));

  // 1. Containment persis — coba nama tag penuh, lalu tanpa prefix brand
  //    (nama Meta tanpa-spasi sering tak mengulang brand di tengah).
  if (tagFull.length >= 4 && metaNorm.includes(tagFull)) return { score: 1, contained: true };
  if (tagStripped.length >= 5 && metaNorm.includes(tagStripped)) return { score: 1, contained: true };

  // 2. Fuzzy: skor per-segmen (bagus untuk nama ber-spasi & sinonim produk)
  let seg = 0;
  for (const s of segs) seg = Math.max(seg, segmentScore(s, tag));

  // 3. Fuzzy: gram-recall atas seluruh nama (bagus untuk tanpa-spasi & urutan),
  //    di-gate keyword-recall agar tumpang-tindih gram acak tak lolos.
  const gr = Math.max(gramRecall(metaNorm, tagFull), gramRecall(metaNorm, tagStripped));
  const tagKw = extractKeywords(tag);
  const kwRecall = tagKw.length ? keywordOverlapCount(extractKeywords(metaName), tagKw) / tagKw.length : 0;
  let fuzzy = kwRecall > 0 || gr >= 0.6 ? 0.65 * gr + 0.35 * kwRecall : 0;
  const bm = extractMetaBrand(metaName);
  const bt = extractMetaBrand(tag);
  if (bm && bt && bm !== bt) fuzzy *= 0.7; // lintas-brand: turunkan (sinyal data yg tangkap kasus ini)

  return { score: Math.max(seg, fuzzy), contained: false };
}

/**
 * Saran koneksi per kampanye Meta: SEMUA tag Shopee yang terkandung/cocok di
 * namanya (banyak tag per Meta), plus info skor data untuk tiap tag.
 * `shopeeCampaigns` sebaiknya hanya tag yang belum tertaut.
 */
export function suggestTagGroups(
  metaCampaigns: CampaignLite[],
  shopeeCampaigns: CampaignLite[],
  metaSeries: Map<number, DailySeries>,
  orderSeries: Map<number, DailySeries>,
  maxOrderDate: string | null,
): MetaTagSuggestion[] {
  const groups: MetaTagSuggestion[] = [];
  if (shopeeCampaigns.length === 0) return groups;

  for (const meta of metaCampaigns) {
    const metaNorm = normForContainment(meta.name);
    const segs = metaSegments(meta.name);
    const mSeries = metaSeries.get(meta.id);

    const candidates: TagCandidate[] = [];
    for (const shopee of shopeeCampaigns) {
      const { score, contained } = scoreTagInMeta(meta.name, metaNorm, segs, shopee.name);
      if (score < NAME_SCORE_THRESHOLD) continue;
      const data = dataMatchScore(mSeries, orderSeries.get(shopee.id), maxOrderDate);
      candidates.push({
        shopeeCampaignId: shopee.id,
        shopeeCampaignName: shopee.name,
        nameScore: Math.round(Math.min(1, score) * 100),
        contained,
        dataScore: data ? Math.round(data.score * 100) : null,
      });
    }
    if (candidates.length === 0) continue;

    candidates.sort(
      (a, b) =>
        Number(b.contained) - Number(a.contained) ||
        b.nameScore - a.nameScore ||
        a.shopeeCampaignName.localeCompare(b.shopeeCampaignName),
    );
    groups.push({ metaCampaignId: meta.id, metaCampaignName: meta.name, candidates });
  }

  // Meta dengan tag terkandung terbanyak di atas.
  groups.sort((a, b) => {
    const ac = a.candidates.filter((c) => c.contained).length;
    const bc = b.candidates.filter((c) => c.contained).length;
    return bc - ac || b.candidates.length - a.candidates.length || a.metaCampaignName.localeCompare(b.metaCampaignName);
  });
  return groups;
}
