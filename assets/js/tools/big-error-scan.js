'use strict';

// ═══════════════════════════════════════════════════════
// SCAN BIG ERROR TOOL — recovery untuk nilai numerik yang
// ketinggalan fragmen tanggal/timestamp (bug titik-ribuan)
// Contoh: "1120260000000700" → nilai asli "11"
// ═══════════════════════════════════════════════════════

let _bigErrorItems = []; // hasil scan

function openBigErrorScanTool() {
  const sel = document.getElementById('beUnitFilter');
  if (sel) {
    sel.innerHTML = '<option value="">Semua Unit</option>' +
      hierarchy.units.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
  }
  document.getElementById('beTableBody').innerHTML = `
    <tr><td colspan="9"><div class="empty"><div class="empty-ico">🧨</div>
    <div class="empty-msg">Klik "Scan Nilai Tidak Wajar" untuk memulai</div></div></td></tr>`;
  document.getElementById('beStatsRow').innerHTML = '';
  document.getElementById('beScanSummary').textContent = '';
  document.getElementById('beLogArea').style.display = 'none';
  _bigErrorItems = [];
  openOverlay('bigErrorScanOverlay');
}

/**
 * isBigErrorValue — deteksi nilai numerik yang panjangnya tidak wajar.
 * Parameter monitoring (arus, suhu, tekanan, dll) normalnya 1-6 digit
 * termasuk desimal. ≥10 digit murni angka = hampir pasti bug timestamp.
 */
function isBigErrorValue(val) {
  if (val === '' || val === null || val === undefined) return false;
  const s = String(val).trim();
  // Hanya digit (boleh ada minus di depan), tanpa titik/koma — karena bug ini
  // muncul SETELAH normalisasi (titik sudah terhapus jadi angka polos panjang)
  if (!/^-?\d+$/.test(s)) return false;
  const digits = s.replace('-', '');
  return digits.length >= 10;
}

/**
 * extractBigErrorCandidates — cari kandidat nilai asli dari angka yang kepanjangan.
 * Strategi utama: cari fragmen tahun (20xx atau 19xx) di dalam string,
 * potong tepat sebelum fragmen itu sebagai kandidat paling kuat.
 * Strategi cadangan: coba semua panjang prefix 1-6 digit.
 */
function extractBigErrorCandidates(val, param) {
  const s = String(val).trim().replace('-', '');
  const candidates = [];

  // ── Strategi 1: cari fragmen tahun (paling andal) ──────────────────
  const yearMatch = s.match(/(19|20)\d{2}/);
  if (yearMatch && yearMatch.index > 0) {
    const prefix = s.slice(0, yearMatch.index);
    if (prefix.length > 0 && prefix.length <= 6) {
      candidates.push({
        value: parseFloat(prefix),
        method: `Potong sebelum fragmen tahun "${yearMatch[0]}"`,
        confidence: 0.85,
      });
    }
  }

  // ── Strategi 2: coba semua panjang prefix masuk akal (1-6 digit) ───
  for (let cut = 1; cut <= Math.min(s.length - 1, 6); cut++) {
    const prefix = s.slice(0, cut);
    const suffix = s.slice(cut);
    const num    = parseFloat(prefix);
    if (isNaN(num)) continue;

    // Suffix dianggap "junk" kalau banyak nol atau mengandung fragmen tahun
    const zeroRatio   = (suffix.match(/0/g) || []).length / Math.max(suffix.length, 1);
    const hasYearFrag = /(19|20)\d{2}/.test(suffix);
    const looksJunk    = zeroRatio >= 0.4 || hasYearFrag;

    if (looksJunk) {
      candidates.push({
        value: num,
        method: `Prefix ${cut} digit (sisa terlihat seperti timestamp)`,
        confidence: hasYearFrag ? 0.6 : 0.35,
      });
    }
  }

  // Dedup berdasarkan value
  const seen = new Set();
  return candidates.filter(c => {
    if (seen.has(c.value)) return false;
    seen.add(c.value);
    return true;
  });
}

