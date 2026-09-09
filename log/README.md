# log/

Append-only history, one file per month: `YYYY-MM.jsonl`, one JSON object per
line.

Nothing in the app reads these. They exist so that "what actually happened
last month" has an answer that is not a guess, and so a bad edit is always
recoverable.

Event types: `chore.done`, `task.done`, `meal.planned`, `meal.ate`,
`meal.other`, `meal.skipped`, `meal.rejected`, `meal.moved`, `meal.batched`,
`extra.added`, `protein.target`, `week.note`, `project.touched`,
`inbox.add`, `device.connected`, `app.deployed`.

`meal.rejected` is the interesting one — it records what Víctor pushed away
and what replaced it. `extra.added` is what he ate that was not in the plan.
