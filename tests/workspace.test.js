'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain, ROOM, item, PROJECT_SCRIPTS } = require('./load');

const LEGACY = { 'roomPlanner.current': { items: [item('a', 'custom', 700, 50, 40, 40)] },
  'roomPlanner.variants': { V: { items: [item('a', 'custom', 100, 100, 40, 40)], savedAt: 5 } } };

function browser(start = {}, { server = null, protocol = 'file:' } = {}) {
  const mem = new Map(Object.entries(start).map(([k, v]) => [k, JSON.stringify(v)]));
  // A test sets quota.refuses to make writes to some keys fail like a full storage, quota.blocked to deny all access
  const quota = { refuses: _key => false, blocked: false };
  const open = () => { if (quota.blocked) throw new Error('denied'); };
  const localStorage = { getItem: k => { open(); return mem.get(k) ?? null; }, removeItem: k => { open(); mem.delete(k); },
    setItem: (k, v) => { open(); if (quota.refuses(k)) throw new Error('quota'); mem.set(k, v); } };
  const puts = [], reloads = [], bar = { textContent: '', hidden: true };
  const fetch = async (url, opts) => {
    if (url === 'api/info') return { ok: !!server, json: async () => ({ server: 'room-blueprint' }) };
    // A test sets server.slow to see how many requests are under way at once
    if (server.slow) {
      server.active = (server.active ?? 0) + 1;
      server.peak = Math.max(server.peak ?? 0, server.active);
      await new Promise(r => setTimeout(r, 1));
      server.active--;
    }
    if (opts?.method === 'PUT') {
      if (server.putFails) throw new TypeError('offline');
      // As serve.py: a write that did not see the latest version is refused. A test can keep the version unset to ignore it.
      if (server.rev && opts.headers['If-Match'] !== server.rev) return { ok: false, status: 412 };
      if (server.conflicts > 0) { server.conflicts--; server.onConflict?.(); return { ok: false, status: 412 }; }
      puts.push(JSON.parse(opts.body));
      if (server.keeps) { server.projects = puts.at(-1); if (server.rev) server.rev += 'x'; }
      return { ok: true, status: 200 };
    }
    if (server.broken) return { ok: false, status: 500 };
    const body = JSON.parse(JSON.stringify(server.projects));
    return { ok: true, status: 200, json: async () => body, headers: { get: () => server.rev ?? 'v0' } };
  };
  const location = { protocol, reload: () => reloads.push(1) };
  return { mem, puts, quota, reloads, bar, ...load([...PROJECT_SCRIPTS, 'js/render.js'],
    { localStorage, fetch, location, document: { querySelector: () => ({}), getElementById: () => bar } }) };
}

const oldRoom = { w: 400, l: 500, wall: 20, balcony: { left: 100, right: 100 }, radiator: { offset: 10, w: 50, d: 10 },
  chimney: [40, 40], door: { fromTop: 100, w: 90, hingeTop: true } };

test('a fresh browser opens the starter room', () => {
  const b = browser();
  const p = b.get('activeProject')();
  assert.match(p.id, /^p-/);
  assert.equal(p.name, 'Starter room');
  assert.deepEqual(plain(b.get('allProjects')().map(x => x.id)), [p.id], 'the id stays the same on the next read');
});

test('two browsers start with different project ids', () => {
  const [one, two] = [browser(), browser()].map(b => b.get('activeProject')());
  assert.notEqual(one.id, two.id);
});

test('two browsers that both edited their starter room keep two projects on the server', async () => {
  const server = { projects: {} };
  const edit = async (furniture) => {
    const b = browser({}, { server, protocol: 'http:' });
    const p = b.get('activeProject')();
    p.furniture.push({ id: furniture, name: furniture, kind: 'custom', w: 50, d: 50, color: '#888888' });
    b.get('saveProject')(p);
    await b.get('syncProjects')();
    server.projects = b.puts.at(-1);
  };
  await edit('onlyOnA');
  await edit('onlyOnB');
  const all = Object.values(server.projects);
  assert.equal(all.length, 2);
  for (const id of ['onlyOnA', 'onlyOnB']) assert.equal(all.filter(p => p.furniture.some(f => f.id === id)).length, 1);
});

test('storage that is blocked still gives a working project', () => {
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const { get } = load(PROJECT_SCRIPTS, { localStorage: blocked, location: { protocol: 'file:' } });
  assert.equal(get('activeProject')().name, 'Starter room');
});

test('each project has its own storage, and switching keeps them apart', () => {
  const b = browser();
  const [add, setActive, active, save] = ['addProject', 'setActiveProject', 'activeProject', 'saveProject'].map(b.get);
  const one = add(b.get('starterProject')(undefined, 'One')), two = add(b.get('starterProject')(undefined, 'Two'));
  assert.equal(active().id, two.id);
  assert.ok([...b.mem.keys()].includes(`roomBlueprint.project.${one.id}`));
  const before = two.layouts.length;
  two.layouts.push({ name: 'L', place: {} });
  save(two);
  setActive(one.id);
  assert.equal(active().layouts.length, before);
  setActive(two.id);
  assert.equal(active().layouts.length, before + 1);
});

test('names stay unique, deleting works, the last project is replaced by a starter room', () => {
  const b = browser();
  const [add, remove, all, starter] = ['addProject', 'removeProject', 'allProjects', 'starterProject'].map(b.get);
  const first = b.get('activeProject')().id;
  const x = add(starter(undefined, 'Starter room'));
  assert.equal(x.name, 'Starter room (2)');
  remove(x.id);
  assert.equal(b.mem.has(`roomBlueprint.project.${x.id}`), false);
  remove(first);
  const left = all();
  assert.equal(left.length, 1);
  assert.notEqual(left[0].id, first);
});

test('a long name keeps its project valid when a number is added', () => {
  const b = browser();
  const [add, starter, unique, all] = ['addProject', 'starterProject', 'uniqueProjectName', 'allProjects'].map(b.get);
  const max = b.get('MAX_NAME'), long = 'x'.repeat(max);
  add(starter(undefined, long));
  const two = add(starter(undefined, long)), three = add(starter(undefined, long));
  assert.equal(two.name, `${'x'.repeat(max - 4)} (2)`);
  assert.equal(three.name, `${'x'.repeat(max - 4)} (3)`);
  assert.equal(all().length, 4, 'none of them drops out of the list');
  assert.equal(unique('y'.repeat(max + 5)), 'y'.repeat(max), 'a free name is only cut to the limit');
  add(starter(undefined, `${'y'.repeat(max - 5)}   z`));
  const spaced = add(starter(undefined, `${'y'.repeat(max - 5)}   z`));
  assert.equal(spaced.name, `${'y'.repeat(max - 5)} (2)`, 'no blank before the number');
});

