'use strict';

// ═══════════════════════════════════════════════════════
// APP BOOTSTRAP & NAVIGASI
// ═══════════════════════════════════════════════════════
const POLL_INTERVAL_MS = 30000;
let _uiInitialized = false;

function initApp() {
  // Listener DOM cukup dipasang sekali — initApp() dipanggil lagi setiap login ulang
  if (!_uiInitialized) {
    initNav();
    overlayDismiss();
    _uiInitialized = true;
  }
  loadAll();
  setTodayDate();
  navigateTo('dashboard');
  renderAll();
  populateUnitFilters();
  setSyncStatus('idle');
  applyRoleRestrictions();

  // Ambil data terbaru dari database
  pullFromServer({ silent: true });

  // Sinkronisasi ID hierarchy dari MaintWare (hanya role yang boleh mengubah hierarki)
  if (WO_API_URL && canEditMasterData()) {
    setTimeout(() => fetchAndSyncHierarchyIds({ silent: true }), 2500);
  }
  startAutoPolling();

  // ── Crew portal: tampilkan UI khusus untuk role crew ──
  if (currentUser && currentUser.role === 'crew') {
    setTimeout(() => {
      showCrewPortal();
    }, 150);
  }

  // Isian checklist yang belum sempat disimpan (browser/HP tertutup)
  setTimeout(offerChecklistRestore, 600);
}

// Handle interval polling
let _pollingInterval = null;

function startAutoPolling() {
  if (_pollingInterval) clearInterval(_pollingInterval);
  _pollingInterval = setInterval(() => {
    // Pause polling saat tab tidak aktif
    if (document.hidden || !currentUser) return;
    pullFromServer({ silent: true, polling: true });
  }, POLL_INTERVAL_MS);

  // Resume polling saat tab aktif kembali
  document.removeEventListener('visibilitychange', _onVisibilityChange);
  document.addEventListener('visibilitychange', _onVisibilityChange);
}

function _onVisibilityChange() {
  if (!document.hidden && currentUser) {
    // Tab aktif lagi — langsung pull sekali
    pullFromServer({ silent: true, polling: true });
  } else if (document.hidden && currentUser) {
    // Tab disembunyikan / HP dikunci — kirim perubahan yang tertunda sekarang
    flushChanges();
  }
}

function stopAutoPolling() {
  if (_pollingInterval) { clearInterval(_pollingInterval); _pollingInterval = null; }
}

document.addEventListener('DOMContentLoaded', () => {
  applyTheme();

  // Login tersimpan → langsung masuk (token divalidasi ulang ke server di background)
  const saved = loadSavedAuth();
  if (saved) {
    currentUser = saved.user;
    document.getElementById('loginScreen')?.classList.add('hidden');
    try {
      initApp();
    } catch (e) {
      console.error('initApp error:', e);
      currentUser = null;
      clearAuth();
      document.getElementById('loginScreen')?.classList.remove('hidden');
      return;
    }
    apiRequest('auth/me')
      .then(res => {
        const roleChanged = res.user.role !== currentUser?.role;
        currentUser = res.user;
        saveAuth(saved.token, res.user);
        if (roleChanged) {
          hideCrewPortal();
          initApp();
        }
      })
      .catch(() => { /* 401 sudah ditangani handleAuthExpired; offline → tetap pakai cache */ });
    return;
  }

  // Tampilkan login screen
  document.getElementById('loginUser')?.focus();
});

window.addEventListener('beforeunload', e => {
  if (currentUser && hasPendingChanges()) {
    flushChanges();
    e.preventDefault();
    e.returnValue = '';
  }
});

function setTodayDate() {
  const today   = todayISO();
  const nowTime = new Date().toTimeString().slice(0,5);
  const d = document.getElementById('ns-date');
  const t = document.getElementById('ns-start');
  if (d) d.value = today;
  if (t) t.value = nowTime;
  const el = document.getElementById('dashDate');
  if (el) el.textContent = 'Data per ' + new Date().toLocaleDateString('id-ID', {weekday:'long',year:'numeric',month:'long',day:'numeric'});
}

function initNav() {
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', () => navigateTo(el.dataset.page));
  });
}
function navigateTo(pid) {
  if ((pid === 'usermgmt' || pid === 'orgchart') && currentUser?.role !== 'admin') pid = 'dashboard';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById('page-' + pid);
  if (pg) pg.classList.add('active');
  document.querySelectorAll('[data-page]').forEach(b => {
    b.classList.toggle('active', b.dataset.page === pid);
  });
  if (pid === 'monitor')   renderMonitorPage();
  if (pid === 'hierarchy') renderHierTree();
  if (pid === 'history') {
    renderHistory();
    pullFromServer({ silent: true, polling: true });
  }
  if (pid === 'config')    renderConfigPage();
  if (pid === 'findings')  renderFindingsPage();
  if (pid === 'rca')       renderRcaPage();
  if (pid === 'monwo')     renderMonitoringWoPage();
  if (pid === 'usermgmt')  renderUserMgmtPage();
  if (pid === 'orgchart')  renderOrgChartPage();
  if (window.innerWidth <= 768) closeSidebar();
}
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const bd = document.getElementById('sidebarBackdrop');
  const btn = document.getElementById('hamBtn');
  const open = sb.classList.contains('open');
  sb.classList.toggle('open', !open);
  bd.classList.toggle('open', !open);
  btn.classList.toggle('open', !open);
  document.body.style.overflow = open ? '' : 'hidden';
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('open');
  document.getElementById('hamBtn').classList.remove('open');
  document.body.style.overflow = '';
}
