// Chores — recurring upkeep plus one-off tasks.
//
// Two kinds live here. A chore with an interval has a due date and sorts by
// how overdue it is. A chore with `everyDays: null` has no schedule at all:
// it is only tracked, so it can never be late, and what it shows instead is
// the rhythm he actually keeps — "usually every 6 days, 4 times this month".
// That is the honest answer to "am I taking the bins out far less than I
// think", and it is a description, not an accusation.
//
// Nothing here is ever red or scolding. A chore not done in a month is just a
// chore that is due.

import {
  el, card, button, icon, sheet, confirmSheet, field, textInput, textArea,
  numberInput, dateInput, chips, toast, sectionTitle, empty,
} from '../ui.js';
import {
  CHORES_FILE, chores, sortedChores, newChore, commit, logEvent,
  choreDone, choreUndo, choreSnapshot, choreRhythm, choreHistory, SOON_DAYS,
} from '../model.js';
import { ymd, relDays, slug } from '../util.js';

// Remembers the previous state so an accidental tap is one tap to undo.
const undo = new Map();

const EVERY_PRESETS = [
  { value: 1, label: 'Daily' },
  { value: 3, label: '3 days' },
  { value: 7, label: 'Weekly' },
  { value: 14, label: 'Fortnightly' },
  { value: 30, label: 'Monthly' },
  { value: null, label: 'No schedule' },
];

function everyLabel(n) {
  if (!n) return 'no schedule';
  const p = EVERY_PRESETS.find((x) => x.value === n);
  return p ? p.label : 'every ' + n + ' days';
}

/**
 * What an unscheduled chore says about itself. No deadline exists, so this is
 * only ever a description: how often he actually does it, and when last.
 * "unknown" is a real answer here — two taps is not a rhythm.
 */
function rhythmText(chore) {
  const r = choreRhythm(chore);
  if (!chore.lastDone) return 'no schedule · not logged yet';
  const bits = [relDays(chore.lastDone)];
  if (r.everyDays) bits.push('usually every ' + Math.round(r.everyDays) + ' days');
  else bits.push('logged once');
  return bits.join(' · ');
}

// ------------------------------------------------------------------ actions --

function restore(chore, ctx) {
  const prev = undo.get(chore.id) || null;
  undo.delete(chore.id);
  commit(choreUndo(chore, prev));
  ctx.rerender();
}

function markDone(chore, ctx) {
  const today = ymd();
  if (chore.lastDone === today) {
    // Second tap on something already ticked today = undo.
    restore(chore, ctx);
    return;
  }
  undo.set(chore.id, choreSnapshot(chore));
  commit(
    choreDone(chore),
    logEvent('chore.done', { chore: chore.id, name: chore.name }),
  );
  toast(chore.name + ' — logged', '', { label: 'Undo', onclick: () => restore(chore, ctx) });
}

function toggleTask(task) {
  const done = !task.done;
  commit(
    {
      file: CHORES_FILE, op: 'patchWhere', path: ['oneoff'],
      key: 'id', match: task.id, value: { done, doneAt: done ? ymd() : null },
      label: (done ? 'done: ' : 'reopen: ') + task.name,
    },
    done ? logEvent('task.done', { task: task.id, name: task.name }) : null,
  );
}

// ------------------------------------------------------------------- sheets --

