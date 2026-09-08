// Cheap static checks, since there is no build step to catch these.
//   node tools/check.mjs
//
// 1. every named import actually exists in the target module
// 2. every file the service worker precaches exists on disk
// 3. every data/*.json parses

import fs from 'node:fs';
import path from 'node:path';

let problems = 0;
const fail = (...a) => { console.log('  FAIL', ...a); problems++; };

// ---------------------------------------------------------------- imports --

const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) files.push(p);
  }
})('app');

const norm = (p) => p.split(path.sep).join('/');
const exportsOf = {};

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)/g)) {
    names.add(m[1]);
  }
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const bits = part.trim().split(/\s+as\s+/);
      if (bits[bits.length - 1]) names.add(bits[bits.length - 1].trim());
    }
  }
  if (/export\s+default/.test(src)) names.add('default');
  exportsOf[norm(f)] = names;
}

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/import\s*(?:([A-Za-z0-9_$]+)\s*,\s*)?\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
    const target = norm(path.normalize(path.join(path.dirname(f), m[3])));
    const have = exportsOf[target];
    if (!have) { fail('no such module', target, '<-', f); continue; }
    if (m[1] && !have.has('default')) fail('no default export in', target, '<-', f);
    for (const raw of m[2].split(',')) {
      const n = raw.trim().split(/\s+as\s+/)[0].trim();
      if (n && !have.has(n)) fail('missing export', JSON.stringify(n), 'in', target, '<-', f);
    }
  }
  for (const m of src.matchAll(/import\s+([A-Za-z0-9_$]+)\s+from\s*'([^']+)'/g)) {
    const target = norm(path.normalize(path.join(path.dirname(f), m[2])));
    const have = exportsOf[target];
    if (!have) { fail('no such module', target, '<-', f); continue; }
    if (!have.has('default')) fail('no default export in', target, '<-', f, '(as ' + m[1] + ')');
  }
}

// ---------------------------------------------------------- service worker --

const sw = fs.readFileSync('sw.js', 'utf8');
const shell = sw.slice(sw.indexOf('const SHELL'), sw.indexOf('];', sw.indexOf('const SHELL')));
for (const m of shell.matchAll(/'\.\/([^']*)'/g)) {
  if (m[1] === '') continue;
  if (!fs.existsSync(m[1])) fail('sw precaches a file that does not exist:', m[1]);
}

// ------------------------------------------------------------------- data --

for (const f of fs.readdirSync('data')) {
  if (!f.endsWith('.json')) continue;
  try { JSON.parse(fs.readFileSync(path.join('data', f), 'utf8')); } catch (e) {
    fail('bad json', f, e.message);
  }
}

// --------------------------------------------------------- unused warnings --

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const body = src.replace(/^import[\s\S]*?from\s*'[^']+';/gm, '');
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
    for (const raw of m[1].split(',')) {
      const n = raw.trim().split(/\s+as\s+/).pop().trim();
      if (!n) continue;
      const used = new RegExp('\\b' + n.replace(/\$/g, '\\$') + '\\b').test(body);
      if (!used) console.log('  note  unused import', n, 'in', f);
    }
  }
}

console.log(problems ? '\n' + problems + ' problem(s)' : '\nchecks passed');
process.exit(problems ? 1 : 0);
