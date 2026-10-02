'use strict';

// ═══════════════════════════════════════════════════════
// MONTHLY REPORT GENERATOR (PDF & PPT)
// ═══════════════════════════════════════════════════════

function generateMonthlyReport(type) {
  const lbl = document.getElementById('reportStatusLbl');
  if (lbl) lbl.textContent = '⏳ Menyiapkan laporan...';

  // Kumpulkan data bulan ini
  const today     = new Date();
  const thisMonth = toLocalISODate(today).slice(0, 7);
  const monthName = today.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  const monthSessions = sessions.filter(s => (s.tanggal || '').startsWith(thisMonth));
  const allItems      = monthSessions.flatMap(s => s.items || []);

  const totalSesi  = monthSessions.length;
  const totalOK    = allItems.filter(i => i.status === 'OK').length;
  const totalWarn  = allItems.filter(i => i.status === 'WARNING').length;
  const totalAlert = allItems.filter(i => i.status === 'ALERT').length;

  // Ringkasan per Unit
  const unitMap = {};
  monthSessions.forEach(s => {
    const u = s.unitName || 'Lainnya';
    if (!unitMap[u]) unitMap[u] = { sesi: 0, ok: 0, warn: 0, alert: 0, areas: {} };
    unitMap[u].sesi++;
    (s.items || []).forEach(i => {
      if (i.status === 'OK')      unitMap[u].ok++;
      else if (i.status === 'WARNING') unitMap[u].warn++;
      else if (i.status === 'ALERT')   unitMap[u].alert++;
    });
    const a = s.areaName || 'Lainnya';
    if (!unitMap[u].areas[a]) unitMap[u].areas[a] = { sesi: 0, ok: 0, warn: 0, alert: 0, equips: {} };
    unitMap[u].areas[a].sesi++;
    (s.items || []).forEach(i => {
      if (i.status === 'OK')           unitMap[u].areas[a].ok++;
      else if (i.status === 'WARNING') unitMap[u].areas[a].warn++;
      else if (i.status === 'ALERT')   unitMap[u].areas[a].alert++;
    });
    const eq = s.equipName || 'Lainnya';
    if (!unitMap[u].areas[a].equips[eq]) unitMap[u].areas[a].equips[eq] = { sesi: 0, ok: 0, warn: 0, alert: 0 };
    unitMap[u].areas[a].equips[eq].sesi++;
    (s.items || []).forEach(i => {
      if (i.status === 'OK')           unitMap[u].areas[a].equips[eq].ok++;
      else if (i.status === 'WARNING') unitMap[u].areas[a].equips[eq].warn++;
      else if (i.status === 'ALERT')   unitMap[u].areas[a].equips[eq].alert++;
    });
  });

  // Top 5 Alert & Warning
  const eqAlertMap = {}, eqWarnMap = {}, eqMetaMap = {};
  monthSessions.forEach(s => {
    const key = s.equipName || s.equipId || '?';
    if (!eqMetaMap[key]) eqMetaMap[key] = { name: s.equipName || key, unit: s.unitName || '', area: s.areaName || '' };
    (s.items || []).forEach(i => {
      if (i.status === 'ALERT')   eqAlertMap[key] = (eqAlertMap[key] || 0) + 1;
      if (i.status === 'WARNING') eqWarnMap[key]  = (eqWarnMap[key]  || 0) + 1;
    });
  });
  const top5Alert = Object.entries(eqAlertMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const top5Warn  = Object.entries(eqWarnMap).sort((a,b)=>b[1]-a[1]).slice(0,5);

  // PIC & Frekuensi monitoring
  const picMap = {};
  monthSessions.forEach(s => {
    (s.pic || '').split(',').map(p => p.trim()).filter(Boolean).forEach(p => {
      picMap[p] = (picMap[p] || 0) + 1;
    });
  });

  // Rekomendasi otomatis
  const rekomendasi = [];
  Object.entries(unitMap).forEach(([uName, u]) => {
    Object.entries(u.areas).forEach(([aName, a]) => {
      Object.entries(a.equips).forEach(([eqName, eq]) => {
        if (eq.alert >= 3) rekomendasi.push({ level: '🔴 Perhatian Segera', equip: eqName, area: aName, unit: uName, reason: `${eq.alert}x Alert dalam sebulan` });
        else if (eq.warn >= 3) rekomendasi.push({ level: '🟠 Perlu Dimonitor', equip: eqName, area: aName, unit: uName, reason: `${eq.warn}x Warning dalam sebulan` });
      });
    });
  });

  setTimeout(() => {
    if (type === 'pdf') {
      buildPDFReport({ monthName, thisMonth, totalSesi, totalOK, totalWarn, totalAlert, unitMap, top5Alert, top5Warn, eqMetaMap, picMap, rekomendasi });
    } else {
      buildPPTReport({ monthName, thisMonth, totalSesi, totalOK, totalWarn, totalAlert, unitMap, top5Alert, top5Warn, eqMetaMap, picMap, rekomendasi });
    }
    if (lbl) lbl.textContent = `✅ Laporan ${type.toUpperCase()} berhasil di-download — ${new Date().toLocaleTimeString('id-ID')}`;
  }, 300);
}

// ─────────────────────────────────────────────
// PDF GENERATOR
// ─────────────────────────────────────────────
function buildPDFReport(d) {
  const { monthName, totalSesi, totalOK, totalWarn, totalAlert, unitMap, top5Alert, top5Warn, eqMetaMap, picMap, rekomendasi } = d;

  // ── Tabel detail unit ────────────────────────────────────────────────────────
  let unitRows = '';
  Object.entries(unitMap).forEach(([uName, u]) => {
    const stColor = u.alert > 0 ? '#fff0f0' : u.warn > 0 ? '#fffbf0' : '#f0fff4';
    const stBor   = u.alert > 0 ? '#e8a0a0' : u.warn > 0 ? '#e8d080' : '#80c8a0';
    unitRows += `<tr style="background:${stColor};border-left:3px solid ${stBor}">
      <td style="font-weight:700;color:#1a3a6b;padding:9px 12px">${esc(uName)}</td>
      <td style="text-align:center;padding:9px">${u.sesi}</td>
      <td style="text-align:center;color:#1e6b1e;font-weight:700;padding:9px">${u.ok}</td>
      <td style="text-align:center;color:#8c5a00;font-weight:700;padding:9px">${u.warn}</td>
      <td style="text-align:center;color:#7a1a1a;font-weight:700;padding:9px">${u.alert}</td>
      <td style="text-align:center;padding:9px">
        <span style="padding:3px 10px;border-radius:4px;font-size:10px;font-weight:700;
          background:${u.alert>0?'#fdecea':u.warn>0?'#fff3e0':'#e8f5e9'};
          color:${u.alert>0?'#7a1a1a':u.warn>0?'#8c5a00':'#1e6b1e'};
          border:1px solid ${u.alert>0?'#e8a0a0':u.warn>0?'#e8d080':'#80c8a0'}">
          ${u.alert>0?'PERLU PERHATIAN':u.warn>0?'PERLU MONITOR':'KONDISI BAIK'}
        </span>
      </td>
    </tr>`;
    Object.entries(u.areas).forEach(([aName, a]) => {
      unitRows += `<tr style="background:#fafafa">
        <td style="padding-left:28px;font-size:11px;color:#555;padding-top:7px;padding-bottom:7px">
          <span style="color:#aaa">└</span> ${esc(aName)}
        </td>
        <td style="text-align:center;font-size:11px;padding:7px">${a.sesi}</td>
        <td style="text-align:center;font-size:11px;color:#1e6b1e;padding:7px">${a.ok}</td>
        <td style="text-align:center;font-size:11px;color:#8c5a00;padding:7px">${a.warn}</td>
        <td style="text-align:center;font-size:11px;color:#7a1a1a;padding:7px">${a.alert}</td>
        <td></td>
      </tr>`;
      Object.entries(a.equips).forEach(([eqName, eq]) => {
        if (eq.warn > 0 || eq.alert > 0) {
          unitRows += `<tr style="background:#f8f8f8">
            <td style="padding-left:52px;font-size:10px;color:#888;padding-top:5px;padding-bottom:5px">
              <span style="color:#ccc">└─</span> ⚙ ${esc(eqName)}
            </td>
            <td style="text-align:center;font-size:10px;padding:5px">${eq.sesi}</td>
            <td style="text-align:center;font-size:10px;color:#1e6b1e;padding:5px">${eq.ok}</td>
            <td style="text-align:center;font-size:10px;color:#8c5a00;padding:5px">${eq.warn||'—'}</td>
            <td style="text-align:center;font-size:10px;color:#7a1a1a;padding:5px">${eq.alert||'—'}</td>
            <td></td>
          </tr>`;
        }
      });
    });
  });

  const top5AlertRows = top5Alert.map(([key, cnt], i) => {
    const m = eqMetaMap[key] || { name: key, unit: '', area: '' };
    const pct = top5Alert[0][1] ? Math.round(cnt / top5Alert[0][1] * 100) : 0;
    return `<tr>
      <td style="text-align:center;font-weight:700;color:${i===0?'#b8860b':i===1?'#888':i===2?'#8b4513':'#aaa'}">${['🥇','🥈','🥉','4','5'][i]}</td>
      <td style="font-weight:600">${esc(m.name)}</td><td>${esc(m.unit)}</td><td>${esc(m.area)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;background:#f0f0f0;height:8px;border-radius:4px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:#c0392b;border-radius:4px"></div>
          </div>
          <span style="color:#7a1a1a;font-weight:700;font-size:12px;min-width:28px">${cnt}×</span>
        </div>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" style="text-align:center;color:#4a9e3f;padding:16px">✅ Tidak ada Alert bulan ini</td></tr>';

  const top5WarnRows = top5Warn.map(([key, cnt], i) => {
    const m = eqMetaMap[key] || { name: key, unit: '', area: '' };
    const pct = top5Warn[0][1] ? Math.round(cnt / top5Warn[0][1] * 100) : 0;
    return `<tr>
      <td style="text-align:center;font-weight:700;color:${i===0?'#b8860b':i===1?'#888':i===2?'#8b4513':'#aaa'}">${['🥇','🥈','🥉','4','5'][i]}</td>
      <td style="font-weight:600">${esc(m.name)}</td><td>${esc(m.unit)}</td><td>${esc(m.area)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;background:#f0f0f0;height:8px;border-radius:4px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:#fb8c3a;border-radius:4px"></div>
          </div>
          <span style="color:#8c5a00;font-weight:700;font-size:12px;min-width:28px">${cnt}×</span>
        </div>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" style="text-align:center;color:#4a9e3f;padding:16px">✅ Tidak ada Warning bulan ini</td></tr>';

  const rekRows = rekomendasi.length
    ? rekomendasi.map(r => `<tr>
        <td>${r.level}</td>
        <td style="font-weight:600">${esc(r.equip)}</td>
        <td>${esc(r.unit)} · ${esc(r.area)}</td>
        <td><span style="background:${r.level.includes('Segera')?'#fdecea':'#fff3e0'};color:${r.level.includes('Segera')?'#7a1a1a':'#8c5a00'};padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700">${r.reason}</span></td>
      </tr>`).join('')
    : '<tr><td colspan="4" style="text-align:center;color:#1e6b1e;padding:14px">✅ Tidak ada rekomendasi mendesak — kondisi baik</td></tr>';

  const picRows = Object.entries(picMap)
    .sort((a,b) => b[1]-a[1])
    .map(([pic, cnt], i) => {
      const maxCnt = Object.values(picMap).reduce((a,b) => Math.max(a,b), 1);
      const pct    = Math.round(cnt / maxCnt * 100);
      return `<tr>
        <td style="font-weight:600">${esc(pic)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="flex:1;background:#f0f0f0;height:8px;border-radius:4px;overflow:hidden">
              <div style="width:${pct}%;height:100%;background:#2b6cb8;border-radius:4px"></div>
            </div>
            <span style="font-weight:700;color:#1a3a6b;font-size:12px;min-width:50px">${cnt} sesi</span>
          </div>
        </td>
      </tr>`;
    }).join('');

  // ── Hitung data grafik untuk Chart.js ────────────────────────────────────────
  const unitNames   = Object.keys(unitMap);
  const unitOKArr   = unitNames.map(u => unitMap[u].ok);
  const unitWarnArr = unitNames.map(u => unitMap[u].warn);
  const unitAlertArr= unitNames.map(u => unitMap[u].alert);

  const top5ALabels = top5Alert.slice(0,5).map(([k]) => (eqMetaMap[k]?.name || k).slice(0,20));
  const top5AData   = top5Alert.slice(0,5).map(([,v]) => v);
  const top5WLabels = top5Warn.slice(0,5).map(([k]) => (eqMetaMap[k]?.name || k).slice(0,20));
  const top5WData   = top5Warn.slice(0,5).map(([,v]) => v);

  // Tren 7 hari terakhir
  const today2 = new Date();
  const trendDays = [], trendLabels = [], trendData = [];
  const namaHari = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today2); d.setDate(d.getDate() - i);
    const key = toLocalISODate(d);
    trendDays.push(key);
    trendLabels.push(namaHari[d.getDay()]);
    trendData.push(sessions.filter(s => (s.tanggal||'').startsWith(key)).length);
  }

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8"/>
<title>Laporan Bulanan Monitoring — ${monthName}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"><\/script>
<style>
  @page { size: A4 portrait; margin: 15mm 15mm 20mm 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; font-size: 12px; line-height: 1.5; background: #fff; }

  /* ── Cover ── */
  .cover {
    min-height: 260mm;
    display: flex; flex-direction: column; justify-content: center; align-items: center;
    text-align: center; page-break-after: always;
    background: linear-gradient(160deg, #0d1f3c 0%, #1a3a6b 55%, #1e5c1e 100%);
    color: #fff; border-radius: 6px; padding: 60px 40px;
  }
  .cover-logo { font-size: 56px; margin-bottom: 16px; }
  .cover-company { font-size: 13px; letter-spacing: .22em; color: rgba(255,255,255,.6); text-transform: uppercase; margin-bottom: 20px; }
  .cover-title { font-size: 32px; font-weight: 700; line-height: 1.25; margin-bottom: 12px; }
  .cover-period { font-size: 20px; color: #7ddf6e; font-weight: 600; margin-bottom: 8px; }
  .cover-dept { font-size: 13px; color: rgba(255,255,255,.55); }
  .cover-date { margin-top: 28px; display: inline-block; padding: 8px 22px; border-radius: 20px; border: 1px solid rgba(255,255,255,.25); font-size: 11px; color: rgba(255,255,255,.6); }
  .cover-line { width: 60px; height: 3px; background: #4a9e3f; border-radius: 2px; margin: 20px auto; }

  /* ── Section header ── */
  h2 {
    font-size: 14px; font-weight: 700; color: #1a3a6b;
    padding: 8px 14px; margin: 0 0 12px;
    border-left: 4px solid #4a9e3f;
    background: linear-gradient(90deg, #e8f5e9 0%, transparent 100%);
    border-radius: 0 4px 4px 0;
  }
  h3 { font-size: 12px; font-weight: 600; color: #555; margin: 14px 0 8px; }

  /* ── Page break ── */
  .page-break { page-break-before: always; padding-top: 8px; }

  /* ── KPI cards ── */
  .kpi-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
  .kpi-box {
    border-radius: 8px; padding: 16px 12px; text-align: center;
    border: 1.5px solid #e0e0e0;
  }
  .kpi-num { font-size: 32px; font-weight: 700; line-height: 1; }
  .kpi-lbl { font-size: 10px; color: #777; text-transform: uppercase; letter-spacing: .07em; margin-top: 5px; }
  .kpi-green { background: #f0fff4; border-color: #80c8a0; }
  .kpi-green .kpi-num { color: #1e6b1e; }
  .kpi-orange { background: #fffbf0; border-color: #e8d080; }
  .kpi-orange .kpi-num { color: #8c5a00; }
  .kpi-red { background: #fff0f0; border-color: #e8a0a0; }
  .kpi-red .kpi-num { color: #7a1a1a; }
  .kpi-blue { background: #f0f4ff; border-color: #90b0e0; }
  .kpi-blue .kpi-num { color: #1a3a6b; }

  /* ── Table ── */
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 18px; }
  thead th {
    background: #1a3a6b; color: #fff; padding: 8px 10px;
    text-align: left; font-size: 10px; letter-spacing: .05em;
  }
  tbody td { padding: 7px 10px; border-bottom: 1px solid #eeeeee; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover { background: #f8f8f8; }

  /* ── Chart container ── */
  .chart-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
  .chart-box { border: 1px solid #e8e8e8; border-radius: 8px; padding: 14px; }
  .chart-title { font-size: 11px; font-weight: 700; color: #1a3a6b; margin-bottom: 10px; text-align: center; text-transform: uppercase; letter-spacing: .06em; }
  .chart-full { border: 1px solid #e8e8e8; border-radius: 8px; padding: 14px; margin-bottom: 16px; }

  /* ── Footer ── */
  .footer { margin-top: 32px; padding-top: 10px; border-top: 1px solid #e8e8e8; font-size: 9px; color: #aaa; text-align: center; }
  .footer strong { color: #1a3a6b; }

  /* ── Status pill ── */
  .pill { padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .cover { border-radius: 0; }
  }
</style>
</head>
<body>

<!-- ══ COVER ══════════════════════════════════════════════════════════ -->
<div class="cover">
  <div class="cover-logo">🌱</div>
  <div class="cover-company">Prasad Seeds Indonesia</div>
  <div class="cover-line"></div>
  <div class="cover-title">Laporan Bulanan<br>Kegiatan Monitoring Maintenance</div>
  <div class="cover-period">${monthName}</div>
  <div class="cover-dept">Departemen Electrical · Monitoring System v5</div>
  <div class="cover-date">📅 Digenerate: ${new Date().toLocaleDateString('id-ID',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div>
</div>

<!-- ══ HALAMAN 1: RINGKASAN & GRAFIK UTAMA ═══════════════════════════ -->
<h2>1. Ringkasan Eksekutif</h2>
<div class="kpi-row">
  <div class="kpi-box kpi-blue"><div class="kpi-num">${totalSesi}</div><div class="kpi-lbl">Total Sesi Monitoring</div></div>
  <div class="kpi-box kpi-green"><div class="kpi-num">${totalOK}</div><div class="kpi-lbl">Parameter Normal (OK)</div></div>
  <div class="kpi-box kpi-red"><div class="kpi-num">${totalAlert}</div><div class="kpi-lbl">Total Alert / Alarm</div></div>
</div>
<div class="kpi-row" style="grid-template-columns:1fr 1fr;max-width:60%">
  <div class="kpi-box kpi-orange"><div class="kpi-num">${totalWarn}</div><div class="kpi-lbl">Total Warning</div></div>
  <div class="kpi-box" style="border-color:#c0a0d0;background:#f8f0ff"><div class="kpi-num" style="color:#5a1a8a">${Object.keys(picMap).length}</div><div class="kpi-lbl">Teknisi Aktif</div></div>
</div>

<!-- GRAFIK BARIS 1: Donut + Tren -->
<div class="chart-grid">
  <div class="chart-box">
    <div class="chart-title">Distribusi Status Parameter</div>
    <canvas id="chartDonut" height="200"></canvas>
  </div>
  <div class="chart-box">
    <div class="chart-title">Tren Monitoring 7 Hari Terakhir</div>
    <canvas id="chartTrend" height="200"></canvas>
  </div>
</div>

<!-- GRAFIK BARIS 2: Bar per Unit -->
<div class="chart-full">
  <div class="chart-title">Status per Unit Produksi (OK / Warning / Alert)</div>
  <canvas id="chartUnit" height="160"></canvas>
</div>

<!-- ══ HALAMAN 2: DETAIL UNIT & TOP 5 ════════════════════════════════ -->
<div class="page-break">
<h2>2. Detail Status per Unit & Area</h2>
<table>
  <thead><tr>
    <th>Unit / Area / Equipment</th>
    <th style="text-align:center;width:55px">Sesi</th>
    <th style="text-align:center;width:50px">OK</th>
    <th style="text-align:center;width:60px">Warning</th>
    <th style="text-align:center;width:50px">Alert</th>
    <th style="width:120px">Kondisi</th>
  </tr></thead>
  <tbody>${unitRows || '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:16px">Belum ada data bulan ini</td></tr>'}</tbody>
</table>

<!-- GRAFIK TOP 5 -->
<div class="chart-grid">
  <div class="chart-box">
    <div class="chart-title" style="color:#7a1a1a">🔴 Top 5 Equipment — Alert Terbanyak</div>
    <canvas id="chartTop5Alert" height="200"></canvas>
  </div>
  <div class="chart-box">
    <div class="chart-title" style="color:#8c5a00">🟠 Top 5 Equipment — Warning Terbanyak</div>
    <canvas id="chartTop5Warn" height="200"></canvas>
  </div>
</div>
</div>

<!-- ══ HALAMAN 3: TABEL TOP 5 + PIC + REKOMENDASI ═══════════════════ -->
<div class="page-break">
<h2>3. Analisis Equipment Bermasalah</h2>
<h3>🔴 Top 5 Equipment — Paling Sering Alert</h3>
<table>
  <thead><tr><th style="width:32px">#</th><th>Equipment</th><th>Unit</th><th>Area</th><th style="min-width:140px">Frekuensi Alert</th></tr></thead>
  <tbody>${top5AlertRows}</tbody>
</table>

<h3>🟠 Top 5 Equipment — Paling Sering Warning</h3>
<table>
  <thead><tr><th style="width:32px">#</th><th>Equipment</th><th>Unit</th><th>Area</th><th style="min-width:140px">Frekuensi Warning</th></tr></thead>
  <tbody>${top5WarnRows}</tbody>
</table>

<h2>4. Aktivitas PIC / Teknisi</h2>
<table>
  <thead><tr><th>Nama Teknisi</th><th style="min-width:180px">Partisipasi Monitoring</th></tr></thead>
  <tbody>${picRows || '<tr><td colspan="2" style="text-align:center;color:#aaa;padding:14px">Tidak ada data</td></tr>'}</tbody>
</table>

<h2>5. Rekomendasi Tindak Lanjut</h2>
<table>
  <thead><tr><th style="width:110px">Level</th><th>Equipment</th><th>Lokasi</th><th>Alasan</th></tr></thead>
  <tbody>${rekRows}</tbody>
</table>
</div>

<div class="footer">
  <strong>Prasad Seeds Indonesia</strong> · Electrical Monitoring System v5 ·
  Laporan digenerate otomatis pada ${new Date().toLocaleString('id-ID')} ·
  <em>Dokumen ini bersifat KONFIDENSIAL — hanya untuk internal perusahaan</em>
</div>

<script>
// ── Jalankan chart setelah halaman load ──────────────────────────
window.addEventListener('load', function() {
  const unitNamesArr   = ${jsonForScript(unitNames)};
  const unitOKArr      = ${jsonForScript(unitOKArr)};
  const unitWarnArr    = ${jsonForScript(unitWarnArr)};
  const unitAlertArr   = ${jsonForScript(unitAlertArr)};
  const top5ALabels    = ${jsonForScript(top5ALabels)};
  const top5AData      = ${jsonForScript(top5AData)};
  const top5WLabels    = ${jsonForScript(top5WLabels)};
  const top5WData      = ${jsonForScript(top5WData)};
  const trendLabels    = ${jsonForScript(trendLabels)};
  const trendData      = ${jsonForScript(trendData)};
  const totalOK2       = ${totalOK};
  const totalWarn2     = ${totalWarn};
  const totalAlert2    = ${totalAlert};

  const FONT = { family: "'Segoe UI', Arial, sans-serif" };
  Chart.defaults.font.family = FONT.family;
  Chart.defaults.font.size   = 11;

  // Donut — distribusi status
  new Chart(document.getElementById('chartDonut'), {
    type: 'doughnut',
    data: {
      labels: ['Normal / OK', 'Warning', 'Alert / Alarm'],
      datasets: [{ data: [totalOK2, totalWarn2, totalAlert2], backgroundColor: ['#4a9e3f','#fb8c3a','#c0392b'], borderWidth: 2, borderColor: '#fff', hoverOffset: 5 }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      cutout: '62%',
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 12, padding: 14, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => ' ' + ctx.label + ': ' + ctx.raw } }
      }
    }
  });

  // Tren 7 hari — line chart
  new Chart(document.getElementById('chartTrend'), {
    type: 'line',
    data: {
      labels: trendLabels,
      datasets: [{
        label: 'Sesi Monitoring',
        data: trendData,
        borderColor: '#2b6cb8', borderWidth: 2.5,
        backgroundColor: 'rgba(43,108,184,.12)',
        fill: true, tension: 0.4,
        pointRadius: 5, pointBackgroundColor: '#2b6cb8', pointBorderColor: '#fff', pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { min: 0, ticks: { stepSize: 1, font: { size: 10 } }, grid: { color: 'rgba(0,0,0,.06)' } }
      }
    }
  });

  // Bar stacked per unit
  new Chart(document.getElementById('chartUnit'), {
    type: 'bar',
    data: {
      labels: unitNamesArr.length ? unitNamesArr : ['Belum ada data'],
      datasets: [
        { label: 'OK',      data: unitOKArr,    backgroundColor: '#4a9e3f', borderRadius: 3 },
        { label: 'Warning', data: unitWarnArr,  backgroundColor: '#fb8c3a', borderRadius: 3 },
        { label: 'Alert',   data: unitAlertArr, backgroundColor: '#c0392b', borderRadius: 3 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, padding: 14 } },
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, min: 0, ticks: { stepSize: 1 }, grid: { color: 'rgba(0,0,0,.06)' } }
      }
    }
  });

  // Bar horizontal — Top 5 Alert
  if (document.getElementById('chartTop5Alert')) {
    new Chart(document.getElementById('chartTop5Alert'), {
      type: 'bar',
      data: {
        labels: top5ALabels.length ? top5ALabels : ['Tidak ada data'],
        datasets: [{ label: 'Alert', data: top5AData, backgroundColor: '#c0392b', borderRadius: 4 }]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { min: 0, ticks: { stepSize: 1 }, grid: { color: 'rgba(0,0,0,.06)' } },
          y: { grid: { display: false }, ticks: { font: { size: 10 } } }
        }
      }
    });
  }

  // Bar horizontal — Top 5 Warning
  if (document.getElementById('chartTop5Warn')) {
    new Chart(document.getElementById('chartTop5Warn'), {
      type: 'bar',
      data: {
        labels: top5WLabels.length ? top5WLabels : ['Tidak ada data'],
        datasets: [{ label: 'Warning', data: top5WData, backgroundColor: '#fb8c3a', borderRadius: 4 }]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { min: 0, ticks: { stepSize: 1 }, grid: { color: 'rgba(0,0,0,.06)' } },
          y: { grid: { display: false }, ticks: { font: { size: 10 } } }
        }
      }
    });
  }

  // Tunda print agar chart sempat render
  setTimeout(() => window.print(), 1800);
});
<\/script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) { toast('Popup diblokir browser — izinkan popup untuk membuat laporan PDF', 'error', 6000); return; }
  win.document.write(html);
  win.document.close();
}
// PPT GENERATOR (HTML → download .html styled as slides)
// Note: PPT asli butuh library besar (pptxgenjs ~2MB).
// Ini menghasilkan file HTML slide-style yang bisa
// diprint ke PDF per slide atau dibuka sebagai presentasi.
// ─────────────────────────────────────────────
function buildPPTReport(d) {
  const { monthName, totalSesi, totalOK, totalWarn, totalAlert, unitMap, top5Alert, top5Warn, eqMetaMap, picMap, rekomendasi } = d;

  function slide(num, title, content, bgColor) {
    bgColor = bgColor || '#ffffff';
    return `<div class="slide" style="background:${bgColor}">
      <div class="slide-num">${num}</div>
      <div class="slide-inner">
        <div class="slide-title">${title}</div>
        <div class="slide-content">${content}</div>
      </div>
    </div>`;
  }

  // Slide 1 — Cover
  const s1 = slide(1,
    '',
    `<div style="text-align:center;padding:60px 0">
      <div style="font-size:13px;letter-spacing:.15em;color:#4a9e3f;text-transform:uppercase;margin-bottom:16px">PRASAD SEEDS INDONESIA</div>
      <div style="font-size:38px;font-weight:700;color:#1a3a6b;line-height:1.2;margin-bottom:12px">
        Presentasi Bulanan<br>Kegiatan Monitoring Maintenance
      </div>
      <div style="font-size:22px;color:#4a9e3f;font-weight:600;margin-bottom:12px">${monthName}</div>
      <div style="font-size:13px;color:#888">Departemen Electrical · Monitoring System v5</div>
      <div style="margin-top:20px;font-size:11px;color:#aaa">${new Date().toLocaleDateString('id-ID', {weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div>
    </div>`,
    'linear-gradient(135deg, #f4f7f4 0%, #e8f0ff 100%)'
  );

  // Slide 2 — Summary KPI
  const s2 = slide(2,
    '📊 Ringkasan Kegiatan Monitoring',
    `<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:20px;margin-top:24px">
      ${[
        {num:totalSesi, lbl:'Total Sesi', col:'#2b6cb8'},
        {num:totalOK,   lbl:'Parameter OK', col:'#4a9e3f'},
        {num:totalWarn, lbl:'Warning', col:'#fb8c3a'},
        {num:totalAlert,lbl:'Alert / Alarm', col:'#c0392b'},
      ].map(k => `
        <div style="border:2px solid ${k.col};border-radius:12px;padding:24px 16px;text-align:center">
          <div style="font-size:52px;font-weight:700;color:${k.col}">${k.num}</div>
          <div style="font-size:14px;color:#555;margin-top:6px">${k.lbl}</div>
        </div>`).join('')}
    </div>
    <div style="margin-top:24px;font-size:13px;color:#666;text-align:center">
      Total monitoring bulan <strong style="color:#1a3a6b">${monthName}</strong> oleh ${Object.keys(picMap).length} teknisi
    </div>`
  );

  // Slide 3 — Status per Unit
  const unitEntries = Object.entries(unitMap);
  const s3 = slide(3,
    '🏭 Status per Unit',
    `<table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px">
      <thead><tr style="background:#1a3a6b;color:#fff">
        <th style="padding:10px 14px;text-align:left">Unit</th>
        <th style="padding:10px 14px;text-align:center">Sesi</th>
        <th style="padding:10px 14px;text-align:center">OK</th>
        <th style="padding:10px 14px;text-align:center">Warning</th>
        <th style="padding:10px 14px;text-align:center">Alert</th>
        <th style="padding:10px 14px;text-align:center">Status</th>
      </tr></thead>
      <tbody>
        ${unitEntries.map(([uName, u]) => {
          const bg  = u.alert>0?'#fdecea':u.warn>0?'#fff8f0':'#f0faf0';
          const stc = u.alert>0?'#8c2518':u.warn>0?'#c06010':'#2d7a24';
          const stl = u.alert>0?'PERLU PERHATIAN':u.warn>0?'PERLU MONITOR':'KONDISI BAIK';
          return `<tr style="background:${bg}">
            <td style="padding:10px 14px;font-weight:700;color:#1a3a6b">${esc(uName)}</td>
            <td style="text-align:center;padding:10px">${u.sesi}</td>
            <td style="text-align:center;padding:10px;color:#2d7a24;font-weight:700">${u.ok}</td>
            <td style="text-align:center;padding:10px;color:#c06010;font-weight:700">${u.warn}</td>
            <td style="text-align:center;padding:10px;color:#8c2518;font-weight:700">${u.alert}</td>
            <td style="text-align:center;padding:10px"><span style="background:${stc}20;color:${stc};border:1.5px solid ${stc}44;padding:3px 10px;border-radius:5px;font-size:12px;font-weight:700">${stl}</span></td>
          </tr>`;
        }).join('') || '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:20px">Belum ada data</td></tr>'}
      </tbody>
    </table>`
  );

  // Slide 4 — Top 5 Alert
  const s4 = slide(4,
    '🔴 Top 5 Equipment — Paling Sering Alert',
    `<div style="margin-top:16px">
      ${top5Alert.length
        ? top5Alert.map(([key, cnt], i) => {
            const m   = eqMetaMap[key] || { name: key, unit: '', area: '' };
            const pct = top5Alert[0][1] ? Math.round(cnt / top5Alert[0][1] * 100) : 0;
            const rank = ['🥇','🥈','🥉','4️⃣','5️⃣'][i];
            return `<div style="display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid #f0f0f0">
              <div style="font-size:24px;width:36px;text-align:center">${rank}</div>
              <div style="flex:1">
                <div style="font-size:15px;font-weight:700;color:#1a3a6b">${esc(m.name)}</div>
                <div style="font-size:11px;color:#888;margin-top:2px">${esc(m.unit)} · ${esc(m.area)}</div>
                <div style="background:#e0e0e0;height:8px;border-radius:4px;margin-top:6px;overflow:hidden">
                  <div style="width:${pct}%;height:100%;background:#c0392b;border-radius:4px"></div>
                </div>
              </div>
              <div style="font-size:22px;font-weight:700;color:#8c2518;min-width:50px;text-align:right">${cnt}×</div>
            </div>`;
          }).join('')
        : '<div style="text-align:center;color:#4a9e3f;font-size:16px;padding:40px">✅ Tidak ada data Alert bulan ini — kondisi baik!</div>'
      }
    </div>`
  );

  // Slide 5 — Top 5 Warning
  const s5 = slide(5,
    '🟠 Top 5 Equipment — Paling Sering Warning',
    `<div style="margin-top:16px">
      ${top5Warn.length
        ? top5Warn.map(([key, cnt], i) => {
            const m   = eqMetaMap[key] || { name: key, unit: '', area: '' };
            const pct = top5Warn[0][1] ? Math.round(cnt / top5Warn[0][1] * 100) : 0;
            const rank = ['🥇','🥈','🥉','4️⃣','5️⃣'][i];
            return `<div style="display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid #f0f0f0">
              <div style="font-size:24px;width:36px;text-align:center">${rank}</div>
              <div style="flex:1">
                <div style="font-size:15px;font-weight:700;color:#1a3a6b">${esc(m.name)}</div>
                <div style="font-size:11px;color:#888;margin-top:2px">${esc(m.unit)} · ${esc(m.area)}</div>
                <div style="background:#e0e0e0;height:8px;border-radius:4px;margin-top:6px;overflow:hidden">
                  <div style="width:${pct}%;height:100%;background:#fb8c3a;border-radius:4px"></div>
                </div>
              </div>
              <div style="font-size:22px;font-weight:700;color:#c06010;min-width:50px;text-align:right">${cnt}×</div>
            </div>`;
          }).join('')
        : '<div style="text-align:center;color:#4a9e3f;font-size:16px;padding:40px">✅ Tidak ada data Warning bulan ini</div>'
      }
    </div>`
  );

  // Slide 6 — Detail per Area
  const areaSlides = [];
  unitEntries.forEach(([uName, u]) => {
    const areaRows = Object.entries(u.areas).map(([aName, a]) => {
      const bg = a.alert>0?'#fdecea':a.warn>0?'#fff8f0':'#f8faf8';
      return `<tr style="background:${bg}">
        <td style="padding:8px 12px">${esc(aName)}</td>
        <td style="text-align:center;padding:8px">${a.sesi}</td>
        <td style="text-align:center;color:#2d7a24;font-weight:700;padding:8px">${a.ok}</td>
        <td style="text-align:center;color:#c06010;font-weight:700;padding:8px">${a.warn}</td>
        <td style="text-align:center;color:#8c2518;font-weight:700;padding:8px">${a.alert}</td>
      </tr>`;
    }).join('');

    areaSlides.push(slide(
      6 + areaSlides.length,
      `📁 Detail Area — ${esc(uName)}`,
      `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px">
        <thead><tr style="background:#1a3a6b;color:#fff">
          <th style="padding:8px 12px;text-align:left">Area</th>
          <th style="text-align:center;padding:8px">Sesi</th>
          <th style="text-align:center;padding:8px">OK</th>
          <th style="text-align:center;padding:8px">Warning</th>
          <th style="text-align:center;padding:8px">Alert</th>
        </tr></thead>
        <tbody>${areaRows || '<tr><td colspan="5" style="text-align:center;padding:16px;color:#aaa">Tidak ada data</td></tr>'}</tbody>
      </table>`
    ));
  });

  // Slide terakhir — Rekomendasi & Penutup
  const sLast = slide(
    6 + areaSlides.length,
    '📋 Rekomendasi Tindak Lanjut',
    `<div style="margin-top:16px">
      ${rekomendasi.length
        ? rekomendasi.map(r => `
            <div style="display:flex;gap:14px;align-items:flex-start;padding:12px 16px;
                        border-radius:8px;margin-bottom:10px;
                        background:${r.level.includes('Segera')?'#fdecea':'#fff8f0'};
                        border-left:4px solid ${r.level.includes('Segera')?'#c0392b':'#fb8c3a'}">
              <div style="font-size:22px">${r.level.slice(0,2)}</div>
              <div>
                <div style="font-size:15px;font-weight:700;color:#1a3a6b">${esc(r.equip)}</div>
                <div style="font-size:12px;color:#666;margin-top:2px">${esc(r.unit)} · ${esc(r.area)}</div>
                <div style="font-size:12px;color:#888;margin-top:4px">${r.reason}</div>
              </div>
              <div style="margin-left:auto;font-size:12px;font-weight:700;
                          color:${r.level.includes('Segera')?'#8c2518':'#c06010'};
                          white-space:nowrap">${r.level.includes('Segera')?'ACTION REQUIRED':'MONITOR'}</div>
            </div>`).join('')
        : `<div style="text-align:center;padding:40px;color:#4a9e3f">
             <div style="font-size:48px;margin-bottom:12px">✅</div>
             <div style="font-size:18px;font-weight:700">Semua dalam kondisi baik!</div>
             <div style="font-size:13px;color:#888;margin-top:8px">Tidak ada rekomendasi mendesak bulan ini</div>
           </div>`
      }
    </div>
    <div style="margin-top:24px;padding:14px 18px;background:#f0faf0;border-radius:8px;font-size:13px;color:#2d7a24;text-align:center">
      Terima kasih atas dedikasi tim monitoring Electrical Prasad Seeds — ${monthName}
    </div>`
  );

  const allSlides = [s1, s2, s3, s4, s5, ...areaSlides, sLast].join('');

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8"/>
<title>Presentasi Bulanan Kegiatan Monitoring Maintenance — ${monthName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: #2a2a2a; }
  .slide {
    width: 960px; min-height: 540px;
    margin: 20px auto; border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0,0,0,.35);
    position: relative; overflow: hidden;
    page-break-after: always;
  }
  .slide-inner { padding: 48px 56px; }
  .slide-title {
    font-size: 24px; font-weight: 700; color: #1a3a6b;
    padding-bottom: 12px; border-bottom: 3px solid #4a9e3f;
    margin-bottom: 0;
  }
  .slide-content { margin-top: 0; }
  .slide-num {
    position: absolute; bottom: 14px; right: 18px;
    font-size: 11px; color: #ccc;
    font-family: monospace;
  }
  @media print {
    body { background: #fff; }
    .slide { margin: 0; border-radius: 0; box-shadow: none; width: 100%; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
<div class="no-print" style="text-align:center;padding:16px;background:#1a3a6b;color:#fff;font-size:13px">
  💡 <strong>Presentasi Bulanan Kegiatan Monitoring Maintenance — ${monthName}</strong> &nbsp;|&nbsp;
  Untuk simpan sebagai PDF: tekan <kbd style="background:#fff;color:#1a3a6b;padding:2px 7px;border-radius:4px">Ctrl+P</kbd> → Simpan sebagai PDF
</div>
${allSlides}
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href:     url,
    download: `Presentasi_Bulanan_Monitoring_${thisMonthISO()}.html`
  });
  a.click();
  URL.revokeObjectURL(url);
}
