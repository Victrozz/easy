// Meals — the week, the library, and the shopping list.
//
// The week is not seven days. It is however many days you are actually in
// Valencia, and that changes constantly, so presence is a per-day toggle with
// a sensible default rather than something fixed.
//
// Prep-week and yolo-day are the same mechanism: every slot carries a mode.
// Cooking on Sunday for three lunches is one `cook` and two `leftovers`.
// There is no "meal prep mode" to switch into and forget about.

import {
  el, card, button, icon, sheet, confirmSheet, field, textInput, textArea,
  chips, toggle, toast, sectionTitle, empty,
} from '../ui.js';
import {
  MEALS_FILE, SLOTS, SLOT_LABEL, MODES, MODE_LABEL, MODE_ICON, EFFORTS,
  getWeek, setPresence, setSlot, meals, mealById, mealName, newMeal,
  suggestMeal, commit, logEvent,
} from '../model.js';
import {
  ymd, weekKey, weekFile, shiftWeek, weekDates, prettyDate, dayKeyOf,
  DAY_LONG, DAY_SHORT, parseYmd, slug, relDays,
} from '../util.js';

let view = 'week';          // week | library | shopping
let shownWeek = weekKey();
let librarySearch = '';
let shopFrom = null;        // null = from today

// --------------------------------------------------------------- slot edit --

function statusOf(slot) {
  return slot && slot.status ? slot.status : null;
}

