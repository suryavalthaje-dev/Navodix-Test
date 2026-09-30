/* Navodix Modal Standard v1.0 — reusable modal behavior */
window.NavodixModal = window.NavodixModal || {
  open(modal, options = {}) {
    if (!modal) return;
    const active = document.activeElement;
    if (active && active !== document.body) modal.__nxPreviousFocus = active;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden','false');
    document.body.classList.add('nx-modal-open');
    if (options.focus) {
      requestAnimationFrame(() => {
        const el = modal.querySelector(options.focus);
        if (el) el.focus();
      });
    }
  },
  close(modal) {
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden','true');
    if (!document.querySelector('.career-modal.is-open')) document.body.classList.remove('nx-modal-open');
    const previous = modal.__nxPreviousFocus;
    if (previous && document.contains(previous)) {
      try { previous.focus(); } catch (_) {}
    }
  }
};
