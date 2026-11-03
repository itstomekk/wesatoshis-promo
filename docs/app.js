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
const RM = matchMedia('(prefers-reduced-motion: reduce)');
const prefersReduced = () => RM.matches;
const reducedMotion = RM.matches;

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

/* ------------------------------------------------------------------ cyber-galaxy sky: part of the 3D scene (camera-attached), not a screen-fixed image */
function makeSky() {
  const N = isDesktop() ? 512 : 384, L = 128;
  const hash = (x, y, z) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177); h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const sm = t => t * t * (3 - 2 * t);
  const vn = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = sm(x - xi), fy = sm(y - yi), fz = sm(z - zi);
    const c = (a, b, d) => hash(xi + a, yi + b, zi + d);
    const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * fx, x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * fx;
    const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * fx, x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * fx;
    const y0 = x00 + (x10 - x00) * fy, y1 = x01 + (x11 - x01) * fy; return y0 + (y1 - y0) * fz;
  };
  const fbm = (x, y, z, o = 5) => { let a = .5, f = 1, s = 0; for (let i = 0; i < o; i++) { s += a * vn(x * f + i * 17.3, y * f + i * 5.1, z * f + i * 9.7); f *= 2.03; a *= .5; } return s; };
  // cube faces use the GL convention; three.js mirrors x when sampling a CubeTexture background
  const faceDir = (f, u, v) => {
    let x, y, z;
    switch (f) { case 0: x = 1; y = -v; z = -u; break; case 1: x = -1; y = -v; z = u; break; case 2: x = u; y = 1; z = v; break; case 3: x = u; y = -1; z = -v; break; case 4: x = u; y = -v; z = 1; break; default: x = -u; y = -v; z = -1; }
    const l = Math.hypot(x, y, z); return [-x / l, y / l, z / l];
  };
  const dirFace = (w) => {
    const gx = -w[0], gy = w[1], gz = w[2], ax = Math.abs(gx), ay = Math.abs(gy), az = Math.abs(gz); let f, u, v;
    if (ax >= ay && ax >= az) { if (gx > 0) { f = 0; u = -gz / ax; v = -gy / ax; } else { f = 1; u = gz / ax; v = -gy / ax; } }
    else if (ay >= az) { if (gy > 0) { f = 2; u = gx / ay; v = gz / ay; } else { f = 3; u = gx / ay; v = -gz / ay; } }
    else if (gz > 0) { f = 4; u = gx / az; v = -gy / az; } else { f = 5; u = -gx / az; v = -gy / az; }
    return { f, i: Math.max(0, Math.min(N - 1, Math.floor((u + 1) / 2 * N))), j: Math.max(0, Math.min(N - 1, Math.floor((v + 1) / 2 * N))) };
  };
  const nrm = (a) => { const l = Math.hypot(...a); return a.map(x => x / l); };
  const GAL = nrm([.28, .9, .33]), R1 = nrm([.8, .25, -.45]), R2 = nrm([-.35, .55, .75]);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const shade = (d) => {
    const [x, y, z] = d, band = Math.exp(-Math.pow(dot(d, GAL) / .3, 2));
    const n1 = fbm(x * 1.8 + 3, y * 1.8 + 1, z * 1.8 + 7), n2 = fbm(x * 3.2 - 5, y * 3.2 + 9, z * 3.2 - 2, 4), n3 = fbm(x * 7 + 11, y * 7 - 3, z * 7 + 5, 3);
    const cy = Math.max(0, n1 - .42) * 2.2 * (.25 + .75 * band), mg = Math.max(0, n2 - .47) * 2.4 * (.2 + .8 * band);
    const dust = 1 - .55 * Math.min(1, Math.max(0, n3 - .52) * 3) * band, core = band * (.35 + .65 * n1);
    const r1 = Math.exp(-Math.pow(dot(d, R1) / .03, 2)) * .8, r2 = Math.exp(-Math.pow(dot(d, R2) / .024, 2)) * .6;
    return [2 + (cy * 8 + mg * 46 + core * 14 + r2 * 18) * dust, 3 + (cy * 40 + mg * 8 + core * 18 + r1 * 26 + r2 * 6) * dust, 8 + (cy * 62 + mg * 60 + core * 34 + r1 * 36 + r2 * 40) * dust];
  };
  const faces = [];
  for (let f = 0; f < 6; f++) {
    const M2 = L + 2, lo = document.createElement('canvas'); lo.width = lo.height = M2; const lg = lo.getContext('2d'); const img = lg.createImageData(M2, M2);   // one extra texel on every side so the face edges interpolate correctly
    for (let j = 0; j < M2; j++) for (let i = 0; i < M2; i++) { const c = shade(faceDir(f, (i - .5) / L * 2 - 1, (j - .5) / L * 2 - 1)), k = (j * M2 + i) * 4; img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255; }
    lg.putImageData(img, 0, 0);
    const hi = document.createElement('canvas'); hi.width = hi.height = N; const hg = hi.getContext('2d'); hg.imageSmoothingEnabled = true; hg.imageSmoothingQuality = 'high'; hg.drawImage(lo, 1, 1, L, L, 0, 0, N, N); faces.push(hi);
  }
  const cube = new THREE.CubeTexture(faces); cube.colorSpace = THREE.SRGBColorSpace; cube.needsUpdate = true;
  // crisp stars as camera-following points: sharp at any zoom, hidden behind the model by the depth test
  const r = rng(2025), COUNT = isDesktop() ? 3200 : 2000, pos = new Float32Array(COUNT * 3), col = new Float32Array(COUNT * 3), size = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z), b = Math.pow(r(), 5), tint = r();
    pos.set([s * Math.cos(a) * 120, z * 120, s * Math.sin(a) * 120], i * 3);
    const base = tint < .18 ? [.45, .85, 1] : tint < .27 ? [1, .55, .95] : tint < .3 ? [1, .72, .4] : [.85, .9, 1], k = .3 + .7 * b;
    col.set([base[0] * k, base[1] * k, base[2] * k], i * 3); size[i] = 1.5 + 2.6 * b;
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({ uniforms: { uPx: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute float size; attribute vec3 aCol; varying vec3 vC; uniform float uPx; void main(){ vC=aCol; gl_PointSize=size*uPx; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vC; void main(){ float d=length(gl_PointCoord-.5)*2.; float a=smoothstep(1.,.1,d); a*=a; gl_FragColor=vec4(vC*a,1.0); }' });
  const stars = new THREE.Points(geo, mat); stars.frustumCulled = false; stars.renderOrder = -5;
  function seamError() {   // largest colour step across the 12 cube edges (nebula only)
    const px = faces.map(c => c.getContext('2d').getImageData(0, 0, N, N).data); let worst = 0;
    for (let f = 0; f < 6; f++) for (let t = 0; t < N; t += 4) for (const [i, j, du, dv] of [[t, 0, 0, -1], [t, N - 1, 0, 1], [0, t, -1, 0], [N - 1, t, 1, 0]]) {
      const w = faceDir(f, (i + .5) / N * 2 - 1 + du * 2 / N, (j + .5) / N * 2 - 1 + dv * 2 / N), o = dirFace(w), a = (j * N + i) * 4, b = (o.j * N + o.i) * 4;
      for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(px[f][a + c] - px[o.f][b + c]));
    }
    return worst;
  }
  return { cube, stars, faces, seamError, animated: false, setPixelRatio: v => { mat.uniforms.uPx.value = v; } };
}

const sky = makeSky(); scene.background = sky.cube; scene.add(sky.stars); sky.setPixelRatio(renderer.getPixelRatio());

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

/* ------------------------------------------------------------------ simulated on-device interface (128x64 OLED)
   A pure client-side state machine driven by the card's four physical buttons (UP / DOWN / BACK / OK).
   SIMULATION ONLY: no network access, no Wi-Fi scan, no camera, no storage, no wallet, no keys, no payments. */
const SCR = { W: 128, H: 64, K: 4 };
const scrCanvas = document.createElement('canvas'); scrCanvas.width = SCR.W * SCR.K; scrCanvas.height = SCR.H * SCR.K;
const scrTex = new THREE.CanvasTexture(scrCanvas); scrTex.colorSpace = THREE.SRGBColorSpace; scrTex.anisotropy = 8;
const tmp = document.createElement('canvas'); tmp.width = SCR.W; tmp.height = SCR.H; const tg = tmp.getContext('2d', { willReadFrequently: true });
const MONO = '"DejaVu Sans Mono","Liberation Mono","Courier New",Consolas,monospace';
let texts = [];
const T = (s, x, y) => { texts.push(String(s)); tg.fillText(s, x, y); };
const F = (px, b = false) => { tg.font = `${b ? 'bold ' : ''}${px}px ${MONO}`; };
function qrPattern(x0, y0, n, px) {
  const r = rng(42); const m = [];
  for (let y = 0; y < n; y++) { m[y] = []; for (let x = 0; x < n; x++) m[y][x] = r() < .5; }
  const finder = (fx, fy) => { for (let y = -1; y < 8; y++) for (let x = -1; x < 8; x++) { const X = fx + x, Y = fy + y; if (X < 0 || Y < 0 || X >= n || Y >= n) continue; const edge = x === 0 || x === 6 || y === 0 || y === 6, core = x >= 2 && x <= 4 && y >= 2 && y <= 4; m[Y][X] = (x >= 0 && x <= 6 && y >= 0 && y <= 6) && (edge || core); } };
  finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) tg.fillRect(x0 + x * px, y0 + y * px, px, px);
}
const H = t => { F(10, true); T(t, 3, 10); };
const LN = (i, s, b = false, px = 9) => { F(px, b); T(s, 3, 24 + i * 11); };
const FOOT = s => { F(7); T(s, 3, 62); };
function LIST(items, sel) {
  const first = clamp(sel - 1, 0, Math.max(0, items.length - 3));
  for (let r = 0; r < 3; r++) {
    const i = first + r; if (i >= items.length) break; const y = 15 + r * 14, on = i === sel;
    if (on) { tg.fillRect(0, y, 122, 13); tg.globalCompositeOperation = 'destination-out'; }
    F(9, on); T(items[i], 4, y + 10); tg.globalCompositeOperation = 'source-over';
  }
  if (items.length > 3) { const h = Math.max(6, Math.round(42 * 3 / items.length)), y = 15 + Math.round((42 - h) * sel / (items.length - 1)); tg.fillRect(125, y, 2, h); }
}
const BAR = p => { tg.fillRect(3, 50, 118, 1); tg.fillRect(3, 56, 118, 1); tg.fillRect(3, 50, 1, 7); tg.fillRect(120, 50, 1, 7); tg.fillRect(5, 52, Math.round(114 * p), 3); };

/* demo data: every value is a placeholder */
const WIFI = ['HomeNet-demo', 'CafeGuest-demo', 'PhoneSpot-demo', 'Office-demo'];
const ZAPS = [21, 100, 1000], NETS = ['Mainnet', 'Testnet', 'Signet'], KINDS = ['Lightning', 'On-chain', 'Monero'];
const PAIRS = [['BTC', 'USDT'], ['BTC', 'USDC'], ['BTC', 'ETH'], ['BTC', 'XMR'], ['USDT', 'BTC'], ['USDC', 'BTC'], ['ETH', 'BTC'], ['XMR', 'BTC']];
const POLICIES = ['2-of-3', '3-of-5'], DICE = ['3 5 1 6 2 4', '2 2 6 1 5 3', '6 4 3 3 1 5'];
const BLOCKS = [['123,456', 'ExamplePool', '2,345'], ['123,457', 'DemoMiner', '1,980'], ['123,458', 'SamplePool', '2,511']];
const PRICES = [['USD', '100,000'], ['EUR', '92,000']], CODES = ['482 913', '107 556', '930 274'];
const PAYSRC = ['wallet balance', 'home node', 'NWC wallet', 'Arkade'];
const MENU = [['Pay', 'pay'], ['Receive', 'recv'], ['Scan QR', 'scan'], ['Wi-Fi', 'wifi'], ['Nostr', 'nostr'], ['Connect node', 'node'], ['Blocks', 'block'], ['Mempool', 'mempool'], ['Price & fees', 'price'], ['Swap', 'swap'], ['Multisig', 'multisig'], ['PSBT', 'psbt'], ['Tor', 'tor'], ['Dice rolls', 'dice'], ['AuthCodes 2FA', '2fa'], ['DOCPROOF', 'docproof'], ['Network', 'net'], ['SD card', 'sd'], ['Wallet setup', 'setup'], ['PIN', 'pin'], ['About', 'about']];
const NOSTR = [['Connect wallet (NWC)', 'nwc'], ['Zap a friend', 'zap']];
const SCAN = [['Pay an invoice', 'pay.review'], ['Add Wi-Fi network', 'wifi.qr'], ['Link a home node', 'node.done']];
const dev = { cur: 'home', swap: 0, policy: 0, dice: 0, tor: 0, menu: 0, wifi: 0, payKind: 0, payFrom: 0, recvKind: 0, zap: 1, net: 0, blk: 0, price: 0, code: 0, scan: 0, nostr: 0, target: '', connected: '', saved: [], timer: null };
const DEV_FIELDS = ['cur', 'swap', 'policy', 'dice', 'tor', 'menu', 'wifi', 'payKind', 'payFrom', 'recvKind', 'zap', 'net', 'blk', 'price', 'code', 'scan', 'nostr', 'target', 'connected', 'saved'];
let manualTimers = false, timerScale = 1;
const wrap = (v, n, d) => (v + d + n) % n;
const cyc = (k, n) => ({ up: () => { dev[k] = wrap(dev[k], n, -1); }, down: () => { dev[k] = wrap(dev[k], n, 1); } });
const payAmt = () => ['1,000 sats', '50,000 sats', '0.20 XMR'][dev.payKind];
const pair = () => PAIRS[dev.swap][0] + ' > ' + PAIRS[dev.swap][1];

/* every state: sec = demo-screen group, keys = what each physical button does there */
const UI = {
  home: { sec: 'balance', label: 'Home', say: () => 'Balance 21,000 sats. OK opens the menu', keys: { ok: 'menu' },
    draw() { F(10, true); T('WESATOSHIS', 3, 10); F(9, true); T('LN', 82, 10); F(21, true); T('B', 4, 42); tg.fillRect(9, 20, 1, 4); tg.fillRect(13, 20, 1, 4); tg.fillRect(9, 42, 1, 4); tg.fillRect(13, 42, 1, 4); F(19, true); T('21,000', 22, 41); F(10, true); T('sats', 100, 41); F(8); T('Lightning ready', 3, 56); F(7); T('OK: menu', 86, 62); } },
  menu: { sec: 'balance', label: 'Main menu', say: () => MENU[dev.menu][0], keys: { ...cyc('menu', MENU.length), ok: () => go(MENU[dev.menu][1]), back: 'home' }, draw() { H('Menu'); LIST(MENU.map(m => m[0]), dev.menu); } },

  pay: { sec: 'pay', label: 'Pay: choose type', say: () => KINDS[dev.payKind], keys: { ...cyc('payKind', 3), ok: 'pay.review', back: 'menu' },
    draw() { H('Pay'); qrPattern(6, 17, 21, 2); F(8); T('Type (UP/DOWN):', 52, 24); F(8, true); ['Lightning', 'On-chain', 'Monero (XMR)'].forEach((k, i) => T((dev.payKind === i ? '> ' : '  ') + k, 52, 34 + i * 9)); F(7); T('OK = demo scan', 52, 60); } },
  'pay.review': { sec: 'pay', label: 'Pay: review', say: () => `${KINDS[dev.payKind]} ${payAmt()}`, keys: { up: () => { if (dev.payKind === 0) dev.payFrom = wrap(dev.payFrom, 4, -1); }, down: () => { if (dev.payKind === 0) dev.payFrom = wrap(dev.payFrom, 4, 1); }, ok: 'pay.confirm', back: 'pay' },
    draw() { H('Review'); LN(0, KINDS[dev.payKind] + ' (demo)', false, 8); LN(1, payAmt(), true, 12); if (dev.payKind === 0) LN(2, 'From: ' + PAYSRC[dev.payFrom], false, 8); else if (dev.payKind === 1) LN(2, 'Fee ~2 sat/vB (demo)', false, 8); else LN(2, 'Simulated only', false, 8); FOOT(dev.payKind === 0 ? 'UP/DOWN source  OK next' : 'OK next  BACK scan'); } },
  'pay.confirm': { sec: 'pay', label: 'Pay: confirm', say: () => `Confirm ${payAmt()}? OK confirms, BACK cancels`, keys: { ok: 'pay.sending', back: 'pay.review' },
    draw() { H('Confirm'); LN(0, 'Pay ' + payAmt() + '?', true, 10); LN(1, 'Simulation only', false, 8); LN(2, 'Nothing is sent', false, 8); FOOT('OK = confirm  BACK = cancel'); } },
  'pay.sending': { sec: 'pay', label: 'Pay: sending', say: () => 'Simulated sending. BACK cancels', auto: { ms: 1400, to: 'pay.done' }, keys: { back: 'menu' },
    draw() { H('Sending...'); LN(0, 'Simulated payment', false, 8); LN(1, 'No network used', false, 8); BAR(.55); } },
  'pay.done': { sec: 'pay', label: 'Pay: done', say: () => 'Demo payment finished. Nothing was sent', keys: { ok: 'home', back: 'menu' },
    draw() { H('Done'); LN(0, 'Paid (demo)', true, 10); LN(1, 'Nothing was sent', false, 8); LN(2, dev.payKind === 0 ? 'Status via Nostr (sim)' : dev.payKind === 1 ? 'Not broadcast (sim)' : 'Not sent (sim)', false, 8); FOOT('OK home  BACK menu'); } },

  tor: { sec: 'tor', label: 'Tor', say: () => `Tor demo switch ${dev.tor ? 'on' : 'off'}`, keys: { up: () => { dev.tor = 1 - dev.tor; }, down: () => { dev.tor = 1 - dev.tor; }, ok: () => { dev.tor = 1 - dev.tor; }, back: 'menu' },
    draw() { H('Tor'); LN(0, 'Tor support', true, 10); LN(1, 'Demo switch: ' + (dev.tor ? 'ON' : 'OFF'), false, 9); LN(2, 'No traffic is routed', false, 8); FOOT('OK = toggle (demo)'); } },
  multisig: { sec: 'multisig', label: 'Multisig', say: () => 'Policy ' + POLICIES[dev.policy], keys: { ...cyc('policy', 2), ok: 'multisig.sign', back: 'menu' },
    draw() { H('Multisig'); LN(0, 'Policy (UP/DOWN):', false, 8); LN(1, '> ' + POLICIES[dev.policy] + ' (demo)', true, 11); LN(2, 'No keys in this demo', false, 8); FOOT('OK = sign demo spend'); } },
  'multisig.sign': { sec: 'multisig', label: 'Multisig: sign?', say: () => 'Co-sign a demo spend? OK signs in the demo', keys: { ok: 'multisig.done', back: 'multisig' },
    draw() { H('Sign?'); LN(0, 'Co-sign demo spend', true, 9); LN(1, 'Simulation only', false, 8); LN(2, 'Nothing is signed', false, 8); FOOT('OK = sign  BACK = cancel'); } },
  'multisig.done': { sec: 'multisig', label: 'Multisig: done (demo)', say: () => 'Demo co-signature. No key was used', keys: { ok: 'home', back: 'multisig' },
    draw() { H('Signed (demo)'); LN(0, 'Co-signed 1 of ' + POLICIES[dev.policy][0], true, 9); LN(1, 'No key was used', false, 8); LN(2, 'Nothing was sent', false, 8); FOOT('OK home  BACK policy'); } },
  psbt: { sec: 'psbt', label: 'PSBT', say: () => 'PSBT workflow demo. Signer is an external air-gapped device', keys: { ok: 'psbt.review', back: 'menu' },
    draw() { H('PSBT'); LN(0, 'Signer is external', true, 9); LN(1, '(air-gapped device)', false, 8); LN(2, 'Card is not air-gapped', false, 8); FOOT('OK = demo PSBT'); } },
  'psbt.review': { sec: 'psbt', label: 'PSBT: review', say: () => 'Review a demo PSBT signed by the external wallet', keys: { ok: 'psbt.confirm', back: 'psbt' },
    draw() { H('Review PSBT'); LN(0, 'Spend 25,000 sats', true, 9); LN(1, 'Signed on external', false, 8); LN(2, 'wallet (demo)', false, 8); FOOT('OK next  BACK = back'); } },
  'psbt.confirm': { sec: 'psbt', label: 'PSBT: confirm', say: () => 'Broadcast the demo transaction? Nothing is sent', keys: { ok: 'psbt.done', back: 'psbt.review' },
    draw() { H('Broadcast?'); LN(0, 'To your node (demo)', true, 9); LN(1, 'Simulation only', false, 8); LN(2, 'Nothing is sent', false, 8); FOOT('OK = confirm  BACK = cancel'); } },
  'psbt.done': { sec: 'psbt', label: 'PSBT: done (demo)', say: () => 'Demo only. Nothing was broadcast', keys: { ok: 'home', back: 'psbt' },
    draw() { H('Done (demo)'); LN(0, 'Nothing broadcast', true, 9); LN(1, 'No node contacted', false, 8); FOOT('OK home  BACK = PSBT'); } },
  swap: { sec: 'swap', label: 'Swap (Trocador)', say: () => pair(), keys: { ...cyc('swap', 8), ok: 'swap.review', back: 'menu' }, draw() { H('Swap'); LIST(PAIRS.map(p => p[0] + ' > ' + p[1]), dev.swap); } },
  'swap.review': { sec: 'swap', label: 'Swap: review', say: () => pair() + ' via Trocador, a third-party service', keys: { ok: 'swap.confirm', back: 'swap' },
    draw() { H('Swap review'); LN(0, pair(), true, 10); LN(1, 'via Trocador (3rd party)', false, 8); LN(2, 'Rate and fees: demo', false, 8); FOOT('OK next  BACK = list'); } },
  'swap.confirm': { sec: 'swap', label: 'Swap: confirm', say: () => 'Confirm ' + pair() + '? Nothing is exchanged', keys: { ok: 'swap.sending', back: 'swap.review' },
    draw() { H('Confirm swap'); LN(0, 'Swap ' + pair() + '?', true, 9); LN(1, 'Simulation only', false, 8); LN(2, 'Nothing is exchanged', false, 8); FOOT('OK = confirm  BACK = cancel'); } },
  'swap.sending': { sec: 'swap', label: 'Swap: working', say: () => 'Simulated swap. BACK cancels', auto: { ms: 1400, to: 'swap.done' }, keys: { back: 'menu' },
    draw() { H('Swapping...'); LN(0, 'Simulated swap', false, 8); LN(1, 'No service contacted', false, 8); BAR(.55); } },
  'swap.done': { sec: 'swap', label: 'Swap: done (demo)', say: () => 'Demo swap finished. Nothing was exchanged', keys: { ok: 'home', back: 'menu' },
    draw() { H('Done (demo)'); LN(0, pair() + ' (sim)', true, 10); LN(1, 'Nothing exchanged', false, 8); LN(2, 'Third-party service', false, 8); FOOT('OK home  BACK menu'); } },
  dice: { sec: 'dice', label: 'Dice rolls', say: () => 'Demo roll ' + DICE[dev.dice], keys: { up: () => { dev.dice = wrap(dev.dice, 3, -1); }, down: () => { dev.dice = wrap(dev.dice, 3, 1); }, ok: () => { dev.dice = wrap(dev.dice, 3, 1); }, back: 'menu' },
    draw() { H('Dice rolls'); LN(0, 'Demo rolls (not random)', false, 8); LN(1, DICE[dev.dice], true, 12); LN(2, 'Not real entropy', false, 8); FOOT('OK = next demo roll'); } },
  recv: { sec: 'recv', label: 'Receive: choose type', say: () => KINDS[dev.recvKind], keys: { ...cyc('recvKind', 2), ok: 'recv.show', back: 'menu' },
    draw() { H('Receive'); LN(0, 'Type (UP/DOWN):', false, 8); F(9, true); T((dev.recvKind === 0 ? '> ' : '  ') + 'Lightning invoice', 3, 36); T((dev.recvKind === 1 ? '> ' : '  ') + 'Bitcoin address', 3, 47); FOOT('OK = create (demo)'); } },
  'recv.show': { sec: 'recv', label: 'Receive: waiting', say: () => 'Demo ' + (dev.recvKind === 0 ? 'invoice' : 'address') + '. OK simulates an incoming payment', keys: { ok: 'recv.done', back: 'recv' },
    draw() { H('Receive'); qrPattern(4, 16, 21, 2); F(8); T('DEMO only', 52, 26); T(dev.recvKind === 0 ? '1,000 sats' : 'placeholder', 52, 37); T('not a real ' + (dev.recvKind === 0 ? 'inv.' : 'addr.'), 52, 47); F(7); T('OK = simulate', 52, 60); } },
  'recv.done': { sec: 'recv', label: 'Receive: done', say: () => 'Demo payment received. Nothing was paid', keys: { ok: 'home', back: 'menu' },
    draw() { H('Received'); LN(0, 'Received (demo)', true, 10); LN(1, 'Nothing was paid', false, 8); LN(2, 'Simulated only', false, 8); FOOT('OK home  BACK menu'); } },

  scan: { sec: 'scan', label: 'Scan QR', say: () => 'Scanner demo. OK to pick a simulated code', keys: { ok: 'scan.pick', back: 'menu' },
    draw() { H('Scan QR'); qrPattern(6, 17, 21, 2); F(8); ['Invoice · Wi-Fi', 'or your node', '(btcnode:...)'].forEach((s, i) => T(s, 56, 28 + i * 10)); F(7); T('OK = demo scan', 56, 60); } },
  'scan.pick': { sec: 'scan', label: 'Scan: pick a demo code', say: () => SCAN[dev.scan][0], keys: { ...cyc('scan', 3), ok: () => go(SCAN[dev.scan][1]), back: 'scan' }, draw() { H('Demo codes'); LIST(SCAN.map(s => s[0]), dev.scan); } },

  wifi: { sec: 'wifi', label: 'Wi-Fi', say: () => (dev.wifi === 0 ? 'Add Wi-Fi from a QR code' : WIFI[dev.wifi - 1]), keys: { up: () => { dev.wifi = wrap(dev.wifi, WIFI.length + 1, -1); }, down: () => { dev.wifi = wrap(dev.wifi, WIFI.length + 1, 1); }, ok: () => { if (dev.wifi === 0) go('wifi.qr'); else { dev.target = WIFI[dev.wifi - 1]; go('wifi.connecting'); } }, back: 'menu' },
    draw() { H('Wi-Fi 2.4GHz'); LIST(['Scan Wi-Fi QR', ...WIFI.map(n => n + (dev.connected === n ? ' *' : ''))], dev.wifi); } },
  'wifi.qr': { sec: 'wifi', label: 'Wi-Fi QR', say: () => 'Demo Wi-Fi QR. OK uses it', keys: { ok: () => { dev.target = 'QR-Net-demo'; go('wifi.connecting'); }, back: 'wifi' },
    draw() { H('Wi-Fi QR'); qrPattern(6, 17, 21, 2); F(8); T('Demo code:', 56, 28); T('QR-Net-demo', 56, 38); T('no camera used', 56, 48); F(7); T('OK = use', 56, 60); } },
  'wifi.connecting': { sec: 'wifi', label: 'Wi-Fi: connecting', say: () => 'Simulated connection to ' + dev.target + '. BACK cancels', auto: { ms: 1500, to: 'wifi.done' }, keys: { back: 'wifi' },
    draw() { H('Connecting'); LN(0, dev.target, true, 9); LN(1, 'Simulated, no real', false, 8); LN(2, 'network is used', false, 8); BAR(.5); } },
  'wifi.done': { sec: 'wifi', label: 'Wi-Fi: connected', say: () => 'Connected to ' + dev.target + ' in the demo. OK forgets it', enter() { dev.connected = dev.target; dev.saved = dev.saved.filter(n => n !== dev.target); dev.saved.push(dev.target); if (dev.saved.length > 2) dev.saved.shift(); },
    keys: { ok: () => { dev.saved = dev.saved.filter(n => n !== dev.connected); dev.connected = ''; go('wifi'); }, back: 'wifi' },
    draw() { H('Connected'); LN(0, dev.target, true, 9); LN(1, 'Demo: not a real link', false, 8); LN(2, `Saved ${dev.saved.length}/2 (sim)`, false, 8); FOOT('OK = forget  BACK = list'); } },

  nostr: { sec: 'nwc', label: 'Nostr', say: () => NOSTR[dev.nostr][0], keys: { ...cyc('nostr', 2), ok: () => go(NOSTR[dev.nostr][1]), back: 'menu' }, draw() { H('Nostr'); LIST(NOSTR.map(n => n[0]), dev.nostr); } },
  nwc: { sec: 'nwc', label: 'Nostr Wallet Connect', say: () => 'Add a Nostr Wallet Connect relay? OK confirms in the demo', keys: { ok: 'nwc.done', back: 'nostr' },
    draw() { F(10, true); T('Nostr Connect', 2, 10); F(8); ['Would you like to add', 'wss://relay.getalby.com', '/v1 (NWC)?'].forEach((s, i) => T(s, 2, 25 + i * 10)); F(9, true); T('Press OK to confirm', 2, 61); } },
  'nwc.done': { sec: 'nwc', label: 'NWC: paired (demo)', say: () => 'Paired in the demo. No relay was contacted', keys: { ok: 'home', back: 'nostr' },
    draw() { H('Paired (demo)'); LN(0, 'No relay contacted', false, 8); LN(1, 'Nothing was linked', false, 8); FOOT('OK home  BACK Nostr'); } },
  zap: { sec: 'zap', label: 'Zap a friend', say: () => `Zap ${ZAPS[dev.zap]} sats`, keys: { ...cyc('zap', 3), ok: 'zap.done', back: 'nostr' },
    draw() { H('Zap a friend'); LN(0, 'npub1...demo', false, 8); LN(1, '> ' + ZAPS[dev.zap] + ' sats', true, 11); LN(2, 'UP/DOWN amount', false, 8); FOOT('OK = zap (demo)  BACK'); } },
  'zap.done': { sec: 'zap', label: 'Zap: done (demo)', say: () => 'Demo zap. Nothing was sent', keys: { ok: 'home', back: 'nostr' },
    draw() { H('Zap (demo)'); LN(0, 'Zap simulated', true, 10); LN(1, 'Nothing was sent', false, 8); FOOT('OK home  BACK Nostr'); } },

  node: { sec: 'node', label: 'Connect node', say: () => 'Home node demo. OK links the demo', keys: { ok: 'node.done', back: 'menu' },
    draw() { H('Connect node'); F(9); ['btcnode:192.168.1.10', ':8333', 'SPV · no Electrum'].forEach((s, i) => T(s, 2, 27 + i * 13)); FOOT('OK = link (demo)'); } },
  'node.done': { sec: 'node', label: 'Node: linked (demo)', say: () => 'Demo only. No node was contacted', keys: { ok: 'home', back: 'menu' },
    draw() { H('Node (demo)'); LN(0, 'Linked in demo only', false, 8); LN(1, 'No node contacted', false, 8); LN(2, 'SPV, not full node', false, 8); FOOT('OK home  BACK menu'); } },
  block: { sec: 'block', label: 'Block tracker', say: () => `Block ${BLOCKS[dev.blk][0]}`, keys: { ...cyc('blk', 3), back: 'menu' },
    draw() { const b = BLOCKS[dev.blk]; H('New block'); LN(0, '#' + b[0], true, 11); LN(1, 'Miner: ' + b[1], false, 8); LN(2, 'Txs: ' + b[2], false, 8); FOOT('UP/DOWN browse  BACK'); } },
  mempool: { sec: 'mempool', label: 'Mempool & RBF', say: () => 'Unconfirmed transaction demo', keys: { back: 'menu' },
    draw() { H('Mempool'); LN(0, 'Unconfirmed tx: 1', false, 9); LN(1, 'RBF replacement seen', false, 8); LN(2, 'Demo data', false, 8); FOOT('BACK = menu'); } },
  price: { sec: 'price', label: 'BTC price & fees', say: () => `${PRICES[dev.price][0]} placeholder price`, keys: { ...cyc('price', 2), back: 'menu' },
    draw() { H('BTC price'); LN(0, PRICES[dev.price][0] + ' ' + PRICES[dev.price][1], true, 11); LN(1, '(placeholder value)', false, 8); LN(2, 'Fee ~4 sat/vB (demo)', false, 8); FOOT('UP/DOWN currency  BACK'); } },
  '2fa': { sec: '2fa', label: 'AuthCodes 2FA', say: () => 'Demo code ' + CODES[dev.code], keys: { up: () => { dev.code = wrap(dev.code, 3, -1); }, down: () => { dev.code = wrap(dev.code, 3, 1); }, ok: () => { dev.code = wrap(dev.code, 3, 1); }, back: 'menu' },
    draw() { H('AuthCodes 2FA'); LN(1, CODES[dev.code], true, 16); LN(2, 'demo code', false, 8); FOOT('OK = next demo code'); } },
  docproof: { sec: 'docproof', label: 'DOCPROOF', say: () => 'Hash demo', keys: { back: 'menu' },
    draw() { H('DOCPROOF'); LN(0, 'SHA-256 hash (demo):', false, 8); LN(1, 'a3f9 51c2 07be d4', true, 9); LN(2, 'Nothing is embedded', false, 8); FOOT('BACK = menu'); } },
  net: { sec: 'net', label: 'Network', say: () => NETS[dev.net], keys: { ...cyc('net', 3), back: 'menu' },
    draw() { H('Network'); LIST(NETS.map((n, i) => n + (i === dev.net ? ' *' : '')), dev.net); } },
  sd: { sec: 'sd', label: 'SD card', say: () => 'Header sync demo', keys: { back: 'menu' },
    draw() { H('SD card'); LN(0, 'Verifying headers', false, 8); LN(1, '47% (demo)', true, 10); BAR(.47); } },
  setup: { sec: 'setup', label: 'Wallet setup', say: () => 'Secure element demo. No keys are made', keys: { ok: 'pin', back: 'menu' },
    draw() { H('Wallet setup'); LN(0, 'Secure element makes', false, 8); LN(1, 'the seed (demo only)', false, 8); LN(2, 'No keys in this demo', true, 8); FOOT('OK = PIN   BACK = menu'); } },
  pin: { sec: 'pin', label: 'PIN', say: () => 'PIN protection information', keys: { back: 'menu' },
    draw() { H('Enter PIN'); F(21, true); T('••••', 4, 42); F(8); T('PIN protection (info)', 4, 58); } },
  about: { sec: 'balance', label: 'About', say: () => 'About the real card', keys: { back: 'menu' },
    draw() { H('About'); LN(0, 'Wesatoshis Card', true, 9); LN(1, 'wesatoshis.com', false, 9); LN(2, 'This screen is a demo', false, 8); FOOT('BACK = menu'); } },
};
/* the demo screens listed in the sidebar (jump targets); the first five keep their original order */
const SCREENS = [
  { id: 'balance', to: 'home', label: 'Balance', src: 'Official site: native Bitcoin + Lightning card with its own display', tip: 'On the real card the manufacturer says your keys stay on the device.' },
  { id: 'nwc', to: 'nwc', label: 'Nostr Wallet Connect', src: 'Official tutorial: attach Nostr Wallet Connect to pay Lightning invoices', tip: 'Official tutorial: link NWC to pay Lightning invoices from the card.' },
  { id: 'scan', to: 'scan', label: 'Scan QR', src: 'Official FAQ: dedicated scanner chip reads invoices, Wi-Fi and node QR codes', tip: 'The real card has a built-in scanner for invoices, Wi-Fi and node codes.' },
  { id: 'node', to: 'node', label: 'Home node', src: 'Official FAQ: connects to your home Bitcoin node via a btcnode: QR code', tip: 'The card connects to a node you run; it verifies with SPV, which is not full-node validation.' },
  { id: 'pin', to: 'pin', label: 'PIN', src: 'Official FAQ: the card can be secured with a PIN code', tip: 'PIN and decoy mode exist on the real card; the manufacturer’s descriptions of decoy mode differ.' },
  { id: 'block', to: 'block', label: 'Block tracker', src: 'Official FAQ: tracks every new block in real time incl. miner and stats', tip: 'The real card tracks new blocks, including the miner.' },
  { id: 'mempool', to: 'mempool', label: 'Mempool & RBF', src: 'Official FAQ: monitors unconfirmed mempool transactions and detects RBF', tip: 'The manufacturer says the card watches unconfirmed transactions and detects RBF.' },
  { id: 'zap', to: 'zap', label: 'Zap a friend', src: 'Official FAQ: add friends by Nostr public key and zap them', tip: 'The real card keeps a friends list by Nostr public key so you can zap them.' },
  { id: 'pay', to: 'pay', label: 'Pay', src: 'Official FAQ: pay a BOLT11 invoice from a home Lightning node or the wallet balance', tip: 'The manufacturer says a BOLT11 invoice can be paid from your wallet balance or a home Lightning node.' },
  { id: 'wifi', to: 'wifi', label: 'Wi-Fi', src: 'Official FAQ: Wi-Fi QR codes, 2.4 GHz band, up to two saved networks', tip: 'The real card saves up to two Wi-Fi networks and uses the 2.4 GHz band.' },
  { id: '2fa', to: '2fa', label: 'AuthCodes 2FA', src: 'Official FAQ: the card can serve as a 2FA device for AuthCodes', tip: 'The manufacturer says the card can act as an AuthCodes 2FA device.' },
  { id: 'docproof', to: 'docproof', label: 'DOCPROOF', src: 'Official FAQ: DOCPROOF embeds a SHA-256 hash as proof of existence', tip: 'The real card can embed a SHA-256 proof of existence using DOCPROOF (manufacturer).' },
  { id: 'net', to: 'net', label: 'Testnet & Signet', src: 'Official FAQ: Testnet and Signet are supported for testing', tip: 'The real card supports Testnet and Signet for testing.' },
  { id: 'sd', to: 'sd', label: 'SD header sync', src: 'Official FAQ: SD card stores headers; an empty card re-downloads and verifies them (~1 hour)', tip: 'The SD card holds SPV headers and your encrypted wallet; firmware updates install offline.' },
  { id: 'recv', to: 'recv', label: 'Receive', src: 'Official tutorial: generate a Bitcoin address on the card; FAQ: Lightning receive', tip: 'The official tutorials show generating a fresh Bitcoin address on the card.' },
  { id: 'price', to: 'price', label: 'BTC price & fees', src: 'Official FAQ: fetches Bitcoin price and fee data without a central server (manufacturer claim)', tip: 'The manufacturer says price and fee data need no central server; it does not explain how.' },
  { id: 'setup', to: 'setup', label: 'Wallet setup', src: 'Official FAQ: the secure element is used mainly to generate a new seed during setup', tip: 'The secure element is used mainly to generate your seed during setup (manufacturer).' },
  { id: 'tor', to: 'tor', label: 'Tor', src: 'Producer information (newer than the public FAQ): Tor support', tip: 'Producer information: Tor support. The older public FAQ answer about Tor may differ.' },
  { id: 'multisig', to: 'multisig', label: 'Multisig', src: 'Producer information (newer than the public FAQ): Bitcoin multisig', tip: 'Producer information: Bitcoin multisig. Signing details were not supplied, so this screen only illustrates it.' },
  { id: 'psbt', to: 'psbt', label: 'PSBT', src: 'Producer information (newer than the public FAQ): PSBT workflow with an external air-gapped wallet', tip: 'Producer information: a PSBT workflow with an external air-gapped wallet. The card itself is not air-gapped.' },
  { id: 'swap', to: 'swap', label: 'Swap (Trocador)', src: 'Producer information (newer than the public FAQ): USDT/USDC/ETH/BTC/XMR swaps via Trocador', tip: 'Producer information: USDT, USDC, ETH, BTC and XMR swaps via Trocador, a third-party service.' },
  { id: 'dice', to: 'dice', label: 'Dice rolls', src: 'Producer information (newer than the public FAQ): dice rolls', tip: 'Producer information: dice rolls. The demo rolls are fixed values, not random entropy.' },
  { id: 'arkade', to: 'pay.review', pre: () => { dev.payKind = 0; dev.payFrom = 3; }, label: 'Lightning via Arkade', src: 'Producer information: Lightning via Arkade; a June 2026 X post first described it as Developer Mode', tip: 'Producer information: Lightning via Arkade is available. A June 2026 post on the manufacturer’s X account first described it as Developer Mode.' },
  { id: 'xmr', to: 'pay.review', pre: () => { dev.payKind = 2; }, label: 'Monero (XMR) payment', src: 'Producer information (newer than the public FAQ): XMR payments', tip: 'Producer information: XMR payments. Mechanics were not supplied, so this screen only illustrates it.' },
];
SCREENS.forEach(m => { m.sim = true; });   // every screen is a simulation
const secIndex = () => {
  let id = UI[dev.cur].sec;
  if (dev.cur.startsWith('pay.')) { if (dev.payKind === 2) id = 'xmr'; else if (dev.payKind === 0 && dev.payFrom === 3) id = 'arkade'; }
  return Math.max(0, SCREENS.findIndex(s => s.id === id));
};
let curScreen = 0;
function paint() {
  texts = []; const u = UI[dev.cur];
  tg.clearRect(0, 0, SCR.W, SCR.H); tg.fillStyle = '#fff'; tg.textBaseline = 'alphabetic'; tg.globalCompositeOperation = 'source-over'; tg.lineWidth = 1;
  u.draw();
  tg.globalCompositeOperation = 'source-over'; tg.fillStyle = '#fff'; tg.fillRect(99, 1, 27, 11); tg.globalCompositeOperation = 'destination-out'; F(9, true); tg.fillText('SIM', 101, 10); tg.globalCompositeOperation = 'source-over';   // inverted SIM tag
  const d = tg.getImageData(0, 0, SCR.W, SCR.H).data; const g = scrCanvas.getContext('2d'); const K = SCR.K;
  g.fillStyle = '#03060b'; g.fillRect(0, 0, scrCanvas.width, scrCanvas.height);
  for (let y = 0; y < SCR.H; y++) for (let x = 0; x < SCR.W; x++) {
    const a = d[(y * SCR.W + x) * 4 + 3]; if (a < 100) continue;
    const hdr = y < 14; g.shadowColor = hdr ? 'rgba(60,200,255,.9)' : 'rgba(200,230,255,.7)'; g.shadowBlur = 5;
    g.fillStyle = hdr ? '#4fd6ff' : '#eef7ff'; g.fillRect(x * K + .4, y * K + .4, K - 1, K - 1);
  }
  g.shadowBlur = 0; scrTex.needsUpdate = true;
  curScreen = secIndex(); updateScreenUI();
}
function go(id) {
  clearTimeout(dev.timer); dev.timer = null; if (!UI[id]) return;
  dev.cur = id; const u = UI[id]; if (u.enter) u.enter();
  paint();
  if (u.auto && !manualTimers) { const to = u.auto.to; dev.timer = setTimeout(() => { if (dev.cur === id) { go(to); announce(); } }, u.auto.ms * timerScale); }
}
let announced = '';
function announce() { const u = UI[dev.cur]; announced = `${u.label}. ${u.say()}`; const el = $('#sim-live'); if (el) el.textContent = announced; }
function devKey(k) {
  const u = UI[dev.cur]; const h = u.keys && u.keys[k];
  if (h) { if (typeof h === 'string') go(h); else { h(); paint(); } }
  announce(); pressCap(k); return !!h;
}
const NOTES = { 'tor': 'No traffic is routed; the switch is a demo.', multisig: 'No keys are used.', 'multisig.sign': 'Nothing will be signed.', 'multisig.done': 'No key was used.', psbt: 'No PSBT is read or signed.', 'psbt.review': 'Made-up transaction.', 'psbt.confirm': 'Nothing will be broadcast.', 'psbt.done': 'Nothing was broadcast.', swap: 'Made-up pairs; no service is contacted.', 'swap.review': 'No service is contacted.', 'swap.confirm': 'Nothing will be exchanged.', 'swap.sending': 'Nothing is being exchanged.', 'swap.done': 'Nothing was exchanged.', dice: 'Fixed demo values, not random entropy.', 'pay.confirm': 'Nothing will be paid.', 'pay.sending': 'Nothing is being sent.', 'pay.done': 'Nothing was paid or sent.', 'recv.show': 'Placeholder only; not a real invoice or address.', 'recv.done': 'No payment arrived.', 'wifi.connecting': 'No Wi-Fi is being scanned or joined.', 'wifi.done': 'No Wi-Fi was joined.', 'wifi.qr': 'No camera is used.', 'wifi': 'The networks listed are made-up names.', scan: 'No camera is used.', 'scan.pick': 'Made-up codes.', 'node.done': 'No node was contacted.', 'nwc.done': 'No relay was contacted.', 'zap.done': 'No zap was sent.', setup: 'No seed or keys are created here.', pin: 'No PIN can be entered here.', price: 'Placeholder values, not real prices.', block: 'Made-up block data.', mempool: 'Made-up transaction data.' };
function updateScreenUI() {
  const u = UI[dev.cur], meta = SCREENS[curScreen];
  const now = $('#screen-now'); if (now) now.textContent = `Simulated screen: ${u.label}. ${NOTES[dev.cur] || 'Nothing here is real.'}`;
  const tip = $('#screen-tip-text'); if (tip) tip.textContent = meta ? meta.tip : '';
  document.querySelectorAll('#screen-picker button').forEach((b, i) => b.setAttribute('aria-pressed', String(i === curScreen)));
}
function drawScreen(i) { const m = SCREENS[clamp(i | 0, 0, SCREENS.length - 1)]; if (m.pre) m.pre(); go(m.to); }
const snapshot = () => JSON.stringify(Object.fromEntries(DEV_FIELDS.map(k => [k, dev[k]])));
function restore(sn) { clearTimeout(dev.timer); dev.timer = null; Object.assign(dev, JSON.parse(sn)); paint(); const u = UI[dev.cur]; if (u.auto && !manualTimers) dev.timer = setTimeout(() => { if (dev.cur) go(u.auto.to); }, u.auto.ms * timerScale); }
function paintStats(id) { go(id); const d = scrCanvas.getContext('2d').getImageData(0, 0, scrCanvas.width, scrCanvas.height).data; let lit = 0, tag = 0; for (let k = 0; k < d.length; k += 4) if (d[k + 1] > 120) lit++; const t = scrCanvas.getContext('2d').getImageData(104 * 4, 1 * 4, 16 * 4, 9 * 4).data; for (let k = 0; k < t.length; k += 4) if (t[k + 1] > 120) tag++; const gp = scrCanvas.getContext('2d').getImageData(94 * 4, 0, 5 * 4, 13 * 4).data; let gap = 0; for (let k = 0; k < gp.length; k += 4) if (gp[k + 1] > 120) gap++; return { id, lit, tag, gap, text: texts.join(' ') }; }

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
const FRAME = { rad: .42, y: .7 }, frame = { h: 0, applied: 0 };   // camera re-framing while an explosion is held
const Fr = h => 1 + FRAME.rad * h, Fy = h => FRAME.y * h;
const view = { cur: 0, tgt: 0 };                                       // extra upward shift of the model while the mobile drawer covers the bottom
function sph() { const o = camera.position.clone().sub(controls.target); const s = new THREE.Spherical().setFromVector3(o); return { az: s.theta, el: Math.PI / 2 - s.phi, rad: s.radius, tgt: controls.target.clone() }; }
function fitDist(hw, hh) { const w = stageW() - (isDesktop() ? 390 : 0), h = stageH() - (isDesktop() ? 150 : 200); const ha = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); const wa = ha * w / stageH(); const hh2 = ha * h / stageH(); return Math.max(hw / wa, hh / hh2) * 1.08; }
function flyTo(g, ms = 1100) {
  const a = sph(); let daz = g.az - a.az; daz = Math.atan2(Math.sin(daz), Math.cos(daz));
  tw = { t0: performance.now(), ms, a, daz, g };
}
function stepTween(now) {
  if (!tw) return; const k = clamp((now - tw.t0) / tw.ms, 0, 1), e = ease(k);
  const az = tw.a.az + tw.daz * e, el = tw.a.el + (tw.g.el - tw.a.el) * e, rad = tw.a.rad + (tw.g.rad * Fr(frame.h) - tw.a.rad) * e;
  const goalT = tw.g.tgt.clone(); goalT.y += Fy(frame.h); frame.applied = frame.h;
  const tgt = tw.a.tgt.clone().lerp(goalT, e);
  const sp = new THREE.Spherical(rad, Math.PI / 2 - clamp(el, -1.5, 1.5), az); camera.position.setFromSpherical(sp).add(tgt); controls.target.copy(tgt); camera.lookAt(tgt);
  if (k >= 1) { tw = null; sway.base = null; }
}
controls.addEventListener('start', () => { tw = null; frame.applied = frame.h; lastTouch = performance.now(); sway.base = null; });
let lastTouch = performance.now();

