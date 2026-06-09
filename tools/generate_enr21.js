// generate_enr21.js
// Genera storage/data/airspaces/enr21.geojson desde datos del AIP Colombia ENR 2.1
// AIRAC AMDT 68/25 (12 JUN 2025)
// Uso: node tools/generate_enr21.js

'use strict';
const fs   = require('fs');
const path = require('path');

// ─── CONVERSIÓN DMS ──────────────────────────────────────────────────────────
// Formato: "DDMMSSN/DDDMMSSW"  (latitud 6 dígitos, longitud 7 dígitos)
function dms(str) {
  str = str.trim();
  const [latStr, lonStr] = str.split('/');
  const latD = parseInt(latStr.slice(0, 2), 10);
  const latM = parseInt(latStr.slice(2, 4), 10);
  const latS = parseInt(latStr.slice(4, 6), 10);
  const latH = latStr.slice(6);          // N | S
  const lonD = parseInt(lonStr.slice(0, 3), 10);
  const lonM = parseInt(lonStr.slice(3, 5), 10);
  const lonS = parseInt(lonStr.slice(5, 7), 10);
  const lonH = lonStr.slice(7);          // E | W
  let lat = latD + latM / 60 + latS / 3600;
  let lon = lonD + lonM / 60 + lonS / 3600;
  if (latH === 'S') lat = -lat;
  if (lonH === 'W') lon = -lon;
  return [+lon.toFixed(5), +lat.toFixed(5)]; // GeoJSON [lon, lat]
}

// ─── GEOMETRÍA DE ARCO ───────────────────────────────────────────────────────
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const R_NM = 3438.1; // radio terrestre en NM

function bearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * RAD;
  const la1 = lat1 * RAD, la2 = lat2 * RAD;
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return (Math.atan2(y, x) * DEG + 360) % 360;
}

function destPoint(lat, lon, brngDeg, distNM) {
  const d = distNM / R_NM;
  const la1 = lat * RAD, lo1 = lon * RAD, b = brngDeg * RAD;
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(b));
  const lo2 = lo1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return [+(lo2 * DEG).toFixed(5), +(la2 * DEG).toFixed(5)];
}

// Genera puntos de arco.  centerStr / fromStr / toStr son strings DMS.
// clockwise: true = horario, false = anti-horario
function arcPts(centerStr, radiusNM, fromStr, toStr, clockwise, n = 16) {
  const [cLon, cLat] = dms(centerStr);
  const [fLon, fLat] = dms(fromStr);
  const [tLon, tLat] = dms(toStr);
  let sb = bearing(cLat, cLon, fLat, fLon);
  let eb = bearing(cLat, cLon, tLat, tLon);
  const pts = [];
  if (clockwise) {
    if (eb <= sb) eb += 360;
    for (let i = 0; i <= n; i++) pts.push(destPoint(cLat, cLon, sb + (eb - sb) * i / n, radiusNM));
  } else {
    if (eb >= sb) sb += 360;
    for (let i = 0; i <= n; i++) pts.push(destPoint(cLat, cLon, sb + (eb - sb) * i / n, radiusNM));
  }
  return pts;
}

// ─── BUILDER DE POLÍGONO ─────────────────────────────────────────────────────
// Cada segmento es:
//   { p: 'DMS' }                                   → punto simple
//   { arc: [centerDMS, radiusNM, fromDMS, toDMS, clockwise] }  → arco
function buildPolygon(segments) {
  const coords = [];
  for (const s of segments) {
    if (s.p)   coords.push(dms(s.p));
    else if (s.arc) coords.push(...arcPts(...s.arc));
  }
  if (coords.length) coords.push(coords[0]); // cerrar anillo
  return [coords];
}

// Atajos legibles
const p   = coord  => ({ p: coord });
const arc = (...a) => ({ arc: a });

// ─── FEATURE HELPER ──────────────────────────────────────────────────────────
function feat(id, name, type, atsUnit, callsign, languages, oprHr, freq, lower, upper, cls, segments, notes) {
  return {
    type: 'Feature',
    properties: { id, name, type, atsUnit, callsign, languages, oprHr, frequency: freq,
      verticalLimits: [{ class: cls, lower, upper }], notes: notes || null },
    geometry: { type: 'Polygon', coordinates: buildPolygon(segments) }
  };
}

function featMulti(id, name, type, atsUnit, callsign, languages, oprHr, freq, vLimits, segments, notes) {
  return {
    type: 'Feature',
    properties: { id, name, type, atsUnit, callsign, languages, oprHr, frequency: freq,
      verticalLimits: vLimits, notes: notes || null },
    geometry: { type: 'Polygon', coordinates: buildPolygon(segments) }
  };
}

// ─── FEATURES ────────────────────────────────────────────────────────────────
const features = [];

// ══════════════════════════════════════════════════════════════════
// UTA BARRANQUILLA
// ══════════════════════════════════════════════════════════════════

features.push(feat(
  'UTA_BARRANQUILLA_N', 'UTA Barranquilla Sector Norte', 'UTA',
  'ACC BARRANQUILLA NORTE', 'Barranquilla Control Norte', ['ES','EN'], 'H24',
  '128.40 / 129.10 MHZ', 'FL 195', 'UNL', 'A',
  [
    p('150000N/0772500W'), p('150000N/0735947W'), p('141950N/0735947W'),
    p('122950N/0712447W'), p('115950N/0705947W'), p('115150N/0711947W'),
    p('102656N/0725130W'), p('104748N/0745137W'), p('101233N/0753024W'),
    p('090724N/0772500W'),
  ], 'Límite Venezuela simplificado'
));

features.push(feat(
  'UTA_BARRANQUILLA_S', 'UTA Barranquilla Sector Sur', 'UTA',
  'ACC BARRANQUILLA SUR', 'Barranquilla Control Sur', ['ES','EN'], 'H24',
  '124.20 / 124.85 MHZ', 'FL 195', 'UNL', 'A',
  [
    p('090724N/0772500W'), p('101233N/0753024W'), p('104748N/0745137W'),
    p('102656N/0725130W'), p('083750N/0723917W'), p('073750N/0745148W'),
    p('083450N/0772500W'),
  ], 'Límite Venezuela simplificado'
));

// ══════════════════════════════════════════════════════════════════
// UTA BOGOTA
// ══════════════════════════════════════════════════════════════════

