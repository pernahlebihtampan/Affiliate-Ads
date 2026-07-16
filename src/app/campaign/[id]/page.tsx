"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard-layout";
import { formatCurrency, formatNumber } from "@/lib/utils";

interface DailyStat {
  id: number;
  metaCampaignId: number;
  date: string;
  spendIDR: number;
  impressions: number;
  reach: number;
  frequency: number;
  uniqueLinkClicks: number;
  results: number;
}

interface CampaignDetail {
  campaign: {
    id: number;
    name: string;
    status: string;
    metaAdAccount: { name: string };
    hub: { shopeeCampaign: { id: number; name: string } } | null;
    dailyStats: DailyStat[];
  };
  shopeeData: {
    items: Array<{
      namaBarang: string;
      namaToko: string;
      statusPesanan: string;
      nilaiPembelianRp: number;
      komisiBersihRp: number;
      jumlah: number;
    }>;
    clickHourHistogram: Array<{ hour: number; count: number }>;
    productBreakdown: Array<{ name: string; total: number; komisi: number; count: number }>;
    storeBreakdown: Array<{ name: string; total: number; komisi: number; count: number }>;
  } | null;
}

export default function CampaignDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/campaigns?id=${id}&type=meta`);
    const d = await res.json();
    setData(d);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Memuat...
        </div>
      </DashboardLayout>
    );
  }

  if (!data?.campaign) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Kampanye tidak ditemukan
        </div>
      </DashboardLayout>
    );
  }

  const { campaign, shopeeData } = data;
  const dailyStats = campaign.dailyStats || [];
  const totalSpend = dailyStats.reduce((s, d) => s + d.spendIDR, 0);
  const totalClicks = dailyStats.reduce((s, d) => s + d.uniqueLinkClicks, 0);
  const totalImpressions = dailyStats.reduce((s, d) => s + d.impressions, 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <Link href="/" className="text-sm text-primary hover:underline">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold mt-1">{campaign.name}</h1>
          <p className="text-sm text-muted-foreground">
            {campaign.metaAdAccount.name} · Status: {campaign.status}
            {campaign.hub && (
              <span className="ml-2">
                · Tag Shopee: <strong>{campaign.hub.shopeeCampaign.name}</strong>
              </span>
            )}
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Total Spend" value={formatCurrency(totalSpend)} />
          <SummaryCard label="Total Klik" value={formatNumber(totalClicks)} />
          <SummaryCard label="Impresi" value={formatNumber(totalImpressions)} />
          <SummaryCard
            label="CPC"
            value={totalClicks > 0 ? formatCurrency(totalSpend / totalClicks) : "Rp 0"}
          />
        </div>

        {/* Daily Trend Chart (simple bar chart using divs) */}
        {dailyStats.length > 0 && (
          <div className="bg-white rounded-lg border p-4">
            <h2 className="font-medium mb-3">Tren Harian: Spend vs Komisi</h2>
            <div className="relative h-40">
              <div className="flex items-end gap-1 h-32">
                {dailyStats.map((stat) => {
                  const maxVal = Math.max(
                    ...dailyStats.map((s) => Math.max(s.spendIDR, 1))
                  );
                  const spendPct = (stat.spendIDR / maxVal) * 100;
                  const dateLabel = new Date(stat.date).toLocaleDateString("id-ID", {
                    day: "2-digit",
                    month: "2-digit",
                  });
                  return (
                    <div
                      key={stat.id}
                      className="flex-1 flex flex-col items-center gap-0.5"
                    >
                      <div
                        className="w-full bg-blue-500 rounded-t"
                        style={{ height: `${Math.max(spendPct, 1)}%` }}
                        title={`${formatCurrency(stat.spendIDR)}`}
                      />
                      <span className="text-[10px] text-muted-foreground rotate-45 origin-left">
                        {dateLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Click Hour Histogram */}
        {shopeeData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg border p-4">
              <h2 className="font-medium mb-3">
                Jam Klik Shopee ({shopeeData.clickHourHistogram.reduce((s, h) => s + h.count, 0)} klik)
              </h2>
              <div className="flex items-end gap-0.5 h-24">
                {shopeeData.clickHourHistogram.map((h) => {
                  const maxCount = Math.max(
                    ...shopeeData.clickHourHistogram.map((x) => x.count),
                    1
                  );
                  const pct = (h.count / maxCount) * 100;
                  return (
                    <div key={h.hour} className="flex-1 flex flex-col items-center">
                      <div
                        className="w-full bg-orange-400 rounded-t"
                        style={{ height: `${Math.max(pct, h.count > 0 ? 3 : 0)}%` }}
                        title={`Jam ${h.hour}: ${h.count} klik`}
                      />
                      <span className="text-[9px] text-muted-foreground mt-0.5">
                        {h.hour}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Product Breakdown */}
            <div className="bg-white rounded-lg border p-4">
              <h2 className="font-medium mb-3">Produk Teratas</h2>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {shopeeData.productBreakdown.slice(0, 10).map((p) => (
                  <div key={p.name} className="flex justify-between text-sm">
                    <span className="truncate flex-1">{p.name}</span>
                    <span className="text-muted-foreground ml-2">
                      {formatCurrency(p.komisi)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Store Breakdown */}
        {shopeeData && (
          <div className="bg-white rounded-lg border p-4">
            <h2 className="font-medium mb-3">Toko</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {shopeeData.storeBreakdown.slice(0, 15).map((s) => (
                <div
                  key={s.name}
                  className="flex justify-between text-sm p-2 bg-gray-50 rounded"
                >
                  <span className="truncate">{s.name}</span>
                  <span className="font-medium">{formatCurrency(s.komisi)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Raw Daily Stats Table */}
        <div className="bg-white rounded-lg border overflow-hidden">
          <h2 className="p-3 font-medium border-b">Data Harian Meta</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left p-2 font-medium">Tanggal</th>
                  <th className="text-right p-2 font-medium">Spend</th>
                  <th className="text-right p-2 font-medium">Impresi</th>
                  <th className="text-right p-2 font-medium">Jangkauan</th>
                  <th className="text-right p-2 font-medium">Frekuensi</th>
                  <th className="text-right p-2 font-medium">Klik Unik</th>
                  <th className="text-right p-2 font-medium">Hasil</th>
                </tr>
              </thead>
              <tbody>
                {dailyStats.map((stat) => (
                  <tr key={stat.id} className="border-t">
                    <td className="p-2">
                      {new Date(stat.date).toLocaleDateString("id-ID")}
                    </td>
                    <td className="p-2 text-right">{formatCurrency(stat.spendIDR)}</td>
                    <td className="p-2 text-right">{formatNumber(stat.impressions)}</td>
                    <td className="p-2 text-right">{formatNumber(stat.reach)}</td>
                    <td className="p-2 text-right">{stat.frequency.toFixed(1)}</td>
                    <td className="p-2 text-right">{formatNumber(stat.uniqueLinkClicks)}</td>
                    <td className="p-2 text-right">{formatNumber(stat.results)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold mt-1">{value}</p>
    </div>
  );
}
