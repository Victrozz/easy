---
name: easy
description: Víctor's life-admin planner, "Easy." — the public repo Victrozz/easy is its database (meals, chores, projects, protein, inbox, weekly plans). Use whenever he says "easy", or asks to add or plan a meal for a day, plan the week, add or retire a chore, mark a chore done, mark himself here or away, set a protein target, check his shopping list, add a note or check his inbox, touch a project, or run the weekly session.
---

# Easy.

A static PWA on GitHub Pages. **The repo is the database** — `Victrozz/easy`,
branch `main`, public. No server, no API. The app writes these files from his
phone; you write the same files.

**This file is self-sufficient. Do not read `CLAUDE.md` or the folder READMEs to
answer a request** — everything you need is below. Read only the files the
recipe names. Two file reads is normal; six is a sign you are exploring instead
of acting.

## Reaching the files

- **Claude Code in the repo** — edit, commit, push. Pushing is what puts it on
  his phone.
- **Chat / anywhere else** — the GitHub connector on `Victrozz/easy`, `main`.
  Reading also works with no connector at all, since the repo is public:
  `https://raw.githubusercontent.com/Victrozz/easy/main/<path>?v=<random>` (the
  `?v=` busts a five-minute CDN cache — he may have tapped something seconds
  ago). **Writing needs the connector.** If a write fails, say so plainly and
  give him the result to enter in the app. Never imply a change landed.

## The files

```
data/settings.json    default week, place, targets.protein, lastSession
data/meals.json       { items: [...] }  the library
data/chores.json      { recurring: [...], oneoff: [...] }
data/projects.json    { items: [...] }
data/inbox.jsonl      one note per line
weeks/YYYY-Www.json   one per ISO week, Monday start — SPARSE
log/YYYY-MM.jsonl     append-only history
```

**Dates.** `2026-09-07` is a Monday and is `2026-W37`; count weeks from there.
A week file that 404s means that week is untouched — that is normal. Start from
`{ "days": {} }` and add only the day you were asked about.

**Sparse means sparse.** A day appears only once touched; anything absent falls
back to the default week in `settings.json` (usually: Mon away, Tue–Thu lunch +
dinner, Fri lunch, weekend away). Never write all seven days — that freezes the
defaults and stops later changes to his usual week from applying.

**Don't write `log/`.** The app logs its own taps; your git commits are your
history. Use a commit message shaped like the app's: `plan: dinner 2026-09-10`,
`add chore: regar plantas`, `week: away on 2026-09-11`.

## Recipes

Each one lists everything to read, then everything to write. Nothing else.

### "add a simple meal for Thursday" / "put X on Wednesday lunch"

Read `data/meals.json` and `weeks/<that week>.json`.

1. **Pick or invent the meal.** If nothing in the library fits, invent one and
   append it to `items` — **you fill in `ingredients` and `proteinG`, he never
   does.** Without them the shopping list and the protein ring are dead.
   ```jsonc
   { "id": "pasta-atun", "name": "Pasta con atún", "effort": "easy",
     "tags": ["rápido"], "protein": "atún", "proteinG": 35, "favorite": false,
     "batchable": false, "servings": 1,
     "ingredients": ["pasta 100g", "atún en lata", "tomate frito", "cebolla"],
     "notes": "", "timesCooked": 0, "rejections": 0, "lastCooked": null }
   ```
   `id` is kebab-case, `effort` is `easy` | `medium` | `project`, `proteinG` is
   grams **per serving**.
2. **Write the slot** into the week file at `days["YYYY-MM-DD"].slots.<slot>`:
   ```jsonc
   { "meal": "pasta-atun", "name": null, "mode": "cook", "status": null }
   ```
   `mode` is `cook` | `leftovers` | `out` | `quick`. Cooking once for three
   lunches is one `cook` and two `leftovers` — that is prep week, there is no
   separate mode for it. `status` stays `null`; only he sets that.
   For a one-off with no library entry (eating out), use `"meal": null,
   "name": "Menú del día", "mode": "out"` and put `proteinG` on the slot itself.
