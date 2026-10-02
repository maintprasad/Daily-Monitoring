'use strict';

// ═══════════════════════════════════════════════════════
// CHECKLIST MODAL
// ═══════════════════════════════════════════════════════

// Checklist yang sedang terbuka: { mode: 'draft' | 'edit', sessId }
// Dipakai tombol back (ui.js) agar yang disimpan selalu sesi yang sedang tampil.
let _checklistCtx = null;

function openChecklistModal(sessId, unitId, areaId, saId, eqId) {
  let sess = sessId ? sessions.find(s => s.id === sessId) : null;
  if (!sess && eqId) {
    sess = sessions.filter(s =>
      s.equipId === eqId &&
      (!unitId || s.unitId === unitId) &&
      (!areaId || s.areaId === areaId)
    ).sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0))[0];
  }
  if (!sess) { toast('Sesi tidak ditemukan','error'); return; }

  const eq = findEquipFlex(sess.unitId, sess.areaId, '', sess.equipId);
  const params = eq?.params || [];

  document.getElementById('chkTitle').textContent = `📋 ${sess.equipName}`;
  document.getElementById('chkSub').textContent   =
    [sess.unitName, sess.areaName, sess.subAreaName].filter(Boolean).join(' → ') +
    ` · ${sess.id} · ${fmtDate(sess.tanggal)} ${sess.startTime || ''}`;
  // Draft sesi baru yang ditinggalkan tidak boleh ikut tersimpan dari form ini
  _draftSession = null;
  _checklistCtx = { mode: 'edit', sessId: sess.id };

  const items = sess.items || [];
  const isNew = !items.length;

  if (!params.length) {
    document.getElementById('chkBody').innerHTML = `
      <div class="empty"><div class="empty-ico">⚙</div><div class="empty-msg">Equipment ini belum punya parameter monitoring.<br>Setup parameter dulu di halaman Hierarki.</div></div>
      <div class="form-actions"><button class="btn btn-ghost" onclick="closeOverlay('checklistOverlay')">Tutup</button></div>`;
    openOverlay('checklistOverlay');
    return;
  }

  // Group by section
  const groups = {};
  params.forEach(p => {
    const sec = p.section || 'Umum';
    if (!groups[sec]) groups[sec] = [];
    groups[sec].push(p);
  });

  const secColors = {
    'Umum':'var(--cyan)','Power Quality':'var(--purple)','Kondisi Panel':'var(--blue)',
    'Capacitor Bank':'var(--green)','Kondisi Trafo':'var(--orange)',
  };

  let paramHtml = '';
  Object.entries(groups).forEach(([sec, ps]) => {
    const col = secColors[sec] || 'var(--text2)';
    paramHtml += `
      <div class="section-group" style="margin-bottom:14px">
        <div class="section-group-hdr" style="color:${col};background:${col}15;border-bottom:1px solid ${col}33">
          📌 ${esc(sec)}
        </div>
        <div class="tbl-scroll">
          <table class="chk-table">
            <thead><tr>
              <th style="min-width:160px">Parameter</th>
              <th style="width:70px;text-align:center">Satuan</th>
              <th style="min-width:150px">Nilai / Kondisi</th>
              <th style="width:90px;text-align:center">Status</th>
              <th style="min-width:120px">Catatan</th>
            </tr></thead>
            <tbody>
              ${ps.map(p => buildChkRow(p, items.find(i=>i.paramId===p.id)||{})).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  });

  // Build referensi banner for this equipment type
  const eqType = eq?.type || '';
  const refItems = EQUIP_REFERENSI[eqType] || [];
  const refBanner = refItems.length ? `
    <details style="margin-bottom:14px">
      <summary style="cursor:pointer;font-size:11px;font-weight:700;color:var(--blue);text-transform:uppercase;letter-spacing:.07em;padding:6px 12px;background:var(--blue-dim);border-left:3px solid var(--blue);border-radius:0 5px 5px 0;user-select:none">
        📖 Referensi Nilai Normal — ${esc(EQUIP_TYPE_LABELS[eqType]||eqType)}
      </summary>
      <div style="margin-top:8px;background:var(--blue-dim);border:1px solid rgba(43,108,184,.2);border-radius:8px;padding:10px 14px">
        <ul style="margin:0;padding-left:18px;font-size:12px;color:var(--text2);line-height:1.8">
          ${refItems.map(r=>`<li>${r}</li>`).join('')}
        </ul>
      </div>
    </details>` : '';

  // ── Ambil riwayat pengecekan equipment ini (selain sesi sekarang) ──
  const equipPrevHistory = getEquipHistory(sess.unitId, sess.areaId, sess.equipId, 6)
    .filter(s => s.id !== sess.id);

  // ── Render riwayat pengecekan ──
  const histBanner = equipPrevHistory.length ? (() => {
    const rows = equipPrevHistory.map((hs, idx) => {
      const hst  = sessStatus(hs);
      const hbdg = stBadge(hst);
      const okH  = (hs.items||[]).filter(i=>i.status==='OK').length;
      const wH   = (hs.items||[]).filter(i=>i.status==='WARNING').length;
      const aH   = (hs.items||[]).filter(i=>i.status==='ALERT').length;
      return `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:6px 10px;font-size:11px;color:var(--text3);white-space:nowrap">
          ${fmtDate(hs.tanggal)} ${esc(hs.startTime||'')}
        </td>
        <td style="padding:6px 10px;font-size:11px">
          <span class="badge ${hbdg}" style="font-size:9px">${hst}</span>
        </td>
        <td style="padding:6px 10px;font-size:11px;font-family:'IBM Plex Mono',monospace">
          <span style="color:var(--green)">✓${okH}</span>
          ${wH ? `<span style="color:var(--orange);margin-left:4px">⚠${wH}</span>` : ''}
          ${aH ? `<span style="color:var(--red);margin-left:4px">✗${aH}</span>` : ''}
        </td>
        <td style="padding:6px 10px;font-size:11px;color:var(--text3)">
          ${esc(hs.pic||'—')}
        </td>
        <td style="padding:6px 10px">
          <button class="tbl-btn" style="font-size:10px;padding:2px 7px"
            onclick="viewSession('${esc(hs.id)}')">👁</button>
        </td>
      </tr>`;
    }).join('');
    return `
      <details style="margin-bottom:14px" ${equipPrevHistory.length <= 2 ? 'open' : ''}>
        <summary style="cursor:pointer;font-size:11px;font-weight:700;color:var(--blue);
          text-transform:uppercase;letter-spacing:.07em;padding:7px 12px;
          background:var(--blue-dim);border-left:3px solid var(--blue);
          border-radius:0 5px 5px 0;user-select:none">
          📋 Riwayat Pengecekan Sebelumnya — ${equipPrevHistory.length} sesi terakhir
        </summary>
        <div style="margin-top:8px;background:var(--bg2);border:1px solid var(--border);
                    border-radius:8px;overflow:hidden">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:var(--bg3)">
                <th style="padding:6px 10px;font-size:9px;color:var(--text3);text-align:left;
                    font-family:'IBM Plex Mono',monospace;letter-spacing:.07em">TANGGAL</th>
                <th style="padding:6px 10px;font-size:9px;color:var(--text3);text-align:left;
                    font-family:'IBM Plex Mono',monospace;letter-spacing:.07em">STATUS</th>
                <th style="padding:6px 10px;font-size:9px;color:var(--text3);text-align:left;
                    font-family:'IBM Plex Mono',monospace;letter-spacing:.07em">HASIL</th>
                <th style="padding:6px 10px;font-size:9px;color:var(--text3);text-align:left;
                    font-family:'IBM Plex Mono',monospace;letter-spacing:.07em">PIC</th>
                <th style="padding:6px 10px;font-size:9px;color:var(--text3);text-align:left;
                    font-family:'IBM Plex Mono',monospace;letter-spacing:.07em">DETAIL</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </details>`;
  })() : '';

  document.getElementById('chkBody').innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;padding:10px 14px;
                background:var(--bg3);border:1px solid var(--border);border-radius:8px;align-items:center">
      <span class="badge b-blue">⏱ Mulai: ${esc(sess.startTime||'—')}</span>
      ${sess.endTime ? `<span class="badge b-ok">✓ Selesai: ${esc(sess.endTime)}</span>` : ''}
      <span class="badge b-gray">👷 ${esc(sess.pic||'—')}</span>
      <span class="badge b-gray" style="font-size:9px">
        Pengecekan ke-${getEquipHistory(sess.unitId,sess.areaId,sess.equipId).findIndex(s=>s.id===sess.id)+1}
        dari ${getEquipHistory(sess.unitId,sess.areaId,sess.equipId).length} total
      </span>
      <code style="margin-left:auto;font-size:9px;color:var(--text3)">${esc(sess.id)}</code>
    </div>
    ${isNew ? `
      <div style="background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);
                  border-left:4px solid var(--green);border-radius:8px;padding:9px 14px;
                  margin-bottom:14px;font-size:12px;color:var(--green)">
        ✅ Sesi monitoring baru — isi semua nilai parameter di bawah, lalu klik Simpan.
      </div>` : `
      <div style="background:var(--orange-dim);border:1px solid rgba(251,140,58,.3);
                  border-left:4px solid var(--orange);border-radius:8px;padding:9px 14px;
                  margin-bottom:14px;font-size:12px;color:var(--orange)">
        ✏ Sesi sudah pernah diisi — perubahan akan menimpa data sebelumnya.
      </div>`}
    ${histBanner}
    ${refBanner}
    ${paramHtml}
    <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg">
        <label class="flabel">⏱ Waktu Selesai</label>
        <input type="time" class="finput" id="chkEndTime" value="${esc(sess.endTime||'')}"/>
      </div>
      <div class="fg"></div>
    </div>
    <details style="margin-top:12px" open>
      <summary style="cursor:pointer;font-size:11px;font-weight:700;color:var(--orange);text-transform:uppercase;letter-spacing:.07em;padding:6px 10px;background:var(--orange-dim);border-left:3px solid var(--orange);border-radius:0 5px 5px 0;user-select:none">
        📋 Temuan & Tindakan (opsional)
      </summary>
      <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="fg">
          <label class="flabel">Temuan / Catatan</label>
          <textarea class="ftextarea" id="chkCatatan">${esc(sess.catatan||'')}</textarea>
        </div>
        <div class="fg">
          <label class="flabel">Tindakan Korektif</label>
          <textarea class="ftextarea" id="chkTindakan">${esc(sess.tindakan||'')}</textarea>
        </div>
      </div>
    </details>
    <div class="form-actions">
      <button class="btn btn-ghost" onclick="closeOverlay('checklistOverlay')">Tutup</button>
      <button class="btn btn-primary" onclick="saveChecklist('${esc(sess.id)}')">💾 Simpan Data Monitoring</button>
    </div>`;

  openOverlay('checklistOverlay');
  startChecklistAutoSave();
}

/**
 * openChecklistModalDraft — buka checklist untuk sesi DRAFT (belum tersimpan).
 * Data baru disimpan ke sessions[] hanya setelah user klik "Simpan Data Monitoring".
 */
function openChecklistModalDraft(draft) {
  const eq     = findEquipFlex(draft.unitId, draft.areaId, '', draft.equipId);
  const params = eq?.params || [];
  _checklistCtx = { mode: 'draft', sessId: draft.id };

  document.getElementById('chkTitle').textContent = `📋 ${draft.equipName}`;
  document.getElementById('chkSub').textContent   =
    `${draft.unitName} → ${draft.areaName} · SESI BARU · ${fmtDate(draft.tanggal)} ${draft.startTime}`;

  if (!params.length) {
    document.getElementById('chkBody').innerHTML = `
      <div class="empty">
        <div class="empty-ico">⚙</div>
        <div class="empty-msg">Equipment ini belum punya parameter monitoring.<br>
          Setup parameter dulu di halaman Hierarki.</div>
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost" onclick="closeOverlay('checklistOverlay')">Tutup</button>
      </div>`;
    openOverlay('checklistOverlay');
    return;
  }

  // Group params by section
  const groups = {};
  params.forEach(p => {
    const sec = p.section || 'Umum';
    if (!groups[sec]) groups[sec] = [];
    groups[sec].push(p);
  });

  const secColors = {
    'Umum':'var(--cyan)', 'Power Quality':'var(--purple)',
    'Kondisi Panel':'var(--blue)', 'Kondisi Trafo':'var(--orange)',
  };

  let paramHtml = '';
  Object.entries(groups).forEach(([sec, ps]) => {
    const col = secColors[sec] || 'var(--text2)';
    paramHtml += `
      <div class="section-group" style="margin-bottom:14px">
        <div class="section-group-hdr" style="color:${col};background:${col}15;
             border-bottom:1px solid ${col}33">📌 ${esc(sec)}</div>
        <div class="tbl-scroll">
          <table class="chk-table">
            <thead><tr>
              <th style="min-width:160px">Parameter</th>
              <th style="width:70px;text-align:center">Satuan</th>
              <th style="min-width:150px">Nilai / Kondisi</th>
              <th style="width:90px;text-align:center">Status</th>
              <th style="min-width:120px">Catatan</th>
            </tr></thead>
            <tbody>
              ${ps.map(p => buildChkRow(p, {})).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  });

  // Riwayat pengecekan sebelumnya
  const prevHistory = getEquipHistory(draft.unitId, draft.areaId, draft.equipId, 5);
  const histBanner = prevHistory.length ? (() => {
    const rows = prevHistory.map(hs => {
      const hst = sessStatus(hs);
      const okH = (hs.items||[]).filter(i=>i.status==='OK').length;
      const wH  = (hs.items||[]).filter(i=>i.status==='WARNING').length;
      const aH  = (hs.items||[]).filter(i=>i.status==='ALERT').length;
      return `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:6px 10px;font-size:11px;color:var(--text3);white-space:nowrap">
          ${fmtDate(hs.tanggal)} ${esc(hs.startTime||'')}
        </td>
        <td style="padding:6px 10px">
          <span class="badge ${stBadge(hst)}" style="font-size:9px">${hst}</span>
        </td>
        <td style="padding:6px 10px;font-size:11px;font-family:'IBM Plex Mono',monospace">
          <span style="color:var(--green)">✓${okH}</span>
          ${wH?`<span style="color:var(--orange);margin-left:4px">⚠${wH}</span>`:''}
          ${aH?`<span style="color:var(--red);margin-left:4px">✗${aH}</span>`:''}
        </td>
        <td style="padding:6px 10px;font-size:11px;color:var(--text3)">${esc(hs.pic||'—')}</td>
        <td style="padding:6px 10px">
          <button class="tbl-btn" style="font-size:10px;padding:2px 7px"
            onclick="viewSession('${esc(hs.id)}')">👁</button>
        </td>
      </tr>`;
    }).join('');
    return `
      <details style="margin-bottom:14px" open>
        <summary style="cursor:pointer;font-size:11px;font-weight:700;color:var(--blue);
          text-transform:uppercase;letter-spacing:.07em;padding:7px 12px;
          background:var(--blue-dim);border-left:3px solid var(--blue);
          border-radius:0 5px 5px 0;user-select:none">
          📋 Riwayat Pengecekan — ${prevHistory.length} sesi terakhir
        </summary>
        <div style="margin-top:8px;background:var(--bg2);border:1px solid var(--border);
                    border-radius:8px;overflow:hidden">
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:var(--bg3)">
              <th style="padding:6px 10px;font-size:9px;color:var(--text3);text-align:left;
                  font-family:'IBM Plex Mono',monospace;letter-spacing:.07em">TANGGAL</th>
              <th style="padding:6px 10px;font-size:9px;color:var(--text3);text-align:left;
                  font-family:'IBM Plex Mono',monospace;letter-spacing:.07em">STATUS</th>
              <th style="padding:6px 10px;font-size:9px;color:var(--text3);text-align:left;
                  font-family:'IBM Plex Mono',monospace;letter-spacing:.07em">HASIL</th>
              <th style="padding:6px 10px;font-size:9px;color:var(--text3);text-align:left;
                  font-family:'IBM Plex Mono',monospace;letter-spacing:.07em">PIC</th>
              <th style="padding:6px 10px;font-size:9px;color:var(--text3);text-align:left;
                  font-family:'IBM Plex Mono',monospace;letter-spacing:.07em">DETAIL</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </details>`;
  })() : '';

  // Referensi nilai normal
  const eqType   = eq?.type || '';
  const refItems = EQUIP_REFERENSI[eqType] || [];
  const refBanner = refItems.length ? `
    <details style="margin-bottom:14px">
      <summary style="cursor:pointer;font-size:11px;font-weight:700;color:var(--blue);
        text-transform:uppercase;letter-spacing:.07em;padding:6px 12px;
        background:var(--blue-dim);border-left:3px solid var(--blue);
        border-radius:0 5px 5px 0;user-select:none">
        📖 Referensi Nilai Normal — ${esc(EQUIP_TYPE_LABELS[eqType]||eqType)}
      </summary>
      <div style="margin-top:8px;background:var(--blue-dim);border:1px solid rgba(43,108,184,.2);
                  border-radius:8px;padding:10px 14px">
        <ul style="margin:0;padding-left:18px;font-size:12px;color:var(--text2);line-height:1.8">
          ${refItems.map(r=>`<li>${r}</li>`).join('')}
        </ul>
      </div>
    </details>` : '';

  document.getElementById('chkBody').innerHTML = `
    <!-- Info sesi baru -->
    <div style="background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);
                border-left:4px solid var(--green);border-radius:8px;
                padding:10px 14px;margin-bottom:14px;
                display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-size:13px">✅</span>
      <div style="flex:1;font-size:12px;color:var(--green)">
        <strong>Sesi Baru</strong> — isi semua parameter lalu klik
        <strong>Simpan Data Monitoring</strong>.
        Data <strong>belum tersimpan</strong> sampai kamu klik simpan.
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <span class="badge b-blue">⏱ ${esc(draft.startTime||'—')}</span>
        <span class="badge b-gray">👷 ${esc(draft.pic||'—')}</span>
        <code style="font-size:9px;color:var(--text3);align-self:center">${esc(draft.id)}</code>
      </div>
    </div>

    ${histBanner}
    ${refBanner}
    ${paramHtml}

    <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg">
        <label class="flabel">⏱ Waktu Selesai</label>
        <input type="time" class="finput" id="chkEndTime" value="${esc(draft.endTime||'')}"/>
      </div>
      <div class="fg"></div>
    </div>
    <details style="margin-top:12px" open>
      <summary style="cursor:pointer;font-size:11px;font-weight:700;color:var(--orange);
        text-transform:uppercase;letter-spacing:.07em;padding:6px 10px;
        background:var(--orange-dim);border-left:3px solid var(--orange);
        border-radius:0 5px 5px 0;user-select:none">
        📋 Temuan & Tindakan (opsional)
      </summary>
      <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="fg">
          <label class="flabel">Temuan / Catatan</label>
          <textarea class="ftextarea" id="chkCatatan"></textarea>
        </div>
        <div class="fg">
          <label class="flabel">Tindakan Korektif</label>
          <textarea class="ftextarea" id="chkTindakan"></textarea>
        </div>
      </div>
    </details>

    <div class="form-actions">
      <button class="btn btn-danger" onclick="cancelDraftSession()">✕ Batalkan Sesi</button>
      <button class="btn btn-primary" onclick="saveDraftSession()">
        💾 Simpan Data Monitoring
      </button>
    </div>`;

  openOverlay('checklistOverlay');
  startChecklistAutoSave();
}

