'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain, ROOM, item } = require('./load');

const CRIT = [['a', 'A'], ['b', 'B']];
const { get } = load(['js/platform.js', 'js/geometry.js', 'js/analyze.js']);
const [analyze, beamerCheck, shelfBacked, fengShui, fsEstimate, weightedScore, roomGeo] =
  ['analyze', 'beamerCheck', 'shelfBacked', 'fengShui', 'fsEstimate', 'weightedScore', 'roomGeo'].map(get);

const levels = r => plain(r.issues.map(i => i.lvl));

test('an empty room has no issues', () => {
  assert.deepEqual(levels(analyze([], ROOM)), []);
});

test('reaching into a wall is an error on that item', () => {
  const r = analyze([item('a', 'custom', 10, 300, 60, 40)], ROOM);
  assert.deepEqual(levels(r), [2]);
  assert.match(r.issues[0].text, /20 cm/);
  assert.equal(r.flag.get('a'), 2);
});

test('collision: overlapping items are both flagged, touching items are not', () => {
  const a = item('a', 'custom', 100, 300, 40, 40);
  const r = analyze([a, item('b', 'custom', 130, 300, 40, 40)], ROOM);
  assert.deepEqual(levels(r), [2]);
  assert.equal(r.flag.get('a'), 2);
  assert.equal(r.flag.get('b'), 2);
  assert.deepEqual(levels(analyze([a, item('b', 'custom', 140, 300, 40, 40)], ROOM)), []);
});

test('collision respects rotation', () => {
  const a = item('a', 'custom', 100, 300, 100, 20), b = item('b', 'custom', 100, 340, 20, 40);
  assert.deepEqual(levels(analyze([a, b], ROOM)), []);
  assert.deepEqual(levels(analyze([{ ...a, rot: 90 }, b], ROOM)), [2]);
});

test('hitting a fixture is an error', () => {
  assert.deepEqual(levels(analyze([item('a', 'custom', 350, 30, 40, 40)], ROOM)), [2]);
});

test('standing in a door swing is a warning that names the reachable angle', () => {
  const r = analyze([item('a', 'custom', 355, 170, 40, 60)], ROOM);
  assert.deepEqual(levels(r), [1]);
  assert.match(r.issues[0].text, /\d+°/);
});

test('errors sort before warnings', () => {
  const r = analyze([item('a', 'custom', 355, 170, 40, 60), item('b', 'custom', 10, 300, 60, 40)], ROOM);
  assert.deepEqual(levels(r), [2, 1]);
});

test('hidden and parked items are not checked', () => {
  assert.deepEqual(levels(analyze([item('a', 'custom', 10, 300, 60, 40, 0, { hidden: true }),
    item('b', 'custom', 900, 300, 60, 40)], ROOM)), []);
});

test('wardrobe doors need room in front', () => {
  const free = item('w', 'wardrobe', 100, 25, 90, 50);
  assert.deepEqual(levels(analyze([free], ROOM)), []);
  assert.deepEqual(levels(analyze([free, item('b', 'custom', 100, 80, 90, 20)], ROOM)), [1]);
});

test('an open shelf needs a long side at a wall', () => {
  const g = roomGeo(ROOM), wall = item('s', 'shelf', 100, 19, 80, 38), free = item('s', 'shelf', 200, 300, 80, 38);
  assert.equal(shelfBacked(wall, [wall], g), true);
  assert.equal(shelfBacked(free, [free], g), false);
});

test('beamerCheck reports tall furniture in front of the image, not low furniture', () => {
  const g = roomGeo(ROOM), tv = item('t', 'tv', 200, 280, 100, 40, 0, { image: 200 });
  const tall = item('w', 'wardrobe', 200, 240, 60, 40), low = item('b', 'bed', 200, 240, 60, 40);
  assert.equal(beamerCheck(tv, [tv, low], g).covered.length, 0);
  const { covered } = beamerCheck(tv, [tv, tall], g);
  assert.equal(covered.length, 1);
  assert.equal(covered[0][1], 60);
});

test('beamerCheck notices an image falling on the door', () => {
  const g = roomGeo(ROOM), tv = item('t', 'tv', 370, 145, 90, 40, 90, { image: 60 });
  assert.equal(beamerCheck(tv, [tv], g).offWall, 'partly onto Door');
});

test('beamerCheck keeps a door hit when the image later runs past the corner', () => {
  const g = roomGeo(ROOM), tv = item('t', 'tv', 370, 80, 90, 40, 90, { image: 240 });
  const { offWall } = beamerCheck(tv, [tv], g);
  assert.match(offWall, /partly onto Door/);
  assert.match(offWall, /past the corner of the room/);
});

test('fengShui finds a path through an empty room', () => {
  const fs = fengShui([], ROOM);
  assert.ok(fs.path.length > 1);
  assert.ok(fs.narrow.d > 50);
  assert.ok(fs.circle.r > 100);
});

