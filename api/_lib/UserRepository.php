<?php
declare(strict_types=1);

final class UserRepository
{
    private const COLUMNS = 'username, name, role, active, unit_id, phone, notify_app, notify_wa';

    /** Data user lengkap untuk User Management & bagan organisasi (tanpa password). */
    public static function all(): array
    {
        [$rows, $links] = Db::queryMany([
            ['SELECT ' . self::COLUMNS . ' FROM users ORDER BY name COLLATE NOCASE, username', []],
            ['SELECT username, manager FROM user_reports ORDER BY username, seq, manager', []],
        ]);
        $managers = [];
        foreach ($links as $l) {
            $managers[$l['username']][] = (string) $l['manager'];
        }
        return array_map(fn ($r) => self::out($r, $managers[$r['username']] ?? []), $rows);
    }

    /** Peta username → daftar atasan. */
    public static function managerMap(): array
    {
        $map = [];
        foreach (Db::query('SELECT username, manager FROM user_reports ORDER BY username, seq, manager') as $l) {
            $map[$l['username']][] = (string) $l['manager'];
        }
        return $map;
    }

    public static function out(array $r, array $managers): array
    {
        return Auth::publicUser($r) + [
            'phone'     => (string) ($r['phone'] ?? ''),
            'reportsTo' => array_values($managers),   // bisa lebih dari satu atasan
            'notifyApp' => (int) ($r['notify_app'] ?? 1) === 1,
            'notifyWa'  => (int) ($r['notify_wa'] ?? 1) === 1,
        ];
    }

