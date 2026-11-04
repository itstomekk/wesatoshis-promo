import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { initSound } from './sound.js';
import { initSelfie } from './selfie.js';

/* ------------------------------------------------------------------ helpers */
const $ = (s, r = document) => r.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const MM = 0.1;                       // CAD mm -> scene cm
const isDesktop = () => innerWidth > 860;
const stage = $('#stage');
const sound = initSound();
const selfie = initSelfie(stage, () => prefersReduced(), { onShutter: () => sound.shutter() });
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

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 320);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.075;
controls.minDistance = 2.2; controls.maxDistance = 90; controls.enablePan = false;
controls.rotateSpeed = 0.8; controls.zoomSpeed = 0.8;

const key = new THREE.DirectionalLight(0xfff0dd, 2.0); key.position.set(4, 10, 6); scene.add(key);
const fill = new THREE.DirectionalLight(0x9db8ff, 0.55); fill.position.set(-7, 3, -2); scene.add(fill);
const rim = new THREE.DirectionalLight(0xF7931A, .7); rim.position.set(-4, 2, -8); scene.add(rim);
const under = new THREE.DirectionalLight(0xdfe6ff, 0.8); under.position.set(2, -8, 3); scene.add(under);

/* ------------------------------------------------------------------ cyber-galaxy sky and logo nebula
   All of it is part of the 3D scene, not a screen-fixed image: the nebula is baked once on the GPU into a cube map
   (2048 px faces on desktop, 1024 on phones) used as scene.background; stars are crisp camera-following points;
   the sky is part of the scene. */
const GLSL_NOISE = `
float h31(vec3 p){ p=fract(p*vec3(.1031,.1030,.0973)); p+=dot(p,p.yxz+33.33); return fract((p.x+p.y)*p.z); }
float vnoise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1.,0.,0.)),f.x),mix(h31(i+vec3(0.,1.,0.)),h31(i+vec3(1.,1.,0.)),f.x),f.y),
             mix(mix(h31(i+vec3(0.,0.,1.)),h31(i+vec3(1.,0.,1.)),f.x),mix(h31(i+vec3(0.,1.,1.)),h31(i+vec3(1.,1.,1.)),f.x),f.y),f.z); }
float fbm(vec3 p,int oct){ float a=.5,s=0.; for(int i=0;i<6;i++){ if(i>=oct) break; s+=a*vnoise(p); p=p*2.03+vec3(17.3,5.1,9.7); a*=.5; } return s; }
`;
const NEBULA_FRAG = `precision highp float; varying vec3 vDir;
uniform sampler2D uMask; uniform vec3 uC; uniform vec3 uR; uniform vec3 uU; uniform float uHalf; uniform float uGain;
${GLSL_NOISE}
float dustStars(vec3 d,float s,float thr){ vec3 p=d*s; vec3 id=floor(p); vec3 f=fract(p); float h=h31(id); if(h<thr) return 0.;
  vec3 c=vec3(h31(id+7.1),h31(id+13.7),h31(id+29.3))*.6+.2; float r=length(f-c); float b=(h-thr)/(1.-thr); return smoothstep(.15,.0,r)*(.3+.7*b); }
void main(){
  vec3 d=normalize(vDir);
  vec3 GAL=normalize(vec3(.28,.9,.33)), R1=normalize(vec3(.8,.25,-.45)), R2=normalize(vec3(-.35,.55,.75));
  float band=exp(-pow(dot(d,GAL)/.3,2.));
  float n1=fbm(d*1.8+vec3(3.,1.,7.),5), n2=fbm(d*3.2+vec3(-5.,9.,-2.),5), n3=fbm(d*7.+vec3(11.,-3.,5.),4), fine=fbm(d*26.+vec3(2.,8.,4.),3);
  float cy=max(0.,n1-.42)*2.2*(.25+.75*band)*(.5+1.0*fine);
  float mg=max(0.,n2-.47)*2.4*(.2+.8*band)*(.55+.9*fine);
  float lane=1.-.6*min(1.,max(0.,n3-.52)*3.)*band;
  float core=band*(.35+.65*n1);
  float r1=exp(-pow(dot(d,R1)/.03,2.))*.8, r2=exp(-pow(dot(d,R2)/.024,2.))*.6;
  vec3 c=vec3(2.+(cy*8.+mg*46.+core*14.+r2*18.)*lane, 3.+(cy*40.+mg*8.+core*18.+r1*26.+r2*6.)*lane, 8.+(cy*62.+mg*60.+core*34.+r1*36.+r2*40.)*lane)/255.;
  float sd=dustStars(d,150.,.90)+dustStars(d,300.,.94)*.8+dustStars(d,520.,.965)*.7;
  c+=vec3(.8,.88,1.)*sd*(.10+.30*band)*lane;
  /* nebula shaped like the Wesatoshis hood mark: soft gas body, dark face opening, two orange eyes */
  float z=dot(d,uC);
  if(z>.2){
    vec2 uv=vec2(dot(d,uR),dot(d,uU))/z/uHalf;
    /* two-scale domain warp breaks the clean logo outline into wisps; ridged noise adds filaments; dust lanes cut dark veins */
    vec3 q=d*5.0+vec3(4.,2.,9.);
    vec2 w=vec2(fbm(q,4),fbm(q+vec3(7.,3.,1.),4))-.5;
    vec3 q2=d*15.+vec3(3.,7.,1.)+vec3(w*2.,0.);
    vec2 w2=vec2(fbm(q2,3),fbm(q2+vec3(5.,1.,8.),3))-.5;
    vec2 tc=(uv+w*.12+w2*.04)*.5+.5;
    if(tc.x>-.2&&tc.x<1.2&&tc.y>-.2&&tc.y<1.2){
      vec3 m=texture2D(uMask,clamp(tc,0.,1.)).rgb;
      float eyeM=texture2D(uMask,(uv+w2*.02)*.5+.5).b;
      float cl=fbm(d*8.+vec3(1.,6.,3.)+vec3(w*1.6,0.),5), cl2=fbm(d*21.+vec3(8.,2.,5.),4);
      float rid=1.-abs(2.*fbm(d*11.+vec3(w*2.4,2.),5)-1.); rid=rid*rid*rid;
      float dust=smoothstep(.50,.78,fbm(d*17.+vec3(9.,4.,2.)+vec3(w2*3.,0.),4));
      float edge=smoothstep(.10,.5,m.g)*(1.-smoothstep(.5,.95,m.g))*(.60+.65*rid);
      float body=(m.g*(.30+.95*cl)+m.r*.42*(.15+1.1*cl)+edge*.55*rid)*(.45+1.1*rid)*(.70+.55*cl2);
      body*=1.-.6*dust;
      body*=smoothstep(-.02,.30,tc.y+.10*(cl-.5));   // the hood's flat base dissolves into loose gas instead of a straight edge
      vec3 gas=mix(vec3(.16,.09,.40),vec3(.50,.16,.50),smoothstep(.30,.85,cl*(.6+rid)));
      gas=mix(gas,vec3(.08,.36,.52),smoothstep(.2,.9,edge*(1.2-cl)+.18*uv.y));
      c+=gas*body*uGain*.52;
      float eyeCl=(.62+.70*cl2)*(1.-.35*dust);
      c+=(vec3(1.,.48,.10)*eyeM*eyeCl*.58+vec3(1.,.72,.40)*pow(eyeM,4.)*.26*(.7+.6*rid))*uGain;
    }
  }
  gl_FragColor=vec4(pow(max(c,0.),vec3(2.2)),1.);
}`;
const STAR_VERT = 'attribute float size; attribute vec3 aCol; varying vec3 vC; varying float vS; uniform float uPx; void main(){ vC=aCol; vS=size; gl_PointSize=size*uPx; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
const STAR_FRAG = 'varying vec3 vC; varying float vS; void main(){ float d=length(gl_PointCoord-.5)*2.; float core=smoothstep(.66,.22,d); float halo=pow(max(0.,1.-d),3.)*.34*step(2.4,vS); gl_FragColor=vec4(vC*(core+halo),1.0); }';

/* the hood mark from favicon.svg as a three-channel mask: R = wide halo, G = body, B = eyes */
function hoodMaskCanvas(S = 512) {
  const BODY = new Path2D('M6 58V30C6 14.6 13.8 8 32 8s26 6.6 26 22v28ZM10 39v12h44V39Z'), LIDS = new Path2D('M17 39v2a5 5 0 0 0 10 0v-2ZM37 39v2a5 5 0 0 0 10 0v-2Z');
  const k = S * .74 / 56, canBlur = typeof document.createElement('canvas').getContext('2d').filter === 'string';
  const layer = (draw, blur) => {
    const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    const src = document.createElement('canvas'); src.width = src.height = S; const sg = src.getContext('2d');
    sg.translate(S / 2 - 32 * k, S / 2 - 33 * k); sg.scale(k, k); sg.fillStyle = '#fff'; draw(sg);
    if (canBlur) { g.filter = `blur(${blur}px)`; g.drawImage(src, 0, 0); g.filter = 'none'; }
    else { const s = Math.max(4, Math.round(S / Math.max(2, blur * 1.6))), t = document.createElement('canvas'); t.width = t.height = s; t.getContext('2d').drawImage(src, 0, 0, s, s); g.imageSmoothingQuality = 'high'; g.drawImage(t, 0, 0, S, S); }
    return g.getImageData(0, 0, S, S).data;
  };
  const body = g => { g.fill(BODY, 'evenodd'); g.fill(LIDS); };
  const eyes = g => { for (const x of [22, 42]) { g.beginPath(); g.ellipse(x, 43.6, 3.2 * 1.15, 1.9 * 1.5, 0, 0, Math.PI * 2); g.fill(); } };
  const R = layer(body, S * .075), G = layer(body, S * .016), B = layer(eyes, S * .026);
  const out = document.createElement('canvas'); out.width = out.height = S; const og = out.getContext('2d'), od = og.createImageData(S, S);
  for (let i = 0; i < S * S; i++) { od.data[4 * i] = R[4 * i]; od.data[4 * i + 1] = G[4 * i]; od.data[4 * i + 2] = B[4 * i]; od.data[4 * i + 3] = 255; }
  og.putImageData(od, 0, 0); return out;
}

