'use strict';

// ═══════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════
function exportCSV() {
  if (!sessions.length) { toast('Tidak ada data untuk diekspor','error'); return; }
  const rows = [];
  const hdr  = ['ID','Tanggal','Unit','Area','Equipment','PIC','Mulai','Selesai',
                 'Status','Catatan','Tindakan','Parameter','Nilai','Satuan','Status_Param','Note_Param'];
  rows.push(hdr.join(','));

  sessions.forEach(s => {
    const st = sessStatus(s);
    const base = [s.id, s.tanggal, s.unitName, s.areaName, s.equipName,
                  s.pic, s.startTime, s.endTime, st, s.catatan, s.tindakan];
    const items = s.items || [];
    if (!items.length) {
      rows.push(base.map(v => '"' + String(v||'').replace(/"/g,'""') + '"').concat(['','','','']).join(','));
    } else {
      items.forEach(i => {
        rows.push([...base, i.label, i.value, i.unit, i.status, i.note]
          .map(v => '"' + String(v||'').replace(/"/g,'""') + '"').join(','));
      });
    }
  });

  const csv = '\uFEFF' + rows.join('\n');
  const url  = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  const a    = Object.assign(document.createElement('a'), { href:url, download:`Monitoring_${todayISO()}.csv` });
  a.click(); URL.revokeObjectURL(url);
  toast('CSV diekspor ✓', 'success');
}
