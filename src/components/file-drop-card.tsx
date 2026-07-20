"use client";

import { useRef, useState } from "react";
import { showToast } from "@/components/toast-container";

// Tipe laporan impor → endpoint API-nya.
const ENDPOINTS: Record<string, string> = {
  meta: "/api/import/meta",
  meta_placement: "/api/import/placement",
  shopee_click: "/api/import/click",
  shopee_commission: "/api/import/commission",
};

export interface ImportedInfo {
  fileName: string;
  importedAt: string;
}

// Kartu impor satu (tipe × akun) untuk satu reportDate. Klik-untuk-browse +
// drag-drop. Impor sekuensial (progress tracker global 1-slot) → parent
// menonaktifkan kartu lain lewat `disabled` saat satu kartu sedang upload.
export function FileDropCard({
  type,
  accountId,
  accountName,
  label,
  reportDate,
  imported,
  disabled,
  onBusyChange,
  onDone,
}: {
  type: string;
  accountId: number;
  accountName: string;
  label: string;
  reportDate: string; // YYYY-MM-DD
  imported?: ImportedInfo;
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
  onDone: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  async function pollProgress() {
    try {
      const r = await fetch("/api/import/progress");
      const p = await r.json();
      if (p?.active && p.total > 0) {
        setProgress(Math.round((p.processed / p.total) * 100));
      }
    } catch {
      /* abaikan; poll berikutnya coba lagi */
    }
  }

  async function upload(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      showToast("Bukan file CSV", `"${file.name}" dilewati.`, "destructive");
      return;
    }
    setUploading(true);
    onBusyChange(true);
    setProgress(0);
    const poll = setInterval(pollProgress, 800);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("accountId", String(accountId));
      fd.append("fileLastModified", String(file.lastModified));
      fd.append("fileSize", String(file.size));
      fd.append("reportDate", reportDate);

      const res = await fetch(ENDPOINTS[type], { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok) {
        showToast("Impor gagal", data.error || `HTTP ${res.status}`, "destructive");
      } else if (data.errors?.length) {
        // Ditolak duplikat / lebih lawas, atau ada baris gagal parse
        showToast(`${label} — ${accountName}`, data.errors[0], "default");
      } else {
        showToast(
          `${label} — ${accountName}`,
          `${data.inserted} baru, ${data.updated} diperbarui, ${data.skipped} dilewati.`,
          "success"
        );
      }
      onDone();
    } catch (e) {
      showToast("Impor gagal", e instanceof Error ? e.message : "Kesalahan tak terduga", "destructive");
    } finally {
      clearInterval(poll);
      setUploading(false);
      setProgress(null);
      onBusyChange(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const inert = disabled || uploading;

  return (
    <div
      onDragOver={(e) => {
        if (inert) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (inert) return;
        const file = e.dataTransfer.files?.[0];
        if (file) upload(file);
      }}
      onClick={() => {
        if (!inert) inputRef.current?.click();
      }}
      className={`group relative overflow-hidden rounded-xl border bg-white p-4 shadow-sm transition-all select-none ${
        inert
          ? "opacity-60 cursor-not-allowed border-gray-200"
          : dragging
          ? "border-primary ring-2 ring-primary/30 bg-primary/5 shadow-md cursor-pointer"
          : imported
          ? "border-green-300 cursor-pointer hover:border-primary hover:shadow-md hover:-translate-y-0.5"
          : "border-gray-300 cursor-pointer hover:border-primary hover:shadow-md hover:-translate-y-0.5"
      }`}
    >
      {/* Aksen tepi atas — hijau bila sudah diimpor, biru saat hover/drag */}
      <span
        aria-hidden
        className={`absolute inset-x-0 top-0 h-1 transition-colors ${
          imported ? "bg-green-400" : dragging ? "bg-primary" : "bg-gray-400 group-hover:bg-primary"
        }`}
      />
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{label}</p>
          <p className="text-xs text-muted-foreground truncate">{accountName}</p>
        </div>
        <span
          className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-lg ${
            imported ? "bg-green-100" : "bg-primary/10"
          }`}
        >
          {imported ? "✅" : "⬆️"}
        </span>
      </div>

      {uploading ? (
        <div className="mt-3">
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress ?? 0}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Mengimpor… {progress ?? 0}%</p>
        </div>
      ) : imported ? (
        <p className="text-[11px] text-green-700 mt-2 truncate" title={imported.fileName}>
          Sudah diimpor: {imported.fileName}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground mt-2">
          Tarik file CSV ke sini, atau klik untuk pilih
        </p>
      )}
    </div>
  );
}