function setMode(mode, opts = {}) {
  S.mode = mode; const p = PRESET[mode];
  applyHolds();
  const el = (S.flip ? -1 : 1) * p.el * Math.PI / 180;
  flyTo({ az: opts.az ?? p.az, el, rad: fitDist(p.hw, p.hh), tgt: new THREE.Vector3(...p.tgt) });
  document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  closeInfo(); lastTouch = performance.now();
}
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { S.flip = false; setMode(b.dataset.mode); }));
/* ---- hold-to-explode: hold Ctrl (desktop) or the on-screen hold control (touch / keyboard); release to reassemble ---- */
const holds = new Set();
const presetEx = () => (PRESET[S.mode] ? PRESET[S.mode].ex : 0);
function applyHolds() {
  const was = S.explodeT; S.explodeT = holds.size ? 1 : presetEx();
  const on = holds.has('pointer') || holds.has('key'); const hb = $('#explode-hold');
  hb.classList.toggle('on', on); hb.setAttribute('aria-pressed', String(on));
  if (was !== S.explodeT) { const st = $('#explode-status'); if (st) st.textContent = S.explodeT === 1 ? 'Exploded view' : 'Assembled view'; }
}
function hold(src) { if (holds.has(src)) return; holds.add(src); applyHolds(); lastTouch = performance.now(); }
function release(src) { if (!holds.delete(src)) return; applyHolds(); }
function releaseAll() { if (!holds.size) return; holds.clear(); applyHolds(); }
{
  const syncMods = e => { if (holds.has('ctrl') && e.ctrlKey === false && e.key !== 'Control') release('ctrl'); };   // recovers a stuck modifier (missed keyup)
  ['pointermove', 'pointerdown', 'mousemove', 'mousedown', 'wheel', 'touchstart', 'keyup'].forEach(t => addEventListener(t, syncMods, { capture: true, passive: true }));
  addEventListener('wheel', e => { if (e.ctrlKey && holds.has('ctrl')) release('ctrl'); }, { capture: true, passive: true });
  addEventListener('blur', releaseAll); addEventListener('pagehide', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' || document.hidden) releaseAll(); });
  addEventListener('contextmenu', () => release('ctrl'));
  // Ctrl+wheel and pinch-zoom belong to the browser (page zoom): keep OrbitControls from swallowing them
  canvas.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) e.stopImmediatePropagation(); }, { capture: true, passive: true });
  const hb = $('#explode-hold');
  hb.addEventListener('pointerdown', e => { if (e.button > 0) return; e.preventDefault(); try { hb.setPointerCapture(e.pointerId); } catch (err) { } hold('pointer'); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => hb.addEventListener(t, () => release('pointer')));
  hb.addEventListener('contextmenu', e => e.preventDefault());
  hb.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) hold('key'); } });
  hb.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release('key'); } });
  hb.addEventListener('blur', () => release('key'));
  hb.addEventListener('click', e => e.preventDefault());
}
$('#labels').addEventListener('click', e => { S.labels = !S.labels; e.currentTarget.classList.toggle('on', S.labels); });
$('#spin').addEventListener('click', e => { S.auto = !S.auto; e.currentTarget.classList.toggle('on', S.auto); sway.base = null; lastTouch = performance.now(); });

