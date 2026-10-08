'use strict';

// ═══════════════════════════════════════════════════════
// DATA STORE & SINKRONISASI DATABASE
// ───────────────────────────────────────────────────────
// • Data kerja (hierarchy, sessions, PIC_LIST, workOrders, rcaReports, repairs) tetap berupa variabel global
//   seperti sebelumnya — semua halaman cukup memanggil saveAll() setelah mengubah data.
// • saveAll() menyimpan cache lokal (agar app tetap jalan saat offline) lalu
//   menjadwalkan push perubahan ke server.
// • Perubahan dideteksi dengan membandingkan hash tiap entitas terhadap "snapshot"
//   versi server terakhir — hanya yang berubah yang dikirim.
// • pullFromServer() menarik perubahan dari user lain berdasarkan nomor revisi
//   (delta sync), sehingga polling 30 detik tetap ringan.
// ═══════════════════════════════════════════════════════
const CACHE_KEY = 'ps2_cache_v1';
const PUSH_DEBOUNCE_MS = 1200;
const PUSH_RETRY_MS = 15000;
const PUSH_CHUNK = 60;

const _sync = {
  rev: 0,
  snap: { hierarchy: null, picList: null, sessions: {}, workOrders: {}, rcaReports: {}, repairs: {}, monitoringWos: {} },
  pushing: false,
  pushAgain: false,
  pulling: false,
  pushTimer: null,
  retryTimer: null,
  lastSyncAt: null,
  driver: '',
  cacheWarned: false,
};

// Hash cepat (cyrb53) — cukup untuk mendeteksi perubahan objek
function _hashStr(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
function hashOf(obj) { return _hashStr(JSON.stringify(obj ?? null)); }

function canEditMasterData() {
  return !!currentUser && currentUser.role !== 'crew';
}

// ── Cache lokal ──────────────────────────────────────────
function loadAll() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (c) {
      hierarchy  = c.hierarchy  && Array.isArray(c.hierarchy.units) ? c.hierarchy : { units: [] };
      sessions   = Array.isArray(c.sessions)   ? c.sessions   : [];
      PIC_LIST   = Array.isArray(c.picList)    ? c.picList    : [];
      workOrders = Array.isArray(c.workOrders) ? c.workOrders : [];
      rcaReports = Array.isArray(c.rcaReports) ? c.rcaReports : [];
      repairs    = Array.isArray(c.repairs)    ? c.repairs    : [];
      monitoringWos = Array.isArray(c.monitoringWos) ? c.monitoringWos : [];
      _sync.rev  = c.rev || 0;
      _sync.snap = Object.assign({ hierarchy: null, picList: null, sessions: {}, workOrders: {}, rcaReports: {}, repairs: {}, monitoringWos: {} }, c.snap || {});
      if (!_sync.snap.repairs) _sync.snap.repairs = {};
      if (!_sync.snap.monitoringWos) _sync.snap.monitoringWos = {};
    }
  } catch (e) {
    console.warn('[Store] Cache lokal rusak, diabaikan:', e.message);
  }
  // Hapus data login lama yang menyimpan password plaintext
  try { localStorage.removeItem('ps_users'); localStorage.removeItem('ps_session'); } catch (e) {}
}

function writeCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      rev: _sync.rev, snap: _sync.snap,
      hierarchy, sessions, picList: PIC_LIST, workOrders, rcaReports, repairs, monitoringWos,
    }));
  } catch (e) {
    // Cache hanya pelengkap — data utama ada di database
    if (!_sync.cacheWarned) {
      _sync.cacheWarned = true;
      console.warn('[Store] Cache lokal penuh, mode offline terbatas:', e.message);
    }
  }
}

function clearLocalCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
  _sync.rev = 0;
  _sync.snap = { hierarchy: null, picList: null, sessions: {}, workOrders: {}, rcaReports: {}, repairs: {}, monitoringWos: {} };
}

/** Panggil setelah mengubah hierarchy / sessions / PIC_LIST / workOrders / rcaReports / repairs. */
function saveAll() {
  writeCache();
  schedulePush();
}

