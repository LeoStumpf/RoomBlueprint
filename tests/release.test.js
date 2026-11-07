'use strict';
// What a published copy has to get right: the licence, the name, and what the repository keeps out.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ROOT } = require('./load');

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const scripts = fs.readdirSync(path.join(ROOT, 'js')).map(f => `js/${f}`);
const pages = ['index.html', 'room-check.html', 'compare.html'];

test('the licence is MIT, held by the author', () => {
  const licence = read('LICENSE');
  assert.match(licence, /^MIT License/);
  assert.match(licence, /Copyright \(c\) \d{4} Leo Stumpf/);
  assert.match(licence, /WITHOUT WARRANTY OF ANY KIND/);
});

test('every page and the server carry the product name', () => {
  for (const f of pages) assert.match(read(f), /<title>[^<]*Room Blueprint<\/title>/, f);
  for (const f of pages) assert.match(read(f), /class="brand"[^>]*>Room Blueprint</, f);
  assert.match(read('serve.py'), /Room Blueprint on http/);
});

test('the old product name is gone from everything a person sees', () => {
  for (const f of [...pages, ...scripts, 'serve.py', 'README.md', 'CONTRIBUTING.md'])
    assert.doesNotMatch(read(f), /room planner|raumplaner/i, f);
});

test('only the migration still knows the old storage keys', () => {
  for (const f of scripts.filter(f => f !== 'js/workspace.js')) assert.doesNotMatch(read(f), /roomPlanner\./, f);
});

test('exported files are named after the product', () => {
  const app = read('js/app.js');
  assert.match(app, /exportName = ext => `room-blueprint-/);
  assert.equal(app.match(/exportName\('(json|png)'\)/g).length, 2);
});

test('the README is in English and promises only what the code does', () => {
  const readme = read('README.md');
  assert.match(readme, /^# Room Blueprint/);
  assert.match(readme, /^## Privacy/m);
  assert.match(readme, /MIT/);
  assert.doesNotMatch(readme, /[äöüßÄÖÜ]|\b(und|oder|nicht|Möbel|Raum|Zimmer|Tür)\b/);
  // "Nothing leaves the browser" holds only while the pages load nothing from elsewhere
  for (const f of [...pages, ...scripts, ...fs.readdirSync(path.join(ROOT, 'css')).map(c => `css/${c}`)]) {
    const src = read(f).replaceAll('http://www.w3.org/', '');
    assert.doesNotMatch(src, /https?:\/\/|\/\/[a-z0-9-]+\.[a-z]{2,}\//i, `${f} refers to another site`);
  }
});

// A copy without .git (a ZIP download, say) has no git to ask, so only the ignore file itself is checked there
const noGit = !fs.existsSync(path.join(ROOT, '.git')) && 'not a git checkout';

test('the ignore file names server data and local leftovers', () => {
  const rules = read('.gitignore').split('\n').map(l => l.trim());
  for (const r of ['data/', '.claude/', '__pycache__/', 'node_modules/', '.DS_Store']) assert.ok(rules.includes(r), r);
});

test('the repository keeps server data and local leftovers out', { skip: noGit }, () => {
  const ignored = f => { try { execFileSync('git', ['check-ignore', '-q', f], { cwd: ROOT }); return true; } catch { return false; } };
  for (const f of ['data/projects.json', 'data/variants.json', '.claude/settings.local.json', '__pycache__/x.pyc', 'node_modules/x', '.DS_Store'])
    assert.ok(ignored(f), f);
  for (const f of ['index.html', 'demo/rooms.js', 'LICENSE']) assert.ok(!ignored(f), f);
});

test('the README shows screenshots that exist', () => {
  const shots = [...read('README.md').matchAll(/(?:\]\(|src=")(docs\/[\w-]+\.png)/g)].map(m => m[1]);
  assert.ok(shots.length >= 2, 'at least two screenshots');
  for (const f of shots) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
});
