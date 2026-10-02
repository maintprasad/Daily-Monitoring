<?php
declare(strict_types=1);

final class UserRepository
{
    public static function all(): array
    {
        $rows = Db::query('SELECT username, name, role, active FROM users ORDER BY name COLLATE NOCASE, username');
        return array_map([Auth::class, 'publicUser'], $rows);
    }

    public static function create(array $in): array
    {
        $user = self::validate($in, true);
        $exists = Db::query('SELECT 1 FROM users WHERE username = ?', [$user['username']]);
        if ($exists) {
            throw new HttpError('Username sudah digunakan', 409);
        }
        $now = gmdate('c');
        Db::transaction([[
            'INSERT INTO users (username, name, role, password_hash, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$user['username'], $user['name'], $user['role'], password_hash($user['password'], PASSWORD_DEFAULT),
             $user['active'] ? 1 : 0, $now, $now],
        ]]);
        return Auth::publicUser($user);
    }

    public static function update(array $in, array $actor): array
    {
        $original = strtolower(trim((string) ($in['originalUsername'] ?? $in['username'] ?? '')));
        $current = Db::query('SELECT username, name, role, active FROM users WHERE username = ?', [$original])[0] ?? null;
        if (!$current) {
            throw new HttpError('User tidak ditemukan', 404);
        }
        $user = self::validate($in + ['active' => (int) $current['active'] === 1], false);

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

        $sets = ['username = ?', 'name = ?', 'role = ?', 'active = ?', 'updated_at = ?'];
        $params = [$user['username'], $user['name'], $user['role'], $user['active'] ? 1 : 0, gmdate('c')];
        if ($user['password'] !== '') {
            $sets[] = 'password_hash = ?';
            $params[] = password_hash($user['password'], PASSWORD_DEFAULT);
        }
        $params[] = $original;

        $statements = [['UPDATE users SET ' . implode(', ', $sets) . ' WHERE username = ?', $params]];
        if ($user['username'] !== $original) {
            $statements[] = ['UPDATE auth_tokens SET username = ? WHERE username = ?', [$user['username'], $original]];
        }
        if (!$isSelf && (!$user['active'] || $user['password'] !== '')) {
            // Paksa user login ulang saat akunnya dinonaktifkan / password-nya diganti admin
            $statements[] = ['DELETE FROM auth_tokens WHERE username = ?', [$user['username']]];
        }
        Db::transaction($statements);
        return Auth::publicUser($user);
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
            ['DELETE FROM users WHERE username = ?', [$username]],
        ]);
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

    private static function validate(array $in, bool $isNew): array
    {
        $username = strtolower(trim((string) ($in['username'] ?? '')));
        $name = trim((string) ($in['name'] ?? ''));
        $role = (string) ($in['role'] ?? '');
        $password = (string) ($in['password'] ?? '');

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
        return [
            'username' => $username,
            'name'     => $name,
            'role'     => $role,
            'password' => $password,
            'active'   => !array_key_exists('active', $in) || (bool) $in['active'],
        ];
    }

    private static function assertAnotherAdmin(string $except): void
    {
        $n = Db::query("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND username <> ?", [$except])[0]['n'] ?? 0;
        if ((int) $n === 0) {
            throw new HttpError('Minimal harus ada satu admin aktif.', 400);
        }
    }
}
