<?php
declare(strict_types=1);

/**
 * Membersihkan nilai monitoring yang rusak — aturan deteksinya sama dengan
 * Data Recovery Tool & Scan Big Error di aplikasi, ditambah sisa recovery lama.
 *
 *   php scripts/clean-data.php                          → laporan saja (dry run)
 *   php scripts/clean-data.php --apply                  → terapkan perbaikan
 *   php scripts/clean-data.php --env=.env.turso --apply → database Turso
 *   php scripts/clean-data.php --params-from=sheets.json
 *        → batas parameter tambahan dari hierarki lama (hasil pull Sheets),
 *          untuk sesi lama yang ID parameternya sudah tidak ada di hierarki sekarang
 *   php scripts/clean-data.php --raw-from=sheets.json
 *        → ambil nilai asli (sebelum diubah Data Recovery Tool lama) dari hasil pull Sheets
 *
 * Aturan:
 *   R1  Nilai berbentuk tanggal (angka yang dibaca Sheets sebagai tanggal) → dihitung balik
 *       dengan ValueGuard: tahun 1900-an = nomor seri, tahun 2000-an = desimal hari.bulan
 *       (12 Feb 2026 → 12.2). Yang tidak bisa dipastikan → dikosongkan
 *   R2  Angka ≥10 digit (bug timestamp)                                       → dikosongkan
 *   R3  Sisa recovery lama: status kosong & nilai 1–31 (diambil dari "tanggal")
 *       → status dihitung ulang; jika hasilnya di luar batas normal, nilainya
 *         tidak bisa dipercaya → dikosongkan
 *   R4  Titik desimal hilang: nilai > 3× batas atas → jika tepat satu posisi
 *       titik desimal menghasilkan nilai dalam batas normal, nilai diperbaiki;
 *       jika lebih dari satu kemungkinan → dikosongkan
 *   R5  Status kosong pada nilai angka yang valid → status dihitung ulang
 *   R6  Sesi draft yang ditinggalkan (tanpa satu pun nilai & tanpa jam selesai) → dihapus
 *   R7  Status ALERT/WARNING palsu karena batas parameter terbalik (mis. normal 11–16 tapi
 *       batas warning bawah 18) → status dihitung ulang tanpa batas yang tidak konsisten
 *
 * Nilai yang dikosongkan tidak hilang: nilai aslinya disimpan di catatan item
 * ("[dibersihkan: nilai asli …]") supaya masih bisa ditelusuri.
 */

require __DIR__ . '/_cli.php';

$args = $GLOBALS['cliArgs'];
$apply = !empty($args['apply']);

