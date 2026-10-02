'use strict';

// ═══════════════════════════════════════════════════════
// ROOT CAUSE ANALYSIS (RCA) — penutupan finding daily monitoring
//   • Satu RCA menutup satu/lebih finding (parameter WARNING/ALERT) dari satu sesi
//   • Draft (Open)  → finding tetap aktif, ditandai "RCA berjalan"
//   • Tutup (Closed) → wajib akar masalah + tindakan korektif; finding jadi tidak aktif
//   • Disimpan ke database lewat sync (tabel rca_reports & rca_findings)
// Ke depan semua temuan (PM & daily monitoring) diarahkan ke WO; untuk sekarang
// temuan daily monitoring bisa ditutup langsung di sini.
// ═══════════════════════════════════════════════════════
const RCA_CATEGORIES = [
  ['Man',         'Man — Manusia / operator'],
  ['Machine',     'Machine — Mesin / peralatan'],
  ['Method',      'Method — Metode / prosedur'],
  ['Material',    'Material — Bahan / suku cadang'],
  ['Measurement', 'Measurement — Pengukuran / instrumen'],
  ['Environment', 'Environment — Lingkungan'],
];
const RCA_CATEGORY_LABEL = Object.fromEntries(RCA_CATEGORIES);

let _rcaEditing = null; // salinan RCA yang sedang dibuka di modal

function canManageRca() {
  return !!currentUser && currentUser.role !== 'crew';
}

function _newRcaId() {
  return 'RCA-' + todayISO().replace(/-/g, '') + '-' + shortId('').slice(-5);
}

/** Buka RCA baru untuk sesi (atau lanjutkan draft yang sudah ada untuk sesi tsb). */
function openRcaForSession(sessId) {
  if (!canManageRca()) { toast('Hanya Leader ke atas yang bisa menutup finding', 'error'); return; }
  regenerateFindings();
  const draft = rcaReports.find(r => r.sessId === sessId && r.status !== 'Closed');
  if (draft) { openRcaModal(draft.id); return; }

  const sess = sessions.find(s => s.id === sessId);
  const active = findings.filter(f => f.sessId === sessId && f.active);
  if (!sess || !active.length) { toast('Tidak ada finding aktif untuk sesi ini', 'info'); return; }

  _rcaEditing = {
    id: _newRcaId(),
    sessId,
    unitId: sess.unitId || '', unitName: sess.unitName || '',
    areaId: sess.areaId || '', areaName: sess.areaName || '',
    equipId: sess.equipId || '', equipName: sess.equipName || '',
    findings: active.map(_rcaFindingOf),
    problem: `${sess.equipName || 'Equipment'} (${[sess.unitName, sess.areaName].filter(Boolean).join(' / ')}) — ` +
      active.map(f => `${f.parameter} ${f.value} ${f.unit_param} (${f.status})`.replace(/\s+/g, ' ')).join(', ') +
      ` pada monitoring ${fmtDate(sess.tanggal)}.`,
    category: '', whys: ['', '', '', '', ''],
    rootCause: '', correctiveAction: '', preventiveAction: '',
    actionPic: '', targetDate: '', verification: '',
    status: 'Open',
    createdBy: currentUser?.username || '', createdByName: currentUser?.name || currentUser?.username || '',
    createdAt: new Date().toISOString(),
    closedBy: '', closedAt: '',
    _isNew: true,
  };
  _renderRcaModal();
}

function _rcaFindingOf(f) {
  return { findingId: f.id, sessId: f.sessId, paramId: f.id.slice(f.sessId.length + 1),
           parameter: f.parameter, value: String(f.value ?? ''), unit: f.unit_param || '', status: f.status };
}

function openRcaModal(rcaId) {
  const r = rcaReports.find(x => x.id === rcaId);
  if (!r) { toast('RCA tidak ditemukan', 'error'); return; }
  _rcaEditing = JSON.parse(JSON.stringify(r));
  if (!Array.isArray(_rcaEditing.whys)) _rcaEditing.whys = [];
  while (_rcaEditing.whys.length < 5) _rcaEditing.whys.push('');
  _renderRcaModal();
}

