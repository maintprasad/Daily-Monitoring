<?php
declare(strict_types=1);

/**
 * Menyalin seluruh isi database SQLite lokal ke database tujuan (biasanya Turso).
 *
 *   php scripts/copy-to-turso.php --env=.env.turso
 *   php scripts/copy-to-turso.php --env=.env.turso --from=database/dailymonitoring.db
 *   php scripts/copy-to-turso.php --env=.env.turso --force     → timpa data yang sudah ada di tujuan
 *
 * Tabel tujuan dibuat/di-upgrade dulu, lalu isi tiap tabel diganti dengan isi dari lokal.
 * Token login (auth_tokens) tidak disalin — semua user cukup login ulang.
 */

require __DIR__ . '/_cli.php';

$args = $GLOBALS['cliArgs'];

// Tabel yang tidak disalin: token login & metadata skema milik database tujuan
const SKIP_TABLES = ['auth_tokens', 'app_meta'];

try {
    if (Db::driverName() !== 'turso' && empty($args['allow-sqlite'])) {
        throw new RuntimeException('Database tujuan bukan Turso. Jalankan dengan --env=.env.turso '
            . '(isi TURSO_DATABASE_URL & TURSO_AUTH_TOKEN).');
    }

    $from = is_string($args['from'] ?? null) ? $args['from'] : 'database/dailymonitoring.db';
    if (!preg_match('~^([a-zA-Z]:)?[\\\\/]~', $from)) {
        $from = APP_ROOT . '/' . $from;
    }
    if (!is_file($from)) {
        throw new RuntimeException("Database sumber tidak ditemukan: $from");
    }
    $source = new SqliteDriver($from);
    $sourceVersion = (int) ($source->queryMany([["SELECT value FROM app_meta WHERE key = 'schema_version'", []]])[0][0]['value'] ?? 0);
    if ($sourceVersion < Schema::VERSION) {
        throw new RuntimeException("Database lokal masih skema v$sourceVersion — jalankan dulu: php scripts/migrate.php");
    }

    out("Sumber   : $from (skema v$sourceVersion)");
    out('Tujuan   : ' . Db::driverName());
    Schema::migrate();
    out('Schema   : OK (versi ' . Schema::VERSION . ')');

    // Tujuan sudah berisi data nyata? (database baru hanya berisi akun default 'admin')
    [$users, $units, $sessions] = array_map(fn ($r) => (int) $r[0]['n'], Db::queryMany([
        ["SELECT COUNT(*) AS n FROM users WHERE username <> 'admin'", []],
        ['SELECT COUNT(*) AS n FROM units', []],
        ['SELECT COUNT(*) AS n FROM sessions', []],
    ]));
    if (($users || $units || $sessions) && empty($args['force'])) {
        throw new RuntimeException("Tujuan sudah berisi data ($users user, $units unit, $sessions sesi). "
            . 'Tambahkan --force untuk menimpa SEMUA isinya dengan data lokal.');
    }

    // Urutan tabel mengikuti urutan CREATE TABLE di skema
    $tables = [];
    foreach (Schema::statements() as $sql) {
        if (preg_match('~^\s*CREATE TABLE IF NOT EXISTS (\w+)~i', $sql, $m) && !in_array($m[1], SKIP_TABLES, true)) {
            $tables[] = $m[1];
        }
    }

    $total = 0;
    foreach ($tables as $table) {
        $srcCols = array_column($source->queryMany([["SELECT name FROM pragma_table_info('$table')", []]])[0], 'name');
        $dstCols = array_column(Db::query("SELECT name FROM pragma_table_info('$table')"), 'name');
        $cols = array_values(array_intersect($dstCols, $srcCols));
        if (!$srcCols || !$cols) {
            out(sprintf('  %-18s dilewati (tidak ada di sumber)', $table));
            continue;
        }
        $rows = $source->queryMany([['SELECT ' . implode(',', $cols) . " FROM $table", []]])[0];
        $values = array_map(fn ($r) => array_map(fn ($c) => $r[$c], $cols), $rows);

        // Hapus + isi ulang dalam satu transaksi; tabel besar dipecah per ±2000 baris
        $inserts = Db::insertRows($table, $cols, $values);
        $batches = array_chunk($inserts, 50) ?: [[]];
        foreach ($batches as $i => $batch) {
            if ($i === 0) {
                array_unshift($batch, ["DELETE FROM $table", []]);
            }
            Db::transaction($batch);
        }
        out(sprintf('  %-18s %d baris', $table, count($rows)));
        $total += count($rows);
    }

    // Sesi login lama di tujuan tidak berlaku lagi setelah data user diganti
    Db::transaction([['DELETE FROM auth_tokens', []]]);
    out("Selesai  : $total baris disalin. Semua user login ulang dengan password yang sama seperti di lokal.");
} catch (Throwable $e) {
    fwrite(STDERR, 'GAGAL: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
