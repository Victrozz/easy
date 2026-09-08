// Easy. — boot, routing, and the shell.

import { CONFIG } from './config.js';
import { el, clear, icon, toast } from './ui.js';
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
let rendering = false;

// ------------------------------------------------------------------ routing --

function routeId() {
  const id = (location.hash || '').replace(/^#\/?/, '').trim();
  return modules.some((m) => m.id === id) ? id : 'today';
}

function nav(id) {
  if (id === current) return;
  location.hash = '#' + id;
}

window.addEventListener('hashchange', () => {
  const next = routeId();
  if (next !== current) {
    current = next;
    ensureFiles().then(render);
    render();
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

function statusDot() {
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
  return el('span.status-dot', { class: cls, title, 'aria-label': title });
}

function buildNav() {
  return el('nav.nav', [
    el('div.brand', 'Easy.'),
    ...navModules.map((m) => {
      const badge = m.badge ? m.badge() : 0;
      return el('a', {
        href: '#' + m.id,
        class: m.id === current ? 'on' : '',
        'aria-current': m.id === current ? 'page' : null,
      }, [
        el('span', { style: { position: 'relative', display: 'inline-flex' } }, [
          icon(m.icon, 22),
          badge ? el('span.badge') : null,
        ]),
        el('span', m.label),
      ]);
    }),
  ]);
}

function buildTop(mod) {
  return el('header.top', [
    el('h1', [
      mod.title ? mod.title() : mod.label,
    ]),
    statusDot(),
    el('button.icon-btn', {
      'aria-label': 'Refresh',
      onclick: async () => {
        await flush();
        await refresh(wantedFiles());
        toast(store.status === 'error' ? store.error : 'Up to date',
          store.status === 'error' ? 'bad' : '');
      },
    }, icon('refresh', 19)),
    el('button.icon-btn', {
      class: current === 'settings' ? 'on' : '',
      'aria-label': 'Settings',
      onclick: () => nav('settings'),
    }, icon('settings', 20)),
  ]);
}

// ------------------------------------------------------------------- render --

function render() {
  if (rendering) return;
  rendering = true;

  const mod = moduleById(current);
  const focus = captureFocus();
  const oldMain = app.querySelector('.main');
  if (oldMain) scrollMemory[current] = oldMain.scrollTop;

  const main = el('main.main');
  const ctx = {
    rerender: render,
    nav,
    read,
    place: settings().place,
  };

  try {
    mod.render(main, ctx);
  } catch (err) {
    console.error(err);
    main.appendChild(el('div.banner.warn', [
      icon('dot', 16),
      el('span', 'This tab hit an error: ' + err.message),
    ]));
  }

  clear(app);
  app.appendChild(buildTop(mod));
  app.appendChild(main);
  app.appendChild(buildNav());

  main.scrollTop = scrollMemory[current] || 0;
  restoreFocus(focus);
  rendering = false;
}

// --------------------------------------------------------------------- boot --

async function boot() {
  current = routeId();
  loadCache();
  render();

  startSync();
  onChange(() => { if (!rendering) render(); });

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
