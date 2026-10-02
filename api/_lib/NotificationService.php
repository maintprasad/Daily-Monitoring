<?php
declare(strict_types=1);

/**
 * Notifikasi temuan (WARNING / ALERT):
 *   1. Saat sesi monitoring disimpan, server mendeteksi parameter yang BARU menjadi
 *      WARNING/ALERT (dibanding data sebelumnya di database).
 *   2. Penerima ditentukan dari:
 *        • rantai "melapor ke" (bagan organisasi) mulai dari pelapor ke atas, dan
 *        • user dengan role yang dikonfigurasi untuk severity tsb pada unit yang sama
 *          (unit kosong = semua unit, mis. supervisor).
 *   3. Notifikasi in-app disimpan ke tabel notifications (popup + lonceng),
 *      dan dikirim lewat WhatsApp (Evolution API) jika diaktifkan.
 */
final class NotificationService
{
    public const DEFAULT_RULES = [
        'WARNING'     => ['leader', 'spv'],
        'ALERT'       => ['leader', 'spv', 'manager'],
        'useOrgChart' => true,
    ];
    public const DEFAULT_WA = [
        'enabled'    => false,
        'baseUrl'    => '',
        'apiKey'     => '',
        'instance'   => '',
        'apiVersion' => 'v2',
        'appUrl'     => '',
    ];
    private const RANK = ['' => 0, 'OK' => 0, 'WARNING' => 1, 'ALERT' => 2];

    // ═══════════════════════════════════════════════════════
    // PENGATURAN
    // ═══════════════════════════════════════════════════════

    public static function settings(): array
    {
        $rows = Db::query("SELECT key, value FROM settings WHERE key IN ('wa', 'notif_rules')");
        $map = array_column($rows, 'value', 'key');
        $wa = json_decode((string) ($map['wa'] ?? ''), true);
        $rules = json_decode((string) ($map['notif_rules'] ?? ''), true);
        return [
            'wa'    => array_merge(self::DEFAULT_WA, is_array($wa) ? $wa : []),
            'rules' => array_merge(self::DEFAULT_RULES, is_array($rules) ? $rules : []),
        ];
    }

    /** Pengaturan untuk ditampilkan di modal (API key tidak dikirim balik). */
    public static function publicSettings(): array
    {
        $s = self::settings();
        $s['wa']['apiKeySet'] = $s['wa']['apiKey'] !== '';
        unset($s['wa']['apiKey']);
        $s['logs'] = Db::query('SELECT username, phone, status, response, created_at FROM wa_logs ORDER BY id DESC LIMIT 15');
        return $s;
    }

