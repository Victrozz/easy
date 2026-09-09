// Easy. — the rules.
//
// Everything that knows what a week *means* lives here, so the tab modules
// stay dumb and there is one place to argue with when a rule feels wrong.

import { mutate, read } from './store.js';
import {
  DAY_KEYS, ymd, weekDates, dayKeyOf, daysAgo, daysBetween, weekKey, weekFile, uid,
} from './util.js';

export const SETTINGS_FILE = 'data/settings.json';
export const MEALS_FILE = 'data/meals.json';
export const CHORES_FILE = 'data/chores.json';
export const PROJECTS_FILE = 'data/projects.json';
export const INBOX_FILE = 'data/inbox.jsonl';

export const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
export const SLOT_LABEL = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack',
};

export const MODES = ['cook', 'leftovers', 'out', 'quick'];
export const MODE_LABEL = {
  cook: 'Cook it', leftovers: 'Leftovers', out: 'Out / bought', quick: 'Something quick',
};
export const MODE_ICON = { cook: 'pot', leftovers: 'box', out: 'out', quick: 'quick' };

export const EFFORTS = ['easy', 'medium', 'project'];

// Víctor's default week: Valencia Tuesday to Friday, Friday lunch only.
// Monday and the weekend are usually Benicàssim. All of it is per-week
// overridable — this is only what a fresh week starts as.
const DEFAULT_WEEK = {
  mon: { here: false, slots: [] },
  tue: { here: true, slots: ['lunch', 'dinner'] },
  wed: { here: true, slots: ['lunch', 'dinner'] },
  thu: { here: true, slots: ['lunch', 'dinner'] },
  fri: { here: true, slots: ['lunch'] },
  sat: { here: false, slots: [] },
  sun: { here: false, slots: [] },
};

// What the "Add something" sheet offers when settings.json has no
// `proteinPresets` of its own. Tell Claude what you actually buy and it
// writes the real list into settings.
const DEFAULT_PRESETS = [
  { name: 'Protein shake', proteinG: 25 },
  { name: 'Greek yogurt', proteinG: 10 },
  { name: 'Two eggs', proteinG: 13 },
  { name: 'Tin of tuna', proteinG: 20 },
  { name: 'Glass of milk', proteinG: 8 },
  { name: 'Queso fresco', proteinG: 12 },
];

// ---------------------------------------------------------------- settings --

export function settings() {
  const s = read(SETTINGS_FILE) || {};
  return Object.assign({}, s, {
    version: 1,
    week: Object.assign({}, DEFAULT_WEEK, s.week || {}),
    targets: s.targets || { protein: null, fiber: null },
    place: s.place || 'Valencia',
  });
}

export function setDayDefault(dayKey, patch) {
  const cur = settings().week[dayKey];
  return {
    file: SETTINGS_FILE, op: 'set', path: ['week', dayKey],
    value: Object.assign({}, cur, patch),
    label: 'settings: default ' + dayKey,
  };
}

export function setPlace(name) {
  return {
    file: SETTINGS_FILE, op: 'set', path: ['place'], value: name,
    label: 'settings: place',
  };
}

export function proteinTarget() {
  const t = settings().targets;
  return t && typeof t.protein === 'number' && t.protein > 0 ? t.protein : null;
}

export function setProteinTarget(grams) {
  return [
    {
      file: SETTINGS_FILE, op: 'set', path: ['targets', 'protein'], value: grams,
      label: 'settings: protein target',
    },
    logEvent('protein.target', { grams }),
  ];
}

export function proteinPresets() {
  const s = read(SETTINGS_FILE) || {};
  return Array.isArray(s.proteinPresets) && s.proteinPresets.length
    ? s.proteinPresets
    : DEFAULT_PRESETS;
}

// -------------------------------------------------------------------- week --
//
// Week files are SPARSE. A day only appears once you have actually touched it.
// Browsing to next week therefore writes nothing — you get the template until
// you change something. `getWeek` is what merges the two.

export function getWeek(key) {
  const stored = read(weekFile(key)) || {};
  const cfg = settings().week;
  const days = {};

  for (const date of weekDates(key)) {
    const dk = dayKeyOf(date);
    const tpl = cfg[dk] || { here: false, slots: [] };
    const saved = (stored.days || {})[date] || {};

    const here = saved.presence === undefined
      ? tpl.here
      : saved.presence === 'here';

    // Slots present in the file win; the template fills in the rest.
    const slots = {};
    if (here) for (const name of tpl.slots) slots[name] = null;
    Object.assign(slots, saved.slots || {});

    days[date] = {
      date,
      dayKey: dk,
      here,
      slots,
      note: saved.note || '',
      extras: Array.isArray(saved.extras) ? saved.extras : [],
    };
  }

  return { key, days, notes: stored.notes || '', away: allAway(days) };
}