/* keyboard equivalents */
function orbitBy(daz, del) {   // keyboard orbit (OrbitControls does not expose rotateLeft/rotateUp publicly)
  const sp = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  sp.theta += daz; sp.phi = clamp(sp.phi - del, .05, Math.PI - .05); camera.position.setFromSpherical(sp).add(controls.target);
}
function dolly(f) { const o = camera.position.clone().sub(controls.target).multiplyScalar(f); o.setLength(clamp(o.length(), controls.minDistance, controls.maxDistance)); camera.position.copy(controls.target).add(o); }
const inSidebar = t => !!(t && t.closest && t.closest('#sidebar'));
addEventListener('keydown', e => {
  if (e.key === 'Control') { if (!e.repeat && !(e.getModifierState && e.getModifierState('AltGraph'))) hold('ctrl'); return; }
  const mod = e.ctrlKey || e.metaKey || e.altKey;
  if (['Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock'].includes(e.key)) { if (e.key !== 'Shift') release('ctrl'); return; }
  const arrow = e.key.startsWith('Arrow');
  if (mod && !(arrow && !e.metaKey && !e.altKey)) { release('ctrl'); return; }     // browser/OS shortcut chords (zoom, tabs, copy ...) are never hijacked
  const t = e.target;
  if (e.key === 'Escape') { escapeKey(); e.preventDefault(); return; }
  if (inSidebar(t) || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable))) return;   // never steal scrolling/typing inside the panel
  const step = 0.12;
  switch (e.key) {
    case 'ArrowLeft': orbitBy(-step, 0); break;
    case 'ArrowRight': orbitBy(step, 0); break;
    case 'ArrowUp': orbitBy(0, step); break;
    case 'ArrowDown': orbitBy(0, -step); break;
    case '+': case '=': dolly(1 / 1.12); break;
    case '-': case '_': dolly(1.12); break;
    case '1': S.flip = false; setMode('outside'); break;
    case '2': S.flip = false; setMode('inside'); break;
    case '3': S.flip = false; setMode('exploded'); break;
    case 'l': case 'L': $('#labels').click(); break;
    case 'a': case 'A': $('#spin').click(); break;
    default: return;
  }
  e.preventDefault();
  lastTouch = performance.now(); sway.base = null; tw = null; controls.update();
});
addEventListener('keyup', e => { if (e.key === 'Control') release('ctrl'); });
function escapeKey() {
  const v = __sidebar.view();
  if (v === 'photo') { __sidebar.back(); return; }
  if (v === 'detail') { closeInfo(); return; }
  if (__sidebar.isDrawer() && __sidebar.isOpen()) { __sidebar.close(); return; }
  if ($('#explain').classList.contains('show')) { hideExplain(); return; }
  if (!$('#photo-overlay').hidden) dismissPhoto(currentPhotoId);
}

