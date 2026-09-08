// Easy. — the rules.
//
// Everything that knows what a week *means* lives here, so the tab modules
// stay dumb and there is one place to argue with when a rule feels wrong.

import { mutate, read } from './store.js';
import {
  DAY_KEYS, ymd, weekDates, dayKeyOf, daysAgo, weekKey, weekFile, uid,
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
export const MODE_ICON = { cook: 'pot', leftovers: 'fridge', out: 'out', quick: 'quick' };

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

    days[date] = { date, dayKey: dk, here, slots, note: saved.note || '' };
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
    favorite: false,
    batchable: false,
    servings: 1,
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
 */
export function choreStatus(chore) {
  const since = daysAgo(chore.lastDone);
  if (since === null) return { since: null, dueIn: 0, state: 'new' };
  const dueIn = (chore.everyDays || 7) - since;
  return {
    since,
    dueIn,
    state: dueIn <= 0 ? 'due' : dueIn <= 1 ? 'soon' : 'ok',
  };
}

export function sortedChores() {
  const { recurring } = chores();
  return recurring
    .map((c) => ({ chore: c, status: choreStatus(c) }))
    .sort((a, b) => a.status.dueIn - b.status.dueIn);
}

export function newChore(fields) {
  return Object.assign({
    id: uid('chore'), name: '', everyDays: 7, lastDone: null, notes: '',
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
