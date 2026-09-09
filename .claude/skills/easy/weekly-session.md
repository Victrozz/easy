# The weekly session

Fetched by `SKILL.md` only when he asks to sit down and plan — "let's do easy",
"plan the week". Every other request has a recipe in `SKILL.md`; don't come here
for those.

**It is not an interview.** Do the work, ask questions as they come up inside
it. Never open with a questionnaire.

## Read, once, up front

- the last two `weeks/` files (last week and this one)
- `log/YYYY-MM.jsonl` for the month
- the coming week's file if it exists — especially its `notes`
- `data/inbox.jsonl`, `data/meals.json`, `data/settings.json`

That is the one time reading widely is right.

## Then

1. **Say what happened vs what was planned.** Plainly, no scolding. If he
   planned seven meals and cooked three, **the plan was wrong** — plan five.
   Unlogged slots are unknown, not skipped: don't count them as failures.

2. **Read the week note first if there is one.** "exam Thursday, keep it easy"
   changes everything about the plan. Same for `days[date].note`.

3. **Write the coming week's file.** Presence per day, a slot per meal he'll be
   there for. Sparse — only days you actually planned.
   - Don't repeat last week, except favourites (`favorite: true`) and easy ones.
   - Weight toward `effort: "easy"` on weeknights until you know how long he
     will really cook. Ask him once, in passing, and put the answer in the
     "Standing facts" section of `CLAUDE.md`.
   - Batch properly: one `cook` with `servings: 3` feeding two later
     `leftovers` slots beats three separate cooks.

4. **Backfill.** Every meal you used must have `ingredients` and `proteinG` in
   `data/meals.json`. This is the whole reason the shopping list and the
   protein ring work.

5. **Check the plan against his protein target** (`targets.protein`, currently
   100 g) and *say so out loud* — "this lands around 90 on Tuesday" — rather
   than silently padding the day with extra food he didn't ask for.

6. **Handle the inbox.** Each unhandled line in `data/inbox.jsonl` is agenda:
   act on it, or turn it into a project / chore / meal, then set
   `"handled": true` on that line. Don't leave it sitting there having only
   been discussed.

7. **Sweep** — mention only what's actually true, skip the rest:
   - chores whose `lastDone` + `everyDays` is well past
   - chores with `lastDone: null` that have been there a while
   - projects with no `nextStep`, or `lastTouched` a long way back
   - meals with `proteinG: null` or empty `ingredients`
   - meals with high `rejections` and high `timesCooked` — he's bored of them;
     high `rejections` alone means he never wanted it, retire it

8. **Set `lastSession`** in `data/settings.json` to today's date.

## Committing

One commit per file is fine, messages like the app's: `plan: 2026-W38`,
`meals: protein + ingredients for 5`. Re-read each file immediately before
writing it — he may be tapping in the app while you plan.
