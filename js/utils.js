/* ============================================================
   SHARED UTILITIES
   DOM helpers, toast notifications, formatting and physical
   constants used by every other module. Loaded first.
   ============================================================ */

const $ = (id) => document.getElementById(id);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

/* Physical constants (CODATA-ish, as used by the original page). */
const PHYS = {
  EV_PER_HARTREE: 27.211386,
  BOHR_NM: 0.0529156,      // 1 a0 in nanometres
  RYDBERG_EV: 13.6057      // |E1| in eV
};

/* Colour themes for the density point cloud. */
const THEMES = {
  plasma: { low: 0x35a7ff, high: 0xff2e88 },
  aurora: { low: 0x2dffb0, high: 0x7b5cff },
  lava:   { low: 0xffd166, high: 0xff3d00 },
  mono:   { low: 0x9db4ff, high: 0xe6ecff }
};

/* Keep a call from firing on every input event. */
function debounce(fn, ms) {
  let t = null;
  return function debounced(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

/* Bottom-centre transient message. */
function toast(message, kind) {
  const host = $('toastHost');
  if (!host) return;

  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.setAttribute('role', 'status');
  el.textContent = message;
  host.appendChild(el);

  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 350);
  }, 2600);
}
