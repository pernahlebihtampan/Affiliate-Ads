"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { ReportTable } from "@/components/report-table";
import { FileDropCard, type ImportedInfo } from "@/components/file-drop-card";
import { showToast } from "@/components/toast-container";
import { DateInput } from "@/components/ui/date-input";
import { SearchSelect } from "@/components/ui/search-select";
import { defaultDateRange, isNoiseTag } from "@/lib/utils";
import { useHideNoiseTags } from "@/lib/use-hide-noise-tags";
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

// Bentuk saran dari /api/campaign-hub action "suggest" (dikelompokkan per Meta).
interface TagCandidate {
  shopeeCampaignId: number;
  shopeeCampaignName: string;
  nameScore: number;
  contained: boolean;        // true = terkandung persis di nama Meta
  dataScore?: number | null; // null = data pesanan tidak cukup untuk dinilai
}
interface Suggestion {
  metaCampaignId: number;
  metaCampaignName: string;
  candidates: TagCandidate[];
}
// Saran terbaik untuk satu tag (hasil inversi grup per-Meta → per-tag).
type TagSuggestion = {
  metaId: number;
  metaName: string;
  nameScore: number;
  contained: boolean;
  dataScore?: number | null;
};

// Kartu impor per akun: Meta → Meta Ads + Penempatan; Shopee → Komisi + Klik.
const META_TYPES = [
  { type: "meta", label: "Wilayah" },
  { type: "meta_placement", label: "Penempatan" },
];
const SHOPEE_TYPES = [
  { type: "shopee_commission", label: "Komisi" },
  { type: "shopee_click", label: "Klik" },
];

// Urutan prioritas saran: terkandung persis > skor nama > skor data.
function isBetterSuggestion(a: TagSuggestion, b: TagSuggestion): boolean {
  if (a.contained !== b.contained) return a.contained;
  if (a.nameScore !== b.nameScore) return a.nameScore > b.nameScore;
  return (a.dataScore ?? -1) > (b.dataScore ?? -1);
}

// Normalisasi ala matching-engine (huruf a-z saja) sambil melacak posisi tiap
// huruf di teks mentah, agar span cocok bisa dipetakan balik ke teks asli.
function normWithMap(name: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  for (let i = 0; i < name.length; i++) {
    const ch = name[i].toLowerCase();
    if (ch >= "a" && ch <= "z") {
      norm += ch;
      map.push(i);
    }
  }
  return { norm, map };
}

// Substring bersama terpanjang antara nama tag & nama Meta (dinormalisasi) →
// itulah bagian yang membuat tag masuk saran. Kembalikan span di teks Meta mentah.
function suggestionMatchSpan(metaName: string, tagName: string): { start: number; end: number } | null {
  const { norm, map } = normWithMap(metaName);
  const tagNorm = normWithMap(tagName).norm;
  if (norm.length === 0 || tagNorm.length === 0) return null;
  // DP longest common substring; simpan indeks akhir di sisi `norm` (Meta).
  const dp = new Array(tagNorm.length + 1).fill(0);
  let best = 0;
  let bestEnd = 0; // indeks akhir (eksklusif) di `norm`
  for (let i = 1; i <= norm.length; i++) {
    let prev = 0;
    for (let j = 1; j <= tagNorm.length; j++) {
      const tmp = dp[j];
      if (norm[i - 1] === tagNorm[j - 1]) {
        dp[j] = prev + 1;
        if (dp[j] > best) {
          best = dp[j];
          bestEnd = i;
        }
      } else {
        dp[j] = 0;
      }
      prev = tmp;
    }
  }
  if (best < 4) return null; // terlalu pendek → tak bermakna
  const startNorm = bestEnd - best;
  return { start: map[startNorm], end: map[bestEnd - 1] + 1 };
}

