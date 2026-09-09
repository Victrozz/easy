// Projects — the things you actually want to work on.
//
// The useful column is not "progress", it is "when did you last touch this".
// A project you have not opened in three weeks is either dead or stuck, and
// either way that is worth seeing.

import {
  el, card, button, icon, iconBtn, sheet, confirmSheet, field, textInput, textArea,
  dateInput, chips, toast, sectionTitle, empty,
} from '../ui.js';
import { PROJECTS_FILE, projects, newProject, commit, logEvent } from '../model.js';
import { ymd, relDays, daysAgo, slug, sortBy } from '../util.js';

const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'done', label: 'Done' },
];

function patch(p, value, label) {
  return {
    file: PROJECTS_FILE, op: 'patchWhere', path: ['items'],
    key: 'id', match: p.id, value, label: label + p.name,
  };
}

function touch(p, ctx) {
  const prev = p.lastTouched || null;
  commit(
    patch(p, { lastTouched: ymd() }, 'touched: '),
    logEvent('project.touched', { project: p.id, name: p.name }),
  );
  toast('Nice — ' + p.name, '', {
    label: 'Undo',
    onclick: () => { commit(patch(p, { lastTouched: prev }, 'untouch: ')); ctx.rerender(); },
  });
}

function editProject(p, ctx) {
  const isNew = !p;
  const draft = Object.assign({}, newProject(), p || {});

  sheet(isNew ? 'New project' : draft.name, (body, done) => {
    const name = textInput(draft.name, { placeholder: 'Bots vs Bugs' });
    body.appendChild(field('Project', name));

    const next = textInput(draft.nextStep, { placeholder: 'Make the crafter charge copper' });
    body.appendChild(field('Next step', next,
      'One concrete thing. Not the goal — the next move.'));

    const why = textArea(draft.why, { placeholder: 'Why this matters to you', rows: 2 });
    body.appendChild(field('Why', why));

    const statusWrap = el('div');
    const drawStatus = () => {
      statusWrap.replaceChildren(chips(STATUSES, draft.status, (v) => {
        draft.status = v;
        drawStatus();
      }));
    };
    drawStatus();
    body.appendChild(field('Status', statusWrap));

    const last = dateInput(draft.lastTouched || '', { max: ymd() });
    body.appendChild(field('Last touched', last, 'When you last actually worked on it.'));

    const notes = textArea(draft.notes, { placeholder: 'Where things stand, what is blocking, links' });
    body.appendChild(field('Notes', notes));

    body.appendChild(el('div.sheet-actions', [
      button('Cancel', { class: 'ghost', onclick: () => done() }),
      button(isNew ? 'Add' : 'Save', {
        class: 'primary',
        onclick: () => {
          const n = name.value.trim();
          if (!n) { toast('Give it a name'); return; }
          const value = Object.assign({}, draft, {
            name: n,
            nextStep: next.value.trim(),
            why: why.value.trim(),
            notes: notes.value.trim(),
            id: isNew ? slug(n) : draft.id,
            lastTouched: last.value || (isNew ? ymd() : null),
          });
          commit(isNew
            ? { file: PROJECTS_FILE, op: 'push', path: ['items'], value, label: 'add project: ' + n }
            : {
              file: PROJECTS_FILE, op: 'patchWhere', path: ['items'],
              key: 'id', match: draft.id, value, label: 'edit project: ' + n,
            });
          done();
          ctx.rerender();
        },
      }),
    ]));

    if (!isNew) {
      body.appendChild(el('div', { style: { marginTop: '10px' } }, [
        button([icon('spark', 16), 'I worked on this today'], {
          class: 'wide',
          onclick: () => { touch(draft, ctx); done(); ctx.rerender(); },
        }),
        el('div.spacer'),
        button('Delete', {
          class: 'ghost danger wide',
          onclick: async () => {
            const ok = await confirmSheet('Delete ' + draft.name + '?',
              'It comes off the list for good.', 'Delete', true);
            if (!ok) return;
            commit({
              file: PROJECTS_FILE, op: 'removeWhere', path: ['items'],
              key: 'id', match: draft.id, label: 'remove project: ' + draft.name,
            });
            done();
            ctx.rerender();
          },
        }),
      ]));
    }
  }).then(() => ctx.rerender());
}

function projectRow(p, ctx) {
  const since = daysAgo(p.lastTouched);
  const cold = since !== null && since >= 14 && p.status === 'active';
  const today = p.lastTouched === ymd();

  return el('div.item.align-top', { tappable: true, onclick: () => editProject(p, ctx) }, [
    el('div.grow', [
      el('div.name', p.name),
      p.nextStep
        ? el('div.meta', [icon('right', 12), ' ' + p.nextStep])
        : el('div.meta.dimmer', 'no next step set'),
      el('div.meta', p.lastTouched ? 'touched ' + relDays(p.lastTouched) : 'not started'),
    ]),
    cold ? el('span.pill.due', 'cold') : null,
    p.status === 'active'
      ? iconBtn('spark', {
        class: today ? 'on' : '',
        'aria-label': today ? 'Worked on ' + p.name + ' today' : 'I worked on ' + p.name + ' today',
        onclick: (e) => { e.stopPropagation(); if (!today) touch(p, ctx); ctx.rerender(); },
      }, 20)
      : null,
  ]);
}

export default {
  id: 'projects',
  label: 'Projects',
  icon: 'projects',
  files: [PROJECTS_FILE],
  title: () => 'Projects',

  render(root, ctx) {
    const all = projects();
    const active = sortBy(all.filter((p) => p.status === 'active'),
      (p) => p.lastTouched || '0000');
    const paused = all.filter((p) => p.status === 'paused');
    const finished = all.filter((p) => p.status === 'done');

    if (all.length === 0) {
      root.appendChild(card(empty(
        'Nothing on the go.',
        'The things you keep meaning to get back to.',
      )));
      root.appendChild(button([icon('plus', 16), 'Add a project'], {
        class: 'primary wide', onclick: () => editProject(null, ctx),
      }));
      return;
    }

    if (active.length) {
      root.appendChild(sectionTitle('Active'));
      root.appendChild(card(el('div.list', active.map((p) => projectRow(p, ctx))), { class: 'pad0' }));
    }

    if (paused.length) {
      root.appendChild(sectionTitle('Paused'));
      root.appendChild(card(el('div.list', paused.map((p) => projectRow(p, ctx))), { class: 'pad0' }));
    }

    if (finished.length) {
      root.appendChild(sectionTitle('Done'));
      root.appendChild(card(el('div.list', finished.map((p) => projectRow(p, ctx))), { class: 'pad0' }));
    }

    root.appendChild(el('div', { style: { marginTop: '12px' } },
      button([icon('plus', 16), 'Add a project'], { class: 'wide', onclick: () => editProject(null, ctx) })));
  },
};
