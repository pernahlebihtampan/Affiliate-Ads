import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const fromDate = url.searchParams.get("from");
  const toDate = url.searchParams.get("to");

  // Dapatkan semua campaign hubs yang ter-mapping
  const hubs = await prisma.campaignHub.findMany({
    include: {
      metaCampaign: {
        include: {
          dailyStats: {
            where: {
              ...(fromDate ? { date: { gte: new Date(fromDate) } } : {}),
              ...(toDate ? { date: { lte: new Date(toDate) } } : {}),
            },
          },
        },
      },
      shopeeCampaign: {
        include: {
          orderItems: {
            where: {
              statusPesanan: { not: "Dibatalkan" },
              ...(fromDate
                ? { clickTimeUTC: { gte: new Date(fromDate) } }
                : {}),
              ...(toDate
                ? { clickTimeUTC: { lte: new Date(toDate + "T23:59:59") } }
                : {}),
            },
          },
        },
      },
    },
  });

  // Kumpulkan spend per tanggal dari MetaAdDaily
  const spendMap = new Map<string, number>();
  for (const hub of hubs) {
    for (const stat of hub.metaCampaign.dailyStats) {
      const dateKey = stat.date.toISOString().split("T")[0];
      spendMap.set(dateKey, (spendMap.get(dateKey) || 0) + stat.spendIDR);
    }
  }

  // Kumpulkan komisi per tanggal dari ShopeeOrderItem (clickTimeUTC)
  const komisiMap = new Map<string, number>();
  for (const hub of hubs) {
    for (const item of hub.shopeeCampaign.orderItems) {
      if (!item.clickTimeUTC) continue;
      const dateKey = item.clickTimeUTC.toISOString().split("T")[0];
      komisiMap.set(dateKey, (komisiMap.get(dateKey) || 0) + item.komisiBersihRp);
    }
  }

  // Merge semua tanggal (dari spendMap dan komisiMap)
  const allDates = new Set<string>([...spendMap.keys(), ...komisiMap.keys()]);
  const sortedDates = Array.from(allDates).sort();

  const dailyData = sortedDates.map((date) => {
    const komisi = komisiMap.get(date) || 0;
    const spend = spendMap.get(date) || 0;
    return {
      date,
      komisi,
      spend,
      profit: komisi - spend,
    };
  });

  return NextResponse.json(dailyData);
}
