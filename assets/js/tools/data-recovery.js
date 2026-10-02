'use strict';

// ═══════════════════════════════════════════════════════
// DATA RECOVERY TOOL
// ═══════════════════════════════════════════════════════

let _recoveryItems = []; // hasil scan

function openDataRecoveryTool() {
  // Populate unit filter
  const sel = document.getElementById('drUnitFilter');
  if (sel) {
    sel.innerHTML = '<option value="">Semua Unit</option>' +
      hierarchy.units.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
  }
  document.getElementById('drTableBody').innerHTML = `
    <tr><td colspan="9"><div class="empty"><div class="empty-ico">🔍</div>
    <div class="empty-msg">Klik "Scan Data Corrupt" untuk memulai</div></div></td></tr>`;
  document.getElementById('drStatsRow').innerHTML = '';
  document.getElementById('drScanSummary').textContent = '';
  document.getElementById('drLogArea').style.display = 'none';
  _recoveryItems = [];
  openOverlay('dataRecoveryOverlay');
}

/**
 * Deteksi apakah nilai adalah tanggal corrupt
 * Tanggal dari Sheets bisa berupa:
 * - String seperti "Thu Feb 12 2026" atau "Mon May 18 2026"
 * - Number (serial Sheets)
 * - String angka besar > 40000 (serial tanggal modern)
 */
function isCorruptDateValue(val) {
  if (val === '' || val === null || val === undefined) return false;
  const s = String(val).trim();

  // Pola "Day Mon DD YYYY" atau "Day Mon DD YYYY HH:MM:SS"
  if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{4}/.test(s)) return true;

  // Pola ISO date string
  if (/^\d{4}-\d{2}-\d{2}(T|\s)/.test(s)) return true;

  // Pola DD/MM/YYYY atau MM/DD/YYYY (Sheets sering format ulang serial date
  // jadi string ini jika kolom diset format Tanggal — kasus paling umum
  // untuk angka parameter kecil yang ke-detect sebagai serial Sheets ~1900-an)
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return true;

  // Pola DD-MM-YYYY / YYYY-MM-DD (tanpa waktu)
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) return true;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) return true;

  // Angka besar yang merupakan serial tanggal Sheets (> 40000 = setelah 2009)
  const n = Number(s);
  if (!isNaN(n) && n > 40000 && n < 60000) return true;

  return false;
}

/**
 * Konversi nilai corrupt → kandidat angka
 * Return array kandidat: [ { value, method, confidence } ]
 */
