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
function crewShowHome() {
  crewNav.screen = 'home';
  crewNav.unitId = null; crewNav.unitName = '';
  crewNav.areaId = null; crewNav.areaName = '';

  document.querySelectorAll('.crew-nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('crewNavHome')?.classList.add('active');

  const today      = todayISO();
  const thisMonth  = today.slice(0, 7);
  const myName     = currentUser?.name || currentUser?.username || '';

  // Stat bulan ini
  const monthSess  = sessions.filter(s => (s.tanggal||'').startsWith(thisMonth));
  const monthItems = monthSess.flatMap(s => s.items || []);
  const monthOK    = monthItems.filter(i => i.status==='OK').length;
  const monthWarn  = monthItems.filter(i => i.status==='WARNING').length;
  const monthAlert = monthItems.filter(i => i.status==='ALERT').length;

  // Sesi bulan ini dari SEMUA teknisi
  const recentAll = [...sessions]
    .filter(s => (s.tanggal||'').startsWith(thisMonth))
    .sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0))
    .slice(0, 6);

  const recentHtml = recentAll.length
    ? recentAll.map(s => {
        const st  = sessStatus(s);
        const dot = {OK:'var(--green)',WARNING:'var(--orange)',ALERT:'var(--red)',PENDING:'var(--text3)'}[st]||'var(--text3)';
        const bd  = stBadge(st);
        return `<div class="crew-recent-item" onclick="crewOpenSession('${esc(s.id)}')">
          <div class="crew-recent-dot" style="background:${dot}"></div>
          <div class="crew-recent-info">
            <div class="crew-recent-equip">${esc(s.equipName||'—')}</div>
            <div class="crew-recent-meta">
              ${esc(s.areaName||'')} · 👤 ${esc(s.pic||'—')}
            </div>
            <div class="crew-recent-meta">${fmtDate(s.tanggal)} ${esc(s.startTime||'')}</div>
          </div>
          <span class="badge ${bd} crew-recent-badge">${st}</span>
        </div>`;
      }).join('')
    : `<div style="padding:16px;font-size:12px;color:var(--text3);text-align:center">
        Belum ada sesi monitoring.
       </div>`;

  // Quick stats
  const totalEquip = countEquipments();
  const unitCount  = hierarchy.units.length;

  const nowDate = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  document.getElementById('crewBody').innerHTML = `
    <!-- Welcome Banner -->
    <div class="crew-welcome">
      <div class="crew-welcome-icon">👷</div>
      <div class="crew-welcome-title">Selamat Datang di Menu Monitoring Maintenance</div>
      <div class="crew-welcome-name">${esc(myName)}</div>
      <div class="crew-welcome-sub">Prasad Seeds Indonesia · Departemen Electrical</div>
      <div class="crew-welcome-date">📅 ${nowDate}</div>
    </div>

    <!-- Dropdown bulan -->
    <div style="margin-bottom:12px">
      ${buildMonthDropdownHTML('crewHomeMonthSel', thisMonth, 'onCrewHomeMonthChange(this.value)')}
    </div>

    <!-- Quick Stats Bulan Ini -->
    <div class="crew-sec-label" id="crewHomeStatLabel">📊 Statistik ${formatMonthLabel(thisMonth)}</div>
    <div class="crew-stats-row" style="margin-bottom:20px" id="crewHomeStatRow">
      <div class="crew-stat">
        <div class="crew-stat-val" style="color:var(--blue)" id="crewStatSesi">${monthSess.length}</div>
        <div class="crew-stat-lbl">Total Sesi</div>
      </div>
      <div class="crew-stat">
        <div class="crew-stat-val" style="color:var(--orange)" id="crewStatWarn">${monthWarn}</div>
        <div class="crew-stat-lbl">Warning</div>
      </div>
      <div class="crew-stat">
        <div class="crew-stat-val" style="color:var(--red)" id="crewStatAlert">${monthAlert}</div>
        <div class="crew-stat-lbl">Alert</div>
      </div>
    </div>

    <!-- CTA Mulai Monitoring -->
    <button onclick="crewNavTo('monitor')" style="
      width:100%;padding:18px;border:none;border-radius:14px;
      background:linear-gradient(135deg,var(--green) 0%,var(--green-d) 100%);
      color:#fff;font-size:16px;font-weight:700;
      font-family:'IBM Plex Sans',sans-serif;
      cursor:pointer;margin-bottom:20px;
      display:flex;align-items:center;justify-content:center;gap:10px;
      box-shadow:0 4px 16px rgba(74,158,63,.35);
      transition:all .15s;
    " onmousedown="this.style.transform='scale(.97)'" onmouseup="this.style.transform=''">
      <span style="font-size:22px">✚</span>
      Mulai Monitoring Baru
    </button>

    <!-- Sesi Terbaru -->
    <div class="crew-sec-label">⏱ Sesi Terbaru</div>
    <div class="crew-recent" style="margin-bottom:20px">
      <div class="crew-recent-hdr">
          <div class="crew-recent-title">Sesi Terbaru Bulan Ini</div>
          <button onclick="crewShowHistory(false)" style="background:none;border:none;color:var(--blue);font-size:12px;cursor:pointer;font-family:'IBM Plex Sans',sans-serif">Lihat Semua →</button>
        </div>
        <div id="crewHomeRecentList">${recentHtml}</div>
      </div>

    <!-- Info sistem -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:14px 16px;font-size:12px;color:var(--text3)">
      <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:8px;font-family:'IBM Plex Mono',monospace">ℹ INFORMASI SISTEM</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <div>🏭 ${unitCount} unit produksi terdaftar</div>
        <div>⚙ ${totalEquip} equipment dimonitor</div>
        <div>👷 ${PIC_LIST.length} teknisi aktif</div>
        <div style="margin-top:4px;padding-top:8px;border-top:1px solid var(--border);font-size:10px">
          Jika ada temuan penting, segera buat Work Order melalui halaman Finding.
        </div>
      </div>
    </div>
  `;
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
    const lastStr = last
      ? `Terakhir: ${fmtDate(last.tanggal)} ${last.startTime||''}`
      : '⚠ Belum pernah dimonitoring';
    const badgeCls = stBadge(st);
    const sessInfo = sessCount > 0
      ? `${sessCount}× dicek${todaySess.length > 0 ? ` · ✅ ${todaySess.length}× hari ini` : ''}`
      : '';

    return `<div class="crew-equip-item"
      style="flex-direction:column;align-items:stretch;gap:8px;cursor:default;
             ${todaySess.length>0?'border-color:var(--green);background:var(--green-dim);':''}">
      <div style="display:flex;align-items:center;gap:14px">
        <div class="crew-equip-dot" style="background:${dot};flex-shrink:0"></div>
        <div class="crew-equip-info" style="flex:1;min-width:0">
          <div class="crew-equip-name">${esc(eq.name)}</div>
          <div class="crew-equip-meta" style="margin-top:3px">
            ${typePill}
            ${eq.tag ? `<span style="color:var(--text3)">${esc(eq.tag)}</span> · ` : ''}
            ${eq.params?.length||0} param
          </div>
          <div style="margin-top:5px;display:flex;align-items:center;gap:5px;flex-wrap:wrap">
            <span class="badge ${badgeCls}" style="font-size:9px">${st}</span>
            ${sessInfo ? `<span style="font-size:9px;color:var(--green);background:var(--green-dim);
              padding:1px 6px;border-radius:4px;border:1px solid rgba(74,158,63,.25)">${sessInfo}</span>` : ''}
          </div>
          <div style="margin-top:4px;font-size:10px;
            color:${!last?'var(--red)':'var(--text3)'};
            font-weight:${!last?'600':'400'}">
            ${lastStr}
          </div>
        </div>
      </div>
      <div style="display:flex;gap:6px">
        ${last ? `
          <button class="btn btn-ghost btn-sm" style="flex:1;font-size:11px"
            onclick="crewOpenSession('${esc(last.id)}')">
            👁 Lihat (${sessCount}×)
          </button>` : ''}
        <button class="btn btn-primary btn-sm"
          style="flex:${last?'1':'2'};font-size:11px;
            ${todaySess.length>0?'background:var(--green-d);':''}"
          onclick="crewStartSession('${esc(crewNav.unitId)}','${esc(areaId)}','${esc(eq.id)}')">
          ✚ ${!last ? 'Mulai Monitor' : todaySess.length>0 ? 'Monitor Lagi (Hari Ini)' : 'Monitor Lagi'}
        </button>
      </div>
    </div>`;
  }).join('');

  document.getElementById('crewBody').innerHTML = `
    ${crewBreadcrumb()}
    <button class="crew-back-btn"
      onclick="crewSelectUnit(${jsArg(crewNav.unitId)},${jsArg(crewNav.unitName)})">
      ← Kembali ke Area
    </button>
    <div class="crew-sec-label">
      ⚙ Pilih Equipment — <span style="color:var(--navy)">${esc(areaName)}</span>
    </div>
    <div class="crew-equip-list">
      ${equipItems}
    </div>`;
}

// ── START SESSION FROM CREW PORTAL ───────────────────────────
function crewStartSession(unitId, areaId, eqId) {
  crewNav.screen = 'equip';
  openNewSessionModal(unitId, areaId, '', eqId);

  // Fallback: pastikan dropdown equip terisi benar
  setTimeout(() => {
    const nsEquip = document.getElementById('ns-equip');
    if (nsEquip && eqId && nsEquip.value !== eqId) {
      setVal('ns-unit', unitId);
      onNSUnitChange();
      setTimeout(() => {
        setVal('ns-area', areaId);
        onNSAreaChange();
        setTimeout(() => {
          setVal('ns-equip', eqId);
          onNSEquipChange();
        }, 80);
      }, 80);
    }
  }, 350);
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
