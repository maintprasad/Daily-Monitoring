<?php
declare(strict_types=1);

/**
 * Autentikasi berbasis token acak yang disimpan (dalam bentuk hash) di tabel auth_tokens.
 * Password user di-hash dengan password_hash() — tidak pernah dikirim balik ke browser.
 */
final class Auth
{
    public const ROLES = ['admin', 'spv', 'leader', 'crew'];
    private const TOKEN_DAYS = 7;

    private static ?array $user = null;

    public static function login(string $username, string $password): array
    {
        $username = strtolower(trim($username));
        $row = Db::query('SELECT username, name, role, password_hash, active FROM users WHERE username = ?', [$username])[0] ?? null;

        if (!$row || !password_verify($password, (string) $row['password_hash'])) {
            usleep(300000); // perlambat brute-force
            throw new HttpError('Username atau password salah.', 401);
        }
        if ((int) $row['active'] !== 1) {
            throw new HttpError('Akun ini dinonaktifkan. Hubungi Admin.', 403);
        }

        $token = bin2hex(random_bytes(32));
        $now = time();
        $statements = [
            ['DELETE FROM auth_tokens WHERE expires_at < ?', [$now]],
            ['INSERT INTO auth_tokens (token_hash, username, expires_at, created_at) VALUES (?, ?, ?, ?)',
                [hash('sha256', $token), $row['username'], $now + self::TOKEN_DAYS * 86400, gmdate('c')]],
        ];
        if (password_needs_rehash((string) $row['password_hash'], PASSWORD_DEFAULT)) {
            $statements[] = ['UPDATE users SET password_hash = ? WHERE username = ?',
                [password_hash($password, PASSWORD_DEFAULT), $row['username']]];
        }
        Db::transaction($statements);

        return ['token' => $token, 'user' => self::publicUser($row)];
    }

    public static function logout(): void
    {
        $token = self::bearer();
        if ($token !== null) {
            Db::transaction([['DELETE FROM auth_tokens WHERE token_hash = ?', [hash('sha256', $token)]]]);
        }
    }

    /** User yang sedang login; lempar 401 jika token tidak valid. */
    public static function user(): array
    {
        if (self::$user !== null) {
            return self::$user;
        }
        $token = self::bearer();
        if ($token === null) {
            throw new HttpError('Silakan login terlebih dahulu.', 401);
        }
        $hash = hash('sha256', $token);
        $row = Db::query(
            'SELECT u.username, u.name, u.role, u.active, t.expires_at
               FROM auth_tokens t JOIN users u ON u.username = t.username
              WHERE t.token_hash = ? AND t.expires_at > ?',
            [$hash, time()]
        )[0] ?? null;
        if (!$row || (int) $row['active'] !== 1) {
            throw new HttpError('Sesi login berakhir. Silakan login ulang.', 401);
        }
        // Perpanjang otomatis jika sisa masa berlaku < 3 hari (seperti perilaku lama: sesi diperpanjang saat app dibuka)
        if ((int) $row['expires_at'] - time() < 3 * 86400) {
            Db::transaction([['UPDATE auth_tokens SET expires_at = ? WHERE token_hash = ?',
                [time() + self::TOKEN_DAYS * 86400, $hash]]]);
        }
        return self::$user = self::publicUser($row);
    }

    public static function requireRole(string ...$roles): array
    {
        $user = self::user();
        if (!in_array($user['role'], $roles, true)) {
            throw new HttpError('Akses ditolak untuk role ' . $user['role'] . '.', 403);
        }
        return $user;
    }

    public static function publicUser(array $row): array
    {
        return [
            'username' => (string) $row['username'],
            'name'     => (string) ($row['name'] ?? ''),
            'role'     => (string) ($row['role'] ?? 'crew'),
            'active'   => (int) ($row['active'] ?? 1) === 1,
        ];
    }

    private static function bearer(): ?string
    {
        // X-Auth-Token dipakai karena Apache (XAMPP) kadang membuang header Authorization.
        $token = Http::header('X-Auth-Token');
        if (!$token) {
            $auth = Http::header('Authorization') ?? '';
            if (preg_match('~^Bearer\s+(\S+)$~i', $auth, $m)) {
                $token = $m[1];
            }
        }
        return ($token && preg_match('~^[a-f0-9]{64}$~', $token)) ? $token : null;
    }
}
