'use strict';

// ═══════════════════════════════════════════════════════════════════
// WORK ORDER FROM FINDING
// ═══════════════════════════════════════════════════════════════════

// Nomor urut WO sekarang diambil dari database (counter global), bukan localStorage per
// perangkat — sebelumnya dua HP bisa menghasilkan nomor WO yang sama.
// localStorage hanya menyimpan nomor terakhir yang diketahui (untuk preview & fallback offline).
function getWOCounter() {
  try { return parseInt(localStorage.getItem('ps_wo_counter') || '0') || 0; } catch(e) { return 0; }
}
function setWOCounter(n) {
  try { localStorage.setItem('ps_wo_counter', String(n)); } catch(e) {}
}
async function reserveWOSeq() {
  try {
    const res = await apiRequest('workorders/next-seq', { method: 'POST', body: { atLeast: getWOCounter() } });
    setWOCounter(res.seq);
    return res.seq;
  } catch (e) {
    console.warn('[WO] Counter server tidak tersedia, pakai counter lokal:', e.message);
    const n = getWOCounter() + 1;
    setWOCounter(n);
    return n;
  }
}

/**
 * generateWONumber — format MaintWare WO_ORDERS:
 *   WO-YYYYMMDD-ELEC-UNIT-XXXX
 *
 * Contoh: WO-20250505-ELEC-U1-0042
 * Format ini konsisten dengan WO_ORDERS di MaintWare Sheets sehingga
 * tracking tidak terputus antara Monitoring System dan MaintWare.
 *
 * Prioritas:
 *   1. Tanya API WO_API_URL?fn=nextWoId → pakai ID dari Sheets (paling aman)
 *   2. Fallback lokal jika API tidak tersedia
 */
async function fetchWOIdFromAPI(finding, shift, seqNum) {
  try {
    const resp = await fetch(
      WO_API_URL + '?fn=nextWoId&sheet=WO_ORDERS&key=' + encodeURIComponent(MAINTWARE_KEY),
      { redirect: 'follow' }
    ).then(r => r.text());
    const parsed = JSON.parse(resp);
    if ((parsed.ok || parsed.status === 'ok') && parsed.woId) {
      return parsed.woId; // ID resmi dari Sheets
    }
  } catch(e) {
    console.warn('[WO] Tidak bisa ambil ID dari API, fallback ke format lokal:', e.message);
  }
  return null; // trigger fallback
}

function generateWONumber(finding, shift, seqNum) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(finding.tanggal || '') ? new Date(finding.tanggal + 'T00:00:00') : new Date();

  // Format YYYYMMDD
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth()+1).padStart(2,'0');
  const dd   = String(d.getDate()).padStart(2,'0');
  const dateStr = `${yyyy}${mm}${dd}`;

  // Sanitize — uppercase alphanumeric, maks N char
  function san(s, maxLen) {
    return (s||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0, maxLen || 8) || 'X';
  }

  // Unit disingkat: "Unit 1" → "U1", "Unit 2" → "U2", fallback san()
  const rawUnit = (finding.unit || '').trim();
  const unitMatch = rawUnit.match(/unit\s*(\d+)/i);
  const unitPart = unitMatch ? `U${unitMatch[1]}` : san(rawUnit, 4);

  const seq = String(seqNum).padStart(4,'0');

  // Format: WO-YYYYMMDD-ELEC-{UNIT}-{SEQ}
  // Sama persis dengan kolom `id` di WO_ORDERS MaintWare
  return `WO-${dateStr}-ELEC-${unitPart}-${seq}`;
}

// State for current WO being built
let _currentWOFinding = null;

/**
 * openWOFromFinding — opens the WO modal pre-filled from a finding object
 */
