'use strict';
// The optional local project folder: a gitignored local/projects.js that only pages on this computer load, and whose
// projects join a browser once without ever overwriting later work.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ROOT, load, plain, PROJECT_SCRIPTS } = require('./load');
const { localScript, readLocalScript } = require('../tools/local-project');

// ---------- Loader ----------

function page(at) {
  const added = [];
  const document = {
    head: { append: s => { added.push(s); queueMicrotask(() => (s.src.includes('missing') ? s.onerror() : s.onload())); } },
    createElement: () => ({ remove() { this.removed = true; } }),
  };
  return { added, ...load(['js/platform.js'], { location: at, document }) };
}

test('only pages on this computer count as local', () => {
  const is = page({ protocol: 'file:' }).get('isLocalPage');
  for (const at of [{ protocol: 'file:', hostname: '' }, { protocol: 'http:', hostname: 'localhost' },
    { protocol: 'http:', hostname: '127.0.0.1' }, { protocol: 'http:', hostname: '[::1]' }]) assert.equal(is(at), true, JSON.stringify(at));
  for (const at of [{ protocol: 'https:', hostname: 'someone.github.io' }, { protocol: 'http:', hostname: '192.168.1.20' },
    { protocol: 'http:', hostname: 'localhost.example.com' }, { protocol: 'https:', hostname: '127.0.0.1.nip.io' }]) assert.equal(is(at), false, JSON.stringify(at));
});

test('on any other host the loader asks for nothing, so a static host shows no 404', async () => {
  for (const hostname of ['someone.github.io', '192.168.1.20']) {
    const p = page({ protocol: 'https:', hostname });
    assert.equal(await p.get('loadLocalScript')('local/projects.js'), false);
    assert.equal(p.added.length, 0, hostname);
  }
});

test('from disk or this computer it inserts the script, and a missing file is no error', async () => {
  const disk = page({ protocol: 'file:', hostname: '' });
  assert.equal(await disk.get('loadLocalScript')('local/projects.js'), true);
  assert.equal(disk.added[0].src, 'local/projects.js');
  const host = page({ protocol: 'http:', hostname: '127.0.0.1' });
  assert.equal(await host.get('loadLocalScript')('local/missing.js'), false);
  assert.equal(host.added[0].removed, true, 'the failed tag is taken out again');
});

test('without a document, as in a shell or a test, it does nothing', async () => {
  const { get } = load(['js/platform.js'], { location: { protocol: 'file:' } });
  assert.equal(await get('loadLocalScript')('local/projects.js'), false);
});

test('no page names the local folder itself, only app.js asks for it through the loader', () => {
  for (const f of ['index.html', 'room-check.html', 'compare.html'])
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, f), 'utf8'), /local\//, f);
  const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  assert.match(app, /loadLocalScript\(LOCAL_SCRIPT\)/);
  assert.match(app, /const LOCAL_SCRIPT = 'local\/projects\.js'/);
});

// ---------- Projects ----------

function browser(start = {}) {
  const mem = new Map(Object.entries(start).map(([k, v]) => [k, JSON.stringify(v)]));
  const localStorage = { getItem: k => mem.get(k) ?? null, removeItem: k => { mem.delete(k); }, setItem: (k, v) => { mem.set(k, v); } };
  return { mem, ...load(PROJECT_SCRIPTS, { localStorage, location: { protocol: 'file:' } }) };
}

// Invented v1 backup, unrelated to any real room
const V1 = {
  ROOM: { w: 400, l: 500, wall: 20, balcony: { left: 100, right: 100 }, door: { fromTop: 100, w: 90, hingeTop: true } },
  DEFAULT_ITEMS: [{ id: 'bed', name: 'Bed', kind: 'bed', w: 140, d: 200, color: '#888888' }],
  PRESETS: [{ name: 'Bed left', idea: ['against the wall'], place: { bed: [20, 20, 0] } },
    { name: 'Bed right', idea: [], place: { bed: [240, 20, 0] } }],
  SETUPS: [{ name: 'Bed left', pro: ['quiet'], con: [], tip: '', now: true }],
  DEFAULT_W: { bett: 3, tisch: 1, sofa: 1, fluss: 2, zonen: 1 },
  variants: { Saved: { savedAt: 7, items: [{ id: 'bed', name: 'Bed', kind: 'bed', w: 140, d: 200, x: 30, y: 250, rot: 0 }] } },
};
const entries = (b, ids = ['local-room']) => b.get('localEntries')({ projects: ids.map(id => ({ id, createdAt: 1000, file: V1 })) });

test('a local project joins once, opens, and keeps its fixed id and the date of its file', () => {
  const b = browser();
  b.get('activeProject')();
  const added = b.get('takeLocalProjects')(entries(b));
  assert.equal(added.length, 1);
  const p = b.get('activeProject')();
  assert.equal(p.id, 'local-room');
  assert.equal(p.updatedAt, 1000, 'any later change is newer and wins a merge');
  assert.deepEqual(plain(p.layouts.map(l => l.name)), ['Bed left', 'Bed right', 'Saved']);
  assert.deepEqual(plain(p.weights), { bed: 3, desk: 1, sofa: 1, flow: 2, zones: 1 });
  assert.deepEqual(plain(p.weights), plain(p.baseWeights));
  assert.deepEqual(plain(b.get('allProjects')().map(x => x.id)), ['local-room'], 'the untouched starter room gave way');
});

