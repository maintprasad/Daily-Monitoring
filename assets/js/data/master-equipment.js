'use strict';

// ═══════════════════════════════════════════════════════
// MASTER EQUIPMENT MAP — hardcoded dari List_Equipment.ods
// ID unit, area, equipment sudah fix dan sinkron dengan MaintWare Sheets
// ═══════════════════════════════════════════════════════
const MASTER_UNITS = {
  'Unit 1': { id: 'U-001' },
  'Unit 2': { id: 'U-002' },
};

// area id hardcoded sesuai Sheets
const MASTER_AREAS = {
  // Unit 1
  'U-001_A-001': { id: 'A-001', name: 'CTP 1',                unitId: 'U-001' },
  'U-001_A-002': { id: 'A-002', name: 'CTP 2',                unitId: 'U-001' },
  'U-001_A-003': { id: 'A-003', name: 'Petkus',               unitId: 'U-001' },
  'U-001_A-004': { id: 'A-004', name: 'Peanut',               unitId: 'U-001' },
  'U-001_A-005': { id: 'A-005', name: 'Prairie',              unitId: 'U-001' },
  'U-001_A-006': { id: 'A-006', name: 'Mini Chamber',         unitId: 'U-001' },
  'U-001_A-008': { id: 'A-008', name: 'Utility & Electrical', unitId: 'U-001' },
  // Unit 2
  'U-002_A-009': { id: 'A-009', name: 'CTP 1',                unitId: 'U-002' },
  'U-002_A-010': { id: 'A-010', name: 'CTP 2',                unitId: 'U-002' },
  'U-002_A-011': { id: 'A-011', name: 'SPR Drier',            unitId: 'U-002' },
  'U-002_A-012': { id: 'A-012', name: 'PS Drier',             unitId: 'U-002' },
  'U-002_A-013': { id: 'A-013', name: 'Peanut',               unitId: 'U-002' },
  'U-002_A-014': { id: 'A-014', name: 'Cold Storage',         unitId: 'U-002' },
  'U-002_A-015': { id: 'A-015', name: 'Utility',              unitId: 'U-002' },
  'U-002_A-016': { id: 'A-016', name: 'Office',               unitId: 'U-002' },
};