// Render nama Meta dengan span pencocokan tag di-highlight (bila ada).
function highlightSuggestion(metaName: string, tagName: string) {
  const span = suggestionMatchSpan(metaName, tagName);
  if (!span) return metaName;
  return (
    <>
      {metaName.slice(0, span.start)}
      <mark className="bg-yellow-200 text-inherit rounded-sm">
        {metaName.slice(span.start, span.end)}
      </mark>
      {metaName.slice(span.end)}
    </>
  );
}

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
    { id: number; name: string; accountName: string; komisiTotal: number; klikTotal: number }[]
  >([]);
  const hideNoise = useHideNoiseTags();
  // Tag belum tertaut yang terlihat: bila `hideNoise` aktif, buang tag tak
  // berarti (komisi 0 & klik < 10 sepanjang waktu). Filter di render agar ikut
  // berubah saat setting termuat setelah fetch.
  const visibleUnlinkedTags = useMemo(
    () =>
      hideNoise
        ? unlinkedTags.filter((t) => !isNoiseTag(t.komisiTotal, t.klikTotal))
        : unlinkedTags,
    [unlinkedTags, hideNoise]
  );
  const [linkPick, setLinkPick] = useState<Record<number, number>>({}); // shopeeId → metaId
  // Auto-Suggest: saran Meta terbaik per tag (shopeeId → saran), diisi tombol
  // "Auto-Suggest". Dipakai untuk menampilkan hint & pre-isi `linkPick`.
  const [suggestByTag, setSuggestByTag] = useState<Record<number, TagSuggestion>>({});
  const [suggesting, setSuggesting] = useState(false);

  // Lazy-refresh: Laporan & Rentang ditandai "perlu muat ulang" saat sumbernya
  // berubah (impor/tautan), lalu di-refetch saat tab-nya dibuka. Hubungkan
  // tetap eager (badge jumlah tag harus akurat), jadi tak butuh flag.
  const [dirty, setDirty] = useState({ laporan: false, rentang: false });

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
        // Semua tag belum tertaut; penyembunyian tag tak berarti dilakukan saat
        // render (visibleUnlinkedTags) sesuai setting `sembunyikanTagTakBerarti`.
        .filter((s: { hub: unknown }) => !s.hub)
        .map(
          (s: {
            id: number;
            name: string;
            shopeeAccount: { name: string };
            komisiTotal?: number;
            klikTotal?: number;
          }) => ({
            id: s.id,
            name: s.name,
            accountName: s.shopeeAccount?.name ?? "",
            komisiTotal: s.komisiTotal ?? 0,
            klikTotal: s.klikTotal ?? 0,
          })
        )
    );
  }, []);

  // Rentang = query manual (tombol "Tampilkan"). Segarkan hanya bila sudah
  // dimuat, agar tabel yang sedang tampil tak jadi basi setelah impor/tautan —
  // tanpa menembak query untuk rentang yang belum pernah diminta.
  const refreshRangeIfLoaded = useCallback(async () => {
    if (rangeTables.length === 0) return;
    const res = await fetch(`/api/daily/range?from=${rangeFrom}&to=${rangeTo}`);
    const data = await res.json();
    setRangeTables(data.tables ?? []);
  }, [rangeTables.length, rangeFrom, rangeTo]);

  // Impor membuat dimensi ShopeeCampaign/MetaCampaign baru (get-or-create), jadi
  // tab Hubungkan ikut disegarkan (badge live). `fetchDaily` wajib — status kartu
  // di tab Impor & sumber tab Laporan ikut ter-refresh. Rentang ditunda ke buka-tab.
  const onImportDone = useCallback(async () => {
    await Promise.all([fetchDaily(), fetchHub()]);
    setDirty((d) => ({ ...d, rentang: true }));
  }, [fetchDaily, fetchHub]);

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

  // POST recompute snapshot tanggal aktif (server, wajib demi kebenaran) tanpa
  // menarik hasil ke klien — dipakai `linkTag` yang menunda muat-ulang Laporan.
  async function recomputeServer(): Promise<boolean> {
    const res = await fetch("/api/daily/recompute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
    });
    if (!res.ok) {
      const d = await res.json();
      showToast("Gagal hitung ulang", d.error || `HTTP ${res.status}`, "destructive");
      return false;
    }
    return true;
  }

  // Tombol "↻ Hitung ulang" di tab Laporan (sedang terbuka) → refetch langsung.
  async function recompute() {
    setRecomputing(true);
    try {
      if (await recomputeServer()) {
        await fetchDaily();
        showToast("Snapshot diperbarui", `Laporan ${date} dihitung ulang.`, "success");
      }
    } finally {
      setRecomputing(false);
    }
  }

  // Auto-Suggest: ambil saran koneksi (dikelompokkan per Meta), inversi jadi
  // saran terbaik per tag, lalu pre-isi `linkPick` untuk tag yang belum dipilih.
  async function fetchSuggestions() {
    setSuggesting(true);
    try {
      const res = await fetch("/api/campaign-hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "suggest" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showToast("Gagal", d.error || `HTTP ${res.status}`, "destructive");
        return;
      }
      const data = await res.json();
      const groups: Suggestion[] = data.suggestions || [];
      // Inversi per-Meta → per-tag: simpan kandidat terbaik tiap tag
      // (terkandung dulu, lalu skor nama tertinggi, lalu skor data).
      const byTag: Record<number, TagSuggestion> = {};
      for (const g of groups) {
        for (const c of g.candidates) {
          const cand: TagSuggestion = {
            metaId: g.metaCampaignId,
            metaName: g.metaCampaignName,
            nameScore: c.nameScore,
            contained: c.contained,
            dataScore: c.dataScore,
          };
          const cur = byTag[c.shopeeCampaignId];
          if (!cur || isBetterSuggestion(cand, cur)) byTag[c.shopeeCampaignId] = cand;
        }
      }
      setSuggestByTag(byTag);
      // Pre-isi pilihan: hanya tag yang belum dipilih manual (jangan menimpa).
      setLinkPick((p) => {
        const next = { ...p };
        for (const [sid, s] of Object.entries(byTag)) {
          if (next[+sid] == null) next[+sid] = s.metaId;
        }
        return next;
      });
      const n = Object.keys(byTag).length;
      if (n > 0) showToast(`${n} tag dapat saran koneksi`, undefined, "success");
      else showToast("Tidak ada saran", "Coba impor data terlebih dahulu");
    } finally {
      setSuggesting(false);
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
      await fetchHub(); // tag tertaut hilang seketika (tab Hubungkan sedang terbuka)
      // Recompute snapshot server (wajib), tapi tunda muat-ulang Laporan & Rentang
      // ke saat tab-nya dibuka.
      const ok = await recomputeServer();
      if (ok) setDirty({ laporan: true, rentang: true });
    } else {
      const d = await res.json();
      showToast("Gagal menautkan", d.error || `HTTP ${res.status}`, "destructive");
    }
  }

  // Buka tab; bila sumbernya berubah sejak terakhir dilihat (dirty), muat ulang
  // datanya sekarang lalu bersihkan flag. Hubungkan selalu eager → tak dicek.
  async function selectTab(id: TabId) {
    setTab(id);
    if (id === "laporan" && dirty.laporan) {
      setDirty((d) => ({ ...d, laporan: false }));
      await fetchDaily();
    } else if (id === "rentang" && dirty.rentang) {
      setDirty((d) => ({ ...d, rentang: false }));
      await refreshRangeIfLoaded();
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
    { id: "hubungkan", label: "Hubungkan", badge: visibleUnlinkedTags.length || undefined },
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
              onClick={() => selectTab(t.id)}
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
                <span className="text-3xl" aria-hidden>🗓️</span>
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
                          onDone={onImportDone}
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
                          onDone={onImportDone}
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
              <div className="flex items-center gap-3">
                <button
                  onClick={fetchSuggestions}
                  disabled={suggesting || visibleUnlinkedTags.length === 0}
                  className="px-3 py-1.5 text-sm bg-secondary text-secondary-foreground rounded-md font-medium hover:bg-gray-200 disabled:opacity-50"
                >
                  {suggesting ? "Mencari…" : "🤖 Sarankan"}
                </button>
                <a href="/campaign-hub" className="text-sm text-primary hover:underline">
                  Buka Pusat Kampanye →
                </a>
              </div>
            </div>
            {visibleUnlinkedTags.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Semua tag Shopee sudah tertaut. 🎉
              </p>
            ) : (
              <div className="bg-white rounded-lg border divide-y">
                {visibleUnlinkedTags.map((tag) => {
                  const sug = suggestByTag[tag.id];
                  return (
                    <div key={tag.id} className="p-3 space-y-2">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <p className="text-sm font-medium">{tag.name}</p>
                        <span className="text-xs text-muted-foreground">{tag.accountName}</span>
                        {sug && (
                          <span className="text-xs">
                            <span className={sug.contained ? "text-green-600" : "text-amber-600"}>
                              {sug.contained ? "■" : "~"}
                            </span>{" "}
                            Saran: <span className="font-medium">{highlightSuggestion(sug.metaName, tag.name)}</span>{" "}
                            <span className="text-muted-foreground">
                              (nama {sug.nameScore}%
                              {sug.dataScore != null ? ` · 📊 data ${sug.dataScore}%` : ""})
                            </span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <SearchSelect
                          items={metaCampaigns}
                          value={linkPick[tag.id] ?? null}
                          onChange={(id) =>
                            setLinkPick((p) => ({ ...p, [tag.id]: id as number }))
                          }
                          getKey={(m) => m.id}
                          displayFn={(m) => m.name}
                          placeholder="Pilih kampanye Meta…"
                          wrapperClassName="basis-3/4 shrink-0"
                          className="w-full"
                        />
                        <button
                          onClick={() => linkTag(tag.id)}
                          disabled={!linkPick[tag.id]}
                          className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Hubungkan
                        </button>
                      </div>
                    </div>
                  );
                })}
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
              hideNoise={hideNoise}
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
                    hideNoise={hideNoise}
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
