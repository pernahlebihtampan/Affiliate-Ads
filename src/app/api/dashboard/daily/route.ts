import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseDateUtc(dateStr: string): Date {
  // Parse YYYY-MM-DD sebagai UTC agar konsisten dengan DateTime di database
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function parseDateUtcEndOfDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
}

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
              ...(fromDate ? { date: { gte: parseDateUtc(fromDate) } } : {}),
              ...(toDate ? { date: { lte: parseDateUtc(toDate) } } : {}),
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
                ? { clickTimeUTC: { gte: parseDateUtc(fromDate) } }
                : {}),
              ...(toDate
                ? { clickTimeUTC: { lte: parseDateUtcEndOfDay(toDate) } }
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

  // Tentukan rentang tanggal penuh dari filter yang dipilih
  let startDate: Date, endDate: Date;
  if (fromDate) {
    startDate = parseDateUtc(fromDate);
  } else {
    const allDates = [...spendMap.keys(), ...komisiMap.keys()].sort();
    startDate = allDates.length > 0 ? new Date(allDates[0] + "T00:00:00Z") : new Date();
    startDate.setUTCDate(startDate.getUTCDate() - 30);
  }

  if (toDate) {
    endDate = parseDateUtc(toDate);
  } else {
    endDate = new Date();
  }

  // Generate seluruh rentang tanggal (termasuk tanggal tanpa data)
  const dailyData: { date: string; komisi: number; spend: number; profit: number }[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    const dateKey = current.toISOString().split("T")[0];
    const komisi = komisiMap.get(dateKey) || 0;
    const spend = spendMap.get(dateKey) || 0;
    dailyData.push({
      date: dateKey,
      komisi,
      spend,
      profit: komisi - spend,
    });
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return NextResponse.json(dailyData);
}

