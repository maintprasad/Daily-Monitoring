<?php
declare(strict_types=1);

/**
 * Baca/tulis data aplikasi (hierarki, PIC, sesi monitoring, work order).
 *
 * Format objek JSON yang dikirim/diterima sama persis dengan objek yang dipakai
 * frontend (camelCase), sehingga frontend tidak perlu tahu struktur tabel.
 */
final class SyncRepository
{
    private const REV = "(SELECT value FROM counters WHERE name = 'rev')";
    private const PAGE_SIZE = 200;
    private const MAX_SESSIONS_PER_PUSH = 300;

    private const SESSION_FIELDS = [
        'id' => 'id', 'tanggal' => 'tanggal',
        'unitId' => 'unit_id', 'unitName' => 'unit_name',
        'areaId' => 'area_id', 'areaName' => 'area_name',
        'subAreaId' => 'sub_area_id', 'subAreaName' => 'sub_area_name',
        'equipId' => 'equip_id', 'equipName' => 'equip_name',
        'pic' => 'pic', 'startTime' => 'start_time', 'endTime' => 'end_time',
        'catatan' => 'catatan', 'tindakan' => 'tindakan',
        'woId' => 'wo_id', 'woStatus' => 'wo_status', 'closingNote' => 'closing_note',
        'createdAt' => 'created_at', 'updatedAt' => 'updated_at',
    ];
    private const ITEM_FIELDS = ['paramId' => 'param_id', 'label' => 'label', 'unit' => 'unit',
        'section' => 'section', 'value' => 'value', 'status' => 'status', 'note' => 'note'];
    private const PARAM_NUMBERS = ['normalMin' => 'normal_min', 'normalMax' => 'normal_max',
        'warnMin' => 'warn_min', 'warnMax' => 'warn_max'];

    // ═══════════════════════════════════════════════════════
    // PULL
    // ═══════════════════════════════════════════════════════

    /**
     * Ambil perubahan sejak revisi $since. Sesi dikirim per halaman (cursor rev+id)
     * supaya respons tidak melewati batas ukuran Vercel (4.5MB).
     */
    public static function pull(int $since, string $cursorId = ''): array
    {
        $firstPage = $cursorId === '';
        if ($firstPage) {
            $where = 'rev > ?';
            $params = [$since];
        } else {
            $where = '(rev > ? OR (rev = ? AND id > ?))';
            $params = [$since, $since, $cursorId];
        }
        $pageIds = "SELECT id FROM sessions WHERE $where ORDER BY rev, id LIMIT " . self::PAGE_SIZE;

        $stmts = [
            'counters' => ['SELECT name, value FROM counters', []],
            'sessions' => ["SELECT * FROM sessions WHERE $where ORDER BY rev, id LIMIT " . self::PAGE_SIZE, $params],
            'items'    => ["SELECT * FROM session_items WHERE session_id IN ($pageIds) ORDER BY session_id, seq", $params],
        ];
        if ($firstPage) {
            $hier = "(SELECT value FROM counters WHERE name = 'hierarchy_rev') > ?";
            $pics = "(SELECT value FROM counters WHERE name = 'pics_rev') > ?";
            $stmts += [
                'units'      => ["SELECT * FROM units WHERE $hier ORDER BY seq, pk", [$since]],
                'areas'      => ["SELECT * FROM areas WHERE $hier ORDER BY seq, pk", [$since]],
                'equipments' => ["SELECT * FROM equipments WHERE $hier ORDER BY seq, pk", [$since]],
                'params'     => ["SELECT * FROM equipment_params WHERE $hier ORDER BY seq, pk", [$since]],
                'pics'       => ["SELECT name FROM pics WHERE $pics ORDER BY seq, name", [$since]],
                'workOrders' => ['SELECT data FROM work_orders WHERE rev > ? ORDER BY rev, id', [$since]],
                'deleted'    => ['SELECT id FROM deleted_sessions WHERE rev > ? AND ? > 0', [$since, $since]],
            ];
        }

        $keys = array_keys($stmts);
        $res = array_combine($keys, Db::queryMany(array_values($stmts)));
        $counters = array_column($res['counters'], 'value', 'name');

        $itemsBySession = [];
        foreach ($res['items'] as $row) {
            $itemsBySession[$row['session_id']][] = self::itemOut($row);
        }
        $sessions = [];
        foreach ($res['sessions'] as $row) {
            $sessions[] = self::sessionOut($row, $itemsBySession[$row['id']] ?? []);
        }
        $last = end($res['sessions']) ?: null;
        $more = count($res['sessions']) >= self::PAGE_SIZE;

        $out = [
            'rev'      => (int) ($counters['rev'] ?? 0),
            'sessions' => $sessions,
            'more'     => $more,
            'cursor'   => $more && $last ? ['rev' => (int) $last['rev'], 'id' => (string) $last['id']] : null,
        ];
        if ($firstPage) {
            if ((int) ($counters['hierarchy_rev'] ?? 0) > $since) {
                $out['hierarchy'] = self::hierarchyOut($res['units'], $res['areas'], $res['equipments'], $res['params']);
            }
            if ((int) ($counters['pics_rev'] ?? 0) > $since) {
                $out['picList'] = array_map(fn ($r) => (string) $r['name'], $res['pics']);
            }
            $out['workOrders'] = array_values(array_filter(array_map(
                fn ($r) => json_decode((string) $r['data'], true),
                $res['workOrders']
            ), 'is_array'));
            $out['deletedSessions'] = array_map(fn ($r) => (string) $r['id'], $res['deleted']);
        }
        return $out;
    }

