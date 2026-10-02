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

// ═══════════════════════════════════════════════════════
// GAMBAR BAGAN — top-down per level + garis penghubung (SVG)
//   Baris 1: Plant Manager · Baris 2: Supervisor · Baris 3: Leader dengan crew di bawahnya.
//   Setiap garis = "melapor ke". User dengan beberapa atasan punya beberapa garis,
//   sehingga tidak ada lagi kesan seolah ia hanya di bawah satu atasan.
// ═══════════════════════════════════════════════════════
let _orgResizeObs = null;

function renderOrgTree() {
  const el = document.getElementById('orgTree');
  if (!el) return;
  const byName = new Map(USERS.map(u => [u.username, u]));
  const mgrsOf = u => (_orgDraft[u.username] || []).filter(m => byName.has(m));
  const hasSubs = name => USERS.some(u => mgrsOf(u).includes(name));
  const inStruct = u => mgrsOf(u).length > 0 || hasSubs(u.username);
  const unitOrder = id => {
    if (!id) return -1;
    const i = hierarchy.units.findIndex(x => x.id === id);
    return i < 0 ? 999 : i;
  };
  const byUnitThenName = (a, b) => unitOrder(a.unitId) - unitOrder(b.unitId) ||
    (a.name || a.username).localeCompare(b.name || b.username);

  const struct = USERS.filter(inStruct);
  const placed = new Set();
  const take = list => { list.forEach(u => placed.add(u.username)); return list; };

  const admins   = take(struct.filter(u => u.role === 'admin').sort(byUnitThenName));
  const managers = take(struct.filter(u => u.role === 'manager').sort(byUnitThenName));
  const spvs     = take(struct.filter(u => u.role === 'spv').sort(byUnitThenName));
  const leaders  = take(struct.filter(u => u.role === 'leader').sort(byUnitThenName));
  // Crew diletakkan di bawah leader pertamanya; sisanya (melapor langsung ke spv/PM) di kolom tersendiri
  const teams = leaders.map(l => ({
    lead: l,
    crew: take(struct.filter(u => !placed.has(u.username) && u.role === 'crew' && mgrsOf(u)[0] === l.username).sort(byUnitThenName)),
  }));
  const direct = take(struct.filter(u => !placed.has(u.username)).sort(byUnitThenName));
  const outside = USERS.filter(u => !inStruct(u)).sort(byUnitThenName);

  const row = (label, inner) => inner ? `
    <div class="orgc-row">
      <div class="orgc-row-label">${label}</div>
      <div class="orgc-row-items">${inner}</div>
    </div>` : '';
  const cards = list => list.map(u => _orgCard(u, false)).join('');

  const teamCols = teams.map(t => `
    <div class="orgc-team">
      ${_orgCard(t.lead, false)}
      ${t.crew.length ? `<div class="orgc-crew">${t.crew.map(u => _orgCard(u, true)).join('')}</div>` : ''}
    </div>`).join('') +
    (direct.length ? `
    <div class="orgc-team">
      <div class="orgc-team-note">Melapor langsung</div>
      <div class="orgc-crew orgc-crew-direct">${direct.map(u => _orgCard(u, true)).join('')}</div>
    </div>` : '');

  if (!struct.length) {
    el.innerHTML = `<div class="notif-empty">Belum ada struktur. Klik "⚡ Atur Otomatis (Cascade)" atau atur atasan di tabel di bawah.</div>` +
      (outside.length ? `<div class="org-section-title">Belum masuk struktur</div><div class="orgc-outside">${outside.map(u => _orgCard(u, true)).join('')}</div>` : '');
    return;
  }

  el.innerHTML = `
    <div class="orgc" id="orgChartCanvas">
      <svg class="orgc-lines" aria-hidden="true"></svg>
      ${row('Admin', cards(admins))}
      ${row('Plant Manager', cards(managers))}
      ${row('Supervisor', cards(spvs))}
      ${row(leaders.length ? 'Leader &amp; Crew' : 'Crew', teamCols)}
    </div>
    ${outside.length ? `<div class="org-section-title">Belum masuk struktur (tidak punya atasan & bawahan)</div>
      <div class="orgc-outside">${outside.map(u => _orgCard(u, true)).join('')}</div>` : ''}
    <div class="orgc-legend">
      <span><i class="orgc-key"></i> melapor ke</span>
      <span><i class="orgc-key warn"></i> tidak sesuai cascade (beda unit / level lebih rendah)</span>
      <span>Arahkan kursor ke kartu untuk menyorot atasan & bawahannya</span>
    </div>`;

  requestAnimationFrame(drawOrgLines);
  if (!_orgResizeObs && 'ResizeObserver' in window) {
    _orgResizeObs = new ResizeObserver(() => requestAnimationFrame(drawOrgLines));
    _orgResizeObs.observe(el);
  }
}

