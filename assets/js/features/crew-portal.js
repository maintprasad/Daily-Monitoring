'use strict';

/**
 * buildMonthDropdownHTML — buat HTML select dropdown pilih bulan
 * dari bulan pertama ada data sampai bulan sekarang
 */
function buildMonthDropdownHTML(selectId, selectedMonth, onchangeStr) {
  // Kumpulkan semua bulan yang ada datanya
  const monthSet = new Set();
  sessions.forEach(s => {
    if (s.tanggal && s.tanggal.length >= 7) monthSet.add(s.tanggal.slice(0,7));
  });
  // Tambahkan bulan sekarang selalu ada
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthSet.add(d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'));
  }
  // Urutkan descending
  const months = [...monthSet].sort((a,b) => b.localeCompare(a));
  const opts = months.map(m =>
    `<option value="${m}" ${m === selectedMonth ? 'selected' : ''}>${formatMonthLabel(m)}</option>`
  ).join('');
  return `<select id="${selectId}" onchange="${onchangeStr}"
    style="width:100%;background:var(--bg2);border:1.5px solid var(--border);
           color:var(--text);font-family:'IBM Plex Sans',sans-serif;font-size:13px;
           padding:9px 12px;border-radius:8px;outline:none;cursor:pointer;
           transition:border-color .15s;appearance:none;
           background-image:url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 12 12%22><path fill=%22%237A9A7A%22 d=%22M6 8L1 3h10z%22/></svg>');
           background-repeat:no-repeat;background-position:right 12px center;
           padding-right:32px">
    ${opts}
  </select>`;
}

function formatMonthLabel(ym) {
  if (!ym) return '—';
  const months = ['Januari','Februari','Maret','April','Mei','Juni',
                  'Juli','Agustus','September','Oktober','November','Desember'];
  try {
    const [y, m] = ym.split('-');
    const now = new Date();
    const isThisMonth = parseInt(y) === now.getFullYear() && parseInt(m)-1 === now.getMonth();
    return `${months[parseInt(m)-1]} ${y}${isThisMonth ? ' (Bulan Ini)' : ''}`;
  } catch(e) { return ym; }
}

