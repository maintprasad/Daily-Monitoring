'use strict';

// ── CORE SEED ENGINE ──────────────────────────────────────────────────────────
/**
 * buildUnitFromMaster(unitName)
 * Bangun objek unit lengkap dari MASTER_EQUIPMENT + MASTER_AREAS.
 * Selalu pakai ID hardcoded (U-001/U-002, A-xxx, E-xxx).
 */
function buildUnitFromMaster(unitName) {
  const unitMeta = MASTER_UNITS[unitName];
  if (!unitMeta) return null;
  const masterUid = unitMeta.id;

  // Cek apakah unit sudah ada di lokal (match by name atau hardcoded id)
  const existingUnit = hierarchy.units.find(u =>
    u.name.toLowerCase() === unitName.toLowerCase() ||
    u.id === masterUid
  );

  // Pakai ID existing jika ada, fallback ke hardcoded master ID
  const uid = existingUnit ? existingUnit.id : masterUid;

  const areaMap = {};
  Object.entries(MASTER_AREAS)
    .filter(([key]) => key.startsWith(masterUid + '_'))
    .forEach(([key, a]) => {
      // Cek apakah area sudah ada di unit existing (match by name)
      const existingArea = existingUnit
        ? (existingUnit.areas || []).find(ea =>
            ea.name.toLowerCase() === a.name.toLowerCase()
          )
        : null;

      // Pakai ID existing jika ada
      const areaId = existingArea ? existingArea.id : a.id;

      areaMap[a.id] = {
        id:         areaId,
        name:       a.name,
        equipments: [],
        _masterKey: a.id,
      };
    });

  MASTER_EQUIPMENT
    .filter(eq => eq.areaKey.startsWith(masterUid + '_'))
    .forEach(eq => {
      const masterAreaId = eq.areaKey.split('_')[1];
      const areaEntry    = areaMap[masterAreaId];
      if (!areaEntry) return;

      // Cek apakah equipment sudah ada (match by name atau tag)
      const existingArea = existingUnit
        ? (existingUnit.areas || []).find(ea => ea.id === areaEntry.id)
        : null;
      const existingEq = existingArea
        ? (existingArea.equipments || []).find(e =>
            e.name.toLowerCase() === eq.name.toLowerCase() ||
            (e.tag && eq.tag && e.tag === eq.tag)
          )
        : null;

      // Pakai ID dan params existing jika ada (jaga data monitoring)
      const eqId     = existingEq ? existingEq.id  : eq.id;
      const eqParams = existingEq ? existingEq.params : (EQUIP_PARAM_TEMPLATES[eq.type] || []).map(p => ({ ...p, id: genPId() }));

      areaEntry.equipments.push({
        id:     eqId,
        name:   eq.name,
        tag:    eq.tag,
        type:   eq.type,
        params: eqParams,
      });
    });

  // Bersihkan _masterKey sebelum return
  const areas = Object.values(areaMap).map(({ _masterKey, ...rest }) => rest);

  return {
    id:    uid,
    name:  unitName,
    desc:  existingUnit ? (existingUnit.desc || '') : `Unit Produksi ${unitName.replace('Unit ','')}`,
    areas,
  };
}

/**
 * diffEquipment(existing, master)
 * Return { added, updated, same }
 * - added   : ada di master, tidak ada di existing (by equipId)
 * - updated : ada keduanya tapi nama/tag/type berbeda
 * - same    : identik
 */
function diffEquipment(existingEquips, masterEquips) {
  const added = [], updated = [], same = [];
  const existMap = {};
  existingEquips.forEach(e => { existMap[e.id] = e; });

  masterEquips.forEach(m => {
    const ex = existMap[m.id];
    if (!ex) {
      added.push(m);
    } else if (ex.name !== m.name || ex.tag !== m.tag || ex.type !== m.type) {
      updated.push({ old: ex, new: m });
    } else {
      same.push(m);
    }
  });
  return { added, updated, same };
}

/**
 * applyMasterToUnit(unit, masterUnit)
 * Merge: tambah equipment baru, update yg berubah, jangan hapus yg tidak ada di master.
 * Return ringkasan perubahan.
 */
