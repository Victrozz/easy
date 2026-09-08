// Easy. — the store.
//
// The repo is the database. This file is the only thing that talks to GitHub.
//
// The important idea: the phone never pushes whole documents. It pushes
// MUTATIONS. A tap lands in an outbox instantly and the screen updates right
// away; a moment later the outbox is drained by fetching the CURRENT file from
// GitHub, replaying the pending mutations onto that, and writing it back.
//
// That is what stops your phone from silently overwriting something Claude
// wrote an hour ago, and what stops a tap in a kitchen with bad wifi from
// disappearing.

import { CONFIG, API } from './config.js';
import { getPath, setPath, clone } from './util.js';

const LS_TOKEN = 'easy.token';
const LS_OUTBOX = 'easy.outbox';
const LS_CACHE = 'easy.cache';

// ---------------------------------------------------------------- storage --
// Safari in private mode throws on localStorage. Never let that break boot.

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* full or blocked — we still work, we just forget across reloads */
  }
}

// ------------------------------------------------------------------ state --

const listeners = new Set();

export const store = {
  data: {},           // repo path -> parsed content (optimistic: includes pending)
  shas: {},           // repo path -> last known blob sha
  missing: new Set(), // paths GitHub returned 404 for (not an error — new week)
  outbox: lsGet(LS_OUTBOX, []),
  status: 'idle',     // idle | loading | syncing | offline | error | readonly
  error: null,
  lastLoad: 0,
  lastSync: lsGet('easy.lastSync', null),
};

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try { fn(store); } catch (e) { console.error('listener failed', e); }
  }
}

function setStatus(status, error = null) {
  store.status = status;
  store.error = error;
  emit();
}

// ------------------------------------------------------------------ token --

export function getToken() {
  return lsGet(LS_TOKEN, '') || '';
}

export function setToken(token) {
  lsSet(LS_TOKEN, (token || '').trim());
  store.error = null;
  emit();
}

export function hasToken() {
  return getToken().length > 0;
}

// --------------------------------------------------------------- encoding --
// btoa/atob are byte-oriented. Meal names have accents. Go through UTF-8
// explicitly or "Lentejas con jamón" comes back as mojibake.