/* default camera direction -> where to hang the nebula in the default view */
const DEF_VIEW = (() => {
  const dv = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - 50 * Math.PI / 180, .42).negate();
  const up = new THREE.Vector3(0, 1, 0).addScaledVector(dv, -dv.y).normalize(), right = new THREE.Vector3().crossVectors(dv, up).normalize();
  return { dv, up, right };
})();
const tanD = d => Math.tan(d * Math.PI / 180);

function makeSky() {
  const N = isDesktop() ? 2048 : 1024, maskCanvas = hoodMaskCanvas(512);
  const mask = new THREE.CanvasTexture(maskCanvas); mask.colorSpace = THREE.NoColorSpace; mask.minFilter = mask.magFilter = THREE.LinearFilter; mask.generateMipmaps = false;
  // logo nebula basis: centre direction slightly above the default line of sight, hood upright on screen
  const C = DEF_VIEW.dv.clone().addScaledVector(DEF_VIEW.up, tanD(LOGO.up)).addScaledVector(DEF_VIEW.right, tanD(LOGO.right)).normalize();
  let U = new THREE.Vector3(0, 1, 0).addScaledVector(C, -C.y).normalize(), Rr = new THREE.Vector3().crossVectors(C, U).normalize();
  { const ro = LOGO.roll * Math.PI / 180, c = Math.cos(ro), s = Math.sin(ro), R2 = Rr.clone().multiplyScalar(c).addScaledVector(U, s), U2 = U.clone().multiplyScalar(c).addScaledVector(Rr, -s); Rr = R2; U = U2; }   // level the eyes on the default view
  const t0 = performance.now();
  const rt = new THREE.WebGLCubeRenderTarget(N, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, colorSpace: THREE.SRGBColorSpace, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false,
    uniforms: { uMask: { value: mask }, uC: { value: C }, uR: { value: Rr }, uU: { value: U }, uHalf: { value: tanD(LOGO.half) }, uGain: { value: LOGO.gain } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }', fragmentShader: NEBULA_FRAG });
  const bakeScene = new THREE.Scene(), dome = new THREE.Mesh(new THREE.SphereGeometry(5, 48, 32), mat); dome.frustumCulled = false; bakeScene.add(dome);
  const cc = new THREE.CubeCamera(.1, 20, rt); cc.update(renderer, bakeScene);
  renderer.setRenderTarget(null);
  mat.dispose(); dome.geometry.dispose();
  const bakeMs = performance.now() - t0;
  // crisp stars as camera-following points: sharp at any zoom, hidden behind the model by the depth test
  const r = rng(2025), COUNT = isDesktop() ? 11000 : 5200, pos = new Float32Array(COUNT * 3), col = new Float32Array(COUNT * 3), size = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z), b = Math.pow(r(), 4.5), tint = r();
    pos.set([s * Math.cos(a) * 120, z * 120, s * Math.sin(a) * 120], i * 3);
    const base = tint < .16 ? [.55, .88, 1] : tint < .24 ? [1, .6, .95] : tint < .27 ? [1, .74, .42] : [.88, .93, 1], k = .62 + .38 * b;
    col.set([base[0] * k, base[1] * k, base[2] * k], i * 3); size[i] = 1.25 + 3.9 * b;
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const smat = new THREE.ShaderMaterial({ uniforms: { uPx: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG });
  const stars = new THREE.Points(geo, smat); stars.frustumCulled = false; stars.renderOrder = -5;
  return { cube: rt.texture, rt, size: N, stars, mask, maskCanvas, logo: { center: C, up: U, right: Rr, half: LOGO.half }, bakeMs, count: COUNT, animated: false, setPixelRatio: v => { smat.uniforms.uPx.value = v; } };
}

const LOGO = isDesktop() ? { up: 14, right: 2.5, half: 17, gain: .85, roll: 1.6 } : { up: 8, right: 0, half: 10, gain: .85, roll: 1.6 };

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
const WIFI = ['HomeNet', 'CafeGuest', 'PhoneSpot', 'Office'];
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
    draw() { H('Pay'); qrPattern(6, 17, 21, 2); F(8); T('Type (UP/DOWN):', 52, 24); F(8, true); ['Lightning', 'On-chain', 'Monero (XMR)'].forEach((k, i) => T((dev.payKind === i ? '> ' : '  ') + k, 52, 34 + i * 9)); F(7); T('OK = scan', 52, 60); } },
  'pay.review': { sec: 'pay', label: 'Pay: review', say: () => `${KINDS[dev.payKind]} ${payAmt()}`, keys: { up: () => { if (dev.payKind === 0) dev.payFrom = wrap(dev.payFrom, 4, -1); }, down: () => { if (dev.payKind === 0) dev.payFrom = wrap(dev.payFrom, 4, 1); }, ok: 'pay.confirm', back: 'pay' },
    draw() { H('Review'); LN(0, KINDS[dev.payKind], false, 8); LN(1, payAmt(), true, 12); if (dev.payKind === 0) LN(2, 'From: ' + PAYSRC[dev.payFrom], false, 8); else if (dev.payKind === 1) LN(2, 'Fee ~2 sat/vB', false, 8); else LN(2, 'Fee ~0.00002 XMR', false, 8); FOOT(dev.payKind === 0 ? 'UP/DOWN source  OK next' : 'OK next  BACK scan'); } },
  'pay.confirm': { sec: 'pay', label: 'Pay: confirm', say: () => `Confirm ${payAmt()}? OK confirms, BACK cancels`, keys: { ok: 'pay.sending', back: 'pay.review' },
    draw() { H('Confirm'); LN(0, 'Pay ' + payAmt() + '?', true, 10); LN(1, 'To: Coffee shop', false, 8); LN(2, dev.payKind === 0 ? 'Fee: ~1 sat' : 'Fee: network rate', false, 8); FOOT('OK = confirm  BACK = cancel'); } },
  'pay.sending': { sec: 'pay', label: 'Pay: sending', say: () => 'Sending. BACK cancels', auto: { ms: 1400, to: 'pay.done' }, keys: { back: 'menu' },
    draw() { H('Sending...'); LN(0, 'Paying ' + payAmt(), false, 8); LN(1, 'Waiting for Nostr...', false, 8); BAR(.55); } },
  'pay.done': { sec: 'pay', label: 'Pay: done', say: () => 'Payment complete', keys: { ok: 'home', back: 'menu' },
    draw() { H('Done'); LN(0, 'Paid', true, 10); LN(1, payAmt(), false, 8); LN(2, dev.payKind === 0 ? 'Confirmed via Nostr' : dev.payKind === 1 ? 'Broadcast to peers' : 'Sent via Monero', false, 8); FOOT('OK home  BACK menu'); } },

  tor: { sec: 'tor', label: 'Tor', say: () => `Tor ${dev.tor ? 'on' : 'off'}`, keys: { up: () => { dev.tor = 1 - dev.tor; }, down: () => { dev.tor = 1 - dev.tor; }, ok: () => { dev.tor = 1 - dev.tor; }, back: 'menu' },
    draw() { H('Tor'); LN(0, 'Tor support', true, 10); LN(1, 'Status: ' + (dev.tor ? 'ON' : 'OFF'), false, 9); LN(2, 'Private connections', false, 8); FOOT('OK = toggle'); } },
  multisig: { sec: 'multisig', label: 'Multisig', say: () => 'Policy ' + POLICIES[dev.policy], keys: { ...cyc('policy', 2), ok: 'multisig.sign', back: 'menu' },
    draw() { H('Multisig'); LN(0, 'Policy (UP/DOWN):', false, 8); LN(1, '> ' + POLICIES[dev.policy], true, 11); LN(2, 'Co-sign with your keys', false, 8); FOOT('OK = sign'); } },
  'multisig.sign': { sec: 'multisig', label: 'Multisig: sign?', say: () => 'Co-sign this spend? OK signs', keys: { ok: 'multisig.done', back: 'multisig' },
    draw() { H('Sign?'); LN(0, 'Co-sign this spend', true, 9); LN(1, '25,000 sats', false, 8); LN(2, 'Policy ' + POLICIES[dev.policy], false, 8); FOOT('OK = sign  BACK = cancel'); } },
  'multisig.done': { sec: 'multisig', label: 'Multisig: signed', say: () => 'Co-signed', keys: { ok: 'home', back: 'multisig' },
    draw() { H('Signed'); LN(0, 'Signature 1 of ' + POLICIES[dev.policy][0], true, 9); LN(1, 'Waiting for the others', false, 8); FOOT('OK home  BACK policy'); } },
  psbt: { sec: 'psbt', label: 'PSBT', say: () => 'PSBT sync with an external air-gapped wallet', keys: { ok: 'psbt.review', back: 'menu' },
    draw() { H('PSBT'); LN(0, 'Create PSBT', true, 9); LN(1, 'Sign on air-gapped wallet', false, 8); LN(2, 'Broadcast with card', false, 8); FOOT('OK = start'); } },
  'psbt.review': { sec: 'psbt', label: 'PSBT: review', say: () => 'Review the PSBT signed by your wallet', keys: { ok: 'psbt.confirm', back: 'psbt' },
    draw() { H('Review PSBT'); LN(0, 'Spend 25,000 sats', true, 9); LN(1, 'Signed on your', false, 8); LN(2, 'air-gapped wallet', false, 8); FOOT('OK next  BACK = back'); } },
  'psbt.confirm': { sec: 'psbt', label: 'PSBT: confirm', say: () => 'Broadcast the transaction?', keys: { ok: 'psbt.done', back: 'psbt.review' },
    draw() { H('Broadcast?'); LN(0, 'Send via Wesatoshis', true, 9); LN(1, '25,000 sats', false, 8); LN(2, 'Fee ~3 sat/vB', false, 8); FOOT('OK = confirm  BACK = cancel'); } },
  'psbt.done': { sec: 'psbt', label: 'PSBT: done', say: () => 'Transaction broadcast', keys: { ok: 'home', back: 'psbt' },
    draw() { H('Done'); LN(0, 'Broadcast', true, 9); LN(1, 'Sent to the network', false, 8); FOOT('OK home  BACK = PSBT'); } },
  swap: { sec: 'swap', label: 'Swap (Trocador)', say: () => pair(), keys: { ...cyc('swap', 8), ok: 'swap.review', back: 'menu' }, draw() { H('Swap'); LIST(PAIRS.map(p => p[0] + ' > ' + p[1]), dev.swap); } },
  'swap.review': { sec: 'swap', label: 'Swap: review', say: () => pair() + ' via Trocador', keys: { ok: 'swap.confirm', back: 'swap' },
    draw() { H('Swap review'); LN(0, pair(), true, 10); LN(1, 'via Trocador', false, 8); LN(2, 'Review rate & fees', false, 8); FOOT('OK next  BACK = list'); } },
  'swap.confirm': { sec: 'swap', label: 'Swap: confirm', say: () => 'Confirm ' + pair() + '? OK confirms, BACK cancels', keys: { ok: 'swap.sending', back: 'swap.review' },
    draw() { H('Confirm swap'); LN(0, 'Swap ' + pair() + '?', true, 9); LN(1, 'via Trocador', false, 8); LN(2, 'Check the amount', false, 8); FOOT('OK = confirm  BACK = cancel'); } },
  'swap.sending': { sec: 'swap', label: 'Swap: working', say: () => 'Swapping. BACK cancels', auto: { ms: 1400, to: 'swap.done' }, keys: { back: 'menu' },
    draw() { H('Swapping...'); LN(0, 'Swapping...', false, 8); LN(1, 'via Trocador', false, 8); BAR(.55); } },
  'swap.done': { sec: 'swap', label: 'Swap: done', say: () => 'Swap complete', keys: { ok: 'home', back: 'menu' },
    draw() { H('Done'); LN(0, pair(), true, 10); LN(1, 'Swap complete', false, 8); LN(2, 'via Trocador', false, 8); FOOT('OK home  BACK menu'); } },
  dice: { sec: 'dice', label: 'Dice rolls', say: () => 'Roll ' + DICE[dev.dice], keys: { up: () => { dev.dice = wrap(dev.dice, 3, -1); }, down: () => { dev.dice = wrap(dev.dice, 3, 1); }, ok: () => { dev.dice = wrap(dev.dice, 3, 1); }, back: 'menu' },
    draw() { H('Dice rolls'); LN(0, 'Your rolls', false, 8); LN(1, DICE[dev.dice], true, 12); FOOT('OK = next roll'); } },
  recv: { sec: 'recv', label: 'Receive: choose type', say: () => KINDS[dev.recvKind], keys: { ...cyc('recvKind', 2), ok: 'recv.show', back: 'menu' },
    draw() { H('Receive'); LN(0, 'Type (UP/DOWN):', false, 8); F(9, true); T((dev.recvKind === 0 ? '> ' : '  ') + 'Lightning invoice', 3, 36); T((dev.recvKind === 1 ? '> ' : '  ') + 'Bitcoin address', 3, 47); FOOT('OK = create'); } },
  'recv.show': { sec: 'recv', label: 'Receive: waiting', say: () => (dev.recvKind === 0 ? 'Invoice' : 'Address') + ' ready. OK marks it received', keys: { ok: 'recv.done', back: 'recv' },
    draw() { H('Receive'); qrPattern(4, 16, 21, 2); F(8); T('Scan to pay', 52, 26); T(dev.recvKind === 0 ? '1,000 sats' : 'Bitcoin address', 52, 37); T('Waiting...', 52, 47); F(7); T('OK = received', 52, 60); } },
  'recv.done': { sec: 'recv', label: 'Receive: done', say: () => 'Payment received', keys: { ok: 'home', back: 'menu' },
    draw() { H('Received'); LN(0, 'Received', true, 10); LN(1, dev.recvKind === 0 ? '1,000 sats' : 'On-chain payment', false, 8); FOOT('OK home  BACK menu'); } },

  scan: { sec: 'scan', label: 'Scan QR', say: () => 'Scanner ready. OK to pick a code', keys: { ok: 'scan.pick', back: 'menu' },
    draw() { H('Scan QR'); qrPattern(6, 17, 21, 2); F(8); ['Invoice · Wi-Fi', 'or your node', '(btcnode:...)'].forEach((s, i) => T(s, 56, 28 + i * 10)); F(7); T('OK = scan', 56, 60); } },
  'scan.pick': { sec: 'scan', label: 'Scan: pick a code', say: () => SCAN[dev.scan][0], keys: { ...cyc('scan', 3), ok: () => go(SCAN[dev.scan][1]), back: 'scan' }, draw() { H('Scanned'); LIST(SCAN.map(s => s[0]), dev.scan); } },

  wifi: { sec: 'wifi', label: 'Wi-Fi', say: () => (dev.wifi === 0 ? 'Add Wi-Fi from a QR code' : WIFI[dev.wifi - 1]), keys: { up: () => { dev.wifi = wrap(dev.wifi, WIFI.length + 1, -1); }, down: () => { dev.wifi = wrap(dev.wifi, WIFI.length + 1, 1); }, ok: () => { if (dev.wifi === 0) go('wifi.qr'); else { dev.target = WIFI[dev.wifi - 1]; go('wifi.connecting'); } }, back: 'menu' },
    draw() { H('Wi-Fi 2.4GHz'); LIST(['Scan Wi-Fi QR', ...WIFI.map(n => n + (dev.connected === n ? ' *' : ''))], dev.wifi); } },
  'wifi.qr': { sec: 'wifi', label: 'Wi-Fi QR', say: () => 'Wi-Fi QR. OK joins', keys: { ok: () => { dev.target = 'QR-Net'; go('wifi.connecting'); }, back: 'wifi' },
    draw() { H('Wi-Fi QR'); qrPattern(6, 17, 21, 2); F(8); T('Network:', 56, 28); T('QR-Net', 56, 38); T('2.4 GHz', 56, 48); F(7); T('OK = join', 56, 60); } },
  'wifi.connecting': { sec: 'wifi', label: 'Wi-Fi: connecting', say: () => 'Connecting to ' + dev.target + '. BACK cancels', auto: { ms: 1500, to: 'wifi.done' }, keys: { back: 'wifi' },
    draw() { H('Connecting'); LN(0, dev.target, true, 9); LN(1, 'Joining 2.4 GHz', false, 8); BAR(.5); } },
  'wifi.done': { sec: 'wifi', label: 'Wi-Fi: connected', say: () => 'Connected to ' + dev.target + '. OK forgets it', enter() { dev.connected = dev.target; dev.saved = dev.saved.filter(n => n !== dev.target); dev.saved.push(dev.target); if (dev.saved.length > 2) dev.saved.shift(); },
    keys: { ok: () => { dev.saved = dev.saved.filter(n => n !== dev.connected); dev.connected = ''; go('wifi'); }, back: 'wifi' },
    draw() { H('Connected'); LN(0, dev.target, true, 9); LN(1, 'Online', false, 8); LN(2, `Saved ${dev.saved.length}/2`, false, 8); FOOT('OK = forget  BACK = list'); } },

  nostr: { sec: 'nwc', label: 'Nostr', say: () => NOSTR[dev.nostr][0], keys: { ...cyc('nostr', 2), ok: () => go(NOSTR[dev.nostr][1]), back: 'menu' }, draw() { H('Nostr'); LIST(NOSTR.map(n => n[0]), dev.nostr); } },
  nwc: { sec: 'nwc', label: 'Nostr Wallet Connect', say: () => 'Add a Nostr Wallet Connect relay? OK confirms', keys: { ok: 'nwc.done', back: 'nostr' },
    draw() { F(10, true); T('Nostr Connect', 2, 10); F(8); ['Would you like to add', 'wss://relay.getalby.com', '/v1 (NWC)?'].forEach((s, i) => T(s, 2, 25 + i * 10)); F(9, true); T('Press OK to confirm', 2, 61); } },
  'nwc.done': { sec: 'nwc', label: 'NWC: paired', say: () => 'Wallet connected', keys: { ok: 'home', back: 'nostr' },
    draw() { H('Connected'); LN(0, 'Nostr Wallet Connect', true, 9); LN(1, 'Ready to pay invoices', false, 8); FOOT('OK home  BACK Nostr'); } },
  zap: { sec: 'zap', label: 'Zap a friend', say: () => `Zap ${ZAPS[dev.zap]} sats`, keys: { ...cyc('zap', 3), ok: 'zap.done', back: 'nostr' },
    draw() { H('Zap a friend'); LN(0, 'To: npub1... friend', false, 8); LN(1, '> ' + ZAPS[dev.zap] + ' sats', true, 11); LN(2, 'UP/DOWN amount', false, 8); FOOT('OK = zap  BACK'); } },
  'zap.done': { sec: 'zap', label: 'Zap: sent', say: () => `Zapped ${ZAPS[dev.zap]} sats`, keys: { ok: 'home', back: 'nostr' },
    draw() { H('Zapped'); LN(0, ZAPS[dev.zap] + ' sats sent', true, 10); LN(1, 'Via Lightning', false, 8); FOOT('OK home  BACK Nostr'); } },

  node: { sec: 'node', label: 'Connect node', say: () => 'Home node. OK links it', keys: { ok: 'node.done', back: 'menu' },
    draw() { H('Connect node'); F(9); ['btcnode:192.168.1.10', ':8333', 'SPV · no Electrum'].forEach((s, i) => T(s, 2, 27 + i * 13)); FOOT('OK = link'); } },
  'node.done': { sec: 'node', label: 'Node: linked', say: () => 'Home node linked', keys: { ok: 'home', back: 'menu' },
    draw() { H('Node linked'); LN(0, 'Your own node', true, 9); LN(1, 'Direct P2P', false, 8); LN(2, 'SPV header checks', false, 8); FOOT('OK home  BACK menu'); } },
  block: { sec: 'block', label: 'Block tracker', say: () => `Block ${BLOCKS[dev.blk][0]}`, keys: { ...cyc('blk', 3), back: 'menu' },
    draw() { const b = BLOCKS[dev.blk]; H('New block'); LN(0, '#' + b[0], true, 11); LN(1, 'Miner: ' + b[1], false, 8); LN(2, 'Txs: ' + b[2], false, 8); FOOT('UP/DOWN browse  BACK'); } },
  mempool: { sec: 'mempool', label: 'Mempool & RBF', say: () => 'Unconfirmed transactions', keys: { back: 'menu' },
    draw() { H('Mempool'); LN(0, 'Unconfirmed tx: 1', false, 9); LN(1, 'RBF replacement seen', false, 8); LN(2, 'Watching the mempool', false, 8); FOOT('BACK = menu'); } },
  price: { sec: 'price', label: 'BTC price & fees', say: () => `${PRICES[dev.price][0]} price`, keys: { ...cyc('price', 2), back: 'menu' },
    draw() { H('BTC price'); LN(0, PRICES[dev.price][0] + ' ' + PRICES[dev.price][1], true, 11); LN(1, 'per bitcoin', false, 8); LN(2, 'Fee ~4 sat/vB', false, 8); FOOT('UP/DOWN currency  BACK'); } },
  '2fa': { sec: '2fa', label: 'AuthCodes 2FA', say: () => 'Code ' + CODES[dev.code], keys: { up: () => { dev.code = wrap(dev.code, 3, -1); }, down: () => { dev.code = wrap(dev.code, 3, 1); }, ok: () => { dev.code = wrap(dev.code, 3, 1); }, back: 'menu' },
    draw() { H('AuthCodes 2FA'); LN(1, CODES[dev.code], true, 16); LN(2, 'AuthCodes', false, 8); FOOT('OK = next code'); } },
  docproof: { sec: 'docproof', label: 'DOCPROOF', say: () => 'Proof of existence', keys: { back: 'menu' },
    draw() { H('DOCPROOF'); LN(0, 'SHA-256 hash:', false, 8); LN(1, 'a3f9 51c2 07be d4', true, 9); LN(2, 'Proof of existence', false, 8); FOOT('BACK = menu'); } },
  net: { sec: 'net', label: 'Network', say: () => NETS[dev.net], keys: { ...cyc('net', 3), back: 'menu' },
    draw() { H('Network'); LIST(NETS.map((n, i) => n + (i === dev.net ? ' *' : '')), dev.net); } },
  sd: { sec: 'sd', label: 'SD card', say: () => 'Header sync', keys: { back: 'menu' },
    draw() { H('SD card'); LN(0, 'Verifying headers', false, 8); LN(1, '47%', true, 10); BAR(.47); } },
  setup: { sec: 'setup', label: 'Wallet setup', say: () => 'Secure element generates your seed', keys: { ok: 'pin', back: 'menu' },
    draw() { H('Wallet setup'); LN(0, 'Secure element', true, 9); LN(1, 'generates your seed', false, 8); FOOT('OK = PIN   BACK = menu'); } },
  pin: { sec: 'pin', label: 'PIN', say: () => 'PIN protection', keys: { back: 'menu' },
    draw() { H('Enter PIN'); F(21, true); T('••••', 4, 42); F(8); T('PIN + decoy mode', 4, 58); } },
  about: { sec: 'balance', label: 'About', say: () => 'About', keys: { back: 'menu' },
    draw() { H('About'); LN(0, 'Wesatoshis Card', true, 9); LN(1, 'wesatoshis.com', false, 9); LN(2, 'Open hardware', false, 8); FOOT('BACK = menu'); } },
};
/* the screens listed in the sidebar (jump targets); the first five keep their original order */
const SCREENS = [
  { id: 'balance', to: 'home', label: 'Balance' },
  { id: 'nwc', to: 'nwc', label: 'Nostr Wallet Connect' },
  { id: 'scan', to: 'scan', label: 'Scan QR' },
  { id: 'node', to: 'node', label: 'Home node' },
  { id: 'pin', to: 'pin', label: 'PIN' },
  { id: 'block', to: 'block', label: 'Block tracker' },
  { id: 'mempool', to: 'mempool', label: 'Mempool & RBF' },
  { id: 'zap', to: 'zap', label: 'Zap a friend' },
  { id: 'pay', to: 'pay', label: 'Pay' },
  { id: 'wifi', to: 'wifi', label: 'Wi-Fi' },
  { id: '2fa', to: '2fa', label: 'AuthCodes 2FA' },
  { id: 'docproof', to: 'docproof', label: 'DOCPROOF' },
  { id: 'net', to: 'net', label: 'Testnet & Signet' },
  { id: 'sd', to: 'sd', label: 'SD header sync' },
  { id: 'recv', to: 'recv', label: 'Receive' },
  { id: 'price', to: 'price', label: 'BTC price & fees' },
  { id: 'setup', to: 'setup', label: 'Wallet setup' },
  { id: 'tor', to: 'tor', label: 'Tor' },
  { id: 'multisig', to: 'multisig', label: 'Multisig' },
  { id: 'psbt', to: 'psbt', label: 'PSBT' },
  { id: 'swap', to: 'swap', label: 'Swap (Trocador)' },
  { id: 'dice', to: 'dice', label: 'Dice rolls' },
  { id: 'arkade', to: 'pay.review', pre: () => { dev.payKind = 0; dev.payFrom = 3; }, label: 'Lightning via Arkade' },
  { id: 'xmr', to: 'pay.review', pre: () => { dev.payKind = 2; }, label: 'Monero (XMR) payment' },
];
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
  tg.globalCompositeOperation = 'source-over'; tg.fillStyle = '#fff'; tg.fillRect(102, 1, 24, 10); tg.globalCompositeOperation = 'destination-out'; F(7, true); tg.fillText('DEMO', 104, 9); tg.globalCompositeOperation = 'source-over';   // small inverted DEMO tag
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
function updateScreenUI() {
  const u = UI[dev.cur];
  const now = $('#screen-now'); if (now) now.textContent = `Screen: ${u.label}`;
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
const model = new THREE.Group(); scene.add(model);
const layer = {}; for (const k in LAYERS) { layer[k] = new THREE.Group(); layer[k].name = k; model.add(layer[k]); }
// A small, independent tilt never changes the camera or the assembly's layer transforms.
const hover = { x: 0, y: 0, rx: 0, ry: 0 };
canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || e.buttons || prefersReduced()) return;
  const r = canvas.getBoundingClientRect();
  hover.x = clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1);
  hover.y = clamp((e.clientY - r.top) / r.height * 2 - 1, -1, 1);
});
canvas.addEventListener('pointerleave', () => { hover.x = hover.y = 0; });
canvas.addEventListener('pointerdown', () => { hover.x = hover.y = 0; });
// The model itself remains the sole source of geometry; the intro moves whole assembly layers.
const intro = { phase: 'complete', start: 0, spread: 0, soundPhase: '' };
const introNames = Object.keys(LAYERS);
const skipIntro = document.createElement('button');
skipIntro.id = 'skip-intro'; skipIntro.type = 'button'; skipIntro.textContent = 'Skip intro'; skipIntro.hidden = true;
stage.appendChild(skipIntro);
function finishIntro() {
  if (intro.phase === 'complete') return;
  const restoreFocus = document.activeElement === skipIntro;
  intro.phase = 'complete'; intro.spread = 0; skipIntro.hidden = true; ground.visible = true;
  for (const L of Object.values(layer)) { L.visible = true; L.position.set(0, 0, 0); L.rotation.set(0, 0, 0); }
  if (restoreFocus) canvas.focus({ preventScroll: true });
}
skipIntro.addEventListener('click', finishIntro);
// Only an explicit skip action ends the intro; normal interaction must not dismiss it.
addEventListener('keydown', e => { if (e.key === 'Escape') finishIntro(); });
// prefers-reduced-motion does NOT shorten or skip the intro (owner decision); the only safeguards are no hard flash and Skip / Esc.
function stepIntro(now) {
  if (intro.phase === 'complete') return;
  const s = (now - intro.start) / 1000;
  if (s < 2) { intro.phase = 'empty'; return; }
  if (s >= 8) { finishIntro(); return; }
  intro.phase = s < 5.5 ? 'orbit' : 'assemble';
  if (intro.phase !== intro.soundPhase) {
    intro.soundPhase = intro.phase;
    if (intro.phase === 'orbit') sound.flyby(); else sound.assembly();
  }
  const arrival = ease(clamp((s - 2) / 1.5, 0, 1));
  const settle = 1 - ease(clamp((s - 5.5) / 2.5, 0, 1));
  intro.spread = settle * (1.5 + 5 * arrival);
  introNames.forEach((name, i) => {
    const L = layer[name], angle = i * Math.PI * 2 / introNames.length + (s - 2) * .85;
    const radius = (1 - arrival) * 19 + arrival * (4.4 + (i % 3) * .8);
    L.visible = true;
    L.position.set(Math.cos(angle) * radius * settle, Math.sin(angle * .8 + i) * 3.5 * settle, Math.sin(angle) * radius * settle);
    L.rotation.set(Math.sin(angle + i) * .45 * settle, angle * .5 * settle, Math.cos(angle * .8) * .35 * settle);
  });
}
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
  { id: 'buttons', node: 'sw_ok_cap', side: 'front', pr: 2, outside: true, t: '4 tactile buttons', s: 'SW1–SW4 · UP / DOWN / BACK / OK', d: 'Four SMD tactile switches sit under the cover cut-outs. Press them in the 3D model to move around the screen.' },
  { id: 'window', node: 'window', side: 'front', pr: 2, noInside: true, t: 'Polycarbonate window', s: 'CNC-cut · clear', d: 'Clear polycarbonate sheet cut from the published G-code (≈36 × 20 mm) protects the screen.' },
  { id: 'screw', node: 'screw_1', side: 'front', pr: 2, t: 'M2.5 × 6 screws', s: '4 corners · flush', d: 'Four stainless M2.5 × 6 mm screws clamp the cover to the back shell.' },
  { id: 'cover', node: 'top_cover', side: 'edge', anchor: [0, -.06, 2.9], pr: 2, noInside: true, t: 'Top cover', s: 'brushed aluminium look', d: 'Top part of the open-hardware enclosure with the display window, four button openings and corner screw holes.' },
  { id: 'esp32', node: 'esp32', side: 'back', pr: 1, t: 'ESP32-S3-WROOM-1', s: 'Wi-Fi + BLE · PCB antenna', d: 'Espressif ESP32-S3 module is the brain of the card; its PCB antenna sits at the board edge, clear of metal.' },
  { id: 'qr', node: 'qr_scanner', side: 'back', pr: 1, outside: true, act: 'selfie', t: 'Camera · QR scanner', s: 'Tap the camera', d: 'The scanner module looks out through a lens opening in the back shell and reads QR codes for invoices, Wi-Fi and node connections on the fly.' },
  { id: 'battery', node: 'battery', side: 'back', anchor: [3.6, -.62, -.7], pr: 1, t: 'Battery', s: '3.7 V Li-ion polymer', d: 'A flat Li-ion polymer cell sits under the board and charges over USB-C.' },
  { id: 'usbc', node: 'usbc', side: 'edge', pr: 1, t: 'USB-C', s: 'charge + data', d: 'USB-C port for charging and programming, reachable through a cut-out in the bottom edge.' },
  { id: 'sd', node: 'sdcard', side: 'edge', pr: 2, t: 'microSD slot', s: 'TF-015', d: 'microSD card slot on the bottom edge.' },
  { id: 'power', node: 'power_switch', side: 'edge', pr: 1, outside: true, t: 'Power switch', s: 'slide · bottom edge', d: 'Small slide switch with a red actuator turns the card on and off.' },
  { id: 'buzzer', node: 'buzzer', side: 'back', pr: 1, outside: true, act: 'sound', t: 'Speaker · buzzer', s: 'Tap the speaker · sound off', d: 'Tiny SMD buzzer for audible feedback.' },
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
    const el = document.createElement('div'); el.className = 'hs R'; if (h.act === 'sound') el.dataset.snd = 'off';
    el.innerHTML = `<i class="ln"></i><i class="dot"></i><button class="lab">${h.act === 'sound' ? `<span class="lt">${h.t}<i class="snd" aria-hidden="true">♪ on</i></span>` : h.t}<small>${h.s}</small></button>`;
    const lab = el.querySelector('.lab');
    if (h.act) lab.title = COMP[h.id].tip;
    lab.addEventListener('click', () => select(h.id));
    lab.addEventListener('mouseenter', () => { preview(h.id); if (COMP[h.id]) setHover(h.id, 'label'); });
    lab.addEventListener('mouseleave', () => { unpreview(h.id); if (COMP[h.id]) setHover(null, 'label'); });
    lab.addEventListener('focus', () => { preview(h.id); if (COMP[h.id]) setHover(h.id, 'label'); });
    lab.addEventListener('blur', () => { unpreview(h.id); if (COMP[h.id]) setHover(null, 'label'); });
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
const panelPx = () => isDesktop() ? $('#sidebar').offsetWidth + 30 : 0;   // sidebar width + its right margin + a gap; the model is framed in what is left
function fitDist(hw, hh) { const w = stageW() - panelPx(), h = stageH() - (isDesktop() ? 150 : 200); const ha = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); const wa = ha * w / stageH(); const hh2 = ha * h / stageH(); return Math.max(hw / wa, hh / hh2) * 1.08; }
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
  S.autoInside = false; S.mode = mode; const p = PRESET[mode];
  S.explodeT = p.ex;
  const el = (S.flip ? -1 : 1) * p.el * Math.PI / 180;
  flyTo({ az: opts.az ?? p.az, el, rad: fitDist(p.hw, p.hh), tgt: new THREE.Vector3(...p.tgt) });
  closeInfo(); lastTouch = performance.now();
  inside.prev = null; applyInside();   // a held Shift / touch-hold stays in force over the new view
}
/* ---- explode: Ctrl + mouse wheel (gradual), two-finger drag, [ ] or Ctrl+Up/Down; see inside: hold Shift / touch-and-hold / I ---- */
const readout = $('#explode-readout'), readoutK = $('#readout-k'), readoutPct = $('#explode-pct'), exStatus = $('#explode-status');
let readoutTimer = null, statusTimer = null;
function setExplode(v) {
  v = clamp(v, 0, 1); if (v === S.explodeT) { showReadout(); return; }
  S.explodeT = v; lastTouch = performance.now(); showReadout();
}
function showReadout() {
  const pct = Math.round(S.explodeT * 100); readoutK.textContent = 'Explode'; readoutPct.textContent = pct + '%'; readout.classList.add('show');
  clearTimeout(readoutTimer); readoutTimer = setTimeout(() => readout.classList.remove('show'), 1300);
  clearTimeout(statusTimer); statusTimer = setTimeout(() => { exStatus.textContent = 'Explode ' + pct + '%'; }, 500);
}
const wheelPx = e => (e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY);
// Ctrl+wheel over the stage (not the side panel) explodes the card; plain wheel still zooms; the browser's page zoom is not triggered here
stage.addEventListener('wheel', e => {
  if (!(e.ctrlKey || e.metaKey) || inSidebar(e.target)) return;
  e.preventDefault(); e.stopImmediatePropagation();
  setExplode(S.explodeT - clamp(wheelPx(e), -300, 300) * .001);
}, { capture: true, passive: false });
// Shift / Ctrl must not turn the left-button drag into OrbitControls' (disabled) pan: hide the modifiers from it
canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && (e.shiftKey || e.ctrlKey || e.metaKey)) for (const k of ['shiftKey', 'ctrlKey', 'metaKey']) Object.defineProperty(e, k, { value: false }); }, { capture: true });

