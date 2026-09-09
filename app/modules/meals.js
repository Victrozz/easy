// Meals — the week, the library, the shopping list, and protein.
//
// The week is not seven days. It is however many days you are actually in
// Valencia, and that changes constantly, so presence is a per-day toggle with
// a sensible default rather than something fixed.
//
// Prep-week and yolo-day are the same mechanism: every slot carries a mode.
// Cooking on Sunday for three lunches is one `cook` and two `leftovers`.
// There is no "meal prep mode" to switch into and forget about.

import {
  el, card, button, icon, iconBtn, sheet, promptSheet, confirmSheet, field,
  textInput, textArea, chips, toggle, stepper, segmented, toast, sectionTitle,
  empty, copyText,
} from '../ui.js';
import {
  MEALS_FILE, SLOTS, SLOT_LABEL, MODES, MODE_LABEL, MODE_ICON, EFFORTS,
  getWeek, setPresence, setSlot, setWeekNote, setDayNote, meals, mealById,
  mealName, newMeal, suggestMeal, slotProtein, dayProtein, commit, logEvent,
} from '../model.js';
import {
  ymd, weekKey, weekFile, shiftWeek, weekDates, prettyDate, dayKeyOf,
  DAY_LONG, DAY_SHORT, parseYmd, slug, relDays,
} from '../util.js';
import { renderProtein } from './protein.js';

let shownWeek = weekKey();
let selectedDay = null;      // highlighted in the strip
let librarySearch = '';
let shopFrom = null;         // null = from today

const VIEWS = [
  { value: 'week', label: 'Week', icon: 'calendar' },
  { value: 'library', label: 'Library', icon: 'book' },
  { value: 'shop', label: 'Shop', icon: 'bag' },
  { value: 'protein', label: 'Protein', icon: 'protein' },
];

// --------------------------------------------------------------- slot edit --

function statusOf(slot) {
  return slot && slot.status ? slot.status : null;
}

function slotValue(choice) {
  const v = { meal: choice.meal || null, name: choice.name || null, mode: choice.mode || 'cook', status: null };
  if (typeof choice.proteinG === 'number') v.proteinG = choice.proteinG;
  return v;
}

function patchMeal(id, value, label) {
  return { file: MEALS_FILE, op: 'patchWhere', path: ['items'], key: 'id', match: id, value, label };
}

/**
 * The one sheet for a meal slot. Opened from the week, from Today, and from
 * the protein view — so it takes the week key rather than assuming the one
 * on screen.
 */
