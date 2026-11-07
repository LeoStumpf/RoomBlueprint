'use strict';
// The room editor: every result must stay a valid room, or the stored project would drop out of the list.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain, ROOM, item, PROJECT_SCRIPTS } = require('./load');

const { get } = load([...PROJECT_SCRIPTS, 'js/print.js']);
const fn = name => get(name);
const [resizeRoom, minRoomSize, setOpening, addOpening, placeOpening, dropOpening, removeOpening, setMainEntrance] =
  ['resizeRoom', 'minRoomSize', 'setOpening', 'addOpening', 'placeOpening', 'dropOpening', 'removeOpening', 'setMainEntrance'].map(fn);
const grabOffset = fn('grabOffset');
const sizeFixture = fn('sizeFixture');
const [addFixture, moveFixture, setFixture, turnFixture, addShape, removeFixture, roomProblems] =
  ['addFixture', 'moveFixture', 'setFixture', 'turnFixture', 'addShape', 'removeFixture', 'roomProblems'].map(fn);
const [moveParked, keepLayoutsParked, pushedOut, outsideNotice, cleanRoom, roomGeo, analyze, fengShui, printFrame, contentBounds, inRoom] =
  ['moveParked', 'keepLayoutsParked', 'pushedOut', 'outsideNotice', 'cleanRoom', 'roomGeo', 'analyze', 'fengShui', 'printFrame', 'contentBounds', 'inRoom'].map(fn);

const box = (w = 400, l = 500, openings = [], fixtures = []) => ({ w, l, wall: 20, openings, fixtures });
const door = (wall, pos, extra = {}) => ({ type: 'door', wall, pos, width: 90, hinge: 'start', ...extra });
const snap5 = v => Math.round(v / 5) * 5;

test('a room cannot shrink past what stands on its walls, and says why', () => {
  const r = box(400, 500, [door('top', 250)]);
  const min = minRoomSize(r);
  assert.equal(min.w, 340);
  assert.equal(min.whyW, 'Door');
  assert.equal(resizeRoom(r, { w: 100 }).w, 340);
  assert.equal(resizeRoom(r, { l: 10 }).l, 50);
  assert.equal(resizeRoom(r, { w: 99999 }).w, 5000);
  assert.equal(resizeRoom(r, { wall: 999 }).wall, 200);
  assert.equal(resizeRoom(r, { wall: -5 }).wall, 0);
});

test('a fixture at the far wall stays there, one reaching across stretches', () => {
  const r = box(400, 500, [], [
    { type: 'radiator', x: 300, y: 490, w: 60, d: 10 }, { type: 'block', x: 300, y: 0, w: 100, d: 80 },
    { type: 'column', x: 100, y: 100, w: 40, d: 40 }, { type: 'block', x: 0, y: 200, w: 400, d: 30 },
  ]);
  const [rad, block, column, across] = plain(resizeRoom(r, { w: 500, l: 600 }).fixtures);
  assert.deepEqual([rad.x, rad.y], [300, 590]);
  assert.deepEqual([block.x, block.y, block.w], [400, 0, 100]);
  assert.deepEqual([column.x, column.y], [100, 100]);
  assert.deepEqual([across.x, across.w], [0, 500]);
  cleanRoom(resizeRoom(r, { w: 500, l: 600 }));
  assert.equal(resizeRoom(r, { w: 300 }).w, 360, 'the radiator stands free of the right wall and sets the limit');
  assert.equal(resizeRoom(r, { w: 300 }).fixtures[1].x, 260, 'the block comes along when the room shrinks');
});

test('an opening stays on the free part of its wall', () => {
  const r = box(400, 500, [door('top', 100), door('top', 300)]);
  assert.equal(placeOpening(r, 0, 'top', 250).openings[0].pos, 210, 'stops at its neighbour');
  assert.equal(placeOpening(r, 0, 'top', -50).openings[0].pos, 0);
  assert.equal(placeOpening(r, 1, 'top', 900).openings[1].pos, 310);
  assert.equal(placeOpening(r, 0, 'left', 30).openings[0].wall, 'left');
  const full = box(100, 500, [door('top', 0), { ...door('top', 90), width: 10 }, door('left', 0)]);
  assert.deepEqual(plain(placeOpening(full, 2, 'top', 0)), plain(full), 'a full wall leaves it where it was');
});