function allAway(days) {
  return Object.keys(days).every((d) => !days[d].here);
}

export function setPresence(key, date, here) {
  return {
    file: weekFile(key), op: 'set', path: ['days', date, 'presence'],
    value: here ? 'here' : 'away',
    label: 'week: ' + (here ? 'here' : 'away') + ' on ' + date,
  };
}

export function setSlot(key, date, slot, value) {
  return {
    file: weekFile(key), op: 'set', path: ['days', date, 'slots', slot],
    value,
    label: value ? 'plan: ' + slot + ' ' + date : 'clear: ' + slot + ' ' + date,
  };
}

export function addSlot(key, date, slot) {
  return setSlot(key, date, slot, { meal: null, mode: 'cook', status: null });
}

/** Copy a planned slot to another day, clearing it from the old one. */
export function moveSlot(key, fromDate, fromSlot, toDate, toSlot, value) {
  return [
    setSlot(key, toDate, toSlot, Object.assign({}, value, { status: null })),
    setSlot(key, fromDate, fromSlot, null),
  ];
}

/** A free-text line for the whole week. Claude reads it when planning. */
export function setWeekNote(key, text) {
  const t = (text || '').trim();
  return [
    t
      ? { file: weekFile(key), op: 'set', path: ['notes'], value: t, label: 'week: note' }
      : { file: weekFile(key), op: 'unset', path: ['notes'], label: 'week: clear note' },
    logEvent('week.note', { week: key, text: t.slice(0, 160) }),
  ];
}

export function setDayNote(key, date, text) {
  const t = (text || '').trim();
  return t
    ? { file: weekFile(key), op: 'set', path: ['days', date, 'note'], value: t, label: 'note: ' + date }
    : { file: weekFile(key), op: 'unset', path: ['days', date, 'note'], label: 'clear note: ' + date };
}

// ------------------------------------------------------------------- meals --

export function meals() {
  const m = read(MEALS_FILE) || {};
  return Array.isArray(m.items) ? m.items : [];
}

export function mealById(id) {
  if (!id) return null;
  return meals().find((m) => m.id === id) || null;
}

export function mealName(slot) {
  if (!slot) return null;
  if (slot.name) return slot.name;
  const m = mealById(slot.meal);
  return m ? m.name : null;
}

export function newMeal(fields) {
  return Object.assign({
    id: uid('meal'),
    name: '',
    effort: 'easy',
    tags: [],
    protein: '',
    proteinG: null,
    favorite: false,
    batchable: false,
    servings: 1,
    ingredients: [],
    notes: '',
    timesCooked: 0,
    rejections: 0,
    lastCooked: null,
  }, fields || {});
}

/**
 * Pick something to eat. The rule Víctor asked for: do not repeat much from
 * last week, except things marked favourite or easy.
 *
 * Deliberately not clever. If it picks something daft, tell Claude and the
 * scoring changes — that conversation is more useful than a better heuristic.
 */
