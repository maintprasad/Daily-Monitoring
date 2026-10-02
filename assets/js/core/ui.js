'use strict';

// ── OVERLAY CONTROL ────────────────────────────────────
// ── OVERLAY HISTORY STACK ─────────────────────────────────────────
// Lacak overlay yang sedang terbuka untuk back-button handling
let _overlayStack = [];

function openOverlay(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const alreadyOpen = el.classList.contains('open');
  el.classList.add('open');
  document.body.style.overflow = 'hidden';
  if (alreadyOpen) return; // konten diganti, entri history tidak perlu ditambah lagi

  // Push state ke browser history agar tombol back ditangkap di sini
  // bukan menutup browser / navigate away
  const stateKey = 'overlay_' + id + '_' + Date.now();
  _overlayStack.push({ id, stateKey });
  history.pushState({ overlayId: id, stateKey }, '', window.location.href);
}

function closeOverlay(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
  if (id === 'checklistOverlay') clearChecklistAutoSave();

  // Hapus dari stack
  const idx = _overlayStack.findIndex(o => o.id === id);
  if (idx !== -1) _overlayStack.splice(idx, 1);

  // Restore scroll hanya jika tidak ada overlay lain yang terbuka
  if (!document.querySelector('.overlay.open')) {
    document.body.style.overflow = '';
  }

  // Jika state history kita yang teratas, go back untuk sinkronisasi
  // Tapi hanya jika history state kita (bukan navigasi organik)
  if (history.state && history.state.overlayId === id) {
    // Gunakan replaceState agar tidak double-pop
    history.replaceState(null, '', window.location.href);
  }
}

function overlayDismiss() {
  document.querySelectorAll('.overlay').forEach(ov => {
    ov.addEventListener('click', e => {
      if (e.target !== ov) return;
      // Checklist: klik di luar form jangan langsung membuang isian
      if (ov.id === 'checklistOverlay') _handleChecklistBackButton();
      else closeOverlay(ov.id);
    });
  });

  // ── INTERCEPT tombol back browser / Android ──────────────────────
  window.addEventListener('popstate', function(e) {
    // Cek apakah ada overlay yang terbuka
    const openOverlays = document.querySelectorAll('.overlay.open');
    if (openOverlays.length > 0) {
      // Ambil overlay paling atas (terakhir dibuka)
      const topOverlay = _overlayStack[_overlayStack.length - 1];
      if (topOverlay) {
        // Cegah navigasi — re-push state agar URL tidak berubah
        history.pushState({ overlayId: topOverlay.id, stateKey: topOverlay.stateKey }, '', window.location.href);

        // Khusus checklist: tanya konfirmasi dulu sebelum tutup
        if (topOverlay.id === 'checklistOverlay') {
          _handleChecklistBackButton();
          return;
        }

        // Overlay lain: langsung tutup
        closeOverlay(topOverlay.id);
        return;
      }
    }

    // Tidak ada overlay terbuka — biarkan navigasi normal
    // (tidak ada yang perlu dilakukan)
  });
}

// ── Tangani back button khusus untuk checklist ────────────────────
function _handleChecklistBackButton() {
  // Cek apakah ada data yang sudah diinput
  const inputs = document.querySelectorAll('#chkBody .val-input, #chkBody .status-sel');
  let hasInput = false;
  inputs.forEach(inp => {
    if (inp.value && inp.value.trim() !== '') hasInput = true;
  });

  if (!hasInput) {
    // Belum ada input — langsung tutup tanpa konfirmasi
    _draftSession = null;
    closeOverlay('checklistOverlay');
    return;
  }

  // Ada input — tampilkan dialog konfirmasi custom (non-blocking)
  _showBackConfirmDialog();
}

