'use strict';

// ═══════════════════════════════════════════════════════
// HIERARCHY TREE RENDERER
// ═══════════════════════════════════════════════════════
   function checkSeedBanners() {
  const hasUnit1 = hierarchy.units.some(u =>
    u.name.toLowerCase() === 'unit 1' || u.id === 'U-001'
  );
  const hasUnit2 = hierarchy.units.some(u =>
    u.name.toLowerCase() === 'unit 2' || u.id === 'U-002'
  );

  const b1 = document.getElementById('seedUnit1Banner');
  const b2 = document.getElementById('seedUnit2Banner');

  // Tampilkan banner jika unit belum ada ATAU unit ada tapi equipment-nya kosong
  const unit1Empty = !hasUnit1 || (() => {
    const u = hierarchy.units.find(u => u.name.toLowerCase() === 'unit 1' || u.id === 'U-001');
    return (u?.areas || []).reduce((s, a) => s + (a.equipments || []).length, 0) === 0;
  })();

  const unit2Empty = !hasUnit2 || (() => {
    const u = hierarchy.units.find(u => u.name.toLowerCase() === 'unit 2' || u.id === 'U-002');
    return (u?.areas || []).reduce((s, a) => s + (a.equipments || []).length, 0) === 0;
  })();

  if (b1) b1.style.display = unit1Empty ? '' : 'none';
  if (b2) b2.style.display = unit2Empty ? '' : 'none';
}

function renderHierTree() {
  checkSeedBanners();
  const container = document.getElementById('hierTree');
  if (!container) return;
  if (!hierarchy.units.length) {
    container.innerHTML = `<div class="empty"><div class="empty-ico">🗂</div><div class="empty-msg">Belum ada hierarki. Klik "Tambah Unit" untuk mulai.</div></div>`;
    return;
  }

  // ── Simpan state open/close sebelum rebuild ──────────────
  const openIds = new Set();
  container.querySelectorAll('.hier-unit-hdr.open, .hier-area-hdr.open, .hier-subarea-hdr.open').forEach(hdr => {
    // Ambil ID dari atribut data-node-id yang kita set di header
    const nid = hdr.dataset.nodeId;
    if (nid) openIds.add(nid);
  });

  // ── Rebuild DOM ───────────────────────────────────────────
  container.innerHTML = hierarchy.units.map(u => renderUnitNode(u)).join('');

  // ── Restore state open/close ──────────────────────────────
  if (openIds.size > 0) {
    container.querySelectorAll('[data-node-id]').forEach(hdr => {
      if (openIds.has(hdr.dataset.nodeId)) {
        const body = hdr.nextElementSibling;
        const chev = hdr.querySelector('.chevron');
        if (body) body.classList.add('open');
        hdr.classList.add('open');
        if (chev) chev.style.transform = 'rotate(90deg)';
      }
    });
  }
}

function renderUnitNode(unit) {
  const areas = unit.areas || [];
  const totalEquip = areas.reduce((sum, a) => {
    return sum + (a.equipments || []).length;
  }, 0);
  return `<div class="hier-unit">
    <div class="hier-unit-hdr" onclick="toggleNode(this)" data-node-id="${unit.id}">
      <span class="chevron">▶</span>
      <span class="hier-unit-name">🏭 ${esc(unit.name)}</span>
      <span class="badge b-gray" style="margin-right:8px">${areas.length} area · ${totalEquip} equip</span>
      <div style="display:flex;gap:4px" data-uid="${esc(unit.id)}">
        <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();openAddAreaModal(this.parentElement.dataset.uid)">+ Area</button>
        <button class="btn btn-danger btn-xs" onclick="event.stopPropagation();deleteUnit(this.parentElement.dataset.uid)">✕</button>
      </div>
    </div>
    <div class="hier-unit-body">
      ${areas.map(a => renderAreaNode(unit.id, a)).join('')}
      ${!areas.length ? `<div style="color:var(--text3);font-size:12px;padding:8px 4px">Belum ada area. Klik "+ Area" untuk menambahkan.</div>` : ''}
    </div>
  </div>`;
}

function renderAreaNode(unitId, area) {
  const equips = area.equipments || [];
  const countLabel = equips.length ? `${equips.length} equipment` : 'kosong';

  return `<div class="hier-area">
    <div class="hier-area-hdr" onclick="toggleNode(this)" data-node-id="${unitId}_${area.id}">
      <span class="chevron" style="font-size:10px;color:var(--text3)">▶</span>
      <span class="hier-area-name">📁 ${esc(area.name)}</span>
      <span class="badge b-gray" style="margin-right:8px;font-size:9px">${countLabel}</span>
      <div style="display:flex;gap:4px" data-uid="${esc(unitId)}" data-aid="${esc(area.id)}">
        <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();openAddEquipModal(this.parentElement.dataset.uid,this.parentElement.dataset.aid)">+ Equipment</button>
        <button class="btn btn-danger btn-xs" onclick="event.stopPropagation();deleteArea(this.parentElement.dataset.uid,this.parentElement.dataset.aid)">✕</button>
      </div>
    </div>
    <div class="hier-area-body">
      ${equips.map(eq => renderEquipNode(unitId, area.id, '', eq)).join('')}
      ${!equips.length ? `<div style="color:var(--text3);font-size:12px;padding:6px 4px">Belum ada equipment. Klik "+ Equipment" untuk menambahkan.</div>` : ''}
    </div>
  </div>`;
}