features.push(feat(
  'UTA_BOGOTA_NE', 'UTA Bogota Sector NE', 'UTA',
  'ACC/NE BOGOTA', 'Bogotá control NE', ['ES','EN'], 'H24',
  '128.00 / 128.60 MHZ', 'FL 245', 'UNL', 'A',
  [
    p('075244N/0741906W'), p('083750N/0723917W'),
    p('032400N/0671900W'),
    p('040140N/0730053W'), p('044034N/0740609W'), p('044212N/0741831W'),
    p('044702N/0744603W'), p('052455N/0741921W'),
  ], 'Límite Venezuela simplificado'
));

features.push(feat(
  'UTA_BOGOTA_NW', 'UTA Bogota Sector NW', 'UTA',
  'ACC/NW BOGOTA', 'Bogotá control NW', ['ES','EN'], 'H24',
  '123.70 / 123.85 MHZ', 'FL 245', 'UNL', 'A',
  [
    p('083450N/0772500W'), p('073750N/0745148W'), p('075244N/0741906W'),
    p('052455N/0741921W'), p('044702N/0744603W'), p('040524N/0761325W'),
    p('060722N/0770015W'), p('071450N/0775248W'),
  ], 'Límite Panamá simplificado'
));

features.push(feat(
  'UTA_BOGOTA_SE', 'UTA Bogota Sector SE', 'UTA',
  'ACC/SE BOGOTA', 'Bogotá control SE', ['ES','EN'], 'H24',
  '128.80 / 128.95 MHZ', 'FL 245', 'UNL', 'A',
  [
    p('044034N/0740609W'), p('040140N/0730053W'), p('032400N/0671900W'),
    p('041142S/0695626W'),
    p('014630S/0731300W'), p('004245N/0740636W'), p('044212N/0741831W'),
  ], 'Límites Venezuela, Brasil, Perú simplificados'
));

features.push(feat(
  'UTA_BOGOTA_SW', 'UTA Bogota Sector SW', 'UTA',
  'ACC/SW BOGOTA', 'Bogotá control SW', ['ES','EN'], 'H24',
  '125.10 / 125.95 MHZ', 'FL 245', 'UNL', 'A',
  [
    p('071450N/0775248W'), p('060722N/0770015W'), p('040524N/0761325W'),
    p('044702N/0744603W'), p('044212N/0741831W'), p('004245N/0740636W'),
    p('014630S/0731300W'), p('010000S/0740130W'),
    p('012500N/0785000W'), p('012450N/0825449W'), p('043150N/0825449W'),
    p('042950N/0795948W'), p('061550N/0790248W'), p('062750N/0784648W'),
    p('064350N/0781748W'),
  ], 'Límites Perú, Ecuador simplificados'
));

// ══════════════════════════════════════════════════════════════════
// FIR BARRANQUILLA
// ══════════════════════════════════════════════════════════════════

// Sector con arco 65NM (FL195 / 18000FT)
features.push(featMulti(
  'FIR_BARRANQUILLA_UPPER', 'FIR Barranquilla (FL195 / 18000 FT)', 'FIR',
  'Barranquilla ACC', 'Barranquilla Informacion', ['ES','EN'], 'H24 (2300-1100)',
  '119.10 / 128.40 MHZ',
  [{ class: 'A', lower: '18000 FT', upper: 'FL 195' }],
  [
    p('101543N/0725859W'),
    arc('111353N/0722935W', 65, '101543N/0725859W', '114557N/0713125W', true),
    p('102230N/0725800W'),
  ], 'Arco 65NM horario centrado en DVOR BUQ'
));

// Sector inferior (17500FT / 1500FT, Clase G)
features.push(feat(
  'FIR_BARRANQUILLA_LOWER', 'FIR Barranquilla (17500 FT / 1500 FT)', 'FIR',
  'FIR BARRANQUILLA', 'Barranquilla Informacion', ['ES','EN'], 'H24',
  '127.50 MHZ', '1500 FT', '17500 FT', 'G',
  [
    p('150000N/0772500W'), p('150000N/0735947W'), p('141950N/0735947W'),
    p('122950N/0712447W'), p('115950N/0705947W'), p('115150N/0711947W'),
    p('090830N/0724930W'), p('083750N/0723917W'), p('073750N/0745148W'),
    p('083450N/0772500W'),
  ], 'Límite Venezuela simplificado'
));

// ══════════════════════════════════════════════════════════════════
// FIR BOGOTA
// ══════════════════════════════════════════════════════════════════

features.push(feat(
  'FIR_BOGOTA', 'FIR Bogota (FL195 / GND)', 'FIR',
  'FIR BOGOTA', 'Bogota Informacion', ['ES','EN'], '1100-2300',
  '126.75 / 126.90 MHZ', 'GND', 'FL 195', 'G',
  [
    p('083450N/0772500W'), p('073750N/0745148W'), p('075244N/0741906W'),
    p('083750N/0723917W'),
    p('032400N/0671800W'), p('011327N/0665044W'),
    p('041400S/0695630W'),
    p('010000S/0740215W'),
    p('012500N/0785000W'), p('012450N/0791648W'), p('012450N/0825459W'),
    p('043150N/0825459W'), p('042950N/0795948W'), p('061550N/0790248W'),
    p('062750N/0784648W'), p('064350N/0781748W'), p('071450N/0775248W'),
  ], 'Límites Venezuela, Brasil, Perú, Ecuador, Panamá simplificados'
));

// ══════════════════════════════════════════════════════════════════
// TMA ANDES
// ══════════════════════════════════════════════════════════════════

const ANDES_SEGS = [
  p('005534N/0781008W'),
  arc('005144N/0774023W', 30, '005534N/0781008W', '002417N/0772815W', true),
  p('003417N/0773035W'),
  arc('005144N/0774023W', 20, '003417N/0773035W', '005200N/0780023W', true),
];

features.push(featMulti(
  'TMA_ANDES_A', 'TMA Andes (FL245 / 17500 FT)', 'TMA',
  'APP ANDES', 'Andes Aproximacion', ['ES','EN'], '1100-2300', '126.70 MHZ',
  [{ class: 'A', lower: '17500 FT', upper: 'FL 245' }],
  ANDES_SEGS, 'Arcos 30NM y 20NM horarios centrados en DME IPI'
));

features.push(featMulti(
  'TMA_ANDES_D', 'TMA Andes (17500 FT / 1500 FT)', 'TMA',
  'APP ANDES', 'Andes Aproximacion', ['ES','EN'], '1100-2300', '126.70 MHZ',
  [{ class: 'D', lower: '1500 FT', upper: '17500 FT' }],
  ANDES_SEGS, 'Arcos 30NM y 20NM horarios centrados en DME IPI'
));

