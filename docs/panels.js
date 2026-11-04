/* Right sidebar (desktop) / bottom drawer (phones). Exposes window.__sidebar for app.js.
   Views: features | overview | specs | photos | faq (navigable sections) and detail | photo (transient).
   The pane is resizable: a drag handle on its left edge (desktop) or on top of the drawer (phones); keyboard + ARIA separator. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const sb = $('#sidebar'), body = $('#sb-body'), title = $('#sb-title'), toggle = $('#feat-toggle'), closeBtn = $('#sb-close'), grip = $('#sb-resizer'), stageEl = $('#stage');
  const mq = matchMedia('(max-width:860px)');
  const NAMES = { features: 'Features', overview: 'Overview', specs: 'Specifications', photos: 'Photos', faq: 'Frequently asked questions', detail: 'Details', photo: 'Photo' };
  const GROUPS = { overview: ['story', 'how', 'capabilities', 'hardware', 'colophon'], specs: ['specs'], photos: ['photos'], faq: ['faq'] };
  const PANES = { features: '#features', detail: '#info', photo: '#photo-view', content: '#content' };
  let current = 'features', base = 'features', opener = null, opened = false;

  const drawer = () => mq.matches;
  const isOpen = () => !drawer() || opened;
  function emit() { sb.dispatchEvent(new CustomEvent('sbchange', { bubbles: true, detail: { view: current, open: isOpen(), drawer: drawer() } })); }

  /* ---------------- resizing ---------------- */
  const KEY_W = 'ws3d.sbw', KEY_H = 'ws3d.sbh', DEF_W = 360, MIN_W = 280, MIN_H = 220, GAP = 18;
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } }, del: k => { try { localStorage.removeItem(k); } catch (e) { } } };
  const stageW = () => stageEl.clientWidth || innerWidth, stageH = () => stageEl.clientHeight || innerHeight;
  const maxW = () => Math.max(MIN_W, Math.floor(stageW() * 0.6));
  const maxH = () => Math.max(MIN_H + 40, Math.floor(stageH() * 0.9));
  let wantW = parseInt(store.get(KEY_W), 10) || DEF_W, wantH = parseInt(store.get(KEY_H), 10) || 0;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function applySize(persist) {
    const root = document.documentElement;
    const w = clamp(wantW, MIN_W, maxW());
    root.style.setProperty('--panelw', w + 'px');
    if (drawer()) {
      if (wantH) { sb.classList.add('sized'); sb.style.setProperty('--sbh', clamp(wantH, MIN_H, maxH()) + 'px'); } else { sb.classList.remove('sized'); sb.style.removeProperty('--sbh'); }
    } else { sb.classList.remove('sized'); sb.style.removeProperty('--sbh'); }
    syncAria();
    if (persist) { if (drawer()) { if (wantH) store.set(KEY_H, String(Math.round(wantH))); } else store.set(KEY_W, String(Math.round(wantW))); }
    sb.dispatchEvent(new CustomEvent('sbresize', { bubbles: true, detail: { width: sb.offsetWidth, height: sb.offsetHeight, drawer: drawer() } }));
  }
  function syncAria() {
    if (drawer()) {
      grip.setAttribute('aria-orientation', 'horizontal'); grip.setAttribute('aria-label', 'Resize side panel height');
      const h = Math.round(sb.offsetHeight || wantH || 0);
      grip.setAttribute('aria-valuemin', String(MIN_H)); grip.setAttribute('aria-valuemax', String(maxH())); grip.setAttribute('aria-valuenow', String(h)); grip.setAttribute('aria-valuetext', h + ' pixels tall');
    } else {
      grip.setAttribute('aria-orientation', 'vertical'); grip.setAttribute('aria-label', 'Resize side panel');
      const w = Math.round(clamp(wantW, MIN_W, maxW()));
      grip.setAttribute('aria-valuemin', String(MIN_W)); grip.setAttribute('aria-valuemax', String(maxW())); grip.setAttribute('aria-valuenow', String(w)); grip.setAttribute('aria-valuetext', w + ' pixels wide');
    }
  }
  function setSize(v, persist = true) { if (drawer()) wantH = clamp(v, MIN_H, maxH()); else wantW = clamp(v, MIN_W, maxW()); applySize(persist); }
  const curSize = () => drawer() ? (sb.offsetHeight || wantH || 0) : clamp(wantW, MIN_W, maxW());
  let dragging = false, grab = 0;
  grip.addEventListener('pointerdown', e => {
    if (e.button > 0) return; e.preventDefault(); dragging = true; grip.classList.add('drag'); document.body.classList.add('sb-dragging');
    const sr = sb.getBoundingClientRect(); grab = drawer() ? e.clientY - sr.top : e.clientX - sr.left;   // keep the pane edge under the pointer
    try { grip.setPointerCapture(e.pointerId); } catch (err) { }
  });
  grip.addEventListener('pointermove', e => {
    if (!dragging) return; const r = stageEl.getBoundingClientRect();
    if (drawer()) setSize(r.bottom - (e.clientY - grab), false); else setSize(r.right - GAP - (e.clientX - grab), false);
  });
  const endDrag = () => { if (!dragging) return; dragging = false; grip.classList.remove('drag'); document.body.classList.remove('sb-dragging'); applySize(true); };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => grip.addEventListener(t, endDrag));
  grip.addEventListener('keydown', e => {
    const big = e.shiftKey ? 96 : 24; let d = 0;
    if (drawer()) { if (e.key === 'ArrowUp') d = big; else if (e.key === 'ArrowDown') d = -big; }
    else { if (e.key === 'ArrowLeft') d = big; else if (e.key === 'ArrowRight') d = -big; }
    if (d) { e.preventDefault(); setSize(curSize() + d); return; }
    if (e.key === 'Home') { e.preventDefault(); setSize(drawer() ? MIN_H : MIN_W); }
    else if (e.key === 'End') { e.preventDefault(); setSize(drawer() ? maxH() : maxW()); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (drawer()) { wantH = 0; store.del(KEY_H); } else { wantW = DEF_W; store.del(KEY_W); } applySize(false); }
  });
  grip.addEventListener('dblclick', () => { if (drawer()) { wantH = 0; store.del(KEY_H); } else { wantW = DEF_W; store.del(KEY_W); } applySize(false); });

  function applyMode() {
    if (drawer()) {
      sb.classList.toggle('open', opened); sb.inert = !opened;
      toggle.setAttribute('aria-expanded', String(opened)); toggle.textContent = opened ? 'Close' : 'Explore';
    } else {
      opened = false; sb.classList.remove('open'); sb.inert = false;
      toggle.setAttribute('aria-expanded', 'false'); toggle.textContent = 'Explore';
    }
    applySize(false);
  }

  function open({ focus = true } = {}) {
    if (!drawer() || opened) return;
    opener = document.activeElement && !sb.contains(document.activeElement) && document.activeElement !== document.body ? document.activeElement : toggle;
    opened = true; applyMode();
    if (focus) title.focus({ preventScroll: true });
    emit();
  }
  function close({ restoreFocus = true } = {}) {
    if (!drawer() || !opened) return;
    const hadFocus = sb.contains(document.activeElement);
    opened = false; applyMode();
    if (restoreFocus && hadFocus) { const t = opener && document.contains(opener) && opener.offsetParent !== null ? opener : toggle; t.focus({ preventScroll: true }); }
    opener = null; emit();
  }

  function show(view, { open: wantOpen = true, focus = true, scrollTo = null } = {}) {
    if (!NAMES[view]) return;
    const transient = view === 'detail' || view === 'photo';
    if (!transient) base = view;
    const changed = view !== current;
    current = view;
    sb.dataset.view = view;
    const pane = transient ? PANES[view] : view === 'features' ? PANES.features : PANES.content;
    Object.values(PANES).forEach(sel => { const el = $(sel); if (el) el.hidden = sel !== pane; });
    if (GROUPS[view]) document.querySelectorAll('#content > section, #content > footer').forEach(sec => { sec.hidden = !GROUPS[view].includes(sec.id); });
    title.textContent = NAMES[view];
    document.querySelectorAll('#sidebar-nav button').forEach(b => { if (b.dataset.openPanel === base) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    if (changed) body.scrollTop = 0;
    if (wantOpen && drawer()) open({ focus });
    else emit();
    if (scrollTo) { const t = document.getElementById(scrollTo); if (t) body.scrollTop = Math.max(0, t.offsetTop - body.offsetTop - 8); }
  }

  document.querySelectorAll('[data-open-panel]').forEach(b => b.addEventListener('click', () => show(b.dataset.openPanel, { open: true, focus: false, scrollTo: b.dataset.scroll || null })));
  toggle.addEventListener('click', () => { if (opened) close(); else { show(current, { open: false }); open({ focus: true }); } });
  closeBtn.addEventListener('click', () => close());
  const onMq = () => { applyMode(); emit(); };
  if (mq.addEventListener) mq.addEventListener('change', onMq); else mq.addListener(onMq);
  addEventListener('resize', () => applySize(false));

  /* photo gallery: open a picture in the side panel */
  document.querySelectorAll('#photo-grid .ph').forEach(b => b.addEventListener('click', () => {
    const img = $('#photo-view-img'); img.src = b.dataset.photoSrc; img.alt = b.dataset.photoAlt || ''; $('#photo-view-caption').textContent = b.dataset.photoCap || '';
    show('photo', { open: true, focus: true });
  }));

  window.__sidebar = {
    show, open, close, isOpen, isDrawer: drawer,
    view: () => current, base: () => base,
    size: () => ({ width: sb.offsetWidth, height: sb.offsetHeight, drawer: drawer(), min: drawer() ? MIN_H : MIN_W, max: drawer() ? maxH() : maxW() }),
    setSize: v => setSize(v),
    /* back out of a transient view to the section underneath */
    back: () => { if (current === 'detail' || current === 'photo') { show(base, { open: false, focus: false }); return true; } return false; },
  };
  applyMode(); show('features', { open: false });
})();
