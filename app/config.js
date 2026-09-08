// Easy. — where the data lives.
// Everything else in the app reads from here.

export const CONFIG = {
  owner: 'Victrozz',
  repo: 'easy',
  branch: 'main',

  // Files the app loads at boot. Week files are added dynamically.
  files: [
    'data/settings.json',
    'data/meals.json',
    'data/chores.json',
    'data/projects.json',
    'data/inbox.jsonl',
  ],

  // Re-fetch from GitHub if the app has been in the background this long.
  staleAfterMs: 60_000,

  // How long to wait after your last tap before pushing a commit.
  flushDelayMs: 2500,
};

export const API = 'https://api.github.com';