// What a full storage must leave behind after a refused project
const refused = (b, act) => {
  b.get('readIndex')();
  const before = [...b.mem];
  assert.throws(act, e => e instanceof b.get('ProjectError') && /could not store/.test(e.message));
  assert.deepEqual([...b.mem], before, 'nothing in storage changed');
};
const isProjectKey = k => k.startsWith('roomBlueprint.project.');

test('a project that does not fit is refused and changes nothing', () => {
  const b = browser();
  const open = b.get('activeProject')();
  b.quota.refuses = isProjectKey;
  refused(b, () => b.get('addProject')(b.get('starterProject')(undefined, 'Big')));
  assert.equal(b.get('activeProject')().id, open.id);
  assert.equal(b.get('allProjects')().length, 1);
});

test('a project is taken back if the index cannot be written', () => {
  const b = browser();
  b.get('readIndex')();
  b.quota.refuses = k => k === 'roomBlueprint.index';
  refused(b, () => b.get('addProject')(b.get('starterProject')(undefined, 'Big')));
});

test('without an index every read gets a new id, so it must not leave a project behind each time', () => {
  const b = browser();
  b.quota.refuses = k => k === 'roomBlueprint.index';
  b.get('activeProject')();
  assert.equal(b.get('activeProject')().name, 'Starter room');
  assert.equal(b.mem.size, 0);
});

test('an import that does not fit leaves the stand-in in place', () => {
  const b = browser(LEGACY);
  const stray = b.get('activeProject')();
  b.quota.refuses = isProjectKey;
  refused(b, () => b.get('importProject')({ app: 'room-planner', version: 1, room: oldRoom, current: { items: [] } }, 'File'));
  const [left] = b.get('allProjects')();
  assert.equal(left.id, stray.id);
  assert.equal(left.legacy, true);
  assert.equal(b.get('activeProject')().id, stray.id);
  b.quota.refuses = () => false;
  const { project, warnings } = b.get('importProject')({ app: 'room-planner', version: 1, room: oldRoom, current: { items: [] } }, 'File');
  assert.equal(b.get('allProjects')().length, 1, 'with room again the same import merges it');
  assert.equal(b.get('activeProject')().id, project.id);
  assert.equal(warnings.length, 1);
});

test('a damaged project is skipped', () => {
  const b = browser();
  const first = b.get('activeProject')();
  const x = b.get('addProject')(b.get('starterProject')(undefined, 'X'));
  b.mem.set(`roomBlueprint.project.${x.id}`, '{"name":1}');
  assert.equal(b.get('activeProject')().id, first.id);
});

test('old browser data is carried over once, then the old keys go', () => {
  const b = browser({ ...LEGACY, 'roomPlanner.fsWeights': { desk: 3 } });
  const p = b.get('activeProject')();
  assert.equal(p.legacy, true);
  assert.equal(p.room.w, b.get('STARTER_PROJECT').room.w);
  assert.deepEqual(plain(p.layouts.map(l => l.name)), ['V']);
  assert.deepEqual(plain(p.current.place.a), [700, 50, 0]);
  assert.equal(p.weights.desk, 3);
  for (const k of ['roomPlanner.current', 'roomPlanner.variants', 'roomPlanner.fsWeights']) assert.equal(b.mem.has(k), false, k);
  assert.deepEqual(plain(b.get('allProjects')().map(x => x.id)), [p.id], 'the next read keeps the stand-in');
});

test('the old keys stay while the stand-in or its index cannot be stored', () => {
  for (const refuses of [isProjectKey, k => k === 'roomBlueprint.index']) {
    const b = browser(LEGACY);
    b.quota.refuses = refuses;
    b.get('activeProject')();
    assert.ok(b.mem.has('roomPlanner.current'));
    assert.ok(b.mem.has('roomPlanner.variants'));
    b.quota.refuses = () => false;
    assert.equal(b.get('activeProject')().legacy, true, 'carried over on the next load');
    assert.equal(b.mem.has('roomPlanner.current'), false);
  }
});

test('a browser that carried the data over before keeps its stand-in and loses the old keys on load', () => {
  const first = browser(LEGACY);
  const stray = first.get('activeProject')();
  const kept = Object.fromEntries([...first.mem].map(([k, v]) => [k, JSON.parse(v)]));
  const b = browser({ ...kept, ...LEGACY });
  assert.equal(b.mem.has('roomPlanner.current'), false);
  assert.equal(b.mem.has('roomPlanner.variants'), false);
  assert.deepEqual(plain(b.get('allProjects')().map(p => p.id)), [stray.id]);
  const other = browser({ 'roomBlueprint.index': kept['roomBlueprint.index'], ...LEGACY });
  assert.ok(other.mem.has('roomPlanner.current'), 'no stand-in is listed there, so nothing holds the data yet');
});

test('unreadable old data does not stop the page and is left alone', () => {
  const b = browser({ 'roomPlanner.current': { items: [{ id: 'a' }] } });
  assert.equal(b.get('activeProject')().name, 'Starter room');
  assert.ok(b.mem.has('roomPlanner.current'));
});

test('a v1 file with the real room absorbs the carried over data', () => {
  const b = browser({ ...LEGACY, 'roomPlanner.fsWeights': { desk: 3 } });
  b.get('activeProject')();
  const file = { room: { ...oldRoom, w: 450 }, variants: { V: { items: [item('a', 'custom', 1, 1, 40, 40)], savedAt: 1 },
    W: { items: [item('a', 'custom', 2, 2, 40, 40)], savedAt: 1 } } };
  const { project: p, warnings } = b.get('importProject')(file, 'Mine');
  assert.equal(p.room.w, 450);
  assert.equal(p.legacy, undefined);
  assert.deepEqual(plain(p.current.place.a), [700, 50, 0], 'the working state of this browser survives');
  assert.deepEqual(plain(p.layouts.find(l => l.name === 'V').place.a), [100, 100, 0], 'the newer save wins');
  assert.ok(p.layouts.some(l => l.name === 'W'));
  assert.equal(p.weights.desk, 3);
  assert.match(warnings[0], /merged/);
  assert.deepEqual(plain(b.get('allProjects')().map(x => x.id)), [p.id]);
  assert.equal(b.get('activeProject')().id, p.id);
});

