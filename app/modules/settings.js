// Settings — the token, the default week, and the honest sync status.
//
// Reached from the gear in the header rather than the tab bar. You should
// need it twice: once to paste a token, once a year when it expires.

import {
  el, card, button, icon, field, chips, toast,
  sectionTitle, confirmSheet, sheet, multiChips,
} from '../ui.js';
import { CONFIG } from '../config.js';
import {
  store, getToken, setToken, hasToken, flush, refresh, pendingCount, discardOutbox,
} from '../store.js';
import {
  SETTINGS_FILE, SLOTS, SLOT_LABEL, settings, setDayDefault, commit, logEvent,
} from '../model.js';
import { DAY_KEYS, DAY_LONG, prettyTime } from '../util.js';

const THEME_KEY = 'easy.theme';

export function applyTheme(theme) {
  const t = theme || localStorage.getItem(THEME_KEY) || 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  return t;
}

function statusLine() {
  const s = store.status;
  const pending = pendingCount();
  if (s === 'error') return { dot: 'error', text: store.error || 'Something went wrong' };
  if (s === 'offline') return { dot: 'offline', text: 'Offline — ' + pending + ' change' + (pending === 1 ? '' : 's') + ' waiting' };
  if (s === 'readonly') return { dot: 'readonly', text: 'Read-only — no token on this device' };
  if (s === 'syncing') return { dot: 'syncing', text: 'Saving…' };
  if (pending) return { dot: 'syncing', text: pending + ' change' + (pending === 1 ? '' : 's') + ' waiting' };
  return {
    dot: '',
    text: store.lastSync ? 'Saved at ' + prettyTime(store.lastSync) : 'Up to date',
  };
}

function dayEditor(dk, ctx) {
  const cfg = settings().week[dk];
  return el('div.card.flat.tight', { style: { marginBottom: '8px' } }, [
    el('div.row', [
      el('div.grow', [
        el('div', { style: { fontWeight: '500' } }, DAY_LONG[dk]),
        el('div.tiny.dimmer', cfg.here
          ? (cfg.slots.length ? cfg.slots.map((s) => SLOT_LABEL[s]).join(' + ') : 'here, no meals set')
          : 'away'),
      ]),
      el('button.toggle', {
        style: { width: 'auto' },
        class: cfg.here ? 'on' : '',
        'aria-label': DAY_LONG[dk] + ' default',
        onclick: () => {
          commit(setDayDefault(dk, {
            here: !cfg.here,
            slots: !cfg.here && cfg.slots.length === 0 ? ['lunch', 'dinner'] : cfg.slots,
          }));
          ctx.rerender();
        },
      }, el('span.toggle-track', el('span.toggle-knob'))),
    ]),
    cfg.here
      ? el('div', { style: { marginTop: '8px' } }, multiChips(
        SLOTS.map((s) => ({ value: s, label: SLOT_LABEL[s] })),
        cfg.slots,
        (next) => { commit(setDayDefault(dk, { slots: next })); ctx.rerender(); },
      ))
      : null,
  ]);
}

export function tokenSheet(ctx) {
  sheet('Connect this device', (body, done) => {
    body.appendChild(el('p.sheet-text',
      'Easy. writes straight to your repo, so it needs a token. Two settings '
      + 'matter and the rest can stay as they are.'));

    body.appendChild(el('ol.steps', [
      el('li', [
        'Open ',
        el('a', {
          href: 'https://github.com/settings/personal-access-tokens/new',
          target: '_blank',
          rel: 'noopener',
        }, 'the token page'),
        '.',
      ]),
      el('li', [
        'Repository access → ', el('b', 'Only select repositories'),
        ' → pick ', el('code', CONFIG.repo), '.',
      ]),
      el('li', [
        'Repository permissions → ', el('b', 'Contents'), ' → ',
        el('b', 'Read and write'), '. Nothing else.',
      ]),
      el('li', 'Generate it, copy it, paste it below. GitHub shows it once.'),
    ]));

    const input = el('input.input', {
      type: 'password',
      value: getToken(),
      placeholder: 'github_pat_…',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
    });
    body.appendChild(field('Token', input));

    let visible = false;
    body.appendChild(button('Show', {
      class: 'small ghost',
      onclick: (e) => {
        visible = !visible;
        input.type = visible ? 'text' : 'password';
        e.target.textContent = visible ? 'Hide' : 'Show';
      },
    }));

    body.appendChild(el('p.small.dim', { style: { marginTop: '14px' } },
      'Stored only on this device, never written into the repo. If you ever '
      + 'clear your browser data you will just paste it again.'));

    body.appendChild(el('div.sheet-actions', [
      button('Cancel', { class: 'ghost', onclick: () => done() }),
      button('Save', {
        class: 'primary',
        onclick: async () => {
          setToken(input.value);
          done();
          if (!input.value.trim()) { ctx.rerender(); return; }

          toast('Checking…');
          await refresh(Object.keys(store.data));
          if (store.status === 'error') { toast(store.error, 'bad'); ctx.rerender(); return; }

          // Reading proves nothing about writing: a token granted only
          // Contents-read sails through the check above and then fails on
          // your first tap, hours later, with no obvious cause. So actually
          // write something — a real log line, not a throwaway probe.
          commit(logEvent('device.connected', {
            agent: (navigator.userAgent || '').slice(0, 90),
          }));
          await flush();
          if (store.status === 'error') {
            toast(store.error + ' — reading works, writing does not', 'bad');
          } else {
            toast('Connected. This device can save.');
          }
          ctx.rerender();
        },
      }),
    ]));
  }).then(() => ctx.rerender());
}