test('dragging an opening follows the pointer to the nearest wall', () => {
  const r = box(400, 500, [door('top', 100)]);
  const at = dropOpening(r, 0, 250, 3, snap5).openings[0];
  assert.deepEqual([at.wall, at.pos], ['top', 205]);
  assert.equal(dropOpening(r, 0, 398, 300, snap5).openings[0].wall, 'right');
  assert.equal(dropOpening(r, 0, 60, 20, snap5).openings[0].wall, 'top', 'stays near a corner until another wall is clearly closer');
});

test('a grab remembers how far the pointer sits from what it moves', () => {
  const r = box(710, 500, [door('top', 100), door('left', 200)], [{ type: 'column', x: 50, y: 60, w: 40, d: 30 }]);
  r.wall = 28;
  assert.deepEqual(plain(grabOffset(r, 'w', undefined, [724, 250])), [14, -250]);
  assert.deepEqual(plain(grabOffset(r, 'l', undefined, [355, 514])), [-355, 14]);
  assert.deepEqual(plain(grabOffset(r, 'wl', undefined, [724, 514])), [14, 14]);
  assert.deepEqual(plain(grabOffset(r, 'wall', undefined, [-28, 250])), [0, 0]);
  assert.deepEqual(plain(grabOffset(r, 'size', 0, [92, 91])), [2, 1]);
  assert.deepEqual(plain(grabOffset(r, 'fixture', 0, [70, 70])), [0, 0]);
});

test('sizing a fixture moves only its right and bottom edge', () => {
  const r = box(700, 500, [], [{ type: 'column', x: 300, y: 200, w: 40, d: 40 }, { type: 'column', x: 10, y: 10, w: 40, d: 40 }]);
  const sized = (...a) => plain(sizeFixture(r, 0, ...a).fixtures[0]);
  assert.deepEqual(sized(77, 88), { type: 'column', x: 300, y: 200, w: 77, d: 88 });
  assert.deepEqual(sized(540, 40), { type: 'column', x: 300, y: 200, w: 400, d: 40 }, 'stops at the right wall');
  assert.deepEqual(sized(40, 900), { type: 'column', x: 300, y: 200, w: 40, d: 300 }, 'stops at the bottom wall');
  assert.deepEqual(sized(9000, 9000), { type: 'column', x: 300, y: 200, w: 400, d: 300 }, 'stops in the corner');
  assert.deepEqual(sized(-50, 0), { type: 'column', x: 300, y: 200, w: 5, d: 5 }, 'keeps the smallest size');
  assert.deepEqual(sized(40.4, 40.6), { type: 'column', x: 300, y: 200, w: 40, d: 41 });
  assert.deepEqual(plain(sizeFixture(r, 0, 40, 40).fixtures[1]), plain(r.fixtures[1]), 'the other fixture stays');
  assert.deepEqual(plain(r.fixtures[0]), { type: 'column', x: 300, y: 200, w: 40, d: 40 }, 'the room passed in stays');
  cleanRoom(sizeFixture(r, 0, 9000, 9000));
});

test('sizing a fixture that stands at a wall or at the very edge of the room', () => {
  const at = (x, y, w, d, room = box(700, 500)) => ({ ...room, fixtures: [{ type: 'block', x, y, w, d }] });
  const sized = (r, ...a) => plain(sizeFixture(r, 0, ...a).fixtures[0]);
  assert.deepEqual(sized(at(660, 460, 40, 40), 300, 300), { type: 'block', x: 660, y: 460, w: 40, d: 40 }, 'at the far walls it cannot grow');
  assert.deepEqual(sized(at(660, 460, 40, 40), 20, 25), { type: 'block', x: 660, y: 460, w: 20, d: 25 }, 'but it can shrink away from them');
  assert.deepEqual(sized(at(0, 0, 40, 40), 900, 900), { type: 'block', x: 0, y: 0, w: 700, d: 500 }, 'from the near walls it spans the room');
  assert.deepEqual(sized(at(695, 495, 5, 5), 900, 900), { type: 'block', x: 695, y: 495, w: 5, d: 5 }, 'room edge: exactly the smallest size left');
  // An imported room may hold what the editor never makes: the edge still does not move, and the room stays valid
  const tight = at(697, 498, 3, 2), half = at(300.5, 200.5, 40, 40);
  assert.deepEqual(sized(tight, 900, 900), { type: 'block', x: 697, y: 498, w: 3, d: 2 }, 'less than the smallest size left');
  assert.deepEqual(sized(half, 900, 900), { type: 'block', x: 300.5, y: 200.5, w: 399, d: 299 }, 'a part of a cm stays inside');
  cleanRoom(sizeFixture(tight, 0, 900, 900));
  cleanRoom(sizeFixture(half, 0, 900, 900));
});