3. Leave `presence` alone unless he mentioned it. Absent = his default.

**Slot not stated?** Don't ask — put it in dinner, say which slot you used in
four words, and offer to move it. Undo beats confirm.

### "I'm away Thursday" / "I'm in Valencia Monday"

Read the week file. Write `days["YYYY-MM-DD"].presence` = `"away"` | `"here"`.
Nothing else — don't touch slots, don't clear meals.

To change his *usual* week instead ("I'm never there Fridays now"), that is
`settings.json` → `week.fri` = `{ "here": false, "slots": [] }`.

### "I took the bins out" / "did the laundry on Sunday"

Read `data/chores.json`. Set `lastDone` to that date and add the same date to
`history` (sorted, no duplicates). Both, always — `history` is what the rhythm
of an unscheduled chore is read from, and a `lastDone` without it is a gap.

### "new chore: water the plants weekly"

Read `data/chores.json`, append to `recurring`:
`{ "id": "regar", "name": "Water the plants", "everyDays": 7, "lastDone": null, "history": [], "notes": "" }`
`lastDone: null` = never done, so it shows as due. `everyDays` is 1 / 7 / 14 /
30 for daily / weekly / fortnightly / monthly, or any number of days.

**`everyDays: null` means no schedule at all** — it can never be due, and the
app shows how often he actually does it instead. That is the right shape for
the loose ones ("bins", "washing up") where he wants to notice the rhythm, not
be told he is late. If he says "just track it" or "there's no real schedule",
use `null`.

### "what do I need to buy?"

Read the week file and `data/meals.json`. Take every slot with `mode: "cook"`,
collect those meals' `ingredients`, merge duplicates, group roughly by aisle.
Read nothing else. If a planned meal has no `ingredients`, fill them in and save
that too — that is the bug, not his problem.

### "set my protein target to 120"

Read `data/settings.json`, set `targets.protein`. It's currently 100.

### a half-thought — "might want cheap furniture"

Append one line to `data/inbox.jsonl`:
`{"id":"note_<random>","ts":<ms>,"date":"YYYY-MM-DD","text":"...","handled":false}`

### "what's for dinner" / "what's due"

Read **one** file — the week file for meals, `data/chores.json` for chores
(due = `lastDone` + `everyDays` ≤ today; chores with `everyDays: null` are
never due — leave them out of a "what's due" answer). Answer in two lines. Do not fetch the
rest to "have context".

### the weekly session

Only for "let's do easy", "plan the week", "sit down with me". It is the one
task that reads widely, and it has its own file — fetch and follow
`.claude/skills/easy/weekly-session.md` in this repo.

## Writing safely

Two writers, one hazard: reading a file, thinking, and writing back a version
that lost a tap he made in the meantime.

- Re-read the file immediately before you write it. Never write from a read
  earlier in the conversation. In a git checkout, `git fetch` first — he taps
  things on his phone while you work. If a push is rejected, **merge, never
  force**.
- Change as little as possible: edit the one item, don't rewrite the list.
  Preserve fields you don't understand.
- Never invent state you have not read. Anything you say about what he ate,
  owes or planned comes from a file you just opened.

## The rules underneath all of it

1. **Blank means unknown, never failed.** An unlogged meal was not skipped. A
   chore nobody ticked is due, not neglected. No streaks, no red marks, no
   "you missed" counts — anywhere, ever. Missing data is missing data: say
   "three lunches have no number on them", never "you failed three lunches".
2. **The week is however many days he is in Valencia**, not seven.
3. **Meals and chores go quiet when he is away. Projects and Inbox follow him.**
4. **He never types ingredients or protein numbers. You do.**

## Tone

He built this to stop nagging himself. Report, don't scold. No "you should
have", no motivation, no emoji-cheer. If a plan didn't survive the week, that is
information about the plan, not about him.

**On a phone, be short.** A few lines, no tables, no headers, no restating his
request back at him. He is standing in a supermarket.

He also expects to push back hard on the app itself — if he wants a tab gone,
delete it, don't defend it.
