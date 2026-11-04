/* A visual joke only: never accesses the user's camera. Triggered by clicking the card's own camera (the QR scanner lens).
   Choreography (ms from the click, scaled by timeScale):
     turning   0-600     the card rotates so its lens points straight at the viewer
     shutter   600-1000  brief hold: flash (soft fade under reduced motion) and, only if sound is on, a shutter click
     returning 1000-1600 the card eases back to exactly its previous pose
     incoming  1600-2800 only now the joke photo flies in from deep in the galaxy, small/dim/blurred, to large and sharp
     shown     2800-     it stays until Esc / the close button */
const TURN_END = 600, SHUTTER_END = 1000, RETURN_END = 1600, INCOMING_MS = 1200, FLASH_AT = 650;
const eio = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;   // cubic ease in-out
export function initSelfie(stage, reducedMotion, { onShutter = () => {} } = {}) {
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = new URL('./selfie.css', import.meta.url).href; document.head.appendChild(link);
  const flash = document.createElement('div'); flash.className = 'selfie-flash'; flash.setAttribute('aria-hidden', 'true'); stage.appendChild(flash);
  const dialog = document.createElement('dialog'); dialog.id = 'selfie-dialog'; dialog.setAttribute('aria-labelledby', 'selfie-title');
  dialog.innerHTML = '<figure id="selfie-photo"><button id="selfie-close" type="button" aria-label="Close joke selfie">×</button><img src="assets/photos/joke-selfie.png" alt="AI-generated joke selfie"><figcaption id="selfie-title">Surprise! This is an AI-generated joke selfie — no camera was used.</figcaption></figure>';
  const photo = dialog.querySelector('#selfie-photo');
  let start = 0, shownAt = 0, timers = [], opener = null, scale = 1;
  const later = (fn, ms) => { const id = setTimeout(fn, ms * scale); timers.push(id); };
  function close() {
    timers.forEach(clearTimeout); timers = []; start = 0; shownAt = 0; flash.classList.remove('active');
    if (dialog.open) dialog.close(); dialog.remove();
    const back = opener && document.contains(opener) ? opener : document.getElementById('gl');
    opener = null; if (back && back.focus) back.focus({ preventScroll: true });
  }
  function show() {   // the card is back in place: now the photo arrives
    start = 0; timers = []; shownAt = performance.now();
    dialog.style.setProperty('--incoming', (INCOMING_MS * scale) + 'ms');
    document.body.appendChild(dialog); dialog.showModal(); dialog.querySelector('button').focus({ preventScroll: true });
  }
  dialog.querySelector('#selfie-close').addEventListener('click', close);
  dialog.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } });
  dialog.addEventListener('cancel', e => { e.preventDefault(); e.stopPropagation(); close(); });
  const phase = () => {
    if (dialog.open) return performance.now() - shownAt < INCOMING_MS * scale || photo.getAnimations().some(a => a.playState !== 'finished') ? 'incoming' : 'shown';
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
    /* current visual scale of the incoming photo (1 = landed); 0 when not displayed */
    photoScale() { if (!dialog.open) return 0; const m = getComputedStyle(photo).transform; if (!m || m === 'none') return 1; const v = m.match(/matrix\(([^)]+)\)/); if (!v) return 1; const [a, b] = v[1].split(',').map(Number); return Math.hypot(a, b); },
    /* test hook: stretch every duration (k > 1 = slow motion) */
    setTimeScale(k) { scale = Math.max(.1, +k || 1); },
  };
}
