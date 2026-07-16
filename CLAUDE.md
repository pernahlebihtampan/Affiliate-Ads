@AGENTS.md

# Affiliate-Ads — Panduan Proyek

Dashboard web untuk melacak profitabilitas bisnis affiliate: **Meta Ads** (biaya iklan) → trafik → **Shopee Affiliate** (klik & komisi). Versi web dari aplikasi desktop lama (WinForms .NET / SQL Server), disederhanakan untuk pasangan Shopee + Meta saja. Single-user, jalan lokal (`localhost:3000`), tanpa autentikasi.

Baca `SPEC-AffiliateAds.md` untuk konteks bisnis lengkap dan alasan tiap keputusan — dokumen ini merangkum **cara kode benar-benar bekerja sekarang**.

## Stack

- **Next.js 16.2.10** (App Router) + **React 19.2** + **TypeScript**. ⚠️ Versi Next.js ini punya breaking changes — patuhi `AGENTS.md`: baca `node_modules/next/dist/docs/` sebelum menulis kode Next.
- **Prisma 7** + **SQLite** lewat adapter **@prisma/adapter-libsql** (`@libsql/client`). Client di-generate ke `src/generated/prisma/` (gitignored).
- **Tailwind CSS v4** (`@import "tailwindcss"`, tema via CSS vars di `src/app/globals.css`; tidak ada `tailwind.config`). Komponen Radix UI dipakai langsung (belum ada folder `src/components/ui/` shadcn meski terdaftar di deps).
- **papaparse** (CSV), **recharts** (grafik), **date-fns**, **lucide-react**.

## Perintah

```bash
npm run dev         # dev server (localhost:3000)
npm run build
npm run lint        # eslint
npx prisma db push  # sinkronkan schema → dev.db (TIDAK ada folder migrations; pakai db push)
npx prisma generate # regenerate client ke src/generated/prisma setelah ubah schema
```

- DB = file tunggal `dev.db` (~48MB, **gitignored**). `DATABASE_URL` di `.env`, tapi `prisma.config.ts` butuh `import "dotenv/config"` untuk memuatnya. Backup DB & schema ada sebagai `*.bak` / `dev.db.backup.*`.
- ⚠️ `src/lib/prisma.ts` **hardcode** `url: "file:./dev.db"` di adapter (tidak baca env). Kalau pindah DB, ubah di sini juga.

## Arsitektur & Aliran Data

```
CSV Meta Ads (kampanye × tanggal, IDR)  ─┐
CSV Shopee Click (1 baris = 1 klik)      ─┼─► /api/import/* ─► lib/import-service ─► SQLite
CSV Shopee Commission (1 baris = 1 item) ─┘         (upsert idempoten + get-or-create dimensi)

CampaignHub (petakan MetaCampaign ↔ ShopeeCampaign)  ─► /api/dashboard ─► Dashboard/ROAS
```

Kunci penghubung: **`Tag_link1` Shopee ↔ nama kampanye Meta**, dipetakan manual/semi-otomatis di Campaign Hub (nama tidak identik).

### Struktur file
- `src/lib/csv-parser.ts` — parsing 3 jenis CSV → interface baris. Mapping header **persis** (termasuk typo asli & varian kolom).
- `src/lib/import-service.ts` — logika impor: hash file, buat `ImportBatch`, get-or-create campaign, upsert fakta.
- `src/lib/utils.ts` — `parseFloatSafe`/`parseIntSafe`/`parseDateSafe` (tahan format id-ID & en-US), `wibToUtc`, `parseTagRaw`, `computeFileHash`, `formatCurrency`.
- `src/lib/matching-engine.ts` — mesin saran Campaign Hub (murni, tanpa I/O): skor nama + skor pola data harian.
- `src/app/api/*` — route handler (semua `NextRequest`/`NextResponse`).
- `src/app/*/page.tsx` — halaman client (`"use client"`), fetch ke `/api`. Semua dibungkus `<DashboardLayout>` (`src/components/dashboard-layout.tsx` → `Sidebar` + `ToastContainer`).

### Halaman (lihat `src/components/sidebar.tsx`)
`/` Dashboard · `/import` Import CSV · `/campaign-hub` Campaign Hub · `/akun` Akun · `/riwayat-impor` Riwayat Impor · `/data` Data Browser · `/campaign/[id]` detail kampanye.

## Model Data (Prisma)