/* Real photographs: nearly face-on reference views; narrow angular windows. */
const PHOTOS = [
  { id: 'outside_product', src: 'assets/photos/outside_product.png', alt: 'Wesatoshis card, front', cap: 'Finished card, front', gate: 'front', az: 0, el: 1.48 },
  { id: 'outside_nwc_in_hand', src: 'assets/photos/outside_nwc_in_hand.png', alt: 'Card in hand showing the Nostr Wallet Connect prompt', cap: 'Nostr Wallet Connect on the screen', gate: 'nwc', az: .08, el: 1.44 },
  { id: 'pcb_front', src: 'assets/photos/pcb_front.jpg', alt: 'PCB, display and button side', cap: 'PCB — display & button side', gate: 'insideTop', az: 0, el: 1.48 },
];
const suppressed = {};
const seenPhotos = new Set();
let currentPhotoId = null;
function photoGate(ph) {
  if (S.explode > .03 || S.explodeT > .03 || S.flip) return false;
  if (ph.gate === 'front') return S.mode === 'outside' && S.gF < .1 && dev.cur !== 'nwc';
  if (ph.gate === 'nwc') return S.mode === 'outside' && S.gF < .1 && dev.cur === 'nwc';
  return S.mode === 'inside' && S.gF > .9;
}
function photoScore(id, margin = 1) {
  const ph = PHOTOS.find(p => p.id === id); if (!ph || !photoGate(ph)) return 0;
  const p = sph(), da = Math.abs(Math.atan2(Math.sin(p.az-ph.az), Math.cos(p.az-ph.az)));
  return da < .14 * margin && Math.abs(p.el-ph.el) < .10 * margin ? 1 : 0;
}
function dismissPhoto(id) { if (id) suppressed[id] = true; }
function updatePhoto() {
  const best = PHOTOS.find(ph => !suppressed[ph.id] && (currentPhotoId === ph.id || !seenPhotos.has(ph.id)) && photoScore(ph.id, currentPhotoId === ph.id ? 1.2 : 1));
  const el = $('#photo-overlay');
  if (best) {
    if (currentPhotoId !== best.id) { $('#photo-img').src = best.src; $('#photo-img').alt = best.alt; $('#photo-cap').textContent = best.cap; }
    seenPhotos.add(best.id);
    currentPhotoId = best.id; el.hidden = false; el.classList.add('show');
  } else { currentPhotoId = null; el.classList.remove('show'); el.hidden = true; }
}
$('#photo-x').addEventListener('click', () => { dismissPhoto(currentPhotoId); currentPhotoId = null; $('#photo-overlay').hidden = true; });
$('#photo-open').addEventListener('click', () => {
  const img = $('#photo-view-img'); img.src = $('#photo-img').src; img.alt = $('#photo-img').alt;
  $('#photo-view-caption').textContent = $('#photo-cap').textContent; __sidebar.show('photo', { open: true, focus: true });
});
$('#photo-view-back').addEventListener('click', () => __sidebar.back());