function extractCandidates(val, param) {
  const s   = String(val).trim();
  const candidates = [];

  // ── Method 0: Parse format DD/MM/YYYY → konversi balik ke serial Sheets ────
  // Ini kasus PALING UMUM: Sheets format ulang kolom jadi tanggal, lalu kirim
  // sebagai string "10/01/1900" yang sebenarnya serial date dari nilai kecil asli.
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const dd = parseInt(slashMatch[1]);
    const mm = parseInt(slashMatch[2]);
    const yyyy = parseInt(slashMatch[3]);
    // Coba interpretasi sebagai DD/MM/YYYY (umum di Indonesia & Sheets locale ID)
    try {
      const dateObjDMY = new Date(yyyy, mm - 1, dd);
      const base = new Date(1899, 11, 30);
      const serialDMY = Math.round((dateObjDMY - base) / 86400000);
      if (serialDMY >= 0 && serialDMY <= 99999) {
        candidates.push({ value: serialDMY, method: `Serial dari DD/MM/YYYY (${s})`, confidence: 0.9 });
      }
    } catch(e) {}
    // Coba juga interpretasi sebagai MM/DD/YYYY (kalau locale Sheets US)
    if (dd <= 12 && mm !== dd) {
      try {
        const dateObjMDY = new Date(yyyy, dd - 1, mm);
        const base = new Date(1899, 11, 30);
        const serialMDY = Math.round((dateObjMDY - base) / 86400000);
        if (serialMDY >= 0 && serialMDY <= 99999) {
          candidates.push({ value: serialMDY, method: `Serial dari MM/DD/YYYY (${s})`, confidence: 0.5 });
        }
      } catch(e) {}
    }
  }

  // ── Method 0b: Parse format DD-MM-YYYY atau YYYY-MM-DD tanpa waktu ──────────
  const dashMatch1 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  const dashMatch2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dashMatch1 || dashMatch2) {
    let dd, mm, yyyy;
    if (dashMatch1) { dd = parseInt(dashMatch1[1]); mm = parseInt(dashMatch1[2]); yyyy = parseInt(dashMatch1[3]); }
    else            { yyyy = parseInt(dashMatch2[1]); mm = parseInt(dashMatch2[2]); dd = parseInt(dashMatch2[3]); }
    try {
      const dateObj = new Date(yyyy, mm - 1, dd);
      const base = new Date(1899, 11, 30);
      const serial = Math.round((dateObj - base) / 86400000);
      if (serial >= 0 && serial <= 99999) {
        candidates.push({ value: serial, method: `Serial dari tanggal (${s})`, confidence: 0.85 });
      }
    } catch(e) {}
  }

  // ── Method 1: Parse tanggal string → ambil hari, bulan, atau tahun ──────────
  const dateMatch = s.match(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{4})/);
  if (dateMatch) {
    const day   = parseInt(dateMatch[2]);
    const year  = parseInt(dateMatch[3]);
    const monthMap = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };
    const month = monthMap[dateMatch[1]] || 0;

    // Kandidat: tanggal (DD), bulan (MM), tahun mod 100, dll
    candidates.push({ value: day,            method: 'Tanggal (DD)',     confidence: 0.5 });
    candidates.push({ value: month,          method: 'Bulan (MM)',       confidence: 0.3 });
    candidates.push({ value: year % 100,     method: 'Tahun % 100',     confidence: 0.1 });
    candidates.push({ value: day + month,    method: 'DD + MM',         confidence: 0.2 });
  }

  // ── Method 2: Serial tanggal → cek apakah serial kecil = angka asli ─────────
  const n = Number(s.replace(/[^\d]/g, ''));
  if (!isNaN(n)) {
    // Serial kecil (< 1000) → kemungkinan angka asli yang terbaca sebagai serial
    if (n < 1000 && n >= 0) {
      candidates.push({ value: n, method: 'Serial kecil (nilai asli?)', confidence: 0.7 });
    }
    // Untuk string tanggal, coba ambil angka-angka yang muncul
    const nums = s.match(/\d+/g) || [];
    nums.forEach(num => {
      const v = parseInt(num);
      if (v !== n && v >= 0 && v < 5000) {
        candidates.push({ value: v, method: `Angka dalam string: ${num}`, confidence: 0.4 });
      }
    });
  }

  // ── Method 3: Google Sheets serial → tanggal asli ───────────────────────────
  // Sheets serial: hari sejak 1 Jan 1900
  // Tapi jika nilai asli kecil (misal 17), serial = 17 = 17 Jan 1900
  // Kita bisa reverse: jika serial < 1000, kemungkinan itu nilai asli
  const serial = parseInt(s);
  if (!isNaN(serial) && serial > 0 && serial < 1000) {
    candidates.push({ value: serial, method: 'Serial Sheets = nilai asli', confidence: 0.8 });
  }

  // ── Method 4: Deduplikasi dan ranking berdasarkan parameter range ────────────
  return candidates;
}

/**
 * Score kandidat berdasarkan parameter template
 * Return { bestValue, confidence, reason, allCandidates }
 */
