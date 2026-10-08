<?php
declare(strict_types=1);

/**
 * Import ekspor Google Sheets (.xlsx: SESSIONS, SESSION_ITEMS, HIERARCHY) ke database.
 * Bersifat MENGGABUNG — data yang sudah ada di database tidak ditimpa, hanya yang kurang/beda ditulis.
 * Aman dijalankan berulang.
 *
 *   php scripts/import-xlsx.php                          → dbm.xlsx ke database dari .env
 *   php scripts/import-xlsx.php --file=data.xlsx --env=.env.turso
 *   php scripts/import-xlsx.php --dry-run                → hanya laporan, tidak menulis
 *   php scripts/import-xlsx.php --keep-deleted           → sesi yang pernah dihapus di app tidak dipulihkan
 *   php scripts/import-xlsx.php --no-hierarchy           → jangan tambahkan unit/area/equipment yang belum ada
 *   php scripts/import-xlsx.php --no-backup              → jangan salin file SQLite sebelum menulis
 *   php scripts/import-xlsx.php --chunk=100              → jumlah sesi per kiriman (default 100)
 *
 * Aturan gabung:
 *  - Sesi baru (belum ada di database) ditulis lengkap dengan item-nya. Sesi yang ada di deleted_sessions
 *    dipulihkan (kecuali --keep-deleted).
 *  - Sesi yang sudah ada TIDAK ditimpa (item di database sudah dikoreksi Data Recovery); hanya kolom tanggal
 *    yang diperbaiki bila berbeda dari Sheets. Tanggal Sheets (nomor seri) adalah tanggal kerja yang benar;
 *    import lama dari Apps Script menggeser semua tanggal mundur 1 hari.
 *  - Hierarki: hanya unit / area / equipment (beserta parameternya) yang ID-nya belum ada yang ditambahkan.
 *    Equipment yang sudah ada tidak diubah (ID parameter di database sudah berbeda dari Sheets).
 *  - Sheet PIC_LIST (berisi akun lama dengan password plaintext) dan SYNC_LOG tidak diimpor.
 */

require __DIR__ . '/_cli.php';
require __DIR__ . '/_xlsx.php';

$args = $GLOBALS['cliArgs'];

