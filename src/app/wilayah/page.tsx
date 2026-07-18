"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { RegionProfitChart } from "@/components/region-profit-chart";
import { defaultDateRange, formatCurrency, formatNumber } from "@/lib/utils";

interface RegionRow {
  region: string;
  campaigns: number;
  spend: number;
  impressions: number;
  metaClicks: number;
  shopClicks: number;
  landingPageViews: number;
  orders: number;
  komisiTertunda: number;
  komisiSelesai: number;
  totalKomisi: number;
  profit: number;
  roas: number;
  ctr: number;
  cpc: number;
}

interface Totals {
  spend: number;
  impressions: number;
  metaClicks: number;
  shopClicks: number;
  orders: number;
  komisiTertunda: number;
  komisiSelesai: number;
  totalKomisi: number;
  profit: number;
  roas: number;
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

// Baris legacy hasil agregasi lama (region = "") tidak bisa direkomendasikan
//, tidak menunjuk provinsi mana pun di penargetan Meta
const NO_REGION_LABEL = "(Tanpa rincian wilayah)";
const regionLabel = (r: string) => r || NO_REGION_LABEL;

type Rekomendasi = "baik" | "hindari" | "kurang";

export default function WilayahPage() {
  const [rows, setRows] = useState<RegionRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [komisiTanpaSpend, setKomisiTanpaSpend] = useState(0);
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
  const [l1Filter, setL1Filter] = useState("");
  const [l1Categories, setL1Categories] = useState<string[]>([]);
  const [platformFilter, setPlatformFilter] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  // Ambang rekomendasi. minSpendInput "" = otomatis (1% total spend)
  // placeholder input menampilkan nilai otomatisnya.
  const [minSpendInput, setMinSpendInput] = useState("");
  const [breakEven, setBreakEven] = useState("1");
  const [sortKey, setSortKey] = useState<keyof RegionRow | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [copied, setCopied] = useState<"baik" | "hindari" | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      if (metaAccountFilter) params.set("metaAdAccountId", metaAccountFilter);
      if (campaignFilter) params.set("campaign", campaignFilter);
      if (deliveryFilter) params.set("delivery", deliveryFilter);
      if (l1Filter) params.set("l1", l1Filter);
      if (platformFilter) params.set("platform", platformFilter);

      const res = await fetch(`/api/wilayah?${params}`);
      const data = await res.json();
      setRows(data.rows || []);
      setTotals(data.totals);
      setCampaignOptions(data.campaignOptions || []);
      setDeliveries(data.deliveries || []);
      setL1Categories(data.l1Categories || []);
      setPlatforms(data.platforms || []);
      setKomisiTanpaSpend(data.komisiTanpaSpend || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, metaAccountFilter, campaignFilter, deliveryFilter, l1Filter, platformFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetch("/api/accounts")
      .then((res) => res.json())
      .then((data) => setMetaAccounts(data.metaAdAccounts || []))
      .catch(console.error);
  }, []);

  // Ambang efektif: input user, atau otomatis 1% total spend (dibulatkan ke
  // ribuan), wilayah di bawahnya dianggap belum cukup data untuk dinilai
  const autoMinSpend = useMemo(() => {
    if (!totals || totals.spend <= 0) return 0;
    return Math.max(Math.round((totals.spend * 0.01) / 1000) * 1000, 1000);
  }, [totals]);
  const minSpend = minSpendInput !== "" ? Number(minSpendInput) || 0 : autoMinSpend;
  const breakEvenNum = Number(breakEven) || 1;

  const rekomendasi = useCallback(
    (r: RegionRow): Rekomendasi => {
      if (r.spend < minSpend) return "kurang";
      return r.roas >= breakEvenNum ? "baik" : "hindari";
    },
    [minSpend, breakEvenNum]
  );

