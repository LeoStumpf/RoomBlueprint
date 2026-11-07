'use strict';
// Compares analyze() and fsEstimate() with the private baseline, on the private project as the import reads it. Both
// hold private room data and therefore live outside the repo. Skipped where they do not exist.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, plain, PRIVATE_DIR, PROJECT_SCRIPTS } = require('./load');

const file = process.env.ROOM_BASELINE || path.join(PRIVATE_DIR, 'baseline.json');
const projectFile = path.join(PRIVATE_DIR, 'private-project.json');
const missing = ![file, projectFile].every(fs.existsSync);

test('layouts match the baseline', { skip: missing && 'no private baseline' }, () => {
  const { get } = load(PROJECT_SCRIPTS);
  const { project } = get('parseProjectFile')(JSON.parse(fs.readFileSync(projectFile, 'utf8')));
  const baseline = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(baseline.presets.length > 0);
  for (const want of baseline.presets) {
    const layout = project.layouts[want.index];
    assert.equal(layout.name, want.name);
    const items = get('layoutItems')(project, layout);
    const { issues } = get('analyze')(items, project.room);
    assert.deepEqual(plain(issues), want.issues, `issues of ${want.name}`);
    const est = get('fsEstimate')(get('fengShui')(items, project.room), items, project.room);
    assert.deepEqual(plain(est), want.fsEstimate, `fsEstimate of ${want.name}`);
  }
});

// The optional local project folder holds the same project for everyday use. Its layouts must score as the baseline says,
// after the trip through the local script and the checks a browser applies on reading it.
const localFile = path.join(PRIVATE_DIR, 'local/projects.js');
test('the local project folder scores like the baseline', { skip: (missing || !fs.existsSync(localFile)) && 'no local project folder' }, () => {
  const { get, ctx } = load(PROJECT_SCRIPTS);
  require('node:vm').runInContext(fs.readFileSync(localFile, 'utf8'), ctx);
  const entries = get('localEntries')();
  assert.ok(entries.length > 0);
  const { project: fromFile } = get('parseProjectFile')(JSON.parse(fs.readFileSync(projectFile, 'utf8')));
  const project = entries.find(e => e.project.layouts.length === fromFile.layouts.length)?.project;
  assert.ok(project, 'one local project holds every layout of the private file');
  assert.deepEqual(plain(project.layouts), plain(fromFile.layouts), 'every preset and saved variant, with its texts');
  assert.deepEqual(plain(project.furniture), plain(fromFile.furniture));
  assert.deepEqual(plain(project.room), plain(fromFile.room));
  assert.deepEqual(plain(project.weights), plain(fromFile.weights));
  const baseline = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const want of baseline.presets) {
    const layout = project.layouts[want.index];
    assert.equal(layout.name, want.name);
    const items = get('layoutItems')(project, layout);
    assert.deepEqual(plain(get('analyze')(items, project.room).issues), want.issues, `issues of ${want.name}`);
    const est = get('fsEstimate')(get('fengShui')(items, project.room), items, project.room);
    assert.deepEqual(plain(est), want.fsEstimate, `fsEstimate of ${want.name}`);
  }
});
