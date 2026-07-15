"use client";

import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { showToast } from "@/components/toast-container";

interface ShopeeAccount {
  id: number;
  name: string;
}

interface MetaAccount {
  id: number;
  name: string;
  actId: string;
}

export default function AkunPage() {
  const [shopeeAccounts, setShopeeAccounts] = useState<ShopeeAccount[]>([]);
  const [metaAccounts, setMetaAccounts] = useState<MetaAccount[]>([]);
  const [newShopeeName, setNewShopeeName] = useState("");
  const [newMetaName, setNewMetaName] = useState("");
  const [newMetaActId, setNewMetaActId] = useState("");

  // Edit state
  const [editingShopeeId, setEditingShopeeId] = useState<number | null>(null);
  const [editingShopeeName, setEditingShopeeName] = useState("");
  const [editingMetaId, setEditingMetaId] = useState<number | null>(null);
  const [editingMetaName, setEditingMetaName] = useState("");

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    const res = await fetch("/api/accounts");
    const data = await res.json();
    setShopeeAccounts(data.shopeeAccounts || []);
    setMetaAccounts(data.metaAdAccounts || []);
  };

  const addShopeeAccount = async () => {
    if (!newShopeeName.trim()) return;
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "shopee", name: newShopeeName.trim() }),
    });
    if (res.ok) {
      showToast("Akun Shopee ditambahkan", undefined, "success");
      setNewShopeeName("");
      fetchAccounts();
    } else {
      const data = await res.json();
      showToast("Gagal: " + (data.error || "unknown error"), undefined, "destructive");
    }
  };

  const addMetaAccount = async () => {
    if (!newMetaName.trim()) return;
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "meta", name: newMetaName.trim(), actId: newMetaActId.trim() }),
    });
    if (res.ok) {
      showToast("Akun Meta ditambahkan", undefined, "success");
      setNewMetaName("");
      setNewMetaActId("");
      fetchAccounts();
    }
  };

  const deleteShopee = async (id: number) => {
    if (!confirm("Hapus akun Shopee ini?")) return;
    await fetch("/api/accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "shopee", id }),
    });
    showToast("Akun Shopee dihapus");
    fetchAccounts();
  };

  const deleteMeta = async (id: number) => {
    if (!confirm("Hapus akun Meta ini?")) return;
    await fetch("/api/accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "meta", id }),
    });
    showToast("Akun Meta dihapus");
    fetchAccounts();
  };

  const startEditShopee = (acc: ShopeeAccount) => {
    setEditingShopeeId(acc.id);
    setEditingShopeeName(acc.name);
  };

  const cancelEditShopee = () => {
    setEditingShopeeId(null);
    setEditingShopeeName("");
  };

  const saveEditShopee = async () => {
    if (!editingShopeeName.trim() || editingShopeeId === null) return;
    const res = await fetch("/api/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "shopee", id: editingShopeeId, name: editingShopeeName.trim() }),
    });
    if (res.ok) {
      showToast("Nama akun diubah", undefined, "success");
      setEditingShopeeId(null);
      setEditingShopeeName("");
      fetchAccounts();
    } else {
      const data = await res.json();
      showToast("Gagal: " + (data.error || "unknown error"), undefined, "destructive");
    }
  };

  const startEditMeta = (acc: MetaAccount) => {
    setEditingMetaId(acc.id);
    setEditingMetaName(acc.name);
  };

  const cancelEditMeta = () => {
    setEditingMetaId(null);
    setEditingMetaName("");
  };

  const saveEditMeta = async () => {
    if (!editingMetaName.trim() || editingMetaId === null) return;
    const res = await fetch("/api/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "meta", id: editingMetaId, name: editingMetaName.trim() }),
    });
    if (res.ok) {
      showToast("Nama akun diubah", undefined, "success");
      setEditingMetaId(null);
      setEditingMetaName("");
      fetchAccounts();
    } else {
      const data = await res.json();
      showToast("Gagal: " + (data.error || "unknown error"), undefined, "destructive");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">Akun</h1>
          <p className="text-sm text-muted-foreground">
            Kelola akun Shopee dan Meta Ads
          </p>
        </div>

        {/* Shopee Accounts */}
        <div className="bg-white rounded-lg border p-4 space-y-3">
          <h2 className="font-medium">Akun Shopee Affiliate</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={newShopeeName}
              onChange={(e) => setNewShopeeName(e.target.value)}
              placeholder="Nama akun (mis: OOTD)"
              className="flex-1 px-3 py-2 border rounded-md text-sm"
              onKeyDown={(e) => e.key === "Enter" && addShopeeAccount()}
            />
            <button
              onClick={addShopeeAccount}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium"
            >
              Tambah
            </button>
          </div>
          <div className="space-y-1">
            {shopeeAccounts.map((acc) => (
              <div
                key={acc.id}
                className="flex items-center justify-between p-2 bg-gray-50 rounded"
              >
                {editingShopeeId === acc.id ? (
                  <div className="flex items-center gap-2 flex-1 mr-2">
                    <input
                      type="text"
                      value={editingShopeeName}
                      onChange={(e) => setEditingShopeeName(e.target.value)}
                      className="flex-1 px-2 py-1 border rounded text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEditShopee();
                        if (e.key === "Escape") cancelEditShopee();
                      }}
                    />
                    <button
                      onClick={saveEditShopee}
                      className="text-xs text-green-600 hover:underline font-medium"
                    >
                      Simpan
                    </button>
                    <button
                      onClick={cancelEditShopee}
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="text-sm font-medium">{acc.name}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEditShopee(acc)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteShopee(acc.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Hapus
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {shopeeAccounts.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Belum ada akun Shopee. Tambahkan satu.
              </p>
            )}
          </div>
        </div>

        {/* Meta Accounts */}
        <div className="bg-white rounded-lg border p-4 space-y-3">
          <h2 className="font-medium">Akun Meta Ads</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={newMetaName}
              onChange={(e) => setNewMetaName(e.target.value)}
              placeholder="Nama (mis: Meta Utama)"
              className="flex-1 px-3 py-2 border rounded-md text-sm"
            />
            <input
              type="text"
              value={newMetaActId}
              onChange={(e) => setNewMetaActId(e.target.value)}
              placeholder="act_xxxxx"
              className="w-40 px-3 py-2 border rounded-md text-sm"
            />
            <button
              onClick={addMetaAccount}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium"
            >
              Tambah
            </button>
          </div>
          <div className="space-y-1">
            {metaAccounts.map((acc) => (
              <div
                key={acc.id}
                className="flex items-center justify-between p-2 bg-gray-50 rounded"
              >
                {editingMetaId === acc.id ? (
                  <div className="flex items-center gap-2 flex-1 mr-2">
                    <input
                      type="text"
                      value={editingMetaName}
                      onChange={(e) => setEditingMetaName(e.target.value)}
                      className="flex-1 px-2 py-1 border rounded text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEditMeta();
                        if (e.key === "Escape") cancelEditMeta();
                      }}
                    />
                    <span className="text-xs text-muted-foreground">({acc.actId})</span>
                    <button
                      onClick={saveEditMeta}
                      className="text-xs text-green-600 hover:underline font-medium"
                    >
                      Simpan
                    </button>
                    <button
                      onClick={cancelEditMeta}
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <>
                    <div>
                      <span className="text-sm font-medium">{acc.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({acc.actId})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEditMeta(acc)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteMeta(acc.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Hapus
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {metaAccounts.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Belum ada akun Meta Ads. Tambahkan satu.
              </p>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