/* ---- layer groups: Alt + mouse wheel over the stage (or G / Shift+G) shows one group of layers at a time; a tap of Alt alone toggles labels ---- */
const GROUPS = [
  { name: 'All layers', keys: null },
  { name: 'Cover & window', keys: ['window', 'screws', 'cover'] },
  { name: 'Circuit board', keys: ['pcb'] },
  { name: 'Battery', keys: ['battery'] },
  { name: 'Back shell', keys: ['inserts', 'shell'] },
];
let groupIx = 0;
const layerKeyOf = o => { for (let p = o; p; p = p.parent) if (p.parent === model && p.name in LAYERS) return p.name; return null; };
const groupShows = o => { const g = GROUPS[groupIx].keys; if (!g || !o) return true; const k = layerKeyOf(o); return !k || g.includes(k); };
function setGroup(i) {
  groupIx = (i + GROUPS.length) % GROUPS.length; const g = GROUPS[groupIx].keys;
  // hidden layers move to three.js layer 1: the camera and every raycaster only see layer 0, so they are neither drawn nor clickable
  for (const k in LAYERS) { const on = !g || g.includes(k); layer[k].traverse(o => o.layers.set(on ? 0 : 1)); }
  lastTouch = performance.now(); if (compHover && !groupShows(nodes[COMP[compHover].node])) setHover(null, hoverSrc || 'canvas');
  readoutK.textContent = 'Layers'; readoutPct.textContent = GROUPS[groupIx].name; readout.classList.add('show');
  clearTimeout(readoutTimer); readoutTimer = setTimeout(() => readout.classList.remove('show'), 1600);
  exStatus.textContent = 'Showing ' + GROUPS[groupIx].name;
}
const toggleLabels = () => $('#labels').click();
{
  let altTap = false, wheelAcc = 0, wheelAt = 0;
  addEventListener('keydown', e => { if (e.key === 'Alt') { if (!e.repeat) altTap = !e.ctrlKey && !e.shiftKey && !e.metaKey; e.preventDefault(); } else altTap = false; }, { capture: true });
  addEventListener('keyup', e => {
    if (e.key !== 'Alt') return; e.preventDefault();   // also keeps Windows/Firefox from focusing the menu bar
    const a = document.activeElement, calm = !(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable));
    if (altTap && calm && intro.phase === 'complete') toggleLabels();
    altTap = false;
  }, { capture: true });
  ['pointerdown', 'wheel'].forEach(t => addEventListener(t, () => { altTap = false; }, { capture: true, passive: true }));
  addEventListener('blur', () => { altTap = false; });
  stage.addEventListener('wheel', e => {
    if (!e.altKey || e.ctrlKey || e.metaKey || inSidebar(e.target)) return;
    e.preventDefault(); e.stopImmediatePropagation();   // Alt+wheel would otherwise zoom, or go back in history in some browsers
    if (intro.phase !== 'complete') return;
    const now = performance.now(); if (now - wheelAt > 400) wheelAcc = 0; wheelAt = now;
    wheelAcc += wheelPx(e);
    if (Math.abs(wheelAcc) >= 60) { setGroup(groupIx + Math.sign(wheelAcc)); wheelAcc = 0; }
  }, { capture: true, passive: false });
}

