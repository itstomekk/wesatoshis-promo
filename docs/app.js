import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/* ------------------------------------------------------------------ helpers */
const $ = (s, r = document) => r.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const MM = 0.1;                       // CAD mm -> scene cm
const isDesktop = () => innerWidth > 860;
const stage = $('#stage');
const stageW = () => stage.clientWidth || innerWidth;
const stageH = () => stage.clientHeight || innerHeight;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ renderer / scene */
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isDesktop() ? 2 : 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;
scene.environmentIntensity = 0.8; scene.environmentRotation.y = 2.4;

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.075;
controls.minDistance = 2.2; controls.maxDistance = 90; controls.enablePan = false;
controls.rotateSpeed = 0.8; controls.zoomSpeed = 0.8;

const key = new THREE.DirectionalLight(0xfff0dd, 2.0); key.position.set(4, 10, 6); scene.add(key);
const fill = new THREE.DirectionalLight(0x9db8ff, 0.55); fill.position.set(-7, 3, -2); scene.add(fill);
const rim = new THREE.DirectionalLight(0xF7931A, .7); rim.position.set(-4, 2, -8); scene.add(rim);
const under = new THREE.DirectionalLight(0xdfe6ff, 0.8); under.position.set(2, -8, 3); scene.add(under);

/* ground blob shadow */
const ground = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 6, 128, 128, 126);
  gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(.45, 'rgba(0,0,0,.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(16, 11), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: .9 }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = -1; scene.add(m); return m;
})();

