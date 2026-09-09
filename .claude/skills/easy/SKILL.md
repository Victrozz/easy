---
name: easy
description: Víctor's life-admin planner, "Easy." — the repo Victrozz/easy is its database (meals, chores, projects, protein, inbox, weekly plans). Use whenever he says "easy", or asks to plan the week / this week / next week, add or retire a chore, add a meal or put protein numbers or ingredients on meals, mark himself here or away on a day, check his shopping list, look at his inbox notes, run the weekly session, or anything else about what he is eating, cooking, cleaning or planning.
---

# Easy.

A static PWA on GitHub Pages. **The repo is the database** — `Victrozz/easy`
(local checkout: `C:\Users\Víctor\Documents\easy`). No server, no API. The app
writes these files from his phone with a GitHub token; you write the same files.

Read `CLAUDE.md` in the repo for the full design. This skill is the operating
procedure.

## Getting at the files

- **In Claude Code, in the repo** — read and edit files directly, then commit
  and push. Pushing is what makes it appear on his phone.
- **Anywhere else (chat, Cowork, another directory)** — go through the GitHub
  connector against `Victrozz/easy` on `main`. Read the file, then write it
  back as a commit. Same rules apply.

Never invent state you have not read. Every answer about what he ate, owes or
planned comes from a file you just opened.

## The five rules that matter

1. **Blank means unknown, never failed.** An unlogged meal was not skipped. No
   streaks, no red marks, no "you missed" counts. Ever. When you report back on
   a week, missing data is missing data — say "three lunches have no number on
   them", not "you failed three lunches".
2. **The week is not seven days.** It is the days he is in Valencia. Default is
   in `data/settings.json`; `weeks/YYYY-Www.json` overrides per day. Do not plan
   meals for a day he is away.
3. **Meals and chores go quiet when away. Projects and Inbox do not.**
4. **He never types ingredients or protein numbers — you do.** Any meal you put
   in a plan must end up with `ingredients` and `proteinG` in `data/meals.json`,
   or the shopping list and the protein ring are broken.
5. **Week files are sparse.** A day appears only once touched. Never fill in a
   week file with all seven days — it freezes the defaults into it.

## Writing safely

Two writers, one hazard: reading a file, thinking, and writing back a version
that lost a tap he made in the meantime.

- Re-read the file immediately before you write it. Never write from a read
  earlier in the conversation.
- Change as little as possible — edit the one item, don't rewrite the list.
- Preserve unknown fields you don't understand.
- `log/YYYY-MM.jsonl` is append-only. Add lines, never rewrite it. It is the
  recovery path if you clobber something.
- If you edited app code, follow the pre-push checks in `CLAUDE.md`
  (`check → test-store → test-model → release → push → verify-deploy --wait`).
  Data-only edits need none of that, just a commit and push.

## The weekly session

He says "let's do easy" or "plan the week". **It is not an interview.** Do the
work, ask questions as they come up inside it.

1. Read the last two `weeks/` files, `log/` for the month, the coming week's
   `notes` if it has one, and `data/inbox.jsonl`.
2. Say what actually happened vs what was planned, plainly. If he planned seven
   meals and cooked three, **the plan was wrong** — plan fewer.
3. Write `weeks/YYYY-Www.json` for the coming week: his presence, a slot per
   meal, `mode` of `cook` / `leftovers` / `out` / `quick`. Cooking once for
   three lunches is one `cook` and two `leftovers` — that is prep week, there
   is no separate mode for it.
4. Don't repeat last week except favourites and easy ones.
5. Backfill `ingredients` and `proteinG` on every meal you used. If he has a
   protein target, check the plan against it out loud — don't silently pad it.
6. Handle the inbox notes; mark them handled.
7. Set `lastSession` in `data/settings.json` to today.

Also sweep: chores with an old or missing `lastDone`, projects with no
`nextStep`, meals with `proteinG: null`.

## One-off asks and where they land

| He says | You touch |
|---|---|
| "I'm not in Valencia Thursday" | `weeks/`, `days[date].presence = "away"` |
| "add lentejas to the library" | `data/meals.json` — with ingredients and proteinG filled in |
| "I took the bins out on Sunday" | `data/chores.json` `lastDone`, plus a `chore.done` line in `log/` |
| "new chore: water the plants weekly" | `data/chores.json` `recurring` |
| "what do I need to buy?" | derive from the week's `cook` slots + their meals' `ingredients` |
| "exam Thursday, keep it easy" | `weeks/` `notes` — then plan around it |
| a half-thought | `data/inbox.jsonl`, one JSON object per line |

## Tone

He built this to stop nagging himself. Report, don't scold. No "you should
have", no motivational lines, no emoji-cheer. If a plan didn't survive contact
with the week, that is information about the plan.

He also expects to push back hard on the app itself — if he wants a tab gone,
delete it, don't defend it.
