'use strict';

// ═══════════════════════════════════════════════════════
// BAGAN ORGANISASI (admin) — siapa melapor ke siapa.
// Dipakai server untuk eskalasi notifikasi temuan:
//   Crew (unit) → Leader (unit) → Supervisor (semua unit) → Plant Manager (unit)
// ═══════════════════════════════════════════════════════
const ORG_LEVEL = { crew: 1, leader: 2, spv: 3, manager: 4, admin: 5 };

let _orgDraft = {};   // username → reportsTo (perubahan belum disimpan)
let _orgDirty = false;

async function renderOrgChartPage() {
  const tree = document.getElementById('orgTree');
  if (!tree) return;
  if (!USERS.length) tree.innerHTML = `<div class="notif-empty">Memuat user...</div>`;
  try {
    await loadUsersFromServer();
  } catch (e) {
    tree.innerHTML = `<div class="notif-empty">Gagal memuat user: ${esc(e.message)}</div>`;
    return;
  }
  _orgDraft = Object.fromEntries(USERS.map(u => [u.username, u.reportsTo || '']));
  _setOrgDirty(false);
  renderOrgChart();
}

function _setOrgDirty(dirty) {
  _orgDirty = dirty;
  setText('orgDirtyNote', dirty ? '● Ada perubahan belum disimpan' : '');
}

function renderOrgChart() {
  renderOrgTree();
  renderOrgTable();
}

function _orgNode(u) {
  const rl = ROLE_LABELS[u.role] || { label: u.role, cls: 'b-gray' };
  const subCount = USERS.filter(x => _orgDraft[x.username] === u.username).length;
  return `<div class="org-node ${u.active === false ? 'inactive' : ''}">
    <div class="org-avatar" style="background:${getAvatarColor(u.name || u.username)}">${esc(getInitials(u.name || u.username))}</div>
    <div style="min-width:0">
      <div class="org-name">${esc(u.name || u.username)} ${u.active === false ? '<span class="org-sub">(nonaktif)</span>' : ''}</div>
      <div class="org-sub"><span class="role-badge ${rl.cls}" style="font-size:9px;padding:1px 6px">${esc(rl.label)}</span>
        · ${esc(unitLabel(u.unitId))}${subCount ? ` · ${subCount} bawahan` : ''}${u.phone ? ' · 📱' : ''}</div>
    </div>
  </div>`;
}

function renderOrgTree() {
  const el = document.getElementById('orgTree');
  if (!el) return;
  const byName = new Map(USERS.map(u => [u.username, u]));
  const children = {};
  USERS.forEach(u => {
    const parent = _orgDraft[u.username];
    if (parent && byName.has(parent)) (children[parent] = children[parent] || []).push(u);
  });
  const sortUsers = list => list.sort((a, b) =>
    (ORG_LEVEL[b.role] || 0) - (ORG_LEVEL[a.role] || 0) || unitLabel(a.unitId).localeCompare(unitLabel(b.unitId)) ||
    (a.name || a.username).localeCompare(b.name || b.username));

  const seen = new Set();
  const branch = u => {
    if (seen.has(u.username)) return ''; // pengaman rantai melingkar
    seen.add(u.username);
    const kids = sortUsers(children[u.username] || []);
    return `<li>${_orgNode(u)}${kids.length ? `<ul>${kids.map(branch).join('')}</ul>` : ''}</li>`;
  };

  const roots = sortUsers(USERS.filter(u => !_orgDraft[u.username] || !byName.has(_orgDraft[u.username])));
  // Puncak tanpa bawahan dipisahkan sebagai "belum terhubung"
  const connected = roots.filter(u => (children[u.username] || []).length || u.role === 'manager');
  const loose = roots.filter(u => !connected.includes(u));

  el.innerHTML =
    (connected.length ? `<ul class="org-tree">${connected.map(branch).join('')}</ul>`
                      : `<div class="notif-empty">Belum ada struktur. Klik "⚡ Atur Otomatis (Cascade)" atau atur atasan di tabel samping.</div>`) +
    (loose.length ? `<div class="org-section-title">Belum melapor ke siapa pun</div><ul class="org-tree">${loose.map(branch).join('')}</ul>` : '');
}