function editChore(chore, ctx) {
  const isNew = !chore;
  const draft = Object.assign({}, chore || newChore());

  sheet(isNew ? 'New chore' : draft.name, (body, done) => {
    const name = textInput(draft.name, { placeholder: 'Take the bins out' });
    body.appendChild(field('What is it', name));

    const everyWrap = el('div');
    const custom = numberInput(draft.everyDays, { min: 1, max: 365 });
    const customField = field('or every N days', custom);
    const trackHint = el('small.dim', { style: { display: 'block', margin: '-4px 0 12px' } },
      'No due date. You just log it, and the list shows how often you actually do it.');
    const drawEvery = () => {
      everyWrap.replaceChildren(
        chips(EVERY_PRESETS, draft.everyDays || null, (v) => {
          draft.everyDays = v;
          custom.value = v || '';
          drawEvery();
        }),
      );
      // A chore with no schedule has nothing to count days towards.
      customField.hidden = !draft.everyDays;
      trackHint.hidden = !!draft.everyDays;
    };
    drawEvery();
    custom.addEventListener('input', () => {
      const v = parseInt(custom.value, 10);
      if (v > 0) { draft.everyDays = v; drawEvery(); }
    });
    body.appendChild(field('How often', everyWrap));
    body.appendChild(trackHint);
    body.appendChild(customField);

    // So "I changed the sheets on Sunday" is a date, not a lie about today.
    const last = dateInput(draft.lastDone || '', { max: ymd() });
    body.appendChild(field('Last done', last,
      draft.everyDays
        ? 'Leave it empty if never. Sets when it is next due.'
        : 'Leave it empty if never.'));

    const notes = textArea(draft.notes, { placeholder: 'Anything worth remembering' });
    body.appendChild(field('Notes', notes));

    const actions = el('div.sheet-actions', [
      button('Cancel', { class: 'ghost', onclick: () => done() }),
      button(isNew ? 'Add' : 'Save', {
        class: 'primary',
        onclick: () => {
          const n = name.value.trim();
          if (!n) { toast('Give it a name'); return; }
          // Backdating here ("I did it on Sunday") is a real occurrence, so it
          // joins the history the rhythm is read from.
          const lastDone = last.value || null;
          const history = choreHistory({ history: draft.history });
          if (lastDone && !history.includes(lastDone)) history.push(lastDone);
          const value = Object.assign({}, draft, {
            name: n,
            notes: notes.value.trim(),
            lastDone,
            history: history.sort(),
            everyDays: draft.everyDays || null,
            id: isNew ? slug(n) : draft.id,
          });
          if (isNew) {
            commit({
              file: CHORES_FILE, op: 'push', path: ['recurring'],
              value, label: 'add chore: ' + n,
            });
          } else {
            commit({
              file: CHORES_FILE, op: 'patchWhere', path: ['recurring'],
              key: 'id', match: draft.id, value, label: 'edit chore: ' + n,
            });
          }
          done();
          ctx.rerender();
        },
      }),
    ]);
    body.appendChild(actions);

    if (!isNew) {
      body.appendChild(el('div', { style: { marginTop: '10px' } },
        button('Delete this chore', {
          class: 'ghost danger wide',
          onclick: async () => {
            const ok = await confirmSheet(
              'Delete ' + draft.name + '?',
              'It goes out of the list. The history of when you did it stays in the log.',
              'Delete', true,
            );
            if (!ok) return;
            commit({
              file: CHORES_FILE, op: 'removeWhere', path: ['recurring'],
              key: 'id', match: draft.id, label: 'remove chore: ' + draft.name,
            });
            done();
            ctx.rerender();
          },
        })));
    }
  }).then(() => ctx.rerender());
}

function addTask(ctx) {
  sheet('New task', (body, done) => {
    const name = textInput('', { placeholder: 'Renew the NIE appointment' });
    body.appendChild(field('One-off task', name));
    const save = () => {
      const n = name.value.trim();
      if (!n) return;
      commit({
        file: CHORES_FILE, op: 'push', path: ['oneoff'],
        value: { id: slug(n), name: n, added: ymd(), done: false, doneAt: null },
        label: 'add task: ' + n,
      });
      done();
      ctx.rerender();
    };
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    body.appendChild(el('div.sheet-actions', [
      button('Cancel', { class: 'ghost', onclick: () => done() }),
      button('Add', { class: 'primary', onclick: save }),
    ]));
    setTimeout(() => name.focus(), 60);
  }).then(() => ctx.rerender());
}

// -------------------------------------------------------------------- rows --