test('a typed width may still shift a fixture, only the size handle holds its edge', () => {
  const r = box(700, 500, [], [{ type: 'column', x: 300, y: 200, w: 40, d: 40 }]);
  assert.deepEqual(plain(setFixture(r, 0, { w: 540 }).fixtures[0]), { type: 'column', x: 160, y: 200, w: 540, d: 40 });
});

test('an opening keeps its grip along the wall and can still change walls', () => {
  const r = box(400, 500, [door('top', 100)]);
  const off = grabOffset(r, 'opening', 0, [180, -10]);   // Near the right end of a door spanning 100 to 190
  assert.deepEqual(plain(off), [35, 0]);
  const drop = (x, y) => dropOpening(r, 0, x - off[0], y - off[1], snap5).openings[0];
  assert.equal(drop(180, -10).pos, 100, 'grabbed, not moved');
  assert.equal(drop(183, -10).pos, 105, 'moves by the pointer, within the grid');
  const side = grabOffset(box(400, 500, [door('left', 100)]), 'opening', 0, [-10, 110]);
  assert.deepEqual(plain(side), [0, -35]);
  const there = drop(398, 300);
  assert.deepEqual([there.wall, there.pos], ['right', 255]);
});

test('a changed opening keeps fitting', () => {
  const r = box(400, 500, [door('top', 100), door('top', 300)]);
  const wide = setOpening(r, 0, { width: 500 }).openings[0];
  assert.ok(wide.pos + wide.width <= 300 || wide.pos >= 390);
  cleanRoom(setOpening(r, 0, { width: 500 }));
  assert.equal(setOpening(r, 0, { width: 2 }).openings[0].width, 20);
  assert.equal(setOpening(r, 0, { pos: 10 }).openings[0].pos, 10);
  assert.equal(setOpening(r, 0, { name: 'Hall' }).openings[0].name, 'Hall');
  assert.equal(setOpening(setOpening(r, 0, { name: 'Hall' }), 0, { name: '' }).openings[0].name, undefined);
});

test('changing the type keeps only what that type can have', () => {
  const r = box(400, 500, [door('top', 100, { main: true, swing: 'out' })]);
  const glass = setOpening(r, 0, { type: 'window' }).openings[0];
  assert.deepEqual([glass.hinge, glass.swing, glass.main], [undefined, undefined, undefined]);
  cleanRoom(setOpening(r, 0, { type: 'window' }));
  const back = setOpening(setOpening(r, 0, { type: 'window' }), 0, { type: 'balcony' }).openings[0];
  assert.equal(back.hinge, 'both');
});

test('openings are added where there is space', () => {
  const r = box(400, 500, [door('left', 0)]);
  const { room, index } = addOpening(r, 'window');
  assert.equal(index, 1);
  const o = room.openings[1];
  assert.equal(o.hinge, undefined);
  cleanRoom(room);
  let full = box(60, 60);
  for (let i = 0; i < 4; i++) full = addOpening(full, 'door').room;
  cleanRoom(full);
  assert.equal(addOpening(full, 'door'), null, 'no wall has any space left');
  assert.equal(removeOpening(full, 0).openings.length, 3);
});