/**
 * saveDraftSession — baca semua input checklist, simpan ke sessions[], lalu sync.
 * Dipanggil saat user klik "Simpan Data Monitoring" pada sesi DRAFT.
 */
function saveDraftSession() {
  if (!_draftSession) { toast('Tidak ada sesi aktif','error'); return; }

  const eq     = findEquipFlex(_draftSession.unitId, _draftSession.areaId, '', _draftSession.equipId);
  const params = eq?.params || [];

  // Baca semua nilai dari DOM
  const items = collectChecklistItems(params);

  // Validasi: minimal 1 parameter harus diisi
  if (!items.length) {
    toast('⚠ Isi minimal satu parameter sebelum menyimpan', 'error');
    return;
  }

  // Finalisasi draft → sesi nyata
  _draftSession._isDraft  = false;
  _draftSession.items     = items;
  _draftSession.endTime   = document.getElementById('chkEndTime')?.value || '';
  _draftSession.catatan   = document.getElementById('chkCatatan')?.value || '';
  _draftSession.tindakan  = document.getElementById('chkTindakan')?.value || '';
  _draftSession.updatedAt = new Date().toISOString();

  // Simpan ke sessions[]
  sessions.unshift(_draftSession);

  const sess = _draftSession;
  _draftSession = null;

  clearChecklistAutoSave();
  saveAll();
  regenerateFindings();
  closeOverlay('checklistOverlay');
  renderAll();

  // Ringkasan hasil
  const okC   = items.filter(i=>i.status==='OK').length;
  const warnC = items.filter(i=>i.status==='WARNING').length;
  const alrtC = items.filter(i=>i.status==='ALERT').length;
  const stFin = sessStatus(sess);
  const stMsg = stFin==='ALERT' ? '🚨 Ada ALERT!' : stFin==='WARNING' ? '⚠ Ada Warning' : '✅ Semua Normal';
  toast(`${stMsg} — Sesi ${sess.id} tersimpan · ${okC} OK · ${warnC} Warn · ${alrtC} Alert`, 'success', 5000);

  // Refresh tampilan crew jika aktif
  if (currentUser?.role === 'crew') {
    const crewActive = document.getElementById('crewPortal')?.classList.contains('active');
    if (crewActive) {
      setTimeout(() => {
        if (crewNav.screen === 'history') _renderCrewHistory();
        else if (crewNav.screen === 'equip' && crewNav.areaId) crewSelectArea(crewNav.areaId, crewNav.areaName);
        else crewShowHome();
      }, 400);
    }
  }
}