try {
    $file = is_string($args['file'] ?? null) ? $args['file'] : dirname(__DIR__) . '/dbm.xlsx';
    $book = XlsxReader::read($file);
    foreach (['SESSIONS', 'SESSION_ITEMS', 'HIERARCHY'] as $need) {
        if (!isset($book[$need])) {
            throw new RuntimeException("Sheet $need tidak ada di " . basename($file));
        }
    }

    $sessions = build_sessions($book['SESSIONS'], $book['SESSION_ITEMS']);
    out('Driver tujuan : ' . Db::driverName());
    out(sprintf('Sumber        : %d sesi · %d item · %d baris hierarki (%s)',
        count($sessions), array_sum(array_map(fn ($s) => count($s['items']), $sessions)), count($book['HIERARCHY']), basename($file)));

    Schema::migrate();
    $keepDeleted = isset($args['keep-deleted']);

    // ── Bandingkan sesi dengan isi database ──
    $dbSessions = Db::query('SELECT * FROM sessions');
    $dbById = [];
    foreach ($dbSessions as $r) {
        $dbById[$r['id']] = $r;
    }
    $deleted = array_flip(array_column(Db::query('SELECT id FROM deleted_sessions'), 'id'));

    $toWrite = [];
    $fixDates = []; // id => tanggal yang benar
    $stat = ['baru' => 0, 'dipulihkan' => 0, 'tanggal diperbaiki' => 0, 'sama' => 0, 'dilewati (dihapus)' => 0];
    foreach ($sessions as $s) {
        $id = $s['id'];
        if (isset($deleted[$id]) && $keepDeleted) {
            $stat['dilewati (dihapus)']++;
            continue;
        }
        if (!isset($dbById[$id])) {
            $stat[isset($deleted[$id]) ? 'dipulihkan' : 'baru']++;
            $toWrite[] = $s;
        } elseif ((string) $dbById[$id]['tanggal'] !== $s['tanggal']) {
            $stat['tanggal diperbaiki']++;
            $fixDates[$id] = $s['tanggal'];
        } else {
            $stat['sama']++;
        }
    }
    out('Sesi          : ' . implode(' · ', array_map(fn ($k, $v) => "$v $k", array_keys($stat), $stat)));

    // ── Hierarki: tambahkan yang belum ada ──
    $hierarchyPush = null;
    $added = ['unit' => 0, 'area' => 0, 'equipment' => 0, 'parameter' => 0];
    if (!isset($args['no-hierarchy'])) {
        $current = SyncRepository::pull(0)['hierarchy'] ?? ['units' => []];
        $merged = merge_hierarchy($current, build_hierarchy($book['HIERARCHY']), $added);
        if (array_sum($added) > 0) {
            $hierarchyPush = $merged;
        }
    }
    out(sprintf('Hierarki      : +%d unit · +%d area · +%d equipment · +%d parameter', ...array_values($added)));

    if (isset($args['dry-run'])) {
        out('Dry run — tidak ada data yang ditulis.');
        exit(0);
    }
    if (!$toWrite && !$fixDates && !$hierarchyPush) {
        out('Tidak ada yang perlu ditulis — database sudah sesuai.');
        exit(0);
    }

    if (Db::driverName() === 'sqlite' && !isset($args['no-backup'])) {
        $path = backup_sqlite();
        if ($path) {
            out('Backup        : ' . $path);
        }
    }

    $importer = ['username' => 'import-xlsx', 'role' => 'admin'];
    if ($hierarchyPush) {
        SyncRepository::push(['hierarchy' => $hierarchyPush], $importer, false);
        out('✓ Hierarki');
    }
    if ($fixDates) {
        $rev = "(SELECT value FROM counters WHERE name = 'rev')";
        $stmts = [["UPDATE counters SET value = value + 1 WHERE name = 'rev'", []]];
        foreach ($fixDates as $id => $tgl) {
            $stmts[] = ["UPDATE sessions SET tanggal = ?, rev = $rev WHERE id = ?", [$tgl, $id]];
        }
        Db::transaction($stmts);
        out('✓ Tanggal ' . count($fixDates) . ' sesi diperbaiki');
    }
    $chunk = max(1, min(300, (int) ($args['chunk'] ?? 100)));
    foreach (array_chunk($toWrite, $chunk) as $i => $part) {
        SyncRepository::push(['sessions' => $part], $importer, false);
        out(sprintf('✓ Sesi %d–%d', $i * $chunk + 1, $i * $chunk + count($part)));
    }
    out('Selesai.');
} catch (Throwable $e) {
    fwrite(STDERR, 'GAGAL: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}

// ─────────────────────────────────────────────────────────

/** Nilai sel Sheets → string bersih ("10001.0" dari angka bulat → "10001"). */
function clean(string $v): string
{
    $v = trim($v);
    return preg_match('~^-?\d+\.0$~', $v) ? substr($v, 0, -2) : $v;
}

/** Nomor seri tanggal Sheets (46073.0) atau ISO → YYYY-MM-DD. */
function sheet_date(string $d): string
{
    if (preg_match('~^\d{5}(\.\d+)?$~', $d)) {
        return gmdate('Y-m-d', (int) round(((float) $d - 25569) * 86400));
    }
    if (preg_match('~^\d{4}-\d{2}-\d{2}T~', $d) && ($ts = strtotime($d))) {
        return date('Y-m-d', $ts);
    }
    return $d;
}

/** Pecahan hari Sheets (0.9444) → "HH:MM". */
function sheet_time(string $t): string
{
    if ($t === '' || !is_numeric($t)) {
        return $t;
    }
    $m = (int) round(((float) $t) * 1440);
    return sprintf('%02d:%02d', intdiv($m, 60) % 24, $m % 60);
}

function build_sessions(array $rows, array $itemRows): array
{
    $items = [];
    foreach ($itemRows as $r) {
        $items[$r['sessionId']][] = [
            'paramId' => $r['paramId'], 'label' => $r['label'], 'unit' => $r['unit'], 'section' => $r['section'],
            'value' => normalize_value($r['value']), 'status' => $r['status'], 'note' => $r['note'] ?? '',
        ];
    }
    $out = [];
    foreach ($rows as $r) {
        if ($r['id'] === '') {
            continue;
        }
        $out[] = [
            'id' => $r['id'], 'tanggal' => sheet_date($r['tanggal']),
            'unitId' => $r['unitId'], 'unitName' => $r['unitName'], 'areaId' => $r['areaId'], 'areaName' => $r['areaName'],
            'subAreaId' => $r['subAreaId'], 'subAreaName' => $r['subAreaName'],
            'equipId' => $r['equipId'], 'equipName' => $r['equipName'], 'pic' => trim($r['pic']),
            'startTime' => sheet_time($r['startTime']), 'endTime' => sheet_time($r['endTime']),
            'catatan' => $r['catatan'], 'tindakan' => $r['tindakan'],
            'createdAt' => $r['createdAt'], 'updatedAt' => $r['updatedAt'],
            'items' => $items[$r['id']] ?? [],
        ];
    }
    return $out;
}

/** Sama dengan penyimpanan di SyncRepository (koma desimal → titik, pengaman tanggal) supaya perbandingan adil. */
function normalize_value(string $v): string
{
    if (is_numeric($v) && preg_match('~^-?\d+\.0$~', trim($v))) {
        $v = substr(trim($v), 0, -2);
    }
    return ValueGuard::sanitize($v)[0];
}

function build_hierarchy(array $rows): array
{
    $units = [];
    foreach ($rows as $r) {
        $uid = $r['unitId'];
        if ($uid === '') {
            continue;
        }
        $units[$uid] ??= ['id' => $uid, 'name' => $r['unitName'], 'desc' => '', 'areas' => []];
        if ($r['areaId'] === '') {
            continue;
        }
        $units[$uid]['areas'][$r['areaId']] ??= ['id' => $r['areaId'], 'name' => $r['areaName'], 'equipments' => []];
        if ($r['equipId'] === '') {
            continue; // baris EQUIP kosong di Sheets
        }
        $area = &$units[$uid]['areas'][$r['areaId']];
        $area['equipments'][$r['equipId']] ??= [
            'id' => $r['equipId'], 'name' => $r['equipName'], 'tag' => clean($r['equipTag']), 'type' => $r['equipType'], 'params' => [],
        ];
        if ($r['type'] === 'PARAM' && $r['paramId'] !== '') {
            $type = $r['paramType'] !== '' ? $r['paramType'] : 'numeric';
            $p = ['id' => $r['paramId'], 'label' => $r['paramLabel'], 'unit' => $r['paramUnit'],
                'section' => $r['paramSection'], 'type' => $type];
            foreach (['normalMin', 'normalMax', 'warnMin', 'warnMax'] as $k) {
                if ($r[$k] !== '' && is_numeric($r[$k])) {
                    $p[$k] = $r[$k] + 0;
                }
            }
            if ($r['paramOptions'] !== '') {
                $p['options'] = array_values(array_filter(array_map('trim', explode('|', $r['paramOptions'])), 'strlen'));
            }
            $area['equipments'][$r['equipId']]['params'][] = $p;
        }
        unset($area);
    }
    return $units;
}

/** Tambahkan unit/area/equipment yang belum ada ke hierarki database; yang sudah ada dibiarkan. */
function merge_hierarchy(array $current, array $incoming, array &$added): array
{
    $units = $current['units'] ?? [];
    $uIdx = array_flip(array_column($units, 'id'));
    foreach ($incoming as $uid => $u) {
        if (!isset($uIdx[$uid])) {
            $units[] = ['id' => $uid, 'name' => $u['name'], 'desc' => '', 'areas' => []];
            $uIdx[$uid] = count($units) - 1;
            $added['unit']++;
        }
        $ui = $uIdx[$uid];
        $aIdx = array_flip(array_column($units[$ui]['areas'], 'id'));
        foreach ($u['areas'] as $aid => $a) {
            if (!isset($aIdx[$aid])) {
                $units[$ui]['areas'][] = ['id' => $aid, 'name' => $a['name'], 'equipments' => []];
                $aIdx[$aid] = count($units[$ui]['areas']) - 1;
                $added['area']++;
            }
            $ai = $aIdx[$aid];
            // ID equipment unik di seluruh hierarki
            $have = [];
            foreach ($units as $uu) {
                foreach ($uu['areas'] as $aa) {
                    foreach ($aa['equipments'] as $ee) {
                        $have[$ee['id']] = true;
                    }
                }
            }
            foreach ($a['equipments'] as $eid => $e) {
                if (isset($have[$eid])) {
                    continue;
                }
                $units[$ui]['areas'][$ai]['equipments'][] = $e;
                $added['equipment']++;
                $added['parameter'] += count($e['params']);
            }
        }
    }
    return ['units' => $units];
}

function backup_sqlite(): ?string
{
    $path = Env::get('SQLITE_PATH', 'database/dailymonitoring.db');
    if (!preg_match('~^([a-zA-Z]:)?[\\\\/]~', $path)) {
        $path = APP_ROOT . '/' . $path;
    }
    if (!is_file($path)) {
        return null;
    }
    $dest = preg_replace('~\.db$~', '', $path) . '.pre-xlsx-' . date('Ymd-His') . '.db';
    return copy($path, $dest) ? $dest : null;
}