test('a stand-in that was edited here is kept: the file is imported beside it, with a warning', () => {
  const b = browser(LEGACY);
  const stray = b.get('activeProject')();
  stray.layouts.push({ name: 'mine-in-standin', place: {} });
  b.get('saveProject')(stray);
  const { project: p, warnings } = b.get('importProject')({ room: oldRoom, variants: { W: { items: [item('a', 'custom', 2, 2, 40, 40)], savedAt: 1 } } }, 'Mine');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /stays a separate project/);
  assert.deepEqual(plain(p.layouts.map(l => l.name)), ['W'], 'old keys are not merged twice');
  assert.deepEqual(plain(b.get('allProjects')().map(x => x.id)), [stray.id, p.id]);
  assert.ok(b.get('readProject')(stray.id).layouts.some(l => l.name === 'mine-in-standin'));
  assert.equal(b.get('activeProject')().id, p.id);
});

test('a v2 file leaves a stand-in alone and has nothing to warn about', () => {
  const b = browser(LEGACY);
  const stray = b.get('activeProject')();
  const file = b.get('exportProject')(b.get('starterProject')(undefined, 'File'));
  const { warnings } = b.get('importProject')(file, 'Mine');
  assert.deepEqual(plain(warnings), []);
  assert.ok(b.get('readProject')(stray.id));
});

test('import adds a project and never replaces one', () => {
  const b = browser();
  const file = { room: oldRoom, items: [item('a', 'custom', 1, 1, 40, 40)] };
  const one = b.get('importProject')(file, 'Mine').project, two = b.get('importProject')(file, 'Mine').project;
  assert.notEqual(one.id, two.id);
  assert.deepEqual(plain(b.get('allProjects')().map(p => p.name)), ['Starter room', 'Mine', 'Mine (2)']);
});

test('a failed import changes nothing', () => {
  const b = browser();
  assert.throws(() => b.get('importProject')({ room: {} }, 'Mine'));
  assert.equal(b.get('allProjects')().length, 1);
});

const serverProject = (id, over = {}) => ({ id, name: id, room: ROOM, furniture: [], layouts: [], updatedAt: 5, ...over });

test('sync: server projects arrive, the untouched starter room and old data stay here', async () => {
  const server = { projects: { s1: serverProject('s1') } };
  const b = browser(LEGACY, { server, protocol: 'http:' });
  b.get('activeProject')();
  assert.equal(await b.get('syncProjects')(), true);
  assert.deepEqual(plain(b.get('allProjects')().map(p => p.id).filter(id => id === 's1')), ['s1']);
  assert.deepEqual(b.puts, [], 'nothing new to send, so nothing is sent');
});

test('sync: a changed project is sent, and an unchanged server is not written again', async () => {
  const b = browser({}, { server: { projects: {} }, protocol: 'http:' });
  const p = b.get('activeProject')();
  await b.get('syncProjects')();
  assert.deepEqual(b.puts, []);
  p.name = 'Edited';
  b.get('saveProject')(p);
  b.get('pushProjects')();
  await new Promise(r => setImmediate(r));
  assert.deepEqual(Object.keys(b.puts[0]), [p.id]);
});

// A second device changed a width while this page was still loading: the open page must not keep the old one
function staleDevice(remote) {
  const old = serverProject('s1', { furniture: [{ id: 'a', name: 'a', kind: 'custom', w: 146, d: 40, color: '#888888' }],
    current: { place: { a: [100, 100, 0] } } });
  const b = browser({ 'roomBlueprint.index': { active: 's1', ids: ['s1'] }, 'roomBlueprint.project.s1': old },
    { server: { projects: { s1: { ...old, ...remote, updatedAt: 9 } } }, protocol: 'http:' });
  return { b, open: b.get('activeProject')() };
}

test('sync: new furniture from the server makes the open page rebuild, and the next edit keeps it', async () => {
  const { b, open } = staleDevice({ furniture: [{ id: 'a', name: 'a', kind: 'custom', w: 150, d: 40, color: '#888888' }] });
  assert.equal(await b.get('syncProjects')(), true);
  const fresh = b.get('readProject')('s1');
  assert.equal(b.get('staleWorkingState')(open, fresh), true);
  const items = b.get('projectItems')(fresh);
  assert.equal(items[0].w, 150);
  assert.equal(items[0].x, 100, 'the placement of this device stays');
  b.get('takeItems')(fresh, items);
  b.get('saveProject')(fresh);
  assert.equal(b.get('readProject')('s1').furniture[0].w, 150);
});

test('sync: a changed room makes the open page rebuild too', async () => {
  const { b, open } = staleDevice({ room: { ...ROOM, w: 450 } });
  await b.get('syncProjects')();
  assert.equal(b.get('staleWorkingState')(open, b.get('readProject')('s1')), true);
});

test('sync: a new layout alone leaves the working items of the open page alone', async () => {
  const { b, open } = staleDevice({ layouts: [{ name: 'L', place: {} }] });
  assert.equal(await b.get('syncProjects')(), true);
  const fresh = b.get('readProject')('s1');
  assert.equal(fresh.layouts.length, 1);
  assert.equal(b.get('staleWorkingState')(open, fresh), false);
});

test('sync: field order from editing is no difference', () => {
  const { b, open } = staleDevice({});
  const edited = plain(open);
  b.get('takeItems')(edited, b.get('projectItems')(open));
  assert.equal(b.get('staleWorkingState')(edited, open), false);
});

test('drag over a stored change: only room, furniture and placement stop it', () => {
  const { b, open } = staleDevice({});
  const over = b.get('dragOverStored'), copy = () => plain(open);
  const later = { ...copy(), name: 'Renamed', layouts: [{ name: 'L', place: {} }], deletedLayouts: [{ name: 'Old', at: 5 }],
    weights: { ...copy().weights, bed: 3 }, updatedAt: 99 };
  const kept = plain(over(copy(), later));
  assert.equal(kept.name, 'Renamed');
  assert.equal(kept.layouts.length, 1);
  assert.deepEqual(kept.deletedLayouts, later.deletedLayouts);
  assert.equal(kept.weights.bed, 3);
  assert.equal(over(copy(), { ...copy(), room: { ...open.room, w: open.room.w + 37 } }), null, 'room');
  const moved = copy();
  moved.furniture[0].w += 10;
  assert.equal(over(copy(), moved), null, 'furniture');
  const placed = copy();
  placed.current.place.a = [1, 2, 0];
  assert.equal(over(copy(), placed), null, 'placement');
});

