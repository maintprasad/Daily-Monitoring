'use strict';

// ═══════════════════════════════════════════════════════
// RENDER ALL
// ═══════════════════════════════════════════════════════
function renderAll() {
  regenerateFindings(); // harus duluan — renderDashboard() baca findings.length
  renderDashboard();
  renderTop5();
  renderHistory();
  renderHierTree();
  renderConfigPage();
  checkSeedBanners();
  // Re-render monitor page kalau sedang aktif
  if (document.getElementById('page-monitor')?.classList.contains('active')) {
    renderMonitorPage();
  }
}

let _dashUnitChart  = null;
let _dashDonutChart = null;
let _dashTrendChart = null;

function renderDashboard() {
  const today     = todayISO();
  const thisMonth = today.slice(0, 7);

  const todaySess  = sessions.filter(s => (s.tanggal||'').startsWith(today));
  const monthSess  = sessions.filter(s => (s.tanggal||'').startsWith(thisMonth));
  const allItems   = sessions.flatMap(s => s.items || []);

  // KPI
  setText('sc-month', monthSess.length);
  setText('sc-equip', countEquipments());
  const monitoredAreas = new Set(monthSess.map(s => s.areaId).filter(Boolean));
  setText('sc-areas', monitoredAreas.size);
  setText('sc-alert', findings.length);
  setText('sc-today', todaySess.length);
  setText('sc-total', sessions.length);
  setText('sc-ok',   allItems.filter(i => i.status === 'OK').length);
  setText('sc-warn', allItems.filter(i => i.status === 'WARNING').length);

  // Sesi terbaru
  const recent = [...sessions]
    .sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0))
    .slice(0, 10);
  const tbody = document.getElementById('recentBody');
  if (tbody) {
    if (!recent.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty"><div class="empty-ico">📊</div><div class="empty-msg">Belum ada sesi monitoring.</div></div></td></tr>`;
    } else {
      tbody.innerHTML = recent.map(s => dashRow(s)).join('');
    }
  }

  // Finding table di dashboard
  renderDashFindingTable();

  // Charts — Chart.js dimuat di index.html (sebelumnya di-inject berulang kali
  // setiap renderDashboard() selama library belum selesai dimuat)
  renderDashCharts();
}

function renderDashFindingTable() {
  const tbody = document.getElementById('dashFindingBody');
  const lbl   = document.getElementById('dashFindingLbl');
  if (!tbody) return;

  const active = findings.slice(0, 12); // max 12 baris di dashboard
  if (lbl) lbl.textContent = `${findings.length} temuan aktif — ${findings.filter(f=>f.status==='ALERT').length} Alert, ${findings.filter(f=>f.status==='WARNING').length} Warning`;

  if (!active.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty"><div class="empty-ico">✅</div><div class="empty-msg">Tidak ada finding aktif saat ini</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = active.map(f => {
    const stCls  = f.status === 'ALERT' ? 'b-alert' : 'b-warn';
    const rowBg  = f.status === 'ALERT' ? 'class="row-alert"' : 'class="row-warn"';
    // Cari WO dari workOrders atau sessions
    const sess   = sessions.find(s => s.id === f.sessId);
    const woId   = sess?.woId || '';
    const woCls  = sess?.woStatus === 'Closed' ? 'b-ok' : 'b-blue';
    const woText = woId
      ? `<span class="badge ${woCls}" style="font-size:9px;font-family:'IBM Plex Mono',monospace">${esc(woId.split('-').pop())}</span>`
      : `<button class="btn btn-ghost btn-xs" onclick="openWOFromSession('${esc(f.sessId)}')">+ Buat WO</button>`;

    // Progress WO
    let progressHtml = '—';
    if (woId) {
      const wo = workOrders.find(w => w.id === woId);
      const done  = wo?.checklistDone  || 0;
      const total = wo?.checklistTotal || 0;
      const pct   = total ? Math.round(done / total * 100) : 0;
      const barCol = pct === 100 ? 'var(--green)' : 'var(--orange)';
      progressHtml = total
        ? `<div style="display:flex;align-items:center;gap:5px">
             <div class="progress-wrap" style="width:50px"><div class="progress-bar" style="width:${pct}%;background:${barCol}"></div></div>
             <span style="font-size:10px;color:var(--text3)">${done}/${total}</span>
           </div>`
        : '—';
    }

    return `<tr ${rowBg}>
      <td style="font-size:10px;color:var(--text3);white-space:nowrap">${fmtDate(f.tanggal)}</td>
      <td>
        <span class="badge b-blue" style="font-size:9px">${esc(f.unit||'—')}</span>
        <div style="font-size:9px;color:var(--text3);margin-top:2px">${esc(f.area||'—')}</div>
      </td>
      <td class="finding-row-equip" style="font-size:11px;font-weight:600;max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(f.equipment||'—')}</td>
      <td style="font-size:11px;color:var(--text2)">${esc(f.parameter)}</td>
      <td style="font-family:'IBM Plex Mono',monospace;font-weight:600;color:${f.status==='ALERT'?'var(--red)':'var(--orange)'};white-space:nowrap">
        ${esc(f.value)} <span style="font-size:9px;font-weight:400;color:var(--text3)">${esc(f.unit_param||'')}</span>
      </td>
      <td><span class="badge ${stCls}">${f.status}</span></td>
      <td>${woText}</td>
      <td>${progressHtml}</td>
    </tr>`;
  }).join('');
}

