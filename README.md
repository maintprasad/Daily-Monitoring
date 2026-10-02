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
scripts/                CLI: migrate.php, import-sheets.php
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
Lalu buat tabel, admin, dan (opsional) import data — dari komputer lokal:
```
php scripts\migrate.php --env=.env.turso --admin=admin --password=PasswordKamu
php scripts\import-sheets.php --env=.env.turso
```
Data Turso bisa dilihat lewat `turso db shell dailymonitoring` atau dashboard Turso.

> Tanpa langkah migrate pun tabel akan dibuat otomatis saat request pertama, dan
> admin pertama bisa dibuat otomatis dengan mengisi `ADMIN_USERNAME`/`ADMIN_PASSWORD`.

## 3. Deploy ke Vercel

1. Push repo ke GitHub, import project di Vercel (Framework Preset: **Other**).
2. Project → Settings → Environment Variables:
   `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` (opsional `DB_DRIVER=turso`).
3. Deploy. `vercel.json` sudah mengatur `api/index.php` memakai runtime `vercel-php@0.9.0`.

Cek koneksi: `https://<project>.vercel.app/api/index.php?r=health`

## Tabel database (skema v2)

| Tabel | Isi |
|---|---|
| `users`, `auth_tokens` | Akun (password di-hash) & token login |
| `units`, `areas`, `equipments`, `equipment_params` | Hierarki Unit → Area → Equipment → Parameter (batas normal/alert) |
| `sessions`, `session_items` | Sesi monitoring & nilai tiap parameter + status OK/WARNING/ALERT |
| `deleted_sessions` | Catatan sesi yang dihapus (dipakai sinkronisasi antar perangkat) |
| `pics` | Daftar PIC / teknisi |
| `work_orders`, `work_order_items`, `work_order_logs` | Work order, item checklist temuan, riwayat catatan |
| `counters`, `app_meta` | Nomor revisi, nomor urut WO, versi skema |
| `v_findings` (view) | Semua temuan WARNING/ALERT siap dibaca |

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