/**
 * cancelDraftSession — buang draft tanpa menyimpan
 */
function cancelDraftSession() {
  if (_draftSession && !confirm('Batalkan sesi ini? Data yang sudah diisi akan hilang.')) return;
  _draftSession = null;
  clearChecklistAutoSave();
  closeOverlay('checklistOverlay');
  toast('Sesi dibatalkan — tidak ada data yang tersimpan', 'info');
}

function sanitizeDisplayValue(val) {
  if (val === null || val === undefined || val === '') return '';
  const s = String(val).trim();
  const dateCorruptPattern = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{4})/;
  const match = s.match(dateCorruptPattern);
  if (match) {
    const day  = parseInt(match[3]);
    const year = parseInt(match[4]);
    if (year === 1900 || year <= 1905) {
      const monthMap = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
      const m = monthMap[match[2]];
      const d = new Date(year, m, day);
      const base = new Date(1899, 11, 30);
      const serial = Math.round((d - base) / 86400000);
      if (serial >= 0 && serial <= 9999) return serial.toString();
    }
    return '⚠ corrupt';
  }

  // Format DD/MM/YYYY (umum dari Sheets yang format kolom sebagai tanggal locale ID)
  // Konversi balik ke serial — kalau tahunnya 1899/1900-an, hampir pasti hasil
  // dari angka parameter kecil yang ke-misinterpretasi sebagai serial date.
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const dd = parseInt(slashMatch[1]);
    const mm = parseInt(slashMatch[2]);
    const yyyy = parseInt(slashMatch[3]);
    if (yyyy <= 1905) {
      try {
        const d = new Date(yyyy, mm - 1, dd);
        const base = new Date(1899, 11, 30);
        const serial = Math.round((d - base) / 86400000);
        if (serial >= 0 && serial <= 9999) return serial.toString();
      } catch(e) {}
    }
    return '⚠ corrupt';
  }

  // Format DD-MM-YYYY / YYYY-MM-DD tanpa waktu, tahun 1899/1900-an
  const dashMatch1 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  const dashMatch2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dashMatch1 || dashMatch2) {
    let dd, mm, yyyy;
    if (dashMatch1) { dd = parseInt(dashMatch1[1]); mm = parseInt(dashMatch1[2]); yyyy = parseInt(dashMatch1[3]); }
    else            { yyyy = parseInt(dashMatch2[1]); mm = parseInt(dashMatch2[2]); dd = parseInt(dashMatch2[3]); }
    if (yyyy <= 1905) {
      try {
        const d = new Date(yyyy, mm - 1, dd);
        const base = new Date(1899, 11, 30);
        const serial = Math.round((d - base) / 86400000);
        if (serial >= 0 && serial <= 9999) return serial.toString();
      } catch(e) {}
    }
    return '⚠ corrupt';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const day = parseInt(s.split('-')[2]);
    if (day >= 0 && day <= 999) return day.toString();
    return '⚠ corrupt';
  }
  const n = Number(s);
  if (!isNaN(n) && n > 40000 && n < 60000) return '⚠ corrupt';
  return s;
}