function renderDashCharts() {
  if (typeof Chart === 'undefined') return;
  const isDark = isDarkTheme();
  const textCol = isDark ? 'rgba(255,255,255,.5)' : 'rgba(26,42,107,.45)';
  const gridCol = isDark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.06)';

  // ── 1. Bar Chart: Status per Unit ─────────────────
  const unitMap = {};
  sessions.forEach(s => {
    const uName = s.unitName || s.unitId || 'Lainnya';
    if (!unitMap[uName]) unitMap[uName] = { ok: 0, warn: 0, alert: 0 };
    const st = sessStatus(s);
    if (st === 'OK')      unitMap[uName].ok++;
    else if (st === 'WARNING') unitMap[uName].warn++;
    else if (st === 'ALERT')   unitMap[uName].alert++;
  });
  const unitLabels = Object.keys(unitMap);
  const unitOK    = unitLabels.map(u => unitMap[u].ok);
  const unitWarn  = unitLabels.map(u => unitMap[u].warn);
  const unitAlert = unitLabels.map(u => unitMap[u].alert);

  const ucEl = document.getElementById('dashUnitChart');
  if (ucEl) {
    if (_dashUnitChart) _dashUnitChart.destroy();
    _dashUnitChart = new Chart(ucEl, {
      type: 'bar',
      data: {
        labels: unitLabels.length ? unitLabels : ['Belum ada data'],
        datasets: [
          { label:'OK',      data: unitOK,    backgroundColor:'#4a9e3f', borderRadius:3, borderSkipped:false },
          { label:'Warning', data: unitWarn,  backgroundColor:'#fb8c3a', borderRadius:3, borderSkipped:false },
          { label:'Alert',   data: unitAlert, backgroundColor:'#c0392b', borderRadius:3, borderSkipped:false },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { stacked: true, ticks: { color: textCol, font: { size: 11 } }, grid: { display: false } },
          y: { stacked: true, ticks: { color: textCol, font: { size: 10 }, stepSize: 1 }, grid: { color: gridCol }, min: 0 }
        }
      }
    });
  }

  // ── 2. Donut: Distribusi Status Equipment ──────────
  let doOK = 0, doWarn = 0, doAlert = 0, doPend = 0, total = 0;
  hierarchy.units.forEach(u => (u.areas || []).forEach(a => (a.equipments || []).forEach(eq => {
    total++;
    const last = getLastSession(u.id, a.id, '', eq.id);
    const st = last ? sessStatus(last) : 'PENDING';
    if (st === 'OK')      doOK++;
    else if (st === 'WARNING') doWarn++;
    else if (st === 'ALERT')   doAlert++;
    else                       doPend++;
  })));
  setText('dashDonutTotal', total);
  setText('dashDonutOK',    doOK);
  setText('dashDonutWarn',  doWarn);
  setText('dashDonutAlert', doAlert);
  setText('dashDonutPend',  doPend);
  const sub = document.getElementById('dashDonutSub');
  if (sub) sub.textContent = `${total} equipment · semua area`;

  const dcEl = document.getElementById('dashDonutChart');
  if (dcEl) {
    if (_dashDonutChart) _dashDonutChart.destroy();
    _dashDonutChart = new Chart(dcEl, {
      type: 'doughnut',
      data: {
        labels: ['OK','Warning','Alert','Pending'],
        datasets: [{
          data: [doOK, doWarn, doAlert, doPend],
          backgroundColor: ['#4a9e3f','#fb8c3a','#c0392b','#8fa8bf'],
          borderWidth: 0, hoverOffset: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        cutout: '68%'
      }
    });
  }

  // ── 3. Area list (status per area) ────────────────
  const areaListEl = document.getElementById('dashAreaList');
  if (areaListEl) {
    const areaMap = {};
    sessions.forEach(s => {
      const key = (s.unitName||'?') + '||' + (s.areaName||'?');
      if (!areaMap[key]) areaMap[key] = { unit: s.unitName||'', area: s.areaName||'', ok:0, warn:0, alert:0 };
      const st = sessStatus(s);
      if (st === 'OK')           areaMap[key].ok++;
      else if (st === 'WARNING') areaMap[key].warn++;
      else if (st === 'ALERT')   areaMap[key].alert++;
    });
    const rows = Object.values(areaMap);
    if (!rows.length) {
      areaListEl.innerHTML = `<div style="color:var(--text3);font-size:12px;padding:8px">Belum ada data sesi.</div>`;
    } else {
      const hdr = `<div style="display:grid;grid-template-columns:1fr 40px 40px 40px;gap:4px;padding:4px 8px;font-size:9px;color:var(--text3);letter-spacing:.07em;text-transform:uppercase;border-bottom:1px solid var(--border);margin-bottom:3px">
        <span>Area</span><span style="text-align:center">OK</span><span style="text-align:center">Warn</span><span style="text-align:center">Alert</span>
      </div>`;
      const rowsHtml = rows.map(r => {
        const hasBad = r.alert > 0 ? 'rgba(239,68,68,.05)' : r.warn > 0 ? 'rgba(249,115,22,.04)' : 'transparent';
        return `<div style="display:grid;grid-template-columns:1fr 40px 40px 40px;gap:4px;padding:6px 8px;border-radius:5px;background:${hasBad};border:1px solid var(--border);margin-bottom:3px;align-items:center">
          <div>
            <div style="font-size:11px;font-weight:500;color:var(--text)">${esc(r.area)}</div>
            <div style="font-size:9px;color:var(--text3)">${esc(r.unit)}</div>
          </div>
          <div style="text-align:center"><span class="badge b-ok" style="padding:1px 5px;font-size:9px">${r.ok}</span></div>
          <div style="text-align:center"><span class="badge b-warn" style="padding:1px 5px;font-size:9px">${r.warn}</span></div>
          <div style="text-align:center"><span class="badge ${r.alert>0?'b-alert':'b-pend'}" style="padding:1px 5px;font-size:9px">${r.alert}</span></div>
        </div>`;
      }).join('');
      areaListEl.innerHTML = hdr + rowsHtml;
    }
  }

  // ── 4. Line chart: Tren 7 hari ────────────────────
  const days  = [];
  const dayLabels = [];
  const namaHari  = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(toLocalISODate(d));
    dayLabels.push(namaHari[d.getDay()]);
  }
  const trendData = days.map(day => sessions.filter(s => (s.tanggal||'').startsWith(day)).length);

  const tcEl = document.getElementById('dashTrendChart');
  if (tcEl) {
    if (_dashTrendChart) _dashTrendChart.destroy();
    _dashTrendChart = new Chart(tcEl, {
      type: 'line',
      data: {
        labels: dayLabels,
        datasets: [{
          label: 'Sesi',
          data: trendData,
          borderColor: '#2b6cb8',
          borderWidth: 2,
          backgroundColor: isDark ? 'rgba(43,108,184,.15)' : 'rgba(43,108,184,.08)',
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: '#2b6cb8',
          pointBorderColor: isDark ? '#1a2a3a' : '#fff',
          pointBorderWidth: 1.5
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: textCol, font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: textCol, font: { size: 10 }, stepSize: 1 }, grid: { color: gridCol }, min: 0 }
        }
      }
    });
  }
}

