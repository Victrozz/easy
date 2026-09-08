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
    if (key === 'class') node.className += (node.className ? ' ' : '') + v;
    else if (key === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (key === 'html') node.innerHTML = v;
    else if (key.startsWith('on') && typeof v === 'function') {
      node.addEventListener(key.slice(2), v);
    } else if (key === 'value' || key === 'checked' || key === 'disabled') {
      node[key] = v;
    } else {
      node.setAttribute(key, v === true ? '' : v);
    }
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

// ------------------------------------------------------------------ pieces --

export function icon(name, size) {
  const paths = {
    today: 'M4 5h16v15H4z M4 9h16 M8 3v4 M16 3v4',
    meals: 'M6 3v8a3 3 0 0 0 6 0V3 M9 11v10 M17 3c-1.5 2-2 4-2 6s.5 3 2 3 2-1 2-3-.5-4-2-6z M17 12v9',
    chores: 'M4 20h16 M7 20V9l5-5 5 5v11 M10 20v-6h4v6',
    projects: 'M3 7h6l2 2h10v10H3z M3 7V5h6l2 2',
    inbox: 'M3 12h5l2 3h4l2-3h5 M3 12l3-8h12l3 8v7H3z',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1L14.5 3h-4l-.4 2.6a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z',
    check: 'M4 12l5 5L20 6',
    plus: 'M12 5v14 M5 12h14',
    close: 'M6 6l12 12 M18 6L6 18',
    left: 'M15 5l-7 7 7 7',
    right: 'M9 5l7 7-7 7',
    refresh: 'M20 12a8 8 0 1 1-2.3-5.7 M20 4v4h-4',
    pot: 'M5 9h14v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z M3 11h2 M19 11h2 M9 6V4 M15 6V4',
    fridge: 'M6 3h12v18H6z M6 10h12 M9 6v2 M9 13v3',
    out: 'M4 19h16 M6 19V9l6-4 6 4v10 M10 19v-5h4v5',
    quick: 'M13 3L5 14h6l-2 8 8-11h-6z',
    dot: 'M12 12h.01',
  };
  const s = size || 22;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', s);
  svg.setAttribute('height', s);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of (paths[name] || paths.dot).split(' M')) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d.trim().startsWith('M') ? d : 'M' + d);
    svg.appendChild(p);
  }
  return svg;
}

export function card(children, props) {
  return el('div.card', props || {}, children);
}

export function row(children, props) {
  return el('div.row', props || {}, children);
}

export function button(label, props) {
  return el('button.btn', Object.assign({ type: 'button' }, props || {}), label);
}

export function empty(text, sub) {
  return el('div.empty', [el('p', text), sub ? el('p.dim', sub) : null]);
}

export function sectionTitle(text, right) {
  return el('div.section-title', [el('h2', text), right || null]);
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
      setTimeout(() => backdrop.remove(), 220);
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(undefined); }
    };

    const body = el('div.sheet-body');
    const panel = el('div.sheet', [
      el('div.sheet-grab'),
      el('div.sheet-head', [
        el('h3', title || ''),
        el('button.icon-btn', { onclick: () => finish(undefined), 'aria-label': 'Close' }, icon('close', 20)),
      ]),
      body,
    ]);

    const backdrop = el('div.backdrop', {
      onclick: (e) => { if (e.target === backdrop) finish(undefined); },
    }, panel);

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

/** One-line text prompt. Resolves the string, or undefined if cancelled. */
export function promptSheet(title, opts) {
  const o = opts || {};
  return sheet(title, (body, done) => {
    const input = o.multiline
      ? el('textarea.input', { rows: 4, placeholder: o.placeholder || '' })
      : el('input.input', { type: 'text', placeholder: o.placeholder || '', value: o.value || '' });
    if (o.multiline) input.value = o.value || '';

    const submit = () => {
      const v = input.value.trim();
      if (v) done(v);
    };
    if (!o.multiline) {
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    }
    body.appendChild(el('label.field', [o.label ? el('span', o.label) : null, input]));
    body.appendChild(el('div.sheet-actions', [
      button('Cancel', { class: 'ghost', onclick: () => done(undefined) }),
      button(o.confirmLabel || 'Save', { class: 'primary', onclick: submit }),
    ]));
    setTimeout(() => input.focus(), 60);
  });
}

// ------------------------------------------------------------ form controls --

export function field(label, control, hint) {
  return el('label.field', [
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
    }, label);
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

export function toggle(label, on, onChange) {
  return el('button.toggle', {
    type: 'button',
    class: on ? 'on' : '',
    'aria-pressed': on ? 'true' : 'false',
    onclick: () => onChange(!on),
  }, [el('span.toggle-track', el('span.toggle-knob')), el('span', label)]);
}

// ------------------------------------------------------------------- toast --

let toastTimer = null;

export function toast(message, kind) {
  let host = document.querySelector('.toast');
  if (!host) {
    host = el('div.toast');
    document.body.appendChild(host);
  }
  host.className = 'toast' + (kind ? ' ' + kind : '');
  host.textContent = message;
  requestAnimationFrame(() => host.classList.add('in'));
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => host.classList.remove('in'), 2600);
}