function isValueCorrupt(val) {
  if (val === null || val === undefined || val === '') return false;
  const s = String(val).trim();
  if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/.test(s)) return true;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return true;
  // Format DD/MM/YYYY atau MM/DD/YYYY — Sheets format ulang kolom sebagai tanggal
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return true;
  // Format DD-MM-YYYY atau YYYY-MM-DD tanpa komponen waktu
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) return true;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) return true;
  const n = Number(s);
  if (!isNaN(n) && n > 40000 && n < 60000) return true;
  return false;
}

function buildChkRow(p, existing) {
  const rawVal   = existing.value  ?? '';
  const status   = existing.status || '';
  const note     = existing.note   || '';
  const isCorrupt = isValueCorrupt(rawVal) && rawVal !== '';
  const dispVal  = sanitizeDisplayValue(rawVal);
  const rowCls   = status==='ALERT'?'row-alert':status==='WARNING'?'row-warn':status==='OK'?'row-ok':'';
  let inputHtml  = '';

  if (p.type === 'status') {
    const opts   = (p.options && p.options.length) ? p.options : ['BAIK','PERLU PERHATIAN','RUSAK'];
    const selCls = status==='OK'?'s-sel-ok':status==='WARNING'?'s-sel-warn':status==='ALERT'?'s-sel-alert':'';
    inputHtml = `<select class="status-sel ${selCls}" id="chk-${p.id}-val"
      onchange="onChkStatusChange('${p.id}',this)">
      <option value="">— Pilih —</option>
      ${opts.map(o => `<option value="${esc(o)}" ${rawVal===o?'selected':''}>${esc(o)}</option>`).join('')}
    </select>`;
  } else {
    const hint = (p.normalMin !== undefined && p.normalMax !== undefined)
      ? `Normal: ${p.normalMin}–${p.normalMax}${p.unit ? ' '+p.unit : ''}`
      : '';
    const cls = isCorrupt ? 'val-alert'
      : rawVal !== '' ? (status==='OK'?'val-ok':status==='WARNING'?'val-warn':status==='ALERT'?'val-alert':'') : '';

    const nMin = p.normalMin !== undefined && p.normalMin !== null ? p.normalMin : 'null';
    const nMax = p.normalMax !== undefined && p.normalMax !== null ? p.normalMax : 'null';
    const wMin = p.warnMin   !== undefined && p.warnMin   !== null ? p.warnMin   : 'null';
    const wMax = p.warnMax   !== undefined && p.warnMax   !== null ? p.warnMax   : 'null';

    inputHtml = `<div>
      <input type="text" inputmode="decimal" class="val-input ${cls}" id="chk-${p.id}-val"
        name="chk_${p.id}_val"
        value="${esc(isCorrupt ? dispVal : rawVal)}" placeholder="—"
        autocomplete="off"
        oninput="onChkNumChange('${p.id}',this.value,${nMin},${nMax},${wMin},${wMax})"
        onblur="onChkNumBlur('${p.id}')"/>
      ${isCorrupt ? `<div style="font-size:9px;color:var(--red);margin-top:2px">⚠ corrupt — dikonversi dari: <em>${esc(String(rawVal).slice(0,25))}</em></div>` : ''}
      ${hint && !isCorrupt ? `<div style="font-size:9px;color:var(--text3);margin-top:2px">${esc(hint)}</div>` : ''}
    </div>`;
  }

  const badgeCls = status==='OK'?'b-ok':status==='WARNING'?'b-warn':status==='ALERT'?'b-alert':'b-gray';
  return `<tr class="${rowCls}" id="chk-row-${p.id}">
    <td style="font-weight:500">${esc(p.label)}</td>
    <td style="text-align:center;font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--text3)">${esc(p.unit||'—')}</td>
    <td>${inputHtml}</td>
    <td style="text-align:center"><span class="badge ${badgeCls}" id="chk-${p.id}-badge">${status||'—'}</span></td>
    <td><input class="param-mini-input" id="chk-${p.id}-note" name="chk_${p.id}_note" value="${esc(note)}" placeholder="Catatan opsional..." autocomplete="off" style="width:100%;font-size:11px;padding:4px 6px"/></td>
  </tr>`;
}

