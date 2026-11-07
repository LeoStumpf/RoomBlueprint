'use strict';
// Rooms of every shape, all invented: nothing in the checks may depend on where a door or window happens to be.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain, ROOM, item } = require('./load');

const { get } = load(['js/platform.js', 'js/geometry.js', 'js/analyze.js', 'js/print.js']);
const [roomGeo, analyze, fengShui, fsEstimate, itemPoly, overlap, lightPos, beamerCheck, weightedScore] =
  ['roomGeo', 'analyze', 'fengShui', 'fsEstimate', 'itemPoly', 'overlap', 'lightPos', 'beamerCheck', 'weightedScore'].map(get);
const [dimensionRows, pickPrintScale, printFrame, fixtureWall, scaleBar, PRINT_SCALES] =
  ['dimensionRows', 'pickPrintScale', 'printFrame', 'fixtureWall', 'scaleBar', 'PRINT_SCALES'].map(get);

const CRIT = get('CRIT');
const estimate = (items, room) => fsEstimate(fengShui(items, room), items, room);
const room = (openings, extra = {}) => ({ w: 400, l: 500, wall: 20, openings, fixtures: [], ...extra });
const door = (wall, pos, hinge = 'start', extra = {}) => ({ type: 'door', wall, pos, width: 90, hinge, ...extra });
const windowOn = (wall, pos, width = 120) => ({ type: 'window', wall, pos, width });
const balcony = (wall, pos, width = 200, hinge = 'both') => ({ type: 'balcony', wall, pos, width, hinge });

// Turns the plan a quarter to the right. A flipped wall runs the other way, so positions and hinges flip with it.
const flipHinge = h => ({ start: 'end', end: 'start' }[h] ?? h);
function turnOpening(o, r) {
  const size = o.wall === 'top' || o.wall === 'bottom' ? r.w : r.l;
  const flip = o.wall === 'right' || o.wall === 'left';
  const wall = { top: 'right', right: 'bottom', bottom: 'left', left: 'top' }[o.wall];
  return { ...o, wall, pos: flip ? size - o.pos - o.width : o.pos, ...(flip && o.hinge ? { hinge: flipHinge(o.hinge) } : {}) };
}
function turn({ r, items }) {
  return {
    r: { ...r, w: r.l, l: r.w, openings: r.openings.map(o => turnOpening(o, r)),
      fixtures: r.fixtures.map(f => ({ ...f, x: r.l - f.y - f.d, y: f.x, w: f.d, d: f.w })) },
    items: items.map(i => ({ ...i, x: r.l - i.y, y: i.x, rot: (i.rot + 90) % 360 })),
  };
}
// Mirrors the plan left to right
function mirror({ r, items }) {
  const wall = { left: 'right', right: 'left' };
  return {
    r: { ...r, fixtures: r.fixtures.map(f => ({ ...f, x: r.w - f.x - f.w })), openings: r.openings.map(o => {
      const across = o.wall === 'top' || o.wall === 'bottom';
      return { ...o, wall: wall[o.wall] ?? o.wall, pos: across ? r.w - o.pos - o.width : o.pos,
        ...(across && o.hinge ? { hinge: flipHinge(o.hinge) } : {}) };
    }) },
    items: items.map(i => ({ ...i, x: r.w - i.x, rot: (360 - i.rot) % 360 })),
  };
}
const allViews = plan => {
  const out = [];
  let p = plan;
  for (let k = 0; k < 4; k++) { out.push(p, mirror(p)); p = turn(p); }
  return out;
};

