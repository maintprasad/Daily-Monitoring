'use strict';


// ═══════════════════════════════════════════════════════
// PARAMETER EDITOR
// ═══════════════════════════════════════════════════════
function openParamEditor(unitId, areaId, eqId) {
  _editingEquipPath = { unitId, areaId, eqId };
  const eq = findEquipFlex(unitId, areaId, null, eqId);
  if (!eq) { toast('Equipment tidak ditemukan', 'error'); return; }
  _editingParams = JSON.parse(JSON.stringify(eq.params || []));

  const unit = findUnit(unitId);
  const area = findArea(unitId, areaId);

  document.getElementById('paramEditorTitle').textContent = `⚙ Parameter — ${eq.name}`;
  document.getElementById('paramEditorSub').textContent   = `${unit?.name||''} → ${area?.name||''}`;

  // Reset add param form
  ['np-label','np-unit','np-section','np-options'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  ['np-nmin','np-nmax','np-wmin','np-wmax'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  const tp = document.getElementById('np-type'); if(tp) tp.value = 'numeric';
  toggleNewParamType();

  renderParamGroupContainer();
  openOverlay('paramEditorOverlay');
}

function toggleNewParamType() {
  const t = document.getElementById('np-type')?.value;
  document.getElementById('np-numeric-fields').style.display = t === 'numeric' ? '' : 'none';
  document.getElementById('np-status-fields').style.display  = t === 'status'  ? '' : 'none';
}

function renderParamGroupContainer() {
  const el = document.getElementById('paramGroupContainer');
  if (!el) return;
  if (!_editingParams.length) {
    el.innerHTML = `<div style="color:var(--text3);font-size:12px;padding:8px;text-align:center;background:var(--bg3);border-radius:8px;margin-bottom:12px">Belum ada parameter. Tambahkan di bawah.</div>`;
    return;
  }
  // Group by section
  const groups = {};
  _editingParams.forEach((p, idx) => {
    const sec = p.section || 'Umum';
    if (!groups[sec]) groups[sec] = [];
    groups[sec].push({ ...p, _idx: idx });
  });
  const secColors = ['#22c55e','#3b82f6','#f97316','#a855f7','#06b6d4','#eab308'];
  let secColorIdx = 0;
  let html = '';
  Object.entries(groups).forEach(([sec, params]) => {
    const col = secColors[secColorIdx++ % secColors.length];
    html += `<div style="margin-bottom:14px">
      <div style="font-size:10px;font-weight:700;color:${col};text-transform:uppercase;letter-spacing:.09em;margin-bottom:6px;padding:5px 10px;background:${col}15;border-left:3px solid ${col};border-radius:0 5px 5px 0">
        📌 ${esc(sec)}
      </div>`;
    params.forEach(p => {
      const i = p._idx;
      const isStatus = p.type === 'status';
      html += `<div class="param-row">
        <div class="param-row-grid">
          <div>
            <div class="param-mini-label">Label</div>
            <input class="param-mini-input" value="${esc(p.label)}" onchange="_editingParams[${i}].label=this.value" placeholder="Label parameter"/>
          </div>
          <div>
            <div class="param-mini-label">Satuan</div>
            <input class="param-mini-input" value="${esc(p.unit||'')}" onchange="_editingParams[${i}].unit=this.value" placeholder="°C, V..."/>
          </div>
          <div>
            <div class="param-mini-label">Seksi</div>
            <input class="param-mini-input" value="${esc(p.section||'')}" onchange="_editingParams[${i}].section=this.value" placeholder="Grup/Seksi"/>
          </div>
          ${isStatus ? `
          <div>
            <div class="param-mini-label">Opsi (koma)</div>
            <input class="param-mini-input" value="${esc((p.options||[]).join(', '))}" onchange="_editingParams[${i}].options=this.value.split(',').map(x=>x.trim()).filter(Boolean)" placeholder="BAIK, PERLU PERHATIAN, RUSAK"/>
          </div>
          <div style="grid-column:span 2"></div>
          ` : `
          <div>
            <div class="param-mini-label">Normal Min</div>
            <input type="number" step="any" class="param-mini-input" value="${p.normalMin??''}" onchange="setParamNum(${i},'normalMin',this.value)" placeholder="Min"/>
          </div>
          <div>
            <div class="param-mini-label">Normal Max</div>
            <input type="number" step="any" class="param-mini-input" value="${p.normalMax??''}" onchange="setParamNum(${i},'normalMax',this.value)" placeholder="Max"/>
          </div>
          <div>
            <div class="param-mini-label" title="Di luar batas ini status menjadi ALERT">Batas Alert</div>
            <input type="number" step="any" class="param-mini-input" value="${p.warnMin??''}" onchange="setParamNum(${i},'warnMin',this.value)" placeholder="≤ min" title="Alert jika nilai di bawah ini"/>
            <input type="number" step="any" class="param-mini-input" style="margin-top:3px" value="${p.warnMax??''}" onchange="setParamNum(${i},'warnMax',this.value)" placeholder="≥ max" title="Alert jika nilai di atas ini"/>
          </div>
          `}
          <div>
            <div class="param-mini-label">Hapus</div>
            <button class="param-del-btn" data-delidx="${i}" onclick="(function(btn){var idx=parseInt(btn.dataset.delidx);_editingParams.splice(idx,1);renderParamGroupContainer();})(this)">✕</button>
          </div>
        </div>
      </div>`;
    });
    html += `</div>`;
  });
  el.innerHTML = html;
}

/**
 * Set batas numerik parameter. Field kosong → batas dihapus.
 * (Sebelumnya parseFloat('') = NaN tersimpan sebagai null, dan input "Warn Batas"
 * selalu menulis warnMax meski parameter hanya punya warnMin, mis. Level Oli.)
 */
function setParamNum(idx, key, raw) {
  const p = _editingParams[idx];
  if (!p) return;
  const v = parseFloat(String(raw).replace(',', '.'));
  if (raw === '' || isNaN(v)) delete p[key];
  else p[key] = v;
}

function addNewParam() {
  const label   = document.getElementById('np-label')?.value.trim();
  const unit    = document.getElementById('np-unit')?.value.trim();
  const type    = document.getElementById('np-type')?.value || 'numeric';
  const section = document.getElementById('np-section')?.value.trim() || 'Umum';
  if (!label) { toast('Isi label parameter terlebih dahulu','error'); return; }
  const p = { id: genPId(), label, unit, type, section };
  const toNum = id => { const v = document.getElementById(id)?.value; return (v !== '' && v != null) ? parseFloat(v) : undefined; };
  if (type === 'numeric') {
    p.normalMin = toNum('np-nmin');
    p.normalMax = toNum('np-nmax');
    p.warnMin   = toNum('np-wmin');
    p.warnMax   = toNum('np-wmax');
  } else {
    const opts = document.getElementById('np-options')?.value.split(',').map(x=>x.trim()).filter(Boolean);
    p.options = opts.length ? opts : ['BAIK','PERLU PERHATIAN','RUSAK'];
  }
  _editingParams.push(p);
  renderParamGroupContainer();
  ['np-label','np-unit','np-section','np-options','np-nmin','np-nmax','np-wmin','np-wmax'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  toast('Parameter ditambahkan ✓', 'success');
}

function saveParamEdits() {
  if (!_editingEquipPath) return;
  const { unitId, areaId, eqId } = _editingEquipPath;
  const eq = findEquipFlex(unitId, areaId, null, eqId);
  if (!eq) { toast('Equipment tidak ditemukan','error'); return; }
  eq.params = JSON.parse(JSON.stringify(_editingParams));
  saveAll(); renderHierTree();
  closeOverlay('paramEditorOverlay');
  toast(`${_editingParams.length} parameter disimpan ✓`, 'success');
}