test('a balcony door can become the entrance, a window cannot', () => {
  const r = box(400, 500, [{ type: 'balcony', wall: 'top', pos: 100, width: 150, hinge: 'both' }, { type: 'window', wall: 'left', pos: 100, width: 100 }]);
  assert.equal(roomGeo(r).entry, null);
  const marked = setMainEntrance(r, 0);
  assert.equal(roomGeo(marked).entry.type, 'balcony');
  cleanRoom(marked);
  assert.deepEqual(plain(setMainEntrance(r, 1)), plain(r));
  assert.equal(roomGeo(setMainEntrance(marked, -1)).entry, null, 'and the mark can go again');
  const two = setMainEntrance(box(400, 500, [door('top', 0, { main: true }), door('left', 200)]), 1);
  assert.equal(two.openings.filter(o => o.main).length, 1);
});

test('a door opening outward takes no room', () => {
  const inside = box(400, 500, [door('right', 100)]);
  const outside = setOpening(inside, 0, { swing: 'out' });
  const bed = [item('bed', 'bed', 350, 150, 80, 80)];
  assert.ok(analyze(bed, inside).issues.some(i => i.lvl === 1));
  assert.equal(analyze(bed, outside).issues.length, 0);
  assert.equal(roomGeo(outside).swings.length, 0);
  assert.equal(roomGeo(outside).outSwings.length, 1);
  assert.doesNotThrow(() => fengShui(bed, outside));
  assert.equal(plain(cleanRoom(outside)).openings[0].swing, 'out');
  assert.equal(plain(cleanRoom(setOpening(outside, 0, { swing: 'in' }))).openings[0].swing, undefined, 'the normal case stays unwritten');
});

test('an outward leaf lies outside on every wall, for every hinge', () => {
  for (const wall of ['top', 'right', 'bottom', 'left']) for (const hinge of ['start', 'end', 'both']) {
    const r = box(400, 500, [door(wall, 100, { hinge, swing: 'out' })]);
    const g = roomGeo(r), o = g.openings[0];
    for (const s of g.outSwings) {
      assert.equal(Math.abs(s.open - s.closed), 90, `${wall} ${hinge}`);
      assert.equal(s.a1 - s.a0, 90, `${wall} ${hinge}`);
      const tip = [s.pivot[0] + s.r * Math.cos(s.open * Math.PI / 180), s.pivot[1] + s.r * Math.sin(s.open * Math.PI / 180)];
      const depth = (tip[0] - o.a[0]) * o.inward[0] + (tip[1] - o.a[1]) * o.inward[1];
      assert.ok(depth < -r.wall, `${wall} ${hinge} points away from the room`);
    }
  }
});

test('the plan and the print sheet leave space for a leaf opening outward', () => {
  for (const wall of ['top', 'right', 'bottom', 'left']) {
    const r = box(400, 500, [{ ...door(wall, 100, { swing: 'out' }), width: 150 }]);
    const f = printFrame(r, 1), b = contentBounds([], r);
    for (const s of roomGeo(r).outSwings) for (const [x, y] of s.poly) {
      assert.ok(x >= f.x0 && x <= f.x0 + f.w && y >= f.y0 && y <= f.y0 + f.h, `print ${wall}`);
      assert.ok(x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1, `plan ${wall}`);
    }
  }
});

test('fixtures stay in the room and stick to walls', () => {
  const r = box(400, 500, [], []);
  const { room, index } = addFixture(r, 'radiator');
  assert.equal(room.fixtures[index].y, 0);
  const at = moveFixture(room, index, 1000, 7, true).fixtures[index];
  assert.deepEqual([at.x, at.y], [300, 0]);
  assert.equal(moveFixture(room, index, 203, 243, true).fixtures[index].x, 205);
  assert.equal(moveFixture(room, index, 203, 243, false).fixtures[index].x, 203);
  assert.equal(setFixture(room, index, { w: 9999 }).fixtures[index].w, 400);
  assert.equal(setFixture(room, index, { w: 0 }).fixtures[index].w, 5);
  assert.equal(addFixture(r, 'column').room.fixtures[0].y, 230);
  const second = addFixture(room, 'radiator');
  const [a, b] = second.room.fixtures;
  assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x, 'a second one does not land on the first');
  cleanRoom(addFixture(box(60, 60), 'block').room);
  assert.equal(removeFixture(room, 0).fixtures.length, 0);
});

