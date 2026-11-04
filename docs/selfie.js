/* A visual joke only: never accesses the user's camera. Triggered by clicking the card's own camera (the QR scanner lens).
   Choreography (ms from the click, scaled by timeScale):
     turning   0-600     the card rotates so its lens points straight at the viewer
     shutter   600-1000  brief hold: flash (soft fade under reduced motion) and, only if sound is on, a shutter click
     returning 1000-1600 the card eases back to exactly its previous pose
     printing  1600-3400 a small print feeds out of the top edge of the card in short steps, developing as it goes
     incoming  3400-4200 the print lifts off and grows to large and sharp in front of the viewer
     shown     4200-     it stays until Esc / the close button */
const TURN_END = 600, SHUTTER_END = 1000, RETURN_END = 1600, FLASH_AT = 650;
const PRINT_MS = 1800, LIFT_MS = 800, STEPS = 12;
const eio = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;   // cubic ease in-out
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/* slot(): where the print comes out, in client px: { x, y, w } = centre of the card's top edge and the card's on-screen width */
export function initSelfie(stage, reducedMotion, { onShutter = () => {}, onPrint = () => {}, slot = () => null } = {}) {
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = new URL('./selfie.css', import.meta.url).href; document.head.appendChild(link);
  const flash = document.createElement('div'); flash.className = 'selfie-flash'; flash.setAttribute('aria-hidden', 'true'); stage.appendChild(flash);
  const dialog = document.createElement('dialog'); dialog.id = 'selfie-dialog'; dialog.setAttribute('aria-labelledby', 'selfie-title');
  dialog.innerHTML = '<div class="selfie-slot" aria-hidden="true"></div><figure id="selfie-photo"><button id="selfie-close" type="button" aria-label="Close photo">×</button><img src="assets/photos/joke-selfie.png" alt="A printed selfie"><figcaption id="selfie-title">You\'re looking good!</figcaption></figure>';
  const photo = dialog.querySelector('#selfie-photo'), img = photo.querySelector('img'), slotEl = dialog.querySelector('.selfie-slot');
  let start = 0, shownAt = 0, timers = [], opener = null, scale = 1;
  const later = (fn, ms) => { const id = setTimeout(fn, ms * scale); timers.push(id); };
  const anims = () => [photo, img, slotEl].flatMap(e => e.getAnimations());
  function close() {
    timers.forEach(clearTimeout); timers = []; start = 0; shownAt = 0; flash.classList.remove('active');
    anims().forEach(a => a.cancel());
    if (dialog.open) dialog.close(); dialog.remove();
    const back = opener && document.contains(opener) ? opener : document.getElementById('gl');
    opener = null; if (back && back.focus) back.focus({ preventScroll: true });
  }
  function show() {   // the card is back in place: now it prints the photo
    start = 0; timers = []; shownAt = performance.now();
    const print = PRINT_MS * scale, lift = LIFT_MS * scale, total = print + lift;
    dialog.style.setProperty('--print', print + 'ms'); dialog.style.setProperty('--lift', lift + 'ms');
    document.body.appendChild(dialog); dialog.showModal(); dialog.querySelector('button').focus({ preventScroll: true });
    anims().forEach(a => a.cancel());
    const r = photo.getBoundingClientRect(), W = r.width, H = r.height, cx = r.left + W / 2, cy = r.top + H / 2;
    const vw = innerWidth, vh = innerHeight, sl = slot() || { x: vw / 2, y: vh * .55, w: W };
    const s = clamp(sl.w * .55 / W, .22, .5), h = H * s, w = W * s;
    const sx = clamp(sl.x, w / 2 + 16, vw - w / 2 - 16), sy = clamp(sl.y, h + 24, vh - 24);
    // the slot: a dark feed opening with a warm glow, sitting on the card's top edge
    Object.assign(slotEl.style, { left: (sx - w / 2 - 10) + 'px', top: (sy - 3) + 'px', width: (w + 20) + 'px' });
    slotEl.animate([{ opacity: 0 }, { opacity: 1, offset: .08 }, { opacity: 1, offset: print / total }, { opacity: 0, offset: Math.min(1, (print + 120 * scale) / total) }, { opacity: 0 }], { duration: total, fill: 'both' });   // gone as soon as the print lifts off
    // p = how much of the print is out of the slot; the part still inside is clipped at the slot line
    const at = p => ({ transform: `translate(${sx - cx}px, ${sy - p * h + h / 2 - cy}px) scale(${s}) rotate(0deg)`, clipPath: `inset(0 0 ${((1 - p) * 100).toFixed(2)}% 0)` });
    const kf = [{ ...at(0), offset: 0 }], pf = print / total;
    for (let i = 0; i < STEPS; i++) {   // stepper-motor feed: a quick push, then a short pause
      const o = pf * i / STEPS; kf.push({ ...at(i / STEPS), offset: o + pf * .45 / STEPS }, { ...at((i + 1) / STEPS), offset: o + pf / STEPS });
    }
    const out = at(1);
    kf.push({ transform: out.transform.replace('rotate(0deg)', 'rotate(-3deg)'), clipPath: 'inset(0 0 0% 0)', offset: pf + (1 - pf) * .15 },
      { transform: 'translate(0px, 0px) scale(1.03) rotate(2deg)', clipPath: 'inset(0 0 0% 0)', offset: pf + (1 - pf) * .8 },
      { transform: 'translate(0px, 0px) scale(1) rotate(0deg)', clipPath: 'inset(0 0 0% 0)', offset: 1 });
    kf.slice(1).forEach((k, i) => { if (k.offset <= kf[i].offset) k.offset = Math.min(1, kf[i].offset + 1e-4); });
    photo.animate(kf, { duration: total, easing: 'linear', fill: 'both' });
    // instant-photo look: pale and washed out while printing, full colour once it is in front of you
    img.animate([{ filter: 'brightness(1.55) contrast(.5) saturate(.15) sepia(.35)' }, { filter: 'brightness(1.2) contrast(.8) saturate(.6) sepia(.15)', offset: pf }, { filter: 'none' }], { duration: total + 500 * scale, easing: 'ease-out', fill: 'both' });
    onPrint(print, STEPS);
  }
  dialog.querySelector('#selfie-close').addEventListener('click', close);
  dialog.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } });
  dialog.addEventListener('cancel', e => { e.preventDefault(); e.stopPropagation(); close(); });
  const phase = () => {
    if (dialog.open) {
      const t = performance.now() - shownAt;
      return t < PRINT_MS * scale ? 'printing' : t < (PRINT_MS + LIFT_MS) * scale || photo.getAnimations().some(a => a.playState !== 'finished') ? 'incoming' : 'shown';
    }
    if (!start) return 'idle';
    const t = (performance.now() - start) / scale;
    return t < TURN_END ? 'turning' : t < SHUTTER_END ? 'shutter' : 'returning';
  };
  return {
    /* Start the gag; false if one is already running. Same choreography with or without reduced motion; only the flash becomes a soft fade. */
    trigger() {
      if (start || timers.length || dialog.open) return false;
      opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
      start = performance.now();
      const soft = reducedMotion(); flash.classList.toggle('soft', soft);
      later(() => { onShutter(); flash.classList.add('active'); later(() => flash.classList.remove('active'), soft ? 600 : 300); }, FLASH_AT);
      later(show, RETURN_END);
      return true;
    },
    /* 0..1: how far the card has turned its lens toward the viewer (0 when idle and after it has returned). */
    turn(now) {
      if (!start) return 0; const t = (now - start) / scale;
      if (t < TURN_END) return eio(t / TURN_END); if (t < SHUTTER_END) return 1; if (t < RETURN_END) return 1 - eio((t - SHUTTER_END) / (RETURN_END - SHUTTER_END)); return 0;
    },
    active: () => !!start || dialog.open,
    phase,
    /* current visual scale of the photo (1 = landed); 0 when not displayed */
    photoScale() { if (!dialog.open) return 0; const m = getComputedStyle(photo).transform; if (!m || m === 'none') return 1; const v = m.match(/matrix\(([^)]+)\)/); if (!v) return 1; const [a, b] = v[1].split(',').map(Number); return Math.hypot(a, b); },
    /* fraction of the print that is out of the slot (clip-path), 1 once fully out */
    printed() { if (!dialog.open) return 0; const c = getComputedStyle(photo).clipPath, v = c && c.match(/inset\(\s*0(?:px)?\s+0(?:px)?\s+([\d.]+)%/); return v ? 1 - +v[1] / 100 : 1; },
    /* test hook: stretch every duration (k > 1 = slow motion) */
    setTimeScale(k) { scale = Math.max(.1, +k || 1); },
  };
}
