-- ═══════════════════════════════════════════════════════════════
-- Prasad Seeds — Monitoring System v5 · Skema database (versi 1)
-- Kompatibel dengan SQLite (XAMPP) dan Turso / libSQL (Vercel).
-- Di-generate dari api/_lib/Schema.php — ubah skema di sana, lalu generate ulang file ini.
--
-- Cara pakai:
--   SQLite : sqlite3 database/dailymonitoring.db < database/schema.sql
--            (atau buka di DB Browser for SQLite → Execute SQL)
--   Turso  : turso db shell <nama-db> < database/schema.sql
--
-- Akun user TIDAK dibuat di sini (password harus di-hash). Buat admin dengan:
--   php scripts/migrate.php --admin=admin --password=PasswordKamu
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
  id         TEXT PRIMARY KEY,
  sess_id    TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT '',
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_work_orders_rev ON work_orders(rev);

INSERT OR IGNORE INTO counters (name, value) VALUES
  ('rev', 0), ('hierarchy_rev', 0), ('pics_rev', 0), ('wo_seq', 0);

INSERT OR IGNORE INTO app_meta (key, value) VALUES ('schema_version', '1');