/* inside view = the 'inside' mode (cover ghosted) while a hold is active, then back to what it was */
const inside = { shift: false, touch: false, key: false, prev: null };
const insideOn = () => inside.shift || inside.touch || inside.key;
function applyInside() {
  const on = insideOn();
  if (on && inside.prev === null && S.mode !== 'inside') { inside.prev = S.mode; S.mode = 'inside'; lastTouch = performance.now(); }
  else if (!on && inside.prev !== null) { S.mode = inside.prev; inside.prev = null; lastTouch = performance.now(); }
}
function setInside(src, v) { if (inside[src] === v) return; inside[src] = v; applyInside(); }
const releaseInside = () => { inside.shift = inside.touch = inside.key = false; applyInside(); };
{
  const calm = () => { const a = document.activeElement; return !a || a === document.body || a === canvas; };
  addEventListener('keydown', e => { if (e.key === 'Shift' && !e.repeat && calm()) setInside('shift', true); });
  addEventListener('keyup', e => { if (e.key === 'Shift') setInside('shift', false); });
  const syncMods = e => { if (inside.shift && e.shiftKey === false) setInside('shift', false); };   // recovers a stuck Shift (missed keyup)
  ['pointermove', 'pointerdown', 'mousemove', 'mousedown', 'wheel', 'touchstart'].forEach(t => addEventListener(t, syncMods, { capture: true, passive: true }));
  addEventListener('blur', releaseInside); addEventListener('pagehide', releaseInside);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseInside(); });
}

