# Revision Notes

## 2026-10-08

**Version:** 6.1

**Penyebab revisi:**
Data lama di `dbm.xlsx` (ekspor Google Sheets: SESSIONS, SESSION_ITEMS, HIERARCHY, PIC_LIST, SYNC_LOG) perlu ditulis ke database SQL supaya app berjalan dari data SQL terbaru. Saat dibandingkan ditemukan:
- 396 dari 465 sesi sudah ada di SQL; 69 sesi lain ada di `deleted_sessions` (dihapus dari app pada 2 Okt 2026).
- Semua `tanggal` sesi di SQL mundur 1 hari dibanding Sheets (import Apps Script lama mengonversi tanggal ISO UTC/WIB dengan keliru). Ciri: tidak ada satu pun sesi yang tanggalnya sama dengan hari pembuatannya.
- Hierarki SQL tidak punya 3 equipment (Scada, Meteran PLN, Transformer) sehingga 23 sesi tidak punya equipment induk.
- Item sesi di SQL sudah dikoreksi Data Recovery (status/catatan), sedangkan Sheets masih berisi nilai rusak.

**Metode revisi:**
- Skrip baru `scripts/import-xlsx.php` + pembaca xlsx `scripts/_xlsx.php` (PHP murni, tanpa ekstensi zip). Mode **gabung, bukan timpa**:
  - Sesi baru/terhapus → ditulis lengkap beserta item (sesi dihapus dikeluarkan dari `deleted_sessions`).
  - Sesi yang sudah ada → item dan data lain tidak disentuh; hanya `tanggal` diperbaiki ke tanggal Sheets.
  - Hierarki → hanya unit/area/equipment (+parameter) yang ID-nya belum ada ditambahkan.
  - Sheet PIC_LIST (akun lama, password plaintext) dan SYNC_LOG (log) tidak diimpor.
- Backup otomatis `database/dailymonitoring.pre-xlsx-<waktu>.db` sebelum menulis; opsi `--dry-run`, `--keep-deleted`, `--no-hierarchy`, `--env=`.
- Setiap penulisan menaikkan nomor revisi, sehingga semua perangkat menarik perubahan lewat delta-sync (`?r=sync&since=`) dan app mulai dari data SQL terbaru.

**Hasil revisi:**
- Sesi 396 → 465 (tanggal 2026-02-20 s/d 2026-10-01), item 637 (tidak berubah, identik byte-per-byte).
- Equipment 76 → 79, parameter 716 → 738, area 15 → 16; sesi tanpa equipment 23 → 0.
- User (9), PIC (13) tidak berubah. Menjalankan ulang skrip → "465 sama", tidak ada penulisan (idempoten).
- Diuji di salinan database dengan data acak end-to-end: klien baru menarik 465 sesi + hierarki lengkap → sesi acak dibuat → klien lama menerima delta 1 sesi → hapus tersinkron. Lalu dijalankan ke database asli dan diverifikasi ulang.

**Nomor versi terbaru:** 6.1

**Lanjutan 2026-10-08 — Turso (Vercel):** `import-xlsx.php --env=.env.turso` dijalankan dengan hasil sama seperti lokal: 69 sesi dipulihkan, 396 tanggal diperbaiki, +3 equipment/+22 parameter. Turso kini 466 sesi (465 dari Sheets + 1 sesi yang hanya ada di Turso, tidak disentuh), 79 equipment, 738 parameter, deleted_sessions 0 dan tidak ada sesi tanpa equipment. User (13) tidak diubah. Jalan ulang = "465 sama" (idempoten).
