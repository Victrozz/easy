// Exercises the outbox against a fake GitHub. Run: node tools/test-store.mjs
//
// The case that matters is #3: Claude edits a file on a laptop in the exact
// window between the phone reading it and the phone writing it back. Both
// changes must survive.

const results = [];
function check(name, cond, extra) {
  results.push({ name, ok: !!cond, extra });
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond || !extra ? '' : '\n         ' + extra));
}

// ------------------------------------------------------------ environment --

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true }, writable: true, configurable: true,
});
globalThis.window = { addEventListener() {} };
globalThis.document = { addEventListener() {}, visibilityState: 'visible' };

// ---------------------------------------------------------- fake GitHub ----

const server = new Map(); // path -> { text, sha }
let shaSeq = 0;
let requests = { read: 0, write: 0, conflicts: 0 };
let beforeWriteHook = null;

function b64encode(s) {
  return Buffer.from(s, 'utf8').toString('base64');
}

function put(path, text) {
  server.set(path, { text, sha: 'sha' + ++shaSeq });
}

globalThis.fetch = async (url, init) => {
  const u = new URL(url);
  const path = decodeURIComponent(u.pathname.split('/contents/')[1]);

  if (!init || init.method !== 'PUT') {
    requests.read++;
    const f = server.get(path);
    if (!f) return { ok: false, status: 404, json: async () => ({}) };
    return {
      ok: true,
      status: 200,
      json: async () => ({ content: b64encode(f.text), sha: f.sha }),
    };
  }

  requests.write++;
  const body = JSON.parse(init.body);
  if (beforeWriteHook) { const h = beforeWriteHook; beforeWriteHook = null; h(); }

  const existing = server.get(path);
  const expected = existing ? existing.sha : null;
  if ((body.sha || null) !== expected) {
    requests.conflicts++;
    return { ok: false, status: 409, json: async () => ({ message: 'sha mismatch' }) };
  }
  put(path, Buffer.from(body.content, 'base64').toString('utf8'));
  return {
    ok: true,
    status: 200,
    json: async () => ({ content: { sha: server.get(path).sha } }),
  };
};

// ----------------------------------------------------------------- tests ----

const S = await import('./../app/store.js');
S.setToken('fake-token');

put('data/chores.json', JSON.stringify({
  version: 1,
  recurring: [
    { id: 'dishes', name: 'Dishes', everyDays: 1, lastDone: '2026-09-01' },
    { id: 'bath', name: 'Bathroom', everyDays: 14, lastDone: '2026-08-20' },
  ],
}, null, 2));
put('data/inbox.jsonl', '');

await S.load(['data/chores.json', 'data/inbox.jsonl']);
check('loads a file from GitHub',
  S.read('data/chores.json').recurring.length === 2);

// --- 1. a tap shows up immediately, before any network round trip ----------
S.mutate({
  file: 'data/chores.json', op: 'patchWhere', path: ['recurring'],
  key: 'id', match: 'dishes', value: { lastDone: '2026-09-09' },
  label: 'done: Dishes',
});
const optimistic = S.read('data/chores.json').recurring.find((c) => c.id === 'dishes');
check('optimistic update is instant', optimistic.lastDone === '2026-09-09');
check('outbox holds the pending change', S.pendingCount() === 1);

// --- 2. flushing writes it through ----------------------------------------
await S.flush();
const onServer = JSON.parse(server.get('data/chores.json').text);
check('flush pushes to GitHub',
  onServer.recurring.find((c) => c.id === 'dishes').lastDone === '2026-09-09');
check('outbox drains after a good flush', S.pendingCount() === 0);

// --- 3. THE ONE THAT MATTERS ----------------------------------------------
// Phone marks the bathroom done. Claude renames a chore on a laptop in the
// same instant. Neither change may be lost.
S.mutate({
  file: 'data/chores.json', op: 'patchWhere', path: ['recurring'],
  key: 'id', match: 'bath', value: { lastDone: '2026-09-09' },
  label: 'done: Bathroom',
});
beforeWriteHook = () => {
  const doc = JSON.parse(server.get('data/chores.json').text);
  doc.recurring.find((c) => c.id === 'dishes').name = 'Wash up';
  doc.recurring.push({ id: 'bins', name: 'Bins', everyDays: 3, lastDone: null });
  put('data/chores.json', JSON.stringify(doc, null, 2)); // new sha => conflict
};
await S.flush();

