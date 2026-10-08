# Prasad Seeds — Monitoring System v5

Aplikasi monitoring electrical (frontend HTML/JS + API PHP).
Database: **SQLite lokal** saat dijalankan di XAMPP, **Turso** saat di-deploy ke Vercel —
kodenya sama, driver dipilih otomatis dari environment variable.

## Struktur

```
index.html              Markup halaman (tanpa JS/CSS inline)
assets/css/             Stylesheet
assets/js/core/         Utilitas, state global, UI (overlay/toast), klien API
assets/js/data/         Master equipment & store.js (cache lokal + sinkronisasi database)
assets/js/pages/        Dashboard, Monitor, Riwayat, Hierarki, Config, Finding, User Management
assets/js/features/     Checklist, sesi, Work Order, laporan PDF/PPTX, crew portal, dll.
assets/js/tools/        Tool admin (Data Recovery, Scan Big Error)
api/index.php           Satu-satunya endpoint API (?r=route)
api/_lib/               Driver SQLite/Turso, skema, auth, repository
scripts/                CLI: migrate.php, import-sheets.php, import-xlsx.php, copy-to-turso.php
database/schema.sql     Skema SQL lengkap (SQLite & Turso) — generate ulang: php scripts/dump-schema.php
database/*.db           File SQLite lokal (tidak ikut git)
legacy/                 Backup index.html monolith lama (boleh dihapus)
```

Script di `assets/js` sengaja berupa *classic script* (bukan ES module) supaya semua
handler `onclick="..."` di HTML tetap berfungsi. Urutan pemuatan diatur di `index.html`.

## 1. Testing lokal di XAMPP (SQLite)

1. Pastikan `extension=pdo_sqlite` aktif di `php.ini` (default XAMPP sudah aktif).
2. Salin `.env.example` → `.env` (biarkan `DB_DRIVER=sqlite`).
3. Buat tabel:
   ```
   D:\Xampp\php\php.exe scripts\migrate.php
   ```
   Database baru otomatis berisi akun default **`admin` / `admin123`**. Setelah login,
   buat admin sendiri di User Management, login dengan akun itu, lalu hapus akun `admin`
   (tidak akan dibuat ulang selama masih ada user lain).
4. (Opsional) pindahkan data lama dari Google Sheets:
   ```
   D:\Xampp\php\php.exe scripts\import-sheets.php
   ```
   User lama ikut terimport dan password-nya otomatis di-hash.
   Atau dari ekspor `.xlsx` Google Sheets (menggabung tanpa menimpa data yang ada, backup otomatis):
   ```
   D:\Xampp\php\php.exe scripts\import-xlsx.php --file=dbm.xlsx --dry-run   # lihat laporan dulu
   D:\Xampp\php\php.exe scripts\import-xlsx.php --file=dbm.xlsx
   ```
5. Buka `http://localhost/dailymonitoring/`