export function slotSheet(ctx, key, date, slotName) {
  const week = getWeek(key);
  const day = week.days[date];
  const slot = day ? (day.slots[slotName] || null) : null;
  const title = DAY_LONG[dayKeyOf(date)] + ' ' + SLOT_LABEL[slotName].toLowerCase();

  sheet(title, (body, done) => {
    const reopen = () => { done(); setTimeout(() => slotSheet(ctx, key, date, slotName), 40); };

    const plan = (choice) => {
      commit(
        setSlot(key, date, slotName, slotValue(choice)),
        logEvent('meal.planned', {
          date, slot: slotName, meal: choice.meal || choice.name, mode: choice.mode,
        }),
      );
      done();
      ctx.rerender();
    };

    if (!slot || (!slot.meal && !slot.name)) {
      buildPicker(body, done, ctx, plan);
      return;
    }

    const dish = mealName(slot) || '—';
    const meal = mealById(slot.meal);
    const grams = slotProtein(slot);

    body.appendChild(el('div.row', { style: { marginBottom: '14px' } }, [
      el('div.slot-mode-big', icon(MODE_ICON[slot.mode] || 'pot', 26)),
      el('div.grow', [
        el('div.hero', { style: { fontSize: '22px' } }, dish),
        el('div.hero-sub', (MODE_LABEL[slot.mode] || '')
          + (grams !== null ? ' · ' + grams + ' g protein' : '')),
      ]),
    ]));

    // --- what actually happened ------------------------------------------
    body.appendChild(el('span.field-label', 'Did you eat it?'));
    body.appendChild(chips([
      { value: 'ate', label: 'Ate it' },
      { value: 'other', label: 'Ate something else' },
      { value: 'skipped', label: 'Skipped' },
    ], statusOf(slot), (v) => {
      const next = statusOf(slot) === v ? null : v;
      commit(
        setSlot(key, date, slotName, Object.assign({}, slot, { status: next })),
        next ? logEvent('meal.' + next, { date, slot: slotName, meal: slot.meal || slot.name }) : null,
        next === 'ate' && meal
          ? patchMeal(meal.id, { timesCooked: (meal.timesCooked || 0) + 1, lastCooked: date }, 'ate: ' + meal.name)
          : null,
      );
      done();
      ctx.rerender();
    }));
    body.appendChild(el('div.spacer'));

    // --- how ---------------------------------------------------------------
    body.appendChild(el('span.field-label', 'How'));
    body.appendChild(chips(
      MODES.map((m) => ({ value: m, label: MODE_LABEL[m], icon: MODE_ICON[m] })),
      slot.mode,
      (v) => {
        commit(setSlot(key, date, slotName, Object.assign({}, slot, { mode: v })));
        reopen();
        ctx.rerender();
      },
    ));
    body.appendChild(el('div.spacer'));

    // --- protein on a one-off (a meal from the library carries its own) ----
    if (!meal) {
      body.appendChild(el('div.row', { style: { margin: '4px 0 12px' } }, [
        el('span.field-label', { style: { margin: 0 } }, 'Protein'),
        el('div.grow'),
        stepper(grams, { min: 0, max: 200, step: 5, start: 20, suffix: ' g', nullable: true, small: true }, (v) => {
          const next = Object.assign({}, slot);
          if (v === null) delete next.proteinG; else next.proteinG = v;
          commit(setSlot(key, date, slotName, next));
          ctx.rerender();
        }),
      ]));
    }

    // --- change / batch ----------------------------------------------------
    body.appendChild(el('div.row', { style: { gap: '8px' } }, [
      button([icon('swap', 16), 'Change'], {
        class: 'grow',
        onclick: () => {
          body.replaceChildren();
          body.setTitle('Change ' + SLOT_LABEL[slotName].toLowerCase());
          buildPicker(body, done, ctx, plan);
        },
      }),
      slot.mode === 'cook'
        ? button([icon('box', 16), 'Leftovers'], {
          class: 'grow',
          onclick: () => { done(); leftoversSheet(ctx, key, date, slotName, slot); },
        })
        : null,
    ]));
    body.appendChild(el('div.spacer'));

    body.appendChild(el('div.row', { style: { gap: '8px' } }, [
      button('Move…', {
        class: 'grow',
        onclick: () => { done(); moveSheet(ctx, key, date, slotName, slot); },
      }),
      button('Not this', {
        class: 'grow',
        onclick: () => { rejectSlot(ctx, key, date, slotName, slot); done(); },
      }),
    ]));

    body.appendChild(el('div', { style: { marginTop: '10px' } }, [
      meal
        ? button([icon('edit', 15), 'Edit ' + meal.name], {
          class: 'ghost wide',
          onclick: () => { done(); editMeal(meal, ctx); },
        })
        : null,
      button('Clear this meal', {
        class: 'ghost danger wide',
        onclick: () => {
          commit(setSlot(key, date, slotName, null));
          toast('Cleared', '', {
            label: 'Undo',
            onclick: () => { commit(setSlot(key, date, slotName, slot)); ctx.rerender(); },
          });
          done();
          ctx.rerender();
        },
      }),
    ]));
  }).then(() => ctx.rerender());
}

/** "Not this" — swap it out and remember that you pushed it away. */
function rejectSlot(ctx, key, date, slotName, slot) {
  const rejected = mealById(slot.meal);
  const next = suggestMeal({ exclude: slot.meal, effort: rejected ? rejected.effort : null });
  const prevRejections = rejected ? (rejected.rejections || 0) : 0;

  commit(
    rejected ? patchMeal(rejected.id, { rejections: prevRejections + 1 }, 'rejected: ' + rejected.name) : null,
    logEvent('meal.rejected', {
      date, slot: slotName, meal: slot.meal || slot.name,
      replacedWith: next ? next.id : null,
    }),
    setSlot(key, date, slotName, next
      ? { meal: next.id, name: null, mode: 'cook', status: null }
      : null),
  );

  toast(next ? 'Swapped for ' + next.name : 'Cleared — nothing else in the library', '', {
    label: 'Undo',
    onclick: () => {
      commit(
        setSlot(key, date, slotName, slot),
        rejected ? patchMeal(rejected.id, { rejections: prevRejections }, 'unreject: ' + rejected.name) : null,
      );
      ctx.rerender();
    },
  });
  ctx.rerender();
}

/** Which slots a day has, before you touch anything. */
function daySlots(key, date) {
  const day = getWeek(key).days[date];
  return day ? Object.keys(day.slots) : [];
}

