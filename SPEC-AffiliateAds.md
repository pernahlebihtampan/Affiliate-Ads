# SPEC — Affiliate Ads (Shopee Affiliate + Meta Ads)

> Dokumen ini adalah spesifikasi untuk membangun versi **web** dari aplikasi desktop "Affiliate" (WinForms .NET 4.8 + SQL Server), dengan scope **hanya Shopee Affiliate (affiliate marketing) + Meta Ads (advertising network)**. Letakkan file ini di root proyek (bisa juga di-copy sebagai `CLAUDE.md`) agar AI coding assistant memahami konteks penuh.

---

## 1. Latar Belakang

Pemilik menjalankan bisnis affiliate: memasang iklan (dulu Galaksion & AdMaven, sekarang **Meta Ads**) yang mengarahkan trafik ke link produk **Shopee Affiliate**. Link Shopee diberi **sub-ID (Tag_link1–5)** sehingga komisi bisa dilacak balik ke kampanye iklan.

Aplikasi lama (desktop) sudah membuktikan pola arsitektur yang berhasil:
- Impor CSV per akun → parsing aman (culture id-ID/en-US) → get-or-create dimensi → upsert fakta → catat riwayat impor.
- Tabel penghubung **CampaignHub** memetakan kampanye ad-network ↔ kampanye affiliate.
- Laporan: earning harian (komisi vs biaya, FULL JOIN per tanggal), pivot per kampanye × tanggal, grafik jam klik, dan flag `enable` per kampanye untuk keputusan lanjut/stop.

Versi web ini mereplikasi pola tersebut untuk pasangan **Shopee + Meta Ads**, dengan penyederhanaan penting (lihat §6).

## 2. Aliran Data (Funnel)

```
Meta Ads (kampanye, spend, klik tautan)
        │  penonton klik link di video/reel FB
        ▼
Shopee Click Report (Klik ID, Waktu, Wilayah, Tag_link, Perujuk)
        │  penonton belanja
        ▼
Shopee Commission Report (pesanan-produk, komisi, Tag_link1–5, Platform)
```

Kunci penghubung: **`Tag_link1` (Shopee) ↔ Nama kampanye Meta** — dipetakan manual/semi-otomatis lewat CampaignHub (nama tidak identik, mis. Meta `"OOTD DasterMotif 14 juli"` ↔ Tag `"ootdDasterMotif"`).

> ⚠️ Perubahan semantik dari proyek lama: dulu (era AdMaven) `Tag_link1`=Click_Id untuk postback, `Tag_link2`=nama kampanye, `Tag_link3`=kota, `Tag_link4/5`=Source/SubSource. **Di era Meta Ads: `Tag_link1`=tag kampanye/produk, `Tag_link2`=kode toko.** Mapping kolom→makna harus konfigurable per "era"/akun, jangan hard-code.

## 3. Sumber Data (3 jenis CSV, semua ekspor manual)

### 3a. Meta Ads Campaign Report (1 file untuk SEMUA akun Shopee)
Contoh nama: `Adv-Pernah-Le-ih-Cantik--01-_-3423-Kampanye-14-Jul-2026-14-Jul-2026.csv`
Delimiter koma, header bahasa Indonesia. Grain: **kampanye × rentang tanggal**.

Kolom: `Awal pelaporan, Akhir pelaporan, Nama kampanye, Penayangan kampanye (active/inactive/archived/not_delivering), Hasil, Indikator Hasil, Biaya per Hasil, Anggaran Set Iklan, Jenis Anggaran Set Iklan, Jumlah yang dibelanjakan (IDR), Impresi, Jangkauan, Frekuensi, Klik Tautan Unik, Berakhir, Pengaturan atribusi, Hasil (awal), Indikator hasil (awal)`

Catatan: biaya sudah **IDR** (tidak perlu kurs). Banyak baris kampanye lama dengan spend 0 — tetap disimpan tapi UI default filter spend > 0.