// ── Push ─────────────────────────────────────────────────
function schedulePush(delay = PUSH_DEBOUNCE_MS) {
  clearTimeout(_sync.pushTimer);
  _sync.pushTimer = setTimeout(() => flushChanges(), delay);
}

function collectChanges() {
  const ch = { sessions: [], deletedSessions: [], workOrders: [], rcaReports: [], repairs: [], monitoringWos: [], hierarchy: null, picList: null };
  // Hierarki & PIC dikirim utuh (menimpa server), jadi hanya boleh dikirim setelah
  // versi server pernah diterima (snap !== null). Ini mencegah perangkat baru dengan
  // cache kosong menghapus hierarki di database.
  if (canEditMasterData()) {
    const hh = hashOf(hierarchy);
    if (_sync.snap.hierarchy !== null && hh !== _sync.snap.hierarchy) ch.hierarchy = { data: hierarchy, hash: hh };
    const ph = hashOf(PIC_LIST);
    if (_sync.snap.picList !== null && ph !== _sync.snap.picList) ch.picList = { data: PIC_LIST, hash: ph };
  }

  const localIds = new Set();
  sessions.forEach(s => {
    if (!s || !s.id || s._isDraft) return;
    localIds.add(s.id);
    const h = hashOf(s);
    if (h !== _sync.snap.sessions[s.id]) ch.sessions.push({ data: s, hash: h });
  });
  if (canEditMasterData()) {
    Object.keys(_sync.snap.sessions).forEach(id => { if (!localIds.has(id)) ch.deletedSessions.push(id); });
  }

  workOrders.forEach(w => {
    if (!w || !w.id) return;
    const h = hashOf(w);
    if (h !== _sync.snap.workOrders[w.id]) ch.workOrders.push({ data: w, hash: h });
  });

  // Laporan perbaikan boleh dikirim semua role (termasuk crew)
  repairs.forEach(r => {
    if (!r || !r.id) return;
    const h = hashOf(r);
    if (h !== _sync.snap.repairs[r.id]) ch.repairs.push({ data: r, hash: h });
  });

  // WO Monitoring juga boleh dikirim semua role
  monitoringWos.forEach(m => {
    if (!m || !m.id) return;
    const h = hashOf(m);
    if (h !== _sync.snap.monitoringWos[m.id]) ch.monitoringWos.push({ data: m, hash: h });
  });

  // RCA hanya boleh dikirim role leader ke atas (crew ditolak server)
  if (canEditMasterData()) {
    rcaReports.forEach(r => {
      if (!r || !r.id) return;
      const h = hashOf(r);
      if (h !== _sync.snap.rcaReports[r.id]) ch.rcaReports.push({ data: r, hash: h });
    });
  }
  return ch;
}

function hasPendingChanges() {
  const ch = collectChanges();
  return !!(ch.hierarchy || ch.picList || ch.sessions.length || ch.deletedSessions.length || ch.workOrders.length || ch.rcaReports.length || ch.repairs.length || ch.monitoringWos.length);
}