function _orgCard(u, small) {
  const rl = ROLE_LABELS[u.role] || { label: u.role, cls: 'b-gray' };
  const mgrs = (_orgDraft[u.username] || []);
  const subCount = USERS.filter(x => (_orgDraft[x.username] || []).includes(u.username)).length;
  return `<div class="orgc-node ${small ? 'small' : ''} ${u.active === false ? 'inactive' : ''}" data-user="${esc(u.username)}"
      onmouseenter="orgHighlight(${jsArg(u.username)})" onmouseleave="orgHighlight(null)">
    <div class="org-avatar" style="background:${getAvatarColor(u.name || u.username)}">${esc(getInitials(u.name || u.username))}</div>
    <div style="min-width:0">
      <div class="org-name">${esc(u.name || u.username)}${u.active === false ? ' <span class="org-sub">(nonaktif)</span>' : ''}</div>
      <div class="org-sub"><span class="role-badge ${rl.cls}" style="font-size:9px;padding:1px 6px">${esc(rl.label)}</span>
        ${esc(unitLabel(u.unitId))}${!small && subCount ? ` · ${subCount} bawahan` : ''}${u.phone ? ' · 📱' : ''}</div>
      ${mgrs.length > 1 ? `<div class="org-multi">↑ ${mgrs.length} atasan: ${mgrs.map(m => esc(userDisplayName(m))).join(', ')}</div>` : ''}
    </div>
  </div>`;
}

/** Gambar garis "melapor ke" sesuai posisi kartu sebenarnya di layar. */
function drawOrgLines() {
  const canvas = document.getElementById('orgChartCanvas');
  if (!canvas || !canvas.offsetParent) return; // halaman tidak tampil
  const svg = canvas.querySelector('svg.orgc-lines');
  const base = canvas.getBoundingClientRect();
  svg.setAttribute('width', canvas.scrollWidth);
  svg.setAttribute('height', canvas.scrollHeight);

  const nodes = new Map([...canvas.querySelectorAll('.orgc-node')].map(n => [n.dataset.user, n]));
  const box = name => {
    const n = nodes.get(name);
    if (!n) return null;
    const r = n.getBoundingClientRect();
    const left = r.left - base.left + canvas.scrollLeft, top = r.top - base.top + canvas.scrollTop;
    return { left, top, right: left + r.width, bottom: top + r.height, cx: left + r.width / 2, cy: top + r.height / 2 };
  };

  const paths = [];
  USERS.forEach(u => {
    const c = box(u.username);
    if (!c) return;
    (_orgDraft[u.username] || []).forEach(m => {
      const p = box(m);
      if (!p) return;
      const mgr = USERS.find(x => x.username === m);
      const warn = mgr && ((ORG_LEVEL[mgr.role] || 0) < (ORG_LEVEL[u.role] || 0) ||
        (u.unitId && mgr.unitId && u.unitId !== mgr.unitId));
      let d, end; // end = titik di kartu bawahan (diberi bulatan kecil)
      const childTeam = nodes.get(u.username).closest('.orgc-team');
      const sameTeam = childTeam && childTeam === nodes.get(m).closest('.orgc-team') && c.top > p.bottom;
      if (sameTeam) {
        // Crew di bawah leader-nya (satu kolom): rel di sisi kiri
        d = `M ${p.left + 16} ${p.bottom} V ${c.cy} H ${c.left}`;
        end = [c.left, c.cy];
      } else if (c.top > p.bottom + 6) {
        // Atasan di baris atas: garis siku turun dari bawah atasan ke atas bawahan
        const midY = c.top - 14;
        d = `M ${p.cx} ${p.bottom} V ${midY} H ${c.cx} V ${c.top}`;
        end = [c.cx, c.top];
      } else {
        // Posisi tidak lazim (atasan sejajar/di bawah): kurva samping
        const x1 = c.cx < p.cx ? c.right : c.left, x2 = c.cx < p.cx ? p.left : p.right;
        d = `M ${x1} ${c.cy} C ${(x1 + x2) / 2} ${c.cy}, ${(x1 + x2) / 2} ${p.cy}, ${x2} ${p.cy}`;
        end = [x1, c.cy];
      }
      const attrs = `class="${warn ? 'warn' : ''}" data-from="${esc(u.username)}" data-to="${esc(m)}"`;
      paths.push(`<path d="${d}" ${attrs}/><circle cx="${end[0]}" cy="${end[1]}" r="3" ${attrs}/>`);
    });
  });
  svg.innerHTML = paths.join('');
}

/** Sorot kartu beserta atasan, bawahan, dan garisnya. */
function orgHighlight(name) {
  const canvas = document.getElementById('orgChartCanvas');
  if (!canvas) return;
  canvas.querySelectorAll('.hl').forEach(x => x.classList.remove('hl'));
  canvas.classList.toggle('dim', !!name);
  if (!name) return;
  const related = new Set([name, ...(_orgDraft[name] || [])]);
  USERS.forEach(u => { if ((_orgDraft[u.username] || []).includes(name)) related.add(u.username); });
  canvas.querySelectorAll('.orgc-node').forEach(n => { if (related.has(n.dataset.user)) n.classList.add('hl'); });
  canvas.querySelectorAll('svg [data-from]').forEach(p => {
    if (p.dataset.from === name || p.dataset.to === name) p.classList.add('hl');
  });
}

window.addEventListener('resize', () => requestAnimationFrame(drawOrgLines));

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
    if (cur.includes(manager)) return;
    _orgDraft[username] = [...cur, manager];
  } else {
    if (!cur.includes(manager)) return;
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
  if (!links.length) { _setOrgDirty(false); toast('Tidak ada perubahan', 'info'); return; }

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