### 3b. Shopee Website Click Report (1 file per akun Shopee)
Contoh: `WebsiteClickReport202607150913.csv`. Grain: **1 baris = 1 klik**.

Kolom: `Klik ID` (hash, unik), `Waktu Klik` (format `M/d/yyyy H:mm`, WIB), `Wilayah Klik`, `Tag_link` (string mentah, mis. `RVGuntingPotongSudut-Feibao260626---` → split `-`), `Perujuk` (Facebook/Instagram/Others/kosong).
Perhatian: header punya BOM (`\ufeffKlik ID`); banyak baris dengan Tag/Perujuk kosong (trafik organik/luar).

### 3c. Shopee Affiliate Commission Report (1 file per akun Shopee)
Contoh: `AffiliateCommissionReport_202607150913.csv`. Grain: **1 baris = 1 item produk dalam pesanan**; PK natural = `(ID Pemesanan, ID Barang, ID Model, ID Promosi)`.

47 kolom — yang terpenting: `ID Pemesanan, Status Pesanan (Tertunda/Belum Dibayar/Dibatalkan/Selesai…), Waktu Pemesanan, Waktu Terselesaikan, Waktu Klik, Nama Toko, ID Shop, Tipe toko., ID Barang, Nama Barange (typo asli!), ID Model, ID Promosi, L1/L2/L3 Kategori Global, Harga(Rp), Jumlah, Nilai Pembelian(Rp), Jumlah Pengembalian Dana(Rp), Komisi Bersih Affiliate (Rp), Status Produk Affiliate, Tipe Pesanan, Status Pemebelian (typo asli), Tag_link1..Tag_link5, Platform`.
Header CSV asli mengandung typo (`Nama Barange`, `Kampanye Partnerr`, `Status Pemebelian`) — mapping header harus persis, tiru pola atribut `[Name("...")]` CsvHelper di proyek lama (`RecordShopeeAffiliate.cs`).

## 4. Model Data yang Diusulkan

```sql
-- MASTER
ShopeeAccount(Id PK, Name)                          -- OOTD, SpilinAja
MetaAdAccount(Id PK, Name, ActId)                   -- act_1226928692151089

-- KAMPANYE (get-or-create saat impor, case-insensitive by Name)
ShopeeCampaign(Id PK, ShopeeAccountId FK, Name, UNIQUE(ShopeeAccountId, Name))   -- dari Tag_link1
MetaCampaign(Id PK, MetaAdAccountId FK, Name, Status, UNIQUE(MetaAdAccountId, Name))
CampaignHub(MetaCampaignId PK FK, ShopeeCampaignId FK)   -- N meta : 1 shopee (PK di sisi Meta, sama seperti proyek lama)

-- FAKTA
MetaAdDaily(MetaCampaignId FK, Date, SpendIDR, Impressions, Reach, Frequency,
            UniqueLinkClicks, Results, ResultIndicator, CostPerResult, Delivery,
            LastImportId, PK(MetaCampaignId, Date))
ShopeeOrderItem(IdPemesanan, IdBarang, IdModel, IdPromosi,          -- PK gabungan
            ShopeeAccountId FK, StatusPesanan, WaktuKlik, WaktuPemesanan, WaktuTerselesaikan,
            NamaToko, IdShop, TipeToko, NamaBarang, L1,L2,L3, HargaRp, Jumlah,
            NilaiPembelianRp, RefundRp, KomisiBersihRp, StatusProdukAffiliate,
            TipePesanan, StatusPembelian, Tag1,Tag2,Tag3,Tag4,Tag5, Platform,
            ShopeeCampaignId FK NULL,        -- diisi dari Tag1 saat impor
            ClickTimeUTC, OrderTimeUTC, CompleteTimeUTC, LastImportId,
            PK(IdPemesanan, IdBarang, IdModel, IdPromosi))
ShopeeClick(KlikId PK, ShopeeAccountId FK, WaktuKlik, ClickTimeUTC, Wilayah,
            TagRaw, Tag1, Tag2, ShopeeCampaignId FK NULL, Perujuk, LastImportId)

-- AUDIT (tiru pola *ImportCSVHistory lama)
ImportBatch(Id PK, Type ENUM(meta,shopee_click,shopee_commission),
            AccountId, FileName, FileHash UNIQUE, FileCreatedTime, ImportedAt,
            RowsInserted, RowsUpdated, RowsSkipped)
```

