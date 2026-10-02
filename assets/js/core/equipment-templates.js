'use strict';

const EQUIP_TYPE_LABELS = {
  TRANSFORMER:    '🔌 TRANSFORMER & CUBICLE',
  LVMDP:          '⚡ LVMDP',
  CAPACITOR_BANK: '🔋 CAPACITOR BANK',
  MCC:            '🗄 MCC PANEL',
  AIR_COMPRESSOR: '💨 AIR COMPRESSOR',
  HYDRANT:        '🚒 HYDRANT',
  MINI_CHAMBER:   '🔧 MINI CHAMBER',
  COLD_STORAGE:   '❄ COLD STORAGE',
  OTHER:          '📦 LAINNYA',
};

const EQUIP_PARAM_TEMPLATES = {
  // ── MENU 1: TRANSFORMER & CUBICLE ───────────────────────────────────────────
  // Ref: Suhu <65°C (normal) max 85°C | Level oli 100% | Arus seimbang ±5%
  //      Cos φ ≥0.85 (ideal >0.95) | THDi <5% max 8% | Load <1200 kVA
  TRANSFORMER: [
    { id:'tp1',  label:'Suhu Trafo',             unit:'°C',  section:'Kondisi Trafo',  type:'numeric', normalMin:0,    normalMax:65,   warnMax:85 },
    { id:'tp2',  label:'Level Oli',              unit:'%',   section:'Kondisi Trafo',  type:'numeric', normalMin:90,   normalMax:100,  warnMin:80 },
    { id:'tp3',  label:'Arus R',                 unit:'A',   section:'Arus per Phase', type:'numeric', normalMin:0,    normalMax:1600, warnMax:2000 },
    { id:'tp4',  label:'Arus S',                 unit:'A',   section:'Arus per Phase', type:'numeric', normalMin:0,    normalMax:1600, warnMax:2000 },
    { id:'tp5',  label:'Arus T',                 unit:'A',   section:'Arus per Phase', type:'numeric', normalMin:0,    normalMax:1600, warnMax:2000 },
    { id:'tp6',  label:'Cos φ (Power Factor)',   unit:'',    section:'Power Quality',  type:'numeric', normalMin:0.85, normalMax:1.0,  warnMin:0.80 },
    { id:'tp7',  label:'THDi (% Harmonik Arus)', unit:'%',   section:'Power Quality',  type:'numeric', normalMin:0,    normalMax:5,    warnMax:8 },
    { id:'tp8',  label:'Load',                   unit:'kVA', section:'Beban',          type:'numeric', normalMin:0,    normalMax:1200, warnMax:1500 },
    { id:'tp9',  label:'Kebersihan',             unit:'',    section:'Kondisi Fisik',  type:'status',  options:['BERSIH','KOTOR RINGAN','KOTOR BERAT'] },
    { id:'tp10', label:'Temuan',                 unit:'',    section:'Kondisi Fisik',  type:'status',  options:['NORMAL','PERLU PERHATIAN','KRITIS'] },
  ],

  // ── MENU 2: LVMDP ────────────────────────────────────────────────────────────
  // Ref: Suhu panel <60°C | Arus MAIN <1000A | Tegangan 415V ±5% (395–435V)
  LVMDP: [
    { id:'lp0',  label:'Suhu Panel',        unit:'°C',  section:'Kondisi Panel',  type:'numeric', normalMin:0,   normalMax:60,   warnMax:70 },
    // MAIN
    { id:'lp1',  label:'Arus MAIN R',       unit:'A',   section:'Arus MAIN',      type:'numeric', normalMin:0,   normalMax:1000, warnMax:1100 },
    { id:'lp2',  label:'Arus MAIN S',       unit:'A',   section:'Arus MAIN',      type:'numeric', normalMin:0,   normalMax:1000, warnMax:1100 },
    { id:'lp3',  label:'Arus MAIN T',       unit:'A',   section:'Arus MAIN',      type:'numeric', normalMin:0,   normalMax:1000, warnMax:1100 },
    // Prairie
    { id:'lp4',  label:'Arus Prairie R',    unit:'A',   section:'Arus Feeder',    type:'numeric', normalMin:0,   normalMax:800,  warnMax:900 },
    { id:'lp5',  label:'Arus Prairie S',    unit:'A',   section:'Arus Feeder',    type:'numeric', normalMin:0,   normalMax:800,  warnMax:900 },
    { id:'lp6',  label:'Arus Prairie T',    unit:'A',   section:'Arus Feeder',    type:'numeric', normalMin:0,   normalMax:800,  warnMax:900 },
    // Peanut
    { id:'lp7',  label:'Arus Peanut R',     unit:'A',   section:'Arus Feeder',    type:'numeric', normalMin:0,   normalMax:800,  warnMax:900 },
    { id:'lp8',  label:'Arus Peanut S',     unit:'A',   section:'Arus Feeder',    type:'numeric', normalMin:0,   normalMax:800,  warnMax:900 },
    { id:'lp9',  label:'Arus Peanut T',     unit:'A',   section:'Arus Feeder',    type:'numeric', normalMin:0,   normalMax:800,  warnMax:900 },
    // Petkus
    { id:'lp10', label:'Arus Petkus R',     unit:'A',   section:'Arus Feeder',    type:'numeric', normalMin:0,   normalMax:800,  warnMax:900 },
    { id:'lp11', label:'Arus Petkus S',     unit:'A',   section:'Arus Feeder',    type:'numeric', normalMin:0,   normalMax:800,  warnMax:900 },
    { id:'lp12', label:'Arus Petkus T',     unit:'A',   section:'Arus Feeder',    type:'numeric', normalMin:0,   normalMax:800,  warnMax:900 },
    // CTP 1
    { id:'lp13', label:'Arus CTP 1 R',      unit:'A',   section:'Arus Feeder',    type:'numeric', normalMin:0,   normalMax:800,  warnMax:900 },
    { id:'lp14', label:'Arus CTP 1 S',      unit:'A',   section:'Arus Feeder',    type:'numeric', normalMin:0,   normalMax:800,  warnMax:900 },
    { id:'lp15', label:'Arus CTP 1 T',      unit:'A',   section:'Arus Feeder',    type:'numeric', normalMin:0,   normalMax:800,  warnMax:900 },
    // Power Faktor + CTP 2
    { id:'lp16', label:'Arus CTP 2 R (PF)', unit:'A',   section:'Arus Feeder',    type:'numeric', normalMin:0,   normalMax:800,  warnMax:900 },
    { id:'lp17', label:'Arus CTP 2 S (PF)', unit:'A',   section:'Arus Feeder',    type:'numeric', normalMin:0,   normalMax:800,  warnMax:900 },
    { id:'lp18', label:'Arus CTP 2 T (PF)', unit:'A',   section:'Arus Feeder',    type:'numeric', normalMin:0,   normalMax:800,  warnMax:900 },
    // Tegangan MAIN
    { id:'lp19', label:'Tegangan R-S',      unit:'V',   section:'Tegangan MAIN',  type:'numeric', normalMin:395, normalMax:435,  warnMin:380, warnMax:450 },
    { id:'lp20', label:'Tegangan S-T',      unit:'V',   section:'Tegangan MAIN',  type:'numeric', normalMin:395, normalMax:435,  warnMin:380, warnMax:450 },
    { id:'lp21', label:'Tegangan T-R',      unit:'V',   section:'Tegangan MAIN',  type:'numeric', normalMin:395, normalMax:435,  warnMin:380, warnMax:450 },
    { id:'lp22', label:'Kebersihan',        unit:'',    section:'Kondisi Fisik',  type:'status',  options:['BERSIH','KOTOR RINGAN','KOTOR BERAT'] },
  ],

  // ── MENU 3: CAPACITOR BANK ───────────────────────────────────────────────────
  // Ref: Cos φ 0.95–0.99 | Step max 18 (>18 = alarm) | min 1 step (<1 = alarm)
  CAPACITOR_BANK: [
    // Suhu Capacitor per step (20 step)
    ...[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20].map(n => ({
      id:`cp_sc${n}`, label:`Suhu Kapasitor Step ${n}`, unit:'°C',
      section:'Suhu Kapasitor', type:'numeric', normalMin:0, normalMax:55, warnMax:70
    })),
    // Suhu Contactor, MCB, Terminal & Kabel per step (20 step)
    ...[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20].map(n => ({
      id:`cp_sct${n}`, label:`Suhu Contactor/MCB Step ${n}`, unit:'°C',
      section:'Suhu Contactor MCB', type:'numeric', normalMin:0, normalMax:55, warnMax:70
    })),
    // Arus per phase tiap step (20 step × 3 phase)
    ...[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20].flatMap(n => [
      { id:`cp_ar${n}`, label:`Arus Step ${n} R`, unit:'A', section:'Arus per Step', type:'numeric', normalMin:0, normalMax:50 },
      { id:`cp_as${n}`, label:`Arus Step ${n} S`, unit:'A', section:'Arus per Step', type:'numeric', normalMin:0, normalMax:50 },
      { id:`cp_at${n}`, label:`Arus Step ${n} T`, unit:'A', section:'Arus per Step', type:'numeric', normalMin:0, normalMax:50 },
    ]),
    // Parameter umum
    { id:'cp_pf',   label:'Cos φ Terbaca',    unit:'',    section:'Power Quality', type:'numeric', normalMin:0.95, normalMax:1.0,  warnMin:0.90 },
    { id:'cp_step', label:'Jumlah Step Aktif', unit:'',    section:'Step Status',   type:'numeric', normalMin:1,    normalMax:18,   warnMin:0,   warnMax:20 },
    { id:'cp_kvar', label:'Total kVAR',        unit:'kVAR',section:'Power Quality', type:'numeric', normalMin:0,    normalMax:1000, warnMax:1200 },
    { id:'cp_volt', label:'Tegangan',          unit:'V',   section:'Tegangan',      type:'numeric', normalMin:395,  normalMax:435,  warnMin:380, warnMax:450 },
    { id:'cp_mr',   label:'Arus MAIN R',       unit:'A',   section:'Arus MAIN',     type:'numeric', normalMin:0,    normalMax:600,  warnMax:700 },
    { id:'cp_ms',   label:'Arus MAIN S',       unit:'A',   section:'Arus MAIN',     type:'numeric', normalMin:0,    normalMax:600,  warnMax:700 },
    { id:'cp_mt',   label:'Arus MAIN T',       unit:'A',   section:'Arus MAIN',     type:'numeric', normalMin:0,    normalMax:600,  warnMax:700 },
    { id:'cp_brs',  label:'Kebersihan',        unit:'',    section:'Kondisi Fisik', type:'status',  options:['BERSIH','KOTOR RINGAN','KOTOR BERAT'] },
  ],

  // ── MENU 4: MCC PANEL ────────────────────────────────────────────────────────
  // Ref: Arus ≤80–90% rating | Suhu panel <50°C | Trip tidak boleh sering
  MCC: [
    { id:'mp1',  label:'Suhu Panel (Semua Komponen)', unit:'°C', section:'Kondisi Panel', type:'numeric', normalMin:0, normalMax:50, warnMax:60 },
    { id:'mp2',  label:'Arus Feeder R', unit:'A',   section:'Arus Feeder',    type:'numeric', normalMin:0, normalMax:400 },
    { id:'mp3',  label:'Arus Feeder S', unit:'A',   section:'Arus Feeder',    type:'numeric', normalMin:0, normalMax:400 },
    { id:'mp4',  label:'Arus Feeder T', unit:'A',   section:'Arus Feeder',    type:'numeric', normalMin:0, normalMax:400 },
    { id:'mp5',  label:'Status Breaker',unit:'',    section:'Status',         type:'status',  options:['ON','OFF','TRIP'] },
    { id:'mp6',  label:'Running Hour',  unit:'jam', section:'Operasional',    type:'numeric', normalMin:0, normalMax:8760 },
    { id:'mp7',  label:'Kebersihan',    unit:'',    section:'Kondisi Fisik',  type:'status',  options:['BERSIH','KOTOR RINGAN','KOTOR BERAT'] },
  ],

  // ── MENU 5: AIR COMPRESSOR ──────────────────────────────────────────────────
  // Ref: Tekanan 6–8 bar | Suhu discharge normal | Running hour sesuai jadwal
  AIR_COMPRESSOR: [
    { id:'ac1',  label:'Tekanan Udara',   unit:'bar', section:'Operasional',   type:'numeric', normalMin:6,  normalMax:8,   warnMin:4, warnMax:10 },
    { id:'ac2',  label:'Suhu Discharge',  unit:'°C',  section:'Operasional',   type:'numeric', normalMin:0,  normalMax:80,  warnMax:95 },
    { id:'ac3',  label:'Arus Motor',      unit:'A',   section:'Operasional',   type:'numeric', normalMin:0,  normalMax:80 },
    { id:'ac4',  label:'Running Hour',    unit:'jam', section:'Jam Operasi',   type:'numeric', normalMin:0,  normalMax:8000 },
    { id:'ac5',  label:'Level Oli',       unit:'%',   section:'Kondisi',       type:'numeric', normalMin:80, normalMax:100, warnMin:60 },
    { id:'ac6',  label:'Kebersihan',      unit:'',    section:'Kondisi Fisik', type:'status',  options:['BERSIH','KOTOR RINGAN','KOTOR BERAT'] },
    { id:'ac7',  label:'Temuan',          unit:'',    section:'Kondisi Fisik', type:'status',  options:['NORMAL','PERLU PERHATIAN','KRITIS'] },
  ],

  // ── MENU 6: HYDRANT ─────────────────────────────────────────────────────────
  // Ref: Tekanan standby 6–8 bar | Level tank ≥80% | System standby 24 jam (tidak boleh trip)
  HYDRANT: [
    { id:'hp1',  label:'Tekanan Line',         unit:'bar', section:'Tekanan',       type:'numeric', normalMin:5, normalMax:7, warnMin:4, warnMax:10 },
    { id:'hp2',  label:'Status Jockey Pump',   unit:'',    section:'Status Pompa',  type:'status',  options:['AUTO/NORMAL','MANUAL','TRIP'] },
    { id:'hp3',  label:'Status Main Pump',     unit:'',    section:'Status Pompa',  type:'status',  options:['STANDBY/NORMAL','RUNNING','TRIP'] },
    { id:'hp4',  label:'Status Diesel Pump',   unit:'',    section:'Status Pompa',  type:'status',  options:['STANDBY/NORMAL','RUNNING','TRIP'] },
    { id:'hp7',  label:'Status Motor Pump',    unit:'',    section:'Status Pompa',  type:'status',  options:['STANDBY/NORMAL','RUNNING','TRIP'] },
    { id:'hp5',  label:'Level Air Tank',       unit:'%',   section:'Level',         type:'numeric', normalMin:80, normalMax:100, warnMin:60 },
    { id:'hp6',  label:'Alarm System',         unit:'',    section:'Alarm',         type:'status',  options:['NORMAL/STANDBY','AKTIF/ALARM'] },
    { id:'hp8',  label:'Kebersihan',           unit:'',    section:'Kondisi Fisik', type:'status',  options:['BERSIH','KOTOR RINGAN','KOTOR BERAT'] },
    { id:'hp9',  label:'Temuan',               unit:'',    section:'Kondisi Fisik', type:'status',  options:['NORMAL','PERLU PERHATIAN','KRITIS'] },
  ],

  // ── MENU 7: MINI CHAMBER ────────────────────────────────────────────────────
  MINI_CHAMBER: [
    { id:'mc1',  label:'Suhu Chamber',    unit:'°C',  section:'Kondisi',       type:'numeric', normalMin:0, normalMax:60, warnMax:75 },
    { id:'mc2',  label:'Kebersihan',      unit:'',    section:'Kondisi Fisik', type:'status',  options:['BERSIH','KOTOR RINGAN','KOTOR BERAT'] },
    { id:'mc3',  label:'Kondisi Kabel',   unit:'',    section:'Kondisi Fisik', type:'status',  options:['BAIK','PERLU PERHATIAN','RUSAK'] },
    { id:'mc4',  label:'Kondisi Busbar',  unit:'',    section:'Kondisi Fisik', type:'status',  options:['BAIK','PERLU PERHATIAN','RUSAK'] },
    { id:'mc5',  label:'Temuan',          unit:'',    section:'Kondisi Fisik', type:'status',  options:['NORMAL','PERLU PERHATIAN','KRITIS'] },
  ],
  // ── MENU 8: COLD STORAGE ────────────────────────────────────────────────────
  COLD_STORAGE: [
    { id:'cs1',  label:'Suhu Storage',                     unit:'°C',  section:'Kondisi Ruang',       type:'numeric', normalMin:-25, normalMax:5,   warnMax:8 },
    { id:'cs2',  label:'Humidity Storage',                  unit:'%RH', section:'Kondisi Ruang',       type:'numeric', normalMin:70,  normalMax:90,  warnMax:95 },
    { id:'cs3',  label:'Ampere Compressor',                 unit:'A',   section:'Kompressor',          type:'numeric', normalMin:0,   normalMax:60,  warnMax:75 },
    { id:'cs4',  label:'Ampere Fan Evaporator',             unit:'A',   section:'Fan Evaporator',      type:'numeric', normalMin:0,   normalMax:20,  warnMax:25 },
    { id:'cs5',  label:'Sight Glass Liquid',                unit:'',    section:'Refrigerant',         type:'status',  options:['PENUH/NORMAL','GELEMBUNG','KOSONG'] },
    { id:'cs6',  label:'Tekanan LP (Low Pressure)',         unit:'bar', section:'Tekanan Refrigerant', type:'numeric', normalMin:1.5, normalMax:4.0, warnMin:1.0, warnMax:5.0 },
    { id:'cs7',  label:'Tekanan HP (High Pressure)',        unit:'bar', section:'Tekanan Refrigerant', type:'numeric', normalMin:10,  normalMax:18,  warnMin:8,   warnMax:22 },
    { id:'cs8',  label:'Sight Glass Level Oli Compressor', unit:'',    section:'Kondisi Oli',         type:'status',  options:['NORMAL','RENDAH','KRITIS'] },
    { id:'cs9',  label:'Sight Glass Pelampung Refrigerant',unit:'',    section:'Refrigerant',         type:'status',  options:['NORMAL','RENDAH','KRITIS'] },
    { id:'cs10', label:'Kebersihan',                        unit:'',    section:'Kondisi Fisik',       type:'status',  options:['BERSIH','KOTOR RINGAN','KOTOR BERAT'] },
    { id:'cs11', label:'Temuan',                            unit:'',    section:'Kondisi Fisik',       type:'status',  options:['NORMAL','PERLU PERHATIAN','KRITIS'] },
  ],
  OTHER: [],
};
// ADD END

