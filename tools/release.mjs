// Stamps the service worker with a hash of the app files, so a deploy always
// invalidates the old cache. Run before committing a change to app/ or
// index.html:
//
//   node tools/release.mjs
//
// Without this, an updated app can sit behind a cached old one on your phone
// and you would have no idea why your change did not show up.

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const files = ['index.html', 'manifest.webmanifest'];
(function walk(d) {
  for (const f of fs.readdirSync(d).sort()) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})('app');

const h = crypto.createHash('sha256');
for (const f of files.sort()) h.update(f).update(fs.readFileSync(f));
const hash = h.digest('hex').slice(0, 10);

const swPath = 'sw.js';
const sw = fs.readFileSync(swPath, 'utf8');
const next = sw.replace(/const VERSION = '[^']*';/, "const VERSION = 'easy-" + hash + "';");

if (next === sw) {
  console.error('Could not find the VERSION line in sw.js — check it by hand.');
  process.exit(1);
}

const before = (sw.match(/const VERSION = '([^']*)'/) || [])[1];
fs.writeFileSync(swPath, next);
console.log(before === 'easy-' + hash
  ? 'unchanged (' + hash + ')'
  : 'sw version ' + before + ' -> easy-' + hash + '  (' + files.length + ' files)');
