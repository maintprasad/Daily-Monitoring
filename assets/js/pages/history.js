'use strict';

// ═══════════════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════════════
function renderHistory() {
  const q    = (document.getElementById('hSearch')?.value  || '').toLowerCase();
  const from = document.getElementById('hDateFrom')?.value || '';
  const to   = document.getElementById('hDateTo')?.value   || '';
  const unit = document.getElementById('hUnit')?.value     || '';
  const st   = document.getElementById('hStatus')?.value   || '';

  let data = [...sessions].sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0));
  if (q)    data = data.filter(s => JSON.stringify(s).toLowerCase().includes(q));
  if (from) data = data.filter(s => (s.tanggal||'') >= from);
  if (to)   data = data.filter(s => (s.tanggal||'') <= to);
  if (unit) data = data.filter(s => s.unitId === unit);
  if (st)   data = data.filter(s => sessStatus(s) === st);

  const total = data.length;
  const pages = Math.max(1, Math.ceil(total / HIST_PAGE_SIZE));
  if (histPage > pages) histPage = pages;
  const start = (histPage - 1) * HIST_PAGE_SIZE;
  const slice = data.slice(start, start + HIST_PAGE_SIZE);

  setText('histCountLbl', total + ' sesi ditemukan');
  setText('histPageInfo', total ? (start+1) + '–' + Math.min(start+HIST_PAGE_SIZE,total) + ' dari ' + total : '0');
  document.getElementById('hPrevBtn').disabled = histPage <= 1;
  document.getElementById('hNextBtn').disabled = histPage >= pages;

  const tbody = document.getElementById('histBody');
  if (!slice.length) {
    tbody.innerHTML = `<tr><td colspan="11"><div class="empty"><div class="empty-ico">📋</div><div class="empty-msg">Tidak ada riwayat ditemukan.</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML = slice.map(s => histRow(s)).join('');
}

function histRow(s) {
  const st         = sessStatus(s);
  const corruptC   = (s.items||[]).filter(i => isValueCorrupt(i.value)).length;
  const rowStyle   = corruptC > 0 ? 'style="background:rgba(192,57,43,.04)"' : '';
  return `<tr ${rowStyle}>
    <td style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--green)">${esc(s.id)}</td>
    <td style="font-size:11px;white-space:nowrap">${fmtDate(s.tanggal)}</td>
    <td><span class="badge b-blue">${esc(s.unitName||'—')}</span></td>
    <td style="font-size:11px">${esc(s.areaName||'—')}</td>
    <td style="font-size:12px;font-weight:500">${esc(s.equipName||'—')}</td>
    <td style="font-size:11px">${esc(s.pic||'—')}</td>
    <td style="font-family:'IBM Plex Mono',monospace;font-size:10px">${esc(s.startTime||'—')}</td>
    <td style="font-family:'IBM Plex Mono',monospace;font-size:10px">${esc(s.endTime||'—')}</td>
    <td>
      <span class="badge ${stBadge(st)}">${st}</span>
      ${corruptC > 0 ? `<span class="badge" style="margin-left:3px;background:var(--red-dim);color:var(--red);border:1px solid rgba(192,57,43,.25);font-size:9px" title="${corruptC} nilai corrupt">⚠ ${corruptC}</span>` : ''}
    </td>
    <td style="font-size:11px;color:var(--text3);max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(s.catatan||'')}">${esc(s.catatan||'—')}</td>
    <td>
      <div style="display:flex;gap:4px">
        <button class="tbl-btn" onclick="viewSession('${esc(s.id)}')">👁</button>
        <button class="tbl-btn" style="color:var(--orange)" onclick="openChecklistModal('${esc(s.id)}','','','','')">📋</button>
        <button class="tbl-btn" style="color:var(--red)" onclick="deleteSession('${esc(s.id)}')">🗑</button>
      </div>
    </td>
  </tr>`;
}

function changeHistPage(d) { histPage += d; renderHistory(); }
function resetHistFilters() {
  ['hSearch','hDateFrom','hDateTo','hUnit','hStatus'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  renderHistory();
}
