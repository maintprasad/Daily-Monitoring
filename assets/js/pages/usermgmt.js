'use strict';

// ═══════════════════════════════════════════════════════
// USER MANAGEMENT (admin only)
// Data user dimuat & disimpan lewat API admin. Password tersimpan sebagai hash
// di database, sehingga tidak bisa (dan tidak perlu) ditampilkan lagi — admin
// cukup mengisi password baru lewat Edit untuk me-reset.
// ═══════════════════════════════════════════════════════

const ROLE_LABELS = {
  admin:   { label: 'Admin',         cls: 'role-admin',   desc: 'Akses penuh ke semua fitur termasuk User Management, Organisasi, Config, Hierarki, dan semua data monitoring.' },
  manager: { label: 'Plant Manager', cls: 'role-manager', desc: 'Plant Manager per unit — semua fitur monitoring, finding & laporan. Menerima eskalasi ALERT di unitnya.' },
  spv:     { label: 'Supervisor',    cls: 'role-spv',     desc: 'Supervisor semua unit — semua fitur monitoring, riwayat, finding, dan laporan. Tidak bisa mengelola user.' },
  leader:  { label: 'Leader',        cls: 'role-leader',  desc: 'Leader per unit — Dashboard, Monitor, Riwayat, Finding, dan Hierarki. Tidak bisa Config dan User Management.' },
  crew:    { label: 'Crew',          cls: 'role-crew',    desc: 'Crew per unit — hanya akses Crew Portal (tampilan mobile-friendly) untuk unitnya.' },
};

const AVATAR_COLORS = ['#2b6cb8','#4a9e3f','#c0392b','#d35400','#7b3fa0','#2a7a5a'];

let USERS = [];

function getAvatarColor(name) {
  let n = 0;
  for (let i = 0; i < name.length; i++) n += name.charCodeAt(i);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

function getInitials(name) {
  // Hanya kata yang diawali huruf/angka — "Administrator (default)" → "A", bukan "A("
  const parts = (name || '?').split(/[-\s]/).filter(p => /^[\p{L}\p{N}]/u.test(p));
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] || name || '?')[0].toUpperCase();
}

// ── Tampilkan / sembunyikan menu User Management ──────
function applyUserMgmtVisibility() {
  const isAdmin = currentUser && currentUser.role === 'admin';

  // Sidebar
  const sbEl = document.getElementById('sbUserMgmt');
  if (sbEl) sbEl.style.display = isAdmin ? '' : 'none';

  // Topbar nav
  const navEl = document.getElementById('navUserMgmt');
  if (navEl) navEl.style.display = isAdmin ? '' : 'none';

  // Bagan organisasi
  const orgEl = document.getElementById('sbOrgChart');
  if (orgEl) orgEl.style.display = isAdmin ? '' : 'none';
}

/** Nama unit untuk ditampilkan; kosong = semua unit. */
function unitLabel(unitId) {
  if (!unitId) return 'Semua Unit';
  return hierarchy.units.find(u => u.id === unitId)?.name || unitId;
}

function userDisplayName(username) {
  const u = USERS.find(x => x.username === username);
  return u ? (u.name || u.username) : username;
}

async function loadUsersFromServer() {
  const res = await apiRequest('users');
  USERS = res.users || [];
  return USERS;
}

// ── Render tabel user ─────────────────────────────────
async function renderUserMgmtPage() {
  applyUserMgmtVisibility();
  const tbody = document.getElementById('userMgmtBody');
  if (!tbody) return;

  if (!USERS.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty"><div class="empty-ico">↻</div><div class="empty-msg">Memuat daftar user...</div></div></td></tr>`;
  }
  try {
    await loadUsersFromServer();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty"><div class="empty-ico">⚠</div><div class="empty-msg">Gagal memuat user: ${esc(e.message)}</div></div></td></tr>`;
    return;
  }
  renderUserTable();
}