/** Fill other slots with leftovers of the thing you are cooking. */
function leftoversSheet(ctx, key, date, slotName, slot) {
  const week = getWeek(key);
  const targets = [];
  for (const d of weekDates(key)) {
    const day = week.days[d];
    if (!day.here) continue;
    for (const s of SLOTS) {
      if (d === date && s === slotName) continue;
      const has = day.slots[s];
      if (has === undefined && !daySlots(key, d).includes(s)) continue;
      targets.push({
        value: d + '|' + s,
        full: DAY_LONG[dayKeyOf(d)] + ' ' + SLOT_LABEL[s].toLowerCase(),
        taken: !!(has && (has.meal || has.name)),
      });
    }
  }

  let picked = [];
  sheet('Leftovers of ' + (mealName(slot) || 'this'), (body, done) => {
    body.appendChild(el('p.sheet-text',
      'Which other meals does this batch cover? They get marked as leftovers.'));

    const list = el('div.list');
    const draw = () => {
      list.replaceChildren(...targets.map((t) => el('button.item', {
        onclick: () => {
          picked = picked.includes(t.value)
            ? picked.filter((v) => v !== t.value)
            : picked.concat([t.value]);
          draw();
        },
      }, [
        el('span.tick', { class: picked.includes(t.value) ? 'done' : '' }, icon('check', 16)),
        el('div.grow', [
          el('div.name', t.full),
          t.taken ? el('div.meta', 'will replace what is there') : null,
        ]),
      ])));
    };
    draw();
    body.appendChild(card(list, { class: 'pad0' }));

    body.appendChild(el('div.sheet-actions', [
      button('Cancel', { class: 'ghost', onclick: () => done() }),
      button('Set leftovers', {
        class: 'primary',
        onclick: () => {
          if (picked.length === 0) { done(); return; }
          commit(
            picked.map((v) => {
              const [d, s] = v.split('|');
              return setSlot(key, d, s, {
                meal: slot.meal || null,
                name: slot.name || null,
                mode: 'leftovers',
                status: null,
              });
            }),
            logEvent('meal.batched', {
              from: date, meal: slot.meal || slot.name, covers: picked,
            }),
          );
          toast('Covered ' + picked.length + ' more meal' + (picked.length === 1 ? '' : 's'));
          done();
          ctx.rerender();
        },
      }),
    ]));
  }, { noAutoFocus: true }).then(() => ctx.rerender());
}

function moveSheet(ctx, key, date, slotName, slot) {
  const week = getWeek(key);
  const targets = [];
  for (const d of weekDates(key)) {
    if (!week.days[d].here) continue;
    for (const s of SLOTS) {
      if (d === date && s === slotName) continue;
      const has = week.days[d].slots[s];
      if (has === undefined && !daySlots(key, d).includes(s)) continue;
      targets.push({ d, s, taken: !!(has && (has.meal || has.name)) });
    }
  }

  sheet('Move ' + (mealName(slot) || 'this') + ' to…', (body, done) => {
    if (targets.length === 0) {
      body.appendChild(empty('Nowhere to move it.', 'Every other slot this week is a day you are away.'));
      return;
    }
    body.appendChild(card(el('div.list', targets.map((t) => el('button.item', {
      onclick: () => {
        commit(
          setSlot(key, t.d, t.s, Object.assign({}, slot, { status: null })),
          setSlot(key, date, slotName, null),
          logEvent('meal.moved', {
            from: date + '/' + slotName, to: t.d + '/' + t.s, meal: slot.meal || slot.name,
          }),
        );
        toast('Moved to ' + DAY_LONG[dayKeyOf(t.d)]);
        done();
        ctx.rerender();
      },
    }, [
      el('div.grow', [
        el('div.name', DAY_LONG[dayKeyOf(t.d)] + ' · ' + SLOT_LABEL[t.s].toLowerCase()),
        t.taken ? el('div.meta', 'something is already there') : null,
      ]),
      icon('right', 18),
    ]))), { class: 'pad0' }));
  }, { noAutoFocus: true }).then(() => ctx.rerender());
}

// ------------------------------------------------------------- meal picker --

function buildPicker(body, done, ctx, onPick) {
  let search = '';
  const listWrap = el('div');

  const draw = () => {
    const q = search.trim().toLowerCase();
    const found = meals()
      .filter((m) => !m.archived)
      .filter((m) => !q || m.name.toLowerCase().includes(q)
        || (m.tags || []).some((t) => t.toLowerCase().includes(q)))
      .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0)
        || a.name.localeCompare(b.name));

    listWrap.replaceChildren(
      found.length
        ? card(el('div.list', found.slice(0, 40).map((m) => el('button.item', {
          onclick: () => onPick({ meal: m.id, mode: 'cook' }),
        }, [
          el('div.grow', [
            el('div.name', m.name),
            el('div.meta', [
              m.effort,
              m.protein ? ' · ' + m.protein : '',
              typeof m.proteinG === 'number' ? ' · ' + m.proteinG + ' g' : '',
              m.lastCooked ? ' · ' + relDays(m.lastCooked) : '',
            ].join('')),
          ]),
          m.favorite ? icon('star', 16, { solid: true }) : null,
        ]))), { class: 'pad0' })
        : el('div.empty.small', q ? 'Nothing matches.' : 'Your library is empty.'),
    );
  };

  const input = textInput('', {
    placeholder: 'Search your meals',
    oninput: (e) => { search = e.target.value; draw(); },
  });
  body.appendChild(field(null, input));

  body.appendChild(el('div.row', { style: { marginBottom: '12px', gap: '8px' } }, [
    button([icon('spark', 16), 'Suggest one'], {
      class: 'grow',
      onclick: () => {
        const m = suggestMeal({});
        if (!m) { toast('Add some meals first'); return; }
        onPick({ meal: m.id, mode: 'cook' });
      },
    }),
    button([icon('plus', 16), 'New meal'], {
      class: 'grow',
      onclick: () => {
        done();
        editMeal(null, ctx, (created) => onPick({ meal: created.id, mode: 'cook' }));
      },
    }),
  ]));

  draw();
  body.appendChild(listWrap);

  body.appendChild(el('div.spacer'));
  body.appendChild(el('span.field-label', 'Or just:'));
  body.appendChild(el('div.row', { style: { gap: '8px' } }, [
    button([icon('out', 16), 'Out / bought'], {
      class: 'grow',
      onclick: async () => {
        const what = await promptFor('What did you have?', 'Bocadillo, menú del día…');
        onPick({ name: what || 'Out', mode: 'out' });
      },
    }),
    button([icon('quick', 16), 'Something quick'], {
      class: 'grow',
      onclick: async () => {
        const what = await promptFor('What was it?', 'Eggs and toast');
        onPick({ name: what || 'Something quick', mode: 'quick' });
      },
    }),
  ]));
}

