'use strict';

// ═══════════════════════════════════════════════════════
// CONFIG PAGE
// ═══════════════════════════════════════════════════════
function renderConfigPage() {
  // PIC
  const picEl = document.getElementById('configPICList');
  if (picEl) {
    picEl.innerHTML = PIC_LIST.map(p =>
      `<span onclick="openManagePICModal()" style="display:inline-flex;align-items:center;gap:4px;background:var(--bg3);border:1px solid var(--border);color:var(--text2);padding:5px 12px;border-radius:20px;font-size:12px;cursor:pointer;transition:all .15s"
       onmouseover="this.style.borderColor='var(--green)';this.style.color='var(--green)'"
       onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text2)'">
        👤 ${esc(p)}
      </span>`
    ).join('') +
    `<span onclick="openManagePICModal()" style="display:inline-flex;align-items:center;gap:4px;background:transparent;border:1px dashed var(--border2);color:var(--text3);padding:5px 12px;border-radius:20px;font-size:12px;cursor:pointer;transition:all .15s"
      onmouseover="this.style.borderColor='var(--green)';this.style.color='var(--green)'"
      onmouseout="this.style.borderColor='var(--border2)';this.style.color='var(--text3)'">
      ✚ Tambah PIC
    </span>`;
  }
  renderDatabaseStatus();
}

// Status koneksi database (SQLite lokal di XAMPP / Turso di Vercel)
function renderDatabaseStatus() {
  const el = document.getElementById('configDbStatus');
  // Hanya dihitung saat halaman Config tampil (collectChanges menghitung hash semua sesi)
  if (!el || !document.getElementById('page-config')?.classList.contains('active')) return;
  const driverLabel = { sqlite: 'SQLite lokal (XAMPP)', turso: 'Turso (cloud)' }[_sync.driver] || 'Belum terhubung';
  const pending = currentUser ? collectChanges() : null;
  const pendingCount = pending
    ? pending.sessions.length + pending.deletedSessions.length + pending.workOrders.length
      + (pending.hierarchy ? 1 : 0) + (pending.picList ? 1 : 0)
    : 0;
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">
      <div><div class="dl">Database</div><div class="dv" style="font-size:12px">${esc(driverLabel)}</div></div>
      <div><div class="dl">Sinkron Terakhir</div><div class="dv" style="font-size:12px">${_sync.lastSyncAt ? esc(_sync.lastSyncAt.toLocaleString('id-ID')) : '—'}</div></div>
      <div><div class="dl">Revisi Data</div><div class="dv" style="font-size:12px;font-family:'IBM Plex Mono',monospace">#${_sync.rev}</div></div>
      <div><div class="dl">Menunggu Dikirim</div><div class="dv" style="font-size:12px;color:${pendingCount ? 'var(--orange)' : 'var(--green)'}">${pendingCount ? pendingCount + ' perubahan' : '✓ Semua tersimpan'}</div></div>
    </div>`;
}