function renderUserTable() {
  const tbody = document.getElementById('userMgmtBody');
  if (!tbody) return;
  if (!USERS.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty"><div class="empty-ico">👥</div><div class="empty-msg">Belum ada user.</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = USERS.map((u, idx) => {
    const rl    = ROLE_LABELS[u.role] || { label: u.role, cls: 'b-gray' };
    const color = getAvatarColor(u.name || u.username);
    const init  = getInitials(u.name || u.username);
    const isSelf = currentUser && u.username === currentUser.username;

    return `<tr>
      <td style="font-size:11px;color:var(--text3);font-family:'IBM Plex Mono',monospace">${idx+1}</td>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#fff;flex-shrink:0">${esc(init)}</div>
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--text)">${esc(u.name || '—')}</div>
            ${isSelf ? `<div style="font-size:9px;color:var(--green);font-family:'IBM Plex Mono',monospace">● Akun aktif (Anda)</div>` : ''}
          </div>
        </div>
      </td>
      <td style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--text2)">${esc(u.username)}</td>
      <td><span class="role-badge ${rl.cls}">${esc(rl.label)}</span></td>
      <td style="font-size:11px">${esc(unitLabel(u.unitId))}</td>
      <td style="font-size:11px">${u.reportsTo ? esc(userDisplayName(u.reportsTo)) : '<span style="color:var(--text3)">—</span>'}</td>
      <td style="font-size:11px;font-family:'IBM Plex Mono',monospace">${u.phone ? esc(u.phone) + (u.notifyWa ? '' : ' <span title="Notifikasi WA dimatikan">🔕</span>') : '<span style="color:var(--text3)">—</span>'}</td>
      <td>
        ${u.active === false
          ? '<span class="badge b-alert">Nonaktif</span>'
          : '<span class="badge b-ok">Aktif</span>'}
      </td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="tbl-btn" onclick="openEditUserModal(${idx})" title="Edit / reset password">✏ Edit</button>
          ${!isSelf ? `<button class="tbl-btn" style="color:var(--orange)"
            onclick="toggleUserActive(${idx})" title="${u.active===false?'Aktifkan':'Nonaktifkan'}">
            ${u.active === false ? '▶ Aktifkan' : '⏸ Nonaktifkan'}
          </button>
          <button class="tbl-btn" style="color:var(--red)" onclick="openDeleteUserModal(${idx})" title="Hapus">🗑</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function toggleUserActive(idx) {
  const u = USERS[idx];
  if (!u) return;
  const active = u.active === false;
  try {
    await apiRequest('users', { method: 'PUT', body: {
      originalUsername: u.username, username: u.username, name: u.name, role: u.role, active,
    }});
    toast(`User "${u.name}" ${active ? 'diaktifkan' : 'dinonaktifkan'} ✓`, 'info');
    renderUserMgmtPage();
  } catch (e) {
    toast('✗ ' + e.message, 'error');
  }
}

// ── State form ────────────────────────────────────────
let _editingUserIdx = null; // null = add mode, number = edit mode

function openAddUserModal() {
  _editingUserIdx = null;
  document.getElementById('userFormTitle').textContent = '✚ Tambah User Baru';
  document.getElementById('uf-submit-btn').textContent = '✚ Simpan User';
  document.getElementById('uf-pass-req').style.display = '';
  document.getElementById('uf-pass2-req').style.display = '';
  document.getElementById('uf-pass-hint').textContent = 'Min. 6 karakter';

  // Reset fields
  ['uf-name','uf-username','uf-password','uf-password2'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('uf-role').value = '';
  document.getElementById('uf-addpic').checked = false;
  document.getElementById('uf-pic-chk-label').classList.remove('checked');

  // Reset errors
  ['uf-name-err','uf-username-err','uf-role-err','uf-pass-err','uf-pass2-err'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = '';
  });
  document.getElementById('uf-role-desc').style.display = 'none';
  fillUserExtraFields(null);
  refreshUserPreview();
  openOverlay('userFormOverlay');
}

/** Isi field wilayah, atasan, nomor WA & preferensi notifikasi di form user. */
function fillUserExtraFields(u) {
  const unitSel = document.getElementById('uf-unit');
  if (unitSel) {
    unitSel.innerHTML = '<option value="">Semua Unit</option>' +
      hierarchy.units.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
    unitSel.value = u?.unitId || '';
  }
  const repSel = document.getElementById('uf-reports');
  if (repSel) {
    repSel.innerHTML = '<option value="">— Tidak ada (puncak) —</option>' +
      USERS.filter(x => x.username !== u?.username)
        .map(x => `<option value="${esc(x.username)}">${esc(x.name || x.username)} · ${esc(ROLE_LABELS[x.role]?.label || x.role)}${x.unitId ? ' · ' + esc(unitLabel(x.unitId)) : ''}</option>`).join('');
    repSel.value = u?.reportsTo || '';
  }
  setVal('uf-phone', u?.phone || '');
  setErr('uf-phone-err', '');
  [['uf-notify-app', u ? u.notifyApp !== false : true], ['uf-notify-wa', u ? u.notifyWa !== false : true]].forEach(([id, on]) => {
    const el = document.getElementById(id);
    if (el) { el.checked = on; document.getElementById(id + '-label')?.classList.toggle('checked', on); }
  });
  onUserRoleChange();
}

/** Supervisor & Admin mencakup semua unit → pilihan wilayah dikunci. */
function onUserRoleChange() {
  const role = document.getElementById('uf-role')?.value || '';
  const unitSel = document.getElementById('uf-unit');
  const hint = document.getElementById('uf-unit-hint');
  if (!unitSel) return;
  const allUnits = role === 'spv' || role === 'admin';
  unitSel.disabled = allUnits;
  if (allUnits) unitSel.value = '';
  if (hint) {
    hint.textContent = allUnits ? 'Supervisor & Admin otomatis mencakup semua unit'
      : (role && !unitSel.value ? '⚠ Pilih unit agar notifikasi & Crew Portal sesuai wilayahnya'
      : 'Crew, Leader & Plant Manager per unit');
  }
  unitSel.onchange = onUserRoleChange;
}

function openEditUserModal(idx) {
  const u = USERS[idx];
  if (!u) return;
  _editingUserIdx = idx;

  document.getElementById('userFormTitle').textContent = `✏ Edit User — ${u.name}`;
  document.getElementById('uf-submit-btn').textContent = '💾 Simpan Perubahan';
  document.getElementById('uf-pass-req').style.display = 'none';
  document.getElementById('uf-pass2-req').style.display = 'none';
  document.getElementById('uf-pass-hint').textContent = 'Kosongkan jika tidak ingin mengubah password';

  document.getElementById('uf-name').value     = u.name     || '';
  document.getElementById('uf-username').value = u.username || '';
  document.getElementById('uf-role').value     = u.role     || '';
  document.getElementById('uf-password').value  = '';
  document.getElementById('uf-password2').value = '';

  // Cek apakah nama user ada di PIC list
  const inPIC = PIC_LIST.some(p => p.toLowerCase() === (u.name||'').toLowerCase());
  document.getElementById('uf-addpic').checked = inPIC;
  document.getElementById('uf-pic-chk-label').classList.toggle('checked', inPIC);

  ['uf-name-err','uf-username-err','uf-role-err','uf-pass-err','uf-pass2-err'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = '';
  });

  fillUserExtraFields(u);
  refreshUserPreview();
  openOverlay('userFormOverlay');
}

function refreshUserPreview() {
  const name     = document.getElementById('uf-name')?.value.trim() || '';
  const role     = document.getElementById('uf-role')?.value || '';
  const username = document.getElementById('uf-username')?.value.trim() || '';

  const avatarEl = document.getElementById('userPreviewAvatar');
  const nameEl   = document.getElementById('userPreviewName');
  const roleEl   = document.getElementById('userPreviewRole');
  const descEl   = document.getElementById('uf-role-desc');

  if (avatarEl) {
    avatarEl.textContent = name ? getInitials(name) : (username ? username[0].toUpperCase() : '?');
    avatarEl.style.background = name ? getAvatarColor(name) : '#555';
  }
  if (nameEl) nameEl.textContent = name || username || '—';

  const rl = ROLE_LABELS[role];
  if (roleEl) {
    roleEl.innerHTML = rl ? `<span class="role-badge ${rl.cls}">${rl.label}</span>` : '';
  }
  if (descEl) {
    if (rl) {
      descEl.style.display = '';
      descEl.style.background = 'var(--bg3)';
      descEl.style.color = 'var(--text2)';
      descEl.innerHTML = `<strong>${rl.label}:</strong> ${rl.desc}`;
    } else {
      descEl.style.display = 'none';
    }
  }
}

function togglePassVis(inputId, btn) {
  const el = document.getElementById(inputId);
  if (!el) return;
  if (el.type === 'password') {
    el.type = 'text';
    btn.textContent = '🙈';
  } else {
    el.type = 'password';
    btn.textContent = '👁';
  }
}

async function submitUserForm() {
  const name     = document.getElementById('uf-name')?.value.trim()     || '';
  const username = (document.getElementById('uf-username')?.value.trim() || '').toLowerCase();
  const role     = document.getElementById('uf-role')?.value            || '';
  const password = document.getElementById('uf-password')?.value        || '';
  const password2= document.getElementById('uf-password2')?.value       || '';
  const addPIC   = document.getElementById('uf-addpic')?.checked        || false;
  const isEdit   = _editingUserIdx !== null;
  const original = isEdit ? USERS[_editingUserIdx] : null;
  if (isEdit && !original) return;

  // Reset errors
  ['uf-name-err','uf-username-err','uf-role-err','uf-pass-err','uf-pass2-err'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = '';
  });

  let ok = true;
  if (!name) {
    document.getElementById('uf-name-err').textContent = 'Nama wajib diisi';
    ok = false;
  }
  if (!username) {
    document.getElementById('uf-username-err').textContent = 'Username wajib diisi';
    ok = false;
  } else if (!/^[a-z0-9._-]+$/.test(username)) {
    document.getElementById('uf-username-err').textContent = 'Username hanya huruf kecil, angka, titik, underscore, atau dash';
    ok = false;
  } else if (USERS.some(u => u.username === username && u !== original)) {
    document.getElementById('uf-username-err').textContent = 'Username sudah digunakan';
    ok = false;
  }
  if (!role) {
    document.getElementById('uf-role-err').textContent = 'Role wajib dipilih';
    ok = false;
  }
  // Password — wajib saat add, opsional saat edit
  if (!isEdit && !password) {
    document.getElementById('uf-pass-err').textContent = 'Password wajib diisi';
    ok = false;
  } else if (password && password.length < 6) {
    document.getElementById('uf-pass-err').textContent = 'Password minimal 6 karakter';
    ok = false;
  } else if (password && password !== password2) {
    document.getElementById('uf-pass2-err').textContent = 'Konfirmasi password tidak cocok';
    ok = false;
  }
  const phone = (document.getElementById('uf-phone')?.value || '').trim();
  const phoneDigits = phone.replace(/\D/g, '');
  setErr('uf-phone-err', '');
  if (phone && (phoneDigits.length < 9 || phoneDigits.length > 15)) {
    setErr('uf-phone-err', 'Nomor WhatsApp tidak valid (contoh: 081234567890)');
    ok = false;
  }
  if (!ok) return;

  const extra = {
    unitId:    document.getElementById('uf-unit')?.value || '',
    reportsTo: document.getElementById('uf-reports')?.value || '',
    phone,
    notifyApp: document.getElementById('uf-notify-app')?.checked ?? true,
    notifyWa:  document.getElementById('uf-notify-wa')?.checked ?? true,
  };

  const btn = document.getElementById('uf-submit-btn');
  const btnText = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = '↻ Menyimpan...'; }
  try {
    if (isEdit) {
      await apiRequest('users', { method: 'PUT', body: {
        originalUsername: original.username, username, name, role, password,
        active: original.active !== false, ...extra,
      }});
    } else {
      await apiRequest('users', { method: 'POST', body: { username, name, role, password, active: true, ...extra } });
    }
  } catch (e) {
    toast('✗ ' + e.message, 'error', 5000);
    return;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = btnText; }
  }

  // Update daftar PIC (disimpan uppercase — dibandingkan tanpa beda huruf besar/kecil;
  // versi lama membandingkan nama asli dengan versi uppercase sehingga PIC bisa dobel)
  const nameUpper = name.toUpperCase();
  const oldUpper  = (original?.name || '').toUpperCase();
  const before = JSON.stringify(PIC_LIST);
  if (addPIC) {
    if (oldUpper && oldUpper !== nameUpper) PIC_LIST = PIC_LIST.filter(p => p.toUpperCase() !== oldUpper);
    if (!PIC_LIST.some(p => p.toUpperCase() === nameUpper)) PIC_LIST.push(nameUpper);
  } else if (isEdit) {
    PIC_LIST = PIC_LIST.filter(p => p.toUpperCase() !== nameUpper && p.toUpperCase() !== oldUpper);
  }
  if (JSON.stringify(PIC_LIST) !== before) saveAll();

  // Jika user yang diedit adalah diri sendiri, perbarui data login lokal
  if (isEdit && currentUser && original.username === currentUser.username) {
    currentUser = { ...currentUser, username, name, role, unitId: role === 'spv' || role === 'admin' ? '' : extra.unitId };
    saveAuth(getAuthToken(), currentUser);
  }

  closeOverlay('userFormOverlay');
  renderUserMgmtPage();
  renderConfigPage();
  toast(isEdit ? `User "${name}" berhasil diperbarui ✓` : `User "${name}" (${role}) berhasil ditambahkan ✓`, 'success');
}