const furnished = [
  item('bed', 'bed', 75, 105, 140, 200),
  item('sofa', 'sofa', 45, 390, 170, 85, 90),
  item('desk', 'table', 280, 440, 120, 60),
  item('board', 'tv', 372, 340, 100, 50, 270, { image: 180 }),
  item('wardrobe', 'wardrobe', 300, 30, 100, 55),
];
const plans = {
  'door right, balcony below': { r: ROOM, items: furnished },
  'door left, window on top': { r: room([door('left', 300), windowOn('top', 150)]), items: [
    item('bed', 'bed', 290, 395, 140, 200, 180), item('desk', 'table', 200, 45, 120, 60, 180)] },
  'two doors, two windows': { r: room([door('top', 40), door('right', 300, 'end'), windowOn('left', 150), windowOn('bottom', 60, 90)]),
    items: [item('bed', 'bed', 300, 395, 140, 200, 180), item('desk', 'table', 60, 200, 120, 60, 90), item('sofa', 'sofa', 200, 440, 170, 85, 180)] },
  // Every fixture that a check treats as a wall: a block cuts a corner, a column stands in another, a chimney at a wall
  'L with a column and a chimney': { r: room([door('top', 40), windowOn('left', 200), windowOn('bottom', 120)], { fixtures: [
    { type: 'block', x: 260, y: 0, w: 140, d: 200 }, { type: 'column', x: 0, y: 455, w: 45, d: 45 }, { type: 'chimney', x: 340, y: 300, w: 60, d: 80 }] }),
    items: [item('bed', 'bed', 145, 455, 90, 200, 270), item('desk', 'table', 200, 260, 120, 60, 90), item('board', 'tv', 325, 223, 120, 45, 0, { image: 140 }),
      item('wardrobe', 'wardrobe', 230, 120, 100, 55, 90), item('sofa', 'sofa', 330, 445, 140, 80, 180)] },
};

for (const [name, plan] of Object.entries(plans)) {
  test(`${name}: turning or mirroring the room changes no result`, () => {
    const want = estimate(plan.items, plan.r), levels = a => plain(a.issues.map(i => i.lvl)).sort();
    for (const v of allViews(plan)) {
      assert.deepEqual(plain(estimate(v.items, v.r).score), plain(want.score));
      assert.deepEqual(levels(analyze(v.items, v.r)), levels(analyze(plan.items, plan.r)));
    }
  });
}

test('a turned room puts its door swing on the same spot', () => {
  const box = plan => plan.items.map(it => overlap(itemPoly(it), roomGeo(plan.r).swings[0].poly) > 0.5);
  const plan = { r: room([door('right', 100)]), items: [item('a', 'custom', 355, 170, 40, 60), item('b', 'custom', 60, 60, 40, 40)] };
  for (const v of allViews(plan)) assert.deepEqual(box(v), [true, false]);
});

test('roomGeo: leaves swing into the room from every wall', () => {
  const centre = [200, 250];
  for (const wall of ['top', 'right', 'bottom', 'left']) for (const hinge of ['start', 'end', 'both']) {
    const g = roomGeo(room([door(wall, 150, hinge)]));
    assert.equal(g.swings.length, hinge === 'both' ? 2 : 1);
    for (const s of g.swings) {
      const tip = [s.pivot[0] + s.r * Math.cos(s.open * Math.PI / 180), s.pivot[1] + s.r * Math.sin(s.open * Math.PI / 180)];
      const toTip = Math.hypot(tip[0] - centre[0], tip[1] - centre[1]), toPivot = Math.hypot(s.pivot[0] - centre[0], s.pivot[1] - centre[1]);
      assert.ok(toTip < toPivot, `${wall} ${hinge} opens towards the middle`);
      assert.equal(Math.abs(s.open - s.closed), 90);
      assert.equal(s.a1 - s.a0, 90);
    }
  }
});

test('a balcony door hangs in the outer face of the wall, a room door in the inner one', () => {
  for (const [wall, pivot] of [['top', [50, -20]], ['bottom', [50, 520]]]) {
    assert.deepEqual(plain(roomGeo(room([balcony(wall, 50)])).swings[0].pivot), pivot);
  }
  assert.deepEqual(plain(roomGeo(room([balcony('left', 50)])).swings[0].pivot), [-20, 50]);
  assert.deepEqual(plain(roomGeo(room([balcony('right', 50)])).swings[0].pivot), [420, 50]);
  assert.deepEqual(plain(roomGeo(room([door('top', 50)])).swings[0].pivot), [50, 0]);
});

test('a door is a gap in its wall on every side, a window stays wall', () => {
  const clearance = get('wallClearance');
  for (const [wall, x, y] of [['top', 145, 5], ['right', 395, 145], ['bottom', 145, 495], ['left', 5, 145]]) {
    const open = roomGeo(room([door(wall, 100)])), shut = roomGeo(room([windowOn(wall, 100, 90)]));
    assert.ok(clearance(wall, open, x, y) > 40, `${wall}: only the jambs count`);
    assert.equal(clearance(wall, shut, x, y), 5, `${wall}: a window is wall`);
  }
});

