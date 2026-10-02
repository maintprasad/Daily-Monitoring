'use strict';

// ── Tanggal ───────────────────────────────────────────────
// PENTING: jangan pakai toISOString() untuk tanggal "hari ini" — hasilnya UTC, sehingga
// antara jam 00:00–07:00 WIB tanggalnya mundur sehari. Pakai helper lokal di bawah.
function toLocalISODate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}
function todayISO()     { return toLocalISODate(new Date()); }
function thisMonthISO() { return todayISO().slice(0, 7); }

function fmtDate(d) {
  if (!d) return '—';
  try {
    // Serial tanggal Google Sheets (angka atau string angka)
    if (typeof d === 'number' || (typeof d === 'string' && /^\d{5}(\.\d+)?$/.test(d))) {
      const dt = new Date((Number(d) - 25569) * 86400000);
      d = dt.getUTCFullYear() + '-' +
          String(dt.getUTCMonth()+1).padStart(2,'0') + '-' +
          String(dt.getUTCDate()).padStart(2,'0');
    }
    // Datetime ISO lengkap → ambil tanggal lokal (WIB), bukan tanggal UTC
    if (typeof d === 'string' && d.includes('T')) {
      const dt = new Date(d);
      d = isNaN(dt) ? d.split('T')[0] : toLocalISODate(dt);
    }
    const [y,m,dd] = d.split('-');
    if (!m || !dd) return d;
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
    return dd + ' ' + (months[parseInt(m)-1]||m) + ' ' + y;
  } catch(e) { return d; }
}

// ── ID generator ─────────────────────────────────────────
// Format: PREFIX + timestamp(base36) + counter + acak.
// Versi lama memakai Date.now() % 36^4 (berulang tiap ±28 menit) sehingga ID sesi
// dari perangkat berbeda / setelah reload bisa bentrok dan saling menimpa di database.
let _idCounter = 0;
function shortId(prefix) {
  _idCounter = (_idCounter + 1) % 1296;
  const ts  = Date.now().toString(36).toUpperCase();
  const cnt = _idCounter.toString(36).toUpperCase().padStart(2, '0');
  let rnd = '';
  try {
    rnd = (crypto.getRandomValues(new Uint16Array(1))[0] % 1296).toString(36).toUpperCase().padStart(2, '0');
  } catch (e) {
    rnd = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0');
  }
  return (prefix || 'X') + ts + cnt + rnd;
}
function genId()  { return shortId('M'); }  // Session
function genUId() { return shortId('U'); }  // Unit
function genAId() { return shortId('A'); }  // Area
function genSId() { return shortId('S'); }  // SubArea
function genEId() { return shortId('E'); }  // Equip
function genPId() { return shortId('P'); }  // Param

// ── Escaping ─────────────────────────────────────────────
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/**
 * Argumen string untuk handler inline, mis. onclick="fn(${jsArg(nama)})".
 * Aman untuk nama yang mengandung tanda kutip (mis. "Gudang Pak Jo'").
 */
function jsArg(s) {
  return esc(JSON.stringify(s == null ? '' : String(s)));
}

/** JSON yang aman disisipkan ke dalam <script> (mencegah "</script>" di dalam data). */
function jsonForScript(v) {
  return JSON.stringify(v).replace(/</g, '\\u003c');
}

function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function getVal(id)       { return document.getElementById(id)?.value || ''; }
function setVal(id, val)  { const el = document.getElementById(id); if (el) el.value = val; }
function setErr(id, msg)  { const el = document.getElementById(id); if (el) el.textContent = msg; }
