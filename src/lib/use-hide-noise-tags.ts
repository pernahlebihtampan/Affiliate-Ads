"use client";

import { useEffect, useState } from "react";

/**
 * Baca setting global `sembunyikanTagTakBerarti` (key/value di /api/settings).
 * Mengembalikan `true` bila tag Shopee tak berarti (komisi 0 & klik < 10) harus
 * disembunyikan. Default `true` (perilaku sebelumnya) selama loading / offline /
 * key belum di-set — hanya nilai eksplisit "false" yang menonaktifkan.
 *
 * Filter tag masih di sisi klien di tiap halaman, jadi hook ini cukup dipanggil
 * di komponen yang menggerbangi filternya (dashboard, Ringkasan, Pusat Kampanye).
 */
export function useHideNoiseTags(): boolean {
  const [hide, setHide] = useState(true);
  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((m: Record<string, string>) =>
        setHide(m.sembunyikanTagTakBerarti !== "false")
      )
      .catch(() => {});
  }, []);
  return hide;
}