test('roomGeo: a double door gets named leaves, a second door a number, a window no swing', () => {
  const g = roomGeo(room([door('left', 100, 'both'), door('top', 50), windowOn('bottom', 0)]));
  assert.deepEqual(plain(g.swings.map(s => s.name)), ['Door (top)', 'Door (bottom)', 'Door 2']);
  assert.deepEqual(plain(g.openings.map(o => o.label)), ['Door', 'Door 2', 'Window']);
});

test('the entrance is the marked opening, otherwise the first door', () => {
  const a = door('left', 100), b = door('top', 50);
  assert.equal(roomGeo(room([a, b])).entry.wall, 'left');
  assert.equal(roomGeo(room([a, { ...b, main: true }])).entry.wall, 'top');
  assert.equal(roomGeo(room([windowOn('top', 0)])).entry, null);
});

test('the way leads to a balcony door first, then to the widest window', () => {
  const small = windowOn('top', 0, 60), wide = windowOn('left', 0, 150), bal = balcony('bottom', 50);
  assert.equal(roomGeo(room([door('right', 0), small, wide])).target.wall, 'left');
  assert.equal(roomGeo(room([door('right', 0), wide, bal])).target.type, 'balcony');
  assert.equal(roomGeo(room([door('right', 0)])).target, null);
});

test('a balcony door marked as entrance is not its own goal', () => {
  const g = roomGeo(room([{ ...balcony('bottom', 50), main: true }, windowOn('top', 100)]));
  assert.equal(g.entry.type, 'balcony');
  assert.equal(g.target.type, 'window');
});

test('the main entrance decides where the way starts', () => {
  const side = door('left', 100), top = door('top', 150), win = windowOn('bottom', 100);
  const start = r => fengShui([], r).path[0];
  assert.ok(start(room([side, top, win])).x < 10);
  assert.ok(start(room([side, { ...top, main: true }, win])).y < 10);
});

test('lightPos runs from the dark side to the window, whichever wall that is', () => {
  for (const [wall, dark, bright] of [['bottom', [200, 0], [200, 500]], ['top', [200, 500], [200, 0]],
    ['left', [400, 250], [0, 250]], ['right', [0, 250], [400, 250]]]) {
    const g = roomGeo(room([windowOn(wall, 100)]));
    assert.equal(lightPos(g, dark), 0, `${wall} dark`);
    assert.equal(lightPos(g, bright), 1, `${wall} bright`);
  }
});

test('windows on opposite walls leave no dark side', () => {
  const items = [item('bed', 'bed', 75, 105, 140, 200)], r = room([door('right', 100), windowOn('top', 100), windowOn('bottom', 100)]);
  assert.equal(roomGeo(r).lightDir, null);
  const { score, why } = estimate(items, r);
  assert.equal(score.zones, 4);
  assert.doesNotMatch(why.zones, /quiet/);
});

test('a desk is judged by its nearest window, and by which way it faces that window', () => {
  const r = room([door('right', 300), windowOn('top', 100), windowOn('left', 300)]);
  const desk = item('desk', 'table', 60, 330, 60, 120, 90);    // chair towards the middle, looking at the left wall
  const { why } = estimate([desk], r);
  assert.match(why.desk, /facing the window/);
  assert.match(why.desk, /1\.6 m from the window/, 'the top window is much further away');
});

test('sofa distance counts from the nearest window wall', () => {
  const r = room([door('right', 300), windowOn('left', 100)]);
  assert.match(estimate([item('s', 'sofa', 60, 200, 100, 80, 90)], r).why.sofa, /sofa at the window/);
  assert.match(estimate([item('s', 'sofa', 300, 200, 100, 80, 90)], r).why.sofa, /sofa \d+ cm from the window/);
});

test('the door line follows the entrance on any wall', () => {
  const inLine = item('bed', 'bed', 200, 300, 140, 200), offLine = item('bed', 'bed', 75, 300, 140, 200);
  const r = room([door('top', 155), windowOn('bottom', 100)]);
  assert.equal(fengShui([inLine], r).doorLine.length, 1);
  assert.equal(fengShui([offLine], r).doorLine.length, 0);
  const shield = item('wall', 'wardrobe', 200, 100, 140, 40);
  assert.equal(fengShui([inLine, shield], r).doorLine.length, 0, 'a tall piece in between shields the bed');
});