function promptFor(title, placeholder) {
  return sheet(title, (body, done) => {
    const input = textInput('', { placeholder });
    const go = () => done(input.value.trim() || undefined);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    body.appendChild(field(null, input));
    body.appendChild(el('div.sheet-actions', [
      button('Skip', { class: 'ghost', onclick: () => done(undefined) }),
      button('Save', { class: 'primary', onclick: go }),
    ]));
    setTimeout(() => input.focus(), 60);
  });
}

// ------------------------------------------------------------------ library --

export function editMeal(meal, ctx, after) {
  const isNew = !meal;
  const draft = Object.assign({}, newMeal(), meal || {});

  sheet(isNew ? 'New meal' : draft.name, (body, done) => {
    const name = textInput(draft.name, { placeholder: 'Lentejas' });
    body.appendChild(field('Name', name));

    const effortWrap = el('div');
    const drawEffort = () => {
      effortWrap.replaceChildren(chips(
        EFFORTS.map((e) => ({
          value: e,
          label: e === 'project' ? 'A project' : e[0].toUpperCase() + e.slice(1),
        })),
        draft.effort,
        (v) => { draft.effort = v; drawEffort(); },
      ));
    };
    drawEffort();
    body.appendChild(field('Effort', effortWrap));

    const protein = textInput(draft.protein, { placeholder: 'pollo, lentejas, huevo…' });
    body.appendChild(field('Protein source', protein));

    body.appendChild(el('div.row', { style: { marginBottom: '14px' } }, [
      el('div.grow', [
        el('span.field-label', { style: { margin: 0 } }, 'Protein per serving'),
        el('small.dim', 'Claude can fill this in for the whole library.'),
      ]),
      stepper(draft.proteinG, {
        min: 0, max: 200, step: 5, start: 25, suffix: ' g', nullable: true, small: true,
      }, (v) => { draft.proteinG = v; }),
    ]));

    body.appendChild(el('div.row', { style: { marginBottom: '14px' } }, [
      el('span.field-label', { style: { margin: 0 } }, 'Servings it makes'),
      el('div.grow'),
      stepper(draft.servings || 1, { min: 1, max: 12, small: true }, (v) => { draft.servings = v; }),
    ]));

    const tags = textInput((draft.tags || []).join(', '), { placeholder: 'cuchara, rápido, horno' });
    body.appendChild(field('Tags', tags, 'Comma separated. Searchable when picking.'));

    const ingredients = textArea((draft.ingredients || []).join('\n'), {
      placeholder: 'One per line.\nLeave it empty — Claude fills these in when planning.',
      rows: 4,
    });
    body.appendChild(field('Ingredients', ingredients,
      'Only needed for the shopping list. You never have to type these.'));

    const flags = el('div');
    const drawFlags = () => {
      flags.replaceChildren(
        toggle('Favourite — can repeat often', draft.favorite, (v) => { draft.favorite = v; drawFlags(); }),
        toggle('Batches well for leftovers', draft.batchable, (v) => { draft.batchable = v; drawFlags(); }),
      );
    };
    drawFlags();
    body.appendChild(flags);

    const notes = textArea(draft.notes, { placeholder: 'How you make it, what goes with it' });
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
            protein: protein.value.trim(),
            notes: notes.value.trim(),
            tags: tags.value.split(',').map((s) => s.trim()).filter(Boolean),
            ingredients: ingredients.value.split('\n').map((s) => s.trim()).filter(Boolean),
            id: isNew ? slug(n) : draft.id,
          });
          commit(isNew
            ? { file: MEALS_FILE, op: 'push', path: ['items'], value, label: 'add meal: ' + n }
            : patchMeal(draft.id, value, 'edit meal: ' + n));
          done();
          ctx.rerender();
          if (after) after(value);
        },
      }),
    ]));

    if (!isNew) {
      body.appendChild(el('div', { style: { marginTop: '10px' } },
        button('Delete', {
          class: 'ghost danger wide',
          onclick: async () => {
            const ok = await confirmSheet('Delete ' + draft.name + '?',
              'It comes out of the library. Weeks that already used it keep the name.',
              'Delete', true);
            if (!ok) return;
            commit({
              file: MEALS_FILE, op: 'removeWhere', path: ['items'],
              key: 'id', match: draft.id, label: 'remove meal: ' + draft.name,
            });
            done();
            ctx.rerender();
          },
        })));
    }
  }).then(() => ctx.rerender());
}

