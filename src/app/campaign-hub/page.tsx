"use client";

import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { showToast } from "@/components/toast-container";

interface MetaCampaign {
  id: number;
  name: string;
  status: string;
  metaAdAccount: { id: number; name: string };
  hub: { shopeeCampaign: { id: number; name: string } } | null;
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
}

export default function CampaignHubPage() {
  const [metaCampaigns, setMetaCampaigns] = useState<MetaCampaign[]>([]);
  const [shopeeCampaigns, setShopeeCampaigns] = useState<ShopeeCampaign[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUnlinkedOnly, setShowUnlinkedOnly] = useState(true);
  const [selectedMetaId, setSelectedMetaId] = useState<number | null>(null);
  const [selectedShopeeId, setSelectedShopeeId] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const res = await fetch("/api/campaign-hub");
    const data = await res.json();
    setMetaCampaigns(data.metaCampaigns || []);
    setShopeeCampaigns(data.shopeeCampaigns || []);
    setLoading(false);
  };

  const fetchSuggestions = async () => {
    const res = await fetch("/api/campaign-hub", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "suggest" }),
    });
    const data = await res.json();
    setSuggestions(data.suggestions || []);
    setShopeeCampaigns(data.shopeeCampaigns || []);
    setMetaCampaigns(data.metaCampaigns || []);
    if (data.suggestions?.length > 0) {
      showToast(
        `${data.suggestions.length} saran koneksi ditemukan`,
        undefined,
        "success"
      );
    } else {
      showToast("Tidak ada saran", "Coba impor data terlebih dahulu");
    }
  };

  const handleLink = async (metaId: number, shopeeId: number) => {
    const res = await fetch("/api/campaign-hub", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "link", metaCampaignId: metaId, shopeeCampaignId: shopeeId }),
    });
    if (res.ok) {
      showToast("Kampanye terhubung!", undefined, "success");
      setSuggestions((prev) => prev.filter((s) => s.metaCampaignId !== metaId));
      fetchData();
    }
  };

  const handleUnlink = async (metaId: number) => {
    const res = await fetch("/api/campaign-hub", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unlink", metaCampaignId: metaId }),
    });
    if (res.ok) {
      showToast("Koneksi diputus");
      fetchData();
    }
  };

  const handleManualLink = async () => {
    if (!selectedMetaId || !selectedShopeeId) {
      showToast("Pilih kampanye Meta dan Shopee", undefined, "destructive");
      return;
    }
    await handleLink(selectedMetaId, selectedShopeeId);
    setSelectedMetaId(null);
    setSelectedShopeeId(null);
  };

  const filteredMetaCampaigns = showUnlinkedOnly
    ? metaCampaigns.filter((m) => !m.hub)
    : metaCampaigns;

  const unlinkedShopee = shopeeCampaigns.filter((s) => !s.hub);

  const handleQuickLink = (metaId: number) => {
    setSelectedMetaId(metaId);
    setSelectedShopeeId(null);
    const el = document.getElementById("manual-link-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Campaign Hub</h1>
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
        <div id="manual-link-section" className="bg-white rounded-lg border p-4 space-y-3">
          <h2 className="font-medium">Hubungkan Manual</h2>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Kampanye Meta
              </label>
              <select
                value={selectedMetaId || ""}
                onChange={(e) => setSelectedMetaId(parseInt(e.target.value) || null)}
                className="px-3 py-2 border rounded-md text-sm w-[32rem]"
              >
                <option value="">-- Pilih --</option>
                {metaCampaigns
                  .filter((m) => !m.hub)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.metaAdAccount.name})
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Tag Shopee
              </label>
              <select
                value={selectedShopeeId || ""}
                onChange={(e) => setSelectedShopeeId(parseInt(e.target.value) || null)}
                className="px-3 py-2 border rounded-md text-sm w-96"
              >
                <option value="">-- Pilih --</option>
                {unlinkedShopee.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.shopeeAccount.name})
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleManualLink}
              disabled={!selectedMetaId || !selectedShopeeId}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              Hubungkan
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
                      (kecocokan: {s.score}%)
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      handleLink(s.metaCampaignId, s.shopeeCampaignId)
                    }
                    className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs hover:bg-blue-700"
                  >
                    Sambungkan
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Toggle */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showUnlinkedOnly}
              onChange={(e) => setShowUnlinkedOnly(e.target.checked)}
              className="rounded"
            />
            Hanya tampilkan yang belum terhubung
          </label>
        </div>

        {/* Campaign List */}
        <div className="bg-white rounded-lg border overflow-hidden">
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
                      {showUnlinkedOnly
                        ? "Semua kampanye sudah terhubung!"
                        : "Belum ada kampanye Meta. Import CSV terlebih dahulu."}
                    </td>
                  </tr>
                ) : (
                  filteredMetaCampaigns.map((mc) => {
                    const shopeeName = mc.hub?.shopeeCampaign.name;
                    return (
                      <tr key={mc.id} className="border-b hover:bg-gray-50">
                        <td className="p-3 font-medium">{mc.name}</td>
                        <td className="p-3">
                          {shopeeName ? (
                            <span className="text-green-700 font-medium">
                              {shopeeName}
                            </span>
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
                          {mc.hub ? (
                            <button
                              onClick={() => handleUnlink(mc.id)}
                              className="px-3 py-1 bg-red-50 text-red-700 rounded text-xs hover:bg-red-100"
                            >
                              Putus
                            </button>
                          ) : (
                            <button
                              onClick={() => handleQuickLink(mc.id)}
                              className="px-3 py-1 bg-blue-50 text-blue-700 rounded text-xs hover:bg-blue-100"
                            >
                              Hubungkan
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
