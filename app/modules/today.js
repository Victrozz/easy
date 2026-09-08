// Today — the tab that makes you open the app at all.
//
// It is presence-aware on purpose. On a Saturday in Benicàssim you should not
// be looking at a list of undone jobs in a flat you are not standing in.

import { el, card, button, icon, toast, sectionTitle, empty } from '../ui.js';
import {
  getWeek, sortedChores, chores, projects, inbox, setPresence,
  SLOTS, SLOT_LABEL, MODE_ICON, mealName, commit, logEvent, CHORES_FILE,
} from '../model.js';
import { ymd, weekKey, relDays, daysAgo, DAY_LONG, dayKeyOf, prettyDate } from '../util.js';
import inboxModule from './inbox.js';

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Still up';
  if (h < 12) return 'Morning';
  if (h < 15) return 'Buenas';
  if (h < 21) return 'Afternoon';
  return 'Evening';
}

function markChoreDone(chore) {
  commit(
    {
      file: CHORES_FILE, op: 'patchWhere', path: ['recurring'],
      key: 'id', match: chore.id, value: { lastDone: ymd() },
      label: 'done: ' + chore.name,
    },
    logEvent('chore.done', { chore: chore.id, name: chore.name }),
  );
  toast(chore.name + ' — done');
}

export default {
  id: 'today',
  label: 'Today',
  icon: 'today',
  files: [],
  title: () => 'Easy.',

  render(root, ctx) {
    const today = ymd();
    const week = getWeek(weekKey());
    const day = week.days[today];
    const here = day ? day.here : false;

    // ---------------------------------------------------------- the header --
    root.appendChild(el('div', [
      el('div.hero', greeting() + '.'),
      el('div.hero-sub', DAY_LONG[dayKeyOf(today)] + ', ' + prettyDate(today)
        + (here ? '' : ' · away')),
    ]));

    // ------------------------------------------------------------ the meals --
    if (here) {
      const slotNames = SLOTS.filter((s) => day.slots[s] !== undefined);
      if (slotNames.length) {
        root.appendChild(sectionTitle('Eating'));
        root.appendChild(card(el('div.list', slotNames.map((s) => {
          const slot = day.slots[s];
          const dish = mealName(slot);
          return el('button.slot', {
            class: (dish ? 'filled' : '') + (slot && slot.status === 'ate' ? ' ate' : ''),
            onclick: () => ctx.nav('meals'),
          }, [
            el('span.mode', icon(dish ? (MODE_ICON[slot.mode] || 'pot') : 'plus', 18)),
            el('div.grow', [
              el('div.label', SLOT_LABEL[s]),
              el('div.dish', { class: dish ? '' : 'none' }, dish || 'nothing planned'),
            ]),
            slot && slot.status === 'ate' ? el('span.pill.ok', 'ate it') : null,
          ]);
        })), { class: 'pad0' }));
      } else {
        root.appendChild(sectionTitle('Eating'));
        root.appendChild(card(el('div.row', [
          el('div.grow.dim', 'No meals set for today.'),
          button('Plan', { class: 'small', onclick: () => ctx.nav('meals') }),
        ]), { class: 'flat' }));
      }
    } else {
      root.appendChild(card(el('div.row', [
        el('div.grow', [
          el('div', { style: { fontWeight: '500' } }, 'Not in ' + (ctx.place || 'Valencia') + ' today.'),
          el('div.small.dim', 'Meals and chores are on hold. Projects and the inbox still work.'),
        ]),
        button('I am here', {
          class: 'small',
          onclick: () => { commit(setPresence(weekKey(), today, true)); ctx.rerender(); },
        }),
      ]), { class: 'flat' }));
    }

    // ----------------------------------------------------------- the chores --
    if (here) {
      const due = sortedChores()
        .filter((e) => e.status.dueIn <= 0 && e.chore.lastDone !== today)
        .slice(0, 4);
      const tasks = chores().oneoff.filter((t) => !t.done).slice(0, 3);

      if (due.length) {
        root.appendChild(sectionTitle('Due', due.length > 3
          ? el('span.tiny.dimmer', due.length + ' waiting') : null));
        root.appendChild(card(el('div.list', due.map((e) => el('div.item', {
          onclick: () => ctx.nav('chores'),
        }, [
          el('button.tick.due', {
            'aria-label': 'Mark ' + e.chore.name + ' done',
            onclick: (ev) => { ev.stopPropagation(); markChoreDone(e.chore); ctx.rerender(); },
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
          onclick: () => ctx.nav('chores'),
        }, [
          el('div.grow', el('div.name', t.name)),
          icon('right', 16),
        ]))), { class: 'pad0' }));
      }

      if (!due.length && !tasks.length) {
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

    // -------------------------------------------------------- quick capture --
    root.appendChild(sectionTitle('Note to self', inbox().filter((n) => !n.handled).length
      ? el('span.tiny.dimmer', inbox().filter((n) => !n.handled).length + ' in the inbox')
      : null));
    root.appendChild(card(inboxModule.composer(ctx, {
      rows: 2,
      placeholder: 'Something you thought of. Anything.',
    })));
  },
};