export function suggestMeal(options) {
  const o = options || {};
  const recent = recentMealIds(o.weekKeys || [weekKey(), prevWeekKey()]);
  const pool = meals().filter((m) => m.id !== o.exclude && !m.archived);
  if (pool.length === 0) return null;

  const scored = pool.map((m) => {
    let score = Math.random() * 8;
    const seen = recent[m.id];

    if (seen === undefined) score += 60;
    else if (seen < 7) score -= m.favorite ? 15 : 55;
    else score -= 10;

    if (m.favorite) score += 35;
    if (o.effort && m.effort === o.effort) score += 30;
    if (o.effort === 'easy' && m.effort === 'easy') score += 10;
    if (o.batchable && m.batchable) score += 25;
    score -= (m.rejections || 0) * 12;

    return { meal: m, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].meal;
}

/** meal id -> days since it was last planned, across the given weeks. */
function recentMealIds(keys) {
  const out = {};
  for (const k of keys) {
    const stored = read(weekFile(k));
    if (!stored || !stored.days) continue;
    for (const date of Object.keys(stored.days)) {
      const slots = stored.days[date].slots || {};
      for (const slotName of Object.keys(slots)) {
        const s = slots[slotName];
        if (!s || !s.meal) continue;
        const age = Math.abs(daysAgo(date) === null ? 99 : daysAgo(date));
        if (out[s.meal] === undefined || age < out[s.meal]) out[s.meal] = age;
      }
    }
  }
  return out;
}

export function prevWeekKey() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return weekKey(d);
}

// ----------------------------------------------------------------- protein --
//
// Protein lives inside Meals, not beside it. A meal carries `proteinG` per
// serving; a one-off slot ("menú del día") can carry its own `proteinG`;
// anything eaten outside the plan — a shake, a yogurt — is an `extra` on
// the day. Nothing here ever says "you missed". A ring that is not full is
// a day that is not over, or a number Claude has not filled in yet.

export function slotProtein(slot) {
  if (!slot) return null;
  if (typeof slot.proteinG === 'number') return slot.proteinG;
  const m = mealById(slot.meal);
  return m && typeof m.proteinG === 'number' ? m.proteinG : null;
}

/**
 * One day's protein: what the plan adds up to, what is logged as eaten,
 * and which dishes have no number yet.
 *
 *   planned  grams from planned slots that still stand, plus extras
 *   logged   grams from slots marked "ate", plus extras
 *   missing  dish names with no proteinG — an ask for Claude, not a gap
 */
export function dayProtein(week, date) {
  const day = week.days[date];
  const out = { planned: 0, logged: 0, missing: [], slots: [], extras: [] };
  if (!day) return out;

  for (const s of SLOTS) {
    const slot = day.slots[s];
    if (!slot || (!slot.meal && !slot.name)) continue;
    const g = slotProtein(slot);
    const name = mealName(slot);
    const status = slot.status || null;
    out.slots.push({ slot: s, name, g, status, mode: slot.mode });
    if (g === null) {
      if (name && !out.missing.includes(name)) out.missing.push(name);
      continue;
    }
    if (status !== 'skipped' && status !== 'other') out.planned += g;
    if (status === 'ate') out.logged += g;
  }

  for (const x of day.extras || []) {
    const g = typeof x.proteinG === 'number' ? x.proteinG : 0;
    out.extras.push(x);
    out.planned += g;
    out.logged += g;
  }

  return out;
}

export function addExtra(key, date, name, proteinG) {
  const value = { id: uid('x'), name, proteinG, ts: Date.now() };
  return [
    {
      file: weekFile(key), op: 'push', path: ['days', date, 'extras'], value,
      label: 'protein: ' + name,
    },
    logEvent('extra.added', { date, name, proteinG }),
  ];
}

export function removeExtra(key, date, id) {
  return {
    file: weekFile(key), op: 'removeWhere', path: ['days', date, 'extras'],
    key: 'id', match: id, label: 'protein: remove extra',
  };
}

/** Names of meals in the library with no protein number — Claude's to-do. */
export function mealsWithoutProtein() {
  return meals().filter((m) => !m.archived && typeof m.proteinG !== 'number');
}

// ------------------------------------------------------------------ chores --

export function chores() {
  const c = read(CHORES_FILE) || {};
  return {
    recurring: Array.isArray(c.recurring) ? c.recurring : [],
    oneoff: Array.isArray(c.oneoff) ? c.oneoff : [],
  };
}

/**
 * How overdue is it? Negative dueIn means overdue by that many days.
 * A chore with no lastDone has never been done — treat as due, not as a
 * failure. Nothing in this app is a failure.
 *
 * `everyDays: null` means the chore has no schedule at all: it is only being
 * tracked, so it can never be late. `dueIn` is Infinity so it sorts last and
 * never lands in a "due" list.
 */
export function choreStatus(chore) {
  const since = daysAgo(chore.lastDone);
  if (!chore.everyDays) return { since, dueIn: Infinity, state: 'tracked' };
  if (since === null) return { since: null, dueIn: 0, state: 'new' };
  const dueIn = chore.everyDays - since;
  return {
    since,
    dueIn,
    state: dueIn <= 0 ? 'due' : dueIn <= SOON_DAYS ? 'soon' : 'ok',
  };
}

/** A chore due within this many days counts as "coming up". */
export const SOON_DAYS = 3;

/** How many dates of history a chore keeps. Enough to see a rhythm. */
const HISTORY_CAP = 60;

export function choreHistory(chore) {
  return Array.isArray(chore.history) ? chore.history.slice().sort() : [];
}

/**
 * The rhythm he actually keeps, as opposed to the one he intended: the average
 * gap between the last few times he did it, and how many times in the last
 * month. This is the whole point of an unscheduled chore — "am I taking the
 * bins out far less than I think" is a question about observed frequency, not
 * about a deadline.
 *
 * `everyDays: null` here means not enough history to say. That is unknown, not
 * zero — never render it as "never".
 */
export function choreRhythm(chore) {
  const h = choreHistory(chore);
  const recent = h.filter((d) => daysAgo(d) <= 30).length;
  if (h.length < 2) return { count: h.length, last30: recent, everyDays: null };
  // Only the last handful of gaps: a rhythm from six months ago is not his
  // rhythm now.
  const use = h.slice(-8);
  const span = daysBetween(use[0], use[use.length - 1]);
  return {
    count: h.length,
    last30: recent,
    everyDays: span / (use.length - 1),
  };
}

/**
 * Doing a chore is one mutation, built here so the Today tab and the Chores
 * tab cannot drift apart on what "done" writes.
 */
export function choreDone(chore, date) {
  const d = date || ymd();
  const history = choreHistory(chore)
    .filter((x) => x !== d)
    .concat(d)
    .sort()
    .slice(-HISTORY_CAP);
  return {
    file: CHORES_FILE, op: 'patchWhere', path: ['recurring'],
    key: 'id', match: chore.id,
    value: { lastDone: d, history },
    label: 'done: ' + chore.name,
  };
}

/** Undo takes the whole snapshot back, not just the date. */
export function choreUndo(chore, prev) {
  return {
    file: CHORES_FILE, op: 'patchWhere', path: ['recurring'],
    key: 'id', match: chore.id,
    value: { lastDone: (prev && prev.lastDone) || null, history: (prev && prev.history) || [] },
    label: 'undo: ' + chore.name,
  };
}

export function choreSnapshot(chore) {
  return { lastDone: chore.lastDone || null, history: choreHistory(chore) };
}

export function sortedChores() {
  const { recurring } = chores();
  return recurring
    .map((c) => ({ chore: c, status: choreStatus(c) }))
    .sort((a, b) => a.status.dueIn - b.status.dueIn);
}

export function newChore(fields) {
  return Object.assign({
    id: uid('chore'), name: '', everyDays: 7, lastDone: null, history: [], notes: '',
  }, fields || {});
}

// ---------------------------------------------------------------- projects --

export function projects() {
  const p = read(PROJECTS_FILE) || {};
  return Array.isArray(p.items) ? p.items : [];
}

export function newProject(fields) {
  return Object.assign({
    id: uid('proj'), name: '', why: '', nextStep: '',
    lastTouched: null, status: 'active', notes: '',
  }, fields || {});
}

// ------------------------------------------------------------------- inbox --

export function inbox() {
  const items = read(INBOX_FILE);
  return Array.isArray(items) ? items : [];
}

export function addInbox(text) {
  return {
    file: INBOX_FILE, op: 'push', path: [],
    value: { id: uid('note'), ts: Date.now(), date: ymd(), text, handled: false },
    label: 'inbox: ' + text.slice(0, 40),
  };
}

// --------------------------------------------------------------------- log --
//
// Append-only history, one file per month. Nothing in the app reads it —
// it exists so Claude can answer "what actually happened last month" without
// guessing, and so a wrong edit is always recoverable.

export function logFile(date) {
  return 'log/' + (date || ymd()).slice(0, 7) + '.jsonl';
}

export function logEvent(type, payload) {
  return {
    file: logFile(), op: 'push', path: [],
    value: Object.assign({ ts: Date.now(), date: ymd(), type }, payload || {}),
  };
}

// ------------------------------------------------------------------ helpers --

export function todayIsHere() {
  const w = getWeek(weekKey());
  const d = w.days[ymd()];
  return d ? d.here : false;
}

export function dayOrder(date) {
  return DAY_KEYS.indexOf(dayKeyOf(date));
}

/** Fire-and-forget: queue mutations, flattening arrays. */
export function commit(...items) {
  const flat = [];
  for (const i of items) {
    if (!i) continue;
    if (Array.isArray(i)) flat.push(...i.filter(Boolean));
    else flat.push(i);
  }
  if (flat.length) mutate(...flat);
}
