'use strict';

// ── MONITOR PAGE ───────────────────────────────────────
function renderMonitorPage() {
  populateUnitFilters();
  const unitF = document.getElementById('monUnitFilter')?.value || '';
  const areaF = document.getElementById('monAreaFilter')?.value || '';
  const container = document.getElementById('monitorContent');
  if (!container) return;

  const units = hierarchy.units.filter(u => !unitF || u.id === unitF);
  if (!units.length || countEquipments() === 0) {
    container.innerHTML = `<div class="empty"><div class="empty-ico">📊</div><div class="empty-msg">Belum ada hierarki. Setup Unit → Area → Sub Area → Equipment terlebih dahulu di halaman Hierarki.</div></div>`;
    return;
  }

  // Helper render kartu equip (dipakai untuk subArea maupun equip langsung di area)
  function renderEquipTileGroup(unit, area, sa, equips) {
  if (!equips.length) return '';
  const titleStr = area.name;
  const subStr   = `${esc(unit.name)} · ${equips.length} equipment`;
  const btnOnclick = `openNewSessionModal('${unit.id}','${area.id}','','')`;
    return `<div class="card" style="margin-bottom:16px">
      <div class="card-hdr">
        <div>
          <div class="card-title">${esc(titleStr)}</div>
          <div class="card-sub">${subStr}</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="${btnOnclick}">✚ Monitoring</button>
      </div>
      <div class="card-body">
        <div class="equip-grid">
          ${equips.map(eq => {
            const lastSess = getLastSession(unit.id, area.id, '', eq.id);
            const st = lastSess ? sessStatus(lastSess) : 'PENDING';
            const tileCls = {OK:'t-ok',WARNING:'t-warn',ALERT:'t-alert',PENDING:'t-pend'}[st]||'t-pend';
            const lastTime = lastSess ? fmtDate(lastSess.tanggal) + ' ' + (lastSess.startTime||'') : 'Belum pernah';
            const tileClick = lastSess
              ? `openChecklistModal('${lastSess.id}','${unit.id}','${area.id}','','${eq.id}')`
              : `openNewSessionModal('${unit.id}','${area.id}','','${eq.id}')`;
            return `<div class="equip-tile ${tileCls}" onclick="${tileClick}">
              <div class="equip-tile-name">${esc(eq.name)}${eq.tag?` <span style="font-size:9px;color:var(--text3)">(${esc(eq.tag)})</span>`:''}
              </div>
              <div class="equip-tile-meta">${eq.params?.length||0} param · ${st}</div>
  <div style="font-size:10px;color:${!lastSess?'var(--red)':'var(--text3)'};margin-top:4px;font-weight:${!lastSess?'600':'400'}">
  ${!lastSess ? '⚠ Belum pernah dimonitor!' : 'Terakhir: ' + lastTime}
</div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
  }

  let html = '';
  units.forEach(unit => {
    const areas = unit.areas.filter(a => !areaF || a.id === areaF);
    areas.forEach(area => {
      const equips = area.equipments || [];
      html += renderEquipTileGroup(unit, area, null, equips);
    });
  });

  if (!html) html = `<div class="empty"><div class="empty-ico">📊</div><div class="empty-msg">Tidak ada equipment ditemukan dengan filter ini.</div></div>`;
  container.innerHTML = html;
}

function populateUnitFilters() {
  ['monUnitFilter','hUnit'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value;
    el.innerHTML = '<option value="">Semua Unit</option>' +
      hierarchy.units.map(u => `<option value="${u.id}" ${cur===u.id?'selected':''}>${esc(u.name)}</option>`).join('');
  });
  // NS dropdowns
  const nsUnit = document.getElementById('ns-unit');
  if (nsUnit) {
    const cur = nsUnit.value;
    nsUnit.innerHTML = '<option value="">— Pilih Unit —</option>' +
      hierarchy.units.map(u => `<option value="${u.id}" ${cur===u.id?'selected':''}>${esc(u.name)}</option>`).join('');
  }
  // Area filter for monitor
  const monArea = document.getElementById('monAreaFilter');
  if (monArea) {
    const cur = monArea.value;
    const allAreas = hierarchy.units.flatMap(u => u.areas.map(a => ({id:a.id,name:`${u.name} / ${a.name}`})));
    monArea.innerHTML = '<option value="">Semua Area</option>' +
      allAreas.map(a => `<option value="${a.id}" ${cur===a.id?'selected':''}>${esc(a.name)}</option>`).join('');
  }
}
