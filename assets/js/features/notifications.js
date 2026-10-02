'use strict';

// ═══════════════════════════════════════════════════════
// NOTIFIKASI IN-APP (lonceng + popup kanan atas)
// Notifikasi dibuat server saat ada temuan WARNING/ALERT baru, lalu ikut
// terkirim di setiap sync (polling 30 detik) — lihat NotificationService.php.
// ═══════════════════════════════════════════════════════
const NOTIF_POPUP_MS = 15000;
const NOTIF_MAX_POPUPS = 3;

let NOTIFS = [];
const _notif = { since: 0, unread: 0, loaded: false, outsideHandler: null };

function _notifStorageKey() { return 'ps2_notif_seen_' + (currentUser?.username || ''); }

/** Parameter notifSince untuk GET sync: 0 pada sync pertama (ambil 30 terbaru). */
function notifSinceParam() {
  return _notif.loaded ? _notif.since : 0;
}

function resetNotifications() {
  NOTIFS = [];
  _notif.since = 0; _notif.unread = 0; _notif.loaded = false;
  renderNotifBell();
  document.getElementById('notifPopups')?.replaceChildren();
}

/** Dipanggil store.js setiap sync dengan respons server (notifications + unreadCount). */
function handleNotificationFeed(res) {
  if (!Array.isArray(res.notifications)) return;
  const incoming = res.notifications;
  // null = perangkat ini belum pernah menerima feed untuk user ini
  let lastSeen = null;
  try {
    const stored = localStorage.getItem(_notifStorageKey());
    if (stored !== null) lastSeen = parseInt(stored) || 0;
  } catch (e) {}

  if (!_notif.loaded) {
    NOTIFS = incoming.slice();
  } else {
    const known = new Set(NOTIFS.map(n => n.id));
    NOTIFS = [...incoming.filter(n => !known.has(n.id)), ...NOTIFS].slice(0, 100);
  }
  NOTIFS.sort((a, b) => b.id - a.id);

  // Popup hanya untuk notifikasi belum dibaca yang belum pernah ditampilkan di perangkat ini.
  // Login pertama kali di perangkat tidak memunculkan tumpukan popup lama.
  const maxId = Math.max(_notif.since, ...NOTIFS.map(n => n.id), 0);
  const toPopup = lastSeen !== null ? incoming.filter(n => !n.read && n.id > lastSeen) : [];
  try { localStorage.setItem(_notifStorageKey(), String(Math.max(lastSeen || 0, maxId))); } catch (e) {}

  _notif.since = maxId;
  _notif.unread = res.unreadCount ?? NOTIFS.filter(n => !n.read).length;
  _notif.loaded = true;
  renderNotifBell();
  if (toPopup.length) showNotifPopups(toPopup);
}

