# weeks/

One file per ISO week, named `YYYY-Www.json`. Monday starts the week.

These files are **sparse**: a day only appears once it has actually been
touched. Anything absent falls back to the default week in
`data/settings.json`. That is why browsing to next week in the app does not
create a commit.

```jsonc
{
  "days": {
    "2026-09-09": {
      "presence": "here",              // or "away". absent = use the default
      "slots": {
        "lunch":  { "meal": "lentejas", "mode": "cook",      "status": "ate" },
        "dinner": { "meal": "lentejas", "mode": "leftovers", "status": null  }
      }
    }
  },
  "shopping": { "extra": [], "got": [] }
}
```

`mode` is one of `cook`, `leftovers`, `out`, `quick`.
`status` is `null` (not logged), `ate`, `other`, or `skipped`.

**`null` means unknown, not failed.** Do not read an unlogged meal as a meal
that was skipped.