// ══════════════════════════════════════════════════════════════════
// TMA BARRANQUILLA
// ══════════════════════════════════════════════════════════════════

features.push(featMulti(
  'TMA_BARRANQUILLA_N', 'TMA Barranquilla Sector Norte', 'TMA',
  'APP BARRANQUILLA NORTE', 'Barranquilla aproximacion Norte', ['ES','EN'], 'H24',
  '119.10 / 120.10 MHZ',
  [
    { class: 'A', lower: '17500 FT', upper: 'FL 245' },
    { class: 'C', lower: '9500 FT', upper: '17500 FT' },
    { class: 'D', lower: '1500 FT', upper: '9500 FT' },
  ],
  [
    p('114104N/0752427W'), p('113350N/0740348W'), p('100550N/0740048W'),
    p('092949N/0743755W'), p('093012N/0762236W'), p('104430N/0762158W'),
  ], null
));

features.push(featMulti(
  'TMA_BARRANQUILLA_S', 'TMA Barranquilla Sector Sur', 'TMA',
  'APP BARRANQUILLA SUR', 'Barranquilla aproximacion Sur', ['ES','EN'], 'H24',
  '119.75 / 120.75 MHZ',
  [
    { class: 'A', lower: '17500 FT', upper: 'FL 245' },
    { class: 'C', lower: '9500 FT', upper: '17500 FT' },
    { class: 'D', lower: '1500 FT', upper: '9500 FT' },
  ],
  [
    p('093012N/0762236W'), p('092949N/0743755W'), p('075244N/0741906W'),
    p('073754N/0745140W'), p('081151N/0762243W'),
  ], null
));

// ══════════════════════════════════════════════════════════════════
// TMA BOGOTA LLEGADAS
// ══════════════════════════════════════════════════════════════════

features.push(feat(
  'TMA_BOGOTA_LLEGADAS_A', 'Bogota Llegadas A', 'TMA',
  'APP CENTRAL', 'Bogota Radar Llegadas Bogota', ['ES','EN'], '0501-1059',
  '119.50 MHZ', '11500 FT', '18000 FT', 'A',
  [
    p('052120N/0742838W'), p('050800N/0742400W'), p('050430N/0741400W'),
    p('044243N/0740937W'), p('044507N/0743037W'), p('044842N/0744126W'),
    p('045100N/0744200W'), p('045712N/0745400W'), p('050847N/0744924W'),
    p('051257N/0744530W'), p('051514N/0744424W'),
  ], null
));

features.push(feat(
  'TMA_BOGOTA_LLEGADAS_B', 'Bogota Llegadas B', 'TMA',
  'APP CENTRAL', 'Bogota Radar Llegadas Bogota', ['ES','EN'], '0501-1059',
  '119.50 MHZ', '11500 FT', '17000 FT', 'A',
  [
    p('052120N/0742838W'), p('052401N/0742141W'), p('051412N/0741600W'),
    p('050430N/0741400W'), p('050800N/0742400W'),
  ], null
));

features.push(feat(
  'TMA_BOGOTA_LLEGADAS_C', 'Bogota Llegadas C', 'TMA',
  'APP CENTRAL', 'Bogota Radar Llegadas Bogota', ['ES','EN'], '0501-1059',
  '119.50 MHZ', '11500 FT', '16000 FT', 'A',
  [
    p('045712N/0745400W'), p('045100N/0744200W'),
    p('044842N/0744126W'), p('045348N/0745230W'),
  ], null
));

// ══════════════════════════════════════════════════════════════════
// TMA BOGOTA TERMINAL NORTE
// ══════════════════════════════════════════════════════════════════

// Norte A  —  arcos sobre BUV (30NM) y ZIP (40NM, 25NM)
features.push(featMulti(
  'TMA_BOGOTA_TN_A', 'Bogota Terminal Norte A', 'TMA',
  'Terminal Norte Bogota', 'CTR ZONA 4 - BOGOTA TERMINAL NORTE', ['ES','EN'],
  '0000-0500 1100-2300', '120.30 / 121.30 MHZ',
  [{ class: 'A', lower: '11500 FT', upper: 'FL 245' }],
  [
    p('055804N/0740614W'),
    arc('053156N/0735131W', 30, '055804N/0740614W', '054609N/0732506W', true),
    p('053259N/0733504W'),
    arc('050106N/0735913W', 40, '053259N/0733504W', '050106N/0731912W', true),
    p('050106N/0733407W'),
    arc('050106N/0735913W', 25, '050106N/0733407W', '043744N/0735002W', true),
    p('042942N/0734241W'), p('044016N/0740620W'), p('044243N/0740937W'),
    p('051412N/0741600W'), p('052401N/0742141W'), p('052750N/0741148W'),
  ], 'Arcos 30NM (BUV) y 40/25NM (ZIP)'
));

features.push(feat(
  'TMA_BOGOTA_TN_B', 'Bogota Terminal Norte B', 'TMA',
  'Terminal Norte Bogota', 'CTR ZONA 4 - BOGOTA TERMINAL NORTE', ['ES','EN'], 'H24',
  '120.30 / 121.30 MHZ', '17500 FT', 'FL 245', 'A',
  [
    p('052120N/0742838W'), p('052401N/0742141W'), p('051412N/0741600W'),
    p('050430N/0741400W'), p('050800N/0742400W'),
  ], null
));

features.push(feat(
  'TMA_BOGOTA_TN_D', 'Bogota Terminal Norte D', 'TMA',
  'Terminal Norte Bogota', 'CTR ZONA 4 - BOGOTA TERMINAL NORTE', ['ES','EN'], 'H24',
  '120.30 / 121.30 MHZ', '18500 FT', 'FL 245', 'A',
  [
    p('052120N/0742838W'), p('050800N/0742400W'), p('050430N/0741400W'),
    p('045234N/0741136W'), p('044243N/0740937W'), p('044507N/0743037W'),
    p('051514N/0744424W'),
  ], null
));

// ══════════════════════════════════════════════════════════════════
// TMA BOGOTA TERMINAL OESTE
// ══════════════════════════════════════════════════════════════════

features.push(feat(
  'TMA_BOGOTA_TO_A', 'Bogota Terminal Oeste A', 'TMA',
  'Terminal Oeste Bogota', 'Radar Bogota Terminal Oeste', ['ES','EN'], 'H24',
  '119.95 / 120.95 MHZ', '11500 FT', 'FL 245', 'A',
  [
    p('060002N/0745840W'), p('060002N/0744240W'), p('052326N/0745230W'),
    p('051514N/0744424W'), p('051257N/0744530W'), p('050847N/0744924W'),
    p('045712N/0745400W'), p('045348N/0745230W'), p('044842N/0744126W'),
    p('044507N/0743037W'), p('043511N/0743905W'), p('043000N/0750600W'),
    p('043251N/0752948W'), p('050828N/0752948W'), p('050920N/0751115W'),
    p('051655N/0751114W'), p('053546N/0751021W'),
  ], null
));