function applyMasterToUnit(localUnit, masterUnit) {
  let totalAdded = 0, totalUpdated = 0;

  masterUnit.areas.forEach(masterArea => {
    // Cari/buat area yang matching by id
    let localArea = localUnit.areas.find(a => a.id === masterArea.id);
    if (!localArea) {
      localArea = { id: masterArea.id, name: masterArea.name, equipments: [] };
      localUnit.areas.push(localArea);
    } else {
      // Update nama area jika berbeda
      if (localArea.name !== masterArea.name) localArea.name = masterArea.name;
    }
    if (!localArea.equipments) localArea.equipments = [];

    const diff = diffEquipment(localArea.equipments, masterArea.equipments);

    // Tambahkan yang baru
    diff.added.forEach(eq => {
      localArea.equipments.push(eq);
      totalAdded++;
    });

    // Update yang berubah — pertahankan params lama agar data monitoring tidak hilang
    diff.updated.forEach(({ old: oldEq, new: newEq }) => {
      const idx = localArea.equipments.findIndex(e => e.id === oldEq.id);
      if (idx !== -1) {
        localArea.equipments[idx] = {
          ...localArea.equipments[idx], // pertahankan params + data lama
          name: newEq.name,
          tag:  newEq.tag,
          type: newEq.type,
        };
        totalUpdated++;
      }
    });
  });

  return { totalAdded, totalUpdated };
}

// ── SEED UNIT 1 ───────────────────────────────────────────────────────────────
function seedUnit1() {
  const masterUnit = buildUnitFromMaster('Unit 1');
  if (!masterUnit) { toast('Master data Unit 1 tidak ditemukan', 'error'); return; }

  let localUnit = hierarchy.units.find(u =>
    u.name.toLowerCase() === 'unit 1' || u.id === 'U-001'
  );

  // Belum ada unit sama sekali — langsung generate
  if (!localUnit) {
    hierarchy.units.push(masterUnit);
    saveAll(); renderHierTree(); populateUnitFilters(); renderDashboard(); checkSeedBanners();
    const eqCount = masterUnit.areas.reduce((s, a) => s + a.equipments.length, 0);
    toast(`✅ Unit 1 di-generate: ${masterUnit.areas.length} area, ${eqCount} equipment`, 'success');
    return;
  }

  // Unit ada tapi equipment kosong — langsung apply tanpa confirm
  const existingEqCount = (localUnit.areas || []).reduce((s, a) => s + (a.equipments || []).length, 0);
  if (existingEqCount === 0) {
    localUnit.id = 'U-001';
    const { totalAdded } = applyMasterToUnit(localUnit, masterUnit);
    saveAll(); renderHierTree(); populateUnitFilters(); renderDashboard(); checkSeedBanners();
    toast(`✅ Unit 1 di-generate: ${totalAdded} equipment`, 'success');
    return;
  }

  // Unit ada & sudah punya equipment — cek diff dulu
  let diffSummary = [];
  masterUnit.areas.forEach(masterArea => {
    const localArea   = localUnit.areas.find(a => a.id === masterArea.id || a.name.toLowerCase() === masterArea.name.toLowerCase());
    const localEquips = localArea ? (localArea.equipments || []) : [];
    const diff        = diffEquipment(localEquips, masterArea.equipments);
    if (diff.added.length)   diffSummary.push(`  • ${masterArea.name}: +${diff.added.length} equipment baru`);
    if (diff.updated.length) diffSummary.push(`  • ${masterArea.name}: ${diff.updated.length} equipment diperbarui`);
  });

  if (!diffSummary.length) {
    toast('✅ Unit 1 sudah sinkron dengan master data — tidak ada perubahan', 'success');
    return;
  }

  if (!confirm(
    `Ditemukan perbedaan Unit 1 vs master data:\n\n` +
    diffSummary.join('\n') +
    `\n\nLanjutkan? (Data monitoring & params yang ada tidak akan dihapus)`
  )) return;

  localUnit.id = 'U-001';
  const { totalAdded, totalUpdated } = applyMasterToUnit(localUnit, masterUnit);
  saveAll(); renderHierTree(); populateUnitFilters(); renderDashboard(); checkSeedBanners();
  toast(`✅ Unit 1 diperbarui: +${totalAdded} baru, ${totalUpdated} diupdate`, 'success');
}
// ── SEED UNIT 2 ───────────────────────────────────────────────────────────────
function seedUnit2() {
  const masterUnit = buildUnitFromMaster('Unit 2');
  if (!masterUnit) { toast('Master data Unit 2 tidak ditemukan', 'error'); return; }

  let localUnit = hierarchy.units.find(u =>
    u.name.toLowerCase() === 'unit 2' || u.id === 'U-002'
  );

  // Belum ada unit sama sekali — langsung generate
  if (!localUnit) {
    hierarchy.units.push(masterUnit);
    saveAll(); renderHierTree(); populateUnitFilters(); renderDashboard(); checkSeedBanners();
    const eqCount = masterUnit.areas.reduce((s, a) => s + a.equipments.length, 0);
    toast(`✅ Unit 2 di-generate: ${masterUnit.areas.length} area, ${eqCount} equipment`, 'success');
    return;
  }

  // Unit ada tapi equipment kosong — langsung apply tanpa confirm
  const existingEqCount = (localUnit.areas || []).reduce((s, a) => s + (a.equipments || []).length, 0);
  if (existingEqCount === 0) {
    localUnit.id = 'U-002';
    const { totalAdded } = applyMasterToUnit(localUnit, masterUnit);
    saveAll(); renderHierTree(); populateUnitFilters(); renderDashboard(); checkSeedBanners();
    toast(`✅ Unit 2 di-generate: ${totalAdded} equipment`, 'success');
    return;
  }

  // Unit ada & sudah punya equipment — cek diff dulu
  let diffSummary = [];
  masterUnit.areas.forEach(masterArea => {
    const localArea   = localUnit.areas.find(a => a.id === masterArea.id || a.name.toLowerCase() === masterArea.name.toLowerCase());
    const localEquips = localArea ? (localArea.equipments || []) : [];
    const diff        = diffEquipment(localEquips, masterArea.equipments);
    if (diff.added.length)   diffSummary.push(`  • ${masterArea.name}: +${diff.added.length} equipment baru`);
    if (diff.updated.length) diffSummary.push(`  • ${masterArea.name}: ${diff.updated.length} equipment diperbarui`);
  });

  if (!diffSummary.length) {
    toast('✅ Unit 2 sudah sinkron dengan master data — tidak ada perubahan', 'success');
    return;
  }

  if (!confirm(
    `Ditemukan perbedaan Unit 2 vs master data:\n\n` +
    diffSummary.join('\n') +
    `\n\nLanjutkan? (Data monitoring & params yang ada tidak akan dihapus)`
  )) return;

  localUnit.id = 'U-002';
  const { totalAdded, totalUpdated } = applyMasterToUnit(localUnit, masterUnit);
  saveAll(); renderHierTree(); populateUnitFilters(); renderDashboard(); checkSeedBanners();
  toast(`✅ Unit 2 diperbarui: +${totalAdded} baru, ${totalUpdated} diupdate`, 'success');
}
 /**
 * resetAndSeedUnit — hapus unit lokal lalu generate fresh dari master.
 * Cocok dipakai saat data Sheets sudah di-reset/dihapus.
 * PERINGATAN: semua sesi monitoring yang terikat unit ini tetap ada,
 * hanya hierarki (area+equipment) yang di-reset.
 */