    // ═══════════════════════════════════════════════════════
    // PUSH
    // ═══════════════════════════════════════════════════════

    /** Simpan perubahan dari client dalam satu transaksi atomik. */
    public static function push(array $in, array $user): array
    {
        $isCrew = $user['role'] === 'crew';
        $ignored = [];
        $stmts = [["UPDATE counters SET value = value + 1 WHERE name = 'rev'", []]];
        $now = gmdate('c');

        if (array_key_exists('hierarchy', $in)) {
            if ($isCrew) {
                $ignored[] = 'hierarchy';
            } else {
                array_push($stmts, ...self::hierarchyStatements($in['hierarchy']));
            }
        }
        if (array_key_exists('picList', $in)) {
            if ($isCrew) {
                $ignored[] = 'picList';
            } else {
                array_push($stmts, ...self::picStatements($in['picList']));
            }
        }

        $sessions = is_array($in['sessions'] ?? null) ? $in['sessions'] : [];
        if (count($sessions) > self::MAX_SESSIONS_PER_PUSH) {
            throw new HttpError('Terlalu banyak sesi dalam satu request (maks ' . self::MAX_SESSIONS_PER_PUSH . ')', 413);
        }
        foreach ($sessions as $s) {
            array_push($stmts, ...self::sessionStatements($s, $user));
        }

        $deleted = is_array($in['deletedSessions'] ?? null) ? $in['deletedSessions'] : [];
        if ($deleted && $isCrew) {
            $ignored[] = 'deletedSessions';
        } else {
            foreach ($deleted as $id) {
                $id = self::id($id, 'ID sesi');
                $stmts[] = ['DELETE FROM session_items WHERE session_id = ?', [$id]];
                $stmts[] = ['DELETE FROM sessions WHERE id = ?', [$id]];
                $stmts[] = ['INSERT OR REPLACE INTO deleted_sessions (id, rev, deleted_at) VALUES (?, ' . self::REV . ', ?)', [$id, $now]];
            }
        }

        foreach ((is_array($in['workOrders'] ?? null) ? $in['workOrders'] : []) as $wo) {
            $stmts[] = self::workOrderStatement($wo);
        }

        Db::transaction($stmts);
        return [
            'ignored' => $ignored,
            'saved'   => ['sessions' => count($sessions), 'deletedSessions' => $isCrew ? 0 : count($deleted)],
        ];
    }

