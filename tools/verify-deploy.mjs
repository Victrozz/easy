// Confirms the live site actually serves what is on disk.
//
//   node tools/verify-deploy.mjs [--wait]
//
// GitHub Pages does not deploy atomically across its CDN. sw.js can go live
// seconds before the files it precaches, and a service worker installing in
// that window will cache stale copies under a fresh version name — a
// half-updated app with no visible error. This is the check that stops it.
//
// --wait polls until everything matches or five minutes pass.

import fs from 'node:fs';
import crypto from 'node:crypto';

const BASE = 'https://victrozz.github.io/easy/';
const wait = process.argv.includes('--wait');

const sw = fs.readFileSync('sw.js', 'utf8');
const shellBlock = sw.slice(sw.indexOf('const SHELL'), sw.indexOf('];', sw.indexOf('const SHELL')));
const files = [...shellBlock.matchAll(/'\.\/([^']*)'/g)]
  .map((m) => m[1])
  .filter(Boolean);
files.push('sw.js');

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);

async function check() {
  const bad = [];
  for (const f of files) {
    const local = fs.readFileSync(f);
    let live;
    try {
      const res = await fetch(BASE + f + '?cb=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) { bad.push([f, 'HTTP ' + res.status]); continue; }
      live = Buffer.from(await res.arrayBuffer());
    } catch (e) {
      bad.push([f, e.message]);
      continue;
    }
    // Git normalises to LF; compare that way so CRLF checkouts do not lie.
    const norm = (b) => Buffer.from(b.toString('binary').split('\r\n').join('\n'), 'binary');
    if (sha(norm(local)) !== sha(norm(live))) {
      bad.push([f, 'local ' + sha(norm(local)) + ' != live ' + sha(norm(live))]);
    }
  }
  return bad;
}

const started = Date.now();
for (;;) {
  const bad = await check();
  if (bad.length === 0) {
    console.log('all ' + files.length + ' files live and matching');
    process.exit(0);
  }
  if (!wait || Date.now() - started > 5 * 60_000) {
    console.log(bad.length + ' of ' + files.length + ' stale or missing:');
    for (const [f, why] of bad) console.log('  ' + f + '  (' + why + ')');
    process.exit(1);
  }
  console.log(bad.length + ' still stale (' + bad.slice(0, 3).map((b) => b[0]).join(', ')
    + (bad.length > 3 ? ', …' : '') + ') — waiting');
  await new Promise((r) => setTimeout(r, 10_000));
}
