import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/(duplikat|duplicate)/g, "duplikat")
    .replace(/(\d+)(jan|feb|mar|apr|mei|jun|jul|agu|sep|okt|nov|des)/g, "$1");
}

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

    // Fuzzy matching
    for (const meta of metaCampaigns) {
      const metaNorm = normalizeName(meta.name);
      let bestScore = 0;
      let bestShopee = shopeeCampaigns[0];

      for (const shopee of shopeeCampaigns) {
        const shopeeNorm = normalizeName(shopee.name);
        let score = 0;

        // Exact substring match
        if (metaNorm.includes(shopeeNorm) || shopeeNorm.includes(metaNorm)) {
          score = Math.max(
            shopeeNorm.length / metaNorm.length,
            metaNorm.length / shopeeNorm.length
          );
        }

        // Character overlap
        const common = [...metaNorm].filter((c) => shopeeNorm.includes(c)).length;
        const overlapScore = common / Math.max(metaNorm.length, shopeeNorm.length);
        score = Math.max(score, overlapScore);

        if (score > bestScore) {
          bestScore = score;
          bestShopee = shopee;
        }
      }

      if (bestScore > 0.4 && bestShopee) {
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
