// Easy. — DOM helpers.
//
// No framework. `el` builds nodes, `sheet` opens the bottom sheet that every
// edit in this app goes through, and the rest is small stuff.

// ---------------------------------------------------------------- elements --

/**
 * el('div.card.tight', { onclick }, [children])
 * el('button.primary', 'Save')
 */
export function el(spec, props, children) {
  if (props !== undefined && (typeof props === 'string' || Array.isArray(props) || props instanceof Node)) {
    children = props;
    props = {};
  }
  props = props || {};

  const m = String(spec).match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
  const tag = (m && m[1]) || 'div';
  const node = document.createElement(tag);

  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g) || []) {
      if (part[0] === '.') node.classList.add(part.slice(1));
      else node.id = part.slice(1);
    }
  }

  for (const key of Object.keys(props)) {
    const v = props[key];
    if (v === undefined || v === null || v === false) continue;
    if (key === 'tappable') continue;
    if (key === 'class') node.className += (node.className ? ' ' : '') + v;
    else if (key === 'style' && typeof v === 'object') {
      for (const k of Object.keys(v)) {
        if (k.startsWith('--')) node.style.setProperty(k, v[k]);
        else node.style[k] = v[k];
      }
    }
    else if (key === 'html') node.innerHTML = v;
    else if (key.startsWith('on') && typeof v === 'function') {
      node.addEventListener(key.slice(2), v);
    } else if (key === 'value' || key === 'checked' || key === 'disabled') {
      node[key] = v;
    } else {
      node.setAttribute(key, v === true ? '' : v);
    }
  }

  // A clickable div is invisible to a keyboard. Rows that contain their own
  // buttons (a tick, a close) cannot be <button> themselves — nested buttons
  // are invalid — so they opt in to being reachable instead.
  if (props.tappable && props.onclick) {
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target !== node) return; // let inner buttons handle their own
        e.preventDefault();
        props.onclick(e);
      }
    });
  }

  append(node, children);
  return node;
}

