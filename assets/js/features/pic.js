'use strict';

// ═══════════════════════════════════════════════════════
// PIC MANAGEMENT
// ═══════════════════════════════════════════════════════
function initPICGrid(gridId) {
  const grid = document.getElementById(gridId || 'nsPICGrid');
  if (!grid) return;
  grid.innerHTML = PIC_LIST.map(p => {
    const sid = picSafeId(p);
    return `<label class="chk-item" id="chkPIC-${sid}">
      <input type="checkbox" value="${esc(p)}" onchange="toggleChk(this,'chkPIC-${sid}')"/>
      <span>${esc(p)}</span>
    </label>`;
  }).join('') || `<span style="color:var(--text3);font-size:12px">Belum ada PIC. Tambahkan di Config → Kelola PIC.</span>`;
}

function toggleChk(inp, parentId) {
  const lbl = document.getElementById(parentId);
  if (lbl) lbl.classList.toggle('checked', inp.checked);
}

function getSelectedPICs(gridId) {
  const grid = document.getElementById(gridId);
  if (!grid) return [];
  return Array.from(grid.querySelectorAll('input[type=checkbox]:checked')).map(el => el.value);
}

function picSafeId(name) { return name.replace(/[^a-zA-Z0-9_-]/g,'_'); }

function openManagePICModal() {
  renderPICManageList();
  document.getElementById('newPICInput').value = '';
  openOverlay('managePICOverlay');
}

function renderPICManageList() {
  const el = document.getElementById('picManageList');
  if (!el) return;
  el.innerHTML = PIC_LIST.map(p => `
    <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg3);border:1px solid var(--border);border-radius:7px;padding:8px 12px;gap:8px">
      <span style="font-weight:600;font-size:13px">👤 ${esc(p)}</span>
      <button class="tbl-btn" style="color:var(--red)" onclick="removePIC(${jsArg(p)})">✕ Hapus</button>
    </div>`).join('') || `<div style="color:var(--text3);font-size:12px;padding:8px">Belum ada PIC.</div>`;
}

function addPIC() {
  const inp  = document.getElementById('newPICInput');
  const name = (inp?.value||'').trim().toUpperCase();
  if (!name || name.length < 2) { toast('Nama PIC minimal 2 karakter','error'); return; }
  if (PIC_LIST.includes(name)) { toast(name + ' sudah ada','error'); return; }
  PIC_LIST.push(name); saveAll(); initPICGrid('nsPICGrid');
  renderPICManageList(); renderConfigPage(); inp.value = '';
  toast(name + ' ditambahkan ✓', 'success');
}

function removePIC(name) {
  if (!confirm('Hapus ' + name + '?')) return;
  PIC_LIST = PIC_LIST.filter(p => p !== name);
  saveAll(); initPICGrid('nsPICGrid'); renderPICManageList(); renderConfigPage();
  toast(name + ' dihapus', 'info');
}