function onChkNumChange(paramId, value, nMin, nMax, wMin, wMax) {
  const badge   = document.getElementById('chk-'+paramId+'-badge');
  const inputEl = document.getElementById('chk-'+paramId+'-val');

  if (value === '' || value === null || value === undefined) {
    if (inputEl) inputEl.className = 'val-input';
    if (badge)   { badge.textContent = '—'; badge.className = 'badge b-gray'; }
    return;
  }

  // Normalisasi pakai fungsi yang sama dengan saat simpan, agar preview
  // status saat mengetik konsisten dengan nilai yang benar-benar tersimpan.
  const normalized = normalizeNumericValue(value, 'numeric');
  const v      = parseFloat(normalized);

  // (normalisasi tampilan dilakukan saat onblur)

  let status   = '';

  if (!isNaN(v)) {
    // Cek ALERT dulu (batas warn)
    const overWarnMax  = (wMax !== undefined && wMax !== null && !isNaN(wMax) && v > wMax);
    const underWarnMin = (wMin !== undefined && wMin !== null && !isNaN(wMin) && v < wMin);
    // Cek WARNING (di luar batas normal tapi masih dalam batas warn)
    const overNormMax  = (nMax !== undefined && nMax !== null && !isNaN(nMax) && v > nMax);
    const underNormMin = (nMin !== undefined && nMin !== null && !isNaN(nMin) && v < nMin);

    if      (overWarnMax || underWarnMin)              status = 'ALERT';
    else if (overNormMax || underNormMin)              status = 'WARNING';
    else                                               status = 'OK';
  }

  if (inputEl) {
    inputEl.className = 'val-input' +
      (status === 'OK'      ? ' val-ok'   :
       status === 'WARNING' ? ' val-warn' :
       status === 'ALERT'   ? ' val-alert': '');
  }
  if (badge) {
    badge.textContent = status || '—';
    badge.className   = 'badge ' +
      (status === 'OK'      ? 'b-ok'   :
       status === 'WARNING' ? 'b-warn' :
       status === 'ALERT'   ? 'b-alert': 'b-gray');
  }
}

