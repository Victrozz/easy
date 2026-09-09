// Chores — recurring upkeep plus one-off tasks.
//
// Sorted by how overdue they are. Nothing is ever red or scolding: a chore
// that has not been done in a month is just a chore that is due.

import {
  el, card, button, icon, sheet, confirmSheet, field, textInput, textArea,
  numberInput, dateInput, chips, toast, sectionTitle, empty,
} from '../ui.js';
import {
  CHORES_FILE, chores, sortedChores, newChore, commit, logEvent,
} from '../model.js';
import { ymd, relDays, slug } from '../util.js';

// Remembers the previous date so an accidental tap is one tap to undo.
const undo = new Map();

const EVERY_PRESETS = [
  { value: 1, label: 'Daily' },
  { value: 2, label: '2 days' },
  { value: 3, label: '3 days' },
  { value: 7, label: 'Weekly' },
  { value: 14, label: '2 weeks' },
  { value: 30, label: 'Monthly' },
];

function everyLabel(n) {
  const p = EVERY_PRESETS.find((x) => x.value === n);
  return p ? p.label : 'every ' + n + ' days';
}

// ------------------------------------------------------------------ actions --

function setLastDone(chore, value, label) {
  return {
    file: CHORES_FILE, op: 'patchWhere', path: ['recurring'],
    key: 'id', match: chore.id, value: { lastDone: value },
    label: label + chore.name,
  };
}

function restore(chore, ctx) {
  const prev = undo.has(chore.id) ? undo.get(chore.id) : null;
  undo.delete(chore.id);
  commit(setLastDone(chore, prev, 'undo: '));
  ctx.rerender();
}

function markDone(chore, ctx) {
  const today = ymd();
  if (chore.lastDone === today) {
    // Second tap on something already ticked today = undo.
    restore(chore, ctx);
    return;
  }
  undo.set(chore.id, chore.lastDone || null);
  commit(
    setLastDone(chore, today, 'done: '),
    logEvent('chore.done', { chore: chore.id, name: chore.name }),
  );
  toast(chore.name + ' — done', '', { label: 'Undo', onclick: () => restore(chore, ctx) });
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
    const drawEvery = () => {
      everyWrap.replaceChildren(
        chips(EVERY_PRESETS, draft.everyDays, (v) => {
          draft.everyDays = v;
          custom.value = v;
          drawEvery();
        }),
      );
    };
    drawEvery();
    custom.addEventListener('input', () => {
      const v = parseInt(custom.value, 10);
      if (v > 0) { draft.everyDays = v; drawEvery(); }
    });
    body.appendChild(field('How often', everyWrap));
    body.appendChild(field('or every N days', custom));

    // So "I changed the sheets on Sunday" is a date, not a lie about today.
    const last = dateInput(draft.lastDone || '', { max: ymd() });
    body.appendChild(field('Last done', last, 'Leave it empty if never. Sets when it is next due.'));

    const notes = textArea(draft.notes, { placeholder: 'Anything worth remembering' });
    body.appendChild(field('Notes', notes));

    const actions = el('div.sheet-actions', [
      button('Cancel', { class: 'ghost', onclick: () => done() }),
      button(isNew ? 'Add' : 'Save', {
        class: 'primary',
        onclick: () => {
          const n = name.value.trim();
          if (!n) { toast('Give it a name'); return; }
          const value = Object.assign({}, draft, {
            name: n,
            notes: notes.value.trim(),
            lastDone: last.value || null,
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

  let metaText;
  if (doneToday) metaText = 'done today';
  else if (status.state === 'new') metaText = everyLabel(chore.everyDays) + ' · never done';
  else if (status.dueIn <= 0) metaText = everyLabel(chore.everyDays) + ' · ' + relDays(chore.lastDone);
  else metaText = everyLabel(chore.everyDays) + ' · in ' + status.dueIn + ' day' + (status.dueIn === 1 ? '' : 's');

  const pill = doneToday
    ? el('span.pill.ok', 'done')
    : status.dueIn <= 0
      ? el('span.pill.due', status.state === 'new' ? 'due' : (-status.dueIn === 0 ? 'today' : (-status.dueIn) + 'd over'))
      : null;

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
    const due = all.filter((e) => e.status.dueIn <= 0 && e.chore.lastDone !== ymd());
    const rest = all.filter((e) => !(e.status.dueIn <= 0 && e.chore.lastDone !== ymd()));
    const { oneoff } = chores();
    const openTasks = oneoff.filter((t) => !t.done);
    const doneTasks = oneoff.filter((t) => t.done);

    if (all.length === 0 && oneoff.length === 0) {
      root.appendChild(card(empty(
        'Nothing here yet.',
        'Add the things you keep forgetting — bins, sheets, the bathroom.',
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

    if (rest.length) {
      root.appendChild(sectionTitle(due.length ? 'Later' : 'Chores'));
      root.appendChild(card(el('div.list', rest.map((e) => choreRow(e, ctx))), { class: 'pad0' }));
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