// ── Dialog konfirmasi back button (mobile-friendly) ───────────────
function _showBackConfirmDialog() {
  // Hapus dialog lama kalau ada
  const existing = document.getElementById('backConfirmDialog');
  if (existing) existing.remove();

  const dialog = document.createElement('div');
  dialog.id = 'backConfirmDialog';
  dialog.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0,0,0,0.65);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 0;
    backdrop-filter: blur(3px);
    animation: fadeInBg .2s ease;
  `;

  dialog.innerHTML = `
    <div style="
      background: var(--bg2);
      border-radius: 20px 20px 0 0;
      padding: 28px 24px 36px;
      width: 100%;
      max-width: 500px;
      box-shadow: 0 -8px 32px rgba(0,0,0,.3);
      animation: slideUpDialog .25s cubic-bezier(.34,1.56,.64,1);
    ">
      <div style="
        width: 40px; height: 4px;
        background: var(--border2);
        border-radius: 2px;
        margin: 0 auto 20px;
      "></div>
      <div style="font-size:24px;text-align:center;margin-bottom:10px">⚠️</div>
      <div style="font-size:16px;font-weight:700;color:var(--navy);text-align:center;margin-bottom:8px">
        Data Belum Tersimpan
      </div>
      <div style="font-size:13px;color:var(--text3);text-align:center;line-height:1.6;margin-bottom:24px">
        Kamu sedang mengisi data monitoring.<br>
        Jika keluar sekarang, data yang sudah diinput <strong style="color:var(--red)">akan hilang</strong>.
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button onclick="_backConfirmSave()" style="
          background: var(--green);
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 14px;
          font-size:14px;
          font-weight:700;
          font-family:'IBM Plex Sans',sans-serif;
          cursor:pointer;
          width:100%;
        ">💾 Simpan Data Sekarang</button>
        <button onclick="_backConfirmDiscard()" style="
          background: var(--red-dim);
          color: var(--red);
          border: 1px solid rgba(192,57,43,.3);
          border-radius: 10px;
          padding: 14px;
          font-size:14px;
          font-weight:600;
          font-family:'IBM Plex Sans',sans-serif;
          cursor:pointer;
          width:100%;
        ">🗑 Buang Data & Keluar</button>
        <button onclick="_backConfirmCancel()" style="
          background: none;
          color: var(--text3);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 12px;
          font-size:13px;
          font-family:'IBM Plex Sans',sans-serif;
          cursor:pointer;
          width:100%;
        ">← Kembali ke Form</button>
      </div>
    </div>
    <style>
      @keyframes fadeInBg { from{opacity:0} to{opacity:1} }
      @keyframes slideUpDialog {
        from { transform: translateY(100%); opacity:0; }
        to   { transform: translateY(0);    opacity:1; }
      }
    </style>
  `;

  document.body.appendChild(dialog);
}

function _backConfirmSave() {
  document.getElementById('backConfirmDialog')?.remove();
  // Jalankan save sesuai mode (draft atau existing)
  const chkOverlay = document.getElementById('checklistOverlay');
  if (!chkOverlay?.classList.contains('open')) return;

  if (_checklistCtx?.mode === 'draft' && _draftSession) {
    saveDraftSession();
  } else if (_checklistCtx?.mode === 'edit') {
    saveChecklist(_checklistCtx.sessId);
  }
}

function _backConfirmDiscard() {
  document.getElementById('backConfirmDialog')?.remove();
  _draftSession = null;
  // Tutup overlay paksa tanpa konfirmasi lagi
  closeOverlay('checklistOverlay');
  toast('Data dibuang — sesi tidak tersimpan', 'info');
}

function _backConfirmCancel() {
  document.getElementById('backConfirmDialog')?.remove();
  // Tidak melakukan apa-apa — user kembali ke form
}

// ── TEMA ───────────────────────────────────────────────
function toggleDarkMode() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? '' : 'dark');
  const btn = document.getElementById('darkModeBtn');
  if (btn) btn.textContent = isDark ? '🌙' : '☀️';
  try { localStorage.setItem('ps_theme', isDark ? 'light' : 'dark'); } catch(e) {}
  // Warna teks & grid chart dashboard mengikuti tema aplikasi
  if (currentUser && typeof Chart !== 'undefined') renderDashCharts();
}

function isDarkTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

function applyTheme() {
  try {
    const saved = localStorage.getItem('ps_theme');
    if (saved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      const btn = document.getElementById('darkModeBtn');
      if (btn) btn.textContent = '☀️';
    }
  } catch(e) {}
}

// ── TOAST ──────────────────────────────────────────────
function toast(msg, type='info', duration=3500) {
  const c = document.getElementById('toast');
  if (!c) return;
  const el = document.createElement('div');
  el.className = 'toast-item ' + type;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transition='opacity .3s'; setTimeout(()=>el.remove(),300); }, duration);
}
