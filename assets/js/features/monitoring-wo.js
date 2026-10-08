'use strict';

// ═══════════════════════════════════════════════════════
// WO MONITORING
// Crew tidak lagi dikunci oleh temuan yang belum diperbaiki. Lewat tombol "Monitoring Lagi"
// temuan itu di-skip dan disimpan sebagai WO Monitoring (status Open). WO menutup sendiri
// (Closed) saat semua parameternya normal kembali di pengecekan berikutnya atau ditutup lewat RCA.
// ═══════════════════════════════════════════════════════

const MONWO_STATUS_LABEL = { Open: '📋 Open', Closed: '✅ Closed' };

function _sessOrderById(sessId) {
  const s = sessions.find(x => x.id === sessId);
  return s ? sessOrderKey(s) : '';
}

/** Kondisi satu finding dalam WO: sudah selesai atau masih terbuka, berdasarkan pembacaan terbaru parameternya. */
function monWoFindingState(wo, f) {
  const origin = _sessOrderById(f.sessId || wo.sessId);
  let latest = null;
  sessions.forEach(s => {
    if (s.unitId !== wo.unitId || s.areaId !== wo.areaId || s.equipId !== wo.equipId) return;
    const it = (s.items || []).find(i => i.paramId === f.paramId && i.status);
    if (!it) return;
    const order = sessOrderKey(s);
    if (!latest || order > latest.order) latest = { order, status: it.status, value: it.value, unit: it.unit, sessId: s.id };
  });
  const closedRca = rcaReports.some(r => r.status === 'Closed' && r.equipId === wo.equipId && r.unitId === wo.unitId
    && (r.findings || []).some(x => x.paramId === f.paramId && _sessOrderById(x.sessId) >= origin));
  if (closedRca) return { open: false, reason: 'Ditutup (RCA)', latest };
  if (latest && latest.sessId !== (f.sessId || wo.sessId) && latest.status === 'OK') return { open: false, reason: 'Normal kembali', latest };
  return { open: true, reason: '', latest };
}

function monWoState(wo) {
  const items = (wo.findings || []).map(f => ({ f, ...monWoFindingState(wo, f) }));
  const openItems = items.filter(x => x.open);
  return { items, openCount: openItems.length, done: openItems.length === 0 };
}

/** Tutup otomatis WO yang semua temuannya sudah selesai. Dipanggil dari regenerateFindings(). */
function syncMonitoringWoStatus() {
  if (!currentUser) return;
  let changed = false;
  monitoringWos.forEach(wo => {
    if (wo.status === 'Closed') return;
    const st = monWoState(wo);
    if (!st.done) return;
    const reasons = [...new Set(st.items.map(x => x.reason))];
    wo.status = 'Closed';
    wo.closedAt = new Date().toISOString();
    wo.closeReason = reasons.join(', ');
    changed = true;
  });
  if (changed) saveAll();
}

function monWoOpenList(unitId) {
  return monitoringWos.filter(w => w.status !== 'Closed' && (!unitId || w.unitId === unitId));
}

function updateMonWoBadge() {
  const n = monWoOpenList(currentUser?.role === 'crew' ? currentUser.unitId : '').length;
  const badge = document.getElementById('sbMonWoBadge');
  if (badge) { badge.hidden = n === 0; badge.textContent = n; }
  const crewBadge = document.getElementById('crewMonWoBadge');
  if (crewBadge) { crewBadge.hidden = n === 0; crewBadge.textContent = n; }
}

/** Simpan temuan yang belum diperbaiki di equipment ini sebagai WO Monitoring (tidak dobel untuk sesi yang sama). */
function createMonitoringWo(unitId, areaId, eqId, reason) {
  const st = equipRepairState(unitId, areaId, eqId);
  if (!st.last || !st.pending.length) return null;
  const dup = monitoringWos.find(w => w.sessId === st.last.id && w.equipId === eqId && w.status !== 'Closed');
  if (dup) return dup;
  const s = st.last;
  const wo = {
    id: 'WM-' + todayISO().replace(/-/g, '') + '-' + shortId('').slice(-5),
    sessId: s.id,
    unitId: s.unitId || '', unitName: s.unitName || '',
    areaId: s.areaId || '', areaName: s.areaName || '',
    equipId: s.equipId || '', equipName: s.equipName || '',
    status: 'Open', reason: (reason || '').trim(),
    skippedBy: currentUser?.username || '', skippedByName: currentUser?.name || currentUser?.username || '',
    skippedAt: new Date().toISOString(), closedAt: '', closeReason: '',
    findings: st.pending.map(_rcaFindingOf),
  };
  monitoringWos.push(wo);
  saveAll();
  flushChanges();
  updateMonWoBadge();
  return wo;
}

