"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { showToast } from "@/components/toast-container";
import { formatNumber } from "@/lib/utils";

interface ImportRecord {
  id: number;
  type: string;
  accountId: number;
  accountType: string;
  fileName: string;
  fileHash: string;
  importedAt: string;
  rowsInserted: number;
  rowsUpdated: number;
  rowsSkipped: number;
}

const typeLabels: Record<string, string> = {
  meta: "Meta Wilayah",
  meta_placement: "Meta Penempatan",
  shopee_click: "Shopee Click",
  shopee_commission: "Shopee Commission",
};

export default function RiwayatImporPage() {
  const [records, setRecords] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/import/history");
    const data = await res.json();
    setRecords(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Impor terkini per (type, accountId) — hanya ini yang boleh dihapus.
  // records sudah terurut importedAt desc, jadi id pertama tiap grup = terkini.
  const latestIds = useMemo(() => {
    const seen = new Set<string>();
    const ids = new Set<number>();
    for (const r of records) {
      const key = `${r.type}:${r.accountId}`;
      if (!seen.has(key)) {
        seen.add(key);
        ids.add(r.id);
      }
    }
    return ids;
  }, [records]);

  const deleteBatch = async (r: ImportRecord) => {
    const label = typeLabels[r.type] || r.type;
    if (
      !confirm(
        `Hapus impor "${r.fileName}" (${label})?\n\n` +
          `Data BARU dari impor ini akan dihapus. Baris lama yang hanya di-update ` +
          `impor ini tetap dipertahankan (dengan nilai terbarunya).`
      )
    )
      return;

    setDeletingId(r.id);
    try {
      const res = await fetch("/api/import/history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(
          "Impor dihapus",
          `${formatNumber(data.rowsDeleted ?? 0)} baris data dihapus.`,
          "success"
        );
        fetchHistory();
      } else {
        showToast("Gagal menghapus", data.error || `HTTP ${res.status}`, "destructive");
      }
    } catch (e) {
      showToast("Gagal menghapus", String(e), "destructive");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Riwayat Import</h1>
          <p className="text-sm text-muted-foreground">
            50 import terakhir. Hanya impor terkini per akun &amp; tipe yang bisa dihapus.
          </p>
        </div>

        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left p-3 font-medium">Waktu</th>
                  <th className="text-left p-3 font-medium">Tipe</th>
                  <th className="text-left p-3 font-medium">File</th>
                  <th className="text-right p-3 font-medium">Baru</th>
                  <th className="text-right p-3 font-medium">Update</th>
                  <th className="text-right p-3 font-medium">Skip</th>
                  <th className="text-right p-3 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      Memuat...
                    </td>
                  </tr>
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      Belum ada riwayat import.
                    </td>
                  </tr>
                ) : (
                  records.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 text-muted-foreground">
                        {new Date(r.importedAt).toLocaleString("id-ID")}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                          {typeLabels[r.type] || r.type}
                        </span>
                      </td>
                      <td className="p-3 max-w-[200px] truncate" title={r.fileName}>
                        {r.fileName}
                      </td>
                      <td className="p-3 text-right text-green-700">
                        {formatNumber(r.rowsInserted)}
                      </td>
                      <td className="p-3 text-right text-blue-700">
                        {formatNumber(r.rowsUpdated)}
                      </td>
                      <td className="p-3 text-right text-muted-foreground">
                        {formatNumber(r.rowsSkipped)}
                      </td>
                      <td className="p-3 text-right">
                        {latestIds.has(r.id) ? (
                          <button
                            onClick={() => deleteBatch(r)}
                            disabled={deletingId === r.id}
                            className="text-xs text-red-600 hover:underline disabled:opacity-50"
                          >
                            {deletingId === r.id ? "Menghapus..." : "Hapus"}
                          </button>
                        ) : (
                          <span
                            className="text-xs text-muted-foreground cursor-help"
                            title="Hanya impor terkini per akun & tipe yang bisa dihapus"
                          >
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