const merged = JSON.parse(server.get('data/chores.json').text);
check('conflict was actually triggered', requests.conflicts === 1,
  'conflicts seen: ' + requests.conflicts);
check('phone change survived the conflict',
  merged.recurring.find((c) => c.id === 'bath').lastDone === '2026-09-09');
check('laptop rename survived the conflict',
  merged.recurring.find((c) => c.id === 'dishes').name === 'Wash up');
check('laptop insertion survived the conflict',
  !!merged.recurring.find((c) => c.id === 'bins'));
check('outbox is clean after conflict recovery', S.pendingCount() === 0);
check('in-memory matches the server after recovery',
  S.read('data/chores.json').recurring.find((c) => c.id === 'dishes').name === 'Wash up');

// --- 4. offline keeps the tap -------------------------------------------
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('network down'); };
S.mutate({
  file: 'data/chores.json', op: 'patchWhere', path: ['recurring'],
  key: 'id', match: 'bins', value: { lastDone: '2026-09-09' }, label: 'done: Bins',
});
await S.flush();
check('offline keeps the change queued', S.pendingCount() === 1);
check('offline still shows it on screen',
  S.read('data/chores.json').recurring.find((c) => c.id === 'bins').lastDone === '2026-09-09');

globalThis.fetch = realFetch;
await S.flush();
check('reconnecting flushes the backlog', S.pendingCount() === 0);
check('the offline change reached GitHub',
  JSON.parse(server.get('data/chores.json').text)
    .recurring.find((c) => c.id === 'bins').lastDone === '2026-09-09');

// --- 5. jsonl append ------------------------------------------------------
S.mutate({ file: 'data/inbox.jsonl', op: 'push', path: [], value: { ts: 1, text: 'buy bin bags' } });
S.mutate({ file: 'data/inbox.jsonl', op: 'push', path: [], value: { ts: 2, text: 'call mum' } });
await S.flush();
const lines = server.get('data/inbox.jsonl').text.trim().split('\n');
check('jsonl appends one line per entry', lines.length === 2, 'got ' + lines.length);
check('jsonl lines are valid json', JSON.parse(lines[1]).text === 'call mum');

// --- 6. a file that does not exist yet (a fresh week) ---------------------
S.mutate({
  file: 'weeks/2026-W37.json', op: 'set', path: ['days', '2026-09-09', 'presence'],
  value: 'here', label: 'week: here on Sep 9',
});
await S.flush();
check('creates a missing file on first write', server.has('weeks/2026-W37.json'));
check('nested paths are built on the way down',
  JSON.parse(server.get('weeks/2026-W37.json').text).days['2026-09-09'].presence === 'here');

// --- 7. removeWhere does not suffer index drift ---------------------------
S.mutate({
  file: 'data/chores.json', op: 'removeWhere', path: ['recurring'],
  key: 'id', match: 'dishes', label: 'remove: Wash up',
});
await S.flush();
const after = JSON.parse(server.get('data/chores.json').text).recurring;
check('removeWhere removes exactly one item', after.length === 2);
check('removeWhere removed the right one', !after.find((c) => c.id === 'dishes'));

// --- 8. accents survive the base64 round trip ----------------------------
S.mutate({
  file: 'data/chores.json', op: 'push', path: ['recurring'],
  value: { id: 'colada', name: 'Colada y planchar — ñ é ü', everyDays: 7, lastDone: null },
});
await S.flush();
check('utf-8 survives base64 both ways',
  JSON.parse(server.get('data/chores.json').text)
    .recurring.find((c) => c.id === 'colada').name === 'Colada y planchar — ñ é ü');

// ---------------------------------------------------------------- summary --

const failed = results.filter((r) => !r.ok);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
if (failed.length) {
  console.log('FAILED: ' + failed.map((f) => f.name).join(', '));
  process.exit(1);
}
