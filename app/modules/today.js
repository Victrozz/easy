// Today — the tab that makes you open the app at all.
//
// It is presence-aware on purpose. On a Saturday in Benicàssim you should not
// be looking at a list of undone jobs in a flat you are not standing in.

import { el, card, button, icon, toast, sectionTitle, empty } from '../ui.js';
import {
  getWeek, sortedChores, chores, projects, inbox, setPresence, settings,
  SLOTS, SLOT_LABEL, MODE_ICON, mealName, commit, logEvent, CHORES_FILE,
} from '../model.js';
import { ymd, weekKey, relDays, daysAgo, DAY_LONG, dayKeyOf, prettyDate } from '../util.js';
import { hasToken } from '../store.js';
import inboxModule from './inbox.js';
import { tokenSheet } from './settings.js';

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
        el('button.icon-btn', {
          'aria-label': 'Dismiss',
          onclick: () => { dismiss('install'); ctx.rerender(); },
        }, icon('close', 16)),
      ]));
    }

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
          tappable: true,
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
          tappable: true,
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

    // ------------------------------------------------------ weekly session --
    // Only ever nags once a session has actually happened. An app that asks
    // for a ritual you have never done is just noise.
    const lastSession = settings().lastSession;
    const sinceSession = daysAgo(lastSession);
    if (sinceSession !== null && sinceSession >= 7) {
      root.appendChild(el('div.banner.quiet', { style: { marginTop: '16px' } }, [
        icon('dot', 16),
        el('span', 'Last sat down with Claude ' + relDays(lastSession)
          + '. Worth another go when you have twenty minutes.'),
      ]));
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
