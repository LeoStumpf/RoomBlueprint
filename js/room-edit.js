// @ts-check
// Changes to a room. Pure: every function takes a room and returns a new one. A result always passes validateProject,
// because a stored project that does not is hidden from the list. Limits and clashes are therefore solved here and not
// left to the page. All values the editor creates are whole centimetres.

const ROOM_MIN = 50, WALL_MAX = 200, OPENING_MIN = 20, FIXTURE_MIN = 5;
const OPENING_WIDTHS = { door: 90, balcony: 180, window: 120 };
// Width along the wall and depth into the room, in cm
const FIXTURE_SIZES = { radiator: [100, 10], chimney: [60, 40], niche: [60, 30], column: [40, 40], block: [120, 120] };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** @param {Room} room @param {string} wall */
const wallLength = (room, wall) => wall === 'top' || wall === 'bottom' ? room.w : room.l;

/** Which walls a fixture stands against. @param {Fixture} f @param {Room} room */
const fixtureSides = (f, room) => ({
  left: f.x <= EPS, right: f.x + f.w >= room.w - EPS, top: f.y <= EPS, bottom: f.y + f.d >= room.l - EPS,
});

/** What is in a room, in the order of the editor's list and under the names on the plan. @param {Room} room */
function roomParts(room) {
  return [
    ...roomGeo(room).openings.map((o, i) => ({ kind: 'opening', i, label: o.label, note: `${o.wall} wall` })),
    ...room.fixtures.map((f, i) => ({ kind: 'fixture', i, label: FIXTURES[f.type].label, note: `x ${fmt(f.x)} · y ${fmt(f.y)}` })),
  ];
}

/**
 * The smallest room that keeps everything in it, and what sets that limit. A fixture at the far wall moves with it, so
 * only its own size counts.
 * @param {Room} room
 */
function minRoomSize(room) {
  const g = roomGeo(room), out = { w: ROOM_MIN, l: ROOM_MIN, whyW: '', whyL: '' };
  const need = (axis, v, why) => {
    if (axis === 'w' && v > out.w) { out.w = v; out.whyW = why; }
    if (axis === 'l' && v > out.l) { out.l = v; out.whyL = why; }
  };
  for (const o of g.openings) need(o.wall === 'top' || o.wall === 'bottom' ? 'w' : 'l', o.pos + o.width, o.label);
  room.fixtures.forEach((f, i) => {
    const s = fixtureSides(f, room), label = g.obstacles[i].label;
    need('w', s.left && s.right ? FIXTURE_MIN : s.right ? f.w : f.x + f.w, label);
    need('l', s.top && s.bottom ? FIXTURE_MIN : s.bottom ? f.d : f.y + f.d, label);
  });
  return out;
}

/**
 * New measures for a room, kept to what fits. Fixtures at the right or bottom wall stay at that wall, one reaching from
 * wall to wall stretches with the room.
 * @param {Room} room @param {{ w?: number, l?: number, wall?: number }} size @returns {Room}
 */
function resizeRoom(room, size) {
  const min = minRoomSize(room);
  const w = clamp(size.w ?? room.w, min.w, MAX_ROOM), l = clamp(size.l ?? room.l, min.l, MAX_ROOM);
  const wall = clamp(size.wall ?? room.wall, 0, WALL_MAX);
  const along = (start, len, atStart, atEnd, before, after) =>
    atStart && atEnd ? [0, Math.min(after, Math.max(FIXTURE_MIN, len + after - before))]
      : atEnd ? [Math.max(0, start + after - before), len] : [start, len];
  const fixtures = room.fixtures.map(f => {
    const s = fixtureSides(f, room);
    const [x, fw] = along(f.x, f.w, s.left, s.right, room.w, w), [y, fd] = along(f.y, f.d, s.top, s.bottom, room.l, l);
    return { ...f, x, y, w: fw, d: fd };
  });
  return { ...room, w, l, wall, fixtures };
}

/**
 * The room seen in a mirror, left to right (axis 'x') or top to bottom ('y'). Along the walls that cross the axis an opening
 * runs the other way, so its position and hinge flip. Mirroring twice gives the same room back.
 * @param {Room} room @param {'x' | 'y'} axis @returns {Room}
 */