function onChkNumBlur(paramId) {
  // Saat user selesai input, normalisasi tampilan nilai di field
  const inputEl = document.getElementById('chk-'+paramId+'-val');
  if (!inputEl) return;
  const raw = inputEl.value.trim();
  if (raw === '') return;
  // Pakai fungsi normalisasi yang sama persis dengan saat simpan
  const normalized = normalizeNumericValue(raw, 'numeric');
  const v = parseFloat(normalized);
  if (!isNaN(v)) {
    inputEl.value = String(v); // tampilkan nilai bersih: "28.7" bukan "28,7"
  }
}

function onChkStatusChange(paramId, sel) {
  const badge = document.getElementById('chk-'+paramId+'-badge');
  const val   = sel.value;
  const opts  = Array.from(sel.options).map(o=>o.value).filter(Boolean);
  let status = '';
  if (val) {
    const idx = opts.indexOf(val);
    const total = opts.length;
    // Opsi pertama = OK, opsi terakhir = ALERT, sisanya = WARNING
    // Kecuali total opsi 2 — opsi ke-2 langsung ALERT (tidak ada WARNING)
    if (idx === 0)             status = 'OK';
    else if (idx === total-1)  status = 'ALERT';
    else                       status = 'WARNING';
  }
  sel.className = 'status-sel' + (status==='OK'?' s-sel-ok':status==='WARNING'?' s-sel-warn':status==='ALERT'?' s-sel-alert':'');
  if (badge) {
    badge.textContent = status || '—';
    badge.className = 'badge ' + (status==='OK'?'b-ok':status==='WARNING'?'b-warn':status==='ALERT'?'b-alert':'b-gray');
  }
}