function choreRow(entry, ctx) {
  const { chore, status } = entry;
  const doneToday = chore.lastDone === ymd();

  const tick = el('button.tick', {
    type: 'button',
    class: (doneToday ? 'done' : '') + (status.dueIn <= 0 && !doneToday ? ' due' : ''),
    'aria-label': doneToday ? 'Undo ' + chore.name : 'Mark ' + chore.name + ' done',
    onclick: (e) => { e.stopPropagation(); markDone(chore, ctx); ctx.rerender(); },
  }, icon('check', 17));

  const tracked = status.state === 'tracked';
  const rhythm = tracked ? choreRhythm(chore) : null;

  let metaText;
  if (doneToday) metaText = tracked ? 'logged today' : 'done today';
  else if (tracked) metaText = rhythmText(chore);
  else if (status.state === 'new') metaText = everyLabel(chore.everyDays) + ' · never done';
  else if (status.dueIn <= 0) metaText = everyLabel(chore.everyDays) + ' · ' + relDays(chore.lastDone);
  else metaText = everyLabel(chore.everyDays) + ' · in ' + status.dueIn + ' day' + (status.dueIn === 1 ? '' : 's');

  // An unscheduled chore cannot be late, so it never gets a due pill. It gets
  // a count instead: the answer to "am I actually doing this".
  let pill = null;
  if (doneToday) pill = el('span.pill.ok', tracked ? 'logged' : 'done');
  else if (tracked) pill = rhythm.last30 ? el('span.pill', rhythm.last30 + '× / 30d') : null;
  else if (status.dueIn <= 0) {
    pill = el('span.pill.due', status.state === 'new' ? 'due'
      : (-status.dueIn === 0 ? 'today' : (-status.dueIn) + 'd over'));
  }

  return el('div.item', { tappable: true, onclick: () => editChore(chore, ctx) }, [
    tick,
    el('div.grow', [
      el('div.name', { class: doneToday ? 'strike' : '' }, chore.name),
      el('div.meta', metaText),
    ]),
    pill,
  ]);
}

function taskRow(task, ctx) {
  return el('div.item', { tappable: true, onclick: () => editTask(task, ctx) }, [
    el('button.tick', {
      type: 'button',
      class: task.done ? 'done' : '',
      'aria-label': task.name,
      onclick: (e) => { e.stopPropagation(); toggleTask(task); ctx.rerender(); },
    }, icon('check', 17)),
    el('div.grow', [
      el('div.name', { class: task.done ? 'strike' : '' }, task.name),
      el('div.meta', task.done ? 'done ' + relDays(task.doneAt) : 'added ' + relDays(task.added)),
    ]),
  ]);
}

function editTask(task, ctx) {
  sheet(task.name, (body, done) => {
    const name = textInput(task.name);
    body.appendChild(field('Task', name));
    body.appendChild(el('div.sheet-actions', [
      button('Cancel', { class: 'ghost', onclick: () => done() }),
      button('Save', {
        class: 'primary',
        onclick: () => {
          const n = name.value.trim();
          if (!n) return;
          commit({
            file: CHORES_FILE, op: 'patchWhere', path: ['oneoff'],
            key: 'id', match: task.id, value: { name: n }, label: 'edit task: ' + n,
          });
          done();
        },
      }),
    ]));
    body.appendChild(el('div', { style: { marginTop: '10px' } },
      button('Delete', {
        class: 'ghost danger wide',
        onclick: () => {
          commit({
            file: CHORES_FILE, op: 'removeWhere', path: ['oneoff'],
            key: 'id', match: task.id, label: 'remove task: ' + task.name,
          });
          done();
        },
      })));
  }).then(() => ctx.rerender());
}

// ------------------------------------------------------------------ render --