function append(node, children) {
  if (children === undefined || children === null || children === false) return;
  if (Array.isArray(children)) {
    for (const c of children) append(node, c);
  } else if (children instanceof Node) {
    node.appendChild(children);
  } else {
    node.appendChild(document.createTextNode(String(children)));
  }
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

// ------------------------------------------------------------------- icons --
//
// Hand-drawn on a 24 grid. Each icon is a set of stroked subpaths plus an
// optional `fill` subpath that is painted underneath in the same colour at
// low opacity — a duotone. The tab bar turns the fill up on the active tab,
// which is how iOS makes a selected glyph feel "solid" without a second
// icon set.
//
// They are deliberately not a generic icon pack. The meals icon is a pan on
// the hob with steam, chores is a broom, projects a hammer, the inbox a
// thought bubble, and "away" is the sea at Benicàssim.

const ICONS = {
  // ---- tabs
  today: {
    d: 'M3 18h18 M6.5 18a5.5 5.5 0 0 1 11 0 M12 9V6.5 M7.2 13.2 5.5 11.5 M16.8 13.2l1.7-1.7',
    fill: 'M6.5 18a5.5 5.5 0 0 1 11 0z',
  },
  meals: {
    d: 'M3.5 12h14v3a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4z M17.5 13.5H22 M8.6 9c.9-1-.9-1.6 0-2.6s-.9-1.6 0-2.6 M12.6 9c.9-1-.9-1.6 0-2.6s-.9-1.6 0-2.6',
    fill: 'M3.5 12h14v3a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4z',
  },
  chores: {
    d: 'M20 4l-8.2 8.2 M10.4 11.4l2.4 2.4 M10.4 11.4C7.2 12.5 4.7 15.5 3.6 20.6c5-1.1 8-3.5 9.2-6.8 M6.6 17.6l2.3-2.3',
    fill: 'M10.4 11.4C7.2 12.5 4.7 15.5 3.6 20.6c5-1.1 8-3.5 9.2-6.8z',
  },
  projects: {
    d: 'M15.6 3.6l2.8 2.8-6 6-2.8-2.8z M11 11 4 18',
    fill: 'M15.6 3.6l2.8 2.8-6 6-2.8-2.8z',
  },
  inbox: {
    d: 'M16.5 15H9.5a5.5 5.5 0 1 1 5.27-7h1.73a3.5 3.5 0 1 1 0 7z M4.7 18.3a1.4 1.4 0 1 0 2.8 0 1.4 1.4 0 1 0-2.8 0 M2.6 21.4a.9.9 0 1 0 1.8 0 .9.9 0 1 0-1.8 0',
    fill: 'M16.5 15H9.5a5.5 5.5 0 1 1 5.27-7h1.73a3.5 3.5 0 1 1 0 7z',
  },
  settings: {
    d: 'M4 7h3 M11 7h9 M4 12h9 M17 12h3 M4 17h1.5 M9.5 17h10.5 M7 7a2 2 0 1 0 4 0 2 2 0 1 0-4 0 M13 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0 M5.5 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
    fill: 'M7 7a2 2 0 1 0 4 0 2 2 0 1 0-4 0 M13 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0 M5.5 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
  },

  // ---- meal modes
  pot: {
    d: 'M4.5 10h15v6.5a3.5 3.5 0 0 1-3.5 3.5H8a3.5 3.5 0 0 1-3.5-3.5z M7 10V8.5A1.5 1.5 0 0 1 8.5 7h7A1.5 1.5 0 0 1 17 8.5V10 M12 7V5 M2.5 12.5h2 M19.5 12.5h2',
    fill: 'M4.5 10h15v6.5a3.5 3.5 0 0 1-3.5 3.5H8a3.5 3.5 0 0 1-3.5-3.5z',
  },
  box: {
    d: 'M4 10.5h16v7.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z M3 10.5h18 M9 10.5V8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2.5',
    fill: 'M4 10.5h16v7.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z',
  },
  out: {
    d: 'M6 3v4.5a2.5 2.5 0 0 0 5 0V3 M8.5 10V21 M17.5 3c-2 2.3-2.7 5.3-2.7 8.2 0 1.6 1.1 2.6 2.7 2.6z M17.5 13.8V21',
    fill: 'M17.5 3c-2 2.3-2.7 5.3-2.7 8.2 0 1.6 1.1 2.6 2.7 2.6z',
  },
  quick: {
    d: 'M13 2 4.5 13.5H11L10 22l8.5-11.5H12z',
    fill: 'M13 2 4.5 13.5H11L10 22l8.5-11.5H12z',
  },

  // ---- things
  protein: {
    d: 'M7.5 12h9 M4.5 7.5h3v9h-3z M16.5 7.5h3v9h-3z M2 10h2.5v4H2z M19.5 10H22v4h-2.5z',
    fill: 'M4.5 7.5h3v9h-3z M16.5 7.5h3v9h-3z',
  },
  star: {
    d: 'M12 3.6l2.5 5.3 5.8.7-4.3 4 1.1 5.8L12 16.6l-5.1 2.8 1.1-5.8-4.3-4 5.8-.7z',
    fill: 'M12 3.6l2.5 5.3 5.8.7-4.3 4 1.1 5.8L12 16.6l-5.1 2.8 1.1-5.8-4.3-4 5.8-.7z',
  },
  spark: {
    d: 'M12 3c.6 4.6 4.4 8.4 9 9-4.6.6-8.4 4.4-9 9-.6-4.6-4.4-8.4-9-9 4.6-.6 8.4-4.4 9-9z',
    fill: 'M12 3c.6 4.6 4.4 8.4 9 9-4.6.6-8.4 4.4-9 9-.6-4.6-4.4-8.4-9-9 4.6-.6 8.4-4.4 9-9z',
  },
  wave: {
    d: 'M2 10c2.2-2.2 4.4-2.2 6.6 0s4.4 2.2 6.6 0 4.4-2.2 6.6 0 M2 15.5c2.2-2.2 4.4-2.2 6.6 0s4.4 2.2 6.6 0 4.4-2.2 6.6 0',
  },
  home: {
    d: 'M4 11l8-7 8 7v9.5H4z M10 20.5V14h4v6.5',
    fill: 'M4 11l8-7 8 7v9.5H4z',
  },
  bag: {
    d: 'M6 8h12l1 12H5z M9 8V6a3 3 0 0 1 6 0v2',
    fill: 'M6 8h12l1 12H5z',
  },
  book: {
    d: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M4 19a2 2 0 0 1 2-2h13',
    fill: 'M4 5a2 2 0 0 1 2-2h13v14H6a2 2 0 0 0-2 2z',
  },
  calendar: {
    d: 'M4 5.5h16v14H4z M4 9.5h16 M8 3.5v4 M16 3.5v4',
    fill: 'M4 9.5h16v10H4z',
  },
  clock: { d: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z M12 7.5V12l3 2' },
  edit: { d: 'M4 20l4.3-1 10.2-10.2-3.3-3.3L5 15.7z M13.8 6.9l3.3 3.3' },
  copy: { d: 'M9 9h10v10H9z M5 15V5h10' },
  trash: { d: 'M4 7h16 M9.5 7V4.5h5V7 M6 7l1 13h10l1-13 M10 11v6 M14 11v6' },
  undo: { d: 'M4 10h10.5a4.5 4.5 0 0 1 0 9H9 M4 10l4-4 M4 10l4 4' },
  swap: { d: 'M4 8h13l-3-3 M20 16H7l3 3' },
  search: { d: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z M15.5 15.5 20 20' },
  send: { d: 'M21 3 3 10.5l7.5 3L14 21z M10.5 13.5 21 3' },
  more: {
    d: 'M4 12a1.2 1.2 0 1 0 2.4 0 1.2 1.2 0 1 0-2.4 0 M10.8 12a1.2 1.2 0 1 0 2.4 0 1.2 1.2 0 1 0-2.4 0 M17.6 12a1.2 1.2 0 1 0 2.4 0 1.2 1.2 0 1 0-2.4 0',
  },

  // ---- glyphs
  check: { d: 'M4.5 12.5l4.5 4.5L19.5 6.5' },
  plus: { d: 'M12 5v14 M5 12h14' },
  minus: { d: 'M5 12h14' },
  close: { d: 'M6 6l12 12 M18 6L6 18' },
  left: { d: 'M15 5l-7 7 7 7' },
  right: { d: 'M9 5l7 7-7 7' },
  down: { d: 'M6 9.5l6 6 6-6' },
  refresh: { d: 'M20 12a8 8 0 1 1-2.3-5.7 M20 4v4.5h-4.5' },
  dot: { d: 'M12 12h.01' },
};

const NS = 'http://www.w3.org/2000/svg';

function svgPath(d, attrs) {
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', d);
  for (const k of Object.keys(attrs || {})) p.setAttribute(k, attrs[k]);
  return p;
}

/**
 * icon('meals', 22)            duotone, fill at low opacity (CSS decides)
 * icon('star', 16, { solid })  fill painted fully
 */
export function icon(name, size, opts) {
  const o = opts || {};
  const def = ICONS[name] || ICONS.dot;
  const s = size || 22;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', s);
  svg.setAttribute('height', s);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', o.weight || '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'ico ico-' + name + (o.solid ? ' solid' : ''));
  if (def.fill) {
    svg.appendChild(svgPath(def.fill, { class: 'ico-fill', fill: 'currentColor', stroke: 'none' }));
  }
  svg.appendChild(svgPath(def.d));
  return svg;
}

// ------------------------------------------------------------------ pieces --

export function card(children, props) {
  return el('div.card', props || {}, children);
}

export function row(children, props) {
  return el('div.row', props || {}, children);
}

export function button(label, props) {
  return el('button.btn', Object.assign({ type: 'button' }, props || {}), label);
}

export function iconBtn(name, props, size) {
  return el('button.icon-btn', Object.assign({ type: 'button' }, props || {}), icon(name, size || 20));
}

export function empty(text, sub) {
  return el('div.empty', [el('p', text), sub ? el('p.dim', sub) : null]);
}

export function sectionTitle(text, right) {
  return el('div.section-title', [el('h2', text), right || null]);
}

/**
 * A progress ring. Two arcs on one track: `planned` sits underneath in a
 * quiet tone, `value` on top in the accent. Nothing here ever turns red —
 * a ring that is not full is a day that is not over.
 */
export function ring(opts) {
  const o = opts || {};
  const size = o.size || 64;
  const sw = o.stroke || (size >= 80 ? 8 : 5.5);
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const clamp = (x) => Math.max(0, Math.min(1, isFinite(x) ? x : 0));

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');

  const circle = (cls, frac) => {
    const e = document.createElementNS(NS, 'circle');
    e.setAttribute('cx', size / 2);
    e.setAttribute('cy', size / 2);
    e.setAttribute('r', r);
    e.setAttribute('fill', 'none');
    e.setAttribute('stroke-width', sw);
    e.setAttribute('stroke-linecap', 'round');
    e.setAttribute('class', cls);
    if (frac !== undefined) {
      e.setAttribute('stroke-dasharray', c);
      e.setAttribute('stroke-dashoffset', c * (1 - clamp(frac)));
      e.setAttribute('transform', 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')');
    }
    return e;
  };

  svg.appendChild(circle('ring-track'));
  if (o.planned !== undefined && o.planned !== null) svg.appendChild(circle('ring-planned', o.planned));
  if (o.value !== undefined && o.value !== null) svg.appendChild(circle('ring-value', o.value));

  return el('div.ring', { class: o.class || '', style: { width: size + 'px', height: size + 'px' } }, [
    svg,
    el('div.ring-center', o.center || null),
  ]);
}

// ------------------------------------------------------------------- sheet --
// Every edit goes through here. On a phone it slides up from the bottom;
// on a laptop it is a centred card.

let openSheets = 0;

export function sheet(title, build, options) {
  const opts = options || {};
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      backdrop.classList.remove('in');
      panel.classList.remove('in');
      openSheets--;
      if (openSheets === 0) document.body.classList.remove('sheet-open');
      setTimeout(() => backdrop.remove(), 260);
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(undefined); }
    };

    const body = el('div.sheet-body');
    const head = el('div.sheet-head', [
      el('h3', title || ''),
      iconBtn('close', { onclick: () => finish(undefined), 'aria-label': 'Close' }, 18),
    ]);
    const panel = el('div.sheet', { class: opts.wide ? 'wide' : '' }, [
      el('div.sheet-grab'),
      head,
      body,
    ]);

    const backdrop = el('div.backdrop', {
      onclick: (e) => { if (e.target === backdrop) finish(undefined); },
    }, panel);

    // Lets a sheet retitle itself when it swaps content in place.
    body.setTitle = (t) => { head.querySelector('h3').textContent = t; };

    build(body, finish);

    document.body.appendChild(backdrop);
    document.body.classList.add('sheet-open');
    openSheets++;
    document.addEventListener('keydown', onKey);

    requestAnimationFrame(() => {
      backdrop.classList.add('in');
      panel.classList.add('in');
      if (!opts.noAutoFocus) {
        const first = body.querySelector('input, textarea, select');
        if (first && window.matchMedia('(min-width: 768px)').matches) first.focus();
      }
    });
  });
}