features.push(feat(
  'TMA_BOGOTA_TO_B', 'Bogota Terminal Oeste B', 'TMA',
  'Terminal Oeste Bogota', 'Radar Bogota Terminal Oeste', ['ES','EN'], 'H24',
  '119.95 / 120.95 MHZ', '18500 FT', 'FL 245', 'A',
  [
    p('043000N/0750600W'), p('041748N/0752948W'), p('043251N/0752948W'),
  ], null
));

features.push(feat(
  'TMA_BOGOTA_TO_C', 'Bogota Terminal Oeste C', 'TMA',
  'Terminal Norte Bogota', 'CTR ZONA 4 - BOGOTA TERMINAL NORTE', ['ES','EN'], 'H24',
  '120.30 / 121.30 MHZ', '16500 FT', 'FL 245', 'A',
  [
    p('045712N/0745400W'), p('045100N/0744200W'),
    p('044842N/0744126W'), p('045348N/0745230W'),
  ], null
));

features.push(feat(
  'TMA_BOGOTA_TO_D', 'Bogota Terminal Oeste D', 'TMA',
  'Terminal Oeste Bogota', 'Radar Bogota Terminal Oeste', ['ES','EN'], 'H24',
  '119.95 / 120.95 MHZ', '17500 FT', 'FL 245', 'A',
  [
    p('043511N/0743905W'), p('042636N/0744600W'), p('042600N/0745200W'),
    p('043000N/0750600W'),
  ], null
));

features.push(feat(
  'TMA_BOGOTA_TO_E', 'Bogota Terminal Oeste E', 'TMA',
  'Terminal Oeste Bogota', 'Radar Bogota Terminal Oeste', ['ES','EN'], 'H24',
  '119.95 / 120.95 MHZ', '18500 FT', 'FL 245', 'A',
  [
    p('051514N/0744424W'), p('051257N/0744530W'), p('050847N/0744924W'),
    p('045712N/0745400W'), p('045100N/0744200W'), p('044842N/0744126W'),
    p('044507N/0743037W'),
  ], null
));

// ══════════════════════════════════════════════════════════════════
// TMA BOGOTA TERMINAL SUR
// ══════════════════════════════════════════════════════════════════

features.push(feat(
  'TMA_BOGOTA_TS_A', 'Bogota Terminal Sur A', 'TMA',
  'Terminal Sur Bogota', 'CTR ZONA 3 - BOGOTA TERMINAL SUR', ['ES','EN'], 'H24',
  '119.65 / 120.65 MHZ', '11500 FT', 'FL 245', 'A',
  [
    p('044507N/0743037W'), p('044243N/0740937W'), p('044016N/0740620W'),
    p('043605N/0735653W'), p('035207N/0735653W'), p('035207N/0752948W'),
    p('041748N/0752948W'), p('043000N/0750600W'), p('042600N/0745200W'),
    p('042636N/0744600W'), p('043500N/0744000W'),
  ], null
));

features.push(feat(
  'TMA_BOGOTA_TS_B', 'Bogota Terminal Sur B', 'TMA',
  'Terminal Sur Bogota', 'CTR ZONA 3 - BOGOTA TERMINAL SUR', ['ES','EN'], 'H24',
  '119.65 / 120.65 MHZ', '11500 FT', '18000 FT', 'A',
  [
    p('043000N/0750600W'), p('041748N/0752948W'), p('043251N/0752948W'),
  ], null
));

// Sur C  —  arco 25NM ZIP
features.push(featMulti(
  'TMA_BOGOTA_TS_C', 'Bogota Terminal Sur C', 'TMA',
  'Terminal Sur Bogota', 'CTR ZONA 3 - BOGOTA TERMINAL SUR', ['ES','EN'], 'H24',
  '119.65 / 120.65 MHZ',
  [{ class: 'A', lower: '14500 FT', upper: 'FL 245' }],
  [
    p('040158N/0735653W'), p('041422N/0734006W'), p('042659N/0734007W'),
    p('043744N/0735002W'),
    arc('050105N/0735912W', 25, '043744N/0735002W', '043608N/0735653W', true),
  ], 'Arco 25NM horario centrado en DVOR ZIP'
));

features.push(feat(
  'TMA_BOGOTA_TS_D', 'Bogota Terminal Sur D', 'TMA',
  'Terminal Sur Bogota', 'CTR ZONA 3 - BOGOTA TERMINAL SUR', ['ES','EN'], 'H24',
  '119.65 / 120.65 MHZ', '11500 FT', '17000 FT', 'A',
  [
    p('043511N/0743905W'), p('042636N/0744600W'), p('042600N/0745200W'),
    p('043000N/0750600W'),
  ], null
));

// ══════════════════════════════════════════════════════════════════
// TMA BUCARAMANGA
// ══════════════════════════════════════════════════════════════════

features.push(featMulti(
  'TMA_BUCARAMANGA_P1', 'TMA Bucaramanga Polígono 1', 'TMA',
  'APP BUCARAMANGA', 'Bucaramanga Aproximacion', ['ES','EN'], '1100-0500',
  '119.00 MHZ',
  [
    { class: 'A', lower: '17500 FT', upper: 'FL 245' },
    { class: 'D', lower: '1500 FT', upper: '17500 FT' },
  ],
  [
    p('082204N/0731430W'), p('073018N/0724844W'), p('073018N/0723852W'),
    p('061254N/0724404W'), p('060742N/0724501W'), p('054609N/0732506W'),
    arc('053156N/0735131W', 30, '054609N/0732506W', '055804N/0740614W', false),
    p('065338N/0735600W'), p('062938N/0743442W'), p('070115N/0742611W'),
    p('075244N/0741906W'),
  ], 'Arco 30NM anti-horario centrado en DVOR BUV (053156N/0735131W)'
));