File database ada di `database/dailymonitoring.db` — bisa dibuka langsung dengan
[DB Browser for SQLite](https://sqlitebrowser.org/). Folder ini diblokir dari akses
browser oleh `.htaccess`.

## 2. Siapkan database Turso

```
turso db create dailymonitoring
turso db show dailymonitoring --url        → TURSO_DATABASE_URL
turso db tokens create dailymonitoring     → TURSO_AUTH_TOKEN
```

Buat file `.env.turso` (tidak ikut git):
```
DB_DRIVER=turso
TURSO_DATABASE_URL=libsql://dailymonitoring-xxx.turso.io
TURSO_AUTH_TOKEN=eyJ...
```
**Pindahkan data lokal (XAMPP) ke Turso** — semua tabel (user, bagan organisasi, hierarki,
sesi, RCA, perbaikan, WO, pengaturan) disalin; password user tetap sama:
```
php scriptscopy-to-turso.php --env=.env.turso
```
Jika Turso sudah berisi data, script menolak kecuali ditambah `--force` (isi Turso ditimpa).
File `.db` sendiri **tidak** di-push ke GitHub (repo publik & berisi hash password / nomor HP).

Atau mulai dari kosong: buat tabel, admin, dan (opsional) import data — dari komputer lokal:
```
php scripts\migrate.php --env=.env.turso --admin=admin --password=PasswordKamu
php scripts\import-sheets.php --env=.env.turso
```
Data Turso bisa dilihat lewat `turso db shell dailymonitoring` atau dashboard Turso.

> Tanpa langkah migrate pun tabel akan dibuat otomatis saat request pertama, dan
> admin pertama bisa dibuat otomatis dengan mengisi `ADMIN_USERNAME`/`ADMIN_PASSWORD`.

## 3. Deploy ke Vercel

1. Push repo ke GitHub, import project di Vercel (Framework Preset: **Other**).
2. **Storage** → pilih database Turso → **Connect Project** (env var otomatis terisi), atau
   Project → Settings → Environment Variables: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`.
   Nama dengan prefix kustom dari integrasi (mis. `STORAGE_TURSO_DATABASE_URL`) juga dikenali.
3. Deploy. `vercel.json` sudah mengatur `api/index.php` memakai runtime `vercel-php@0.9.0`.

Cek koneksi: `https://<project>.vercel.app/api/index.php?r=health`

## Wilayah, bagan organisasi & notifikasi

| Role | Wilayah | Menerima notifikasi (default) |
|---|---|---|
| Crew | per unit (Crew Portal hanya menampilkan unitnya) | — |
| Leader | per unit | WARNING & ALERT di unitnya |
| Supervisor | semua unit | WARNING & ALERT semua unit |
| Plant Manager | per unit | ALERT di unitnya |

- **User Management** → isi Wilayah, Nomor WhatsApp, dan *Melapor ke* per user (boleh lebih dari satu atasan).
- **Organisasi** (admin) → bagan pelaporan; tombol **⚡ Atur Otomatis (Cascade)** mengisi
  Crew → Leader → Supervisor → Plant Manager sesuai unit (Supervisor semua unit → semua Plant Manager),
  lalu **💾 Simpan Bagan**. Eskalasi lewat bagan tetap disaring wilayah: temuan Unit 1 hanya sampai
  ke Plant Manager Unit 1 walaupun Supervisor juga melapor ke Plant Manager Unit 2.
- Saat sesi disimpan dan ada parameter yang **baru** menjadi WARNING/ALERT, server membuat
  notifikasi untuk role di atas + atasan pelapor sesuai bagan. Muncul sebagai popup & lonceng 🔔
  di kanan atas (diperbarui tiap sync 30 detik), dan dikirim ke WhatsApp jika aktif.
- **Config → 📱 Notifikasi WhatsApp** (admin): Base URL Evolution API, nama instance, API key,
  versi API (v1/v2), aturan penerima per severity, tombol kirim tes, dan log pengiriman.
  Pesan dikirim dari server (`POST {baseUrl}/message/sendText/{instance}`, header `apikey`).

## Perbaikan oleh Crew (sebelum cek ulang)

Alur di Crew Portal: **cek → ada temuan → 🔧 Perbaiki → atasan diberi tahu → ↻ Cek Lagi (verifikasi) → Leader menutup via RCA**.

- Jika pengecekan terakhir equipment masih punya temuan aktif yang **belum dilaporkan perbaikannya**,
  tombol utama menjadi **🔧 Perbaiki** dan **↻ Monitoring Lagi** (crew tidak lagi terkunci, lihat
  "WO Monitoring" di bawah). Beranda crew menampilkan bagian **"Perlu diperbaiki"** paling atas.
- Laporan perbaikan: temuan yang diperbaiki, tindakan (wajib), hasil (**✅ Sudah diperbaiki /
  ⏳ Sementara / 🆘 Perlu bantuan**), dugaan penyebab, material, catatan.
- Laporan dikirim sebagai notifikasi ke atasan sesuai aturan wilayah & bagan organisasi;
  hasil **🆘 Perlu bantuan** juga dikirim via WhatsApp.
- Laporan tidak menutup finding. Finding selesai saat cek ulang normal ("Normal kembali")
  atau ditutup Leader lewat RCA — tindakan korektif RCA otomatis terisi dari laporan crew.

## WO Monitoring (temuan yang di-skip)

Crew boleh melanjutkan monitoring walau hasil monitoring sebelumnya belum diperbaiki:

- Tombol **↻ Monitoring Lagi** (di daftar equipment, bagian "Perlu diperbaiki" di beranda, dan menu
  **WO Monitoring**) menyimpan temuan yang belum diperbaiki ke **WO Monitoring** (opsional: alasan di-skip),
  lalu langsung membuka checklist baru.
- WO berstatus **Open** dan **tertutup otomatis** saat setiap parameternya normal kembali di pengecekan
  berikutnya atau ditutup lewat RCA. Pengecekan yang masih WARNING/ALERT membuat WO tetap Open.
- Crew: menu **📋 WO Monitoring** di bottom nav (badge jumlah WO terbuka). Admin/Supervisor/Leader:
  menu **WO Monitoring** di sidebar (grup Analitik) — tabel semua WO + filter status.
- Disimpan di tabel `monitoring_wos` + `monitoring_wo_findings` (skema v7), ikut sinkronisasi delta.

## Penutupan finding — Root Cause Analysis (RCA)

Untuk saat ini temuan daily monitoring ditutup langsung di aplikasi (ke depan semua temuan
PM & daily monitoring diarahkan ke WO).

1. **Finding / Alarm** → pada sesi bertemuan klik **🔍 RCA & Tutup**.
2. Pilih finding yang ditutup (satu RCA bisa menutup beberapa parameter sekaligus), isi
   deskripsi masalah, **5-Why**, kategori **6M**, **akar masalah**, tindakan **korektif** & **preventif**,
   PIC, target, dan verifikasi hasil.
3. **💾 Simpan Draft** → finding tetap aktif dengan tanda "RCA berjalan".
   **🔒 Tutup Finding** (wajib akar masalah + tindakan korektif) → finding tidak lagi dihitung aktif.
4. Menu **Root Cause Analysis** → daftar semua RCA (Open / Lewat Target / Closed), edit,
   **🔓 Buka Kembali**, dan **🖨 Cetak RCA** (laporan siap PDF dengan kolom tanda tangan
   Dibuat / Diperiksa Supervisor / Disetujui Plant Manager).

Hanya Leader ke atas yang bisa membuat/menutup RCA (crew ditolak di server).

## Tabel database (skema v7)

| Tabel | Isi |
|---|---|
| `users`, `auth_tokens` | Akun (password di-hash), wilayah, nomor WA & token login |
| `user_reports` | Bagan organisasi: pasangan bawahan → atasan (satu user bisa punya beberapa atasan) |
| `notifications`, `settings`, `wa_logs` | Notifikasi in-app per user, pengaturan Evolution API & aturan penerima, log WhatsApp |
| `units`, `areas`, `equipments`, `equipment_params` | Hierarki Unit → Area → Equipment → Parameter (batas normal/alert) |
| `sessions`, `session_items` | Sesi monitoring & nilai tiap parameter + status OK/WARNING/ALERT |
| `deleted_sessions` | Catatan sesi yang dihapus (dipakai sinkronisasi antar perangkat) |
| `pics` | Daftar PIC / teknisi |
| `rca_reports`, `rca_findings` | Root Cause Analysis & daftar finding yang ditutup tiap RCA |
| `repairs`, `repair_findings` | Laporan perbaikan crew & finding yang diperbaiki |
| `monitoring_wos`, `monitoring_wo_findings` | WO Monitoring: temuan yang di-skip crew saat "Monitoring Lagi" + statusnya |
| `work_orders`, `work_order_items`, `work_order_logs` | Work order, item checklist temuan, riwayat catatan |
| `counters`, `app_meta` | Nomor revisi, nomor urut WO, versi skema |
| `v_findings` (view) | Semua temuan WARNING/ALERT siap dibaca, beserta No. & status RCA-nya |

Database yang dibuat dengan skema lama otomatis di-upgrade saat API pertama kali dipakai
(atau jalankan `php scripts/migrate.php`).

## Cara kerja sinkronisasi

- Semua halaman cukup memanggil `saveAll()` setelah mengubah data. `store.js` menyimpan
  cache lokal lalu mengirim **hanya entitas yang berubah** ke `POST ?r=push` (atomik).
- Setiap 30 detik (dan saat tab aktif kembali) app menarik perubahan dari user lain lewat
  `GET ?r=sync&since=<rev>` — hanya data dengan revisi lebih baru yang dikirim.
- Saat offline, perubahan tetap tersimpan di perangkat dan dikirim otomatis begitu online.
- Role `crew` tidak bisa mengubah hierarki/PIC atau menghapus sesi (ditolak di server).

## API

| Method | Route (`api/index.php?r=`) | Keterangan |
|---|---|---|
| GET | `health` | Status & driver database |
| POST | `auth/login`, `auth/logout` · GET `auth/me` | Login berbasis token (header `X-Auth-Token`) |
| GET | `sync&since=&cursorId=` | Tarik perubahan (paginasi 200 sesi) |
| POST | `push` | Simpan hierarki / PIC / sesi / hapus sesi / work order |
| POST | `workorders/next-seq` | Nomor urut WO global |
| GET/POST/PUT/DELETE | `users` | User management (admin) |
| PUT | `users/org` | Simpan bagan organisasi `{links:[{username, reportsTo:[...]}]}` (admin) |
| POST | `notifications/read` | Tandai notifikasi dibaca `{ids:[...]}` atau `{all:true}` |
| GET/PUT | `settings/notifications` | Pengaturan WhatsApp & aturan penerima (admin) |
| POST | `settings/wa-test` | Kirim pesan tes WhatsApp `{phone}` (admin) |
