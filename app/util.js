// Small helpers. The date ones matter most: everything here is LOCAL time.
// Never use toISOString() for a date key — it silently shifts you a day
// backwards every evening in Spain.

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_SHORT = { mon: 'M', tue: 'T', wed: 'W', thu: 'T', fri: 'F', sat: 'S', sun: 'S' };
export const DAY_LONG = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Local YYYY-MM-DD. */
export function ymd(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** YYYY-MM-DD -> Date at local midnight. */
export function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d, n) {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  c.setDate(c.getDate() + n);
  return c;
}

/** Monday of the week containing d. */
export function mondayOf(d) {
  return addDays(d, -((d.getDay() + 6) % 7));
}

/** ISO-8601 week: weeks start Monday, week 1 contains the first Thursday. */
export function isoWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3); // Thursday of this week
  const year = d.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const firstThu = new Date(year, 0, 4 - ((jan4.getDay() + 6) % 7) + 3);
  const week = 1 + Math.round((d - firstThu) / (7 * 86400000));
  return { year, week };
}

export function weekKey(date = new Date()) {
  const { year, week } = isoWeek(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function weekFile(key) {
  return `weeks/${key}.json`;
}

/** The 7 local YYYY-MM-DD dates of a week key, Monday first. */
export function weekDates(key) {
  const [y, w] = key.split('-W').map(Number);
  const jan4 = new Date(y, 0, 4);
  const week1Mon = addDays(jan4, -((jan4.getDay() + 6) % 7));
  const mon = addDays(week1Mon, (w - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => ymd(addDays(mon, i)));
}

export function shiftWeek(key, delta) {
  return weekKey(addDays(parseYmd(weekDates(key)[0]), delta * 7));
}

export function dayKeyOf(dateStr) {
  return DAY_KEYS[(parseYmd(dateStr).getDay() + 6) % 7];
}

/** Whole days from date string a to date string b. */
export function daysBetween(a, b) {
  return Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
}

export function daysAgo(dateStr) {
  if (!dateStr) return null;
  return daysBetween(dateStr, ymd());
}

/** "today" / "yesterday" / "5 days ago" / "3 weeks ago" */
export function relDays(dateStr) {
  const n = daysAgo(dateStr);
  if (n === null) return 'never';
  if (n === 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 0) return `in ${-n} days`;
  if (n < 21) return `${n} days ago`;
  if (n < 60) return `${Math.round(n / 7)} weeks ago`;
  return `${Math.round(n / 30)} months ago`;
}

export function prettyDate(dateStr) {
  const d = parseYmd(dateStr);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function prettyTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function uid(prefix = 'x') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** A slug that stays readable in the JSON files. */
export function slug(name) {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^ -~]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  return base || uid('item');
}

export function clone(x) {
  return x === undefined ? x : JSON.parse(JSON.stringify(x));
}

export function getPath(obj, path) {
  let cur = obj;
  for (const k of path) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[k];
  }
  return cur;
}

export function setPath(obj, path, value) {
  if (path.length === 0) return value;
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    if (cur[k] === null || typeof cur[k] !== 'object') cur[k] = typeof path[i + 1] === 'number' ? [] : {};
    cur = cur[k];
  }
  cur[path[path.length - 1]] = value;
  return obj;
}

export function sortBy(arr, fn) {
  return arr.slice().sort((a, b) => {
    const x = fn(a), y = fn(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}
