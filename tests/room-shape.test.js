'use strict';
// Rooms that are not a plain rectangle: the left and top walls move, blocks cut corners, and every check treats the fixtures
// at walls and in corners as the walls they stand for. All rooms here are invented.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain, item, PROJECT_SCRIPTS } = require('./load');

const { get } = load([...PROJECT_SCRIPTS, 'js/print.js']);
const names = ['mirrorRoom', 'resizeRoom', 'resizeFromStart', 'minRoomSize', 'minRoomSizeFromStart', 'grabOffset', 'followPoint', 'moveParked',
  'keepLayoutsParked', 'pushedOut', 'outsideNotice', 'fixtureHandle', 'sizeFixtureTo', 'addCorner', 'addShape', 'roomProblems', 'cleanRoom',
  'analyze', 'fengShui', 'fsEstimate', 'beamerCheck', 'roomGeo', 'inRoom', 'dimensionRows', 'fixtureWalls', 'DEMO_ROOMS',
  'templateProject', 'layoutItems', 'reviewLayout', 'CORNERS'];
const g = Object.fromEntries(names.map(n => [n, get(n)]));

const box = (w = 400, l = 500, openings = [], fixtures = []) => ({ w, l, wall: 20, openings, fixtures });
const door = (wall, pos, extra = {}) => ({ type: 'door', wall, pos, width: 90, hinge: 'start', ...extra });
const windowOn = (wall, pos, width = 120) => ({ type: 'window', wall, pos, width });
const estimate = (items, room) => g.fsEstimate(g.fengShui(items, room), items, room);

// ---------- Moving the left and top walls ----------

const sample = () => box(400, 500, [door('top', 100), windowOn('bottom', 200), door('left', 50, { hinge: 'end' }), windowOn('right', 300)], [
  { type: 'chimney', x: 0, y: 0, w: 60, d: 40 }, { type: 'column', x: 200, y: 250, w: 40, d: 40 },
  { type: 'radiator', x: 390, y: 300, w: 10, d: 100 }, { type: 'block', x: 0, y: 450, w: 400, d: 50 },
]);

test('a room in a mirror, twice, is the same room', () => {
  const r = sample();
  for (const axis of ['x', 'y']) assert.deepEqual(plain(g.mirrorRoom(g.mirrorRoom(r, axis), axis)), plain(r), axis);
  const m = g.mirrorRoom(r, 'x');
  assert.deepEqual(plain(m.openings[0]), { type: 'door', wall: 'top', pos: 210, width: 90, hinge: 'end' }, 'runs the other way');
  assert.equal(m.openings[2].wall, 'right');
  assert.equal(m.fixtures[0].x, 340);
});

test('the left wall moves, and everything else keeps its place on the floor', () => {
  const r = sample(), { room, shift } = g.resizeFromStart(r, { w: 450 });
  assert.deepEqual(plain(shift), [50, 0]);
  assert.equal(room.w, 450);
  assert.deepEqual(room.openings.map(o => o.pos), [150, 250, 50, 300], 'openings across the room move, those on the side walls not');
  assert.deepEqual(room.openings.map(o => o.hinge ?? null), ['start', null, 'end', null], 'hinges stay as they were');
  const [chimney, column, radiator, across] = plain(room.fixtures);
  assert.deepEqual([chimney.x, chimney.w], [0, 60], 'a fixture at the moving wall goes with it');
  assert.equal(column.x, 250);
  assert.equal(radiator.x, 440, 'one at the far wall stays there');
  assert.deepEqual([across.x, across.w], [0, 450], 'one from wall to wall stretches');
  g.cleanRoom(room);
});

test('the top wall moves the same way', () => {
  const r = sample(), { room, shift } = g.resizeFromStart(r, { l: 470 });
  assert.deepEqual(plain(shift), [0, -30]);
  assert.deepEqual(room.openings.map(o => o.pos), [100, 200, 20, 270]);
  assert.deepEqual(plain(room.fixtures.map(f => [f.y, f.d])), [[0, 40], [220, 40], [270, 100], [420, 50]]);
  g.cleanRoom(room);
});

