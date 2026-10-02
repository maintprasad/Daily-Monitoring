<?php
declare(strict_types=1);

/**
 * Skema database — sama persis untuk SQLite lokal dan Turso.
 * Semua statement idempotent sehingga aman dijalankan berulang.
 *
 * Kolom `rev` = nomor revisi global (counters.rev) saat baris terakhir berubah.
 * Client menyimpan rev terakhir yang sudah ia terima, lalu hanya menarik baris
 * dengan rev lebih besar (delta sync) — hemat kuota baca Turso.
 */
final class Schema
{
    public const VERSION = 6;

    // Kolom users yang ditambahkan sejak v3 (untuk upgrade database lama lewat ALTER TABLE).
    // Atasan (bagan organisasi) mulai v4 disimpan di tabel user_reports — bisa lebih dari satu.
    private const USER_COLUMNS_V3 = [
        'unit_id'    => "TEXT NOT NULL DEFAULT ''",   // wilayah: '' = semua unit
        'phone'      => "TEXT NOT NULL DEFAULT ''",   // nomor WhatsApp (format 62xxx)
        'notify_app' => 'INTEGER NOT NULL DEFAULT 1', // notifikasi popup di aplikasi
        'notify_wa'  => 'INTEGER NOT NULL DEFAULT 1', // notifikasi WhatsApp
    ];

    // password_hash('admin123') — akun default, hapus setelah membuat admin sendiri
    private const DEFAULT_ADMIN_HASH = '$2y$10$NuYmx98uq4RJm.QVxITepe6lh8TTTppcBpEZmnpf2fj6ShHCdDrqG';

