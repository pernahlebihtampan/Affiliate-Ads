"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { DailyChart } from "@/components/daily-chart";
import { formatCurrency, formatNumber } from "@/lib/utils";

interface DashboardRow {
  metaCampaignId: number;
  metaCampaignName: string;
  metaCampaignStatus: string;
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

interface DailyDataPoint {
  date: string;
  komisi: number;
  spend: number;
  profit: number;
  profitSelesai: number;
  komisiDibatalkan: number;
}

export default function DashboardPage() {
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [organic, setOrganic] = useState<OrganicStats | null>(null);
  const [dailyData, setDailyData] = useState<DailyDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);
  // Filter opsional. campaignInput/tagInput = teks ketikan (hanya membuka
  // dropdown saran, TIDAK memicu fetch); *Filter di-set saat item dipilih
  // dari dropdown → baru reload data (exact match satu kampanye/tag).
  // campaignInput & tagInput saling eksklusif — mengisi satu menonaktifkan
  // yang lain (dua sisi dari tautan hub yang sama).
  const [campaignInput, setCampaignInput] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [campaignOptions, setCampaignOptions] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [tagOptions, setTagOptions] = useState<string[]>([]);
  const [regionFilter, setRegionFilter] = useState("");
  const [regions, setRegions] = useState<string[]>([]);
  // Filter level-item Shopee
  const [statusFilter, setStatusFilter] = useState("");
  const [l1Filter, setL1Filter] = useState("");
  // L3: input bebas + datalist (978 kategori) — substring, di-debounce
  const [l3Input, setL3Input] = useState("");
  const [l3Filter, setL3Filter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [l1Categories, setL1Categories] = useState<string[]>([]);
  const [l3Categories, setL3Categories] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>([]);
  // Sortir tabel (klik header). null = urutan asli dari API.
  const [sortKey, setSortKey] = useState<keyof DashboardRow | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      if (campaignFilter.trim()) params.set("campaign", campaignFilter.trim());
      if (tagFilter.trim()) params.set("tag", tagFilter.trim());
      if (regionFilter) params.set("region", regionFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (l1Filter) params.set("l1", l1Filter);
      if (l3Filter) params.set("l3", l3Filter);
      if (platformFilter) params.set("platform", platformFilter);

      // Fetch main dashboard data
      const res = await fetch(`/api/dashboard?${params}`);
      const data = await res.json();
      setRows(data.rows || []);
      setTotals(data.totals);
      setOrganic(data.organicStats);
      setRegions(data.regions || []);
      setCampaignOptions(data.campaignOptions || []);
      setTagOptions(data.tagOptions || []);
      setStatuses(data.statuses || []);
      setL1Categories(data.l1Categories || []);
      setL3Categories(data.l3Categories || []);
      setPlatforms(data.platforms || []);

      // Fetch daily chart data
      const dailyRes = await fetch(`/api/dashboard/daily?${params}`);
      const dailyData = await dailyRes.json();
      setDailyData(dailyData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, campaignFilter, tagFilter, regionFilter, statusFilter, l1Filter, l3Filter, platformFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Debounce input L3 kategori 400ms
  useEffect(() => {
    const t = setTimeout(() => setL3Filter(l3Input), 400);
    return () => clearTimeout(t);
  }, [l3Input]);

  const handleSort = (key: keyof DashboardRow) => {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      // Kolom teks enak dimulai A→Z; angka dimulai dari terbesar
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

        {/* Filter opsional */}
        <div className="flex flex-wrap items-center gap-2">
          <FilterCombobox
            value={campaignInput}
            options={campaignOptions}
            onChange={(v) => {
              setCampaignInput(v);
              // Input dikosongkan → lepas filter & reload semua
              if (v.trim() === "" && campaignFilter) setCampaignFilter("");
            }}
            onSelect={(v) => {
              setCampaignInput(v);
              setCampaignFilter(v); // baru di sini data di-reload
            }}
            disabled={!!tagInput}
            placeholder="Filter nama kampanye Meta…"
            title={tagInput ? "Nonaktif — sedang memfilter Tag Shopee (kedua filter menyaring pasangan hub yang sama)" : undefined}
            widthClass="w-56"
          />
          <FilterCombobox
            value={tagInput}
            options={tagOptions}
            onChange={(v) => {
              setTagInput(v);
              if (v.trim() === "" && tagFilter) setTagFilter("");
            }}
            onSelect={(v) => {
              setTagInput(v);
              setTagFilter(v);
            }}
            disabled={!!campaignInput}
            placeholder="Filter Tag Shopee…"
            title={campaignInput ? "Nonaktif — sedang memfilter nama kampanye Meta (kedua filter menyaring pasangan hub yang sama)" : undefined}
            widthClass="w-48"
          />
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="px-3 py-1.5 border rounded-md text-sm bg-white"
            title="Wilayah menyaring metrik Meta; komisi Shopee diestimasi prorata"
          >
            <option value="">Semua wilayah</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 border rounded-md text-sm bg-white"
          >
            <option value="">Semua status</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={l1Filter}
            onChange={(e) => setL1Filter(e.target.value)}
            className="px-3 py-1.5 border rounded-md text-sm bg-white max-w-48"
          >
            <option value="">Semua L1 kategori</option>
            {l1Categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="text"
            list="l3-kategori-list"
            value={l3Input}
            onChange={(e) => setL3Input(e.target.value)}
            placeholder="L3 kategori…"
            className="px-3 py-1.5 border rounded-md text-sm w-48"
          />
          <datalist id="l3-kategori-list">
            {l3Categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="px-3 py-1.5 border rounded-md text-sm bg-white"
          >
            <option value="">Semua platform</option>
            {platforms.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {(campaignInput || tagInput || regionFilter || statusFilter || l1Filter || l3Input || platformFilter) && (
            <button
              onClick={() => {
                setCampaignInput("");
                setCampaignFilter("");
                setTagInput("");
                setTagFilter("");
                setRegionFilter("");
                setStatusFilter("");
                setL1Filter("");
                setL3Input("");
                setL3Filter("");
                setPlatformFilter("");
              }}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground border rounded-md"
            >
              ✕ Bersihkan filter
            </button>
          )}
          {regionFilter && (
            <span className="text-xs text-muted-foreground">
              ± Komisi/pesanan/klik Shopee = <b>estimasi prorata</b> porsi spend
              wilayah per kampanye per tanggal (data Shopee tidak punya dimensi
              wilayah).
            </span>
          )}
          {(statusFilter || l1Filter || l3Filter || platformFilter) && (
            <span className="text-xs text-muted-foreground">
              ℹ️ Filter status/kategori/platform hanya menyaring komisi & pesanan
              Shopee — spend Meta tetap penuh, jadi ROAS turun.
            </span>
          )}
        </div>

        {/* Summary Cards */}
        {totals && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <SummaryCard label="Total Spend" value={formatCurrency(totals.spend)} />
            <SummaryCard
              label={regionFilter ? "Total Komisi (estimasi)" : "Total Komisi"}
              value={(regionFilter ? "±" : "") + formatCurrency(totals.totalKomisi)}
            />
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

        {/* Daily Chart */}
        {!loading && <DailyChart data={dailyData} />}

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
                  <SortableTh label="On/Off" sortKeyName="metaCampaignStatus" align="left" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Kampanye Meta" sortKeyName="metaCampaignName" align="left" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Akun" sortKeyName="metaAccountName" align="left" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Tag Shopee" sortKeyName="shopeeCampaignName" align="left" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Spend" sortKeyName="spend" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Klik Meta" sortKeyName="metaClicks" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Klik Shopee" sortKeyName="shopeeClicks" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Pesanan" sortKeyName="orders" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Komisi" sortKeyName="totalKomisi" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="ROAS" sortKeyName="roas" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} className="p-6 text-center text-muted-foreground">
                      Memuat data...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-6 text-center text-muted-foreground">
                      Belum ada data. Import CSV atau hubungkan kampanye di Campaign Hub.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((row) => (
                    <tr
                      key={row.metaCampaignId}
                      className="border-b hover:bg-gray-50"
                    >
                      <td className="p-3">
                        <StatusIndicator status={row.metaCampaignStatus} />
                      </td>
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
                        {regionFilter && "±"}
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
                    <td className="p-3" colSpan={4}>
                      Total ({rows.length} kampanye)
                    </td>
                    <td className="p-3 text-right">{formatCurrency(totals.spend)}</td>
                    <td className="p-3 text-right">{formatNumber(totals.metaClicks)}</td>
                    <td className="p-3 text-right">{formatNumber(totals.shopeeClicks)}</td>
                    <td className="p-3 text-right">{formatNumber(totals.orders)}</td>
                    <td className="p-3 text-right">
                      {regionFilter && "±"}
                      {formatCurrency(totals.totalKomisi)}
                    </td>
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

// Input filter dengan dropdown saran. Mengetik/paste HANYA membuka list
// (walau hasil cuma satu; kosong → item "Tidak ditemukan") — data baru
// di-reload setelah item dipilih (klik / Enter), via onSelect.
function FilterCombobox({
  value,
  options,
  onChange,
  onSelect,
  disabled,
  placeholder,
  title,
  widthClass,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  onSelect: (v: string) => void;
  disabled?: boolean;
  placeholder: string;
  title?: string;
  widthClass: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const q = value.trim().toLowerCase();
  const matches = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;

  const pick = (v: string) => {
    onSelect(v);
    setOpen(false);
  };

  return (
    <div className={`relative ${widthClass}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => value.trim() && setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (!open || matches.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(matches[Math.min(highlight, matches.length - 1)]);
          }
        }}
        disabled={disabled}
        placeholder={placeholder}
        title={title}
        className="w-full px-3 py-1.5 border rounded-md text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
      />
      {open && !disabled && (
        <ul className="absolute z-20 top-full left-0 mt-1 min-w-full w-max max-w-md bg-white border rounded-md shadow-lg max-h-64 overflow-y-auto text-sm">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground italic">Tidak ditemukan</li>
          ) : (
            matches.map((o, i) => (
              <li
                key={o}
                // onMouseDown (bukan onClick) agar terpicu sebelum blur input menutup list
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`px-3 py-2 cursor-pointer ${
                  i === highlight ? "bg-gray-100" : ""
                }`}
              >
                {o}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

// Indikator on/off kampanye Meta (read-only) — dari "Penayangan kampanye":
// active = ON hijau; inactive = OFF abu-abu; archived = saklar kosong
// (tanpa knob — bukan lagi on/off, kampanyenya sudah diarsipkan)
function StatusIndicator({ status }: { status: string }) {
  const isOn = status === "active";
  const isArchived = status === "archived";
  const label = isOn ? "On" : isArchived ? "Arsip" : "Off";
  return (
    <span
      title={`Penayangan kampanye: ${status || "tidak diketahui"}`}
      className="inline-flex items-center gap-1.5 cursor-default"
    >
      <span
        className={`relative inline-block w-7 h-4 rounded-full transition-colors ${
          isOn ? "bg-green-500" : "bg-gray-300"
        }`}
      >
        {!isArchived && (
          <span
            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow ${
              isOn ? "right-0.5" : "left-0.5"
            }`}
          />
        )}
      </span>
      <span className={`text-xs ${isOn ? "text-green-700" : "text-muted-foreground"}`}>
        {label}
      </span>
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
  sortKeyName: keyof DashboardRow;
  align: "left" | "right";
  sortKey: keyof DashboardRow | null;
  sortDir: "asc" | "desc";
  onSort: (key: keyof DashboardRow) => void;
}) {
  const active = sortKey === sortKeyName;
  return (
    <th
      onClick={() => onSort(sortKeyName)}
      className={`p-3 font-medium cursor-pointer select-none hover:bg-gray-100 ${
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
