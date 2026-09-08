// The tab registry.
//
// This is the whole "add a protein tracker later" story: write one module
// file, add one line here. Nothing else in the app needs to know it exists.

import today from './today.js';
import meals from './meals.js';
import chores from './chores.js';
import projects from './projects.js';
import inbox from './inbox.js';
import settings from './settings.js';

export const modules = [today, meals, chores, projects, inbox, settings];

export const navModules = modules.filter((m) => !m.hidden);

export function moduleById(id) {
  return modules.find((m) => m.id === id) || modules[0];
}