test('an image on a window is reported, on any wall', () => {
  const g = roomGeo(room([windowOn('top', 100, 200)])), tv = item('t', 'tv', 200, 30, 100, 40, 0, { image: 150 });
  assert.equal(beamerCheck(tv, [tv], g).offWall, 'partly onto Window');
});

test('a second door that is cut off counts, the main way stays', () => {
  const r = room([door('right', 50), door('left', 250), windowOn('bottom', 200)]);
  const blocked = item('w', 'custom', 60, 295, 120, 300);
  assert.equal(fengShui([], r).cutOff.length, 0);
  const fs = fengShui([blocked], r);
  assert.deepEqual(plain(fs.cutOff.map(o => o.label)), ['Door 2']);
  assert.ok(fs.path);
  assert.match(fsEstimate(fs, [blocked], r).why.flow, /Door 2: no free way/);
});

test('door and window side by side: a short way is not a narrow one', () => {
  const r = room([door('bottom', 100), windowOn('bottom', 195, 100)]);
  const fs = fengShui([], r);
  assert.ok(fs.path && !fs.narrow);
  const { score, why } = fsEstimate(fs, [], r);
  assert.ok(score.flow >= 4, `got ${score.flow}`);
  assert.doesNotMatch(why.flow, /narrowest point/);
});

// Door on the right, window at the bottom: the room from the bug report
const underWindow = (o = windowOn('bottom', 130, 140)) => room([door('right', 60), o]);
const WINDOW_BLOCKERS = {
  'long desk': item('desk', 'table', 200, 465, 160, 70, 180),
  'short desk': item('desk', 'table', 200, 465, 120, 70, 180),
  sofa: item('sofa', 'sofa', 200, 455, 200, 90, 180),
  bed: item('bed', 'bed', 200, 400, 160, 200, 180),
};

for (const [name, it] of Object.entries(WINDOW_BLOCKERS)) {
  test(`${name} under a window: the way ends beside it, in every orientation`, () => {
    const plan = { r: underWindow(), items: [it] };
    const want = estimate(plan.items, plan.r);
    assert.ok(want.score.flow > 1, `got ${want.score.flow}: ${want.why.flow}`);
    assert.doesNotMatch(want.why.flow, /no way/);
    for (const v of allViews(plan)) {
      assert.ok(fengShui(v.items, v.r).path, 'a way was found');
      assert.deepEqual(plain(estimate(v.items, v.r)), plain(want));
    }
  });
}

test('the way to a free window ends at its middle', () => {
  const path = fengShui([], underWindow()).path, end = path[path.length - 1];
  assert.equal(end.x, 202.5);
  assert.ok(500 - end.y < 60, `ended at ${end.y}`);
});

test('the way ends at the closest cell with room to stand, not somewhere near it', () => {
  const path = fengShui([WINDOW_BLOCKERS.bed], underWindow()).path, end = path[path.length - 1];
  assert.ok(Math.hypot(Math.max(0, 130 - end.x, end.x - 270), 500 - end.y) < 85, `ended at ${end.x}, ${end.y}`);
});

// A window on the left, and furniture along that wall with a slot behind it. The room beside it stays wide open.
const slotRoom = () => room([door('right', 100), windowOn('left', 150, 160)]);
const behindSofa = gap => item('sofa', 'sofa', gap + 42.5, 230, 200, 85, 90);
const behindTable = gap => item('t', 'table', gap + 30, 230, 160, 60, 90);

for (const [name, at] of [['sofa', behindSofa], ['table and chair', behindTable]]) {
  test(`${name} along a window wall: the way stays out of the slot behind it`, () => {
    for (let gap = 0; gap <= 120; gap += 2) {
      const it = at(gap), fs = fengShui([it], slotRoom()), { score } = estimate([it], slotRoom());
      assert.ok(score.flow >= 4, `gap ${gap}: score ${score.flow}`);
      assert.ok(!fs.narrow || fs.narrow.d * 2 >= 100, `gap ${gap}: narrow spot ${fs.narrow?.d * 2}`);
    }
  });

  test(`${name} along a window wall: the same result in every orientation`, () => {
    for (const gap of [0, 24, 26, 30, 50, 80, 120]) {
      const plan = { r: slotRoom(), items: [at(gap)] }, want = estimate(plan.items, plan.r);
      for (const v of allViews(plan)) assert.deepEqual(plain(estimate(v.items, v.r)), plain(want), `gap ${gap}`);
    }
  });
}