async function flushChanges() {
  clearTimeout(_sync.pushTimer);
  if (!getAuthToken()) return false;
  if (_sync.pushing) { _sync.pushAgain = true; return false; }

  const ch = collectChanges();
  if (!ch.hierarchy && !ch.picList && !ch.sessions.length && !ch.deletedSessions.length && !ch.workOrders.length && !ch.rcaReports.length && !ch.repairs.length && !ch.monitoringWos.length) {
    return true;
  }

  _sync.pushing = true;
  setSyncStatus('syncing');
  try {
    const chunks = [];
    for (let i = 0; i < ch.sessions.length; i += PUSH_CHUNK) chunks.push(ch.sessions.slice(i, i + PUSH_CHUNK));
    if (!chunks.length) chunks.push([]);

    for (let i = 0; i < chunks.length; i++) {
      const body = { sessions: chunks[i].map(x => x.data) };
      if (i === 0) {
        if (ch.hierarchy) body.hierarchy = ch.hierarchy.data;
        if (ch.picList)   body.picList   = ch.picList.data;
        body.deletedSessions = ch.deletedSessions;
        body.workOrders = ch.workOrders.map(x => x.data);
        body.rcaReports = ch.rcaReports.map(x => x.data);
        body.repairs = ch.repairs.map(x => x.data);
        body.monitoringWos = ch.monitoringWos.map(x => x.data);
      }
      await apiRequest('push', { method: 'POST', body });

      chunks[i].forEach(x => { _sync.snap.sessions[x.data.id] = x.hash; });
      if (i === 0) {
        if (ch.hierarchy) _sync.snap.hierarchy = ch.hierarchy.hash;
        if (ch.picList)   _sync.snap.picList   = ch.picList.hash;
        ch.deletedSessions.forEach(id => { delete _sync.snap.sessions[id]; });
        ch.workOrders.forEach(x => { _sync.snap.workOrders[x.data.id] = x.hash; });
        ch.rcaReports.forEach(x => { _sync.snap.rcaReports[x.data.id] = x.hash; });
        ch.repairs.forEach(x => { _sync.snap.repairs[x.data.id] = x.hash; });
        ch.monitoringWos.forEach(x => { _sync.snap.monitoringWos[x.data.id] = x.hash; });
      }
      writeCache();
    }

    clearTimeout(_sync.retryTimer);
    _sync.lastSyncAt = new Date();
    setSyncStatus('ok');
    return true;
  } catch (e) {
    console.warn('[Store] Push gagal:', e.message);
    setSyncStatus(e.status === 0 ? 'offline' : 'error');
    if (e.status !== 0 && e.status !== 401) toast('✗ Gagal menyimpan ke database: ' + e.message, 'error', 6000);
    clearTimeout(_sync.retryTimer);
    _sync.retryTimer = setTimeout(() => flushChanges(), PUSH_RETRY_MS);
    return false;
  } finally {
    _sync.pushing = false;
    if (_sync.pushAgain) { _sync.pushAgain = false; schedulePush(300); }
  }
}

// ── Pull ─────────────────────────────────────────────────
async function pullFromServer(opts = {}) {
  if (!getAuthToken() || _sync.pulling) return false;
  _sync.pulling = true;
  if (!opts.polling) setSyncStatus('syncing');

  try {
    // Kirim perubahan lokal dulu supaya tidak tertimpa data server
    await flushChanges();

    const fullSync = _sync.rev === 0;
    const index = new Map(sessions.map((s, i) => [s.id, i]));
    const seen = new Set();
    let since = _sync.rev, cursorId = '', newRev = null, changed = false;

    for (;;) {
      const query = { since, cursorId };
      if (!cursorId) query.notifSince = notifSinceParam();
      const res = await apiRequest('sync', { query });
      if (newRev === null) {
        newRev = res.rev;
        handleNotificationFeed(res);
        _sync.driver = res.driver || '';
        changed = _applyMasterData(res) || changed;
        changed = _applyDeleted(res.deletedSessions || [], index) || changed;
      }
      (res.sessions || []).forEach(s => {
        seen.add(s.id);
        changed = _applySession(s, index) || changed;
      });
      if (!res.more || !res.cursor) break;
      since = res.cursor.rev;
      cursorId = res.cursor.id;
    }

    if (fullSync) {
      // Server tidak mengirim hierarki/PIC = memang masih kosong di database
      if (_sync.snap.hierarchy === null) _sync.snap.hierarchy = hashOf({ units: [] });
      if (_sync.snap.picList === null)   _sync.snap.picList   = hashOf([]);
      // Sesi yang pernah tersinkron tapi sudah tidak ada di server → sudah dihapus
      const before = sessions.length;
      sessions = sessions.filter(s => {
        if (seen.has(s.id) || !(s.id in _sync.snap.sessions)) return true;
        delete _sync.snap.sessions[s.id];
        return false;
      });
      changed = changed || sessions.length !== before;
    }

    _sync.rev = newRev || 0;
    _sync.lastSyncAt = new Date();
    writeCache();
    if (changed) {
      renderAll();
      populateUnitFilters();
      _refreshCrewPortal();
    }
    setSyncStatus('ok');
    if (!opts.silent) {
      toast(changed ? `✓ Data diperbarui — ${sessions.length} sesi` : '✓ Data sudah terkini', 'success');
    }
    return true;
  } catch (e) {
    console.warn('[Store] Pull gagal:', e.message);
    if (!opts.polling) setSyncStatus(e.status === 0 ? 'offline' : 'error');
    if (!opts.silent && e.status !== 401) toast('✗ Gagal mengambil data: ' + e.message, 'error');
    return false;
  } finally {
    _sync.pulling = false;
  }
}

