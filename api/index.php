<?php
declare(strict_types=1);

/**
 * Satu-satunya entry point API.  Dipanggil sebagai  api/index.php?r=<route>
 * - XAMPP : http://localhost/dailymonitoring/api/index.php?r=health
 * - Vercel: https://<project>.vercel.app/api/index.php?r=health
 */

require __DIR__ . '/_lib/bootstrap.php';

try {
    $route = trim((string) Http::query('r', ''), '/');
    $method = Http::method();

    switch ("$method $route") {
        case 'GET health':
            Http::json([
                'ok'            => true,
                'driver'        => Db::driverName(),
                'schemaVersion' => (int) (Db::query("SELECT value FROM app_meta WHERE key = 'schema_version'")[0]['value'] ?? 0),
                'time'          => date('c'),
            ]);

        // ── Auth ──────────────────────────────────────
        case 'POST auth/login':
            $in = Http::body();
            Http::json(['ok' => true] + Auth::login((string) ($in['username'] ?? ''), (string) ($in['password'] ?? '')));

        case 'POST auth/logout':
            Auth::logout();
            Http::json(['ok' => true]);

        case 'GET auth/me':
            Http::json(['ok' => true, 'user' => Auth::user()]);

        // ── Sinkronisasi data ─────────────────────────
        case 'GET sync':
            $user = Auth::user();
            $cursorId = (string) Http::query('cursorId', '');
            $out = ['ok' => true, 'driver' => Db::driverName()] + SyncRepository::pull(
                max(0, (int) Http::query('since', '0')),
                $cursorId
            );
            if ($cursorId === '') {
                // Notifikasi user ikut dikirim di halaman pertama sync (polling 30 detik)
                $out += NotificationService::feed($user['username'], max(0, (int) Http::query('notifSince', '0')));
            }
            Http::json($out);

        // ── Notifikasi ────────────────────────────────
        case 'POST notifications/read':
            $user = Auth::user();
            $in = Http::body();
            NotificationService::markRead($user['username'], (array) ($in['ids'] ?? []), !empty($in['all']));
            Http::json(['ok' => true]);

        case 'GET settings/notifications':
            Auth::requireRole('admin');
            Http::json(['ok' => true] + NotificationService::publicSettings());

        case 'PUT settings/notifications':
            Auth::requireRole('admin');
            Http::json(['ok' => true] + NotificationService::saveSettings(Http::body()));

        case 'POST settings/wa-test':
            $actor = Auth::requireRole('admin');
            Http::json(['ok' => true] + NotificationService::sendTest((string) (Http::body()['phone'] ?? ''), $actor));

        case 'POST push':
            $user = Auth::user();
            Http::json(['ok' => true] + SyncRepository::push(Http::body(), $user));

        case 'POST workorders/next-seq':
            Auth::user();
            Http::json(['ok' => true, 'seq' => SyncRepository::nextWorkOrderSeq((int) (Http::body()['atLeast'] ?? 0))]);

        // ── User management (admin) ───────────────────
        case 'GET users':
            Auth::requireRole('admin');
            Http::json(['ok' => true, 'users' => UserRepository::all()]);

        case 'POST users':
            Auth::requireRole('admin');
            Http::json(['ok' => true, 'user' => UserRepository::create(Http::body())]);

        case 'PUT users':
            $actor = Auth::requireRole('admin');
            Http::json(['ok' => true, 'user' => UserRepository::update(Http::body(), $actor)]);

        case 'PUT users/org':
            Auth::requireRole('admin');
            $changed = UserRepository::saveOrgChart((array) (Http::body()['links'] ?? []));
            Http::json(['ok' => true, 'changed' => $changed, 'users' => UserRepository::all()]);

        case 'DELETE users':
            $actor = Auth::requireRole('admin');
            UserRepository::delete((string) Http::query('username', ''), $actor);
            Http::json(['ok' => true]);

        default:
            throw new HttpError("Route tidak ditemukan: $method $route", 404);
    }
} catch (HttpError $e) {
    Http::json(['ok' => false, 'error' => $e->getMessage()], $e->status);
} catch (Throwable $e) {
    error_log('[dailymonitoring] ' . $e);
    Http::json(['ok' => false, 'error' => 'Server error: ' . $e->getMessage()], 500);
}
