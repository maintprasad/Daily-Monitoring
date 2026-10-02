<?php
declare(strict_types=1);

final class UserRepository
{
    private const COLUMNS = 'username, name, role, active, unit_id, phone, reports_to, notify_app, notify_wa';

    /** Data user lengkap untuk User Management & bagan organisasi (tanpa password). */
    public static function all(): array
    {
        $rows = Db::query('SELECT ' . self::COLUMNS . ' FROM users ORDER BY name COLLATE NOCASE, username');
        return array_map([self::class, 'out'], $rows);
    }

    public static function out(array $r): array
    {
        return Auth::publicUser($r) + [
            'phone'     => (string) ($r['phone'] ?? ''),
            'reportsTo' => (string) ($r['reports_to'] ?? ''),
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
        self::assertReportsTo($user['username'], $user['reports_to']);
        $now = gmdate('c');
        Db::transaction([[
            'INSERT INTO users (username, name, role, password_hash, active, unit_id, phone, reports_to, notify_app, notify_wa, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$user['username'], $user['name'], $user['role'], password_hash($user['password'], PASSWORD_DEFAULT),
             $user['active'] ? 1 : 0, $user['unit_id'], $user['phone'], $user['reports_to'],
             $user['notify_app'] ? 1 : 0, $user['notify_wa'] ? 1 : 0, $now, $now],
        ]]);
        return self::out($user);
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
            'reportsTo' => $current['reports_to'], 'notifyApp' => (int) $current['notify_app'] === 1,
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
        self::assertReportsTo($original, $user['reports_to']);

        $sets = ['username = ?', 'name = ?', 'role = ?', 'active = ?', 'unit_id = ?', 'phone = ?', 'reports_to = ?',
                 'notify_app = ?', 'notify_wa = ?', 'updated_at = ?'];
        $params = [$user['username'], $user['name'], $user['role'], $user['active'] ? 1 : 0, $user['unit_id'],
                   $user['phone'], $user['reports_to'], $user['notify_app'] ? 1 : 0, $user['notify_wa'] ? 1 : 0, gmdate('c')];
        if ($user['password'] !== '') {
            $sets[] = 'password_hash = ?';
            $params[] = password_hash($user['password'], PASSWORD_DEFAULT);
        }
        $params[] = $original;

        $statements = [['UPDATE users SET ' . implode(', ', $sets) . ' WHERE username = ?', $params]];
        if ($user['username'] !== $original) {
            $statements[] = ['UPDATE auth_tokens SET username = ? WHERE username = ?', [$user['username'], $original]];
            $statements[] = ['UPDATE users SET reports_to = ? WHERE reports_to = ?', [$user['username'], $original]];
            $statements[] = ['UPDATE notifications SET username = ? WHERE username = ?', [$user['username'], $original]];
        }
        if (!$isSelf && (!$user['active'] || $user['password'] !== '')) {
            // Paksa user login ulang saat akunnya dinonaktifkan / password-nya diganti admin
            $statements[] = ['DELETE FROM auth_tokens WHERE username = ?', [$user['username']]];
        }
        Db::transaction($statements);
        return self::out($user);
    }

    public static function delete(string $username, array $actor): void
    {
        $username = strtolower(trim($username));
        if ($username === $actor['username']) {
            throw new HttpError('Tidak bisa menghapus akun sendiri.', 400);
        }
        $row = Db::query('SELECT role, reports_to FROM users WHERE username = ?', [$username])[0] ?? null;
        if (!$row) {
            throw new HttpError('User tidak ditemukan', 404);
        }
        if ($row['role'] === 'admin') {
            self::assertAnotherAdmin($username);
        }
        Db::transaction([
            ['DELETE FROM auth_tokens WHERE username = ?', [$username]],
            ['DELETE FROM notifications WHERE username = ?', [$username]],
            // Bawahan langsung naik ke atasan user yang dihapus
            ['UPDATE users SET reports_to = ? WHERE reports_to = ?', [(string) $row['reports_to'], $username]],
            ['DELETE FROM users WHERE username = ?', [$username]],
        ]);
    }

    /**
     * Simpan bagan organisasi sekaligus: [{username, reportsTo}, ...]
     * Ditolak jika ada rantai melingkar (A → B → A).
     */
    public static function saveOrgChart(array $links): int
    {
        $rows = Db::query('SELECT username, reports_to FROM users');
        $map = array_column($rows, 'reports_to', 'username');
        $changes = [];
        foreach ($links as $link) {
            $u = strtolower(trim((string) ($link['username'] ?? '')));
            $to = strtolower(trim((string) ($link['reportsTo'] ?? '')));
            if (!array_key_exists($u, $map)) {
                throw new HttpError("User tidak ditemukan: $u", 404);
            }
            if ($to !== '' && !array_key_exists($to, $map)) {
                throw new HttpError("Atasan tidak ditemukan: $to", 404);
            }
            if ($to === $u) {
                throw new HttpError("$u tidak bisa melapor ke dirinya sendiri");
            }
            if ($map[$u] !== $to) {
                $map[$u] = $to;
                $changes[$u] = $to;
            }
        }
        foreach (array_keys($changes) as $u) {
            self::assertNoCycle($u, $map);
        }
        $now = gmdate('c');
        Db::transaction(array_map(
            fn ($u, $to) => ['UPDATE users SET reports_to = ?, updated_at = ? WHERE username = ?', [$to, $now, $u]],
            array_keys($changes), $changes
        ));
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
            'reports_to' => strtolower(trim((string) ($in['reportsTo'] ?? ''))),
            'notify_app' => !array_key_exists('notifyApp', $in) || (bool) $in['notifyApp'],
            'notify_wa'  => !array_key_exists('notifyWa', $in) || (bool) $in['notifyWa'],
        ];
    }

    private static function assertReportsTo(string $username, string $reportsTo): void
    {
        if ($reportsTo === '') {
            return;
        }
        if ($reportsTo === $username) {
            throw new HttpError('User tidak bisa melapor ke dirinya sendiri');
        }
        $rows = Db::query('SELECT username, reports_to FROM users');
        $map = array_column($rows, 'reports_to', 'username');
        if (!array_key_exists($reportsTo, $map)) {
            throw new HttpError('Atasan (melapor ke) tidak ditemukan');
        }
        $map[$username] = $reportsTo;
        self::assertNoCycle($username, $map);
    }

    private static function assertNoCycle(string $start, array $map): void
    {
        $seen = [$start => true];
        $cur = $map[$start] ?? '';
        while ($cur !== '') {
            if (isset($seen[$cur])) {
                throw new HttpError("Rantai melapor melingkar terdeteksi pada $start");
            }
            $seen[$cur] = true;
            $cur = $map[$cur] ?? '';
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