/** Yes/no. Resolves true only on confirm. */
export function confirmSheet(title, message, confirmLabel, danger) {
  return sheet(title, (body, done) => {
    body.appendChild(el('p.sheet-text', message));
    body.appendChild(el('div.sheet-actions', [
      button('Cancel', { class: 'ghost', onclick: () => done(false) }),
      button(confirmLabel || 'Confirm', {
        class: danger ? 'primary danger' : 'primary',
        onclick: () => done(true),
      }),
    ]));
  }).then((v) => v === true);
}

/** One-line (or multiline) text prompt. Resolves the string, or undefined if cancelled. */
export function promptSheet(title, opts) {
  const o = opts || {};
  return sheet(title, (body, done) => {
    const input = o.multiline
      ? el('textarea.input', { rows: o.rows || 4, placeholder: o.placeholder || '' })
      : el('input.input', { type: 'text', placeholder: o.placeholder || '', value: o.value || '' });
    if (o.multiline) input.value = o.value || '';

    const submit = () => {
      const v = input.value.trim();
      if (v || o.allowEmpty) done(v);
    };
    if (!o.multiline) {
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    } else {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
      });
    }
    if (o.hint) body.appendChild(el('p.sheet-text', o.hint));
    body.appendChild(el('label.field', [o.label ? el('span', o.label) : null, input]));
    body.appendChild(el('div.sheet-actions', [
      button('Cancel', { class: 'ghost', onclick: () => done(undefined) }),
      button(o.confirmLabel || 'Save', { class: 'primary', onclick: submit }),
    ]));
    setTimeout(() => input.focus(), 60);
  });
}