test('a new fixture does not land in front of a door', () => {
  const r = box(400, 500, [door('top', 155)]);
  const { room } = addFixture(r, 'radiator');
  assert.equal(roomProblems(room).length, 0);
  const win = box(400, 500, [{ type: 'window', wall: 'top', pos: 150, width: 100 }]);
  assert.equal(addFixture(win, 'radiator').room.fixtures[0].x, 150, 'below a window is where a radiator belongs');
  assert.notEqual(addFixture(win, 'block').room.fixtures[0].x, 140);
});

test('turning keeps a fixture at its walls', () => {
  const r = box(400, 500, [], [{ type: 'radiator', x: 300, y: 490, w: 60, d: 10 }]);
  const f = turnFixture(r, 0).fixtures[0];
  assert.deepEqual([f.w, f.d, f.y + f.d], [10, 60, 500]);
  const big = box(100, 50, [], [{ type: 'block', x: 0, y: 0, w: 100, d: 20 }]);
  cleanRoom(turnFixture(big, 0));
});

test('L and U shapes are wall blocks, and furniture collides with them', () => {
  const l = addShape(box(), 'L'), u = addShape(box(), 'U');
  const corner = l.room.fixtures[l.index], notch = u.room.fixtures[u.index];
  assert.equal(corner.type, 'block');
  assert.deepEqual([corner.x + corner.w, corner.y + corner.d], [400, 500]);
  assert.equal(notch.y, 0);
  assert.equal(notch.x, (400 - notch.w) / 2);
  cleanRoom(l.room); cleanRoom(u.room);
  const inBlock = item('sofa', 'sofa', corner.x + 20, corner.y + 20, 100, 50);
  assert.ok(analyze([inBlock], l.room).issues.some(i => i.lvl === 2));
  const free = item('sofa', 'sofa', 100, 100, 100, 50);
  assert.equal(analyze([free], l.room).issues.length, 0);
  assert.doesNotThrow(() => fengShui([free], l.room));
});

test('a shape avoids corners with a door and blocks that are there already', () => {
  const r = box(400, 500, [door('bottom', 300)]);
  const f = addShape(r, 'L').room.fixtures[0];
  assert.equal(f.x, 0, 'the free bottom corner');
  let room = box();
  for (let i = 0; i < 2; i++) room = addShape(room, 'L').room;
  const [a, b] = room.fixtures;
  assert.notDeepEqual([a.x, a.y], [b.x, b.y]);
  const u = addShape(box(400, 500, [door('top', 150)]), 'U').room.fixtures[0];
  assert.equal(u.y + u.d, 500, 'the middle of the top wall has a door');
});

test('a fixture in front of a door is reported, a radiator below a window is not', () => {
  const blocked = box(400, 500, [door('top', 100)], [{ type: 'column', x: 120, y: 0, w: 40, d: 40 }]);
  assert.equal(roomProblems(blocked).length, 1);
  const win = box(400, 500, [{ type: 'window', wall: 'top', pos: 100, width: 100 }], [{ type: 'radiator', x: 100, y: 0, w: 100, d: 10 }]);
  assert.equal(roomProblems(win).length, 0);
  assert.equal(roomProblems(setFixture(win, 0, { type: 'block' })).length, 1);
  assert.equal(roomProblems(box(400, 500, [door('top', 100)], [{ type: 'column', x: 120, y: 200, w: 40, d: 40 }])).length, 0);
});

test('parked furniture stays out of a room that grows', () => {
  const before = box(), after = resizeRoom(before, { w: 700, l: 800 });
  const items = [item('in', 'custom', 390, 400, 20, 20), item('right', 'custom', 480, 50, 40, 40), item('below', 'custom', 100, 560, 40, 40),
    item('left', 'custom', -80, 100, 40, 40)];
  const moved = moveParked(items, before, after);
  assert.equal(moved[0].x, 390);
  assert.equal(moved[1].x, 780);
  assert.equal(moved[2].y, 860);
  assert.equal(moved[3].x, -80);
  for (const it of moved.slice(1)) assert.equal(inRoom(it, after), false, it.id);
  assert.equal(items[1].x, 480, 'the items passed in stay as they were');
  const thick = moveParked(items, box(), { ...box(), wall: 60 });
  assert.equal(thick[1].x, 520);
});