    public static function saveSettings(array $in): array
    {
        $current = self::settings();
        $wa = $current['wa'];
        $inWa = is_array($in['wa'] ?? null) ? $in['wa'] : [];
        foreach (['baseUrl', 'instance', 'appUrl'] as $k) {
            if (array_key_exists($k, $inWa)) {
                $wa[$k] = trim((string) $inWa[$k]);
            }
        }
        $wa['baseUrl'] = rtrim($wa['baseUrl'], '/');
        if (array_key_exists('enabled', $inWa)) {
            $wa['enabled'] = (bool) $inWa['enabled'];
        }
        if (in_array($inWa['apiVersion'] ?? '', ['v1', 'v2'], true)) {
            $wa['apiVersion'] = $inWa['apiVersion'];
        }
        if (trim((string) ($inWa['apiKey'] ?? '')) !== '') {
            $wa['apiKey'] = trim((string) $inWa['apiKey']); // kosong = pakai key lama
        }
        if ($wa['enabled'] && ($wa['baseUrl'] === '' || $wa['instance'] === '' || $wa['apiKey'] === '')) {
            throw new HttpError('Untuk mengaktifkan WhatsApp, isi Base URL, Instance, dan API Key.');
        }
        if ($wa['baseUrl'] !== '' && !preg_match('~^https?://~i', $wa['baseUrl'])) {
            throw new HttpError('Base URL harus diawali http:// atau https://');
        }

        $rules = $current['rules'];
        $inRules = is_array($in['rules'] ?? null) ? $in['rules'] : [];
        foreach (['WARNING', 'ALERT'] as $sev) {
            if (is_array($inRules[$sev] ?? null)) {
                $rules[$sev] = array_values(array_intersect(Auth::ROLES, $inRules[$sev]));
            }
        }
        if (array_key_exists('useOrgChart', $inRules)) {
            $rules['useOrgChart'] = (bool) $inRules['useOrgChart'];
        }

        $now = gmdate('c');
        $upsert = 'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
                   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at';
        Db::transaction([
            [$upsert, ['wa', json_encode($wa, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $now]],
            [$upsert, ['notif_rules', json_encode($rules, JSON_UNESCAPED_UNICODE), $now]],
        ]);
        return self::publicSettings();
    }

    // ═══════════════════════════════════════════════════════
    // TRIGGER DARI PUSH SESI
    // ═══════════════════════════════════════════════════════

    /**
     * Rencanakan notifikasi untuk sesi yang akan disimpan.
     * Dipanggil SEBELUM transaksi push (membandingkan dengan status lama di database).
     * @return array{statements: array, wa: array} statement INSERT notifikasi (ikut transaksi push)
     *                                             + daftar pesan WA (dikirim setelah commit)
     */
    public static function plan(array $sessions, array $actor): array
    {
        $sessions = array_values(array_filter($sessions, fn ($s) => is_array($s) && !empty($s['id'])));
        if (!$sessions) {
            return ['statements' => [], 'wa' => []];
        }

        // Status parameter sebelumnya per sesi
        $ids = array_map(fn ($s) => (string) $s['id'], $sessions);
        $prev = [];
        foreach (array_chunk($ids, 200) as $chunk) {
            $rows = Db::query('SELECT session_id, param_id, status FROM session_items WHERE session_id IN ('
                . implode(',', array_fill(0, count($chunk), '?')) . ')', $chunk);
            foreach ($rows as $r) {
                $prev[$r['session_id']][$r['param_id']] = (string) $r['status'];
            }
        }

        $events = [];
        foreach ($sessions as $s) {
            $triggered = [];
            foreach ((is_array($s['items'] ?? null) ? $s['items'] : []) as $item) {
                $status = (string) ($item['status'] ?? '');
                if (!in_array($status, ['WARNING', 'ALERT'], true)) {
                    continue;
                }
                $before = $prev[$s['id']][(string) ($item['paramId'] ?? '')] ?? '';
                if ((self::RANK[$status] ?? 0) > (self::RANK[$before] ?? 0)) {
                    $triggered[] = $item;
                }
            }
            if ($triggered) {
                $severity = array_filter($triggered, fn ($i) => $i['status'] === 'ALERT') ? 'ALERT' : 'WARNING';
                $events[] = ['session' => $s, 'items' => $triggered, 'severity' => $severity];
            }
        }
        if (!$events) {
            return ['statements' => [], 'wa' => []];
        }

        $settings = self::settings();
        $byName = self::userGraph();

        $statements = [];
        $wa = [];
        $now = gmdate('c');
        foreach ($events as $ev) {
            $s = $ev['session'];
            $recipients = self::recipients($ev['severity'], (string) ($s['unitId'] ?? ''), $actor['username'], $byName, $settings['rules']);
            if (!$recipients) {
                continue;
            }
            [$title, $body] = self::describe($ev);
            $message = self::waMessage($ev, $actor, $settings['wa']['appUrl']);
            foreach ($recipients as $u) {
                if ((int) $u['notify_app'] === 1) {
                    $statements[] = [
                        'INSERT INTO notifications (username, severity, title, body, session_id, unit_id, actor, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        [$u['username'], $ev['severity'], $title, $body, (string) $s['id'], (string) ($s['unitId'] ?? ''),
                         $actor['username'], $now],
                    ];
                }
                if ((int) $u['notify_wa'] === 1 && $u['phone'] !== '') {
                    $wa[] = ['username' => $u['username'], 'phone' => $u['phone'], 'message' => $message];
                }
            }
        }
        return ['statements' => $statements, 'wa' => $settings['wa']['enabled'] ? $wa : []];
    }