// ------------------------------------------------------------ form controls --

/**
 * A labelled row in a sheet.
 *
 * Only a real form control gets a real <label>. A <label> forwards every click
 * inside it to the first labelable element it contains, so wrapping a row of
 * chip buttons in one meant tapping any chip also fired a click on the first
 * chip — which won, every time. That looked like "the highlight jumps to the
 * first option and sticks", and it was setting the value too, not just the
 * highlight.
 */
export function field(label, control, hint) {
  const tag = control && /^(INPUT|TEXTAREA|SELECT)$/.test(control.tagName || '')
    ? 'label.field'
    : 'div.field';
  return el(tag, [
    label ? el('span', label) : null,
    control,
    hint ? el('small.dim', hint) : null,
  ]);
}

export function textInput(value, props) {
  return el('input.input', Object.assign({ type: 'text', value: value || '' }, props || {}));
}

export function textArea(value, props) {
  const t = el('textarea.input', Object.assign({ rows: 3 }, props || {}));
  t.value = value || '';
  return t;
}

export function numberInput(value, props) {
  return el('input.input', Object.assign(
    { type: 'number', inputmode: 'numeric', value: value === null || value === undefined ? '' : value },
    props || {},
  ));
}

/** Native date picker. Value is a local YYYY-MM-DD or ''. */
export function dateInput(value, props) {
  return el('input.input', Object.assign({ type: 'date', value: value || '' }, props || {}));
}

