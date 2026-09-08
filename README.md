# Easy.

House, meals, projects. A small personal app that lives entirely in this repo.

**→ [victrozz.github.io/easy](https://victrozz.github.io/easy/)**

Add it to your home screen and it behaves like any other app: bottom tabs on a
phone, a sidebar on a laptop, works offline.

## The idea

There is no server and no database. The JSON files in `data/` and `weeks/`
**are** the app's state. The phone reads and writes them through the GitHub
API; Claude reads and writes the same files through the GitHub connector.

That is the whole point — it means you can ask Claude "plan next week's meals,
don't repeat much from last week except the favourites" and it can actually
answer, because it is looking at what you really ate rather than guessing.

## Layout

| | |
|---|---|
| `index.html`, `app/`, `sw.js` | the app. No build step, no dependencies. |
| `data/` | meals, chores, projects, inbox, settings |
| `weeks/` | one file per week — see [weeks/README.md](weeks/README.md) |
| `log/` | append-only history — see [log/README.md](log/README.md) |
| `tools/` | checks, tests, icon generation |
| `CLAUDE.md` | how Claude should work in here |

## Setup

1. **Token.** [Create a fine-grained token](https://github.com/settings/personal-access-tokens/new)
   with *Repository access → Only select repositories → `easy`* and
   *Repository permissions → Contents → Read and write*. Nothing else.
2. **Paste it** into the app's Settings tab. It is stored only on that device
   and is never written into this repo.
3. **Add to Home Screen.**

Without a token the app still opens and shows everything — it just cannot
save. So a device you only want to glance at needs no setup at all.

## Working on it

```bash
node tools/check.mjs        # imports, sw precache list, JSON
node tools/test-store.mjs   # the sync layer, incl. the conflict case
node tools/release.mjs      # stamp sw.js — do this before every push
python -m http.server 8765  # then open http://127.0.0.1:8765
```