/* features panel */
const ICON = {
  wallet: '<path d="M3 7h15a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM3 7l12-3v3M17 14h2"/>',
  pay: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  nostr: '<path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.5 7.1 18.2 8 12.7 4 8.8l5.5-.8z"/>',
  node: '<path d="M9 15l6-6M11 6l2-2a3.5 3.5 0 0 1 5 5l-2 2M13 18l-2 2a3.5 3.5 0 0 1-5-5l2-2"/>',
  pin: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  qr: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v3M14 20h3v1M20 20h1"/>',
  open: '<path d="M8 6 3 12l5 6M16 6l5 6-5 6M13.500 4l-3 16"/>',
  price: '<path d="M3 17l5-6 4 3 8-9M16 5h4v4"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.500 8-8 9-4.500-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  psbt: '<rect x="4" y="3" width="12" height="18" rx="2"/><path d="M8 8h4M8 12h4M17 9l4 3-4 3"/>',
  tor: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.500"/>',
  multisig: '<circle cx="7" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><circle cx="12" cy="17" r="3"/>',
  xmr: '<circle cx="12" cy="12" r="9"/><path d="M7 15V9l5 5 5-5v6"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.500 8.500h.01M15.500 8.500h.01M12 12h.01M8.500 15.500h.01M15.500 15.500h.01"/>',
  standalone: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h4M7 14h2"/>',
};
/* badge: shown for anything that is not documented in the manufacturer's FAQ/site; see "Feature status" */
const PRODUCER = 'Producer information';
const FEATURES = [
  { ic: 'wallet', t: 'Self-custody card', d: 'The manufacturer says your keys stay on the card.', mode: 'inside', focus: 'esp32', exp: ['Self-custody', 'The manufacturer says your keys stay on the card. It is a transfer tool, not a cold-storage replacement.'] },
  { ic: 'pay', t: 'Lightning via NWC', d: 'Pay BOLT11 invoices from your wallet balance, a home node or Nostr Wallet Connect.', mode: 'outside', focus: 'oled', screen: 'pay', exp: ['Lightning payments', 'Speaks the Bitcoin protocol natively and pays Lightning invoices on the card: from the wallet balance, a home Lightning node, or Nostr Wallet Connect (official tutorial, lesson 4).'] },
  { ic: 'nostr', t: 'Nostr zaps', d: 'A built-in Nostr client pairs NWC and zaps friends added by Nostr public key.', mode: 'outside', focus: 'oled', screen: 1, exp: ['Nostr on board', 'A built-in Nostr client pairs Nostr Wallet Connect to pay invoices and zaps friends you add by Nostr public key (FAQ).'] },
  { ic: 'qr', t: 'QR scanning', d: 'The built-in scanner reads invoices, Wi-Fi and node codes on the fly.', mode: 'inside', focus: 'qr', screen: 2, exp: ['Scan to pay', 'A dedicated scanner chip decodes QR codes on the fly — standard codes; inverted or coloured scanning needs enabling.'] },
  { ic: 'node', t: 'Native SPV, no Electrum', d: 'Direct peer-to-peer with SPV header verification; connect to your own Bitcoin node via a btcnode: QR code.', mode: 'inside', focus: 'esp32', screen: 3, exp: ['SPV and your own node', 'Connects over the native Bitcoin protocol with SPV header verification — no Electrum server. SPV is not full-node validation. Your own Bitcoin node is a separate device you run; the card links to it with a btcnode: QR code.'] },
  { ic: 'pin', t: 'PIN & decoy mode', d: 'PIN and decoy mode are described by the manufacturer.', mode: 'outside', focus: 'buttons', screen: 4, exp: ['PIN & decoy', 'The manufacturer describes PIN and decoy mode, but its descriptions differ.'] },
  { ic: 'open', t: 'Open hardware', d: 'Download the enclosure files and print your own case.', mode: 'exploded', focus: null, exp: ['Open hardware', 'The enclosure STLs, screen cut path and STEP board model are published for download.'] },
  { ic: 'price', t: 'Real-time BTC price', d: 'Live price and fee data on the card.', mode: 'outside', focus: 'oled', screen: 'price', exp: ['Price & fees', 'The FAQ says Bitcoin price and fee data are fetched without a central server and shown on the card. Values on the simulated screen are placeholders.'] },
  { ic: 'shield', t: 'Secure elements', d: 'Used mainly to generate your seed during wallet setup.', mode: 'inside', focus: null, screen: 'setup', exp: ['Secure element', 'The FAQ says the secure element is used primarily to generate a new seed phrase during wallet setup. The site also advertises an “EAL-certified” element; that certification is a manufacturer claim.'] },
  { ic: 'pay', t: 'Lightning via Arkade', badge: PRODUCER, d: 'Lightning payments powered by Arkade.', mode: 'outside', focus: 'oled', screen: 'arkade', sub: 'Producer information · newer than the public FAQ', exp: ['Lightning via Arkade', 'Lightning payments powered by Arkade are available, per the producer. A June 2026 post on the manufacturer’s X account first described it as Developer Mode. The simulated screen shows Arkade as a payment source.'] },
  { ic: 'tor', t: 'Tor support', badge: PRODUCER, d: 'Tor is listed among the card’s features.', mode: 'outside', focus: 'oled', screen: 'tor', sub: 'Producer information · newer than the public FAQ', exp: ['Tor support', 'Tor support is listed by the producer. The older public FAQ answer (“Is VPN or Tor built in?”) is preserved on the FAQ page and may differ from this newer information.'] },
  { ic: 'multisig', t: 'Bitcoin multisig', badge: PRODUCER, d: 'Multisignature Bitcoin wallets.', mode: 'outside', focus: 'oled', screen: 'multisig', sub: 'Producer information · newer than the public FAQ', exp: ['Bitcoin multisig', 'Bitcoin multisig is listed by the producer. How policies and co-signing work on the card was not supplied, so the simulated screen is only an illustration.'] },
  { ic: 'xmr', t: 'XMR payments', badge: PRODUCER, d: 'Pay with Monero (XMR).', mode: 'outside', focus: 'oled', screen: 'xmr', sub: 'Producer information · newer than the public FAQ', exp: ['XMR payments', 'XMR (Monero) payments are listed by the producer. How they work on the card was not supplied, so the simulated screen is only an illustration.'] },
  { ic: 'psbt', t: 'PSBT with an external signer', badge: PRODUCER, d: 'PSBT workflow with an external air-gapped wallet. The card is not air-gapped.', mode: 'outside', focus: 'oled', screen: 'psbt', sub: 'Producer information · newer than the public FAQ', exp: ['PSBT workflow', 'The producer lists a PSBT workflow with an external air-gapped wallet. The air-gapped device is the external signer; the card itself uses Wi-Fi and is not air-gapped. Moving a PSBT between the two devices is part of the workflow.'] },
  { ic: 'swap', t: 'Swaps via Trocador', badge: PRODUCER, d: 'USDT, USDC, ETH, BTC and XMR swaps through a third-party service.', mode: 'outside', focus: 'oled', screen: 'swap', sub: 'Producer information · newer than the public FAQ', exp: ['Swaps via Trocador', 'The producer lists swaps between USDT, USDC, ETH, BTC and XMR via Trocador (trocador.app), a third-party swap service. Rates, fees and terms come from that service, not from the Bitcoin network. How it appears on the card was not supplied.'] },
  { ic: 'dice', t: 'Dice rolls', badge: PRODUCER, d: 'Dice rolls are listed among the card’s features.', mode: 'outside', focus: 'oled', screen: 'dice', sub: 'Producer information · newer than the public FAQ', exp: ['Dice rolls', 'Dice rolls are listed by the producer. The simulated rolls are fixed demo values, not random entropy, and nothing is generated.'] },
  { ic: 'standalone', t: 'Standalone card', badge: PRODUCER, d: 'Made to be used without a computer or phone app.', mode: 'outside', focus: 'buttons', screen: 'balance', sub: 'Producer information · newer than the public FAQ', exp: ['Standalone use', 'The producer describes the card as standalone: no computer or phone app is needed to pay. Some setup tasks, such as generating Wi-Fi or node QR codes, preparing the SD card or flashing firmware, may still use another device.'] },
];
FEATURES.forEach((f, i) => {
  const li = document.createElement('li');
  li.innerHTML = `<button data-i="${i}"><span class="ic"><svg viewBox="0 0 24 24">${ICON[f.ic]}</svg></span><span><b>${f.t}</b>${f.badge ? `<span class="bdg">${f.badge}</span>` : ''}<span class="d">${f.d}</span></span></button>`;
  li.firstChild.addEventListener('click', () => { document.querySelectorAll('#feat-list button').forEach(b => b.classList.remove('on')); li.firstChild.classList.add('on'); applyFeature(f); });
  $('#feat-list').appendChild(li);
});
function applyFeature(f) {
  if (f.run) f.run(); else if (f.screen != null) drawScreen(typeof f.screen === 'string' ? SCREENS.findIndex(x => x.id === f.screen) : f.screen);
  S.flip = f.focus === 'qr' || f.focus === 'esp32';
  setMode(f.mode); showInfo({ t: f.exp[0], s: f.sub || 'Manufacturer-described feature', d: f.exp[1] }, { pinned: true });
  const link = $('#info-link'); link.hidden = false; link.href = f.ic === 'open' ? 'https://wesatoshis.com/enclosure/' : f.ic === 'qr' || f.ic === 'node' ? 'https://wesatoshis.com/qr' : 'https://wesatoshis.com/'; link.textContent = f.ic === 'open' ? 'Explore enclosure files ↗' : f.ic === 'qr' || f.ic === 'node' ? 'Explore QR generator ↗' : 'Explore the card at wesatoshis.com ↗';
  if (f.exp) showExplain(f.exp[0], f.exp[1]);
}
/* screen picker (index of the simulated screens) + on-screen device buttons (keyboard / touch alternative to the 3D buttons) */
SCREENS.forEach((m, i) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.screen = i; b.textContent = m.label; b.setAttribute('aria-pressed', 'false'); b.title = m.src; b.addEventListener('click', () => { drawScreen(i); announce(); }); $('#screen-picker').appendChild(b); });
document.querySelectorAll('#device-pad button[data-key]').forEach(b => b.addEventListener('click', () => devKey(b.dataset.key)));