function encodeB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function decodeB64(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ----------------------------------------------------------- (de)serialise --

export function emptyFor(path) {
  if (path.endsWith('.jsonl')) return [];
  return {};
}

function parse(path, text) {
  if (path.endsWith('.jsonl')) {
    return text.split('\n').filter((l) => l.trim()).map((l) => {
      try { return JSON.parse(l); } catch { return { text: l, broken: true }; }
    });
  }
  if (path.endsWith('.json')) {
    try { return JSON.parse(text); } catch { return emptyFor(path); }
  }
  return text;
}

function serialise(path, value) {
  if (path.endsWith('.jsonl')) return value.map((o) => JSON.stringify(o)).join('\n') + '\n';
  if (path.endsWith('.json')) return JSON.stringify(value, null, 2) + '\n';
  return String(value);
}

// -------------------------------------------------------------- GitHub API --

function apiUrl(path) {
  const p = path.split('/').map(encodeURIComponent).join('/');
  return API + '/repos/' + CONFIG.owner + '/' + CONFIG.repo + '/contents/' + p;
}

function headers() {
  return {
    Authorization: 'Bearer ' + getToken(),
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

class ConflictError extends Error {}

class AuthError extends Error {
  constructor(status) {
    super(status === 401
      ? 'Token rejected — it may have expired'
      : 'Token lacks Contents write on this repo');
    this.status = status;
  }
}

/** Read one file. Returns {text, sha} or {missing:true}. */
async function apiRead(path) {
  const url = apiUrl(path) + '?ref=' + CONFIG.branch + '&t=' + Date.now();
  const res = await fetch(url, { headers: headers(), cache: 'no-store' });
  if (res.status === 404) return { missing: true, sha: null, text: null };
  if (res.status === 401 || res.status === 403) throw new AuthError(res.status);
  if (!res.ok) throw new Error('GitHub read ' + path + ': ' + res.status);
  const body = await res.json();
  return { text: decodeB64(body.content || ''), sha: body.sha, missing: false };
}

/** Read without a token, straight off the published site. Read-only mode. */
async function publicRead(path) {
  const res = await fetch('./' + path + '?t=' + Date.now(), { cache: 'no-store' });
  if (res.status === 404) return { missing: true, sha: null, text: null };
  if (!res.ok) throw new Error('read ' + path + ': ' + res.status);
  return { text: await res.text(), sha: null, missing: false };
}

/** Write one file. Returns the new sha, or throws ConflictError. */
async function apiWrite(path, text, sha, message) {
  const body = { message, content: encodeB64(text), branch: CONFIG.branch };
  if (sha) body.sha = sha;
  const res = await fetch(apiUrl(path), {
    method: 'PUT',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers()),
    body: JSON.stringify(body),
  });
  if (res.status === 409 || res.status === 422) throw new ConflictError(path);
  if (res.status === 401 || res.status === 403) throw new AuthError(res.status);
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch { /* ignore */ }
    throw new Error('GitHub write ' + path + ': ' + res.status + ' ' + detail);
  }
  const out = await res.json();
  return out.content.sha;
}

// --------------------------------------------------------------- mutations --
//
//   { file, op, path, value, key, match, label }
//
// op is one of:
//   set          value at path
//   merge        Object.assign into the object at path
//   push         append value to the array at path
//   removeWhere  drop items from the array at path where item[key] === match
//   patchWhere   merge value into array items at path where item[key] === match
//   unset        delete the key at path
//
// removeWhere / patchWhere match on a key rather than an index on purpose:
// indexes drift when two writers touch the same list, ids do not.

export function applyMutation(doc, m) {
  const d = (doc === undefined || doc === null) ? emptyFor(m.file) : doc;
  switch (m.op) {
    case 'set':
      return setPath(d, m.path, clone(m.value));

    case 'merge': {
      const cur = getPath(d, m.path);
      return setPath(d, m.path, Object.assign({}, cur || {}, clone(m.value)));
    }

    case 'push': {
      const arr = getPath(d, m.path);
      const next = Array.isArray(arr) ? arr.slice() : [];
      next.push(clone(m.value));
      return setPath(d, m.path, next);
    }

    case 'removeWhere': {
      const arr = getPath(d, m.path);
      if (!Array.isArray(arr)) return d;
      return setPath(d, m.path, arr.filter((it) => !it || it[m.key] !== m.match));
    }

    case 'patchWhere': {
      const arr = getPath(d, m.path);
      if (!Array.isArray(arr)) return d;
      return setPath(d, m.path, arr.map((it) =>
        (it && it[m.key] === m.match) ? Object.assign({}, it, clone(m.value)) : it));
    }

    case 'unset': {
      const parent = getPath(d, m.path.slice(0, -1));
      if (parent && typeof parent === 'object') delete parent[m.path[m.path.length - 1]];
      return d;
    }

    default:
      console.warn('unknown mutation op', m.op);
      return d;
  }
}

/** Queue a change. Applies to the screen immediately, syncs shortly after. */
export function mutate(...mutations) {
  for (const m of mutations) {
    if (!m || !m.file) continue;
    store.data[m.file] = applyMutation(store.data[m.file], m);
    store.outbox.push(m);
  }
  lsSet(LS_OUTBOX, store.outbox);
  cacheNow();
  emit();
  scheduleFlush();
}

// ------------------------------------------------------------------ cache --
// Last known good, so the app paints instantly on open instead of showing a
// spinner while GitHub answers.

function cacheNow() {
  lsSet(LS_CACHE, { data: store.data, shas: store.shas, at: Date.now() });
}

export function loadCache() {
  const c = lsGet(LS_CACHE, null);
  if (c && c.data) {
    store.data = c.data;
    store.shas = c.shas || {};
    return true;
  }
  return false;
}

// ------------------------------------------------------------------- load --

export async function load(paths, options) {
  const force = !!(options && options.force);
  const want = paths.filter((p) => force || store.data[p] === undefined);
  if (want.length === 0) {
    // Everything was already in hand. Still say out loud whether this device
    // can save, or a token-less phone sits on a stale "idle" forever.
    if (store.status === 'idle' || store.status === 'readonly') {
      setStatus(hasToken() ? 'idle' : 'readonly');
    }
    return;
  }

  const reader = hasToken() ? apiRead : publicRead;
  if (store.status !== 'syncing') setStatus('loading');

  try {
    const results = await Promise.all(want.map(async (p) => [p, await reader(p)]));
    for (const pair of results) {
      const p = pair[0], r = pair[1];
      if (r.missing) {
        store.missing.add(p);
        if (store.data[p] === undefined) store.data[p] = emptyFor(p);
        store.shas[p] = null;
      } else {
        store.missing.delete(p);
        store.data[p] = parse(p, r.text);
        store.shas[p] = r.sha;
      }
    }
    // Anything still queued has not reached GitHub — keep it on screen.
    for (const m of store.outbox) {
      if (want.indexOf(m.file) !== -1) {
        store.data[m.file] = applyMutation(store.data[m.file], m);
      }
    }
    store.lastLoad = Date.now();
    cacheNow();
    setStatus(hasToken() ? 'idle' : 'readonly');
  } catch (err) {
    if (err instanceof AuthError) setStatus('error', err.message);
    else if (!navigator.onLine) setStatus('offline');
    else setStatus('error', err.message);
  }
}

export async function refresh(paths) {
  await load(paths, { force: true });
}

// ------------------------------------------------------------------ flush --

let flushTimer = null;
let flushing = false;

export function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => flush(), CONFIG.flushDelayMs);
}