function starBtn(m, ctx) {
  return iconBtn('star', {
    class: 'star-btn' + (m.favorite ? ' on' : ''),
    'aria-label': m.favorite ? 'Remove from favourites' : 'Make a favourite',
    'aria-pressed': m.favorite ? 'true' : 'false',
    onclick: (e) => {
      e.stopPropagation();
      commit(patchMeal(m.id, { favorite: !m.favorite }, (m.favorite ? 'unfavourite: ' : 'favourite: ') + m.name));
      ctx.rerender();
    },
  }, 18);
}

function renderLibrary(root, ctx) {
  const q = librarySearch.trim().toLowerCase();
  const all = meals().filter((m) => !m.archived);
  const found = all
    .filter((m) => !q || m.name.toLowerCase().includes(q)
      || (m.protein || '').toLowerCase().includes(q)
      || (m.tags || []).some((t) => t.toLowerCase().includes(q)))
    .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || a.name.localeCompare(b.name));

  const search = textInput(librarySearch, {
    placeholder: 'Search ' + all.length + ' meal' + (all.length === 1 ? '' : 's'),
    'data-focus-key': 'library-search',
    oninput: (e) => { librarySearch = e.target.value; ctx.rerender(); },
  });
  root.appendChild(search);

  if (all.length === 0) {
    root.appendChild(card(empty(
      'No meals yet.',
      'Add the ten things you actually cook. Claude can fill in the rest later.',
    )));
  } else if (found.length === 0) {
    root.appendChild(card(empty('Nothing matches.'), { class: 'flat' }));
  } else {
    root.appendChild(card(el('div.list', found.map((m) => el('div.item', {
      tappable: true,
      onclick: () => editMeal(m, ctx),
    }, [
      el('div.grow', [
        el('div.name', m.name),
        el('div.meta', [
          m.effort,
          m.protein ? ' · ' + m.protein : '',
          typeof m.proteinG === 'number' ? ' · ' + m.proteinG + ' g' : '',
          m.batchable ? ' · batches' : '',
          m.timesCooked ? ' · cooked ' + m.timesCooked + '×' : '',
        ].join('')),
      ]),
      starBtn(m, ctx),
    ]))), { class: 'pad0' }));
  }

  root.appendChild(el('div', { style: { marginTop: '12px' } },
    button([icon('plus', 16), 'Add a meal'], { class: 'primary wide', onclick: () => editMeal(null, ctx) })));
}

// ----------------------------------------------------------------- shopping --

