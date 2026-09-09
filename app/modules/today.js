// Today — the tab that makes you open the app at all.
//
// It is presence-aware on purpose. On a Saturday in Benicàssim you should not
// be looking at a list of undone jobs in a flat you are not standing in.

import { el, card, button, icon, iconBtn, toast, sectionTitle, empty, copyText } from '../ui.js';
import {
  getWeek, sortedChores, chores, projects, inbox, setPresence, settings,
  proteinTarget, dayProtein, slotProtein, mealById, mealName,
  SLOTS, SLOT_LABEL, MODE_ICON, MODE_LABEL, commit, logEvent,
  choreDone, choreUndo, choreSnapshot,
} from '../model.js';
import {
  ymd, weekKey, weekFile, weekDates, relDays, daysAgo, DAY_LONG, dayKeyOf,
  prettyDate, addDays, parseYmd,
} from '../util.js';
import { hasToken } from '../store.js';
import inboxModule from './inbox.js';
import { tokenSheet } from './settings.js';
import { slotSheet } from './meals.js';
import { dayRing } from './protein.js';

// Per-device dismissals. These are conveniences, not data — localStorage is
// exactly the right place for them.
function dismissed(key) {
  try { return localStorage.getItem('easy.dismiss.' + key) === '1'; } catch { return false; }
}