features.push(featMulti(
  'TMA_BUCARAMANGA_P2', 'TMA Bucaramanga Polígono 2', 'TMA',
  'APP BUCARAMANGA', 'Bucaramanga Aproximacion', ['ES','EN'], '1100-0500',
  '119.00 MHZ',
  [
    { class: 'A', lower: '17500 FT', upper: 'FL 245' },
    { class: 'D', lower: '14500 FT', upper: '17500 FT' },
    { class: 'G', lower: '1500 FT', upper: '14500 FT' },
  ],
  [
    p('060742N/0724501W'), p('053521N/0725055W'), p('051901N/0732327W'),
    arc('050106N/0735913W', 40, '051901N/0732327W', '053259N/0733504W', false),
    p('054609N/0732506W'),
  ], 'Arco 40NM anti-horario centrado en DVOR ZIP (050106N/0735913W)'
));

// ══════════════════════════════════════════════════════════════════
// TMA CALI
// ══════════════════════════════════════════════════════════════════

features.push(featMulti(
  'TMA_CALI', 'TMA Cali', 'TMA',
  'APP CALI', 'Cali Aproximacion', ['ES','EN'], 'H24',
  '119.10 / 120.40 MHZ',
  [
    { class: 'A', lower: '17500 FT', upper: 'FL 245' },
    { class: 'D', lower: '1500 FT', upper: '17500 FT' },
  ],
  [
    p('041409N/0770257W'), p('041557N/0761331W'), p('041557N/0752948W'),
    p('035207N/0752948W'), p('035208N/0750703W'), p('031212N/0754401W'),
    p('023527N/0754404W'),
    arc('032403N/0762423W', 63, '023527N/0754404W', '041409N/0770257W', true),
  ], 'Arco 63NM horario centrado en DME CLO (032403N/0762423W)'
));

// ══════════════════════════════════════════════════════════════════
// TMA CUCUTA
// ══════════════════════════════════════════════════════════════════

features.push(featMulti(
  'TMA_CUCUTA_N', 'TMA Cucuta Sector Norte', 'TMA',
  'SECTOR NORTE CUCUTA', 'Cucuta Aproximacion Norte', ['ES','EN'], '100-0500',
  '119.90 / 120.90 MHZ',
  [
    { class: 'A', lower: '17500 FT', upper: 'FL 245' },
    { class: 'D', lower: '1500 FT', upper: '17500 FT' },
  ],
  [
    p('082204N/0731430W'), p('083750N/0723917W'),
    p('073018N/0722617W'), p('073018N/0723852W'), p('073018N/0724844W'),
  ], 'Límite Venezuela simplificado'
));

features.push(featMulti(
  'TMA_CUCUTA_S', 'TMA Cucuta Sector Sur', 'TMA',
  'SECTOR SUR CUCUTA', 'Cucuta Aproximacion Sur', ['ES','EN'], '1000-0500',
  '119.60 / 120.60 MHZ',
  [
    { class: 'A', lower: '17500 FT', upper: 'FL 245' },
    { class: 'D', lower: '1500 FT', upper: '17500 FT' },
  ],
  [
    p('073018N/0722617W'),
    p('065154N/0695906W'), p('061427N/0700842W'), p('060206N/0714237W'),
    p('061254N/0714341W'), p('061254N/0724404W'), p('073018N/0723852W'),
  ], 'Límite Venezuela simplificado'
));

// ══════════════════════════════════════════════════════════════════
// TMA EL YOPAL
// ══════════════════════════════════════════════════════════════════

features.push(featMulti(
  'TMA_EL_YOPAL', 'TMA El Yopal', 'TMA',
  'APP EL YOPAL', 'El Yopal Aproximacion', ['ES','EN'], '1100-2359 0000-0200',
  '125.20 / 126.80 MHZ',
  [
    { class: 'A', lower: '17500 FT', upper: 'FL 245' },
    { class: 'D', lower: '2000 FT', upper: '17500 FT' },
  ],
  [
    p('061254N/0724404W'), p('061254N/0714341W'), p('060206N/0714237W'),
    p('052600N/0713903W'), p('050420N/0713903W'), p('045117N/0720128W'),
    p('050106N/0725838W'), p('050106N/0731912W'),
    arc('050106N/0735913W', 40, '050106N/0731912W', '051901N/0732327W', false),
    p('053521N/0725055W'),
  ], 'Arco 40NM anti-horario centrado en DVOR ZIP (050106N/0735913W)'
));

features.push(feat(
  'TMA_EL_YOPAL_POL', 'TMA El Yopal Polígono', 'TMA',
  'APP EL YOPAL', 'El Yopal Aproximacion', ['ES','EN'], '1100-2359 0000-0200',
  '125.20 / 126.80 MHZ', '2000 FT', '17500 FT', 'D',
  [
    p('045117N/0720128W'), p('041750N/0725838W'), p('050106N/0725838W'),
  ], null
));

// ══════════════════════════════════════════════════════════════════
// TMA LETICIA
// ══════════════════════════════════════════════════════════════════

features.push(featMulti(
  'TMA_LETICIA_P1', 'TMA Leticia Polígono 1', 'TMA',
  'AMAZONAS APP', 'Leticia Aproximación', ['ES','EN'], '1100-0300',
  '119.10 / 120.10 MHZ',
  [
    { class: 'A', lower: '17500 FT', upper: 'FL 195' },
    { class: 'D', lower: '1500 FT', upper: '17500 FT' },
  ],
  [
    p('041142S/0695624W'), p('040912S/0702210W'), p('041017S/0704629W'),
    p('040554S/0704608W'), p('035543S/0704416W'), p('033946S/0703504W'),
    p('031042S/0701818W'), p('024243S/0700117W'), p('024243S/0693944W'),
    p('034615S/0695138W'),
  ], null
));

features.push(featMulti(
  'TMA_LETICIA_P2', 'TMA Leticia Polígono 2', 'TMA',
  'AMAZONAS APP', 'Leticia Aproximación', ['ES','EN'], '1100-0300',
  '119.10 / 120.10 MHZ',
  [{ class: 'D', lower: '3500 FT', upper: '14500 FT' }],
  [
    p('041142S/0695624W'), p('034615S/0695138W'),
    arc('041142S/0695624W', 26, '034615S/0695138W', '040912S/0702210W', true),
  ], 'Arco 26NM horario centrado en 041142S/0695624W'
));

// ══════════════════════════════════════════════════════════════════
// TMA MARANDUA
// ══════════════════════════════════════════════════════════════════

features.push(featMulti(
  'TMA_MARANDUA', 'TMA Marandua', 'TMA',
  'SKUA APP', 'Marandúa APP', ['ES','EN'], 'H24', '124.10 MHZ',
  [{ class: 'D', lower: 'GND', upper: '12500 FT' }],
  [
    p('043500N/0693036W'), p('054000N/0693036W'), p('055500N/0680000W'),
    p('045100N/0680000W'),
  ], null
));