function renderShopping(root, ctx) {
  const key = shownWeek;
  const week = getWeek(key);
  const stored = ctx.read(weekFile(key)) || {};
  const shopping = stored.shopping || { extra: [], got: [] };
  const got = shopping.got || [];

  const dates = weekDates(key);
  const from = shopFrom && dates.includes(shopFrom) ? shopFrom : (dates.includes(ymd()) ? ymd() : dates[0]);
  const inRange = dates.filter((d) => d >= from && week.days[d].here);

  // Only `cook` slots need buying for. Leftovers are already in the fridge.
  const need = new Map();
  const noIngredients = [];
  for (const d of inRange) {
    for (const s of SLOTS) {
      const slot = week.days[d].slots[s];
      if (!slot || slot.mode !== 'cook' || !slot.meal) continue;
      const m = mealById(slot.meal);
      if (!m) continue;
      const list = m.ingredients || [];
      if (list.length === 0) {
        if (!noIngredients.includes(m.name)) noIngredients.push(m.name);
        continue;
      }
      for (const ing of list) {
        const k = ing.toLowerCase();
        if (!need.has(k)) need.set(k, { text: ing, for: [] });
        if (!need.get(k).for.includes(m.name)) need.get(k).for.push(m.name);
      }
    }
  }

  const items = [...need.values()];
  const extras = shopping.extra || [];

  const copy = async () => {
    const lines = ['Shopping · ' + prettyDate(from) + ' → ' + prettyDate(dates[6])];
    for (const it of items) if (!got.includes(it.text)) lines.push('• ' + it.text + '  (' + it.for.join(', ') + ')');
    for (const x of extras) if (!got.includes(x.text)) lines.push('• ' + x.text);
    toast((await copyText(lines.join('\n'))) ? 'Copied the list' : 'Could not copy', '');
  };

  root.appendChild(el('div.row', [
    el('p.dim.small.grow', 'Everything you need to cook from ' + prettyDate(from) + ' to the end of the week.'),
    (items.length || extras.length)
      ? iconBtn('copy', { 'aria-label': 'Copy the list', onclick: copy }, 19)
      : null,
  ]));

  root.appendChild(chips(
    dates.filter((d) => week.days[d].here).map((d) => ({
      value: d,
      label: DAY_SHORT[dayKeyOf(d)] + ' ' + parseYmd(d).getDate(),
    })),
    from,
    (v) => { shopFrom = v; ctx.rerender(); },
  ));

  const toggleGot = (text) => {
    const next = got.includes(text) ? got.filter((g) => g !== text) : got.concat([text]);
    commit({
      file: weekFile(key), op: 'set', path: ['shopping', 'got'],
      value: next, label: 'shopping: tick',
    });
    ctx.rerender();
  };

  if (items.length === 0 && extras.length === 0) {
    root.appendChild(card(empty(
      'Nothing to buy yet.',
      inRange.length === 0
        ? 'No days left in this week that you are here for.'
        : 'Plan some meals, or add items by hand below.',
    ), { class: 'flat' }));
  }

  if (items.length) {
    root.appendChild(sectionTitle('For your meals'));
    root.appendChild(card(el('div.list', items.map((it) => el('div.item', {
      tappable: true,
      onclick: () => toggleGot(it.text),
    }, [
      el('span.tick', { class: got.includes(it.text) ? 'done' : '' }, icon('check', 16)),
      el('div.grow', [
        el('div.name', { class: got.includes(it.text) ? 'strike' : '' }, it.text),
        el('div.meta', it.for.join(', ')),
      ]),
    ]))), { class: 'pad0' }));
  }

  if (noIngredients.length) {
    root.appendChild(el('div.banner.quiet', [
      icon('dot', 16),
      el('span', 'No ingredients saved for ' + noIngredients.join(', ')
        + '. Ask Claude to fill them in.'),
    ]));
  }

  root.appendChild(sectionTitle('Anything else', button('Add', {
    class: 'small ghost',
    onclick: async () => {
      const what = await promptFor('Add to the list', 'Detergent, papel de cocina…');
      if (!what) return;
      commit({
        file: weekFile(key), op: 'set', path: ['shopping', 'extra'],
        value: extras.concat([{ id: slug(what) + '-' + Date.now().toString(36), text: what }]),
        label: 'shopping: add ' + what,
      });
      ctx.rerender();
    },
  })));

  if (extras.length) {
    root.appendChild(card(el('div.list', extras.map((x) => el('div.item', {
      tappable: true,
      onclick: () => toggleGot(x.text),
    }, [
      el('span.tick', { class: got.includes(x.text) ? 'done' : '' }, icon('check', 16)),
      el('div.grow', el('div.name', { class: got.includes(x.text) ? 'strike' : '' }, x.text)),
      iconBtn('close', {
        class: 'small',
        'aria-label': 'Remove',
        onclick: (e) => {
          e.stopPropagation();
          commit({
            file: weekFile(key), op: 'set', path: ['shopping', 'extra'],
            value: extras.filter((y) => y.id !== x.id), label: 'shopping: remove',
          });
          ctx.rerender();
        },
      }, 16),
    ]))), { class: 'pad0' }));
  }

  if (got.length) {
    root.appendChild(el('div', { style: { marginTop: '14px' } },
      button('Clear ticks', {
        class: 'ghost wide',
        onclick: () => {
          commit({
            file: weekFile(key), op: 'set', path: ['shopping', 'got'],
            value: [], label: 'shopping: reset',
          });
          ctx.rerender();
        },
      })));
  }
}

// --------------------------------------------------------------- week view --

function slotRow(ctx, key, date, slotName, slot) {
  const dish = mealName(slot);
  const status = statusOf(slot);
  const filled = !!dish;
  const grams = filled ? slotProtein(slot) : null;

  return el('button.slot', {
    class: (filled ? 'filled' : '') + (status === 'ate' ? ' ate' : ''),
    onclick: () => slotSheet(ctx, key, date, slotName),
  }, [
    el('span.mode', icon(filled ? (MODE_ICON[slot.mode] || 'pot') : 'plus', 18)),
    el('div.grow', [
      el('div.label', SLOT_LABEL[slotName]),
      el('div.dish', { class: filled ? '' : 'none' }, dish || 'nothing planned'),
    ]),
    status === 'ate' ? el('span.pill.ok', 'ate it') : null,
    status === 'other' ? el('span.pill', 'ate other') : null,
    status === 'skipped' ? el('span.pill', 'skipped') : null,
    grams !== null ? el('span.grams', grams + ' g') : null,
  ]);
}