/* touch: a still finger held on the scene = inside; two fingers dragging up/down together = explode (pinch still zooms) */
const touch = { pts: new Map(), timer: null, g: null };
function touchDown(id, x, y) {
  touch.pts.set(id, { x, y, x0: x, y0: y });
  if (touch.pts.size === 1) { clearTimeout(touch.timer); touch.timer = setTimeout(() => { if (touch.pts.size === 1) setInside('touch', true); }, 450); }
  else { clearTimeout(touch.timer); setInside('touch', false); touch.g = gestureState(); }
}
function gestureState() { const p = [...touch.pts.values()]; return { cy: (p[0].y + p[1].y) / 2, d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) }; }
function touchMove(id, x, y) {
  const p = touch.pts.get(id); if (!p) return; p.x = x; p.y = y;
  if (touch.pts.size === 1 && Math.hypot(x - p.x0, y - p.y0) > 10) clearTimeout(touch.timer);
  if (touch.pts.size === 2 && touch.g) {
    const g = gestureState(), dy = g.cy - touch.g.cy, dd = g.d - touch.g.d;
    if (Math.abs(dy) > Math.abs(dd) * 1.15) setExplode(S.explodeT - dy / (stageH() * .4));   // fingers up = explode, down = reassemble
    touch.g = g;
  }
}
function touchUp(id) { touch.pts.delete(id); clearTimeout(touch.timer); if (touch.pts.size < 1) setInside('touch', false); if (touch.pts.size < 2) touch.g = null; else touch.g = gestureState(); }
canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') touchDown(e.pointerId, e.clientX, e.clientY); });
canvas.addEventListener('pointermove', e => { if (e.pointerType === 'touch') touchMove(e.pointerId, e.clientX, e.clientY); });
['pointerup', 'pointercancel'].forEach(t => addEventListener(t, e => { if (e.pointerType === 'touch') touchUp(e.pointerId); }));
canvas.addEventListener('contextmenu', e => { if (e.pointerType === 'touch' || touch.pts.size) e.preventDefault(); });
$('#labels').addEventListener('click', e => { S.labels = !S.labels; e.currentTarget.classList.toggle('on', S.labels); e.currentTarget.setAttribute('aria-pressed', String(S.labels)); });
$('#spin').addEventListener('click', e => { S.auto = !S.auto; e.currentTarget.classList.toggle('on', S.auto); e.currentTarget.setAttribute('aria-pressed', String(S.auto)); sway.base = null; lastTouch = performance.now() - 2500; });