test('the left and top walls stop where something stands, and say what', () => {
  const r = box(400, 500, [door('top', 100)], [{ type: 'column', x: 150, y: 300, w: 40, d: 40 }]);
  const min = g.minRoomSizeFromStart(r);
  assert.deepEqual([min.w, min.whyW, min.l, min.whyL], [300, 'Door', 200, 'Column']);
  assert.equal(g.resizeFromStart(r, { w: 10 }).room.w, 300);
  assert.deepEqual(plain(g.resizeFromStart(r, { w: 10 }).shift), [-100, 0]);
  assert.equal(g.resizeFromStart(r, { w: 10 }).room.openings[0].pos, 0, 'the door ends up at the corner');
  assert.equal(g.minRoomSize(r).w, 190, 'the right wall has another limit');
});

test('a room changed from both ends equals one built that way', () => {
  const r = box(300, 300, [door('top', 100), windowOn('right', 100)], [{ type: 'column', x: 100, y: 100, w: 40, d: 40 }]);
  const { room } = g.resizeFromStart(g.resizeRoom(r, { w: 350 }), { w: 400, l: 380 });
  assert.deepEqual(plain(room), plain(box(400, 380, [door('top', 150), windowOn('right', 180)], [{ type: 'column', x: 150, y: 180, w: 40, d: 40 }])));
});

test('the handles of the left and top walls hold on to the pointer', () => {
  assert.deepEqual(plain(g.grabOffset(box(), 'x0', undefined, [-8, 250])), [-8, 250]);
  assert.deepEqual(plain(g.grabOffset(box(), 'y0', undefined, [200, -12])), [200, -12]);
});

test('furniture moves with the floor, parked pieces keep their distance', () => {
  const before = box(), after = g.resizeFromStart(before, { w: 460 }).room, shift = [60, 0];
  const items = [item('in', 'custom', 100, 100, 20, 20), item('right', 'custom', 480, 50, 40, 40), item('left', 'custom', -80, 100, 40, 40),
    item('below', 'custom', 100, 560, 40, 40), item('gone', 'custom', 30, 300, 20, 20, 0, { hidden: true })];
  const moved = g.moveParked(items, before, after, shift);
  assert.deepEqual(plain(moved.map(i => [i.x, i.y])), [[160, 100], [540, 50], [-80, 100], [160, 560], [90, 300]]);
  for (const [i, inside] of [[0, true], [1, false], [2, false], [3, false]]) assert.equal(g.inRoom(moved[i], after), inside, items[i].id);
  assert.equal(items[0].x, 100, 'the items passed in stay as they were');
  assert.deepEqual(plain(g.followPoint([100, 100], before, before)), [100, 100], 'without a shift nothing in the room moves');
});

test('the layouts move with the floor, and undoing the shift gives them back', () => {
  const before = box(), { room: after, shift } = g.resizeFromStart(before, { w: 450, l: 540 });
  const layout = { name: 'A', place: { bed: [100, 100, 90], chair: [480, 50, 0], lamp: [-60, 20, 0] }, savedAt: 5 };
  const [moved] = g.keepLayoutsParked([layout], before, after, shift);
  assert.deepEqual(plain(moved.place), { bed: [150, 140, 90], chair: [530, 90, 0], lamp: [-60, 60, 0] });
  assert.equal(moved.savedAt, 5);
  const [back] = g.keepLayoutsParked([moved], after, before, shift.map(v => -v));
  assert.deepEqual(plain(back.place), plain(layout.place));
  assert.equal(g.keepLayoutsParked([layout], before, before)[0], layout, 'nothing to do without a change');
});

test('moving the left wall in pushes out what stood there, and says so', () => {
  const before = box(), { room: after, shift } = g.resizeFromStart(before, { w: 300 });
  const items = [item('Bed', 'bed', 60, 200, 100, 200), item('Desk', 'table', 300, 100, 120, 60)];
  assert.deepEqual(plain(g.pushedOut(items, before, after, shift).map(i => i.name)), ['Bed']);
  const text = g.outsideNotice(items, [{ name: 'A', place: { Bed: [60, 200, 0] } }, { name: 'B', place: { Desk: [300, 100, 0] } }], before, after, shift);
  assert.match(text, /Bed is now outside/);
  assert.match(text, /1 saved layout has/);
  assert.equal(g.outsideNotice(items, [], before, after), '', 'without the shift the bed would seem to stay');
});