// ADD: Referensi nilai normal per tipe equipment
const EQUIP_REFERENSI = {
  TRANSFORMER: [
    '🌡 Suhu trafo: &lt;65°C (normal), max 85°C',
    '🛢 Level oli: 100% (warn jika &lt;90%)',
    '⚡ Arus per phase: seimbang ±5%',
    '🔋 Cos φ: ≥0.85 (ideal &gt;0.95)',
    '📊 THDi: &lt;5% (IEEE 519), max 8%',
    '⚙ Load: &lt;1200 kVA',
  ],
  LVMDP: [
    '🌡 Suhu panel: &lt;60°C',
    '⚡ Arus MAIN: &lt;1000A',
    '🔌 Tegangan: 415V ±5% (395–435V)',
  ],
  CAPACITOR_BANK: [
    '🔋 Cos φ: 0.95–0.99',
    '⚙ Step aktif: min 1 step (alarm jika &lt;1), max 18 step (alarm jika &gt;18)',
  ],
  MCC: [
    '⚡ Arus feeder: ≤80–90% rating breaker',
    '🌡 Suhu panel: &lt;50°C',
    '🔴 Trip: tidak boleh sering terjadi',
    '⏱ Running hour: sesuai jadwal maintenance',
  ],
  AIR_COMPRESSOR: [
    '💨 Tekanan udara: 6–8 bar (normal)',
    '🌡 Suhu discharge: max 80°C (warn &gt;95°C)',
    '🛢 Level oli: ≥80%',
  ],
  HYDRANT: [
    '💧 Tekanan standby: 6–8 bar',
    '🚒 Jockey pump: auto maintain pressure (status = AUTO)',
    '⚙ Main pump: start saat pressure drop',
    '🪣 Level tank: ≥80%',
    '🔔 System: standby 24 jam — tidak boleh trip',
  ],
  MINI_CHAMBER: [
    '🌡 Suhu chamber: &lt;60°C (warn &gt;75°C)',
  ],
  COLD_STORAGE: [
    '🌡 Suhu storage: sesuai setpoint produk (umumnya -18°C s/d +4°C)',
    '💧 Humidity: 70–90%RH',
    '❄ Tekanan LP: 1.5–4.0 bar (refrigerant R404A/R22)',
    '❄ Tekanan HP: 10–18 bar',
    '🔍 Sight glass liquid: harus penuh/tidak ada gelembung',
    '🛢 Sight glass oli: level normal, tidak rendah',
    '⚡ Ampere compressor: sesuai nameplate, max +25% dari normal',
  ],
};

// ADD END