function openWOFromFinding(findingId) {
  const f = findings.find(x => x.id === findingId);
  if (!f) { toast('Finding tidak ditemukan','error'); return; }
  _currentWOFinding = f;

  // Auto-set shift based on current time
  const h = new Date().getHours();
  const autoShift = h >= 6 && h < 14 ? '1' : h >= 14 && h < 22 ? '2' : '3';
  const shiftEl = document.getElementById('wo-shift');
  if (shiftEl) shiftEl.value = autoShift;

  // Auto-set priority based on finding status
  const prioEl = document.getElementById('wo-priority');
  if (prioEl) prioEl.value = f.status === 'ALERT' ? 'Critical' : 'High';

  // Auto-set type
  const typeEl = document.getElementById('wo-type');
  if (typeEl) typeEl.value = f.status === 'ALERT' ? 'Emergency' : 'Corrective';

  // Auto-fill title
  const titleEl = document.getElementById('wo-title');
  if (titleEl) titleEl.value = `[${f.status}] ${f.parameter} ${f.equipment} — Nilai: ${f.value} ${f.unit_param}`.trim();

  // Auto-fill notes
  const notesEl = document.getElementById('wo-notes');
  if (notesEl) notesEl.value =
    `Finding dari Monitoring System:\n` +
    `Parameter : ${f.parameter}\n` +
    `Nilai     : ${f.value} ${f.unit_param}\n` +
    `Status    : ${f.status}\n` +
    `Tanggal   : ${fmtDate(f.tanggal)}\n` +
    `Unit      : ${f.unit}\n` +
    `Area      : ${f.area}\n` +
    `Equipment : ${f.equipment}\n` +
    (f.note ? `Catatan   : ${f.note}` : '');

  // Auto-fill requestor from current user
  const reqEl = document.getElementById('wo-requestor');
  if (reqEl && currentUser) reqEl.value = currentUser.name || currentUser.username;

  // Due date — today + 1 day default
  const dueEl = document.getElementById('wo-duedate');
  if (dueEl) {
    const due = new Date(); due.setDate(due.getDate() + 1);
    dueEl.value = toLocalISODate(due);
  }

  // Context info
  const ctx = document.getElementById('woFindingContext');
  if (ctx) ctx.innerHTML = `
    <div><div class="dl">Unit</div><div class="dv" style="font-size:12px">${esc(f.unit||'—')}</div></div>
    <div><div class="dl">Area</div><div class="dv" style="font-size:12px">${esc(f.area||'—')}</div></div>
    <div><div class="dl">Equipment</div><div class="dv" style="font-size:12px;font-weight:600">${esc(f.equipment||'—')}</div></div>
    <div><div class="dl">Parameter / Nilai</div><div class="dv" style="font-size:12px;color:${f.status==='ALERT'?'var(--red)':'var(--orange)'}"><strong>${esc(f.parameter)}</strong>: ${esc(f.value)} ${esc(f.unit_param)}</div></div>
    <div><div class="dl">Status Finding</div><div class="dv"><span class="badge ${f.status==='ALERT'?'b-alert':'b-warn'}">${f.status}</span></div></div>
    <div><div class="dl">Tanggal Monitoring</div><div class="dv" style="font-size:12px">${fmtDate(f.tanggal)}</div></div>
  `;

  // Subtitle
  const sub = document.getElementById('woFromFindingSub');
  if (sub) sub.textContent = `Finding ID: ${f.id} · ${f.equipment}`;

  // Reset result
  const res = document.getElementById('woSendResult');
  if (res) { res.style.display = 'none'; res.textContent = ''; }
  const btn = document.getElementById('woSendBtn');
  if (btn) { btn.disabled = false; btn.textContent = '🔧 Kirim WO ke MaintWare'; }

  // Generate preview WO number (use preview seqnum, not final)
  refreshWOPreviewNo();

  // Clear title error
  const titleErr = document.getElementById('wo-title-err');
  if (titleErr) titleErr.textContent = '';

  openOverlay('woFromFindingOverlay');
}

   function openWOFromSession(sessId) {
  const sessFindings = findings.filter(f => f.sessId === sessId);
  if (!sessFindings.length) { toast('Tidak ada finding untuk sesi ini','error'); return; }

  const first    = sessFindings[0];
  const hasAlert = sessFindings.some(f => f.status === 'ALERT');
  const alertC   = sessFindings.filter(f=>f.status==='ALERT').length;
  const warnC    = sessFindings.filter(f=>f.status==='WARNING').length;

  // Buat objek gabungan untuk dipakai _currentWOFinding
  _currentWOFinding = {
    id: sessId + '_grouped', sessId,
    tanggal: first.tanggal,
    unit: first.unit, unitId: first.unitId,
    area: first.area, areaId: first.areaId,
    equipment: first.equipment, equipId: first.equipId,
    parameter: sessFindings.map(f=>f.parameter).join(', '),
    value: '', unit_param: '', note: '',
    _allFindings: sessFindings,
    status: hasAlert ? 'ALERT' : 'WARNING',
  };

  // Shift otomatis
  const h = new Date().getHours();
  const shiftEl = document.getElementById('wo-shift');
  if (shiftEl) shiftEl.value = h >= 6 && h < 14 ? '1' : h >= 14 && h < 22 ? '2' : '3';

  // Priority & type
  const prioEl = document.getElementById('wo-priority');
  if (prioEl) prioEl.value = hasAlert ? 'Critical' : 'High';
  const typeEl = document.getElementById('wo-type');
  if (typeEl) typeEl.value = hasAlert ? 'Emergency' : 'Corrective';

  // Title
  const titleEl = document.getElementById('wo-title');
  if (titleEl) titleEl.value = `[${hasAlert?'ALERT':'WARNING'}] ${first.equipment} — ${alertC} Alert, ${warnC} Warning`;

  // Notes — rangkum semua temuan
  const notesEl = document.getElementById('wo-notes');
  if (notesEl) {
    const lines = sessFindings.map(f =>
      `  [${f.status}] ${f.parameter}: ${f.value} ${f.unit_param}${f.note?' — '+f.note:''}`
    ).join('\n');
    notesEl.value =
      `Temuan dari Monitoring System (Sesi: ${sessId})\n` +
      `Tanggal   : ${fmtDate(first.tanggal)}\n` +
      `Unit      : ${first.unit}\n` +
      `Area      : ${first.area}\n` +
      `Equipment : ${first.equipment}\n` +
      `\nDaftar Temuan (${sessFindings.length} item):\n` + lines;
  }

  // Requestor
  const reqEl = document.getElementById('wo-requestor');
  if (reqEl && currentUser) reqEl.value = currentUser.name || currentUser.username;

  // Due date besok
  const dueEl = document.getElementById('wo-duedate');
  if (dueEl) {
    const due = new Date(); due.setDate(due.getDate()+1);
    dueEl.value = toLocalISODate(due);
  }

  // Context box — daftar temuan
  const ctx = document.getElementById('woFindingContext');
  if (ctx) ctx.innerHTML = `
    <div><div class="dl">Unit</div><div class="dv" style="font-size:12px">${esc(first.unit)}</div></div>
    <div><div class="dl">Area</div><div class="dv" style="font-size:12px">${esc(first.area)}</div></div>
    <div style="grid-column:1/-1"><div class="dl">Equipment</div><div class="dv" style="font-size:12px;font-weight:600">${esc(first.equipment)}</div></div>
    <div style="grid-column:1/-1">
      <div class="dl">Daftar Temuan (${sessFindings.length})</div>
      <div style="margin-top:6px;display:flex;flex-direction:column;gap:4px">
        ${sessFindings.map(f=>`
          <div style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:var(--bg);border-radius:5px;border:1px solid var(--border)">
            <span class="badge ${f.status==='ALERT'?'b-alert':'b-warn'}" style="flex-shrink:0">${f.status}</span>
            <span style="font-size:11px;font-weight:500;flex:1">${esc(f.parameter)}</span>
            <span style="font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:700;color:${f.status==='ALERT'?'var(--red)':'var(--orange)'}">${esc(f.value)} ${esc(f.unit_param)}</span>
          </div>`).join('')}
      </div>
    </div>`;

  // Subtitle
  const sub = document.getElementById('woFromFindingSub');
  if (sub) sub.textContent = `Sesi: ${sessId} · ${sessFindings.length} temuan · ${fmtDate(first.tanggal)}`;

  // Reset UI
  const res = document.getElementById('woSendResult');
  if (res) res.style.display = 'none';
  const btn = document.getElementById('woSendBtn');
  if (btn) { btn.disabled = false; btn.textContent = '🔧 Kirim WO ke MaintWare'; }
  const titleErr = document.getElementById('wo-title-err');
  if (titleErr) titleErr.textContent = '';

  refreshWOPreviewNo();
  openOverlay('woFromFindingOverlay');
}

