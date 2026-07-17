// Status impor yang sedang berjalan — in-memory, satu slot (app single-user,
// satu proses server). Disimpan di globalThis agar tetap satu instance meski
// route handler dibundel terpisah (pola sama dengan lib/prisma.ts).

export interface ImportProgress {
  active: boolean;
  type: string;
  fileName: string;
  phase: "parsing" | "importing";
  processed: number;
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  startedAt: number;
  finishedAt: number | null;
}

const globalForProgress = globalThis as unknown as {
  importProgress: ImportProgress | null | undefined;
};

export function startImportProgress(type: string, fileName: string): void {
  globalForProgress.importProgress = {
    active: true,
    type,
    fileName,
    phase: "parsing",
    processed: 0,
    total: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    startedAt: Date.now(),
    finishedAt: null,
  };
}

// Dipanggil saat parsing selesai dan loop impor dimulai.
export function beginImportRows(total: number): void {
  const p = globalForProgress.importProgress;
  if (p?.active) {
    p.phase = "importing";
    p.total = total;
  }
}

export function updateImportProgress(
  processed: number,
  counts: { inserted: number; updated: number; skipped: number }
): void {
  const p = globalForProgress.importProgress;
  if (p?.active) {
    p.processed = processed;
    p.inserted = counts.inserted;
    p.updated = counts.updated;
    p.skipped = counts.skipped;
  }
}

export function finishImportProgress(): void {
  const p = globalForProgress.importProgress;
  if (p?.active) {
    p.active = false;
    p.finishedAt = Date.now();
  }
}

export function getImportProgress(): ImportProgress | null {
  return globalForProgress.importProgress ?? null;
}
