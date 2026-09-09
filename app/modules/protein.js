// Protein — a view inside Meals, not a tab of its own.
//
// Three numbers per day: what the plan adds up to, what you have actually
// logged, and the target. The ring fills with what you logged; the plan sits
// underneath it in a quieter tone. Nothing turns red at midnight. A ring that
// is not full is either a day that is not over, or a meal with no number on
// it yet — and putting numbers on meals is Claude's job.

import {
  el, card, button, icon, iconBtn, ring, sheet, chips, stepper, textInput,
  field, toast, sectionTitle, empty,
} from '../ui.js';
import {
  getWeek, dayProtein, proteinTarget, setProteinTarget, proteinPresets,
  addExtra, removeExtra, mealsWithoutProtein, meals, commit, SLOT_LABEL, MODE_ICON,
} from '../model.js';
import { ymd, weekDates, dayKeyOf, DAY_SHORT, DAY_LONG, parseYmd } from '../util.js';

let focus = null; // the day whose breakdown is open

// ------------------------------------------------------------------- rings --

/** The ring for one day. Fills with what was logged; the plan shows under it. */
export function dayRing(week, date, size, opts) {
  const o = opts || {};
  const p = dayProtein(week, date);
  const target = proteinTarget();
  const centre = o.centre !== undefined ? o.centre : [
    el('span.big', p.logged + 'g'),
    el('span.sub', target ? 'of ' + target : 'logged'),
  ];
  return ring({
    size,
    class: o.class,
    value: target ? p.logged / target : (p.logged > 0 ? 1 : 0),
    planned: target ? p.planned / target : null,
    center: centre,
  });
}

// ------------------------------------------------------------------ sheets --

export function targetSheet(ctx) {
  let value = proteinTarget();
  sheet('Daily protein target', (body, done) => {
    body.appendChild(el('p.sheet-text',
      'A number to fill the ring towards. Leave it unset and the ring just '
      + 'shows what you logged.'));

    const stepWrap = el('div', { style: { display: 'flex', justifyContent: 'center', margin: '6px 0 14px' } });
    const draw = () => {
      stepWrap.replaceChildren(stepper(value, {
        min: 20, max: 300, step: 5, start: 100, suffix: ' g', nullable: true, nullLabel: 'none',
      }, (v) => { value = v; }));
    };
    draw();
    body.appendChild(stepWrap);

    body.appendChild(chips(
      [80, 100, 120, 140, 160].map((g) => ({ value: g, label: g + ' g' })),
      value,
      (v) => { value = v; draw(); },
    ));

    body.appendChild(el('div.sheet-actions', [
      button('Cancel', { class: 'ghost', onclick: () => done() }),
      button('Save', {
        class: 'primary',
        onclick: () => {
          commit(setProteinTarget(value));
          toast(value ? 'Target ' + value + ' g a day' : 'No target');
          done();
        },
      }),
    ]));
  }, { noAutoFocus: true }).then(() => ctx.rerender());
}

/** Log something eaten outside the plan — a shake, a yogurt, a bocadillo. */
export function addExtraSheet(ctx, key, date) {
  let name = '';
  let grams = 20;

  sheet('Add something', (body, done) => {
    body.appendChild(el('p.sheet-text',
      'Something you ate that was not in the plan. It counts today.'));

    const input = textInput('', { placeholder: 'Yogurt, a shake, a bocadillo…' });
    input.addEventListener('input', () => { name = input.value; });

    const gramsWrap = el('div');
    const drawGrams = () => {
      gramsWrap.replaceChildren(stepper(grams, { min: 0, max: 200, step: 5, suffix: ' g' }, (v) => { grams = v; }));
    };
    drawGrams();

    const chipWrap = el('div');
    const drawChips = () => {
      chipWrap.replaceChildren(chips(
        proteinPresets().map((p) => ({ value: p.name, label: p.name + ' · ' + p.proteinG + 'g' })),
        name,
        (v) => {
          const p = proteinPresets().find((x) => x.name === v);
          name = v;
          input.value = v;
          if (p) { grams = p.proteinG; drawGrams(); }
          drawChips();
        },
      ));
    };
    drawChips();
    body.appendChild(chipWrap);
    body.appendChild(el('div.spacer'));
    body.appendChild(field('What', input));
    body.appendChild(el('div.row', [el('span.field-label', { style: { margin: 0 } }, 'Protein'), el('div.grow'), gramsWrap]));

    body.appendChild(el('div.sheet-actions', [
      button('Cancel', { class: 'ghost', onclick: () => done() }),
      button('Log it', {
        class: 'primary',
        onclick: () => {
          const n = (name || '').trim() || 'Something';
          const muts = addExtra(key, date, n, grams);
          commit(muts);
          const id = muts[0].value.id;
          toast(n + ' · ' + grams + ' g', '', {
            label: 'Undo',
            onclick: () => { commit(removeExtra(key, date, id)); ctx.rerender(); },
          });
          done();
        },
      }),
    ]));
    setTimeout(() => input.focus(), 60);
  }).then(() => ctx.rerender());
}

// -------------------------------------------------------------------- view --

function pickFocus(week, dates) {
  const today = ymd();
  if (focus && dates.includes(focus)) return focus;
  if (dates.includes(today)) return today;
  return dates.find((d) => week.days[d].here) || dates[0];
}

/**
 * opts.key        the week being shown
 * opts.openSlot   (date, slotName) -> opens the slot sheet
 * opts.openMeal   (meal) -> opens the meal editor
 */
