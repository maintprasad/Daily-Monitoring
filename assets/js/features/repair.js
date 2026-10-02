'use strict';

// ═══════════════════════════════════════════════════════
// LAPORAN PERBAIKAN (CREW)
// Alur: cek → ada finding → 🔧 Perbaiki (lapor tindakan) → atasan diberi tahu
//       → Cek Lagi (verifikasi) → Leader menutup finding lewat RCA.
// Di Crew Portal, "Cek Lagi" dikunci sampai semua finding aktif pada pengecekan
// terakhir equipment sudah dilaporkan perbaikannya.
// ═══════════════════════════════════════════════════════
const REPAIR_RESULTS = [
  ['Selesai',       '✅ Sudah diperbaiki',     'Kondisi sudah normal setelah tindakan'],
  ['Sementara',     '⏳ Perbaikan sementara',   'Bisa beroperasi, tapi perlu tindak lanjut'],
  ['Butuh bantuan', '🆘 Tidak bisa, perlu bantuan', 'Eskalasi ke atasan (juga dikirim WA)'],
];
const REPAIR_RESULT_LABEL = Object.fromEntries(REPAIR_RESULTS.map(([v, l]) => [v, l]));

let _repairEditing = null;

/** Laporan perbaikan terbaru per finding id. */
function repairByFinding() {
  const map = new Map();
  repairs.forEach(r => (r.findings || []).forEach(f => {
    const cur = map.get(f.findingId);
    if (!cur || (r.repairedAt || '') > (cur.repairedAt || '')) map.set(f.findingId, r);
  }));
  return map;
}

/**
 * Status perbaikan equipment berdasarkan pengecekan TERAKHIR-nya:
 *   active  = finding aktif pada sesi terakhir
 *   pending = finding aktif yang belum dilaporkan perbaikannya → Cek Lagi dikunci
 */
function equipRepairState(unitId, areaId, eqId) {
  const last = getLastSession(unitId, areaId, '', eqId);
  if (!last) return { last: null, active: [], pending: [], repaired: [], needsRepair: false };
  const active = findings.filter(f => f.sessId === last.id && f.active);
  const byFinding = repairByFinding();
  const pending = active.filter(f => !byFinding.has(f.id));
  const repaired = active.filter(f => byFinding.has(f.id)).map(f => byFinding.get(f.id));
  return { last, active, pending, repaired: [...new Set(repaired)], needsRepair: pending.length > 0 };
}

function openRepairModal(unitId, areaId, eqId) {
  regenerateFindings();
  const st = equipRepairState(unitId, areaId, eqId);
  if (!st.active.length) { toast('Tidak ada temuan aktif untuk diperbaiki', 'info'); return; }
  const s = st.last;
  _repairEditing = {
    id: 'RP-' + todayISO().replace(/-/g, '') + '-' + shortId('').slice(-5),
    sessId: s.id,
    unitId: s.unitId || '', unitName: s.unitName || '',
    areaId: s.areaId || '', areaName: s.areaName || '',
    equipId: s.equipId || '', equipName: s.equipName || '',
    candidates: st.active,
    preselect: new Set((st.pending.length ? st.pending : st.active).map(f => f.id)),
    result: '',
  };
  _renderRepairModal();
}

