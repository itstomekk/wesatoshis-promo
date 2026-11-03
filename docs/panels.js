/* Right sidebar (desktop) / bottom drawer (phones). Exposes window.__sidebar for app.js.
   Views: features | overview | specs | photos | faq | notes (navigable sections) and detail | photo (transient). */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const sb = $('#sidebar'), body = $('#sb-body'), title = $('#sb-title'), toggle = $('#feat-toggle'), closeBtn = $('#sb-close');
  const mq = matchMedia('(max-width:860px)');
  const NAMES = { features: 'Features', overview: 'Overview', specs: 'Specifications', photos: 'Real photos', faq: 'Frequently asked questions', notes: 'Notes & sources', detail: 'Details', photo: 'Real photo' };
  const GROUPS = { overview: ['status', 'story', 'how', 'capabilities', 'more', 'hardware'], specs: ['specs'], photos: ['photos'], faq: ['faq'], notes: ['notes', 'colophon'] };
  const PANES = { features: '#features', detail: '#info', photo: '#photo-view', content: '#content' };
  let current = 'features', base = 'features', opener = null, opened = false;

  const drawer = () => mq.matches;
  const isOpen = () => !drawer() || opened;
  function emit() { sb.dispatchEvent(new CustomEvent('sbchange', { bubbles: true, detail: { view: current, open: isOpen(), drawer: drawer() } })); }

  function applyMode() {
    if (drawer()) {
      sb.classList.toggle('open', opened); sb.inert = !opened;
      toggle.setAttribute('aria-expanded', String(opened)); toggle.textContent = opened ? 'Close' : 'Explore';
    } else {
      opened = false; sb.classList.remove('open'); sb.inert = false;
      toggle.setAttribute('aria-expanded', 'false'); toggle.textContent = 'Explore';
    }
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
  if (mq.addEventListener) mq.addEventListener('change', () => { applyMode(); emit(); }); else mq.addListener(() => { applyMode(); emit(); });

  window.__sidebar = {
    show, open, close, isOpen, isDrawer: drawer,
    view: () => current, base: () => base,
    /* back out of a transient view to the section underneath */
    back: () => { if (current === 'detail' || current === 'photo') { show(base, { open: false, focus: false }); return true; } return false; },
  };
  applyMode(); show('features', { open: false });
})();