function mirrorRoom(room, axis) {
  const flip = h => ({ start: 'end', end: 'start' }[h] ?? h), x = axis === 'x';
  const across = x ? ['top', 'bottom'] : ['left', 'right'], swap = x ? { left: 'right', right: 'left' } : { top: 'bottom', bottom: 'top' };
  return { ...room,
    openings: room.openings.map(o => across.includes(o.wall)
      ? { ...o, pos: (x ? room.w : room.l) - o.pos - o.width, ...(o.hinge ? { hinge: flip(o.hinge) } : {}) }
      : { ...o, wall: swap[o.wall] }),
    fixtures: room.fixtures.map(f => x ? { ...f, x: room.w - f.x - f.w } : { ...f, y: room.l - f.y - f.d }) };
}

/**
 * New measures with the left or top wall moving instead of the right or bottom one. It is resizeRoom() in a mirror, so the
 * same limits hold: fixtures at the moving wall stay at it, and one from wall to wall stretches. Everything else keeps its
 * place on the floor. The plan counts from the top left corner, so in numbers it moves by shift, and the caller moves the
 * furniture and the layouts by the same amount.
 * @param {Room} room @param {{ w?: number, l?: number }} size @returns {{ room: Room, shift: number[] }}
 */
function resizeFromStart(room, size) {
  let r = room;
  if (size.w !== undefined) r = mirrorRoom(resizeRoom(mirrorRoom(r, 'x'), { w: size.w }), 'x');
  if (size.l !== undefined) r = mirrorRoom(resizeRoom(mirrorRoom(r, 'y'), { l: size.l }), 'y');
  return { room: r, shift: [r.w - room.w, r.l - room.l] };
}

/** The smallest room when the left and top walls move, with what sets that limit. @param {Room} room */
const minRoomSizeFromStart = room => minRoomSize(mirrorRoom(mirrorRoom(room, 'x'), 'y'));

/**
 * How far a pointer sits from the value a drag changes, so that grabbing a handle or an opening off centre moves nothing
 * until the pointer does. An opening counts along its wall only: across it the point still has to be free to reach another wall.
 * @param {Room} room @param {string} what @param {number} [i] @param {number[]} [p] @returns {number[]}
 */
function grabOffset(room, what, i, [x, y] = [0, 0]) {
  if (what === 'w' || what === 'l' || what === 'wl') return [x - room.w, y - room.l];
  if (what === 'x0' || what === 'y0') return [x, y];   // The left and top walls stand at 0
  if (what === 'wall') return [x + room.wall, 0];
  if (what === 'size') { const [hx, hy] = fixtureHandle(room.fixtures[i], room); return [x - hx, y - hy]; }
  if (what === 'opening') {
    const o = room.openings[i], mid = o.pos + o.width / 2;
    return o.wall === 'top' || o.wall === 'bottom' ? [x - mid, 0] : [0, y - mid];
  }
  return [0, 0];
}

// ---------- Openings ----------

/** The stretches of a wall no other opening uses. @param {Room} room @param {string} wall @param {number} [skip] index */
function freeSpans(room, wall, skip = -1) {
  const taken = room.openings.filter((o, i) => i !== skip && o.wall === wall).sort((a, b) => a.pos - b.pos);
  const spans = [], len = wallLength(room, wall);
  let at = 0;
  for (const o of taken) {
    if (o.pos > at) spans.push([at, o.pos]);
    at = Math.max(at, o.pos + o.width);
  }
  if (at < len) spans.push([at, len]);
  return spans;
}

/** The place on a wall closest to pos where an opening fits, or null. @returns {number | null} */
function fitOnWall(room, wall, pos, width, skip = -1) {
  let best = null;
  for (const [a, b] of freeSpans(room, wall, skip)) {
    if (b - a < width) continue;
    const at = clamp(pos, a, b - width);
    if (best === null || Math.abs(at - pos) < Math.abs(best - pos)) best = at;
  }
  return best;
}

const withOpening = (room, i, o) => ({ ...room, openings: room.openings.map((old, k) => k === i ? o : old) });

/** Puts an opening on a wall at the free place closest to pos. If it does not fit there, nothing changes.
 * @param {Room} room @param {number} i @param {string} wall @param {number} pos @returns {Room} */
function placeOpening(room, i, wall, pos) {
  const o = room.openings[i], at = fitOnWall(room, wall, pos, o.width, i);
  return at === null ? room : withOpening(room, i, { ...o, wall, pos: at });
}

