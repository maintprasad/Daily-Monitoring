'use strict';

// ═══════════════════════════════════════════════════════
// PENGATURAN NOTIFIKASI WHATSAPP (Evolution API) — admin
// Pesan WA dikirim oleh SERVER (API key tidak pernah ada di browser).
// ═══════════════════════════════════════════════════════
let _waSettings = null;

async function loadWaSettings() {
  const res = await apiRequest('settings/notifications');
  _waSettings = res;
  return res;
}

async function openWaSettingsModal() {
  if (currentUser?.role !== 'admin') { toast('Hanya admin yang bisa mengatur notifikasi', 'error'); return; }
  openOverlay('waSettingsOverlay');
  setText('wa-testResult', '');
  try {
    fillWaSettingsForm(await loadWaSettings());
  } catch (e) {
    toast('✗ Gagal memuat pengaturan: ' + e.message, 'error');
  }
}

function fillWaSettingsForm(s) {
  const wa = s.wa || {};
  const enabled = document.getElementById('wa-enabled');
  if (enabled) { enabled.checked = !!wa.enabled; document.getElementById('wa-enabled-label')?.classList.toggle('checked', !!wa.enabled); }
  setVal('wa-baseUrl', wa.baseUrl || '');
  setVal('wa-instance', wa.instance || '');
  setVal('wa-apiVersion', wa.apiVersion || 'v2');
  setVal('wa-appUrl', wa.appUrl || (location.protocol.startsWith('http') ? location.origin + location.pathname : ''));
  setVal('wa-apiKey', '');
  setText('wa-apiKey-hint', wa.apiKeySet
    ? '✓ API key sudah tersimpan di server — kosongkan jika tidak ingin mengganti'
    : 'Belum ada API key. Ambil dari Evolution Manager (global API key / token instance)');

  const rules = s.rules || {};
  document.querySelectorAll('#waSettingsOverlay input[data-rule]').forEach(cb => {
    cb.checked = (rules[cb.dataset.rule] || []).includes(cb.value);
  });
  const useOrg = document.getElementById('wa-useOrgChart');
  if (useOrg) { useOrg.checked = rules.useOrgChart !== false; document.getElementById('wa-useOrg-label')?.classList.toggle('checked', useOrg.checked); }

  const logEl = document.getElementById('wa-logs');
  if (logEl) {
    logEl.innerHTML = (s.logs || []).map(l => `
      <div class="wa-log-row">
        <span>${l.status === 'sent' ? '✅' : '❌'}</span>
        <span class="mono">${esc(fmtNotifTime(l.created_at))}</span>
        <span>${esc(l.username || '—')} · ${esc(l.phone)}</span>
        <span class="mono" style="margin-left:auto;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(l.response)}">${esc(l.response)}</span>
      </div>`).join('') || '<div class="fhint">Belum ada pengiriman.</div>';
  }
}

function collectWaSettingsForm() {
  const rules = { WARNING: [], ALERT: [] };
  document.querySelectorAll('#waSettingsOverlay input[data-rule]').forEach(cb => {
    if (cb.checked) rules[cb.dataset.rule].push(cb.value);
  });
  rules.useOrgChart = document.getElementById('wa-useOrgChart')?.checked ?? true;
  return {
    wa: {
      enabled:    document.getElementById('wa-enabled')?.checked || false,
      baseUrl:    getVal('wa-baseUrl').trim(),
      instance:   getVal('wa-instance').trim(),
      apiVersion: getVal('wa-apiVersion') || 'v2',
      apiKey:     getVal('wa-apiKey').trim(),
      appUrl:     getVal('wa-appUrl').trim(),
    },
    rules,
  };
}

async function saveWaSettings() {
  const btn = document.getElementById('wa-saveBtn');
  if (btn) { btn.disabled = true; btn.textContent = '↻ Menyimpan...'; }
  try {
    const res = await apiRequest('settings/notifications', { method: 'PUT', body: collectWaSettingsForm() });
    _waSettings = res;
    fillWaSettingsForm(res);
    renderWaStatus();
    toast('✓ Pengaturan notifikasi disimpan', 'success');
  } catch (e) {
    toast('✗ ' + e.message, 'error', 6000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan'; }
  }
}

async function sendWaTest() {
  const phone = getVal('wa-testPhone').trim();
  const out = document.getElementById('wa-testResult');
  if (!phone) { toast('Isi nomor tujuan tes', 'error'); return; }
  // Simpan dulu supaya tes memakai isian terbaru
  try {
    await apiRequest('settings/notifications', { method: 'PUT', body: collectWaSettingsForm() });
  } catch (e) {
    toast('✗ ' + e.message, 'error', 6000);
    return;
  }
  if (out) { out.textContent = '↻ Mengirim...'; out.style.color = 'var(--text3)'; }
  try {
    const res = await apiRequest('settings/wa-test', { method: 'POST', body: { phone } });
    if (out) {
      out.textContent = (res.sent ? '✅ Terkirim — ' : '❌ Gagal — ') + res.response;
      out.style.color = res.sent ? 'var(--green)' : 'var(--red)';
    }
    fillWaSettingsForm(await loadWaSettings());
  } catch (e) {
    if (out) { out.textContent = '❌ ' + e.message; out.style.color = 'var(--red)'; }
  }
}

/** Ringkasan status di kartu "Notifikasi WhatsApp" halaman Config. */
async function renderWaStatus() {
  const card = document.getElementById('configWaCard');
  const el = document.getElementById('configWaStatus');
  if (!card || !el) return;
  card.style.display = currentUser?.role === 'admin' ? '' : 'none';
  if (currentUser?.role !== 'admin') return;
  try {
    const s = _waSettings || await loadWaSettings();
    const wa = s.wa || {};
    const roles = r => (s.rules?.[r] || []).map(x => ROLE_LABELS[x]?.label || x).join(', ') || '—';
    el.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px">
        <div><div class="dl">Status WhatsApp</div><div class="dv" style="font-size:12px;color:${wa.enabled ? 'var(--green)' : 'var(--text3)'}">${wa.enabled ? '● Aktif' : '○ Nonaktif'}</div></div>
        <div><div class="dl">Instance</div><div class="dv" style="font-size:12px">${esc(wa.instance || '—')} <span style="color:var(--text3)">(${esc(wa.apiVersion || 'v2')})</span></div></div>
        <div><div class="dl">⚠ WARNING ke</div><div class="dv" style="font-size:12px">${esc(roles('WARNING'))}</div></div>
        <div><div class="dl">🚨 ALERT ke</div><div class="dv" style="font-size:12px">${esc(roles('ALERT'))}</div></div>
      </div>`;
  } catch (e) {
    el.textContent = 'Gagal memuat status: ' + e.message;
  }
}
