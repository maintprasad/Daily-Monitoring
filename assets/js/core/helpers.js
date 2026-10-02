'use strict';

// ═══════════════════════════════════════════════════════
// HELPER DOMAIN — pencarian hierarki & status sesi
// ═══════════════════════════════════════════════════════
function findUnit(uid)                           { return hierarchy.units.find(u => u.id === uid); }
function findArea(uid, aid)                      { return (findUnit(uid)?.areas || []).find(a => a.id === aid); }

// findEquip dihapus — gunakan findEquipFlex
// findEquipFlex: support saId kosong (equipment langsung di area)
function findEquipFlex(uid, aid, sid, eid) {
  return findArea(uid, aid)?.equipments?.find(e => e.id === eid) || null;
}
// getAllEquipsInArea: kumpulkan semua equip di area (subArea maupun langsung)
function getAllEquipsInArea(uid, aid) {
  const area = findArea(uid, aid);
  if (!area) return [];
  return area.equipments || [];
}

function getLastSession(uid, aid, sid, eid) {
  return sessions
    .filter(s => s.unitId === uid && s.areaId === aid && s.equipId === eid)
    .sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0))[0] || null;
}

/**
 * getEquipHistory — ambil semua sesi monitoring untuk satu equipment
 * diurutkan dari terbaru ke terlama
 */
function getEquipHistory(uid, aid, eid, limit) {
  return sessions
    .filter(s => s.equipId === eid &&
      (!uid || s.unitId === uid) &&
      (!aid || s.areaId === aid))
    .sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0))
    .slice(0, limit || Infinity);
}

function countEquipments() {
  return hierarchy.units.flatMap(u =>
    (u.areas || []).flatMap(a => a.equipments || [])
  ).length;
}

function sessStatus(sess) {
  const items = sess.items || [];
  if (!items.length) return 'PENDING';
  if (items.some(i=>i.status==='ALERT'))   return 'ALERT';
  if (items.some(i=>i.status==='WARNING')) return 'WARNING';
  if (items.some(i=>i.status==='OK'))      return 'OK';
  return 'PENDING';
}

function stBadge(st) {
  return {OK:'b-ok',WARNING:'b-warn',ALERT:'b-alert',PENDING:'b-pend'}[st]||'b-gray';
}
