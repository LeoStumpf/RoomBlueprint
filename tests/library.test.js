'use strict';
// The room library of the start assistant: groups, rooms of odd shapes, and an example layout that is already applied.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain, PROJECT_SCRIPTS } = require('./load');

const { get } = load(PROJECT_SCRIPTS);
const names = ['DEMO_ROOMS', 'DEMO_GROUPS', 'STARTER_PROJECT', 'libraryGroups', 'templateProject', 'projectItems', 'layoutItems',
  'activeItems', 'analyze', 'reviewLayout', 'roomGeo', 'roomProblems', 'validateProject', 'itemPoly', 'inRoom'];
const g = Object.fromEntries(names.map(n => [n, get(n)]));

test('every room belongs to a listed group, and every group has rooms', () => {
  const groups = plain(g.DEMO_GROUPS);
  assert.deepEqual(groups, ['Living room', 'Bedroom', 'Kids room', 'Home office', 'One-room flat']);
  for (const t of g.DEMO_ROOMS) assert.ok(groups.includes(t.group), `${t.name}: ${t.group}`);
  for (const name of groups) assert.ok(g.DEMO_ROOMS.some(t => t.group === name), `${name} is not empty`);
  assert.equal(new Set(g.DEMO_ROOMS.map(t => t.name)).size, g.DEMO_ROOMS.length, 'names are unique');
});

test('the start assistant lists every room once, by group', () => {
  const list = g.libraryGroups();
  assert.deepEqual(plain(list.map(x => x.name)), plain(g.DEMO_GROUPS));
  const shown = plain(list.flatMap(x => x.rooms.map(e => e.i))).sort((a, b) => a - b);
  assert.deepEqual(shown, plain(g.DEMO_ROOMS.map((_, i) => i)));
  for (const x of list) {
    assert.ok(x.rooms.length >= 1 && x.rooms.length <= 4, `${x.name}: a short group`);
    for (const e of x.rooms) assert.equal(e.room, g.DEMO_ROOMS[e.i]);
  }
});

test('a room with an unlisted group still shows, empty groups do not', () => {
  const rooms = [{ name: 'A', group: 'Bedroom' }, { name: 'B', group: 'Attic' }];
  const list = g.libraryGroups(rooms, ['Living room', 'Bedroom']);
  assert.deepEqual(plain(list.map(x => x.name)), ['Bedroom', 'Attic']);
  assert.deepEqual(plain(list.map(x => x.rooms.map(e => e.i))), [[0], [1]]);
});

test('the starter room is the first room of the library', () => {
  assert.equal(g.STARTER_PROJECT.room, g.DEMO_ROOMS[0].room);
});

test('the library has odd rooms, not only plain boxes', () => {
  const rooms = g.DEMO_ROOMS.map(t => t.room), fx = type => rooms.filter(r => r.fixtures.some(f => f.type === type)).length;
  assert.ok(fx('block') >= 2, 'L shapes or an alcove from wall blocks');
  assert.ok(fx('chimney') >= 2, 'chimneys');
  assert.ok(fx('column') >= 1, 'a column');
  assert.ok(rooms.some(r => r.openings.filter(o => o.type === 'door').length >= 2), 'two doors');
  assert.ok(rooms.filter(r => r.openings.some(o => o.type === 'balcony')).length >= 3, 'balcony doors');
  assert.ok(rooms.some(r => Math.max(r.w, r.l) / Math.min(r.w, r.l) >= 2), 'long and narrow');
  assert.ok(rooms.some(r => r.openings.filter(o => o.type === 'window').length >= 2), 'two windows');
});

test('every room opens on its first layout, with the furniture placed in the room', () => {
  for (const t of g.DEMO_ROOMS) {
    const p = g.validateProject(g.templateProject(t, t.name)), items = g.projectItems(p);
    assert.equal(p.current.name, t.layouts[0].name, t.name);
    const placed = g.activeItems(items, p.room);
    assert.equal(placed.length, Object.keys(t.layouts[0].place).length, `${t.name}: the example layout is applied`);
    assert.ok(placed.length >= p.furniture.length - 1, `${t.name}: not an empty room`);
  }
});

test('every layout keeps its pieces inside the room, off the fixtures and apart from each other', () => {
  for (const t of g.DEMO_ROOMS) {
    const p = g.templateProject(t, t.name);
    for (const l of p.layouts) {
      const items = g.layoutItems(p, l), placed = g.activeItems(items, p.room), at = `${t.name} / ${l.name}`;
      for (const id of Object.keys(l.place)) assert.ok(placed.some(i => i.id === id), `${at}: ${id} stands in the room`);
      for (const it of placed)
        for (const [x, y] of g.itemPoly(it)) assert.ok(x > -1 && y > -1 && x < p.room.w + 1 && y < p.room.l + 1, `${at}: ${it.id} inside`);
      const hard = g.analyze(items, p.room).checks.filter(c => c.lvl === 2);
      assert.deepEqual(plain(hard), [], `${at}: no overlap, nothing in a wall or a fixture`);
      assert.equal(g.reviewLayout(items, p.room).clashes, 0, at);
    }
  }
});

test('the example layouts need no excuse: no door swing, blocked front or loose shelf either', () => {
  for (const t of g.DEMO_ROOMS.slice(5)) {
    const p = g.templateProject(t, t.name);
    for (const l of p.layouts) assert.deepEqual(plain(g.analyze(g.layoutItems(p, l), p.room).issues), [], `${t.name} / ${l.name}`);
  }
});

test('the library uses a TV, never a projector', () => {
  for (const t of g.DEMO_ROOMS) for (const f of t.furniture) {
    assert.equal(f.beamer, undefined, `${t.name}: ${f.name}`);
    assert.equal(f.image, undefined, `${t.name}: ${f.name}`);
    assert.notEqual(f.kind, 'tv', `${t.name}: a media board stands for a projector, a TV is kind television`);
  }
  assert.ok(g.DEMO_ROOMS.filter(t => t.furniture.some(f => f.kind === 'television')).length >= 3);
});

test('the long bedroom opens with the desk at the balcony door', () => {
  const t = g.DEMO_ROOMS.find(r => r.name === 'Long bedroom with a chimney');
  assert.equal(t.group, 'Bedroom');
  const p = g.templateProject(t, t.name), geo = g.roomGeo(p.room);
  const win = geo.openings.find(o => o.type === 'balcony');
  assert.ok(win, 'the room has its double balcony door');
  assert.equal(win.label, 'Balcony door', 'it is labelled as a balcony door, not as a window');
  assert.ok(!geo.openings.some(o => o.type === 'window'), 'the room has no window');
  const desks = g.activeItems(g.projectItems(p), p.room).filter(i => i.kind === 'table');
  const gap = it => { const P = g.itemPoly(it);
    return Math.min(...P.map(([x, y]) => Math.hypot(Math.max(win.a[0] - x, 0, x - win.b[0]), Math.max(win.a[1] - y, 0, y - win.b[1])))); };
  const desk = desks.find(d => d.id === 'desk');
  assert.ok(gap(desk) < 30, `the desk stands at the balcony door (${Math.round(gap(desk))} cm)`);
  assert.ok(desks.length === 2 && desks.every(d => gap(d) < 100), 'the small desk is near it too');
});