function markAway(ctx, key, date) {
  const dk = dayKeyOf(date);
  commit(setPresence(key, date, false));
  toast(DAY_LONG[dk] + ' marked away', '', {
    label: 'Undo',
    onclick: () => { commit(setPresence(key, date, true)); ctx.rerender(); },
  });
  ctx.rerender();
}

function markHere(ctx, key, date) {
  const dk = dayKeyOf(date);
  commit(setPresence(key, date, true));
  toast(DAY_LONG[dk] + ' — here', '', {
    label: 'Undo',
    onclick: () => { commit(setPresence(key, date, false)); ctx.rerender(); },
  });
  ctx.rerender();
}

function addSlotSheet(ctx, key, date, missing) {
  sheet('Add to ' + DAY_LONG[dayKeyOf(date)], (body, done) => {
    body.appendChild(card(el('div.list', missing.map((s) => el('button.item', {
      onclick: () => {
        commit(setSlot(key, date, s, { meal: null, name: null, mode: 'cook', status: null }));
        done();
        ctx.rerender();
        slotSheet(ctx, key, date, s);
      },
    }, [
      el('div.grow', el('div.name', SLOT_LABEL[s])),
      icon('right', 18),
    ]))), { class: 'pad0' }));
  }, { noAutoFocus: true }).then(() => ctx.rerender());
}

async function dayNoteSheet(ctx, key, date, day) {
  const text = await promptSheet(DAY_LONG[dayKeyOf(date)] + ' — note', {
    value: day.note, multiline: true, rows: 3, allowEmpty: true,
    placeholder: 'Exam, guests, eating at home…',
  });
  if (text === undefined) return;
  commit(setDayNote(key, date, text));
  ctx.rerender();
}

async function weekNoteSheet(ctx, key, current) {
  const text = await promptSheet('Note for this week', {
    value: current, multiline: true, rows: 4, allowEmpty: true,
    hint: 'Claude reads this when planning. Exams, guests, "keep it easy", "no fish".',
    placeholder: 'Anything Claude should know.',
  });
  if (text === undefined) return;
  commit(setWeekNote(key, text));
  ctx.rerender();
}

function dayCard(ctx, week, date) {
  const key = week.key;
  const day = week.days[date];
  const isToday = date === ymd();
  const dk = dayKeyOf(date);
  const n = parseYmd(date).getDate();

  if (!day.here) {
    return el('div.card.flat.tight', {
      id: 'day-' + date,
      style: { display: 'flex', alignItems: 'center', gap: '10px' },
    }, [
      el('span.dimmer', { style: { display: 'inline-flex' } }, icon('wave', 18)),
      el('div.grow', [
        el('span.dim', DAY_LONG[dk] + ' ' + n),
        el('span.dimmer.small', '  ·  away'),
      ]),
      button("I'm here", { class: 'small ghost', onclick: () => markHere(ctx, key, date) }),
    ]);
  }

  const slotNames = SLOTS.filter((s) => day.slots[s] !== undefined);
  const missing = SLOTS.filter((s) => day.slots[s] === undefined);
  const p = dayProtein(week, date);

  // Today is marked by colour, not a pill: on a phone the header has no room
  // for both a "today" badge and the protein figure next to three controls.
  return el('div.card.pad0', { id: 'day-' + date, class: selectedDay === date ? 'sel' : '' }, [
    el('div.day-head', { class: isToday ? 'today' : '' }, [
      el('h3', DAY_LONG[dk] + ' ' + n),
      p.planned > 0 ? el('span.pill.g', [icon('protein', 12), p.planned + ' g']) : null,
      el('div.grow'),
      iconBtn('edit', {
        class: 'small' + (day.note ? ' on' : ''),
        'aria-label': 'Note for ' + DAY_LONG[dk],
        onclick: () => dayNoteSheet(ctx, key, date, day),
      }, 16),
      missing.length
        ? iconBtn('plus', {
          class: 'small',
          'aria-label': 'Add a meal to ' + DAY_LONG[dk],
          onclick: () => addSlotSheet(ctx, key, date, missing),
        }, 18)
        : null,
      // Deliberately a word, not an X. On a phone there is no tooltip, and an
      // X here reads as "delete this day's plans" rather than "I'm not there".
      button('Away', {
        class: 'small ghost',
        'aria-label': 'Mark ' + DAY_LONG[dk] + ' as away',
        onclick: () => markAway(ctx, key, date),
      }),
    ]),
    day.note ? el('div.day-note', day.note) : null,
    slotNames.length
      ? el('div.list', slotNames.map((s) => slotRow(ctx, key, date, s, day.slots[s])))
      : el('div.day-note', { style: { fontStyle: 'normal', paddingBottom: '12px' } }, 'Here, no meals set. Tap + to add one.'),
  ]);
}