function _monWoFindingChips(wo, st) {
  return st.items.map(x => {
    const cls = !x.open ? 'b-ok' : x.f.status === 'ALERT' ? 'b-alert' : 'b-warn';
    const now = x.latest && x.latest.sessId !== x.f.sessId
      ? ` → ${esc(x.latest.status)}${x.latest.value ? ' ' + esc(x.latest.value) : ''}` : '';
    return `<span class="badge ${cls}" style="font-size:10px;margin:2px 4px 2px 0" title="${esc(x.reason || 'Belum selesai')}">
      ${x.open ? '' : '✓ '}${esc(x.f.parameter)} ${esc(x.f.value)} ${esc(x.f.unit || '')}${now}</span>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════
// HALAMAN WO MONITORING (admin / supervisor / leader)
// ═══════════════════════════════════════════════════════
function renderMonitoringWoPage() {
  const tbody = document.getElementById('monWoTableBody');
  if (!tbody) return;
  syncMonitoringWoStatus();
  const q = (getVal('monWoSearch') || '').toLowerCase();
  const stf = getVal('monWoStatusFilter');

  const all = [...monitoringWos].sort((a, b) => (b.skippedAt || '').localeCompare(a.skippedAt || ''));
  setText('monWoStatTotal', all.length);
  setText('monWoStatOpen', all.filter(w => w.status !== 'Closed').length);
  setText('monWoStatClosed', all.filter(w => w.status === 'Closed').length);

  let list = all;
  if (stf === 'Open') list = list.filter(w => w.status !== 'Closed');
  else if (stf === 'Closed') list = list.filter(w => w.status === 'Closed');
  if (q) list = list.filter(w => JSON.stringify(w).toLowerCase().includes(q));

  tbody.innerHTML = list.map(w => {
    const st = monWoState(w);
    return `<tr>
      <td><div class="mono" style="font-size:11px;font-weight:600">${esc(w.id)}</div>
        <div style="font-size:10px;color:var(--text3)">${esc(fmtDateTime(w.skippedAt))}</div></td>
      <td><div style="font-size:12px;font-weight:600">${esc(w.equipName || '—')}</div>
        <div style="font-size:10px;color:var(--text3)">${esc([w.unitName, w.areaName].filter(Boolean).join(' / '))}</div></td>
      <td style="max-width:320px">${_monWoFindingChips(w, st)}
        ${w.reason ? `<div style="font-size:10px;color:var(--text3);margin-top:3px">📝 ${esc(w.reason)}</div>` : ''}</td>
      <td style="font-size:11px">${esc(w.skippedByName || w.skippedBy || '—')}</td>
      <td>${w.status === 'Closed'
        ? `<span class="badge b-ok">✅ Closed</span><div style="font-size:10px;color:var(--text3)">${esc(fmtDate(w.closedAt))}${w.closeReason ? ' · ' + esc(w.closeReason) : ''}</div>`
        : `<span class="badge b-warn">📋 Open</span><div style="font-size:10px;color:var(--text3)">${st.openCount} dari ${st.items.length} belum selesai</div>`}</td>
      <td><button class="tbl-btn" onclick="viewSession(${jsArg(w.sessId)})">👁 Sesi</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="6"><div class="empty"><div class="empty-ico">📋</div>
    <div class="empty-msg">${all.length ? 'Tidak ada WO Monitoring dengan filter ini.' : 'Belum ada WO Monitoring. WO dibuat saat crew menekan "Monitoring Lagi" tanpa memperbaiki temuan.'}</div></div></td></tr>`;
}

// ═══════════════════════════════════════════════════════
// CREW PORTAL: daftar WO Monitoring
// ═══════════════════════════════════════════════════════
function crewShowMonWo() {
  crewNav.screen = 'monwo';
  document.querySelectorAll('.crew-nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('crewNavMonWo')?.classList.add('active');
  regenerateFindings();
  syncMonitoringWoStatus();

  const mine = monitoringWos.filter(w => !currentUser?.unitId || w.unitId === currentUser.unitId)
    .sort((a, b) => (b.skippedAt || '').localeCompare(a.skippedAt || ''));
  const open = mine.filter(w => w.status !== 'Closed');
  const closed = mine.filter(w => w.status === 'Closed').slice(0, 15);

  const card = w => {
    const st = monWoState(w);
    const isOpen = w.status !== 'Closed';
    return `<div class="cw-eq ${isOpen ? 'needs-repair' : 'done'}">
      <div class="cw-eq-main"><div style="min-width:0;flex:1">
        <div class="cw-eq-name">${esc(w.equipName)}</div>
        <div class="cw-eq-meta">${esc([w.unitName, w.areaName].filter(Boolean).join(' · '))}</div>
        <div style="margin:6px 0 2px">${_monWoFindingChips(w, st)}</div>
        <div class="cw-eq-status"><span>${esc(w.id)} · di-skip ${esc(fmtDateTime(w.skippedAt))} oleh ${esc(w.skippedByName || w.skippedBy)}</span></div>
        ${w.reason ? `<div class="cw-eq-status"><span>📝 ${esc(w.reason)}</span></div>` : ''}
        ${isOpen ? '' : `<div class="cw-eq-status"><span class="cw-eq-ok">✅ Selesai${w.closeReason ? ' — ' + esc(w.closeReason) : ''}</span></div>`}
      </div></div>
      ${isOpen ? `<div class="cw-eq-actions">
        <button class="cw-btn repair" onclick="openRepairModal(${jsArg(w.unitId)},${jsArg(w.areaId)},${jsArg(w.equipId)})">🔧 Perbaiki</button>
        <button class="cw-btn primary" onclick="crewMonitorAgain(${jsArg(w.unitId)},${jsArg(w.areaId)},${jsArg(w.equipId)})">↻ Monitoring Lagi</button>
      </div>` : ''}
    </div>`;
  };

  document.getElementById('crewBody').innerHTML = `
    <div class="crew-sec-label">📋 WO Monitoring terbuka <span class="cw-count ${open.length ? 'alert' : ''}">${open.length}</span></div>
    <div class="crew-equip-list">${open.map(card).join('') ||
      '<div class="cw-done">✅ Tidak ada WO Monitoring yang terbuka.</div>'}</div>
    ${closed.length ? `<div class="crew-sec-label" style="margin-top:20px">✅ Sudah selesai</div>
      <div class="crew-equip-list">${closed.map(card).join('')}</div>` : ''}`;
}