test('drag over a stored change: a room drag is judged by the room it started from and keeps the room it reached', () => {
  const { b, open } = staleDevice({});
  const over = b.get('dragOverStored'), start = plain(open.room), reached = { ...start, w: start.w + 50 };
  const dragged = { ...plain(open), room: reached };
  const kept = over(dragged, { ...plain(open), name: 'Renamed' }, start);
  assert.equal(kept.room.w, reached.w);
  assert.equal(kept.name, 'Renamed');
  assert.equal(over(dragged, { ...plain(open), room: { ...start, l: start.l + 37 } }, start), null);
  assert.equal(over(dragged, plain(open)), null, 'without the start room the drag itself looks like the change');
});

test('sync: invented server entries are ignored', async () => {
  const b = browser({}, { server: { projects: { x: { name: 1 }, y: serverProject(undefined) } }, protocol: 'http:' });
  assert.equal(await b.get('syncProjects')(), false);
  assert.equal(b.get('allProjects')().length, 1);
});

test('sync: without a successful read nothing is sent, so a server copy cannot be wiped', async () => {
  const b = browser({}, { server: { broken: true }, protocol: 'http:' });
  const p = b.get('activeProject')();
  b.get('saveProject')(p);
  await b.get('syncProjects')();
  b.get('pushProjects')();
  await new Promise(r => setImmediate(r));
  assert.deepEqual(b.puts, []);
});

const twoOnServer = () => ({ projects: { s1: serverProject('s1'), s2: serverProject('s2') } });
const settled = () => new Promise(r => setImmediate(r));
const synced = async b => {
  const changed = await b.get('syncProjects')();
  await settled();
  return changed;
};
const pushedAfterEdit = async b => {
  const p = b.get('activeProject')();
  p.layouts.push({ name: 'Later', place: {} });
  b.get('saveProject')(p);
  b.get('pushProjects')();
  await settled();
};

for (const [what, block] of [['refuses every write', b => { b.quota.refuses = () => true; }],
  ['is fully blocked', b => { b.quota.blocked = true; }]]) {
  test(`sync: storage that ${what} never pushes, in sync or later`, async () => {
    const b = browser({}, { server: twoOnServer(), protocol: 'http:' });
    block(b);
    assert.equal(await synced(b), false);
    await pushedAfterEdit(b);
    assert.deepEqual(b.puts, []);
    assert.equal(b.get('activeProject')().name, 'Starter room', 'the page keeps working');
  });

  test(`sync: storage that ${what} never pushes after finding an empty server either`, async () => {
    const b = browser({}, { server: { projects: {} }, protocol: 'http:' });
    block(b);
    assert.equal(await synced(b), false);
    await pushedAfterEdit(b);
    assert.deepEqual(b.puts, [], 'another device may have saved since, and this push would remove it');
  });
}

test('sync: a store that refuses one project stores the other, and never pushes', async () => {
  const b = browser({}, { server: twoOnServer(), protocol: 'http:' });
  b.quota.refuses = k => k === 'roomBlueprint.project.s2';
  assert.equal(await synced(b), true, 's1 did arrive');
  assert.equal(b.get('readProject')('s1').id, 's1');
  assert.deepEqual(plain(b.get('readIndex')().ids.filter(id => id.startsWith('s'))), ['s1'], 'no dead id');
  assert.ok(b.get('allProjects')().some(p => p.id === 's1'));
  await pushedAfterEdit(b);
  assert.deepEqual(b.puts, []);
});

test('sync: a refused first project does not stop the one after it', async () => {
  const b = browser({}, { server: twoOnServer(), protocol: 'http:' });
  b.quota.refuses = k => k === 'roomBlueprint.project.s1';
  assert.equal(await synced(b), true);
  assert.deepEqual(plain(b.get('readIndex')().ids.filter(id => id.startsWith('s'))), ['s2']);
  assert.deepEqual(b.puts, []);
});

test('sync: a project the index refuses is taken back and nothing is pushed', async () => {
  const b = browser({}, { server: twoOnServer(), protocol: 'http:' });
  const own = b.get('activeProject')();
  b.quota.refuses = k => k === 'roomBlueprint.index';
  assert.equal(await synced(b), false);
  assert.deepEqual([...b.mem.keys()].filter(isProjectKey), [`roomBlueprint.project.${own.id}`], 'no project key left behind');
  assert.deepEqual(plain(b.get('readIndex')().ids), [own.id]);
  await pushedAfterEdit(b);
  assert.deepEqual(b.puts, []);
});

test('sync: a refused update of a project held here keeps the old copy and pushes nothing', async () => {
  const { b } = staleDevice({ layouts: [{ name: 'L', place: {} }] });
  b.quota.refuses = k => k === 'roomBlueprint.project.s1';
  assert.equal(await synced(b), false);
  assert.equal(b.get('readProject')('s1').layouts.length, 0, 'the old copy stays readable');
  b.quota.refuses = () => false;
  await pushedAfterEdit(b);
  assert.deepEqual(b.puts, [], 'room came back later in this page load, but the merge is still missing');
});

test('sync: when everything is stored, the merge is pushed and so are later edits', async () => {
  const b = browser({}, { server: twoOnServer(), protocol: 'http:' });
  const own = b.get('activeProject')();
  b.get('saveProject')(own);
  assert.equal(await synced(b), true);
  assert.equal(b.puts.length, 1);
  assert.deepEqual(Object.keys(b.puts[0]).sort(), [own.id, 's1', 's2'].sort());
  await pushedAfterEdit(b);
  assert.equal(b.puts.length, 2);
  assert.deepEqual(Object.keys(b.puts[1]).sort(), [own.id, 's1', 's2'].sort());
});

// ---------- Phase 9 ----------

const onServer = (start = {}) => ({ projects: start, keeps: true, rev: 'v1' });
const device = (server, start = {}) => browser(start, { server, protocol: 'http:' });
const stored = (b, id) => b.get('readProject')(id);
const edit = (b, id, change) => { const p = stored(b, id); change(p); b.get('saveProject')(p); return p; };
const named = (l, names) => assert.deepEqual(plain(l.layouts.map(x => x.name)).sort(), names);
const later = () => new Promise(r => setTimeout(r, 2));