test('a window behind a truly tight gap still gets a way, through that gap', () => {
  const across = item('wall', 'wardrobe', 177.5, 250, 355, 40);
  const plan = { r: underWindow(), items: [across] }, want = estimate(plan.items, plan.r);
  const fs = fengShui(plan.items, plan.r);
  assert.ok(fs.path, 'a way was found');
  assert.ok(fs.path[fs.path.length - 1].y > 270, 'it ends behind the wardrobe');
  assert.ok(fs.narrow.d * 2 >= 35 && fs.narrow.d * 2 <= 50, `narrow spot ${fs.narrow.d * 2}`);
  assert.match(want.why.flow, /narrowest point ~[34]\d cm/);
  for (const v of allViews(plan)) assert.deepEqual(plain(estimate(v.items, v.r)), plain(want));
});

test('a wardrobe from wall to wall still cuts the room off from its window', () => {
  const split = item('wall', 'wardrobe', 200, 300, 400, 60);
  const plan = { r: underWindow(), items: [split] };
  for (const v of allViews(plan)) {
    assert.equal(fengShui(v.items, v.r).path, null);
    const { score, why } = estimate(v.items, v.r);
    assert.equal(score.flow, 1);
    assert.match(why.flow, /no way to the window/);
  }
});

test('the window counts as reachable up to WINDOW_REACH, and not beyond', () => {
  const reach = get('WINDOW_REACH'), split = y => item('wall', 'wardrobe', 200, y, 400, 60);
  // The field is a 5 cm grid, so the closest free cell lies 12.5 to 17.5 cm before the wardrobe
  const closest = y => 500 - (y - 30) + 15;
  assert.ok(closest(400) < reach && closest(380) > reach);
  assert.ok(fengShui([split(400)], underWindow()).path);
  assert.equal(fengShui([split(380)], underWindow()).path, null);
});

test('a blocked balcony door is no way, however close the room comes to it', () => {
  const r = room([door('right', 60), balcony('bottom', 100)]), it = item('w', 'wardrobe', 200, 450, 400, 100);
  assert.equal(fengShui([it], r).path, null);
  const { score, why } = estimate([it], r);
  assert.equal(score.flow, 1);
  assert.match(why.flow, /no way to the balcony door/);
});

test('with both a window and a balcony door the balcony door stays the goal', () => {
  const r = room([door('right', 60), balcony('bottom', 100), windowOn('top', 100)]);
  const { why } = estimate([item('w', 'wardrobe', 200, 450, 400, 100)], r);
  assert.match(why.flow, /no way to the balcony door/);
});

test('a room without openings gives results, not errors', () => {
  const items = [item('bed', 'bed', 75, 105, 140, 200), item('desk', 'table', 300, 300, 120, 60), item('sofa', 'sofa', 200, 440, 170, 85)];
  const r = room([]), fs = fengShui(items, r);
  assert.equal(fs.path, null);
  assert.deepEqual(plain(fs.doorLine), []);
  const { score, why } = fsEstimate(fs, items, r);
  assert.equal(score.desk, null);
  assert.equal(score.sofa, null);
  assert.equal(score.flow, null);
  assert.match(why.flow, /no door/);
  assert.ok(score.bed >= 1);
  assert.deepEqual(plain(analyze(items, r).issues.filter(i => /undefined|NaN/.test(i.text))), []);
});

test('a bed in a good spot only praises the door if there is one', () => {
  const bed = item('bed', 'bed', 75, 105, 140, 200);
  assert.equal(estimate([bed], room([])).why.bed, 'wall behind the head');
  assert.equal(estimate([bed], room([windowOn('bottom', 100)])).why.bed, 'wall behind the head');
  assert.equal(estimate([{ ...bed, x: 325, y: 395, rot: 180 }], room([door('left', 60)])).why.bed, 'wall behind the head, door in sight');
});