Lookup kecil (StatusPesanan, Platform, Wilayah) boleh tetap string dulu (SQLite/PG murah), normalisasi belakangan jika perlu — jangan tiru semua tabel lookup proyek lama di MVP.

## 5. Aturan Bisnis (WAJIB, hasil pelajaran proyek lama)

1. **Upsert idempoten.** Impor ulang file yang sama / file dengan rentang tumpang-tindih tidak boleh duplikasi: OrderItem upsert by PK natural; Click insert-or-ignore by KlikId; MetaAdDaily upsert by (kampanye, tanggal). File yang persis sama (hash) ditolak dengan pesan ramah.
2. **Status pesanan berubah antar-impor.** Tertunda → Selesai/Dibatalkan; refund bisa muncul belakangan. Update baris existing, jangan skip. Simpan `LastImportId` untuk audit.
3. **Parsing angka & tanggal tahan banting.** Tiru `DoubleConverterSafe`/`DateConverterSafe` lama: coba en-US lalu id-ID; buang "Rp", spasi; tanggal `M/d/yyyy H:mm` dan `yyyy-MM-dd`. Kolom float bisa kosong.
4. **Timezone.** Waktu Shopee = WIB (UTC+7) → simpan juga kolom UTC (pola `ClickTimeUTC` lama, `AddHours(-LocalTime)`), offset konfigurable per sumber. Meta = granularitas tanggal (timezone akun iklan), tidak perlu konversi jam.
5. **Get-or-create dimensi saat impor** (pola lama): `ShopeeCampaign` dibuat otomatis dari `Tag_link1` (klik & komisi); `MetaCampaign` dari `Nama kampanye`. Kosong → biarkan NULL (organik), jangan buat kampanye "".
6. **CampaignHub**: satu kampanye Meta hanya boleh terhubung ke satu ShopeeCampaign (PK di sisi Meta). Sediakan auto-suggest: normalisasi nama (lowercase, buang spasi/tanggal/angka) lalu cocokkan substring/fuzzy — contoh nyata: `"RV DuplikatGuntingSudut 13Juli"` ↔ `"RVDuplikat3GuntingPotongSudut12jul"`. Suggest saja, konfirmasi tetap manual.
7. **Komisi belum final.** Tampilkan terpisah: komisi Tertunda vs Selesai vs Dibatalkan; refund mengurangi. ROAS default pakai komisi non-batal, dengan toggle "hanya Selesai".
8. **Perbedaan jendela waktu itu normal.** Klik Meta ≥ klik Shopee ≥ pesanan; laporan diekspor jam berbeda. Jangan buat validasi yang memaksa angka sama; cukup tampilkan rasio.

## 6. Yang Sengaja DIBUANG dari proyek lama (jangan ikut dibawa)

- **ExchangeRate USD→IDR** — Meta sudah lapor IDR.
- **Postback S2S / pixel-maven** — Meta tidak pakai postback URL model AdMaven. (Conversions API = ide fase lanjut, bukan MVP.)
- **Source/SubSource/Zone** (Tag_link4/5) — konsep zone AdMaven/Galaksion, tidak relevan di Meta.
- Dimensi AccessTrade (Browser, DeviceBrand, Language, dll).
- Typed DataSet / TableAdapter — ganti ORM modern.

## 7. Fitur / Halaman MVP (urutan pengerjaan)