function slotSheet(ctx, date, slotName) {
  const week = getWeek(shownWeek);
  const day = week.days[date];
  const slot = day.slots[slotName] || null;
  const title = DAY_LONG[dayKeyOf(date)] + ' ' + SLOT_LABEL[slotName].toLowerCase();

  sheet(title, (body, done) => {
    const redraw = () => { done(); setTimeout(() => slotSheet(ctx, date, slotName), 30); };

    if (!slot || (!slot.meal && !slot.name)) {
      buildPicker(body, done, ctx, (choice) => {
        commit(
          setSlot(shownWeek, date, slotName, {
            meal: choice.meal || null,
            name: choice.name || null,
            mode: choice.mode || 'cook',
            status: null,
          }),
          logEvent('meal.planned', {
            date, slot: slotName, meal: choice.meal || choice.name, mode: choice.mode,
          }),
        );
        done();
        ctx.rerender();
      });
      return;
    }

    const dish = mealName(slot) || '—';
    const meal = mealById(slot.meal);

    body.appendChild(el('div.row', { style: { marginBottom: '14px' } }, [
      el('div.slot-mode-big', icon(MODE_ICON[slot.mode] || 'pot', 26)),
      el('div.grow', [
        el('div.hero', { style: { fontSize: '20px' } }, dish),
        el('div.hero-sub', MODE_LABEL[slot.mode] || ''),
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
        setSlot(shownWeek, date, slotName, Object.assign({}, slot, { status: next })),
        next ? logEvent('meal.' + next, { date, slot: slotName, meal: slot.meal || slot.name }) : null,
        next === 'ate' && meal
          ? {
            file: MEALS_FILE, op: 'patchWhere', path: ['items'], key: 'id', match: meal.id,
            value: { timesCooked: (meal.timesCooked || 0) + 1, lastCooked: date },
            label: 'ate: ' + meal.name,
          }
          : null,
      );
      done();
      ctx.rerender();
    }));
    body.appendChild(el('div.spacer'));

    // --- how ---------------------------------------------------------------
    body.appendChild(el('span.field-label', 'How'));
    body.appendChild(chips(
      MODES.map((m) => ({ value: m, label: MODE_LABEL[m] })),
      slot.mode,
      (v) => {
        commit(setSlot(shownWeek, date, slotName, Object.assign({}, slot, { mode: v })));
        redraw();
        ctx.rerender();
      },
    ));
    body.appendChild(el('div.spacer'));

    // --- batching: the whole point of prepping -----------------------------
    if (slot.mode === 'cook' && (slot.meal || slot.name)) {
      body.appendChild(button('Leftovers for other meals…', {
        class: 'wide',
        onclick: () => { done(); leftoversSheet(ctx, date, slotName, slot); },
      }));
      body.appendChild(el('div.spacer'));
    }

    body.appendChild(el('div.row', { style: { gap: '8px' } }, [
      button('Move…', {
        class: 'grow',
        onclick: () => { done(); moveSheet(ctx, date, slotName, slot); },
      }),
      button('Not this', {
        class: 'grow',
        onclick: () => {
          rejectSlot(ctx, date, slotName, slot);
          done();
        },
      }),
    ]));

    body.appendChild(el('div', { style: { marginTop: '10px' } },
      button('Clear this meal', {
        class: 'ghost danger wide',
        onclick: () => {
          commit(setSlot(shownWeek, date, slotName, null));
          done();
          ctx.rerender();
        },
      })));
  }).then(() => ctx.rerender());
}

/** "Not this" — swap it out and remember that you pushed it away. */
function rejectSlot(ctx, date, slotName, slot) {
  const rejected = mealById(slot.meal);
  const next = suggestMeal({ exclude: slot.meal, effort: rejected ? rejected.effort : null });

  commit(
    rejected
      ? {
        file: MEALS_FILE, op: 'patchWhere', path: ['items'], key: 'id', match: rejected.id,
        value: { rejections: (rejected.rejections || 0) + 1 },
        label: 'rejected: ' + rejected.name,
      }
      : null,
    logEvent('meal.rejected', {
      date, slot: slotName, meal: slot.meal || slot.name,
      replacedWith: next ? next.id : null,
    }),
    setSlot(shownWeek, date, slotName, next
      ? { meal: next.id, name: null, mode: 'cook', status: null }
      : null),
  );

  toast(next ? 'Swapped for ' + next.name : 'Cleared — nothing else in the library');
  ctx.rerender();
}

/** Fill other slots with leftovers of the thing you are cooking. */
function leftoversSheet(ctx, date, slotName, slot) {
  const week = getWeek(shownWeek);
  const targets = [];
  for (const d of weekDates(shownWeek)) {
    const day = week.days[d];
    if (!day.here) continue;
    for (const s of SLOTS) {
      if (d === date && s === slotName) continue;
      const has = day.slots[s];
      if (has === undefined && !defaultSlots(d).includes(s)) continue;
      targets.push({
        value: d + '|' + s,
        label: DAY_SHORT[dayKeyOf(d)] + ' ' + SLOT_LABEL[s].slice(0, 1).toLowerCase()
          + parseYmd(d).getDate(),
        full: DAY_LONG[dayKeyOf(d)] + ' ' + SLOT_LABEL[s].toLowerCase(),
        taken: !!(has && (has.meal || has.name)),
      });
    }
  }

  let picked = [];
  sheet('Leftovers of ' + (mealName(slot) || 'this'), (body, done) => {
    body.appendChild(el('p.sheet-text',
      'Which other meals does this batch cover? They get marked as leftovers.'));

    const list = el('div.col');
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
              return setSlot(shownWeek, d, s, {
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
  }).then(() => ctx.rerender());
}

function moveSheet(ctx, date, slotName, slot) {
  const week = getWeek(shownWeek);
  const targets = [];
  for (const d of weekDates(shownWeek)) {
    if (!week.days[d].here) continue;
    for (const s of SLOTS) {
      if (d === date && s === slotName) continue;
      const has = week.days[d].slots[s];
      if (has === undefined && !defaultSlots(d).includes(s)) continue;
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
          setSlot(shownWeek, t.d, t.s, Object.assign({}, slot, { status: null })),
          setSlot(shownWeek, date, slotName, null),
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
  }).then(() => ctx.rerender());
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
              m.lastCooked ? ' · ' + relDays(m.lastCooked) : '',
            ].join('')),
          ]),
          m.favorite ? el('span.pill.fav', 'favourite') : null,
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
    button('Suggest one', {
      class: 'grow',
      onclick: () => {
        const m = suggestMeal({});
        if (!m) { toast('Add some meals first'); return; }
        onPick({ meal: m.id, mode: 'cook' });
      },
    }),
    button('New meal', {
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
    button('Out / bought', {
      class: 'grow',
      onclick: async () => {
        const what = await promptFor('What did you have?', 'Bocadillo, menú del día…');
        onPick({ name: what || 'Out', mode: 'out' });
      },
    }),
    button('Something quick', {
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

function editMeal(meal, ctx, after) {
  const isNew = !meal;
  const draft = Object.assign({}, meal || newMeal());

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
    body.appendChild(field('Protein', protein));

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
            ingredients: ingredients.value.split('\n').map((s) => s.trim()).filter(Boolean),
            id: isNew ? slug(n) : draft.id,
          });
          commit(isNew
            ? { file: MEALS_FILE, op: 'push', path: ['items'], value, label: 'add meal: ' + n }
            : {
              file: MEALS_FILE, op: 'patchWhere', path: ['items'],
              key: 'id', match: draft.id, value, label: 'edit meal: ' + n,
            });
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

function renderLibrary(root, ctx) {
  const q = librarySearch.trim().toLowerCase();
  const all = meals().filter((m) => !m.archived);
  const found = all
    .filter((m) => !q || m.name.toLowerCase().includes(q)
      || (m.protein || '').toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));

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
      onclick: () => editMeal(m, ctx),
    }, [
      el('div.grow', [
        el('div.name', m.name),
        el('div.meta', [
          m.effort,
          m.protein ? ' · ' + m.protein : '',
          m.batchable ? ' · batches' : '',
          m.timesCooked ? ' · cooked ' + m.timesCooked + '×' : '',
        ].join('')),
      ]),
      m.favorite ? el('span.pill.fav', '★') : null,
    ]))), { class: 'pad0' }));
  }

  root.appendChild(el('div', { style: { marginTop: '12px' } },
    button('Add a meal', { class: 'primary wide', onclick: () => editMeal(null, ctx) })));
}