test('a deleted layout does not come back from a device with an older copy', async () => {
  const server = onServer({ s1: serverProject('s1', { layouts: [{ name: 'A', place: {}, savedAt: 1 }, { name: 'B', place: {}, savedAt: 1 }] }) });
  const one = device(server), two = device(server);
  await synced(one); await synced(two);
  await later();
  const p = stored(one, 's1');
  one.get('saveProject')(one.get('withoutLayout')(p, 'A'));
  await one.get('pushProjects')();
  await two.get('pushProjects')();
  await synced(two);
  named(stored(two, 's1'), ['B']);
  await synced(one);
  named(stored(one, 's1'), ['B']);
  named(server.projects.s1, ['B']);
});

test('a layout saved again after its deletion stays', async () => {
  const server = onServer({ s1: serverProject('s1', { layouts: [{ name: 'A', place: {}, savedAt: 1 }] }) });
  const one = device(server);
  await synced(one);
  one.get('saveProject')(one.get('withoutLayout')(stored(one, 's1'), 'A'));
  await one.get('pushProjects')();
  await later();
  edit(one, 's1', p => { p.layouts.push({ name: 'A', place: {}, savedAt: Date.now() }); });
  await one.get('pushProjects')();
  named(server.projects.s1, ['A']);
});

test('a moved layout does not return to its old project through sync', async () => {
  const server = onServer({ s1: serverProject('s1', { layouts: [{ name: 'A', place: {} }] }), s2: serverProject('s2') });
  const one = device(server), two = device(server);
  await synced(one); await synced(two);
  await later();
  const { source } = one.get('moveLayout')(stored(one, 's1'), 's2', 'A');
  one.get('saveProject')(source);
  await one.get('pushProjects')();
  await synced(two);
  named(stored(two, 's1'), []);
  named(stored(two, 's2'), ['A']);
});

test('a deleted project does not come back, and goes on the other device too', async () => {
  const server = onServer({ s1: serverProject('s1'), s2: serverProject('s2') });
  const one = device(server), two = device(server);
  await synced(one); await synced(two);
  await later();
  one.get('removeProject')('s1');
  await one.get('pushProjects')();
  assert.deepEqual(plain(server.projects.s1), { id: 's1', deletedAt: server.projects.s1.deletedAt });
  assert.equal(await synced(two), true);
  assert.equal(stored(two, 's1'), null);
  assert.equal(two.mem.has('roomBlueprint.project.s1'), false);
  assert.equal(plain(two.get('allProjects')().map(p => p.id)).includes('s1'), false);
  await two.get('pushProjects')();
  assert.ok(server.projects.s1.deletedAt, 'the note stays on the server for devices still to come');
  const three = device(server);
  await synced(three);
  assert.equal(stored(three, 's1'), null);
});

test('a deletion waits on a device that was offline: its push does not bring the project back', async () => {
  const server = onServer({ s1: serverProject('s1') });
  const one = device(server), two = device(server);
  await synced(one); await synced(two);
  await later();
  one.get('removeProject')('s1');
  await one.get('pushProjects')();
  await two.get('pushProjects')();
  assert.equal(server.projects.s1.room, undefined);
  assert.equal(stored(two, 's1'), null);
});

test('an edit after the deletion wins, on the device that made it and then everywhere', async () => {
  const server = onServer({ s1: serverProject('s1') });
  const one = device(server), two = device(server);
  await synced(one); await synced(two);
  one.get('removeProject')('s1');
  await one.get('pushProjects')();
  await later();
  edit(two, 's1', p => { p.name = 'Kept'; });
  await two.get('pushProjects')();
  assert.equal(server.projects.s1.name, 'Kept');
  await synced(one);
  assert.equal(stored(one, 's1').name, 'Kept');
  assert.equal(plain(one.get('readDeleted')()).length, undefined);
  assert.equal(one.get('readDeleted')().has('s1'), false);
});

test('deleting the open project on another device leaves a working active project here', async () => {
  const server = onServer({ s1: serverProject('s1') });
  const one = device(server), two = device(server);
  await synced(one);
  await synced(two);
  two.get('setActiveProject')('s1');
  one.get('removeProject')('s1');
  await one.get('pushProjects')();
  await synced(two);
  assert.notEqual(two.get('activeProject')().id, 's1');
  assert.notEqual(two.get('readIndex')().active, 's1');
});

test('an untouched starter room leaves no note when it is replaced', () => {
  const b = browser();
  b.get('removeProject')(b.get('activeProject')().id);
  assert.equal(b.get('readDeleted')().size, 0);
});

test('a push from a device that loaded earlier keeps the project another device added since', async () => {
  const server = onServer();
  const early = device(server), other = device(server);
  await synced(early);
  await synced(other);
  edit(other, other.get('activeProject')().id, p => { p.name = 'From the other device'; });
  await other.get('pushProjects')();
  edit(early, early.get('activeProject')().id, p => { p.name = 'Early'; });
  await early.get('pushProjects')();
  assert.deepEqual(plain(Object.values(server.projects).map(p => p.name)).sort(), ['Early', 'From the other device']);
  assert.ok(early.get('allProjects')().some(p => p.name === 'From the other device'), 'and it arrived here as well');
});

test('a write that lost the race starts over with what the other device wrote', async () => {
  const other = serverProject('late');
  const server = onServer();
  const b = device(server);
  await synced(b);
  const own = b.get('activeProject')();
  edit(b, own.id, p => { p.name = 'Mine'; });
  server.conflicts = 1;
  server.onConflict = () => { server.projects = { late: other }; server.rev = 'v2'; };
  await b.get('pushProjects')();
  assert.equal(b.puts.length, 1);
  assert.deepEqual(Object.keys(b.puts[0]).sort(), [own.id, 'late'].sort());
});

test('a server that keeps refusing ends as a problem, not a loop', async () => {
  const server = { projects: {}, conflicts: 100 };
  const b = device(server);
  const own = b.get('activeProject')();
  edit(b, own.id, p => { p.name = 'Mine'; });
  await synced(b);
  assert.equal(server.conflicts, 100 - 4);
  assert.match(b.get('syncNotice')(), /does not answer/);
  assert.equal(stored(b, own.id).name, 'Mine', 'the change stays here');
});

