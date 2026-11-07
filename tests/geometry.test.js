'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain, ROOM, item } = require('./load');

const { get } = load(['js/geometry.js']);
const [rad, rectPoly, sectorPoly, roomGeo, toWorld, itemPoly, aabb, overlap, maxOpening, inPoly] =
  ['rad', 'rectPoly', 'sectorPoly', 'roomGeo', 'toWorld', 'itemPoly', 'aabb', 'overlap', 'maxOpening', 'inPoly'].map(get);
const [inRoom, activeItems, normRot, gaps, snapItem, parkBounds, park, contentBounds, defaultItems, applyPlacement, presetItems] =
  ['inRoom', 'activeItems', 'normRot', 'gaps', 'snapItem', 'parkBounds', 'park', 'contentBounds', 'defaultItems',
    'applyPlacement', 'presetItems'].map(get);

const door = g => g.swings.find(s => s.name.includes('Door'));
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not close to ${b}`);

test('toWorld rotates around the item centre', () => {
  const it = item('a', 'custom', 100, 50, 40, 20, 90);
  const [x, y] = toWorld(it, 10, 0);
  near(x, 100); near(y, 60);
});

test('itemPoly swaps width and depth at 90 degrees', () => {
  const A = aabb(itemPoly(item('a', 'custom', 100, 100, 40, 20, 90)));
  near(A.x0, 90); near(A.x1, 110); near(A.y0, 80); near(A.y1, 120);
});

test('overlap returns the penetration depth, 0 when apart or only touching', () => {
  const a = rectPoly(0, 0, 10, 10);
  near(overlap(a, rectPoly(7, 0, 10, 10)), 3);
  assert.equal(overlap(a, rectPoly(10, 0, 10, 10)), 0);
  assert.equal(overlap(a, rectPoly(30, 30, 10, 10)), 0);
});

test('overlap handles rotated polygons and ignores the corner gap of the bounding boxes', () => {
  const diamond = itemPoly(item('a', 'custom', 0, 0, 20, 20, 45));
  assert.ok(overlap(diamond, rectPoly(13, 13, 5, 5)) === 0, 'boxes overlap, shapes do not');
  assert.ok(overlap(diamond, rectPoly(10, -2, 5, 4)) > 0);
});

test('inPoly accepts both windings', () => {
  const P = rectPoly(0, 0, 10, 10);
  assert.equal(inPoly(5, 5, P), true);
  assert.equal(inPoly(5, 5, [...P].reverse()), true);
  assert.equal(inPoly(15, 5, P), false);
});

test('sectorPoly starts at the centre and ends on the arc', () => {
  const P = sectorPoly([10, 10], 5, 0, 90, 4);
  assert.equal(P.length, 6);
  assert.deepEqual(plain(P[0]), [10, 10]);
  near(P[1][0], 15); near(P[5][1], 15);
});

test('roomGeo derives openings and obstacles from the room', () => {
  const g = roomGeo(ROOM);
  assert.deepEqual([g.W, g.L], [400, 500]);
  assert.deepEqual(plain(g.openings.map(o => [o.a, o.b])), [[[400, 100], [400, 190]], [[100, 500], [300, 500]]]);
  assert.deepEqual(plain(g.swings.map(s => s.r)), [90, 100, 100]);
  assert.deepEqual(plain(door(g).pivot), [400, 100]);
  assert.deepEqual(plain(aabb(g.obstacles[0].poly)), { x0: 360, y0: 0, x1: 400, y1: 40 });
  assert.deepEqual(plain(aabb(g.obstacles[1].poly)), { x0: 310, y0: 490, x1: 360, y1: 500 });
});

test('roomGeo moves the door pivot when the hinge is at the bottom', () => {
  const openings = ROOM.openings.map(o => o.type === 'door' ? { ...o, hinge: 'end' } : o);
  const s = door(roomGeo({ ...ROOM, openings }));
  assert.deepEqual(plain(s.pivot), [400, 190]);
  assert.deepEqual([s.a0, s.a1, s.open, s.closed], [180, 270, 180, 270]);
});

test('maxOpening: a free door opens fully', () => {
  assert.equal(maxOpening(door(roomGeo(ROOM)), rectPoly(10, 300, 20, 20)), 90);
});

test('maxOpening: a box beside the closed leaf blocks it at once', () => {
  assert.equal(maxOpening(door(roomGeo(ROOM)), rectPoly(380, 120, 19, 50)), 0);
});

test('maxOpening: the angle grows as the obstacle moves away from the leaf', () => {
  const leaf = door(roomGeo(ROOM));
  // The leaf sweeps from pointing down (closed) to pointing left (open)
  const near = maxOpening(leaf, rectPoly(340, 150, 40, 30));
  const far = maxOpening(leaf, rectPoly(330, 150, 25, 30));
  assert.ok(near > 0 && near < far && far < 90, `${near} < ${far}`);
});

test('maxOpening works the same for both balcony leaves (mirrored room)', () => {
  const [left, right] = roomGeo(ROOM).swings.filter(s => s.name.includes('Balcony'));
  const box = (x0, w) => rectPoly(x0, 420, w, 30);
  assert.equal(maxOpening(left, box(150, 20)), maxOpening(right, box(230, 20)));
});

test('inRoom uses the item centre', () => {
  assert.equal(inRoom(item('a', 'custom', 400, 500, 10, 10), ROOM), true);
  assert.equal(inRoom(item('a', 'custom', 401, 500, 10, 10), ROOM), false);
});

test('activeItems skips hidden and parked items', () => {
  const items = [item('in', 'custom', 10, 10, 5, 5), item('hid', 'custom', 10, 10, 5, 5, 0, { hidden: true }),
    item('out', 'custom', 900, 10, 5, 5)];
  assert.deepEqual(plain(activeItems(items, ROOM).map(i => i.id)), ['in']);
});

test('normRot wraps into 0..360 and rounds to a tenth', () => {
  assert.equal(normRot(-90), 270);
  assert.equal(normRot(725.04), 5);
  assert.equal(normRot(360), 0);
});

test('gaps measures to walls and the nearest neighbour', () => {
  const a = item('a', 'custom', 100, 250, 40, 40), b = item('b', 'custom', 200, 250, 40, 40);
  const d = plain(gaps(a, [a, b], ROOM).map(s => s.d));
  assert.deepEqual(d, [80, 60, 230, 230]);
});

test('gaps drops sides that touch something', () => {
  const a = item('a', 'custom', 20, 250, 40, 40);
  assert.equal(gaps(a, [a], ROOM).length, 3);
});

test('snapItem pulls to a wall within the magnet range, else to the grid', () => {
  const a = item('a', 'custom', 26, 250, 40, 40);
  snapItem(a, [a], ROOM);
  assert.equal(a.x, 20);
  const b = item('b', 'custom', 112, 252, 40, 40);
  snapItem(b, [b], ROOM);
  assert.equal(b.x, 110);
  assert.equal(b.y, 250);
});

test('park puts items beside the room, then below the parked items', () => {
  const a = item('a', 'custom', 100, 100, 40, 20), b = item('b', 'custom', 100, 200, 40, 20);
  park(a, [a, b], ROOM);
  assert.deepEqual([a.x, a.y], [510, 25]);
  park(b, [a, b], ROOM);
  assert.deepEqual([b.x, b.y], [510, 65], 'b stands below a');
  assert.equal(parkBounds([], ROOM), null);
});

test('contentBounds covers the room and visible items only', () => {
  const far = item('a', 'custom', 900, 100, 40, 20), hid = item('b', 'custom', 2000, 100, 40, 20, 0, { hidden: true });
  const b = contentBounds([far, hid], ROOM);
  assert.equal(b.x1, 935);
  assert.equal(b.x0, -70);
});

test('defaultItems parks everything in columns outside the room', () => {
  const defs = [{ id: 'a', name: 'A', kind: 'custom', w: 50, d: 300, color: '#888888' },
    { id: 'b', name: 'B', kind: 'custom', w: 50, d: 300, color: '#888888' }];
  const [a, b] = defaultItems(ROOM, defs);
  assert.deepEqual([a.x, a.y, a.rot], [495, 150, 0]);
  assert.ok(b.x > a.x, 'second column');
  assert.equal(b.y, 150);
  assert.equal(inRoom(a, ROOM), false);
});

test('applyPlacement places known items and parks the rest', () => {
  const items = [item('a', 'custom', 900, 0, 40, 20), item('b', 'custom', 100, 100, 40, 20)];
  applyPlacement(items, { a: [50, 60, 90] }, ROOM);
  assert.deepEqual([items[0].x, items[0].y, items[0].rot, items[0].hidden], [50, 60, 90, false]);
  assert.equal(inRoom(items[1], ROOM), false);
  assert.equal(items[1].hidden, false);
});

test('presetItems returns fresh items and tolerates a missing preset', () => {
  const defs = [{ id: 'a', name: 'A', kind: 'custom', w: 50, d: 30, color: '#888888' }];
  const preset = { place: { a: [50, 60, 0] } };
  const first = presetItems(ROOM, defs, preset);
  first[0].x = 1;
  assert.equal(presetItems(ROOM, defs, preset)[0].x, 50);
  assert.equal(inRoom(presetItems(ROOM, defs, undefined)[0], ROOM), false);
});

test('rad converts degrees', () => near(rad(180), Math.PI));