    /** Nomor urut WO global (menggantikan counter localStorage per-perangkat). */
    public static function nextWorkOrderSeq(int $atLeast): int
    {
        $row = Db::query(
            "UPDATE counters SET value = MAX(value, ?) + 1 WHERE name = 'wo_seq' RETURNING value",
            [max(0, $atLeast)]
        )[0] ?? null;
        return (int) ($row['value'] ?? 0);
    }

    // ── Hierarki ─────────────────────────────────────────

    private static function hierarchyStatements(mixed $hierarchy): array
    {
        $units = is_array($hierarchy['units'] ?? null) ? $hierarchy['units'] : [];
        $unitRows = $areaRows = $equipRows = $paramRows = [];

        foreach (array_values($units) as $ui => $u) {
            $unitId = self::id($u['id'] ?? '', 'ID unit');
            $unitRows[] = [$unitId, self::str($u['name'] ?? ''), self::str($u['desc'] ?? ''), $ui];

            foreach (array_values(is_array($u['areas'] ?? null) ? $u['areas'] : []) as $ai => $a) {
                $areaId = self::id($a['id'] ?? '', 'ID area');
                $areaRows[] = [$unitId, $areaId, self::str($a['name'] ?? ''), $ai];

                // Data lama mungkin masih punya subAreas → equipment-nya diratakan ke area
                $equips = is_array($a['equipments'] ?? null) ? $a['equipments'] : [];
                foreach ((is_array($a['subAreas'] ?? null) ? $a['subAreas'] : []) as $sa) {
                    array_push($equips, ...(is_array($sa['equipments'] ?? null) ? $sa['equipments'] : []));
                }

                foreach (array_values($equips) as $ei => $e) {
                    $eqId = self::id($e['id'] ?? '', 'ID equipment');
                    $equipRows[] = [$unitId, $areaId, $eqId, self::str($e['name'] ?? ''), self::str($e['tag'] ?? ''),
                        self::str($e['type'] ?? ''), self::str($e['brand'] ?? ''), self::str($e['model'] ?? ''),
                        self::extra($e, ['id', 'name', 'tag', 'type', 'brand', 'model', 'params']), $ei];

                    foreach (array_values(is_array($e['params'] ?? null) ? $e['params'] : []) as $pi => $p) {
                        if (!is_array($p)) {
                            continue;
                        }
                        $paramRows[] = [$unitId, $areaId, $eqId, self::str($p['id'] ?? ''), self::str($p['label'] ?? ''),
                            self::str($p['unit'] ?? ''), self::str($p['section'] ?? ''), self::str($p['type'] ?? 'numeric'),
                            self::num($p['normalMin'] ?? null), self::num($p['normalMax'] ?? null),
                            self::num($p['warnMin'] ?? null), self::num($p['warnMax'] ?? null),
                            is_array($p['options'] ?? null) ? json_encode(array_values($p['options']), JSON_UNESCAPED_UNICODE) : null,
                            self::extra($p, ['id', 'label', 'unit', 'section', 'type', 'normalMin', 'normalMax', 'warnMin', 'warnMax', 'options']),
                            $pi];
                    }
                }
            }
        }

        return array_merge(
            [
                ['DELETE FROM equipment_params', []],
                ['DELETE FROM equipments', []],
                ['DELETE FROM areas', []],
                ['DELETE FROM units', []],
            ],
            Db::insertRows('units', ['id', 'name', 'description', 'seq'], $unitRows),
            Db::insertRows('areas', ['unit_id', 'id', 'name', 'seq'], $areaRows),
            Db::insertRows('equipments', ['unit_id', 'area_id', 'id', 'name', 'tag', 'type', 'brand', 'model', 'extra', 'seq'], $equipRows),
            Db::insertRows('equipment_params', ['unit_id', 'area_id', 'equip_id', 'id', 'label', 'unit', 'section', 'type',
                'normal_min', 'normal_max', 'warn_min', 'warn_max', 'options', 'extra', 'seq'], $paramRows, [], 30),
            [["UPDATE counters SET value = " . self::REV . " WHERE name = 'hierarchy_rev'", []]]
        );
    }