function refreshWOPreviewNo() {
  if (!_currentWOFinding) return;
  const shift  = document.getElementById('wo-shift')?.value || '1';
  const nextN  = getWOCounter() + 1;
  const preview = generateWONumber(_currentWOFinding, shift, nextN);
  const el = document.getElementById('woPreviewNo');
  if (el) el.textContent = preview;
}

/**
 * submitWOFromFinding — build WO payload matching EQ_HEADERS[SHEET_WO_ORDERS]
 * then POST to WO_API_URL using fn=upsert
 *
 * WO_ORDERS columns (from App Script EQ_HEADERS):
 *   id, title, type, status, priority,
 *   equipId, techId, techName, unitId, areaId,
 *   requestorName, requestorDept, createdBy,
 *   createdAt, dueDate, estHours, actualHours,
 *   startTime, endTime,
 *   notes, closingNote,
 *   checklist, checklistDone, checklistTotal,
 *   partsUsed, partsCount,
 *   notesLog, attachments
 */
async function submitWOFromFinding() {
  const f = _currentWOFinding;
  if (!f) return;

  const titleEl = document.getElementById('wo-title');
  const title   = (titleEl?.value || '').trim();
  if (!title) {
    const err = document.getElementById('wo-title-err');
    if (err) err.textContent = 'Judul WO wajib diisi';
    titleEl?.focus();
    return;
  }

  const shift    = document.getElementById('wo-shift')?.value    || '1';
  const type     = document.getElementById('wo-type')?.value     || 'Corrective';
  const priority = document.getElementById('wo-priority')?.value || 'High';
  const status   = document.getElementById('wo-status')?.value   || 'Open';
  const dueDate  = document.getElementById('wo-duedate')?.value  || '';
  const notes    = document.getElementById('wo-notes')?.value    || '';
  const reqName  = document.getElementById('wo-requestor')?.value || (currentUser?.name || '');
  const dept     = document.getElementById('wo-dept')?.value     || 'Electrical';
  const estH     = parseFloat(document.getElementById('wo-esthours')?.value) || 2;

  // Kumpulkan semua findings yang terlibat
  const involvedFindings = f._allFindings
    ? f._allFindings
    : findings.filter(x => x.id === f.id);

  // Build checklist array dari findings
  const checklist = involvedFindings.map((finding, idx) => ({
    id:          finding.id,
    seq:         idx + 1,
    parameter:   finding.parameter,
    value:       finding.value,
    unit:        finding.unit_param || '',
    findStatus:  finding.status,       // ALERT / WARNING
    closeStatus: 'Open',               // Open / Closed
    closedBy:    '',
    closedAt:    '',
    tindakan:    '',
    catatan:     '',
  }));

  // Finalise WO number
  const seqNum = await reserveWOSeq();
  let woId = await fetchWOIdFromAPI(f, shift, seqNum);
  if (!woId) woId = generateWONumber(f, shift, seqNum);

  const now      = new Date().toISOString();
  const notesLog = JSON.stringify([{
    ts:  now,
    by:  currentUser?.username || 'system',
    msg: `WO dibuat dari Finding monitoring. ${checklist.length} item checklist. Sesi: ${f.sessId}.`,
  }]);

  const woRow = {
    id:             woId,
    title,
    type,
    status,
    priority,
    equipId:        f.equipId    || '',
    techId:         '',
    techName:       '',
    unitId:         f.unitId     || '',
    areaId:         f.areaId     || '',
    requestorName:  reqName,
    requestorDept:  dept,
    createdBy:      currentUser?.username || 'monitoring-system',
    createdAt:      now,
    dueDate,
    estHours:       estH,
    actualHours:    '',
    startTime:      '',
    endTime:        '',
    notes,
    closingNote:    '',
    checklistDone:  0,
    checklistTotal: checklist.length,
    checklist:      JSON.stringify(checklist),   // ← wajib stringify agar GAS tidak salah baca
    partsUsed:      '',
    partsCount:     0,
    notesLog,
    attachments:    '',
    sessId:         f.sessId,
  };

  // UI state
  const btn = document.getElementById('woSendBtn');
  const res = document.getElementById('woSendResult');
  if (btn) { btn.disabled = true; btn.textContent = '↻ Mengirim...'; }
  if (res)   res.style.display = 'none';

  try {
    const response = await fetch(WO_API_URL + '?fn=upsert', {
      method:   'POST',
      headers:  { 'Content-Type': 'text/plain;charset=utf-8' },
      body:     JSON.stringify({ fn: 'upsert', sheet: 'WO_ORDERS', row: woRow }),
      redirect: 'follow',
    });
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch(e) { throw new Error('Respons bukan JSON: ' + text.slice(0,100)); }

    if (json.ok === true || json.success === true) {
      // Simpan WO ke state lokal — checklist tetap array untuk UI
      const woLocal = { ...woRow, checklist };   // override: simpan array, bukan string
      workOrders.push(woLocal);

      // Embed woId ke session terkait
      const sess = sessions.find(s => s.id === f.sessId);
      if (sess) {
        sess.woId      = woId;
        sess.woStatus  = 'Open';
        sess.checklist = checklist;
      }

      // Mark semua findings dalam sesi ini
      findings.forEach(finding => {
        if (finding.sessId === f.sessId) {
          finding.woId  = woId;
          finding.hasWO = true;
        }
      });

      saveAll();

      if (res) {
        res.style.display  = 'block';
        res.style.background = 'var(--green-dim)';
        res.style.border   = '1px solid rgba(74,158,63,.3)';
        res.style.color    = 'var(--green-d)';
        res.innerHTML = `✅ <strong>WO berhasil dibuat!</strong><br>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:11px">${esc(woId)}</span><br>
          <span style="font-size:11px;color:var(--text3)">${checklist.length} item checklist · klik tombol di bawah untuk lihat detail</span><br>
          <button class="btn btn-primary btn-sm" style="margin-top:8px"
            onclick="closeOverlay('woFromFindingOverlay');openWODetailModal('${esc(woId)}')">
            📋 Lihat & Close Item WO
          </button>`;
      }
      if (btn) btn.textContent = '✅ WO Terkirim';
      toast(`✅ WO dibuat: ${woId} · ${checklist.length} item`, 'success', 5000);
      renderFindingsPage();

    } else {
      throw new Error(json.message || 'API mengembalikan error');
    }
  } catch(err) {
    if (res) {
      res.style.display  = 'block';
      res.style.background = 'var(--red-dim)';
      res.style.border   = '1px solid rgba(192,57,43,.3)';
      res.style.color    = 'var(--red)';
      res.innerHTML = `✗ <strong>Gagal mengirim WO:</strong> ${esc(err.message)}`;
    }
    if (btn) { btn.disabled = false; btn.textContent = '🔧 Coba Lagi'; }
    toast('✗ Gagal buat WO: ' + err.message, 'error', 5000);
  }
}
// ═══════════════════════════════════════════════════════
// WO DETAIL & CLOSE ITEMS
// ═══════════════════════════════════════════════════════
function openWODetailModal(woId) {
  const wo = workOrders.find(w => w.id === woId);
  if (!wo) {
    // Coba cari dari sessions
    const sess = sessions.find(s => s.woId === woId);
    if (sess && sess.checklist) {
      openWODetailFromSession(sess);
      return;
    }
    toast('WO tidak ditemukan', 'error');
    return;
  }
  renderWODetailModal(wo);
}

