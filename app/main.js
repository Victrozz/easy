// Easy. — boot, routing, and the shell.
//
// The shell (floating header, scrolling main, floating tab bar) is built once
// and kept. Only the main content is rebuilt on a render. That is what lets
// the tab bar's highlight slide instead of blink, and what keeps your scroll
// position through a tap.

import { CONFIG } from './config.js';
import { el, clear, icon, iconBtn, toast } from './ui.js';
import {
  store, onChange, load, refresh, flush, startSync, loadCache,
  pendingCount, read,
} from './store.js';
import { modules, navModules, moduleById } from './modules/index.js';
import { applyTheme } from './modules/settings.js';
import { settings } from './model.js';

applyTheme();

const app = document.getElementById('app');
const scrollMemory = {};
let current = 'today';
let sub = '';
let lastRendered = null;
let rendering = false;

// ------------------------------------------------------------------ routing --
// #meals            -> module meals, default view
// #meals/protein    -> module meals, view "protein"

function route() {
  const raw = (location.hash || '').replace(/^#\/?/, '').trim();
  const [id, rest] = raw.split('/');
  const known = modules.some((m) => m.id === id);
  return { id: known ? id : 'today', sub: known && rest ? rest : '' };
}

function nav(id, view) {
  const next = '#' + id + (view ? '/' + view : '');
  if (location.hash === next) return;
  location.hash = next;
}

window.addEventListener('hashchange', () => {
  const r = route();
  if (r.id !== current || r.sub !== sub) {
    current = r.id;
    sub = r.sub;
    render();
    ensureFiles().then(render);
  }
});

// -------------------------------------------------------------- file loading --

function wantedFiles() {
  const set = new Set(CONFIG.files);
  for (const m of modules) {
    for (const f of m.files || []) set.add(f);
  }
  const mod = moduleById(current);
  if (mod.extraFiles) for (const f of mod.extraFiles()) set.add(f);
  return [...set];
}

async function ensureFiles() {
  await load(wantedFiles());
}

// ---------------------------------------------------- focus & scroll memory --
// A full re-render is the simplest thing that works, but it throws away the
// caret. Put data-focus-key on anything you type into and it survives.

function captureFocus() {
  const a = document.activeElement;
  if (!a || !a.dataset || !a.dataset.focusKey) return null;
  return {
    key: a.dataset.focusKey,
    start: a.selectionStart,
    end: a.selectionEnd,
  };
}

function restoreFocus(snap) {
  if (!snap) return;
  const next = document.querySelector('[data-focus-key="' + snap.key + '"]');
  if (!next) return;
  next.focus();
  try {
    if (snap.start !== null && snap.start !== undefined) {
      next.setSelectionRange(snap.start, snap.end);
    }
  } catch { /* not a text field */ }
}

// -------------------------------------------------------------------- shell --

const titleEl = el('h1');
const statusDot = el('span.status-dot');
const gearBtn = iconBtn('settings', { 'aria-label': 'Settings', onclick: () => nav('settings') }, 21);

const top = el('header.top', [
  el('div.pill-title.glass', titleEl),
  el('div.pill-actions.glass', [
    el('button.status-btn', {
      type: 'button',
      'aria-label': 'Sync status',
      onclick: () => nav('settings'),
    }, statusDot),
    iconBtn('refresh', {
      'aria-label': 'Refresh',
      onclick: async () => {
        await flush();
        await refresh(wantedFiles());
        toast(store.status === 'error' ? store.error : 'Up to date',
          store.status === 'error' ? 'bad' : '');
      },
    }, 19),
    gearBtn,
  ]),
]);

const main = el('main.main');
main.addEventListener('scroll', () => { scrollMemory[current] = main.scrollTop; }, { passive: true });

const lens = el('div.nav-lens');
const navLinks = {};
const navBadges = {};

const navBar = el('nav.nav.glass', { style: { '--n': navModules.length } }, [
  lens,
  el('div.brand', ['Easy', el('span.dot', '.')]),
  ...navModules.map((m) => {
    const badge = el('span.badge', { hidden: true });
    navBadges[m.id] = badge;
    const a = el('a', { href: '#' + m.id }, [
      el('span', { style: { position: 'relative', display: 'inline-flex' } }, [icon(m.icon, 22), badge]),
      el('span', m.label),
    ]);
    navLinks[m.id] = a;
    return a;
  }),
]);

function updateStatus() {
  const s = store.status;
  const pending = pendingCount();
  const cls = s === 'error' ? 'error'
    : s === 'offline' ? 'offline'
      : s === 'readonly' ? 'readonly'
        : (s === 'syncing' || s === 'loading' || pending) ? 'syncing'
          : '';
  const title = s === 'error' ? (store.error || 'Sync problem')
    : s === 'offline' ? 'Offline — changes are queued'
      : s === 'readonly' ? 'Read-only — add a token in Settings'
        : pending ? pending + ' change(s) saving'
          : 'Everything saved';
  statusDot.className = 'status-dot' + (cls ? ' ' + cls : '');
  statusDot.parentNode.title = title;
  statusDot.parentNode.setAttribute('aria-label', title);
}

function updateShell(mod) {
  const title = mod.title ? mod.title() : mod.label;
  clear(titleEl);
  // The brand's full stop is the only thing in the header with colour.
  if (title === 'Easy.') titleEl.append('Easy', el('span.dot', '.'));
  else titleEl.textContent = title;

  gearBtn.classList.toggle('on', current === 'settings');
  updateStatus();

  navModules.forEach((m, i) => {
    const a = navLinks[m.id];
    const on = m.id === current;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
    if (on) lens.style.setProperty('--i', i);
    const n = m.badge ? m.badge() : 0;
    navBadges[m.id].hidden = !n;
  });
  // Settings is reached from the gear, not the bar: park the lens off-stage.
  if (!navModules.some((m) => m.id === current)) lens.style.setProperty('--i', -2);
}

// ------------------------------------------------------------------- render --

function render() {
  if (rendering) return;
  rendering = true;

  const mod = moduleById(current);
  const focus = captureFocus();
  const changed = lastRendered !== current + '/' + sub;

  const ctx = {
    rerender: render,
    nav,
    read,
    place: settings().place,
    sub,
  };

  const fresh = el('div');
  try {
    mod.render(fresh, ctx);
  } catch (err) {
    console.error(err);
    fresh.appendChild(el('div.banner.warn', [
      icon('dot', 16),
      el('span', 'This tab hit an error: ' + err.message),
    ]));
  }

  clear(main);
  while (fresh.firstChild) main.appendChild(fresh.firstChild);
  updateShell(mod);

  if (changed) {
    main.classList.add('enter');
    setTimeout(() => main.classList.remove('enter'), 450);
    main.scrollTop = scrollMemory[current] || 0;
    lastRendered = current + '/' + sub;
  }

  restoreFocus(focus);
  rendering = false;
}

// --------------------------------------------------------------------- boot --

async function boot() {
  const r = route();
  current = r.id;
  sub = r.sub;
  loadCache();

  app.append(top, main, navBar);
  render();

  startSync();
  onChange(() => { if (!rendering) render(); else updateStatus(); });

  // Paint from cache instantly, then always re-check GitHub. A plain load()
  // here would return immediately whenever the cache already had every file,
  // which meant a week Claude planned on a laptop would not show up on the
  // phone until it was backgrounded and reopened.
  await refresh(wantedFiles());
  render();

  // No "you have no token" toast here on purpose — the Today tab already
  // leads with a card about it, and the header dot says it permanently.
  // Saying it a third time is nagging.

  if (pendingCount()) flush();
}

boot();

// ------------------------------------------------------------ service worker --

if ('serviceWorker' in navigator) {
  // On a first ever visit there is no controller, and clients.claim() fires
  // controllerchange anyway — reloading there would just be a pointless flash.
  // Only reload when a worker actually replaced a previous one, i.e. a deploy
  // landed while the app was open.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* fine offline */ });
  });
}
