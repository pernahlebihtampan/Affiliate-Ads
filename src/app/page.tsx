"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { formatCurrency, formatNumber } from "@/lib/utils";

interface DashboardRow {
  metaCampaignId: number;
  metaCampaignName: string;
  metaAccountName: string;
  shopeeCampaignId: number;
  shopeeCampaignName: string;
  shopeeAccountName: string;
  spend: number;
  impressions: number;
  metaClicks: number;
  shopeeClicks: number;
  orders: number;
  items: number;
  nilaiPembelian: number;
  komisiTertunda: number;
  komisiSelesai: number;
  totalKomisi: number;
  roas: number;
  cpc: number;
  epc: number;
  cr: number;
}

interface Totals {
  spend: number;
  impressions: number;
  metaClicks: number;
  shopeeClicks: number;
  orders: number;
  items: number;
  nilaiPembelian: number;
  komisiTertunda: number;
  komisiSelesai: number;
  totalKomisi: number;
  roas: number;
}

interface OrganicStats {
  shopeeClicks: number;
  orders: number;
  items: number;
  nilaiPembelian: number;
  komisiTertunda: number;
  komisiSelesai: number;
  totalKomisi: number;
}

export default function DashboardPage() {
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [organic, setOrganic] = useState<OrganicStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await fetch(`/api/dashboard?${params}`);
      const data = await res.json();
      setRows(data.rows || []);
      setTotals(data.totals);
      setOrganic(data.organicStats);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getRoasColor = (roas: number) => {
    if (roas < 1) return "text-red-600 bg-red-50";
    if (roas < 2) return "text-yellow-600 bg-yellow-50";
    return "text-green-600 bg-green-50";
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Ringkasan performa kampanye ter-mapping
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-3 py-1.5 border rounded-md text-sm"
            />
            <span className="text-sm text-muted-foreground">s/d</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-3 py-1.5 border rounded-md text-sm"
            />
            <button
              onClick={fetchData}
              className="px-4 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-blue-700"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        {totals && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <SummaryCard label="Total Spend" value={formatCurrency(totals.spend)} />
            <SummaryCard label="Total Komisi" value={formatCurrency(totals.totalKomisi)} />
            <SummaryCard
              label="ROAS"
              value={totals.roas.toFixed(2) + "x"}
              colorClass={getRoasColor(totals.roas)}
            />
            <SummaryCard label="Pesanan" value={formatNumber(totals.orders)} />
            <SummaryCard label="Klik Meta" value={formatNumber(totals.metaClicks)} />
            <SummaryCard label="Klik Shopee" value={formatNumber(totals.shopeeClicks)} />
          </div>
        )}

        {/* Organic Summary */}
        {organic && organic.totalKomisi > 0 && (
          <div className="bg-white rounded-lg border p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              🧬 Organik / Unmapped
            </h3>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Klik:</span>{" "}
                {formatNumber(organic.shopeeClicks)}
              </div>
              <div>
                <span className="text-muted-foreground">Pesanan:</span>{" "}
                {formatNumber(organic.orders)}
              </div>
              <div>
                <span className="text-muted-foreground">Pembelian:</span>{" "}
                {formatCurrency(organic.nilaiPembelian)}
              </div>
              <div>
                <span className="text-muted-foreground">Komisi (Selesai):</span>{" "}
                {formatCurrency(organic.komisiSelesai)}
              </div>
              <div>
                <span className="text-muted-foreground">Komisi (Tertunda):</span>{" "}
                {formatCurrency(organic.komisiTertunda)}
              </div>
              <div>
                <span className="text-muted-foreground">Total Komisi:</span>{" "}
                <span className="font-medium">{formatCurrency(organic.totalKomisi)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left p-3 font-medium">Kampanye Meta</th>
                  <th className="text-left p-3 font-medium">Akun</th>
                  <th className="text-left p-3 font-medium">Tag Shopee</th>
                  <th className="text-right p-3 font-medium">Spend</th>
                  <th className="text-right p-3 font-medium">Klik Meta</th>
                  <th className="text-right p-3 font-medium">Klik Shopee</th>
                  <th className="text-right p-3 font-medium">Pesanan</th>
                  <th className="text-right p-3 font-medium">Komisi</th>
                  <th className="text-right p-3 font-medium">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-muted-foreground">
                      Memuat data...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-muted-foreground">
                      Belum ada data. Import CSV atau hubungkan kampanye di Campaign Hub.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.metaCampaignId}
                      className="border-b hover:bg-gray-50"
                    >
                      <td className="p-3">
                        <a
                          href={`/campaign/${row.metaCampaignId}`}
                          className="text-primary hover:underline font-medium"
                        >
                          {row.metaCampaignName}
                        </a>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {row.metaAccountName}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {row.shopeeCampaignName}
                      </td>
                      <td className="p-3 text-right">
                        {formatCurrency(row.spend)}
                      </td>
                      <td className="p-3 text-right">
                        {formatNumber(row.metaClicks)}
                      </td>
                      <td className="p-3 text-right">
                        {formatNumber(row.shopeeClicks)}
                      </td>
                      <td className="p-3 text-right">
                        {formatNumber(row.orders)}
                      </td>
                      <td className="p-3 text-right">
                        {formatCurrency(row.totalKomisi)}
                        {row.komisiTertunda > 0 && (
                          <span className="text-xs text-muted-foreground ml-1">
                            (🕐{formatCurrency(row.komisiTertunda)})
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${getRoasColor(
                            row.roas
                          )}`}
                        >
                          {row.roas.toFixed(2)}x
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {totals && rows.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 font-medium">
                    <td className="p-3" colSpan={3}>
                      Total ({rows.length} kampanye)
                    </td>
                    <td className="p-3 text-right">{formatCurrency(totals.spend)}</td>
                    <td className="p-3 text-right">{formatNumber(totals.metaClicks)}</td>
                    <td className="p-3 text-right">{formatNumber(totals.shopeeClicks)}</td>
                    <td className="p-3 text-right">{formatNumber(totals.orders)}</td>
                    <td className="p-3 text-right">{formatCurrency(totals.totalKomisi)}</td>
                    <td className="p-3 text-right">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${getRoasColor(
                          totals.roas
                        )}`}
                      >
                        {totals.roas.toFixed(2)}x
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function SummaryCard({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: string;
  colorClass?: string;
}) {
  return (
    <div className="bg-white rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold mt-1 ${colorClass || ""}`}>{value}</p>
    </div>
  );
}
