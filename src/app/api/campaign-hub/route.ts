import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// =========== MATCHING ENGINE ===========

// Known brand prefixes on Meta side — these tell us the "channel"
const META_BRAND_PREFIXES = ["SM", "RV", "OOTD", "CR", "VN", "Demik", "DuniaSukaViral", "SukaViral", "Suka Viral", "ViralNih", "SerbaMurah", "RandomViral", "Spilin"];

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
  ["tabungpenyusutpanas", ["tabungpenyusutpanas", "tabung penyusut panas"]],
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
  ["pagarjaring", ["pagarjaring", "pagar jaring"]],
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
  ["tirainyamuk", ["tirainyamuk", "tirai nyamuk"]],
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
  ["jasukehujann", ["jasukehujann", "jasuke hujan"]],
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
function extractMetaBrand(name: string): string | null {
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

// =========== ENDPOINTS ===========

export async function GET() {
  // Get all Meta campaigns
  const metaCampaigns = await prisma.metaCampaign.findMany({
    include: {
      metaAdAccount: true,
      hub: { include: { shopeeCampaign: true } },
    },
    orderBy: { name: "asc" },
  });

  // Get all Shopee campaigns
  const shopeeCampaigns = await prisma.shopeeCampaign.findMany({
    include: {
      shopeeAccount: true,
      hub: true,
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ metaCampaigns, shopeeCampaigns });
}

export async function POST(request: NextRequest) {
  try {
  const body = await request.json();

  if (body.action === "link") {
    const { metaCampaignId, shopeeCampaignId } = body;

    // Validasi: jika ShopeeCampaign sudah terhubung ke Meta lain, putus dulu
    const existingHub = await prisma.campaignHub.findUnique({
      where: { shopeeCampaignId },
    });
    if (existingHub && existingHub.metaCampaignId !== metaCampaignId) {
      // Shopee ini sudah terhubung ke Meta lain — putus yang lama
      await prisma.campaignHub.delete({
        where: { metaCampaignId: existingHub.metaCampaignId },
      });
    }

    const hub = await prisma.campaignHub.upsert({
      where: { metaCampaignId },
      update: { shopeeCampaignId },
      create: { metaCampaignId, shopeeCampaignId },
    });
    return NextResponse.json(hub);
  }

  if (body.action === "unlink") {
    await prisma.campaignHub.delete({
      where: { metaCampaignId: body.metaCampaignId },
    });
    return NextResponse.json({ success: true });
  }

  if (body.action === "suggest") {
    const shopeeCampaigns = await prisma.shopeeCampaign.findMany({
      where: { hub: null },
      include: { shopeeAccount: true, hub: true },
    });
    const metaCampaigns = await prisma.metaCampaign.findMany({
      where: { hub: null, dailyStats: { some: { spendIDR: { gt: 0 } } } },
      include: { metaAdAccount: true, hub: { include: { shopeeCampaign: true } } },
    });

    const suggestions: Array<{
      metaCampaignId: number;
      metaCampaignName: string;
      shopeeCampaignId: number;
      shopeeCampaignName: string;
      score: number;
    }> = [];

    // Pre-process all Shopee keywords once
    const shopeeKeyed = shopeeCampaigns.map(shopee => ({
      campaign: shopee,
      keywords: extractKeywords(shopee.name),
      clean: cleanName(shopee.name),
      norm: normalizeName(shopee.name),
    }));

    for (const meta of metaCampaigns) {
      const metaBrand = extractMetaBrand(meta.name);
      const metaKeywords = extractKeywords(meta.name);
      const metaClean = cleanName(meta.name);
      const metaNorm = normalizeName(meta.name);
      
      let bestScore = 0;
      let bestShopee = shopeeCampaigns[0];

      for (const sk of shopeeKeyed) {
        // 1. Brand filter: skip if brands don't match
        if (!brandMatches(metaBrand, sk.campaign.name)) continue;

        let score = 0;

        // 2. Keyword semantic matching (primary)
        const kwScore = keywordMatchScore(metaKeywords, sk.keywords);
        if (kwScore > 0) {
          score += kwScore * 0.6; // keyword match weight
        }

        // 3. Substring matching (strong signal)
        if (metaNorm.includes(sk.norm) || sk.norm.includes(metaNorm)) {
          const subScore = Math.max(sk.norm.length / metaNorm.length, metaNorm.length / sk.norm.length);
          score = Math.max(score, subScore * 0.9);
        }

        // 4. N-gram similarity (bonus for partial character overlap)
        const ngScore = charNgramSimilarity(metaClean, sk.clean);
        if (ngScore > 0.3) {
          score += ngScore * 0.2;
        }

        // 5. Brand match bonus (same brand prefix = strong signal)
        const shopeeBrand = extractMetaBrand(sk.campaign.name);
        if (metaBrand && shopeeBrand && metaBrand === shopeeBrand) {
          score += 0.15;
        }

        // 6. Penalty for very short names (too generic)
        if (metaKeywords.length <= 1 && sk.keywords.length <= 1) {
          score *= 0.5;
        }

        // 7. Penalty if Meta has many more/fewer keywords than Shopee (mismatch in specificity)
        const kwRatio = Math.min(metaKeywords.length, sk.keywords.length) / Math.max(metaKeywords.length, sk.keywords.length);
        if (kwRatio < 0.5 && (metaKeywords.length > 2 || sk.keywords.length > 2)) {
          score *= 0.7;
        }

        if (score > bestScore && score > 0.25) {
          bestScore = score;
          bestShopee = sk.campaign;
        }
      }

      if (bestScore > 0.3 && bestShopee) {
        suggestions.push({
          metaCampaignId: meta.id,
          metaCampaignName: meta.name,
          shopeeCampaignId: bestShopee.id,
          shopeeCampaignName: bestShopee.name,
          score: Math.round(bestScore * 100),
        });
      }
    }

    // Sort by score descending
    suggestions.sort((a, b) => b.score - a.score);

    return NextResponse.json({ suggestions, shopeeCampaigns, metaCampaigns });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("CampaignHub POST error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