/* ------------------------------------------------------------------ procedural textures */
function brushed() {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); const r = rng(7);
  g.fillStyle = '#8d8e93'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 11000; i++) {
    const y = r() * S, x = r() * S, len = 60 + r() * 520, a = .015 + r() * .07;
    g.strokeStyle = r() < .5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`; g.lineWidth = .5 + r() * 1.3;
    for (const ox of [0, -S]) { g.beginPath(); g.moveTo(x + ox, y); g.lineTo(x + ox + len, y + (r() - .5) * 1.4); g.stroke(); }
  }
  const mk = (cs) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = cs; return t; };
  return { color: mk(THREE.SRGBColorSpace), data: mk(THREE.NoColorSpace) };
}
function planarUV(geo, sx = .22, sy = .22, ox = 0, oy = 0) {
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[2 * i] = p.getX(i) * sx + ox; uv[2 * i + 1] = p.getZ(i) * sy + oy; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
function pcbUV(geo, mirror) {
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    let u = (p.getX(i) + 4.1) / 8.2; if (mirror) u = 1 - u;
    uv[2 * i] = u; uv[2 * i + 1] = 1 - (-p.getZ(i) + 2.65) / 5.3;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
const loadTex = (url, cs = THREE.SRGBColorSpace) => new Promise((res) => new THREE.TextureLoader().load(url, t => { t.colorSpace = cs; t.anisotropy = 8; res(t); }, undefined, () => res(null)));
const loadImg = (url) => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });

/* ------------------------------------------------------------------ OLED screens (pixel art, 128x64) */
const SCR = { W: 128, H: 64, K: 4 };
const scrCanvas = document.createElement('canvas'); scrCanvas.width = SCR.W * SCR.K; scrCanvas.height = SCR.H * SCR.K;
const scrTex = new THREE.CanvasTexture(scrCanvas); scrTex.colorSpace = THREE.SRGBColorSpace; scrTex.anisotropy = 8;
const tmp = document.createElement('canvas'); tmp.width = SCR.W; tmp.height = SCR.H; const tg = tmp.getContext('2d', { willReadFrequently: true });
const MONO = '"DejaVu Sans Mono","Liberation Mono","Courier New",Consolas,monospace';
function qrPattern(x0, y0, n, px) {
  const r = rng(42); const m = [];
  for (let y = 0; y < n; y++) { m[y] = []; for (let x = 0; x < n; x++) m[y][x] = r() < .5; }
  const finder = (fx, fy) => { for (let y = -1; y < 8; y++) for (let x = -1; x < 8; x++) { const X = fx + x, Y = fy + y; if (X < 0 || Y < 0 || X >= n || Y >= n) continue; const edge = x === 0 || x === 6 || y === 0 || y === 6, core = x >= 2 && x <= 4 && y >= 2 && y <= 4; m[Y][X] = (x >= 0 && x <= 6 && y >= 0 && y <= 6) && (edge || core); } };
  finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) tg.fillRect(x0 + x * px, y0 + y * px, px, px);
}
const SCREENS = [
  { id: 'balance', draw() { tg.font = `bold 10px ${MONO}`; tg.fillText('WESATOSHIS', 4, 10); tg.font = `bold 9px ${MONO}`; tg.fillText('LN', 106, 10);
      tg.font = `bold 21px ${MONO}`; tg.fillText('B', 4, 42); tg.fillRect(9, 20, 1, 4); tg.fillRect(13, 20, 1, 4); tg.fillRect(9, 42, 1, 4); tg.fillRect(13, 42, 1, 4);
      tg.font = `bold 19px ${MONO}`; tg.fillText('21,000', 22, 41); tg.font = `bold 10px ${MONO}`; tg.fillText('sats', 100, 41);
      tg.font = `9px ${MONO}`; tg.fillText('Lightning ready', 4, 58); } },
  { id: 'nwc', draw() { tg.font = `bold 10px ${MONO}`; tg.fillText('NOSTR Wallet Connect', 2, 10); tg.font = `8px ${MONO}`;
      ['Would you like to add', 'wss://relay.getalby.com', '/v1 (NWC)?'].forEach((s, i) => tg.fillText(s, 2, 25 + i * 10)); tg.font = `bold 9px ${MONO}`; tg.fillText('Press OK to confirm', 2, 61); } },
  { id: 'scan', draw() { tg.font = `bold 10px ${MONO}`; tg.fillText('Scan QR', 2, 10); qrPattern(6, 17, 21, 2);
      tg.font = `8px ${MONO}`; ['Invoice · Wi-Fi', 'or your node', '(btcnode:...)'].forEach((s, i) => tg.fillText(s, 56, 28 + i * 10)); } },
  { id: 'node', draw() { tg.font = `bold 10px ${MONO}`; tg.fillText('Connect node', 2, 10); tg.font = `9px ${MONO}`;
      ['btcnode:192.168.1.10', ':8333', 'SPV · no Electrum'].forEach((s, i) => tg.fillText(s, 2, 27 + i * 13)); } },
  { id: 'pin', draw() { tg.font = `bold 10px ${MONO}`; tg.fillText('Enter PIN', 2, 10); tg.font = `bold 21px ${MONO}`;
      tg.fillText('••••', 4, 42); tg.font = `8px ${MONO}`; tg.fillText('Wrong PIN = game', 4, 58); } },
];
let curScreen = 0;
function drawScreen(i) {
  curScreen = i; tg.clearRect(0, 0, SCR.W, SCR.H); tg.fillStyle = '#fff'; tg.textBaseline = 'alphabetic'; SCREENS[i].draw();
  const d = tg.getImageData(0, 0, SCR.W, SCR.H).data; const g = scrCanvas.getContext('2d'); const K = SCR.K;
  g.fillStyle = '#03060b'; g.fillRect(0, 0, scrCanvas.width, scrCanvas.height);
  for (let y = 0; y < SCR.H; y++) for (let x = 0; x < SCR.W; x++) {
    const a = d[(y * SCR.W + x) * 4 + 3]; if (a < 100) continue;
    const hdr = y < 14; g.shadowColor = hdr ? 'rgba(60,200,255,.9)' : 'rgba(200,230,255,.7)'; g.shadowBlur = 5;
    g.fillStyle = hdr ? '#4fd6ff' : '#eef7ff'; g.fillRect(x * K + .4, y * K + .4, K - 1, K - 1);
  }
  g.shadowBlur = 0; scrTex.needsUpdate = true;
}

/* decal printed on the cover (wordmark, logo, button icons) */
async function makeDecal() {
  const PPM = 20, W = 86 * PPM, H = 57 * PPM, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const X = x => (x + 43) * PPM, Y = y => (28.5 - y) * PPM;
  const ink = 'rgba(22,23,27,.93)'; g.fillStyle = ink; g.strokeStyle = ink; g.lineCap = 'round'; g.lineJoin = 'round';
  const logo = await loadImg('assets/logo_ws.png');
  if (logo) { const h = 6.6 * PPM, w = h * logo.width / logo.height; const t = document.createElement('canvas'); t.width = w; t.height = h; const tc = t.getContext('2d'); tc.drawImage(logo, 0, 0, w, h); tc.globalCompositeOperation = 'source-in'; tc.fillStyle = ink; tc.fillRect(0, 0, w, h); g.drawImage(t, X(-34), Y(-18.6)); }
  g.font = `900 ${4.9 * PPM}px "Arial Black","Inter","Helvetica Neue",Arial,sans-serif`; g.textBaseline = 'alphabetic';
  try { g.letterSpacing = `${.28 * PPM}px`; } catch (e) { }
  g.fillText('WESATOSHIS', X(-25.2), Y(-20.4));
  g.lineWidth = .5 * PPM;
  const chev = (cx, cy, dir) => { const s = 1.5 * PPM; g.beginPath(); if (dir === 'up') { g.moveTo(X(cx) - s, Y(cy) + s * .5); g.lineTo(X(cx), Y(cy) - s * .5); g.lineTo(X(cx) + s, Y(cy) + s * .5); } else if (dir === 'down') { g.moveTo(X(cx) - s, Y(cy) - s * .5); g.lineTo(X(cx), Y(cy) + s * .5); g.lineTo(X(cx) + s, Y(cy) - s * .5); } else { g.moveTo(X(cx) + s * .5, Y(cy) - s); g.lineTo(X(cx) - s * .5, Y(cy)); g.lineTo(X(cx) + s * .5, Y(cy) + s); } g.stroke(); };
  chev(-22.4, 15.4, 'up'); chev(-22.4, 2.25, 'down'); chev(35.1, -3.4, 'left');
  g.font = `800 ${2.5 * PPM}px "Arial Black",Arial,sans-serif`; try { g.letterSpacing = '0px'; } catch (e) { } g.textAlign = 'center'; g.fillText('OK', X(23.1), Y(-4.2));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

function batteryLabel() {
  const c = document.createElement('canvas'); c.width = 1000; c.height = 680; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 1000, 680); gr.addColorStop(0, '#dfe2e6'); gr.addColorStop(.5, '#c4c8ce'); gr.addColorStop(1, '#d9dce1'); g.fillStyle = gr; g.fillRect(0, 0, 1000, 680);
  g.fillStyle = '#16181c'; g.font = '800 92px Arial,sans-serif'; g.fillText('HSL 303450', 60, 160); g.font = '700 64px Arial,sans-serif'; g.fillText('3.7V  500mAh', 60, 250);
  g.font = '500 42px Arial,sans-serif'; g.fillText('Li-ion polymer  ·  1.85Wh', 60, 320); g.fillText('Charge: 4.2V  ·  CE  FCC  RoHS', 60, 380);
  g.fillStyle = '#c0392b'; g.fillRect(60, 430, 120, 14); g.fillStyle = '#16181c'; g.fillRect(190, 430, 120, 14); g.font = '500 34px Arial,sans-serif'; g.fillText('+  /  –', 330, 446);
  g.font = '500 30px Arial,sans-serif'; g.fillStyle = '#44484f'; g.fillText('Do not puncture · do not short-circuit', 60, 560);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

/* ------------------------------------------------------------------ materials */
const br = brushed();
const M = {
  alu: new THREE.MeshPhysicalMaterial({ color: 0xdcdee3, metalness: 1, roughness: .5, map: br.color, roughnessMap: br.data, bumpMap: br.data, bumpScale: .35, anisotropy: .5, envMapIntensity: 1.15, side: THREE.DoubleSide }),
  shell: new THREE.MeshPhysicalMaterial({ color: 0x2b2c32, metalness: .08, roughness: .55, clearcoat: .2, clearcoatRoughness: .55, envMapIntensity: .7, side: THREE.DoubleSide }),
  pcbTop: new THREE.MeshStandardMaterial({ color: 0xdadada, roughness: .52, metalness: .05 }), pcbBot: new THREE.MeshStandardMaterial({ color: 0xdadada, roughness: .52, metalness: .05 }),
  pcbEdge: new THREE.MeshStandardMaterial({ color: 0x6d7d3a, roughness: .7 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xc4c7cc, metalness: 1, roughness: .3 }),
  darkMetal: new THREE.MeshStandardMaterial({ color: 0x6c7076, metalness: 1, roughness: .38 }),
  cap: new THREE.MeshStandardMaterial({ color: 0x0f1012, roughness: .4, metalness: .1 }),
  oled: new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: .3, metalness: .4 }),
  flex: new THREE.MeshStandardMaterial({ color: 0xe08a1e, roughness: .55, metalness: .05, side: THREE.DoubleSide }),
  swBody: new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: .38, metalness: .25 }),
  black: new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: .55, metalness: .1 }),
  red: new THREE.MeshStandardMaterial({ color: 0xd1302a, roughness: .45 }),
  vc: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5, metalness: .15 }),
  esp: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .34, metalness: .75 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xcb9a3e, metalness: 1, roughness: .32 }),
  pc: new THREE.MeshPhysicalMaterial({ color: 0x0d1015, metalness: 0, roughness: .03, transparent: true, opacity: .3, clearcoat: 1, clearcoatRoughness: .02, envMapIntensity: 1.6, depthWrite: false }),
  screen: new THREE.MeshBasicMaterial({ map: scrTex, toneMapped: false }),
  decal: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
  hex: new THREE.MeshBasicMaterial({ color: 0x15161a, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
};
const nodeMat = {
  back_shell: M.shell, top_cover: M.alu, pcb_edge: M.pcbEdge,
  sw_up_body: M.swBody, sw_down_body: M.swBody, sw_back_body: M.swBody, sw_ok_body: M.swBody,
  sw_up_cap: M.cap, sw_down_cap: M.cap, sw_back_cap: M.cap, sw_ok_cap: M.cap,
  oled_glass: M.oled, oled_flex: M.flex, esp32: M.esp, usbc: M.steel, sdcard: M.darkMetal, buzzer: M.black,
  power_switch: M.darkMetal, power_knob: M.red, chips: M.black, tact_switches: M.darkMetal, smd_front: M.vc, smd_back: M.vc, qr_scanner: M.vc,
};
for (const i of [0, 1, 2, 3]) { nodeMat[`screw_${i}`] = M.steel; nodeMat[`insert_${i}`] = M.brass; }

/* ------------------------------------------------------------------ model assembly */
const LAYERS = {
  window: { off: 2.7 }, screws: { off: 5.0, spin: true }, cover: { off: 1.5 }, pcb: { off: 0 }, battery: { off: -1.25 }, inserts: { off: -1.7 }, shell: { off: -2.7 },
};
const layer = {}; for (const k in LAYERS) { layer[k] = new THREE.Group(); layer[k].name = k; scene.add(layer[k]); }
const nodes = {}; const blockers = []; let capMeshes = [];
const fitState = { rad: 5.4 };

async function build() {
  const loader = new GLTFLoader();
  const [gltf, pcbTop, pcbBot, decalTex] = await Promise.all([
    loader.loadAsync('assets/card.glb', e => { if (e.total) { $('#bar').style.width = (e.loaded / e.total * 90) + '%'; } }),
    loadTex('assets/pcb_top.jpg'), loadTex('assets/pcb_bottom.jpg'), makeDecal(),
  ]);
  $('#bar').style.width = '96%';
  gltf.scene.traverse(o => { if (o.isMesh) nodes[o.name || o.parent.name] = o; });
  M.pcbTop.map = pcbTop; M.pcbBot.map = pcbBot; M.decal.map = decalTex;

  for (const [name, m] of Object.entries(nodes)) {
    m.material = nodeMat[name] || (name === 'pcb_top' ? M.pcbTop : name === 'pcb_bottom' ? M.pcbBot : M.black);
    m.geometry.computeBoundingBox();
    let L = 'pcb';
    if (name === 'back_shell') L = 'shell'; else if (name === 'top_cover') L = 'cover'; else if (name.startsWith('screw_')) L = 'screws'; else if (name.startsWith('insert_')) L = 'inserts';
    layer[L].add(m); m.userData.layer = L;
  }
  planarUV(nodes.top_cover.geometry, .28, .28); planarUV(nodes.back_shell.geometry, .28, .28);
  pcbUV(nodes.pcb_top.geometry, false); pcbUV(nodes.pcb_bottom.geometry, true);
  // ESP32 vertex colours: silver shield / dark antenna PCB (antenna end is toward the board's top edge = -z)
  { const g = nodes.esp32.geometry, p = g.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const ant = p.getZ(i) < -2.0; const c = ant ? [.05, .13, .09] : [.8, .82, .86]; col.set(c, i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
  for (const n of ['smd_front', 'smd_back', 'qr_scanner']) { const g = nodes[n].geometry; if (g.attributes.color && g.attributes.color.itemSize === 4) { const a = g.attributes.color, c3 = new Float32Array(a.count * 3); for (let i = 0; i < a.count; i++) { c3[3 * i] = a.getX(i); c3[3 * i + 1] = a.getY(i); c3[3 * i + 2] = a.getZ(i); } g.setAttribute('color', new THREE.BufferAttribute(c3, 3)); } }

  // polycarbonate window (CNC cut 36.1 x 20.1 mm), sits just under the cover surface
  { const w = 3.61, h = 2.01, r = .16, s = new THREE.Shape();
    s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    const g = new THREE.ExtrudeGeometry(s, { depth: .05, bevelEnabled: false, curveSegments: 6 }); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, M.pc); m.position.set(0, .02, -1.45); m.renderOrder = 3; m.name = 'window'; nodes.window = m; { const e = new THREE.LineSegments(new THREE.EdgesGeometry(g, 20), new THREE.LineBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: .55 })); e.position.copy(m.position); layer.window.add(e); } m.userData.layer = 'window'; layer.window.add(m); }
  // live OLED picture on the module glass
  { const g = new THREE.PlaneGeometry(3.1, 1.55); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, M.screen); m.position.set(0, .0262, -1.46); m.name = 'screen'; nodes.screen = m; m.userData.layer = 'pcb'; layer.pcb.add(m); }
  // printed decal on the cover
  { const g = new THREE.PlaneGeometry(8.6, 5.7); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, M.decal); m.position.y = .0805; m.renderOrder = 2; m.name = 'decal'; nodes.decal = m; m.userData.layer = 'cover'; layer.cover.add(m); }
  // hex sockets in the screw heads
  for (let i = 0; i < 4; i++) { const sc = nodes[`screw_${i}`]; const b = sc.geometry.boundingBox; const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    const g = new THREE.CircleGeometry(.09, 6); g.rotateX(-Math.PI / 2); const h = new THREE.Mesh(g, M.hex); h.position.set(cx, .0803, cz); layer.screws.add(h); sc.userData.cx = cx; sc.userData.cz = cz; }
  // battery HSL 303450 3.7V 500mAh (approximate, from the photo): 50 x 34 x 3 mm, centred at CAD (11, 7)
  { const g = new RoundedBoxGeometry(5.0, .3, 3.4, 3, .035); const lab = batteryLabel();
    const sil = new THREE.MeshStandardMaterial({ color: 0x8d97aa, metalness: .6, roughness: .4 });
    const labM = new THREE.MeshStandardMaterial({ map: lab, metalness: .25, roughness: .45 });
    const m = new THREE.Mesh(g, [sil, sil, sil, labM, sil, sil]); m.position.set(1.1, -.44, -.7); m.name = 'battery'; nodes.battery = m; m.userData.layer = 'battery'; layer.battery.add(m);
    const gm = labM.map; gm.wrapS = THREE.RepeatWrapping; gm.repeat.x = -1; gm.offset.x = 1; }
  // line-art edges so ghosted shells stay readable
  for (const n of ['top_cover', 'back_shell']) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(nodes[n].geometry, 35), new THREE.LineBasicMaterial({ color: 0xF7931A, transparent: true, opacity: 0, depthWrite: false })); nodes[n].userData.edges = e; layer[nodes[n].userData.layer].add(e); }

  // tact switches are 3.4 mm tall in the STEP and would poke 1.4 mm through the cover; squash them so they sit flush like the real buttons
  for (const k of ['up', 'down', 'back', 'ok']) { const b = nodes[`sw_${k}_body`], s0 = (.082 + .12) / (.22 + .12); b.scale.y = s0; b.position.y = -.12 * (1 - s0); }
  capMeshes = ['sw_up_cap', 'sw_down_cap', 'sw_back_cap', 'sw_ok_cap'].map(n => nodes[n]);
  for (const n of ['top_cover', 'back_shell', 'pcb_top', 'pcb_bottom', 'pcb_edge', 'battery']) { blockers.push(nodes[n]); }
  for (const m of [M.pcbTop, M.pcbBot, M.pcbEdge]) m.side = THREE.DoubleSide;
  nodes.battery.material.forEach(m => m.side = THREE.DoubleSide);
  buildHotspots();
}

/* ------------------------------------------------------------------ hotspots */
const HOT = [
  { id: 'oled', node: 'oled_glass', side: 'front', anchor: [1.72, .09, -2.3], pr: 1, outside: true, t: 'OLED display', s: 'DST-013 · cyan/white UI', d: 'Small black OLED for addresses, invoices and prompts — for example the Nostr Wallet Connect confirmation. Mounted on an orange flex ribbon.' },
  { id: 'pcb', node: 'pcb_top', side: 'front', anchor: [-3.7, -.1, 2.3], pr: 2, noInside: true, t: 'Main PCB', s: '82 × 53 mm · front: OLED + buttons', d: 'Green two-sided board: OLED and four buttons on the front, ESP32-S3, USB-C, microSD, buzzer and scanner on the back.' },
  { id: 'flex', node: 'oled_flex', side: 'front', pr: 2, t: 'Flex ribbon', s: 'XF1116-07A-Y', d: 'Orange flex cable linking the OLED module to the board connector.' },
  { id: 'buttons', node: 'sw_ok_cap', side: 'front', pr: 2, outside: true, t: '4 tactile buttons', s: 'SW1–SW4 · UP / DOWN / BACK / OK', d: 'Four SMD tactile switches sit under the cover cut-outs. Press the buttons in the 3D model to cycle the demo screens.' },
  { id: 'window', node: 'window', side: 'front', pr: 2, noInside: true, t: 'Polycarbonate window', s: 'CNC-cut · clear', d: 'Clear polycarbonate sheet cut from the published G-code (≈36 × 20 mm) protects the screen.' },
  { id: 'screw', node: 'screw_1', side: 'front', pr: 2, t: 'M2.5 × 6 screws', s: '4 corners · flush', d: 'Four stainless M2.5 × 6 mm screws clamp the cover to the back shell.' },
  { id: 'cover', node: 'top_cover', side: 'edge', anchor: [0, -.06, 2.9], pr: 2, noInside: true, t: 'Top cover', s: 'brushed aluminium look', d: 'Top part of the open-hardware enclosure with the display window, four button openings and corner screw holes.' },
  { id: 'esp32', node: 'esp32', side: 'back', pr: 1, t: 'ESP32-S3-WROOM-1', s: 'Wi-Fi + BLE · PCB antenna', d: 'Espressif ESP32-S3 module is the brain of the card; its PCB antenna sits at the board edge, clear of metal.' },
  { id: 'qr', node: 'qr_scanner', side: 'back', pr: 1, t: 'QR scanner', s: 'GM803 module', d: 'Scanner module looks out through a lens opening in the back shell — it reads QR codes for invoices, Wi-Fi and node-connection codes on the fly. (Shape approximated.)' },
  { id: 'battery', node: 'battery', side: 'back', anchor: [3.6, -.62, -.7], pr: 1, t: 'Battery', s: 'HSL 303450 · 3.7 V · approx. shape', d: 'Flat 50 × 34 × 3 mm Li-ion cell under the board. Capacity is advertised as 1000 mAh but the reference photo shows 500 mAh — not fixed here. (Position approximated.)' },
  { id: 'usbc', node: 'usbc', side: 'edge', pr: 1, t: 'USB-C', s: 'charge + data', d: 'USB-C port for charging and programming, reachable through a cut-out in the bottom edge.' },
  { id: 'sd', node: 'sdcard', side: 'edge', pr: 2, t: 'microSD slot', s: 'TF-015', d: 'microSD card slot on the bottom edge.' },
  { id: 'power', node: 'power_switch', side: 'edge', pr: 1, outside: true, t: 'Power switch', s: 'slide · bottom edge', d: 'Small slide switch with a red actuator turns the card on and off.' },
  { id: 'buzzer', node: 'buzzer', side: 'back', pr: 3, t: 'Buzzer', s: 'BEEP', d: 'Tiny SMD buzzer for audible feedback.' },
  { id: 'shell', node: 'back_shell', side: 'edge', anchor: [0, -.47, 2.9], pr: 2, noInside: true, t: 'Back shell', s: '3D-printed', d: 'Printable back chassis from the published STL. It carries the brass heat-set inserts and has openings for USB-C, microSD, the switch and the scanner lens.' },
  { id: 'insert', node: 'insert_1', side: 'back', pr: 3, noInside: true, t: 'Brass inserts ×4', s: 'M2.5 · heat-set', d: 'Four heat-set brass inserts give durable threads in the printed back part.' },
  { id: 'antenna', node: 'esp32', side: 'back', pr: 1, t: 'PCB antenna', s: 'ESP32-S3 · board edge', d: "The module's PCB antenna sits at the board's edge, clear of the metal shield." },
  { id: 'chips', node: 'chips', side: 'back', pr: 3, t: 'Support ICs', s: 'power + interface', d: 'Small support chips clustered around the ESP32-S3 module.' },
  { id: 'smd', node: 'smd_back', side: 'back', pr: 3, t: 'SMD passives', s: 'resistors · capacitors', d: 'Tiny surface-mount resistors and capacitors across the board.' },
  { id: 'board', node: 'pcb_edge', side: 'edge', pr: 2, noInside: true, t: 'Board outline', s: '82 × 53 mm · mounting holes', d: 'Two-sided board with corner mounting holes for the enclosure screws.' },
];
const hsEls = {}, anchors = {};
function buildHotspots() {
  const box = new THREE.Box3();
  for (const h of HOT) {
    const m = nodes[h.node]; box.setFromObject(m); const c = box.getCenter(new THREE.Vector3());
    let p;
    if (h.anchor) p = new THREE.Vector3(...h.anchor);
    else if (h.id === 'antenna') p = new THREE.Vector3(c.x, c.y, box.min.z - .2);
    else if (h.side === 'front') p = new THREE.Vector3(c.x, box.max.y + .05, c.z);
    else if (h.side === 'back') p = new THREE.Vector3(c.x, box.min.y - .05, c.z);
    else p = new THREE.Vector3(c.x, c.y, box.max.z + .05);
    const a = new THREE.Object3D(); a.position.copy(p); layer[m.userData.layer].add(a); anchors[h.id] = a;
    const ca = new THREE.Object3D(); ca.position.copy(c); layer[m.userData.layer].add(ca); anchors[h.id + '_c'] = ca;
    const el = document.createElement('div'); el.className = 'hs R'; el.innerHTML = `<i class="ln"></i><i class="dot"></i><button class="lab">${h.t}<small>${h.s}</small></button>`;
    const lab = el.querySelector('.lab');
    lab.addEventListener('click', () => select(h.id));
    lab.addEventListener('mouseenter', () => preview(h.id));
    lab.addEventListener('mouseleave', () => unpreview(h.id));
    lab.addEventListener('focus', () => preview(h.id));
    lab.addEventListener('blur', () => unpreview(h.id));
    $('#hotspots').appendChild(el); hsEls[h.id] = el;
  }
}

/* ------------------------------------------------------------------ state, tweening, UI */
const S = { mode: 'outside', explode: 0, explodeT: 0, gF: 0, gB: 0, flip: false, auto: true, labels: true, sel: null };
const cam = { az: .42, el: 50 * Math.PI / 180, rad: 5.6, tgt: new THREE.Vector3(0, -.1, 0) };
const PRESET = {
  outside: { az: .42, el: 50, hw: 5.6, hh: 3.9, tgt: [0, -.12, 0], ex: 0 },
  inside: { az: .3, el: 58, hw: 5.5, hh: 3.9, tgt: [0, -.2, 0], ex: 0 },
  exploded: { az: .62, el: 20, hw: 5.7, hh: 5.8, tgt: [0, .8, 0], ex: 1 },
};
let tw = null;
function sph() { const o = camera.position.clone().sub(controls.target); const s = new THREE.Spherical().setFromVector3(o); return { az: s.theta, el: Math.PI / 2 - s.phi, rad: s.radius, tgt: controls.target.clone() }; }
function fitDist(hw, hh) { const w = stageW() - (isDesktop() ? 390 : 0), h = stageH() - (isDesktop() ? 150 : 200); const ha = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); const wa = ha * w / stageH(); const hh2 = ha * h / stageH(); return Math.max(hw / wa, hh / hh2) * 1.08; }
function flyTo(g, ms = 1100) {
  const a = sph(); let daz = g.az - a.az; daz = Math.atan2(Math.sin(daz), Math.cos(daz));
  tw = { t0: performance.now(), ms, a, daz, g };
}
function stepTween(now) {
  if (!tw) return; const k = clamp((now - tw.t0) / tw.ms, 0, 1), e = ease(k);
  const az = tw.a.az + tw.daz * e, el = tw.a.el + (tw.g.el - tw.a.el) * e, rad = tw.a.rad + (tw.g.rad - tw.a.rad) * e;
  const tgt = tw.a.tgt.clone().lerp(tw.g.tgt, e);
  const sp = new THREE.Spherical(rad, Math.PI / 2 - clamp(el, -1.5, 1.5), az); camera.position.setFromSpherical(sp).add(tgt); controls.target.copy(tgt); camera.lookAt(tgt);
  if (k >= 1) { tw = null; sway.base = null; }
}
controls.addEventListener('start', () => { tw = null; lastTouch = performance.now(); sway.base = null; });
let lastTouch = performance.now();

function setMode(mode, opts = {}) {
  S.mode = mode; const p = PRESET[mode];
  S.explodeT = p.ex; $('#explode').value = p.ex * 100; updateSlider();
  const el = (S.flip ? -1 : 1) * p.el * Math.PI / 180;
  flyTo({ az: opts.az ?? p.az, el, rad: fitDist(p.hw, p.hh), tgt: new THREE.Vector3(...p.tgt) });
  document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  closeInfo(); lastTouch = performance.now();
}
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { S.flip = false; setMode(b.dataset.mode); }));
function updateSlider() { const s = $('#explode'); s.style.setProperty('--p', s.value + '%'); }
$('#explode').addEventListener('input', e => {
  S.explodeT = e.target.value / 100; updateSlider();
  if (S.mode !== 'inside') { S.mode = 'custom'; document.querySelectorAll('.seg button').forEach(b => b.classList.remove('on')); }
  if (S.explodeT > .3 && sph().rad < fitDist(5.7, 5.8) * .8) { const a = sph(); flyTo({ ...a, rad: fitDist(5.7, 5.8), tgt: new THREE.Vector3(0, .8 * S.explodeT, 0) }, 900); }
});
$('#flip').addEventListener('click', () => { S.flip = !S.flip; const a = sph(); flyTo({ ...a, el: -a.el, az: a.az + Math.PI * .12 }, 1000); closeInfo(); });
$('#labels').addEventListener('click', e => { S.labels = !S.labels; e.currentTarget.classList.toggle('on', S.labels); });
$('#spin').addEventListener('click', e => { S.auto = !S.auto; e.currentTarget.classList.toggle('on', S.auto); sway.base = null; lastTouch = performance.now(); });

/* keyboard equivalents */
addEventListener('keydown', e => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  const step = 0.12;
  switch (e.key) {
    case 'ArrowLeft': controls.rotateLeft(step); break;
    case 'ArrowRight': controls.rotateLeft(-step); break;
    case 'ArrowUp': controls.rotateUp(step); break;
    case 'ArrowDown': controls.rotateUp(-step); break;
    case '+': case '=': controls.dollyIn(1.12); break;
    case '-': case '_': controls.dollyOut(1.12); break;
    case '1': S.flip = false; setMode('outside'); break;
    case '2': S.flip = false; setMode('inside'); break;
    case '3': S.flip = false; setMode('exploded'); break;
    case 'f': case 'F': $('#flip').click(); break;
    case 'l': case 'L': $('#labels').click(); break;
    case 'a': case 'A': $('#spin').click(); break;
    case 'Escape': escapeKey(); break;
    default: return;
  }
  e.preventDefault();
  lastTouch = performance.now(); sway.base = null; tw = null; controls.update();
});
function escapeKey() {
  if (!$('#info').hidden) { closeInfo(); return; }
  if ($('#features').classList.contains('open')) { toggleFeat(false); return; }
  if ($('#explain').classList.contains('show')) { hideExplain(); return; }
  if (!$('#photo-overlay').hidden) dismissPhoto(currentPhotoId);
}

/* real photos that fade in when the view matches their angle */
const PHOTOS = [
  { id: 'outside_product', src: 'assets/photos/outside_product.png', alt: 'Wesatoshis card, front', cap: 'Finished card, front', gate: 'front', elc: .873 },
  { id: 'outside_nwc_in_hand', src: 'assets/photos/outside_nwc_in_hand.png', alt: 'Card in hand showing the Nostr Wallet Connect prompt', cap: 'Nostr Wallet Connect on the screen', gate: 'nwc', elc: .873, bias: .05 },
  { id: 'pcb_front', src: 'assets/photos/pcb_front.jpg', alt: 'PCB, display and button side', cap: 'PCB — display & button side', gate: 'insideTop', elc: 1.012 },
];
const suppressed = {};
let currentPhotoId = null;
function photoGate(ph) {
  if (ph.gate === 'front') return S.gF < .35 ? 1 : 0;
  if (ph.gate === 'nwc') return (S.gF < .35 && curScreen === 1) ? 1 : 0;
  if (ph.gate === 'insideTop') return S.gF > .55 ? 1 : 0;
  return 0;
}
function photoScore(id) {
  const ph = PHOTOS.find(p => p.id === id); if (!ph || suppressed[id]) return 0;
  const gate = photoGate(ph); if (!gate) return 0;
  const d = Math.abs(sph().el - ph.elc);
  return gate * clamp(1 - (d - .4) / .35, 0, 1) + (ph.bias || 0);
}
function dismissPhoto(id) { if (id) suppressed[id] = true; }
function updatePhoto() {
  let best = null, bestScore = 0;
  for (const ph of PHOTOS) {
    const s = photoScore(ph.id);
    if (suppressed[ph.id] && s < .12) delete suppressed[ph.id];
    if (s > bestScore) { bestScore = s; best = ph; }
  }
  const el = $('#photo-overlay');
  if (best && bestScore > .25) {
    if (currentPhotoId !== best.id) {
      const img = $('#photo-img');
      img.src = best.src; img.alt = best.alt; $('#photo-cap').textContent = best.cap;
    }
    currentPhotoId = best.id;
    el.hidden = false; requestAnimationFrame(() => el.classList.add('show'));
  } else {
    el.classList.remove('show');
    if (bestScore < .05 && currentPhotoId !== null) { currentPhotoId = null; setTimeout(() => { if (currentPhotoId === null) el.hidden = true; }, 500); }
  }
}
$('#photo-x').addEventListener('click', () => { dismissPhoto(currentPhotoId); $('#photo-overlay').classList.remove('show'); $('#photo-overlay').hidden = true; currentPhotoId = null; });

/* features panel */
const ICON = {
  wallet: '<path d="M3 7h15a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM3 7l12-3v3M17 14h2"/>',
  pay: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  nostr: '<path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.5 7.1 18.2 8 12.7 4 8.8l5.5-.8z"/>',
  node: '<path d="M9 15l6-6M11 6l2-2a3.5 3.5 0 0 1 5 5l-2 2M13 18l-2 2a3.5 3.5 0 0 1-5-5l2-2"/>',
  pin: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  qr: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v3M14 20h3v1M20 20h1"/>',
  open: '<path d="M8 6 3 12l5 6M16 6l5 6-5 6M13.500 4l-3 16"/>',
};
const FEATURES = [
  { ic: 'wallet', t: 'Self-custody card', d: 'Holds your keys on the device — no app, no custodial server.', mode: 'inside', focus: 'esp32', exp: ['Self-custody', 'Your keys live on the card itself. It is a transfer tool, not a cold-storage replacement.'] },
  { ic: 'pay', t: 'Native BTC & Lightning', d: 'Send and receive on-chain BTC and pay BOLT11 Lightning invoices.', mode: 'outside', focus: 'oled', screen: 0, exp: ['Bitcoin + Lightning', 'Speaks the Bitcoin protocol natively and pays Lightning invoices directly on the card.'] },
  { ic: 'nostr', t: 'Nostr Wallet Connect & zaps', d: 'A built-in Nostr client pairs NWC and sends zaps.', mode: 'outside', focus: 'oled', screen: 1, exp: ['Nostr on board', 'A built-in Nostr client pairs Nostr Wallet Connect to pay invoices and zap friends.'] },
  { ic: 'qr', t: 'QR scanning', d: 'The built-in scanner reads invoices, Wi-Fi and node codes on the fly.', mode: 'inside', focus: 'qr', screen: 2, exp: ['Scan to pay', 'A dedicated scanner chip decodes QR codes on the fly — standard, inverted or coloured.'] },
  { ic: 'node', t: 'Your own node (SPV)', d: 'Connect to a home Bitcoin node via a btcnode: QR code. No Electrum.', mode: 'inside', focus: 'esp32', screen: 3, exp: ['Own your node', 'Connects to your own Bitcoin node with full SPV verification — no Electrum server.'] },
  { ic: 'pin', t: 'PIN & decoy mode', d: 'A PIN locks the card; a wrong PIN opens a playable game.', mode: 'outside', focus: 'buttons', screen: 4, exp: ['PIN & decoy', 'A configurable PIN guards the card. A wrong PIN opens a game instead of your data.'] },
  { ic: 'open', t: 'Open hardware', d: 'Download the enclosure files and print your own case.', mode: 'exploded', focus: null, exp: ['Open hardware', 'The enclosure STLs, screen cut path and STEP board model are published for download.'] },
];
FEATURES.forEach((f, i) => {
  const li = document.createElement('li'); li.innerHTML = `<button data-i="${i}"><span class="ic"><svg viewBox="0 0 24 24">${ICON[f.ic]}</svg></span><span><b>${f.t}</b><span class="d">${f.d}</span></span></button>`;
  li.firstChild.addEventListener('click', () => { document.querySelectorAll('#feat-list button').forEach(b => b.classList.remove('on')); li.firstChild.classList.add('on'); applyFeature(f); if (!isDesktop()) toggleFeat(false); });
  $('#feat-list').appendChild(li);
});
let pinUntil = 0;
function applyFeature(f) {
  if (f.screen != null) { drawScreen(f.screen); pinUntil = performance.now() + 14000; }
  S.flip = f.focus === 'qr' || f.focus === 'esp32';
  if (f.focus) { setMode(f.mode); setTimeout(() => select(f.focus), 50); } else setMode(f.mode);
  if (f.exp) showExplain(f.exp[0], f.exp[1]);
}
function toggleFeat(open) { const p = $('#features'); const o = open ?? !p.classList.contains('open'); p.classList.toggle('open', o); $('#feat-toggle').setAttribute('aria-expanded', o); $('#feat-toggle').textContent = o ? 'Close' : 'Features'; }
$('#feat-toggle').addEventListener('click', () => toggleFeat());

function showInfo(h, { pinned = false, preview = false } = {}) {
  $('#info-t').textContent = h.t; $('#info-s').textContent = h.s; $('#info-d').textContent = h.d;
  $('#info').hidden = false;
  $('#info').classList.toggle('pinned', pinned);
  $('#info').classList.toggle('preview', preview);
}
function select(id) {
  const h = HOT.find(x => x.id === id); if (!h) return; S.sel = id;
  const p = anchors[id + '_c'].getWorldPosition(new THREE.Vector3());
  const dir = h.side === 'back' ? -1 : 1; const edge = h.side === 'edge';
  const a0 = sph();
  flyTo({ az: edge ? a0.az * .4 : a0.az, el: edge ? .35 : dir * 55 * Math.PI / 180, rad: h.id === 'oled' ? fitDist(2.1, 1.5) : fitDist(2.6, 2.2), tgt: p.clone() }, 1000);
  S.flip = dir < 0;
  showInfo(h, { pinned: true });
  Object.entries(hsEls).forEach(([k, el]) => el.classList.toggle('act', k === id)); lastTouch = performance.now();
}
function preview(id) {
  const h = HOT.find(x => x.id === id); if (!h || S.sel === id) return;
  showInfo(h, { preview: true });
}
function unpreview(id) {
  if (S.sel === id) return;
  const h = HOT.find(x => x.id === S.sel);
  if (h) showInfo(h, { pinned: true });
  else { $('#info').hidden = true; $('#info').classList.remove('preview', 'pinned'); }
}
function closeInfo() { $('#info').hidden = true; S.sel = null; $('#info').classList.remove('pinned', 'preview'); Object.values(hsEls).forEach(el => el.classList.remove('act')); }
$('#info-x').addEventListener('click', () => { const m = PRESET[S.mode] ? S.mode : 'outside'; setMode(m); });

/* explain text (behind the card) */
let explainTimer = null;
function showExplain(title, text) {
  $('#explain-t').textContent = title; $('#explain-d').textContent = text;
  const ex = $('#explain'); ex.classList.add('show'); ex.setAttribute('aria-hidden', 'false');
  clearTimeout(explainTimer); explainTimer = setTimeout(hideExplain, 7000);
}
function hideExplain() { const ex = $('#explain'); ex.classList.remove('show'); ex.setAttribute('aria-hidden', 'true'); }

/* clicking screen / buttons in 3D */
const ray = new THREE.Raycaster(); let down = null;
canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || performance.now() - down.t > 450) return;
  const r = canvas.getBoundingClientRect(); const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(v, camera); const hit = ray.intersectObjects([...capMeshes, nodes.screen, nodes.oled_glass, nodes.top_cover], false)[0];
  if (hit && (capMeshes.includes(hit.object) || hit.object === nodes.screen || hit.object === nodes.oled_glass)) {
    if (capMeshes.includes(hit.object)) press(hit.object);
    drawScreen((curScreen + 1) % SCREENS.length); pinUntil = performance.now() + 9000;
  }
});
const pressing = new Map();
function press(m) { pressing.set(m, performance.now()); }

/* ------------------------------------------------------------------ main loop */
const sway = { base: null, phase: 0 };
const clock = new THREE.Clock(); const tmpV = new THREE.Vector3(), rc = new THREE.Raycaster(); let lastOcc = 0, lastScr = performance.now();
const baseCapY = {};

function applyGhost(node, g) {
  const mats = Array.isArray(node.material) ? node.material : [node.material];
  const base = node === nodes.top_cover ? 1 : 1; const op = 1 - .86 * g;
  mats.forEach(m => { m.transparent = g > .01; m.opacity = op * base; m.depthWrite = g < .5; m.needsUpdate = false; });
  if (node.userData.edges) node.userData.edges.material.opacity = g * .7;
}
function resize() {
  const w = stageW(), h = stageH(); renderer.setSize(w, h, false); camera.aspect = w / h;
  if (isDesktop()) camera.setViewOffset(w, h, 190, 55, w, h); else camera.setViewOffset(w, h, 0, 55, w, h);
  camera.updateProjectionMatrix();
}
addEventListener('resize', () => { resize(); const p = PRESET[S.mode]; if (p && !tw) { const a = sph(); camera.position.sub(controls.target).setLength(fitDist(p.hw, p.hh)).add(controls.target); } });

function tick() {
  const dt = Math.min(clock.getDelta(), .05), now = performance.now();
  stepTween(now);
  // explode
  S.explode += (S.explodeT - S.explode) * (1 - Math.exp(-dt * 5)); const t = S.explode;
  for (const k in LAYERS) { const L = layer[k]; L.position.y = LAYERS[k].off * t; if (LAYERS[k].spin) L.rotation.y = 0; }
  for (let i = 0; i < 4; i++) { /* screws spin about their own axes while lifting */ }
  // caps press animation
  for (const [m, t0] of pressing) { const k = (now - t0) / 260; if (!(m.uuid in baseCapY)) baseCapY[m.uuid] = m.position.y; m.position.y = baseCapY[m.uuid] - Math.sin(clamp(k, 0, 1) * Math.PI) * .05; if (k >= 1) { m.position.y = baseCapY[m.uuid]; pressing.delete(m); } }
  // ghosting in "inside"
  const planeY = -.2 + LAYERS.pcb.off * t, below = camera.position.y < planeY;
  const tF = S.mode === 'inside' && !below ? 1 : 0, tB = S.mode === 'inside' && below ? 1 : 0;
  S.gF += (tF - S.gF) * (1 - Math.exp(-dt * 6)); S.gB += (tB - S.gB) * (1 - Math.exp(-dt * 6));
  applyGhost(nodes.top_cover, S.gF); applyGhost(nodes.back_shell, S.gB);
  M.decal.opacity = 1 - S.gF; M.decal.needsUpdate = false; M.pc.opacity = .3 * (1 - S.gF * .7);
  // ground follows the lowest layer
  ground.position.y = -.74 + LAYERS.shell.off * t - .5; ground.scale.setScalar(1 + .25 * t); ground.material.opacity = .95 - .2 * t;
  // idle sway
  if (S.auto && !tw && !S.sel && now - lastTouch > 2500) {
    if (sway.base === null) { sway.base = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z); sway.phase = 0; }
    sway.phase += dt * .38; const az = sway.base + Math.sin(sway.phase) * .8; const prev = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    const d = az - prev; const o = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), d); camera.position.copy(controls.target).add(o);
  }
  controls.update();
  // screens
  if (now > pinUntil && now - lastScr > 4800) { drawScreen((curScreen + 1) % SCREENS.length); lastScr = now; }
  updateHotspots(now);
  updatePhoto();
  renderer.render(scene, camera);
}

function updateHotspots(now) {
  const show = S.labels, w = stageW(), h = stageH(), small = !isDesktop();
  const doOcc = now - lastOcc > 180; if (doOcc) lastOcc = now;
  const exploded = S.explode > .25, inside = S.mode === 'inside';
  const cx = isDesktop() ? (w - 378) / 2 : w / 2, limitR = isDesktop() ? w - 396 : w - 6;
  const items = [];
  for (const hs of HOT) {
    const el = hsEls[hs.id]; if (!el) continue;
    let vis = !!show && (!S.sel || S.sel === hs.id) && (exploded || inside ? !(inside && !exploded && hs.noInside) : !!(hs.outside && hs.pr <= 1));
    if (small && (exploded || inside) && hs.pr > 1) vis = false;
    let x = 0, y = 0;
    if (vis) {
      anchors[hs.id].getWorldPosition(tmpV);
      if (doOcc) {
        const dir = tmpV.clone().sub(camera.position); const dist = dir.length(); dir.normalize(); rc.set(camera.position, dir); rc.far = dist - .02;
        const bl = blockers.filter(m => !(m === nodes.top_cover && S.gF > .5) && !(m === nodes.back_shell && S.gB > .5));
        el._occ = rc.intersectObjects(bl, false).length > 0;
      }
      if (el._occ) vis = false;
      tmpV.project(camera); if (tmpV.z > 1) vis = false;
      x = (tmpV.x * .5 + .5) * w; y = (-tmpV.y * .5 + .5) * h;
      if (x < -20 || x > w + 20 || y < -20 || y > h + 20) vis = false;
    }
    el.classList.toggle('show', vis);
    if (vis) { el._w = el._w || el.querySelector('.lab').offsetWidth || 150; items.push({ hs, el, x, y }); }
  }
  // callout layout: push labels outward from the model, stack with min spacing so they never overlap
  const gap = small ? 26 : 40;
  const place = (arr, side) => {
    arr.sort((a, b) => a.y - b.y); let prev = -1e9;
    for (const it of arr) { it.ly = Math.max(it.y, prev + gap); prev = it.ly; }
    const maxY = h - (small ? 150 : 110); const over = (arr.length ? arr[arr.length - 1].ly : 0) - maxY;
    if (over > 0) arr.forEach(it => it.ly = Math.max(60, it.ly - over));
    arr.forEach((it, i) => {
      const off = 34 + (i % 2) * 22, dx = side === 'R' ? off : -off, dy = it.ly - it.y; const lab = it.el.querySelector('.lab'), ln = it.el.querySelector('.ln');
      it.el.style.transform = `translate(${it.x.toFixed(1)}px,${it.y.toFixed(1)}px)`;
      if (side === 'R') { lab.style.left = dx + 'px'; lab.style.right = 'auto'; } else { lab.style.right = -dx + 'px'; lab.style.left = 'auto'; }
      lab.style.top = (dy - 14) + 'px';
      const len = Math.hypot(dx, dy); ln.style.width = len + 'px'; ln.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      it.el.classList.toggle('R', side === 'R'); it.el.classList.toggle('L', side === 'L');
    });
  };
  const L = [], R = [];
  for (const it of items) {
    let side = it.x < cx ? 'L' : 'R';
    if (side === 'R' && it.x + 56 + it.el._w > limitR) side = 'L';
    if (side === 'L' && it.x - 56 - it.el._w < 6) side = 'R';
    (side === 'L' ? L : R).push(it);
  }
  place(L, 'L'); place(R, 'R');
}

/* ------------------------------------------------------------------ boot */
(async function init() {
  resize(); drawScreen(0);
  try { await build(); } catch (e) { console.error(e); $('#loader-t').textContent = 'Could not load the 3D model — serve this folder over http (see README).'; return; }
  // initial camera
  const hash = (location.hash || '').replace('#', '').split('&'); const mode = ['outside', 'inside', 'exploded'].includes(hash[0]) ? hash[0] : 'outside';
  const p = PRESET[mode]; S.flip = hash.includes('flip');
  const el = (S.flip ? -1 : 1) * p.el * Math.PI / 180; const az = p.az; const rad = fitDist(p.hw, p.hh);
  camera.position.setFromSpherical(new THREE.Spherical(rad * 1.5, Math.PI / 2 - el, az - .6)).add(new THREE.Vector3(...p.tgt)); controls.target.set(...p.tgt);
  const sc = hash.find(x => x.startsWith('screen=')); if (sc) { drawScreen(+sc.split('=')[1] || 0); pinUntil = performance.now() + 1e9; }
  if (hash.includes('still')) S.auto = false;
  if (reducedMotion) { S.auto = false; sway.phase = 0; }
  $('#spin').classList.toggle('on', S.auto);
  S.mode = mode; S.explodeT = p.ex; S.explode = p.ex; $('#explode').value = p.ex * 100; updateSlider();
  document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  flyTo({ az, el, rad, tgt: new THREE.Vector3(...p.tgt) }, 1600);
  if (hash.includes('still')) { tw = null; camera.position.setFromSpherical(new THREE.Spherical(rad, Math.PI / 2 - el, az)).add(new THREE.Vector3(...p.tgt)); controls.update(); }
  const sel = hash.find(x => x.startsWith('select=')); if (sel) setTimeout(() => select(sel.split('=')[1]), 100);
  $('#bar').style.width = '100%'; setTimeout(() => $('#loader').classList.add('done'), 250);
  renderer.setAnimationLoop(tick);
  window.__viz = { S, M, scene, nodes, setMode, select, camera, controls, drawScreen, THREE, renderer, layer, anchors };
  window.__product = {
    photos: PHOTOS.map(p => ({ id: p.id, label: p.cap, src: p.src })),
    photoScore, dismissPhoto,
    explain: () => ({ active: $('#explain').classList.contains('show'), title: $('#explain-t').textContent, text: $('#explain-d').textContent }),
    reducedMotion,
  };
})();