test('zones name what is really missing', () => {
  const table = item('t', 'table', 200, 200, 120, 60), r = room([door('right', 300)]);
  assert.equal(estimate([], r).why.zones, 'no bed or desk in the room');
  const noWindow = estimate([table], r);
  assert.equal(noWindow.score.zones, null);
  assert.equal(noWindow.why.zones, 'no bed, and no window for the table');
  const walledIn = item('t', 'table', 40, 40, 80, 80, 90);
  const seats = [item('a', 'wardrobe', 40, 120, 80, 80), item('b', 'wardrobe', 120, 40, 80, 80)];
  assert.equal(estimate([walledIn, ...seats], room([door('right', 300), windowOn('bottom', 100)])).why.zones,
    'no bed, and no free seat at the table');
});

test('a room with a door but no window has no way to measure', () => {
  const { score, why } = estimate([], room([door('left', 100)]));
  assert.equal(score.flow, null);
  assert.match(why.flow, /no window/);
});

test('missing furniture does not lower the total', () => {
  const bedOnly = [item('bed', 'bed', 75, 105, 140, 200)];
  const { score } = estimate(bedOnly, ROOM), w = { bed: 2, desk: 2, sofa: 2, flow: 2, zones: 2 };
  assert.equal(score.sofa, null);
  assert.equal(score.desk, null);
  const known = (score.bed + score.flow + score.zones) / 15 * 100;
  assert.ok(Math.abs(weightedScore(score, w, CRIT) - known) < 1e-9);
});

test('a table nobody can sit at is a fault, unlike having no table', () => {
  const r = room([door('right', 300), windowOn('bottom', 100)]);
  const none = estimate([], r), walledIn = item('t', 'table', 40, 40, 80, 80, 90);
  const seats = [item('a', 'wardrobe', 40, 120, 80, 80), item('b', 'wardrobe', 120, 40, 80, 80)];
  assert.equal(none.score.desk, null);
  const blocked = estimate([walledIn, ...seats], r);
  assert.equal(blocked.score.desk, 1);
  assert.match(blocked.why.desk, /free seat/);
});

test('a sofa without any projector or TV is not marked down for it', () => {
  const sofa = item('sofa', 'sofa', 60, 400, 170, 85, 90), r = room([door('right', 100), windowOn('bottom', 50)]);
  const { score, why } = estimate([sofa], r);
  assert.equal(score.sofa, 5);
  assert.doesNotMatch(why.sofa, /Beamer|Bild/);
});

test('a sofa in a room with nothing to look at does not apply', () => {
  const { score, why } = estimate([item('sofa', 'sofa', 200, 200, 170, 85)], room([door('right', 100)]));
  assert.equal(score.sofa, null);
  assert.match(why.sofa, /no window or screen/);
});

test('a television is looked at like an image, but has no image of its own to check', () => {
  const r = room([door('right', 100), windowOn('bottom', 50)]);
  const sofa = item('sofa', 'sofa', 200, 150, 170, 85), set = rot => item('tv', 'television', 200, 450, 100, 40, rot);
  const front = estimate([sofa, set(180)], r), behind = estimate([{ ...sofa, y: 300, rot: 180 }, set(180)], r);
  assert.match(front.why.sofa, /faces the screen/);
  assert.match(behind.why.sofa, /does not face the screen/);
  assert.equal(front.score.sofa - behind.score.sofa, 2);
  assert.deepEqual(plain(analyze([sofa, set(180)], r).issues), []);
});

test('a television stands in the living zone', () => {
  const fs = fengShui([item('tv', 'television', 200, 450, 100, 40)], room([door('right', 100)]));
  assert.deepEqual(plain(fs.zones.map(z => z.kind)), ['live']);
});

test('every bed is checked: the worst one decides and both are named', () => {
  const good = item('a', 'bed', 75, 105, 140, 200), bad = item('b', 'bed', 200, 300, 140, 200, 45);
  const alone = estimate([good], ROOM), both = estimate([good, bad], ROOM), swapped = estimate([bad, good], ROOM);
  assert.ok(both.score.bed < alone.score.bed);
  assert.equal(both.score.bed, swapped.score.bed, 'the order of the beds does not matter');
  assert.match(both.why.bed, /a: .*; b: /);
});