function _applyMasterData(res) {
  let changed = false;
  const masterEditable = canEditMasterData();

  if (res.hierarchy) {
    const pending = masterEditable && hashOf(hierarchy) !== _sync.snap.hierarchy && _sync.snap.hierarchy !== null;
    const h = hashOf(res.hierarchy);
    if (!pending && h !== hashOf(hierarchy)) { hierarchy = res.hierarchy; changed = true; }
    if (!pending) _sync.snap.hierarchy = h;
  }
  if (Array.isArray(res.picList)) {
    const pending = masterEditable && hashOf(PIC_LIST) !== _sync.snap.picList && _sync.snap.picList !== null;
    const h = hashOf(res.picList);
    if (!pending && h !== hashOf(PIC_LIST)) { PIC_LIST = res.picList; changed = true; }
    if (!pending) _sync.snap.picList = h;
  }
  (res.repairs || []).forEach(r => {
    if (!r || !r.id) return;
    const idx = repairs.findIndex(x => x.id === r.id);
    const local = idx !== -1 ? repairs[idx] : null;
    if (local && hashOf(local) !== _sync.snap.repairs[r.id]) return; // perubahan lokal belum terkirim
    const h = hashOf(r);
    if (!local) { repairs.push(r); changed = true; }
    else if (hashOf(local) !== h) { repairs[idx] = r; changed = true; }
    _sync.snap.repairs[r.id] = h;
  });
  (res.monitoringWos || []).forEach(m => {
    if (!m || !m.id) return;
    const idx = monitoringWos.findIndex(x => x.id === m.id);
    const local = idx !== -1 ? monitoringWos[idx] : null;
    if (local && hashOf(local) !== _sync.snap.monitoringWos[m.id]) return; // perubahan lokal belum terkirim
    const h = hashOf(m);
    if (!local) { monitoringWos.push(m); changed = true; }
    else if (hashOf(local) !== h) { monitoringWos[idx] = m; changed = true; }
    _sync.snap.monitoringWos[m.id] = h;
  });
  (res.rcaReports || []).forEach(r => {
    if (!r || !r.id) return;
    const idx = rcaReports.findIndex(x => x.id === r.id);
    const local = idx !== -1 ? rcaReports[idx] : null;
    if (local && hashOf(local) !== _sync.snap.rcaReports[r.id]) return; // perubahan lokal belum terkirim
    const h = hashOf(r);
    if (!local) { rcaReports.push(r); changed = true; }
    else if (hashOf(local) !== h) { rcaReports[idx] = r; changed = true; }
    _sync.snap.rcaReports[r.id] = h;
  });
  (res.workOrders || []).forEach(wo => {
    if (!wo || !wo.id) return;
    if (typeof wo.checklist === 'string') {
      try { wo.checklist = JSON.parse(wo.checklist); } catch (e) { wo.checklist = []; }
    }
    if (!Array.isArray(wo.checklist)) wo.checklist = [];
    const idx = workOrders.findIndex(w => w.id === wo.id);
    const local = idx !== -1 ? workOrders[idx] : null;
    if (local && hashOf(local) !== _sync.snap.workOrders[wo.id]) return; // perubahan lokal belum terkirim
    const h = hashOf(wo);
    if (!local) { workOrders.push(wo); changed = true; }
    else if (hashOf(local) !== h) { workOrders[idx] = wo; changed = true; }
    _sync.snap.workOrders[wo.id] = h;
  });
  return changed;
}