export default {
  id: 'chores',
  label: 'Chores',
  icon: 'chores',
  files: [CHORES_FILE],
  title: () => 'Chores',

  render(root, ctx) {
    const all = sortedChores();
    const today = ymd();
    const scheduled = all.filter((e) => e.status.state !== 'tracked');
    // Longest untouched first — that is the thing worth noticing.
    const tracked = all
      .filter((e) => e.status.state === 'tracked')
      .sort((a, b) => (b.status.since === null ? 1e9 : b.status.since)
        - (a.status.since === null ? 1e9 : a.status.since));

    const isDue = (e) => e.status.dueIn <= 0 && e.chore.lastDone !== today;
    const due = scheduled.filter(isDue);
    const soon = scheduled.filter((e) => !isDue(e) && e.status.dueIn > 0 && e.status.dueIn <= SOON_DAYS);
    const rest = scheduled.filter((e) => !isDue(e) && !(e.status.dueIn > 0 && e.status.dueIn <= SOON_DAYS));
    const { oneoff } = chores();
    const openTasks = oneoff.filter((t) => !t.done);
    const doneTasks = oneoff.filter((t) => t.done);

    if (all.length === 0 && oneoff.length === 0) {
      root.appendChild(card(empty(
        'Nothing here yet.',
        'Anything on a cycle — bins, sheets, the bathroom. Or with no schedule at all, just to see how often you do it.',
      )));
      root.appendChild(button([icon('plus', 16), 'Add a chore'], {
        class: 'primary wide', onclick: () => editChore(null, ctx),
      }));
      return;
    }

    if (due.length) {
      root.appendChild(sectionTitle('Due'));
      root.appendChild(card(el('div.list', due.map((e) => choreRow(e, ctx))), { class: 'pad0' }));
    }

    if (soon.length) {
      root.appendChild(sectionTitle('Coming up'));
      root.appendChild(card(el('div.list', soon.map((e) => choreRow(e, ctx))), { class: 'pad0' }));
    }

    if (rest.length) {
      root.appendChild(sectionTitle(due.length || soon.length ? 'Later' : 'Chores'));
      root.appendChild(card(el('div.list', rest.map((e) => choreRow(e, ctx))), { class: 'pad0' }));
    }

    // No schedule, no deadline: a record of what he actually does, so a gap is
    // something he notices himself rather than something the app tells him off
    // about.
    if (tracked.length) {
      root.appendChild(sectionTitle('Just tracking',
        el('span.tiny.dimmer', 'tap to log')));
      root.appendChild(card(el('div.list', tracked.map((e) => choreRow(e, ctx))), { class: 'pad0' }));
    }

    root.appendChild(el('div', { style: { marginTop: '12px' } },
      button([icon('plus', 16), 'Add a chore'], { class: 'wide', onclick: () => editChore(null, ctx) })));

    root.appendChild(sectionTitle('Tasks', button('Add', {
      class: 'small ghost', onclick: () => addTask(ctx),
    })));

    if (openTasks.length === 0 && doneTasks.length === 0) {
      root.appendChild(card(empty('No one-off tasks.', 'Things that happen once, not on a cycle.'), { class: 'flat' }));
    } else {
      if (openTasks.length) {
        root.appendChild(card(el('div.list', openTasks.map((t) => taskRow(t, ctx))), { class: 'pad0' }));
      }
      if (doneTasks.length) {
        root.appendChild(sectionTitle('Done', button('Clear', {
          class: 'small ghost',
          onclick: async () => {
            const ok = await confirmSheet('Clear finished tasks?',
              doneTasks.length + ' finished task' + (doneTasks.length === 1 ? '' : 's') +
              ' will come off the list. They stay in the log.', 'Clear');
            if (!ok) return;
            commit(doneTasks.map((t) => ({
              file: CHORES_FILE, op: 'removeWhere', path: ['oneoff'],
              key: 'id', match: t.id, label: 'clear done tasks',
            })));
            ctx.rerender();
          },
        })));
        root.appendChild(card(el('div.list', doneTasks.map((t) => taskRow(t, ctx))), { class: 'pad0' }));
      }
    }
  },
};