// ----------------------------------------------------------------- shopping --

function renderShopping(root, ctx) {
  const week = getWeek(shownWeek);
  const stored = ctx.read(weekFile(shownWeek)) || {};
  const shopping = stored.shopping || { extra: [], got: [] };
  const got = shopping.got || [];

  const dates = weekDates(shownWeek);
  const from = shopFrom || ymd();
  const inRange = dates.filter((d) => d >= from && week.days[d].here);

  root.appendChild(el('p.dim.small',
    'Everything you need to cook from ' + prettyDate(from) + ' to the end of the week.'));

  root.appendChild(chips(
    dates.filter((d) => week.days[d].here).map((d) => ({
      value: d,
      label: DAY_SHORT[dayKeyOf(d)] + ' ' + parseYmd(d).getDate(),
    })),
    from,
    (v) => { shopFrom = v; ctx.rerender(); },
  ));

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
        const key = ing.toLowerCase();
        if (!need.has(key)) need.set(key, { text: ing, for: [] });
        if (!need.get(key).for.includes(m.name)) need.get(key).for.push(m.name);
      }
    }
  }

  const items = [...need.values()];
  const extras = shopping.extra || [];

  const toggleGot = (text) => {
    const next = got.includes(text) ? got.filter((g) => g !== text) : got.concat([text]);
    commit({
      file: weekFile(shownWeek), op: 'set', path: ['shopping', 'got'],
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
        file: weekFile(shownWeek), op: 'set', path: ['shopping', 'extra'],
        value: extras.concat([{ id: slug(what) + '-' + Date.now().toString(36), text: what }]),
        label: 'shopping: add ' + what,
      });
      ctx.rerender();
    },
  })));

  if (extras.length) {
    root.appendChild(card(el('div.list', extras.map((x) => el('div.item', {
      onclick: () => toggleGot(x.text),
    }, [
      el('span.tick', { class: got.includes(x.text) ? 'done' : '' }, icon('check', 16)),
      el('div.grow', el('div.name', { class: got.includes(x.text) ? 'strike' : '' }, x.text)),
      el('button.icon-btn', {
        'aria-label': 'Remove',
        onclick: (e) => {
          e.stopPropagation();
          commit({
            file: weekFile(shownWeek), op: 'set', path: ['shopping', 'extra'],
            value: extras.filter((y) => y.id !== x.id), label: 'shopping: remove',
          });
          ctx.rerender();
        },
      }, icon('close', 17)),
    ]))), { class: 'pad0' }));
  }

  if (got.length) {
    root.appendChild(el('div', { style: { marginTop: '14px' } },
      button('Clear ticks', {
        class: 'ghost wide',
        onclick: () => {
          commit({
            file: weekFile(shownWeek), op: 'set', path: ['shopping', 'got'],
            value: [], label: 'shopping: reset',
          });
          ctx.rerender();
        },
      })));
  }
}

// --------------------------------------------------------------- week view --

function defaultSlots(date) {
  // Which slots a day starts with, before you touch anything.
  const week = getWeek(shownWeek);
  const day = week.days[date];
  return day ? Object.keys(day.slots) : [];
}

function slotRow(ctx, date, slotName, slot) {
  const dish = mealName(slot);
  const status = statusOf(slot);
  const filled = !!dish;

  return el('button.slot', {
    class: (filled ? 'filled' : '') + (status === 'ate' ? ' ate' : ''),
    onclick: () => slotSheet(ctx, date, slotName),
  }, [
    el('span.mode', icon(filled ? (MODE_ICON[slot.mode] || 'pot') : 'plus', 18)),
    el('div.grow', [
      el('div.label', SLOT_LABEL[slotName]),
      el('div.dish', { class: filled ? '' : 'none' }, dish || 'nothing planned'),
    ]),
    status === 'ate' ? el('span.pill.ok', 'ate it') : null,
    status === 'other' ? el('span.pill', 'ate other') : null,
    status === 'skipped' ? el('span.pill', 'skipped') : null,
  ]);
}