/**
 * − 120 g +
 * A thumb-sized number control. `null` shows as a dash and means "not set";
 * pressing + from null starts at `opts.start`.
 */
export function stepper(value, opts, onChange) {
  const o = opts || {};
  const step = o.step || 1;
  const min = o.min === undefined ? 0 : o.min;
  const max = o.max === undefined ? Infinity : o.max;
  let cur = value === undefined ? null : value;

  const label = el('span.stepper-val');
  const draw = () => {
    label.textContent = cur === null ? (o.nullLabel || '—') : cur + (o.suffix || '');
    label.classList.toggle('none', cur === null);
  };
  const set = (v) => {
    cur = v === null ? null : Math.max(min, Math.min(max, v));
    draw();
    onChange(cur);
  };
  draw();

  return el('div.stepper', { class: o.small ? 'small' : '' }, [
    el('button.stepper-btn', {
      type: 'button', 'aria-label': 'Less',
      onclick: () => {
        if (cur === null) return;
        const next = cur - step;
        set(o.nullable && next < min ? null : next);
      },
    }, icon('minus', 14, { weight: 2.2 })),
    label,
    el('button.stepper-btn', {
      type: 'button', 'aria-label': 'More',
      onclick: () => set(cur === null ? (o.start !== undefined ? o.start : min) : cur + step),
    }, icon('plus', 14, { weight: 2.2 })),
  ]);
}