    /** Semua user beserta daftar atasannya: username → row + ['managers' => [...]] */
    private static function userGraph(): array
    {
        [$users, $links] = Db::queryMany([
            ['SELECT username, name, role, active, unit_id, phone, notify_app, notify_wa FROM users', []],
            ['SELECT username, manager FROM user_reports', []],
        ]);
        $byName = array_column($users, null, 'username');
        foreach ($byName as &$u) {
            $u['managers'] = [];
        }
        unset($u);
        foreach ($links as $l) {
            if (isset($byName[$l['username']])) {
                $byName[$l['username']]['managers'][] = (string) $l['manager'];
            }
        }
        return $byName;
    }

    /**
     * Notifikasi laporan perbaikan BARU dari crew → atasan sesuai aturan wilayah & bagan.
     * WhatsApp hanya untuk hasil "Butuh bantuan" (eskalasi), supaya tidak berisik.
     */
    public static function planRepairs(array $repairs, array $actor): array
    {
        if (!$repairs) {
            return ['statements' => [], 'wa' => []];
        }
        $ids = array_map(fn ($r) => (string) $r['id'], $repairs);
        $existing = array_column(Db::query('SELECT id FROM repairs WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids), 'id');
        $new = array_values(array_filter($repairs, fn ($r) => !in_array((string) $r['id'], $existing, true)));
        if (!$new) {
            return ['statements' => [], 'wa' => []];
        }

        $settings = self::settings();
        $byName = self::userGraph();
        $labels = ['Selesai' => '✅ Selesai', 'Sementara' => '⏳ Sementara', 'Butuh bantuan' => '🆘 Perlu bantuan'];
        $statements = [];
        $wa = [];
        $now = gmdate('c');
        foreach ($new as $r) {
            $findings = is_array($r['findings'] ?? null) ? $r['findings'] : [];
            $severity = array_filter($findings, fn ($f) => ($f['status'] ?? '') === 'ALERT') ? 'ALERT' : 'WARNING';
            $recipients = self::recipients($severity, (string) ($r['unitId'] ?? ''), $actor['username'], $byName, $settings['rules']);
            $who = ($r['repairedByName'] ?? '') ?: ($actor['name'] ?? $actor['username']);
            $result = $labels[$r['result'] ?? ''] ?? (string) ($r['result'] ?? '');
            $params = implode(', ', array_map(fn ($f) => trim(($f['parameter'] ?? '') . ' ' . ($f['value'] ?? '') . ' ' . ($f['unit'] ?? '')), $findings));
            $title = 'Perbaikan · ' . ($r['equipName'] ?? 'Equipment') . " ($result)";
            $body = "$who: " . ($r['action'] ?? '') . " — $params";
            $msg = implode("
", array_filter([
                '🔧 *Laporan Perbaikan — Prasad Seeds Monitoring*', '',
                '*Equipment:* ' . ($r['equipName'] ?? '-'),
                '*Lokasi:* ' . trim(($r['unitName'] ?? '') . ' / ' . ($r['areaName'] ?? ''), ' /'),
                "*Hasil:* $result",
                '*Finding:* ' . $params,
                '*Tindakan:* ' . ($r['action'] ?? ''),
                ($r['note'] ?? '') !== '' ? '*Catatan:* ' . $r['note'] : '',
                '', "Dilaporkan oleh: $who",
                $settings['wa']['appUrl'] ?: '',
            ], fn ($l) => $l !== false));
            foreach ($recipients as $u) {
                if ((int) $u['notify_app'] === 1) {
                    $statements[] = ['INSERT INTO notifications (username, severity, title, body, session_id, unit_id, actor, created_at)
                                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        [$u['username'], 'REPAIR', $title, $body, (string) ($r['sessId'] ?? ''), (string) ($r['unitId'] ?? ''), $actor['username'], $now]];
                }
                if (($r['result'] ?? '') === 'Butuh bantuan' && (int) $u['notify_wa'] === 1 && $u['phone'] !== '') {
                    $wa[] = ['username' => $u['username'], 'phone' => $u['phone'], 'message' => $msg];
                }
            }
        }
        return ['statements' => $statements, 'wa' => $settings['wa']['enabled'] ? $wa : []];
    }

