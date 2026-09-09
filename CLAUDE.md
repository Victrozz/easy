# Easy. — working agreement

A personal life-admin app for Víctor. House chores, meals, projects, protein,
and a place to dump half-thoughts. It is a static site on GitHub Pages and a
PWA on his iPhone, iPad and laptop.

**The repo is the database.** There is no server and no external service. The
app reads and writes these JSON files through the GitHub API using a
fine-grained token that lives only on his devices. Claude reads and writes the
same files through the GitHub connector. That is the whole design: one set of
files, two writers, no sync layer in between.

## How Claude works on this project

**Claude writes everything here.** This is the opposite of the `pvz` repo,
where Víctor writes all the code himself. He explicitly does not want to build
this one — he wants to use it. So: make the change, test it, push it, tell him
what changed in a sentence.

He expects to push back hard. "I might shit on it and ask you to overhaul it
or just remove it." Treat every part of this as provisional. If he wants a tab
gone, delete it — do not defend it.

## The rules the app is built on

Break these and the app stops being trustworthy.

1. **Blank means unknown, never failed.** An unlogged meal was not skipped. A
   chore nobody ticked is due, not neglected. A protein ring that is not full
   is a day that is not over, or a meal with no number on it yet. There are no
   streaks, no red marks, no "you missed 4 meals" counters anywhere, and there
   never will be. This is the single most important rule.
2. **The week is not seven days.** It is however many days he is actually in
   Valencia. Default: Monday away, Tue–Thu lunch and dinner, Friday lunch
   only, weekend away. Every day is individually toggleable, every week.
3. **Meals and chores go quiet when he is away. Projects and Inbox do not.**
   Those two follow him to Benicàssim.
4. **Prep-week and yolo-day are the same mechanism.** Every slot has a mode:
   `cook`, `leftovers`, `out`, `quick`. Cooking once for three lunches is one
   `cook` and two `leftovers`. There is no separate "meal prep mode".
5. **He should never have to type ingredients or protein numbers.** That job
   is Claude's, during planning. The shopping list only exists because Claude
   fills in `ingredients` on the meals he actually uses; the protein ring only
   means something because Claude puts `proteinG` on them.
6. **Undo beats confirm.** Quick actions (tick, away, clear, "not this") show
   a toast with Undo instead of asking first. Only deletes confirm.

## Files

```
data/settings.json    default week, place, targets.protein, proteinPresets, lastSession
data/meals.json       the library — { items: [...] }
data/chores.json      { recurring: [...], oneoff: [...] }
data/projects.json    { items: [...] }
data/inbox.jsonl      one note per line, newest last
weeks/YYYY-Www.json   one file per ISO week (Monday start) — SPARSE, see below
log/YYYY-MM.jsonl     append-only history, one event per line
```

`weeks/` and `log/` each have a README explaining their shape. Read
`weeks/README.md` before touching a week file.

**Week files are sparse.** A day only appears once it has been touched;
anything absent falls back to `data/settings.json`. Do not "fill in" a week
file with every day — that would freeze the defaults into it and make later
changes to his usual week stop applying.

### Shapes

```jsonc
// meals.json item
{ "id": "lentejas", "name": "Lentejas", "effort": "easy|medium|project",
  "tags": [], "protein": "lentejas", "proteinG": 30, "favorite": false,
  "batchable": true, "servings": 4, "ingredients": ["lentejas 500g", "..."],
  "notes": "", "timesCooked": 0, "rejections": 0, "lastCooked": null }
//   protein   the source, a word.  proteinG  grams per serving, or null = unknown

// chores.json recurring item
{ "id": "basura", "name": "Take the bins out", "everyDays": 3,
  "lastDone": "2026-09-09", "notes": "" }

// projects.json item
{ "id": "bots-vs-bugs", "name": "...", "why": "", "nextStep": "",
  "lastTouched": "2026-09-09", "status": "active|paused|done", "notes": "" }

// a slot inside a week file
{ "meal": "lentejas", "name": null, "mode": "cook", "status": null, "proteinG": 40 }
//   name      used instead of meal for one-off "out"/"quick" entries
//   status    null | "ate" | "other" | "skipped"   — null means UNKNOWN
//   proteinG  optional, only on one-offs; a library meal carries its own

// settings.json extras
{ "place": "Valencia",
  "targets": { "protein": 120, "fiber": null },          // null = no target
  "proteinPresets": [{ "name": "Whey", "proteinG": 24 }], // "Add something" chips; optional
  "lastSession": "2026-09-14" }                           // set by Claude after a session
```

`rejections` is the interesting field. It counts the times he hit "Not this"
on a meal. High rejections plus high `timesCooked` means he is bored of it.

### The channels he uses to talk to Claude from the app

- **`notes` on a week file** — "exam Thursday, keep it easy". The Week view
  shows it at the top. Read it first when planning that week.
- **`days[date].note`** — a line on one day ("dinner at Marta's").
- **`data/inbox.jsonl`** — anything. Unhandled notes are the agenda.
- **The "Claude will see" card on Today** lists what the next session picks
  up on its own: open notes, planned meals lacking `ingredients` or
  `proteinG`, projects with no `nextStep`, the week note. He expects those to
  be handled without having to mention them.
