'use strict';

// ═══════════════════════════════════════════════════════
// ADD START: FINDING / ALARM SYSTEM
// ═══════════════════════════════════════════════════════

// Urutan kronologis sesi: tanggal monitoring → jam mulai → waktu input
function sessOrderKey(s) {
  return `${s.tanggal || ''} ${s.startTime || ''} ${s.createdAt || ''}`;
}

/**
 * regenerateFindings — bangun daftar finding dari semua sesi.
 *
 * Finding dianggap SELESAI (tidak aktif) jika:
 *   • item checklist WO-nya sudah Closed / WO-nya sudah Closed, atau
 *   • parameter yang sama pada equipment yang sama sudah dicek lagi di sesi yang lebih baru
 *     (normal kembali → selesai; masih bermasalah → digantikan finding yang lebih baru).
 * Versi lama menghitung SEMUA warning/alert sepanjang riwayat sebagai "aktif" selamanya.
 */
function regenerateFindings() {
  // Pembacaan terbaru per equipment + parameter
  const latest = {};
  sessions.forEach(s => (s.items || []).forEach(i => {
    if (!i.status) return;
    const k = [s.unitId, s.areaId, s.equipId, i.paramId].join('|');
    const order = sessOrderKey(s);
    if (!latest[k] || order > latest[k].order) latest[k] = { order, sessId: s.id, status: i.status };
  }));
  const woById = new Map(workOrders.map(w => [w.id, w]));
  // RCA per finding (yang sudah Closed diutamakan)
  const rcaByFinding = new Map();
  rcaReports.forEach(r => (r.findings || []).forEach(f => {
    const cur = rcaByFinding.get(f.findingId);
    if (!cur || (cur.status !== 'Closed' && r.status === 'Closed')) rcaByFinding.set(f.findingId, r);
  }));

  findings = [];
  sessions.forEach(sess => {
    const wo = sess.woId ? woById.get(sess.woId) : null;
    const woStatus = wo?.status || sess.woStatus || '';
    const woChecklist = Array.isArray(wo?.checklist) ? wo.checklist : (Array.isArray(sess.checklist) ? sess.checklist : []);

    (sess.items || []).forEach(item => {
      if (item.status !== 'WARNING' && item.status !== 'ALERT') return;
      const id = sess.id + '_' + item.paramId;
      const last = latest[[sess.unitId, sess.areaId, sess.equipId, item.paramId].join('|')];
      const woItem = woChecklist.find(c => c.id === id);

      const rca = rcaByFinding.get(id) || null;

      let resolved = '';
      if (rca?.status === 'Closed') resolved = 'Ditutup (RCA)';
      else if (woItem?.closeStatus === 'Closed' || woStatus === 'Closed') resolved = 'WO selesai';
      else if (last && last.sessId !== sess.id) resolved = last.status === 'OK' ? 'Normal kembali' : 'Ada pengecekan lebih baru';

      findings.push({
        id,
        tanggal:   sess.tanggal,
        order:     sessOrderKey(sess),
        unit:      sess.unitName  || '',
        unitId:    sess.unitId    || '',
        area:      sess.areaName  || '',
        areaId:    sess.areaId    || '',
        areaKey:   (sess.unitId || '') + '|' + (sess.areaId || ''),
        equipment: sess.equipName || '',
        equipId:   sess.equipId   || '',
        parameter: item.label     || item.paramId,
        value:     item.value     || '',
        unit_param:item.unit      || '',
        note:      item.note      || '',
        sessId:    sess.id,
        status:    item.status,
        woId:      sess.woId || '',
        hasWO:     !!sess.woId,
        resolved,
        active:    !resolved,
        rcaId:     rca?.id || '',
        rcaStatus: rca?.status || '',
      });
    });
  });

  // ALERT dulu, lalu yang terbaru
  findings.sort((a, b) =>
    (a.status === 'ALERT' ? 0 : 1) - (b.status === 'ALERT' ? 0 : 1) || b.order.localeCompare(a.order));

  const activeCount = findings.filter(f => f.active).length;
  // Update sidebar badge
  const badge = document.getElementById('sbFindingBadge');
  if (badge) {
    badge.textContent = activeCount;
    badge.classList.toggle('alert', activeCount > 0);
  }
  // Update dashboard sc-alert with finding count
  setText('sc-alert', activeCount);

  // Badge RCA yang masih open
  const rcaBadge = document.getElementById('sbRcaBadge');
  if (rcaBadge) {
    const openRca = rcaReports.filter(r => r.status !== 'Closed').length;
    rcaBadge.hidden = openRca === 0;
    rcaBadge.textContent = openRca;
  }
}
function renderFindingsPage() {
  regenerateFindings();

  const filterState = document.getElementById('findingStateFilter')?.value ?? 'active';
  const byState = filterState === 'active' ? findings.filter(f => f.active)
                : filterState === 'resolved' ? findings.filter(f => !f.active)
                : findings;

  // Populate area filter — dikunci per unit+area (nama area seperti "CTP 1" ada di Unit 1 & Unit 2)
  const areaFilter = document.getElementById('findingAreaFilter');
  if (areaFilter) {
    const cur = areaFilter.value;
    const areas = new Map();
    byState.forEach(f => { if (!areas.has(f.areaKey)) areas.set(f.areaKey, `${f.unit} / ${f.area}`); });
    areaFilter.innerHTML = '<option value="">Semua Area</option>' +
      [...areas].map(([k, label]) => `<option value="${esc(k)}" ${cur===k?'selected':''}>${esc(label)}</option>`).join('');
  }

  const filterArea   = document.getElementById('findingAreaFilter')?.value   || '';
  const filterStatus = document.getElementById('findingStatusFilter')?.value || '';

  let filtered = byState;
  if (filterArea)   filtered = filtered.filter(f => f.areaKey === filterArea);
  if (filterStatus) filtered = filtered.filter(f => f.status === filterStatus);

  const activeTotal = findings.filter(f => f.active).length;
  setText('findingCountLbl', `${filtered.length} finding ditampilkan · ${activeTotal} aktif dari ${findings.length} total riwayat`);

  // Summary cards per area
  const summaryEl = document.getElementById('findingSummaryCards');
  if (summaryEl) {
    const byArea = {};
    byState.forEach(f => {
      if (!byArea[f.areaKey]) byArea[f.areaKey] = { key: f.areaKey, unit: f.unit, area: f.area, WARNING: 0, ALERT: 0 };
      byArea[f.areaKey][f.status] = (byArea[f.areaKey][f.status] || 0) + 1;
    });
    summaryEl.innerHTML = Object.values(byArea).map(a => `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:12px 14px;cursor:pointer"
           onclick="document.getElementById('findingAreaFilter').value=${jsArg(a.key)};renderFindingsPage()">
        <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(a.area||'—')} <span style="font-weight:400;color:var(--text3)">· ${esc(a.unit)}</span></div>
        <div style="display:flex;gap:6px">
          <span class="badge b-alert">🚨 ${a.ALERT}</span>
          <span class="badge b-warn">⚠ ${a.WARNING}</span>
        </div>
      </div>`).join('') || '<div style="color:var(--text3);font-size:12px">Tidak ada finding</div>';
  }

  // Table
  const tbody = document.getElementById('findingsBody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty"><div class="empty-ico">✅</div><div class="empty-msg">Tidak ada finding${filterState==='active'?' aktif':''}${filterArea||filterStatus?' dengan filter ini':''}.</div></div></td></tr>`;
    return;
  }
  // Group findings by session
  const bySess = {};
  filtered.forEach(f => {
    if (!bySess[f.sessId]) {
      bySess[f.sessId] = {
        sessId: f.sessId, tanggal: f.tanggal,
        unit: f.unit, unitId: f.unitId,
        area: f.area, areaId: f.areaId,
        equipment: f.equipment, equipId: f.equipId,
        findings: [], hasWO: false, woId: ''
      };
    }
    bySess[f.sessId].findings.push(f);
    if (f.hasWO) { bySess[f.sessId].hasWO = true; bySess[f.sessId].woId = f.woId; }
  });

  const groups = Object.values(bySess)
    .sort((a,b) => {
      const aHasAlert = a.findings.some(f=>f.status==='ALERT') ? 0 : 1;
      const bHasAlert = b.findings.some(f=>f.status==='ALERT') ? 0 : 1;
      return aHasAlert - bHasAlert || b.findings[0].order.localeCompare(a.findings[0].order);
    });

  tbody.innerHTML = groups.map(g => {
    const alertCount = g.findings.filter(f=>f.status==='ALERT').length;
    const warnCount  = g.findings.filter(f=>f.status==='WARNING').length;
   // Cek status WO jika sudah ada
const existingWO = g.hasWO ? workOrders.find(w => w.id === g.woId) ||
  sessions.find(s => s.id === g.sessId && s.woId)
  : null;
const woStatus   = existingWO?.woStatus || existingWO?.status || 'Open';
const woDone     = existingWO?.checklistDone  || 0;
const woTotal    = existingWO?.checklistTotal || 0;

const woBtn = g.hasWO
  ? `<button class="tbl-btn"
       style="font-size:10px;background:${woStatus==='Closed'?'var(--green-dim)':'var(--orange-dim)'};
              color:${woStatus==='Closed'?'var(--green)':'var(--orange)'};
              border:1px solid ${woStatus==='Closed'?'rgba(74,158,63,.3)':'rgba(251,140,58,.3)'}"
       onclick="openWODetailModal('${esc(g.woId)}')">
       ${woStatus==='Closed' ? '✅' : '🔓'} ${esc(g.woId||'WO')}
       ${woTotal ? `· ${woDone}/${woTotal}` : ''}
     </button>`
  : `<button class="tbl-btn"
       style="font-size:10px;background:var(--blue-dim);color:var(--blue);
              border:1px solid rgba(43,108,184,.3)"
       onclick="openWOFromSession('${esc(g.sessId)}')">🔧 Buat WO</button>`;

    const detailRows = g.findings.map(f => `
      <tr style="background:${f.status==='ALERT'?'rgba(239,68,68,.04)':'rgba(249,115,22,.03)'};${f.active?'':'opacity:.6'}">
        <td style="padding:5px 12px 5px 28px;font-size:11px;color:var(--text3)" colspan="2">↳ ${esc(f.parameter)}
          ${f.resolved ? `<span class="badge b-ok" style="font-size:9px;margin-left:4px">✓ ${esc(f.resolved)}</span>` : ''}
          ${f.rcaId ? `<span class="badge ${f.rcaStatus === 'Closed' ? 'b-ok' : 'b-warn'}" style="font-size:9px;margin-left:4px;cursor:pointer"
              title="Buka RCA" onclick="openRcaModal(${jsArg(f.rcaId)})">${f.rcaStatus === 'Closed' ? '📄' : '📝 RCA berjalan ·'} ${esc(f.rcaId)}</span>` : ''}</td>
        <td style="padding:5px 12px;font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:600;color:${f.status==='ALERT'?'var(--red)':'var(--orange)'}">
          ${esc(f.value)} <span style="font-size:10px;font-weight:400;color:var(--text3)">${esc(f.unit_param)}</span>
        </td>
        <td style="padding:5px 12px"><span class="badge ${f.status==='ALERT'?'b-alert':'b-warn'}">${f.status}</span></td>
        <td style="padding:5px 12px;font-size:11px;color:var(--text3)">${esc(f.note||'—')}</td>
        <td colspan="3"></td>
      </tr>`).join('');

    return `
      <tr style="border-top:2px solid var(--border2)">
        <td style="font-size:11px;white-space:nowrap">${fmtDate(g.tanggal)}</td>
        <td><span class="badge b-blue">${esc(g.unit)}</span><div style="font-size:10px;color:var(--text3);margin-top:2px">${esc(g.area)}</div></td>
        <td style="font-weight:600;font-size:12px">${esc(g.equipment)}</td>
        <td>
          <span class="badge b-alert" style="margin-right:3px">🚨 ${alertCount}</span>
          <span class="badge b-warn">⚠ ${warnCount}</span>
        </td>
        <td style="font-size:11px;color:var(--text3)">${g.findings.length} temuan</td>
        <td>${woBtn}</td>
        <td colspan="2"><div style="display:flex;gap:4px;flex-wrap:wrap">
          ${rcaGroupButton(g)}
          <button class="tbl-btn" onclick="viewSession('${esc(g.sessId)}')">👁 Lihat Sesi</button>
        </div></td>
      </tr>
      ${detailRows}`;
  }).join('');
}
/** Tombol RCA per kelompok sesi: buat baru / lanjutkan draft / lihat RCA yang sudah selesai. */
function rcaGroupButton(g) {
  if (currentUser?.role === 'crew') return '';
  const openRca = g.findings.find(f => f.rcaStatus === 'Open');
  if (openRca) {
    return `<button class="tbl-btn rca-btn draft" onclick="openRcaModal(${jsArg(openRca.rcaId)})">📝 Lanjutkan RCA</button>`;
  }
  if (g.findings.some(f => f.active)) {
    return `<button class="tbl-btn rca-btn" onclick="openRcaForSession(${jsArg(g.sessId)})">🔍 RCA &amp; Tutup</button>`;
  }
  const closed = g.findings.find(f => f.rcaStatus === 'Closed');
  return closed ? `<button class="tbl-btn rca-btn done" onclick="printRca(${jsArg(closed.rcaId)})">🖨 Cetak RCA</button>` : '';
}
// ADD END: FINDING SYSTEM