function openWODetailFromSession(sess) {
  // Reconstruct minimal WO object dari session
  const wo = {
    id:             sess.woId,
    title:          `WO — ${sess.equipName}`,
    status:         sess.woStatus || 'Open',
    priority:       '—',
    equipId:        sess.equipId,
    unitId:         sess.unitId,
    areaId:         sess.areaId,
    createdAt:      sess.createdAt,
    checklistDone:  (sess.checklist||[]).filter(c=>c.closeStatus==='Closed').length,
    checklistTotal: (sess.checklist||[]).length,
    checklist:      sess.checklist || [],
    sessId:         sess.id,
    notes:          '',
    closingNote:    sess.closingNote || '',
  };
  renderWODetailModal(wo);
}

function renderWODetailModal(wo) {
  document.getElementById('woDetailTitle').textContent = `📋 ${wo.id}`;
  document.getElementById('woDetailSub').textContent   =
    `${wo.title} · ${wo.checklistDone}/${wo.checklistTotal} closed · Status: ${wo.status}`;

  const checklist   = wo.checklist || [];
  const allClosed   = checklist.length > 0 && checklist.every(c => c.closeStatus === 'Closed');
  const doneCnt     = checklist.filter(c => c.closeStatus === 'Closed').length;
  const pct         = checklist.length ? Math.round(doneCnt / checklist.length * 100) : 0;

  const statusBadge = wo.status === 'Closed'
    ? `<span class="badge b-ok" style="font-size:12px">✅ CLOSED</span>`
    : `<span class="badge b-warn" style="font-size:12px">🔓 OPEN</span>`;

  const progressBar = `
    <div style="margin:12px 0">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3);margin-bottom:4px">
        <span>Progress Penyelesaian</span>
        <span style="font-weight:700;color:${pct===100?'var(--green)':'var(--orange)'}">
          ${doneCnt}/${checklist.length} item · ${pct}%
        </span>
      </div>
      <div class="progress-wrap">
        <div class="progress-bar" style="width:${pct}%;background:${pct===100?'var(--green)':'var(--orange)'}"></div>
      </div>
    </div>`;

  const checklistHtml = checklist.length ? `
    <div style="margin-top:16px">
      <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;
                  letter-spacing:.07em;margin-bottom:10px">
        📌 Checklist Item Finding
      </div>
      ${checklist.map((item, idx) => renderWOChecklistItem(wo.id, item, idx)).join('')}
    </div>` : `<div style="color:var(--text3);font-size:12px;padding:8px">Tidak ada item checklist.</div>`;

  // Closing note
  const closingNoteHtml = `
    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
      <div class="fg">
        <label class="flabel">📝 Closing Note / Kesimpulan WO</label>
        <textarea class="ftextarea" id="woClosingNote" placeholder="Rangkuman tindakan keseluruhan..."
          style="min-height:60px">${esc(wo.closingNote||wo.notes||'')}</textarea>
      </div>
    </div>`;

  document.getElementById('woDetailBody').innerHTML = `
    <!-- Header info -->
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;
                padding:12px 16px;background:var(--bg3);border-radius:8px;margin-bottom:16px">
      ${statusBadge}
      <span class="badge b-blue">${esc(wo.unitId||'—')}</span>
      <span class="badge b-gray">📅 ${fmtDate(wo.createdAt?.split('T')[0]||'')}</span>
      <code style="font-size:10px;color:var(--text3);margin-left:auto">${esc(wo.id)}</code>
    </div>

    ${progressBar}
    ${checklistHtml}
    ${closingNoteHtml}

    <div class="form-actions">
      <button class="btn btn-ghost" onclick="closeOverlay('woDetailOverlay')">Tutup</button>
      ${!allClosed ? `
        <button class="btn btn-orange" onclick="closeAllWOItems('${esc(wo.id)}')">
          ⚡ Close Semua Item
        </button>` : ''}
      <button class="btn btn-primary" onclick="saveWOProgress('${esc(wo.id)}')">
        💾 Simpan Progress
      </button>
    </div>`;

  openOverlay('woDetailOverlay');
}