/** The wall a point belongs to. The current wall is kept until another one is clearly closer, so that a drag across a
 * corner does not flicker. @param {Room} room @param {number} x @param {number} y @param {string} [current] */
function nearestWall(room, x, y, current) {
  const d = { top: Math.abs(y), bottom: Math.abs(y - room.l), left: Math.abs(x), right: Math.abs(x - room.w) };
  const best = WALLS.reduce((a, b) => d[b] < d[a] ? b : a);
  return current && d[current] <= d[best] + 30 ? current : best;
}

/** Follows a pointer: the opening goes to the nearest wall with its middle at the point.
 * @param {Room} room @param {number} i @param {number} x @param {number} y @param {(v: number) => number} snap */
function dropOpening(room, i, x, y, snap) {
  const o = room.openings[i], wall = nearestWall(room, x, y, o.wall);
  const along = wall === 'top' || wall === 'bottom' ? x : y;
  return placeOpening(room, i, wall, snap(along - o.width / 2));
}

/** The fields an opening of this type needs, nothing a door has and a window has not. @param {Opening} o @returns {Opening} */
function normOpening(o) {
  const { hinge, swing, main, ...rest } = o;
  if (o.type === 'window') return rest;
  return { ...rest, hinge: hinge ?? (o.type === 'balcony' ? 'both' : 'start'),
    ...(swing === 'out' ? { swing } : {}), ...(main ? { main } : {}) };
}

/**
 * Changes an opening. A width or position that does not fit is shortened to the free stretch around it. Where it cannot
 * fit at all, the room stays as it was.
 * @param {Room} room @param {number} i @param {Partial<Opening>} patch @returns {Room}
 */
function setOpening(room, i, patch) {
  const o = normOpening({ ...room.openings[i], ...patch });
  if (!o.name) delete o.name;
  const width = clamp(Math.round(o.width), OPENING_MIN, wallLength(room, o.wall));
  const at = fitOnWall(room, o.wall, o.pos, width, i);
  if (at !== null) return withOpening(room, i, { ...o, width, pos: at });
  const spans = freeSpans(room, o.wall, i).filter(([a, b]) => b - a >= OPENING_MIN);
  if (!spans.length) return room;
  const [a, b] = spans.reduce((x, y) => y[1] - y[0] > x[1] - x[0] ? y : x);
  return withOpening(room, i, { ...o, pos: a, width: b - a });
}

/**
 * Adds an opening in the middle of the longest free stretch.
 * @param {Room} room @param {string} type @returns {{ room: Room, index: number } | null} null if no wall has space
 */
function addOpening(room, type) {
  const spans = WALLS.flatMap(wall => freeSpans(room, wall).map(([a, b]) => ({ wall, a, b })));
  const free = spans.reduce((x, y) => !x || y.b - y.a > x.b - x.a ? y : x, null);
  if (!free || free.b - free.a < OPENING_MIN) return null;
  const width = Math.min(OPENING_WIDTHS[type], free.b - free.a);
  const pos = Math.round(free.a + (free.b - free.a - width) / 2);
  const index = room.openings.length;
  return { room: { ...room, openings: [...room.openings, normOpening({ type, wall: free.wall, pos, width })] }, index };
}

/** @param {Room} room @param {number} i @returns {Room} */
const removeOpening = (room, i) => ({ ...room, openings: room.openings.filter((_, k) => k !== i) });

/** Marks the main entrance; a window cannot be one. @param {Room} room @param {number} i index, or -1 for none
 * @returns {Room} */
function setMainEntrance(room, i) {
  if (room.openings[i]?.type === 'window') return room;
  return { ...room, openings: room.openings.map(({ main, ...o }, k) => k === i ? { ...o, main: true } : o) };
}

// ---------- Fixtures ----------

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;

/** A fixture with a size that fits and a place inside the room. @param {Fixture} f @param {Room} room @returns {Fixture} */
function fitFixture(f, room) {
  const w = clamp(Math.round(f.w), FIXTURE_MIN, room.w), d = clamp(Math.round(f.d), FIXTURE_MIN, room.l);
  return { ...f, w, d, x: clamp(f.x, 0, room.w - w), y: clamp(f.y, 0, room.l - d) };
}

const withFixture = (room, i, f) => ({ ...room, fixtures: room.fixtures.map((old, k) => k === i ? fitFixture(f, room) : old) });

