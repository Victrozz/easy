// Exercises the rules in model.js against a fake store. Run: node tools/test-model.mjs
//
// The cases that matter: week files stay sparse (a template day must never be
// written just because it was looked at), and the protein maths never turns
// an unknown into a failure.

const results = [];
function check(name, cond, extra) {
  results.push({ name, ok: !!cond });
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond || extra === undefined ? '' : '\n         got ' + JSON.stringify(extra)));
}

// ------------------------------------------------------------ environment --

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: false }, writable: true, configurable: true,
});
globalThis.window = { addEventListener() {} };
globalThis.document = { addEventListener() {}, visibilityState: 'visible' };

const { store, read } = await import('../app/store.js');
const model = await import('../app/model.js');
const { ymd, weekKey, weekDates, weekFile } = await import('../app/util.js');

const {
  getWeek, dayProtein, slotProtein, proteinTarget, proteinPresets, settings,
  setWeekNote, setDayNote, addExtra, removeExtra, setSlot, commit, SETTINGS_FILE,
  MEALS_FILE, mealsWithoutProtein,
} = model;

const key = weekKey();
const dates = weekDates(key);
const tue = dates[1];
const wed = dates[2];
const sat = dates[5];

store.data[SETTINGS_FILE] = {
  version: 1,
  place: 'Valencia',
  week: {
    mon: { here: false, slots: [] },
    tue: { here: true, slots: ['lunch', 'dinner'] },
    wed: { here: true, slots: ['lunch', 'dinner'] },
    thu: { here: true, slots: ['lunch', 'dinner'] },
    fri: { here: true, slots: ['lunch'] },
    sat: { here: false, slots: [] },
    sun: { here: false, slots: [] },
  },
  targets: { protein: null, fiber: null },
};
store.data[MEALS_FILE] = {
  items: [
    { id: 'lentejas', name: 'Lentejas', proteinG: 30, ingredients: ['lentejas'] },
    { id: 'salmon', name: 'Salmón', proteinG: 25 },
    { id: 'bocadillo', name: 'Bocadillo' }, // no number on purpose
  ],
};

// ------------------------------------------------------------- sparse week --

let week = getWeek(key);
check('template day is here with empty slots', week.days[tue].here && week.days[tue].slots.lunch === null);
check('template away day has no slots', !week.days[sat].here && Object.keys(week.days[sat].slots).length === 0);
check('looking at a week writes nothing', read(weekFile(key)) === undefined);
check('extras default to an empty list', Array.isArray(week.days[tue].extras) && week.days[tue].extras.length === 0);

// ----------------------------------------------------------- protein maths --

commit(
  setSlot(key, tue, 'lunch', { meal: 'lentejas', name: null, mode: 'cook', status: 'ate' }),
  setSlot(key, tue, 'dinner', { meal: 'salmon', name: null, mode: 'cook', status: null }),
);
week = getWeek(key);
let p = dayProtein(week, tue);
check('planned adds every standing slot', p.planned === 55, p);
check('logged counts only what was eaten', p.logged === 30, p);
check('nothing missing when every dish has a number', p.missing.length === 0, p);

commit(setSlot(key, wed, 'lunch', { meal: 'bocadillo', name: null, mode: 'quick', status: null }));
week = getWeek(key);
p = dayProtein(week, wed);
check('a dish with no number is "missing", not zero', p.missing.length === 1 && p.missing[0] === 'Bocadillo', p);
check('a missing number does not count as planned', p.planned === 0, p);

commit(setSlot(key, wed, 'dinner', { meal: null, name: 'Menú del día', mode: 'out', status: 'ate', proteinG: 40 }));
week = getWeek(key);
p = dayProtein(week, wed);
check('a one-off slot carries its own number', slotProtein(week.days[wed].slots.dinner) === 40);
check('one-off number is planned and logged', p.planned === 40 && p.logged === 40, p);

commit(setSlot(key, tue, 'dinner', { meal: 'salmon', name: null, mode: 'cook', status: 'other' }));
week = getWeek(key);
p = dayProtein(week, tue);
check('"ate something else" drops the dish from the plan', p.planned === 30, p);

const muts = addExtra(key, tue, 'Yogurt', 10);
commit(muts);
week = getWeek(key);
p = dayProtein(week, tue);
check('an extra counts as planned and logged', p.planned === 40 && p.logged === 40, p);
commit(removeExtra(key, tue, muts[0].value.id));
week = getWeek(key);
check('an extra can be taken back', getWeek(key).days[tue].extras.length === 0);

check('no target means no target', proteinTarget() === null);
store.data[SETTINGS_FILE].targets.protein = 120;
check('a target reads back', proteinTarget() === 120);
store.data[SETTINGS_FILE].targets.protein = 0;
check('a zero target is no target', proteinTarget() === null);

check('presets fall back to the built-in list', proteinPresets().length > 0);
store.data[SETTINGS_FILE].proteinPresets = [{ name: 'Whey', proteinG: 24 }];
check('presets in settings win', proteinPresets()[0].name === 'Whey');

check('library gaps are the meals without a number',
  mealsWithoutProtein().map((m) => m.id).join() === 'bocadillo');

// ------------------------------------------------------------------ notes --

commit(setWeekNote(key, '  exams thursday  '));
check('week note is trimmed and stored', getWeek(key).notes === 'exams thursday');
commit(setWeekNote(key, ''));
check('an empty week note is removed, not stored as ""', read(weekFile(key)).notes === undefined);

commit(setDayNote(key, wed, 'guests'));
check('day note stored', getWeek(key).days[wed].note === 'guests');
commit(setDayNote(key, wed, ''));
check('day note removed on clear', read(weekFile(key)).days[wed].note === undefined);
check('clearing a note did not invent a presence', read(weekFile(key)).days[wed].presence === undefined);

check('settings fill in a place when missing', (() => {
  delete store.data[SETTINGS_FILE].place;
  return settings().place === 'Valencia';
})());

// ------------------------------------------------------------------- done --

const failed = results.filter((r) => !r.ok).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
