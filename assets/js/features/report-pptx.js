'use strict';

// ── STATE ─────────────────────────────────────────────────────────
let _pptxLoaded = false;
let _pptxLoading = false;

// ── WARNA BRAND (persis sama dengan CSS vars di HTML) ──────────────
const PPT_COLORS = {
  navy:      '1A3A6B',
  green:     '4A9E3F',
  greenD:    '3A8A30',
  blue:      '2B6CB8',
  orange:    'FB8C3A',
  red:       'C0392B',
  purple:    'B88FF7',
  cyan:      '2A7A5A',
  white:     'FFFFFF',
  offWhite:  'F4F7F4',
  bgLight:   'EEF3EE',
  bgCard:    'FFFFFF',
  text:      '1A2A1A',
  text2:     '3A5A3A',
  text3:     '7A9A7A',
  border:    'D4E0D4',
  // Backgrounds untuk slide konten
  slideNavy:  '1A3A6B',   // slide gelap
  slideBg:    'F4F7F4',   // slide terang
  slideCard:  'FFFFFF',   // card putih
};

// ── LOAD PptxGenJS dari CDN ────────────────────────────────────────
function loadPptxGenJS() {
  return new Promise((resolve, reject) => {
    if (_pptxLoaded && typeof PptxGenJS !== 'undefined') { resolve(); return; }
    if (_pptxLoading) {
      // Tunggu hingga selesai
      const poll = setInterval(() => {
        if (typeof PptxGenJS !== 'undefined') {
          clearInterval(poll); _pptxLoaded = true; resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(poll); reject(new Error('Timeout load PptxGenJS')); }, 15000);
      return;
    }
    _pptxLoading = true;
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';
    script.onload  = () => { _pptxLoaded = true; _pptxLoading = false; resolve(); };
    script.onerror = () => {
      _pptxLoading = false;
      // Fallback: unpkg
      const s2 = document.createElement('script');
      s2.src = 'https://unpkg.com/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';
      s2.onload  = () => { _pptxLoaded = true; resolve(); };
      s2.onerror = () => reject(new Error('Gagal load PptxGenJS dari CDN'));
      document.head.appendChild(s2);
    };
    document.head.appendChild(script);
  });
}

// ── OPEN PPT MODAL ─────────────────────────────────────────────────
function openPPTReportModal() {
  const overlay = document.getElementById('pptReportOverlay');
  if (!overlay) { buildPPTModal(); }
  // Set default tanggal: bulan ini
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const firstDay = `${y}-${m}-01`;
  const lastDay  = toLocalISODate(today);
  const fromEl = document.getElementById('pptDateFrom');
  const toEl   = document.getElementById('pptDateTo');
  if (fromEl && !fromEl.value) fromEl.value = firstDay;
  if (toEl   && !toEl.value)   toEl.value   = lastDay;
  updatePPTPreview();
  document.getElementById('pptReportOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closePPTModal() {
  document.getElementById('pptReportOverlay')?.classList.remove('open');
  if (!document.querySelector('.overlay.open')) document.body.style.overflow = '';
}

// ── BUILD MODAL DOM ────────────────────────────────────────────────
function buildPPTModal() {
  const div = document.createElement('div');
  div.id = 'pptReportOverlay';
  div.className = 'overlay';
  div.innerHTML = `
    <div class="modal modal-lg" style="max-height:95vh">
      <div class="modal-hdr">
        <div>
          <div class="modal-title">📊 Generate Laporan PPT</div>
          <div style="font-size:11px;color:var(--text3);margin-top:3px">
            Output: file .pptx asli yang bisa dibuka di PowerPoint / Google Slides
          </div>
        </div>
        <button class="modal-close" onclick="closePPTModal()">×</button>
      </div>
      <div class="modal-body">

        <!-- Filter Tanggal -->
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:16px 18px;margin-bottom:16px">
          <div style="font-size:11px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px">
            📅 Rentang Tanggal Laporan
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
            <div class="fg">
              <label class="flabel">Dari Tanggal</label>
              <input type="date" class="finput" id="pptDateFrom" onchange="updatePPTPreview()"/>
            </div>
            <div class="fg">
              <label class="flabel">Sampai Tanggal</label>
              <input type="date" class="finput" id="pptDateTo" onchange="updatePPTPreview()"/>
            </div>
          </div>
          <!-- Shortcut buttons -->
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-xs" onclick="setPPTRange('thisMonth')">Bulan Ini</button>
            <button class="btn btn-ghost btn-xs" onclick="setPPTRange('lastMonth')">Bulan Lalu</button>
            <button class="btn btn-ghost btn-xs" onclick="setPPTRange('thisWeek')">Minggu Ini</button>
            <button class="btn btn-ghost btn-xs" onclick="setPPTRange('last7')">7 Hari Terakhir</button>
            <button class="btn btn-ghost btn-xs" onclick="setPPTRange('last30')">30 Hari Terakhir</button>
          </div>
        </div>

        <!-- Preview Data -->
        <div id="pptPreviewBox" style="background:var(--navy);border-radius:10px;padding:16px 18px;margin-bottom:16px;color:#fff">
          <div style="font-size:10px;font-family:'IBM Plex Mono',monospace;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.09em;margin-bottom:10px">
            Preview Data yang Akan Dimasukkan
          </div>
          <div id="pptPreviewStats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
            <!-- Filled by updatePPTPreview() -->
          </div>
        </div>

        <!-- Slide Selection -->
        <div style="margin-bottom:16px">
          <div style="font-size:11px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">
            📋 Pilih Slide yang Akan Dimasukkan
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px" id="pptSlideCheckboxes">
            ${[
              ['pptSlide_cover',   '🎯 Cover & Ringkasan Eksekutif', true],
              ['pptSlide_kpi',     '📊 KPI Statistik Utama',          true],
              ['pptSlide_unit',    '🏭 Status per Unit & Area',       true],
              ['pptSlide_top5',    '🔴 Top 5 Equipment Bermasalah',   true],
              ['pptSlide_finding', '🚨 Daftar Finding & Alarm',       true],
              ['pptSlide_pic',     '👷 Aktivitas PIC/Teknisi',        true],
              ['pptSlide_trend',   '📈 Tren Monitoring',              true],
              ['pptSlide_rekom',   '💡 Rekomendasi Tindak Lanjut',    true],
            ].map(([id, label, checked]) => `
              <label style="display:flex;align-items:center;gap:8px;background:var(--bg3);border:1px solid var(--border);border-radius:7px;padding:8px 10px;cursor:pointer;font-size:12px;color:var(--text2)">
                <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} style="accent-color:var(--green);width:14px;height:14px"/>
                ${label}
              </label>`).join('')}
          </div>
        </div>

        <!-- Opsi Tambahan -->
        <div style="margin-bottom:16px;padding:12px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:8px">
          <div style="font-size:11px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">
            ⚙ Opsi Laporan
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="fg">
              <label class="flabel">Dibuat Oleh</label>
              <input type="text" class="finput" id="pptAuthor" placeholder="Nama pembuat laporan"
                value="${currentUser?.name || currentUser?.username || 'Electrical Team'}"/>
            </div>
            <div class="fg">
              <label class="flabel">Diperiksa Oleh</label>
              <input type="text" class="finput" id="pptReviewer" placeholder="Nama supervisor"/>
            </div>
            <div class="fg">
              <label class="flabel">Jabatan Pembuat</label>
              <input type="text" class="finput" id="pptPosition" placeholder="Jabatan..." value="Electrical Technician"/>
            </div>
            <div class="fg">
              <label class="flabel">Jabatan Supervisor</label>
              <input type="text" class="finput" id="pptReviewerPos" placeholder="Jabatan..." value="Supervisor Electrical"/>
            </div>
          </div>
        </div>

        <!-- Status generate -->
        <div id="pptGenStatus" style="display:none;padding:10px 14px;border-radius:8px;font-size:12px;margin-bottom:12px"></div>

        <div class="form-actions">
          <button class="btn btn-ghost" onclick="closePPTModal()">Tutup</button>
          <button class="btn btn-primary" id="pptGenBtn" onclick="generatePPTReport()">
            📊 Generate & Download PPTX
          </button>
        </div>
      </div>
    </div>`;

  div.addEventListener('click', e => { if (e.target === div) closePPTModal(); });
  document.body.appendChild(div);
}

// ── SHORTCUT RANGE ─────────────────────────────────────────────────
function setPPTRange(preset) {
  const today = new Date();
  let from, to = toLocalISODate(today);

  if (preset === 'thisMonth') {
    from = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`;
  } else if (preset === 'lastMonth') {
    const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const d2= new Date(today.getFullYear(), today.getMonth(), 0);
    from = toLocalISODate(d);
    to   = toLocalISODate(d2);
  } else if (preset === 'thisWeek') {
    const d = new Date(today);
    d.setDate(d.getDate() - d.getDay());
    from = toLocalISODate(d);
  } else if (preset === 'last7') {
    const d = new Date(today);
    d.setDate(d.getDate() - 6);
    from = toLocalISODate(d);
  } else if (preset === 'last30') {
    const d = new Date(today);
    d.setDate(d.getDate() - 29);
    from = toLocalISODate(d);
  }

  document.getElementById('pptDateFrom').value = from;
  document.getElementById('pptDateTo').value   = to;
  updatePPTPreview();
}

// ── UPDATE PREVIEW ─────────────────────────────────────────────────
function updatePPTPreview() {
  const from = document.getElementById('pptDateFrom')?.value || '';
  const to   = document.getElementById('pptDateTo')?.value   || '';
  const el   = document.getElementById('pptPreviewStats');
  if (!el) return;

  const filtered = sessions.filter(s => {
    const d = s.tanggal || '';
    return (!from || d >= from) && (!to || d <= to);
  });
  const allItems = filtered.flatMap(s => s.items || []);
  const totalOK    = allItems.filter(i => i.status === 'OK').length;
  const totalWarn  = allItems.filter(i => i.status === 'WARNING').length;
  const totalAlert = allItems.filter(i => i.status === 'ALERT').length;
  const uniqueEquips = new Set(filtered.map(s => s.equipId)).size;

  el.innerHTML = [
    { num: filtered.length, lbl: 'Sesi Monitoring', col: '#7ddf6e' },
    { num: uniqueEquips,    lbl: 'Equipment',        col: '#90b8f8' },
    { num: totalWarn,       lbl: 'Warning',          col: '#ffa64d' },
    { num: totalAlert,      lbl: 'Alert',            col: '#ff7070' },
  ].map(k => `
    <div style="text-align:center">
      <div style="font-size:28px;font-weight:700;color:${k.col};line-height:1">${k.num}</div>
      <div style="font-size:9px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.07em;margin-top:4px">${k.lbl}</div>
    </div>`).join('');
}

// ── DATA BUILDER ───────────────────────────────────────────────────
function buildPPTData(from, to) {
  const filtered = sessions.filter(s => {
    const d = s.tanggal || '';
    return (!from || d >= from) && (!to || d <= to);
  });

  const allItems   = filtered.flatMap(s => s.items || []);
  const totalSesi  = filtered.length;
  const totalOK    = allItems.filter(i => i.status === 'OK').length;
  const totalWarn  = allItems.filter(i => i.status === 'WARNING').length;
  const totalAlert = allItems.filter(i => i.status === 'ALERT').length;

  // Per unit
  const unitMap = {};
  filtered.forEach(s => {
    const u = s.unitName || 'Lainnya';
    if (!unitMap[u]) unitMap[u] = { ok:0, warn:0, alert:0, sesi:0, areas:{} };
    unitMap[u].sesi++;
    (s.items||[]).forEach(i => {
      if (i.status==='OK')           unitMap[u].ok++;
      else if (i.status==='WARNING') unitMap[u].warn++;
      else if (i.status==='ALERT')   unitMap[u].alert++;
    });
    const a = s.areaName||'Lainnya';
    if (!unitMap[u].areas[a]) unitMap[u].areas[a] = { ok:0, warn:0, alert:0, sesi:0 };
    unitMap[u].areas[a].sesi++;
    (s.items||[]).forEach(i => {
      if (i.status==='OK')           unitMap[u].areas[a].ok++;
      else if (i.status==='WARNING') unitMap[u].areas[a].warn++;
      else if (i.status==='ALERT')   unitMap[u].areas[a].alert++;
    });
  });

  // Top 5
  const eqAlertMap={}, eqWarnMap={}, eqMetaMap={};
  filtered.forEach(s => {
    const key = s.equipId||s.equipName||'?';
    if (!eqMetaMap[key]) eqMetaMap[key] = { name:s.equipName||key, unit:s.unitName||'', area:s.areaName||'' };
    (s.items||[]).forEach(i => {
      if (i.status==='ALERT')   eqAlertMap[key] = (eqAlertMap[key]||0)+1;
      if (i.status==='WARNING') eqWarnMap[key]  = (eqWarnMap[key] ||0)+1;
    });
  });
  const top5Alert = Object.entries(eqAlertMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const top5Warn  = Object.entries(eqWarnMap).sort((a,b)=>b[1]-a[1]).slice(0,5);

  // PIC
  const picMap = {};
  filtered.forEach(s => {
    (s.pic||'').split(',').map(p=>p.trim()).filter(Boolean).forEach(p => {
      picMap[p] = (picMap[p]||0)+1;
    });
  });

  // Tren 7 hari terakhir dalam rentang
  const trendDays=[], trendCounts=[];
  const toDate = to ? new Date(to + 'T00:00:00') : new Date();
  for (let i=6; i>=0; i--) {
    const d = new Date(toDate); d.setDate(d.getDate()-i);
    const key = toLocalISODate(d);
    const hh  = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'][d.getDay()];
    trendDays.push(hh + ' ' + d.getDate());
    trendCounts.push(filtered.filter(s=>(s.tanggal||'').startsWith(key)).length);
  }

  // Findings dalam rentang
  const periodFindings = findings.filter(f => {
    const d = f.tanggal||'';
    return (!from||d>=from) && (!to||d<=to);
  }).slice(0, 20);

  // Rekomendasi
  const rekomendasi = [];
  Object.entries(unitMap).forEach(([uName,u]) => {
    Object.entries(u.areas).forEach(([aName,a]) => {
      if (a.alert >= 3) rekomendasi.push({ level:'SEGERA', equip:aName, unit:uName, reason:`${a.alert}× Alert` });
      else if (a.warn >= 5) rekomendasi.push({ level:'MONITOR', equip:aName, unit:uName, reason:`${a.warn}× Warning` });
    });
  });
  // Juga dari top5
  top5Alert.slice(0,3).forEach(([key,cnt]) => {
    const m = eqMetaMap[key]||{name:key};
    if (!rekomendasi.find(r=>r.equip===m.name))
      rekomendasi.push({ level:'SEGERA', equip:m.name, unit:m.unit, reason:`${cnt}× Alert` });
  });

  return { filtered, totalSesi, totalOK, totalWarn, totalAlert,
    unitMap, top5Alert, top5Warn, eqMetaMap, picMap,
    trendDays, trendCounts, periodFindings, rekomendasi };
}

// ── FORMAT TANGGAL INDONESIA ───────────────────────────────────────
function formatDateID(dateStr) {
  if (!dateStr) return '—';
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
  try {
    const [y,m,d] = dateStr.split('-');
    return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
  } catch(e) { return dateStr; }
}

function formatRangeID(from, to) {
  if (from === to) return formatDateID(from);
  return `${formatDateID(from)} – ${formatDateID(to)}`;
}

// ══════════════════════════════════════════════════════════════════
// PPT BUILDER — semua slide dibangun di sini
// ══════════════════════════════════════════════════════════════════
async function generatePPTReport() {
  const btn     = document.getElementById('pptGenBtn');
  const statusEl= document.getElementById('pptGenStatus');

  function setStatus(msg, type='info') {
    if (!statusEl) return;
    statusEl.style.display = 'block';
    statusEl.style.background = type==='error'?'var(--red-dim)':type==='success'?'var(--green-dim)':'var(--blue-dim)';
    statusEl.style.color = type==='error'?'var(--red)':type==='success'?'var(--green)':'var(--blue)';
    statusEl.style.border = `1px solid ${type==='error'?'rgba(192,57,43,.3)':type==='success'?'rgba(74,158,63,.3)':'rgba(43,108,184,.3)'}`;
    statusEl.textContent = msg;
  }

  const from  = document.getElementById('pptDateFrom')?.value || '';
  const to    = document.getElementById('pptDateTo')?.value   || '';
  if (!from || !to) { setStatus('⚠ Pilih rentang tanggal terlebih dahulu.', 'error'); return; }

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Memuat library...'; }
  setStatus('⏳ Memuat PptxGenJS dari CDN...', 'info');

  try {
    await loadPptxGenJS();
  } catch(e) {
    setStatus('✗ Gagal load library PPT: ' + e.message + '. Pastikan koneksi internet aktif.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = '📊 Generate & Download PPTX'; }
    return;
  }

  if (btn) btn.textContent = '⚙ Membangun slide...';
  setStatus('⚙ Membangun slide PPT...', 'info');

  // Ambil data
  const d = buildPPTData(from, to);
  const author    = document.getElementById('pptAuthor')?.value.trim()      || 'Electrical Team';
  const reviewer  = document.getElementById('pptReviewer')?.value.trim()    || '';
  const position  = document.getElementById('pptPosition')?.value.trim()    || '';
  const reviewPos = document.getElementById('pptReviewerPos')?.value.trim() || '';
  const rangeLabel = formatRangeID(from, to);

  // Slides yang dipilih
  const inclCover   = document.getElementById('pptSlide_cover')?.checked   ?? true;
  const inclKPI     = document.getElementById('pptSlide_kpi')?.checked      ?? true;
  const inclUnit    = document.getElementById('pptSlide_unit')?.checked     ?? true;
  const inclTop5    = document.getElementById('pptSlide_top5')?.checked     ?? true;
  const inclFinding = document.getElementById('pptSlide_finding')?.checked  ?? true;
  const inclPIC     = document.getElementById('pptSlide_pic')?.checked      ?? true;
  const inclTrend   = document.getElementById('pptSlide_trend')?.checked    ?? true;
  const inclRekom   = document.getElementById('pptSlide_rekom')?.checked    ?? true;

  try {
    const pres = new PptxGenJS();
    pres.layout  = 'LAYOUT_16x9'; // 10" × 5.625"
    pres.author  = author;
    pres.title   = `Laporan Monitoring Electrical Prasad Seeds — ${rangeLabel}`;
    pres.company = 'Prasad Seeds Indonesia';

    // ── HELPER FUNGSI ──────────────────────────────────────────────
    const C = PPT_COLORS;

    // Header bar gelap di setiap slide konten
    function addContentHeader(slide, title, sub) {
      // Top bar navy
      slide.addShape(pres.shapes.RECTANGLE, {
        x:0, y:0, w:10, h:0.65,
        fill:{ color: C.navy }, line:{ color: C.navy }
      });
      // Garis hijau di bawah header
      slide.addShape(pres.shapes.RECTANGLE, {
        x:0, y:0.65, w:10, h:0.04,
        fill:{ color: C.green }, line:{ color: C.green }
      });
      // Logo dot
      slide.addShape(pres.shapes.RECTANGLE, {
        x:0.25, y:0.12, w:0.4, h:0.4,
        fill:{ color: C.green }, line:{ color: C.green }
      });
      slide.addText('PS', { x:0.25, y:0.12, w:0.4, h:0.4,
        fontSize:11, bold:true, color:C.navy, align:'center', valign:'middle', margin:0 });
      // Judul
      slide.addText(title, { x:0.75, y:0.08, w:8, h:0.3,
        fontSize:13, bold:true, color:C.white, valign:'middle', margin:0 });
      if (sub) slide.addText(sub, { x:0.75, y:0.37, w:8, h:0.22,
        fontSize:8, color:'A0C4A0', valign:'middle', margin:0 });
      // Footer
      slide.addShape(pres.shapes.RECTANGLE, {
        x:0, y:5.4, w:10, h:0.225,
        fill:{ color: C.navy }, line:{ color: C.navy }
      });
      slide.addText('Prasad Seeds Indonesia — Laporan Monitoring Electrical | ' + rangeLabel, {
        x:0.3, y:5.4, w:8, h:0.225,
        fontSize:7, color:'7A9AAA', valign:'middle', margin:0
      });
    }

    // KPI Box
    function addKPIBox(slide, x, y, w, h, num, label, color, bgColor) {
      slide.addShape(pres.shapes.RECTANGLE, {
        x, y, w, h,
        fill:{ color: bgColor || 'EEF3EE' },
        line:{ color: color, width:1.5 },
        shadow:{ type:'outer', color:'000000', opacity:0.08, blur:4, offset:2, angle:135 }
      });
      // Top accent bar
      slide.addShape(pres.shapes.RECTANGLE, {
        x, y, w:w, h:0.04,
        fill:{ color }, line:{ color }
      });
      slide.addText(String(num), {
        x, y:y+0.08, w, h:h*0.55,
        fontSize:32, bold:true, color, align:'center', valign:'middle', margin:0
      });
      slide.addText(label, {
        x:x+0.05, y:y+h*0.6, w:w-0.1, h:h*0.38,
        fontSize:8, color:C.text3, align:'center', valign:'top', margin:0
      });
    }

    // Progress bar shape
    function addProgressBar(slide, x, y, w, h, pct, color) {
      // Background track
      slide.addShape(pres.shapes.RECTANGLE, {
        x, y, w, h, fill:{ color:'E0E8E0' }, line:{ color:'C8D8C8', width:0.5 }
      });
      // Filled bar
      if (pct > 0) {
        slide.addShape(pres.shapes.RECTANGLE, {
          x, y, w: w * Math.min(pct/100, 1), h,
          fill:{ color }, line:{ color }
        });
      }
    }

    // ════════════════════════════════════════════════════════════
    // SLIDE 1 — COVER
    // ════════════════════════════════════════════════════════════
    if (inclCover) {
      const s = pres.addSlide();
      s.background = { color: C.navy };

      // Decorative circles
      s.addShape(pres.shapes.OVAL, {
        x:7.5, y:-0.5, w:4, h:4,
        fill:{ color: C.green, transparency:85 }, line:{ color: C.green, transparency:85 }
      });
      s.addShape(pres.shapes.OVAL, {
        x:-1, y:3.5, w:3, h:3,
        fill:{ color: C.blue, transparency:88 }, line:{ color: C.blue, transparency:88 }
      });

      // Garis hijau atas
      s.addShape(pres.shapes.RECTANGLE, {
        x:0, y:0, w:10, h:0.06, fill:{ color: C.green }, line:{ color: C.green }
      });
      // Garis hijau bawah
      s.addShape(pres.shapes.RECTANGLE, {
        x:0, y:5.565, w:10, h:0.06, fill:{ color: C.green }, line:{ color: C.green }
      });

      // Logo kotak
      s.addShape(pres.shapes.RECTANGLE, {
        x:0.5, y:0.4, w:0.55, h:0.55,
        fill:{ color: C.green }, line:{ color: C.green }
      });
      s.addText('PS', { x:0.5, y:0.4, w:0.55, h:0.55,
        fontSize:14, bold:true, color:C.navy, align:'center', valign:'middle', margin:0 });
      s.addText('PRASAD SEEDS INDONESIA', { x:1.15, y:0.44, w:5, h:0.24,
        fontSize:8, bold:true, color:C.white, charSpacing:3, valign:'middle', margin:0 });
      s.addText('Departemen Electrical', { x:1.15, y:0.67, w:5, h:0.2,
        fontSize:8, color:'7ddf6e', valign:'middle', margin:0 });

      // Judul utama
      s.addText('LAPORAN MONITORING', { x:0.5, y:1.5, w:9, h:0.55,
        fontSize:30, bold:true, color:C.white, align:'center', charSpacing:2, margin:0 });
      s.addText('MAINTENANCE ELECTRICAL', { x:0.5, y:2.0, w:9, h:0.55,
        fontSize:30, bold:true, color:'7ddf6e', align:'center', charSpacing:2, margin:0 });

      // Divider
      s.addShape(pres.shapes.RECTANGLE, {
        x:3.5, y:2.65, w:3, h:0.03, fill:{ color: C.green }, line:{ color: C.green }
      });

      // Periode
      s.addText('Periode: ' + rangeLabel, { x:0.5, y:2.85, w:9, h:0.35,
        fontSize:14, color:C.white, align:'center', margin:0 });

      // Info singkat
      s.addText([
        { text: `${d.totalSesi} Sesi  `, options:{ color:'7ddf6e', bold:true } },
        { text: '|  ', options:{ color:'rgba(255,255,255,0.4)' } },
        { text: `${d.totalOK} Normal  `, options:{ color:'7ddf6e' } },
        { text: '|  ', options:{ color:'rgba(255,255,255,0.4)' } },
        { text: `${d.totalWarn} Warning  `, options:{ color:'FFA64D', bold:true } },
        { text: '|  ', options:{ color:'rgba(255,255,255,0.4)' } },
        { text: `${d.totalAlert} Alert`, options:{ color:'FF7070', bold:true } },
      ], { x:0.5, y:3.3, w:9, h:0.3, fontSize:11, align:'center', margin:0 });

      // Signature area
      s.addShape(pres.shapes.RECTANGLE, {
        x:0.5, y:4.0, w:4, h:0.8,
        fill:{ color:'FFFFFF', transparency:92 }, line:{ color:'FFFFFF', transparency:75, width:0.5 }
      });
      s.addText([
        { text:'Dibuat Oleh\n', options:{ fontSize:7, color:'7A9AAA', breakLine:true } },
        { text:(author||'—'), options:{ fontSize:10, bold:true, color:C.white, breakLine:true } },
        { text:(position||''), options:{ fontSize:8, color:'A0C4A0' } },
      ], { x:0.6, y:4.05, w:3.8, h:0.7, valign:'middle', margin:0 });

      if (reviewer) {
        s.addShape(pres.shapes.RECTANGLE, {
          x:5.5, y:4.0, w:4, h:0.8,
          fill:{ color:'FFFFFF', transparency:92 }, line:{ color:'FFFFFF', transparency:75, width:0.5 }
        });
        s.addText([
          { text:'Diperiksa Oleh\n', options:{ fontSize:7, color:'7A9AAA', breakLine:true } },
          { text:reviewer, options:{ fontSize:10, bold:true, color:C.white, breakLine:true } },
          { text:(reviewPos||''), options:{ fontSize:8, color:'A0C4A0' } },
        ], { x:5.6, y:4.05, w:3.8, h:0.7, valign:'middle', margin:0 });
      }

      // Tanggal generate
      s.addText('Digenerate: ' + new Date().toLocaleDateString('id-ID', {
        weekday:'long', year:'numeric', month:'long', day:'numeric'
      }), { x:0.5, y:4.95, w:9, h:0.2,
        fontSize:7.5, color:'5A7A6A', align:'center', italic:true, margin:0 });
    }

    // ════════════════════════════════════════════════════════════
    // SLIDE 2 — KPI STATISTIK UTAMA
    // ════════════════════════════════════════════════════════════
    if (inclKPI) {
      const s = pres.addSlide();
      s.background = { color: C.offWhite };
      addContentHeader(s, 'Statistik Utama', `Ringkasan kegiatan monitoring periode ${rangeLabel}`);

      // 4 KPI besar — baris atas
      const kpis = [
        { num: d.totalSesi,  label:'Total Sesi\nMonitoring', color: C.blue,   bg:'E8F0FF' },
        { num: d.totalOK,    label:'Parameter\nNormal (OK)', color: C.green,  bg:'E8F5E9' },
        { num: d.totalWarn,  label:'Parameter\nWarning',     color: C.orange, bg:'FFF3E0' },
        { num: d.totalAlert, label:'Total Alert\n/ Alarm',   color: C.red,    bg:'FDE8E8' },
      ];
      kpis.forEach((k, i) => {
        addKPIBox(s, 0.25 + i*2.37, 0.85, 2.2, 1.5, k.num, k.label, k.color, k.bg);
      });

      // Bar chart native: OK / Warning / Alert per unit
      const unitNames = Object.keys(d.unitMap);
      if (unitNames.length > 0) {
        s.addText('Status Parameter per Unit', { x:0.3, y:2.5, w:5, h:0.25,
          fontSize:10, bold:true, color:C.navy, margin:0 });
        s.addChart(pres.charts.BAR, [
          { name:'OK',      labels:unitNames, values:unitNames.map(u=>d.unitMap[u].ok) },
          { name:'Warning', labels:unitNames, values:unitNames.map(u=>d.unitMap[u].warn) },
          { name:'Alert',   labels:unitNames, values:unitNames.map(u=>d.unitMap[u].alert) },
        ], {
          x:0.25, y:2.75, w:5.8, h:2.4,
          barDir:'col', barGrouping:'stacked',
          chartColors:[ C.green, C.orange, C.red ],
          chartArea:{ fill:{ color:C.white }, roundedCorners:false },
          catAxisLabelColor: C.text3,
          valAxisLabelColor: C.text3,
          valGridLine:{ color:'E0E8E0', size:0.5 },
          catGridLine:{ style:'none' },
          showLegend:true, legendPos:'b',
          legendFontSize:9,
          dataLabelFontSize:8,
        });
      }

      // Donut chart: distribusi status
      s.addText('Distribusi Status', { x:6.4, y:2.5, w:3.3, h:0.25,
        fontSize:10, bold:true, color:C.navy, margin:0 });
      s.addChart(pres.charts.DOUGHNUT, [{
        name:'Status',
        labels:['Normal/OK','Warning','Alert','Pending'],
        values:[d.totalOK, d.totalWarn, d.totalAlert,
          Math.max(0, (d.filtered.flatMap(s=>s.items||[]).length) - d.totalOK - d.totalWarn - d.totalAlert)]
      }], {
        x:6.2, y:2.75, w:3.5, h:2.4,
        chartColors:[ C.green, C.orange, C.red, C.text3 ],
        chartArea:{ fill:{ color:C.white } },
        showPercent:true,
        showLegend:true, legendPos:'b', legendFontSize:9,
        holeSize:50,
        dataLabelFontSize:9,
      });
    }

    // ════════════════════════════════════════════════════════════
    // SLIDE 3 — STATUS PER UNIT & AREA
    // ════════════════════════════════════════════════════════════
    if (inclUnit) {
      const unitEntries = Object.entries(d.unitMap);
      // Satu slide per unit
      unitEntries.forEach(([uName, u]) => {
        const s = pres.addSlide();
        s.background = { color: C.offWhite };
        addContentHeader(s, `Status Unit: ${uName}`, `Detail OK / Warning / Alert per Area`);

        const areaEntries = Object.entries(u.areas);

        // Table header
        const headerRow = [
          { text:'Area', options:{ bold:true, color:C.white, fill:{ color:C.navy }, fontSize:9 } },
          { text:'Sesi',    options:{ bold:true, color:C.white, fill:{ color:C.navy }, fontSize:9, align:'center' } },
          { text:'OK',      options:{ bold:true, color:C.white, fill:{ color:C.green }, fontSize:9, align:'center' } },
          { text:'Warning', options:{ bold:true, color:C.white, fill:{ color:C.orange }, fontSize:9, align:'center' } },
          { text:'Alert',   options:{ bold:true, color:C.white, fill:{ color:C.red }, fontSize:9, align:'center' } },
          { text:'Status',  options:{ bold:true, color:C.white, fill:{ color:C.navy }, fontSize:9, align:'center' } },
        ];

        const dataRows = areaEntries.map(([aName, a]) => {
          const hasAlert = a.alert > 0;
          const hasWarn  = a.warn  > 0;
          const stLabel  = hasAlert ? 'ALERT' : hasWarn ? 'WARNING' : 'NORMAL';
          const stColor  = hasAlert ? C.red   : hasWarn ? C.orange  : C.green;
          return [
            { text:aName,            options:{ fontSize:9, color:C.text } },
            { text:String(a.sesi),   options:{ fontSize:9, align:'center', color:C.text2 } },
            { text:String(a.ok),     options:{ fontSize:9, bold:!!a.ok,    align:'center', color:C.green } },
            { text:String(a.warn),   options:{ fontSize:9, bold:!!a.warn,  align:'center', color:C.orange } },
            { text:String(a.alert),  options:{ fontSize:9, bold:!!a.alert, align:'center', color:C.red } },
            { text:stLabel,          options:{ fontSize:8, bold:true, align:'center', color:stColor } },
          ];
        });

        const tableData = [headerRow, ...dataRows];
        const rowH = Math.min(0.32, 3.8 / Math.max(tableData.length, 1));
        s.addTable(tableData, {
          x:0.3, y:0.85, w:9.4, h:Math.min(4.0, tableData.length * rowH + 0.05),
          colW:[3.5, 0.9, 1.0, 1.0, 1.0, 2.0],
          rowH: rowH,
          border:{ pt:0.5, color:C.border },
          autoPage:false,
        });

        // Mini summary bar bawah
        const total = u.ok + u.warn + u.alert;
        if (total > 0) {
          s.addText(`Total: ${u.sesi} sesi · ${u.ok} OK · ${u.warn} Warning · ${u.alert} Alert`, {
            x:0.3, y:5.1, w:9.4, h:0.2,
            fontSize:8, color:C.text3, italic:true, margin:0
          });
        }
      });
    }

    // ════════════════════════════════════════════════════════════
    // SLIDE 4 — TOP 5 EQUIPMENT BERMASALAH
    // ════════════════════════════════════════════════════════════
    if (inclTop5) {
      const s = pres.addSlide();
      s.background = { color: C.offWhite };
      addContentHeader(s, 'Top 5 Equipment Bermasalah', 'Equipment dengan Alert & Warning terbanyak dalam periode ini');

      // Kolom kiri: Top 5 Alert
      s.addShape(pres.shapes.RECTANGLE, {
        x:0.25, y:0.85, w:4.6, h:0.3,
        fill:{ color:'FDE8E8' }, line:{ color:C.red, width:1 }
      });
      s.addText('🔴  TOP 5 EQUIPMENT — PALING SERING ALERT', {
        x:0.3, y:0.85, w:4.5, h:0.3,
        fontSize:8, bold:true, color:C.red, valign:'middle', margin:0
      });

      const maxAlert = d.top5Alert[0]?.[1] || 1;
      d.top5Alert.forEach(([key, cnt], i) => {
        const m   = d.eqMetaMap[key] || { name:key, unit:'', area:'' };
        const pct = Math.round(cnt/maxAlert*100);
        const y   = 1.25 + i*0.77;
        const rank= ['①','②','③','④','⑤'][i];
        const rc  = i===0?'B8860B':i===1?'888888':i===2?'8B4513':'999999';
        // Rank circle
        s.addShape(pres.shapes.OVAL, { x:0.3, y:y+0.05, w:0.28, h:0.28, fill:{ color:i===0?'FFD700':i===1?'E0E0E0':i===2?'CD8C4A':'CCCCCC' }, line:{ color:'CCCCCC' }});
        s.addText(String(i+1), { x:0.3, y:y+0.05, w:0.28, h:0.28, fontSize:8, bold:true, color:rc, align:'center', valign:'middle', margin:0 });
        // Name
        const nameShort = m.name.length>28 ? m.name.slice(0,25)+'...' : m.name;
        s.addText(nameShort, { x:0.65, y:y, w:3.6, h:0.22, fontSize:9, bold:true, color:C.text, margin:0 });
        s.addText(`${m.unit} · ${m.area}`, { x:0.65, y:y+0.2, w:3.6, h:0.18, fontSize:7.5, color:C.text3, margin:0 });
        // Bar
        addProgressBar(s, 0.65, y+0.42, 3.2, 0.14, pct, C.red);
        s.addText(`${cnt}×`, { x:3.9, y:y+0.37, w:0.65, h:0.22, fontSize:9, bold:true, color:C.red, align:'right', margin:0 });
      });

      if (!d.top5Alert.length) {
        s.addText('✅  Tidak ada data Alert dalam periode ini', {
          x:0.3, y:2.5, w:4.5, h:0.4, fontSize:10, color:C.green, align:'center', margin:0
        });
      }

      // Kolom kanan: Top 5 Warning
      s.addShape(pres.shapes.RECTANGLE, {
        x:5.15, y:0.85, w:4.6, h:0.3,
        fill:{ color:'FFF3E0' }, line:{ color:C.orange, width:1 }
      });
      s.addText('🟠  TOP 5 EQUIPMENT — PALING SERING WARNING', {
        x:5.2, y:0.85, w:4.5, h:0.3,
        fontSize:8, bold:true, color:C.orange, valign:'middle', margin:0
      });

      const maxWarn = d.top5Warn[0]?.[1] || 1;
      d.top5Warn.forEach(([key, cnt], i) => {
        const m   = d.eqMetaMap[key] || { name:key, unit:'', area:'' };
        const pct = Math.round(cnt/maxWarn*100);
        const y   = 1.25 + i*0.77;
        const rc  = i===0?'B8860B':i===1?'888888':i===2?'8B4513':'999999';
        s.addShape(pres.shapes.OVAL, { x:5.2, y:y+0.05, w:0.28, h:0.28, fill:{ color:i===0?'FFD700':i===1?'E0E0E0':i===2?'CD8C4A':'CCCCCC' }, line:{ color:'CCCCCC' }});
        s.addText(String(i+1), { x:5.2, y:y+0.05, w:0.28, h:0.28, fontSize:8, bold:true, color:rc, align:'center', valign:'middle', margin:0 });
        const nameShort = m.name.length>28 ? m.name.slice(0,25)+'...' : m.name;
        s.addText(nameShort, { x:5.55, y:y, w:3.6, h:0.22, fontSize:9, bold:true, color:C.text, margin:0 });
        s.addText(`${m.unit} · ${m.area}`, { x:5.55, y:y+0.2, w:3.6, h:0.18, fontSize:7.5, color:C.text3, margin:0 });
        addProgressBar(s, 5.55, y+0.42, 3.2, 0.14, pct, C.orange);
        s.addText(`${cnt}×`, { x:8.8, y:y+0.37, w:0.65, h:0.22, fontSize:9, bold:true, color:C.orange, align:'right', margin:0 });
      });

      if (!d.top5Warn.length) {
        s.addText('✅  Tidak ada data Warning dalam periode ini', {
          x:5.2, y:2.5, w:4.5, h:0.4, fontSize:10, color:C.green, align:'center', margin:0
        });
      }

      // Divider vertikal
      s.addShape(pres.shapes.LINE, {
        x:5.0, y:0.85, w:0, h:4.3, line:{ color:C.border, width:1, dashType:'dash' }
      });
    }

    // ════════════════════════════════════════════════════════════
    // SLIDE 5 — FINDING & ALARM (tabel)
    // ════════════════════════════════════════════════════════════
    if (inclFinding && d.periodFindings.length > 0) {
      const s = pres.addSlide();
      s.background = { color: C.offWhite };
      addContentHeader(s, 'Daftar Finding & Alarm Aktif',
        `${d.periodFindings.length} temuan dalam periode ${rangeLabel}`);

      const hdr = [
        { text:'Tanggal',   options:{ bold:true, color:C.white, fill:{ color:C.navy }, fontSize:8 } },
        { text:'Unit/Area', options:{ bold:true, color:C.white, fill:{ color:C.navy }, fontSize:8 } },
        { text:'Equipment', options:{ bold:true, color:C.white, fill:{ color:C.navy }, fontSize:8 } },
        { text:'Parameter', options:{ bold:true, color:C.white, fill:{ color:C.navy }, fontSize:8 } },
        { text:'Nilai',     options:{ bold:true, color:C.white, fill:{ color:C.navy }, fontSize:8, align:'center' } },
        { text:'Status',    options:{ bold:true, color:C.white, fill:{ color:C.navy }, fontSize:8, align:'center' } },
      ];

      const rows = d.periodFindings.slice(0, 14).map(f => {
        const stColor = f.status==='ALERT' ? C.red : C.orange;
        return [
          { text:formatDateID(f.tanggal), options:{ fontSize:8, color:C.text3 } },
          { text:`${f.unit}\n${f.area}`,  options:{ fontSize:7.5, color:C.text2 } },
          { text:f.equipment,             options:{ fontSize:8,   bold:true,  color:C.text } },
          { text:f.parameter,             options:{ fontSize:8,   color:C.text2 } },
          { text:`${f.value} ${f.unit_param||''}`, options:{ fontSize:8, bold:true, align:'center', color:stColor } },
          { text:f.status,                options:{ fontSize:8, bold:true, align:'center', color:stColor } },
        ];
      });

      s.addTable([hdr, ...rows], {
        x:0.25, y:0.85, w:9.5, h:4.5,
        colW:[1.2, 1.6, 2.0, 2.1, 1.4, 1.2],
        rowH:0.29,
        border:{ pt:0.5, color:C.border },
        autoPage:false,
      });

      if (d.periodFindings.length > 14) {
        s.addText(`... dan ${d.periodFindings.length - 14} temuan lainnya. Lihat detail di Monitoring System.`, {
          x:0.3, y:5.1, w:9.4, h:0.2,
          fontSize:8, color:C.text3, italic:true, margin:0
        });
      }
    } else if (inclFinding) {
      const s = pres.addSlide();
      s.background = { color: C.offWhite };
      addContentHeader(s, 'Daftar Finding & Alarm', `Periode ${rangeLabel}`);
      s.addShape(pres.shapes.OVAL, { x:4.25, y:1.5, w:1.5, h:1.5, fill:{ color:'E8F5E9' }, line:{ color:C.green } });
      s.addText('✅', { x:4.25, y:1.5, w:1.5, h:1.5, fontSize:36, align:'center', valign:'middle', margin:0 });
      s.addText('Tidak Ada Finding Aktif', { x:2, y:3.2, w:6, h:0.4, fontSize:16, bold:true, color:C.green, align:'center', margin:0 });
      s.addText('Semua parameter dalam kondisi normal pada periode ini.', { x:2, y:3.65, w:6, h:0.3, fontSize:10, color:C.text3, align:'center', margin:0 });
    }

    // ════════════════════════════════════════════════════════════
    // SLIDE 6 — AKTIVITAS PIC / TEKNISI
    // ════════════════════════════════════════════════════════════
    if (inclPIC) {
      const s = pres.addSlide();
      s.background = { color: C.offWhite };
      addContentHeader(s, 'Aktivitas PIC / Teknisi', `Partisipasi monitoring periode ${rangeLabel}`);

      const picEntries = Object.entries(d.picMap).sort((a,b)=>b[1]-a[1]);
      const maxCnt = picEntries[0]?.[1] || 1;
      const avatarColors = [C.blue, C.green, C.orange, C.red, C.purple, C.cyan];

      if (picEntries.length === 0) {
        s.addText('Belum ada data PIC.', { x:3, y:3, w:4, h:0.5, fontSize:12, color:C.text3, align:'center', margin:0 });
      } else {
        // Bar chart native
        s.addChart(pres.charts.BAR, [{
          name:'Sesi Monitoring',
          labels: picEntries.map(([p]) => p),
          values: picEntries.map(([,v]) => v),
        }], {
          x:0.25, y:0.85, w:5.8, h:4.35,
          barDir:'bar',
          chartColors: picEntries.map((_, i) => avatarColors[i % avatarColors.length]),
          chartArea:{ fill:{ color:C.white }, roundedCorners:false },
          catAxisLabelColor: C.text,
          valAxisLabelColor: C.text3,
          valGridLine:{ color:'E0E8E0', size:0.5 },
          catGridLine:{ style:'none' },
          showValue:true, dataLabelColor:C.text, dataLabelFontSize:9,
          showLegend:false,
        });

        // Summary cards kanan
        s.addText('Ringkasan Kontribusi', { x:6.3, y:0.9, w:3.4, h:0.25,
          fontSize:9, bold:true, color:C.navy, margin:0 });
        picEntries.slice(0,6).forEach(([pic, cnt], i) => {
          const y = 1.25 + i*0.6;
          const col = avatarColors[i % avatarColors.length];
          const pct = Math.round(cnt/maxCnt*100);
          // Avatar circle
          s.addShape(pres.shapes.OVAL, { x:6.3, y:y, w:0.35, h:0.35, fill:{ color:col }, line:{ color:col }});
          s.addText((pic[0]||'?').toUpperCase(), { x:6.3, y:y, w:0.35, h:0.35, fontSize:9, bold:true, color:C.white, align:'center', valign:'middle', margin:0 });
          // Name
          const nameShort = pic.length>18 ? pic.slice(0,16)+'...' : pic;
          s.addText(nameShort, { x:6.72, y:y, w:3.0, h:0.2, fontSize:9, bold:true, color:C.text, margin:0 });
          s.addText(`${cnt} sesi`, { x:6.72, y:y+0.2, w:3.0, h:0.16, fontSize:7.5, color:C.text3, margin:0 });
          // Mini bar
          addProgressBar(s, 6.72, y+0.38, 2.8, 0.1, pct, col);
        });
      }
    }

    // ════════════════════════════════════════════════════════════
    // SLIDE 7 — TREN MONITORING
    // ════════════════════════════════════════════════════════════
    if (inclTrend) {
      const s = pres.addSlide();
      s.background = { color: C.offWhite };
      addContentHeader(s, 'Tren Monitoring', '7 hari terakhir dalam periode ini');

      // Line chart tren
      s.addChart(pres.charts.LINE, [{
        name:'Sesi per Hari',
        labels: d.trendDays,
        values: d.trendCounts,
      }], {
        x:0.25, y:0.85, w:9.5, h:3.5,
        lineSize:2.5, lineSmooth:true,
        chartColors:[ C.blue ],
        chartArea:{ fill:{ color:C.white }, roundedCorners:false },
        catAxisLabelColor: C.text3,
        valAxisLabelColor: C.text3,
        valGridLine:{ color:'E0E8E0', size:0.5 },
        catGridLine:{ style:'none' },
        showValue:true, dataLabelColor:C.blue, dataLabelFontSize:9,
        showLegend:false,
      });

      // Stats summary bawah
      const avgSesi = d.trendCounts.reduce((a,b)=>a+b,0) / Math.max(d.trendCounts.length,1);
      const maxSesi = Math.max(...d.trendCounts, 0);
      const activeDays = d.trendCounts.filter(v=>v>0).length;

      [
        { num:activeDays,        label:'Hari Aktif',    color:C.blue },
        { num:maxSesi,           label:'Sesi Terbanyak',color:C.green },
        { num:avgSesi.toFixed(1),label:'Rata-rata/Hari', color:C.orange },
        { num:d.totalSesi,       label:'Total Sesi',    color:C.navy },
      ].forEach((k, i) => {
        addKPIBox(s, 0.25 + i*2.37, 4.55, 2.2, 0.85, k.num, k.label, k.color, C.white);
      });
    }

    if (inclRekom) {
      const s = pres.addSlide();
      s.background = { color: C.offWhite };
      addContentHeader(s, 'Rekomendasi Tindak Lanjut', 'Prioritas berdasarkan analisis temuan periode ini');

      if (d.rekomendasi.length === 0) {
        // Kondisi baik — full green slide
        s.addShape(pres.shapes.OVAL, { x:3.75, y:1.2, w:2.5, h:2.5, fill:{ color:'E8F5E9' }, line:{ color:C.green, width:2 }});
        s.addText('✅', { x:3.75, y:1.2, w:2.5, h:2.5, fontSize:60, align:'center', valign:'middle', margin:0 });
        s.addText('Kondisi Baik — Tidak Ada Rekomendasi Mendesak', {
          x:1, y:3.9, w:8, h:0.45, fontSize:15, bold:true, color:C.green, align:'center', margin:0 });
        s.addText('Semua unit dan area dalam kondisi normal. Pertahankan rutinitas monitoring sesuai jadwal.', {
          x:1, y:4.4, w:8, h:0.35, fontSize:10, color:C.text3, align:'center', margin:0 });
      } else {
        const rekoms = d.rekomendasi.slice(0, 7);
        rekoms.forEach((r, i) => {
          const y = 0.85 + i * 0.63;
          const isSegera = r.level === 'SEGERA';
          const borderCol = isSegera ? C.red : C.orange;
          const bgCol     = isSegera ? 'FDE8E8' : 'FFF3E0';
          const icon      = isSegera ? '🔴' : '🟠';
          const levelText = isSegera ? 'ACTION REQUIRED' : 'PERLU MONITOR';
          const levelCol  = isSegera ? C.red : C.orange;

          // Card background
          s.addShape(pres.shapes.RECTANGLE, {
            x:0.25, y, w:9.5, h:0.56,
            fill:{ color:bgCol }, line:{ color:borderCol, width:1 }
          });
          // Left accent
          s.addShape(pres.shapes.RECTANGLE, {
            x:0.25, y, w:0.06, h:0.56,
            fill:{ color:borderCol }, line:{ color:borderCol }
          });
          // Icon
          s.addText(icon, { x:0.4, y:y+0.05, w:0.35, h:0.46, fontSize:16, align:'center', valign:'middle', margin:0 });
          // Equipment name
          const eqShort = r.equip.length>40 ? r.equip.slice(0,38)+'...' : r.equip;
          s.addText(eqShort, { x:0.82, y:y+0.04, w:6.0, h:0.25, fontSize:10, bold:true, color:C.text, margin:0 });
          s.addText(`${r.unit} · ${r.equip === r.unit ? '' : r.equip}  —  ${r.reason}`, {
            x:0.82, y:y+0.28, w:6.5, h:0.2, fontSize:7.5, color:C.text3, margin:0
          });
          // Level badge
          s.addShape(pres.shapes.RECTANGLE, {
            x:8.2, y:y+0.12, w:1.5, h:0.32,
            fill:{ color:bgCol }, line:{ color:borderCol, width:1 }
          });
          s.addText(levelText, {
            x:8.2, y:y+0.12, w:1.5, h:0.32,
            fontSize:7.5, bold:true, color:levelCol, align:'center', valign:'middle', margin:0
          });
        });

        if (d.rekomendasi.length > 7) {
          s.addText(`...dan ${d.rekomendasi.length-7} rekomendasi lainnya.`, {
            x:0.3, y:5.1, w:9.4, h:0.2,
            fontSize:8, color:C.text3, italic:true, margin:0
          });
        }
      }
    }

    const sc = pres.addSlide();
    sc.background = { color: C.navy };
    // Decorative
    sc.addShape(pres.shapes.OVAL, {
      x:7.5, y:-0.5, w:4, h:4,
      fill:{ color:C.green, transparency:85 }, line:{ color:C.green, transparency:85 }
    });
    sc.addShape(pres.shapes.RECTANGLE, {
      x:0, y:0, w:10, h:0.06, fill:{ color:C.green }, line:{ color:C.green }
    });
    sc.addShape(pres.shapes.RECTANGLE, {
      x:0, y:5.565, w:10, h:0.06, fill:{ color:C.green }, line:{ color:C.green }
    });
    sc.addText('Terima Kasih', { x:0.5, y:1.5, w:9, h:0.7,
      fontSize:38, bold:true, color:C.white, align:'center', margin:0 });
    sc.addText('Atas dedikasi tim Monitoring Electrical Prasad Seeds', {
      x:0.5, y:2.3, w:9, h:0.35, fontSize:13, color:'7ddf6e', align:'center', italic:true, margin:0 });
    sc.addShape(pres.shapes.RECTANGLE, {
      x:3.5, y:2.8, w:3, h:0.03, fill:{ color:C.green }, line:{ color:C.green }
    });
    sc.addText(`Laporan Monitoring · ${rangeLabel}`, {
      x:0.5, y:3.05, w:9, h:0.3, fontSize:11, color:C.white, align:'center', margin:0 });
    sc.addText('Prasad Seeds Indonesia — Departemen Electrical — Monitoring System v5', {
      x:0.5, y:4.85, w:9, h:0.25, fontSize:8, color:'5A7A6A', align:'center', margin:0 });

    // ── DOWNLOAD ──────────────────────────────────────────────
    setStatus('⬇ Menyiapkan file PPTX untuk download...', 'info');
    const fileName = `Laporan_Monitoring_${from}_sd_${to}.pptx`;
    await pres.writeFile({ fileName });

    setStatus(`✅ Berhasil! File "${fileName}" sedang diunduh.`, 'success');
    if (btn) { btn.disabled = false; btn.textContent = '📊 Generate & Download PPTX'; }
    toast(`✅ PPTX "${fileName}" berhasil didownload!`, 'success', 5000);

  } catch(err) {
    console.error('[PPT Generator]', err);
    setStatus('✗ Gagal generate PPT: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '📊 Generate & Download PPTX'; }
    toast('✗ Gagal generate PPT: ' + err.message, 'error', 5000);
  }
}
// ═══ END PPT GENERATOR ═══════════════════════════════════════════════
