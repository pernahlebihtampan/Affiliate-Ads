"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { ReportTable } from "@/components/report-table";
import { FileDropCard, type ImportedInfo } from "@/components/file-drop-card";
import { showToast } from "@/components/toast-container";
import { DateInput } from "@/components/ui/date-input";
import { defaultDateRange } from "@/lib/utils";
import type { ReportRow, ReportTotals } from "@/lib/daily-snapshot";

type TabId = "impor" | "hubungkan" | "laporan" | "rentang";

interface Account {
  id: number;
  name: string;
}

interface BatchInfo {
  type: string;
  accountId: number;
  accountType: string;
  accountName: string;
  fileName: string;
  importedAt: string;
}

interface DailyResponse {
  reportDate: string;
  batches: BatchInfo[];
  snapshot: { rows: ReportRow[]; totals: ReportTotals; generatedAt: string } | null;
}

interface RangeTable {
  reportDate: string;
  rows: ReportRow[];
  totals: ReportTotals;
  generatedAt: string;
}

// Kartu impor per akun: Meta → Meta Ads + Penempatan; Shopee → Komisi + Klik.
const META_TYPES = [
  { type: "meta", label: "Wilayah" },
  { type: "meta_placement", label: "Penempatan" },
];
const SHOPEE_TYPES = [
  { type: "shopee_commission", label: "Komisi" },
  { type: "shopee_click", label: "Klik" },
];