    private static function hierarchyOut(array $units, array $areas, array $equipments, array $params): array
    {
        $paramsByEq = [];
        foreach ($params as $p) {
            $param = [
                'id' => $p['id'], 'label' => $p['label'], 'unit' => $p['unit'],
                'section' => $p['section'], 'type' => $p['type'],
            ];
            foreach (self::PARAM_NUMBERS as $key => $col) {
                if ($p[$col] !== null) {
                    $param[$key] = $p[$col] + 0;
                }
            }
            if ($p['options'] !== null) {
                $param['options'] = json_decode((string) $p['options'], true) ?: [];
            }
            $paramsByEq[$p['unit_id'] . "\0" . $p['area_id'] . "\0" . $p['equip_id']][] = $param + self::extraOut($p['extra']);
        }

        $equipsByArea = [];
        foreach ($equipments as $e) {
            $eq = ['id' => $e['id'], 'name' => $e['name'], 'tag' => $e['tag'], 'type' => $e['type']];
            if ($e['brand'] !== '') {
                $eq['brand'] = $e['brand'];
            }
            if ($e['model'] !== '') {
                $eq['model'] = $e['model'];
            }
            $eq['params'] = $paramsByEq[$e['unit_id'] . "\0" . $e['area_id'] . "\0" . $e['id']] ?? [];
            $equipsByArea[$e['unit_id'] . "\0" . $e['area_id']][] = $eq + self::extraOut($e['extra']);
        }

        $areasByUnit = [];
        foreach ($areas as $a) {
            $areasByUnit[$a['unit_id']][] = [
                'id' => $a['id'], 'name' => $a['name'],
                'equipments' => $equipsByArea[$a['unit_id'] . "\0" . $a['id']] ?? [],
            ];
        }

        return ['units' => array_map(fn ($u) => [
            'id' => $u['id'], 'name' => $u['name'], 'desc' => $u['description'],
            'areas' => $areasByUnit[$u['id']] ?? [],
        ], $units)];
    }

    // ── PIC ──────────────────────────────────────────────

    private static function picStatements(mixed $list): array
    {
        $rows = [];
        $seen = [];
        foreach (array_values(is_array($list) ? $list : []) as $i => $name) {
            $name = trim((string) $name);
            if ($name === '' || isset($seen[$name])) {
                continue;
            }
            $seen[$name] = true;
            $rows[] = [$name, $i];
        }
        return array_merge(
            [['DELETE FROM pics', []]],
            Db::insertRows('pics', ['name', 'seq'], $rows),
            [["UPDATE counters SET value = " . self::REV . " WHERE name = 'pics_rev'", []]]
        );
    }

    // ── Sesi monitoring ──────────────────────────────────