test('later work is never overwritten, and a deleted local project does not come back', () => {
  const b = browser();
  const [take, active, save, remove] = ['takeLocalProjects', 'activeProject', 'saveProject', 'removeProject'].map(b.get);
  take(entries(b));
  const p = active();
  p.layouts = p.layouts.slice(0, 1);
  save(p);
  assert.deepEqual(plain(take(entries(b))), []);
  assert.equal(active().layouts.length, 1, 'the edit stays');
  remove(p.id);
  assert.deepEqual(plain(take(entries(b))), []);
  assert.equal(b.get('allProjects')().some(x => x.id === 'local-room'), false);
});

test('a project that is here already, as from the server, is left alone and only noted', () => {
  const b = browser();
  const theirs = { ...b.get('parseProjectFile')(V1).project, id: 'local-room', name: 'Edited elsewhere', updatedAt: 5000 };
  b.mem.set('roomBlueprint.project.local-room', JSON.stringify(theirs));
  b.mem.set('roomBlueprint.index', JSON.stringify({ active: 'local-room', ids: ['local-room'] }));
  assert.deepEqual(plain(b.get('takeLocalProjects')(entries(b))), []);
  assert.equal(b.get('activeProject')().name, 'Edited elsewhere');
  assert.deepEqual(JSON.parse(b.mem.get('roomBlueprint.local')), ['local-room']);
});

test('a starter room that was edited stays next to the local project', () => {
  const b = browser();
  const starter = b.get('activeProject')();
  b.get('saveProject')(starter);
  b.get('takeLocalProjects')(entries(b));
  assert.deepEqual(plain(b.get('allProjects')().map(x => x.id)), [starter.id, 'local-room']);
  assert.equal(b.get('activeProject')().id, 'local-room');
});

test('a local project whose name is taken gets a free one', () => {
  const b = browser();
  b.get('addProject')(b.get('starterProject')(undefined, 'Local project'));
  b.get('takeLocalProjects')(entries(b));
  assert.equal(b.get('readProject')('local-room').name, 'Local project (2)');
});

test('restoring adds the saved state as a new project and changes nothing else', () => {
  const b = browser();
  b.get('takeLocalProjects')(entries(b));
  const before = b.get('readProject')('local-room');
  const [copy] = b.get('restoreLocalProjects')(entries(b));
  assert.notEqual(copy.id, 'local-room');
  assert.equal(copy.name, 'Local project (restored)');
  assert.equal(copy.layouts.length, 3);
  assert.deepEqual(plain(b.get('readProject')('local-room')), plain(before));
  assert.equal(b.get('activeProject')().id, copy.id);
});

test('only well-formed entries count', () => {
  const b = browser();
  const good = { id: 'local-a', createdAt: 1, file: V1 };
  const got = b.get('localEntries')({ projects: [good, { ...good }, { id: 'p-123', file: V1 }, { id: 'local-B', file: V1 },
    { id: 'local-c', file: { nonsense: 1 } }, null, 'x', { id: 'local-d', createdAt: -5, file: V1 }] });
  assert.deepEqual(plain(got.map(e => [e.id, e.createdAt])), [['local-a', 1], ['local-d', 1]]);
  for (const bad of [undefined, null, 3, {}, { projects: 'x' }]) assert.deepEqual(plain(b.get('localEntries')(bad)), []);
  assert.deepEqual(plain(b.get('takeLocalProjects')([])), []);
  assert.equal(b.mem.has('roomBlueprint.local'), false, 'nothing is written without local projects');
});

// ---------- Writing the folder ----------

test('tools/local-project.js writes a script the planner reads back, and keeps other entries', () => {
  const one = localScript(V1, { id: 'local-one', name: 'One', createdAt: 10 });
  const two = localScript(V1, { id: 'local-two', createdAt: 20 }, one.text);
  const again = localScript(V1, { id: 'local-one', name: 'One again', createdAt: 30 }, two.text);
  assert.deepEqual(plain(readLocalScript(again.text).map(e => [e.id, e.createdAt, e.file.name])),
    [['local-two', 20, 'Local project'], ['local-one', 30, 'One again']]);
  const b = browser();
  const ctx = b.ctx;
  require('node:vm').runInContext(again.text, ctx);
  const got = b.get('localEntries')();
  assert.equal(got.length, 2);
  assert.deepEqual(plain(got[1].project.layouts.map(l => l.name)), ['Bed left', 'Bed right', 'Saved']);
  assert.throws(() => localScript(V1, { id: 'Mine' }), /local-my-room/);
});

// ---------- Keeping it out of the repo ----------

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

test('.gitignore covers the local folder, also as a link', () => {
  assert.match(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8'), /^\/local$/m, 'no trailing slash, which would miss a link');
  assert.equal(git('check-ignore', '--no-index', 'local').trim(), 'local');
});

test('git tracks nothing from the local folder', () => {
  const files = git('ls-files', '--cached', '--others', '--exclude-standard').split('\n');
  assert.deepEqual(files.filter(f => f === 'local' || f.startsWith('local/')), []);
  for (const f of files.filter(f => f.endsWith('.js') && fs.existsSync(path.join(ROOT, f)) && f !== 'tests/local.test.js'))
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, f), 'utf8'), /ROOM_BLUEPRINT_LOCAL = \{\s*"version"/, f);
});