    /**
     * Penerima = (semua atasan pelapor ke atas ∪ user ber-role sesuai di unit tsb) yang role-nya
     * diizinkan untuk severity ini, aktif, dan bukan pelapor sendiri.
     * $byName[username]['managers'] = daftar atasan (satu user bisa punya beberapa atasan).
     */
    public static function recipients(string $severity, string $unitId, string $actor, array $byName, array $rules): array
    {
        $roles = $rules[$severity] ?? [];
        $out = [];
        foreach ($byName as $name => $u) {
            if (in_array($u['role'], $roles, true) && ($u['unit_id'] === '' || $u['unit_id'] === $unitId)) {
                $out[$name] = $u;
            }
        }
        if (!empty($rules['useOrgChart'])) {
            // Telusuri semua jalur atasan ke atas (BFS, aman dari siklus)
            $queue = $byName[$actor]['managers'] ?? [];
            $seen = [$actor => true];
            while ($queue) {
                $m = array_shift($queue);
                if (isset($seen[$m]) || !isset($byName[$m])) {
                    continue;
                }
                $seen[$m] = true;
                // Tetap disaring wilayah: supervisor yang melapor ke PM Unit 1 & PM Unit 2
                // hanya meneruskan temuan Unit 1 ke PM Unit 1 (bukan ke PM Unit 2)
                $mUnit = $byName[$m]['unit_id'];
                if (in_array($byName[$m]['role'], $roles, true) && ($mUnit === '' || $mUnit === $unitId)) {
                    $out[$m] = $byName[$m];
                }
                array_push($queue, ...$byName[$m]['managers']);
            }
        }
        unset($out[$actor]);
        return array_values(array_filter($out, fn ($u) => (int) $u['active'] === 1));
    }

    private static function describe(array $ev): array
    {
        $s = $ev['session'];
        $title = "{$ev['severity']} · " . ($s['equipName'] ?? 'Equipment');
        $parts = array_map(
            fn ($i) => trim(($i['label'] ?? $i['paramId'] ?? '') . ' ' . ($i['value'] ?? '') . ' ' . ($i['unit'] ?? '')) . " ({$i['status']})",
            $ev['items']
        );
        $where = trim(($s['unitName'] ?? '') . ' / ' . ($s['areaName'] ?? ''), ' /');
        return [$title, $where . ' — ' . implode(', ', $parts)];
    }

    private static function waMessage(array $ev, array $actor, string $appUrl): string
    {
        $s = $ev['session'];
        $icon = $ev['severity'] === 'ALERT' ? '🚨' : '⚠️';
        $lines = [
            "$icon *{$ev['severity']} — Prasad Seeds Monitoring*",
            '',
            '*Equipment:* ' . ($s['equipName'] ?? '-'),
            '*Lokasi:* ' . trim(($s['unitName'] ?? '') . ' / ' . ($s['areaName'] ?? ''), ' /'),
            '*Tanggal:* ' . ($s['tanggal'] ?? '') . ' ' . ($s['startTime'] ?? ''),
            '*PIC:* ' . (($s['pic'] ?? '') ?: '-'),
            '',
            '*Temuan:*',
        ];
        foreach ($ev['items'] as $i) {
            $lines[] = '• ' . ($i['label'] ?? $i['paramId'] ?? '') . ': ' . trim(($i['value'] ?? '') . ' ' . ($i['unit'] ?? ''))
                . " ({$i['status']})" . (($i['note'] ?? '') !== '' ? ' — ' . $i['note'] : '');
        }
        $lines[] = '';
        $lines[] = 'Dilaporkan oleh: ' . ($actor['name'] ?? $actor['username']);
        if ($appUrl !== '') {
            $lines[] = $appUrl;
        }
        return implode("\n", $lines);
    }

    // ═══════════════════════════════════════════════════════
    // WHATSAPP (Evolution API)
    // ═══════════════════════════════════════════════════════