test('a plan grown on the left checks the same as before', () => {
  const r = box(400, 500, [door('right', 100), windowOn('bottom', 150, 160)], [{ type: 'column', x: 0, y: 0, w: 40, d: 40 }]);
  const items = [item('bed', 'bed', 110, 140, 140, 200), item('desk', 'table', 300, 440, 120, 60, 180), item('shelf', 'shelf', 383, 300, 80, 35, 90)];
  const { room, shift } = g.resizeFromStart(r, { w: 400, l: 500 });
  assert.deepEqual(plain(shift), [0, 0]);
  const grown = g.resizeFromStart(r, { w: 470 }), moved = g.moveParked(items, r, grown.room, grown.shift);
  const texts = (its, rm) => plain(g.analyze(its, rm).issues.map(i => i.text)).sort();
  assert.deepEqual(texts(moved, grown.room), texts(items, room));
  assert.equal(grown.room.fixtures[0].x, 0, 'the column in the corner stays in the corner');
});

// ---------- Corner blocks ----------

test('a corner block goes into the corner asked for, and its handle sits at the inner corner', () => {
  const r = box(400, 500);
  const want = { tl: [0, 0], tr: [265, 0], bl: [0, 335], br: [265, 335] };
  for (const corner of g.CORNERS) {
    const { room, index } = g.addCorner(r, corner), f = room.fixtures[index];
    assert.deepEqual(plain([f.type, f.x, f.y, f.w, f.d]), ['block', ...want[corner], 135, 165], corner);
    const inner = [corner[1] === 'r' ? f.x : f.x + f.w, corner[0] === 'b' ? f.y : f.y + f.d];
    assert.deepEqual(plain(g.fixtureHandle(f, room)), inner, corner);
    g.cleanRoom(room);
  }
});

test('dragging the handle of a corner block resizes it and keeps it in the corner', () => {
  const { room } = g.addCorner(box(400, 500), 'br'), at = (x, y, snap) => plain(g.sizeFixtureTo(room, 0, x, y, snap).fixtures[0]);
  assert.deepEqual(at(200, 300), { type: 'block', x: 200, y: 300, w: 200, d: 200 });
  assert.deepEqual(at(-50, -50), { type: 'block', x: 0, y: 0, w: 400, d: 500 }, 'up to the far walls');
  assert.deepEqual(at(999, 999), { type: 'block', x: 395, y: 495, w: 5, d: 5 }, 'never below the smallest size');
  assert.deepEqual(at(202, 303, v => Math.round(v / 5) * 5), { type: 'block', x: 200, y: 305, w: 200, d: 195 }, 'snaps the edge that moves');
  const tl = g.addCorner(box(400, 500), 'tl').room;
  assert.deepEqual(plain(g.sizeFixtureTo(tl, 0, 90, 120).fixtures[0]), { type: 'block', x: 0, y: 0, w: 90, d: 120 });
  const free = box(400, 500, [], [{ type: 'column', x: 100, y: 100, w: 40, d: 40 }]);
  assert.deepEqual(plain(g.sizeFixtureTo(free, 0, 160, 170).fixtures[0]), { type: 'column', x: 100, y: 100, w: 60, d: 70 },
    'a free fixture grows from its bottom right corner');
  assert.deepEqual(plain(g.grabOffset(room, 'size', 0, [270, 340])), [5, 5]);
});

test('a corner block in front of a door is still added, and reported', () => {
  const r = box(400, 500, [door('bottom', 300)]), { room } = g.addCorner(r, 'br');
  assert.equal(g.roomProblems(room).length, 1);
  assert.equal(g.roomProblems(g.addCorner(r, 'tl').room).length, 0);
});