function formatTanggal(iso: string): string {
  // iso = "YYYY-MM-DD"; baca sebagai UTC agar tidak bergeser hari
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

export default function DailyDashboardPage() {
  const [date, setDate] = useState(() => defaultDateRange().to); // default: kemarin
  // Gerbang anti salah-tanggal: kartu impor terkunci sampai tanggal aktif
  // dikonfirmasi. Mengganti `date` bikin confirmedDate !== date → terkunci lagi.
  const [confirmedDate, setConfirmedDate] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("impor");
  const [busy, setBusy] = useState(false); // impor sedang berjalan (kunci kartu lain)

  const [accounts, setAccounts] = useState<{ shopee: Account[]; meta: Account[] }>({
    shopee: [], meta: [],
  });
  const [daily, setDaily] = useState<DailyResponse | null>(null);
  const [recomputing, setRecomputing] = useState(false);

  // Campaign Hub (untuk tab Hubungkan)
  const [metaCampaigns, setMetaCampaigns] = useState<{ id: number; name: string }[]>([]);
  const [unlinkedTags, setUnlinkedTags] = useState<
    { id: number; name: string; accountName: string }[]
  >([]);
  const [linkPick, setLinkPick] = useState<Record<number, number>>({}); // shopeeId → metaId

  // Rentang (tab Rentang)
  const [rangeFrom, setRangeFrom] = useState(() => defaultDateRange().from);
  const [rangeTo, setRangeTo] = useState(() => defaultDateRange().to);
  const [rangeTables, setRangeTables] = useState<RangeTable[]>([]);
  const [rangeLoading, setRangeLoading] = useState(false);

  const fetchAccounts = useCallback(async () => {
    const res = await fetch("/api/accounts");
    const data = await res.json();
    setAccounts({
      shopee: data.shopeeAccounts ?? [],
      meta: data.metaAdAccounts ?? [],
    });
  }, []);

  const fetchDaily = useCallback(async () => {
    const res = await fetch(`/api/daily?date=${date}`);
    const data = await res.json();
    setDaily(data);
  }, [date]);

  const fetchHub = useCallback(async () => {
    const res = await fetch("/api/campaign-hub");
    const data = await res.json();
    setMetaCampaigns(
      (data.metaCampaigns ?? []).map((m: { id: number; name: string }) => ({ id: m.id, name: m.name }))
    );
    setUnlinkedTags(
      (data.shopeeCampaigns ?? [])
        .filter((s: { hub: unknown }) => !s.hub)
        .map((s: { id: number; name: string; shopeeAccount: { name: string } }) => ({
          id: s.id, name: s.name, accountName: s.shopeeAccount?.name ?? "",
        }))
    );
  }, []);

  useEffect(() => { fetchAccounts(); fetchHub(); }, [fetchAccounts, fetchHub]);
  useEffect(() => { fetchDaily(); }, [fetchDaily]);

  // Peta status impor per kartu: `${type}:${accountId}` → info batch
  const importedMap = useMemo(() => {
    const m = new Map<string, ImportedInfo>();
    for (const b of daily?.batches ?? []) {
      m.set(`${b.type}:${b.accountId}`, { fileName: b.fileName, importedAt: b.importedAt });
    }
    return m;
  }, [daily]);

  const dateConfirmed = confirmedDate === date;
  const totalCards = accounts.meta.length * META_TYPES.length + accounts.shopee.length * SHOPEE_TYPES.length;
  const importedCards = importedMap.size;
  const pendingCards = Math.max(0, totalCards - importedCards);

  async function recompute() {
    setRecomputing(true);
    try {
      const res = await fetch("/api/daily/recompute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (res.ok) {
        await fetchDaily();
        showToast("Snapshot diperbarui", `Laporan ${date} dihitung ulang.`, "success");
      } else {
        const d = await res.json();
        showToast("Gagal hitung ulang", d.error || `HTTP ${res.status}`, "destructive");
      }
    } finally {
      setRecomputing(false);
    }
  }

  async function linkTag(shopeeId: number) {
    const metaId = linkPick[shopeeId];
    if (!metaId) return;
    const res = await fetch("/api/campaign-hub", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "link", metaCampaignId: metaId, shopeeCampaignId: shopeeId }),
    });
    if (res.ok) {
      showToast("Tersambung", "Tag Shopee ditautkan ke kampanye Meta.", "success");
      await fetchHub();
      // Recompute snapshot tanggal aktif agar tabel mencerminkan tautan baru
      await recompute();
    } else {
      const d = await res.json();
      showToast("Gagal menautkan", d.error || `HTTP ${res.status}`, "destructive");
    }
  }

  async function loadRange() {
    setRangeLoading(true);
    try {
      const res = await fetch(`/api/daily/range?from=${rangeFrom}&to=${rangeTo}`);
      const data = await res.json();
      setRangeTables(data.tables ?? []);
    } finally {
      setRangeLoading(false);
    }
  }

  const tabs: { id: TabId; label: string; badge?: number }[] = [
    { id: "impor", label: "Impor", badge: pendingCards || undefined },
    { id: "hubungkan", label: "Hubungkan", badge: unlinkedTags.length || undefined },
    { id: "laporan", label: "Laporan" },
    { id: "rentang", label: "Rentang" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header + pemilih tanggal harian (konteks bersama) */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Dasbor</h1>
            <p className="text-sm text-muted-foreground">
              Impor & laporan harian — satu tanggal, satu snapshot beku
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Tanggal laporan</span>
            <DateInput
              value={date}
              onChange={setDate}
              className="px-3 py-1.5 border rounded-md text-sm"
            />
          </label>
        </div>

        {/* Tab-bar horizontal */}
        <div className="border-b flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {t.badge ? (
                <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-amber-100 text-amber-700 text-xs">
                  {t.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* ===== TAB IMPOR ===== */}
        {tab === "impor" && (
          <div className="space-y-4">
            {/* Gerbang kunci tanggal — kartu di bawah terkunci sampai dikonfirmasi */}
            <div
              className={`rounded-lg border p-4 ${
                dateConfirmed ? "bg-green-50 border-green-300" : "bg-amber-50 border-amber-300"
              }`}
            >
              <p className="text-xs text-muted-foreground mb-2">Tanggal laporan impor</p>
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-3xl" aria-hidden>📅</span>
                <DateInput
                  value={date}
                  onChange={setDate}
                  className="px-3 py-1.5 border rounded-md text-base font-semibold bg-white"
                />
                <p className="text-lg font-bold flex-1 min-w-40">{formatTanggal(date)}</p>
                {dateConfirmed && (
                  <span className="inline-flex items-center gap-1.5 text-green-700 font-semibold text-sm">
                    ✓ Terkonfirmasi — siap impor
                  </span>
                )}
              </div>
              {!dateConfirmed && (
                <>
                  <p className="text-xs text-amber-700 mt-3">
                    ⚠ Kartu impor terkunci. Pastikan tanggal di atas benar lalu klik Konfirmasi
                    sehingga file distempel tanggal ini &amp; snapshot dibekukan. Salah tanggal impor sulit dibatalkan.
                  </p>
                  <button
                    onClick={() => setConfirmedDate(date)}
                    className="mt-3 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold"
                  >
                    Konfirmasi tanggal ini
                  </button>
                </>
              )}
            </div>
            {totalCards === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada akun. Tambah akun di menu <a href="/akun" className="text-primary hover:underline">Akun</a> dulu.
              </p>
            ) : (
              <div className="space-y-5">
                {accounts.meta.map((acc) => (
                  <div key={`meta-${acc.id}`}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Meta · {acc.name}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {META_TYPES.map((rt) => (
                        <FileDropCard
                          key={rt.type}
                          type={rt.type}
                          accountId={acc.id}
                          accountName={acc.name}
                          label={rt.label}
                          reportDate={date}
                          imported={importedMap.get(`${rt.type}:${acc.id}`)}
                          disabled={busy || !dateConfirmed}
                          onBusyChange={setBusy}
                          onDone={fetchDaily}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {accounts.shopee.map((acc) => (
                  <div key={`shopee-${acc.id}`}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Shopee · {acc.name}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {SHOPEE_TYPES.map((rt) => (
                        <FileDropCard
                          key={rt.type}
                          type={rt.type}
                          accountId={acc.id}
                          accountName={acc.name}
                          label={rt.label}
                          reportDate={date}
                          imported={importedMap.get(`${rt.type}:${acc.id}`)}
                          disabled={busy || !dateConfirmed}
                          onBusyChange={setBusy}
                          onDone={fetchDaily}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== TAB HUBUNGKAN ===== */}
        {tab === "hubungkan" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="text-sm text-muted-foreground">
                Tag Shopee yang belum ditautkan ke kampanye Meta. Menautkan akan menghitung ulang
                snapshot tanggal aktif.
              </p>
              <a href="/campaign-hub" className="text-sm text-primary hover:underline">
                Buka Pusat Kampanye (Auto-Suggest) →
              </a>
            </div>
            {unlinkedTags.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Semua tag Shopee sudah tertaut. 🎉
              </p>
            ) : (
              <div className="bg-white rounded-lg border divide-y">
                {unlinkedTags.map((tag) => (
                  <div key={tag.id} className="flex items-center gap-3 p-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{tag.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{tag.accountName}</p>
                    </div>
                    <select
                      value={linkPick[tag.id] ?? ""}
                      onChange={(e) =>
                        setLinkPick((p) => ({ ...p, [tag.id]: Number(e.target.value) }))
                      }
                      className="px-2 py-1.5 border rounded-md text-sm max-w-xs"
                    >
                      <option value="">Pilih kampanye Meta…</option>
                      {metaCampaigns.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => linkTag(tag.id)}
                      disabled={!linkPick[tag.id]}
                      className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Hubungkan
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== TAB LAPORAN ===== */}
        {tab === "laporan" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h2 className="text-lg font-semibold">Laporan {formatTanggal(date)}</h2>
              <button
                onClick={recompute}
                disabled={recomputing}
                className="px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-50"
                title="Hitung ulang snapshot dari data yang saat ini ter-atribusi ke tanggal ini"
              >
                {recomputing ? "Menghitung…" : "↻ Hitung ulang"}
              </button>
            </div>
            <ReportTable
              rows={daily?.snapshot?.rows ?? []}
              totals={daily?.snapshot?.totals ?? null}
              emptyMessage="Belum ada impor untuk tanggal ini. Buka tab Impor untuk mengunggah file CSV."
            />
            <p className="text-xs text-muted-foreground">
              Catatan: spend = biaya Meta tanggal ini (file 1 hari, +PPN 11%), sedangkan komisi =
              seluruh isi file Shopee (bisa mencakup pesanan tanggal klik sebelumnya yang matang di
              file ini). Jadi ROAS di sini adalah lensa arus-kas harian, bukan ROAS kohort per klik.
            </p>
          </div>
        )}

        {/* ===== TAB RENTANG ===== */}
        {tab === "rentang" && (
          <div className="space-y-4">
            <div className="flex items-end gap-3 flex-wrap">
              <label className="text-sm">
                <span className="block text-muted-foreground mb-1">Dari</span>
                <DateInput
                  value={rangeFrom}
                  onChange={setRangeFrom}
                  className="px-3 py-1.5 border rounded-md text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="block text-muted-foreground mb-1">Sampai</span>
                <DateInput
                  value={rangeTo}
                  onChange={setRangeTo}
                  className="px-3 py-1.5 border rounded-md text-sm"
                />
              </label>
              <button
                onClick={loadRange}
                disabled={rangeLoading}
                className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50"
              >
                {rangeLoading ? "Memuat…" : "Tampilkan"}
              </button>
            </div>
            {rangeTables.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {rangeLoading ? "Memuat…" : "Pilih rentang lalu klik Tampilkan. Satu tabel per tanggal, terkini dulu."}
              </p>
            ) : (
              <div className="space-y-6">
                {rangeTables.map((t) => (
                  <ReportTable
                    key={t.reportDate}
                    title={formatTanggal(t.reportDate)}
                    rows={t.rows}
                    totals={t.totals}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