    /** Kirim pesan-pesan WA (setelah transaksi push commit) dan catat ke wa_logs. */
    public static function sendWhatsAppBatch(array $jobs): void
    {
        if (!$jobs) {
            return;
        }
        $wa = self::settings()['wa'];
        $logs = [];
        $now = gmdate('c');
        foreach ($jobs as $job) {
            [$ok, $resp] = self::sendWhatsApp($wa, $job['phone'], $job['message']);
            $logs[] = ['INSERT INTO wa_logs (username, phone, message, status, response, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                [$job['username'], $job['phone'], $job['message'], $ok ? 'sent' : 'failed', mb_substr($resp, 0, 500), $now]];
        }
        try {
            Db::transaction($logs);
        } catch (Throwable $e) {
            error_log('[wa_logs] ' . $e->getMessage());
        }
    }

    /** @return array{0: bool, 1: string} [berhasil, respons/error] */
    public static function sendWhatsApp(array $wa, string $phone, string $text): array
    {
        if ($wa['baseUrl'] === '' || $wa['instance'] === '' || $wa['apiKey'] === '') {
            return [false, 'Evolution API belum dikonfigurasi'];
        }
        $url = rtrim($wa['baseUrl'], '/') . '/message/sendText/' . rawurlencode($wa['instance']);
        $payload = $wa['apiVersion'] === 'v1'
            ? ['number' => $phone, 'options' => ['delay' => 0], 'textMessage' => ['text' => $text]]
            : ['number' => $phone, 'text' => $text];

        if (!function_exists('curl_init')) {
            return [false, 'Ekstensi curl tidak aktif'];
        }
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE),
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'apikey: ' . $wa['apiKey']],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT        => 10,
        ]);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($raw === false) {
            return [false, 'Koneksi gagal: ' . $err];
        }
        return [$status >= 200 && $status < 300, "HTTP $status " . substr((string) $raw, 0, 300)];
    }

    public static function sendTest(string $phone, array $actor): array
    {
        $phone = UserRepository::normalizePhone($phone);
        if ($phone === '') {
            throw new HttpError('Isi nomor WhatsApp tujuan tes');
        }
        $wa = self::settings()['wa'];
        [$ok, $resp] = self::sendWhatsApp($wa, $phone,
            "✅ Tes notifikasi Prasad Seeds Monitoring\nDikirim oleh: " . ($actor['name'] ?: $actor['username']));
        Db::transaction([['INSERT INTO wa_logs (username, phone, message, status, response, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [$actor['username'], $phone, 'TES', $ok ? 'sent' : 'failed', mb_substr($resp, 0, 500), gmdate('c')]]]);
        return ['sent' => $ok, 'response' => $resp];
    }

    // ═══════════════════════════════════════════════════════
    // NOTIFIKASI IN-APP
    // ═══════════════════════════════════════════════════════

    /**
     * Notifikasi untuk user: since=0 → 30 terbaru; since>0 → yang lebih baru dari id tsb.
     */
    public static function feed(string $username, int $since): array
    {
        [$rows, $unread] = Db::queryMany([
            $since > 0
                ? ['SELECT * FROM notifications WHERE username = ? AND id > ? ORDER BY id DESC LIMIT 50', [$username, $since]]
                : ['SELECT * FROM notifications WHERE username = ? ORDER BY id DESC LIMIT 30', [$username]],
            ["SELECT COUNT(*) AS n FROM notifications WHERE username = ? AND read_at = ''", [$username]],
        ]);
        return [
            'notifications' => array_map(fn ($r) => [
                'id'        => (int) $r['id'],
                'severity'  => (string) $r['severity'],
                'title'     => (string) $r['title'],
                'body'      => (string) $r['body'],
                'sessionId' => (string) $r['session_id'],
                'unitId'    => (string) $r['unit_id'],
                'actor'     => (string) $r['actor'],
                'createdAt' => (string) $r['created_at'],
                'read'      => $r['read_at'] !== '',
            ], $rows),
            'unreadCount' => (int) ($unread[0]['n'] ?? 0),
        ];
    }

    public static function markRead(string $username, array $ids, bool $all): void
    {
        $now = gmdate('c');
        if ($all) {
            Db::transaction([["UPDATE notifications SET read_at = ? WHERE username = ? AND read_at = ''", [$now, $username]]]);
            return;
        }
        $ids = array_values(array_filter(array_map('intval', $ids)));
        if (!$ids) {
            return;
        }
        Db::transaction([[
            "UPDATE notifications SET read_at = ? WHERE username = ? AND read_at = '' AND id IN ("
                . implode(',', array_fill(0, count($ids), '?')) . ')',
            array_merge([$now, $username], $ids),
        ]]);
    }
}
