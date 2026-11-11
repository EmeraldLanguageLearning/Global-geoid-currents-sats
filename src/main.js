import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { feature, mesh } from 'topojson-client';
import landTopo from 'world-atlas/land-50m.json';
import countriesTopo from 'world-atlas/countries-50m.json';
import lakes from './lakes.json';
import geoidB64 from './geoid.b64';
import EXT from './extremes.json';
import SST from './sst.json';

/* ---------- EGM96 15' grid (cm), rows N->S (721), cols 0..360E (1440) ---------- */
const GW = 1440, GH = 721;
const geoid = (() => {
  const s = atob(geoidB64), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return new Int16Array(u.buffer);
})();
function geoidN(lat, lon) { // metres, bilinear
  let fi = (90 - lat) / 0.25; fi = Math.min(Math.max(fi, 0), GH - 1.000001);
  const i0 = Math.floor(fi), ti = fi - i0;
  let fj = (((lon % 360) + 360) % 360) / 0.25; const j0 = Math.floor(fj) % GW, tj = fj - Math.floor(fj), j1 = (j0 + 1) % GW;
  const a = geoid[i0 * GW + j0], b = geoid[i0 * GW + j1], c = geoid[(i0 + 1) * GW + j0], d = geoid[(i0 + 1) * GW + j1];
  return ((a * (1 - tj) + b * tj) * (1 - ti) + (c * (1 - tj) + d * tj) * ti) / 100;
}

/* ---------- WGS84 ---------- */
const A_M = 6378137, F0 = 1 / 298.257223563;
const D2R = Math.PI / 180;
let flatMul = 1, exag = 2500;
let E2 = 0;
function setFlat(m) { flatMul = m; const f = F0 * m; E2 = f * (2 - f); }
setFlat(1);
const hUnits = (N) => (N * exag) / A_M;
// geodetic (deg) + height (units of a) -> three.js xyz (y up)
function pos(lat, lon, h, out, k) {
  const p = lat * D2R, l = lon * D2R, sp = Math.sin(p), cp = Math.cos(p);
  const nu = 1 / Math.sqrt(1 - E2 * sp * sp);
  const X = (nu + h) * cp * Math.cos(l), Y = (nu + h) * cp * Math.sin(l), Z = (nu * (1 - E2) + h) * sp;
  out[k] = X; out[k + 1] = Z; out[k + 2] = -Y;
}
const _t = [0, 0, 0];

/* ---------- renderer ---------- */
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
stage.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.0005, 100);
camera.position.set(2.3, 1.0, 3.2).setLength(3.4);
scene.add(camera);
scene.add(new THREE.AmbientLight(0xffffff, 0.62));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(-2, 2.5, 3);
camera.add(sun);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false; controls.enableZoom = false; controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.autoRotateSpeed = 0.6;

/* ---------- globe mesh ---------- */
const SW = 720, SH = 360, NV = (SW + 1) * (SH + 1);
const geom = new THREE.BufferGeometry();
const P = new Float32Array(NV * 3), UV = new Float32Array(NV * 2), NN = new Float32Array(NV);
for (let r = 0; r <= SH; r++) for (let c = 0; c <= SW; c++) {
  const v = r * (SW + 1) + c;
  UV[v * 2] = c / SW; UV[v * 2 + 1] = 1 - r / SH;
  NN[v] = geoidN(90 - (r * 180) / SH, -180 + (c * 360) / SW);
}
const IDX = new Uint32Array(SW * SH * 6);
{ let k = 0; for (let r = 0; r < SH; r++) for (let c = 0; c < SW; c++) {
  const a = r * (SW + 1) + c, b = a + 1, d = a + SW + 1, e = d + 1;
  IDX[k++] = a; IDX[k++] = d; IDX[k++] = b; IDX[k++] = b; IDX[k++] = d; IDX[k++] = e; } }
geom.setAttribute('position', new THREE.BufferAttribute(P, 3));
geom.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
geom.setIndex(new THREE.BufferAttribute(IDX, 1));
const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
const globe = new THREE.Mesh(geom, material);
globe.frustumCulled = false;
scene.add(globe);

function updateGlobe() {
  for (let r = 0; r <= SH; r++) {
    const lat = 90 - (r * 180) / SH;
    for (let c = 0; c <= SW; c++) {
      const v = r * (SW + 1) + c;
      pos(lat, -180 + (c * 360) / SW, hUnits(NN[v]), _t, 0);
      P[v * 3] = _t[0]; P[v * 3 + 1] = _t[1]; P[v * 3 + 2] = _t[2];
    }
  }
  geom.attributes.position.needsUpdate = true;
  geom.computeVertexNormals();
  const n = geom.attributes.normal.array, W1 = SW + 1;
  for (let r = 1; r < SH; r++) { // close the lon seam
    const a = r * W1 * 3, b = (r * W1 + SW) * 3;
    const x = n[a] + n[b], y = n[a + 1] + n[b + 1], z = n[a + 2] + n[b + 2], l = Math.hypot(x, y, z) || 1;
    n[a] = n[b] = x / l; n[a + 1] = n[b + 1] = y / l; n[a + 2] = n[b + 2] = z / l;
  }
  for (const [r, s] of [[0, 1], [SH, -1]]) for (let c = 0; c <= SW; c++) { const k = (r * W1 + c) * 3; n[k] = 0; n[k + 1] = s; n[k + 2] = 0; }
  geom.attributes.normal.needsUpdate = true;
}