function renderNotifBell() {
  const badge = document.getElementById('notifBadge');
  if (badge) {
    badge.hidden = _notif.unread <= 0;
    badge.textContent = _notif.unread > 99 ? '99+' : String(_notif.unread);
  }
  const list = document.getElementById('notifList');
  if (!list) return;
  if (!NOTIFS.length) {
    list.innerHTML = `<div class="notif-empty">Belum ada notifikasi.<br>Temuan WARNING/ALERT di wilayahmu akan muncul di sini.</div>`;
    return;
  }
  list.innerHTML = NOTIFS.map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}" onclick="openNotification(${n.id})">
      <div class="notif-ico">${n.severity === 'ALERT' ? '🚨' : '⚠️'}</div>
      <div style="min-width:0">
        <div class="notif-title">${esc(n.title)}</div>
        <div class="notif-body">${esc(n.body)}</div>
        <div class="notif-meta">${esc(fmtNotifTime(n.createdAt))}${n.actor ? ' · oleh ' + esc(n.actor) : ''}</div>
      </div>
    </div>`).join('');
}

function fmtNotifTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'baru saja';
  if (diff < 3600) return Math.floor(diff / 60) + ' menit lalu';
  if (diff < 86400) return Math.floor(diff / 3600) + ' jam lalu';
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

function showNotifPopups(list) {
  const box = document.getElementById('notifPopups');
  if (!box) return;
  document.getElementById('notifBellBtn')?.classList.remove('ringing');
  void document.getElementById('notifBellBtn')?.offsetWidth; // restart animasi
  document.getElementById('notifBellBtn')?.classList.add('ringing');

  const shown = list.slice(0, NOTIF_MAX_POPUPS);
  shown.forEach(n => {
    const el = document.createElement('div');
    el.className = 'notif-popup' + (n.severity === 'ALERT' ? ' alert' : '');
    el.innerHTML = `
      <div class="notif-ico">${n.severity === 'ALERT' ? '🚨' : '⚠️'}</div>
      <div style="min-width:0">
        <div class="notif-title">${esc(n.title)}</div>
        <div class="notif-body">${esc(n.body)}</div>
        <div class="notif-meta">${n.actor ? 'Dilaporkan oleh ' + esc(n.actor) : ''}</div>
      </div>
      <button class="notif-close" title="Tutup">×</button>`;
    el.addEventListener('click', e => {
      el.remove();
      if (!e.target.classList.contains('notif-close')) openNotification(n.id);
    });
    box.prepend(el);
    setTimeout(() => el.remove(), NOTIF_POPUP_MS);
  });
  if (list.length > shown.length) {
    toast(`🔔 ${list.length - shown.length} notifikasi lainnya — buka lonceng di kanan atas`, 'info', 6000);
  }

  // Notifikasi sistem (jika tab tidak aktif & izin sudah diberikan)
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    shown.forEach(n => { try { new Notification(n.title, { body: n.body, tag: 'ps-notif-' + n.id }); } catch (e) {} });
  }
}

function toggleNotifPanel(ev) {
  ev?.stopPropagation();
  const panel = document.getElementById('notifPanel');
  if (!panel) return;
  panel.hidden = !panel.hidden;
  if (!panel.hidden) {
    renderNotifBell();
    // Minta izin notifikasi sistem sekali, saat user pertama membuka lonceng
    if ('Notification' in window && Notification.permission === 'default') {
      try { Notification.requestPermission(); } catch (e) {}
    }
    _notif.outsideHandler = e => {
      if (!e.target.closest('.notif-wrap')) closeNotifPanel();
    };
    setTimeout(() => document.addEventListener('click', _notif.outsideHandler), 0);
  } else {
    closeNotifPanel();
  }
}

function closeNotifPanel() {
  const panel = document.getElementById('notifPanel');
  if (panel) panel.hidden = true;
  if (_notif.outsideHandler) document.removeEventListener('click', _notif.outsideHandler);
  _notif.outsideHandler = null;
}

function openNotification(id) {
  const n = NOTIFS.find(x => x.id === id);
  if (!n) return;
  if (!n.read) markNotifRead([id]);
  closeNotifPanel();
  if (n.sessionId && sessions.some(s => s.id === n.sessionId)) {
    viewSession(n.sessionId);
  } else if (n.sessionId) {
    toast('Sesi belum tersinkron ke perangkat ini — coba lagi sebentar', 'info');
  }
}

async function markNotifRead(ids) {
  let changed = 0;
  NOTIFS.forEach(n => { if (ids.includes(n.id) && !n.read) { n.read = true; changed++; } });
  _notif.unread = Math.max(0, _notif.unread - changed);
  renderNotifBell();
  try { await apiRequest('notifications/read', { method: 'POST', body: { ids } }); } catch (e) {}
}

async function markAllNotifRead() {
  NOTIFS.forEach(n => { n.read = true; });
  _notif.unread = 0;
  renderNotifBell();
  try { await apiRequest('notifications/read', { method: 'POST', body: { all: true } }); } catch (e) {
    toast('Gagal menandai dibaca: ' + e.message, 'error');
  }
}
