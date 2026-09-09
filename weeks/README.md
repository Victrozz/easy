# weeks/

One file per ISO week, named `YYYY-Www.json`. Monday starts the week.

These files are **sparse**: a day only appears once it has actually been
touched. Anything absent falls back to the default week in
`data/settings.json`. That is why browsing to next week in the app does not
create a commit.

```jsonc
{
  "notes": "exam Thursday, keep it easy",   // one line for Claude, read when planning
  "days": {
    "2026-09-09": {
      "presence": "here",              // or "away". absent = use the default
      "note": "dinner at Marta's",     // optional, shown on the day
      "slots": {
        "lunch":  { "meal": "lentejas", "mode": "cook",      "status": "ate" },
        "dinner": { "meal": "lentejas", "mode": "leftovers", "status": null  },
        "snack":  { "meal": null, "name": "Menú del día", "mode": "out",
                    "status": "ate", "proteinG": 40 }   // one-offs may carry their own number
      },
      "extras": [                      // eaten outside the plan; counts today
        { "id": "x_abc", "name": "Yogurt", "proteinG": 10, "ts": 1788908921723 }
      ]
    }
  },
  "shopping": { "extra": [], "got": [] }
}
```

`mode` is one of `cook`, `leftovers`, `out`, `quick`.
`status` is `null` (not logged), `ate`, `other`, or `skipped`.

**`null` means unknown, not failed.** Do not read an unlogged meal as a meal
that was skipped.

Protein for a slot comes from the meal's `proteinG` in `data/meals.json`
(per serving), unless the slot has its own `proteinG`. A dish with no number
shows as "no number" in the app — that is a request for Claude, not a zero.