- **Settings → Claude** shows example phrases. Keep them true: plan the week,
  put protein numbers on meals, add/retire chores, backdate a chore, set
  presence for a day.

## Writing to these files

Two writers means one real hazard: reading a file, thinking about it for a
while, and writing back a version that has lost a tap he made in the meantime.

- Read the file immediately before you write it.
- Change as little as possible. Prefer editing one item over rewriting a list.
- Never write `weeks/` or `data/` from a stale read earlier in a conversation.
- The app is safe here — it queues *mutations*, not documents, and replays
  them onto whatever is current. Claude has no such protection, so be careful.

If you clobber something, `log/` has the history to reconstruct it.

## The weekly session

Roughly weekly, Víctor sits down with Claude. **It is not an interview.**
The shape is:

1. Read `weeks/` for the last two weeks and `log/` for the month. Read the
   coming week's `notes` if there is one.
2. Tell him what actually happened versus what was planned — plainly, with no
   scolding. If he planned seven meals and cooked three, the *plan* was wrong.
3. Plan the coming week: fill `weeks/YYYY-Www.json`, respecting his presence
   and the "don't repeat last week except favourites and easy ones" rule.
4. Fill in `ingredients` and `proteinG` for anything you planned that lacks
   them, so the shopping list and the ring work. If he has a protein target,
   sanity-check the plan against it — and say so, do not silently pad it.
5. The questions are whatever you hit while doing the above. Ask them as they
   come up, in the middle of useful work. Never open with a questionnaire.
6. Set `lastSession` in `data/settings.json` to today.

Also worth checking: chores with no `lastDone` in a long time, projects with
no `nextStep`, unhandled items in `data/inbox.jsonl`, meals with
`proteinG: null`.

## The app

No build step, no dependencies. `app/main.js` is the shell (floating glass
header, scrolling main, floating tab bar — built once, only the main is
re-rendered), `app/model.js` the rules, `app/store.js` the sync, `app/ui.js`
the DOM helpers and the icon set, `app/style.css` the look.

Routing is `#tab` or `#tab/view` — `#meals/protein` opens the Protein view
inside Meals. A module reads `ctx.sub` and calls `ctx.nav(id, view)`.

### Adding a tab

One file, one line. `app/modules/fibre.js`:

```js
export default {
  id: 'fibre', label: 'Fibre', icon: 'today',
  files: ['data/fibre.json'],            // loaded at boot
  extraFiles() { return []; },           // optional, dynamic (see meals.js)
  badge() { return 0; },                 // optional dot in the nav
  title: () => 'Fibre',
  render(root, ctx) { /* ctx: rerender, nav, read, place, sub */ },
};
```

Then add it to the array in `app/modules/index.js` and to `SHELL` in
`sw.js`. Five tabs is the comfortable maximum for the bottom bar — a sixth
wants either an overflow or folding into an existing tab. Protein lives
inside Meals (`app/modules/protein.js` is a view, not a tab) for exactly
that reason; fibre would go the same way.

To change a value, build a mutation and pass it to `commit()` from
`model.js` — never mutate the loaded data directly, or it will not sync.
The ops are `set`, `merge`, `push`, `removeWhere`, `patchWhere`, `unset`.
Use `removeWhere`/`patchWhere` with an id rather than an array index.

Icons are hand-drawn paths in `app/ui.js` (`ICONS`), 24-grid, stroke plus an
optional duotone `fill`. Add one there rather than pasting an icon pack in.

### Before pushing a change to the app

```bash
node tools/check.mjs && node tools/test-store.mjs && node tools/test-model.mjs && node tools/release.mjs
git add -A && git commit && git push
node tools/verify-deploy.mjs --wait
```

- `check.mjs` — imports resolve, sw precache list is real, JSON parses
- `test-store.mjs` — the sync layer, including the conflict case
- `test-model.mjs` — the rules: sparse weeks, protein maths, notes
- `release.mjs` — **stamps sw.js with a content hash.** Skip it and his phone
  keeps serving the old app out of cache with no visible error.
- `verify-deploy.mjs` — compares every shell file on the live site against
  disk. **Do not skip this either.** Pages does not deploy atomically across
  its CDN; the first deploy of this app put a stale `today.js` into the
  service worker cache under a fresh version name. The worker now cache-busts
  its precache fetches, but this is the check that proves a deploy landed.

Pages takes roughly a minute. `--wait` polls.

To look at it locally: `python -m http.server 8765` in the repo, then
`http://127.0.0.1:8765`. Without a token it runs read-only off the static
files, which is enough to see every screen.

## Standing facts about Víctor

Fill these in as they come up; this section is what makes planning good
instead of generic.

- Lives in Valencia during the week (term time), Benicàssim otherwise.
- Usually there Tuesday through Friday, and not all of Friday. Sometimes
  Monday, occasionally the weekend. Class being off changes it entirely.
- Also building **Bots vs Bugs**, a Godot game, in the `pvz` repo. In that
  repo he writes all the code and Claude does not — different rules there.
- _Protein target: settable in the app now (Settings → You, or Meals →
  Protein). Not set as of 2026-09-09._
- _What he will not eat: unknown._
- _How long he will realistically cook on a weeknight: unknown._
- _Kitchen equipment: unknown (oven? microwave only?)._