function _renderRcaModal() {
  const r = _rcaEditing;
  const readOnly = !canManageRca();
  const closed = r.status === 'Closed';
  const sess = sessions.find(s => s.id === r.sessId);
  regenerateFindings();

  // Finding pada sesi ini yang bisa dipilih: yang sudah ada di RCA ini + yang masih aktif & belum punya RCA lain
  const chosen = new Set(r.findings.map(f => f.findingId));
  const candidates = findings.filter(f => f.sessId === r.sessId &&
    (chosen.has(f.id) || (f.active && (!f.rcaId || f.rcaId === r.id))));
  const missing = r.findings.filter(f => !candidates.some(c => c.id === f.findingId)); // sesi sudah berubah/dihapus
  const findingRows = [
    ...candidates.map(f => ({ id: f.id, parameter: f.parameter, value: f.value, unit: f.unit_param, status: f.status })),
    ...missing.map(f => ({ id: f.findingId, parameter: f.parameter, value: f.value, unit: f.unit, status: f.status })),
  ];

  setText('rcaTitle', `🔍 Root Cause Analysis — ${r.equipName || ''}`);
  const picOptions = [...new Set([...PIC_LIST, ...USERS.map(u => u.name).filter(Boolean)])];

  document.getElementById('rcaBody').innerHTML = `
    <div class="rca-head">
      <div><div class="dl">No. RCA</div><div class="dv mono">${esc(r.id)}</div></div>
      <div><div class="dl">Equipment</div><div class="dv">${esc(r.equipName || '—')}</div></div>
      <div><div class="dl">Unit / Area</div><div class="dv">${esc([r.unitName, r.areaName].filter(Boolean).join(' / ') || '—')}</div></div>
      <div><div class="dl">Monitoring</div><div class="dv">${sess ? esc(fmtDate(sess.tanggal) + ' ' + (sess.startTime || '')) + ' · ' + esc(sess.pic || '') : '—'}</div></div>
      <div><div class="dl">Status</div><div class="dv">${closed
        ? `<span class="badge b-ok">✅ CLOSED</span> <span class="rca-sub">oleh ${esc(r.closedBy || '—')} · ${esc(fmtDateTime(r.closedAt))}</span>`
        : '<span class="badge b-warn">📝 OPEN (draft)</span>'}</div></div>
    </div>

    <div class="rca-sec">
      <div class="rca-sec-title"><span>1</span> Finding yang ditutup</div>
      <div class="rca-findings">
        ${findingRows.map(f => `
          <label class="rca-finding ${chosen.has(f.id) ? 'on' : ''}">
            <input type="checkbox" data-finding="${esc(f.id)}" ${chosen.has(f.id) ? 'checked' : ''} ${readOnly || closed ? 'disabled' : ''}
              onchange="this.parentElement.classList.toggle('on', this.checked)"/>
            <span class="badge ${f.status === 'ALERT' ? 'b-alert' : 'b-warn'}">${esc(f.status)}</span>
            <span class="rca-finding-name">${esc(f.parameter)}</span>
            <span class="rca-finding-val">${esc(f.value)} ${esc(f.unit || '')}</span>
          </label>`).join('') || '<div class="fhint">Tidak ada finding.</div>'}
      </div>
    </div>

    <div class="rca-sec">
      <div class="rca-sec-title"><span>2</span> Deskripsi Masalah</div>
      <textarea class="ftextarea" id="rca-problem" rows="2" ${readOnly ? 'readonly' : ''}>${esc(r.problem)}</textarea>
    </div>

    <div class="rca-sec">
      <div class="rca-sec-title"><span>3</span> Analisis 5-Why <span class="rca-hint">isi berurutan sampai ketemu penyebab dasarnya</span></div>
      <div class="rca-whys">
        ${r.whys.map((w, i) => `
          <div class="rca-why">
            <div class="rca-why-no">Why ${i + 1}</div>
            <input class="finput" id="rca-why-${i}" value="${esc(w)}" ${readOnly ? 'readonly' : ''}
              placeholder="${i === 0 ? 'Mengapa masalah ini terjadi?' : `Mengapa “jawaban Why ${i}” terjadi?`}"/>
          </div>`).join('')}
      </div>
      <div class="form-grid" style="gap:12px;margin-top:12px">
        <div class="fg">
          <label class="flabel">Kategori Akar Masalah (6M)</label>
          <select class="fsel2" id="rca-category" ${readOnly ? 'disabled' : ''}>
            <option value="">— Pilih kategori —</option>
            ${RCA_CATEGORIES.map(([v, l]) => `<option value="${v}" ${r.category === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
          </select>
        </div>
        <div class="fg full">
          <label class="flabel">Akar Masalah <span class="req">*</span></label>
          <textarea class="ftextarea" id="rca-rootCause" rows="2" ${readOnly ? 'readonly' : ''}
            placeholder="Kesimpulan penyebab dasar (biasanya jawaban Why terakhir)">${esc(r.rootCause)}</textarea>
        </div>
      </div>
    </div>

    <div class="rca-sec">
      <div class="rca-sec-title"><span>4</span> Tindakan</div>
      <div class="form-grid" style="gap:12px">
        <div class="fg full">
          <label class="flabel">Tindakan Korektif (perbaikan) <span class="req">*</span></label>
          <textarea class="ftextarea" id="rca-correctiveAction" rows="2" ${readOnly ? 'readonly' : ''}
            placeholder="Apa yang dilakukan untuk memperbaiki masalah sekarang">${esc(r.correctiveAction)}</textarea>
        </div>
        <div class="fg full">
          <label class="flabel">Tindakan Preventif (pencegahan)</label>
          <textarea class="ftextarea" id="rca-preventiveAction" rows="2" ${readOnly ? 'readonly' : ''}
            placeholder="Agar tidak terulang: perubahan jadwal PM, SOP, training, dll">${esc(r.preventiveAction)}</textarea>
        </div>
        <div class="fg">
          <label class="flabel">PIC Tindakan</label>
          <input class="finput" id="rca-actionPic" list="rca-pic-list" value="${esc(r.actionPic)}" ${readOnly ? 'readonly' : ''} placeholder="Nama penanggung jawab"/>
          <datalist id="rca-pic-list">${picOptions.map(p => `<option value="${esc(p)}">`).join('')}</datalist>
        </div>
        <div class="fg">
          <label class="flabel">Target Selesai</label>
          <input type="date" class="finput" id="rca-targetDate" value="${esc(r.targetDate)}" ${readOnly ? 'readonly' : ''}/>
        </div>
      </div>
    </div>

    <div class="rca-sec">
      <div class="rca-sec-title"><span>5</span> Verifikasi Hasil</div>
      <textarea class="ftextarea" id="rca-verification" rows="2" ${readOnly ? 'readonly' : ''}
        placeholder="Contoh: setelah perbaikan level oli 98%, suhu 52°C — kembali normal">${esc(r.verification)}</textarea>
    </div>

    <div class="form-actions">
      <button class="btn btn-ghost" onclick="closeOverlay('rcaOverlay')">Tutup</button>
      ${r._isNew ? '' : `<button class="btn btn-ghost" onclick="printRca(${jsArg(r.id)})">🖨 Cetak RCA</button>`}
      ${readOnly ? '' : closed
        ? `<button class="btn btn-orange" onclick="reopenRca()">🔓 Buka Kembali</button>
           <button class="btn btn-primary" onclick="saveRca('Closed')">💾 Simpan Perubahan</button>`
        : `<button class="btn btn-ghost" onclick="saveRca('Open')">💾 Simpan Draft</button>
           <button class="btn btn-primary" onclick="saveRca('Closed')">🔒 Tutup Finding</button>`}
    </div>`;
  openOverlay('rcaOverlay');
}

function _collectRcaForm() {
  const r = _rcaEditing;
  const selected = [...document.querySelectorAll('#rcaBody input[data-finding]:checked')].map(cb => cb.dataset.finding);
  const all = new Map([
    ...findings.filter(f => f.sessId === r.sessId).map(f => [f.id, _rcaFindingOf(f)]),
    ...r.findings.map(f => [f.findingId, f]),
  ]);
  return {
    ...r,
    findings: selected.map(id => all.get(id)).filter(Boolean),
    problem: getVal('rca-problem').trim(),
    whys: [0, 1, 2, 3, 4].map(i => getVal('rca-why-' + i).trim()),
    category: getVal('rca-category'),
    rootCause: getVal('rca-rootCause').trim(),
    correctiveAction: getVal('rca-correctiveAction').trim(),
    preventiveAction: getVal('rca-preventiveAction').trim(),
    actionPic: getVal('rca-actionPic').trim(),
    targetDate: getVal('rca-targetDate'),
    verification: getVal('rca-verification').trim(),
  };
}

function saveRca(status) {
  if (!canManageRca() || !_rcaEditing) return;
  const r = _collectRcaForm();
  if (!r.findings.length) { toast('Pilih minimal satu finding yang ditutup', 'error'); return; }

  if (status === 'Closed') {
    const missing = [];
    if (!r.whys[0]) missing.push('Why 1');
    if (!r.rootCause) missing.push('Akar Masalah');
    if (!r.correctiveAction) missing.push('Tindakan Korektif');
    if (missing.length) {
      toast('✗ Untuk menutup finding, lengkapi: ' + missing.join(', '), 'error', 6000);
      document.getElementById(!r.whys[0] ? 'rca-why-0' : !r.rootCause ? 'rca-rootCause' : 'rca-correctiveAction')?.focus();
      return;
    }
    if (r.status !== 'Closed') {
      r.closedBy = currentUser?.name || currentUser?.username || '';
      r.closedAt = new Date().toISOString();
    }
  }
  r.status = status;
  delete r._isNew;

  const idx = rcaReports.findIndex(x => x.id === r.id);
  if (idx === -1) rcaReports.push(r); else rcaReports[idx] = r;
  _rcaEditing = null;

  saveAll();
  closeOverlay('rcaOverlay');
  renderAll();
  if (document.getElementById('page-findings')?.classList.contains('active')) renderFindingsPage();
  if (document.getElementById('page-rca')?.classList.contains('active')) renderRcaPage();
  toast(status === 'Closed'
    ? `✅ ${r.findings.length} finding ditutup — ${r.id}`
    : `💾 Draft RCA disimpan — finding ditandai "RCA berjalan"`, 'success', 5000);
}

function reopenRca() {
  if (!_rcaEditing || !confirm('Buka kembali RCA ini? Finding terkait akan aktif lagi.')) return;
  _rcaEditing.status = 'Open';
  _rcaEditing.closedBy = '';
  _rcaEditing.closedAt = '';
  saveRca('Open');
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

// ═══════════════════════════════════════════════════════
// HALAMAN DAFTAR RCA
// ═══════════════════════════════════════════════════════
function renderRcaPage() {
  const tbody = document.getElementById('rcaTableBody');
  if (!tbody) return;
  const q = (getVal('rcaSearch') || '').toLowerCase();
  const st = getVal('rcaStatusFilter');
  const today = todayISO();
  const isOverdue = r => r.status !== 'Closed' && r.targetDate && r.targetDate < today;

  const all = [...rcaReports].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  setText('rcaStatTotal', all.length);
  setText('rcaStatOpen', all.filter(r => r.status !== 'Closed').length);
  setText('rcaStatClosed', all.filter(r => r.status === 'Closed').length);
  setText('rcaStatOverdue', all.filter(isOverdue).length);

  let list = all;
  if (st === 'Open') list = list.filter(r => r.status !== 'Closed');
  else if (st === 'Closed') list = list.filter(r => r.status === 'Closed');
  else if (st === 'Overdue') list = list.filter(isOverdue);
  if (q) list = list.filter(r => JSON.stringify(r).toLowerCase().includes(q));

  tbody.innerHTML = list.map(r => {
    const alerts = r.findings.filter(f => f.status === 'ALERT').length;
    const warns = r.findings.length - alerts;
    return `<tr>
      <td><div class="mono" style="font-size:11px;font-weight:600">${esc(r.id)}</div>
        <div style="font-size:10px;color:var(--text3)">${esc(fmtDate(r.createdAt))}</div></td>
      <td><div style="font-size:12px;font-weight:600">${esc(r.equipName || '—')}</div>
        <div style="font-size:10px;color:var(--text3)">${esc([r.unitName, r.areaName].filter(Boolean).join(' / '))}</div></td>
      <td>${alerts ? `<span class="badge b-alert">🚨 ${alerts}</span>` : ''} ${warns ? `<span class="badge b-warn">⚠ ${warns}</span>` : ''}</td>
      <td style="font-size:11px">${esc(r.category || '—')}</td>
      <td style="font-size:11px;max-width:240px">${esc(r.rootCause || '—')}</td>
      <td style="font-size:11px">${esc(r.actionPic || '—')}${r.targetDate ? `<div style="font-size:10px;color:${isOverdue(r) ? 'var(--red)' : 'var(--text3)'}">🎯 ${esc(fmtDate(r.targetDate))}${isOverdue(r) ? ' · terlambat' : ''}</div>` : ''}</td>
      <td>${r.status === 'Closed'
        ? `<span class="badge b-ok">✅ Closed</span><div style="font-size:10px;color:var(--text3)">${esc(fmtDate(r.closedAt))}</div>`
        : '<span class="badge b-warn">📝 Open</span>'}</td>
      <td><div style="display:flex;gap:4px">
        <button class="tbl-btn" onclick="openRcaModal(${jsArg(r.id)})">${canManageRca() ? '✏ Buka' : '👁 Lihat'}</button>
        <button class="tbl-btn" onclick="printRca(${jsArg(r.id)})">🖨</button>
      </div></td>
    </tr>`;
  }).join('') || `<tr><td colspan="8"><div class="empty"><div class="empty-ico">🔍</div>
    <div class="empty-msg">${all.length ? 'Tidak ada RCA dengan filter ini.' : 'Belum ada RCA. Tutup finding dari halaman Finding / Alarm → tombol "🔍 RCA & Tutup".'}</div></div></td></tr>`;
}

// ═══════════════════════════════════════════════════════
// CETAK LAPORAN RCA (siap disimpan sebagai PDF)
// ═══════════════════════════════════════════════════════
function printRca(rcaId) {
  const r = rcaReports.find(x => x.id === rcaId);
  if (!r) { toast('RCA tidak ditemukan', 'error'); return; }
  const sess = sessions.find(s => s.id === r.sessId);
  const whys = (r.whys || []).map((w, i) => ({ n: i + 1, w })).filter(x => x.w);
  const nameOf = u => (u === r.createdBy && r.createdByName) || USERS.find(x => x.username === u)?.name || u;

  const html = `<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8"/>
<title>${esc(r.id)} — Root Cause Analysis</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a2a1a; margin: 0; padding: 28px 34px; font-size: 12px; }
  .hdr { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a3a6b; padding-bottom: 10px; }
  .hdr h1 { margin: 0; font-size: 20px; color: #1a3a6b; letter-spacing: .02em; }
  .hdr .sub { color: #4a9e3f; font-weight: 700; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }
  .id { text-align: right; font-family: Consolas, monospace; font-size: 12px; }
  .status { display: inline-block; margin-top: 4px; padding: 3px 10px; border-radius: 4px; font-weight: 700; font-size: 11px;
    background: ${r.status === 'Closed' ? '#e8f5e9' : '#fff3e0'}; color: ${r.status === 'Closed' ? '#1e6b1e' : '#8c5a00'};
    border: 1px solid ${r.status === 'Closed' ? '#80c8a0' : '#e8d080'}; }
  h2 { font-size: 13px; color: #fff; background: #1a3a6b; padding: 6px 10px; margin: 18px 0 8px; border-radius: 3px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #cdd8cd; padding: 6px 8px; vertical-align: top; text-align: left; }
  th { background: #eef3ee; font-size: 11px; color: #3a5a3a; }
  .info td:nth-child(odd) { background: #f6f9f6; font-weight: 600; width: 16%; color: #3a5a3a; }
  .alert { color: #7a1a1a; font-weight: 700; } .warn { color: #8c5a00; font-weight: 700; }
  .box { border: 1px solid #cdd8cd; border-radius: 4px; padding: 8px 10px; min-height: 34px; white-space: pre-wrap; }
  .why { display: flex; align-items: stretch; margin-bottom: 6px; }
  .why .n { width: 70px; flex-shrink: 0; background: #1a3a6b; color: #fff; font-weight: 700; display: flex; align-items: center; justify-content: center; border-radius: 4px 0 0 4px; }
  .why .t { flex: 1; border: 1px solid #cdd8cd; border-left: none; padding: 7px 10px; border-radius: 0 4px 4px 0; }
  .arrow { text-align: center; color: #7a9a7a; line-height: 1; margin: -2px 0 4px 26px; width: 20px; }
  .root { border: 2px solid #c0392b; background: #fdecea; border-radius: 4px; padding: 9px 12px; font-weight: 600; white-space: pre-wrap; }
  .cat { display: inline-block; padding: 2px 8px; border-radius: 4px; background: #e8f0ff; color: #1a3a6b; font-weight: 700; font-size: 11px; }
  .sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 26px; }
  .sign > div { border: 1px solid #cdd8cd; border-radius: 4px; padding: 8px; text-align: center; min-height: 110px; display: flex; flex-direction: column; }
  .sign .r { font-size: 11px; color: #3a5a3a; font-weight: 700; }
  .sign .s { margin-top: auto; border-top: 1px solid #9ab09a; padding-top: 4px; font-size: 11px; }
  .foot { margin-top: 18px; font-size: 10px; color: #7a9a7a; text-align: center; }
  @media print { body { padding: 10mm 12mm; } h2 { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .why .n, .root, .status, th, .info td:nth-child(odd) { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  <div class="hdr">
    <div><div class="sub">Prasad Seeds Indonesia · Electrical Maintenance</div>
      <h1>ROOT CAUSE ANALYSIS (RCA)</h1>
      <div style="color:#7a9a7a;margin-top:2px">Penutupan Finding Daily Monitoring</div></div>
    <div class="id">${esc(r.id)}<br><span class="status">${r.status === 'Closed' ? 'CLOSED' : 'OPEN'}</span></div>
  </div>

  <h2>1. Informasi</h2>
  <table class="info">
    <tr><td>Equipment</td><td>${esc(r.equipName || '—')}</td><td>Unit / Area</td><td>${esc([r.unitName, r.areaName].filter(Boolean).join(' / ') || '—')}</td></tr>
    <tr><td>Tgl Monitoring</td><td>${sess ? esc(fmtDate(sess.tanggal) + ' ' + (sess.startTime || '')) : '—'}</td><td>PIC Monitoring</td><td>${esc(sess?.pic || '—')}</td></tr>
    <tr><td>Dibuat</td><td>${esc(nameOf(r.createdBy))} · ${esc(fmtDateTime(r.createdAt))}</td><td>Ditutup</td><td>${r.status === 'Closed' ? esc(r.closedBy) + ' · ' + esc(fmtDateTime(r.closedAt)) : '—'}</td></tr>
  </table>

  <h2>2. Finding</h2>
  <table>
    <tr><th style="width:40px">No</th><th>Parameter</th><th style="width:120px">Nilai</th><th style="width:90px">Status</th></tr>
    ${r.findings.map((f, i) => `<tr><td>${i + 1}</td><td>${esc(f.parameter)}</td><td>${esc(f.value)} ${esc(f.unit)}</td>
      <td class="${f.status === 'ALERT' ? 'alert' : 'warn'}">${esc(f.status)}</td></tr>`).join('')}
  </table>
  <div style="margin-top:8px"><b>Deskripsi masalah:</b><div class="box">${esc(r.problem || '—')}</div></div>

  <h2>3. Analisis 5-Why</h2>
  ${whys.length ? whys.map((x, i) => `${i ? '<div class="arrow">▼</div>' : ''}<div class="why"><div class="n">WHY ${x.n}</div><div class="t">${esc(x.w)}</div></div>`).join('')
    : '<div class="box">—</div>'}
  <div style="margin:10px 0 6px"><b>Kategori akar masalah:</b> <span class="cat">${esc(RCA_CATEGORY_LABEL[r.category] || r.category || '—')}</span></div>
  <div class="root">🎯 Akar masalah: ${esc(r.rootCause || '—')}</div>

  <h2>4. Tindakan</h2>
  <table>
    <tr><th style="width:22%">Jenis</th><th>Uraian</th></tr>
    <tr><td><b>Korektif</b><br><span style="color:#7a9a7a">perbaikan</span></td><td style="white-space:pre-wrap">${esc(r.correctiveAction || '—')}</td></tr>
    <tr><td><b>Preventif</b><br><span style="color:#7a9a7a">pencegahan</span></td><td style="white-space:pre-wrap">${esc(r.preventiveAction || '—')}</td></tr>
    <tr><td><b>PIC / Target</b></td><td>${esc(r.actionPic || '—')} · ${esc(r.targetDate ? fmtDate(r.targetDate) : '—')}</td></tr>
  </table>

  <h2>5. Verifikasi Hasil</h2>
  <div class="box">${esc(r.verification || '—')}</div>

  <div class="sign">
    <div><div class="r">Dibuat oleh</div><div class="s">${esc(nameOf(r.createdBy) || '')}<br>Leader / Teknisi</div></div>
    <div><div class="r">Diperiksa oleh</div><div class="s">&nbsp;<br>Supervisor</div></div>
    <div><div class="r">Disetujui oleh</div><div class="s">&nbsp;<br>Plant Manager</div></div>
  </div>
  <div class="foot">Dicetak dari Prasad Seeds Monitoring System · ${esc(new Date().toLocaleString('id-ID'))}</div>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));<\/script>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) { toast('Popup diblokir browser — izinkan popup untuk mencetak RCA', 'error', 6000); return; }
  win.document.write(html);
  win.document.close();
}