/* keyboard equivalents */
function orbitBy(daz, del) {   // keyboard orbit (OrbitControls does not expose rotateLeft/rotateUp publicly)
  const sp = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  sp.theta += daz; sp.phi = clamp(sp.phi - del, .05, Math.PI - .05); camera.position.setFromSpherical(sp).add(controls.target);
}
function dolly(f) { const o = camera.position.clone().sub(controls.target).multiplyScalar(f); o.setLength(clamp(o.length(), controls.minDistance, controls.maxDistance)); camera.position.copy(controls.target).add(o); }
const inSidebar = t => !!(t && t.closest && t.closest('#sidebar'));
addEventListener('keydown', e => {
  if (['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock'].includes(e.key)) return;
  const mod = e.ctrlKey || e.metaKey || e.altKey;
  const arrow = e.key.startsWith('Arrow');
  if (mod && !(arrow && !e.metaKey && !e.altKey)) return;     // browser/OS shortcut chords (zoom, tabs, copy ...) are never hijacked
  const t = e.target;
  if (e.key === 'Escape') { escapeKey(); e.preventDefault(); return; }
  if (inSidebar(t) || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable))) return;   // never steal scrolling/typing inside the panel
  if (e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { setExplode(S.explodeT + (e.key === 'ArrowUp' ? .1 : -.1)); e.preventDefault(); return; }   // keyboard explode
  const step = 0.12;
  switch (e.key) {
    case 'ArrowLeft': orbitBy(-step, 0); break;
    case 'ArrowRight': orbitBy(step, 0); break;
    case 'ArrowUp': orbitBy(0, step); break;
    case 'ArrowDown': orbitBy(0, -step); break;
    case '+': case '=': dolly(1 / 1.12); break;
    case '-': case '_': dolly(1.12); break;
    case '[': setExplode(S.explodeT - .1); e.preventDefault(); return;
    case ']': setExplode(S.explodeT + .1); e.preventDefault(); return;
    case 'i': case 'I': setInside('key', !inside.key); e.preventDefault(); return;
    case '1': S.flip = false; setMode('outside'); break;
    case '2': S.flip = false; setMode('inside'); break;
    case '3': S.flip = false; setMode('exploded'); break;
    case 'l': case 'L': $('#labels').click(); break;
    case 'g': case 'G': if (intro.phase === 'complete') setGroup(groupIx + (e.shiftKey ? -1 : 1)); break;
    case 'a': case 'A': $('#spin').click(); break;
    default: return;
  }
  e.preventDefault();
  lastTouch = performance.now(); sway.base = null; tw = null; controls.update();
});
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
const FEATURES = [
  { ic: 'pay', t: 'Lightning via NWC', d: 'Pay Lightning invoices straight from the card through Nostr Wallet Connect.', mode: 'outside', focus: 'oled', screen: 'nwc', exp: ['Lightning via NWC', 'Link a Nostr Wallet Connect wallet and pay BOLT11 Lightning invoices from the card.'] },
  { ic: 'wallet', t: 'Lightning via Arkade', d: 'Lightning payments powered by Arkade.', mode: 'outside', focus: 'oled', screen: 'arkade', exp: ['Lightning via Arkade', 'Lightning payments powered by Arkade, right from the card.'] },
  { ic: 'node', t: 'Native SPV client, no Electrum server', d: 'Talks to the Bitcoin network directly and verifies block headers itself.', mode: 'inside', focus: 'esp32', screen: 'node', exp: ['Native SPV client', 'The card speaks the Bitcoin protocol natively and connects to peers directly, verifying block headers with SPV. There is no Electrum server in between.'] },
  { ic: 'tor', t: 'Tor support', d: 'Private connections over Tor.', mode: 'outside', focus: 'oled', screen: 'tor', exp: ['Tor support', 'Tor support for more private connections.'] },
  { ic: 'multisig', t: 'Bitcoin multisig', d: 'Spend from multisig wallets with several signers.', mode: 'outside', focus: 'oled', screen: 'multisig', exp: ['Bitcoin multisig', 'Bitcoin multisig support: co-sign spends together with your other signers.'] },
  { ic: 'xmr', t: 'XMR payments', d: 'Pay with Monero right from the card.', mode: 'outside', focus: 'oled', screen: 'xmr', exp: ['XMR payments', 'Choose Monero as the payment type, review the amount on the card’s screen and approve.'] },
  { ic: 'nostr', t: 'Zap your Nostr friends', d: 'Add friends by their Nostr public key and send them zaps.', mode: 'outside', focus: 'oled', screen: 'zap', exp: ['Zap your Nostr friends', 'A built-in Nostr client keeps your friends list by public key, so you can zap them.'] },
  { ic: 'price', t: 'Real-time BTC price feed', d: 'Live Bitcoin price and fee data on the screen.', mode: 'outside', focus: 'oled', screen: 'price', exp: ['Real-time BTC price feed', 'Bitcoin price and fee data are fetched without a central server and shown right on the card.'] },
  { ic: 'psbt', t: 'PSBT sync with external air-gapped wallet', d: 'Create a PSBT, sign it on your air-gapped wallet, broadcast with Wesatoshis.', mode: 'outside', focus: 'oled', screen: 'psbt', exp: ['PSBT sync', 'Create a PSBT on the card, sign it on your external air-gapped wallet, then broadcast the signed transaction with Wesatoshis.'] },
  { ic: 'swap', t: 'Swap USDT/USDC/ETH/BTC/XMR via Trocador', d: 'Swap between USDT, USDC, ETH, BTC and XMR through Trocador.', mode: 'outside', focus: 'oled', screen: 'swap', exp: ['Swaps via Trocador', 'Pick a pair, review the swap and confirm. Swaps between USDT, USDC, ETH, BTC and XMR run through Trocador.'] },
  { ic: 'open', t: 'Connect your own Bitcoin node', d: 'Link the card to your own node by scanning a QR code.', mode: 'outside', focus: 'oled', screen: 'node', exp: ['Your own Bitcoin node', 'Scan a btcnode: QR code and the card connects to the node you run at home. Domain names work too.'] },
  { ic: 'shield', t: 'Secure elements', d: 'A secure element generates your seed during wallet setup.', mode: 'inside', focus: null, screen: 'setup', exp: ['Secure elements', 'A secure element generates your new seed phrase while you set up the wallet.'] },
  { ic: 'dice', t: 'Dice rolls', d: 'Dice-roll support, built in.', mode: 'outside', focus: 'oled', screen: 'dice', exp: ['Dice rolls', 'Dice-roll support is built into the card.'] },
  { ic: 'standalone', t: 'Use without computer or mobile app', d: 'Pay and receive with just the card — no computer or phone app needed.', mode: 'outside', focus: 'buttons', screen: 'balance', exp: ['No computer or phone app', 'Four buttons, a screen and a built-in scanner are all you need to pay and receive.'] },
];
FEATURES.forEach((f, i) => {
  const li = document.createElement('li');
  li.innerHTML = `<button data-i="${i}"><span class="ic"><svg viewBox="0 0 24 24">${ICON[f.ic]}</svg></span><span><b>${f.t}</b><span class="d">${f.d}</span></span></button>`;
  li.firstChild.addEventListener('click', () => { document.querySelectorAll('#feat-list button').forEach(b => b.classList.remove('on')); li.firstChild.classList.add('on'); applyFeature(f); });
  $('#feat-list').appendChild(li);
});
function applyFeature(f) {
  S.flip = f.focus === 'qr' || f.focus === 'esp32';
  setMode(f.mode); showInfo({ t: f.exp[0], s: 'Feature', d: f.exp[1] }, { pinned: true });
  const link = $('#info-link'); link.hidden = false; link.href = f.ic === 'open' ? 'https://wesatoshis.com/qr' : 'https://wesatoshis.com/'; link.textContent = f.ic === 'open' ? 'Make a node QR code ↗' : 'Explore the card at wesatoshis.com ↗';
  if (f.exp) showExplain(f.exp[0], f.exp[1]);
}
/* no on-page screen picker: the OLED changes only when the card's four physical buttons are pressed on the 3D model */