// ══════════════════════════════════════════════════════════════════
// TMA MEDELLIN
// ══════════════════════════════════════════════════════════════════

features.push(featMulti(
  'TMA_MEDELLIN_N', 'TMA Medellín Sector Norte', 'TMA',
  'SECTOR NORTE MEDELLIN', 'Medellin Aproximacion Norte', ['ES','EN'], 'H24',
  '126.10 / 126.50 MHZ',
  [
    { class: 'A', lower: '14500 FT', upper: '24500 FT' },
    { class: 'D', lower: '11500 FT', upper: '14500 FT' },
    { class: 'G', lower: '1500 FT', upper: '11500 FT' },
  ],
  [
    p('075244N/0741906W'), p('070115N/0742611W'), p('060002N/0744240W'),
    p('060002N/0745840W'),
    arc('055850N/0752506W', 25, '060002N/0745840W', '061523N/0754243W', false),
    p('065020N/0761526W'), p('071319N/0761751W'), p('075919N/0754857W'),
    p('073754N/0745140W'),
  ], 'Arco 25NM anti-horario centrado en DVOR RNG (055850N/0752506W)'
));

features.push(featMulti(
  'TMA_MEDELLIN_S', 'TMA Medellín Sector Sur', 'TMA',
  'SECTOR SUR MEDELLIN', 'Medellin Aproximacion Sur', ['ES','EN'], 'H24',
  '120.10 / 121.10 MHZ',
  [
    { class: 'A', lower: '14500 FT', upper: '24500 FT' },
    { class: 'D', lower: '11500 FT', upper: '14500 FT' },
    { class: 'G', lower: '1500 FT', upper: '11500 FT' },
  ],
  [
    p('060002N/0745840W'), p('053546N/0751021W'), p('051655N/0751114W'),
    p('050920N/0751115W'), p('050828N/0752948W'), p('050828N/0761331W'),
    p('063200N/0761331W'), p('065020N/0761526W'), p('061523N/0754243W'),
    arc('055850N/0752506W', 25, '061523N/0754243W', '060002N/0745840W', true),
  ], 'Arco 25NM horario centrado en DVOR RNG (055850N/0752506W)'
));

// ══════════════════════════════════════════════════════════════════
// TMA NEIVA
// ══════════════════════════════════════════════════════════════════

features.push(featMulti(
  'TMA_NEIVA', 'TMA Neiva', 'TMA',
  'APP NEIVA', 'Neiva Aproximacion', ['ES','EN'],
  '1100-0300 L-V / 1100-0100 Sab,Dom,Fest',
  '119.20 / 127.10 MHZ',
  [
    { class: 'A', lower: '17500 FT', upper: 'FL 245' },
    { class: 'D', lower: '1500 FT', upper: '17500 FT' },
  ],
  [
    p('035208N/0750703W'), p('035208N/0741557W'), p('023936N/0744746W'),
    p('023618N/0750044W'), p('020012N/0751306W'), p('015307N/0752259W'),
    arc('030343N/0751521W', 71, '015307N/0752259W', '022201N/0761249W', true),
    arc('032403N/0762423W', 63, '022201N/0761249W', '023527N/0754405W', false),
    p('031212N/0754401W'),
  ], 'Arco 71NM (VOR NVA) + arco 63NM anti-horario (VOR CLO)'
));

// ══════════════════════════════════════════════════════════════════
// TMA PEREIRA
// ══════════════════════════════════════════════════════════════════

features.push(featMulti(
  'TMA_PEREIRA', 'TMA Pereira', 'TMA',
  'APP PEREIRA', 'Pereira Aproximacion', ['ES','EN'], '1000-0400',
  '120.00 / 120.70 MHZ',
  [
    { class: 'A', lower: '17500 FT', upper: 'FL 195' },
    { class: 'D', lower: '6500 FT', upper: '17500 FT' },
    { class: 'G', lower: 'GND', upper: '6500 FT' },
  ],
  [
    p('050828N/0761331W'), p('050828N/0752948W'),
    p('041557N/0752948W'), p('041557N/0761331W'),
  ], null
));

// ══════════════════════════════════════════════════════════════════
// TMA SAN ANDRES
// ══════════════════════════════════════════════════════════════════

features.push(featMulti(
  'TMA_SAN_ANDRES_S1', 'TMA San Andres Sector 1', 'TMA',
  'APP SAN ANDRES', 'San Andres Aproximacion', ['ES','EN'], '1100-0500',
  '119.30 / 120.30 MHZ',
  [
    { class: 'A', lower: '17500 FT', upper: 'FL 195' },
    { class: 'D', lower: '1500 FT', upper: '17500 FT' },
    { class: 'G', lower: 'GND', upper: '1500 FT' },
  ],
  [
    p('114315N/0823041W'), p('113151N/0824236W'), p('125400N/0824900W'),
    p('133330N/0823827W'),
    arc('123457N/0814219W', 80, '133330N/0823827W', '120249N/0802725W', true),
    p('120617N/0803640W'),
    arc('123457N/0814219W', 70, '120617N/0803640W', '114315N/0823041W', true),
  ], 'Arcos 80NM y 70NM horarios centrados en DVOR SPP (123457N/0814219W)'
));

features.push(featMulti(
  'TMA_SAN_ANDRES_S2', 'TMA San Andres Sector 2', 'TMA',
  'APP SAN ANDRES', 'San Andres Aproximacion', ['ES','EN'], '1100-0500',
  '119.30 / 120.30 MHZ',
  [
    { class: 'A', lower: '17500 FT', upper: 'FL 195' },
    { class: 'D', lower: '9500 FT', upper: '17500 FT' },
    { class: 'G', lower: 'GND', upper: '9500 FT' },
  ],
  [
    p('133330N/0823827W'), p('150000N/0821509W'), p('150000N/0810249W'),
    arc('123457N/0814219W', 150, '150000N/0810249W', '113741N/0792042W', true),
    p('120249N/0802725W'),
    arc('123457N/0814219W', 80, '120249N/0802725W', '133330N/0823827W', false),
  ], 'Arco 150NM horario + 80NM anti-horario, centrados en DVOR SPP'
));