test('pushes in a row wait for each other, and the last state is written once', async () => {
  const server = onServer();
  const b = device(server);
  const own = b.get('activeProject')();
  edit(b, own.id, p => { p.name = 'Mine'; });
  await synced(b);
  const before = b.puts.length;
  edit(b, own.id, p => { p.name = 'One'; });
  const one = b.get('pushProjects')();
  edit(b, own.id, p => { p.name = 'Two'; });
  const two = b.get('pushProjects')(), three = b.get('pushProjects')();
  await Promise.all([one, two, three]);
  assert.equal(b.puts.length, before + 1);
  assert.equal(server.projects[own.id].name, 'Two');
});

test('load and a push right after it do not overlap', async () => {
  const server = { ...onServer(), slow: true };
  const b = device(server);
  const own = b.get('activeProject')();
  edit(b, own.id, p => { p.name = 'Mine'; });
  const sync = b.get('syncProjects')();
  edit(b, own.id, p => { p.name = 'Newer'; });
  await Promise.all([sync, b.get('pushProjects')()]);
  assert.equal(server.peak, 1, 'one request at a time');
  assert.equal(server.projects[own.id].name, 'Newer');
  assert.equal(server.rev, 'v1' + 'x'.repeat(b.puts.length), 'every write built on the one before');
});

test('an entry this version cannot read stays on the server', async () => {
  const future = serverProject('f1', { room: { w: 'wide' } });
  const server = onServer({ f1: future });
  const b = device(server);
  await synced(b);
  const own = b.get('activeProject')();
  edit(b, own.id, p => { p.name = 'Mine'; });
  await b.get('pushProjects')();
  assert.deepEqual(plain(server.projects.f1), future);
  assert.equal(b.get('allProjects')().some(p => p.id === 'f1'), false);
});

test('a problem with the server is reported, and over with the next round', async () => {
  const server = onServer();
  const b = device(server);
  const own = b.get('activeProject')();
  edit(b, own.id, p => { p.name = 'Mine'; });
  server.putFails = true;
  await synced(b);
  assert.match(b.get('syncNotice')(), /does not answer/);
  server.putFails = false;
  await b.get('pushProjects')();
  assert.equal(b.get('syncNotice')(), '');
  assert.equal(server.projects[own.id].name, 'Mine');
});

test('a server that was down at load gets the next change', async () => {
  const server = { projects: {}, broken: true, keeps: true };
  const b = device(server);
  const own = b.get('activeProject')();
  edit(b, own.id, p => { p.name = 'Mine'; });
  await synced(b);
  assert.deepEqual(b.puts, []);
  assert.match(b.get('syncNotice')(), /does not answer/);
  server.broken = false;
  await b.get('pushProjects')();
  assert.equal(server.projects[own.id].name, 'Mine');
});

test('a device that cannot store the merge is told so', async () => {
  const b = device(twoOnServer());
  b.quota.refuses = k => k === 'roomBlueprint.project.s2';
  await synced(b);
  assert.match(b.get('syncNotice')(), /could not store the shared projects/);
});

test('a page hears when a sync changed what is stored', async () => {
  const b = device(twoOnServer());
  const heard = [];
  b.get('onSync')(c => heard.push(c));
  await synced(b);
  assert.deepEqual(heard, [true, false]);
});

test('a page that only shows a project starts over when a sync changed it, once', async () => {
  const { b, open } = staleDevice({ layouts: [{ name: 'L', place: {} }] });
  b.get('syncAndFollow')(open);
  await settled();
  assert.equal(b.reloads.length, 1);
  b.get('syncAndFollow')(b.get('activeProject')());
  await settled();
  assert.equal(b.reloads.length, 1);
});

test('a page does not start over for a project it does not show', async () => {
  const b = device(twoOnServer());
  b.get('syncAndFollow')(b.get('activeProject')());
  await settled();
  assert.equal(b.reloads.length, 0);
});

test('weights go on top of the stored copy, so a second tab keeps what it saved', () => {
  const b = browser();
  const id = b.get('activeProject')().id;
  const tab = b.get('readProject')(id);
  edit(b, id, p => { p.layouts.push({ name: 'From the planner', place: {} }); });
  assert.equal(b.get('storeWeights')(tab.id, { bed: 3 }), true);
  const left = stored(b, id);
  assert.ok(left.layouts.some(l => l.name === 'From the planner'));
  assert.equal(left.weights.bed, 3);
});

test('weights of a project deleted elsewhere are not stored and do not bring it back', () => {
  const b = browser();
  assert.equal(b.get('storeWeights')('gone', { bed: 3 }), false);
  assert.equal(b.mem.has('roomBlueprint.project.gone'), false);
});

test('weights in a full store are reported', () => {
  const b = browser();
  const id = b.get('activeProject')().id;
  b.quota.refuses = isProjectKey;
  assert.equal(b.get('storeWeights')(id, { bed: 3 }), false);
});

test('a refused save stays on screen when a sync ends, and goes with the next save that works', async () => {
  const b = device(onServer());
  const id = b.get('activeProject')().id;
  let refused = false;
  const save = () => { refused = !b.get('storeWeights')(id, { bed: 3 }); b.get('showNotices')(refused); return b.get('pushProjects')(); };
  b.get('onSync')(() => b.get('showNotices')(refused));
  b.quota.refuses = isProjectKey;
  await save();
  assert.match(b.bar.textContent, /not saved/);
  assert.equal(b.bar.hidden, false);
  b.quota.refuses = () => false;
  await save();
  assert.equal(b.bar.textContent, '');
  assert.equal(b.bar.hidden, true);
});

test('a refused save and a server that does not answer are both reported', async () => {
  const server = onServer();
  const b = device(server);
  await synced(b);
  server.broken = true;
  await b.get('pushProjects')();
  b.get('showNotices')(true);
  assert.match(b.bar.textContent, /not saved.*does not answer/);
});

test('a failed save tells a full store from a project that is gone', () => {
  const b = browser();
  const id = b.get('activeProject')().id;
  b.quota.refuses = isProjectKey;
  assert.equal(b.get('storeWeights')(id, { bed: 3 }), false);
  assert.notEqual(stored(b, id), null, 'full: the project is still there, so the page reports it');
  b.quota.refuses = () => false;
  b.mem.delete('roomBlueprint.project.' + id);
  assert.equal(b.get('storeWeights')(id, { bed: 3 }), false);
  assert.equal(stored(b, id), null, 'deleted elsewhere: the page starts over');
});

