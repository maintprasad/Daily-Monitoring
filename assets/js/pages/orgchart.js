'use strict';

// ═══════════════════════════════════════════════════════
// BAGAN ORGANISASI (admin) — siapa melapor ke siapa.
// Satu user boleh punya LEBIH DARI SATU atasan (mis. Supervisor → PM Unit 1 & PM Unit 2).
// Dipakai server untuk eskalasi notifikasi temuan:
//   Crew (unit) → Leader (unit) → Supervisor (semua unit) → Plant Manager (unit)
// ORG_LEVEL, managersOf(), managerPickerHTML() ada di usermgmt.js
// ═══════════════════════════════════════════════════════
let _orgDraft = {};   // username → [atasan, ...] (perubahan belum disimpan)
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
  _resetOrgDraft();
  renderOrgChart();
}

function _resetOrgDraft() {
  _orgDraft = Object.fromEntries(USERS.map(u => [u.username, [...managersOf(u)]]));
  _setOrgDirty(false);
}

function _setOrgDirty(dirty) {
  _orgDirty = dirty;
  setText('orgDirtyNote', dirty ? '● Ada perubahan belum disimpan' : '');
}

function renderOrgChart() {
  renderOrgTree();
  renderOrgTable();
}

function _orgNode(u, extraNote) {
  const rl = ROLE_LABELS[u.role] || { label: u.role, cls: 'b-gray' };
  const subCount = USERS.filter(x => (_orgDraft[x.username] || []).includes(u.username)).length;
  const mgrs = _orgDraft[u.username] || [];
  return `<div class="org-node ${u.active === false ? 'inactive' : ''}">
    <div class="org-avatar" style="background:${getAvatarColor(u.name || u.username)}">${esc(getInitials(u.name || u.username))}</div>
    <div style="min-width:0">
      <div class="org-name">${esc(u.name || u.username)} ${u.active === false ? '<span class="org-sub">(nonaktif)</span>' : ''}</div>
      <div class="org-sub"><span class="role-badge ${rl.cls}" style="font-size:9px;padding:1px 6px">${esc(rl.label)}</span>
        · ${esc(unitLabel(u.unitId))}${subCount ? ` · ${subCount} bawahan` : ''}${u.phone ? ' · 📱' : ''}</div>
      ${mgrs.length > 1 ? `<div class="org-multi">↗ Melapor ke ${mgrs.length} atasan: ${mgrs.map(m => esc(userDisplayName(m))).join(', ')}</div>` : ''}
      ${extraNote || ''}
    </div>
  </div>`;
}

/**
 * Pohon: user ditampilkan lengkap di bawah atasan PERTAMA-nya; di bawah atasan lainnya
 * hanya muncul sebagai referensi singkat (supaya cabang tidak terduplikasi).
 */
function renderOrgTree() {
  const el = document.getElementById('orgTree');
  if (!el) return;
  const byName = new Map(USERS.map(u => [u.username, u]));
  const primary = {}, secondary = {};
  USERS.forEach(u => {
    const mgrs = (_orgDraft[u.username] || []).filter(m => byName.has(m));
    mgrs.forEach((m, i) => {
      const bucket = i === 0 ? primary : secondary;
      (bucket[m] = bucket[m] || []).push(u);
    });
  });
  const sortUsers = list => [...list].sort((a, b) =>
    (ORG_LEVEL[b.role] || 0) - (ORG_LEVEL[a.role] || 0) || unitLabel(a.unitId).localeCompare(unitLabel(b.unitId)) ||
    (a.name || a.username).localeCompare(b.name || b.username));

  const seen = new Set();
  const branch = u => {
    if (seen.has(u.username)) return ''; // pengaman rantai melingkar
    seen.add(u.username);
    const kids = sortUsers(primary[u.username] || []);
    const refs = sortUsers(secondary[u.username] || []);
    const items = [
      ...kids.map(branch),
      ...refs.map(r => `<li><div class="org-ref">↪ ${esc(r.name || r.username)}
        <span class="org-sub">· ${esc(ROLE_LABELS[r.role]?.label || r.role)} — juga melapor ke sini</span></div></li>`),
    ].join('');
    return `<li>${_orgNode(u)}${items ? `<ul>${items}</ul>` : ''}</li>`;
  };

  const roots = sortUsers(USERS.filter(u => !(_orgDraft[u.username] || []).some(m => byName.has(m))));
  const hasKids = u => (primary[u.username] || []).length || (secondary[u.username] || []).length;
  const connected = roots.filter(u => hasKids(u) || u.role === 'manager');
  const loose = roots.filter(u => !connected.includes(u));

  el.innerHTML =
    (connected.length ? `<ul class="org-tree">${connected.map(branch).join('')}</ul>`
                      : `<div class="notif-empty">Belum ada struktur. Klik "⚡ Atur Otomatis (Cascade)" atau atur atasan di tabel samping.</div>`) +
    (loose.length ? `<div class="org-section-title">Belum melapor ke siapa pun</div><ul class="org-tree">${loose.map(branch).join('')}</ul>` : '');
}