test('a shrinking room keeps parked furniture outside', () => {
  const before = box(), after = resizeRoom(before, { w: 200 });
  const moved = moveParked([item('right', 'custom', 410, 50, 40, 40)], before, after);
  assert.equal(moved[0].x, 210);
  assert.equal(inRoom(moved[0], after), false);
});

test('a parked piece of a layout stays parked when the room grows', () => {
  const before = box(), after = resizeRoom(before, { w: 700 });
  const layout = { name: 'A', place: { bed: [100, 100, 0], chair: [480, 50, 0] } };
  const [kept] = keepLayoutsParked([layout], before, after);
  assert.deepEqual(Object.keys(plain(kept.place)), ['bed']);
  assert.equal(keepLayoutsParked([layout], before, resizeRoom(before, { w: 300 }))[0], layout, 'nothing to do when it shrinks');
});

test('the notice names what left the room', () => {
  const before = box(), after = resizeRoom(before, { w: 200 });
  const items = [item('Bed', 'bed', 300, 100, 100, 100), item('Lamp', 'custom', 100, 100, 20, 20), item('Ghost', 'custom', 300, 300, 20, 20, 0, { hidden: true }),
    item('Parked', 'custom', 480, 50, 40, 40)];
  assert.deepEqual(plain(pushedOut(items, before, after).map(i => i.name)), ['Bed']);
  const text = outsideNotice(items, [{ name: 'A', place: { Bed: [300, 100, 0] } }], before, after);
  assert.match(text, /Bed is now outside/);
  assert.match(text, /1 saved layout has/);
  assert.equal(outsideNotice([items[1]], [], before, after), '');
});

test('names and swing survive the project format', () => {
  const r = setOpening(box(400, 500, [door('top', 100)]), 0, { name: 'Hall door', swing: 'out' });
  const clean = plain(cleanRoom(r));
  assert.deepEqual([clean.openings[0].name, clean.openings[0].swing], ['Hall door', 'out']);
  assert.equal(roomGeo(r).openings[0].label, 'Hall door');
  assert.throws(() => cleanRoom({ ...r, openings: [{ ...r.openings[0], swing: 'up' }] }), /swing/);
  assert.throws(() => cleanRoom({ ...r, openings: [{ type: 'window', wall: 'top', pos: 0, width: 50, swing: 'out' }] }), /window/);
  assert.throws(() => cleanRoom({ ...r, openings: [{ ...r.openings[0], name: '' }] }), /name/);
});

test('any sequence of edits leaves a valid room', () => {
  let seed = 7;
  const rnd = n => { seed = (seed * 48271) % 2147483647; return seed % n; };
  const types = ['door', 'balcony', 'window'], kinds = ['radiator', 'chimney', 'niche', 'column', 'block'], walls = ['top', 'right', 'bottom', 'left'];
  for (let run = 0; run < 40; run++) {
    let r = box(100 + rnd(600), 100 + rnd(600));
    for (let step = 0; step < 60; step++) {
      const on = r.openings.length ? rnd(r.openings.length) : -1, fx = r.fixtures.length ? rnd(r.fixtures.length) : -1;
      const v = rnd(900) - 100;
      const ops = [
        () => addOpening(r, types[rnd(3)])?.room ?? r,
        () => addFixture(r, kinds[rnd(5)]).room,
        () => addShape(r, rnd(2) ? 'L' : 'U').room,
        () => resizeRoom(r, { w: v }),
        () => resizeRoom(r, { l: v }),
        () => resizeRoom(r, { wall: rnd(300) }),
        () => on < 0 ? r : placeOpening(r, on, walls[rnd(4)], v),
        () => on < 0 ? r : setOpening(r, on, { width: v }),
        () => on < 0 ? r : setOpening(r, on, { type: types[rnd(3)] }),
        () => on < 0 ? r : setOpening(r, on, { wall: walls[rnd(4)] }),
        () => on < 0 ? r : setMainEntrance(r, on),
        () => on < 0 ? r : removeOpening(r, on),
        () => fx < 0 ? r : moveFixture(r, fx, v, rnd(900) - 100, !!rnd(2)),
        () => fx < 0 ? r : setFixture(r, fx, { w: v, d: rnd(900) - 100 }),
        () => fx < 0 ? r : turnFixture(r, fx),
        () => fx < 0 ? r : removeFixture(r, fx),
      ];
      r = ops[rnd(ops.length)]();
      cleanRoom(r);
    }
    assert.doesNotThrow(() => { analyze([item('a', 'bed', r.w / 2, r.l / 2, 80, 80)], r); fengShui([], r); });
  }
});