/** Moves a fixture. With snap it follows the grid and sticks to walls close by.
 * @param {Room} room @param {number} i @param {number} x @param {number} y @param {boolean} snap @returns {Room} */
function moveFixture(room, i, x, y, snap) {
  const f = room.fixtures[i];
  const stick = (v, size, len) => {
    if (!snap) return Math.round(v);
    if (Math.abs(v) <= MAGNET) return 0;
    if (Math.abs(v + size - len) <= MAGNET) return len - size;
    return Math.round(v / GRID) * GRID;
  };
  return withFixture(room, i, { ...f, x: stick(x, f.w, room.w), y: stick(y, f.d, room.l) });
}

/** @param {Room} room @param {number} i @param {Partial<Fixture>} patch @returns {Room} */
const setFixture = (room, i, patch) => withFixture(room, i, { ...room.fixtures[i], ...patch });

/**
 * The size handle: only the right and bottom edge move, up to the wall. It does not go through fitFixture, which would pull
 * x or y back to make the size fit. Below FIXTURE_MIN only where an imported fixture has less than that to the wall.
 * @param {Room} room @param {number} i @param {number} w @param {number} d @returns {Room}
 */
function sizeFixture(room, i, w, d) {
  const f = room.fixtures[i], fit = (v, len, at) => clamp(Math.round(v), FIXTURE_MIN, Math.floor(len - at));
  const sized = { ...f, w: fit(w, room.w, f.x), d: fit(d, room.l, f.y) };
  return { ...room, fixtures: room.fixtures.map((old, k) => k === i ? sized : old) };
}

/** Where the size handle of a fixture sits: at the corner away from the walls it stands against, so that a block in any
 * corner grows into the room. Against no wall, or from wall to wall, it is the bottom right corner. @param {Fixture} f
 * @param {Room} room @returns {number[]} */
function fixtureHandle(f, room) {
  const s = fixtureSides(f, room);
  return [s.right && !s.left ? f.x : f.x + f.w, s.bottom && !s.top ? f.y : f.y + f.d];
}

/**
 * The size handle dragged to a point: the corner of fixtureHandle() follows it, the opposite edges stay where they are.
 * Like sizeFixture() it stops at the walls and at FIXTURE_MIN, and snap rounds the size, or the position where the moving
 * edge is the left or top one.
 * @param {Room} room @param {number} i @param {number} x @param {number} y @param {(v: number) => number} [snap]
 * @returns {Room}
 */
function sizeFixtureTo(room, i, x, y, snap = Math.round) {
  const f = room.fixtures[i], s = fixtureSides(f, room);
  const axis = (start, len, size, fromStart, v) => {
    if (!fromStart) return [start, clamp(Math.round(snap(v - start)), FIXTURE_MIN, Math.floor(size - start))];
    const end = start + len, at = clamp(Math.round(snap(v)), 0, Math.max(0, Math.floor(end - FIXTURE_MIN)));
    return [at, end - at];
  };
  const [fx, w] = axis(f.x, f.w, room.w, s.right && !s.left, x), [fy, d] = axis(f.y, f.d, room.l, s.bottom && !s.top, y);
  const sized = { ...f, x: fx, y: fy, w, d };
  return { ...room, fixtures: room.fixtures.map((old, k) => k === i ? sized : old) };
}

/** Turns a fixture a quarter around its middle. It stays at the walls it stood against. @param {Room} room @param {number} i
 * @returns {Room} */
function turnFixture(room, i) {
  const f = room.fixtures[i], s = fixtureSides(f, room);
  const w = Math.min(f.d, room.w), d = Math.min(f.w, room.l);
  const x = s.left ? 0 : s.right ? room.w - w : f.x + (f.w - w) / 2;
  const y = s.top ? 0 : s.bottom ? room.l - d : f.y + (f.d - d) / 2;
  return withFixture(room, i, { ...f, x: Math.round(x), y: Math.round(y), w, d });
}

/** The stretch of wall a box closes off, if it stands against that wall. @param {Fixture} f @param {OpeningGeo} o */
const closesOpening = (f, o) => {
  const A = wallGap(o, 0, 5);
  return overlaps(f, { x: A.x0, y: A.y0, w: A.x1 - A.x0, d: A.y1 - A.y0 });
};

/** Whether a new fixture would stand on nothing. Below a window is fine for all but a wall block.
 * @param {Room} room @param {Fixture} f */