function renderEquipNode(unitId, areaId, subAreaId, eq) {
  const paramCount = (eq.params||[]).length;
  const lastSess = getLastSession(unitId, areaId, subAreaId, eq.id);
  const st = lastSess ? sessStatus(lastSess) : 'PENDING';
  const dotCls = {OK:'s-ok',WARNING:'s-warn',ALERT:'s-alert',PENDING:'s-none'}[st]||'s-none';
  const typeLabel = eq.type ? (EQUIP_TYPE_LABELS[eq.type] || eq.type) : '';
  const typeBadge = typeLabel ? `<span class="badge" style="background:var(--blue-dim);color:var(--blue);font-size:9px">${esc(typeLabel)}</span> ` : '';
  // Simpan argumen di data-attr agar tidak ada masalah karakter spesial di onclick
  const uid = esc(unitId); const aid = esc(areaId); const sid = esc(subAreaId); const eid = esc(eq.id);
  return `<div class="hier-equip" data-uid="${uid}" data-aid="${aid}" data-sid="${sid}" data-eid="${eid}">
    <div class="hier-equip-status ${dotCls}"></div>
    <span class="hier-equip-name">${typeBadge}${esc(eq.name)}${eq.tag?` <span style="font-size:9px;color:var(--text3)">(${esc(eq.tag)})</span>`:''}</span>
    <span class="hier-equip-params">${paramCount} param</span>
    <div style="display:flex;gap:4px">
      <button class="btn btn-blue btn-xs"    onclick="openParamEditor(this.closest('.hier-equip').dataset.uid,this.closest('.hier-equip').dataset.aid,this.closest('.hier-equip').dataset.eid)">⚙ Parameter</button>
      <button class="btn btn-primary btn-xs" onclick="openNewSessionModal(this.closest('.hier-equip').dataset.uid,this.closest('.hier-equip').dataset.aid,'',this.closest('.hier-equip').dataset.eid)">✚ Monitor</button>
      <button class="btn btn-danger btn-xs"  onclick="deleteEquip(this.closest('.hier-equip').dataset.uid,this.closest('.hier-equip').dataset.aid,'',this.closest('.hier-equip').dataset.eid)">✕</button>    </div>
  </div>`;
}

function toggleNode(hdr) {
  const body = hdr.nextElementSibling;
  const chev = hdr.querySelector('.chevron');
  const open  = body.classList.toggle('open');
  hdr.classList.toggle('open', open);
  if (chev) chev.style.transform = open ? 'rotate(90deg)' : '';
}

// ═══════════════════════════════════════════════════════
// UNIT / AREA / SUBAREA / EQUIP CRUD
// ═══════════════════════════════════════════════════════
function openAddUnitModal() {
  document.getElementById('unitNameInput').value = '';
  document.getElementById('unitDescInput').value = '';
  document.getElementById('unitNameErr').textContent = '';
  document.getElementById('addUnitTitle').textContent = '✚ Tambah Unit';
  _ctx.editingUnit = null;
  openOverlay('addUnitOverlay');
}

function submitAddUnit() {
  const name = document.getElementById('unitNameInput').value.trim();
  const desc = document.getElementById('unitDescInput').value.trim();
  if (!name) { document.getElementById('unitNameErr').textContent = 'Nama unit wajib diisi'; return; }
  if (_ctx.editingUnit) {
    // Edit mode
    const unit = findUnit(_ctx.editingUnit);
    if (unit) { unit.name = name; unit.desc = desc; }
  } else {
    // Add mode
    const id = genUId();
    hierarchy.units.push({ id, name, desc, areas: [] });
  }
  saveAll(); renderHierTree(); populateUnitFilters();
  closeOverlay('addUnitOverlay');
  toast('Unit "' + name + '" ' + (_ctx.editingUnit ? 'diperbarui' : 'ditambahkan') + ' ✓', 'success');
}

function deleteUnit(unitId) {
  const unit = findUnit(unitId);
  if (!unit) return;
  if (!confirm(`Hapus Unit "${unit.name}"?\nSemua Area, Sub Area, dan Equipment di dalamnya akan ikut terhapus.`)) return;
  hierarchy.units = hierarchy.units.filter(u => u.id !== unitId);
  saveAll(); renderAll(); populateUnitFilters();
  toast('Unit dihapus', 'info');
}