function messageFor(batch) {
  const labels = [];
  for (const m of batch) {
    if (m.label && labels.indexOf(m.label) === -1) labels.push(m.label);
  }
  if (labels.length === 0) {
    return 'easy: ' + batch.length + ' change' + (batch.length > 1 ? 's' : '');
  }
  const head = labels.slice(0, 3).join(', ');
  return labels.length > 3 ? head + ' (+' + (labels.length - 3) + ' more)' : head;
}

export async function flush() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (flushing) return;
  if (store.outbox.length === 0) return;
  if (!hasToken()) { setStatus('readonly'); return; }
  if (!navigator.onLine) { setStatus('offline'); return; }

  flushing = true;
  setStatus('syncing');

  const batch = store.outbox.slice();
  const files = [];
  for (const m of batch) if (files.indexOf(m.file) === -1) files.push(m.file);
  const done = [];

  try {
    for (const file of files) {
      const mine = batch.filter((m) => m.file === file);
      let attempt = 0;

      for (;;) {
        const fresh = await apiRead(file);
        let doc = fresh.missing ? emptyFor(file) : parse(file, fresh.text);
        for (const m of mine) doc = applyMutation(doc, m);

        try {
          const sha = await apiWrite(file, serialise(file, doc), fresh.sha, messageFor(mine));
          store.shas[file] = sha;
          store.missing.delete(file);
          // The server now holds exactly this.
          store.data[file] = doc;
          for (const m of mine) done.push(m);
          break;
        } catch (e) {
          // Someone (Claude, on a laptop) wrote between our read and our write.
          // Re-read and replay. Give up only after a few honest attempts.
          if (e instanceof ConflictError && attempt++ < 4) continue;
          throw e;
        }
      }
    }

    store.outbox = store.outbox.filter((m) => done.indexOf(m) === -1);
    // Re-apply whatever was queued while we were writing.
    for (const m of store.outbox) {
      store.data[m.file] = applyMutation(store.data[m.file], m);
    }
    lsSet(LS_OUTBOX, store.outbox);
    store.lastSync = Date.now();
    lsSet('easy.lastSync', store.lastSync);
    cacheNow();
    setStatus('idle');
  } catch (err) {
    // Keep whatever did not land. Nothing is lost; we retry on the next tap,
    // when the network returns, or when the app is reopened.
    store.outbox = store.outbox.filter((m) => done.indexOf(m) === -1);
    lsSet(LS_OUTBOX, store.outbox);
    cacheNow();
    if (err instanceof AuthError) setStatus('error', err.message);
    else if (!navigator.onLine) setStatus('offline');
    else setStatus('error', err.message);
  } finally {
    flushing = false;
  }
}

// --------------------------------------------------------------- read side --

export function read(path) {
  return store.data[path];
}

export function pendingCount() {
  return store.outbox.length;
}

/** Drop everything queued. Only offered in Settings, behind a confirm. */
export function discardOutbox() {
  store.outbox = [];
  lsSet(LS_OUTBOX, []);
  emit();
}

// --------------------------------------------------------------- lifecycle --

export function startSync() {
  window.addEventListener('online', () => { setStatus('idle'); flush(); });
  window.addEventListener('offline', () => setStatus('offline'));

  // Push before the app goes away. iOS can freeze us the moment we hide.
  const bail = () => { if (store.outbox.length) flush(); };
  window.addEventListener('pagehide', bail);
  window.addEventListener('beforeunload', bail);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') { bail(); return; }
    if (store.outbox.length) flush();
    if (Date.now() - store.lastLoad > CONFIG.staleAfterMs) {
      refresh(Object.keys(store.data));
    }
  });
}