const isFree = (room, f) => !room.fixtures.some(o => overlaps(o, f)) &&
  !roomGeo(room).openings.some(o => (o.type !== 'window' || f.type === 'block') && closesOpening(f, o));

/**
 * Adds a fixture. A column stands in the middle of the room, everything else goes to the top wall, to the first place
 * with nothing there yet.
 * @param {Room} room @param {string} type @returns {{ room: Room, index: number }}
 */
function addFixture(room, type) {
  const [w, d] = FIXTURE_SIZES[type];
  const start = fitFixture({ type, x: 0, y: 0, w, d }, room);
  const middle = fitFixture({ ...start, x: Math.round((room.w - start.w) / 2), y: type === 'column' ? Math.round((room.l - start.d) / 2) : 0 }, room);
  let f = middle;
  for (let x = 0; !isFree(room, f) && x + start.w <= room.w; x += GRID) f = fitFixture({ ...start, x }, room);
  if (!isFree(room, f)) f = middle;
  return { room: { ...room, fixtures: [...room.fixtures, f] }, index: room.fixtures.length };
}

/**
 * Adds a wall block that makes the room look like an L (in a corner) or a U (in the middle of a wall). It is an ordinary
 * rectangle, so every check treats it as a fixture and overlap() can stay limited to convex shapes.
 * @param {Room} room @param {'L' | 'U'} shape @returns {{ room: Room, index: number }}
 */
function addShape(room, shape) {
  const near = (v, step = GRID) => Math.max(FIXTURE_MIN, Math.round(v / step) * step);
  const wide = shape === 'L' ? 0.35 : 0.4, deep = shape === 'L' ? 0.35 : 0.3;
  const w = near(room.w * wide), d = near(room.l * deep), side = near(room.w * deep), run = near(room.l * wide);
  const mid = v => Math.round(v / 2);
  const spots = shape === 'L' ? [
    { x: room.w - w, y: room.l - d, w, d }, { x: 0, y: room.l - d, w, d }, { x: room.w - w, y: 0, w, d }, { x: 0, y: 0, w, d },
  ] : [
    { x: mid(room.w - w), y: 0, w, d }, { x: mid(room.w - w), y: room.l - d, w, d },
    { x: 0, y: mid(room.l - run), w: side, d: run }, { x: room.w - side, y: mid(room.l - run), w: side, d: run },
  ];
  const usable = s => isFree(room, { type: 'block', ...s });
  const f = fitFixture({ type: 'block', ...(spots.find(usable) ?? spots[0]) }, room);
  return { room: { ...room, fixtures: [...room.fixtures, f] }, index: room.fixtures.length };
}

const CORNERS = ['tl', 'tr', 'bl', 'br'];

/**
 * Cuts a corner of the room with a wall block, for a room that is not quite a rectangle: an L when it is large, a cut corner
 * or a shaft when it is small. It starts at a third of each side and its size handle sits at the inner corner. A block that
 * closes off a door is still added where it was asked for, and roomProblems() says so.
 * @param {Room} room @param {string} corner 'tl', 'tr', 'bl' or 'br' @returns {{ room: Room, index: number }}
 */
function addCorner(room, corner) {
  const near = v => Math.max(FIXTURE_MIN, Math.round(v / GRID) * GRID);
  const w = Math.min(near(room.w / 3), room.w), d = Math.min(near(room.l / 3), room.l);
  const f = fitFixture({ type: 'block', x: corner[1] === 'r' ? room.w - w : 0, y: corner[0] === 'b' ? room.l - d : 0, w, d }, room);
  return { room: { ...room, fixtures: [...room.fixtures, f] }, index: room.fixtures.length };
}

/** @param {Room} room @param {number} i @returns {Room} */
const removeFixture = (room, i) => ({ ...room, fixtures: room.fixtures.filter((_, k) => k !== i) });

/**
 * Things in the room that no check sees as furniture: doors a fixture closes off. A radiator below a window is normal, so
 * for windows only a wall block counts.
 * @param {Room} room @returns {string[]}
 */
function roomProblems(room) {
  const g = roomGeo(room), out = [];
  for (const o of g.openings) room.fixtures.forEach((f, i) => {
    if ((o.type !== 'window' || f.type === 'block') && closesOpening(f, o))
      out.push(`${g.obstacles[i].label} stands in front of ${o.label}.`);
  });
  return out;
}

// ---------- Furniture and layouts in a changed room ----------

