<?php
declare(strict_types=1);

/**
 * Import data lama dari Google Sheets (Apps Script "pull") ke database.
 * Aman dijalankan berulang: data di-upsert berdasarkan ID.
 *
 *   php scripts/import-sheets.php                       → ke database dari .env (SQLite lokal)
 *   php scripts/import-sheets.php --env=.env.turso      → ke Turso
 *   php scripts/import-sheets.php --file=backup.json    → dari file JSON hasil pull yang sudah disimpan
 *   php scripts/import-sheets.php --dry-run             → hanya tampilkan jumlah data
 *   php scripts/import-sheets.php --skip-users          → jangan import akun user
 *
 * Opsi sumber: --url=<URL Apps Script /exec>  --key=<webhook key>
 */

require __DIR__ . '/_cli.php';

const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbwjD5hM3ntEog7nilQpegXJliFdjweKRP1vf0VW78TiwyBGOUcIY3L8GB4oGL-OnQPokA/exec';
const DEFAULT_GAS_KEY = 'prasad2024';

$args = $GLOBALS['cliArgs'];

try {
    $data = load_source($args);
    if (($data['status'] ?? '') !== 'ok' && ($data['ok'] ?? false) !== true) {
        throw new RuntimeException('Respons Sheets bukan status ok: ' . substr(json_encode($data), 0, 200));
    }

    $hierarchy = normalize_hierarchy($data['hierarchy'] ?? null);
    $sessions = array_map('normalize_session', array_values(array_filter($data['sessions'] ?? [], 'is_array')));
    $workOrders = array_map('normalize_work_order', array_values(array_filter($data['workOrders'] ?? [], 'is_array')));
    $picList = array_values(array_filter(array_map('strval', $data['picList'] ?? []), fn ($p) => trim($p) !== ''));
    $users = array_values(array_filter($data['users'] ?? [], 'is_array'));

    out('Driver tujuan : ' . Db::driverName());
    out(sprintf('Data sumber   : %d unit · %d sesi · %d work order · %d PIC · %d user',
        count($hierarchy['units'] ?? []), count($sessions), count($workOrders), count($picList), count($users)));

    if (isset($args['dry-run'])) {
        out('Dry run — tidak ada data yang ditulis.');
        exit(0);
    }

    Schema::migrate();
    $importer = ['username' => 'import-sheets', 'role' => 'admin'];

    $first = ['sessions' => [], 'workOrders' => $workOrders];
    if ($hierarchy['units']) {
        $first['hierarchy'] = $hierarchy;
    }
    if ($picList) {
        $first['picList'] = $picList;
    }
    SyncRepository::push($first, $importer, false);
    out('✓ Hierarki, PIC & work order');

    foreach (array_chunk($sessions, 150) as $i => $chunk) {
        SyncRepository::push(['sessions' => $chunk], $importer, false);
        out(sprintf('✓ Sesi %d–%d', $i * 150 + 1, $i * 150 + count($chunk)));
    }

    if (!isset($args['skip-users']) && $users) {
        $n = UserRepository::importPlain($users);
        out("✓ $n user (password otomatis di-hash)");
    }
    out('Selesai.');
} catch (Throwable $e) {
    fwrite(STDERR, 'GAGAL: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}

// ─────────────────────────────────────────────────────────

function load_source(array $args): array
{
    if (is_string($args['file'] ?? null)) {
        $raw = file_get_contents($args['file']);
        if ($raw === false) {
            throw new RuntimeException('File tidak bisa dibaca: ' . $args['file']);
        }
    } else {
        $url = is_string($args['url'] ?? null) ? $args['url'] : DEFAULT_GAS_URL;
        $key = is_string($args['key'] ?? null) ? $args['key'] : DEFAULT_GAS_KEY;
        out('Mengambil data dari Google Sheets...');
        $ch = curl_init($url . '?action=pull&key=' . rawurlencode($key));
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT        => 120,
        ]);
        $raw = curl_exec($ch);
        if ($raw === false) {
            throw new RuntimeException('Gagal mengambil data: ' . curl_error($ch));
        }
    }
    $data = json_decode((string) $raw, true);
    if (!is_array($data)) {
        throw new RuntimeException('Respons bukan JSON: ' . substr((string) $raw, 0, 200));
    }
    return $data;
}

/** Sama dengan rekonstruksi hierarki di pullFromSheets() versi lama. */
function normalize_hierarchy(mixed $h): array
{
    $units = [];
    foreach ((is_array($h['units'] ?? null) ? $h['units'] : []) as $u) {
        $areas = [];
        foreach (($u['areas'] ?? []) as $a) {
            $equips = [];
            $all = array_merge($a['equipments'] ?? [], ...array_map(fn ($sa) => $sa['equipments'] ?? [], $a['subAreas'] ?? []));
            foreach ($all as $eq) {
                $equips[] = [
                    'id'     => (string) ($eq['id'] ?? ''),
                    'name'   => (string) ($eq['name'] ?? ''),
                    'tag'    => (string) ($eq['tag'] ?? ''),
                    'type'   => (string) ($eq['type'] ?? ''),
                    'brand'  => (string) ($eq['brand'] ?? ''),
                    'model'  => (string) ($eq['model'] ?? ''),
                    'params' => is_array($eq['params'] ?? null) ? $eq['params'] : [],
                ];
            }
            $areas[] = ['id' => (string) ($a['id'] ?? ''), 'name' => (string) ($a['name'] ?? ''), 'equipments' => $equips];
        }
        $units[] = ['id' => (string) ($u['id'] ?? ''), 'name' => (string) ($u['name'] ?? ''), 'desc' => (string) ($u['desc'] ?? ''), 'areas' => $areas];
    }
    return ['units' => $units];
}

function normalize_session(array $s): array
{
    $s['tanggal'] = normalize_date($s['tanggal'] ?? '');
    if (isset($s['checklist']) && is_string($s['checklist'])) {
        $decoded = json_decode($s['checklist'], true);
        $s['checklist'] = is_array($decoded) ? $decoded : null;
    }
    $s['items'] = array_map(function ($item) {
        $value = $item['value'] ?? '';
        if (is_int($value) || is_float($value)) {
            $value = (string) $value;
        } elseif (is_string($value) && preg_match('~^-?\d+,\d+$~', trim($value))) {
            $value = str_replace(',', '.', trim($value)); // koma desimal → titik
        }
        $item['value'] = $value;
        return $item;
    }, array_values(array_filter($s['items'] ?? [], 'is_array')));
    return $s;
}

function normalize_work_order(array $wo): array
{
    if (isset($wo['checklist']) && is_string($wo['checklist'])) {
        $decoded = json_decode($wo['checklist'], true);
        $wo['checklist'] = is_array($decoded) ? $decoded : [];
    }
    if (!is_array($wo['checklist'] ?? null)) {
        $wo['checklist'] = [];
    }
    return $wo;
}

/** Tanggal dari Sheets bisa berupa serial angka atau ISO datetime → YYYY-MM-DD (WIB). */
function normalize_date(mixed $d): string
{
    if (is_int($d) || is_float($d) || (is_string($d) && preg_match('~^\d{5}(\.\d+)?$~', $d))) {
        return gmdate('Y-m-d', (int) round(((float) $d - 25569) * 86400));
    }
    $d = (string) $d;
    if (preg_match('~^\d{4}-\d{2}-\d{2}T~', $d)) {
        $ts = strtotime($d);
        return $ts ? date('Y-m-d', $ts) : substr($d, 0, 10);
    }
    return $d;
}