const COMPONENT_FACTS = {
  oled: 'The manufacturer describes prompts for Bitcoin, Lightning and Nostr. The screen here is a simulation: use the card’s UP, DOWN, BACK and OK buttons, nothing is connected, paid or sent.',
  qr: 'The manufacturer says the scanner reads invoices, Wi-Fi and node codes; inverted or coloured codes require enabling.',
  battery: 'The manufacturer advertises up to three hours of continuous use and about 35 minutes to charge; the capacity discrepancy is unresolved.',
  sd: 'The manufacturer says the SD card stores headers and encrypted wallet data and supports offline firmware updates. Recovery is not explained in the FAQ.',
  esp32: 'The manufacturer describes direct Bitcoin peer-to-peer connections and SPV header verification, not full-node validation. It also lists a hardware secure element used mainly to generate your seed.',
  buttons: 'The manufacturer describes PIN and decoy mode, but its descriptions of their interaction differ. Click UP, DOWN, BACK or OK on the model to move around the simulated screen.',
  buzzer: 'The manufacturer says sound can be switched on or off in settings.',
  shell: 'The manufacturer publishes enclosure files and assembly specifications.'
};
function showInfo(h, { pinned = false, preview = false } = {}) {
  $('#info-link').hidden = true;
  $('#info-t').textContent = h.t; $('#info-s').textContent = h.s; $('#info-d').textContent = h.d + (COMPONENT_FACTS[h.id] ? ' ' + COMPONENT_FACTS[h.id] : '');
  __sidebar.show('detail', { open: !preview, focus: pinned });
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
  if (__sidebar.isDrawer() && !__sidebar.isOpen()) return;
  const v = __sidebar.view(); if (v !== 'features' && v !== 'detail') return;
  showInfo(h, { preview: true });
}
function unpreview(id) {
  if (S.sel === id) return;
  const h = HOT.find(x => x.id === S.sel);
  if (h) showInfo(h, { pinned: true });
  else { $('#info').classList.remove('preview', 'pinned'); if (__sidebar.view() === 'detail') __sidebar.back(); }
}
function closeInfo() { S.sel = null; $('#info').classList.remove('pinned', 'preview'); Object.values(hsEls).forEach(el => el.classList.remove('act')); if (__sidebar.view() === 'detail') __sidebar.back(); }
$('#info-x').addEventListener('click', () => { const m = PRESET[S.mode] ? S.mode : 'outside'; setMode(m); });

