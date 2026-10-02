<?php
declare(strict_types=1);

/**
 * Membuat / memperbarui tabel database dan (opsional) membuat akun admin.
 *
 *   php scripts/migrate.php                                   → database dari .env (default SQLite lokal)
 *   php scripts/migrate.php --env=.env.turso                  → database Turso
 *   php scripts/migrate.php --admin=admin --password=rahasia123 --name="Administrator"
 */

require __DIR__ . '/_cli.php';

$args = $GLOBALS['cliArgs'];

try {
    out('Driver   : ' . Db::driverName());
    Schema::migrate();
    out('Schema   : OK (versi ' . Schema::VERSION . ')');

    if (is_string($args['admin'] ?? null)) {
        $password = is_string($args['password'] ?? null) ? $args['password'] : '';
        $user = [
            'username' => $args['admin'],
            'password' => $password,
            'name'     => is_string($args['name'] ?? null) ? $args['name'] : 'Administrator',
            'role'     => 'admin',
        ];
        $exists = Db::query('SELECT 1 FROM users WHERE username = ?', [strtolower($args['admin'])]);
        if ($exists) {
            UserRepository::update($user + ['originalUsername' => $args['admin'], 'active' => true],
                ['username' => '__cli__', 'role' => 'admin']);
            out("Admin    : '{$args['admin']}' diperbarui");
        } else {
            UserRepository::create($user);
            out("Admin    : '{$args['admin']}' dibuat");
        }
    }

    $counts = Db::queryMany([
        ['SELECT COUNT(*) AS n FROM users', []],
        ['SELECT COUNT(*) AS n FROM units', []],
        ['SELECT COUNT(*) AS n FROM equipments', []],
        ['SELECT COUNT(*) AS n FROM sessions', []],
        ['SELECT COUNT(*) AS n FROM work_orders', []],
    ]);
    [$u, $un, $eq, $s, $wo] = array_map(fn ($r) => (int) $r[0]['n'], $counts);
    out("Isi data : $u user · $un unit · $eq equipment · $s sesi · $wo work order");
    if ($u === 0) {
        out('');
        out('⚠ Belum ada user. Buat admin dengan:');
        out('   php scripts/migrate.php --admin=admin --password=PasswordKamu');
        out('  atau import user lama dari Google Sheets: php scripts/import-sheets.php');
    }
} catch (Throwable $e) {
    fwrite(STDERR, 'GAGAL: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