`ShopeeAccount`, `MetaAdAccount` (master) → `ShopeeCampaign`, `MetaCampaign` (dibuat otomatis saat impor) → fakta `MetaAdDaily`, `ShopeeOrderItem`, `ShopeeClick`. `CampaignHub` menautkan Meta↔Shopee. `ImportBatch` audit impor. `Setting` key/value.

- **`CampaignHub`**: PK di sisi Meta (`metaCampaignId`), `shopeeCampaignId @unique` → **1 Meta : 1 Shopee**. Menautkan Shopee yang sudah dipakai akan memutus tautan lama otomatis.
- **`ShopeeOrderItem`**: PK gabungan `(idPemesanan, idBarang, idModel, idPromosi)`. Menyimpan **semua 47 kolom CSV** (termasuk persentase komisi, kolom MCN, dsb.) — **jangan buang baris/kolom apa pun saat import**, termasuk pesanan Dibatalkan (dikecualikan hanya saat agregasi baca). Estimasi komisi pesanan Dibatalkan (komisiBersihRp-nya 0): `hargaRp × (komisiShopeePct + komisiXtraPct) / 100` — dipakai seri bar abu-abu di grafik harian dashboard.
- **`ShopeeClick`**: PK `klikId` (hash unik dari Shopee).
- **`MetaAdDaily`**: unique `(metaCampaignId, date, region)` — **grain per-wilayah**. Diperluas ke **28 kolom** dari CSV Meta baru (tambahan: `region, shopClicks, cpc, ctr, allClicks, allCtr, allCpc, landingPageViews, costPerLpv, cpm`). Baris legacy hasil agregasi lama punya `region = ""` dan dihapus otomatis oleh import saat `(kampanye, tanggal)` yang sama masuk dengan detail per-wilayah. Pembaca yang butuh angka harian **wajib SUM lintas wilayah** (dashboard & matching engine sudah; detail kampanye diagregasi di `/api/campaigns`).
- **`ImportBatch`**: menyimpan `fileModifiedTime`/`fileSize` (dikirim eksplisit oleh halaman import — multipart tidak membawa `lastModified`). Import ditolak bila file **sama/lebih lawas** dari import terakhir per `(type, accountId)` (`checkFileIsNewer` di import-service), selain tolakan duplikat via `fileHash`.

## Aturan bisnis WAJIB (jangan langgar)

1. **Idempoten.** Impor ulang tidak boleh duplikasi. OrderItem upsert by PK natural; Click insert-or-ignore by `klikId`; MetaAdDaily upsert by (kampanye, tanggal). File identik ditolak via `ImportBatch.fileHash @unique` (`computeFileHash` meng-hash `JSON.stringify(rows)`, **bukan** raw file).
2. **Status pesanan berubah antar-impor** (Tertunda→Selesai/Dibatalkan, refund menyusul) → **update** baris existing, jangan skip. Simpan `lastImportId`.
3. **Parsing tahan banting.** Angka: buang `Rp`/spasi, dukung `1.234,56` (id) & `1234.56` (en). Tanggal: pakai **`parseDateWib`** (utils.ts) — format `yyyy-MM-dd HH:mm:ss`, `M/d/yyyy H:mm`, `yyyy-MM-dd`; string kosong/`--` → null.
4. **Timezone — "WIB-as-UTC", selisih 0 jam.** Semua data (Shopee & Meta) berbasis WIB. `parseDateWib` membangun `Date` via `Date.UTC(...)` dari **digit apa adanya**, sehingga `.toISOString()` = digit mentah dan **bagian tanggal ISO = tanggal kalender WIB**. Efeknya: `MetaAdDaily.date` (00:00Z label WIB) & `ShopeeOrderItem.clickTimeUTC` jatuh di **bucket tanggal WIB yang sama** → spend vs komisi sejajar tanpa geser hari. ⚠️ **Jangan** `new Date("...")` tanpa offset lalu geser jam (`setHours`/`wibToUtc` lama) — itu bergantung timezone server (WITA/+8) & bikin konversi ganda −8 jam. Baca jam WIB dari kolom ini pakai **`getUTCHours()`**, bukan `getHours()`. Filter `parseDateUtc` (UTC midnight) di dashboard cocok apa adanya karena penyimpanan sudah WIB-as-UTC.
5. **Get-or-create dimensi saat impor.** `ShopeeCampaign` dibuat dari `Tag_link1` (case-insensitive by name); `MetaCampaign` dari `Nama kampanye`. Tag kosong → biarkan `NULL` (organik), jangan buat kampanye "".
6. **Atribusi komisi** default per **tanggal klik** (`clickTimeUTC`); exclude `statusPesanan = "Dibatalkan"`. Komisi dipisah Tertunda vs Selesai. `ROAS = totalKomisi / spend`.
7. Baris tanpa mapping muncul sebagai **"Unmapped/Organik"** (`shopeeCampaignId = null`), tetap dihitung di total.

