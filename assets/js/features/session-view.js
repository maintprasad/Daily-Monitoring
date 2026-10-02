'use strict';

// ═══════════════════════════════════════════════════════
// VIEW SESSION
// ═══════════════════════════════════════════════════════
function viewSession(sessId) {
  const sess = sessions.find(s => s.id === sessId);
  if (!sess) return;
  const st = sessStatus(sess);
  const okC = (sess.items||[]).filter(i=>i.status==='OK').length;
  const wC  = (sess.items||[]).filter(i=>i.status==='WARNING').length;
  const aC  = (sess.items||[]).filter(i=>i.status==='ALERT').length;

  // Group items by section
  const groups = {};
  (sess.items||[]).forEach(i => {
    const sec = i.section || 'Umum';
    if (!groups[sec]) groups[sec] = [];
    groups[sec].push(i);
  });

  let itemsHtml = '';
  Object.entries(groups).forEach(([sec, items]) => {
    itemsHtml += `<div class="section-group" style="margin-bottom:12px">
      <div class="section-group-hdr" style="font-size:10px;background:var(--bg3);color:var(--text3)">📌 ${esc(sec)}</div>
      <div class="tbl-scroll"><table class="chk-table">
        <thead><tr><th>Parameter</th><th>Nilai</th><th>Satuan</th><th>Status</th><th>Catatan</th></tr></thead>
        <tbody>
          ${items.map(i => {
            const cls      = i.status==='OK'?'b-ok':i.status==='WARNING'?'b-warn':i.status==='ALERT'?'b-alert':'b-gray';
            const corrupt  = isValueCorrupt(i.value);
            const dispVal  = sanitizeDisplayValue(i.value);
            const valStyle = corrupt ? 'color:var(--red);font-family:\'IBM Plex Mono\',monospace;font-weight:600' : 'font-family:\'IBM Plex Mono\',monospace;font-weight:600';
            return `<tr><td>${esc(i.label||i.paramId)}</td>
              <td style="${valStyle}">${esc(dispVal)}${corrupt?` <span style="font-size:9px;font-weight:400" title="${esc(String(i.value).slice(0,60))}">⚠</span>`:''}</td>
              <td style="color:var(--text3);font-size:10px">${esc(i.unit||'')}</td>
              <td><span class="badge ${cls}">${esc(i.status||'—')}</span></td>
              <td style="font-size:11px;color:var(--text3)">${esc(i.note||'—')}</td></tr>`;
          }).join('')}
        </tbody>
      </table></div>
    </div>`;
  });

  document.getElementById('viewSessTitle').textContent = sess.id;
  document.getElementById('viewSessBody').innerHTML = `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
      <span class="badge ${stBadge(st)}" style="font-size:12px;padding:4px 12px">${st}</span>
      <span class="badge b-blue">${esc(sess.unitName)}</span>
      <span class="badge b-gray">${esc(sess.areaName)}</span>
      <span class="badge b-gray">${esc(sess.subAreaName)}</span>
    </div>
    <div class="detail-grid">
      <div class="detail-item"><div class="dl">Tanggal</div><div class="dv">${fmtDate(sess.tanggal)}</div></div>
      <div class="detail-item"><div class="dl">Equipment</div><div class="dv">${esc(sess.equipName||'—')}</div></div>
      <div class="detail-item"><div class="dl">Waktu Monitoring</div><div class="dv" style="font-family:'IBM Plex Mono',monospace">${esc(sess.startTime||'—')} – ${esc(sess.endTime||'...')}</div></div>
      <div class="detail-item"><div class="dl">PIC</div><div class="dv">${esc(sess.pic||'—')}</div></div>
      <div class="detail-item"><div class="dl">Hasil Parameter</div><div class="dv">
        <span class="badge b-ok">✓ ${okC}</span>&nbsp;
        <span class="badge b-warn">⚠ ${wC}</span>&nbsp;
        <span class="badge b-alert">✗ ${aC}</span>
      </div></div>
      <div class="detail-item"><div class="dl">Dibuat</div><div class="dv" style="font-size:11px">${esc(sess.createdAt||'—')}</div></div>
      ${sess.catatan ? `<div class="detail-item full"><div class="dl">Catatan</div><div class="dv" style="white-space:pre-wrap">${esc(sess.catatan)}</div></div>` : ''}
      ${sess.tindakan ? `<div class="detail-item full"><div class="dl">Tindakan</div><div class="dv" style="white-space:pre-wrap">${esc(sess.tindakan)}</div></div>` : ''}
    </div>
    ${itemsHtml || `<div style="color:var(--text3);font-size:12px;padding:8px">Belum ada data parameter.</div>`}
    <div class="form-actions">
      <button class="btn btn-ghost" onclick="closeOverlay('viewSessionOverlay')">Tutup</button>
      <button class="btn btn-primary" onclick="closeOverlay('viewSessionOverlay');openChecklistModal('${esc(sess.id)}','','','','')">📋 Edit Checklist</button>
    </div>`;
  openOverlay('viewSessionOverlay');
}

function deleteSession(sessId) {
  if (!confirm('Hapus sesi ' + sessId + '? Tidak bisa dibatalkan.')) return;
  sessions = sessions.filter(s => s.id !== sessId);
  saveAll(); renderAll();
  flushChanges().then(ok => toast(ok ? 'Sesi dihapus dari database ✓' : 'Sesi dihapus lokal — dikirim ke database saat online', ok ? 'success' : 'info'));
}
