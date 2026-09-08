// Projects — the things you actually want to work on.
//
// The useful column is not "progress", it is "when did you last touch this".
// A project you have not opened in three weeks is either dead or stuck, and
// either way that is worth seeing.

import {
  el, card, button, icon, sheet, confirmSheet, field, textInput, textArea,
  chips, toast, sectionTitle, empty,
} from '../ui.js';
import { PROJECTS_FILE, projects, newProject, commit, logEvent } from '../model.js';
import { ymd, relDays, daysAgo, slug, sortBy } from '../util.js';

const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'done', label: 'Done' },
];

function touch(p) {
  commit(
    {
      file: PROJECTS_FILE, op: 'patchWhere', path: ['items'],
      key: 'id', match: p.id, value: { lastTouched: ymd() },
      label: 'touched: ' + p.name,
    },
    logEvent('project.touched', { project: p.id, name: p.name }),
  );
  toast('Nice — ' + p.name);
}

function editProject(p, ctx) {
  const isNew = !p;
  const draft = Object.assign({}, p || newProject());

  sheet(isNew ? 'New project' : draft.name, (body, done) => {
    const name = textInput(draft.name, { placeholder: 'Bots vs Bugs' });
    body.appendChild(field('Project', name));

    const next = textInput(draft.nextStep, { placeholder: 'Make the crafter charge copper' });
    body.appendChild(field('Next step', next,
      'One concrete thing. Not the goal — the next move.'));

    const why = textArea(draft.why, { placeholder: 'Why this matters to you' });
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
            id: isNew ? slug(n) : draft.id,
            lastTouched: isNew ? ymd() : draft.lastTouched,
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
        button('I worked on this today', {
          class: 'wide',
          onclick: () => { touch(draft); done(); ctx.rerender(); },
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

  return el('div.item.top', { onclick: () => editProject(p, ctx) }, [
    el('div.grow', [
      el('div.name', p.name),
      p.nextStep
        ? el('div.meta', [icon('right', 12), ' ' + p.nextStep])
        : el('div.meta.dimmer', 'no next step set'),
      el('div.meta', p.lastTouched ? 'touched ' + relDays(p.lastTouched) : 'not started'),
    ]),
    cold ? el('span.pill.due', 'cold') : null,
    el('button.icon-btn', {
      'aria-label': 'Worked on ' + p.name + ' today',
      onclick: (e) => { e.stopPropagation(); touch(p); ctx.rerender(); },
    }, icon('check', 19)),
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
      root.appendChild(button('Add a project', {
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
      button('Add a project', { class: 'wide', onclick: () => editProject(null, ctx) })));
  },
};
