"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { showToast } from "@/components/toast-container";

type Busy = null | "update" | "restart";

export default function SettingsPage() {
  const [busy, setBusy] = useState<Busy>(null);
  const [restarting, setRestarting] = useState(false);
  const [log, setLog] = useState<string>("");

  // Setting "sembunyikan tag tak berarti" (komisi 0 & klik < 10). Default true.
  const [hideNoise, setHideNoise] = useState(true);
  const [savingHideNoise, setSavingHideNoise] = useState(false);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((m: Record<string, string>) =>
        setHideNoise(m.sembunyikanTagTakBerarti !== "false")
      )
      .catch(() => {});
  }, []);

  const toggleHideNoise = async () => {
    if (savingHideNoise) return;
    const next = !hideNoise;
    setSavingHideNoise(true);
    setHideNoise(next); // optimistis
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "sembunyikanTagTakBerarti",
          value: next ? "true" : "false",
        }),
      });
      if (res.ok) {
        showToast(
          next
            ? "Tag tak berarti disembunyikan"
            : "Semua tag ditampilkan",
          undefined,
          "success"
        );
      } else {
        setHideNoise(!next); // rollback
        showToast("Gagal menyimpan setting", undefined, "destructive");
      }
    } catch {
      setHideNoise(!next); // rollback
      showToast("Koneksi terputus saat menyimpan setting", undefined, "destructive");
    } finally {
      setSavingHideNoise(false);
    }
  };

  // Tunggu server hidup lagi setelah restart, lalu muat ulang halaman.
  const waitForServerAndReload = () => {
    setRestarting(true);
    const start = Date.now();
    const tick = async () => {
      if (Date.now() - start > 90_000) {
        // Menyerah menunggu; coba reload apa adanya.
        window.location.reload();
        return;
      }
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (res.ok) {
          window.location.reload();
          return;
        }
      } catch {
        // server masih down, coba lagi
      }
      setTimeout(tick, 1500);
    };
    // Beri jeda: server baru mulai berhenti (~1 dtk delay di server).
    setTimeout(tick, 3000);
  };

  const doRestart = async () => {
    if (busy) return;
    if (!confirm("Build ulang & restart? Akan: npm run build → restart (tanpa git pull). Bisa memakan 1–2 menit; dashboard sempat tidak bisa diakses beberapa detik.")) {
      return;
    }
    setBusy("restart");
    setLog("Build ulang dari kode di komputer server… (mohon tunggu, jangan tutup halaman)");
    try {
      const res = await fetch("/api/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restart" }),
      });
      const data = await res.json();
      setLog(data.log || data.message || JSON.stringify(data));
      if (res.ok) {
        showToast(data.message || "Build selesai, restart dipicu", undefined, "success");
        waitForServerAndReload();
      } else {
        showToast(`Restart gagal di step: ${data.step || "?"}`, undefined, "destructive");
        setBusy(null);
      }
    } catch {
      showToast("Koneksi terputus saat build ulang", undefined, "destructive");
      setBusy(null);
    }
  };

  const doUpdate = async () => {
    if (busy) return;
    if (!confirm("Update dari GitHub? Akan: git pull → npm install → build → restart. Bisa memakan 1–3 menit.")) {
      return;
    }
    setBusy("update");
    setLog("Menarik kode terbaru & build… (mohon tunggu, jangan tutup halaman)");
    try {
      const res = await fetch("/api/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update" }),
      });
      const data = await res.json();
      setLog(data.log || data.message || JSON.stringify(data));
      if (res.ok) {
        showToast(data.message || "Update selesai", undefined, "success");
        waitForServerAndReload();
      } else {
        showToast(`Update gagal di step: ${data.step || "?"}`, undefined, "destructive");
        setBusy(null);
      }
    } catch {
      showToast("Koneksi terputus saat update", undefined, "destructive");
      setBusy(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">Pengaturan</h1>
          <p className="text-sm text-muted-foreground">
            Preferensi tampilan &amp; kontrol proses server.
          </p>
        </div>

        <div className="bg-white rounded-lg border p-4 space-y-4">
          <div>
            <h2 className="font-medium">Tampilan Data</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Kelola tag Shopee yang dianggap tak berarti di seluruh tampilan.
            </p>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium">
                Sembunyikan tag tak berarti (komisi 0 &amp; klik &lt; 10)
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Bila aktif, tag Shopee tanpa komisi dan berklik &lt; 10 disembunyikan
                di dasbor (tab Hubungkan, Laporan, Rentang), Ringkasan, dan dropdown
                &quot;Cari Tag&quot; di Pusat Kampanye. Matikan untuk menampilkan
                semua tag. Halaman lain menerapkan perubahan saat dibuka/di-refresh.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={hideNoise}
              onClick={toggleHideNoise}
              disabled={savingHideNoise}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                hideNoise ? "bg-primary" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  hideNoise ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg border p-4 space-y-4">
          <div>
            <h2 className="font-medium">Deploy &amp; Pembaruan</h2>
            <p className="text-sm text-muted-foreground mt-1">
              <b>Update</b> = tarik kode terbaru dari GitHub, build ulang, lalu restart
              otomatis dipakai bila kode diedit di komputer lain lalu di-push ke
              GitHub. <b>Restart</b> = build ulang dari kode yang sudah ada di{" "}
              <b>komputer server</b>{" "}
              (tanpa menarik dari GitHub) lalu restart 
              setelah kode diedit langsung di komputer server. Kedua tombol boleh
              diklik dari perangkat mana pun (HP/laptop lain). Proses build &amp;
              restart selalu berjalan di komputer server.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={doUpdate}
              disabled={busy !== null}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50"
            >
              {busy === "update" ? "Sedang update…" : "⬇️ Update (pull + build + restart)"}
            </button>
            <button
              onClick={doRestart}
              disabled={busy !== null}
              className="px-4 py-2 border rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {busy === "restart" ? "Sedang build & restart…" : "🔄 Restart (build + restart)"}
            </button>
          </div>

          {log && (
            <pre className="text-xs bg-gray-900 text-gray-100 rounded-md p-3 overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
              {log}
            </pre>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Kedua tombol mem-build di komputer server (folder <code>.next</code> tidak
          di-commit ke Git); bila build gagal, server tidak di-restart dan versi
          lama tetap jalan. Khusus <b>Update</b>: repo harus punya kredensial
          GitHub yang tersimpan agar <code>git pull</code> tidak minta password.
        </p>
      </div>

      {restarting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-lg p-6 text-center space-y-3 shadow-xl">
            <div className="text-3xl animate-spin">⏳</div>
            <p className="font-medium">Server sedang restart…</p>
            <p className="text-sm text-muted-foreground">
              Halaman akan dimuat ulang otomatis saat server siap.
            </p>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