export default {
  id: 'settings',
  label: 'Settings',
  icon: 'settings',
  hidden: true,
  files: [SETTINGS_FILE],
  title: () => 'Settings',

  render(root, ctx) {
    // ------------------------------------------------------------- syncing --
    const st = statusLine();
    root.appendChild(sectionTitle('Syncing'));
    root.appendChild(card([
      el('div.row', [
        el('span.status-dot', { class: st.dot }),
        el('div.grow', [
          el('div', st.text),
          el('div.tiny.dimmer', CONFIG.owner + '/' + CONFIG.repo),
        ]),
        button('Sync now', {
          class: 'small',
          onclick: async () => {
            await flush();
            await refresh(Object.keys(store.data));
            toast(store.status === 'error' ? store.error : 'Up to date',
              store.status === 'error' ? 'bad' : '');
            ctx.rerender();
          },
        }),
      ]),
      store.status === 'error'
        ? el('div.banner.warn', { style: { marginTop: '10px' } }, [
          icon('dot', 16), el('span', store.error),
        ])
        : null,
    ]));

    root.appendChild(el('div', { style: { marginTop: '10px' } },
      button(hasToken() ? 'Change token' : 'Add your token', {
        class: hasToken() ? 'wide' : 'primary wide',
        onclick: () => tokenSheet(ctx),
      })));

    if (!hasToken()) {
      root.appendChild(el('div.banner', { style: { marginTop: '10px' } }, [
        icon('dot', 16),
        el('span', 'Without a token you can look but not save.'),
      ]));
    }

    // -------------------------------------------------------- default week --
    root.appendChild(sectionTitle('Your usual week'));
    root.appendChild(el('p.small.dim',
      'What a fresh week starts as. Any single week can still be changed day by day.'));
    for (const dk of DAY_KEYS) root.appendChild(dayEditor(dk, ctx));

    // ---------------------------------------------------------- appearance --
    root.appendChild(sectionTitle('Look'));
    const current = localStorage.getItem(THEME_KEY) || 'auto';
    root.appendChild(chips([
      { value: 'auto', label: 'Match phone' },
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
    ], current, (v) => {
      try { localStorage.setItem(THEME_KEY, v); } catch { /* ignore */ }
      applyTheme(v);
      ctx.rerender();
    }));

    // --------------------------------------------------------------- about --
    root.appendChild(sectionTitle('About'));
    root.appendChild(card([
      el('div.row', [
        el('div.grow', [
          el('div', 'Easy.'),
          el('div.tiny.dimmer', 'Your data lives in the repo, not in this app.'),
        ]),
        el('a.btn.small', {
          href: 'https://github.com/' + CONFIG.owner + '/' + CONFIG.repo,
          target: '_blank',
          rel: 'noopener',
        }, 'Repo'),
      ]),
    ], { class: 'flat' }));

    // ------------------------------------------------------------- recovery --
    if (pendingCount() > 0) {
      root.appendChild(sectionTitle('Stuck changes'));
      root.appendChild(card([
        el('p.small.dim', pendingCount() + ' change'
          + (pendingCount() === 1 ? ' has' : 's have') + ' not reached GitHub yet. '
          + 'They retry on their own. Only throw them away if they are stuck for good.'),
        button('Throw them away', {
          class: 'ghost danger wide',
          onclick: async () => {
            const ok = await confirmSheet('Discard ' + pendingCount() + ' unsaved change'
              + (pendingCount() === 1 ? '' : 's') + '?',
            'This cannot be undone, and those changes will never reach GitHub.',
            'Discard', true);
            if (!ok) return;
            discardOutbox();
            toast('Discarded');
            ctx.rerender();
          },
        }),
      ], { class: 'flat' }));
    }
  },
};
