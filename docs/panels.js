(() => {
  const dialog = document.querySelector('#content-dialog');
  const title = document.querySelector('#content-title');
  const groups = {
    overview: ['story', 'how', 'capabilities', 'more', 'hardware'],
    specs: ['specs'], photos: ['photos'], faq: ['faq'], notes: ['notes', 'colophon']
  };
  const names = { overview: 'Overview', specs: 'Specifications', photos: 'Real photos', faq: 'Frequently asked questions', notes: 'Notes & sources' };
  function openPanel(name) {
    if (!groups[name]) return;
    document.querySelectorAll('#content > section, #content > footer').forEach(section => {
      section.hidden = !groups[name].includes(section.id);
    });
    title.textContent = names[name];
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  }
  document.querySelectorAll('[data-open-panel]').forEach(button => button.addEventListener('click', () => openPanel(button.dataset.openPanel)));
  document.querySelector('#content-close').addEventListener('click', () => dialog.close());
})();