function _applyDeleted(ids, index) {
  if (!ids.length) return false;
  const remove = new Set();
  ids.forEach(id => {
    const i = index.get(id);
    const local = i !== undefined ? sessions[i] : null;
    if (local && hashOf(local) !== _sync.snap.sessions[id]) return; // diedit lokal → dipertahankan
    if (local) remove.add(id);
    delete _sync.snap.sessions[id];
  });
  if (!remove.size) return false;
  sessions = sessions.filter(s => !remove.has(s.id));
  index.clear();
  sessions.forEach((s, i) => index.set(s.id, i));
  return true;
}

function _applySession(s, index) {
  if (!s || !s.id) return false;
  const i = index.get(s.id);
  const local = i !== undefined ? sessions[i] : null;
  if (local && hashOf(local) !== _sync.snap.sessions[s.id]) return false; // perubahan lokal belum terkirim
  const h = hashOf(s);
  _sync.snap.sessions[s.id] = h;
  if (!local) {
    index.set(s.id, sessions.length);
    sessions.push(s);
    return true;
  }
  if (hashOf(local) === h) return false;
  sessions[i] = s;
  return true;
}

function _refreshCrewPortal() {
  if (currentUser?.role !== 'crew') return;
  if (!document.getElementById('crewPortal')?.classList.contains('active')) return;
  if (document.querySelector('.overlay.open')) return; // jangan ganggu user yang sedang mengisi form
  if (crewNav.screen === 'history') _renderCrewHistory();
  else if (crewNav.screen === 'monwo') crewShowMonWo();
  else if (crewNav.screen === 'equip' && crewNav.areaId) crewSelectArea(crewNav.areaId, crewNav.areaName);
  else if (crewNav.screen === 'home') crewShowHome();
}

/** Tombol "Sync" — kirim perubahan lalu ambil data terbaru. */
async function syncNow() {
  const ok = await flushChanges();
  await pullFromServer({ silent: false });
  return ok;
}

/** Buang cache lokal & tarik ulang semua data dari server. */
async function resyncFromServer() {
  if (hasPendingChanges() &&
      !confirm('Ada perubahan yang belum tersimpan ke database dan akan hilang. Lanjutkan?')) return;
  clearLocalCache();
  hierarchy = { units: [] }; sessions = []; PIC_LIST = []; workOrders = []; rcaReports = []; repairs = []; monitoringWos = [];
  renderAll();
  await pullFromServer({ silent: false });
}

function setSyncStatus(s) {
  const badge = document.getElementById('syncBadge');
  const side  = document.getElementById('sbSyncStatus');
  const time  = _sync.lastSyncAt
    ? _sync.lastSyncAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '';
  const db = _sync.driver ? _sync.driver.toUpperCase() : 'DB';
  const cfgs = {
    idle:    { text: '☁ Sync',          cls: '',    side: '⬡ Belum sync' },
    syncing: { text: '↻ Syncing...',    cls: '',    side: '↻ Sedang sync...' },
    ok:      { text: '✓ Live ●',        cls: 'ok',  side: `✓ ${db} tersinkron · ${time}` },
    error:   { text: '✗ Gagal',         cls: 'err', side: '✗ Sync gagal — dicoba ulang otomatis' },
    offline: { text: '○ Offline',       cls: 'err', side: '○ Offline — perubahan disimpan lokal' },
  };
  const c = cfgs[s] || cfgs.idle;
  if (badge) { badge.textContent = c.text; badge.className = 'sync-pill ' + c.cls; }
  if (side)  side.textContent = c.side;
  updateCrewSyncBadge?.(s);
  renderDatabaseStatus?.();
}

window.addEventListener('online', () => { if (currentUser) flushChanges(); });