    public static function create(array $in): array
    {
        $user = self::validate($in, true);
        $exists = Db::query('SELECT 1 FROM users WHERE username = ?', [$user['username']]);
        if ($exists) {
            throw new HttpError('Username sudah digunakan', 409);
        }
        self::assertManagers($user['username'], $user['reports_to']);
        $now = gmdate('c');
        Db::transaction(array_merge([[
            'INSERT INTO users (username, name, role, password_hash, active, unit_id, phone, notify_app, notify_wa, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$user['username'], $user['name'], $user['role'], password_hash($user['password'], PASSWORD_DEFAULT),
             $user['active'] ? 1 : 0, $user['unit_id'], $user['phone'],
             $user['notify_app'] ? 1 : 0, $user['notify_wa'] ? 1 : 0, $now, $now],
        ]], self::managerStatements($user['username'], $user['reports_to'])));
        return self::out($user, $user['reports_to']);
    }

    public static function update(array $in, array $actor): array
    {
        $original = strtolower(trim((string) ($in['originalUsername'] ?? $in['username'] ?? '')));
        $current = Db::query('SELECT ' . self::COLUMNS . ' FROM users WHERE username = ?', [$original])[0] ?? null;
        if (!$current) {
            throw new HttpError('User tidak ditemukan', 404);
        }
        // Field yang tidak dikirim tetap memakai nilai lama
        $in += [
            'active' => (int) $current['active'] === 1, 'unitId' => $current['unit_id'], 'phone' => $current['phone'],
            'reportsTo' => self::managerMap()[$original] ?? [], 'notifyApp' => (int) $current['notify_app'] === 1,
            'notifyWa' => (int) $current['notify_wa'] === 1,
        ];
        $user = self::validate($in, false);

        if ($user['username'] !== $original && Db::query('SELECT 1 FROM users WHERE username = ?', [$user['username']])) {
            throw new HttpError('Username sudah digunakan', 409);
        }
        $isSelf = $original === $actor['username'];
        if ($isSelf && (!$user['active'] || $user['role'] !== 'admin')) {
            throw new HttpError('Tidak bisa menonaktifkan atau menurunkan role akun sendiri.', 400);
        }
        if ($current['role'] === 'admin' && ($user['role'] !== 'admin' || !$user['active'])) {
            self::assertAnotherAdmin($original);
        }
        self::assertManagers($original, $user['reports_to']);

        $sets = ['username = ?', 'name = ?', 'role = ?', 'active = ?', 'unit_id = ?', 'phone = ?',
                 'notify_app = ?', 'notify_wa = ?', 'updated_at = ?'];
        $params = [$user['username'], $user['name'], $user['role'], $user['active'] ? 1 : 0, $user['unit_id'],
                   $user['phone'], $user['notify_app'] ? 1 : 0, $user['notify_wa'] ? 1 : 0, gmdate('c')];
        if ($user['password'] !== '') {
            $sets[] = 'password_hash = ?';
            $params[] = password_hash($user['password'], PASSWORD_DEFAULT);
        }
        $params[] = $original;

        $statements = [['UPDATE users SET ' . implode(', ', $sets) . ' WHERE username = ?', $params]];
        if ($user['username'] !== $original) {
            $statements[] = ['UPDATE auth_tokens SET username = ? WHERE username = ?', [$user['username'], $original]];
            $statements[] = ['UPDATE user_reports SET manager = ? WHERE manager = ?', [$user['username'], $original]];
            $statements[] = ['DELETE FROM user_reports WHERE username = ?', [$original]];
            $statements[] = ['UPDATE notifications SET username = ? WHERE username = ?', [$user['username'], $original]];
        }
        array_push($statements, ...self::managerStatements($user['username'], $user['reports_to']));
        if (!$isSelf && (!$user['active'] || $user['password'] !== '')) {
            // Paksa user login ulang saat akunnya dinonaktifkan / password-nya diganti admin
            $statements[] = ['DELETE FROM auth_tokens WHERE username = ?', [$user['username']]];
        }
        Db::transaction($statements);
        return self::out($user, $user['reports_to']);
    }

    public static function delete(string $username, array $actor): void
    {
        $username = strtolower(trim($username));
        if ($username === $actor['username']) {
            throw new HttpError('Tidak bisa menghapus akun sendiri.', 400);
        }
        $row = Db::query('SELECT role FROM users WHERE username = ?', [$username])[0] ?? null;
        if (!$row) {
            throw new HttpError('User tidak ditemukan', 404);
        }
        if ($row['role'] === 'admin') {
            self::assertAnotherAdmin($username);
        }
        Db::transaction([
            ['DELETE FROM auth_tokens WHERE username = ?', [$username]],
            ['DELETE FROM notifications WHERE username = ?', [$username]],
            // Bawahan langsung naik ke atasan-atasan user yang dihapus
            ['INSERT OR IGNORE INTO user_reports (username, manager, seq)
              SELECT sub.username, up.manager, sub.seq FROM user_reports sub JOIN user_reports up ON up.username = sub.manager
               WHERE sub.manager = ? AND up.manager <> sub.username', [$username]],
            ['DELETE FROM user_reports WHERE username = ? OR manager = ?', [$username, $username]],
            ['DELETE FROM users WHERE username = ?', [$username]],
        ]);
    }

    /**
     * Simpan bagan organisasi sekaligus: [{username, reportsTo: [atasan, ...]}, ...]
     * Ditolak jika ada rantai melingkar (A → B → A).
     */
    public static function saveOrgChart(array $links): int
    {
        $known = array_flip(array_column(Db::query('SELECT username FROM users'), 'username'));
        $map = self::managerMap();
        $changes = [];
        foreach ($links as $link) {
            $u = strtolower(trim((string) ($link['username'] ?? '')));
            if (!isset($known[$u])) {
                throw new HttpError("User tidak ditemukan: $u", 404);
            }
            $managers = self::normalizeManagers($link['reportsTo'] ?? []);
            foreach ($managers as $m) {
                if (!isset($known[$m])) {
                    throw new HttpError("Atasan tidak ditemukan: $m", 404);
                }
                if ($m === $u) {
                    throw new HttpError("$u tidak bisa melapor ke dirinya sendiri");
                }
            }
            if (($map[$u] ?? []) !== $managers) {
                $map[$u] = $managers;
                $changes[$u] = $managers;
            }
        }
        self::assertNoCycle($map);
        $statements = [];
        $now = gmdate('c');
        foreach ($changes as $u => $managers) {
            array_push($statements, ...self::managerStatements($u, $managers));
            $statements[] = ['UPDATE users SET updated_at = ? WHERE username = ?', [$now, $u]];
        }
        Db::transaction($statements);
        return count($changes);
    }

    /**
     * Upsert massal untuk import dari Google Sheets (password lama masih plaintext).
     * @return int jumlah user yang diimport
     */
    public static function importPlain(array $users): int
    {
        $statements = [];
        $now = gmdate('c');
        foreach ($users as $u) {
            $username = strtolower(trim((string) ($u['username'] ?? '')));
            $password = trim((string) ($u['password'] ?? ''));
            if ($username === '' || $password === '') {
                continue;
            }
            $role = in_array($u['role'] ?? '', Auth::ROLES, true) ? $u['role'] : 'crew';
            $statements[] = [
                'INSERT INTO users (username, name, role, password_hash, active, created_at, updated_at)
                 VALUES (?, ?, ?, ?, 1, ?, ?)
                 ON CONFLICT(username) DO UPDATE SET name = excluded.name, role = excluded.role,
                   password_hash = excluded.password_hash, updated_at = excluded.updated_at',
                [$username, trim((string) ($u['nama'] ?? $u['name'] ?? $username)), $role,
                 password_hash($password, PASSWORD_DEFAULT), $now, $now],
            ];
        }
        Db::transaction($statements);
        return count($statements);
    }

    /** Normalisasi nomor WhatsApp → 62xxxxxxxxxx (tanpa +, spasi, atau tanda hubung). */
    public static function normalizePhone(string $phone): string
    {
        $digits = preg_replace('~\D+~', '', $phone);
        if ($digits === '') {
            return '';
        }
        if (str_starts_with($digits, '0')) {
            $digits = '62' . substr($digits, 1);
        } elseif (str_starts_with($digits, '8')) {
            $digits = '62' . $digits;
        }
        return $digits;
    }

    /** Daftar atasan: array atau string (format lama), tanpa duplikat & kosong. */
    private static function normalizeManagers(mixed $value): array
    {
        $list = is_array($value) ? $value : (is_string($value) && $value !== '' ? explode(',', $value) : []);
        $out = [];
        foreach ($list as $m) {
            $m = strtolower(trim((string) $m));
            if ($m !== '' && !in_array($m, $out, true)) {
                $out[] = $m;
            }
        }
        return $out;
    }

    private static function managerStatements(string $username, array $managers): array
    {
        $stmts = [['DELETE FROM user_reports WHERE username = ?', [$username]]];
        foreach (array_values($managers) as $i => $m) {
            $stmts[] = ['INSERT INTO user_reports (username, manager, seq) VALUES (?, ?, ?)', [$username, $m, $i]];
        }
        return $stmts;
    }

    private static function validate(array $in, bool $isNew): array
    {
        $username = strtolower(trim((string) ($in['username'] ?? '')));
        $name = trim((string) ($in['name'] ?? ''));
        $role = (string) ($in['role'] ?? '');
        $password = (string) ($in['password'] ?? '');
        $phone = self::normalizePhone((string) ($in['phone'] ?? ''));

        if ($name === '') {
            throw new HttpError('Nama wajib diisi');
        }
        if (!preg_match('~^[a-z0-9._-]+$~', $username)) {
            throw new HttpError('Username hanya huruf kecil, angka, titik, underscore, atau dash');
        }
        if (!in_array($role, Auth::ROLES, true)) {
            throw new HttpError('Role tidak valid');
        }
        if (($isNew || $password !== '') && strlen($password) < 6) {
            throw new HttpError('Password minimal 6 karakter');
        }
        if ($phone !== '' && !preg_match('~^62\d{8,13}$~', $phone)) {
            throw new HttpError('Nomor WhatsApp tidak valid (contoh: 081234567890)');
        }
        return [
            'username'   => $username,
            'name'       => $name,
            'role'       => $role,
            'password'   => $password,
            'active'     => !array_key_exists('active', $in) || (bool) $in['active'],
            // Supervisor & admin mencakup semua unit
            'unit_id'    => in_array($role, ['spv', 'admin'], true) ? '' : trim((string) ($in['unitId'] ?? '')),
            'phone'      => $phone,
            'reports_to' => self::normalizeManagers($in['reportsTo'] ?? []),
            'notify_app' => !array_key_exists('notifyApp', $in) || (bool) $in['notifyApp'],
            'notify_wa'  => !array_key_exists('notifyWa', $in) || (bool) $in['notifyWa'],
        ];
    }

    private static function assertManagers(string $username, array $managers): void
    {
        if (!$managers) {
            return;
        }
        if (in_array($username, $managers, true)) {
            throw new HttpError('User tidak bisa melapor ke dirinya sendiri');
        }
        $known = array_flip(array_column(Db::query('SELECT username FROM users'), 'username'));
        foreach ($managers as $m) {
            if (!isset($known[$m])) {
                throw new HttpError("Atasan (melapor ke) tidak ditemukan: $m");
            }
        }
        $map = self::managerMap();
        $map[$username] = $managers;
        self::assertNoCycle($map);
    }

    /** Graf username → [atasan] tidak boleh punya siklus. */
    private static function assertNoCycle(array $map): void
    {
        $state = []; // 1 = sedang ditelusuri, 2 = selesai
        $visit = function (string $u) use (&$visit, &$state, $map): void {
            if (($state[$u] ?? 0) === 2) {
                return;
            }
            if (($state[$u] ?? 0) === 1) {
                throw new HttpError("Rantai melapor melingkar terdeteksi pada $u");
            }
            $state[$u] = 1;
            foreach ($map[$u] ?? [] as $m) {
                $visit($m);
            }
            $state[$u] = 2;
        };
        foreach (array_keys($map) as $u) {
            $visit((string) $u);
        }
    }

    private static function assertAnotherAdmin(string $except): void
    {
        $n = Db::query("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND username <> ?", [$except])[0]['n'] ?? 0;
        if ((int) $n === 0) {
            throw new HttpError('Minimal harus ada satu admin aktif.', 400);
        }
    }
}