/**
 * normalizeNumericValue
 * Konversi input angka dari user ke format string yang aman untuk disimpan.
 * - Ganti koma desimal (,) → titik (.)
 * - Hilangkan spasi
 * - Untuk tipe status (dropdown), kembalikan apa adanya
 * - Hasil: string angka bersih, misal "12.6" bukan "12,6"
 */
function normalizeNumericValue(val, paramType) {
  if (paramType === 'status') return val; // dropdown — jangan diubah
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  if (s === '') return '';

  // Jika sudah berupa number (dari JSON parse), langsung stringify
  if (typeof val === 'number') return String(val);

  // Hapus semua karakter selain digit, koma, titik, dan minus
  let clean = s.replace(/[^\d,.\-]/g, '');

  // CATATAN: Untuk parameter monitoring (arus, suhu, tekanan, dll), titik dan
  // koma SELALU dianggap sebagai pemisah DESIMAL — bukan pemisah ribuan.
  // Nilai seperti arus/suhu/tekanan di lapangan tidak pernah butuh pemisah ribuan,
  // jadi logika "format Indonesia 1.234,56" DIHAPUS karena menyebabkan input
  // seperti "11.20" atau input dengan banyak titik salah dibaca jadi angka raksasa
  // (misal "1120260000000700"). Jika ada lebih dari satu titik/koma dalam input,
  // hanya ambil yang TERAKHIR sebagai pemisah desimal, sisanya dianggap typo dan dibuang.

  // Hitung jumlah pemisah (titik + koma) yang ada
  const sepMatches = clean.match(/[,.]/g) || [];

  if (sepMatches.length > 1) {
    // Lebih dari 1 pemisah — kemungkinan salah ketik / multi-titik.
    // Ambil pemisah TERAKHIR sebagai desimal, hapus semua pemisah sebelumnya.
    const lastSepIdx = Math.max(clean.lastIndexOf('.'), clean.lastIndexOf(','));
    const intPart = clean.slice(0, lastSepIdx).replace(/[,.]/g, '');
    const decPart = clean.slice(lastSepIdx + 1).replace(/[,.]/g, '');
    clean = decPart ? `${intPart}.${decPart}` : intPart;
    return clean.replace(/^-?\./, m => m); // jaga minus di depan jika ada
  }

  // Koma sebagai desimal saja: 28,7 → 28.7
  if (/^-?\d+,\d+$/.test(clean)) {
    return clean.replace(',', '.');
  }

  // Titik sebagai desimal (sudah benar): 28.7 → 28.7
  if (/^-?\d+\.\d+$/.test(clean)) {
    return clean;
  }

  // Bilangan bulat
  if (/^-?\d+$/.test(clean)) {
    return clean;
  }

  // Fallback — kembalikan string bersih
  return clean;
}

function saveChecklist(sessId) {
  // Jika ini sesi draft yang belum tersimpan, arahkan ke saveDraftSession
  if (_draftSession && _draftSession.id === sessId) {
    saveDraftSession();
    return;
  }
  const sess = sessions.find(s => s.id === sessId);
  if (!sess) return;
  const eq = findEquipFlex(sess.unitId, sess.areaId, '', sess.equipId);
  const params = eq?.params || [];

  // Nilai parameter yang sudah tidak ada di equipment (parameternya dihapus/diganti)
  // tetap dipertahankan — sebelumnya ikut terhapus saat sesi lama diedit.
  const currentIds = new Set(params.map(p => p.id));
  const orphanItems = (sess.items || []).filter(i => !currentIds.has(i.paramId));
  sess.items = [...collectChecklistItems(params), ...orphanItems];

  const et = document.getElementById('chkEndTime')?.value;
  if (et !== undefined) sess.endTime = et;
  sess.catatan  = document.getElementById('chkCatatan')?.value  ?? sess.catatan;
  sess.tindakan = document.getElementById('chkTindakan')?.value ?? sess.tindakan;
  sess.updatedAt = new Date().toISOString();

  clearChecklistAutoSave();
  saveAll();
  regenerateFindings();
  closeOverlay('checklistOverlay');
  renderAll();

  // Hitung ringkasan hasil
  const okC2   = sess.items.filter(i => i.status === 'OK').length;
  const warnC2 = sess.items.filter(i => i.status === 'WARNING').length;
  const alrtC2 = sess.items.filter(i => i.status === 'ALERT').length;
  const stFinal = sessStatus(sess);
  const stMsg   = stFinal === 'ALERT'   ? '🚨 Ada ALERT!'
                : stFinal === 'WARNING'  ? '⚠ Ada Warning'
                : stFinal === 'OK'       ? '✅ Semua Normal'
                : '📋 Tersimpan';
  toast(`${stMsg} — ${okC2} OK · ${warnC2} Warn · ${alrtC2} Alert`, 'success', 4500);

  // Jika crew portal aktif, refresh tampilan crew
  if (currentUser?.role === 'crew') {
    const crewPortalActive = document.getElementById('crewPortal')?.classList.contains('active');
    if (crewPortalActive) {
      setTimeout(() => {
        // Jika sedang di tab history, refresh
        if (crewNav.screen === 'history') {
          _renderCrewHistory();
        }
        // Jika sedang di equipment list, refresh
        else if (crewNav.screen === 'equip' && crewNav.areaId) {
          crewSelectArea(crewNav.areaId, crewNav.areaName);
        }
      }, 400);
    }
  }
}