function dismiss(key) {
  try { localStorage.setItem('easy.dismiss.' + key, '1'); } catch { /* ignore */ }
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isInstalled() {
  return window.navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Still up';
  if (h < 12) return 'Morning';
  if (h < 15) return 'Buenas';
  if (h < 21) return 'Afternoon';
  return 'Evening';
}

function markChoreDone(chore, ctx) {
  const prev = choreSnapshot(chore);
  commit(choreDone(chore), logEvent('chore.done', { chore: chore.id, name: chore.name }));
  toast(chore.name + ' — done', '', {
    label: 'Undo',
    onclick: () => { commit(choreUndo(chore, prev)); ctx.rerender(); },
  });
}

// ------------------------------------------------------- what Claude sees --
//
// The app and Claude read the same files, so anything you tap is already
// "said". This card makes that visible: the handful of things the next
// session will pick up on its own. Copy gives you the same as text, for a
// chat on the phone where you would rather paste than explain.

function bold(text) {
  return el('b', text);
}

function claudeLines(week) {
  const today = ymd();
  const lines = [];

  const open = inbox().filter((n) => !n.handled).length;
  if (open) {
    lines.push({ icon: 'inbox', node: [bold(String(open)), ' open note' + (open === 1 ? '' : 's') + ' in the inbox'] });
  }

  const noIngredients = [];
  const noProtein = [];
  for (const d of weekDates(week.key)) {
    if (d < today) continue;
    const day = week.days[d];
    if (!day.here) continue;
    for (const s of SLOTS) {
      const slot = day.slots[s];
      if (!slot || !slot.meal) continue;
      const m = mealById(slot.meal);
      if (!m) continue;
      if (slot.mode === 'cook' && !(m.ingredients || []).length && !noIngredients.includes(m.name)) noIngredients.push(m.name);
      if (typeof m.proteinG !== 'number' && !noProtein.includes(m.name)) noProtein.push(m.name);
    }
  }
  if (noIngredients.length) lines.push({ icon: 'bag', node: ['Ingredients to fill in: ', bold(noIngredients.join(', '))] });
  if (noProtein.length && proteinTarget()) lines.push({ icon: 'protein', node: ['Protein numbers missing: ', bold(noProtein.join(', '))] });

  const noStep = projects().filter((p) => p.status === 'active' && !p.nextStep).map((p) => p.name);
  if (noStep.length) lines.push({ icon: 'projects', node: ['No next step on ', bold(noStep.join(', '))] });

  if (week.notes) lines.push({ icon: 'edit', node: ['Week note: ', bold('“' + week.notes + '”')] });

  return lines;
}

function summaryText(week) {
  const today = ymd();
  const day = week.days[today];
  const out = ['Easy. — ' + DAY_LONG[dayKeyOf(today)] + ' ' + prettyDate(today) + ', week ' + week.key];

  if (day && day.here) {
    const bits = [];
    for (const s of SLOTS) {
      const slot = day.slots[s];
      if (slot === undefined) continue;
      const name = mealName(slot);
      bits.push(SLOT_LABEL[s].toLowerCase() + ': ' + (name
        ? name + ' (' + (MODE_LABEL[slot.mode] || slot.mode).toLowerCase() + (slot.status ? ', ' + slot.status : '') + ')'
        : 'nothing planned'));
    }
    if (bits.length) out.push('Today — ' + bits.join('; '));
    const p = dayProtein(week, today);
    if (proteinTarget() || p.logged) {
      out.push('Protein — ' + p.logged + ' g logged, ' + p.planned + ' g in the plan'
        + (proteinTarget() ? ', target ' + proteinTarget() + ' g' : ''));
    }
  } else {
    out.push('Away today.');
  }

  for (const l of claudeLines(week)) {
    out.push('· ' + l.node.map((n) => (typeof n === 'string' ? n : n.textContent)).join(''));
  }

  const notes = inbox().filter((n) => !n.handled).slice(-5);
  for (const n of notes) out.push('  – ' + n.text);

  return out.join('\n');
}

export default {
  id: 'today',
  label: 'Today',
  icon: 'today',
  files: [],
  title: () => 'Easy.',

  // Today needs this week's plan, and tomorrow's if tomorrow is next week.
  extraFiles() {
    return [weekFile(weekKey()), weekFile(weekKey(addDays(new Date(), 1)))];
  },

  render(root, ctx) {
    const today = ymd();
    const week = getWeek(weekKey());
    const day = week.days[today];
    const here = day ? day.here : false;

    // ---------------------------------------------------------- the header --
    root.appendChild(el('div', [
      el('div.hero', greeting() + '.'),
      el('div.hero-sub', [
        DAY_LONG[dayKeyOf(today)] + ', ' + prettyDate(today),
        here ? null : el('span.dimmer', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } }, [
          '· away', icon('wave', 14),
        ]),
      ]),
    ]));

    // ------------------------------------------------------------- setup ---
    // Nothing saves without a token, so this stays until there is one.
    if (!hasToken() && !dismissed('token')) {
      root.appendChild(card([
        el('div', { style: { fontWeight: '500', marginBottom: '4px' } },
          'This device can look, but not save.'),
        el('p.small.dim',
          'Give Easy. a GitHub token and everything you tap here syncs to the '
          + 'repo — and to your other devices, and to Claude.'),
        el('div.row', { style: { marginTop: '12px', gap: '8px' } }, [
          button('Set it up', { class: 'primary grow', onclick: () => tokenSheet(ctx) }),
          button('Not here', {
            class: 'ghost',
            onclick: () => { dismiss('token'); ctx.rerender(); },
          }),
        ]),
      ]));
    }

    // iOS will happily let you use this as a tab forever without ever
    // mentioning that it can be an actual app.
    if (isIOS() && !isInstalled() && !dismissed('install')) {
      root.appendChild(el('div.banner.quiet', [
        icon('plus', 16),
        el('span.grow', 'Share → Add to Home Screen to get the icon.'),
        iconBtn('close', {
          class: 'small',
          'aria-label': 'Dismiss',
          onclick: () => { dismiss('install'); ctx.rerender(); },
        }, 16),
      ]));
    }

    // ------------------------------------------------------------ the meals --
    if (here) {
      const slotNames = SLOTS.filter((s) => day.slots[s] !== undefined);
      const p = dayProtein(week, today);
      const showRing = !!proteinTarget() || p.logged > 0;

      root.appendChild(sectionTitle('Eating', showRing
        ? el('button.ring-btn', {
          type: 'button',
          'aria-label': p.logged + ' grams of protein logged. Open protein.',
          onclick: () => ctx.nav('meals', 'protein'),
        }, dayRing(week, today, 52))
        : null));

      if (slotNames.length) {
        root.appendChild(card(el('div.list', slotNames.map((s) => {
          const slot = day.slots[s];
          const dish = mealName(slot);
          const grams = dish ? slotProtein(slot) : null;
          return el('button.slot', {
            class: (dish ? 'filled' : '') + (slot && slot.status === 'ate' ? ' ate' : ''),
            onclick: () => slotSheet(ctx, weekKey(), today, s),
          }, [
            el('span.mode', icon(dish ? (MODE_ICON[slot.mode] || 'pot') : 'plus', 18)),
            el('div.grow', [
              el('div.label', SLOT_LABEL[s]),
              el('div.dish', { class: dish ? '' : 'none' }, dish || 'nothing planned'),
            ]),
            slot && slot.status === 'ate' ? el('span.pill.ok', 'ate it') : null,
            slot && slot.status === 'other' ? el('span.pill', 'ate other') : null,
            slot && slot.status === 'skipped' ? el('span.pill', 'skipped') : null,
            grams !== null ? el('span.grams', grams + ' g') : null,
          ]);
        })), { class: 'pad0' }));
      } else {
        root.appendChild(card(el('div.row', [
          el('div.grow.dim', 'No meals set for today.'),
          button('Plan', { class: 'small', onclick: () => ctx.nav('meals') }),
        ]), { class: 'flat' }));
      }

      // Tomorrow, one line — for the "cook tonight for tomorrow" and "defrost
      // something" moments. Only when there is actually something to say.
      const tmr = ymd(addDays(new Date(), 1));
      const tmrWeek = weekKey(parseYmd(tmr)) === week.key ? week : getWeek(weekKey(parseYmd(tmr)));
      const tmrDay = tmrWeek.days[tmr];
      if (tmrDay && tmrDay.here) {
        const planned = SLOTS
          .filter((s) => tmrDay.slots[s] && mealName(tmrDay.slots[s]))
          .map((s) => SLOT_LABEL[s].toLowerCase() + ' ' + mealName(tmrDay.slots[s])
            + (tmrDay.slots[s].mode === 'leftovers' ? ' (leftovers)' : ''));
        if (planned.length) {
          root.appendChild(el('div.banner.quiet', {
            tappable: true, onclick: () => ctx.nav('meals'),
          }, [
            icon('right', 16),
            el('span.grow', [el('b', 'Tomorrow'), ' · ' + planned.join(' · ')]),
          ]));
        }
      }
    } else {
      root.appendChild(card(el('div.row', [
        el('span.dimmer', { style: { display: 'inline-flex' } }, icon('wave', 22)),
        el('div.grow', [
          el('div', { style: { fontWeight: '500' } }, 'Not in ' + (ctx.place || 'Valencia') + ' today.'),
          el('div.small.dim', 'Meals and chores are on hold. Projects and the inbox still work.'),
        ]),
        button("I'm here", {
          class: 'small',
          onclick: () => {
            commit(setPresence(weekKey(), today, true));
            toast('Here today', '', {
              label: 'Undo',
              onclick: () => { commit(setPresence(weekKey(), today, false)); ctx.rerender(); },
            });
            ctx.rerender();
          },
        }),
      ]), { class: 'flat' }));
    }

    // ----------------------------------------------------------- the chores --
    if (here) {
      const all = sortedChores();
      const due = all
        .filter((e) => e.status.dueIn <= 0 && e.chore.lastDone !== today)
        .slice(0, 4);
      const tasks = chores().oneoff.filter((t) => !t.done).slice(0, 3);

      if (due.length) {
        root.appendChild(sectionTitle('Due', due.length > 3
          ? el('span.tiny.dimmer', all.filter((e) => e.status.dueIn <= 0 && e.chore.lastDone !== today).length + ' waiting')
          : null));
        root.appendChild(card(el('div.list', due.map((e) => el('div.item', {
          tappable: true,
          onclick: () => ctx.nav('chores'),
        }, [
          el('button.tick.due', {
            type: 'button',
            'aria-label': 'Mark ' + e.chore.name + ' done',
            onclick: (ev) => { ev.stopPropagation(); markChoreDone(e.chore, ctx); ctx.rerender(); },
          }, icon('check', 17)),
          el('div.grow', [
            el('div.name', e.chore.name),
            el('div.meta', e.status.state === 'new' ? 'never done' : relDays(e.chore.lastDone)),
          ]),
        ]))), { class: 'pad0' }));
      }

      if (tasks.length) {
        root.appendChild(sectionTitle('Tasks'));
        root.appendChild(card(el('div.list', tasks.map((t) => el('div.item', {
          tappable: true,
          onclick: () => ctx.nav('chores'),
        }, [
          el('div.grow', el('div.name', t.name)),
          icon('right', 16),
        ]))), { class: 'pad0' }));
      }

      if (!due.length && !tasks.length && (all.length || chores().oneoff.length)) {
        root.appendChild(card(empty('Nothing due.', 'Genuinely nothing. Go and do something else.'),
          { class: 'flat' }));
      }
    }

    // --------------------------------------------------------- cold project --
    const cold = projects()
      .filter((p) => p.status === 'active')
      .map((p) => ({ p, since: daysAgo(p.lastTouched) }))
      .filter((x) => x.since !== null && x.since >= 10)
      .sort((a, b) => b.since - a.since)[0];

    if (cold) {
      root.appendChild(sectionTitle('Neglected'));
      root.appendChild(card(el('div.row', [
        el('div.grow', [
          el('div', { style: { fontWeight: '500' } }, cold.p.name),
          el('div.small.dim', cold.p.nextStep
            ? cold.p.nextStep
            : 'no next step — ' + relDays(cold.p.lastTouched)),
        ]),
        button('Open', { class: 'small ghost', onclick: () => ctx.nav('projects') }),
      ]), { class: 'flat' }));
    }

    // ------------------------------------------------------ weekly session --
    // Only ever nags once a session has actually happened. An app that asks
    // for a ritual you have never done is just noise.
    const lastSession = settings().lastSession;
    const sinceSession = daysAgo(lastSession);
    if (sinceSession !== null && sinceSession >= 7) {
      root.appendChild(el('div.banner.quiet', { style: { marginTop: '16px' } }, [
        icon('clock', 16),
        el('span', 'Last sat down with Claude ' + relDays(lastSession)
          + '. Worth another go when you have twenty minutes.'),
      ]));
    }

    // -------------------------------------------------------- for Claude ---
    const lines = claudeLines(week);
    if (lines.length) {
      root.appendChild(sectionTitle('Claude will see', iconBtn('copy', {
        'aria-label': 'Copy a summary for Claude',
        onclick: async () => {
          toast((await copyText(summaryText(week))) ? 'Copied — paste it to Claude' : 'Could not copy');
        },
      }, 18)));
      root.appendChild(card([
        ...lines.map((l) => el('div.summary-line', [icon(l.icon, 16), el('span', l.node)])),
        el('div.tiny.dimmer', { style: { marginTop: '6px' } },
          'It all lives in the repo, so you can just ask — no need to explain.'),
      ], { class: 'flat' }));
    }

    // -------------------------------------------------------- quick capture --
    const openNotes = inbox().filter((n) => !n.handled).length;
    root.appendChild(sectionTitle('Note to self', openNotes
      ? el('span.tiny.dimmer', openNotes + ' in the inbox')
      : null));
    root.appendChild(card(inboxModule.composer(ctx, {
      rows: 2,
      placeholder: 'Something you thought of. Anything.',
    })));
  },
};