function scoreCandidate(candidates, param) {
  if (!candidates.length) return { bestValue: null, confidence: 0, reason: 'Tidak ada kandidat', allCandidates: [] };

  const nMin = param?.normalMin;
  const nMax = param?.normalMax;
  const wMin = param?.warnMin;
  const wMax = param?.warnMax;
  const label = (param?.label || '').toLowerCase();
  const unit  = (param?.unit  || '').toLowerCase();

  // ── Heuristik berdasarkan label/unit ─────────────────────────────────────────
  let hintMin = null, hintMax = null;
  if (unit === 'a' || label.includes('arus') || label.includes('ampere') || label.includes('current')) {
    // Arus listrik: umumnya 0–2000A
    hintMin = 0; hintMax = 2000;
  } else if (unit === '°c' || label.includes('suhu') || label.includes('temp')) {
    hintMin = -30; hintMax = 150;
  } else if (unit === 'bar' || label.includes('tekanan') || label.includes('pressure')) {
    hintMin = 0; hintMax = 30;
  } else if (unit === '%' || label.includes('humidity') || label.includes('level')) {
    hintMin = 0; hintMax = 100;
  } else if (unit === 'v' || label.includes('tegangan') || label.includes('voltage')) {
    hintMin = 0; hintMax = 500;
  } else if (label.includes('kvar') || label.includes('kva') || label.includes('kw')) {
    hintMin = 0; hintMax = 5000;
  } else if (label.includes('jam') || label.includes('hour')) {
    hintMin = 0; hintMax = 50000;
  }

  // Tentukan effective range: prioritas normalMin/Max, fallback hint, fallback lebar
  const effMin = nMin !== undefined ? nMin : (hintMin !== null ? hintMin : 0);
  const effMax = nMax !== undefined ? nMax : (hintMax !== null ? hintMax : 99999);
  const warnLo = wMin !== undefined ? wMin : (effMin - Math.abs(effMin) * 0.2);
  const warnHi = wMax !== undefined ? wMax : (effMax + Math.abs(effMax) * 0.2);

  // Score setiap kandidat
  const scored = candidates.map(c => {
    let score = c.confidence;
    const v   = c.value;

    // Dalam range normal → bonus besar
    if (v >= effMin && v <= effMax)       score += 0.6;
    // Dalam range warn → bonus kecil
    else if (v >= warnLo && v <= warnHi)  score += 0.3;
    // Di luar range → penalty
    else                                   score -= 0.4;

    // Bonus jika sesuai hint unit
    if (hintMin !== null && v >= hintMin && v <= hintMax) score += 0.2;

    return { ...c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  let confidenceLevel, reason;
  if (best.score >= 0.9) {
    confidenceLevel = 'confident';
    reason = `✅ Sangat cocok dengan range normal (${effMin}–${effMax})`;
  } else if (best.score >= 0.5) {
    confidenceLevel = 'possible';
    reason = `⚠ Kemungkinan cocok — perlu review manual`;
  } else {
    confidenceLevel = 'unknown';
    reason = `❓ Tidak dapat diprediksi dengan yakin`;
  }

  return {
    bestValue:    best.value,
    confidence:   confidenceLevel,
    reason,
    score:        best.score,
    allCandidates: scored,
  };
}

/**
 * Scan semua sesi → temukan nilai corrupt
 */
function runDataRecoveryScan() {
  const unitFilter = document.getElementById('drUnitFilter')?.value || '';
  _recoveryItems   = [];

  // Update tombol scan jadi loading state
  const scanBtn = document.querySelector('#dataRecoveryOverlay .btn-primary');
  if (scanBtn) { scanBtn.disabled = true; scanBtn.textContent = '⏳ Scanning...'; }

  try {
    const filtered = sessions.filter(s => !unitFilter || s.unitId === unitFilter);

    filtered.forEach(sess => {
      // Cari equipment → params
      const eq = findEquipFlex(sess.unitId, sess.areaId, '', sess.equipId);
      const paramMap = {};
      (eq?.params || []).forEach(p => { paramMap[p.id] = p; });

      (sess.items || []).forEach((item, itemIdx) => {
        if (!isCorruptDateValue(item.value)) return;

        const param      = paramMap[item.paramId] || null;
        const candidates = extractCandidates(item.value, param);
        const prediction = scoreCandidate(candidates, param);

        _recoveryItems.push({
          sessId:        sess.id,
          itemIdx,
          tanggal:       sess.tanggal,
          unitName:      sess.unitName,
          areaName:      sess.areaName,
          equipName:     sess.equipName,
          paramId:       item.paramId,
          label:         item.label || item.paramId,
          unit:          item.unit  || '',
          section:       item.section || '',
          rawValue:      item.value,
          currentStatus: item.status || '',
          param,
          prediction,
          selected:      prediction.confidence === 'confident',
          overrideValue: prediction.bestValue !== null ? String(prediction.bestValue) : '',
        });
      });
    });

    drLog(`Scan selesai: ${_recoveryItems.length} nilai corrupt ditemukan dari ${filtered.length} sesi`);
    renderRecoveryStats();
    renderRecoveryTable();

    if (_recoveryItems.length === 0) {
      toast('✅ Tidak ada nilai corrupt ditemukan', 'success');
    } else {
      toast(`⚠ ${_recoveryItems.length} nilai corrupt ditemukan`, 'info');
    }

  } catch(e) {
    console.error('[DataRecovery] Scan error:', e);
    drLog('✗ Error saat scan: ' + e.message);
    toast('✗ Scan gagal: ' + e.message, 'error');
  } finally {
    if (scanBtn) { scanBtn.disabled = false; scanBtn.textContent = '🔍 Scan Data Corrupt'; }
  }
}
function renderRecoveryStats() {
  const total     = _recoveryItems.length;
  const confident = _recoveryItems.filter(i => i.prediction.confidence === 'confident').length;
  const possible  = _recoveryItems.filter(i => i.prediction.confidence === 'possible').length;
  const unknown   = _recoveryItems.filter(i => i.prediction.confidence === 'unknown').length;

  const el = document.getElementById('drStatsRow');
  if (!el) return;
  el.innerHTML = `
    <div style="background:var(--blue-dim);border:1px solid rgba(43,108,184,.25);border-radius:8px;padding:12px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:var(--blue)">${total}</div>
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.07em">Total Corrupt</div>
    </div>
    <div style="background:var(--green-dim);border:1px solid rgba(74,158,63,.25);border-radius:8px;padding:12px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:var(--green)">${confident}</div>
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.07em">✅ Confident</div>
    </div>
    <div style="background:var(--orange-dim);border:1px solid rgba(251,140,58,.25);border-radius:8px;padding:12px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:var(--orange)">${possible}</div>
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.07em">⚠ Perlu Review</div>
    </div>
    <div style="background:var(--red-dim);border:1px solid rgba(192,57,43,.25);border-radius:8px;padding:12px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:var(--red)">${unknown}</div>
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.07em">❓ Unknown</div>
    </div>`;

  document.getElementById('drScanSummary').textContent =
    `${total} nilai corrupt ditemukan · ${confident} bisa diprediksi otomatis`;
}

function renderRecoveryTable() {
  const statusFilter = document.getElementById('drStatusFilter')?.value || 'all';
  const filtered = statusFilter === 'all'
    ? _recoveryItems
    : _recoveryItems.filter(i => i.prediction.confidence === statusFilter);

  const tbody = document.getElementById('drTableBody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty">
      <div class="empty-ico">${_recoveryItems.length ? '✅' : '🔍'}</div>
      <div class="empty-msg">${_recoveryItems.length ? 'Tidak ada item dengan filter ini' : 'Klik "Scan Data Corrupt" untuk memulai'}</div>
    </div></td></tr>`;
    updateDrSelectedCount();
    return;
  }

  tbody.innerHTML = filtered.map((item, fi) => {
    // Index global di _recoveryItems
    const gi = _recoveryItems.indexOf(item);

    const confBadge = {
      confident: '<span class="badge b-ok" style="font-size:9px">✅ Confident</span>',
      possible:  '<span class="badge b-warn" style="font-size:9px">⚠ Possible</span>',
      unknown:   '<span class="badge b-alert" style="font-size:9px">❓ Unknown</span>',
    }[item.prediction.confidence] || '';

    const nMin = item.param?.normalMin;
    const nMax = item.param?.normalMax;
    const rangeHint = (nMin !== undefined && nMax !== undefined)
      ? `<div style="font-size:9px;color:var(--text3);margin-top:2px">Range: ${nMin}–${nMax} ${esc(item.unit)}</div>`
      : '';

    // Kandidat lain sebagai dropdown
    const candidateOptions = item.prediction.allCandidates
      .slice(0, 6)
      .map(c => `<option value="${c.value}" ${String(item.overrideValue) === String(c.value) ? 'selected' : ''}>
        ${c.value} ${item.unit} (${c.method}, score:${c.score.toFixed(2)})
      </option>`).join('');

    return `<tr style="background:${item.prediction.confidence==='confident'?'rgba(34,197,94,.04)':item.prediction.confidence==='possible'?'rgba(249,115,22,.03)':'rgba(239,68,68,.04)'}">
      <td style="text-align:center">
        <input type="checkbox" data-gi="${gi}" ${item.selected ? 'checked' : ''}
          onchange="drToggleItem(${gi}, this.checked)"
          style="accent-color:var(--green);width:14px;height:14px"/>
      </td>
      <td>
        <div style="font-size:11px;font-weight:600;color:var(--green);font-family:'IBM Plex Mono',monospace">${esc(item.sessId)}</div>
        <div style="font-size:10px;color:var(--text3)">${fmtDate(item.tanggal)}</div>
      </td>
      <td>
        <div style="font-size:11px;font-weight:600">${esc(item.equipName)}</div>
        <div style="font-size:10px;color:var(--text3)">${esc(item.unitName)} · ${esc(item.areaName)}</div>
      </td>
      <td>
        <div style="font-size:12px;font-weight:500">${esc(item.label)}</div>
        <div style="font-size:10px;color:var(--text3)">${esc(item.section)} · ${esc(item.unit)}</div>
        ${rangeHint}
      </td>
      <td>
        <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--red);word-break:break-all;max-width:120px">
          ${esc(String(item.rawValue).slice(0, 30))}
        </div>
        <div style="font-size:9px;color:var(--text3);margin-top:2px">Status: ${esc(item.currentStatus||'—')}</div>
      </td>
      <td>
        <div style="font-size:13px;font-weight:700;color:var(--navy)">
          ${item.prediction.bestValue !== null ? item.prediction.bestValue + ' ' + esc(item.unit) : '—'}
        </div>
        <div style="font-size:9px;color:var(--text3);margin-top:2px">${esc(item.prediction.reason)}</div>
      </td>
      <td style="text-align:center">${confBadge}</td>
      <td>
        <select class="fsel2" style="font-size:11px;padding:4px 6px;min-width:100px"
          onchange="_recoveryItems[${gi}].overrideValue=this.value;updateDrSelectedCount()">
          <option value="" ${!item.overrideValue?'selected':''}>— Kosongkan —</option>
          ${candidateOptions}
        </select>
        <input type="number" step="any"
          style="margin-top:4px;width:100%;background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:4px 6px;border-radius:5px;font-size:11px;outline:none"
          placeholder="Atau ketik manual..."
          value="${esc(item.overrideValue)}"
          oninput="_recoveryItems[${gi}].overrideValue=this.value"/>
      </td>
      <td>
        <button class="btn btn-primary btn-xs" onclick="applySingleRecovery(${gi})">✓ Fix</button>
      </td>
    </tr>`;
  }).join('');

  updateDrSelectedCount();
}

function drToggleAll(checked) {
  _recoveryItems.forEach(item => { item.selected = checked; });
  renderRecoveryTable();
}

function drToggleItem(gi, checked) {
  if (_recoveryItems[gi]) _recoveryItems[gi].selected = checked;
  updateDrSelectedCount();
}

function updateDrSelectedCount() {
  const cnt = _recoveryItems.filter(i => i.selected).length;
  const el  = document.getElementById('drSelectedCount');
  if (el) el.textContent = `${cnt} item dipilih`;
}

/**
 * Terapkan recovery ke satu item
 */
function applySingleRecovery(gi) {
  const item = _recoveryItems[gi];
  if (!item) return;
  const sess = sessions.find(s => s.id === item.sessId);
  if (!sess) { toast('Sesi tidak ditemukan', 'error'); return; }

  const newVal = item.overrideValue;
  const targetItem = findRecoveryTarget(sess, item);
  if (!targetItem) { toast('Item tidak ditemukan', 'error'); return; }

  const oldVal = targetItem.value;

  if (newVal === '' || newVal === null || newVal === undefined) {
    targetItem.value  = '';
    targetItem.status = '';
  } else {
    targetItem.value = newVal;
    // Recalculate status
    targetItem.status = recalcItemStatus(parseFloat(newVal), item.param);
  }

  sess.updatedAt = new Date().toISOString();
  saveAll();
  regenerateFindings();
  renderAll();

  // Mark item sebagai sudah di-recover (hapus dari list)
  _recoveryItems.splice(gi, 1);
  renderRecoveryStats();
  renderRecoveryTable();

  drLog(`✅ Fix: ${item.label} @ ${item.sessId} | ${oldVal} → ${newVal || '(kosong)'} [${targetItem.status}]`);
  toast(`✅ ${item.label} diperbaiki: ${newVal} ${item.unit}`, 'success');
}

/**
 * Terapkan semua yang dipilih
 */
function applySelectedRecovery() {
  const selected = _recoveryItems.filter(i => i.selected);
  if (!selected.length) { toast('Pilih item terlebih dahulu', 'error'); return; }
  if (!confirm(`Terapkan recovery untuk ${selected.length} item?\nPastikan nilai sudah benar sebelum melanjutkan.`)) return;

  let fixed = 0, skipped = 0;
  const affectedSessions = new Map(); // dedup sesi yang perlu di-push ulang

  selected.forEach(item => {
    const sess = sessions.find(s => s.id === item.sessId);
    if (!sess) { skipped++; return; }
    const targetItem = findRecoveryTarget(sess, item);
    if (!targetItem) { skipped++; return; }

    const newVal = item.overrideValue;
    if (newVal === '' || newVal === null) {
      targetItem.value  = '';
      targetItem.status = '';
    } else {
      targetItem.value  = newVal;
      targetItem.status = recalcItemStatus(parseFloat(newVal), item.param);
    }
    sess.updatedAt = new Date().toISOString();
    drLog(`✅ ${item.label} @ ${item.sessId}: ${item.rawValue} → ${newVal} [${targetItem.status}]`);
    affectedSessions.set(sess.id, sess);
    fixed++;
  });

  saveAll();
  regenerateFindings();
  renderAll();

  // Hapus yang sudah di-fix dari list
  _recoveryItems = _recoveryItems.filter(i => !i.selected);
  renderRecoveryStats();
  renderRecoveryTable();

  toast(`✅ ${fixed} nilai diperbaiki${skipped ? `, ${skipped} dilewati` : ''} ✓`, 'success');
  if (affectedSessions.size > 0) drLog(`📤 ${affectedSessions.size} sesi yang diperbaiki dikirim ke database`);
}

function applyConfidentOnly() {
  _recoveryItems.forEach(i => { i.selected = i.prediction.confidence === 'confident'; });
  renderRecoveryTable();
  applySelectedRecovery();
}

function clearCorruptValues() {
  const selected = _recoveryItems.filter(i => i.selected);
  if (!selected.length) { toast('Pilih item terlebih dahulu', 'error'); return; }
  if (!confirm(`Kosongkan ${selected.length} nilai corrupt? (tidak diisi = status pending)`)) return;

  const affectedSessions = new Map();
  selected.forEach(item => {
    const sess = sessions.find(s => s.id === item.sessId);
    if (!sess) return;
    const targetItem = findRecoveryTarget(sess, item);
    if (!targetItem) return;
    targetItem.value  = '';
    targetItem.status = '';
    sess.updatedAt = new Date().toISOString();
    drLog(`🗑 Dikosongkan: ${item.label} @ ${item.sessId}`);
    item.overrideValue = '';
    affectedSessions.set(sess.id, sess);
  });

  saveAll();
  regenerateFindings();
  renderAll();
  _recoveryItems = _recoveryItems.filter(i => !i.selected);
  renderRecoveryStats();
  renderRecoveryTable();
  toast('Nilai dikosongkan ✓', 'info');
}

/**
 * Item sesi yang akan diperbaiki. Dicocokkan ulang lewat paramId karena array sesi
 * bisa sudah diganti oleh sinkronisasi database sejak scan dijalankan.
 */
function findRecoveryTarget(sess, item) {
  const byIdx = (sess.items || [])[item.itemIdx];
  if (byIdx && byIdx.paramId === item.paramId) return byIdx;
  return (sess.items || []).find(i => i.paramId === item.paramId) || null;
}

/**
 * Recalculate status dari nilai baru berdasarkan parameter
 */
function recalcItemStatus(v, param) {
  if (isNaN(v) || !param) return '';
  const { normalMin: nMin, normalMax: nMax, warnMin, warnMax } = param;
  // Batas kosong bisa tersimpan sebagai null — Number(null) = 0, jadi wajib dicek != null
  const has = x => x !== undefined && x !== null && x !== '' && !isNaN(x);

  const overWarn  = has(warnMax) && v > warnMax;
  const underWarn = has(warnMin) && v < warnMin;
  const overNorm  = has(nMax)    && v > nMax;
  const underNorm = has(nMin)    && v < nMin;

  if      (overWarn || underWarn) return 'ALERT';
  else if (overNorm || underNorm) return 'WARNING';
  else                            return 'OK';
}

function drLog(msg) {
  const el = document.getElementById('drLogArea');
  if (!el) return;
  el.style.display = 'block';
  el.insertAdjacentHTML('beforeend', `<div>[${new Date().toLocaleTimeString('id-ID')}] ${esc(msg)}</div>`);
  el.scrollTop = el.scrollHeight;
}