/**
 * scoreBigErrorCandidate — sama prinsipnya dengan scoreCandidate() di Data Recovery,
 * tapi disesuaikan supaya kandidat dari fragmen-tahun dapat bonus lebih besar.
 */
function scoreBigErrorCandidate(candidates, param) {
  if (!candidates.length) return { bestValue: null, confidence: 'unknown', reason: 'Tidak ada kandidat', allCandidates: [] };

  const nMin  = param?.normalMin;
  const nMax  = param?.normalMax;
  const wMin  = param?.warnMin;
  const wMax  = param?.warnMax;
  const label = (param?.label || '').toLowerCase();
  const unit  = (param?.unit  || '').toLowerCase();

  let hintMin = null, hintMax = null;
  if (unit === 'a' || label.includes('arus') || label.includes('ampere')) { hintMin = 0; hintMax = 2000; }
  else if (unit === '°c' || label.includes('suhu')) { hintMin = -30; hintMax = 150; }
  else if (unit === 'bar' || label.includes('tekanan')) { hintMin = 0; hintMax = 30; }
  else if (unit === '%') { hintMin = 0; hintMax = 100; }
  else if (unit === 'v' || label.includes('tegangan')) { hintMin = 0; hintMax = 500; }
  else if (label.includes('kvar') || label.includes('kva') || label.includes('kw')) { hintMin = 0; hintMax = 5000; }
  else if (label.includes('jam')) { hintMin = 0; hintMax = 50000; }

  const effMin = nMin !== undefined ? nMin : (hintMin !== null ? hintMin : 0);
  const effMax = nMax !== undefined ? nMax : (hintMax !== null ? hintMax : 9999);
  const warnLo = wMin !== undefined ? wMin : (effMin - Math.abs(effMin) * 0.2);
  const warnHi = wMax !== undefined ? wMax : (effMax + Math.abs(effMax) * 0.2);

  const scored = candidates.map(c => {
    let score = c.confidence;
    const v = c.value;
    if (v >= effMin && v <= effMax)      score += 0.5;
    else if (v >= warnLo && v <= warnHi) score += 0.25;
    else                                  score -= 0.3;
    if (hintMin !== null && v >= hintMin && v <= hintMax) score += 0.15;
    return { ...c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  let confidenceLevel, reason;
  if (best.score >= 0.85) {
    confidenceLevel = 'confident';
    reason = `✅ Cocok dengan range normal (${effMin}–${effMax}) & fragmen tahun terdeteksi`;
  } else if (best.score >= 0.45) {
    confidenceLevel = 'possible';
    reason = `⚠ Kemungkinan cocok — perlu review manual`;
  } else {
    confidenceLevel = 'unknown';
    reason = `❓ Tidak dapat diprediksi dengan yakin`;
  }

  return { bestValue: best.value, confidence: confidenceLevel, reason, score: best.score, allCandidates: scored };
}

function runBigErrorScan() {
  const unitFilter = document.getElementById('beUnitFilter')?.value || '';
  _bigErrorItems   = [];

  const scanBtn = document.querySelector('#bigErrorScanOverlay .btn-primary');
  if (scanBtn) { scanBtn.disabled = true; scanBtn.textContent = '⏳ Scanning...'; }

  try {
    const filtered = sessions.filter(s => !unitFilter || s.unitId === unitFilter);

    filtered.forEach(sess => {
      const eq = findEquipFlex(sess.unitId, sess.areaId, '', sess.equipId);
      const paramMap = {};
      (eq?.params || []).forEach(p => { paramMap[p.id] = p; });

      (sess.items || []).forEach((item, itemIdx) => {
        if (!isBigErrorValue(item.value)) return;

        const param      = paramMap[item.paramId] || null;
        const candidates = extractBigErrorCandidates(item.value, param);
        const prediction = scoreBigErrorCandidate(candidates, param);

        _bigErrorItems.push({
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

    beLog(`Scan selesai: ${_bigErrorItems.length} nilai tidak wajar ditemukan dari ${filtered.length} sesi`);
    renderBigErrorStats();
    renderBigErrorTable();

    if (_bigErrorItems.length === 0) {
      toast('✅ Tidak ada nilai tidak wajar ditemukan', 'success');
    } else {
      toast(`⚠ ${_bigErrorItems.length} nilai tidak wajar ditemukan`, 'info');
    }
  } catch(e) {
    console.error('[BigErrorScan] Scan error:', e);
    beLog('✗ Error saat scan: ' + e.message);
    toast('✗ Scan gagal: ' + e.message, 'error');
  } finally {
    if (scanBtn) { scanBtn.disabled = false; scanBtn.textContent = '🔍 Scan Nilai Tidak Wajar'; }
  }
}

function renderBigErrorStats() {
  const total     = _bigErrorItems.length;
  const confident = _bigErrorItems.filter(i => i.prediction.confidence === 'confident').length;
  const possible  = _bigErrorItems.filter(i => i.prediction.confidence === 'possible').length;
  const unknown   = _bigErrorItems.filter(i => i.prediction.confidence === 'unknown').length;

  const el = document.getElementById('beStatsRow');
  if (!el) return;
  el.innerHTML = `
    <div style="background:var(--blue-dim);border:1px solid rgba(43,108,184,.25);border-radius:8px;padding:12px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:var(--blue)">${total}</div>
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.07em">Total Tidak Wajar</div>
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

  document.getElementById('beScanSummary').textContent =
    `${total} nilai tidak wajar ditemukan · ${confident} bisa diprediksi otomatis`;
}

function renderBigErrorTable() {
  const statusFilter = document.getElementById('beStatusFilter')?.value || 'all';
  const filtered = statusFilter === 'all'
    ? _bigErrorItems
    : _bigErrorItems.filter(i => i.prediction.confidence === statusFilter);

  const tbody = document.getElementById('beTableBody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty">
      <div class="empty-ico">${_bigErrorItems.length ? '✅' : '🧨'}</div>
      <div class="empty-msg">${_bigErrorItems.length ? 'Tidak ada item dengan filter ini' : 'Klik "Scan Nilai Tidak Wajar" untuk memulai'}</div>
    </div></td></tr>`;
    updateBeSelectedCount();
    return;
  }

  tbody.innerHTML = filtered.map((item) => {
    const gi = _bigErrorItems.indexOf(item);

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

    const candidateOptions = item.prediction.allCandidates
      .slice(0, 6)
      .map(c => `<option value="${c.value}" ${String(item.overrideValue) === String(c.value) ? 'selected' : ''}>
        ${c.value} ${item.unit} (${c.method}, score:${c.score.toFixed(2)})
      </option>`).join('');

    return `<tr style="background:${item.prediction.confidence==='confident'?'rgba(34,197,94,.04)':item.prediction.confidence==='possible'?'rgba(249,115,22,.03)':'rgba(239,68,68,.04)'}">
      <td style="text-align:center">
        <input type="checkbox" data-gi="${gi}" ${item.selected ? 'checked' : ''}
          onchange="beToggleItem(${gi}, this.checked)"
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
        <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--red);word-break:break-all;max-width:140px">
          ${esc(String(item.rawValue))}
        </div>
        <div style="font-size:9px;color:var(--text3);margin-top:2px">${String(item.rawValue).length} digit · Status: ${esc(item.currentStatus||'—')}</div>
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
          onchange="_bigErrorItems[${gi}].overrideValue=this.value;updateBeSelectedCount()">
          <option value="" ${!item.overrideValue?'selected':''}>— Kosongkan —</option>
          ${candidateOptions}
        </select>
        <input type="number" step="any"
          style="margin-top:4px;width:100%;background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:4px 6px;border-radius:5px;font-size:11px;outline:none"
          placeholder="Atau ketik manual..."
          value="${esc(item.overrideValue)}"
          oninput="_bigErrorItems[${gi}].overrideValue=this.value"/>
      </td>
      <td>
        <button class="btn btn-primary btn-xs" onclick="applySingleBigErrorFix(${gi})">✓ Fix</button>
      </td>
    </tr>`;
  }).join('');

  updateBeSelectedCount();
}

function beToggleAll(checked) {
  _bigErrorItems.forEach(item => { item.selected = checked; });
  renderBigErrorTable();
}

function beToggleItem(gi, checked) {
  if (_bigErrorItems[gi]) _bigErrorItems[gi].selected = checked;
  updateBeSelectedCount();
}

function updateBeSelectedCount() {
  const cnt = _bigErrorItems.filter(i => i.selected).length;
  const el  = document.getElementById('beSelectedCount');
  if (el) el.textContent = `${cnt} item dipilih`;
}

function applySingleBigErrorFix(gi) {
  const item = _bigErrorItems[gi];
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
    targetItem.value  = newVal;
    targetItem.status = recalcItemStatus(parseFloat(newVal), item.param, targetItem.status);
  }

  sess.updatedAt = new Date().toISOString();
  saveAll();

  _bigErrorItems.splice(gi, 1);
  renderBigErrorStats();
  renderBigErrorTable();
  regenerateFindings();
  renderAll();

  beLog(`✅ Fix: ${item.label} @ ${item.sessId} | ${oldVal} → ${newVal || '(kosong)'} [${targetItem.status}]`);
  toast(`✅ ${item.label} diperbaiki: ${newVal} ${item.unit}`, 'success');
}

function applySelectedBigErrorFix() {
  const selected = _bigErrorItems.filter(i => i.selected);
  if (!selected.length) { toast('Pilih item terlebih dahulu', 'error'); return; }
  if (!confirm(`Terapkan koreksi untuk ${selected.length} item?\nPastikan nilai sudah benar sebelum melanjutkan.`)) return;

  let fixed = 0, skipped = 0;
  const affectedSessions = new Map();

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
      targetItem.status = recalcItemStatus(parseFloat(newVal), item.param, targetItem.status);
    }
    sess.updatedAt = new Date().toISOString();
    beLog(`✅ ${item.label} @ ${item.sessId}: ${item.rawValue} → ${newVal} [${targetItem.status}]`);
    affectedSessions.set(sess.id, sess);
    fixed++;
  });

  saveAll();
  regenerateFindings();
  renderAll();

  _bigErrorItems = _bigErrorItems.filter(i => !i.selected);
  renderBigErrorStats();
  renderBigErrorTable();

  toast(`✅ ${fixed} nilai diperbaiki${skipped ? `, ${skipped} dilewati` : ''} ✓`, 'success');

  if (affectedSessions.size > 0) beLog(`📤 ${affectedSessions.size} sesi yang diperbaiki dikirim ke database`);
}

function applyConfidentBigErrorOnly() {
  _bigErrorItems.forEach(i => { i.selected = i.prediction.confidence === 'confident'; });
  renderBigErrorTable();
  applySelectedBigErrorFix();
}

function clearBigErrorValues() {
  const selected = _bigErrorItems.filter(i => i.selected);
  if (!selected.length) { toast('Pilih item terlebih dahulu', 'error'); return; }
  if (!confirm(`Kosongkan ${selected.length} nilai tidak wajar? (tidak diisi = status pending)`)) return;

  const affectedSessions = new Map();
  selected.forEach(item => {
    const sess = sessions.find(s => s.id === item.sessId);
    if (!sess) return;
    const targetItem = findRecoveryTarget(sess, item);
    if (!targetItem) return;
    targetItem.value  = '';
    targetItem.status = '';
    sess.updatedAt = new Date().toISOString();
    beLog(`🗑 Dikosongkan: ${item.label} @ ${item.sessId}`);
    item.overrideValue = '';
    affectedSessions.set(sess.id, sess);
  });

  saveAll();
  regenerateFindings();
  renderAll();
  _bigErrorItems = _bigErrorItems.filter(i => !i.selected);
  renderBigErrorStats();
  renderBigErrorTable();
  toast('Nilai dikosongkan ✓', 'info');
}

function beLog(msg) {
  const el = document.getElementById('beLogArea');
  if (!el) return;
  el.style.display = 'block';
  el.insertAdjacentHTML('beforeend', `<div>[${new Date().toLocaleTimeString('id-ID')}] ${esc(msg)}</div>`);
  el.scrollTop = el.scrollHeight;
}