test('the templates are valid projects', () => {
  const list = get('DEMO_ROOMS'), make = get('templateProject'), validate = get('validateProject');
  assert.ok(list.length >= 3);
  for (const t of list) {
    const p = make(t, t.name);
    validate(p);
    assert.ok(t.hint, t.name);
    assert.ok(roomGeo(p.room).entry, `${t.name} has a way in`);
    assert.equal(roomProblems(p.room).length, 0, t.name);
  }
  assert.ok(list.some(t => t.room.fixtures.some(f => f.type === 'block')), 'one shows the L shape');
});

test('an empty room has nothing in it and is valid', () => {
  const p = get('emptyProject')('Blank', { w: 333, l: 222, wall: 0 });
  assert.deepEqual(plain(p.room), { w: 333, l: 222, wall: 0, openings: [], fixtures: [] });
  assert.equal(p.furniture.length, 0);
  assert.doesNotThrow(() => { analyze([], p.room); fengShui([], p.room); });
});

test('a door can get all its options through the same room used by the sample fixture', () => {
  const r = setOpening(ROOM, 0, { hinge: 'end' });
  assert.equal(r.openings[0].hinge, 'end');
  assert.equal(ROOM.openings[0].hinge, 'start', 'the room passed in stays as it was');
});

// ---------- Layouts between projects, names in the list ----------

const project = (id, name, room, furniture, layouts = []) => get('validateProject')({ id, name, room, furniture, layouts });
const bed = { id: 'bed', name: 'Bed', kind: 'bed', w: 140, d: 200, color: '#112233' };
const lamp = { id: 'lamp', name: 'Lamp', kind: 'custom', w: 30, d: 30, color: '#445566' };
const review = { score: { bed: 3, desk: 3, sofa: 3, flow: 3, zones: 3 }, pro: [], con: [], tip: '' };

test('a layout moves with the furniture the other project lacks', () => {
  const a = project('a', 'A', box(), [bed, lamp], [{ name: 'Night', place: { bed: [100, 120, 0], lamp: [50, 50, 90] } }]);
  const b = project('b', 'B', box(600, 600), [bed], []);
  const out = get('transferLayout')(a, b, 'Night');
  assert.equal(out.source.layouts.length, 0);
  assert.deepEqual(plain(out.target.furniture.map(f => f.id)), ['bed', 'lamp']);
  assert.deepEqual(plain(out.target.layouts[0].place), { bed: [100, 120, 0], lamp: [50, 50, 90] });
  assert.equal(a.layouts.length, 1, 'the project passed in stays as it was');
  get('validateProject')(out.target);
});

test('a different piece under the same id stays a piece of its own', () => {
  const a = project('a', 'A', box(), [bed], [{ name: 'Night', place: { bed: [100, 120, 0] } }]);
  const b = project('b', 'B', box(), [{ ...bed, w: 90 }], []);
  const out = get('transferLayout')(a, b, 'Night');
  assert.deepEqual(plain(out.target.furniture.map(f => [f.id, f.w])), [['bed', 90], ['bed_2', 140]]);
  assert.deepEqual(plain(Object.keys(out.target.layouts[0].place)), ['bed_2']);
});

test('a second layout finds the piece the first one brought under a new id', () => {
  const sofa = { id: 'sofa', name: 'Sofa', kind: 'sofa', w: 200, d: 90, color: '#112233' };
  const place = { sofa: [120, 120, 0] };
  const a = project('a', 'A', box(), [sofa], [{ name: 'L1', place }, { name: 'L2', place }]);
  const b = project('b', 'B', box(), [{ ...sofa, w: 180, d: 85 }], []);
  const first = get('transferLayout')(a, b, 'L1');
  const second = get('transferLayout')(first.source, first.target, 'L2');
  assert.deepEqual(plain(second.target.furniture.map(f => [f.id, f.w, f.d])), [['sofa', 180, 85], ['sofa_2', 200, 90]]);
  assert.deepEqual(plain(second.target.layouts.map(l => Object.keys(l.place))), [['sofa_2'], ['sofa_2']]);
  get('validateProject')(second.target);
});