/**
 * Where a point of the plan goes when the room changes. Inside the room it stays on its spot of the floor, which moves by
 * shift when the left or top wall moves. Right of or below the room it keeps its distance to that wall, or a wider room would
 * swallow parked furniture, and a thicker wall pushes it out as well. Left of or above the room it stays where it is.
 * @param {number[]} p @param {Room} before @param {Room} after @param {number[]} [shift] @returns {number[]}
 */
function followPoint([x, y], before, after, [dx, dy] = [0, 0]) {
  const grow = Math.max(0, after.wall - before.wall);
  const along = (v, len, now, d) => v < 0 ? v : v > len ? v + now - len + grow : v + d;
  return [along(x, before.w, after.w, dx), along(y, before.l, after.l, dy)];
}

/**
 * The furniture after a change of the room, see followPoint().
 * @param {Item[]} items @param {Room} before @param {Room} after @param {number[]} [shift] @returns {Item[]} new copies
 */
function moveParked(items, before, after, shift) {
  return items.map(it => {
    const [x, y] = followPoint([it.x, it.y], before, after, shift);
    return { ...it, x, y };
  });
}

/** A point of a layout after a change of the room: it moves with the floor, and parked pieces left of or above the room
 * stay. Pieces parked right of or below it are parked again on loading, see keepLayoutsParked().
 * @param {number[]} p [x, y, rotation] @param {number[]} [shift] */
const shiftPlace = ([x, y, ...rest], [dx, dy] = [0, 0]) => [x < 0 ? x : x + dx, y < 0 ? y : y + dy, ...rest];

/**
 * Layouts hold plain coordinates. Their pieces in the room move with the floor when the left or top wall moves, and a
 * larger room would pull their parked pieces in. Dropping such an entry parks it again whenever the layout is loaded, in
 * any size of room.
 * @param {Layout[]} layouts @param {Room} before @param {Room} after @param {number[]} [shift] @returns {Layout[]}
 */
function keepLayoutsParked(layouts, before, after, shift = [0, 0]) {
  const moves = shift[0] !== 0 || shift[1] !== 0;
  const swallowed = (/** @type {number[]} */ p) => {
    const [x, y] = shiftPlace(p, shift);
    return !inRoom({ x: p[0], y: p[1] }, before) && inRoom({ x, y }, after);
  };
  return layouts.map(l => {
    const entries = Object.entries(l.place);
    if (!moves && !entries.some(([, p]) => swallowed(p))) return l;
    return { ...l, place: Object.fromEntries(entries.filter(([, p]) => !swallowed(p)).map(([id, p]) => [id, shiftPlace(p, shift)])) };
  });
}

/** Furniture that stood in the room and does not any more.
 * @param {Item[]} items as they were @param {Room} before @param {Room} after @param {number[]} [shift] @returns {Item[]} */
const pushedOut = (items, before, after, shift) => items.filter(i => {
  const [x, y] = followPoint([i.x, i.y], before, after, shift);
  return !i.hidden && inRoom(i, before) && !inRoom({ x, y }, after);
});

/** The layouts in which a change of the room leaves furniture outside.
 * @param {Layout[]} layouts as they were @param {Room} before @param {Room} after @param {number[]} [shift]
 * @returns {Layout[]} */
const layoutsPushedOut = (layouts, before, after, shift) => layouts.filter(l => Object.entries(l.place).some(([id, p]) => {
  const [x, y] = shiftPlace(p, shift);
  return !l.hidden?.includes(id) && inRoom({ x: p[0], y: p[1] }, before) && !inRoom({ x, y }, after);
}));

/**
 * The message after a change of the room, empty if nothing happened to the furniture.
 * @param {Item[]} items as they were @param {Layout[]} layouts as they were @param {Room} before @param {Room} after
 * @param {number[]} [shift] how far the floor moved, see resizeFromStart()
 */
function outsideNotice(items, layouts, before, after, shift) {
  const out = pushedOut(items, before, after, shift).map(i => i.name), n = layoutsPushedOut(layouts, before, after, shift).length;
  const here = out.length ? `${out.join(', ')} ${out.length > 1 ? 'are' : 'is'} now outside the room, in the parking area, and not checked.` : '';
  const saved = n ? `${n} saved ${n > 1 ? 'layouts have' : 'layout has'} furniture outside the room now.` : '';
  return [here, saved].filter(Boolean).join(' ');
}