function renderOrgTable() {
  const tbody = document.getElementById('orgTableBody');
  if (!tbody) return;
  // Pertahankan picker yang sedang terbuka setelah render ulang
  const openUser = document.querySelector('#orgTableBody details[open]')?.dataset.user;
  const sorted = [...USERS].sort((a, b) =>
    (ORG_LEVEL[a.role] || 0) - (ORG_LEVEL[b.role] || 0) || unitLabel(a.unitId).localeCompare(unitLabel(b.unitId)) ||
    (a.name || a.username).localeCompare(b.name || b.username));

  tbody.innerHTML = sorted.map(u => {
    const rl = ROLE_LABELS[u.role] || { label: u.role, cls: 'b-gray' };
    const mgrs = _orgDraft[u.username] || [];
    const warns = _orgWarnings(u, mgrs);
    return `<tr>
      <td><div style="font-size:12px;font-weight:600">${esc(u.name || u.username)}</div><div class="org-sub">@${esc(u.username)}</div></td>
      <td><span class="role-badge ${rl.cls}" style="font-size:9px">${esc(rl.label)}</span></td>
      <td style="font-size:11px">${esc(unitLabel(u.unitId))}</td>
      <td>
        <details class="org-picker" data-user="${esc(u.username)}" ${openUser === u.username ? 'open' : ''}>
          <summary>${mgrs.length ? mgrs.map(m => `<span class="org-chip">${esc(userDisplayName(m))}</span>`).join('') : '<span class="org-sub">— Tidak ada (puncak) —</span>'}
            <span class="org-edit">✏</span></summary>
          <div class="mgr-picker">${managerPickerHTML(u.username, mgrs, 'toggleOrgManager')}</div>
        </details>
        ${warns.map(w => `<div class="org-warn">⚠ ${esc(w)}</div>`).join('')}
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="4"><div class="notif-empty">Belum ada user.</div></td></tr>`;
}

/** Peringatan ringan bila struktur tidak sesuai cascade (tetap boleh disimpan). */
function _orgWarnings(u, mgrs) {
  if (!mgrs.length) return u.role === 'crew' || u.role === 'leader' ? ['Belum punya atasan'] : [];
  const out = [];
  mgrs.forEach(m => {
    const p = USERS.find(x => x.username === m);
    if (!p) return;
    if ((ORG_LEVEL[p.role] || 0) < (ORG_LEVEL[u.role] || 0)) out.push(`${p.name || p.username}: level lebih rendah`);
    else if (u.unitId && p.unitId && u.unitId !== p.unitId) out.push(`${p.name || p.username}: beda unit`);
  });
  return out;
}

/** Apakah `target` berada di atas `username` (atasan langsung / tidak langsung)? */
function _isAbove(target, username, graph) {
  const stack = [...(graph[target] || [])];
  const seen = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (cur === username) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(graph[cur] || []));
  }
  return false;
}

