"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { PenempatanChart } from "@/components/penempatan-chart";
import { DateInput } from "@/components/ui/date-input";
import { defaultDateRange, formatCurrency, formatNumber } from "@/lib/utils";

interface PlacementRow {
  placement: string;
  campaigns: number;
  spend: number;
  impressions: number;
  reach: number;
  metaClicks: number;
  shopClicks: number;
  results: number;
  landingPageViews: number;
  ctr: number;
  cpc: number;
  cpm: number;
  costPerResult: number;
}

interface Totals {
  spend: number;
  impressions: number;
  metaClicks: number;
  shopClicks: number;
  results: number;
  landingPageViews: number;
}

interface AccountOption {
  id: number;
  name: string;
}

const DELIVERY_LABELS: Record<string, string> = {
  active: "Aktif",
  inactive: "Nonaktif",
  archived: "Arsip",
};

const NO_PLACEMENT_LABEL = "(Tanpa rincian penempatan)";
const placementLabel = (p: string) => p || NO_PLACEMENT_LABEL;

export default function PenempatanPage() {
  const [rows, setRows] = useState<PlacementRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  // Default: 30 hari sebelum kemarin s/d kemarin (hari berjalan dikecualikan)
  const [fromDate, setFromDate] = useState(() => defaultDateRange().from);
  const [toDate, setToDate] = useState(() => defaultDateRange().to);
  const [metaAccountFilter, setMetaAccountFilter] = useState("");
  const [metaAccounts, setMetaAccounts] = useState<AccountOption[]>([]);
  const [campaignFilter, setCampaignFilter] = useState("");
  const [campaignOptions, setCampaignOptions] = useState<string[]>([]);
  const [deliveryFilter, setDeliveryFilter] = useState("");
  const [deliveries, setDeliveries] = useState<string[]>([]);
  const [platformFilter, setPlatformFilter] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [deviceFilter, setDeviceFilter] = useState("");
  const [devices, setDevices] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<keyof PlacementRow | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      if (metaAccountFilter) params.set("metaAdAccountId", metaAccountFilter);
      if (campaignFilter) params.set("campaign", campaignFilter);
      if (deliveryFilter) params.set("delivery", deliveryFilter);
      if (platformFilter) params.set("platform", platformFilter);
      if (deviceFilter) params.set("device", deviceFilter);

      const res = await fetch(`/api/penempatan?${params}`);
      const data = await res.json();
      setRows(data.rows || []);
      setTotals(data.totals);
      setCampaignOptions(data.campaignOptions || []);
      setDeliveries(data.deliveries || []);
      setPlatforms(data.platforms || []);
      setDevices(data.devices || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, metaAccountFilter, campaignFilter, deliveryFilter, platformFilter, deviceFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetch("/api/accounts")
      .then((res) => res.json())
      .then((data) => setMetaAccounts(data.metaAdAccounts || []))
      .catch(console.error);
  }, []);

  const handleSort = (key: keyof PlacementRow) => {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir(typeof rows[0]?.[key] === "string" ? "asc" : "desc");
    }
  };

  const sortedRows = sortKey
    ? [...rows].sort((a, b) => {
        const va = a[sortKey];
        const vb = b[sortKey];
        const cmp =
          typeof va === "string" && typeof vb === "string"
            ? va.localeCompare(vb, "id-ID")
            : Number(va) - Number(vb);
        return sortDir === "asc" ? cmp : -cmp;
      })
    : rows;

  const chartData = useMemo(
    () =>
      rows
        .filter((r) => r.spend > 0 || r.metaClicks > 0)
        .map((r) => ({
          label: placementLabel(r.placement),
          spend: r.spend,
          klik: r.metaClicks,
          cpc: r.cpc,
        })),
    [rows]
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Performa Penempatan</h1>
            <p className="text-sm text-muted-foreground">
              Penempatan iklan mana (Reels, Stories, Kabar…) yang paling efisien
              mendatangkan klik
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DateInput
              value={fromDate}
              onChange={setFromDate}
              className="px-3 py-1.5 border rounded-md text-sm"
            />
            <span className="text-sm text-muted-foreground">s/d</span>
            <DateInput
              value={toDate}
              onChange={setToDate}
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

        {/* Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={metaAccountFilter}
            onChange={(e) => setMetaAccountFilter(e.target.value)}
            className="px-3 py-1.5 border rounded-md text-sm bg-white max-w-48"
          >
            <option value="">Semua akun Meta Ads</option>
            {metaAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            className="px-3 py-1.5 border rounded-md text-sm bg-white max-w-64"
            title="Lihat performa penempatan untuk satu kampanye saja"
          >
            <option value="">Semua kampanye</option>
            {campaignOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="px-3 py-1.5 border rounded-md text-sm bg-white"
            title="Saring berdasarkan platform (Facebook / Instagram)"
          >
            <option value="">Semua platform</option>
            {platforms.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={deviceFilter}
            onChange={(e) => setDeviceFilter(e.target.value)}
            className="px-3 py-1.5 border rounded-md text-sm bg-white"
            title="Saring berdasarkan platform perangkat (Di aplikasi / Web Seluler)"
          >
            <option value="">Semua perangkat</option>
            {devices.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            value={deliveryFilter}
            onChange={(e) => setDeliveryFilter(e.target.value)}
            className="px-3 py-1.5 border rounded-md text-sm bg-white"
            title='Saring berdasarkan "Penayangan kampanye" Meta terkini'
          >
            <option value="">Semua penayangan</option>
            {deliveries.map((d) => (
              <option key={d} value={d}>
                {DELIVERY_LABELS[d] || d}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground basis-full">
            ℹ️ Metrik iklan Meta saja. Komisi/ROAS tidak ditampilkan — komisi
            Shopee tidak punya dimensi penempatan sehingga tak bisa diatribusikan
            per penempatan. Import CSV Meta dengan &quot;Perincian: Penempatan&quot;.
          </span>
        </div>

        {/* Summary Cards */}
        {totals && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <SummaryCard label="Total Spend" value={formatCurrency(totals.spend)} sub="termasuk PPN 11%" />
            <SummaryCard label="Impresi" value={formatNumber(totals.impressions)} />
            <SummaryCard label="Klik Meta" value={formatNumber(totals.metaClicks)} />
            <SummaryCard
              label="CTR"
              value={totals.impressions > 0 ? ((totals.metaClicks / totals.impressions) * 100).toFixed(2) + "%" : "—"}
            />
            <SummaryCard
              label="CPC"
              value={totals.metaClicks > 0 ? formatCurrency(totals.spend / totals.metaClicks) : "—"}
              sub="termasuk PPN"
            />
            <SummaryCard
              label="CPM"
              value={totals.impressions > 0 ? formatCurrency((totals.spend / totals.impressions) * 1000) : "—"}
              sub="termasuk PPN"
            />
          </div>
        )}

        {/* Chart */}
        {!loading && chartData.length > 0 && <PenempatanChart data={chartData} />}

        {/* Table */}
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <SortableTh label="Penempatan" sortKeyName="placement" align="left" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Kampanye" sortKeyName="campaigns" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Spend +PPN" sortKeyName="spend" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Impresi" sortKeyName="impressions" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Jangkauan" sortKeyName="reach" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Klik Meta" sortKeyName="metaClicks" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="CTR" sortKeyName="ctr" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="CPC" sortKeyName="cpc" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="CPM" sortKeyName="cpm" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
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
                      Belum ada data penempatan. Import CSV Meta dengan
                      &quot;Perincian: Penempatan&quot; di halaman Import CSV.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((row) => (
                    <tr key={row.placement || "__none"} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium">
                        {row.placement || (
                          <span className="text-muted-foreground italic">{NO_PLACEMENT_LABEL}</span>
                        )}
                      </td>
                      <td className="p-3 text-right text-muted-foreground">{formatNumber(row.campaigns)}</td>
                      <td className="p-3 text-right">{formatCurrency(row.spend)}</td>
                      <td className="p-3 text-right">{formatNumber(row.impressions)}</td>
                      <td className="p-3 text-right">{formatNumber(row.reach)}</td>
                      <td className="p-3 text-right">{formatNumber(row.metaClicks)}</td>
                      <td className="p-3 text-right">{(row.ctr * 100).toFixed(2)}%</td>
                      <td className="p-3 text-right">{formatCurrency(row.cpc)}</td>
                      <td className="p-3 text-right">{formatCurrency(row.cpm)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {totals && rows.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 font-medium">
                    <td className="p-3">Total ({rows.length} penempatan)</td>
                    <td className="p-3" />
                    <td className="p-3 text-right">{formatCurrency(totals.spend)}</td>
                    <td className="p-3 text-right">{formatNumber(totals.impressions)}</td>
                    <td className="p-3" />
                    <td className="p-3 text-right">{formatNumber(totals.metaClicks)}</td>
                    <td className="p-3 text-right">
                      {totals.impressions > 0
                        ? ((totals.metaClicks / totals.impressions) * 100).toFixed(2) + "%"
                        : "—"}
                    </td>
                    <td className="p-3 text-right">
                      {totals.metaClicks > 0 ? formatCurrency(totals.spend / totals.metaClicks) : "—"}
                    </td>
                    <td className="p-3 text-right">
                      {totals.impressions > 0
                        ? formatCurrency((totals.spend / totals.impressions) * 1000)
                        : "—"}
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

function SortableTh({
  label,
  sortKeyName,
  align,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  sortKeyName: keyof PlacementRow;
  align: "left" | "right";
  sortKey: keyof PlacementRow | null;
  sortDir: "asc" | "desc";
  onSort: (key: keyof PlacementRow) => void;
}) {
  const active = sortKey === sortKeyName;
  return (
    <th
      onClick={() => onSort(sortKeyName)}
      className={`p-3 font-medium cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap ${
        align === "right" ? "text-right" : "text-left"
      } ${active ? "text-primary" : ""}`}
      title={`Urutkan berdasarkan ${label}`}
    >
      {label}
      <span className="inline-block w-3 ml-0.5 text-xs">
        {active ? (sortDir === "asc" ? "▲" : "▼") : ""}
      </span>
    </th>
  );
}

function SummaryCard({
  label,
  value,
  colorClass,
  sub,
}: {
  label: string;
  value: string;
  colorClass?: string;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold mt-1 ${colorClass || ""}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
