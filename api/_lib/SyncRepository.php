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
    // Urutan sama dengan objek WO yang dibuat frontend (submitWOFromFinding)
    private const WO_FIELDS = [
        'title' => ['title', 'str'], 'type' => ['type', 'str'], 'status' => ['status', 'str'],
        'priority' => ['priority', 'str'], 'equipId' => ['equip_id', 'str'],
        'techId' => ['tech_id', 'str'], 'techName' => ['tech_name', 'str'],
        'unitId' => ['unit_id', 'str'], 'areaId' => ['area_id', 'str'],
        'requestorName' => ['requestor_name', 'str'], 'requestorDept' => ['requestor_dept', 'str'],
        'createdBy' => ['created_by', 'str'], 'createdAt' => ['created_at', 'str'],
        'dueDate' => ['due_date', 'str'], 'estHours' => ['est_hours', 'real'],
        'actualHours' => ['actual_hours', 'str'], 'startTime' => ['start_time', 'str'],
        'endTime' => ['end_time', 'str'], 'notes' => ['notes', 'str'], 'closingNote' => ['closing_note', 'str'],
        'checklistDone' => ['checklist_done', 'int'], 'checklistTotal' => ['checklist_total', 'int'],
        'partsUsed' => ['parts_used', 'str'], 'partsCount' => ['parts_count', 'int'],
        'attachments' => ['attachments', 'str'], 'sessId' => ['sess_id', 'str'],
    ];
    private const WO_ITEM_FIELDS = ['id' => 'id', 'parameter' => 'parameter', 'value' => 'value', 'unit' => 'unit',
        'findStatus' => 'find_status', 'closeStatus' => 'close_status', 'closedBy' => 'closed_by',
        'closedAt' => 'closed_at', 'tindakan' => 'tindakan', 'catatan' => 'catatan'];
    private const PARAM_NUMBERS =['normalMin' => 'normal_min', 'normalMax' => 'normal_max',
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
                'workOrders' => ['SELECT * FROM work_orders WHERE rev > ? ORDER BY rev, id', [$since]],
                'woItems'    => ['SELECT * FROM work_order_items WHERE wo_id IN (SELECT id FROM work_orders WHERE rev > ?) ORDER BY wo_id, seq', [$since]],
                'woLogs'     => ['SELECT * FROM work_order_logs WHERE wo_id IN (SELECT id FROM work_orders WHERE rev > ?) ORDER BY wo_id, seq', [$since]],
                'deleted'    => ['SELECT id FROM deleted_sessions WHERE rev > ? AND ? > 0', [$since, $since]],
                'rca'        => ['SELECT * FROM rca_reports WHERE rev > ? ORDER BY rev, id', [$since]],
                'rcaItems'   => ['SELECT * FROM rca_findings WHERE rca_id IN (SELECT id FROM rca_reports WHERE rev > ?) ORDER BY rca_id, seq', [$since]],
                'repairs'    => ['SELECT * FROM repairs WHERE rev > ? ORDER BY rev, id', [$since]],
                'repairItems'=> ['SELECT * FROM repair_findings WHERE repair_id IN (SELECT id FROM repairs WHERE rev > ?) ORDER BY repair_id, seq', [$since]],
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
            $woItems = $woLogs = [];
            foreach ($res['woItems'] as $r) {
                $woItems[$r['wo_id']][] = self::workOrderItemOut($r);
            }
            foreach ($res['woLogs'] as $r) {
                $woLogs[$r['wo_id']][] = ['ts' => (string) $r['ts'], 'by' => (string) $r['by_user'], 'msg' => (string) $r['msg']];
            }
            $out['workOrders'] = array_map(
                fn ($r) => self::workOrderOut($r, $woItems[$r['id']] ?? [], $woLogs[$r['id']] ?? []),
                $res['workOrders']
            );
            $out['deletedSessions'] = array_map(fn ($r) => (string) $r['id'], $res['deleted']);
            $rcaItems = [];
            foreach ($res['rcaItems'] as $r) {
                $rcaItems[$r['rca_id']][] = self::rcaFindingOut($r);
            }
            $out['rcaReports'] = array_map(fn ($r) => self::rcaOut($r, $rcaItems[$r['id']] ?? []), $res['rca']);
            $repItems = [];
            foreach ($res['repairItems'] as $r) {
                $repItems[$r['repair_id']][] = self::rcaFindingOut($r);
            }
            $out['repairs'] = array_map(fn ($r) => self::repairOut($r, $repItems[$r['id']] ?? []), $res['repairs']);
        }
        return $out;
    }

    // ═══════════════════════════════════════════════════════
    // PUSH
    // ═══════════════════════════════════════════════════════

    /**
     * Simpan perubahan dari client dalam satu transaksi atomik.
     * $notify=false dipakai import data lama agar tidak membanjiri notifikasi.
     */
    public static function push(array $in, array $user, bool $notify = true): array
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
            array_push($stmts, ...self::workOrderStatements($wo));
        }

        // Laporan perbaikan — semua role (termasuk crew)
        $repairList = array_values(array_filter(is_array($in['repairs'] ?? null) ? $in['repairs'] : [], 'is_array'));
        foreach ($repairList as $rep) {
            array_push($stmts, ...self::repairStatements($rep, $user));
        }

        // RCA / penutupan finding — hanya leader ke atas
        $rcaList = is_array($in['rcaReports'] ?? null) ? $in['rcaReports'] : [];
        if ($rcaList && $isCrew) {
            $ignored[] = 'rcaReports';
        } else {
            foreach ($rcaList as $rca) {
                array_push($stmts, ...self::rcaStatements($rca, $user));
            }
        }

        // Notifikasi temuan baru (in-app ikut transaksi; WhatsApp dikirim setelah commit)
        $plan = $notify ? NotificationService::plan($sessions, $user) : ['statements' => [], 'wa' => []];
        array_push($stmts, ...$plan['statements']);
        $repairPlan = $notify ? NotificationService::planRepairs($repairList, $user) : ['statements' => [], 'wa' => []];
        array_push($stmts, ...$repairPlan['statements']);

        Db::transaction($stmts);
        NotificationService::sendWhatsAppBatch(array_merge($plan['wa'], $repairPlan['wa']));
        return [
            'ignored' => $ignored,
            'notified' => count($plan['statements']),
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
            // Nilai berbentuk tanggal / angka kepanjangan tidak boleh masuk database
            [$value, $guardNote] = ValueGuard::sanitize(self::str($item['value'] ?? ''));
            if ($guardNote !== null) {
                $item['note'] = trim(self::str($item['note'] ?? '') . ' ' . $guardNote);
                if ($value === '') {
                    $item['status'] = '';
                }
            }
            $item['value'] = $value;
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

    /**
     * Simpan WO ke work_orders + work_order_items (checklist) + work_order_logs (notesLog).
     * Statement memakai counters.rev saat ini, jadi pemanggil harus sudah menaikkan rev.
     */
    public static function workOrderStatements(mixed $wo): array
    {
        if (!is_array($wo)) {
            throw new HttpError('Format work order tidak valid');
        }
        $id = self::id($wo['id'] ?? '', 'ID work order');

        $cols = ['id'];
        $vals = [$id];
        $extra = [];
        foreach (self::WO_FIELDS as $key => [$col, $type]) {
            $v = $wo[$key] ?? null;
            if ($v !== null && !is_scalar($v)) {
                $extra[$key] = $v; // nilai non-teks (mis. array) disimpan utuh di kolom extra
                $v = null;
            }
            $cols[] = $col;
            $vals[] = match ($type) {
                'int'  => (int) ($v ?? 0),
                'real' => self::num($v),
                default => self::str($v ?? ''),
            };
        }
        foreach ($wo as $k => $v) {
            if (!array_key_exists($k, self::WO_FIELDS) && !in_array($k, ['id', 'checklist', 'notesLog'], true)
                && !str_starts_with((string) $k, '_')) {
                $extra[$k] = $v;
            }
        }
        array_push($cols, 'extra', 'updated_at');
        array_push($vals, $extra ? json_encode($extra, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) : null, gmdate('c'));

        $updates = implode(', ', array_map(fn ($c) => "$c = excluded.$c", array_diff($cols, ['id'])));
        $stmts = [
            ['INSERT INTO work_orders (' . implode(', ', $cols) . ', rev) VALUES (' . str_repeat('?, ', count($cols)) . self::REV . ')
              ON CONFLICT(id) DO UPDATE SET ' . $updates . ', rev = excluded.rev', $vals],
            ['DELETE FROM work_order_items WHERE wo_id = ?', [$id]],
            ['DELETE FROM work_order_logs WHERE wo_id = ?', [$id]],
        ];

        // Checklist: array, atau string JSON (format yang dikirim ke MaintWare)
        $checklist = $wo['checklist'] ?? [];
        if (is_string($checklist)) {
            $checklist = json_decode($checklist, true);
        }
        $itemRows = [];
        foreach (array_values(is_array($checklist) ? $checklist : []) as $i => $item) {
            if (!is_array($item)) {
                continue;
            }
            $row = [$id, $i];
            foreach (self::WO_ITEM_FIELDS as $key => $_) {
                $row[] = self::str($item[$key] ?? ($key === 'closeStatus' ? 'Open' : ''));
            }
            $row[] = self::extra($item, array_merge(array_keys(self::WO_ITEM_FIELDS), ['seq']));
            $itemRows[] = $row;
        }

        // notesLog disimpan frontend sebagai string JSON berisi [{ts, by, msg}]
        $log = $wo['notesLog'] ?? [];
        if (is_string($log)) {
            $log = json_decode($log, true);
        }
        $logRows = [];
        foreach (array_values(is_array($log) ? $log : []) as $i => $entry) {
            if (is_array($entry)) {
                $logRows[] = [$id, $i, self::str($entry['ts'] ?? ''), self::str($entry['by'] ?? ''), self::str($entry['msg'] ?? '')];
            }
        }

        return array_merge(
            $stmts,
            Db::insertRows('work_order_items', array_merge(['wo_id', 'seq'], array_values(self::WO_ITEM_FIELDS), ['extra']), $itemRows),
            Db::insertRows('work_order_logs', ['wo_id', 'seq', 'ts', 'by_user', 'msg'], $logRows)
        );
    }

    private static function workOrderOut(array $r, array $items, array $logs): array
    {
        $wo = ['id' => (string) $r['id']];
        foreach (self::WO_FIELDS as $key => [$col, $type]) {
            $wo[$key] = match ($type) {
                'int'  => (int) $r[$col],
                'real' => $r[$col] === null ? '' : $r[$col] + 0,
                default => (string) $r[$col],
            };
            if ($key === 'checklistTotal') {
                $wo['checklist'] = $items;
            } elseif ($key === 'partsCount') {
                $wo['notesLog'] = json_encode($logs, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            }
        }
        return array_merge($wo, self::extraOut($r['extra']));
    }

    private static function workOrderItemOut(array $r): array
    {
        $item = ['id' => (string) $r['id'], 'seq' => (int) $r['seq'] + 1];
        foreach (self::WO_ITEM_FIELDS as $key => $col) {
            $item[$key] = (string) $r[$col];
        }
        return $item + self::extraOut($r['extra']);
    }

    // ── Laporan perbaikan (crew) ─────────────────────────

    public const REPAIR_RESULTS = ['Selesai', 'Sementara', 'Butuh bantuan'];
    private const REPAIR_FIELDS = [
        'sessId' => 'session_id', 'unitId' => 'unit_id', 'unitName' => 'unit_name',
        'areaId' => 'area_id', 'areaName' => 'area_name', 'equipId' => 'equip_id', 'equipName' => 'equip_name',
        'action' => 'action', 'cause' => 'cause', 'parts' => 'parts', 'result' => 'result', 'note' => 'note',
        'repairedBy' => 'repaired_by', 'repairedByName' => 'repaired_by_name', 'repairedAt' => 'repaired_at',
    ];

    private static function repairStatements(array $rep, array $user): array
    {
        $id = self::id($rep['id'] ?? '', 'ID perbaikan');
        $findings = array_values(array_filter(is_array($rep['findings'] ?? null) ? $rep['findings'] : [], 'is_array'));
        if (!$findings) {
            throw new HttpError("Laporan perbaikan $id belum memilih finding");
        }
        if (trim((string) ($rep['action'] ?? '')) === '') {
            throw new HttpError("Laporan perbaikan $id: tindakan perbaikan wajib diisi");
        }
        if (!in_array($rep['result'] ?? '', self::REPAIR_RESULTS, true)) {
            throw new HttpError("Laporan perbaikan $id: hasil perbaikan tidak valid");
        }

        $cols = ['id'];
        $vals = [$id];
        foreach (self::REPAIR_FIELDS as $key => $col) {
            $cols[] = $col;
            $vals[] = self::str($rep[$key] ?? '');
        }
        array_push($cols, 'extra', 'updated_at');
        array_push($vals, self::extra($rep, array_merge(array_keys(self::REPAIR_FIELDS), ['id', 'findings', 'updatedAt'])), gmdate('c'));

        $updates = implode(', ', array_map(fn ($c) => "$c = excluded.$c", array_diff($cols, ['id', 'repaired_by', 'repaired_by_name', 'repaired_at'])));
        $stmts = [
            ['INSERT INTO repairs (' . implode(', ', $cols) . ', rev) VALUES (' . str_repeat('?, ', count($cols)) . self::REV . ')
              ON CONFLICT(id) DO UPDATE SET ' . $updates . ', rev = excluded.rev', $vals],
            ['DELETE FROM repair_findings WHERE repair_id = ?', [$id]],
        ];
        $rows = [];
        foreach ($findings as $i => $f) {
            $row = [$id, $i];
            foreach (self::RCA_FINDING_FIELDS as $key => $_) {
                $row[] = $key === 'findingId' ? self::id($f['findingId'] ?? '', 'ID finding') : self::str($f[$key] ?? '');
            }
            $rows[] = $row;
        }
        return array_merge($stmts, Db::insertRows('repair_findings',
            array_merge(['repair_id', 'seq'], array_values(self::RCA_FINDING_FIELDS)), $rows));
    }

    private static function repairOut(array $r, array $findings): array
    {
        $rep = ['id' => (string) $r['id']];
        foreach (self::REPAIR_FIELDS as $key => $col) {
            $rep[$key] = (string) $r[$col];
        }
        $rep['findings'] = $findings;
        $rep['updatedAt'] = (string) $r['updated_at'];
        return $rep + self::extraOut($r['extra']);
    }

    // ── RCA (penutupan finding) ──────────────────────────

    private const RCA_FIELDS = [
        'sessId' => 'session_id', 'unitId' => 'unit_id', 'unitName' => 'unit_name',
        'areaId' => 'area_id', 'areaName' => 'area_name', 'equipId' => 'equip_id', 'equipName' => 'equip_name',
        'problem' => 'problem', 'category' => 'category', 'rootCause' => 'root_cause',
        'correctiveAction' => 'corrective_action', 'preventiveAction' => 'preventive_action',
        'actionPic' => 'action_pic', 'targetDate' => 'target_date', 'verification' => 'verification',
        'status' => 'status', 'createdBy' => 'created_by', 'createdAt' => 'created_at',
        'closedBy' => 'closed_by', 'closedAt' => 'closed_at',
    ];
    private const RCA_FINDING_FIELDS = ['findingId' => 'finding_id', 'sessId' => 'session_id', 'paramId' => 'param_id',
        'parameter' => 'parameter', 'value' => 'value', 'unit' => 'unit', 'status' => 'find_status'];
    public const RCA_CATEGORIES = ['Man', 'Machine', 'Method', 'Material', 'Measurement', 'Environment'];

    private static function rcaStatements(mixed $rca, array $user): array
    {
        if (!is_array($rca)) {
            throw new HttpError('Format RCA tidak valid');
        }
        $id = self::id($rca['id'] ?? '', 'ID RCA');
        $status = ($rca['status'] ?? 'Open') === 'Closed' ? 'Closed' : 'Open';
        $whys = array_values(is_array($rca['whys'] ?? null) ? $rca['whys'] : []);
        $findings = array_values(array_filter(is_array($rca['findings'] ?? null) ? $rca['findings'] : [], 'is_array'));

        if (!$findings) {
            throw new HttpError("RCA $id belum memilih finding yang ditutup");
        }
        if ($status === 'Closed' && (trim((string) ($rca['rootCause'] ?? '')) === '' || trim((string) ($rca['correctiveAction'] ?? '')) === '')) {
            throw new HttpError("RCA $id: akar masalah dan tindakan korektif wajib diisi untuk menutup finding");
        }
        if (($rca['category'] ?? '') !== '' && !in_array($rca['category'], self::RCA_CATEGORIES, true)) {
            throw new HttpError("RCA $id: kategori akar masalah tidak valid");
        }

        $cols = ['id'];
        $vals = [$id];
        foreach (self::RCA_FIELDS as $key => $col) {
            $cols[] = $col;
            $vals[] = $key === 'status' ? $status : self::str($rca[$key] ?? '');
        }
        for ($i = 0; $i < 5; $i++) {
            $cols[] = 'why' . ($i + 1);
            $vals[] = self::str($whys[$i] ?? '');
        }
        array_push($cols, 'extra', 'updated_at');
        array_push($vals, self::extra($rca, array_merge(array_keys(self::RCA_FIELDS), ['id', 'whys', 'findings', 'updatedAt'])), gmdate('c'));

        $updates = implode(', ', array_map(fn ($c) => "$c = excluded.$c", array_diff($cols, ['id', 'created_by', 'created_at'])));
        $stmts = [
            ['INSERT INTO rca_reports (' . implode(', ', $cols) . ', rev) VALUES (' . str_repeat('?, ', count($cols)) . self::REV . ')
              ON CONFLICT(id) DO UPDATE SET ' . $updates . ', rev = excluded.rev', $vals],
            ['DELETE FROM rca_findings WHERE rca_id = ?', [$id]],
        ];
        $rows = [];
        foreach ($findings as $i => $f) {
            $fid = self::id($f['findingId'] ?? '', 'ID finding');
            $row = [$id, $i];
            foreach (self::RCA_FINDING_FIELDS as $key => $_) {
                $row[] = $key === 'findingId' ? $fid : self::str($f[$key] ?? '');
            }
            $rows[] = $row;
        }
        return array_merge($stmts, Db::insertRows('rca_findings',
            array_merge(['rca_id', 'seq'], array_values(self::RCA_FINDING_FIELDS)), $rows));
    }

    private static function rcaOut(array $r, array $findings): array
    {
        $rca = ['id' => (string) $r['id']];
        foreach (self::RCA_FIELDS as $key => $col) {
            $rca[$key] = (string) $r[$col];
        }
        $rca['whys'] = [(string) $r['why1'], (string) $r['why2'], (string) $r['why3'], (string) $r['why4'], (string) $r['why5']];
        $rca['findings'] = $findings;
        $rca['updatedAt'] = (string) $r['updated_at'];
        return $rca + self::extraOut($r['extra']);
    }

    private static function rcaFindingOut(array $r): array
    {
        $f = [];
        foreach (self::RCA_FINDING_FIELDS as $key => $col) {
            $f[$key] = (string) $r[$col];
        }
        return $f;
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
