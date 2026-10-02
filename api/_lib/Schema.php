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
    public const VERSION = 1;

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
                id         TEXT PRIMARY KEY,
                sess_id    TEXT NOT NULL DEFAULT \'\',
                status     TEXT NOT NULL DEFAULT \'\',
                data       TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT \'\',
                updated_at TEXT NOT NULL DEFAULT \'\',
                rev        INTEGER NOT NULL DEFAULT 0
            )',
            'CREATE INDEX IF NOT EXISTS idx_work_orders_rev ON work_orders(rev)',

            "INSERT OR IGNORE INTO counters (name, value) VALUES
                ('rev', 0), ('hierarchy_rev', 0), ('pics_rev', 0), ('wo_seq', 0)",
            "INSERT OR IGNORE INTO app_meta (key, value) VALUES ('schema_version', '" . self::VERSION . "')",
        ];
    }

    public static function migrate(): void
    {
        $stmts = array_map(fn ($sql) => [$sql, []], self::statements());
        Db::driver()->transaction($stmts);
        self::seedAdminFromEnv();
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