features.push(featMulti(
  'TMA_SAN_ANDRES_S3', 'TMA San Andres Sector 3', 'TMA',
  'APP SAN ANDRES', 'San Andres Aproximacion', ['ES','EN'], '1100-0500',
  '119.30 / 120.30 MHZ',
  [
    { class: 'A', lower: '17500 FT', upper: 'FL 195' },
    { class: 'D', lower: '16500 FT', upper: '17500 FT' },
    { class: 'G', lower: 'GND', upper: '16500 FT' },
  ],
  [
    p('150000N/0810249W'), p('150000N/0772500W'), p('105318N/0772500W'),
    p('113741N/0792042W'),
    arc('123457N/0814219W', 150, '113741N/0792042W', '150000N/0810249W', false),
  ], 'Arco 150NM anti-horario centrado en DVOR SPP (123457N/0814219W)'
));

// ══════════════════════════════════════════════════════════════════
// TMA PALANQUERO
// ══════════════════════════════════════════════════════════════════

features.push(featMulti(
  'TMA_PALANQUERO', 'TMA Palanquero', 'TMA',
  'PALANQUERO CONTROL', 'CONTROL PALANQUERO', ['ES','EN'], 'H24',
  '127.90 MHZ',
  [
    { class: 'D', lower: 'GND', upper: 'UNL' },
    { class: 'A', lower: 'FL 245', upper: 'UNL' },
    { class: 'G', lower: 'GND', upper: '5000 FT' },
  ],
  [
    p('062938N/0743442W'), p('065338N/0735600W'), p('052750N/0741148W'),
    p('051514N/0744424W'), p('052326N/0745230W'),
  ], null
));

// ══════════════════════════════════════════════════════════════════
// TMA TRES ESQUINAS
// ══════════════════════════════════════════════════════════════════

features.push(featMulti(
  'TMA_TRES_ESQUINAS', 'TMA Tres Esquinas', 'TMA',
  'APP TRES ESQUINAS', 'Tres esquinas Aproximación', ['ES','EN'], 'H24',
  '121.00 MHZ',
  [{ class: 'D', lower: 'GND', upper: '9000 FT' }],
  [
    p('010334N/0754323W'),
    arc('004432N/0751401W', 35, '010334N/0754323W', '011832N/0750543W', false),
    p('011832N/0750543W'),
    arc('013516N/0753410W', 33, '011832N/0750543W', '010334N/0754323W', true),
  ], 'Arco 35NM anti-horario + arco 33NM horario'
));

// ══════════════════════════════════════════════════════════════════
// TMA VILLAVICENCIO
// ══════════════════════════════════════════════════════════════════

features.push(featMulti(
  'TMA_VILLAVICENCIO_1', 'TMA Villavicencio 1', 'TMA',
  'FIS VILLAVICENCIO', 'Villavicencio Aproximacion', ['ES','EN'], '1100-2300',
  '119.30 / 119.70 MHZ',
  [
    { class: 'A', lower: 'FL 175', upper: 'FL 245' },
    { class: 'D', lower: '1500 FT', upper: '17500 FT' },
  ],
  [
    p('050106N/0733407W'), p('050106N/0725838W'), p('035450N/0725838W'),
    p('034241N/0722444W'), p('031208N/0722444W'), p('031208N/0731810W'),
    p('031847N/0732206W'), p('031847N/0735653W'), p('040158N/0735653W'),
    p('041422N/0734006W'), p('042659N/0734007W'), p('043744N/0735002W'),
    arc('050106N/0735913W', 25, '043744N/0735002W', '050106N/0733407W', false),
  ], 'Arco 25NM anti-horario centrado en DVOR ZIP (050106N/0735913W)'
));

features.push(feat(
  'TMA_VILLAVICENCIO_2', 'TMA Villavicencio 2', 'TMA',
  'FIS VILLAVICENCIO', 'Villavicencio Aproximacion', ['ES','EN'], '1100-2300',
  '119.30 / 119.70 MHZ', '17500 FT', 'FL 245', 'A',
  [
    p('050106N/0725838W'), p('045117N/0720128W'), p('041750N/0725838W'),
  ], null
));

features.push(featMulti(
  'TMA_VILLAVICENCIO_3', 'TMA Villavicencio 3', 'TMA',
  'FIS VILLAVICENCIO', 'Villavicencio Aproximacion', ['ES','EN'], '1100-2300',
  '119.30 / 119.70 MHZ',
  [{ class: 'D', lower: '1500 FT', upper: '14500 FT' }],
  [
    p('040158N/0735653W'), p('041422N/0734006W'), p('042659N/0734007W'),
    p('043744N/0735002W'),
    arc('050106N/0735913W', 25, '043744N/0735002W', '043608N/0735653W', true),
  ], 'Arco 25NM horario centrado en DVOR ZIP (050106N/0735913W)'
));

features.push(featMulti(
  'TMA_VILLAVICENCIO_4', 'TMA Villavicencio 4', 'TMA',
  'FIS VILLAVICENCIO', 'Villavicencio Aproximacion', ['ES','EN'], '1100-2300',
  '119.30 / 119.70 MHZ',
  [
    { class: 'A', lower: 'FL 175', upper: 'FL 245' },
    { class: 'G', lower: '1500 FT', upper: '17500 FT' },
  ],
  [
    p('035450N/0725838W'), p('034241N/0722444W'), p('031208N/0722444W'),
    p('031208N/0712903W'), p('044543N/0712903W'), p('045117N/0720128W'),
    p('041750N/0725838W'),
  ], null
));

// ══════════════════════════════════════════════════════════════════
// CTA BARRANQUILLA
// ══════════════════════════════════════════════════════════════════

features.push(feat(
  'CTA_BARRANQUILLA_N', 'CTA Barranquilla Sector Norte', 'CTA',
  'CONTROL BARRANQUILLA NORTE', 'Barranquilla Control Norte', ['ES','EN'], 'H24',
  '128.40 / 129.10 MHZ', '17500 FT', 'FL 245', 'A',
  [
    p('094310N/0762214W'), p('090724N/0772500W'), p('150000N/0772500W'),
    p('150000N/0740000W'), p('141842N/0740000W'), p('122950N/0712447W'),
    p('115950N/0705947W'), p('115150N/0711947W'), p('102656N/0725130W'),
    p('103916N/0740157W'), p('113350N/0740348W'), p('114104N/0752427W'),
    p('104430N/0762158W'),
  ], null
));

features.push(feat(
  'CTA_BARRANQUILLA_SUR_DER', 'CTA Barranquilla Sector Sur Parte Derecha', 'CTA',
  'CONTROL BARRANQUILLA SUR', 'Barranquilla Control Sur', ['ES','EN'], 'H24',
  '124.20 / 128.40 MHZ', '17500 FT', 'FL 245', 'A',
  [
    p('083750N/0723917W'), p('075244N/0741906W'), p('092949N/0743755W'),
    p('100550N/0740048W'), p('103916N/0740157W'), p('102656N/0725130W'),
  ], null
));