function toggleOrgManager(username, manager, checked) {
  const cur = _orgDraft[username] || [];
  if (checked) {
    // Cegah rantai melingkar: atasan baru tidak boleh bawahan (langsung/tidak langsung) dari user ini
    if (_isAbove(manager, username, _orgDraft)) {
      toast('✗ Tidak bisa: akan membuat rantai melapor melingkar', 'error');
      renderOrgTable();
      return;
    }
    if (!cur.includes(manager)) _orgDraft[username] = [...cur, manager];
  } else {
    _orgDraft[username] = cur.filter(m => m !== manager);
  }
  _setOrgDirty(true);
  renderOrgChart();
}

/**
 * Isi atasan otomatis sesuai cascade:
 *   crew → leader unit yg sama (dibagi rata)
 *   leader → supervisor (unit sama / semua unit; dibagi rata)
 *   supervisor → SEMUA plant manager (supervisor semua unit) atau plant manager unitnya
 *   plant manager & admin → puncak
 * User tanpa calon atasan di level berikutnya akan naik satu level lagi.
 */
function autoCascadeOrgChart() {
  if (!USERS.length) return;
  const active = USERS.filter(u => u.active !== false);
  const load = {};
  const cands = (role, unitId, allowAllUnits) => active.filter(x => x.role === role &&
    (!unitId || x.unitId === unitId || (allowAllUnits && !x.unitId)));
  const pickOne = (role, unitId, allowAllUnits) => {
    const list = cands(role, unitId, allowAllUnits);
    if (!list.length) return [];
    // Bagi rata: pilih atasan dengan bawahan paling sedikit
    list.sort((a, b) => (load[a.username] || 0) - (load[b.username] || 0) || a.username.localeCompare(b.username));
    load[list[0].username] = (load[list[0].username] || 0) + 1;
    return [list[0].username];
  };
  const firstNonEmpty = (...fns) => { for (const fn of fns) { const r = fn(); if (r.length) return r; } return []; };

  const chain = {
    crew:    u => firstNonEmpty(() => pickOne('leader', u.unitId, false), () => pickOne('spv', u.unitId, true),
                                () => pickOne('manager', u.unitId, false)),
    leader:  u => firstNonEmpty(() => pickOne('spv', u.unitId, true), () => pickOne('manager', u.unitId, false)),
    // Supervisor semua unit melapor ke semua Plant Manager; supervisor per unit ke PM unitnya
    spv:     u => cands('manager', u.unitId, false).map(m => m.username).sort(),
    manager: () => [],
    admin:   () => [],
  };

  let changed = 0;
  ['manager', 'spv', 'leader', 'crew', 'admin'].forEach(role => {
    USERS.filter(u => u.role === role).forEach(u => {
      const to = (chain[role] || (() => []))(u);
      if (JSON.stringify(_orgDraft[u.username] || []) !== JSON.stringify(to)) { _orgDraft[u.username] = to; changed++; }
    });
  });
  _setOrgDirty(_orgDirty || changed > 0);
  renderOrgChart();
  toast(changed ? `⚡ ${changed} user diatur otomatis — periksa lalu klik Simpan Bagan` : 'Struktur sudah sesuai cascade', 'info', 5000);
}

async function saveOrgChart() {
  const links = USERS
    .filter(u => JSON.stringify(managersOf(u)) !== JSON.stringify(_orgDraft[u.username] || []))
    .map(u => ({ username: u.username, reportsTo: _orgDraft[u.username] || [] }));
  if (!links.length) { toast('Tidak ada perubahan', 'info'); return; }

  const btn = document.getElementById('orgSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = '↻ Menyimpan...'; }
  try {
    const res = await apiRequest('users/org', { method: 'PUT', body: { links } });
    USERS = res.users || USERS;
    _resetOrgDraft();
    renderOrgChart();
    toast(`✓ Bagan organisasi disimpan (${res.changed} perubahan)`, 'success');
  } catch (e) {
    toast('✗ ' + e.message, 'error', 6000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan Bagan'; }
  }
}