// equipment hardcoded — id sesuai Sheets MaintWare
// field: id, name, areaKey, type, tag
const MASTER_EQUIPMENT = [
  // ── UNIT 1 ─────────────────────────────────────────────────────────
  // A-001 CTP 1
  { id:'E-165', name:'MCC 1 (CTP 1)',           areaKey:'U-001_A-001', type:'MCC',            tag:'MCC-U1-01' },
  { id:'E-166', name:'MCC 2 (CTP 1)',           areaKey:'U-001_A-001', type:'MCC',            tag:'MCC-U1-02' },
  { id:'E-170', name:'Air Compressor CTP 1',    areaKey:'U-001_A-001', type:'AIR_COMPRESSOR', tag:'AC-U1-01'  },
  // A-002 CTP 2
  { id:'E-167', name:'MCC 1 (CTP 2)',           areaKey:'U-001_A-002', type:'MCC',            tag:'MCC-U1-03' },
  { id:'E-171', name:'Air Compressor CTP 2',    areaKey:'U-001_A-002', type:'AIR_COMPRESSOR', tag:'AC-U1-02'  },
  // A-003 Petkus
  { id:'E-162', name:'MCC Blower (Petkus)',      areaKey:'U-001_A-003', type:'MCC',            tag:'MCC-U1-04' },
  { id:'E-163', name:'MCC Receiving (Petkus)',   areaKey:'U-001_A-003', type:'MCC',            tag:'MCC-U1-05' },
  { id:'E-164', name:'MCC Sheller (Petkus)',     areaKey:'U-001_A-003', type:'MCC',            tag:'MCC-U1-06' },
  { id:'E-174', name:'Air Compressor Petkus',   areaKey:'U-001_A-003', type:'AIR_COMPRESSOR', tag:'AC-U1-03'  },
  // A-004 Peanut
  { id:'E-159', name:'MCC Blower (Peanut)',      areaKey:'U-001_A-004', type:'MCC',            tag:'MCC-U1-07' },
  { id:'E-160', name:'MCC Receiving (Peanut)',   areaKey:'U-001_A-004', type:'MCC',            tag:'MCC-U1-08' },
  { id:'E-161', name:'MCC Sheller (Peanut)',     areaKey:'U-001_A-004', type:'MCC',            tag:'MCC-U1-09' },
  { id:'E-172', name:'Air Compressor Peanut',   areaKey:'U-001_A-004', type:'AIR_COMPRESSOR', tag:'AC-U1-04'  },
  // A-005 Prairie
  { id:'E-155', name:'MCC Distribusi Blower 1 (Prairie)', areaKey:'U-001_A-005', type:'MCC', tag:'MCC-U1-10' },
  { id:'E-156', name:'MCC Distribusi Blower 2 (Prairie)', areaKey:'U-001_A-005', type:'MCC', tag:'MCC-U1-11' },
  { id:'E-157', name:'MCC Receiving (Prairie)',  areaKey:'U-001_A-005', type:'MCC',            tag:'MCC-U1-12' },
  { id:'E-158', name:'MCC Sheller (Prairie)',    areaKey:'U-001_A-005', type:'MCC',            tag:'MCC-U1-13' },
  { id:'E-173', name:'Air Compressor Prairie',  areaKey:'U-001_A-005', type:'AIR_COMPRESSOR', tag:'AC-U1-05'  },
  { id:'E-063', name:'Tripercar Conveyor',       areaKey:'U-001_A-005', type:'OTHER',          tag:'TRP-U1-01' },
  // A-006 Mini Chamber
  { id:'E-175', name:'Mini Chamber',             areaKey:'U-001_A-006', type:'MINI_CHAMBER',  tag:'MCH-U1-01' },
  // A-008 Utility & Electrical
  { id:'E-249', name:'Transformer',              areaKey:'U-001_A-008', type:'TRANSFORMER',   tag:'TRF-U1-01' },
  { id:'E-638', name:'LVMDP',                    areaKey:'U-001_A-008', type:'LVMDP',         tag:'LVMDP-U1-01' },
  { id:'E-251', name:'Capacitor Bank',           areaKey:'U-001_A-008', type:'CAPACITOR_BANK',tag:'CAP-U1-01'  },
  { id:'E-244', name:'Piston Compressor 15 kW',  areaKey:'U-001_A-008', type:'AIR_COMPRESSOR',tag:'AC-U1-06'  },
  { id:'E-245', name:'Screw Compressor Cecato',  areaKey:'U-001_A-008', type:'AIR_COMPRESSOR',tag:'AC-U1-07'  },
  { id:'E-240', name:'Fire Hydrant',             areaKey:'U-001_A-008', type:'HYDRANT',       tag:'HYD-U1-01' },
  { id:'E-168', name:'MCC Office (ADV)',          areaKey:'U-001_A-008', type:'MCC',           tag:'MCC-U1-14' },
  { id:'E-169', name:'MCC Office (Prasad)',       areaKey:'U-001_A-008', type:'MCC',           tag:'MCC-U1-15' },

  // ── UNIT 2 ─────────────────────────────────────────────────────────
  // A-009 CTP 1
  { id:'E-198', name:'MCC 1 (CTP 1)',            areaKey:'U-002_A-009', type:'MCC',            tag:'MCC-U2-01' },
  // A-010 CTP 2
  { id:'E-199', name:'MCC 1 (CTP 2)',            areaKey:'U-002_A-010', type:'MCC',            tag:'MCC-U2-02' },
  // A-011 SPR Drier
  { id:'E-423', name:'Truck Tippler',            areaKey:'U-002_A-011', type:'OTHER',          tag:'TRP-U2-01' },
  { id:'E-187', name:'MCC Distribusi Blower 1 (SPR)', areaKey:'U-002_A-011', type:'MCC',      tag:'MCC-U2-03' },
  { id:'E-188', name:'MCC Distribusi Blower 2 (SPR)', areaKey:'U-002_A-011', type:'MCC',      tag:'MCC-U2-04' },
  { id:'E-189', name:'MCC Distribusi Blower 3 (SPR)', areaKey:'U-002_A-011', type:'MCC',      tag:'MCC-U2-05' },
  { id:'E-190', name:'MCC Receiving (SPR)',      areaKey:'U-002_A-011', type:'MCC',            tag:'MCC-U2-06' },
  { id:'E-191', name:'MCC Sheller (SPR)',        areaKey:'U-002_A-011', type:'MCC',            tag:'MCC-U2-07' },
  // A-012 PS Drier
  { id:'E-192', name:'MCC Blower (PS Drier)',    areaKey:'U-002_A-012', type:'MCC',            tag:'MCC-U2-08' },
  { id:'E-193', name:'MCC Receiving (PS Drier)', areaKey:'U-002_A-012', type:'MCC',            tag:'MCC-U2-09' },
  { id:'E-194', name:'MCC Sheller (PS Drier)',   areaKey:'U-002_A-012', type:'MCC',            tag:'MCC-U2-10' },
  // A-013 Peanut
  { id:'E-195', name:'MCC Blower (Peanut)',      areaKey:'U-002_A-013', type:'MCC',            tag:'MCC-U2-11' },
  { id:'E-196', name:'MCC Receiving (Peanut)',   areaKey:'U-002_A-013', type:'MCC',            tag:'MCC-U2-12' },
  { id:'E-197', name:'MCC Sheller (Peanut)',     areaKey:'U-002_A-013', type:'MCC',            tag:'MCC-U2-13' },
  // A-014 Cold Storage — CS1,2,4 = 5 mesin | CS3 = 4 mesin
  { id:'E-573', name:'Cold Storage 1 Mesin 1',  areaKey:'U-002_A-014', type:'COLD_STORAGE',   tag:'CS1-M1' },
  { id:'E-574', name:'Cold Storage 1 Mesin 2',  areaKey:'U-002_A-014', type:'COLD_STORAGE',   tag:'CS1-M2' },
  { id:'E-575', name:'Cold Storage 1 Mesin 3',  areaKey:'U-002_A-014', type:'COLD_STORAGE',   tag:'CS1-M3' },
  { id:'E-576', name:'Cold Storage 1 Mesin 4',  areaKey:'U-002_A-014', type:'COLD_STORAGE',   tag:'CS1-M4' },
  { id:'E-577', name:'Cold Storage 1 Mesin 5',  areaKey:'U-002_A-014', type:'COLD_STORAGE',   tag:'CS1-M5' },
  { id:'E-578', name:'Cold Storage 2 Mesin 1',  areaKey:'U-002_A-014', type:'COLD_STORAGE',   tag:'CS2-M1' },
  { id:'E-579', name:'Cold Storage 2 Mesin 2',  areaKey:'U-002_A-014', type:'COLD_STORAGE',   tag:'CS2-M2' },
  { id:'E-580', name:'Cold Storage 2 Mesin 3',  areaKey:'U-002_A-014', type:'COLD_STORAGE',   tag:'CS2-M3' },
  { id:'E-581', name:'Cold Storage 2 Mesin 4',  areaKey:'U-002_A-014', type:'COLD_STORAGE',   tag:'CS2-M4' },
  { id:'E-582', name:'Cold Storage 2 Mesin 5',  areaKey:'U-002_A-014', type:'COLD_STORAGE',   tag:'CS2-M5' },
  { id:'E-583', name:'Cold Storage 3 Mesin 1',  areaKey:'U-002_A-014', type:'COLD_STORAGE',   tag:'CS3-M1' },
  { id:'E-584', name:'Cold Storage 3 Mesin 2',  areaKey:'U-002_A-014', type:'COLD_STORAGE',   tag:'CS3-M2' },
  { id:'E-585', name:'Cold Storage 3 Mesin 3',  areaKey:'U-002_A-014', type:'COLD_STORAGE',   tag:'CS3-M3' },
  { id:'E-586', name:'Cold Storage 3 Mesin 4',  areaKey:'U-002_A-014', type:'COLD_STORAGE',   tag:'CS3-M4' },
  { id:'E-587', name:'Cold Storage 4 Mesin 1',  areaKey:'U-002_A-014', type:'COLD_STORAGE',   tag:'CS4-M1' },
  { id:'E-588', name:'Cold Storage 4 Mesin 2',  areaKey:'U-002_A-014', type:'COLD_STORAGE',   tag:'CS4-M2' },
  { id:'E-589', name:'Cold Storage 4 Mesin 3',  areaKey:'U-002_A-014', type:'COLD_STORAGE',   tag:'CS4-M3' },
  { id:'E-590', name:'Cold Storage 4 Mesin 4',  areaKey:'U-002_A-014', type:'COLD_STORAGE',   tag:'CS4-M4' },
  { id:'E-591', name:'Cold Storage 4 Mesin 5',  areaKey:'U-002_A-014', type:'COLD_STORAGE',   tag:'CS4-M5' },
  { id:'E-176', name:'MCC Cold Storage (CS 1 & CS 2)', areaKey:'U-002_A-014', type:'MCC',     tag:'MCC-U2-14' },
  { id:'E-177', name:'Panel Antiroom CS1',       areaKey:'U-002_A-014', type:'MCC',            tag:'MCC-U2-15' },
  { id:'E-178', name:'Panel Antiroom CS2',       areaKey:'U-002_A-014', type:'MCC',            tag:'MCC-U2-16' },
  { id:'E-183', name:'MCC Cold Storage (CS 3 & CS 4)', areaKey:'U-002_A-014', type:'MCC',     tag:'MCC-U2-17' },
  { id:'E-184', name:'Panel Antiroom CS3',       areaKey:'U-002_A-014', type:'MCC',            tag:'MCC-U2-18' },
  { id:'E-185', name:'Panel Antiroom CS4',       areaKey:'U-002_A-014', type:'MCC',            tag:'MCC-U2-19' },
  // A-015 Utility
  { id:'E-200', name:'Air Compressor CTP',       areaKey:'U-002_A-015', type:'AIR_COMPRESSOR', tag:'AC-U2-01' },
  { id:'E-201', name:'Air Compressor SPR',       areaKey:'U-002_A-015', type:'AIR_COMPRESSOR', tag:'AC-U2-02' },
  { id:'E-363', name:'Air Compressor Packing Bioseed', areaKey:'U-002_A-015', type:'AIR_COMPRESSOR', tag:'AC-U2-03' },
  { id:'E-600', name:'Fire Hydrant',             areaKey:'U-002_A-015', type:'HYDRANT',        tag:'HYD-U2-01' },
  // A-016 Office
  { id:'E-179', name:'MCB Box Office Bayer',     areaKey:'U-002_A-016', type:'MCC',            tag:'MCC-U2-20' },
  { id:'E-180', name:'MCB Box Office Prasad',    areaKey:'U-002_A-016', type:'MCC',            tag:'MCC-U2-21' },
  { id:'E-181', name:'MCB Box Office Shigenta',  areaKey:'U-002_A-016', type:'MCC',            tag:'MCC-U2-22' },
  { id:'E-182', name:'Panel Security',           areaKey:'U-002_A-016', type:'MCC',            tag:'MCC-U2-23' },
  { id:'E-186', name:'MCC Office Bioseed',       areaKey:'U-002_A-016', type:'MCC',            tag:'MCC-U2-24' },
];