/* explain text (behind the card) */
let explainTimer = null;
function showExplain(title, text) {
  $('#explain-t').textContent = title; $('#explain-d').textContent = text;
  const ex = $('#explain'); ex.classList.add('show'); ex.setAttribute('aria-hidden', 'false');
  clearTimeout(explainTimer); explainTimer = setTimeout(hideExplain, 7000);
}
function hideExplain() { const ex = $('#explain'); ex.classList.remove('show'); ex.setAttribute('aria-hidden', 'true'); }

/* clicking the card in 3D: the four buttons drive the simulated screen; other parts open their details */
const ray = new THREE.Raycaster(); let down = null;
const CAPKEY = { sw_up_cap: 'up', sw_down_cap: 'down', sw_back_cap: 'back', sw_ok_cap: 'ok' };
const capKey = m => { for (const [n, k] of Object.entries(CAPKEY)) if (nodes[n] === m) return k; return null; };
const capClient = key => { const m = nodes[Object.keys(CAPKEY).find(n => CAPKEY[n] === key)]; const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()); c.project(camera); const r = canvas.getBoundingClientRect(); return { x: r.left + (c.x * .5 + .5) * r.width, y: r.top + (-c.y * .5 + .5) * r.height, z: c.z }; };
function nearestCap(cx, cy, radius = 26) {   // forgiving touch target: the tiny 3D buttons also react to a tap close to them
  if (camera.position.y < 0.5 || S.gB > .5) return null;
  let best = null, bd = radius;
  for (const k of Object.values(CAPKEY)) { const p = capClient(k); if (p.z > 1) continue; const d = Math.hypot(cx - p.x, cy - p.y); if (d < bd) { bd = d; best = k; } }
  return best;
}
canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || performance.now() - down.t > 450) return;
  const r = canvas.getBoundingClientRect(); const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(v, camera); const hit = ray.intersectObjects([...capMeshes, nodes.screen, nodes.oled_glass, ...(S.gF > .5 ? [] : [nodes.top_cover])], false)[0];
  if (hit && capMeshes.includes(hit.object)) { devKey(capKey(hit.object)); return; }
  const near = nearestCap(e.clientX, e.clientY); if (near) { devKey(near); return; }
  if (hit && (hit.object === nodes.screen || hit.object === nodes.oled_glass)) { select('oled'); }
  else if (hit && hit.object === nodes.top_cover) { select('cover'); } else {
    const modelHit = ray.intersectObjects(Object.values(nodes).filter(n => n && n.isMesh && !(n === nodes.top_cover && S.gF > .5) && !(n === nodes.back_shell && S.gB > .5)), false)[0];
    if (modelHit) { const h = HOT.find(x => nodes[x.node] === modelHit.object); if (h) select(h.id); }
  }
});
const pressing = new Map();
function press(m) { pressing.set(m, performance.now()); }
function pressCap(k) { const n = Object.keys(CAPKEY).find(x => CAPKEY[x] === k); if (n && nodes[n]) press(nodes[n]); }

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
  view.tgt = sheetShift(); view.cur = view.tgt; applyView(); sky.setPixelRatio(renderer.getPixelRatio());
}
function sheetShift() { if (!window.__sidebar || !__sidebar.isDrawer() || !__sidebar.isOpen()) return 0; return Math.max(0, Math.round($('#sidebar').getBoundingClientRect().height / 2 - 55)); }
function applyView() { const w = stageW(), h = stageH(); camera.setViewOffset(w, h, isDesktop() ? 190 : 0, 55 + view.cur, w, h); camera.updateProjectionMatrix(); }
$('#sidebar').addEventListener('sbchange', () => { view.tgt = sheetShift(); });
addEventListener('resize', () => { resize(); const p = PRESET[S.mode]; if (p && !tw) { const a = sph(); camera.position.sub(controls.target).setLength(fitDist(p.hw, p.hh) * Fr(frame.h)).add(controls.target); } });