test('fengShui reports no path when furniture closes off the balcony', () => {
  const wall = item('a', 'custom', 200, 400, 400, 40);
  assert.equal(fengShui([wall], ROOM).path, null);
});

test('fsEstimate stays within 1 to 5 where it applies and explains what does not', () => {
  const items = [], { score, why } = fsEstimate(fengShui(items, ROOM), items, ROOM);
  assert.ok(score.flow >= 1 && score.flow <= 5);
  for (const k of ['bed', 'desk', 'sofa', 'zones']) assert.equal(score[k], null, k);
  assert.match(why.bed, /no bed/);
  assert.match(why.sofa, /no sofa/);
});

test('analysis leaves the items untouched', () => {
  const items = [item('b', 'bed', 80, 110, 140, 200), item('t', 'table', 330, 250, 120, 70)];
  const before = JSON.stringify(items);
  fsEstimate(fengShui(items, ROOM), items, ROOM);
  analyze(items, ROOM);
  assert.equal(JSON.stringify(items), before);
});

test('weightedScore gives a percentage of the maximum', () => {
  assert.equal(weightedScore({ a: 5, b: 5 }, { a: 1, b: 3 }, CRIT), 100);
  assert.equal(weightedScore({ a: 5, b: 1 }, { a: 1, b: 1 }, CRIT), 60);
  assert.equal(weightedScore({ a: 5, b: 1 }, { a: 1, b: 0 }, CRIT), 100);
});

test('weightedScore drops a criterion that does not apply, with its weight', () => {
  assert.equal(weightedScore({ a: 5, b: null }, { a: 1, b: 3 }, CRIT), 100);
  assert.equal(weightedScore({ a: 3, b: undefined }, { a: 2, b: 3 }, CRIT), 60);
  assert.equal(weightedScore({ a: null, b: null }, { a: 1, b: 1 }, CRIT), 0);
});

test('weightedScore with all weights at zero is 0, not NaN', () => {
  assert.equal(weightedScore({ a: 5, b: 5 }, { a: 0, b: 0 }, CRIT), 0);
});

// ---------- Several doors: the view rates the main entrance ----------

test('with several doors the view from bed and desk rates the main entrance, not the worst door', () => {
  const front = { type: 'door', wall: 'bottom', pos: 40, width: 90, hinge: 'start' };   // in front of the bed
  const behind = { type: 'door', wall: 'top', pos: 160, width: 90, hinge: 'end' };     // behind its head, beside it
  const room = (a, b) => ({ w: 500, l: 400, wall: 20, openings: [a, b, { type: 'window', wall: 'left', pos: 150, width: 120 }], fixtures: [] });
  const bed = item('b', 'bed', 70, 110, 140, 200);   // head at the top wall, looking down the room
  const view = r => { const v = fengShui([bed], r).views[0]; return { level: v.level, door: plain(v.door) }; };
  const geo = r => roomGeo(r).openings;
  assert.equal(view(room({ ...front, main: true }, behind)).level, 'good', 'main entrance in sight');
  assert.deepEqual(view(room({ ...front, main: true }, behind)).door, plain(geo(room(front, behind))[0].mid), 'the line goes to it');
  assert.equal(view(room(front, { ...behind, main: true })).level, 'back', 'main entrance behind the head');
  // Without a marked one the first door is the entrance, as for the way and the Main entrance field
  assert.equal(view(room(front, behind)).level, 'good');
  assert.equal(view(room(behind, front)).level, 'back');
  // The score follows: the door behind the head costs a point only when it is the way in
  const bedScore = r => fsEstimate(fengShui([bed], r), [bed], r).score.bed;
  assert.ok(bedScore(room({ ...front, main: true }, behind)) > bedScore(room(front, { ...behind, main: true })));
});

test('a balcony door as the only way in counts for the view once it is marked', () => {
  const balcony = { type: 'balcony', wall: 'bottom', pos: 40, width: 120, hinge: 'start' };
  const room = o => ({ w: 500, l: 400, wall: 20, openings: [o], fixtures: [] });
  const bed = item('b', 'bed', 70, 110, 140, 200);
  assert.equal(fengShui([bed], room(balcony)).views[0].level, null, 'no entrance, nothing to rate');
  assert.equal(fengShui([bed], room({ ...balcony, main: true })).views[0].level, 'good');
});

test('a desk rates the main entrance too', () => {
  const room = main => ({ w: 500, l: 400, wall: 20, fixtures: [], openings: [
    { type: 'door', wall: 'bottom', pos: 300, width: 90, hinge: 'start', ...(main === 0 ? { main: true } : {}) },
    { type: 'door', wall: 'top', pos: 300, width: 90, hinge: 'start', ...(main === 1 ? { main: true } : {}) },
    { type: 'window', wall: 'right', pos: 150, width: 120 }] });
  const desk = item('d', 'table', 250, 60, 120, 60);   // against the top wall, the chair in front looks up at it
  const levels = [0, 1].map(m => fengShui([desk], room(m)).views[0].level);
  assert.notEqual(levels[0], levels[1], `the main entrance decides: ${levels}`);
});
