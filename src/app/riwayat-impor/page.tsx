"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
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
  meta: "Meta Ads",
  shopee_click: "Shopee Click",
  shopee_commission: "Shopee Commission",
};

export default function RiwayatImporPage() {
  const [records, setRecords] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Riwayat Import</h1>
          <p className="text-sm text-muted-foreground">
            50 import terakhir
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
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      Memuat...
                    </td>
                  </tr>
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
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