function openAddAreaModal(unitId) {
  _ctx.addAreaUnit = unitId;
  document.getElementById('areaNameInput').value = '';
  document.getElementById('areaNameErr').textContent = '';
  const unit = findUnit(unitId);
  document.getElementById('addAreaTitle').textContent = `✚ Tambah Area — ${unit?.name||''}`;
  openOverlay('addAreaOverlay');
}

function submitAddArea() {
  const name = document.getElementById('areaNameInput').value.trim();
  if (!name) { document.getElementById('areaNameErr').textContent = 'Nama area wajib diisi'; return; }
  const unit = findUnit(_ctx.addAreaUnit);
  if (!unit) return;
  unit.areas.push({ id: genAId(), name, subAreas: [], equipments: [] });
  saveAll(); renderHierTree(); populateUnitFilters();
  closeOverlay('addAreaOverlay');
  toast('Area "' + name + '" ditambahkan ✓', 'success');
}

function deleteArea(unitId, areaId) {
  const unit = findUnit(unitId);
  const area = unit?.areas.find(a => a.id === areaId);
  if (!area || !confirm(`Hapus Area "${area.name}"?`)) return;
  unit.areas = unit.areas.filter(a => a.id !== areaId);
  saveAll(); renderHierTree(); populateUnitFilters();
  toast('Area dihapus', 'info');
}

function openAddEquipModal(unitId, areaId) {
  _ctx.addEqUnit = unitId; _ctx.addEqArea = areaId; _ctx.addEqSA = '';
  document.getElementById('equipNameInput').value = '';
  document.getElementById('equipTagInput').value  = '';
  document.getElementById('equipNameErr').textContent = '';
  const area = findArea(unitId, areaId);
  const parentName = area?.name || '';
  document.getElementById('addEquipTitle').textContent = `✚ Tambah Equipment — ${parentName}`;
  openOverlay('addEquipOverlay');
}
function submitAddEquip() {
  const name = document.getElementById('equipNameInput').value.trim();
  const tag  = document.getElementById('equipTagInput').value.trim();
  const type = document.getElementById('equipTypeInput')?.value || 'OTHER';
  if (!type || type === '') { document.getElementById('equipTypeErr').textContent = 'Pilih tipe equipment'; return; }
  if (!name) { document.getElementById('equipNameErr').textContent = 'Nama equipment wajib diisi'; return; }

  const area = findArea(_ctx.addEqUnit, _ctx.addEqArea);
  if (!area) return;
  if (!area.equipments) area.equipments = [];

  const templateParams = EQUIP_PARAM_TEMPLATES[type] || [];
  const autoParams = templateParams.map(p => ({ ...p, id: genPId() }));

  let subLabel = '';
  if (type === 'MCC') {
    subLabel = document.getElementById('mccPanelInput')?.value || '';
  } else if (type === 'AIR_COMPRESSOR') {
    subLabel = document.getElementById('compressorLocInput')?.value || '';
  }

  const equipName = subLabel ? `${name} — ${subLabel}` : name;
  area.equipments.push({ id: genEId(), name: equipName, tag, type, params: autoParams });

  saveAll(); renderHierTree(); setText('sc-equip', countEquipments());
  closeOverlay('addEquipOverlay');
  document.getElementById('equipTypeInput').value = '';
  document.getElementById('equipTypePreview').style.display = 'none';
  document.getElementById('mccPanelGroup').style.display = 'none';
  document.getElementById('compressorLocGroup').style.display = 'none';
  const msg = autoParams.length ? `Equipment "${equipName}" + ${autoParams.length} param auto ✓` : `Equipment "${equipName}" ditambahkan ✓`;
  toast(msg, 'success');
}

// ADD START: Conditional dropdown & type preview
function onEquipTypeChange() {
  const type = document.getElementById('equipTypeInput')?.value || '';
  const mccGroup  = document.getElementById('mccPanelGroup');
  const compGroup = document.getElementById('compressorLocGroup');
  const preview   = document.getElementById('equipTypePreview');
  const countEl   = document.getElementById('equipTypePreviewCount');

  if (mccGroup)  mccGroup.style.display  = type === 'MCC'            ? '' : 'none';
  if (compGroup) compGroup.style.display = type === 'AIR_COMPRESSOR' ? '' : 'none';

  const tpl = EQUIP_PARAM_TEMPLATES[type];
  if (tpl && tpl.length && preview && countEl) {
    countEl.textContent = tpl.length;
    preview.style.display = '';
  } else if (preview) {
    preview.style.display = 'none';
  }
}
// ADD END

function deleteEquip(unitId, areaId, saId, eqId) {
  const area = findArea(unitId, areaId);
  const eq   = area?.equipments?.find(e => e.id === eqId);
  if (!eq || !confirm(`Hapus Equipment "${eq.name}"?`)) return;
  area.equipments = area.equipments.filter(e => e.id !== eqId);
  saveAll(); renderHierTree(); setText('sc-equip', countEquipments());
  toast('Equipment dihapus', 'info');
}