// ── Delete user ───────────────────────────────────────
let _deletingUserIdx = null;

function openDeleteUserModal(idx) {
  const u = USERS[idx];
  if (!u) return;
  _deletingUserIdx = idx;
  const color = getAvatarColor(u.name || u.username);
  const init  = getInitials(u.name || u.username);
  const rl    = ROLE_LABELS[u.role] || { label: u.role, cls: 'b-gray' };

  document.getElementById('deleteUserBody').innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg3);border-radius:8px;margin-bottom:10px">
      <div style="width:40px;height:40px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;color:#fff">${esc(init)}</div>
      <div>
        <div style="font-size:14px;font-weight:700;color:var(--text)">${esc(u.name||'—')}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">
          @${esc(u.username)} · <span class="role-badge ${rl.cls}" style="font-size:9px">${rl.label}</span>
        </div>
      </div>
    </div>
    Apakah kamu yakin ingin menghapus user ini?
  `;
  openOverlay('deleteUserOverlay');
}

async function confirmDeleteUser() {
  if (_deletingUserIdx === null) return;
  const u = USERS[_deletingUserIdx];
  if (!u) return;
  try {
    await apiRequest('users', { method: 'DELETE', query: { username: u.username } });
  } catch (e) {
    toast('✗ ' + e.message, 'error', 5000);
    return;
  }
  _deletingUserIdx = null;
  closeOverlay('deleteUserOverlay');
  renderUserMgmtPage();
  toast(`User "${u.name || u.username}" dihapus ✓`, 'info');
}