1. **Setup ringan**: CRUD ShopeeAccount & MetaAdAccount (seed: OOTD, SpilinAja, 1 akun Meta).
2. **Impor CSV**: pilih jenis + akun → upload → **preview parsed grid + ringkasan (baris baru/update/skip)** → commit → riwayat impor. (UX ini meniru form impor lama yang menampilkan grid sebelum simpan.)
3. **Campaign Hub**: daftar MetaCampaign (filter: yang belum terhubung / spend>0) + dropdown ShopeeCampaign + tombol auto-suggest.
4. **Dashboard harian (halaman utama)** — per kampanye ter-mapping, kolom: Spend, Impresi, Klik Tautan Unik (Meta), Klik Shopee, Pesanan, Item, Nilai Pembelian, Komisi Bersih (tertunda/selesai), **ROAS = Komisi/Spend**, CPC Meta, konversi klik→order. Baris diberi warna: ROAS < 1 merah, 1–2 kuning, > 2 hijau. Filter rentang tanggal + akun. Total di footer.
5. **Detail kampanye**: tren harian (line chart spend vs komisi), breakdown produk & toko, histogram jam klik (pengganti `ShopeeAffiliateWaktuKlikForm`).
6. **Data browser**: tabel Orders & Clicks dengan filter kolom (pengganti grid utama + `PivotTable.cs` → cukup pivot kampanye × tanggal untuk 1 metrik terpilih).

## 8. Rekomendasi Stack (pilih salah satu — keputusan pemilik)

**Opsi A (disarankan untuk vibe coding): Next.js (App Router) + TypeScript + SQLite (better-sqlite3/Prisma) + Tailwind + shadcn/ui + Recharts; parsing CSV: papaparse.**
Alasan: satu bahasa, setup nol-konfigurasi, SQLite = 1 file mudah backup, ekosistem paling lancar dengan AI assistant. Bisa migrasi ke Postgres nanti.

**Opsi B (kalau ingin tetap C# + SQL Server yang sudah ada): ASP.NET Core 8 Blazor Server + EF Core + CsvHelper (bisa copy converter lama) + SQL Server.**
Alasan: reuse skill & server DB existing; CsvHelper attribute-mapping lama tinggal disalin.

MVP = single user, jalan lokal (`localhost`). Autentikasi belakangan.

## 9. Definisi Metrik

- `Spend` = Σ `Jumlah yang dibelanjakan (IDR)` per kampanye Meta per tanggal.
- `Komisi` = Σ `Komisi Bersih Affiliate (Rp)` order item yang `ShopeeCampaignId` terhubung via CampaignHub, dikelompokkan per **tanggal klik** (konsisten dgn atribusi lama yang pakai ClickTimeUTC; sediakan toggle per tanggal pesanan).
- `ROAS` = Komisi / Spend. `CPC Meta` = Spend / Klik Tautan Unik. `EPC Shopee` = Komisi / Klik Shopee. `CR` = Pesanan unik / Klik Shopee.
- Baris komisi tanpa mapping (organik/tag kosong) tetap dihitung di total akun, tampil sebagai "Unmapped/Organik".

## 10. Data Contoh

Folder `sample-data/` berisi CSV asli (1 hari, 14 Jul 2026):
- `AdvPernahLeihCantik01_3423Kampanye14Jul202614Jul2026.csv` (Meta, 91 kampanye, 14 ber-spend, total Rp 259.238)
- `WebsiteClickReport202607150926.csv` (klik OOTD, 154 baris) & `AffiliateCommissionReport_202607150920.csv` (komisi OOTD, 126 baris, Rp 99.964)
- `WebsiteClickReport202607150913.csv` (klik SpilinAja, 188 baris) & `AffiliateCommissionReport_202607150913.csv` (komisi SpilinAja, 533 baris, Rp 1.218.256)

Gunakan file-file ini untuk test impor end-to-end. Referensi skema lama: `reference/Affiliate schema only.sql` (SQL Server, encoding UTF-16).