function tick() {
  const dt = Math.min(clock.getDelta(), .05), now = performance.now();
  const rm = prefersReduced();
  const hT = (holds.size && presetEx() < 1) ? 1 : 0;
  frame.h = rm ? hT : frame.h + (hT - frame.h) * (1 - Math.exp(-dt * 5)); if (Math.abs(frame.h - hT) < .002) frame.h = hT;
  stepTween(now);
  if (!tw && frame.h !== frame.applied) {
    const r = Fr(frame.h) / Fr(frame.applied), o = camera.position.clone().sub(controls.target).multiplyScalar(r);
    controls.target.y += Fy(frame.h) - Fy(frame.applied); camera.position.copy(controls.target).add(o); frame.applied = frame.h;
  }
  const dv = view.tgt - view.cur; if (dv !== 0) { view.cur = (rm || Math.abs(dv) < .3) ? view.tgt : view.cur + dv * (1 - Math.exp(-dt * 8)); applyView(); }
  // explode
  if (rm) S.explode = S.explodeT; else S.explode += (S.explodeT - S.explode) * (1 - Math.exp(-dt * 5));
  if (Math.abs(S.explode - S.explodeT) < .002) S.explode = S.explodeT;
  const t = S.explode;
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
  updateHotspots(now);
  updatePhoto();
  sky.stars.position.copy(camera.position);
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
    let vis = !!show && !(S.sel === 'oled' && hs.id === 'oled') && (!S.sel || S.sel === hs.id) && (exploded || inside ? !(inside && !exploded && hs.noInside) : !!(hs.outside && hs.pr <= 1));
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
    const maxY = (small && __sidebar.isOpen()) ? Math.min(h - 150, $('#sidebar').getBoundingClientRect().top - 30) : h - (small ? 150 : 110); const over = (arr.length ? arr[arr.length - 1].ly : 0) - maxY;
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
  resize(); go('home');
  try { await build(); } catch (e) { console.error(e); $('#loader-t').textContent = 'Could not load the 3D model — serve this folder over http (see README).'; return; }
  // initial camera
  const hash = (location.hash || '').replace('#', '').split('&'); const mode = ['outside', 'inside', 'exploded'].includes(hash[0]) ? hash[0] : 'outside';
  const p = PRESET[mode]; S.flip = hash.includes('flip');
  const el = (S.flip ? -1 : 1) * p.el * Math.PI / 180; const az = p.az; const rad = fitDist(p.hw, p.hh);
  camera.position.setFromSpherical(new THREE.Spherical(rad * 1.5, Math.PI / 2 - el, az - .6)).add(new THREE.Vector3(...p.tgt)); controls.target.set(...p.tgt);
  const sc = hash.find(x => x.startsWith('screen=')); if (sc) drawScreen(+sc.split('=')[1] || 0);
  if (hash.includes('still')) S.auto = false;
  if (reducedMotion) { S.auto = false; sway.phase = 0; }
  $('#spin').classList.toggle('on', S.auto);
  S.mode = mode; S.explodeT = p.ex; S.explode = p.ex;
  document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  flyTo({ az, el, rad, tgt: new THREE.Vector3(...p.tgt) }, 1600);
  if (hash.includes('still')) { tw = null; camera.position.setFromSpherical(new THREE.Spherical(rad, Math.PI / 2 - el, az)).add(new THREE.Vector3(...p.tgt)); controls.update(); }
  const sel = hash.find(x => x.startsWith('select=')); if (sel) setTimeout(() => select(sel.split('=')[1]), 100);
  $('#bar').style.width = '100%'; setTimeout(() => $('#loader').classList.add('done'), 250);
  updateScreenUI();
  renderer.setAnimationLoop(tick);
  window.__viz = { S, M, scene, nodes, setMode, select, camera, controls, drawScreen, THREE, renderer, layer, anchors, sky,
    holds: () => [...holds], screens: SCREENS, screenCanvas: scrCanvas, screenText: i => { drawScreen(i); return texts.slice(); }, currentScreen: () => curScreen, viewShift: () => view.cur,
    capClient,
    ui: { states: () => Object.keys(UI), state: () => dev.cur, data: () => JSON.parse(snapshot()), key: devKey, snapshot, restore, stats: paintStats, go, setManual: v => { manualTimers = !!v; clearTimeout(dev.timer); }, setTimerScale: v => { timerScale = v; }, fireAuto: () => { const u = UI[dev.cur]; if (u.auto) go(u.auto.to); }, hasAuto: () => !!UI[dev.cur].auto, announced: () => announced, setPay: (k, f) => { dev.payKind = k; dev.payFrom = f; } } };
  window.__product = {
    photos: PHOTOS.map(p => ({ id: p.id, label: p.cap, src: p.src })),
    photoScore, dismissPhoto,
    explain: () => ({ active: $('#explain').classList.contains('show'), title: $('#explain-t').textContent, text: $('#explain-d').textContent }),
    reducedMotion,
  };
})();