test('a tombstone that cannot be stored here stays on the server, and the device is told', async () => {
  const gone = { id: 'gone', deletedAt: 9 };
  const server = onServer({ gone, s1: serverProject('s1') });
  const b = device(server);
  const own = edit(b, b.get('activeProject')().id, p => { p.layouts.push({ name: 'Mine', place: {} }); });
  b.quota.refuses = k => k === 'roomBlueprint.deleted';
  await synced(b);
  assert.deepEqual(b.puts, []);
  assert.deepEqual(plain(server.projects.gone), gone);
  assert.match(b.get('syncNotice')(), /could not store/);
  assert.ok(stored(b, own.id));
});

test('a tombstone also removes the project here when its note cannot be stored, and comes again later', async () => {
  const server = onServer({ s1: serverProject('s1'), s2: serverProject('s2') });
  const b = device(server);
  await synced(b);
  server.projects = { s1: { id: 's1', deletedAt: Date.now() }, s2: server.projects.s2 };
  b.quota.refuses = k => k === 'roomBlueprint.deleted';
  await synced(b);
  assert.equal(stored(b, 's1'), null);
  assert.ok(server.projects.s1.deletedAt);
  b.quota.refuses = () => false;
  const again = browser(Object.fromEntries([...b.mem].map(([k, v]) => [k, JSON.parse(v)])), { server, protocol: 'http:' });
  await synced(again);
  assert.equal(again.get('syncNotice')(), '');
  assert.ok(server.projects.s1.deletedAt);
  assert.ok(again.mem.has('roomBlueprint.deleted'));
});

test('a device with no notes does not fail because a list of none cannot be written', async () => {
  const server = onServer({ s1: serverProject('s1') });
  const b = device(server);
  const own = edit(b, b.get('activeProject')().id, p => { p.layouts.push({ name: 'Mine', place: {} }); });
  b.quota.refuses = k => k === 'roomBlueprint.deleted';
  await synced(b);
  assert.equal(b.get('syncNotice')(), '');
  assert.equal(b.puts.length, 1);
  assert.deepEqual(Object.keys(b.puts[0]).sort(), [own.id, 's1'].sort());
});

test('a device whose notes are unchanged does not fail because they cannot be written', async () => {
  const server = onServer({ s1: { id: 's1', deletedAt: 9 } });
  const b = device(server, { 'roomBlueprint.deleted': [['s1', 9]] });
  b.quota.refuses = k => k === 'roomBlueprint.deleted';
  await synced(b);
  assert.equal(b.get('syncNotice')(), '');
});

test('a project whose deletion cannot be noted stays, or it would come back from the server', async () => {
  const server = onServer({ s1: serverProject('s1'), s2: serverProject('s2') });
  const b = device(server);
  await synced(b);
  const before = b.mem.get('roomBlueprint.project.s1');
  b.quota.refuses = k => k === 'roomBlueprint.deleted';
  assert.equal(b.get('removeProject')('s1'), false);
  assert.equal(b.mem.get('roomBlueprint.project.s1'), before);
  assert.ok(plain(b.get('readIndex')().ids).includes('s1'));
  b.quota.refuses = () => false;
  assert.equal(b.get('removeProject')('s1'), true);
  assert.equal(stored(b, 's1'), null);
});

test('deleting works in a full store: the note gets the space of the project', async () => {
  const server = onServer({ s1: serverProject('s1') });
  const b = device(server);
  await synced(b);
  b.quota.refuses = k => k === 'roomBlueprint.deleted' && b.mem.has('roomBlueprint.project.s1');
  assert.equal(b.get('removeProject')('s1'), true);
  await b.get('pushProjects')();
  assert.ok(server.projects.s1.deletedAt);
});

test('an unchanged reload writes nothing, also for a project that gets its standard on reading', async () => {
  const weights = { bed: 3, desk: 0, sofa: 1, flow: 2, zones: 1 };
  const local = { 'roomBlueprint.index': { active: 's1', ids: ['s1'] }, 'roomBlueprint.project.s1': serverProject('s1', { weights }) };
  const server = onServer();
  const first = device(server, local);
  await synced(first);
  assert.equal(first.puts.length, 1, 'the server has not seen it yet');
  const at = stored(first, 's1').updatedAt;
  for (let load = 0; load < 2; load++) {
    const again = device(server, local);
    await synced(again);
    assert.equal(again.puts.length, 0);
    assert.equal(stored(again, 's1').updatedAt, at);
  }
});

test('a project that gets its standard on reading has the fields of a checked project, in their order', () => {
  const b = browser({ 'roomBlueprint.index': { active: 's1', ids: ['s1'] },
    'roomBlueprint.project.s1': serverProject('s1', { weights: { bed: 3 } }) });
  const p = stored(b, 's1');
  assert.equal(JSON.stringify(p), JSON.stringify(b.get('validateProject')(p)));
});

test('a stored project that fails the checks can be found and rescued', () => {
  const b = browser();
  const x = b.get('addProject')(b.get('starterProject')(undefined, 'X'));
  assert.deepEqual(plain(b.get('unreadableProjects')()), []);
  b.mem.set(`roomBlueprint.project.${x.id}`, '{oops');
  assert.deepEqual(plain(b.get('unreadableProjects')()), [{ id: x.id, text: '{oops' }]);
  b.get('forgetProject')(x.id);
  assert.deepEqual(plain(b.get('unreadableProjects')()), []);
  assert.equal(b.get('readDeleted')().size, 0, 'nothing is known about it, so nothing is noted');
});

test('sync replaces a damaged copy with the server one and lists it once', async () => {
  const b = device({ projects: { s1: serverProject('s1') } }, { 'roomBlueprint.index': { active: 's1', ids: ['s1'] } });
  b.mem.set('roomBlueprint.project.s1', '{oops');
  await synced(b);
  assert.deepEqual(plain(b.get('readIndex')().ids), ['s1']);
  assert.equal(stored(b, 's1').name, 's1');
});

test('with every project unreadable the starter room is listed, so its first save survives', () => {
  const b = browser({ 'roomBlueprint.index': { active: 's1', ids: ['s1'] }, 'roomBlueprint.project.s1': { name: 1 } });
  const p = b.get('activeProject')();
  assert.deepEqual(plain(b.get('readIndex')().ids), ['s1', p.id]);
  assert.equal(b.get('activeProject')().id, p.id);
  assert.equal(b.get('unreadableProjects')().length, 1);
});