/** Baca nilai checklist dari form (dipakai simpan sesi baru, edit sesi & auto-save). */
function collectChecklistItems(params) {
  return params.map(p => {
    const valEl   = document.getElementById('chk-'+p.id+'-val');
    const noteEl  = document.getElementById('chk-'+p.id+'-note');
    const badgeEl = document.getElementById('chk-'+p.id+'-badge');
    const rawSt   = (badgeEl?.textContent || '').trim();
    const rawVal  = valEl?.value ?? '';
    // Normalisasi: koma → titik, simpan sebagai string angka bersih
    const val     = normalizeNumericValue(rawVal, p.type);
    const st      = (rawSt === '—' || rawSt === '') ? '' : rawSt;
    return {
      paramId: p.id,
      label:   p.label,
      unit:    p.unit,
      section: p.section,
      value:   val,
      status:  st,
      note:    noteEl?.value || '',
    };
  }).filter(i => i.value !== '' || i.status !== '' || i.note !== '');
}

// ═══════════════════════════════════════════════════════
// AUTO-SAVE CHECKLIST
// Isian form disimpan ke perangkat setiap 15 detik. Jika browser/HP tertutup
// sebelum klik Simpan, isian bisa dilanjutkan saat aplikasi dibuka lagi.
// (Versi lama menyimpan ke sessionStorage tapi tidak pernah memulihkannya.)
// ═══════════════════════════════════════════════════════
const CHECKLIST_AUTOSAVE_KEY = 'ps2_checklist_autosave';
let _autoSaveTimer = null;

function startChecklistAutoSave() {
  if (_autoSaveTimer) clearInterval(_autoSaveTimer);
  _autoSaveTimer = setInterval(() => {
    if (!document.getElementById('checklistOverlay')?.classList.contains('open') || !_checklistCtx) {
      clearInterval(_autoSaveTimer);
      _autoSaveTimer = null;
      return;
    }
    writeChecklistAutoSave();
  }, 15000);
}

function writeChecklistAutoSave() {
  const ctx = _checklistCtx;
  if (!ctx) return;
  const sess = ctx.mode === 'draft' ? _draftSession : sessions.find(s => s.id === ctx.sessId);
  if (!sess) return;
  const eq = findEquipFlex(sess.unitId, sess.areaId, '', sess.equipId);
  const items = collectChecklistItems(eq?.params || []);
  if (!items.length) return;
  try {
    localStorage.setItem(CHECKLIST_AUTOSAVE_KEY, JSON.stringify({
      mode: ctx.mode,
      sessId: sess.id,
      draft: ctx.mode === 'draft' ? sess : null,
      items,
      endTime:  document.getElementById('chkEndTime')?.value  || '',
      catatan:  document.getElementById('chkCatatan')?.value  || '',
      tindakan: document.getElementById('chkTindakan')?.value || '',
      user: currentUser?.username || '',
      savedAt: Date.now(),
    }));
  } catch (e) {}
}

function clearChecklistAutoSave() {
  if (_autoSaveTimer) { clearInterval(_autoSaveTimer); _autoSaveTimer = null; }
  _checklistCtx = null;
  try { localStorage.removeItem(CHECKLIST_AUTOSAVE_KEY); } catch (e) {}
}

/** Dipanggil setelah login: tawarkan melanjutkan isian checklist yang belum tersimpan. */
function offerChecklistRestore() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(CHECKLIST_AUTOSAVE_KEY) || 'null'); } catch (e) {}
  if (!saved || !Array.isArray(saved.items)) return;
  const tooOld = Date.now() - (saved.savedAt || 0) > 3 * 86400000;
  if (tooOld || (saved.user && saved.user !== currentUser?.username)) {
    try { localStorage.removeItem(CHECKLIST_AUTOSAVE_KEY); } catch (e) {}
    return;
  }

  const target = saved.mode === 'draft' ? saved.draft : sessions.find(s => s.id === saved.sessId);
  if (!target) return;
  const when = new Date(saved.savedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  if (!confirm(`Ada isian checklist "${target.equipName || target.id}" yang belum tersimpan (${when}).

Lanjutkan mengisi?`)) {
    try { localStorage.removeItem(CHECKLIST_AUTOSAVE_KEY); } catch (e) {}
    return;
  }

  if (saved.mode === 'draft') {
    _draftSession = saved.draft;
    openChecklistModalDraft(_draftSession);
  } else {
    openChecklistModal(saved.sessId, '', '', '', '');
  }

  saved.items.forEach(item => {
    const valEl = document.getElementById('chk-' + item.paramId + '-val');
    if (valEl) {
      valEl.value = item.value;
      valEl.dispatchEvent(new Event(valEl.tagName === 'SELECT' ? 'change' : 'input'));
    }
    const noteEl = document.getElementById('chk-' + item.paramId + '-note');
    if (noteEl) noteEl.value = item.note || '';
  });
  setVal('chkEndTime', saved.endTime || '');
  setVal('chkCatatan', saved.catatan || '');
  setVal('chkTindakan', saved.tindakan || '');
  toast('Isian checklist dipulihkan — jangan lupa klik Simpan', 'info', 5000);
}