test('any sequence of corner blocks, handles and moved walls leaves a valid room', () => {
  let seed = 11;
  const rnd = n => { seed = (seed * 48271) % 2147483647; return seed % n; };
  for (let run = 0; run < 30; run++) {
    let r = box(100 + rnd(600), 100 + rnd(600), [door('top', 0)]);
    for (let step = 0; step < 40; step++) {
      const fx = r.fixtures.length ? rnd(r.fixtures.length) : -1, v = rnd(900) - 200;
      const ops = [
        () => g.addCorner(r, g.CORNERS[rnd(4)]).room,
        () => g.addShape(r, 'U').room,
        () => g.resizeFromStart(r, { w: v }).room,
        () => g.resizeFromStart(r, { l: v }).room,
        () => g.resizeRoom(r, { w: v, l: rnd(900) - 200 }),
        () => fx < 0 ? r : g.sizeFixtureTo(r, fx, v, rnd(900) - 200),
      ];
      r = ops[rnd(ops.length)]();
      g.cleanRoom(r);
    }
  }
});

// ---------- Checks in a room with corners ----------

// An L: the block takes the bottom right corner
const lRoom = () => box(500, 400, [door('top', 60), windowOn('left', 150, 140)], [{ type: 'block', x: 300, y: 250, w: 200, d: 150 }]);

test('a bed with its head at a wall block or a column has a wall behind it, at a radiator not', () => {
  const r = lRoom();
  // Turned to the right: the head points at the block face x = 300
  const bed = item('b', 'bed', 200, 325, 90, 200, 90);
  assert.doesNotMatch(estimate([bed], r).why.bed, /no wall behind/);
  const column = box(500, 400, r.openings, [{ type: 'column', x: 0, y: 330, w: 45, d: 45 }]);
  assert.doesNotMatch(estimate([item('b', 'bed', 145, 335, 90, 200, 270)], column).why.bed, /no wall behind/);
  const radiator = box(500, 400, r.openings, [{ type: 'radiator', x: 0, y: 290, w: 40, d: 90 }]);
  assert.match(estimate([item('b', 'bed', 145, 335, 90, 200, 270)], radiator).why.bed, /no wall behind/);
  assert.match(estimate([item('b', 'bed', 145, 335, 90, 200, 270)], box(500, 400, r.openings)).why.bed, /no wall behind/);
});

test('a bed in the inner corner of an L stands in a corner', () => {
  // The block reaches up to y = 100: the head is at the top wall, the right long side faces the block for half its length
  const r = { ...lRoom(), fixtures: [{ type: 'block', x: 300, y: 100, w: 200, d: 300 }] }, bed = item('b', 'bed', 255, 100, 90, 200);
  assert.doesNotMatch(estimate([bed], r).why.bed, /stands out/);
  assert.match(estimate([bed], box(500, 400, r.openings)).why.bed, /stands out/, 'in the open the same bed stands out');
  const short = { ...r, fixtures: [{ type: 'block', x: 300, y: 180, w: 200, d: 220 }] };
  assert.match(estimate([bed], short).why.bed, /stands out/, 'a block beside the foot end only is no wall for it');
});

test('a desk cannot have its chair inside a wall block', () => {
  const r = box(500, 400, [door('top', 300), windowOn('left', 100)], [{ type: 'block', x: 0, y: 290, w: 200, d: 110 }]);
  // Its front faces the block, so the chair goes to the back
  const desk = item('d', 'table', 100, 265, 120, 50, 0), seat = g.fengShui([desk], r).views[0]?.seat.p;
  assert.ok(seat, 'it has a seat');
  assert.ok(seat[1] < 240, `the seat is behind the desk, not in the block: ${seat}`);
  assert.ok(g.fengShui([desk], { ...r, fixtures: [] }).views[0].seat.p[1] > 290, 'without the block it is in front');
});

test('a column or a wall block between the bed and the door hides the door', () => {
  const r = box(500, 400, [door('right', 20), windowOn('bottom', 100)]);
  const bed = item('b', 'bed', 70, 110, 140, 200);   // head at the top wall, looking down the room
  const column = { ...r, fixtures: [{ type: 'column', x: 250, y: 35, w: 40, d: 40 }] };
  assert.notEqual(g.fengShui([bed], r).views[0].level, 'blocked');
  assert.equal(g.fengShui([bed], column).views[0].level, 'blocked');
  assert.equal(g.fengShui([bed], { ...r, fixtures: [{ type: 'radiator', x: 250, y: 35, w: 40, d: 10 }] }).views[0].level,
    g.fengShui([bed], r).views[0].level, 'a radiator is too low');
});