test('a browser that could not store its starter room does not list it once a server project arrives', async () => {
  const b = device(twoOnServer());
  b.quota.refuses = k => isProjectKey(k) && !/\.s\d$/.test(k);
  await synced(b);
  const index = b.get('readIndex')();
  assert.deepEqual(plain(index.ids), ['s1', 's2']);
  assert.equal(index.active, 's1');
});

test('an untouched starter room from before the demo rooms becomes the current one', () => {
  const old = serverProject('p-old', { name: 'Starter room', updatedAt: undefined });
  const b = browser({ 'roomBlueprint.index': { active: 'p-old', ids: ['p-old'] }, 'roomBlueprint.project.p-old': old });
  const p = b.get('activeProject')();
  assert.equal(p.id, 'p-old');
  assert.ok(p.layouts.length > 0);
  assert.equal(p.updatedAt, undefined, 'still untouched, so it stays local');
});

test('a starter room that was edited, or another empty project, stays as it is', () => {
  const edited = serverProject('p-a', { name: 'Starter room' }), other = serverProject('p-b', { name: 'Mine', updatedAt: undefined });
  const b = browser({ 'roomBlueprint.index': { active: 'p-a', ids: ['p-a', 'p-b'] }, 'roomBlueprint.project.p-a': edited,
    'roomBlueprint.project.p-b': other });
  assert.equal(b.get('activeProject')().layouts.length, 0);
  assert.equal(stored(b, 'p-b').layouts.length, 0);
});

test('a project stored without a standard keeps its weights as one, and Balanced stays possible', () => {
  const old = serverProject('s1', { weights: { bed: 3, desk: 0, sofa: 1, flow: 2, zones: 1 } });
  const b = browser({ 'roomBlueprint.index': { active: 's1', ids: ['s1'] }, 'roomBlueprint.project.s1': old });
  assert.deepEqual(plain(stored(b, 's1').baseWeights), old.weights);
  assert.deepEqual(plain(b.get('standardWeights')(stored(b, 's1'))), old.weights);
  assert.equal(b.get('storeWeights')('s1', { bed: 0 }, 'balanced'), true);
  assert.deepEqual(plain(b.get('standardWeights')(stored(b, 's1'))), plain(b.get('DEFAULT_W')));
});

test('weights changed on a project with no standard are not taken for a file standard later', () => {
  const b = browser();
  const p = b.get('addProject')(b.get('emptyProject')('Empty', { w: 300, l: 300, wall: 20 }));
  assert.equal(b.get('storeWeights')(p.id, { bed: 3 }), true);
  assert.equal(stored(b, p.id).baseWeights, undefined);
  assert.deepEqual(plain(b.get('standardWeights')(stored(b, p.id))), plain(b.get('DEFAULT_W')));
});

test('moving a layout stores the other project and refuses a full store', () => {
  const b = browser();
  const add = b.get('addProject'), make = b.get('templateProject'), tpl = b.get('DEMO_ROOMS');
  const one = add(make(tpl[1], 'One')), two = add(make(tpl[2], 'Two'));
  const before = one.layouts.length;
  one.layouts = [...one.layouts, { name: 'Night', place: { bed: [100, 120, 0] } }];
  const out = b.get('moveLayout')(one, two.id, 'Night');
  assert.ok(b.get('readProject')(two.id).layouts.some(l => l.name === 'Night'));
  assert.equal(out.source.layouts.length, before);
  b.quota.refuses = k => k.endsWith(two.id);
  assert.throws(() => b.get('moveLayout')(one, two.id, 'Night'), /could not store/);
  assert.throws(() => b.get('moveLayout')(one, 'gone', 'Night'), /could not be read/);
});

// ---------- Keys under the old product name ----------

const OLD_SWITCHES = { 'roomPlanner.fs': true, 'roomPlanner.fsAnalysis': 0, 'roomPlanner.compareFs': false };

test('stored switches move to the new names, with their values', () => {
  const b = browser(OLD_SWITCHES);
  assert.equal(b.mem.get('roomBlueprint.overlay.plan'), 'true');
  assert.equal(b.mem.get('roomBlueprint.overlay.check'), '0', 'off stays off, this page is on until switched off');
  assert.equal(b.mem.get('roomBlueprint.overlay.compare'), 'false');
  for (const old of Object.keys(OLD_SWITCHES)) assert.equal(b.mem.has(old), false, old);
});

test('a value under the new name wins over the old one', () => {
  const b = browser({ 'roomPlanner.fs': true, 'roomBlueprint.overlay.plan': false });
  assert.equal(b.mem.get('roomBlueprint.overlay.plan'), 'false');
  assert.equal(b.mem.has('roomPlanner.fs'), false);
});

test('a refused write keeps the old key, and the next load moves it', () => {
  const full = browser({});
  full.quota.refuses = k => k === 'roomBlueprint.overlay.plan';
  full.mem.set('roomPlanner.fs', 'true');
  full.get('renameStoreKeys')();
  assert.equal(full.mem.get('roomPlanner.fs'), 'true');
  assert.equal(full.mem.has('roomBlueprint.overlay.plan'), false);
  full.quota.refuses = () => false;
  full.get('renameStoreKeys')();
  assert.equal(full.mem.get('roomBlueprint.overlay.plan'), 'true');
  assert.equal(full.mem.has('roomPlanner.fs'), false);
});

test('the rename survives storage that denies access and text that cannot be read', () => {
  const b = browser({});
  b.mem.set('roomPlanner.fs', '{oops');
  b.get('renameStoreKeys')();
  assert.equal(b.mem.has('roomPlanner.fs'), false);
  assert.equal(b.mem.has('roomBlueprint.overlay.plan'), false);
  b.quota.blocked = true;
  assert.doesNotThrow(() => b.get('renameStoreKeys')());
});

test('keys nothing reads are removed, the data of the old version stays until it is carried over', () => {
  const b = browser({ ...LEGACY, 'roomPlanner.fsWeights': { desk: 3 }, 'roomPlanner.compare': ['x'], 'roomPlanner.planName': 'x' });
  assert.equal(b.mem.has('roomPlanner.compare'), false);
  assert.equal(b.mem.has('roomPlanner.planName'), false);
  for (const kept of [...Object.keys(LEGACY), 'roomPlanner.fsWeights']) assert.ok(b.mem.has(kept), kept);
  assert.equal(b.get('activeProject')().legacy, true, 'still carried over');
  assert.deepEqual([...b.mem.keys()].filter(k => k.startsWith('roomPlanner.')), []);
});