/** A row of pill options. Single select. */
export function chips(options, selected, onPick, props) {
  const wrap = el('div.chips', props || {});
  for (const opt of options) {
    const value = opt.value !== undefined ? opt.value : opt;
    const label = opt.label !== undefined ? opt.label : opt;
    const b = el('button.chip', {
      type: 'button',
      class: value === selected ? 'on' : '',
      onclick: () => onPick(value),
    }, [opt.icon ? icon(opt.icon, 15) : null, label]);
    if (opt.title) b.title = opt.title;
    wrap.appendChild(b);
  }
  return wrap;
}

/** A row of pill options. Multi select; onToggle gets the whole new array. */
export function multiChips(options, selectedArr, onToggle) {
  const sel = selectedArr || [];
  const wrap = el('div.chips');
  for (const opt of options) {
    const value = opt.value !== undefined ? opt.value : opt;
    const label = opt.label !== undefined ? opt.label : opt;
    const on = sel.indexOf(value) !== -1;
    wrap.appendChild(el('button.chip', {
      type: 'button',
      class: on ? 'on' : '',
      onclick: () => onToggle(on ? sel.filter((v) => v !== value) : sel.concat([value])),
    }, label));
  }
  return wrap;
}

/** iOS-style segmented control. Options: [{ value, label, icon? }]. */
export function segmented(options, selected, onPick) {
  return el('div.seg', options.map((o) => el('button', {
    type: 'button',
    class: o.value === selected ? 'on' : '',
    'aria-pressed': o.value === selected ? 'true' : 'false',
    onclick: () => onPick(o.value),
  }, [o.icon ? icon(o.icon, 16) : null, el('span', o.label)])));
}

export function toggle(label, on, onChange) {
  return el('button.toggle', {
    type: 'button',
    class: on ? 'on' : '',
    'aria-pressed': on ? 'true' : 'false',
    onclick: () => onChange(!on),
  }, [el('span.toggle-track', el('span.toggle-knob')), el('span', label)]);
}

/** A settings-style row: label on the left, control on the right. */
export function settingRow(label, control, sub) {
  return el('div.setting', [
    el('div.grow', [el('div.setting-label', label), sub ? el('div.small.dim', sub) : null]),
    control,
  ]);
}

// ------------------------------------------------------------------- toast --
//
// toast('Bins — done')
// toast('Tuesday marked away', '', { label: 'Undo', onclick })
//
// An action makes the toast linger a little and makes it tappable. Undo in a
// toast beats a confirm dialog: the common case costs nothing and the rare
// mistake costs one tap.

let toastTimer = null;

export function toast(message, kind, action) {
  let host = document.querySelector('.toast');
  if (!host) {
    host = el('div.toast', { role: 'status' });
    document.body.appendChild(host);
  }
  const hide = () => host.classList.remove('in');

  host.className = 'toast' + (kind ? ' ' + kind : '') + (action ? ' actionable' : '');
  // replaceChildren turns a null into the text "null" — build the list first.
  const parts = [el('span.toast-text', message)];
  if (action) {
    parts.push(el('button.toast-btn', {
      type: 'button',
      onclick: () => { hide(); action.onclick(); },
    }, action.label || 'Undo'));
  }
  host.replaceChildren(...parts);
  requestAnimationFrame(() => host.classList.add('in'));
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, action ? 4200 : 2400);
}

// ---------------------------------------------------------------- clipboard --

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older WebViews: fall back to a hidden textarea.
    try {
      const t = el('textarea', { style: { position: 'fixed', opacity: '0' } });
      t.value = text;
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand('copy');
      t.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