function renderWOChecklistItem(woId, item, idx) {
  const isClosed  = item.closeStatus === 'Closed';
  const rowBg     = isClosed
    ? 'background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.2)'
    : item.findStatus === 'ALERT'
      ? 'background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.15)'
      : 'background:rgba(249,115,22,.04);border:1px solid rgba(249,115,22,.15)';

  return `
    <div style="${rowBg};border-radius:8px;padding:12px 14px;margin-bottom:8px"
         id="wochk-row-${esc(item.id)}">
      <div style="display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap">

        <!-- Status toggle -->
        <div style="flex-shrink:0;padding-top:2px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none">
            <input type="checkbox"
              id="wochk-cb-${esc(item.id)}"
              ${isClosed ? 'checked' : ''}
              onchange="onWOItemToggle('${esc(woId)}','${esc(item.id)}',this.checked)"
              style="width:16px;height:16px;accent-color:var(--green);cursor:pointer"/>
            <span style="font-size:11px;font-weight:600;color:${isClosed?'var(--green)':'var(--text3)'}">
              ${isClosed ? '✅ Closed' : '🔓 Open'}
            </span>
          </label>
        </div>

        <!-- Finding info -->
        <div style="flex:1;min-width:180px">
          <div style="font-weight:600;font-size:13px;color:var(--text)">${esc(item.parameter)}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">
            Nilai:
            <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;
                         color:${item.findStatus==='ALERT'?'var(--red)':'var(--orange)'}">
              ${esc(item.value)} ${esc(item.unit)}
            </span>
            &nbsp;·&nbsp;
            <span class="badge ${item.findStatus==='ALERT'?'b-alert':'b-warn'}"
                  style="font-size:9px">${esc(item.findStatus)}</span>
          </div>
          ${isClosed && item.closedBy ? `
            <div style="font-size:10px;color:var(--green);margin-top:3px">
              ✓ Closed by ${esc(item.closedBy)} · ${item.closedAt ? new Date(item.closedAt).toLocaleString('id-ID') : ''}
            </div>` : ''}
        </div>

        <!-- Tindakan & Catatan — hanya aktif saat Open atau baru di-close -->
        <div style="flex:2;min-width:220px;display:flex;flex-direction:column;gap:6px">
          <div>
            <div class="param-mini-label">Tindakan yang Dilakukan</div>
            <input class="param-mini-input"
              id="wochk-tindakan-${esc(item.id)}"
              value="${esc(item.tindakan||'')}"
              placeholder="Contoh: Ganti oli, reset breaker..."
              ${isClosed ? '' : ''}
              style="width:100%;font-size:12px;padding:6px 8px"/>
          </div>
          <div>
            <div class="param-mini-label">Catatan</div>
            <input class="param-mini-input"
              id="wochk-catatan-${esc(item.id)}"
              value="${esc(item.catatan||'')}"
              placeholder="Catatan tambahan..."
              style="width:100%;font-size:12px;padding:6px 8px"/>
          </div>
        </div>

      </div>
    </div>`;
}