/* ---------- colour ramp + textures ---------- */
const STOPS = [[-107, [59, 31, 143]], [-60, [42, 111, 208]], [-20, [111, 208, 224]], [0, [242, 242, 230]], [20, [246, 215, 122]], [50, [238, 138, 58]], [86, [168, 35, 28]]];
function ramp(m) {
  if (m <= STOPS[0][0]) return STOPS[0][1];
  for (let i = 1; i < STOPS.length; i++) if (m <= STOPS[i][0]) {
    const [m0, c0] = STOPS[i - 1], [m1, c1] = STOPS[i], t = (m - m0) / (m1 - m0);
    return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
  }
  return STOPS[STOPS.length - 1][1];
}
function geoidCanvas() {
  const cv = document.createElement('canvas'); cv.width = GW; cv.height = GH;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(GW, GH);
  for (let i = 0; i < GH; i++) for (let j = 0; j < GW; j++) {
    // texture column 0 = -180 lon
    const src = i * GW + ((j + GW / 2) % GW), c = ramp(geoid[src] / 100), o = (i * GW + j) * 4;
    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return cv;
}
function drawLand(ctx, W, H, landColor, lakeColor) {
  const X = (lon) => ((lon + 180) / 360) * W, Y = (lat) => ((90 - lat) / 180) * H;
  const fillRings = (polys, color) => {
    ctx.beginPath();
    for (const rings of polys) for (const ring of rings) { ring.forEach((p, i) => i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))); ctx.closePath(); }
    ctx.fillStyle = color; ctx.fill('evenodd');
  };
  const land = feature(landTopo, landTopo.objects.land), gs = land.features ? land.features.map(f => f.geometry) : [land.geometry];
  const lp = []; for (const g of gs) (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).forEach(p => lp.push(p));
  fillRings(lp, landColor); fillRings(lakes, lakeColor);
}
function landSeaCanvas(blend) {
  const W = 4096, H = 2048, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  if (blend) ctx.drawImage(geoidCanvas(), 0, 0, W, H);
  else { const sea = ctx.createLinearGradient(0, 0, 0, H); sea.addColorStop(0, '#2d5f8c'); sea.addColorStop(.5, '#25547f'); sea.addColorStop(1, '#2d5f8c'); ctx.fillStyle = sea; ctx.fillRect(0, 0, W, H); }
  drawLand(ctx, W, H, blend ? 'rgba(190,200,165,0.76)' : '#bcc8a2', blend ? 'rgba(37,84,127,0.45)' : '#2a5a86');
  return cv;
}
/* ---------- sea-surface temperature anomalies (NOAA ERSSTv5, 2 deg) ---------- */
const b64u8 = (s) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const SN = { en: new Int8Array(b64u8(SST.en).buffer), ln: new Int8Array(b64u8(SST.ln).buffer) }, SMASK = b64u8(SST.mask);
const TN = SST.nlon, TM = SST.nlat;
function sstAnom(k, lat, lon) {
  let fi = (SST.lat0 - lat) / 2; fi = Math.min(Math.max(fi, 0), TM - 1.000001);
  const i0 = Math.floor(fi), ti = fi - i0, fj = (((lon % 360) + 360) % 360) / 2, jf = Math.floor(fj), j0 = jf % TN, j1 = (j0 + 1) % TN, tj = fj - jf, a = SN[k];
  return ((a[i0 * TN + j0] * (1 - tj) + a[i0 * TN + j1] * tj) * (1 - ti) + (a[(i0 + 1) * TN + j0] * (1 - tj) + a[(i0 + 1) * TN + j1] * tj) * ti) / 20;
}
function isSea(lat, lon) { const i = Math.min(TM - 1, Math.max(0, Math.round((SST.lat0 - lat) / 2))), j = Math.round((((lon % 360) + 360) % 360) / 2) % TN; return SMASK[i * TN + j] === 1; }
const STOPS2 = [[-3, [28, 52, 140]], [-1.5, [86, 158, 222]], [-0.25, [244, 245, 240]], [0.25, [244, 245, 240]], [1.5, [243, 152, 82]], [3, [165, 18, 30]]];
function ramp2(v) {
  if (v <= -3) return STOPS2[0][1];
  for (let i = 1; i < STOPS2.length; i++) if (v <= STOPS2[i][0]) { const [m0, c0] = STOPS2[i - 1], [m1, c1] = STOPS2[i], t = (v - m0) / (m1 - m0); return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t]; }
  return STOPS2[STOPS2.length - 1][1];
}
function ensoCanvas(k) {
  const sm = document.createElement('canvas'); sm.width = TN; sm.height = TM;
  const sc = sm.getContext('2d'), img = sc.createImageData(TN, TM);
  for (let i = 0; i < TM; i++) for (let j = 0; j < TN; j++) { const c = ramp2(SN[k][i * TN + ((j + TN / 2) % TN)] / 20), o = (i * TN + j) * 4; img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255; }
  sc.putImageData(img, 0, 0);
  const W = 4096, H = 2048, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sm, 0, 0, W, H);
  const dx = -W / 360, y0 = H / 180, hh = (H * 178) / 180;
  ctx.drawImage(sm, dx, y0, W, hh); ctx.drawImage(sm, dx + W, y0, W, hh);
  drawLand(ctx, W, H, '#bdbdb1', '#e6e9e6');
  return cv;
}
let curTex = null, mode = 'geoid', enso = 'off';
function mkTex(cv) { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.wrapS = THREE.RepeatWrapping; return t; }
function applySurface() {
  const k = enso !== 'off' ? enso : mode;
  const cv = k === 'geoid' ? geoidCanvas() : k === 'land' ? landSeaCanvas(false) : k === 'blend' ? landSeaCanvas(true) : ensoCanvas(k);
  const t = mkTex(cv); if (curTex) curTex.dispose(); curTex = t; material.map = t; material.needsUpdate = true;
  setCoastColor(); drawLegend();
}
function setMode(m) { mode = m; enso = 'off'; applySurface(); }
function drawLegend() {
  const cv = document.getElementById('legend'), ctx = cv.getContext('2d'), e = enso !== 'off';
  for (let x = 0; x < cv.width; x++) { const f = x / (cv.width - 1), c = e ? ramp2(-3 + 6 * f) : ramp(-107 + 193 * f); ctx.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; ctx.fillRect(x, 0, 1, cv.height); }
  document.getElementById('legT').textContent = e ? (enso === 'en' ? 'El Niño 1997–98' : 'La Niña 2010–11') + ': sea temperature vs normal' : 'Geoid height (EGM96)';
  document.getElementById('lowTxt').textContent = e ? '−3 °C' : `${EXT.min.toFixed(0)} m`;
  document.getElementById('highTxt').textContent = e ? '+3 °C' : `+${EXT.max.toFixed(0)} m`;
}

