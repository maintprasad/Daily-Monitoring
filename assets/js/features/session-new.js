'use strict';

// ═══════════════════════════════════════════════════════
// NEW SESSION MODAL
// ═══════════════════════════════════════════════════════
function openNewSessionModal(preUnitId, preAreaId, preSAId, preEqId) {
  // Reset
  ['ns-date','ns-start','ns-end'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  ['ne-date','ne-start','ne-unit','ne-area','ne-equip','ne-pic'].forEach(id => { const el = document.getElementById(id); if(el) el.textContent=''; });
  document.getElementById('ns-area').innerHTML    = '<option value="">— Pilih Area —</option>';
  // dihapus document.getElementById('ns-subarea').innerHTML = '<option value="">— Pilih Sub Area —</option>';
  document.getElementById('ns-equip').innerHTML   = '<option value="">— Pilih Equipment —</option>';
  document.getElementById('ns-param-preview').style.display = 'none';
  setTodayDate();
  populateUnitFilters();
  initPICGrid('nsPICGrid');

  if (preUnitId) {
    setVal('ns-unit', preUnitId);
    onNSUnitChange();
    if (preAreaId) {
      setTimeout(() => {
        setVal('ns-area', preAreaId);
        onNSAreaChange();
        if (preEqId) {
  setTimeout(() => {
    setVal('ns-equip', preEqId);
    onNSEquipChange();
        }, 50);
      }
      }, 50);
    }
  }
  openOverlay('newSessionOverlay');
}

function onNSUnitChange() {
  const unitId = getVal('ns-unit');
  const areaSel = document.getElementById('ns-area');
  areaSel.innerHTML = '<option value="">— Pilih Area —</option>';
  document.getElementById('ns-equip').innerHTML = '<option value="">— Pilih Equipment —</option>';
  document.getElementById('ns-param-preview').style.display = 'none';
  if (!unitId) return;
  const unit = findUnit(unitId);
  (unit?.areas || []).forEach(a => {
    const o = document.createElement('option');
    o.value = a.id;
    o.textContent = a.name;
    areaSel.appendChild(o);
  });
}

function onNSAreaChange() {
  const unitId = getVal('ns-unit');
  const areaId = getVal('ns-area');
  const eqSel  = document.getElementById('ns-equip');
  eqSel.innerHTML = '<option value="">— Pilih Equipment —</option>';
  document.getElementById('ns-param-preview').style.display = 'none';
  if (!areaId) return;

  const area = findArea(unitId, areaId);
  const allEquips = area?.equipments || [];

  allEquips.forEach(eq => {
    const o = document.createElement('option');
    o.value = eq.id;
    o.textContent = eq.name + (eq.tag ? ` (${eq.tag})` : '');
    eqSel.appendChild(o);
  });
}

function onNSEquipChange() {
  const unitId = getVal('ns-unit');
  const areaId = getVal('ns-area');
  const eqId   = getVal('ns-equip');
  const preview = document.getElementById('ns-param-preview');
  const plist   = document.getElementById('ns-param-list');
  if (!eqId) { preview.style.display='none'; return; }
  const area2  = findArea(unitId, areaId);
  const allEqs = area2?.equipments || [];
  const eq     = allEqs.find(e => e.id === eqId);
  const params = eq?.params || [];
  if (!params.length) { preview.style.display='none'; return; }
  plist.innerHTML = params.map(p => `<span class="badge b-gray">${esc(p.label)} (${esc(p.unit||'—')})</span>`).join('');
  preview.style.display = 'block';
}

// ── Sesi draft sementara (belum disimpan ke sessions[]) ──────────
let _draftSession = null;

function submitNewSession() {
  let ok = true;
  const unitId  = getVal('ns-unit');
  const areaId  = getVal('ns-area');
  const eqId    = getVal('ns-equip');
  const tanggal = getVal('ns-date');
  const start   = getVal('ns-start');

  if (!tanggal) { setErr('ne-date','Tanggal wajib diisi'); ok=false; }
  if (!start)   { setErr('ne-start','Waktu mulai wajib diisi'); ok=false; }
  if (!unitId)  { setErr('ne-unit','Pilih unit'); ok=false; }
  if (!areaId)  { setErr('ne-area','Pilih area'); ok=false; }
  if (!eqId)    { setErr('ne-equip','Pilih equipment'); ok=false; }

  const pics = getSelectedPICs('nsPICGrid');
  if (!pics.length) { setErr('ne-pic','Pilih minimal satu PIC'); ok=false; }
  if (!ok) return;

  closeOverlay('newSessionOverlay');
  startDraftSession({ unitId, areaId, eqId, tanggal, start, end: getVal('ns-end'), pics });
}

/**
 * Buat sesi SEMENTARA (belum masuk sessions[]) lalu langsung buka checklist.
 * Data baru tersimpan setelah user klik "Simpan Data Monitoring".
 * Dipakai form "Sesi Monitoring Baru" dan "Mulai Cepat" di Crew Portal.
 */
function startDraftSession({ unitId, areaId, eqId, tanggal, start, end = '', pics }) {
  const unit = findUnit(unitId);
  const area = findArea(unitId, areaId);
  const eq   = (area?.equipments || []).find(e => e.id === eqId);

  _draftSession = {
    id:          genId(),
    tanggal,
    startTime:   start,
    endTime:     end,
    unitId,      unitName:    unit?.name || '',
    areaId,      areaName:    area?.name || '',
    subAreaId:   '',
    subAreaName: '',
    equipId:     eqId,
    equipName:   eq?.name || '',
    pic:         pics.join(', '),
    catatan:     '',
    tindakan:    '',
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
    items:       [],
    _isDraft:    true,   // flag: belum tersimpan
  };
  openChecklistModalDraft(_draftSession);
}