function dashRow(s) {
  const st = sessStatus(s);
  return `<tr>
    <td style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--green)">${esc(s.id)}</td>
    <td style="font-size:11px;color:var(--text3)">${fmtDate(s.tanggal)}</td>
    <td><span class="badge b-blue">${esc(s.unitName||'—')}</span></td>
    <td style="font-size:11px">${esc(s.areaName||'—')}</td>
    <td style="font-size:12px;font-weight:500">${esc(s.equipName||'—')}</td>
    <td style="font-size:11px">${esc(s.pic||'—')}</td>
    <td><span class="badge ${stBadge(st)}">${st}</span></td>
    <td style="font-size:11px;color:var(--text3);max-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.catatan||'—')}</td>
  </tr>`;
}

// ═══════════════════════════════════════════════════════
// TOP 5 EQUIPMENT SERING WARNING / ALERT
// ═══════════════════════════════════════════════════════
function renderTop5() {
  const alertCount = {};
  const warnCount  = {};
  const equipMeta  = {}; // id → { name, unit, area }

  sessions.forEach(s => {
    (s.items || []).forEach(item => {
      const key = s.equipId || s.equipName || 'unknown';
      if (!equipMeta[key]) {
        equipMeta[key] = {
          name: s.equipName || key,
          unit: s.unitName  || '',
          area: s.areaName  || '',
        };
      }
      if (item.status === 'ALERT') {
        alertCount[key] = (alertCount[key] || 0) + 1;
      } else if (item.status === 'WARNING') {
        warnCount[key]  = (warnCount[key]  || 0) + 1;
      }
    });
  });

  function buildTop5Html(countMap, color, barColor) {
    const sorted = Object.entries(countMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    if (!sorted.length) return `<div class="empty"><div class="empty-ico">✅</div><div class="empty-msg">Tidak ada data</div></div>`;
    const maxVal = sorted[0][1];
    return sorted.map(([key, cnt], idx) => {
      const meta  = equipMeta[key] || { name: key, unit: '', area: '' };
      const rankCls = idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : 'rank-other';
      const pct   = maxVal ? Math.round(cnt / maxVal * 100) : 0;
      return `<div class="top5-row">
        <div class="top5-rank ${rankCls}">${idx + 1}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(meta.name)}</div>
          <div style="font-size:9px;color:var(--text3);margin-top:1px">${esc(meta.unit)} · ${esc(meta.area)}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
            <div class="top5-bar-wrap"><div class="top5-bar" style="width:${pct}%;background:${barColor}"></div></div>
            <span class="badge" style="background:${color}20;color:${color};border:1px solid ${color}44;font-size:9px;white-space:nowrap">${cnt}×</span>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  const alertEl = document.getElementById('dashTop5Alert');
  const warnEl  = document.getElementById('dashTop5Warn');
  if (alertEl) alertEl.innerHTML = buildTop5Html(alertCount, 'var(--red)',    '#c0392b');
  if (warnEl)  warnEl.innerHTML  = buildTop5Html(warnCount,  'var(--orange)', '#fb8c3a');
}