const COMPONENT_FACTS = {
  oled: 'Press the card’s UP, DOWN, BACK and OK buttons on the model to move around the screen.',
  qr: 'Reads invoices, Wi-Fi and node codes. Inverted or coloured codes work after scanning an enabling code. On this page, tap the camera for a joke selfie (no real camera is used).',
  battery: 'Up to three hours of continuous use at full power, and about 35 minutes for a full charge.',
  sd: 'Holds blockchain headers and your encrypted wallet, and installs firmware updates offline.',
  esp32: 'Connects directly to Bitcoin peers and verifies block headers (SPV). A secure element generates your seed during setup.',
  buttons: 'Click UP, DOWN, BACK or OK on the model to move around the screen. The card supports PIN protection and decoy mode.',
  buzzer: 'Sound can be switched on or off in settings. On this page, tap the speaker to switch the page’s optional sound on or off; it starts off.',
  shell: 'The enclosure files and assembly specs are published for download.'
};
function showInfo(h, { pinned = false, preview = false } = {}) {
  $('#info-link').hidden = true;
  $('#info-t').textContent = h.t; $('#info-s').textContent = h.s; $('#info-d').textContent = h.d + (COMPONENT_FACTS[h.id] ? ' ' + COMPONENT_FACTS[h.id] : '');
  __sidebar.show('detail', { open: !preview, focus: pinned });
  $('#info').classList.toggle('pinned', pinned);
  $('#info').classList.toggle('preview', preview);
  syncAction(h.id);
}
function select(id) {
  const h = HOT.find(x => x.id === id); if (!h) return; S.sel = id;
  const p = anchors[id + '_c'].getWorldPosition(new THREE.Vector3());
  const dir = h.side === 'back' ? -1 : 1; const edge = h.side === 'edge';
  const a0 = sph();
  flyTo({ az: edge ? a0.az * .4 : a0.az, el: edge ? .35 : dir * 55 * Math.PI / 180, rad: h.id === 'oled' ? fitDist(2.1, 1.5) : fitDist(2.6, 2.2), tgt: p.clone() }, 1000);
  S.flip = dir < 0;
  // the speaker sits behind the opaque back shell: show the inside view (shell ghosted) so it can be seen and tapped; closing the details goes back
  if (h.act === 'sound' && S.mode === 'outside') { S.mode = 'inside'; S.autoInside = true; }
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
function closeInfo() { S.sel = null; if (S.autoInside && S.mode === 'inside' && inside.prev === null) S.mode = 'outside'; S.autoInside = false; if (actBtn) actBtn.hidden = true; $('#info').classList.remove('pinned', 'preview'); Object.values(hsEls).forEach(el => el.classList.remove('act')); if (__sidebar.view() === 'detail') __sidebar.back(); }
$('#info-x').addEventListener('click', () => { const m = S.autoInside ? 'outside' : PRESET[S.mode] ? S.mode : 'outside'; setMode(m); });

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
  const comp = compAt(e.clientX, e.clientY, e.pointerType === 'touch' ? 26 : 14); if (comp) { activate(comp); return; }
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

/* ------------------------------------------------------------------ the card's own camera and speaker
   Clicking the 3D QR scanner (the card's camera) plays the joke-selfie gag; clicking the 3D buzzer (the card's speaker)
   turns the site's optional sound on or off. Same click rules as the buttons: pointer moved < 6 px, not occluded. */
const COMP = {
  qr: { node: 'qr_scanner', tip: 'Tap the camera', verb: 'selfie' },
  buzzer: { node: 'buzzer', tip: 'Tap the speaker – sound on/off', verb: 'sound' },
};
const compIds = Object.keys(COMP);
const compOf = obj => compIds.find(id => nodes[COMP[id].node] === obj) || null;
const compTip = document.createElement('div'); compTip.id = 'comp-tip'; compTip.hidden = true; compTip.setAttribute('aria-hidden', 'true'); stage.appendChild(compTip);
const compRing = document.createElement('div'); compRing.id = 'comp-ring'; compRing.hidden = true; compRing.setAttribute('aria-hidden', 'true'); stage.appendChild(compRing);
const compStatus = document.createElement('p'); compStatus.id = 'comp-status'; compStatus.className = 'sr-only'; compStatus.setAttribute('role', 'status'); compStatus.setAttribute('aria-live', 'polite'); stage.appendChild(compStatus);
const compEdges = {};   // orange outline per component, shown while it is hovered
function compGlow(id) {
  if (!compEdges[id]) {
    const m = nodes[COMP[id].node], e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), new THREE.LineBasicMaterial({ color: 0xffa640, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    e.renderOrder = 12; e.visible = false; m.add(e); compEdges[id] = e;
  }
  return compEdges[id];
}
const gag = { w: 0 };
const gagOn = () => selfie.active() || gag.w > 0;
const compCenter = id => new THREE.Box3().setFromObject(nodes[COMP[id].node]).getCenter(new THREE.Vector3());
function compClient(id) {
  const c = compCenter(id).project(camera), r = canvas.getBoundingClientRect();
  return { x: r.left + (c.x * .5 + .5) * r.width, y: r.top + (-c.y * .5 + .5) * r.height, z: c.z };
}
const compOccluders = () => blockers.filter(m => !(m === nodes.top_cover && S.gF > .5) && !(m === nodes.back_shell && S.gB > .5));
/* which component (if any) is under this screen point, reachable and not hidden behind the shell/board/battery */
function compAt(cx, cy, slack = 14) {
  if (intro.phase !== 'complete' || !nodes.qr_scanner || gagOn()) return null;
  const r = canvas.getBoundingClientRect(), v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  const occ = compOccluders(); ray.setFromCamera(v, camera);
  const hit = ray.intersectObjects([...compIds.map(id => nodes[COMP[id].node]), ...occ], false)[0];
  if (hit) { const id = compOf(hit.object); if (id) return id; }
  // forgiving target: the parts are only a few millimetres across, so a point just beside one counts too, if its centre is visible
  let best = null, bd = slack;
  for (const id of compIds) {
    if (!groupShows(nodes[COMP[id].node])) continue;   // parts in a hidden layer group cannot be picked
    const p = compClient(id); if (p.z > 1) continue; const d = Math.hypot(cx - p.x, cy - p.y); if (d >= bd) continue;
    const c = compCenter(id), dir = c.clone().sub(camera.position), dist = dir.length(); dir.normalize();
    rc.set(camera.position, dir); rc.far = dist - .02;
    if (rc.intersectObjects(occ, false).length) continue;
    bd = d; best = id;
  }
  return best;
}
let compHover = null, hoverSrc = '', ptr = null, lastPick = 0, toastUntil = 0;
function setHover(id, src = 'canvas') {
  if (id === null && src !== hoverSrc && hoverSrc) return;
  hoverSrc = id ? src : '';
  if (id === compHover) return;
  compHover = id;
  canvas.style.cursor = id && src === 'canvas' ? 'pointer' : '';
  for (const k of compIds) if (compEdges[k]) compEdges[k].visible = k === id;
  if (id) compGlow(id).visible = true;
  if (!id && performance.now() > toastUntil) { compTip.hidden = true; compRing.hidden = true; }
  if (id) { compTip.textContent = tipText(id); compTip.hidden = false; compRing.hidden = false; }
}
function tipText(id) { return id === 'buzzer' ? `Tap the speaker – sound on/off (${sound.state().enabled ? 'on' : 'off'})` : COMP[id].tip; }
function placeComp(now) {
  const id = compHover || (now < toastUntil ? toastId : null);
  if (!id) return;
  const p = compClient(id), r = stage.getBoundingClientRect();
  const x = p.x - r.left, y = p.y - r.top;
  compRing.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
  const tw_ = compTip.offsetWidth || 160, left = clamp(x - tw_ / 2, 8, Math.max(8, stageW() - tw_ - 8));
  compTip.style.left = left.toFixed(0) + 'px'; compTip.style.top = Math.max(8, y - 54).toFixed(0) + 'px';
  if (compHover && now >= toastUntil) { const t = tipText(compHover); if (compTip.textContent !== t) compTip.textContent = t; }
  if (compHover && compEdges[id]) compEdges[id].material.opacity = .65 + .3 * Math.sin(now / 220);
}
let toastId = null;
function toast(id, text) { toastId = id; toastUntil = performance.now() + 1800; compTip.textContent = text; compTip.hidden = false; compRing.hidden = false; compStatus.textContent = text; setTimeout(() => { if (performance.now() >= toastUntil && !compHover) { compTip.hidden = true; compRing.hidden = true; } }, 1850); }
function syncSoundUI(on) {
  const el = hsEls.buzzer; if (el) { el.dataset.snd = on ? 'on' : 'off'; const sm = el.querySelector('small'); if (sm) sm.textContent = on ? 'Tap the speaker · sound on' : 'Tap the speaker · sound off'; }
  syncAction();
}
sound.onChange(syncSoundUI);
async function activate(id) {
  finishIntro();
  if (id === 'qr') { if (selfie.trigger()) { setHover(null, 'canvas'); compStatus.textContent = 'Taking a joke selfie'; } return; }
  if (id === 'buzzer') {
    const was = sound.state().enabled, on = await sound.toggle();
    toast('buzzer', on ? 'Sound on' : was ? 'Sound off' : 'Sound unavailable');
  }
}
/* info-panel action button (keyboard / screen-reader path): Enter on it does exactly what clicking the part does */
const actBtn = $('#info-action');
function syncAction(id = S.sel) {
  const c = id && COMP[id];
  if (!c || !actBtn) { if (actBtn) actBtn.hidden = true; return; }
  actBtn.hidden = false; actBtn.dataset.comp = id;
  if (id === 'buzzer') { const on = sound.state().enabled; actBtn.textContent = on ? 'Sound is on – turn it off' : 'Sound is off – turn it on'; actBtn.setAttribute('aria-pressed', String(on)); }
  else { actBtn.textContent = 'Take the joke selfie'; actBtn.removeAttribute('aria-pressed'); }
}
if (actBtn) actBtn.addEventListener('click', () => activate(actBtn.dataset.comp));
document.querySelectorAll('[data-comp]').forEach(b => { if (b !== actBtn) b.addEventListener('click', () => select(b.dataset.comp)); });
canvas.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && !e.buttons) ptr = { x: e.clientX, y: e.clientY }; else if (e.buttons) { ptr = null; setHover(null, 'canvas'); } });
canvas.addEventListener('pointerleave', () => { ptr = null; setHover(null, 'canvas'); });
canvas.addEventListener('pointerdown', () => { ptr = null; setHover(null, 'canvas'); });
function pickHover(now) {
  if (!ptr || now - lastPick < 70) return; lastPick = now;
  const id = compAt(ptr.x, ptr.y); if (id !== compHover && (id || hoverSrc !== 'label')) setHover(id, 'canvas');
}
/* the turn: rotate the whole card so the lens faces the viewer, then back (see selfie.js for the timing) */
const gagQ = new THREE.Quaternion(), idQ = new THREE.Quaternion(), tmpQ = new THREE.Quaternion();
function gagQuat(w) {
  const lens = new THREE.Vector3(0, -1, 0), to = camera.position.clone().sub(controls.target).normalize();
  if (lens.dot(to) < -.999) tmpQ.setFromAxisAngle(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), Math.PI); else tmpQ.setFromUnitVectors(lens, to);
  return gagQ.copy(idQ).slerp(tmpQ, w);
}
const pressing = new Map();
function press(m) { pressing.set(m, performance.now()); }
function pressCap(k) { const n = Object.keys(CAPKEY).find(x => CAPKEY[x] === k); if (n && nodes[n]) press(nodes[n]); }