    private static function sessionStatements(mixed $s, array $user): array
    {
        if (!is_array($s)) {
            throw new HttpError('Format sesi tidak valid');
        }
        $id = self::id($s['id'] ?? '', 'ID sesi');

        $cols = [];
        $vals = [];
        foreach (self::SESSION_FIELDS as $key => $col) {
            $cols[] = $col;
            $vals[] = $key === 'id' ? $id : self::str($s[$key] ?? '');
        }
        $cols[] = 'checklist';
        $vals[] = array_key_exists('checklist', $s) && $s['checklist'] !== null && $s['checklist'] !== ''
            ? (is_string($s['checklist']) ? $s['checklist'] : json_encode($s['checklist'], JSON_UNESCAPED_UNICODE))
            : null;
        $cols[] = 'extra';
        $vals[] = self::extra($s, array_merge(array_keys(self::SESSION_FIELDS), ['items', 'checklist', 'createdBy']));
        $cols[] = 'created_by';
        $vals[] = $user['username'];

        $updates = implode(', ', array_map(fn ($c) => "$c = excluded.$c", array_diff($cols, ['id', 'created_by'])));
        $stmts = [
            ['INSERT INTO sessions (' . implode(', ', $cols) . ', rev) VALUES (' . str_repeat('?, ', count($cols)) . self::REV . ')
              ON CONFLICT(id) DO UPDATE SET ' . $updates . ', rev = excluded.rev', $vals],
            ['DELETE FROM session_items WHERE session_id = ?', [$id]],
            ['DELETE FROM deleted_sessions WHERE id = ?', [$id]],
        ];

        $rows = [];
        foreach (array_values(is_array($s['items'] ?? null) ? $s['items'] : []) as $i => $item) {
            if (!is_array($item)) {
                continue;
            }
            $row = [$id, $i];
            foreach (self::ITEM_FIELDS as $key => $_) {
                $row[] = self::str($item[$key] ?? '');
            }
            $row[] = self::extra($item, array_keys(self::ITEM_FIELDS));
            $rows[] = $row;
        }
        return array_merge($stmts, Db::insertRows('session_items',
            array_merge(['session_id', 'seq'], array_values(self::ITEM_FIELDS), ['extra']), $rows));
    }

    private static function sessionOut(array $r, array $items): array
    {
        $s = [];
        foreach (self::SESSION_FIELDS as $key => $col) {
            if ($key === 'closingNote' && $r[$col] === '') {
                continue;
            }
            $s[$key] = (string) $r[$col];
        }
        $s['items'] = $items;
        if ($r['checklist'] !== null) {
            $decoded = json_decode((string) $r['checklist'], true);
            $s['checklist'] = is_array($decoded) ? $decoded : [];
        }
        if (($r['created_by'] ?? '') !== '') {
            $s['createdBy'] = (string) $r['created_by'];
        }
        return $s + self::extraOut($r['extra']);
    }

    private static function itemOut(array $r): array
    {
        $item = [];
        foreach (self::ITEM_FIELDS as $key => $col) {
            $item[$key] = (string) $r[$col];
        }
        return $item + self::extraOut($r['extra']);
    }

    // ── Work order ───────────────────────────────────────

    private static function workOrderStatement(mixed $wo): array
    {
        if (!is_array($wo)) {
            throw new HttpError('Format work order tidak valid');
        }
        $id = self::id($wo['id'] ?? '', 'ID work order');
        return [
            'INSERT INTO work_orders (id, sess_id, status, data, created_at, updated_at, rev)
             VALUES (?, ?, ?, ?, ?, ?, ' . self::REV . ')
             ON CONFLICT(id) DO UPDATE SET sess_id = excluded.sess_id, status = excluded.status,
               data = excluded.data, updated_at = excluded.updated_at, rev = excluded.rev',
            [$id, self::str($wo['sessId'] ?? ''), self::str($wo['status'] ?? ''),
             json_encode($wo, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
             self::str($wo['createdAt'] ?? gmdate('c')), gmdate('c')],
        ];
    }

    // ── Helper ───────────────────────────────────────────

    private static function id(mixed $value, string $label): string
    {
        $id = is_scalar($value) ? trim((string) $value) : '';
        if ($id === '' || strlen($id) > 120) {
            throw new HttpError("$label tidak valid");
        }
        return $id;
    }

    private static function str(mixed $value): string
    {
        if ($value === null || is_array($value)) {
            return '';
        }
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        return (string) $value;
    }

    private static function num(mixed $value): ?float
    {
        if ($value === null || $value === '' || is_array($value) || !is_numeric($value)) {
            return null;
        }
        return (float) $value;
    }

    /** Simpan field tambahan yang tidak punya kolom sendiri (agar tidak hilang saat round-trip). */
    private static function extra(array $obj, array $known): ?string
    {
        $extra = [];
        foreach ($obj as $k => $v) {
            if (!in_array($k, $known, true) && !str_starts_with((string) $k, '_')) {
                $extra[$k] = $v;
            }
        }
        return $extra ? json_encode($extra, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) : null;
    }

    private static function extraOut(mixed $json): array
    {
        if ($json === null || $json === '') {
            return [];
        }
        $decoded = json_decode((string) $json, true);
        return is_array($decoded) ? $decoded : [];
    }
}