  // Wilayah "" dikecualikan dari daftar salin, bukan provinsi yang bisa
  // dipilih di penargetan Meta
  const daftarBaik = useMemo(
    () =>
      rows
        .filter((r) => r.region && rekomendasi(r) === "baik")
        .sort((a, b) => b.profit - a.profit),
    [rows, rekomendasi]
  );
  const daftarHindari = useMemo(
    () =>
      rows
        .filter((r) => r.region && rekomendasi(r) === "hindari")
        .sort((a, b) => a.profit - b.profit),
    [rows, rekomendasi]
  );

  const copyList = (jenis: "baik" | "hindari", list: RegionRow[]) => {
    navigator.clipboard
      .writeText(list.map((r) => r.region).join(", "))
      .then(() => {
        setCopied(jenis);
        setTimeout(() => setCopied(null), 1500);
      })
      .catch(console.error);
  };

  const handleSort = (key: keyof RegionRow) => {
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

  const getRoasColor = (roas: number) => {
    if (roas < 1) return "text-red-600 bg-red-50";
    if (roas < 2) return "text-yellow-600 bg-yellow-50";
    return "text-green-600 bg-green-50";
  };

  const chartRows = useMemo(
    () =>
      rows
        .filter((r) => r.spend > 0 || r.totalKomisi > 0)
        .map((r) => ({
          region: r.region,
          label: regionLabel(r.region),
          spend: r.spend,
          totalKomisi: r.totalKomisi,
          profit: r.profit,
          roas: r.roas,
          orders: r.orders,
        })),
    [rows]
  );

  const wilayahUntung = rows.filter((r) => r.spend > 0 && r.profit >= 0).length;
  const wilayahDenganSpend = rows.filter((r) => r.spend > 0).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Performa Wilayah</h1>
            <p className="text-sm text-muted-foreground">
              Wilayah mana yang layak ditarget saat membuat kampanye Meta baru
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
            title="Lihat performa wilayah untuk satu kampanye saja"
          >
            <option value="">Semua kampanye tertaut</option>
            {campaignOptions.map((c) => (
              <option key={c} value={c}>
                {c}
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
          <select
            value={l1Filter}
            onChange={(e) => setL1Filter(e.target.value)}
            className="px-3 py-1.5 border rounded-md text-sm bg-white max-w-48"
            title="Saring komisi & pesanan Shopee berdasarkan L1 kategori produk, spend Meta tetap penuh"
          >
            <option value="">Semua L1 kategori</option>
            {l1Categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="px-3 py-1.5 border rounded-md text-sm bg-white"
            title="Saring komisi & pesanan Shopee berdasarkan platform pesanan, spend Meta tetap penuh"
          >
            <option value="">Semua platform</option>
            {platforms.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <span className="mx-1 h-6 border-l" />
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            Min. spend
            <input
              type="number"
              value={minSpendInput}
              onChange={(e) => setMinSpendInput(e.target.value)}
              placeholder={String(autoMinSpend)}
              title="Wilayah dengan spend di bawah ambang ini dianggap belum cukup data (otomatis: 1% total spend)"
              className="px-2 py-1.5 border rounded-md text-sm w-28 text-right"
            />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            ROAS min.
            <input
              type="number"
              step="0.1"
              value={breakEven}
              onChange={(e) => setBreakEven(e.target.value)}
              title="Ambang ROAS untuk direkomendasikan (1 = balik modal)"
              className="px-2 py-1.5 border rounded-md text-sm w-20 text-right"
            />
          </label>
          <span className="text-xs text-muted-foreground basis-full">
            ± Komisi Shopee tidak punya dimensi wilayah, komisi tiap kampanye
            di-<b>prorata</b> ke wilayah mengikuti porsi spend per tanggal klik
            (estimasi). Hanya kampanye yang tertaut di Pusat Kampanye yang dihitung.
          </span>
          {(l1Filter || platformFilter) && (
            <span className="text-xs text-muted-foreground basis-full">
              ℹ️ Filter kategori/platform hanya menyaring komisi & pesanan Shopee,
              spend Meta tetap penuh, jadi ROAS/keuntungan per wilayah turun;
              bandingkan antar-wilayah, bukan angka absolutnya.
            </span>
          )}
          {komisiTanpaSpend > 0 && (
            <span className="text-xs text-muted-foreground basis-full">
              ℹ️ {formatCurrency(komisiTanpaSpend)} komisi dari kampanye tanpa
              spend Meta di rentang ini tidak bisa diatribusikan ke wilayah dan
              tidak termasuk di angka-angka halaman ini.
            </span>
          )}
        </div>

        {/* Summary Cards */}
        {totals && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <SummaryCard label="Total Spend" value={formatCurrency(totals.spend)} />
            <SummaryCard
              label="Total Komisi (estimasi)"
              value={"±" + formatCurrency(totals.totalKomisi)}
              sub="hanya kampanye tertaut & punya spend Meta di rentang"
            />
            <SummaryCard
              label="Keuntungan (estimasi)"
              value={"±" + formatCurrency(totals.profit)}
              colorClass={totals.profit < 0 ? "text-red-600" : "text-green-600"}
            />
            <SummaryCard
              label="ROAS"
              value={totals.roas.toFixed(2) + "x"}
              colorClass={getRoasColor(totals.roas)}
            />
            <SummaryCard
              label="Wilayah Untung"
              value={`${wilayahUntung} / ${wilayahDenganSpend}`}
            />
          </div>
        )}

        {/* Rekomendasi */}
        {!loading && (daftarBaik.length > 0 || daftarHindari.length > 0) && (
          <div className="grid md:grid-cols-2 gap-4">
            <RekomendasiPanel
              title="✅ Layak ditarget"
              subtitle={`ROAS ≥ ${breakEvenNum} dengan spend ≥ ${formatCurrency(minSpend)}, urut dari paling untung`}
              list={daftarBaik}
              chipClass="bg-green-50 text-green-700 border-green-200"
              copied={copied === "baik"}
              onCopy={() => copyList("baik", daftarBaik)}
            />
            <RekomendasiPanel
              title="⛔ Sebaiknya dikecualikan"
              subtitle={`ROAS < ${breakEvenNum} dengan spend ≥ ${formatCurrency(minSpend)}, urut dari paling rugi`}
              list={daftarHindari}
              chipClass="bg-red-50 text-red-700 border-red-200"
              copied={copied === "hindari"}
              onCopy={() => copyList("hindari", daftarHindari)}
            />
          </div>
        )}

        {/* Chart */}
        {!loading && chartRows.length > 0 && <RegionProfitChart rows={chartRows} />}

        {/* Table */}
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <SortableTh label="Wilayah" sortKeyName="region" align="left" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Kampanye" sortKeyName="campaigns" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Spend" sortKeyName="spend" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Impresi" sortKeyName="impressions" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Klik Meta" sortKeyName="metaClicks" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="CTR" sortKeyName="ctr" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="CPC" sortKeyName="cpc" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Pesanan ±" sortKeyName="orders" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Komisi ±" sortKeyName="totalKomisi" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Keuntungan ±" sortKeyName="profit" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="ROAS ±" sortKeyName="roas" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th className="p-3 font-medium text-left">Rekomendasi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={12} className="p-6 text-center text-muted-foreground">
                      Memuat data...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="p-6 text-center text-muted-foreground">
                      Belum ada data wilayah. Import CSV Meta terbaru (dengan kolom
                      Wilayah) dan tautkan kampanye di Pusat Kampanye.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((row) => (
                    <tr key={row.region || "__none"} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium">
                        {row.region || (
                          <span
                            className="text-muted-foreground italic"
                            title="Baris impor Meta lama tanpa rincian wilayah"
                          >
                            {NO_REGION_LABEL}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right text-muted-foreground">
                        {formatNumber(row.campaigns)}
                      </td>
                      <td className="p-3 text-right">{formatCurrency(row.spend)}</td>
                      <td className="p-3 text-right">{formatNumber(row.impressions)}</td>
                      <td className="p-3 text-right">{formatNumber(row.metaClicks)}</td>
                      <td className="p-3 text-right">{(row.ctr * 100).toFixed(2)}%</td>
                      <td className="p-3 text-right">{formatCurrency(row.cpc)}</td>
                      <td className="p-3 text-right">{formatNumber(row.orders)}</td>
                      <td className="p-3 text-right">
                        <div>{formatCurrency(row.totalKomisi)}</div>
                        {row.komisiTertunda > 0 && (
                          <div className="text-xs text-muted-foreground">
                            🕐{formatCurrency(row.komisiTertunda)}
                          </div>
                        )}
                      </td>
                      <td
                        className={`p-3 text-right font-medium ${
                          row.profit < 0 ? "text-red-600" : "text-green-600"
                        }`}
                      >
                        {formatCurrency(row.profit)}
                      </td>
                      <td className="p-3 text-right">
                        {row.spend > 0 ? (
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${getRoasColor(row.roas)}`}
                          >
                            {row.roas.toFixed(2)}x
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        {row.region === "" ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <RekomendasiBadge jenis={rekomendasi(row)} />
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {totals && rows.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 font-medium">
                    <td className="p-3">Total ({rows.length} wilayah)</td>
                    <td className="p-3" />
                    <td className="p-3 text-right">{formatCurrency(totals.spend)}</td>
                    <td className="p-3 text-right">{formatNumber(totals.impressions)}</td>
                    <td className="p-3 text-right">{formatNumber(totals.metaClicks)}</td>
                    <td className="p-3 text-right">
                      {totals.impressions > 0
                        ? ((totals.metaClicks / totals.impressions) * 100).toFixed(2) + "%"
                        : "—"}
                    </td>
                    <td className="p-3 text-right">
                      {totals.metaClicks > 0
                        ? formatCurrency(totals.spend / totals.metaClicks)
                        : "—"}
                    </td>
                    <td className="p-3 text-right">{formatNumber(totals.orders)}</td>
                    <td className="p-3 text-right">{formatCurrency(totals.totalKomisi)}</td>
                    <td
                      className={`p-3 text-right ${
                        totals.profit < 0 ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {formatCurrency(totals.profit)}
                    </td>
                    <td className="p-3 text-right">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${getRoasColor(totals.roas)}`}
                      >
                        {totals.roas.toFixed(2)}x
                      </span>
                    </td>
                    <td className="p-3" />
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

function RekomendasiPanel({
  title,
  subtitle,
  list,
  chipClass,
  copied,
  onCopy,
}: {
  title: string;
  subtitle: string;
  list: { region: string; profit: number }[];
  chipClass: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="text-sm font-medium">{title}</h3>
        {list.length > 0 && (
          <button
            onClick={onCopy}
            className="px-2.5 py-1 text-xs border rounded-md text-muted-foreground hover:text-foreground hover:bg-gray-50 shrink-0"
            title="Salin daftar nama wilayah (dipisah koma) untuk penargetan Meta"
          >
            {copied ? "✓ Tersalin" : "⎘ Salin daftar"}
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">{subtitle}</p>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Tidak ada</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {list.map((r) => (
            <span
              key={r.region}
              title={`Keuntungan ±${formatCurrency(r.profit)}`}
              className={`px-2 py-0.5 rounded-full border text-xs ${chipClass}`}
            >
              {r.region}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RekomendasiBadge({ jenis }: { jenis: Rekomendasi }) {
  if (jenis === "baik")
    return (
      <span className="px-2 py-0.5 rounded text-xs font-medium text-green-700 bg-green-50">
        ✅ Layak
      </span>
    );
  if (jenis === "hindari")
    return (
      <span className="px-2 py-0.5 rounded text-xs font-medium text-red-700 bg-red-50">
        ⛔ Hindari
      </span>
    );
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-medium text-gray-600 bg-gray-100"
      title="Spend di bawah ambang minimum, belum cukup data untuk dinilai"
    >
      • Data kurang
    </span>
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
  sortKeyName: keyof RegionRow;
  align: "left" | "right";
  sortKey: keyof RegionRow | null;
  sortDir: "asc" | "desc";
  onSort: (key: keyof RegionRow) => void;
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
  // Keterangan cakupan angka, pengingat bahwa card serupa di halaman lain
  // menghitung cakupan berbeda
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
