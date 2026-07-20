"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { showToast } from "@/components/toast-container";

interface MetaCampaign {
  id: number;
  name: string;
  status: string;
  metaAdAccount: { id: number; name: string };
  // 1 Meta : banyak Shopee — daftar semua tag yang tertaut
  hubs: { shopeeCampaign: { id: number; name: string } }[];
}

interface ShopeeCampaign {
  id: number;
  name: string;
  shopeeAccount: { id: number; name: string };
  hub: { metaCampaignId: number } | null;
}

interface Suggestion {
  metaCampaignId: number;
  metaCampaignName: string;
  shopeeCampaignId: number;
  shopeeCampaignName: string;
  score: number;
  nameScore?: number;
  dataScore?: number | null; // null = data pesanan tidak cukup untuk dinilai
}

// ===== SEARCH SELECT COMPONENT =====
function SearchSelect<T extends { id: number }>({
  label,
  items,
  selectedId,
  onSelect,
  displayFn,
  placeholder,
  className,
}: {
  label: string;
  items: T[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  displayFn: (item: T) => string;
  placeholder?: string;
  className?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = search
    ? items.filter((item) =>
        displayFn(item).toLowerCase().includes(search.toLowerCase())
      )
    : items;

  const selected = items.find((i) => i.id === selectedId);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <div
        className={`px-3 py-2 border rounded-md text-sm cursor-pointer flex items-center justify-between bg-white ${className || ""}`}
        onClick={() => setOpen(!open)}
      >
        <span className={selected ? "" : "text-gray-400"}>
          {selected ? displayFn(selected) : placeholder || "-- Pilih --"}
        </span>
        <svg className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border rounded-md shadow-lg max-h-72 flex flex-col">
          <div className="p-1 border-b">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ketik untuk mencari..."
              className="w-full px-2 py-1.5 border rounded text-sm outline-none focus:ring-1 focus:ring-blue-400"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <div className="p-3 text-sm text-gray-400 text-center">Tidak ditemukan</div>
            ) : (
              <div className="py-1">
                {filtered.slice(0, 200).map((item) => (
                  <div
                    key={item.id}
                    className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-blue-50 truncate ${
                      item.id === selectedId ? "bg-blue-100 font-medium" : ""
                    }`}
                    onClick={() => {
                      onSelect(item.id);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    {displayFn(item)}
                  </div>
                ))}
                {filtered.length > 200 && (
                  <div className="px-3 py-1.5 text-xs text-gray-400 text-center">
                    … dan {filtered.length - 200} lainnya
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== QUICK SHOPEE SEARCH (inline di kolom Aksi) =====
function QuickShopeeSearch<T extends { id: number }>({
  items,
  selectedId,
  onSelect,
  displayFn,
  onConfirm,
  onCancel,
  loading,
}: {
  items: T[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  displayFn: (item: T) => string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = search
    ? items.filter((item) =>
        displayFn(item).toLowerCase().includes(search.toLowerCase())
      )
    : items;

  const selected = items.find((i) => i.id === selectedId);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        onCancel();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onCancel]);

  return (
    <div ref={wrapperRef} className="flex items-center gap-1">
      <div className="relative">
        <div
          className="px-2 py-1 border rounded text-xs w-40 cursor-pointer flex items-center justify-between bg-white"
          onClick={() => setOpen(!open)}
        >
          <span className={selected ? "truncate" : "text-gray-400 truncate"}>
            {selected ? displayFn(selected) : "-- Cari Tag --"}
          </span>
          <svg className={`w-3 h-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        {open && (
          <div className="absolute z-30 mt-1 left-0 w-72 bg-white border rounded-md shadow-lg max-h-64 flex flex-col">
            <div className="p-1 border-b">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ketik untuk mencari..."
                className="w-full px-2 py-1.5 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-400"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div className="overflow-y-auto flex-1">
              {filtered.length === 0 ? (
                <div className="p-3 text-xs text-gray-400 text-center">Tidak ditemukan</div>
              ) : (
                <div className="py-1">
                  {filtered.slice(0, 200).map((item) => (
                    <div
                      key={item.id}
                      className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-blue-50 truncate ${
                        item.id === selectedId ? "bg-blue-100 font-medium" : ""
                      }`}
                      onClick={() => {
                        onSelect(item.id);
                        setOpen(false);
                        setSearch("");
                      }}
                    >
                      {displayFn(item)}
                    </div>
                  ))}
                  {filtered.length > 200 && (
                    <div className="px-3 py-1.5 text-xs text-gray-400 text-center">
                      … dan {filtered.length - 200} lainnya
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <button
        onClick={onConfirm}
        disabled={loading || !selectedId}
        className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "..." : "✓"}
      </button>
      <button
        onClick={onCancel}
        className="px-2 py-1 text-gray-500 hover:text-gray-700 text-xs"
      >
        ✕
      </button>
    </div>
  );
}

export default function CampaignHubPage() {
  const [metaCampaigns, setMetaCampaigns] = useState<MetaCampaign[]>([]);
  const [shopeeCampaigns, setShopeeCampaigns] = useState<ShopeeCampaign[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkFilter, setLinkFilter] = useState<"all" | "linked" | "unlinked">(
    "unlinked",
  );
  const [selectedMetaId, setSelectedMetaId] = useState<number | null>(null);
  const [selectedShopeeId, setSelectedShopeeId] = useState<number | null>(null);
  const [linkingId, setLinkingId] = useState<number | null>(null);
  const [quickSelectMeta, setQuickSelectMeta] = useState<number | null>(null); // metaId yang dropdown in-row-nya terbuka
  const tableRef = useRef<HTMLDivElement>(null);

  // Filter pencarian untuk tabel
  const [filterMeta, setFilterMeta] = useState("");
  const [filterShopee, setFilterShopee] = useState("");

  // Simpan & restore scroll position agar tidak lompat ke atas saat refresh
  const saveScroll = useCallback(() => tableRef.current?.scrollTop || 0, []);
  const restoreScroll = useCallback((top: number) => {
    requestAnimationFrame(() => {
      if (tableRef.current) {
        tableRef.current.scrollTop = top;
      }
    });
  }, []);

  const fetchData = useCallback(async () => {
    const prevScroll = saveScroll();
    try {
      const res = await fetch("/api/campaign-hub");
      if (!res.ok) throw new Error("Gagal memuat data");
      const data = await res.json();
      setMetaCampaigns(data.metaCampaigns || []);
      setShopeeCampaigns(data.shopeeCampaigns || []);
    } catch (e) {
      showToast("Gagal memuat data", String(e), "destructive");
    }
    restoreScroll(prevScroll);
  }, [saveScroll, restoreScroll]);

  // Initial load
  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchData();
      setLoading(false);
    })();
  }, [fetchData]);

  const fetchSuggestions = async () => {
    try {
      const res = await fetch("/api/campaign-hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "suggest" }),
      });
      if (!res.ok) throw new Error("Gagal mendapatkan saran");
      const data = await res.json();
      setSuggestions(data.suggestions || []);
      setShopeeCampaigns(data.shopeeCampaigns || []);
      setMetaCampaigns(data.metaCampaigns || []);
      if (data.suggestions?.length > 0) {
        showToast(`${data.suggestions.length} saran koneksi ditemukan`, undefined, "success");
      } else {
        showToast("Tidak ada saran", "Coba impor data terlebih dahulu");
      }
    } catch (e) {
      showToast("Gagal", String(e), "destructive");
    }
  };

  const handleLink = async (metaId: number, shopeeId: number) => {
    setLinkingId(metaId);
    try {
      const res = await fetch("/api/campaign-hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "link",
          metaCampaignId: metaId,
          shopeeCampaignId: shopeeId,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${res.status}`);
      }
      showToast("Kampanye terhubung!", undefined, "success");
      setSuggestions((prev) => prev.filter((s) => s.metaCampaignId !== metaId));
      setSelectedMetaId(null);
      setSelectedShopeeId(null);
      setQuickSelectMeta(null);
      await fetchData();
    } catch (e) {
      showToast("Gagal menghubungkan", String(e), "destructive");
    } finally {
      setLinkingId(null);
    }
  };

  // Putus satu tag Shopee spesifik (1 Meta bisa punya banyak tag)
  const handleUnlink = async (shopeeCampaignId: number) => {
    try {
      const res = await fetch("/api/campaign-hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unlink", shopeeCampaignId }),
      });
      if (!res.ok) throw new Error("Gagal memutus");
      showToast("Tag diputus");
      await fetchData();
    } catch (e) {
      showToast("Gagal memutus", String(e), "destructive");
    }
  };

  const handleManualLink = async () => {
    if (!selectedMetaId || !selectedShopeeId) {
      showToast("Pilih kampanye Meta dan Shopee", undefined, "destructive");
      return;
    }
    await handleLink(selectedMetaId, selectedShopeeId);
  };

  // Filter berdasarkan pencarian teks (Kampanye Meta & Tag Shopee)
  const filteredMetaCampaigns = metaCampaigns.filter((m) => {
    if (linkFilter === "unlinked" && m.hubs.length > 0) return false;
    if (linkFilter === "linked" && m.hubs.length === 0) return false;
    if (filterMeta && !m.name.toLowerCase().includes(filterMeta.toLowerCase())) return false;
    if (filterShopee) {
      const q = filterShopee.toLowerCase();
      if (!m.hubs.some((h) => h.shopeeCampaign.name.toLowerCase().includes(q)))
        return false;
    }
    return true;
  });

  const unlinkedShopee = shopeeCampaigns.filter((s) => !s.hub);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Pusat Kampanye</h1>
            <p className="text-sm text-muted-foreground">
              Hubungkan kampanye Meta Ads ↔ Tag Shopee
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchSuggestions}
              className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-gray-200"
            >
              🤖 Auto-Suggest
            </button>
            <button
              onClick={fetchData}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Manual Link */}
        <div
          id="manual-link-section"
          className="bg-white rounded-lg border p-4 space-y-3 transition-all duration-300"
        >
          <h2 className="font-medium">Hubungkan Manual</h2>
          <div className="flex flex-wrap gap-3 items-end">
            <SearchSelect
              label="Kampanye Meta"
              items={metaCampaigns}
              selectedId={selectedMetaId}
              onSelect={(id) => setSelectedMetaId(id)}
              displayFn={(m) => `${m.name} (${m.metaAdAccount.name})`}
              placeholder="Cari kampanye Meta..."
              className="w-[32rem]"
            />
            <SearchSelect
              label="Tag Shopee"
              items={unlinkedShopee}
              selectedId={selectedShopeeId}
              onSelect={(id) => setSelectedShopeeId(id)}
              displayFn={(s) => `${s.name} (${s.shopeeAccount.name})`}
              placeholder="Cari tag Shopee..."
              className="w-96"
            />
            <button
              onClick={handleManualLink}
              disabled={!selectedMetaId || !selectedShopeeId || linkingId !== null}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {linkingId === selectedMetaId ? "..." : "Hubungkan"}
            </button>
          </div>
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="bg-white rounded-lg border p-4 space-y-3">
            <h2 className="font-medium">
              💡 Saran Koneksi ({suggestions.length})
            </h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {suggestions.map((s) => (
                <div
                  key={s.metaCampaignId}
                  className="flex items-center justify-between p-2 bg-blue-50 rounded text-sm"
                >
                  <div className="flex-1">
                    <span className="font-medium">{s.metaCampaignName}</span>
                    <span className="text-muted-foreground mx-2">→</span>
                    <span>{s.shopeeCampaignName}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      (kecocokan: {s.score}%
                      {s.nameScore != null && ` · nama ${s.nameScore}%`}
                      {s.dataScore != null ? ` · 📊 data ${s.dataScore}%` : ""})
                    </span>
                  </div>
                  <button
                    onClick={() => handleLink(s.metaCampaignId, s.shopeeCampaignId)}
                    disabled={linkingId === s.metaCampaignId}
                    className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                  >
                    {linkingId === s.metaCampaignId ? "..." : "Sambungkan"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter & Toggle */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 text-sm">
            {(
              [
                { value: "all", label: "Semua" },
                { value: "linked", label: "Terhubung" },
                { value: "unlinked", label: "Belum terhubung" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setLinkFilter(opt.value)}
                className={`px-3 py-1.5 rounded-md border text-sm ${
                  linkFilter === opt.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-white hover:bg-gray-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={filterMeta}
                onChange={(e) => setFilterMeta(e.target.value)}
                placeholder="Cari Kampanye Meta..."
                className="pl-8 pr-3 py-1.5 border rounded-md text-sm w-56 outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={filterShopee}
                onChange={(e) => setFilterShopee(e.target.value)}
                placeholder="Cari Tag Shopee..."
                className="pl-8 pr-3 py-1.5 border rounded-md text-sm w-56 outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>
        </div>

        {/* Campaign List */}
        <div ref={tableRef} className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left p-3 font-medium">Kampanye Meta</th>
                  <th className="text-left p-3 font-medium">Tag Shopee</th>
                  <th className="text-left p-3 font-medium">Akun Meta</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      Memuat...
                    </td>
                  </tr>
                ) : filteredMetaCampaigns.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      {linkFilter === "unlinked"
                        ? "Semua kampanye sudah terhubung!"
                        : linkFilter === "linked"
                          ? "Belum ada kampanye yang terhubung."
                          : "Belum ada kampanye Meta. Import CSV terlebih dahulu."}
                    </td>
                  </tr>
                ) : (
                  filteredMetaCampaigns.map((mc) => {
                    return (
                      <tr key={mc.id} className="border-b hover:bg-gray-50">
                        <td className="p-3 font-medium">{mc.name}</td>
                        <td className="p-3">
                          {mc.hubs.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {mc.hubs.map((h) => (
                                <span
                                  key={h.shopeeCampaign.id}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs font-medium"
                                >
                                  {h.shopeeCampaign.name}
                                  <button
                                    onClick={() => handleUnlink(h.shopeeCampaign.id)}
                                    className="text-green-500 hover:text-red-600 leading-none"
                                    title="Putus tag ini"
                                  >
                                    ✕
                                  </button>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {mc.metaAdAccount.name}
                        </td>
                        <td className="p-3">
                          <span className="text-xs">{mc.status}</span>
                        </td>
                        <td className="p-3">
                          {quickSelectMeta === mc.id ? (
                            <QuickShopeeSearch
                              items={unlinkedShopee}
                              selectedId={selectedShopeeId}
                              onSelect={(id) => setSelectedShopeeId(id)}
                              displayFn={(s) => `${s.name} (${s.shopeeAccount.name})`}
                              onConfirm={() => {
                                if (selectedShopeeId) {
                                  handleLink(mc.id, selectedShopeeId);
                                  setQuickSelectMeta(null);
                                  setSelectedShopeeId(null);
                                } else {
                                  showToast("Pilih tag Shopee terlebih dahulu");
                                }
                              }}
                              onCancel={() => {
                                setQuickSelectMeta(null);
                                setSelectedShopeeId(null);
                              }}
                              loading={linkingId === mc.id}
                            />
                          ) : (
                            <button
                              onClick={() => {
                                setQuickSelectMeta(mc.id);
                                setSelectedShopeeId(null);
                              }}
                              className="px-3 py-1 bg-blue-50 text-blue-700 rounded text-xs hover:bg-blue-100"
                            >
                              {mc.hubs.length > 0 ? "＋ Tambah Tag" : "Hubungkan"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