function dayCard(ctx, date, day) {
  const isToday = date === ymd();
  const dk = dayKeyOf(date);

  if (!day.here) {
    return el('div.card.flat.tight', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, [
      el('div.grow', [
        el('span.dim', DAY_LONG[dk] + ' ' + parseYmd(date).getDate()),
        el('span.dimmer.small', '  ·  away'),
      ]),
      button('I am here', {
        class: 'small ghost',
        onclick: () => { commit(setPresence(shownWeek, date, true)); ctx.rerender(); },
      }),
    ]);
  }

  const slotNames = SLOTS.filter((s) => day.slots[s] !== undefined);
  const missing = SLOTS.filter((s) => day.slots[s] === undefined);

  return card([
    el('div.row', { style: { marginBottom: '4px' } }, [
      el('h3', { style: { fontSize: '17px' } },
        DAY_LONG[dk] + ' ' + parseYmd(date).getDate()),
      isToday ? el('span.pill.due', 'today') : null,
      el('div.grow'),
      el('button.icon-btn', {
        'aria-label': 'Mark away',
        title: 'Not here this day',
        onclick: () => { commit(setPresence(shownWeek, date, false)); ctx.rerender(); },
      }, icon('close', 17)),
    ]),
    el('div.list', slotNames.map((s) => slotRow(ctx, date, s, day.slots[s]))),
    missing.length
      ? el('div.row', { style: { marginTop: '8px', flexWrap: 'wrap' } },
        missing.map((s) => button('+ ' + SLOT_LABEL[s], {
          class: 'small ghost',
          onclick: () => {
            commit(setSlot(shownWeek, date, s, { meal: null, name: null, mode: 'cook', status: null }));
            ctx.rerender();
            slotSheet(ctx, date, s);
          },
        })))
      : null,
  ], { class: 'pad0', style: { padding: '12px 14px' } });
}

function renderWeek(root, ctx) {
  const week = getWeek(shownWeek);
  const dates = weekDates(shownWeek);
  const isThisWeek = shownWeek === weekKey();

  root.appendChild(el('div.row', [
    el('button.icon-btn', {
      'aria-label': 'Previous week',
      onclick: () => { shownWeek = shiftWeek(shownWeek, -1); ctx.rerender(); },
    }, icon('left', 20)),
    el('div.grow', { style: { textAlign: 'center' } }, [
      el('div', { style: { fontWeight: '500' } },
        prettyDate(dates[0]) + ' – ' + prettyDate(dates[6])),
      el('div.tiny.dimmer', isThisWeek ? 'this week' : shownWeek),
    ]),
    el('button.icon-btn', {
      'aria-label': 'Next week',
      onclick: () => { shownWeek = shiftWeek(shownWeek, 1); ctx.rerender(); },
    }, icon('right', 20)),
  ]));

  // Week at a glance. Tapping toggles whether you are here that day.
  root.appendChild(el('div.week-strip', dates.map((d) => {
    const day = week.days[d];
    const planned = SLOTS.filter((s) => day.slots[s] && (day.slots[s].meal || day.slots[s].name));
    const ate = planned.filter((s) => day.slots[s].status === 'ate');
    return el('button.day-chip', {
      class: [
        day.here ? '' : 'away',
        d === ymd() ? 'today' : '',
      ].join(' ').trim(),
      'aria-label': DAY_LONG[dayKeyOf(d)] + (day.here ? ', here' : ', away'),
      onclick: () => { commit(setPresence(shownWeek, d, !day.here)); ctx.rerender(); },
    }, [
      el('span.d', DAY_SHORT[dayKeyOf(d)]),
      el('span.n', String(parseYmd(d).getDate())),
      el('span.dots', SLOTS.filter((s) => day.slots[s] !== undefined).slice(0, 4).map((s, i) =>
        el('i', {
          class: ate.length > i ? 'ate' : (planned.length > i ? 'set' : ''),
        }))),
    ]);
  })));

  if (week.away) {
    root.appendChild(el('div.banner.quiet', [
      icon('dot', 16),
      el('span', 'You are away all week. Tap a day above if that changes.'),
    ]));
  }

  for (const d of dates) {
    root.appendChild(dayCard(ctx, d, week.days[d]));
  }

  root.appendChild(el('div', { style: { marginTop: '6px' } },
    button('Away all week', {
      class: 'ghost wide',
      onclick: async () => {
        const ok = await confirmSheet('Away all week?',
          'Every day gets marked away. Nothing is deleted — your plans stay if you come back.',
          'Mark away');
        if (!ok) return;
        commit(dates.map((d) => setPresence(shownWeek, d, false)));
        ctx.rerender();
      },
    })));
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
    root.appendChild(el('div.seg', [
      ['week', 'Week'], ['library', 'Library'], ['shopping', 'Shopping'],
    ].map(([id, label]) => el('button', {
      class: view === id ? 'on' : '',
      onclick: () => { view = id; ctx.rerender(); },
    }, label))));

    if (view === 'week') renderWeek(root, ctx);
    else if (view === 'library') renderLibrary(root, ctx);
    else renderShopping(root, ctx);
  },
};
