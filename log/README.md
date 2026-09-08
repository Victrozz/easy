# log/

Append-only history, one file per month: `YYYY-MM.jsonl`, one JSON object per
line.

Nothing in the app reads these. They exist so that "what actually happened
last month" has an answer that is not a guess, and so a bad edit is always
recoverable.

Event types: `chore.done`, `task.done`, `meal.planned`, `meal.ate`,
`meal.other`, `meal.skipped`, `meal.rejected`, `meal.moved`, `meal.batched`,
`project.touched`, `inbox.add`.

`meal.rejected` is the interesting one — it records what Víctor pushed away
and what replaced it.
