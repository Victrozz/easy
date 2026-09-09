// Inbox — the thing you thought of while walking.
//
// Deliberately shapeless. Type it, it is saved, it is gone from your head.
// This is the best fuel for the weekly session, because it is the stuff you
// would never think to say out loud when asked "so what's new".

import {
  el, card, button, icon, sheet, confirmSheet, promptSheet, toast, sectionTitle, empty,
} from '../ui.js';
import { INBOX_FILE, inbox, addInbox, commit, logEvent } from '../model.js';
import { prettyDate, prettyTime, ymd } from '../util.js';

// Survives a re-render so you never lose half a thought.
let draft = '';

function send(ctx) {
  const text = draft.trim();
  if (!text) return;
  commit(addInbox(text), logEvent('inbox.add', { text: text.slice(0, 120) }));
  draft = '';
  toast('Saved');
  ctx.rerender();
}

function patchNote(note, value, label) {
  return {
    file: INBOX_FILE, op: 'patchWhere', path: [],
    key: 'id', match: note.id, value, label,
  };
}

function openNote(note, ctx) {
  sheet(prettyDate(note.date || ymd()), (body, done) => {
    body.appendChild(el('p.sheet-text', { style: { color: 'var(--ink)' } }, note.text));
    body.appendChild(el('div.sheet-actions', [
      button([icon('edit', 15), 'Edit'], {
        class: 'ghost',
        onclick: async () => {
          done();
          const text = await promptSheet('Edit note', {
            value: note.text, multiline: true, rows: 4,
          });
          if (text === undefined || text === note.text) return;
          commit(patchNote(note, { text }, 'inbox: edit'));
          ctx.rerender();
        },
      }),
      button(note.handled ? 'Mark unhandled' : 'Mark handled', {
        class: note.handled ? 'ghost' : 'primary',
        onclick: () => {
          commit(patchNote(note, { handled: !note.handled }, 'inbox: handled'));
          done();
        },
      }),
    ]));
    body.appendChild(el('div', { style: { marginTop: '10px' } },
      button('Delete', {
        class: 'ghost danger wide',
        onclick: async () => {
          const ok = await confirmSheet('Delete this note?', note.text, 'Delete', true);
          if (!ok) return;
          commit({
            file: INBOX_FILE, op: 'removeWhere', path: [],
            key: 'id', match: note.id, label: 'inbox: delete',
          });
          done();
        },
      })));
  }, { noAutoFocus: true }).then(() => ctx.rerender());
}

function composer(ctx, opts) {
  const o = opts || {};
  const input = el('textarea.input', {
    rows: o.rows || 3,
    placeholder: o.placeholder || 'Anything. It just gets written down.',
    'data-focus-key': 'inbox-composer',
    oninput: (e) => { draft = e.target.value; },
    onkeydown: (e) => {
      // Cmd/Ctrl+Enter sends, so a laptop never needs the mouse.
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(ctx); }
    },
  });
  input.value = draft;

  return el('div.composer', [
    input,
    el('div.row', [
      el('span.tiny.dimmer.grow', draft.trim() ? 'Ctrl+Enter to save' : ''),
      button([icon('send', 15), 'Save'], { class: 'primary', onclick: () => send(ctx) }),
    ]),
  ]);
}

function noteRow(note, ctx) {
  return el('div.item.align-top', { tappable: true, onclick: () => openNote(note, ctx) }, [
    el('div.grow', [
      el('div.name', { class: note.handled ? 'strike' : '' }, note.text),
      el('div.meta', prettyDate(note.date || ymd()) + ' · ' + prettyTime(note.ts)),
    ]),
    note.handled ? el('span.pill.ok', 'handled') : null,
  ]);
}

export default {
  id: 'inbox',
  label: 'Inbox',
  icon: 'inbox',
  files: [INBOX_FILE],
  title: () => 'Inbox',
  composer, // reused by the Today tab

  badge() {
    return inbox().filter((n) => !n.handled).length;
  },

  render(root, ctx) {
    root.appendChild(card(composer(ctx)));

    const notes = inbox().slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const open = notes.filter((n) => !n.handled);
    const handled = notes.filter((n) => n.handled);

    if (notes.length === 0) {
      root.appendChild(card(empty(
        'Empty.',
        'Half-thoughts, things to buy, things to ask Claude about. It reads all of them.',
      ), { class: 'flat' }));
      return;
    }

    if (open.length) {
      root.appendChild(sectionTitle('Open'));
      root.appendChild(card(el('div.list', open.map((n) => noteRow(n, ctx))), { class: 'pad0' }));
    }

    if (handled.length) {
      root.appendChild(sectionTitle('Handled', button('Clear', {
        class: 'small ghost',
        onclick: async () => {
          const ok = await confirmSheet('Clear handled notes?',
            handled.length + ' note' + (handled.length === 1 ? '' : 's') +
            ' will be removed. The log keeps a copy.', 'Clear');
          if (!ok) return;
          commit(handled.map((n) => ({
            file: INBOX_FILE, op: 'removeWhere', path: [],
            key: 'id', match: n.id, label: 'inbox: clear handled',
          })));
          ctx.rerender();
        },
      })));
      root.appendChild(card(el('div.list', handled.map((n) => noteRow(n, ctx))), { class: 'pad0' }));
    }
  },
};
