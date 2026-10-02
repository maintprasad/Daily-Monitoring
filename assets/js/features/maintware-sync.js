'use strict';

// ═══════════════════════════════════════════════════════
// SINKRON ID HIERARKI DARI MAINTWARE
// Menyamakan ID unit/area/equipment lokal dengan ID resmi di MaintWare
// (dicocokkan berdasarkan nama/tag), termasuk referensi ID di sesi monitoring.
// ═══════════════════════════════════════════════════════
async function fetchAndSyncHierarchyIds(opts) {
  const silent = opts && opts.silent;
  try {
    const resp = await fetch(
      WO_API_URL + '?fn=getHierarchy&key=' + encodeURIComponent(MAINTWARE_KEY),
      { redirect: 'follow' }
    ).then(r => r.text());

    let parsed;
    try { parsed = JSON.parse(resp); } catch(e) { return; }

    if (!(parsed.ok || parsed.status === 'ok') || !Array.isArray(parsed.units)) return;

    let idsSynced = 0;
    parsed.units.forEach(remoteUnit => {
      const localUnit = hierarchy.units.find(u =>
        u.name.toLowerCase() === remoteUnit.name.toLowerCase()
      );
      if (!localUnit) return;

      // Sync unit ID
      if (remoteUnit.id && localUnit.id !== remoteUnit.id) {
        // Update semua sesi yang pakai unitId lama
        sessions.forEach(s => { if (s.unitId === localUnit.id) s.unitId = remoteUnit.id; });
        localUnit.id = remoteUnit.id;
        idsSynced++;
      }

      (remoteUnit.areas || []).forEach(remoteArea => {
        const localArea = (localUnit.areas || []).find(a =>
          a.name.toLowerCase() === remoteArea.name.toLowerCase()
        );
        if (!localArea) return;

        if (remoteArea.id && localArea.id !== remoteArea.id) {
          sessions.forEach(s => { if (s.areaId === localArea.id) s.areaId = remoteArea.id; });
          localArea.id = remoteArea.id;
          idsSynced++;
        }

        // Sub areas
        (remoteArea.subAreas || []).forEach(remoteSA => {
          const localSA = (localArea.subAreas || []).find(s =>
            s.name.toLowerCase() === remoteSA.name.toLowerCase()
          );
          if (!localSA) return;
          if (remoteSA.id && localSA.id !== remoteSA.id) {
            sessions.forEach(s => { if (s.subAreaId === localSA.id) s.subAreaId = remoteSA.id; });
            localSA.id = remoteSA.id;
            idsSynced++;
          }

          // Equip di sub area
          (remoteSA.equipments || []).forEach(remoteEq => {
            const localEq = (localSA.equipments || []).find(e =>
              e.name.toLowerCase() === remoteEq.name.toLowerCase() ||
              (e.tag && remoteEq.tag && e.tag.toLowerCase() === remoteEq.tag.toLowerCase())
            );
            if (!localEq) return;
            if (remoteEq.id && localEq.id !== remoteEq.id) {
              sessions.forEach(s => { if (s.equipId === localEq.id) s.equipId = remoteEq.id; });
              localEq.id = remoteEq.id;
              idsSynced++;
            }
          });
        });

        // Equip langsung di area
        (remoteArea.equipments || []).forEach(remoteEq => {
          const localEq = (localArea.equipments || []).find(e =>
            e.name.toLowerCase() === remoteEq.name.toLowerCase() ||
            (e.tag && remoteEq.tag && e.tag.toLowerCase() === remoteEq.tag.toLowerCase())
          );
          if (!localEq) return;
          if (remoteEq.id && localEq.id !== remoteEq.id) {
            sessions.forEach(s => { if (s.equipId === localEq.id) s.equipId = remoteEq.id; });
            localEq.id = remoteEq.id;
            idsSynced++;
          }
        });
      });
    });

    if (idsSynced > 0) {
      saveAll();
      renderHierTree();
      if (!silent) toast(`🔄 ${idsSynced} ID hierarki diperbarui dari MaintWare`, 'info');
      console.log(`[HierSync] ${idsSynced} ID diperbarui dari API MaintWare`);
    }
  } catch(e) {
    console.warn('[HierSync] Tidak bisa sync ID dari API:', e.message);
  }
}