/* ---------- line layers ---------- */
function densify(pts, out, step) {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (Math.abs(x1 - x0) > 180) continue;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / step));
    for (let k = 0; k < n; k++) {
      out.push(y0 + ((y1 - y0) * k) / n, x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * (k + 1)) / n, x0 + ((x1 - x0) * (k + 1)) / n);
    }
  }
}
function makeLayer(lines, color, opacity, step) {
  const arr = []; for (const l of lines) densify(l, arr, step);
  const ll = new Float32Array(arr), nv = ll.length / 2, buf = new Float32Array(nv * 3);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(buf, 3));
  const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  m.frustumCulled = false; scene.add(m);
  return { ll, buf, g, m };
}
function updateLayer(L, liftM) {
  const lift = (exag * 0 + liftM) / A_M * 1, n = L.ll.length / 2;
  for (let i = 0; i < n; i++) {
    const lat = L.ll[i * 2], lon = L.ll[i * 2 + 1];
    pos(lat, lon, hUnits(geoidN(lat, lon)) + lift, L.buf, i * 3);
  }
  L.g.attributes.position.needsUpdate = true;
}
const landMesh = mesh(landTopo, landTopo.objects.land).coordinates;
const lakeLines = []; for (const rings of lakes) for (const r of rings) lakeLines.push(r);
const borderLines = mesh(countriesTopo, countriesTopo.objects.countries, (a, b) => a !== b).coordinates;
const grat = [];
for (let lo = -180; lo < 180; lo += 30) { const l = []; for (let la = -90; la <= 90; la += 2) l.push([lo, la]); grat.push(l); }
for (let la = -60; la <= 60; la += 30) { const l = []; for (let lo = -180; lo <= 180; lo += 2) l.push([lo, la]); grat.push(l); }
const layers = {
  coast: makeLayer([...landMesh, ...lakeLines], 0x0f2a22, 0.95, 1),
  borders: makeLayer(borderLines, 0xffffff, 0.45, 1),
  grid: makeLayer(grat, 0xffffff, 0.28, 2)
};
layers.borders.m.visible = false; layers.grid.m.visible = false;
function updateLines() {
  const lift = 1500 + 6 * exag / 100; // metres of clearance above the surface mesh
  updateLayer(layers.coast, lift); updateLayer(layers.borders, lift * 0.8); updateLayer(layers.grid, lift * 0.6);
}
function setCoastColor() { const l = mode === 'land' && enso === 'off'; layers.coast.m.material.color.set(l ? 0x3d4a36 : 0x10182b); layers.coast.m.material.opacity = l ? 0.6 : 0.9; }