try {
    out('Database : ' . Db::driverName() . ($apply ? '  (MODE APPLY)' : '  (dry run — tambahkan --apply untuk menerapkan)'));
    Schema::migrate();

    $params = load_params(is_string($args['params-from'] ?? null) ? $args['params-from'] : null);
    $rawFrom = load_raw(is_string($args['raw-from'] ?? null) ? $args['raw-from'] : null);
    [$sessions, $items, $currentParams] = Db::queryMany([
        ['SELECT id, tanggal, equip_id, equip_name, end_time FROM sessions', []],
        ['SELECT session_id, seq, param_id, label, value, status, note FROM session_items ORDER BY session_id, seq', []],
        ['SELECT equip_id, id, label, type, normal_min, normal_max, warn_min, warn_max FROM equipment_params', []],
    ]);
    foreach ($currentParams as $p) {
        $params['id'][$p['id']] = param_row($p);
        $params['label'][$p['equip_id'] . '|' . norm_label($p['label'])] ??= param_row($p);
    }

    $sessById = array_column($sessions, null, 'id');
    $itemCount = [];
    $filled = [];
    $changes = []; // session_id => [seq => [value, status, note, rule, old]]
    $stats = array_fill_keys(['R1', 'R2', 'R3', 'R4', 'R5', 'R7'], 0);

    foreach ($items as $it) {
        $sid = $it['session_id'];
        $itemCount[$sid] = ($itemCount[$sid] ?? 0) + 1;
        $value = trim((string) $it['value']);
        if ($value !== '') {
            $filled[$sid] = true;
        }
        $sess = $sessById[$sid] ?? null;
        $p = $params['id'][$it['param_id']]
            ?? ($sess ? ($params['label'][$sess['equip_id'] . '|' . norm_label($it['label'])] ?? null) : null);
        $numeric = $p !== null && $p['type'] !== 'status';
        $fix = null;
        $note = (string) $it['note'];
        $seq = (int) $it['seq'];

        // Nilai asli yang rusak: nilai sekarang, file Sheets (--raw-from), atau catatan pembersihan sebelumnya
        $raw = null;
        if ($value !== '' && (ValueGuard::looksLikeDate($value) || ValueGuard::isBigError($value))) {
            $raw = $value;
        } elseif (isset($rawFrom[$sid][$seq]) && $rawFrom[$sid][$seq][1] === $it['label']) {
            $raw = $rawFrom[$sid][$seq][0];
        } elseif ($value === '' && preg_match('~\[dibersihkan: nilai asli ([^\]]+)\]~u', $note, $m) && ValueGuard::looksLikeDate($m[1])) {
            $raw = $m[1];
        }

        if ($raw !== null) {
            [$rec] = ValueGuard::sanitize($raw);
            $baseNote = trim(preg_replace('~\s*\[(dibersihkan|dipulihkan): [^\]]*\]~u', '', $note));
            if ($rec !== '') {
                $newStatus = $numeric ? calc_status((float) $rec, $p) : (string) $it['status'];
                $fix = [$rec, $newStatus, 'R1', trim("$baseNote [dipulihkan: $raw → $rec]")];
            } else {
                $fix = ['', '', ValueGuard::isBigError($raw) ? 'R2' : 'R1', trim("$baseNote [dibersihkan: nilai asli $raw]")];
            }
            if ($fix[0] === $value && $fix[1] === $it['status'] && $fix[3] === $note) {
                $fix = null; // sudah dipulihkan sebelumnya
            }
        } elseif ($numeric && is_numeric($value)) {
            $n = (float) $value;
            $calc = calc_status($n, $p);
            $upper = $p['warnMax'] ?? $p['normalMax'];
            if ($it['status'] === '' && preg_match('~^\d{1,2}$~', $value) && $n >= 1 && $n <= 31 && $calc !== 'OK') {
                $fix = ['', '', 'R3'];
            } elseif ($upper !== null && $upper > 0 && $n > 3 * $upper && preg_match('~^\d{4,}$~', $value)) {
                $cands = decimal_candidates($value, $p);
                $fix = count($cands) === 1
                    ? [$cands[0], calc_status((float) $cands[0], $p), 'R4']
                    : ['', '', 'R4'];
            } elseif ($it['status'] === '') {
                $fix = [$value, $calc, 'R5'];
            } elseif ($p['inconsistent'] && $it['status'] !== $calc) {
                $fix = [$value, $calc, 'R7'];
            }
        }

        if ($fix) {
            [$newValue, $newStatus, $rule] = $fix;
            if (isset($fix[3])) {
                $note = $fix[3];
            } elseif ($newValue !== $value) {
                $note = trim($note . ' [dibersihkan: nilai asli ' . $value . ']');
            }
            $changes[$sid][$seq] = [$newValue, $newStatus, $note, $rule, $raw ?? $value, $it['status'], $it['label']];
            $stats[$rule]++;
        }
    }

    // R6 — draft yang ditinggalkan
    $abandoned = [];
    foreach ($sessions as $s) {
        if (empty($filled[$s['id']]) && trim((string) $s['end_time']) === '') {
            $abandoned[] = $s['id'];
        }
    }
    $emptyDone = count(array_filter($sessions, fn ($s) => empty($itemCount[$s['id']]) && trim((string) $s['end_time']) !== ''));

    out('');
    out(sprintf('R1 nilai berbentuk tanggal        : %d', $stats['R1']));
    out(sprintf('R2 angka ≥10 digit (big error)    : %d', $stats['R2']));
    out(sprintf('R3 sisa recovery lama (tak valid) : %d', $stats['R3']));
    out(sprintf('R4 titik desimal hilang           : %d', $stats['R4']));
    out(sprintf('R5 status kosong dihitung ulang   : %d', $stats['R5']));
    out(sprintf('R6 draft ditinggalkan (dihapus)   : %d sesi', count($abandoned)));
    out(sprintf('R7 status palsu (batas terbalik)  : %d', $stats['R7']));
    out(sprintf('   (info) sesi selesai tanpa nilai : %d — tidak diubah', $emptyDone));
    out('');
    foreach ($changes as $sid => $rows) {
        $s = $sessById[$sid] ?? ['tanggal' => '?', 'equip_name' => '?'];
        foreach ($rows as [$nv, $ns, , $rule, $ov, $os, $label]) {
            out(sprintf('  %s  %s %-24s | %-28s %s [%s] → %s [%s]', $rule, $s['tanggal'], mb_strimwidth($s['equip_name'], 0, 24),
                mb_strimwidth($label, 0, 28), $ov, $os ?: '-', $nv === '' ? '(kosong)' : $nv, $ns ?: '-'));
        }
    }

    if (!$apply) {
        out('');
        out('Dry run selesai — belum ada yang diubah.');
        exit(0);
    }

    // Terapkan: setiap sesi yang berubah mendapat rev baru supaya semua perangkat ikut memperbarui
    $stmts = [];
    foreach ($changes as $sid => $rows) {
        foreach ($rows as $seq => [$nv, $ns, $note]) {
            $stmts[] = ['UPDATE session_items SET value = ?, status = ?, note = ? WHERE session_id = ? AND seq = ?',
                [$nv, $ns, $note, $sid, $seq]];
        }
        $stmts[] = ["UPDATE sessions SET rev = (SELECT value FROM counters WHERE name = 'rev'), updated_at = ? WHERE id = ?",
            [gmdate('c'), $sid]];
    }
    foreach (array_chunk($stmts, 150) as $chunk) {
        Db::transaction(array_merge([["UPDATE counters SET value = value + 1 WHERE name = 'rev'", []]], $chunk));
    }
    foreach (array_chunk($abandoned, 100) as $chunk) {
        SyncRepository::push(['deletedSessions' => $chunk], ['username' => 'clean-data', 'role' => 'admin'], false);
    }
    out('');
    out(sprintf('Selesai: %d item diperbaiki di %d sesi, %d draft dihapus.',
        array_sum($stats), count($changes), count($abandoned)));
} catch (Throwable $e) {
    fwrite(STDERR, 'GAGAL: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}

// ─────────────────────────────────────────────────────────

/**
 * Nilai rusak di file hasil pull Sheets, per [sesi][urutan item] → [nilai, label].
 * Urutan item sama dengan saat import (scripts/import-sheets.php).
 */
function load_raw(?string $file): array
{
    if ($file === null) {
        return [];
    }
    $data = json_decode((string) @file_get_contents($file), true);
    if (!is_array($data['sessions'] ?? null)) {
        throw new RuntimeException("File $file tidak berisi sesi");
    }
    $out = [];
    foreach ($data['sessions'] as $s) {
        $items = array_values(array_filter(is_array($s['items'] ?? null) ? $s['items'] : [], 'is_array'));
        foreach ($items as $i => $item) {
            $v = trim((string) ($item['value'] ?? ''));
            if ($v !== '' && (ValueGuard::looksLikeDate($v) || ValueGuard::isBigError($v))) {
                $out[(string) $s['id']][$i] = [$v, (string) ($item['label'] ?? '')];
            }
        }
    }
    return $out;
}

/** Sama dengan recalcItemStatus() di aplikasi. */
function calc_status(float $v, array $p): string
{
    if (($p['warnMax'] !== null && $v > $p['warnMax']) || ($p['warnMin'] !== null && $v < $p['warnMin'])) {
        return 'ALERT';
    }
    if (($p['normalMax'] !== null && $v > $p['normalMax']) || ($p['normalMin'] !== null && $v < $p['normalMin'])) {
        return 'WARNING';
    }
    return 'OK';
}

/** Posisi titik desimal yang membuat nilai masuk batas normal. */
function decimal_candidates(string $digits, array $p): array
{
    $out = [];
    for ($i = 1; $i < strlen($digits); $i++) {
        $cand = rtrim(rtrim(substr($digits, 0, $i) . '.' . substr($digits, $i), '0'), '.');
        if (calc_status((float) $cand, $p) === 'OK') {
            $out[] = $cand;
        }
    }
    $cand = '0.' . $digits;
    if (calc_status((float) $cand, $p) === 'OK') {
        $out[] = rtrim($cand, '0');
    }
    return array_values(array_unique($out));
}

function norm_label(string $label): string
{
    return strtolower(preg_replace('~\s+~', ' ', trim($label)));
}

function param_row(array $p): array
{
    $num = fn ($v) => ($v === null || $v === '' || !is_numeric($v)) ? null : (float) $v;
    $row = [
        'type'      => (string) ($p['type'] ?? 'numeric'),
        'normalMin' => $num($p['normal_min'] ?? $p['normalMin'] ?? null),
        'normalMax' => $num($p['normal_max'] ?? $p['normalMax'] ?? null),
        'warnMin'   => $num($p['warn_min'] ?? $p['warnMin'] ?? null),
        'warnMax'   => $num($p['warn_max'] ?? $p['warnMax'] ?? null),
        'inconsistent' => false,
    ];
    // Batas warning harus lebih longgar dari batas normal — yang terbalik diabaikan
    if ($row['warnMin'] !== null && $row['normalMin'] !== null && $row['warnMin'] > $row['normalMin']) {
        $row['warnMin'] = null;
        $row['inconsistent'] = true;
    }
    if ($row['warnMax'] !== null && $row['normalMax'] !== null && $row['warnMax'] < $row['normalMax']) {
        $row['warnMax'] = null;
        $row['inconsistent'] = true;
    }
    return $row;
}

/** Batas parameter dari file JSON hierarki lama (hasil pull Sheets / backup). */
function load_params(?string $file): array
{
    $out = ['id' => [], 'label' => []];
    if ($file === null) {
        return $out;
    }
    $data = json_decode((string) @file_get_contents($file), true);
    $hier = $data['hierarchy'] ?? $data;
    if (is_string($hier)) {
        $hier = json_decode($hier, true);
    }
    if (!is_array($hier['units'] ?? null)) {
        throw new RuntimeException("File $file tidak berisi hierarki");
    }
    foreach ($hier['units'] as $u) {
        foreach ($u['areas'] ?? [] as $a) {
            $equips = $a['equipments'] ?? [];
            foreach ($a['subAreas'] ?? [] as $sa) {
                array_push($equips, ...($sa['equipments'] ?? []));
            }
            foreach ($equips as $e) {
                foreach ($e['params'] ?? [] as $p) {
                    $out['id'][(string) $p['id']] = param_row($p);
                }
            }
        }
    }
    return $out;
}