test('a wall block takes a bed out of the line of the door', () => {
  const r = box(500, 500, [door('top', 200), windowOn('left', 300)]);
  const bed = item('b', 'bed', 245, 400, 140, 200, 180);
  assert.equal(g.fengShui([bed], r).doorLines.length, 1);
  assert.equal(g.fengShui([bed], { ...r, fixtures: [{ type: 'block', x: 150, y: 120, w: 200, d: 60 }] }).doorLines.length, 0);
});

test('a projected picture on a wall block must stay on the block', () => {
  const r = box(600, 400, [door('top', 400)], [{ type: 'block', x: 0, y: 0, w: 250, d: 120 }]);
  const tv = (x, image = 180) => item('tv', 'tv', x, 145, 160, 50, 0, { image });
  assert.equal(g.beamerCheck(tv(125), [], g.roomGeo(r)).offWall, '');
  assert.equal(g.beamerCheck(tv(225), [], g.roomGeo(r)).offWall, 'past the edge of the wall block');
  assert.equal(g.beamerCheck(tv(400), [], g.roomGeo(r)).offWall, '', 'a board in the open room is not checked');
  assert.match(g.analyze([tv(225)], r).issues.map(i => i.text).join(), /past the edge of the wall block/);
});

test('the way to the window goes around a corner block', () => {
  const r = box(500, 400, [door('top', 30), windowOn('bottom', 360, 120)], [{ type: 'block', x: 250, y: 0, w: 250, d: 200 }]);
  const fs = g.fengShui([], r);
  assert.ok(fs.path, 'there is a way');
  assert.ok(fs.path.every(p => !(p.x > 250 && p.y < 200)), 'and it never crosses the block');
  const closed = { ...r, fixtures: [...r.fixtures, { type: 'block', x: 0, y: 250, w: 250, d: 150 }] };
  assert.equal(estimate([], closed).why.flow.startsWith('no way'), false, 'a gap of 50 cm still counts');
});

test('print: a corner block is measured on both walls, other corner fixtures on one', () => {
  const r = box(400, 500, [], [{ type: 'block', x: 250, y: 350, w: 150, d: 150 }]);
  assert.deepEqual(plain(g.fixtureWalls(r.fixtures[0], r)), ['bottom', 'right']);
  const rows = plain(g.dimensionRows(r));
  assert.deepEqual(rows.bottom, [[0, 250, 400]]);
  assert.deepEqual(rows.right, [[0, 350, 500]]);
  assert.deepEqual(plain(g.fixtureWalls({ type: 'column', x: 0, y: 0, w: 40, d: 40 }, r)), ['top']);
  assert.deepEqual(plain(g.fixtureWalls({ type: 'block', x: 0, y: 0, w: 400, d: 50 }, r)), ['top'], 'one from wall to wall is no corner');
  assert.deepEqual(plain(g.fixtureWalls({ type: 'block', x: 100, y: 100, w: 50, d: 50 }, r)), []);
});

// ---------- The demo room with a corner column ----------

test('one demo room has a column in a corner, and its layouts use it', () => {
  const t = g.DEMO_ROOMS.find(d => d.room.fixtures.some(f => f.type === 'column' && (f.x === 0 || f.x + f.w === d.room.w) &&
    (f.y === 0 || f.y + f.d === d.room.l)));
  assert.ok(t, 'a demo room with a corner column');
  const p = g.templateProject(t, t.name);
  assert.equal(p.layouts.length, 3);
  const reviews = p.layouts.map(l => g.reviewLayout(g.layoutItems(p, l), p.room));
  for (const r of reviews) assert.equal(r.clashes, 0);
  // One layout rests the bed against the column, which counts as a wall
  const leaning = p.layouts.find(l => /column/i.test(l.name));
  assert.ok(leaning);
  assert.doesNotMatch(estimate(g.layoutItems(p, leaning), p.room).why.bed, /no wall behind/);
});