function _renderRepairModal() {
  const r = _repairEditing;
  const sess = sessions.find(x => x.id === r.sessId);
  const byFinding = repairByFinding();
  setText('repairTitle', `🔧 Perbaiki — ${r.equipName}`);
  document.getElementById('repairBody').innerHTML = `
    <div class="rp-info">
      <div><b>${esc(r.equipName)}</b></div>
      <div class="rp-sub">${esc([r.unitName, r.areaName].filter(Boolean).join(' · '))} · dicek ${sess ? esc(fmtDate(sess.tanggal) + ' ' + (sess.startTime || '')) : ''}</div>
    </div>

    <div class="rp-label">Temuan yang diperbaiki</div>
    <div class="rca-findings">
      ${r.candidates.map(f => {
        const prev = byFinding.get(f.id);
        return `<label class="rca-finding ${r.preselect.has(f.id) ? 'on' : ''}">
          <input type="checkbox" data-finding="${esc(f.id)}" ${r.preselect.has(f.id) ? 'checked' : ''}
            onchange="this.parentElement.classList.toggle('on', this.checked)"/>
          <span class="badge ${f.status === 'ALERT' ? 'b-alert' : 'b-warn'}">${esc(f.status)}</span>
          <span class="rca-finding-name">${esc(f.parameter)}${prev ? `<br><span class="rp-prev">sudah dilapor: ${esc(REPAIR_RESULT_LABEL[prev.result] || prev.result)}</span>` : ''}</span>
          <span class="rca-finding-val">${esc(f.value)} ${esc(f.unit_param || '')}</span>
        </label>`;
      }).join('')}
    </div>

    <div class="rp-label">Apa yang kamu lakukan? <span class="req">*</span></div>
    <textarea class="ftextarea rp-input" id="rp-action" rows="3" placeholder="Contoh: top-up oli trafo, kencangkan terminal, bersihkan filter..."></textarea>

    <div class="rp-label">Hasil perbaikan <span class="req">*</span></div>
    <div class="rp-results">
      ${REPAIR_RESULTS.map(([v, l, d]) => `
        <button type="button" class="rp-result ${r.result === v ? 'on' : ''}" data-result="${esc(v)}" onclick="selectRepairResult(this)">
          <span class="rp-result-l">${esc(l)}</span><span class="rp-result-d">${esc(d)}</span>
        </button>`).join('')}
    </div>

    <details class="rp-more">
      <summary>+ Dugaan penyebab, suku cadang & catatan (opsional)</summary>
      <div class="rp-label">Dugaan penyebab</div>
      <input class="finput rp-input" id="rp-cause" placeholder="Contoh: seal bocor, kabel longgar"/>
      <div class="rp-label">Suku cadang / material yang dipakai</div>
      <input class="finput rp-input" id="rp-parts" placeholder="Contoh: oli trafo 5 L, gasket"/>
      <div class="rp-label">Catatan</div>
      <input class="finput rp-input" id="rp-note" placeholder="Catatan tambahan untuk atasan"/>
    </details>

    <div class="form-actions chk-actions">
      <button class="btn btn-ghost" onclick="closeOverlay('repairOverlay')">Batal</button>
      <button class="btn btn-primary" style="flex:1" onclick="saveRepair()">📨 Kirim Laporan Perbaikan</button>
    </div>`;
  openOverlay('repairOverlay');
}

function selectRepairResult(btn) {
  _repairEditing.result = btn.dataset.result;
  document.querySelectorAll('#repairBody .rp-result').forEach(b => b.classList.toggle('on', b === btn));
}

function saveRepair() {
  const r = _repairEditing;
  if (!r) return;
  const ids = [...document.querySelectorAll('#repairBody input[data-finding]:checked')].map(cb => cb.dataset.finding);
  const action = getVal('rp-action').trim();
  if (!ids.length) { toast('Pilih minimal satu temuan yang diperbaiki', 'error'); return; }
  if (!action) { toast('Tuliskan tindakan perbaikan yang dilakukan', 'error'); document.getElementById('rp-action')?.focus(); return; }
  if (!r.result) { toast('Pilih hasil perbaikan', 'error'); return; }

  const now = new Date().toISOString();
  const report = {
    id: r.id, sessId: r.sessId,
    unitId: r.unitId, unitName: r.unitName, areaId: r.areaId, areaName: r.areaName,
    equipId: r.equipId, equipName: r.equipName,
    action, cause: getVal('rp-cause').trim(), parts: getVal('rp-parts').trim(),
    result: r.result, note: getVal('rp-note').trim(),
    repairedBy: currentUser?.username || '', repairedByName: currentUser?.name || currentUser?.username || '',
    repairedAt: now,
    findings: r.candidates.filter(f => ids.includes(f.id)).map(_rcaFindingOf),
  };
  repairs.push(report);
  _repairEditing = null;
  saveAll();
  closeOverlay('repairOverlay');
  renderAll();
  _refreshCrewPortal();
  toast(r.result === 'Butuh bantuan'
    ? '🆘 Laporan terkirim — atasan diberi tahu untuk membantu'
    : '✅ Laporan perbaikan terkirim — sekarang lakukan Cek Lagi untuk verifikasi', 'success', 6000);
  flushChanges();
}
