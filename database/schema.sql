-- ═══════════════════════════════════════════════════════════════
-- Prasad Seeds — Monitoring System v5 · Skema database (versi 6)
-- Kompatibel dengan SQLite (XAMPP) dan Turso / libSQL (Vercel). BUKAN untuk MySQL/phpMyAdmin.
-- Di-generate dari api/_lib/Schema.php:  php scripts/dump-schema.php
--
-- Cara pakai:
--   SQLite : sqlite3 database/dailymonitoring.db < database/schema.sql
--            (atau DB Browser for SQLite → Execute SQL)
--   Turso  : turso db shell <nama-db> < database/schema.sql
--   Paling mudah: php scripts/migrate.php (otomatis membuat tabel + admin)
--
-- Akun default:  username admin  /  password admin123
--   Dibuat HANYA jika tabel users masih kosong. Setelah login, buat admin sendiri di
--   User Management lalu hapus akun default ini (tidak akan dibuat ulang).
--
-- Tabel:
--   users, auth_tokens                      akun & token login
--   units, areas, equipments,
--   equipment_params                        hierarki Unit → Area → Equipment → Parameter
--   sessions, session_items                 sesi monitoring & nilai tiap parameter
--   deleted_sessions                        catatan sesi yang dihapus (untuk sinkronisasi)
--   pics                                    daftar PIC / teknisi
--   work_orders, work_order_items,
--   work_order_logs                         work order, checklist temuan, riwayat catatan
--   counters, app_meta                      nomor revisi, nomor urut WO, versi skema
--   v_findings (view)                       temuan WARNING/ALERT siap dibaca
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS counters (
  name  TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS users (
  username      TEXT PRIMARY KEY,
  name          TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'crew',
  password_hash TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  unit_id       TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  notify_app    INTEGER NOT NULL DEFAULT 1,
  notify_wa     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  token_hash TEXT PRIMARY KEY,
  username   TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(username);

CREATE TABLE IF NOT EXISTS user_reports (
  username TEXT NOT NULL,
  manager  TEXT NOT NULL,
  seq      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (username, manager)
);

CREATE INDEX IF NOT EXISTS idx_user_reports_manager ON user_reports(manager);

CREATE TABLE IF NOT EXISTS units (
  pk          INTEGER PRIMARY KEY,
  id          TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  seq         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS areas (
  pk      INTEGER PRIMARY KEY,
  unit_id TEXT NOT NULL,
  id      TEXT NOT NULL,
  name    TEXT NOT NULL DEFAULT '',
  seq     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS equipments (
  pk      INTEGER PRIMARY KEY,
  unit_id TEXT NOT NULL,
  area_id TEXT NOT NULL,
  id      TEXT NOT NULL,
  name    TEXT NOT NULL DEFAULT '',
  tag     TEXT NOT NULL DEFAULT '',
  type    TEXT NOT NULL DEFAULT '',
  brand   TEXT NOT NULL DEFAULT '',
  model   TEXT NOT NULL DEFAULT '',
  extra   TEXT,
  seq     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS equipment_params (
  pk         INTEGER PRIMARY KEY,
  unit_id    TEXT NOT NULL,
  area_id    TEXT NOT NULL,
  equip_id   TEXT NOT NULL,
  id         TEXT NOT NULL,
  label      TEXT NOT NULL DEFAULT '',
  unit       TEXT NOT NULL DEFAULT '',
  section    TEXT NOT NULL DEFAULT '',
  type       TEXT NOT NULL DEFAULT 'numeric',
  normal_min REAL,
  normal_max REAL,
  warn_min   REAL,
  warn_max   REAL,
  options    TEXT,
  extra      TEXT,
  seq        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_params_equip ON equipment_params(unit_id, area_id, equip_id);

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  tanggal       TEXT NOT NULL DEFAULT '',
  unit_id       TEXT NOT NULL DEFAULT '',
  unit_name     TEXT NOT NULL DEFAULT '',
  area_id       TEXT NOT NULL DEFAULT '',
  area_name     TEXT NOT NULL DEFAULT '',
  sub_area_id   TEXT NOT NULL DEFAULT '',
  sub_area_name TEXT NOT NULL DEFAULT '',
  equip_id      TEXT NOT NULL DEFAULT '',
  equip_name    TEXT NOT NULL DEFAULT '',
  pic           TEXT NOT NULL DEFAULT '',
  start_time    TEXT NOT NULL DEFAULT '',
  end_time      TEXT NOT NULL DEFAULT '',
  catatan       TEXT NOT NULL DEFAULT '',
  tindakan      TEXT NOT NULL DEFAULT '',
  wo_id         TEXT NOT NULL DEFAULT '',
  wo_status     TEXT NOT NULL DEFAULT '',
  checklist     TEXT,
  closing_note  TEXT NOT NULL DEFAULT '',
  extra         TEXT,
  created_by    TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT '',
  updated_at    TEXT NOT NULL DEFAULT '',
  rev           INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sessions_rev ON sessions(rev, id);

CREATE INDEX IF NOT EXISTS idx_sessions_tanggal ON sessions(tanggal);

CREATE INDEX IF NOT EXISTS idx_sessions_equip ON sessions(unit_id, area_id, equip_id);

CREATE TABLE IF NOT EXISTS session_items (
  session_id TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  param_id   TEXT NOT NULL DEFAULT '',
  label      TEXT NOT NULL DEFAULT '',
  unit       TEXT NOT NULL DEFAULT '',
  section    TEXT NOT NULL DEFAULT '',
  value      TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT '',
  note       TEXT NOT NULL DEFAULT '',
  extra      TEXT,
  PRIMARY KEY (session_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_items_status ON session_items(status);

CREATE TABLE IF NOT EXISTS deleted_sessions (
  id         TEXT PRIMARY KEY,
  rev        INTEGER NOT NULL,
  deleted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deleted_sessions_rev ON deleted_sessions(rev);

CREATE TABLE IF NOT EXISTS pics (
  name TEXT PRIMARY KEY,
  seq  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS work_orders (
  id             TEXT PRIMARY KEY,
  sess_id        TEXT NOT NULL DEFAULT '',
  title          TEXT NOT NULL DEFAULT '',
  type           TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT '',
  priority       TEXT NOT NULL DEFAULT '',
  unit_id        TEXT NOT NULL DEFAULT '',
  area_id        TEXT NOT NULL DEFAULT '',
  equip_id       TEXT NOT NULL DEFAULT '',
  tech_id        TEXT NOT NULL DEFAULT '',
  tech_name      TEXT NOT NULL DEFAULT '',
  requestor_name TEXT NOT NULL DEFAULT '',
  requestor_dept TEXT NOT NULL DEFAULT '',
  created_by     TEXT NOT NULL DEFAULT '',
  due_date       TEXT NOT NULL DEFAULT '',
  est_hours      REAL,
  actual_hours   TEXT NOT NULL DEFAULT '',
  start_time     TEXT NOT NULL DEFAULT '',
  end_time       TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',
  closing_note   TEXT NOT NULL DEFAULT '',
  checklist_done  INTEGER NOT NULL DEFAULT 0,
  checklist_total INTEGER NOT NULL DEFAULT 0,
  parts_used     TEXT NOT NULL DEFAULT '',
  parts_count    INTEGER NOT NULL DEFAULT 0,
  attachments    TEXT NOT NULL DEFAULT '',
  extra          TEXT,
  created_at     TEXT NOT NULL DEFAULT '',
  updated_at     TEXT NOT NULL DEFAULT '',
  rev            INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_work_orders_rev ON work_orders(rev);

CREATE INDEX IF NOT EXISTS idx_work_orders_sess ON work_orders(sess_id);

CREATE TABLE IF NOT EXISTS work_order_items (
  wo_id        TEXT NOT NULL,
  seq          INTEGER NOT NULL,
  id           TEXT NOT NULL DEFAULT '',
  parameter    TEXT NOT NULL DEFAULT '',
  value        TEXT NOT NULL DEFAULT '',
  unit         TEXT NOT NULL DEFAULT '',
  find_status  TEXT NOT NULL DEFAULT '',
  close_status TEXT NOT NULL DEFAULT 'Open',
  closed_by    TEXT NOT NULL DEFAULT '',
  closed_at    TEXT NOT NULL DEFAULT '',
  tindakan     TEXT NOT NULL DEFAULT '',
  catatan      TEXT NOT NULL DEFAULT '',
  extra        TEXT,
  PRIMARY KEY (wo_id, seq)
);

CREATE TABLE IF NOT EXISTS work_order_logs (
  wo_id   TEXT NOT NULL,
  seq     INTEGER NOT NULL,
  ts      TEXT NOT NULL DEFAULT '',
  by_user TEXT NOT NULL DEFAULT '',
  msg     TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (wo_id, seq)
);

CREATE TABLE IF NOT EXISTS rca_reports (
  id                TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL DEFAULT '',
  unit_id           TEXT NOT NULL DEFAULT '',
  unit_name         TEXT NOT NULL DEFAULT '',
  area_id           TEXT NOT NULL DEFAULT '',
  area_name         TEXT NOT NULL DEFAULT '',
  equip_id          TEXT NOT NULL DEFAULT '',
  equip_name        TEXT NOT NULL DEFAULT '',
  problem           TEXT NOT NULL DEFAULT '',
  category          TEXT NOT NULL DEFAULT '',
  why1              TEXT NOT NULL DEFAULT '',
  why2              TEXT NOT NULL DEFAULT '',
  why3              TEXT NOT NULL DEFAULT '',
  why4              TEXT NOT NULL DEFAULT '',
  why5              TEXT NOT NULL DEFAULT '',
  root_cause        TEXT NOT NULL DEFAULT '',
  corrective_action TEXT NOT NULL DEFAULT '',
  preventive_action TEXT NOT NULL DEFAULT '',
  action_pic        TEXT NOT NULL DEFAULT '',
  target_date       TEXT NOT NULL DEFAULT '',
  verification      TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'Open',
  created_by        TEXT NOT NULL DEFAULT '',
  created_at        TEXT NOT NULL DEFAULT '',
  closed_by         TEXT NOT NULL DEFAULT '',
  closed_at         TEXT NOT NULL DEFAULT '',
  updated_at        TEXT NOT NULL DEFAULT '',
  extra             TEXT,
  rev               INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_rca_reports_rev ON rca_reports(rev);

CREATE INDEX IF NOT EXISTS idx_rca_reports_session ON rca_reports(session_id);

CREATE TABLE IF NOT EXISTS rca_findings (
  rca_id      TEXT NOT NULL,
  finding_id  TEXT NOT NULL,
  seq         INTEGER NOT NULL DEFAULT 0,
  session_id  TEXT NOT NULL DEFAULT '',
  param_id    TEXT NOT NULL DEFAULT '',
  parameter   TEXT NOT NULL DEFAULT '',
  value       TEXT NOT NULL DEFAULT '',
  unit        TEXT NOT NULL DEFAULT '',
  find_status TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (rca_id, finding_id)
);

CREATE INDEX IF NOT EXISTS idx_rca_findings_finding ON rca_findings(finding_id);

CREATE TABLE IF NOT EXISTS repairs (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL DEFAULT '',
  unit_id      TEXT NOT NULL DEFAULT '',
  unit_name    TEXT NOT NULL DEFAULT '',
  area_id      TEXT NOT NULL DEFAULT '',
  area_name    TEXT NOT NULL DEFAULT '',
  equip_id     TEXT NOT NULL DEFAULT '',
  equip_name   TEXT NOT NULL DEFAULT '',
  action       TEXT NOT NULL DEFAULT '',
  cause        TEXT NOT NULL DEFAULT '',
  parts        TEXT NOT NULL DEFAULT '',
  result       TEXT NOT NULL DEFAULT 'Selesai',
  note         TEXT NOT NULL DEFAULT '',
  repaired_by  TEXT NOT NULL DEFAULT '',
  repaired_by_name TEXT NOT NULL DEFAULT '',
  repaired_at  TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL DEFAULT '',
  extra        TEXT,
  rev          INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_repairs_rev ON repairs(rev);

CREATE INDEX IF NOT EXISTS idx_repairs_session ON repairs(session_id);

CREATE TABLE IF NOT EXISTS repair_findings (
  repair_id   TEXT NOT NULL,
  finding_id  TEXT NOT NULL,
  seq         INTEGER NOT NULL DEFAULT 0,
  session_id  TEXT NOT NULL DEFAULT '',
  param_id    TEXT NOT NULL DEFAULT '',
  parameter   TEXT NOT NULL DEFAULT '',
  value       TEXT NOT NULL DEFAULT '',
  unit        TEXT NOT NULL DEFAULT '',
  find_status TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (repair_id, finding_id)
);

CREATE INDEX IF NOT EXISTS idx_repair_findings_finding ON repair_findings(finding_id);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT NOT NULL,
  severity   TEXT NOT NULL DEFAULT 'WARNING',
  title      TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  session_id TEXT NOT NULL DEFAULT '',
  unit_id    TEXT NOT NULL DEFAULT '',
  actor      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  read_at    TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(username, id);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS wa_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT NOT NULL DEFAULT '',
  phone      TEXT NOT NULL DEFAULT '',
  message    TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT '',
  response   TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT ''
);

DROP VIEW IF EXISTS v_findings;

CREATE VIEW v_findings AS
  SELECT s.id AS session_id, s.tanggal, s.unit_name, s.area_name, s.equip_id, s.equip_name,
         i.param_id, i.label AS parameter, i.value, i.unit, i.status, i.note,
         s.wo_id, s.wo_status,
         (SELECT r.id FROM rca_findings f JOIN rca_reports r ON r.id = f.rca_id
           WHERE f.finding_id = s.id || '_' || i.param_id ORDER BY r.status = 'Closed' DESC LIMIT 1) AS rca_id,
         (SELECT r.status FROM rca_findings f JOIN rca_reports r ON r.id = f.rca_id
           WHERE f.finding_id = s.id || '_' || i.param_id ORDER BY r.status = 'Closed' DESC LIMIT 1) AS rca_status,
         (SELECT r.result FROM repair_findings f JOIN repairs r ON r.id = f.repair_id
           WHERE f.finding_id = s.id || '_' || i.param_id ORDER BY r.repaired_at DESC LIMIT 1) AS repair_result,
         (SELECT r.repaired_by_name FROM repair_findings f JOIN repairs r ON r.id = f.repair_id
           WHERE f.finding_id = s.id || '_' || i.param_id ORDER BY r.repaired_at DESC LIMIT 1) AS repaired_by
    FROM session_items i JOIN sessions s ON s.id = i.session_id
   WHERE i.status IN ('WARNING', 'ALERT');

INSERT OR IGNORE INTO counters (name, value) VALUES
  ('rev', 0), ('hierarchy_rev', 0), ('pics_rev', 0), ('wo_seq', 0);

INSERT OR IGNORE INTO app_meta (key, value) VALUES ('schema_version', '6');

INSERT INTO users (username, name, role, password_hash, active, created_at, updated_at)
  SELECT 'admin', 'Administrator (default)', 'admin', '$2y$10$NuYmx98uq4RJm.QVxITepe6lh8TTTppcBpEZmnpf2fj6ShHCdDrqG', 1,
         strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
   WHERE NOT EXISTS (SELECT 1 FROM users);