    public static function statements(): array
    {
        return [
            'CREATE TABLE IF NOT EXISTS counters (
                name  TEXT PRIMARY KEY,
                value INTEGER NOT NULL DEFAULT 0
            )',
            'CREATE TABLE IF NOT EXISTS app_meta (
                key   TEXT PRIMARY KEY,
                value TEXT
            )',
            'CREATE TABLE IF NOT EXISTS users (
                username      TEXT PRIMARY KEY,
                name          TEXT NOT NULL DEFAULT \'\',
                role          TEXT NOT NULL DEFAULT \'crew\',
                password_hash TEXT NOT NULL,
                active        INTEGER NOT NULL DEFAULT 1,
                unit_id       TEXT NOT NULL DEFAULT \'\',
                phone         TEXT NOT NULL DEFAULT \'\',
                notify_app    INTEGER NOT NULL DEFAULT 1,
                notify_wa     INTEGER NOT NULL DEFAULT 1,
                created_at    TEXT NOT NULL,
                updated_at    TEXT NOT NULL
            )',
            'CREATE TABLE IF NOT EXISTS auth_tokens (
                token_hash TEXT PRIMARY KEY,
                username   TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )',
            'CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(username)',
            // Bagan organisasi: satu baris per pasangan bawahan → atasan (boleh lebih dari satu atasan)
            'CREATE TABLE IF NOT EXISTS user_reports (
                username TEXT NOT NULL,
                manager  TEXT NOT NULL,
                seq      INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (username, manager)
            )',
            'CREATE INDEX IF NOT EXISTS idx_user_reports_manager ON user_reports(manager)',

            // ── Hierarki: Unit → Area → Equipment → Parameter ──
            'CREATE TABLE IF NOT EXISTS units (
                pk          INTEGER PRIMARY KEY,
                id          TEXT NOT NULL,
                name        TEXT NOT NULL DEFAULT \'\',
                description TEXT NOT NULL DEFAULT \'\',
                seq         INTEGER NOT NULL DEFAULT 0
            )',
            'CREATE TABLE IF NOT EXISTS areas (
                pk      INTEGER PRIMARY KEY,
                unit_id TEXT NOT NULL,
                id      TEXT NOT NULL,
                name    TEXT NOT NULL DEFAULT \'\',
                seq     INTEGER NOT NULL DEFAULT 0
            )',
            'CREATE TABLE IF NOT EXISTS equipments (
                pk      INTEGER PRIMARY KEY,
                unit_id TEXT NOT NULL,
                area_id TEXT NOT NULL,
                id      TEXT NOT NULL,
                name    TEXT NOT NULL DEFAULT \'\',
                tag     TEXT NOT NULL DEFAULT \'\',
                type    TEXT NOT NULL DEFAULT \'\',
                brand   TEXT NOT NULL DEFAULT \'\',
                model   TEXT NOT NULL DEFAULT \'\',
                extra   TEXT,
                seq     INTEGER NOT NULL DEFAULT 0
            )',
            'CREATE TABLE IF NOT EXISTS equipment_params (
                pk         INTEGER PRIMARY KEY,
                unit_id    TEXT NOT NULL,
                area_id    TEXT NOT NULL,
                equip_id   TEXT NOT NULL,
                id         TEXT NOT NULL,
                label      TEXT NOT NULL DEFAULT \'\',
                unit       TEXT NOT NULL DEFAULT \'\',
                section    TEXT NOT NULL DEFAULT \'\',
                type       TEXT NOT NULL DEFAULT \'numeric\',
                normal_min REAL,
                normal_max REAL,
                warn_min   REAL,
                warn_max   REAL,
                options    TEXT,
                extra      TEXT,
                seq        INTEGER NOT NULL DEFAULT 0
            )',
            'CREATE INDEX IF NOT EXISTS idx_params_equip ON equipment_params(unit_id, area_id, equip_id)',

            // ── Sesi monitoring ──
            'CREATE TABLE IF NOT EXISTS sessions (
                id            TEXT PRIMARY KEY,
                tanggal       TEXT NOT NULL DEFAULT \'\',
                unit_id       TEXT NOT NULL DEFAULT \'\',
                unit_name     TEXT NOT NULL DEFAULT \'\',
                area_id       TEXT NOT NULL DEFAULT \'\',
                area_name     TEXT NOT NULL DEFAULT \'\',
                sub_area_id   TEXT NOT NULL DEFAULT \'\',
                sub_area_name TEXT NOT NULL DEFAULT \'\',
                equip_id      TEXT NOT NULL DEFAULT \'\',
                equip_name    TEXT NOT NULL DEFAULT \'\',
                pic           TEXT NOT NULL DEFAULT \'\',
                start_time    TEXT NOT NULL DEFAULT \'\',
                end_time      TEXT NOT NULL DEFAULT \'\',
                catatan       TEXT NOT NULL DEFAULT \'\',
                tindakan      TEXT NOT NULL DEFAULT \'\',
                wo_id         TEXT NOT NULL DEFAULT \'\',
                wo_status     TEXT NOT NULL DEFAULT \'\',
                checklist     TEXT,
                closing_note  TEXT NOT NULL DEFAULT \'\',
                extra         TEXT,
                created_by    TEXT NOT NULL DEFAULT \'\',
                created_at    TEXT NOT NULL DEFAULT \'\',
                updated_at    TEXT NOT NULL DEFAULT \'\',
                rev           INTEGER NOT NULL DEFAULT 0
            )',
            'CREATE INDEX IF NOT EXISTS idx_sessions_rev ON sessions(rev, id)',
            'CREATE INDEX IF NOT EXISTS idx_sessions_tanggal ON sessions(tanggal)',
            'CREATE INDEX IF NOT EXISTS idx_sessions_equip ON sessions(unit_id, area_id, equip_id)',
            'CREATE TABLE IF NOT EXISTS session_items (
                session_id TEXT NOT NULL,
                seq        INTEGER NOT NULL,
                param_id   TEXT NOT NULL DEFAULT \'\',
                label      TEXT NOT NULL DEFAULT \'\',
                unit       TEXT NOT NULL DEFAULT \'\',
                section    TEXT NOT NULL DEFAULT \'\',
                value      TEXT NOT NULL DEFAULT \'\',
                status     TEXT NOT NULL DEFAULT \'\',
                note       TEXT NOT NULL DEFAULT \'\',
                extra      TEXT,
                PRIMARY KEY (session_id, seq)
            )',
            'CREATE INDEX IF NOT EXISTS idx_items_status ON session_items(status)',
            'CREATE TABLE IF NOT EXISTS deleted_sessions (
                id         TEXT PRIMARY KEY,
                rev        INTEGER NOT NULL,
                deleted_at TEXT NOT NULL
            )',
            'CREATE INDEX IF NOT EXISTS idx_deleted_sessions_rev ON deleted_sessions(rev)',

            // ── PIC & Work Order ──
            'CREATE TABLE IF NOT EXISTS pics (
                name TEXT PRIMARY KEY,
                seq  INTEGER NOT NULL DEFAULT 0
            )',
            'CREATE TABLE IF NOT EXISTS work_orders (
                id             TEXT PRIMARY KEY,
                sess_id        TEXT NOT NULL DEFAULT \'\',
                title          TEXT NOT NULL DEFAULT \'\',
                type           TEXT NOT NULL DEFAULT \'\',
                status         TEXT NOT NULL DEFAULT \'\',
                priority       TEXT NOT NULL DEFAULT \'\',
                unit_id        TEXT NOT NULL DEFAULT \'\',
                area_id        TEXT NOT NULL DEFAULT \'\',
                equip_id       TEXT NOT NULL DEFAULT \'\',
                tech_id        TEXT NOT NULL DEFAULT \'\',
                tech_name      TEXT NOT NULL DEFAULT \'\',
                requestor_name TEXT NOT NULL DEFAULT \'\',
                requestor_dept TEXT NOT NULL DEFAULT \'\',
                created_by     TEXT NOT NULL DEFAULT \'\',
                due_date       TEXT NOT NULL DEFAULT \'\',
                est_hours      REAL,
                actual_hours   TEXT NOT NULL DEFAULT \'\',
                start_time     TEXT NOT NULL DEFAULT \'\',
                end_time       TEXT NOT NULL DEFAULT \'\',
                notes          TEXT NOT NULL DEFAULT \'\',
                closing_note   TEXT NOT NULL DEFAULT \'\',
                checklist_done  INTEGER NOT NULL DEFAULT 0,
                checklist_total INTEGER NOT NULL DEFAULT 0,
                parts_used     TEXT NOT NULL DEFAULT \'\',
                parts_count    INTEGER NOT NULL DEFAULT 0,
                attachments    TEXT NOT NULL DEFAULT \'\',
                extra          TEXT,
                created_at     TEXT NOT NULL DEFAULT \'\',
                updated_at     TEXT NOT NULL DEFAULT \'\',
                rev            INTEGER NOT NULL DEFAULT 0
            )',
            'CREATE INDEX IF NOT EXISTS idx_work_orders_rev ON work_orders(rev)',
            'CREATE INDEX IF NOT EXISTS idx_work_orders_sess ON work_orders(sess_id)',
            // Item checklist WO (satu baris per temuan yang harus ditutup)
            'CREATE TABLE IF NOT EXISTS work_order_items (
                wo_id        TEXT NOT NULL,
                seq          INTEGER NOT NULL,
                id           TEXT NOT NULL DEFAULT \'\',
                parameter    TEXT NOT NULL DEFAULT \'\',
                value        TEXT NOT NULL DEFAULT \'\',
                unit         TEXT NOT NULL DEFAULT \'\',
                find_status  TEXT NOT NULL DEFAULT \'\',
                close_status TEXT NOT NULL DEFAULT \'Open\',
                closed_by    TEXT NOT NULL DEFAULT \'\',
                closed_at    TEXT NOT NULL DEFAULT \'\',
                tindakan     TEXT NOT NULL DEFAULT \'\',
                catatan      TEXT NOT NULL DEFAULT \'\',
                extra        TEXT,
                PRIMARY KEY (wo_id, seq)
            )',
            // Riwayat catatan WO (dibuat, progress, auto-close, ...)
            'CREATE TABLE IF NOT EXISTS work_order_logs (
                wo_id   TEXT NOT NULL,
                seq     INTEGER NOT NULL,
                ts      TEXT NOT NULL DEFAULT \'\',
                by_user TEXT NOT NULL DEFAULT \'\',
                msg     TEXT NOT NULL DEFAULT \'\',
                PRIMARY KEY (wo_id, seq)
            )',

            // ── Penutupan finding: Root Cause Analysis (RCA) ──
            // Satu RCA bisa menutup beberapa finding (parameter WARNING/ALERT) dari satu sesi.
            'CREATE TABLE IF NOT EXISTS rca_reports (
                id                TEXT PRIMARY KEY,
                session_id        TEXT NOT NULL DEFAULT \'\',
                unit_id           TEXT NOT NULL DEFAULT \'\',
                unit_name         TEXT NOT NULL DEFAULT \'\',
                area_id           TEXT NOT NULL DEFAULT \'\',
                area_name         TEXT NOT NULL DEFAULT \'\',
                equip_id          TEXT NOT NULL DEFAULT \'\',
                equip_name        TEXT NOT NULL DEFAULT \'\',
                problem           TEXT NOT NULL DEFAULT \'\',
                category          TEXT NOT NULL DEFAULT \'\',
                why1              TEXT NOT NULL DEFAULT \'\',
                why2              TEXT NOT NULL DEFAULT \'\',
                why3              TEXT NOT NULL DEFAULT \'\',
                why4              TEXT NOT NULL DEFAULT \'\',
                why5              TEXT NOT NULL DEFAULT \'\',
                root_cause        TEXT NOT NULL DEFAULT \'\',
                corrective_action TEXT NOT NULL DEFAULT \'\',
                preventive_action TEXT NOT NULL DEFAULT \'\',
                action_pic        TEXT NOT NULL DEFAULT \'\',
                target_date       TEXT NOT NULL DEFAULT \'\',
                verification      TEXT NOT NULL DEFAULT \'\',
                status            TEXT NOT NULL DEFAULT \'Open\',
                created_by        TEXT NOT NULL DEFAULT \'\',
                created_at        TEXT NOT NULL DEFAULT \'\',
                closed_by         TEXT NOT NULL DEFAULT \'\',
                closed_at         TEXT NOT NULL DEFAULT \'\',
                updated_at        TEXT NOT NULL DEFAULT \'\',
                extra             TEXT,
                rev               INTEGER NOT NULL DEFAULT 0
            )',
            'CREATE INDEX IF NOT EXISTS idx_rca_reports_rev ON rca_reports(rev)',
            'CREATE INDEX IF NOT EXISTS idx_rca_reports_session ON rca_reports(session_id)',
            'CREATE TABLE IF NOT EXISTS rca_findings (
                rca_id      TEXT NOT NULL,
                finding_id  TEXT NOT NULL,
                seq         INTEGER NOT NULL DEFAULT 0,
                session_id  TEXT NOT NULL DEFAULT \'\',
                param_id    TEXT NOT NULL DEFAULT \'\',
                parameter   TEXT NOT NULL DEFAULT \'\',
                value       TEXT NOT NULL DEFAULT \'\',
                unit        TEXT NOT NULL DEFAULT \'\',
                find_status TEXT NOT NULL DEFAULT \'\',
                PRIMARY KEY (rca_id, finding_id)
            )',
            'CREATE INDEX IF NOT EXISTS idx_rca_findings_finding ON rca_findings(finding_id)',

            // ── Laporan perbaikan oleh crew (sebelum cek ulang) ──
            // Satu laporan bisa mencakup beberapa finding dari satu sesi.
            'CREATE TABLE IF NOT EXISTS repairs (
                id           TEXT PRIMARY KEY,
                session_id   TEXT NOT NULL DEFAULT \'\',
                unit_id      TEXT NOT NULL DEFAULT \'\',
                unit_name    TEXT NOT NULL DEFAULT \'\',
                area_id      TEXT NOT NULL DEFAULT \'\',
                area_name    TEXT NOT NULL DEFAULT \'\',
                equip_id     TEXT NOT NULL DEFAULT \'\',
                equip_name   TEXT NOT NULL DEFAULT \'\',
                action       TEXT NOT NULL DEFAULT \'\',
                cause        TEXT NOT NULL DEFAULT \'\',
                parts        TEXT NOT NULL DEFAULT \'\',
                result       TEXT NOT NULL DEFAULT \'Selesai\',
                note         TEXT NOT NULL DEFAULT \'\',
                repaired_by  TEXT NOT NULL DEFAULT \'\',
                repaired_by_name TEXT NOT NULL DEFAULT \'\',
                repaired_at  TEXT NOT NULL DEFAULT \'\',
                updated_at   TEXT NOT NULL DEFAULT \'\',
                extra        TEXT,
                rev          INTEGER NOT NULL DEFAULT 0
            )',
            'CREATE INDEX IF NOT EXISTS idx_repairs_rev ON repairs(rev)',
            'CREATE INDEX IF NOT EXISTS idx_repairs_session ON repairs(session_id)',
            'CREATE TABLE IF NOT EXISTS repair_findings (
                repair_id   TEXT NOT NULL,
                finding_id  TEXT NOT NULL,
                seq         INTEGER NOT NULL DEFAULT 0,
                session_id  TEXT NOT NULL DEFAULT \'\',
                param_id    TEXT NOT NULL DEFAULT \'\',
                parameter   TEXT NOT NULL DEFAULT \'\',
                value       TEXT NOT NULL DEFAULT \'\',
                unit        TEXT NOT NULL DEFAULT \'\',
                find_status TEXT NOT NULL DEFAULT \'\',
                PRIMARY KEY (repair_id, finding_id)
            )',
            'CREATE INDEX IF NOT EXISTS idx_repair_findings_finding ON repair_findings(finding_id)',

            // ── Notifikasi & pengaturan ──
            // Notifikasi in-app per penerima (popup + lonceng di kanan atas)
            'CREATE TABLE IF NOT EXISTS notifications (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                username   TEXT NOT NULL,
                severity   TEXT NOT NULL DEFAULT \'WARNING\',
                title      TEXT NOT NULL DEFAULT \'\',
                body       TEXT NOT NULL DEFAULT \'\',
                session_id TEXT NOT NULL DEFAULT \'\',
                unit_id    TEXT NOT NULL DEFAULT \'\',
                actor      TEXT NOT NULL DEFAULT \'\',
                created_at TEXT NOT NULL DEFAULT \'\',
                read_at    TEXT NOT NULL DEFAULT \'\'
            )',
            'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(username, id)',
            // Pengaturan aplikasi (JSON per key): wa = Evolution API, notif_rules = role penerima per severity
            'CREATE TABLE IF NOT EXISTS settings (
                key        TEXT PRIMARY KEY,
                value      TEXT NOT NULL DEFAULT \'\',
                updated_at TEXT NOT NULL DEFAULT \'\'
            )',
            // Riwayat pengiriman WhatsApp
            'CREATE TABLE IF NOT EXISTS wa_logs (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                username   TEXT NOT NULL DEFAULT \'\',
                phone      TEXT NOT NULL DEFAULT \'\',
                message    TEXT NOT NULL DEFAULT \'\',
                status     TEXT NOT NULL DEFAULT \'\',
                response   TEXT NOT NULL DEFAULT \'\',
                created_at TEXT NOT NULL DEFAULT \'\'
            )',

            // View bantu untuk dibuka langsung di DB Browser / turso shell
            // (di-drop & dibuat ulang supaya definisi view selalu yang terbaru)
            'DROP VIEW IF EXISTS v_findings',
            "CREATE VIEW v_findings AS
                SELECT s.id AS session_id, s.tanggal, s.unit_name, s.area_name, s.equip_id, s.equip_name,
                       i.param_id, i.label AS parameter, i.value, i.unit, i.status, i.note,
                       s.wo_id, s.wo_status,
                       (SELECT r.id FROM rca_findings f JOIN rca_reports r ON r.id = f.rca_id
                         WHERE f.finding_id = s.id || '_' || i.param_id ORDER BY r.status = 'Closed' DESC LIMIT 1) AS rca_id,
                       (SELECT r.status FROM rca_findings f JOIN rca_reports r ON r.id = f.rca_id
                         WHERE f.finding_id = s.id || '_' || i.param_id ORDER BY r.status = 'Closed' DESC LIMIT 1) AS rca_status,
                       (SELECT r.result FROM repair_findings f JOIN repairs r ON r.id = f.repair_id
                         WHERE f.finding_id = s.id || '_' || i.param_id ORDER BY r.repaired_at DESC LIMIT 1) AS repair_result,
                       (SELECT r.repaired_by_name FROM repair_findings f JOIN repairs r ON r.id = f.repair_id
                         WHERE f.finding_id = s.id || '_' || i.param_id ORDER BY r.repaired_at DESC LIMIT 1) AS repaired_by
                  FROM session_items i JOIN sessions s ON s.id = i.session_id
                 WHERE i.status IN ('WARNING', 'ALERT')",

            "INSERT OR IGNORE INTO counters (name, value) VALUES
                ('rev', 0), ('hierarchy_rev', 0), ('pics_rev', 0), ('wo_seq', 0)",
            "INSERT OR IGNORE INTO app_meta (key, value) VALUES ('schema_version', '" . self::VERSION . "')",

            // Akun default admin / admin123 — HANYA dibuat jika belum ada user sama sekali.
            // Setelah login: buat admin sendiri di User Management, lalu hapus akun ini.
            "INSERT INTO users (username, name, role, password_hash, active, created_at, updated_at)
                SELECT 'admin', 'Administrator (default)', 'admin', '" . self::DEFAULT_ADMIN_HASH . "', 1,
                       strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                 WHERE NOT EXISTS (SELECT 1 FROM users)",
        ];
    }

    public static function migrate(): void
    {
        $oldWorkOrders = self::legacyWorkOrders();

        $stmts = [];
        // v3: kolom baru di tabel users (database lama)
        $userCols = self::legacyUserColumns();
        if ($userCols !== null) {
            foreach (array_diff_key(self::USER_COLUMNS_V3, array_flip($userCols)) as $col => $def) {
                $stmts[] = ["ALTER TABLE users ADD COLUMN $col $def", []];
            }
        }
        if ($oldWorkOrders !== null) {
            // Skema v1 menyimpan WO sebagai satu kolom JSON `data` → tabel diganti
            $stmts[] = ['DROP TABLE work_orders', []];
        }
        array_push($stmts, ...array_map(fn ($sql) => [$sql, []], self::statements()));
        if ($oldWorkOrders) {
            $stmts[] = ["UPDATE counters SET value = value + 1 WHERE name = 'rev'", []];
            foreach ($oldWorkOrders as $wo) {
                array_push($stmts, ...SyncRepository::workOrderStatements($wo));
            }
        }
        if ($userCols !== null && in_array('reports_to', $userCols, true)) {
            // v4: satu atasan per user (kolom users.reports_to) → tabel user_reports
            $stmts[] = ["INSERT OR IGNORE INTO user_reports (username, manager, seq)
                         SELECT username, reports_to, 0 FROM users WHERE reports_to <> ''", []];
            $stmts[] = ['ALTER TABLE users DROP COLUMN reports_to', []];
        }
        $stmts[] = ["UPDATE app_meta SET value = ? WHERE key = 'schema_version'", [(string) self::VERSION]];
        Db::driver()->transaction($stmts);
        self::seedAdminFromEnv();
    }

    /** Versi skema yang terpasang (0 = database masih kosong). */
    public static function installedVersion(): int
    {
        try {
            $row = Db::driver()->queryMany([["SELECT value FROM app_meta WHERE key = 'schema_version'", []]])[0][0] ?? null;
            return (int) ($row['value'] ?? 0);
        } catch (Throwable $e) {
            return 0;
        }
    }

    /** Kolom tabel users pada database lama yang perlu di-upgrade (null = database baru / sudah terbaru). */
    private static function legacyUserColumns(): ?array
    {
        $version = self::installedVersion();
        if ($version === 0 || $version >= self::VERSION) {
            return null;
        }
        $rows = Db::driver()->queryMany([["SELECT name FROM pragma_table_info('users')", []]])[0];
        return array_column($rows, 'name');
    }

    /** WO dari skema v1 (kolom JSON `data`), atau null jika tidak perlu konversi. */
    private static function legacyWorkOrders(): ?array
    {
        if (self::installedVersion() !== 1) {
            return null;
        }
        $rows = Db::driver()->queryMany([['SELECT data FROM work_orders', []]])[0];
        return array_values(array_filter(array_map(fn ($r) => json_decode((string) $r['data'], true), $rows), 'is_array'));
    }

    /** Buat admin pertama dari ADMIN_USERNAME / ADMIN_PASSWORD jika tabel users masih kosong. */
    private static function seedAdminFromEnv(): void
    {
        $username = strtolower(trim((string) Env::get('ADMIN_USERNAME', '')));
        $password = (string) Env::get('ADMIN_PASSWORD', '');
        if ($username === '' || $password === '') {
            return;
        }
        $count = Db::driver()->queryMany([['SELECT COUNT(*) AS n FROM users', []]])[0][0]['n'] ?? 0;
        if ((int) $count === 0) {
            UserRepository::create([
                'username' => $username,
                'password' => $password,
                'name'     => Env::get('ADMIN_NAME', 'Administrator'),
                'role'     => 'admin',
            ]);
        }
    }
}
