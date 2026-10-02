'use strict';

// ═══════════════════════════════════════════════════════
// ADD START: FINDING / ALARM SYSTEM
// ═══════════════════════════════════════════════════════

/**
 * regenerateFindings — derives findings from all sessions.
 * Called after saveAll() and on DOMContentLoaded.
 */
function regenerateFindings() {
  findings = [];
  sessions.forEach(sess => {
    (sess.items || []).forEach(item => {
      if (item.status === 'WARNING' || item.status === 'ALERT') {
        findings.push({
          id:        sess.id + '_' + item.paramId,
          tanggal:   sess.tanggal,
          unit:      sess.unitName  || '',
          unitId:    sess.unitId    || '',
          area:      sess.areaName  || '',
          areaId:    sess.areaId    || '',
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
        });
      }
    });
  });

  // Update sidebar badge
  const badge = document.getElementById('sbFindingBadge');
  if (badge) {
    badge.textContent = findings.length;
    badge.classList.toggle('alert', findings.length > 0);
  }
  // Update dashboard sc-alert with finding count
  setText('sc-alert', findings.length);
}
function renderFindingsPage() {
  regenerateFindings();

  // Populate area filter
  const areaFilter = document.getElementById('findingAreaFilter');
  if (areaFilter) {
    const cur = areaFilter.value;
    const areas = [...new Set(findings.map(f => f.area).filter(Boolean))];
    areaFilter.innerHTML = '<option value="">Semua Area</option>' +
      areas.map(a => `<option value="${esc(a)}" ${cur===a?'selected':''}>${esc(a)}</option>`).join('');
  }

  const filterArea   = document.getElementById('findingAreaFilter')?.value   || '';
  const filterStatus = document.getElementById('findingStatusFilter')?.value || '';

  let filtered = findings;
  if (filterArea)   filtered = filtered.filter(f => f.area   === filterArea);
  if (filterStatus) filtered = filtered.filter(f => f.status === filterStatus);

  setText('findingCountLbl', `${filtered.length} finding dari ${findings.length} total — auto-generated dari parameter melebihi batas`);

  // Summary cards per area
  const summaryEl = document.getElementById('findingSummaryCards');
  if (summaryEl) {
    const byArea = {};
    findings.forEach(f => {
      if (!byArea[f.area]) byArea[f.area] = { area: f.area, WARNING: 0, ALERT: 0 };
      byArea[f.area][f.status] = (byArea[f.area][f.status] || 0) + 1;
    });
    summaryEl.innerHTML = Object.values(byArea).map(a => `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:12px 14px;cursor:pointer"
           onclick="document.getElementById('findingAreaFilter').value=${jsArg(a.area)};renderFindingsPage()">
        <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(a.area||'—')}</div>
        <div style="display:flex;gap:6px">
          <span class="badge b-alert">🚨 ${a.ALERT}</span>
          <span class="badge b-warn">⚠ ${a.WARNING}</span>
        </div>
      </div>`).join('') || '<div style="color:var(--text3);font-size:12px">Tidak ada finding</div>';
  }

  // Table
  const tbody = document.getElementById('findingsBody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty"><div class="empty-ico">✅</div><div class="empty-msg">Tidak ada finding${filterArea||filterStatus?' dengan filter ini':''}.</div></div></td></tr>`;
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
      return aHasAlert - bHasAlert || (b.tanggal||'').localeCompare(a.tanggal||'');
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
      <tr style="background:${f.status==='ALERT'?'rgba(239,68,68,.04)':'rgba(249,115,22,.03)'}">
        <td style="padding:5px 12px 5px 28px;font-size:11px;color:var(--text3)" colspan="2">↳ ${esc(f.parameter)}</td>
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
        <td colspan="2"><button class="tbl-btn" onclick="viewSession('${esc(g.sessId)}')">👁 Lihat Sesi</button></td>
      </tr>
      ${detailRows}`;
  }).join('');
}
// ADD END: FINDING SYSTEM