/* ---------- sea currents (simplified mean paths, hand-drawn) ---------- */
const CUR = [
  ['Gulf Stream', 'w', [[-80, 25.5], [-79.5, 28], [-79, 31], [-76, 34.5], [-72, 37], [-65, 39], [-57, 40.5], [-50, 42]], [-70, 37.5]],
  ['North Atlantic Drift', 'w', [[-48, 43], [-40, 46], [-30, 50], [-20, 54], [-12, 58], [-5, 61.5]], [-28, 51]],
  ['Norwegian Current', 'w', [[-3, 62.5], [2, 65], [8, 68.5], [14, 71], [22, 72.5]], [5, 67]],
  ['Canary Current', 'c', [[-12, 42], [-13, 36], [-15.5, 30], [-18.5, 24], [-20, 18]], [-17, 27]],
  ['North Equatorial Current', 'w', [[-22, 15], [-32, 14], [-42, 14], [-52, 15], [-59, 16.5]], [-40, 14]],
  ['Caribbean Current', 'w', [[-62, 15], [-70, 15], [-78, 16.5], [-84, 19.5], [-86, 21.8], [-85.5, 24], [-83, 24], [-80.6, 24.4]], [-72, 15]],
  ['Labrador Current', 'c', [[-58, 60], [-55, 56], [-52, 52], [-49, 48], [-50, 44]], [-52, 53]],
  ['East Greenland Current', 'c', [[-5, 78], [-15, 73], [-21, 69], [-31, 66.3], [-39, 62.5], [-43, 59]], [-20, 70]],
  ['South Equatorial Current', 'w', [[8, -6], [-2, -4], [-12, -3], [-22, -3], [-31, -4]], [-12, -3]],
  ['Guiana Current', 'w', [[-34, -4], [-40, -1], [-46, 2], [-51, 6], [-56, 8.5], [-60, 11.5]], [-47, 3]],
  ['Brazil Current', 'w', [[-34, -9], [-37, -14], [-38, -19], [-40, -24], [-45, -28], [-49, -33], [-52, -37]], [-39, -21]],
  ['Falkland Current', 'c', [[-64, -54], [-63, -50], [-60, -46], [-57.5, -42], [-55.5, -39]], [-60, -46]],
  ['Benguela Current', 'c', [[16, -33], [13, -27], [11, -21], [9, -15], [6, -9]], [11, -22]],
  ['Guinea Current', 'w', [[-18, 6], [-10, 3.5], [-2, 3.5], [5, 3]], [-5, 3.5]],
  ['Agulhas Current', 'w', [[40, -17], [38, -22], [35.5, -27], [31.5, -31.5], [26, -35.5], [21, -37]], [35, -28]],
  ['South Equatorial Current', 'w', [[95, -12], [80, -12], [65, -12], [53, -13]], [75, -12]],
  ['West Australian Current', 'c', [[110, -38], [108, -32], [106.5, -26], [103, -20], [97, -15]], [106, -27]],
  ['Somali Current (summer)', 'w', [[44, -2], [47.5, 2], [50.5, 6.5], [53, 10.5], [56, 14]], [50, 5.5]],
  ['Kuroshio', 'w', [[124, 14], [123.5, 20], [124, 24.5], [128, 28.5], [133, 31.5], [139, 33.5], [143, 35.5]], [131, 30.5]],
  ['North Pacific Current', 'w', [[146, 37], [160, 40], [175, 42], [190, 43.5], [205, 45], [218, 46.5]], [180, 42.5]],
  ['Oyashio', 'c', [[165, 57], [160, 51.5], [155, 46.5], [149, 42.5], [145, 40]], [157, 48.5]],
  ['Alaska Current', 'w', [[-138, 48], [-134.5, 53], [-140, 58.5], [-147, 58.7], [-151, 56.3], [-157, 55]], [-140, 57]],
  ['California Current', 'c', [[-128, 46], [-127, 40], [-124.5, 34], [-120, 27], [-115.5, 21]], [-125, 36]],
  ['North Equatorial Current', 'w', [[-115, 13], [-135, 12], [-155, 12], [-175, 12], [-195, 12.5], [-212, 13], [-228, 13.5]], [-160, 12]],
  ['Equatorial Counter Current', 'w', [[140, 5.5], [160, 5.5], [180, 6], [200, 6.5], [225, 7], [250, 7.5], [268, 7.5]], [205, 6.5], 'ecc'],
  ['South Equatorial Current', 'w', [[-88, -2.5], [-105, -2.5], [-125, -3], [-145, -3.5], [-165, -4], [-185, -5], [-200, -6]], [-135, -3.2], 'sec'],
  ['Humboldt (Peru) Current', 'c', [[-76, -44], [-75, -37], [-73.5, -30], [-72.5, -23], [-76, -16], [-80.5, -9], [-84, -4]], [-74, -30]],
  ['East Australian Current', 'w', [[156, -17], [155, -23], [154.5, -28], [153, -33], [154, -37.5], [158, -40]], [155, -27]],
  ['Antarctic Circumpolar Current', 'c', [[-180, -58], [-150, -58], [-120, -57], [-90, -58], [-66, -58.7], [-45, -55.5], [-25, -52], [0, -50], [30, -49], [58, -51], [72, -51.2], [90, -52], [120, -54], [150, -56], [180, -58]], [-120, -57], 'acc', [[20, -49.5], [120, -54]]]
];
function spline(pts) {
  const out = [], n = pts.length, g = (i) => i < 0 ? [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]] : i >= n ? [2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1]] : pts[i];
  for (let i = 0; i < n - 1; i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2), st = Math.max(2, Math.ceil(Math.max(Math.abs(p2[0] - p1[0]), Math.abs(p2[1] - p1[1])) / 0.8));
    for (let s = 0; s < st; s++) { const t = s / st, t2 = t * t, t3 = t2 * t, q = (k) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3); out.push([q(0), q(1)]); }
  }
  out.push(pts[n - 1]); return out;
}
const CUR_VS = `uniform float width; attribute vec3 side; attribute vec3 nrm; attribute vec2 uvw; varying vec2 vU; varying float vF;
void main(){ vec3 p = position + side * uvw.y * width; vU = uvw; vF = dot(nrm, normalize(cameraPosition - p)); gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`;
const CUR_FS = `uniform vec3 color; uniform float scale; uniform float phase; uniform float len; uniform float fade; varying vec2 vU; varying float vF;
void main(){ if (vF <= 0.0) discard; float v = abs(vU.y);
  float t = fract(vU.x * scale - phase + v * 0.55);
  float core = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.5, 0.58, t)) * (1.0 - smoothstep(0.6, 0.72, v));
  float ends = mix(1.0, smoothstep(0.0, 0.04, vU.x) * smoothstep(0.0, 0.04, len - vU.x), fade);
  vec3 col = mix(vec3(0.01, 0.015, 0.05), color, core);
  float a = mix(0.26, 0.96, core) * (1.0 - smoothstep(0.82, 1.0, v)) * ends * smoothstep(0.0, 0.12, vF);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;
const currents = CUR.map(([name, type, pts, lab, id, labs]) => {
  const ll = spline(pts), n = ll.length, g = new THREE.BufferGeometry();
  const P = new Float32Array(n * 6), S = new Float32Array(n * 6), Nn = new Float32Array(n * 6), U = new Float32Array(n * 4), I = new Uint16Array((n - 1) * 6);
  for (let i = 0; i < n - 1; i++) { const a = i * 2; I.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6); }
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('side', new THREE.BufferAttribute(S, 3)); g.setAttribute('nrm', new THREE.BufferAttribute(Nn, 3)); g.setAttribute('uvw', new THREE.BufferAttribute(U, 2)); g.setIndex(new THREE.BufferAttribute(I, 1));
  const mat = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, vertexShader: CUR_VS, fragmentShader: CUR_FS,
    uniforms: { color: { value: new THREE.Color(type === 'w' ? 0xff5a36 : 0x56c8ff) }, width: { value: 0.02 }, scale: { value: 8 }, phase: { value: Math.random() }, len: { value: 1 }, fade: { value: id === 'acc' ? 0 : 1 } } });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 5; scene.add(mesh);
  return { name, type, ll, g, mat, mesh, id, labs: labs || [lab] };
});
function updateCurrents() {
  const c = [0, 0, 0];
  for (const C of currents) {
    const n = C.ll.length, P = C.g.attributes.position.array, S = C.g.attributes.side.array, Nn = C.g.attributes.nrm.array, U = C.g.attributes.uvw.array, ctr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const [lon, lat] = C.ll[i]; pos(lat, lon, hUnits(geoidN(lat, lon)) + 0.0006, c, 0); ctr.set(c, i * 3); }
    let u = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1) * 3, b = Math.min(n - 1, i + 1) * 3, k = i * 3;
      let tx = ctr[b] - ctr[a], ty = ctr[b + 1] - ctr[a + 1], tz = ctr[b + 2] - ctr[a + 2];
      const p = C.ll[i][1] * D2R, l = C.ll[i][0] * D2R, nx = Math.cos(p) * Math.cos(l), ny = Math.sin(p), nz = -Math.cos(p) * Math.sin(l);
      let sx = ny * tz - nz * ty, sy = nz * tx - nx * tz, sz = nx * ty - ny * tx; const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
      if (i > 0) u += Math.hypot(ctr[k] - ctr[k - 3], ctr[k + 1] - ctr[k - 2], ctr[k + 2] - ctr[k - 1]);
      for (let s = 0; s < 2; s++) { const o = (i * 2 + s) * 3; P[o] = ctr[k]; P[o + 1] = ctr[k + 1]; P[o + 2] = ctr[k + 2]; S[o] = sx; S[o + 1] = sy; S[o + 2] = sz; Nn[o] = nx; Nn[o + 1] = ny; Nn[o + 2] = nz; U[(i * 2 + s) * 2] = u; U[(i * 2 + s) * 2 + 1] = s ? 1 : -1; }
    }
    C.mat.uniforms.len.value = u;
    for (const k of ['position', 'side', 'nrm', 'uvw']) C.g.attributes[k].needsUpdate = true;
  }
}
let showCur = true;
const curMul = (id) => enso === 'en' ? ({ sec: 0.25, ecc: 1.9 }[id] || 1) : enso === 'ln' ? ({ sec: 1.7, ecc: 0.6 }[id] || 1) : 1;
function stepCurrents(dt, alt) {
  const w = Math.min(0.017, Math.max(0.0025, alt * 0.008)) * (enso === 'off' ? 1 : 0.6), sc = Math.pow(2, Math.round(Math.log2(1 / (w * 5.5))));
  for (const C of currents) { const un = C.mat.uniforms; un.width.value = w; un.scale.value = sc; un.phase.value = (un.phase.value + dt * 0.45 * curMul(C.id)) % 64; }
}

/* ---------- labels ---------- */
const LB = [
  // [name, lat, lon, tier, kind]
  ['Africa', 4, 20, 0, 'c'], ['Asia', 46, 90, 0, 'c'], ['Europe', 53, 20, 0, 'c'], ['North America', 46, -102, 0, 'c'], ['South America', -14, -60, 0, 'c'], ['Australia', -25, 134, 0, 'c'], ['Antarctica', -80, 40, 0, 'c'],
  ['Pacific Ocean', 15, -150, 0, 'o'], ['South Pacific', -25, -130, 0, 'o'], ['North Atlantic', 30, -42, 0, 'o'], ['South Atlantic', -22, -14, 0, 'o'], ['Indian Ocean', -15, 80, 0, 'o'], ['Arctic Ocean', 83, -30, 0, 'o'], ['Southern Ocean', -62, 100, 0, 'o'],
  ['Mediterranean Sea', 35, 18, 1, 's'], ['Caribbean Sea', 15, -75, 1, 's'], ['Gulf of Mexico', 25, -90, 1, 's'], ['Bering Sea', 58, -178, 1, 's'], ['Sea of Okhotsk', 55, 150, 1, 's'], ['Sea of Japan', 40, 134, 1, 's'], ['East China Sea', 29, 125, 1, 's'], ['South China Sea', 12, 114, 1, 's'], ['Philippine Sea', 18, 133, 1, 's'], ['Coral Sea', -17, 152, 1, 's'], ['Tasman Sea', -38, 160, 1, 's'], ['Arabian Sea', 15, 65, 1, 's'], ['Bay of Bengal', 14, 89, 1, 's'], ['Red Sea', 21, 38, 1, 's'], ['Persian Gulf', 27, 51, 1, 's'], ['Black Sea', 43.5, 34, 1, 's'], ['Caspian Sea', 42, 51, 1, 's'], ['Baltic Sea', 58, 20, 1, 's'], ['North Sea', 56, 3, 1, 's'], ['Norwegian Sea', 68, 2, 1, 's'], ['Barents Sea', 74, 38, 1, 's'], ['Kara Sea', 75, 70, 1, 's'], ['Laptev Sea', 76, 125, 1, 's'], ['Beaufort Sea', 72, -140, 1, 's'], ['Labrador Sea', 58, -55, 1, 's'], ['Hudson Bay', 60, -85, 1, 's'], ['Baffin Bay', 73, -65, 1, 's'], ['Weddell Sea', -72, -45, 1, 's'], ['Ross Sea', -75, 180, 1, 's'], ['Gulf of Guinea', 2, 2, 1, 's'], ['Gulf of Alaska', 58, -145, 1, 's'], ['Sargasso Sea', 28, -60, 1, 's'], ['Java Sea', -5, 110, 1, 's'], ['Banda Sea', -5, 128, 1, 's'], ['Andaman Sea', 12, 96, 1, 's'], ['Greenland Sea', 75, -6, 1, 's'],
  ['Adriatic Sea', 43, 15, 2, 's'], ['Aegean Sea', 39, 25, 2, 's'], ['Tyrrhenian Sea', 40, 12, 2, 's'], ['Ionian Sea', 38, 18, 2, 's'], ['Gulf of Aden', 12, 48, 2, 's'], ['Gulf of Bothnia', 63, 21, 2, 's'], ['Bay of Biscay', 45, -5, 2, 's'], ['English Channel', 50, -2, 2, 's'], ['Irish Sea', 53.5, -5, 2, 's'], ['Sea of Azov', 46, 36.5, 2, 's'], ['Gulf of Thailand', 10, 101, 2, 's'], ['Yellow Sea', 36, 123, 2, 's'], ['Celebes Sea', 3, 122, 2, 's'], ['Sulu Sea', 8, 120, 2, 's'], ['Timor Sea', -12, 127, 2, 's'], ['Gulf of California', 27, -111, 2, 's'], ['Gulf of St Lawrence', 48.5, -62, 2, 's'], ['Mozambique Channel', -18, 41, 2, 's'], ['Gulf of Carpentaria', -14, 140, 2, 's'], ['Great Australian Bight', -34, 130, 2, 's'],
  ['Lake Superior', 47.7, -87.5, 2, 'l'], ['Lake Michigan', 44, -87, 2, 'l'], ['Lake Huron', 45, -82, 2, 'l'], ['Lake Erie', 42.2, -81, 2, 'l'], ['Lake Ontario', 43.7, -77.9, 2, 'l'], ['Great Bear Lake', 66, -121, 2, 'l'], ['Great Slave Lake', 61.5, -114, 2, 'l'], ['Lake Winnipeg', 52.5, -98, 2, 'l'], ['Lake Victoria', -1, 33, 2, 'l'], ['Lake Tanganyika', -6.2, 29.5, 2, 'l'], ['Lake Malawi', -12, 34.5, 2, 'l'], ['Lake Chad', 13, 14, 2, 'l'], ['Lake Baikal', 53.5, 108, 2, 'l'], ['Lake Ladoga', 61, 31.5, 2, 'l'], ['Aral Sea', 45, 60, 2, 'l'], ['Lake Balkhash', 46.5, 74, 2, 'l'], ['Lake Titicaca', -15.8, -69.4, 2, 'l']
];
const labelHost = document.getElementById('labels');
const labels = LB.map(([name, lat, lon, tier, kind]) => {
  const el = document.createElement('div'); el.className = 'lb ' + kind; el.textContent = name; labelHost.appendChild(el);
  return { el, lat, lon, tier, p: new THREE.Vector3(), n: new THREE.Vector3() };
});
for (const C of currents) for (const [lon, lat] of C.labs) {
  const el = document.createElement('div'); el.className = 'lb k ' + C.type; el.textContent = C.name; labelHost.appendChild(el);
  labels.push({ el, lat, lon, tier: 1, cur: true, p: new THREE.Vector3(), n: new THREE.Vector3() });
}
function placeLabels() {
  const o = [0, 0, 0];
  for (const L of labels) {
    pos(L.lat, L.lon, hUnits(geoidN(L.lat, L.lon)) + 0.0004, o, 0); L.p.set(o[0], o[1], o[2]); L.n.copy(L.p).normalize();
  }
}
let showLabels = true;
const _v = new THREE.Vector3(), _c = new THREE.Vector3();
function updateLabels(d) {
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  _c.copy(camera.position);
  for (const L of labels) {
    let vis = showLabels && (L.cur ? (showCur && d < 2.7 && d > 1.01) : L.tier === 0 ? (d > 1.3 && d < 9) : L.tier === 1 ? (d < 3.3 && d > 1.04) : (d < 1.75 && d > 1.004));
    if (vis) {
      const facing = L.n.dot(_v.copy(_c).sub(L.p).normalize());
      const a = Math.min(1, Math.max(0, (facing - 0.1) * 4));
      if (a <= 0) vis = false;
      else {
        _v.copy(L.p).project(camera);
        if (_v.z > 1 || Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05) vis = false;
        else { L.el.style.transform = `translate(-50%,-50%) translate(${((_v.x + 1) / 2) * w}px,${((1 - _v.y) / 2) * h}px)`; L.el.style.opacity = a; }
      }
    }
    L.el.style.display = vis ? '' : 'none';
  }
}

/* ---------- satellite orbits (to scale; Earth-fixed schematic) ---------- */
const R_KM = 6378.137, MU = 398600.4418, TIME_X = 600;
const ORB = [
  { g: 'leo', name: 'ISS', alt: 415, inc: 51.6, planes: 1, per: 1, raan: 0 },
  { g: 'leo', name: 'Sentinel-2', alt: 786, inc: 98.6, planes: 1, per: 2, raan: 60, note: 'sun-synchronous' },
  { g: 'leo', name: 'Sentinel-6 / Jason-3', alt: 1336, inc: 66, planes: 1, per: 1, raan: 130, note: 'sea-level altimetry' },
  { g: 'meo', name: 'GPS', alt: 20180, inc: 55, planes: 6, per: 4, raan: 0 },
  { g: 'meo', name: 'Galileo', alt: 23222, inc: 56, planes: 3, per: 8, raan: 30 },
  { g: 'swm', name: 'Starlink 53°', labTxt: 'Starlink · 480–560 km', alt: 500, altTxt: '480–550', inc: 53, planes: 56, per: 22, raan: 0, col: 0xf1f4ff, size: 3.5, note: 'main shell, being lowered from 550 to 480 km' },
  { g: 'swm', name: 'Starlink 43°', noLab: true, alt: 480, altTxt: '~480', inc: 43, planes: 40, per: 18, raan: 3, col: 0xf1f4ff, size: 3.5 },
  { g: 'swm', name: 'Starlink 70°', noLab: true, alt: 540, inc: 70, planes: 18, per: 12, raan: 5, col: 0xf1f4ff, size: 3.5 },
  { g: 'swm', name: 'Starlink polar', noLab: true, alt: 560, inc: 97.6, planes: 12, per: 10, raan: 8, col: 0xf1f4ff, size: 3.5, note: 'over 10,000 Starlink satellites in all' },
  { g: 'swm', name: 'OneWeb', alt: 1200, inc: 87.9, planes: 12, per: 13, raan: 10, half: true, col: 0xff9ecf, size: 4.5, note: 'about 650 satellites' },
  { g: 'swm', name: 'Planet Doves', alt: 500, inc: 98, planes: 2, per: 25, raan: 100, col: 0xb6f07a, size: 4.5, note: '3U CubeSats, sun-synchronous' },
  { g: 'swm', name: 'Kinéis', alt: 650, inc: 97.9, planes: 5, per: 5, raan: 20, half: true, col: 0x7df9ff, size: 5.5, note: '25 nanosatellites, all shown' },
  { g: 'geo', name: 'Geostationary', alt: 35786, inc: 0, lons: [[0, 'Meteosat'], [-75.2, 'GOES-East'], [-137.2, 'GOES-West'], [140.7, 'Himawari']] }
];
const ORB_COL = { leo: 0xffd24a, meo: 0xc79bff, geo: 0x4de3a4 };
const periodMin = (alt) => (2 * Math.PI * Math.sqrt(Math.pow(R_KM + alt, 3) / MU)) / 60;
function orbPoint(r, inc, raan, u, out, k) {
  const ci = Math.cos(inc), si = Math.sin(inc), cO = Math.cos(raan), sO = Math.sin(raan), cu = Math.cos(u), su = Math.sin(u);
  out[k] = r * (cO * cu - sO * su * ci); out[k + 1] = r * su * si; out[k + 2] = -r * (sO * cu + cO * su * ci);
}
const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.beginPath(); x.arc(16, 16, 13, 0, 7); x.fill(); x.lineWidth = 3; x.strokeStyle = '#0b1020'; x.stroke(); return new THREE.CanvasTexture(c); })();
const orbGroups = { leo: new THREE.Group(), meo: new THREE.Group(), geo: new THREE.Group(), swm: new THREE.Group() };
const orbOn = { leo: true, meo: true, geo: true, swm: true };
const raanOf = (o, p) => ((o.raan || 0) + (p * (o.half ? 180 : 360)) / o.planes) * D2R;
for (const k in orbGroups) scene.add(orbGroups[k]);
const satLabels = [];
function satLabel(text, g) { const el = document.createElement('div'); el.className = 'lb q ' + g; el.textContent = text; labelHost.appendChild(el); const L = { el, g, p: new THREE.Vector3() }; satLabels.push(L); return L; }
const movers = [], culled = [];
for (const o of ORB) {
  const r = 1 + o.alt / R_KM, inc = o.inc * D2R, col = o.col || ORB_COL[o.g], grp = orbGroups[o.g];
  const planes = o.lons ? 1 : o.planes, nsat = o.lons ? o.lons.length : o.planes * o.per;
  for (let p = 0; p < (o.g === 'swm' ? 0 : planes); p++) {
    const raan = ((o.raan || 0) + (p * 360) / planes) * D2R, N = 256, a = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) orbPoint(r, inc, raan, (i / N) * 2 * Math.PI, a, i * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    const line = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: o.g === 'meo' ? 0.38 : 0.7 })); line.frustumCulled = false; grp.add(line);
  }
  const buf = new Float32Array(nsat * 3), src = new Float32Array(nsat * 3), pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(buf, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: col, size: o.size || 8, sizeAttenuation: false, map: dotTex, alphaTest: 0.5, transparent: true, depthTest: false })); pts.renderOrder = 6; pts.frustumCulled = false; grp.add(pts);
  if (o.lons) {
    o.lons.forEach(([lon, nm], i) => { src[i * 3] = r * Math.cos(lon * D2R); src[i * 3 + 1] = 0; src[i * 3 + 2] = -r * Math.sin(lon * D2R); satLabel(nm, o.g).p.set(src[i * 3], 0, src[i * 3 + 2]); });
    culled.push({ src, buf, pg });
    satLabel('Geostationary orbit · 35,786 km', o.g).p.set(r * Math.cos(60 * D2R), 0, -r * Math.sin(60 * D2R));
  } else { culled.push({ src, buf, pg }); movers.push({ o, r, inc, buf: src, li: (movers.length * 7) % nsat, rate: ((2 * Math.PI) / (periodMin(o.alt) * 60)) * TIME_X, lab: o.noLab ? null : satLabel(o.labTxt || `${o.name} · ${o.altTxt || o.alt.toLocaleString('en')} km`, o.g) }); }
}
let orbT = 0;
function stepOrbits(dt) {
  orbT += dt;
  for (const M of movers) {
    const { o } = M;
    for (let p = 0; p < o.planes; p++) for (let s = 0; s < o.per; s++) orbPoint(M.r, M.inc, raanOf(o, p), orbT * M.rate + (s / o.per) * 2 * Math.PI + p * 0.9, M.buf, (p * o.per + s) * 3);
    if (M.lab) M.lab.p.set(M.buf[M.li * 3], M.buf[M.li * 3 + 1], M.buf[M.li * 3 + 2]);
  }
  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
  for (const K of culled) {
    const s = K.src, b = K.buf;
    for (let i = 0; i < s.length; i += 3) {
      const dx = s[i] - cx, dy = s[i + 1] - cy, dz = s[i + 2] - cz, t = -(cx * dx + cy * dy + cz * dz) / (dx * dx + dy * dy + dz * dz);
      let hid = false; if (t > 0 && t < 1) { const qx = cx + t * dx, qy = cy + t * dy, qz = cz + t * dz; hid = qx * qx + qy * qy + qz * qz < 0.994; }
      if (hid) { b[i] = b[i + 1] = b[i + 2] = 1e7; } else { b[i] = s[i]; b[i + 1] = s[i + 1]; b[i + 2] = s[i + 2]; }
    }
    K.pg.attributes.position.needsUpdate = true;
  }
}
const _d = new THREE.Vector3(), _q = new THREE.Vector3();
function updateSatLabels(d) {
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight, C = camera.position;
  for (const L of satLabels) {
    let vis = showLabels && orbOn[L.g] && (L.g === 'leo' || L.g === 'swm' ? d < 14 : d > 2.2);
    if (vis) { _d.copy(L.p).sub(C); const t = -C.dot(_d) / _d.lengthSq(); if (t > 0 && t < 1 && _q.copy(C).addScaledVector(_d, t).length() < 1) vis = false; }
    if (vis) { _q.copy(L.p).project(camera); if (_q.z > 1 || Math.abs(_q.x) > 1.05 || Math.abs(_q.y) > 1.05) vis = false; else L.el.style.transform = `translate(-50%,-140%) translate(${((_q.x + 1) / 2) * w}px,${((1 - _q.y) / 2) * h}px)`; }
    L.el.style.display = vis ? '' : 'none';
  }
}

/* ---------- altitude-based zoom ---------- */
function fitAlt() { const a = Math.min(1, camera.aspect), half = Math.atan(Math.tan((camera.fov / 2) * D2R) * a); return 1.18 / Math.sin(half) - 1; }
const hMaxUnits = () => hUnits(EXT.max);
const minAlt = () => Math.max(0.0015, hMaxUnits() + 0.0015);
function setAlt(alt) {
  alt = Math.min(Math.max(alt, minAlt()), 48);
  camera.position.setLength(1 + alt);
}
const altNow = () => camera.position.length() - 1;
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault(); setAlt(altNow() * Math.exp(e.deltaY * 0.0016 * (e.deltaMode === 1 ? 16 : 1)));
}, { passive: false });
const ptrs = new Map(); let pinch0 = 0;
renderer.domElement.addEventListener('pointerdown', (e) => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
renderer.domElement.addEventListener('pointermove', (e) => {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], dd = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0 > 0) setAlt(altNow() * (pinch0 / dd)); pinch0 = dd; }
});
const upd = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; };
renderer.domElement.addEventListener('pointerup', upd); renderer.domElement.addEventListener('pointercancel', upd);

/* ---------- picking ---------- */
const ray = new THREE.Raycaster();
function pick(cx, cy) {
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
  const O = ray.ray.origin, D = ray.ray.direction;
  const hit = (R) => { const b = O.dot(D), c = O.lengthSq() - R * R, disc = b * b - c; if (disc < 0) return null; return O.clone().addScaledVector(D, -b - Math.sqrt(disc)); };
  let R = 1, res = null; const o = [0, 0, 0];
  for (let it = 0; it < 7; it++) {
    let p = hit(R); if (!p && it === 0) { R = 1 + Math.max(0, hMaxUnits()) * 0.8; p = hit(R); }
    if (!p) return null;
    const X = p.x, Y = -p.z, Z = p.y, lon = Math.atan2(Y, X) / D2R, lat = Math.atan2(Z, Math.hypot(X, Y) * (1 - E2)) / D2R, N = geoidN(lat, lon);
    pos(lat, lon, hUnits(N), o, 0); R = Math.hypot(o[0], o[1], o[2]); res = { lat, lon, N, p: new THREE.Vector3(o[0], o[1], o[2]) };
  }
  return res;
}
const marker = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
marker.renderOrder = 10; marker.visible = false; scene.add(marker);
const ring = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x6a6af4, depthTest: false }));
ring.renderOrder = 9; ring.visible = false; scene.add(ring);
const readout = document.getElementById('readout');
function fmtDeg(v, p, n) { return Math.abs(v).toFixed(2) + '° ' + (v >= 0 ? p : n); }
let sel = null;
function show(r) {
  if (!r) return; sel = r;
  marker.position.copy(r.p); ring.position.copy(r.p); marker.visible = ring.visible = true;
  readout.innerHTML = `<b>${fmtDeg(r.lat, 'N', 'S')} · ${fmtDeg(r.lon, 'E', 'W')}</b><span>Geoid height <b class="n">${r.N >= 0 ? '+' : '−'}${Math.abs(r.N).toFixed(1)} m</b> above the WGS84 ellipsoid</span>` + (enso === 'off' ? '' : isSea(r.lat, r.lon) ? `<span>Sea temperature <b class="n">${(() => { const a = sstAnom(enso, r.lat, r.lon); return (a >= 0 ? '+' : '−') + Math.abs(a).toFixed(1); })()} °C</b> compared with normal</span>` : '<span>Land: no sea temperature here</span>');
}
let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6) show(pick(e.clientX, e.clientY)); down = null; });
renderer.domElement.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && !e.buttons) show(pick(e.clientX, e.clientY)); });

/* ---------- fly-to ---------- */
let fly = null;
function dirFor(lat, lon) { const o = [0, 0, 0]; pos(lat, lon, 0, o, 0); return new THREE.Vector3(o[0], o[1], o[2]).normalize(); }
function flyTo(lat, lon, alt, then) {
  const from = camera.position.clone().normalize(), to = dirFor(lat, lon);
  fly = { from, to, a0: altNow(), a1: Math.max(alt, minAlt()), t: 0, q: new THREE.Quaternion().setFromUnitVectors(from, to), then };
  controls.autoRotate = false; document.getElementById('spin').checked = false;
}
function stepFly(dt) {
  if (!fly) return; fly.t = Math.min(1, fly.t + dt / 1.6);
  const e = fly.t < .5 ? 2 * fly.t * fly.t : 1 - Math.pow(-2 * fly.t + 2, 2) / 2;
  const q = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), fly.q, e);
  const alt = Math.exp(Math.log(fly.a0) + (Math.log(fly.a1) - Math.log(fly.a0)) * e);
  camera.position.copy(fly.from).applyQuaternion(q).setLength(1 + alt);
  if (fly.t >= 1) { const t = fly.then; fly = null; if (t) t(); }
}

/* ---------- UI wiring ---------- */
const $ = (id) => document.getElementById(id);
function seg(id, cb) { const root = $(id); root.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; [...root.children].forEach(x => x.setAttribute('aria-pressed', x === b)); cb(b.dataset.v); }); }
const ENSO_TXT = {
  en: `El Niño, December 1997 to February 1998. The trade winds weakened and warm water spread east along the equator, so the central and eastern Pacific were much warmer than normal. Niño 3.4 index: +${SST.n34.en.toFixed(1)} °C.`,
  ln: `La Niña, December 2010 to February 2011. Stronger trade winds pushed warm water west and pulled more cold water up off South America, so the equatorial Pacific was cooler than normal. Niño 3.4 index: −${Math.abs(SST.n34.ln).toFixed(1)} °C.`
};
const press = (id, v) => [...$(id).children].forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v));
seg('modeSeg', (v) => { setMode(v); press('ensoSeg', 'off'); $('ensoTxt').textContent = ''; if (sel) show(sel); });
seg('ensoSeg', (v) => { enso = v; applySurface(); $('ensoTxt').textContent = ENSO_TXT[v] || ''; press('modeSeg', v === 'off' ? mode : ''); if (v !== 'off') flyTo(0, -140, Math.min(fitAlt(), 2.2)); if (sel) show(sel); });
for (const k of ['leo', 'meo', 'geo', 'swm']) $(k).onchange = (e) => { orbOn[k] = orbGroups[k].visible = e.target.checked; };
$('orbList').innerHTML = ORB.map(o => { const T = periodMin(o.alt); return `<li><i style="background:#${(o.col || ORB_COL[o.g]).toString(16)}"></i><b>${o.name}</b> ${o.altTxt || o.alt.toLocaleString('en')} km · ${o.inc}° · ${T < 180 ? Math.round(T) + ' min' : Math.floor(T / 60) + ' h ' + String(Math.round(T % 60)).padStart(2, '0') + ' min'}${o.note ? ' · ' + o.note : ''}</li>`; }).join('');
$('cur').onchange = (e) => { showCur = e.target.checked; currents.forEach(C => C.mesh.visible = showCur); $('ck').style.display = showCur ? '' : 'none'; };
seg('flatSeg', (v) => { setFlat(v === 'sphere' ? 0 : +v); rebuild(); });
const exSl = $('exag'), exOut = $('exagOut');
const exFromSlider = () => Math.round(Math.pow(10, +exSl.value));
function showEx() { exOut.textContent = '×' + exag.toLocaleString('en'); }
let pend = false;
exSl.addEventListener('input', () => { exag = exFromSlider(); showEx(); if (!pend) { pend = true; requestAnimationFrame(() => { pend = false; rebuild(); }); } });
$('coast').onchange = (e) => layers.coast.m.visible = e.target.checked;
$('borders').onchange = (e) => layers.borders.m.visible = e.target.checked;
$('grid').onchange = (e) => layers.grid.m.visible = e.target.checked;
$('lab').onchange = (e) => showLabels = e.target.checked;
$('spin').onchange = (e) => controls.autoRotate = e.target.checked;
function rebuild() {
  updateGlobe(); updateLines(); updateCurrents(); placeLabels();
  if (sel) { const r = pick0(sel); if (r) show(r); }
  setAlt(altNow());
}
function pick0(s) { const o = [0, 0, 0]; pos(s.lat, s.lon, hUnits(s.N), o, 0); return { ...s, p: new THREE.Vector3(o[0], o[1], o[2]) }; }
const E = EXT;
const fmtAt = (la, lo) => `${Math.abs(la).toFixed(2)}°${la >= 0 ? 'N' : 'S'} ${Math.abs(lo).toFixed(2)}°${lo >= 0 ? 'E' : 'W'}`;
const jumps = {
  low: () => flyTo(E.minAt[0], E.minAt[1], 0.35, () => show(pick0({ lat: E.minAt[0], lon: E.minAt[1], N: E.min }))),
  high: () => flyTo(E.maxAt[0], E.maxAt[1], 0.35, () => show(pick0({ lat: E.maxAt[0], lon: E.maxAt[1], N: E.max }))),
  atl: () => flyTo(50, -30, 1.1), eur: () => flyTo(46, 12, 0.5), gl: () => flyTo(45, -84, 0.12), reset: () => flyTo(20, 10, fitAlt()), orb: () => flyTo(25, 10, (fitAlt() + 1) * 6.9 - 1)
};
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => jumps[b.dataset.go]());
$('panelBtn').onclick = () => document.body.classList.toggle('open');

/* ---------- resize / loop ---------- */
function resize() { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px'; camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

setMode('geoid'); showEx();
updateGlobe(); updateLines(); updateCurrents(); placeLabels();
camera.position.setLength(1 + fitAlt()); camera.lookAt(0, 0, 0);
const clock = new THREE.Clock(); controls.autoRotate = true;
function loop() {
  const dt = Math.min(clock.getDelta(), 0.05), alt = altNow();
  stepFly(dt); stepCurrents(dt, alt); stepOrbits(dt);
  controls.rotateSpeed = Math.min(0.9, Math.max(0.03, alt * 0.5));
  controls.autoRotateSpeed = Math.min(0.6, Math.max(0.02, alt * 0.3));
  controls.update();
  const d = camera.position.length();
  camera.near = Math.max(0.0003, (d - 1 - Math.max(0, hMaxUnits())) * 0.3); camera.far = d + 9; camera.updateProjectionMatrix();
  const s = Math.max(0.0006, alt * 0.012); marker.scale.setScalar(s * 0.55); ring.scale.setScalar(s);
  renderer.render(scene, camera); updateLabels(d); updateSatLabels(d);
  $('alt').textContent = (alt * A_M / 1000 < 100 ? (alt * A_M / 1000).toFixed(0) : Math.round(alt * A_M / 1000 / 10) * 10).toLocaleString('en') + ' km';
  requestAnimationFrame(loop);
}
loop();
window.__earth = { geoidN, sstAnom, flyTo, camera, jumps, get exag() { return exag; } };
