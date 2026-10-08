'use strict';

// ═══════════════════════════════════════════════════════
// DATA MODEL
// ═══════════════════════════════════════════════════════
/*
  hierarchy: {
    units: [
      {
        id, name, desc,
        areas: [
          {
            id, name,
            subAreas: [
              {
                id, name,
                equipments: [
                  {
                    id, name, tag,
                    params: [
                      { id, label, unit, section, type, normalMin, normalMax, warnMin, warnMax, options }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }

  sessions: [
    {
      id, tanggal, unitId, unitName, areaId, areaName,
      subAreaId, subAreaName, equipId, equipName,
      pic, startTime, endTime, catatan, tindakan,
      createdAt, updatedAt,
      items: [
        { paramId, label, unit, section, value, status, note }
      ]
    }
  ]

  picList: ['NAMA1', 'NAMA2', ...]
*/

// ═══════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════
let hierarchy = { units: [] };
let sessions  = [];
let PIC_LIST  = [];
let histPage  = 1;
const HIST_PAGE_SIZE = 20;

// ADD START: Findings state & Equipment Type Templates
let findings    = [];
let workOrders  = [];
let rcaReports  = [];   // Root Cause Analysis — penutupan finding (lihat features/rca.js)
let repairs     = [];   // Laporan perbaikan oleh crew sebelum cek ulang (lihat features/repair.js)
let monitoringWos = []; // WO Monitoring: temuan yang di-skip crew saat "Monitoring Lagi" (lihat features/monitoring-wo.js)

// Param editor temp
let _editingEquipPath = null; // { unitId, areaId, subAreaId, equipId }
let _editingParams    = [];
let _ctx = {
  editingUnit : null,
  addAreaUnit : null,
  addSAUnit   : null,
  addSAArea   : null,
  addEqUnit   : null,
  addEqArea   : null,
  addEqSA     : null,
};

// User yang sedang login: { username, name, role, active }
let currentUser = null;

// API MaintWare (Google Apps Script terpisah) — dipakai untuk Work Order & sinkron ID hierarki.
// Data monitoring sendiri sekarang disimpan di database (lihat data/store.js).
const WO_API_URL    = 'https://script.google.com/macros/s/AKfycbz8fxSTFIGqCmpMwbPGKgr36_aAP0b8_3EpzaoPkGgHW6obmZS_j8IGhuERCnUySRWTpA/exec';
const MAINTWARE_KEY = 'prasad2024';
