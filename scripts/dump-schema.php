<?php
declare(strict_types=1);

/**
 * Generate ulang database/schema.sql dari api/_lib/Schema.php.
 *   php scripts/dump-schema.php
 */

require __DIR__ . '/_cli.php';

$out = <<<SQL
-- ═══════════════════════════════════════════════════════════════
-- Prasad Seeds — Monitoring System v5 · Skema database (versi %VERSION%)
-- Kompatibel dengan SQLite (XAMPP) dan Turso / libSQL (Vercel). BUKAN untuk MySQL/phpMyAdmin.
-- Di-generate dari api/_lib/Schema.php:  php scripts/dump-schema.php
--
-- Cara pakai:
--   SQLite : sqlite3 database/dailymonitoring.db < database/schema.sql
--            (atau DB Browser for SQLite → Execute SQL)
--   Turso  : turso db shell <nama-db> < database/schema.sql
--   Paling mudah: php scripts/migrate.php (otomatis membuat tabel + admin)
--
-- Akun default:  username admin  /  password admin123
--   Dibuat HANYA jika tabel users masih kosong. Setelah login, buat admin sendiri di
--   User Management lalu hapus akun default ini (tidak akan dibuat ulang).
--
-- Tabel:
--   users, auth_tokens                      akun & token login
--   units, areas, equipments,
--   equipment_params                        hierarki Unit → Area → Equipment → Parameter
--   sessions, session_items                 sesi monitoring & nilai tiap parameter
--   deleted_sessions                        catatan sesi yang dihapus (untuk sinkronisasi)
--   pics                                    daftar PIC / teknisi
--   work_orders, work_order_items,
--   work_order_logs                         work order, checklist temuan, riwayat catatan
--   counters, app_meta                      nomor revisi, nomor urut WO, versi skema
--   v_findings (view)                       temuan WARNING/ALERT siap dibaca
-- ═══════════════════════════════════════════════════════════════


SQL;
$out = str_replace('%VERSION%', (string) Schema::VERSION, $out);

foreach (Schema::statements() as $sql) {
    $lines = explode("\n", trim($sql));
    $rest = array_slice($lines, 1);
    $indents = array_map(fn ($l) => strlen($l) - strlen(ltrim($l)), array_filter($rest, fn ($l) => trim($l) !== '' && trim($l) !== ')'));
    $min = $indents ? min($indents) : 0;
    foreach ($rest as $i => $l) {
        $rest[$i] = trim($l) === ')' ? ')' : '  ' . substr($l, $min);
    }
    $out .= implode("\n", array_merge([$lines[0]], $rest)) . ";\n\n";
}

file_put_contents(dirname(__DIR__) . '/database/schema.sql', rtrim($out) . "\n");
out('database/schema.sql ditulis (skema versi ' . Schema::VERSION . ')');