test('a name alone does not make the same piece', () => {
  const a = project('a', 'A', box(), [bed], [{ name: 'Night', place: { bed: [100, 120, 0] } }]);
  const b = project('b', 'B', box(), [{ ...bed, id: 'other', w: 90 }], []);
  const out = get('transferLayout')(a, b, 'Night');
  assert.deepEqual(plain(out.target.furniture.map(f => [f.id, f.w])), [['other', 90], ['bed', 140]]);
});

test('equal pieces of one layout stay separate pieces, over two moves too', () => {
  const chair = { id: 'chair', name: 'Chair', kind: 'custom', w: 45, d: 45, color: '#112233' };
  const place = { chair: [60, 60, 0], chair_2: [120, 60, 0] };
  const pair = [chair, { ...chair, id: 'chair_2' }];
  const a = project('a', 'A', box(), pair, [{ name: 'L1', place }, { name: 'L2', place }]);
  const b = project('b', 'B', box(), [{ ...chair, w: 50 }], []);
  const first = get('transferLayout')(a, b, 'L1');
  const second = get('transferLayout')(first.source, first.target, 'L2');
  assert.deepEqual(plain(second.target.furniture.map(f => f.w)), [50, 45, 45], 'two chairs came along, not four');
  for (const l of second.target.layouts) assert.equal(new Set(Object.keys(l.place)).size, 2);
});

test('a taken name is not overwritten, and parked pieces stay parked', () => {
  const a = project('a', 'A', box(), [bed, lamp], [{ name: 'Night', place: { bed: [100, 120, 0], lamp: [900, 50, 0] } }]);
  const b = project('b', 'B', box(1200, 600), [], [{ name: 'Night', place: {} }]);
  const out = get('transferLayout')(a, b, 'Night');
  assert.deepEqual(plain(out.target.layouts.map(l => l.name)), ['Night', 'Night (2)']);
  assert.deepEqual(plain(Object.keys(out.layout.place)), ['bed'], 'it would stand in the larger room otherwise');
  assert.ok(out.target.furniture.some(f => f.id === 'lamp'));
});

test('scores only move into the same room, and what lands outside is named', () => {
  const layouts = [{ name: 'Night', place: { bed: [390, 120, 0] }, review }];
  const a = project('a', 'A', box(), [bed], layouts);
  const small = get('transferLayout')(a, project('b', 'B', box(200, 500), [], []), 'Night');
  assert.equal(small.layout.review, undefined);
  assert.equal(small.lostReview, true);
  assert.deepEqual(plain(small.outside), ['Bed']);
  const same = get('transferLayout')(a, project('c', 'C', box(), [], []), 'Night');
  assert.ok(same.layout.review);
  assert.equal(same.lostReview, false);
});

test('pieces a layout only hides do not come along', () => {
  const a = project('a', 'A', box(), [bed, lamp], [{ name: 'Night', place: { bed: [100, 120, 0] }, hidden: ['lamp'] }]);
  const out = get('transferLayout')(a, project('b', 'B', box(), [], []), 'Night');
  assert.deepEqual(plain(out.target.furniture.map(f => f.id)), ['bed']);
  assert.equal(out.layout.hidden, undefined);
  get('validateProject')(out.target);
});

test('projects of the same name can be told apart in the list', () => {
  const labels = get('projectLabels');
  const named = (...n) => n.map(name => ({ name }));
  assert.deepEqual(plain(labels(named('A', 'B'))), ['A', 'B']);
  assert.deepEqual(plain(labels(named('Starter room', 'Starter room', 'Starter room'))), ['Starter room', 'Starter room (2)', 'Starter room (3)']);
  const list = plain(labels(named('A', 'A', 'A (2)')));
  assert.equal(new Set(list).size, 3);
});