function onCrewHomeMonthChange(ym) {
  const sess  = sessions.filter(s => (s.tanggal||'').startsWith(ym));
  const items = sess.flatMap(s => s.items || []);
  const warn  = items.filter(i => i.status==='WARNING').length;
  const alert = items.filter(i => i.status==='ALERT').length;

  const labelEl = document.getElementById('crewHomeStatLabel');
  const sesiEl  = document.getElementById('crewStatSesi');
  const warnEl  = document.getElementById('crewStatWarn');
  const alertEl = document.getElementById('crewStatAlert');
  if (labelEl) labelEl.textContent = `📊 Statistik ${formatMonthLabel(ym)}`;
  if (sesiEl)  sesiEl.textContent  = sess.length;
  if (warnEl)  warnEl.textContent  = warn;
  if (alertEl) alertEl.textContent = alert;

  // Update recent list juga
  const recentEl = document.getElementById('crewHomeRecentList');
  if (!recentEl) return;
  const recent = sess.sort((a,b) => new Date(b.createdAt||0)-new Date(a.createdAt||0)).slice(0,6);
  if (!recent.length) {
    recentEl.innerHTML = `<div style="padding:16px;font-size:12px;color:var(--text3);text-align:center">
      Tidak ada sesi di bulan ini.</div>`;
    return;
  }
  recentEl.innerHTML = recent.map(s => {
    const st  = sessStatus(s);
    const dot = {OK:'var(--green)',WARNING:'var(--orange)',ALERT:'var(--red)',PENDING:'var(--text3)'}[st]||'var(--text3)';
    return `<div class="crew-recent-item" onclick="crewOpenSession('${esc(s.id)}')">
      <div class="crew-recent-dot" style="background:${dot}"></div>
      <div class="crew-recent-info">
        <div class="crew-recent-equip">${esc(s.equipName||'—')}</div>
        <div class="crew-recent-meta">${esc(s.areaName||'')} · 👤 ${esc(s.pic||'—')}</div>
        <div class="crew-recent-meta">${fmtDate(s.tanggal)} ${esc(s.startTime||'')}</div>
      </div>
      <span class="badge ${stBadge(st)}">${st}</span>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════════
// CREW PORTAL — UI KHUSUS ROLE CREW (TEKNISI)
// ════════════════════════════════════════════════════════════════

// State navigasi crew
const crewNav = {
  screen:   'home',   // 'home' | 'unit' | 'area' | 'equip'
  unitId:   null,
  unitName: '',
  areaId:   null,
  areaName: '',
};

const AREA_COLORS = ['c-green','c-blue','c-orange','c-purple','c-cyan','c-red'];
const AREA_ICONS  = {
  'CTP':          '🏭',
  'Prairie':      '🌾',
  'Peanut':       '🥜',
  'Petkus':       '⚙',
  'Cold':         '❄',
  'Utility':      '🔌',
  'Office':       '🏢',
  'Hydrant':      '🚒',
  'Compressor':   '💨',
  'Mini':         '🔧',
  'SPR':          '🏭',
  'PS':           '🏭',
  'default':      '📁',
};

function getAreaIcon(name) {
  const n = name || '';
  for (const [key, icon] of Object.entries(AREA_ICONS)) {
    if (n.toLowerCase().includes(key.toLowerCase())) return icon;
  }
  return AREA_ICONS.default;
}

/**
 * Aktifkan / nonaktifkan crew portal
 */
function showCrewPortal() {
  const portal = document.getElementById('crewPortal');
  if (portal) portal.classList.add('active');
  // Sembunyikan elemen non-crew
  document.querySelector('.topbar')?.style.setProperty('display', 'none');
  document.querySelector('.layout')?.style.setProperty('display', 'none');
  document.querySelector('.mobile-nav')?.style.setProperty('display', 'none');
  crewShowHome();
  updateCrewSyncBadge();
}

function hideCrewPortal() {
  const portal = document.getElementById('crewPortal');
  if (portal) portal.classList.remove('active');
  document.querySelector('.topbar')?.style.removeProperty('display');
  document.querySelector('.layout')?.style.removeProperty('display');
  document.querySelector('.mobile-nav')?.style.removeProperty('display');
}

function updateCrewSyncBadge(status) {
  const badge = document.getElementById('crewSyncBadge');
  if (!badge) return;
  if (status === 'offline' || status === 'error') {
    badge.textContent = '○ Offline';
    badge.style.color = 'rgba(255,255,255,.4)';
  } else if (status === 'syncing') {
    badge.textContent = '↻ Sync';
    badge.style.color = '#ffd27a';
  } else {
    badge.textContent = '● Live';
    badge.style.color = '#7ddf6e';
  }
}

/**
 * Navigasi bottom nav crew
 */
function crewNavTo(tab) {
  document.querySelectorAll('.crew-nav-btn').forEach(b => b.classList.remove('active'));
  if (tab === 'monitor') {
    document.getElementById('crewNavMonitor')?.classList.add('active');
    crewShowUnitSelect();
  } else if (tab === 'history') {
    document.getElementById('crewNavHistory')?.classList.add('active');
    crewShowHistory();
  } else {
    document.getElementById('crewNavHome')?.classList.add('active');
    crewShowHome();
  }
}

// ── HOME SCREEN ───────────────────────────────────────────────
// Ringkas & langsung ke pekerjaan: progres hari ini + daftar equipment yang belum dicek.

/** Unit dalam wilayah crew (kosong = semua unit). */
function crewUnits() {
  return hierarchy.units.filter(u => !currentUser?.unitId || u.id === currentUser.unitId);
}

/** Semua equipment di wilayah crew beserta sesi terakhir & status hari ini. */
function crewEquipmentStatus() {
  const today = todayISO();
  const last = new Map();
  sessions.forEach(s => {
    const k = s.unitId + '|' + s.areaId + '|' + s.equipId;
    const cur = last.get(k);
    if (!cur || (s.createdAt || '') > (cur.createdAt || '')) last.set(k, s);
  });
  const out = [];
  crewUnits().forEach(u => (u.areas || []).forEach(a => (a.equipments || []).forEach(eq => {
    const ls = last.get(u.id + '|' + a.id + '|' + eq.id) || null;
    const rp = equipRepairState(u.id, a.id, eq.id);
    out.push({ unit: u, area: a, eq, last: ls, doneToday: !!ls && ls.tanggal === today, repair: rp });
  })));
  return out;
}

function crewShowHome() {
  crewNav.screen = 'home';
  crewNav.unitId = null; crewNav.unitName = '';
  crewNav.areaId = null; crewNav.areaName = '';

  document.querySelectorAll('.crew-nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('crewNavHome')?.classList.add('active');
  regenerateFindings();

  const thisMonth = thisMonthISO();
  const myName    = currentUser?.name || currentUser?.username || '';
  const firstName = myName.split(/\s+/)[0] || myName;
  const hour      = new Date().getHours();
  const greet     = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 19 ? 'Selamat sore' : 'Selamat malam';
  const nowDate   = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const scope     = currentUser?.unitId ? unitLabel(currentUser.unitId) : 'Semua unit';

  const eqs       = crewEquipmentStatus();
  const doneCount = eqs.filter(x => x.doneToday).length;
  const pct       = eqs.length ? Math.round(doneCount / eqs.length * 100) : 0;
  // Belum dicek hari ini: yang belum pernah dicek dulu, lalu yang paling lama tidak dicek
  // Equipment dengan temuan yang belum dilaporkan perbaikannya → prioritas paling atas
  const toRepair = eqs.filter(x => x.repair.needsRepair)
    .sort((a, b) => (b.repair.pending.some(f => f.status === 'ALERT') ? 1 : 0) - (a.repair.pending.some(f => f.status === 'ALERT') ? 1 : 0));
  const todo = eqs.filter(x => !x.doneToday && !x.repair.needsRepair)
    .sort((a, b) => (a.last ? 1 : 0) - (b.last ? 1 : 0) || (a.last?.createdAt || '').localeCompare(b.last?.createdAt || ''));

  const monthSess  = sessions.filter(s => (s.tanggal || '').startsWith(thisMonth));
  const monthItems = monthSess.flatMap(s => s.items || []);

  const todoHtml = todo.slice(0, 8).map(x => `
    <button class="cw-todo-item" onclick="crewQuickStart(${jsArg(x.unit.id)}, ${jsArg(x.area.id)}, ${jsArg(x.eq.id)})">
      <span class="cw-todo-dot ${x.last ? '' : 'never'}"></span>
      <span class="cw-todo-info">
        <span class="cw-todo-name">${esc(x.eq.name)}</span>
        <span class="cw-todo-meta">${esc(x.area.name)}${crewUnits().length > 1 ? ' · ' + esc(x.unit.name) : ''} ·
          ${x.last ? 'terakhir ' + esc(fmtDate(x.last.tanggal)) : '<b>belum pernah dicek</b>'}</span>
      </span>
      <span class="cw-todo-go">Mulai ›</span>
    </button>`).join('');

  document.getElementById('crewBody').innerHTML = `
    <div class="cw-hero">
      <div class="cw-hello">${greet}, ${esc(firstName)} 👋</div>
      <div class="cw-date">${esc(nowDate)} · ${esc(scope)}</div>
      <div class="cw-progress">
        <div class="cw-progress-top">
          <span>Pengecekan hari ini</span>
          <b>${doneCount} / ${eqs.length} equipment</b>
        </div>
        <div class="cw-progress-bar"><div style="width:${pct}%"></div></div>
      </div>
      <button class="cw-cta" onclick="crewNavTo('monitor')"><span>✚</span> Mulai Monitoring</button>
    </div>

    ${toRepair.length ? `
    <div class="crew-sec-label">🔧 Perlu diperbaiki <span class="cw-count alert">${toRepair.length}</span></div>
    <div class="cw-todo" style="margin-bottom:18px">${toRepair.map(x => {
      const alerts = x.repair.pending.filter(f => f.status === 'ALERT').length;
      return `<button class="cw-todo-item repair" onclick="openRepairModal(${jsArg(x.unit.id)}, ${jsArg(x.area.id)}, ${jsArg(x.eq.id)})">
        <span class="cw-todo-dot ${alerts ? 'never' : ''}"></span>
        <span class="cw-todo-info">
          <span class="cw-todo-name">${esc(x.eq.name)}</span>
          <span class="cw-todo-meta">${esc(x.area.name)} · ${x.repair.pending.map(f => esc(f.parameter) + ' ' + esc(f.value) + ' ' + esc(f.unit_param || '')).join(', ')}</span>
        </span>
        <span class="cw-todo-go">🔧 Perbaiki ›</span>
      </button>`;
    }).join('')}</div>` : ''}

    <div class="crew-sec-label">⏳ Belum dicek hari ini <span class="cw-count">${todo.length}</span></div>
    ${todo.length ? `<div class="cw-todo">${todoHtml}</div>
      ${todo.length > 8 ? `<button class="cw-link" onclick="crewNavTo('monitor')">Lihat semua ${todo.length} equipment ›</button>` : ''}`
      : `<div class="cw-done">✅ Semua equipment di wilayahmu sudah dicek hari ini. Mantap!</div>`}

    <div class="crew-sec-label" id="crewHomeStatLabel" style="margin-top:20px">📊 Statistik ${formatMonthLabel(thisMonth)}</div>
    <div class="cw-month">${buildMonthDropdownHTML('crewHomeMonthSel', thisMonth, 'onCrewHomeMonthChange(this.value)')}</div>
    <div class="crew-stats-row" id="crewHomeStatRow">
      <div class="crew-stat"><div class="crew-stat-val" style="color:var(--blue)" id="crewStatSesi">${monthSess.length}</div><div class="crew-stat-lbl">Sesi</div></div>
      <div class="crew-stat"><div class="crew-stat-val" style="color:var(--orange)" id="crewStatWarn">${monthItems.filter(i => i.status === 'WARNING').length}</div><div class="crew-stat-lbl">Warning</div></div>
      <div class="crew-stat"><div class="crew-stat-val" style="color:var(--red)" id="crewStatAlert">${monthItems.filter(i => i.status === 'ALERT').length}</div><div class="crew-stat-lbl">Alert</div></div>
    </div>

    <div class="crew-recent" style="margin:16px 0 8px">
      <div class="crew-recent-hdr">
        <div class="crew-recent-title">⏱ Sesi terbaru</div>
        <button class="cw-link-inline" onclick="crewShowHistory(false)">Lihat semua ›</button>
      </div>
      <div id="crewHomeRecentList"></div>
    </div>`;

  // Daftar sesi terbaru memakai renderer yang sama dengan dropdown bulan
  onCrewHomeMonthChange(thisMonth);
}

// ── MULAI CEPAT (tanpa form panjang) ──────────────────────────
// Crew sudah memilih equipment, jadi cukup konfirmasi waktu & PIC lalu langsung isi checklist.
let _crewQuick = null;

function crewQuickStart(unitId, areaId, eqId) {
  const unit = findUnit(unitId);
  const area = findArea(unitId, areaId);
  const eq   = findEquipFlex(unitId, areaId, '', eqId);
  if (!eq) { toast('Equipment tidak ditemukan', 'error'); return; }
  if (!(eq.params || []).length) { toast('Equipment ini belum punya parameter. Hubungi Admin.', 'error'); return; }
  regenerateFindings();
  const rp = equipRepairState(unitId, areaId, eqId);
  if (rp.needsRepair) {
    toast(`🔧 Perbaiki dulu ${rp.pending.length} temuan sebelum cek ulang`, 'info', 5000);
    openRepairModal(unitId, areaId, eqId);
    return;
  }
  crewNav.screen = crewNav.screen === 'home' ? 'home' : 'equip';

  // Nama sendiri selalu tersedia & langsung terpilih; PIC lain dari daftar PIC
  const me = (currentUser?.name || currentUser?.username || '').toUpperCase();
  const pics = [...new Set([me, ...PIC_LIST.map(p => p.toUpperCase())].filter(Boolean))];
  _crewQuick = { unitId, areaId, eqId, selected: new Set(me ? [me] : []) };

  const last = getLastSession(unitId, areaId, '', eqId);
  const now = new Date();
  document.getElementById('crewStartBody').innerHTML = `
    <div class="cw-start-eq">
      <div class="cw-start-icon">${getAreaIcon(area?.name)}</div>
      <div style="min-width:0">
        <div class="cw-start-name">${esc(eq.name)}</div>
        <div class="cw-start-meta">${esc(unit?.name || '')} · ${esc(area?.name || '')}${eq.tag ? ' · ' + esc(eq.tag) : ''}</div>
        <div class="cw-start-meta">${(eq.params || []).length} parameter · ${last ? 'terakhir ' + esc(fmtDate(last.tanggal)) + ' (' + sessStatus(last) + ')' : 'belum pernah dicek'}</div>
      </div>
    </div>

    <div class="cw-start-row">
      <label>Tanggal<input type="date" id="cqDate" value="${todayISO()}"/></label>
      <label>Jam mulai<input type="time" id="cqTime" value="${now.toTimeString().slice(0, 5)}"/></label>
    </div>

    <div class="cw-start-label">Siapa yang mengecek? <span>(boleh lebih dari satu)</span></div>
    <div class="cw-chips" id="cqPics">
      ${pics.map(p => `<button type="button" class="cw-chip ${_crewQuick.selected.has(p) ? 'on' : ''}" data-pic="${esc(p)}"
        onclick="crewQuickTogglePic(this)">${p === me ? '👷 ' : ''}${esc(p)}</button>`).join('')}
    </div>

    <button class="cw-cta" style="margin-top:18px" onclick="crewQuickSubmit()"><span>▶</span> Mulai Isi Checklist</button>
    <button class="cw-link" onclick="closeOverlay('crewStartOverlay')">Batal</button>`;
  openOverlay('crewStartOverlay');
}

function crewQuickTogglePic(btn) {
  const p = btn.dataset.pic;
  if (_crewQuick.selected.has(p)) _crewQuick.selected.delete(p); else _crewQuick.selected.add(p);
  btn.classList.toggle('on', _crewQuick.selected.has(p));
}

function crewQuickSubmit() {
  if (!_crewQuick) return;
  const tanggal = getVal('cqDate');
  const start   = getVal('cqTime');
  if (!tanggal || !start) { toast('Isi tanggal dan jam mulai', 'error'); return; }
  if (!_crewQuick.selected.size) { toast('Pilih minimal satu PIC', 'error'); return; }
  const { unitId, areaId, eqId } = _crewQuick;
  const pics = [..._crewQuick.selected];
  _crewQuick = null;
  closeOverlay('crewStartOverlay');
  startDraftSession({ unitId, areaId, eqId, tanggal, start, pics });
}

// ── UNIT SELECT SCREEN ────────────────────────────────────────
function crewShowUnitSelect() {
  crewNav.screen   = 'unit';
  crewNav.unitId   = null; crewNav.unitName = '';
  crewNav.areaId   = null; crewNav.areaName = '';

  document.querySelectorAll('.crew-nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('crewNavMonitor')?.classList.add('active');

  // Crew hanya melihat unit wilayahnya (jika diatur di User Management)
  const units = hierarchy.units.filter(u => !currentUser?.unitId || u.id === currentUser.unitId);

  if (!units.length) {
    document.getElementById('crewBody').innerHTML = `
      ${crewBreadcrumb()}
      <div class="crew-empty">
        <div class="crew-empty-ico">🏭</div>
        <div class="crew-empty-msg">Belum ada unit terdaftar.<br>Hubungi Admin untuk setup hierarki.</div>
      </div>`;
    return;
  }

  const unitCards = units.map((u, i) => {
    const areaCount  = (u.areas || []).length;
    const equipCount = (u.areas || []).reduce((s, a) => s + (a.equipments||[]).length, 0);
    const colorCls   = AREA_COLORS[i % AREA_COLORS.length];

    // Status summary berdasarkan sesi terbaru
    let alertC = 0, warnC = 0;
    (u.areas || []).forEach(a => {
      (a.equipments || []).forEach(eq => {
        const last = getLastSession(u.id, a.id, '', eq.id);
        if (!last) return;
        const st = sessStatus(last);
        if (st === 'ALERT')   alertC++;
        if (st === 'WARNING') warnC++;
      });
    });

    const badgeHtml = alertC > 0
      ? `<div class="crew-card-badge alert">🚨 ${alertC} Alert</div>`
      : warnC > 0
        ? `<div class="crew-card-badge warn">⚠ ${warnC} Warn</div>`
        : `<div class="crew-card-badge">✓ OK</div>`;

    return `<div class="crew-card ${colorCls}"
      onclick="crewSelectUnit(${jsArg(u.id)},${jsArg(u.name)})">
      ${badgeHtml}
      <div class="crew-card-icon">🏭</div>
      <div class="crew-card-name">${esc(u.name)}</div>
      <div class="crew-card-meta">${areaCount} area · ${equipCount} equip</div>
    </div>`;
  }).join('');

  document.getElementById('crewBody').innerHTML = `
    ${crewBreadcrumb()}
    <div class="crew-sec-label">🏭 Pilih Unit Produksi</div>
    <div class="crew-grid ${units.length === 1 ? 'single' : ''}">
      ${unitCards}
    </div>`;
}

// ── AREA SELECT SCREEN ────────────────────────────────────────
function crewSelectUnit(unitId, unitName) {
  crewNav.screen   = 'area';
  crewNav.unitId   = unitId;
  crewNav.unitName = unitName;
  crewNav.areaId   = null;
  crewNav.areaName = '';

  const unit  = findUnit(unitId);
  const areas = unit?.areas || [];

  if (!areas.length) {
    document.getElementById('crewBody').innerHTML = `
      ${crewBreadcrumb()}
      <button class="crew-back-btn" onclick="crewShowUnitSelect()">← Kembali ke Unit</button>
      <div class="crew-empty">
        <div class="crew-empty-ico">📁</div>
        <div class="crew-empty-msg">Belum ada area di unit ini.</div>
      </div>`;
    return;
  }

  const areaCards = areas.map((a, i) => {
    const equipCount = (a.equipments || []).length;
    const icon       = getAreaIcon(a.name);
    const colorCls   = AREA_COLORS[i % AREA_COLORS.length];

    // Status summary area
    let alertC = 0, warnC = 0, okC = 0;
    (a.equipments || []).forEach(eq => {
      const last = getLastSession(unitId, a.id, '', eq.id);
      if (!last) return;
      const st = sessStatus(last);
      if (st === 'ALERT')   alertC++;
      if (st === 'WARNING') warnC++;
      if (st === 'OK')      okC++;
    });

    const badgeHtml = alertC > 0
      ? `<div class="crew-card-badge alert">🚨 ${alertC}</div>`
      : warnC > 0
        ? `<div class="crew-card-badge warn">⚠ ${warnC}</div>`
        : equipCount > 0
          ? `<div class="crew-card-badge">✓ ${okC}</div>`
          : '';

    return `<div class="crew-card ${colorCls}"
      onclick="crewSelectArea(${jsArg(a.id)},${jsArg(a.name)})">
      ${badgeHtml}
      <div class="crew-card-icon">${icon}</div>
      <div class="crew-card-name">${esc(a.name)}</div>
      <div class="crew-card-meta">${equipCount} equipment</div>
    </div>`;
  }).join('');

  document.getElementById('crewBody').innerHTML = `
    ${crewBreadcrumb()}
    <button class="crew-back-btn" onclick="crewShowUnitSelect()">← Kembali ke Unit</button>
    <div class="crew-sec-label">📁 Pilih Area — <span style="color:var(--navy)">${esc(unitName)}</span></div>
    <div class="crew-grid">
      ${areaCards}
    </div>`;
}

// ── EQUIPMENT SELECT SCREEN ───────────────────────────────────
function crewSelectArea(areaId, areaName) {
  crewNav.screen   = 'equip';
  crewNav.areaId   = areaId;
  crewNav.areaName = areaName;
  regenerateFindings();

  const area   = findArea(crewNav.unitId, areaId);
  const equips = area?.equipments || [];

  if (!equips.length) {
    document.getElementById('crewBody').innerHTML = `
      ${crewBreadcrumb()}
      <button class="crew-back-btn" onclick="crewSelectUnit(${jsArg(crewNav.unitId)},${jsArg(crewNav.unitName)})">← Kembali ke Area</button>
      <div class="crew-empty">
        <div class="crew-empty-ico">⚙</div>
        <div class="crew-empty-msg">Belum ada equipment di area ini.</div>
      </div>`;
    return;
  }

  const equipItems = equips.map(eq => {
    const last   = getLastSession(crewNav.unitId, areaId, '', eq.id);
    const st     = last ? sessStatus(last) : 'PENDING';
    const dot    = {OK:'var(--green)',WARNING:'var(--orange)',ALERT:'var(--red)',PENDING:'var(--text3)'}[st]||'var(--text3)';
    const typePill = eq.type
      ? `<span class="crew-type-pill">${esc((EQUIP_TYPE_LABELS[eq.type]||eq.type).replace(/^[^\s]+ /,''))}</span>`
      : '';
    const equipAllSess = getEquipHistory(crewNav.unitId, areaId, eq.id);
    const sessCount    = equipAllSess.length;
    const todaySess    = equipAllSess.filter(s =>
      (s.tanggal||'') === todayISO()
    );
    const badgeCls = stBadge(st);
    const doneToday = todaySess.length > 0;
    const rp = equipRepairState(crewNav.unitId, areaId, eq.id);
    const awaitingRecheck = !rp.needsRepair && rp.repaired.length > 0;
    const statusLine = rp.needsRepair
      ? `<span class="cw-eq-never">🔧 ${rp.pending.length} temuan perlu diperbaiki: ${rp.pending.map(f => esc(f.parameter)).join(', ')}</span>`
      : awaitingRecheck
        ? `<span class="cw-eq-wait">🔧 ${esc(REPAIR_RESULT_LABEL[rp.repaired[0].result] || rp.repaired[0].result)} oleh ${esc(rp.repaired[0].repairedByName || rp.repaired[0].repairedBy)} — lakukan Cek Lagi</span>`
        : doneToday
          ? `<span class="cw-eq-ok">✅ Sudah dicek hari ini${todaySess[0]?.startTime ? ' · ' + esc(todaySess[0].startTime) : ''}</span>`
          : last ? `<span>Terakhir ${esc(fmtDate(last.tanggal))}</span>`
                 : `<span class="cw-eq-never">⚠ Belum pernah dicek</span>`;

    // Tombol utama mengikuti tahap: Perbaiki → Cek Lagi → (selesai)
    const actionBtns = rp.needsRepair
      ? `<button class="cw-btn repair" onclick="openRepairModal(${jsArg(crewNav.unitId)},${jsArg(areaId)},${jsArg(eq.id)})">🔧 Perbaiki</button>
         <button class="cw-btn locked" disabled title="Perbaiki temuan dulu">🔒 Cek Lagi</button>`
      : `<button class="cw-btn ${doneToday && !awaitingRecheck ? 'outline' : 'primary'}"
          onclick="crewStartSession(${jsArg(crewNav.unitId)},${jsArg(areaId)},${jsArg(eq.id)})">
          ${awaitingRecheck ? '↻ Cek Lagi (verifikasi)' : doneToday ? '↻ Cek Lagi' : last ? '▶ Cek Lagi' : '▶ Mulai Cek'}
        </button>`;

    return `<div class="cw-eq ${rp.needsRepair ? 'needs-repair' : doneToday ? 'done' : ''}" data-search="${esc((eq.name + ' ' + (eq.tag || '') + ' ' + (eq.type || '')).toLowerCase())}"
        data-done="${doneToday ? '1' : '0'}">
      <div class="cw-eq-main">
        <span class="crew-equip-dot" style="background:${dot}"></span>
        <div style="min-width:0;flex:1">
          <div class="cw-eq-name">${esc(eq.name)}</div>
          <div class="cw-eq-meta">${typePill}${eq.tag ? esc(eq.tag) + ' · ' : ''}${eq.params?.length || 0} param
            ${last ? ` · <span class="badge ${badgeCls}" style="font-size:9px;padding:1px 6px">${st}</span>` : ''}</div>
          <div class="cw-eq-status">${statusLine}${sessCount ? ` · ${sessCount}× dicek` : ''}</div>
        </div>
      </div>
      <div class="cw-eq-actions">
        ${last ? `<button class="cw-btn ghost" onclick="crewOpenSession(${jsArg(last.id)})">👁 Terakhir</button>` : ''}
        ${actionBtns}
      </div>
    </div>`;
  }).join('');

  const pending = equips.length - equips.filter(eq =>
    getEquipHistory(crewNav.unitId, areaId, eq.id).some(s => s.tanggal === todayISO())).length;

  document.getElementById('crewBody').innerHTML = `
    ${crewBreadcrumb()}
    <button class="crew-back-btn"
      onclick="crewSelectUnit(${jsArg(crewNav.unitId)},${jsArg(crewNav.unitName)})">
      ← Kembali ke Area
    </button>
    <div class="crew-sec-label">
      ⚙ ${esc(areaName)} <span class="cw-count">${pending} belum dicek</span>
    </div>
    <div class="cw-search">
      <span>🔍</span>
      <input type="search" id="cwEqSearch" placeholder="Cari equipment / tag..." oninput="crewFilterEquip()" autocomplete="off"/>
    </div>
    <div class="cw-filter">
      <button class="cw-chip on" data-f="all" onclick="crewFilterEquip(this)">Semua (${equips.length})</button>
      <button class="cw-chip" data-f="todo" onclick="crewFilterEquip(this)">Belum dicek hari ini (${pending})</button>
    </div>
    <div class="crew-equip-list" id="cwEqList">
      ${equipItems}
      <div class="cw-done" id="cwEqEmpty" hidden>Tidak ada equipment yang cocok.</div>
    </div>`;
}

/** Filter daftar equipment tanpa render ulang (fokus input tidak hilang). */
function crewFilterEquip(chip) {
  if (chip) {
    document.querySelectorAll('.cw-filter .cw-chip').forEach(c => c.classList.toggle('on', c === chip));
  }
  const mode = document.querySelector('.cw-filter .cw-chip.on')?.dataset.f || 'all';
  const q = (getVal('cwEqSearch') || '').toLowerCase().trim();
  let shown = 0;
  document.querySelectorAll('#cwEqList .cw-eq').forEach(el => {
    const ok = (!q || el.dataset.search.includes(q)) && (mode === 'all' || el.dataset.done === '0');
    el.hidden = !ok;
    if (ok) shown++;
  });
  const empty = document.getElementById('cwEqEmpty');
  if (empty) empty.hidden = shown > 0;
}

// ── START SESSION FROM CREW PORTAL ───────────────────────────
function crewStartSession(unitId, areaId, eqId) {
  crewQuickStart(unitId, areaId, eqId);
}

// ── OPEN / VIEW SESSION ───────────────────────────────────────
function crewOpenSession(sessId) {
  viewSession(sessId);
}

// ── HISTORY SCREEN ────────────────────────────────────────────
// ── State filter crew history ──────────────────────────────────────
const crewHistState = {
  search:   '',
  unitId:   '',
  status:   '',
  month:    thisMonthISO(), // default bulan ini
  page:     1,
  pageSize: 20,
};

function crewShowHistory(resetFilter) {
  crewNav.screen = 'history';
  if (resetFilter) {
    crewHistState.search = '';
    crewHistState.unitId = '';
    crewHistState.status = '';
    crewHistState.page   = 1;
  }

  document.querySelectorAll('.crew-nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('crewNavHistory')?.classList.add('active');

  _renderCrewHistory();
}

function _renderCrewHistory() {
  const q      = crewHistState.search.toLowerCase();
  const unitId = crewHistState.unitId;
  const stFil  = crewHistState.status;
  const pg     = crewHistState.page;
  const pgSize = crewHistState.pageSize;

  const monthFil = crewHistState.month || '';

  // ── Crew selalu lihat SEMUA sesi dari semua user ──
  let allSess = [...sessions].sort((a,b) =>
    new Date(b.createdAt||0) - new Date(a.createdAt||0)
  );

  // Filter bulan
  if (monthFil) allSess = allSess.filter(s => (s.tanggal||'').startsWith(monthFil));
  // Filter search
  if (q) allSess = allSess.filter(s =>
    (s.equipName||'').toLowerCase().includes(q) ||
    (s.areaName||'').toLowerCase().includes(q)  ||
    (s.unitName||'').toLowerCase().includes(q)  ||
    (s.pic||'').toLowerCase().includes(q)        ||
    (s.id||'').toLowerCase().includes(q)
  );
  if (unitId) allSess = allSess.filter(s => s.unitId === unitId);
  if (stFil)  allSess = allSess.filter(s => sessStatus(s) === stFil);

  const total  = allSess.length;
  const pages  = Math.max(1, Math.ceil(total / pgSize));
  if (crewHistState.page > pages) crewHistState.page = pages;
  const slice  = allSess.slice((pg-1)*pgSize, pg*pgSize);

  // Grup per tanggal
  const today = todayISO();
  const groups = {};
  slice.forEach(s => {
    const key = s.tanggal || 'Tanpa Tanggal';
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });

  const histHtml = Object.keys(groups).length
    ? Object.entries(groups).map(([date, list]) => {
        const isToday = date === today;
        const rows = list.map(s => {
          const st  = sessStatus(s);
          const dot = {OK:'var(--green)',WARNING:'var(--orange)',ALERT:'var(--red)',PENDING:'var(--text3)'}[st]||'var(--text3)';
          return `
            <div style="border-bottom:1px solid var(--border)">
              <div class="crew-recent-item" onclick="crewOpenSession('${esc(s.id)}')"
                   style="padding-bottom:4px">
                <div class="crew-recent-dot" style="background:${dot}"></div>
                <div class="crew-recent-info">
                  <div class="crew-recent-equip">${esc(s.equipName||'—')}</div>
                  <div class="crew-recent-meta" style="margin-top:2px">
                    🏭 ${esc(s.unitName||'')} · 📁 ${esc(s.areaName||'')}
                  </div>
                  <div class="crew-recent-meta" style="margin-top:1px">
                    👤 ${esc(s.pic||'—')} · ⏱ ${esc(s.startTime||'—')}${s.endTime?' – '+esc(s.endTime):''}
                  </div>
                  <div style="font-size:9px;color:var(--text3);margin-top:2px;font-family:'IBM Plex Mono',monospace">${esc(s.id)}</div>
                </div>
                <span class="badge ${stBadge(st)}" style="flex-shrink:0;align-self:flex-start;margin-top:4px">${st}</span>
              </div>
              <div style="display:flex;gap:6px;padding:0 16px 10px">
                <button class="btn btn-ghost btn-xs" style="flex:1"
                  onclick="crewOpenSession('${esc(s.id)}')">👁 Lihat</button>
                <button class="btn btn-primary btn-xs" style="flex:1"
                  onclick="crewStartSession('${esc(s.unitId)}','${esc(s.areaId)}','${esc(s.equipId)}')">✚ Monitor Lagi</button>
              </div>
            </div>`;
        }).join('');
        return `
          <div style="margin-bottom:14px">
            <div class="crew-sec-label">
              ${isToday ? '📅 Hari Ini' : '📅 ' + fmtDate(date)}
              <span style="font-size:10px;font-weight:400;color:var(--text3);margin-left:4px">(${list.length} sesi)</span>
            </div>
            <div class="crew-recent" style="margin-bottom:0">${rows}</div>
          </div>`;
      }).join('')
    : `<div class="crew-empty" style="margin-top:16px">
        <div class="crew-empty-ico">📋</div>
        <div class="crew-empty-msg">Tidak ada riwayat monitoring${q||unitId||stFil?' dengan filter ini':''}.</div>
       </div>`;

  // Pagination html
  const pagHtml = pages > 1 ? `
    <div style="display:flex;align-items:center;justify-content:space-between;
                padding:10px 0;margin-top:8px;border-top:1px solid var(--border)">
      <button class="btn btn-ghost btn-sm" style="font-size:11px"
        onclick="crewHistGo(${pg-1})" ${pg<=1?'disabled':''}>← Prev</button>
      <span style="font-size:11px;color:var(--text3);font-family:'IBM Plex Mono',monospace">
        ${pg} / ${pages} (${total} sesi)
      </span>
      <button class="btn btn-ghost btn-sm" style="font-size:11px"
        onclick="crewHistGo(${pg+1})" ${pg>=pages?'disabled':''}>Next →</button>
    </div>` : `
    <div style="text-align:center;font-size:11px;color:var(--text3);padding:8px 0;border-top:1px solid var(--border);margin-top:4px">
      ${total} sesi ditemukan
    </div>`;

  // Unit options untuk filter
  const unitOpts = hierarchy.units.map(u =>
    `<option value="${u.id}" ${unitId===u.id?'selected':''}>${esc(u.name)}</option>`
  ).join('');

  document.getElementById('crewBody').innerHTML = `
    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;
                margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:18px;font-weight:700;color:var(--navy)">📋 Riwayat Monitoring</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">
          Seluruh history monitoring semua teknisi
        </div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="crewShowHistory(true)">✕ Reset</button>
    </div>

    <!-- Filter bar -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;
                padding:12px 14px;margin-bottom:16px;display:flex;flex-direction:column;gap:8px">

      <!-- Dropdown Bulan -->
      <div>
        <div style="font-size:10px;font-family:'IBM Plex Mono',monospace;color:var(--text3);
                    letter-spacing:.07em;text-transform:uppercase;margin-bottom:5px">📅 Filter Bulan</div>
        ${buildMonthDropdownHTML('crewHistMonthSel', crewHistState.month||'',
          'crewHistState.month=this.value;crewHistState.page=1;_renderCrewHistory()')}
      </div>

      <!-- Search -->
      <div style="display:flex;align-items:center;gap:8px;background:var(--bg3);
                  border:1px solid var(--border);border-radius:7px;padding:7px 10px">
        <span style="color:var(--text3);font-size:14px">🔍</span>
        <input type="text"
          style="background:none;border:none;outline:none;font-size:13px;color:var(--text);
                 font-family:'IBM Plex Sans',sans-serif;width:100%"
          placeholder="Cari equipment, area, PIC, ID sesi..."
          value="${esc(crewHistState.search)}"
          oninput="crewHistState.search=this.value;crewHistState.page=1;_renderCrewHistory()"/>
      </div>

      <!-- Filter row -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <select style="background:var(--bg3);border:1px solid var(--border);color:var(--text);
                       font-family:'IBM Plex Sans',sans-serif;font-size:12px;
                       padding:7px 8px;border-radius:7px;outline:none"
          onchange="crewHistState.unitId=this.value;crewHistState.page=1;_renderCrewHistory()">
          <option value="">Semua Unit</option>
          ${unitOpts}
        </select>
        <select style="background:var(--bg3);border:1px solid var(--border);color:var(--text);
                       font-family:'IBM Plex Sans',sans-serif;font-size:12px;
                       padding:7px 8px;border-radius:7px;outline:none"
          onchange="crewHistState.status=this.value;crewHistState.page=1;_renderCrewHistory()">
          <option value="">Semua Status</option>
          <option value="OK"      ${stFil==='OK'     ?'selected':''}>✅ Normal</option>
          <option value="WARNING" ${stFil==='WARNING' ?'selected':''}>⚠ Warning</option>
          <option value="ALERT"   ${stFil==='ALERT'   ?'selected':''}>🚨 Alert</option>
        </select>
      </div>
    </div>

    <!-- History list -->
    ${histHtml}

    <!-- Pagination -->
    ${pagHtml}
  `;
}

function crewHistGo(page) {
  crewHistState.page = page;
  _renderCrewHistory();
  // Scroll ke atas
  const body = document.getElementById('crewBody');
  if (body) body.scrollTop = 0;
}

// ── BREADCRUMB HELPER ─────────────────────────────────────────
function crewBreadcrumb() {
  // Simpan ke data-attr lalu gunakan event delegation — hindari quote hell di onclick
  const parts = [
    { label: '🏠 Beranda', action: 'home', active: false }
  ];
  if (crewNav.unitName) {
    parts.push({
      label:  esc(crewNav.unitName),
      action: 'unit',
      active: crewNav.screen === 'area'
    });
  }
  if (crewNav.areaName) {
    parts.push({
      label:  esc(crewNav.areaName),
      action: 'area',
      active: crewNav.screen === 'equip'
    });
  }

  return `<div class="crew-breadcrumb">
    ${parts.map((p, i) => `
      ${i > 0 ? '<span class="crew-bc-sep">›</span>' : ''}
      <span class="crew-bc-item ${p.active ? 'active' : ''}"
            data-bc-action="${p.action}"
            onclick="crewBreadcrumbNav(this.dataset.bcAction)">
        ${p.label}
      </span>
    `).join('')}
  </div>`;
}

function crewBreadcrumbNav(action) {
  if (action === 'home') crewShowHome();
  else if (action === 'unit') crewSelectUnit(crewNav.unitId, crewNav.unitName);
  else if (action === 'area') crewSelectArea(crewNav.areaId, crewNav.areaName);
}