export function renderProtein(root, ctx, opts) {
  const key = opts.key;
  const week = getWeek(key);
  const dates = weekDates(key);
  const date = pickFocus(week, dates);
  const day = week.days[date];
  const p = dayProtein(week, date);
  const target = proteinTarget();
  const isToday = date === ymd();

  // ----------------------------------------------------------------- hero --
  const label = isToday ? 'Today' : DAY_LONG[dayKeyOf(date)] + ' ' + parseYmd(date).getDate();

  root.appendChild(card([
    el('div.pro-hero', [
      dayRing(week, date, 104, { class: 'lg' }),
      el('div.pro-stats', [
        el('div.tiny.dimmer', { style: { letterSpacing: '.06em', textTransform: 'uppercase' } }, label),
        el('div.pro-stat', [el('b.num', p.logged + ' g'), el('span', 'logged')]),
        el('div.pro-stat', [el('b.num', p.planned + ' g'), el('span', 'in the plan')]),
        el('div.pro-stat', [
          el('b.num', target ? target + ' g' : '—'),
          el('span', target ? 'target' : 'no target'),
        ]),
      ]),
    ]),
    el('div.row', { style: { marginTop: '16px', gap: '8px' } }, [
      button([icon('plus', 16), 'Add something'], {
        class: 'primary grow',
        onclick: () => addExtraSheet(ctx, key, date),
      }),
      button('Target', { class: 'grow', onclick: () => targetSheet(ctx) }),
    ]),
  ]));

  // ------------------------------------------------------------ the week --
  root.appendChild(el('div.mini-rings', dates.map((d) => {
    const dd = week.days[d];
    return el('button.ring-btn', {
      type: 'button',
      class: [d === ymd() ? 'today' : '', dd.here ? '' : 'away', d === date ? 'sel' : ''].join(' ').trim(),
      'aria-label': DAY_LONG[dayKeyOf(d)] + (dd.here ? '' : ', away'),
      onclick: () => { focus = d; ctx.rerender(); },
    }, [
      el('span.d', DAY_SHORT[dayKeyOf(d)]),
      dd.here
        ? dayRing(week, d, 40, { centre: null })
        : el('span.wave-slot', icon('wave', 16)),
    ]);
  })));

  // ------------------------------------------------------------ breakdown --
  if (!day.here) {
    root.appendChild(card(el('div.row', [
      icon('wave', 20),
      el('div.grow', [
        el('div', { style: { fontWeight: '500' } }, 'Away ' + (isToday ? 'today' : 'that day') + '.'),
        el('div.small.dim', 'Meals are on hold. Anything you add here still counts.'),
      ]),
    ]), { class: 'flat' }));
  } else {
    root.appendChild(sectionTitle(label));
    const rows = [];

    for (const s of p.slots) {
      rows.push(el('button.slot', {
        class: (s.g !== null ? 'filled' : '') + (s.status === 'ate' ? ' ate' : ''),
        onclick: () => opts.openSlot(date, s.slot),
      }, [
        el('span.mode', icon(MODE_ICON[s.mode] || 'pot', 18)),
        el('div.grow', [
          el('div.label', SLOT_LABEL[s.slot]),
          el('div.dish', s.name || '—'),
        ]),
        s.status === 'ate' ? el('span.pill.ok', 'ate') : null,
        s.status === 'other' ? el('span.pill', 'ate other') : null,
        s.status === 'skipped' ? el('span.pill', 'skipped') : null,
        el('span.grams', s.g === null ? 'no number' : s.g + ' g'),
      ]));
    }

    for (const x of p.extras) {
      rows.push(el('div.slot.filled', [
        el('span.mode', icon('spark', 18)),
        el('div.grow', [
          el('div.label', 'Extra'),
          el('div.dish', x.name),
        ]),
        el('span.grams', (typeof x.proteinG === 'number' ? x.proteinG : 0) + ' g'),
        iconBtn('close', {
          class: 'small',
          'aria-label': 'Remove ' + x.name,
          onclick: () => {
            commit(removeExtra(key, date, x.id));
            toast('Removed', '', {
              label: 'Undo',
              onclick: () => { commit(addExtra(key, date, x.name, x.proteinG)); ctx.rerender(); },
            });
            ctx.rerender();
          },
        }, 16),
      ]));
    }

    if (rows.length) {
      root.appendChild(card(el('div.list', rows), { class: 'pad0' }));
    } else {
      root.appendChild(card(empty('Nothing planned or logged.',
        'Plan the day in Week, or add something you ate above.'), { class: 'flat' }));
    }

    if (p.missing.length) {
      root.appendChild(el('div.banner.quiet', [
        icon('dot', 16),
        el('span.grow', 'No protein number yet for ' + p.missing.join(', ')
          + '. Ask Claude to fill them in, or set them in the library.'),
      ]));
    }
  }

  // ------------------------------------------------------- library gaps --
  const gaps = mealsWithoutProtein();
  if (gaps.length) {
    root.appendChild(sectionTitle('Meals without a number',
      el('span.tiny.dimmer', gaps.length + ' of ' + meals().length)));
    root.appendChild(card(el('div.list', gaps.slice(0, 8).map((m) => el('button.item', {
      onclick: () => opts.openMeal(m),
    }, [
      el('div.grow', [
        el('div.name', m.name),
        el('div.meta', m.protein ? m.protein : 'protein source not set'),
      ]),
      el('span.pill', 'set'),
    ]))), { class: 'pad0' }));
    root.appendChild(el('p.small.dim', { style: { margin: '8px 6px 0' } },
      'Per serving. The quickest way is to tell Claude "put protein numbers on my meals" — '
      + 'it does the whole library in one go.'));
  }
}