function onWOItemToggle(woId, itemId, checked) {
  // Visual feedback langsung
  const row    = document.getElementById('wochk-row-' + itemId);
  const label  = document.querySelector(`#wochk-cb-${itemId}`)?.nextElementSibling;
  if (label) {
    label.textContent = checked ? '✅ Closed' : '🔓 Open';
    label.style.color = checked ? 'var(--green)' : 'var(--text3)';
  }
  if (row) {
    row.style.background = checked
      ? 'rgba(34,197,94,.06)'
      : 'rgba(249,115,22,.04)';
    row.style.border = checked
      ? '1px solid rgba(34,197,94,.2)'
      : '1px solid rgba(249,115,22,.15)';
  }
}

function closeAllWOItems(woId) {
  if (!confirm('Close semua item sekaligus?')) return;
  const wo = _getWOById(woId);
  if (!wo) return;
  wo.checklist.forEach(item => {
    const cb = document.getElementById('wochk-cb-' + item.id);
    if (cb && !cb.checked) {
      cb.checked = true;
      onWOItemToggle(woId, item.id, true);
    }
  });
}

async function saveWOProgress(woId) {
  const wo = _getWOById(woId);
  if (!wo) { toast('WO tidak ditemukan', 'error'); return; }

  const now = new Date().toISOString();

  // Baca semua nilai dari DOM
  wo.checklist.forEach(item => {
    const cb       = document.getElementById('wochk-cb-' + item.id);
    const tindakan = document.getElementById('wochk-tindakan-' + item.id);
    const catatan  = document.getElementById('wochk-catatan-'  + item.id);

    const nowClosed = cb?.checked || false;

    // Kalau baru di-close, set closedBy & closedAt
    if (nowClosed && item.closeStatus !== 'Closed') {
      item.closedBy = currentUser?.name || currentUser?.username || 'Unknown';
      item.closedAt = now;
    }
    // Kalau di-reopen
    if (!nowClosed && item.closeStatus === 'Closed') {
      item.closedBy = '';
      item.closedAt = '';
    }

    item.closeStatus = nowClosed ? 'Closed' : 'Open';
    // Pakai nilai form apa adanya supaya isian bisa dikosongkan kembali
    if (tindakan) item.tindakan = tindakan.value;
    if (catatan)  item.catatan  = catatan.value;
  });

  // Hitung progress
  const doneCnt = wo.checklist.filter(c => c.closeStatus === 'Closed').length;
  wo.checklistDone  = doneCnt;
  wo.checklistTotal = wo.checklist.length;

  // Auto-close WO jika semua item closed
  const allClosed = wo.checklist.length > 0 && doneCnt === wo.checklist.length;
  if (allClosed && wo.status !== 'Closed') {
    wo.status      = 'Closed';
    wo.closingNote = document.getElementById('woClosingNote')?.value || '';
    wo.endTime     = now;
    // Tambah log
    try {
      const log = JSON.parse(wo.notesLog || '[]');
      log.push({
        ts:  now,
        by:  currentUser?.username || 'system',
        msg: `WO di-close otomatis. Semua ${wo.checklist.length} item selesai.`,
      });
      wo.notesLog = JSON.stringify(log);
    } catch(e) {}
    toast('🎉 Semua item closed — WO otomatis CLOSED!', 'success', 5000);
  } else {
    wo.closingNote = document.getElementById('woClosingNote')?.value || '';
    // Ada item yang dibuka lagi → WO tidak boleh tetap berstatus Closed
    if (!allClosed && wo.status === 'Closed') {
      wo.status  = 'Open';
      wo.endTime = '';
    }
    try {
      const log = JSON.parse(wo.notesLog || '[]');
      log.push({
        ts:  now,
        by:  currentUser?.username || 'system',
        msg: `Progress diperbarui: ${doneCnt}/${wo.checklist.length} item closed.`,
      });
      wo.notesLog = JSON.stringify(log);
    } catch(e) {}
  }

  // Sync ke session terkait
  const sess = sessions.find(s => s.woId === woId || s.id === wo.sessId);
  if (sess) {
    sess.checklist  = wo.checklist;
    sess.woStatus   = wo.status;
    sess.closingNote = wo.closingNote;
  }

  saveAll();

  // Push ke MaintWare
  const btn = document.querySelector(`#woDetailBody .btn-primary`);
  if (btn) { btn.disabled = true; btn.textContent = '↻ Menyimpan...'; }

  try {
    // Checklist harus di-stringify sebelum dikirim ke GAS
    const woPayload = {
      ...wo,
      checklist: typeof wo.checklist === 'string'
        ? wo.checklist
        : JSON.stringify(wo.checklist || []),
    };

    const res = await fetch(WO_API_URL + '?fn=upsert', {
      method:   'POST',
      headers:  { 'Content-Type': 'text/plain;charset=utf-8' },
      body:     JSON.stringify({ fn: 'upsert', sheet: 'WO_ORDERS', row: woPayload }),
      redirect: 'follow',
    }).then(r => r.text()).then(t => { try { return JSON.parse(t); } catch(e) { return { ok: false, message: t.slice(0,100) }; }});


    if (res.ok === true || res.success === true) {
      toast(`✅ WO ${woId} tersimpan · ${doneCnt}/${wo.checklist.length} closed`, 'success');
      // Re-render modal dengan data terbaru
      renderWODetailModal(wo);
      renderFindingsPage();
    } else {
      toast('⚠ Tersimpan lokal tapi gagal sync: ' + (res.message||''), 'error');
      if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan Progress'; }
    }
  } catch(err) {
    toast('⚠ Tersimpan lokal · offline: ' + err.message, 'info');
    renderWODetailModal(wo);
    renderFindingsPage();
  }
}

// Helper — cari WO dari workOrders[] atau rekonstruksi dari sessions[]
function _getWOById(woId) {
  // Cari di workOrders state dulu
  let wo = workOrders.find(w => w.id === woId);
  if (wo) return wo;

  // Fallback: rekonstruksi dari session
  const sess = sessions.find(s => s.woId === woId);
  if (!sess) return null;

  const reconstructed = {
    id:             woId,
    title:          `WO — ${sess.equipName}`,
    status:         sess.woStatus || 'Open',
    priority:       '—',
    equipId:        sess.equipId,
    unitId:         sess.unitId,
    areaId:         sess.areaId,
    createdAt:      sess.createdAt,
    checklistDone:  (sess.checklist||[]).filter(c=>c.closeStatus==='Closed').length,
    checklistTotal: (sess.checklist||[]).length,
    checklist:      sess.checklist || [],
    sessId:         sess.id,
    notes:          '',
    notesLog:       '[]',
    closingNote:    sess.closingNote || '',
  };

  // Tambah ke workOrders agar tidak perlu rekonstruksi lagi
  workOrders.push(reconstructed);
  return reconstructed;
}
