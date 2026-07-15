"use client";

import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { showToast } from "@/components/toast-container";
import { formatCurrency, formatNumber } from "@/lib/utils";

type ImportType = "meta" | "shopee_click" | "shopee_commission";

const typeLabels: Record<ImportType, string> = {
  meta: "Meta Ads Campaign Report",
  shopee_click: "Shopee Website Click Report",
  shopee_commission: "Shopee Affiliate Commission Report",
};

interface Account {
  id: number;
  name: string;
}

export default function ImportPage() {
  const [importType, setImportType] = useState<ImportType>("meta");
  const [accounts, setAccounts] = useState<{ shopee: Account[]; meta: Account[] }>({
    shopee: [],
    meta: [],
  });
  const [selectedAccountId, setSelectedAccountId] = useState<number>(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[] | null>(null);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewErrors, setPreviewErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    const res = await fetch("/api/accounts");
    const data = await res.json();
    setAccounts({ shopee: data.shopeeAccounts, meta: data.metaAdAccounts });
  };

  const getAccountsForType = () => {
    if (importType === "meta") return accounts.meta;
    return accounts.shopee;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);

    // Preview
    const formData = new FormData();
    formData.set("file", f);
    formData.set("type", importType);

    const res = await fetch("/api/csv-preview", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (data.rows) {
      setPreview(data.rows);
      setPreviewTotal(data.totalRows);
      setPreviewErrors(data.errors || []);
    } else {
      setPreview(null);
      setPreviewTotal(0);
      setPreviewErrors([data.error || "Gagal parsing"]);
    }
  };

  const handleImport = async () => {
    if (!file || !selectedAccountId) {
      showToast("Pilih akun dan file CSV", undefined, "destructive");
      return;
    }

    setImporting(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("accountId", String(selectedAccountId));

      const endpointMap: Record<ImportType, string> = {
        meta: "/api/import/meta",
        shopee_click: "/api/import/click",
        shopee_commission: "/api/import/commission",
      };

      const res = await fetch(endpointMap[importType], {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (res.ok) {
        setResult(data);
        showToast(
          "Import berhasil",
          `${data.inserted} baru, ${data.updated} update, ${data.skipped} skip`,
          data.inserted > 0 ? "success" : "default"
        );
      } else {
        showToast("Import gagal", data.error, "destructive");
      }
    } catch (err) {
      showToast("Error", String(err), "destructive");
    } finally {
      setImporting(false);
    }
  };

  const typeColumns: Record<ImportType, string[]> = {
    meta: ["Nama kampanye", "Spend", "Impresi", "Klik", "Jangkauan"],
    shopee_click: ["Klik ID", "Waktu", "Wilayah", "Tag", "Perujuk"],
    shopee_commission: ["ID Pesanan", "Status", "Produk", "Komisi", "Tag1"],
  };

  const getPreviewColumns = () => typeColumns[importType];

  const getPreviewValue = (row: any, col: string) => {
    switch (col) {
      case "Nama kampanye":
        return row.campaignName;
      case "Spend":
        return row.spend ? formatCurrency(row.spend) : "0";
      case "Impresi":
        return row.impressions ? formatNumber(row.impressions) : "0";
      case "Klik":
        return row.uniqueLinkClicks ? formatNumber(row.uniqueLinkClicks) : "0";
      case "Jangkauan":
        return row.reach ? formatNumber(row.reach) : "0";
      case "Klik ID":
        return row.klikId?.slice(0, 16) + "...";
      case "Waktu":
        return row.waktuKlik || row.startDate;
      case "Wilayah":
        return row.wilayah;
      case "Tag":
        return row.tagRaw || row.tag1;
      case "Perujuk":
        return row.perujuk;
      case "ID Pesanan":
        return row.idPemesanan;
      case "Status":
        return row.statusPesanan;
      case "Produk":
        return row.namaBarang?.slice(0, 30) + "...";
      case "Komisi":
        return row.komisiBersihRp ? formatCurrency(row.komisiBersihRp) : "0";
      case "Tag1":
        return row.tag1;
      default:
        return "-";
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold">Import CSV</h1>
          <p className="text-sm text-muted-foreground">
            Upload file CSV yang diekspor dari Meta Ads atau Shopee Affiliate
          </p>
        </div>

        {/* Step 1: Select Type */}
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <h2 className="font-medium">1. Pilih tipe laporan</h2>
          <div className="flex flex-wrap gap-2">
            {(["meta", "shopee_click", "shopee_commission"] as ImportType[]).map(
              (type) => (
                <button
                  key={type}
                  onClick={() => {
                    setImportType(type);
                    setFile(null);
                    setPreview(null);
                    setResult(null);
                    setSelectedAccountId(0);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className={`px-4 py-2 rounded-md text-sm border transition-colors ${
                    importType === type
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-white hover:bg-gray-50"
                  }`}
                >
                  {typeLabels[type]}
                </button>
              )
            )}
          </div>
        </div>

        {/* Step 2: Select Account */}
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <h2 className="font-medium">2. Pilih akun</h2>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(parseInt(e.target.value) || 0)}
            className="w-full max-w-xs px-3 py-2 border rounded-md text-sm"
          >
            <option value={0}>-- Pilih akun --</option>
            {getAccountsForType().map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
        </div>

        {/* Step 3: Upload File */}
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <h2 className="font-medium">3. Upload file CSV</h2>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-blue-700"
          />
          {file && (
            <p className="text-xs text-muted-foreground">
              {file.name} ({formatNumber(file.size)} bytes)
            </p>
          )}
        </div>

        {/* Preview */}
        {preview && (
          <div className="bg-white rounded-lg border p-4 space-y-4">
            <h2 className="font-medium">
              4. Pratinjau ({formatNumber(previewTotal)} baris ditemukan)
            </h2>
            {previewErrors.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-xs text-yellow-800">
                <p className="font-medium mb-1">Peringatan parsing:</p>
                {previewErrors.map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    {getPreviewColumns().map((col) => (
                      <th key={col} className="text-left p-2 font-medium">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-t">
                      {getPreviewColumns().map((col) => (
                        <td key={col} className="p-2">
                          {getPreviewValue(row, col)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {previewTotal > 10 && (
              <p className="text-xs text-muted-foreground">
                ...dan {formatNumber(previewTotal - 10)} baris lainnya
              </p>
            )}
          </div>
        )}

        {/* Import Button */}
        {preview && (
          <button
            onClick={handleImport}
            disabled={importing || !selectedAccountId}
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importing ? "Mengimpor..." : "Import ke Database"}
          </button>
        )}

        {/* Result */}
        {result && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
            <h3 className="font-medium text-green-800">✅ Hasil Import</h3>
            <div className="grid grid-cols-3 gap-4 text-sm text-green-700">
              <div>
                Baris baru: <strong>{result.inserted}</strong>
              </div>
              <div>
                Update: <strong>{result.updated}</strong>
              </div>
              <div>
                Skip: <strong>{result.skipped}</strong>
              </div>
            </div>
            {result.parseErrors?.length > 0 && (
              <div className="text-xs text-yellow-700 mt-2">
                {result.parseErrors.length} peringatan parsing
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