features.push(feat(
  'CTA_BARRANQUILLA_SUR_IZQ', 'CTA Barranquilla Sector Sur Parte Izquierda', 'CTA',
  'CONTROL BARRANQUILLA SUR', 'Barranquilla Control Sur', ['ES','EN'], 'H24',
  '124.20 / 128.40 MHZ', '17500 FT', 'FL 245', 'A',
  [
    p('081151N/0762243W'), p('083450N/0772500W'), p('090724N/0772500W'),
    p('094310N/0762214W'),
  ], null
));

// ══════════════════════════════════════════════════════════════════
// CTA CALI
// ══════════════════════════════════════════════════════════════════

features.push(featMulti(
  'CTA_CALI', 'CTA Cali', 'CTA',
  'CONTROL CALI', 'Cali Control', ['ES','EN'], 'H24',
  '125.70 / 126.70 MHZ',
  [
    { class: 'A', lower: '17500 FT', upper: 'FL 245' },
    { class: 'E', lower: '500 FT', upper: '17500 FT' },
    { class: 'G', lower: 'GND', upper: '500 FT' },
  ],
  [
    p('043150N/0825449W'), p('042950N/0795948W'), p('061550N/0790248W'),
    p('062750N/0784648W'), p('064350N/0781748W'), p('071450N/0775248W'),
    p('060616N/0773149W'), p('044651N/0761331W'), p('041557N/0761331W'),
    p('041406N/0770255W'),
    arc('032403N/0762423W', 63, '041406N/0770255W', '022331N/0760649W', false),
    p('002119N/0772328W'),
    p('012528N/0785027W'), p('012450N/0825449W'),
  ], 'Arco 63NM anti-horario centrado en DME CLO (032403N/0762423W)'
));

// ══════════════════════════════════════════════════════════════════
// CTA MEDELLIN
// ══════════════════════════════════════════════════════════════════

features.push(feat(
  'CTA_MEDELLIN', 'CTA Medellín', 'CTA',
  'CONTROL MEDELLIN', 'Medellín Control', ['ES','EN'], 'H24',
  '127.20 / 127.40 MHZ', '1500 FT', '24500 FT', 'A',
  [
    p('083454N/0772458W'), p('075915N/0754849W'), p('071319N/0761751W'),
    p('063200N/0761331W'), p('044651N/0761331W'), p('060616N/0773149W'),
    p('071450N/0775248W'),
  ], 'Límite Panamá simplificado'
));

// ══════════════════════════════════════════════════════════════════
// SECTOR CENTRAL (APP CENTRAL / BOGOTA RADAR)
// ══════════════════════════════════════════════════════════════════

features.push(featMulti(
  'SECTOR_CENTRAL', 'Sector Central', 'TMA',
  'APP CENTRAL', 'Bogota Radar Llegadas Bogota', ['ES','EN'], '0501-1059',
  '119.50 MHZ',
  [
    { class: 'D', lower: '1500 FT', upper: '11500 FT' },
    { class: 'G', lower: '12000 FT', upper: 'FL 195' },
  ],
  [
    p('060002N/0745840W'), p('060002N/0744240W'), p('062938N/0743442W'),
    p('065338N/0735600W'), p('061048N/0740354W'), p('061048N/0731909W'),
    p('052026N/0734310W'),
    arc('050106N/0735913W', 25, '052026N/0734310W', '043605N/0735653W', true),
    p('035207N/0735653W'), p('035207N/0752948W'), p('050827N/0752948W'),
    p('050828N/0751115W'), p('051637N/0751115W'), p('053546N/0751021W'),
  ], 'Arco 25NM horario centrado en DVOR ZIP (050106N/0735913W)'
));

// ══════════════════════════════════════════════════════════════════
// SECTOR VILLAVICENCIO E  &  SE  (FIC)
// ══════════════════════════════════════════════════════════════════

features.push(featMulti(
  'SECTOR_VILLAVICENCIO_E', 'Sector Villavicencio E', 'FIR',
  'FIC SECTOR VILLAVICENCIO', 'Villavicencio Informacion', ['ES','EN'], 'H24',
  '126.50 / 127.00 MHZ',
  [
    { class: 'A', lower: '17500 FT', upper: 'FL 195' },
    { class: 'G', lower: '1500 FT', upper: '17500 FT' },
  ],
  [
    p('070450N/0720547W'), p('035110N/0673850W'), p('032620N/0713903W'),
    p('035450N/0725838W'), p('031844N/0725838W'), p('031844N/0735653W'),
    p('043605N/0735653W'),
    arc('050106N/0735913W', 25, '043605N/0735653W', '051445N/0733806W', true),
  ], 'Arco 25NM horario centrado en DVOR ZIP (050106N/0735913W)'
));

features.push(featMulti(
  'SECTOR_VILLAVICENCIO_SE', 'Sector Villavicencio SE', 'FIR',
  'FIC SECTOR VILLAVICENCIO', 'Villavicencio Informacion', ['ES','EN'], 'H24',
  '126.20 / 127.30 MHZ',
  [
    { class: 'A', lower: '17500 FT', upper: 'FL 195' },
    { class: 'G', lower: '1500 FT', upper: '17500 FT' },
  ],
  [
    p('033050N/0745157W'), p('035207N/0735653W'), p('031844N/0735653W'),
    p('031844N/0725838W'), p('035450N/0725838W'), p('032620N/0713903W'),
    p('035110N/0673850W'), p('012450S/0692347W'), p('003618S/0722347W'),
    p('001043S/0744632W'), p('023350N/0743030W'), p('023350N/0745157W'),
  ], null
));

// ─── OUTPUT ──────────────────────────────────────────────────────────────────

const geojson = {
  type: 'FeatureCollection',
  metadata: {
    source: 'AIP Colombia ENR 2.1',
    title: 'FIR, UIR, TMA y CTA - Colombia',
    note: 'Datos para entrenamiento IFR. No usar para navegación real.',
    generated: new Date().toISOString().split('T')[0],
    version: 'AIRAC AMDT 68/25 (12 JUN 2025)'
  },
  features
};

const outPath = path.join(__dirname, '..', 'storage', 'data', 'airspaces', 'enr21.geojson');
fs.writeFileSync(outPath, JSON.stringify(geojson, null, 2), 'utf8');
console.log(`✓ Escrito: ${outPath}`);
console.log(`  Features: ${features.length}`);
features.forEach(f => console.log(`  · ${f.properties.id}`));