function renderOrgTable() {
  const tbody = document.getElementById('orgTableBody');
  if (!tbody) return;
  const sorted = [...USERS].sort((a, b) =>
    (ORG_LEVEL[a.role] || 0) - (ORG_LEVEL[b.role] || 0) || unitLabel(a.unitId).localeCompare(unitLabel(b.unitId)) ||
    (a.name || a.username).localeCompare(b.name || b.username));

  tbody.innerHTML = sorted.map(u => {
    const rl = ROLE_LABELS[u.role] || { label: u.role, cls: 'b-gray' };
    const current = _orgDraft[u.username] || '';
    // Calon atasan: level lebih tinggi lebih dulu
    const options = USERS.filter(x => x.username !== u.username)
      .sort((a, b) => (ORG_LEVEL[b.role] || 0) - (ORG_LEVEL[a.role] || 0) || (a.name || a.username).localeCompare(b.name || b.username))
      .map(x => `<option value="${esc(x.username)}" ${x.username === current ? 'selected' : ''}>${esc(x.name || x.username)} · ${esc(ROLE_LABELS[x.role]?.label || x.role)}${x.unitId ? ' · ' + esc(unitLabel(x.unitId)) : ''}</option>`)
      .join('');
    const warn = _orgLevelWarning(u, current);
    return `<tr>
      <td><div style="font-size:12px;font-weight:600">${esc(u.name || u.username)}</div><div class="org-sub">@${esc(u.username)}</div></td>
      <td><span class="role-badge ${rl.cls}" style="font-size:9px">${esc(rl.label)}</span></td>
      <td style="font-size:11px">${esc(unitLabel(u.unitId))}</td>
      <td>
        <select class="fsel2" style="font-size:11px;padding:5px 8px;width:100%;min-width:150px" onchange="setOrgReportsTo(${jsArg(u.username)}, this.value)">
          <option value="">— Tidak ada (puncak) —</option>${options}
        </select>
        ${warn ? `<div class="org-warn">⚠ ${esc(warn)}</div>` : ''}
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="4"><div class="notif-empty">Belum ada user.</div></td></tr>`;
}

/** Peringatan ringan bila struktur tidak sesuai cascade (tetap boleh disimpan). */
function _orgLevelWarning(u, parentName) {
  if (!parentName) return u.role === 'crew' || u.role === 'leader' ? 'Belum punya atasan' : '';
  const p = USERS.find(x => x.username === parentName);
  if (!p) return '';
  if ((ORG_LEVEL[p.role] || 0) < (ORG_LEVEL[u.role] || 0)) return 'Atasan ber-level lebih rendah';
  if (u.unitId && p.unitId && u.unitId !== p.unitId) return 'Atasan beda unit';
  return '';
}

function setOrgReportsTo(username, reportsTo) {
  // Cegah rantai melingkar: atasan baru tidak boleh bawahan (langsung/tidak langsung) dari user ini
  let cur = reportsTo, guard = 0;
  while (cur && guard++ < 50) {
    if (cur === username) {
      toast('✗ Tidak bisa: akan membuat rantai melapor melingkar', 'error');
      renderOrgTable();
      return;
    }
    cur = _orgDraft[cur] || '';
  }
  _orgDraft[username] = reportsTo;
  _setOrgDirty(true);
  renderOrgChart();
}

/**
 * Isi atasan otomatis sesuai cascade:
 *   crew → leader unit yg sama (dibagi rata) · leader → supervisor (unit sama / semua unit)
 *   supervisor → plant manager (unit sama, kalau tidak ada: plant manager pertama)
 *   plant manager & admin → puncak
 * User yang tidak punya calon atasan di levelnya akan naik ke level berikutnya.
 */
function autoCascadeOrgChart() {
  if (!USERS.length) return;
  const active = USERS.filter(u => u.active !== false);
  const load = {};
  const pick = (role, unitId, allowAllUnits) => {
    const cands = active.filter(x => x.role === role &&
      (!unitId || x.unitId === unitId || (allowAllUnits && !x.unitId)));
    if (!cands.length) return '';
    // Bagi rata: pilih atasan dengan bawahan paling sedikit
    cands.sort((a, b) => (load[a.username] || 0) - (load[b.username] || 0) || a.username.localeCompare(b.username));
    load[cands[0].username] = (load[cands[0].username] || 0) + 1;
    return cands[0].username;
  };
  const chain = {
    crew:    u => pick('leader', u.unitId, false) || pick('spv', u.unitId, true) || pick('manager', u.unitId, false),
    leader:  u => pick('spv', u.unitId, true) || pick('manager', u.unitId, false),
    spv:     u => pick('manager', u.unitId, false) || (u.unitId ? '' : pick('manager', '', false)),
    manager: () => '',
    admin:   () => '',
  };

  let changed = 0;
  ['manager', 'spv', 'leader', 'crew', 'admin'].forEach(role => {
    USERS.filter(u => u.role === role).forEach(u => {
      const to = (chain[role] || (() => ''))(u);
      if ((_orgDraft[u.username] || '') !== to) { _orgDraft[u.username] = to; changed++; }
    });
  });
  _setOrgDirty(_orgDirty || changed > 0);
  renderOrgChart();
  toast(changed ? `⚡ ${changed} atasan diatur otomatis — periksa lalu klik Simpan Bagan` : 'Struktur sudah sesuai cascade', 'info', 5000);
}

async function saveOrgChart() {
  const links = USERS
    .filter(u => (u.reportsTo || '') !== (_orgDraft[u.username] || ''))
    .map(u => ({ username: u.username, reportsTo: _orgDraft[u.username] || '' }));
  if (!links.length) { toast('Tidak ada perubahan', 'info'); return; }

  const btn = document.getElementById('orgSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = '↻ Menyimpan...'; }
  try {
    const res = await apiRequest('users/org', { method: 'PUT', body: { links } });
    USERS = res.users || USERS;
    _orgDraft = Object.fromEntries(USERS.map(u => [u.username, u.reportsTo || '']));
    _setOrgDirty(false);
    renderOrgChart();
    toast(`✓ Bagan organisasi disimpan (${res.changed} perubahan)`, 'success');
  } catch (e) {
    toast('✗ ' + e.message, 'error', 6000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan Bagan'; }
  }
}