function renderWeek(root, ctx) {
  const key = shownWeek;
  const week = getWeek(key);
  const dates = weekDates(key);
  const isThisWeek = key === weekKey();

  root.appendChild(el('div.wk-nav', [
    iconBtn('left', {
      'aria-label': 'Previous week',
      onclick: () => { shownWeek = shiftWeek(shownWeek, -1); selectedDay = null; ctx.rerender(); },
    }),
    el('div.grow', { style: { textAlign: 'center' } }, [
      el('div.range', prettyDate(dates[0]) + ' – ' + prettyDate(dates[6])),
      isThisWeek
        ? el('div.tiny.dimmer', 'this week')
        : el('button.link', {
          type: 'button',
          onclick: () => { shownWeek = weekKey(); selectedDay = null; ctx.rerender(); },
        }, 'back to this week'),
    ]),
    iconBtn('right', {
      'aria-label': 'Next week',
      onclick: () => { shownWeek = shiftWeek(shownWeek, 1); selectedDay = null; ctx.rerender(); },
    }),
  ]));

  // Week at a glance. Tapping a day jumps to it; presence lives on the card.
  root.appendChild(el('div.week-strip', dates.map((d) => {
    const day = week.days[d];
    const planned = SLOTS.filter((s) => day.slots[s] && (day.slots[s].meal || day.slots[s].name));
    const ate = planned.filter((s) => day.slots[s].status === 'ate');
    return el('button.day-chip', {
      type: 'button',
      class: [
        day.here ? '' : 'away',
        d === ymd() ? 'today' : '',
        d === selectedDay ? 'sel' : '',
      ].join(' ').trim(),
      'aria-label': DAY_LONG[dayKeyOf(d)] + (day.here ? ', here' : ', away'),
      onclick: () => {
        selectedDay = d;
        ctx.rerender();
        requestAnimationFrame(() => {
          const target = document.getElementById('day-' + d);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      },
    }, [
      el('span.d', DAY_SHORT[dayKeyOf(d)]),
      el('span.n', String(parseYmd(d).getDate())),
      el('span.dots', SLOTS.filter((s) => day.slots[s] !== undefined).slice(0, 4).map((s, i) =>
        el('i', {
          class: ate.length > i ? 'ate' : (planned.length > i ? 'set' : ''),
        }))),
    ]);
  })));

  // The channel to Claude: one line about the week, read at planning time.
  root.appendChild(card(el('div.note-card', {
    tappable: true,
    onclick: () => weekNoteSheet(ctx, key, week.notes),
  }, [
    icon('edit', 16),
    el('div.grow', el('div.text', { class: week.notes ? '' : 'none' },
      week.notes || 'A note for this week — Claude reads it when planning. Exams, guests, a lazy week.')),
  ]), { class: 'flat' }));

  if (week.away) {
    root.appendChild(el('div.banner.quiet', [
      icon('wave', 16),
      el('span', 'Away all week. Tap "I\'m here" on a day if that changes.'),
    ]));
  }

  for (const d of dates) {
    root.appendChild(dayCard(ctx, week, d));
  }

  if (!week.away) {
    root.appendChild(el('div', { style: { marginTop: '6px' } },
      button('Away all week', {
        class: 'ghost wide',
        onclick: () => {
          const before = dates.map((d) => [d, week.days[d].here]);
          commit(dates.map((d) => setPresence(key, d, false)));
          toast('Week marked away', '', {
            label: 'Undo',
            onclick: () => { commit(before.map(([d, h]) => setPresence(key, d, h))); ctx.rerender(); },
          });
          ctx.rerender();
        },
      })));
  }
}

// ------------------------------------------------------------------ module --

export default {
  id: 'meals',
  label: 'Meals',
  icon: 'meals',
  files: [MEALS_FILE],

  // The week being viewed has to be loaded too, plus last week so the
  // no-repeats rule has something to look at.
  extraFiles() {
    return [weekFile(shownWeek), weekFile(shiftWeek(shownWeek, -1))];
  },

  title: () => 'Meals',

  render(root, ctx) {
    const view = VIEWS.some((v) => v.value === ctx.sub) ? ctx.sub : 'week';
    root.appendChild(segmented(VIEWS, view, (v) => ctx.nav('meals', v === 'week' ? '' : v)));

    if (view === 'week') renderWeek(root, ctx);
    else if (view === 'library') renderLibrary(root, ctx);
    else if (view === 'shop') renderShopping(root, ctx);
    else {
      renderProtein(root, ctx, {
        key: shownWeek,
        openSlot: (date, s) => slotSheet(ctx, shownWeek, date, s),
        openMeal: (m) => editMeal(m, ctx),
      });
    }
  },
};