/* ------------------------------------------------------------------ main loop */
const sway = { base: null, phase: 0 };   // legacy marker, no longer drives the camera
const AUTO_SPEED = 0.4;                 // OrbitControls units: 2.0 = one turn per 30 s at 60 fps; this is one turn per 150 s
const AUTO_RAMP_S = 4;                  // after the visitor lets go, the turntable eases in over this many seconds
let autoRamp = 0;
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
function applyView() { const w = stageW(), h = stageH(); camera.setViewOffset(w, h, isDesktop() ? Math.round((panelPx() - 10) / 2) : 0, 55 + view.cur, w, h); camera.updateProjectionMatrix(); }
$('#sidebar').addEventListener('sbchange', () => { view.tgt = sheetShift(); });
const refit = () => { resize(); const p = PRESET[inside.prev ?? S.mode]; if (p && !tw) { camera.position.sub(controls.target).setLength(fitDist(p.hw, p.hh) * Fr(frame.h)).add(controls.target); } };
addEventListener('resize', refit);
$('#sidebar').addEventListener('sbresize', refit);   // the user dragged the side panel's resize handle

function tick() {
  const rawDt = Math.min(clock.getDelta(), .25), dt = Math.min(rawDt, .05), now = performance.now();
  const rm = prefersReduced();
  const hT = (inside.prev ?? S.mode) !== 'exploded' ? S.explodeT : 0;
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
  stepIntro(now);
  if (rm) { hover.x = hover.y = 0; hover.rx = hover.ry = 0; }
  else {
    const k = 1 - Math.exp(-dt * 1.2), active = intro.phase === 'complete';   // slow, soft sway toward the pointer
    hover.rx += ((active ? -hover.y * .025 : 0) - hover.rx) * k;
    hover.ry += ((active ? hover.x * .035 : 0) - hover.ry) * k;
  }
  model.rotation.set(hover.rx, hover.ry, 0);
  gag.w = selfie.turn(now);   // the card turns its camera toward the viewer during the selfie gag, then back
  if (gag.w > 0) model.quaternion.premultiply(gagQuat(gag.w));
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
  // auto-rotate: OrbitControls' own turntable, identical with or without prefers-reduced-motion; runs when Auto is on and the visitor has been idle
  const autoOn = S.auto && intro.phase === 'complete' && !tw && !S.sel && !gagOn() && !document.hidden && now - lastTouch > 2500;
  autoRamp = autoOn ? Math.min(1, autoRamp + dt / AUTO_RAMP_S) : 0;
  controls.autoRotate = autoOn;
  controls.autoRotateSpeed = AUTO_SPEED * autoRamp * autoRamp * (3 - 2 * autoRamp);   // smoothstep ease-in
  controls.update(rawDt);
  if (intro.phase === 'complete') { pickHover(now); placeComp(now); updateHotspots(now); updatePhoto(); }
  sky.stars.position.copy(camera.position);
  camera.updateMatrixWorld();
  renderer.render(scene, camera);
}

function updateHotspots(now) {
  const show = S.labels && !gagOn(), w = stageW(), h = stageH(), small = !isDesktop();
  const doOcc = now - lastOcc > 180; if (doOcc) lastOcc = now;
  const exploded = S.explode > .25, inside = S.mode === 'inside';
  const cx = isDesktop() ? (w - (panelPx() - 12)) / 2 : w / 2, limitR = isDesktop() ? w - (panelPx() + 6) : w - 6;
  const items = [];
  for (const hs of HOT) {
    const el = hsEls[hs.id]; if (!el) continue;
    let vis = !!show && !(S.sel === 'oled' && hs.id === 'oled') && (!S.sel || S.sel === hs.id) && (exploded || inside ? !(inside && !exploded && hs.noInside) : !!(hs.outside && hs.pr <= 1));
    if (small && (exploded || inside) && hs.pr > 1 && !hs.act) vis = false;
    if (!groupShows(anchors[hs.id])) vis = false;   // labels follow the layer group on show
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
  // a neighbouring label drawn over the camera / speaker must not swallow its click: make it click-through (and dim) while it covers one
  if (doOcc) {
    const pts = compIds.filter(id => hsEls[id] && hsEls[id].classList.contains('show')).map(id => compClient(id));
    for (const it of items) { const lab = it.el.querySelector('.lab'); if (COMP[it.hs.id]) continue;
      const r = lab.getBoundingClientRect(); lab.classList.toggle('under', pts.some(p => p.x >= r.left - 8 && p.x <= r.right + 8 && p.y >= r.top - 8 && p.y <= r.bottom + 8)); }
  }
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
  $('#spin').classList.toggle('on', S.auto); $('#spin').setAttribute('aria-pressed', String(S.auto));
  S.mode = mode; S.explodeT = p.ex; S.explode = p.ex;
  if (!hash.includes('still')) {   // the full intro plays even with prefers-reduced-motion (owner decision)
    intro.phase = 'empty'; intro.start = performance.now(); ground.visible = false;
    for (const L of Object.values(layer)) L.visible = false;
    skipIntro.hidden = false;
  }
  flyTo({ az, el, rad, tgt: new THREE.Vector3(...p.tgt) }, 1600);
  if (hash.includes('still')) { tw = null; camera.position.setFromSpherical(new THREE.Spherical(rad, Math.PI / 2 - el, az)).add(new THREE.Vector3(...p.tgt)); controls.update(); }
  const sel = hash.find(x => x.startsWith('select=')); if (sel) setTimeout(() => select(sel.split('=')[1]), 100);
  $('#bar').style.width = '100%'; setTimeout(() => $('#loader').classList.add('done'), 250);
  updateScreenUI();
  renderer.setAnimationLoop(tick);
  window.__viz = { S, M, scene, nodes, setMode, select, camera, controls, drawScreen, THREE, renderer, layer, anchors, sky,
    sound, intro: { state: () => ({ phase: intro.phase, spread: intro.spread }), skip: finishIntro }, inside: () => ({ on: insideOn(), prev: inside.prev, ...inside }), setExplode, explode: () => ({ target: S.explodeT, current: S.explode }), input: { touchDown, touchMove, touchUp }, screens: SCREENS, screenCanvas: scrCanvas, screenText: i => { drawScreen(i); return texts.slice(); }, currentScreen: () => curScreen, viewShift: () => view.cur,
    capClient, groups: { set: setGroup, get: () => groupIx, names: GROUPS.map(g => g.name), shows: groupShows }, comp: { at: compAt, client: compClient, hover: () => compHover, activate, selfie, tipText, gagWeight: () => gag.w, autoRotating: () => controls.autoRotate },
    ui: { states: () => Object.keys(UI), state: () => dev.cur, data: () => JSON.parse(snapshot()), key: devKey, snapshot, restore, stats: paintStats, go, setManual: v => { manualTimers = !!v; clearTimeout(dev.timer); }, setTimerScale: v => { timerScale = v; }, fireAuto: () => { const u = UI[dev.cur]; if (u.auto) go(u.auto.to); }, hasAuto: () => !!UI[dev.cur].auto, announced: () => announced, setPay: (k, f) => { dev.payKind = k; dev.payFrom = f; } } };
  window.__product = {
    photos: PHOTOS.map(p => ({ id: p.id, label: p.cap, src: p.src })),
    photoScore, dismissPhoto,
    explain: () => ({ active: $('#explain').classList.contains('show'), title: $('#explain-t').textContent, text: $('#explain-d').textContent }),
    reducedMotion,
  };
})();
