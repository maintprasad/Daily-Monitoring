'use strict';

// ═══════════════════════════════════════════════════════
// LOGIN / AUTH
// Password diverifikasi di server (tersimpan sebagai hash di database).
// Browser hanya menyimpan token login, bukan password.
// ═══════════════════════════════════════════════════════
async function doLogin() {
  const userEl = document.getElementById('loginUser');
  const passEl = document.getElementById('loginPass');
  const errEl  = document.getElementById('loginErr');
  const btn    = document.querySelector('.login-btn');

  const username = (userEl?.value || '').trim().toLowerCase();
  const password = passEl?.value || '';

  if (errEl) errEl.textContent = '';

  if (!username || !password) {
    if (errEl) errEl.textContent = '⚠ Username dan password wajib diisi.';
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = '↻ Memeriksa...'; }
  let res;
  try {
    res = await apiRequest('auth/login', { method: 'POST', body: { username, password } });
  } catch (e) {
    if (errEl) errEl.textContent = '✗ ' + e.message;
    return;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔐 Masuk'; }
  }

  saveAuth(res.token, res.user);
  currentUser = res.user;

  const loginScreen = document.getElementById('loginScreen');
  if (loginScreen) loginScreen.classList.add('hidden');

  try {
    initApp();
  } catch(e) {
    console.error('initApp error setelah login:', e);
    toast('Peringatan: sebagian fitur mungkin tidak tampil. Coba refresh.', 'error');
  }
}

/** Dipanggil apiRequest() saat server membalas 401 (token kadaluarsa / akun dinonaktifkan). */
function handleAuthExpired(message) {
  if (!currentUser) return;
  toast(message || 'Sesi login berakhir. Silakan login ulang.', 'error', 6000);
  doLogout({ skipFlush: true });
}

async function doLogout(opts = {}) {
  if (!opts.skipFlush && currentUser && hasPendingChanges()) {
    // Usahakan perubahan terakhir sudah masuk database sebelum token dihapus
    const ok = await flushChanges();
    if (!ok && !confirm('Ada perubahan yang belum tersimpan ke database (offline). Tetap logout?\n' +
                        'Perubahan tetap tersimpan di perangkat ini dan dikirim saat login berikutnya.')) return;
  }
  if (!opts.skipFlush) apiRequest('auth/logout', { method: 'POST' }).catch(() => {});
  clearAuth();
  resetNotifications();
  currentUser = null;

  // Sembunyikan crew portal jika aktif
  const crewPortal = document.getElementById('crewPortal');
  if (crewPortal) crewPortal.classList.remove('active');

  // Restore layout normal
  document.querySelector('.topbar')?.style.removeProperty('display');
  document.querySelector('.layout')?.style.removeProperty('display');
  document.querySelector('.mobile-nav')?.style.removeProperty('display');

  // Stop polling
  stopAutoPolling();

  const loginScreen = document.getElementById('loginScreen');
  if (loginScreen) loginScreen.classList.remove('hidden');
  const userEl = document.getElementById('loginUser');
  const passEl = document.getElementById('loginPass');
  const errEl  = document.getElementById('loginErr');
  if (userEl) userEl.value = '';
  if (passEl) passEl.value = '';
  if (errEl)  errEl.textContent = '';
}

function applyRoleRestrictions() {
  const role    = currentUser?.role || '';
  const isCrew  = role === 'crew';
  const isAdmin = role === 'admin';
  const isLeader = role === 'leader';

  // ── User Management & Data Recovery: admin only ──
  applyUserMgmtVisibility();
  const sbDR = document.getElementById('sbDataRecovery');
  if (sbDR) sbDR.style.display = isAdmin ? '' : 'none';
  const sbBE = document.getElementById('sbBigErrorScan');
  if (sbBE) sbBE.style.display = isAdmin ? '' : 'none';

  // ── Sembunyikan menu sesuai role (lihat ROLE_LABELS) ──
  const hiddenPages = isCrew ? ['hierarchy','config','findings','rca'] : isLeader ? ['config'] : [];
  document.querySelectorAll('[data-page]').forEach(el => {
    const pg = el.dataset.page;
    if (['hierarchy','config','findings','rca'].includes(pg)) {
      el.style.display = hiddenPages.includes(pg) ? 'none' : '';
    }
  });

  // ── Sembunyikan section Database Sync di sidebar untuk crew ──
  const sbSync = document.getElementById('sbSyncSection');
  if (sbSync) sbSync.style.display = isCrew ? 'none' : '';

  // ── Sembunyikan tombol Sync di topbar untuk crew ──
  const syncBadge = document.getElementById('syncBadge');
  if (syncBadge) syncBadge.style.display = isCrew ? 'none' : '';

  // ── Crew tidak bisa edit hierarki ──
  const addUnitBtn = document.querySelector('#page-hierarchy .btn-primary');
  if (addUnitBtn) addUnitBtn.style.display = isCrew ? 'none' : '';

  // ── Admin: tampilkan badge khusus di topbar (hapus jika login ulang sebagai non-admin) ──
  if (!isAdmin) document.getElementById('adminTopbarBadge')?.remove();
  if (isAdmin) {
    const existingBadge = document.getElementById('adminTopbarBadge');
    if (!existingBadge) {
      const topRight = document.querySelector('.top-right');
      if (topRight) {
        const badge = document.createElement('span');
        badge.id = 'adminTopbarBadge';
        badge.style.cssText = `
          font-size:9px;font-family:'IBM Plex Mono',monospace;
          padding:3px 8px;border-radius:10px;
          background:rgba(192,57,43,.2);border:1px solid rgba(192,57,43,.35);
          color:#e07070;letter-spacing:.05em;font-weight:700;white-space:nowrap;
        `;
        badge.textContent = '👑 ADMIN';
        badge.title = 'Anda login sebagai Administrator';
        topRight.insertBefore(badge, topRight.firstChild);
      }
    }
  }
}