function resetAndSeedUnit(unitName) {
  if (!confirm(
    `⚠ RESET HIERARKI "${unitName}"?\n\n` +
    `Seluruh area dan equipment "${unitName}" akan dihapus dan di-generate ulang dari master data.\n` +
    `Data sesi monitoring yang sudah ada TIDAK akan dihapus.\n\n` +
    `Lanjutkan?`
  )) return;

  const masterUnitId = MASTER_UNITS[unitName]?.id || '';

  // Hapus semua unit yang match by name (case-insensitive) ATAU by hardcoded ID
  hierarchy.units = hierarchy.units.filter(u =>
    u.name.toLowerCase() !== unitName.toLowerCase() &&
    (masterUnitId ? u.id !== masterUnitId : true)
  );

  // Generate fresh dari master — buildUnitFromMaster akan buat unit baru tanpa existing
  const masterUnit = buildUnitFromMaster(unitName);
  if (!masterUnit) { toast('Master data tidak ditemukan', 'error'); return; }

  hierarchy.units.push(masterUnit);
  saveAll(); renderHierTree(); populateUnitFilters(); renderDashboard(); checkSeedBanners();

  const eqCount = masterUnit.areas.reduce((s, a) => s + a.equipments.length, 0);
  toast(`✅ "${unitName}" di-reset & di-generate ulang: ${masterUnit.areas.length} area, ${eqCount} equipment`, 'success');
}