test('door line and mirror count for the bed they hit, not for all of them', () => {
  const r = room([door('top', 155), windowOn('bottom', 100)]);
  const inLine = item('a', 'bed', 200, 300, 140, 200, 180), corner = item('b', 'bed', 75, 105, 140, 200);
  const { why } = estimate([inLine, corner], r);
  assert.match(why.bed, /a: [^;]*in line with the door/);
  assert.doesNotMatch(why.bed, /b: [^;]*in line with the door/);
  const wardrobe = item('w', 'wardrobe', 325, 30, 100, 50), facing = item('c', 'bed', 325, 300, 140, 200);
  const fs = fengShui([corner, facing, wardrobe], r);
  assert.deepEqual(plain([...fs.mirroredBeds].map(b => b.id)), ['c']);
});

test('each bed gets its own rest zone', () => {
  const fs = fengShui([item('a', 'bed', 75, 105, 140, 200), item('b', 'bed', 325, 395, 140, 200)], ROOM);
  const rest = fs.zones.filter(z => z.kind === 'rest');
  assert.equal(rest.length, 2);
  assert.ok(rest.every(z => z.x1 - z.x0 < 200));
});

test('print: dimensions follow the openings and fixtures on each wall', () => {
  const r = room([door('left', 100), windowOn('top', 50, 100)], { fixtures: [{ type: 'column', x: 0, y: 300, w: 30, d: 30 }] });
  assert.deepEqual(plain(dimensionRows(r)), {
    top: [[0, 50, 150, 400], [0, 400]],
    right: [],
    bottom: [],
    left: [[0, 100, 190, 500], [0, 300, 330, 500], [0, 500]],
  });
});

test('print: a corner fixture is measured on one wall only', () => {
  const r = room([]), f = { type: 'chimney', x: 350, y: 0, w: 50, d: 50 };
  assert.equal(fixtureWall(f, r), 'top');
  assert.equal(fixtureWall({ ...f, y: 450 }, r), 'bottom');
  assert.equal(fixtureWall({ ...f, x: 150, y: 200 }, r), null);
});

test('print: the sheet grows with the rows of dimensions', () => {
  const plain_ = room([]), busy = room([door('left', 100)], { fixtures: [{ type: 'column', x: 0, y: 300, w: 30, d: 30 }] });
  assert.ok(printFrame(busy, 3).x0 < printFrame(plain_, 3).x0);
  assert.equal(printFrame(plain_, 1).x0, -64);
});

test('print: the scale bar fits the title block at every scale and shows a true length', () => {
  const block = 71, left = 1.9;   // mm: width of the title block, and where its text starts
  for (const scale of PRINT_SCALES) {
    const { len, mm, width } = scaleBar(scale);
    assert.ok(width <= 69 && left + width <= block, `1:${scale} is ${width} mm wide`);
    assert.ok(Math.abs(mm - len * 10 / scale) < 1e-9, `1:${scale}`);
    assert.ok(mm >= 30, `1:${scale} is only ${mm} mm long`);
  }
  assert.ok(get('BAR_TEXT') >= 2);
  for (const scale of [20, 25]) assert.equal(scaleBar(scale).len, 100);
  assert.equal(scaleBar(30).len, 200);
});

test('print: the scale is the largest that fits', () => {
  assert.equal(pickPrintScale({ ...room([]), w: 200, l: 250 }, 40), 20);
  assert.equal(pickPrintScale({ ...room([]), w: 350, l: 500 }, 40), 30);
  assert.equal(pickPrintScale({ ...room([]), w: 700, l: 400 }, 40), 50);
  assert.equal(pickPrintScale({ ...room([]), w: 5000, l: 5000 }, 40), 500);
});

test('print: the chosen scale really fits the page, for narrow and wide rooms', () => {
  for (const [w, l] of [[50, 50], [100, 5000], [5000, 100], [1234, 987], [300, 300]]) {
    const r = { ...room([]), w, l }, scale = pickPrintScale(r, 60), K = Math.max(1, scale / 30), f = printFrame(r, K);
    assert.ok(f.w * 10 / scale <= 190 && f.h * 10 / scale <= 221, `${w} × ${l} at 1:${scale}`);
  }
});