## Kekhususan CSV (jangan "perbaiki" typo)

Header CSV Shopee asli mengandung typo yang **harus dicocokkan persis**: `Nama Barange`, `Kampanye Partnerr`, `Status Pemebelian`, `Tipe toko.` (dengan titik). CSV Click punya **BOM** di header (`﻿Klik ID` — sudah ditangani). CSV Meta punya varian nama kolom antar-ekspor (mis. `Klik tautan` vs `Klik Tautan Unik`) — parser mencoba beberapa alternatif.

**⚠️ CSV Meta dipecah per-Wilayah.** Ekspor Meta punya kolom `Wilayah` → ~34 baris (satu per provinsi) untuk tiap `(kampanye, tanggal)`. Grain `MetaAdDaily` = `(campaign, date, region)`, jadi `parseMetaAdCsv` menyimpan baris **per-wilayah** (kunci agregasi `nama|tanggal|wilayah`, hanya menjumlah bila wilayah sama muncul dua kali; CSV lama tanpa kolom `Wilayah` otomatis teragregasi ke `region=""`). Jangan dedup ambil-satu-wilayah — ~98% spend hilang. Filter Wilayah di dashboard hanya menyaring metrik Meta (komisi Shopee tidak punya dimensi wilayah).

**⚠️ Semua tanggal via `parseDateWib` (WIB-as-UTC).** `date` Meta & `*TimeUTC` Shopee dibangun dengan `Date.UTC(...)` dari digit mentah (lihat aturan bisnis #4) — tanggal ISO = tanggal WIB, jadi spend Meta & komisi Shopee sejajar (selisih 0 jam).

## Campaign Hub — matching engine

Logika di `src/lib/matching-engine.ts` (murni, tanpa I/O), dipakai `src/app/api/campaign-hub/route.ts` (`action: "suggest"`) — memberi **saran** koneksi (bukan otomatis-terapkan). Dua sinyal:

1. **Nama**: filter brand prefix (`META_BRAND_PREFIXES` / `BRAND_MAP`), keyword semantik + sinonim produk (`PRODUCT_SYNONYMS`, hardcode bahasa Indonesia), substring, dan char-n-gram. Peta brand/sinonim ini spesifik-domain dan diperluas seiring data baru — tambah entri di sana saat ketemu pasangan yang tak tercocokkan.
2. **Pola data harian** (`dataMatchScore`): ko-aktivitas spend Meta vs pesanan Shopee per tanggal klik (dari `ShopeeOrderItem`, exclude Dibatalkan) — kedekatan tanggal-mulai, cover hari-aktif, dan konsentrasi pesanan di jendela iklan. Hasil kalibrasi: fitur-fitur ini diskriminatif; **korelasi Pearson bentuk-kurva harian TIDAK** (jangan dipakai; data `ShopeeClick` juga cuma beberapa hari). Skor data hanya *menyesuaikan* skor nama (boost diskalakan keyakinan nama — kampanye sering diluncurkan serentak, pola harian saja ambigu), dan bisa menembus filter brand bila kuat (tag dipakai lintas-brand).

Threshold skor > 0.3. Respons `suggest` menyertakan `nameScore`/`dataScore` (0–100; `dataScore: null` = data pesanan tidak cukup) yang ditampilkan di UI.

## Catatan penting

- Sample CSV asli ada di `Referensi/CSV/` (OOTD & Spilin, Meta 1 Mei–15 Jul 2026). **`Referensi/` gitignored** — folder referensi termasuk source app desktop lama (`Referensi/Affiliate/`, C#/WinForms) sebagai acuan pola.
- Bahasa domain & UI = **Indonesia**. Currency format `id-ID` IDR tanpa desimal.
- Belum ada test. Verifikasi impor secara end-to-end pakai file di `Referensi/CSV/`.
