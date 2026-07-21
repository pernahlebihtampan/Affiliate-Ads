"use client";

import { Fragment, useMemo, useState } from "react";
import { formatCurrency, formatNumber, isNoiseTag } from "@/lib/utils";
import type { ReportRow, ReportTotals } from "@/lib/daily-snapshot";

// Label Indonesia untuk "Penayangan kampanye" Meta (MetaCampaign.status)
const DELIVERY_LABELS: Record<string, string> = {
  active: "Aktif",
  inactive: "Nonaktif",
  archived: "Arsip",
};

function getRoasColor(roas: number): string {
  if (roas >= 2) return "bg-green-100 text-green-700";
  if (roas >= 1) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

// Header kolom yang bisa diklik untuk mengurutkan (asc/desc bergantian).
function SortableTh({
  label,
  sortKeyName,
  align,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  sortKeyName: keyof ReportRow;
  align: "left" | "right";
  sortKey: keyof ReportRow | null;
  sortDir: "asc" | "desc";
  onSort: (key: keyof ReportRow) => void;
}) {
  const active = sortKey === sortKeyName;
  return (
    <th
      onClick={() => onSort(sortKeyName)}
      className={`p-3 font-medium cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap align-middle ${
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

// Indikator "Penayangan kampanye" Meta (read-only):
// active = Aktif hijau; inactive = Nonaktif abu-abu; archived = saklar kosong.
function StatusIndicator({ status }: { status: string }) {
  const isOn = status === "active";
  const isArchived = status === "archived";
  const label = DELIVERY_LABELS[status] || "Nonaktif";
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

// Tabel laporan read-only (dipakai Dasbor Harian). Bentuk sama seperti tabel
// dasbor lama tapi tanpa sort/filter — baris apa adanya dari snapshot beku.
export function ReportTable({
  rows,
  totals,
  title,
  emptyMessage = "Belum ada data untuk tanggal ini. Impor CSV di tab Impor.",
  hideNoise = true,
}: {
  rows: ReportRow[];
  totals: ReportTotals | null;
  // Bar judul di dalam kartu (mis. tanggal di tab Rentang) agar menyatu ke tabel
  title?: string;
  emptyMessage?: string;
  // Sembunyikan tag tak berarti (setting `sembunyikanTagTakBerarti`); default true.
  hideNoise?: boolean;
}) {
  // Default: SEMUA baris ter-expand. Simpan set yang DICIUTKAN (kosong = semua
  // terbuka) supaya baris baru dari snapshot lain otomatis ikut terbuka.
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const toggleExpand = (id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  // Sembunyikan tag Shopee tak berarti PADA tanggal laporan ini: komisi 0 & klik
  // < 10. Diterapkan ke rincian per-tag (di-trim) dan ke baris tag lepas (belum
  // tertaut) yang juga tak berarti. Baris kampanye Meta tetap tampil (punya spend/
  // ROAS); totalnya utuh, jadi footer dihitung ulang hanya dengan mengurangi baris
  // tag lepas yang disembunyikan (spend & komisinya 0 → ROAS/profit tak berubah).
  // Bila `hideNoise` false, semua baris & total ditampilkan apa adanya.
  const visibleRows = useMemo(
    () =>
      hideNoise
        ? rows
            .map((r) => ({
              ...r,
              tags: r.tags.filter((t) => !isNoiseTag(t.totalKomisi, t.shopeeClicks)),
            }))
            .filter(
              (r) => !(r.metaCampaignId === null && isNoiseTag(r.totalKomisi, r.shopeeClicks))
            )
        : rows,
    [rows, hideNoise]
  );
  const visibleTotals = useMemo<ReportTotals | null>(() => {
    if (!totals) return null;
    if (!hideNoise) return totals;
    const hidden = rows.filter(
      (r) => r.metaCampaignId === null && isNoiseTag(r.totalKomisi, r.shopeeClicks)
    );
    if (hidden.length === 0) return totals;
    const d = hidden.reduce(
      (a, r) => {
        a.shopeeClicks += r.shopeeClicks;
        a.orders += r.orders;
        a.items += r.items;
        a.nilaiPembelian += r.nilaiPembelian;
        return a;
      },
      { shopeeClicks: 0, orders: 0, items: 0, nilaiPembelian: 0 }
    );
    return {
      ...totals,
      shopeeClicks: totals.shopeeClicks - d.shopeeClicks,
      orders: totals.orders - d.orders,
      items: totals.items - d.items,
      nilaiPembelian: totals.nilaiPembelian - d.nilaiPembelian,
    };
  }, [rows, totals, hideNoise]);

  // Baris yang punya rincian per-tag (1 Meta : >1 tag Shopee terlihat)
  const expandableIds = useMemo(
    () =>
      visibleRows
        .filter((r) => r.metaCampaignId !== null && r.tags.length > 1)
        .map((r) => r.metaCampaignId as number),
    [visibleRows]
  );
  const anyExpanded = expandableIds.some((id) => !collapsed.has(id));
  const toggleAll = () =>
    setCollapsed(anyExpanded ? new Set(expandableIds) : new Set());

  // Urutan tabel. sortKey null = urutan asli (dari snapshot). Angka diurut
  // numerik, teks pakai localeCompare id-ID.
  const [sortKey, setSortKey] = useState<keyof ReportRow | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const handleSort = (key: keyof ReportRow) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };
  const sortedRows = useMemo(() => {
    if (!sortKey) return visibleRows;
    const arr = [...visibleRows];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av ?? "").localeCompare(String(bv ?? ""), "id-ID");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [visibleRows, sortKey, sortDir]);

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {title && (
        <div className="px-4 py-2.5 border-b bg-gray-100 font-semibold text-sm">
          {title}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <SortableTh label="Penayangan" sortKeyName="metaCampaignStatus" align="left" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="Kampanye Meta" sortKeyName="metaCampaignName" align="left" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="Akun" sortKeyName="metaAccountName" align="left" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              {/* Tag Shopee: label bisa diklik untuk sort + toggle perluas/ciutkan semua */}
              <th className="p-3 font-medium whitespace-nowrap align-middle text-left">
                <span className="inline-flex items-center gap-1.5">
                  {expandableIds.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleAll();
                      }}
                      title={anyExpanded ? "Ciutkan semua tag" : "Perluas semua tag"}
                      className="inline-block w-3 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {anyExpanded ? "▾" : "▸"}
                    </button>
                  )}
                  <span
                    onClick={() => handleSort("shopeeCampaignName")}
                    title="Urutkan berdasarkan Tag Shopee"
                    className={`cursor-pointer select-none hover:text-primary ${
                      sortKey === "shopeeCampaignName" ? "text-primary" : ""
                    }`}
                  >
                    Tag Shopee
                    <span className="inline-block w-3 ml-0.5 text-xs">
                      {sortKey === "shopeeCampaignName" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </span>
                  </span>
                </span>
              </th>
              <SortableTh label="Spend +PPN" sortKeyName="spend" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="Klik Meta" sortKeyName="metaClicks" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="Klik Shopee" sortKeyName="shopeeClicks" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="Pesanan" sortKeyName="orders" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="Komisi" sortKeyName="totalKomisi" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="ROAS" sortKeyName="roas" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-6 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => {
                const canExpand = row.metaCampaignId !== null && row.tags.length > 1;
                const isExpanded = canExpand && !collapsed.has(row.metaCampaignId!);
                return (
                  <Fragment
                    key={row.metaCampaignId ?? `unlinked-${row.shopeeCampaignId}`}
                  >
                    <tr
                      className={`border-b hover:bg-gray-50 ${
                        row.metaCampaignId === null ? "bg-amber-50/50" : ""
                      }`}
                    >
                      <td className="p-3">
                        {row.metaCampaignId === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <StatusIndicator status={row.metaCampaignStatus} />
                        )}
                      </td>
                      <td className="p-3">
                        {row.metaCampaignId === null ? (
                          <a
                            href="/campaign-hub"
                            title="Kampanye Shopee ini belum ditautkan ke kampanye Meta, tautkan di Pusat Kampanye"
                            className="text-muted-foreground italic hover:underline"
                          >
                            Belum tertaut
                          </a>
                        ) : (
                          <a
                            href={`/campaign/${row.metaCampaignId}`}
                            className="text-primary hover:underline font-medium"
                          >
                            {row.metaCampaignName}
                          </a>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {row.metaCampaignId === null ? "—" : row.metaAccountName}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {canExpand ? (
                          <button
                            onClick={() => toggleExpand(row.metaCampaignId!)}
                            className="flex items-center gap-1.5 text-left hover:text-foreground"
                            title={
                              isExpanded
                                ? "Sembunyikan rincian per tag"
                                : `Lihat rincian ${row.tags.length} tag Shopee`
                            }
                          >
                            <span className="inline-block w-3 text-xs transition-transform">
                              {isExpanded ? "▾" : "▸"}
                            </span>
                            <span>{row.shopeeCampaignName}</span>
                          </button>
                        ) : (
                          row.shopeeCampaignName
                        )}
                      </td>
                      <td className="p-3 text-right">{formatCurrency(row.spend)}</td>
                      <td className="p-3 text-right">{formatNumber(row.metaClicks)}</td>
                      <td className="p-3 text-right">{formatNumber(row.shopeeClicks)}</td>
                      <td className="p-3 text-right">{formatNumber(row.orders)}</td>
                      <td className="p-3 text-right">
                        <div>{formatCurrency(row.totalKomisi)}</div>
                        {row.komisiTertunda > 0 && (
                          <div className="text-xs text-muted-foreground">
                            🕐{formatCurrency(row.komisiTertunda)}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {row.metaCampaignId === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${getRoasColor(
                              row.roas
                            )}`}
                          >
                            {row.roas.toFixed(2)}x
                          </span>
                        )}
                      </td>
                    </tr>
                    {isExpanded &&
                      row.tags.map((tag) => (
                        <tr
                          key={tag.shopeeCampaignId}
                          className="border-b bg-gray-50/60 text-muted-foreground"
                        >
                          <td className="p-2"></td>
                          <td className="p-2"></td>
                          <td className="p-2 text-xs">{tag.shopeeAccountName}</td>
                          <td className="p-2 pl-8 text-xs">↳ {tag.shopeeCampaignName}</td>
                          <td className="p-2 text-right text-xs">—</td>
                          <td className="p-2 text-right text-xs">—</td>
                          <td className="p-2 text-right text-xs">
                            {formatNumber(tag.shopeeClicks)}
                          </td>
                          <td className="p-2 text-right text-xs">
                            {formatNumber(tag.orders)}
                          </td>
                          <td className="p-2 text-right text-xs">
                            <div>{formatCurrency(tag.totalKomisi)}</div>
                            {tag.komisiTertunda > 0 && (
                              <div className="text-[11px]">
                                🕐{formatCurrency(tag.komisiTertunda)}
                              </div>
                            )}
                          </td>
                          <td className="p-2 text-right text-xs">—</td>
                        </tr>
                      ))}
                  </Fragment>
                );
              })
            )}
          </tbody>
          {visibleTotals && visibleRows.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 font-medium">
                <td className="p-3" colSpan={4}>
                  Total ({visibleRows.length} kampanye)
                </td>
                <td className="p-3 text-right">{formatCurrency(visibleTotals.spend)}</td>
                <td className="p-3 text-right">{formatNumber(visibleTotals.metaClicks)}</td>
                <td className="p-3 text-right">{formatNumber(visibleTotals.shopeeClicks)}</td>
                <td className="p-3 text-right">{formatNumber(visibleTotals.orders)}</td>
                <td className="p-3 text-right">{formatCurrency(visibleTotals.totalKomisi)}</td>
                <td className="p-3 text-right">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${getRoasColor(
                      visibleTotals.roas
                    )}`}
                  >
                    {visibleTotals.roas.toFixed(2)}x
                  </span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
