"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { KlikChart, KlikBucket } from "@/components/klik-chart";
import { DateInput } from "@/components/ui/date-input";
import { defaultDateRange, formatCurrency, formatNumber } from "@/lib/utils";

interface Metrics {
  klik: number;
  pesanan: number;
  komisi: number;
  cr: number;
  epc: number;
}

interface DailyRow extends Metrics {
  date: string;
}

interface HourRow extends Metrics {
  hour: number;
}

interface TagRow extends Metrics {
  tag: string;
}

interface PerujukRow extends Metrics {
  perujuk: string;
}

interface NegaraRow {
  negara: string;
  klik: number;
  share: number;
}

interface AccountOption {
  id: number;
  name: string;
}

export default function KlikPage() {
  const [totals, setTotals] = useState<Metrics | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [byHour, setByHour] = useState<HourRow[]>([]);
  const [byTag, setByTag] = useState<TagRow[]>([]);
  const [byPerujuk, setByPerujuk] = useState<PerujukRow[]>([]);
  const [byNegara, setByNegara] = useState<NegaraRow[]>([]);
  const [coverage, setCoverage] = useState<{ from: string; to: string } | null>(null);
  const [loading, setLoading] = useState(true);
  // Default: 30 hari sebelum kemarin s/d kemarin — seragam dengan Dashboard &
  // Performa Wilayah. Catatan cakupan data klik tetap ditampilkan: hari di
  // dalam rentang tapi di luar cakupan membuat CR/EPC lebih rendah dari nyata.
  const [fromDate, setFromDate] = useState(() => defaultDateRange().from);
  const [toDate, setToDate] = useState(() => defaultDateRange().to);
  const [shopeeAccountFilter, setShopeeAccountFilter] = useState("");
  const [shopeeAccounts, setShopeeAccounts] = useState<AccountOption[]>([]);
  const [tagFilter, setTagFilter] = useState("");
  const [tagOptions, setTagOptions] = useState<string[]>([]);
  const [perujukFilter, setPerujukFilter] = useState("");
  const [perujukOptions, setPerujukOptions] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      if (shopeeAccountFilter) params.set("shopeeAccountId", shopeeAccountFilter);
      if (tagFilter) params.set("tag", tagFilter);
      if (perujukFilter) params.set("perujuk", perujukFilter);

      const res = await fetch(`/api/klik?${params}`);
      const data = await res.json();
      setTotals(data.totals);
      setDaily(data.daily || []);
      setByHour(data.byHour || []);
      setByTag(data.byTag || []);
      setByPerujuk(data.byPerujuk || []);
      setByNegara(data.byNegara || []);
      setCoverage(data.coverage);
      // Opsi dropdown dihitung API tanpa filter tag/perujuk, tidak menyusut
      // saat salah satu filter aktif
      setTagOptions(data.tagOptions || []);
      setPerujukOptions(data.perujukOptions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, shopeeAccountFilter, tagFilter, perujukFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetch("/api/accounts")
      .then((res) => res.json())
      .then((data) => setShopeeAccounts(data.shopeeAccounts || []))
      .catch(console.error);
  }, []);

  const hourChart: KlikBucket[] = byHour.map((h) => ({
    label: `${String(h.hour).padStart(2, "0")}:00`,
    klik: h.klik,
    pesanan: h.pesanan,
    komisi: h.komisi,
    cr: h.cr,
    epc: h.epc,
  }));

  const dailyChart: KlikBucket[] = daily.map((d) => ({
    label: new Date(d.date + "T00:00:00").toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
    }),
    klik: d.klik,
    pesanan: d.pesanan,
    komisi: d.komisi,
    cr: d.cr,
    epc: d.epc,
  }));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Performa Klik</h1>
            <p className="text-sm text-muted-foreground">
              Analisis data klik Shopee: kapan, dari mana, dan seberapa banyak
              yang berubah jadi pesanan
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
            value={shopeeAccountFilter}
            onChange={(e) => setShopeeAccountFilter(e.target.value)}
            className="px-3 py-1.5 border rounded-md text-sm bg-white max-w-48"
          >
            <option value="">Semua akun Shopee</option>
            {shopeeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="px-3 py-1.5 border rounded-md text-sm bg-white max-w-64"
            title="Saring berdasarkan Tag Shopee (Tag_link1) yang tercatat di data klik"
          >
            <option value="">Semua tag</option>
            {tagOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={perujukFilter}
            onChange={(e) => setPerujukFilter(e.target.value)}
            className="px-3 py-1.5 border rounded-md text-sm bg-white"
            title="Perujuk klik (Facebook/Instagram/…). Pesanan disaring lewat kolom Platform yang berkosakata sama"
          >
            <option value="">Semua perujuk</option>
            {perujukOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {coverage && (
            <span className="text-xs text-muted-foreground basis-full">
              ℹ️ Data klik hanya tersedia{" "}
              <b>
                {coverage.from} s/d {coverage.to}
              </b>{" "}
              (CSV klik Shopee terbatas). Hari di luar cakupan itu membuat
              CR/EPC menyesatkan (pesanan ada, kliknya tidak tercatat)
              persempit rentang ke cakupan ini untuk angka yang akurat.
            </span>
          )}
        </div>

        {/* Summary Cards */}
        {totals && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <SummaryCard label="Total Klik" value={formatNumber(totals.klik)} />
            <SummaryCard label="Pesanan" value={formatNumber(totals.pesanan)} />
            <SummaryCard
              label="Konversi (CR)"
              value={(totals.cr * 100).toFixed(2) + "%"}
            />
            <SummaryCard
              label="Komisi"
              value={formatCurrency(totals.komisi)}
              sub={(() => {
                const organik =
                  byTag.find((r) => r.tag === "(Organik / tanpa tag)")?.komisi || 0;
                return organik > 0
                  ? `semua sumber, termasuk organik ${formatCurrency(organik)}`
                  : "semua sumber trafik Shopee";
              })()}
            />
            <SummaryCard
              label="EPC (komisi / klik)"
              value={formatCurrency(totals.epc)}
            />
          </div>
        )}

        {/* Charts */}
        {!loading && (
          <div className="grid xl:grid-cols-2 gap-4">
            <KlikChart title="Per Jam (WIB)" data={hourChart} />
            <KlikChart title="Per Hari" data={dailyChart} />
          </div>
        )}

        {/* Breakdown tables */}
        {!loading && (
          <div className="grid lg:grid-cols-2 gap-4">
            <BreakdownTable
              title="Per Tag Shopee"
              labelHeader="Tag"
              rows={byTag.map((r) => ({ label: r.tag, ...r }))}
              totalKlik={totals?.klik || 0}
            />
            <div className="space-y-4">
              <BreakdownTable
                title="Per Perujuk"
                labelHeader="Perujuk"
                note="Pesanan & komisi dicocokkan lewat kolom Platform pesanan (kosakata sama dengan Perujuk klik)"
                rows={byPerujuk.map((r) => ({ label: r.perujuk, ...r }))}
                totalKlik={totals?.klik || 0}
              />
              <NegaraTable rows={byNegara} />
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function BreakdownTable({
  title,
  labelHeader,
  note,
  rows,
  totalKlik,
}: {
  title: string;
  labelHeader: string;
  note?: string;
  rows: (Metrics & { label: string })[];
  totalKlik: number;
}) {
  return (
    <div className="bg-white rounded-lg border overflow-hidden self-start">
      <div className="p-3 border-b">
        <h3 className="text-sm font-medium">{title}</h3>
        {note && <p className="text-xs text-muted-foreground mt-0.5">{note}</p>}
      </div>
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0">
            <tr className="bg-gray-50 border-b">
              <th className="p-2.5 font-medium text-left">{labelHeader}</th>
              <th className="p-2.5 font-medium text-right">Klik</th>
              <th className="p-2.5 font-medium text-right">%</th>
              <th className="p-2.5 font-medium text-right">Pesanan</th>
              <th className="p-2.5 font-medium text-right">CR</th>
              <th className="p-2.5 font-medium text-right">Komisi</th>
              <th className="p-2.5 font-medium text-right">EPC</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-4 text-center text-muted-foreground">
                  Tidak ada data
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.label} className="border-b hover:bg-gray-50">
                  <td className="p-2.5 max-w-56 truncate" title={r.label}>
                    {r.label}
                  </td>
                  <td className="p-2.5 text-right">{formatNumber(r.klik)}</td>
                  <td className="p-2.5 text-right text-muted-foreground">
                    {totalKlik > 0 ? ((r.klik / totalKlik) * 100).toFixed(1) + "%" : "—"}
                  </td>
                  <td className="p-2.5 text-right">{formatNumber(r.pesanan)}</td>
                  <td className="p-2.5 text-right">
                    {r.klik > 0 ? (r.cr * 100).toFixed(2) + "%" : "—"}
                  </td>
                  <td className="p-2.5 text-right">{formatCurrency(r.komisi)}</td>
                  <td className="p-2.5 text-right">
                    {r.klik > 0 ? formatCurrency(r.epc) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NegaraTable({ rows }: { rows: NegaraRow[] }) {
  return (
    <div className="bg-white rounded-lg border overflow-hidden self-start">
      <div className="p-3 border-b">
        <h3 className="text-sm font-medium">Per Negara</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          &quot;Wilayah Klik&quot; di CSV Shopee = negara (bukan provinsi),
          pesanan tidak punya dimensi ini
        </p>
      </div>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0">
            <tr className="bg-gray-50 border-b">
              <th className="p-2.5 font-medium text-left">Negara</th>
              <th className="p-2.5 font-medium text-right">Klik</th>
              <th className="p-2.5 font-medium text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.negara} className="border-b hover:bg-gray-50">
                <td className="p-2.5">{r.negara}</td>
                <td className="p-2.5 text-right">{formatNumber(r.klik)}</td>
                <td className="p-2.5 text-right text-muted-foreground">
                  {(r.share * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  // Keterangan cakupan angka, pengingat bahwa card serupa di halaman lain
  // menghitung cakupan berbeda
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
