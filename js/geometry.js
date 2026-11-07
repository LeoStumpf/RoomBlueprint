// @ts-check
// Pure geometry: no DOM, no global state, no room constants. Everything takes the room as an argument.

/**
 * @typedef {[number, number]} Point
 * @typedef {number[][]} Poly
 * @typedef {{ x0: number, y0: number, x1: number, y1: number }} Box
 * @typedef {{ type: string, wall: string, pos: number, width: number, hinge?: string, swing?: string, main?: boolean,
 *   name?: string }} Opening
 * @typedef {Opening & { label: string, a: number[], b: number[], mid: number[], along: number[], inward: number[],
 *   alongDeg: number, inwardDeg: number }} OpeningGeo
 * @typedef {{ type: string, x: number, y: number, w: number, d: number }} Fixture
 * @typedef {{ w: number, l: number, wall: number, openings: Opening[], fixtures: Fixture[] }} Room
 * @typedef {{ id: string, name: string, kind: string, w: number, d: number, color: string, x: number, y: number,
 *   rot: number, hidden?: boolean, h?: number, doors?: number, mirror?: boolean, image?: number,
 *   beamer?: number[], clear?: number, shape?: string, leg?: number[], flip?: boolean, group?: string }} Item
 * @typedef {Omit<Item, 'x' | 'y' | 'rot'>} ItemDef
 * @typedef {{ place: Record<string, number[]>, hidden?: string[] }} Placement hidden: only in older files, read as parked
 * @typedef {{ name: string, pivot: number[], r: number, a0: number, a1: number, open: number, closed: number,
 *   outward: boolean, poly?: Poly }} Swing
 * @typedef {{ name: string, label: string, type: string, poly: Poly }} Obstacle
 * @typedef {{ W: number, L: number, openings: OpeningGeo[], lights: OpeningGeo[], entry: OpeningGeo | null,
 *   target: OpeningGeo | null, lightDir: number[] | null, swings: Swing[], outSwings: Swing[],
 *   obstacles: Obstacle[] }} RoomGeo
 * @typedef {{ x1: number, y1: number, x2: number, y2: number, d: number }} Gap
 */

const GRID = 5, MAGNET = 10, EPS = 0.5, PARK_GAP = 25;
const ROUND_SIDES = 24;   // corners of the polygon that stands for a round item

// Label in the plan and the name in check messages, per fixture type
const FIXTURES = {
  radiator: { label: 'Radiator', name: 'the radiator' },
  chimney: { label: 'Chimney', name: 'the chimney' },
  niche: { label: 'Niche', name: 'the niche' },
  column: { label: 'Column', name: 'the column' },
  block: { label: 'Wall block', name: 'the wall block' },
};

// The same for openings. place names it in “no way to the …”.
const OPENINGS = {
  door: { label: 'Door' },
  balcony: { label: 'Balcony door', place: 'balcony door' },
  window: { label: 'Window', place: 'window' },
};

// Direction of the wall (start to end) and what points into the room, as vectors and as angles
const WALL_FRAMES = {
  top: { along: [1, 0], inward: [0, 1], alongDeg: 0, inwardDeg: 90 },
  right: { along: [0, 1], inward: [-1, 0], alongDeg: 90, inwardDeg: 180 },
  bottom: { along: [1, 0], inward: [0, -1], alongDeg: 0, inwardDeg: -90 },
  left: { along: [0, 1], inward: [1, 0], alongDeg: 90, inwardDeg: 0 },
};
// The leaves of a double door, in the order of the wall
const LEAF_SIDES = { top: ['left', 'right'], bottom: ['left', 'right'], left: ['top', 'bottom'], right: ['top', 'bottom'] };

const rad = a => a * Math.PI / 180;
const rectPoly = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const fmt = v => String(Math.round(v));

/** @param {number[]} center @param {number} r @param {number} a0 @param {number} a1 @param {number} [steps] */
function sectorPoly([cx, cy], r, a0, a1, steps = 16) {
  const pts = [[cx, cy]];
  for (let i = 0; i <= steps; i++) {
    const a = rad(a0 + (a1 - a0) * i / steps);
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

/** Where a wall begins on the inner face of the room. @param {string} wall @param {Room} room */
const wallOrigin = (wall, room) => [wall === 'right' ? room.w : 0, wall === 'bottom' ? room.l : 0];

/** An opening with its place in the plan. Without a name of its own, a second door of a room is “Door 2”.
 * @param {Opening} o @param {Room} room @param {number} n how many of this type came before */
function openingGeo(o, room, n) {
  const f = WALL_FRAMES[o.wall], [ox, oy] = wallOrigin(o.wall, room);
  const at = s => [ox + f.along[0] * s, oy + f.along[1] * s];
  return { ...o, ...f, label: o.name || OPENINGS[o.type].label + (n ? ` ${n + 1}` : ''),
    a: at(o.pos), b: at(o.pos + o.width), mid: at(o.pos + o.width / 2) };
}

/** Distance of a point from the wall of an opening, positive inside the room. @param {OpeningGeo} o @param {number[]} p */
const depthAt = (o, [x, y]) => (x - o.a[0]) * o.inward[0] + (y - o.a[1]) * o.inward[1];

/** Position of a point along the opening, 0 at its start. @param {OpeningGeo} o @param {number[]} p */
const alongAt = (o, [x, y]) => (x - o.a[0]) * o.along[0] + (y - o.a[1]) * o.along[1];

/** The part of the wall below the opening, as a box reaching through the wall.
 * @param {OpeningGeo} o @param {number} wall thickness @param {number} [lip] how far it sticks out on both faces */
function wallGap(o, wall, lip = 0) {
  const off = d => o.inward.map(v => v * d), [ix, iy] = off(lip), [ox, oy] = off(-wall - lip);
  return aabb([[o.a[0] + ix, o.a[1] + iy], [o.b[0] + ix, o.b[1] + iy], [o.a[0] + ox, o.a[1] + oy], [o.b[0] + ox, o.b[1] + oy]]);
}

// Doors swing into the room unless swing is 'out'. A leaf is closed along the wall and open at a right angle to it.
// Balcony doors and doors opening outward sit in the outer face of the wall, room doors in the inner one. Windows do
// not swing here.
/** @param {OpeningGeo} o @param {number} wall thickness @returns {Swing[]} */
function leavesOf(o, wall) {
  if (o.type === 'window') return [];
  const both = o.hinge === 'both', r = both ? o.width / 2 : o.width, outward = o.swing === 'out';
  const out = o.type === 'balcony' || outward ? wall : 0, name = o.label;
  const leaf = (at, closed, side) => {
    // The angle a quarter turn from closed, whichever way the wall runs
    const face = outward ? o.inwardDeg + 180 : o.inwardDeg, open = face - 360 * Math.round((face - closed) / 360);
    return { name: side ? `${name} (${side})` : name, pivot: [at[0] - o.inward[0] * out, at[1] - o.inward[1] * out], r,
      a0: Math.min(open, closed), a1: Math.max(open, closed), open, closed, outward };
  };
  const [first, second] = LEAF_SIDES[o.wall], leaves = [];
  if (o.hinge !== 'end') leaves.push(leaf(o.a, o.alongDeg, both ? first : ''));
  if (o.hinge !== 'start') leaves.push(leaf(o.b, 2 * o.inwardDeg - o.alongDeg, both ? second : ''));
  return leaves;
}

// Daylight falls in along this direction: towards the windows, weighted by their width. Windows facing each other
// cancel out, and then no part of the room is darker than another.
/** @param {OpeningGeo[]} lights @returns {number[] | null} */
function lightDirection(lights) {
  const x = lights.reduce((a, o) => a - o.inward[0] * o.width, 0), y = lights.reduce((a, o) => a - o.inward[1] * o.width, 0);
  const len = Math.hypot(x, y);
  return len < 1 ? null : [x / len, y / len];
}

/** How far a point lies towards the light, from 0 at the darkest corner to 1 at the brightest.
 * @param {RoomGeo} g @param {number[]} p */
function lightPos(g, [x, y]) {
  const [dx, dy] = g.lightDir;
  const lo = Math.min(0, g.W * dx) + Math.min(0, g.L * dy), hi = Math.max(0, g.W * dx) + Math.max(0, g.L * dy);
  return (x * dx + y * dy - lo) / (hi - lo);
}

/** @param {Room} room @returns {RoomGeo} */
function roomGeo(room) {
  const W = room.w, L = room.l, seen = {};
  const openings = room.openings.map(o => {
    seen[o.type] = (seen[o.type] || 0) + 1;
    return openingGeo(o, room, seen[o.type] - 1);
  });
  const lights = openings.filter(o => o.type !== 'door');
  // People come in through the entrance. Without a marked one the first door is taken, and no door means none at all.
  const entry = openings.find(o => o.main) ?? openings.find(o => o.type === 'door') ?? null;
  // The way through the room ends at the opening that gives the most: a balcony door first, then the widest window
  const target = [...lights].filter(o => o !== entry)
    .sort((a, b) => Number(b.type === 'balcony') - Number(a.type === 'balcony') || b.width - a.width)[0] ?? null;
  const leaves = openings.flatMap(o => leavesOf(o, room.wall));
  for (const s of leaves) s.poly = sectorPoly(s.pivot, s.r, s.a0, s.a1);
  // A leaf opening outward takes no room here, so the checks only look at swings. outSwings are for drawing.
  const swings = leaves.filter(s => !s.outward), outSwings = leaves.filter(s => s.outward);
  const obstacles = room.fixtures.map(f => ({ ...FIXTURES[f.type], type: f.type, poly: rectPoly(f.x, f.y, f.w, f.d) }));
  return { W, L, openings, lights, entry, target, lightDir: lightDirection(lights), swings, outSwings, obstacles };
}

function toWorld(it, lx, ly) {
  const c = Math.cos(rad(it.rot)), s = Math.sin(rad(it.rot));
  return [it.x + lx * c - ly * s, it.y + lx * s + ly * c];
}

/** Size of an L: how wide its leg is and how deep the bar along the back, never more than the item itself.
 * @param {Item} it @returns {number[]} */
function legOf(it) {
  const [leg, bar] = it.leg ?? [Math.min(90, it.w / 2), Math.min(85, it.d / 2)];
  return [Math.min(leg, it.w), Math.min(bar, it.d)];
}

// An L has its bar along the back and its leg towards the front, on the right or, flipped, on the left
/** @param {Item} it @returns {{ outline: Poly, parts: Poly[] }} in the coordinates of the item */
function localShape(it) {
  const x1 = it.w / 2, y1 = it.d / 2, x0 = -x1, y0 = -y1;
  if (it.shape === 'round') {
    const outline = Array.from({ length: ROUND_SIDES }, (_, i) => {
      const a = i * 2 * Math.PI / ROUND_SIDES;
      return [x1 * Math.cos(a), y1 * Math.sin(a)];
    });
    return { outline, parts: [outline] };
  }
  if (it.shape === 'L') {
    const [leg, bar] = legOf(it), m = it.flip ? -1 : 1, yb = y0 + bar, xl = x1 - leg;
    const side = P => it.flip ? P.map(([x, y]) => [m * x, y]) : P;
    const parts = [[[x0, y0], [x1, y0], [x1, yb], [x0, yb]]];
    if (yb < y1) parts.push([[xl, yb], [x1, yb], [x1, y1], [xl, y1]]);
    return { outline: side([[x0, y0], [x1, y0], [x1, y1], [xl, y1], [xl, yb], [x0, yb]]), parts: parts.map(side) };
  }
  const outline = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  return { outline, parts: [outline] };
}

/** The outline of an item in the plan. It need not be convex, so collisions use itemParts. @param {Item} it */
const itemPoly = it => localShape(it).outline.map(([x, y]) => toWorld(it, x, y));

/** An item as convex pieces, which is what overlap() can work with. @param {Item} it @returns {Poly[]} */
const itemParts = it => localShape(it).parts.map(P => P.map(([x, y]) => toWorld(it, x, y)));

/** How far two sets of convex pieces reach into each other, 0 if they do not touch. @param {Poly[]} A @param {Poly[]} B */
const partsOverlap = (A, B) => Math.max(0, ...A.flatMap(a => B.map(b => overlap(a, b))));

/** Opening angle of a door leaf that meets these pieces. @param {Swing} s @param {Poly[]} parts */
const partsOpening = (s, parts) => Math.min(...parts.map(P => maxOpening(s, P)));

/** The strip of the given depth along the front of an item. @param {Item} it @param {number} c */
const frontPoly = (it, c) => [[-it.w / 2, it.d / 2], [it.w / 2, it.d / 2], [it.w / 2, it.d / 2 + c], [-it.w / 2, it.d / 2 + c]]
  .map(([x, y]) => toWorld(it, x, y));

// Clearance in front: what was set for the item, otherwise what the doors of a wardrobe need
function clearance(it) {
  return it.clear ?? (it.kind === 'wardrobe' ? it.w / (it.doors || 3) : 0);
}

/** Everything that moves with an item: its group, without what is out of sight. @param {Item} it @param {Item[]} items */
const groupMembers = (it, items) => it.group ? items.filter(i => i === it || (i.group === it.group && !i.hidden)) : [it];

function aabb(poly) {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function project(P, ax, ay) {
  let lo = Infinity, hi = -Infinity;
  for (const [x, y] of P) { const v = x * ax + y * ay; lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return [lo, hi];
}

// Penetration depth of two convex polygons (SAT), 0 = they do not touch
function overlap(A, B) {
  let min = Infinity;
  for (const P of [A, B]) {
    for (let i = 0; i < P.length; i++) {
      const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length];
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 1e-9) continue;
      const ax = (y2 - y1) / len, ay = (x1 - x2) / len;
      const [a0, a1] = project(A, ax, ay), [b0, b1] = project(B, ax, ay);
      const o = Math.min(a1, b1) - Math.max(a0, b0);
      if (o <= 0) return 0;
      min = Math.min(min, o);
    }
  }
  return min;
}

// Opening angle until the door leaf (a strip 4 cm thick) hits the polygon P
function maxOpening(s, P) {
  const dir = Math.sign(s.open - s.closed), full = Math.abs(s.open - s.closed), [px, py] = s.pivot;
  for (let a = 1; a <= full; a++) {
    const t = rad(s.closed + dir * a), c = Math.cos(t), si = Math.sin(t), nx = -si * 2, ny = c * 2;
    const ex = px + s.r * c, ey = py + s.r * si;
    const leaf = [[px + nx, py + ny], [ex + nx, ey + ny], [ex - nx, ey - ny], [px - nx, py - ny]];
    if (overlap(P, leaf) > EPS) return a - 1;
  }
  return full;
}

function inPoly(x, y, P) {
  let sign = 0;
  for (let k = 0; k < P.length; k++) {
    const [x1, y1] = P[k], [x2, y2] = P[(k + 1) % P.length];
    const c = Math.sign((x2 - x1) * (y - y1) - (y2 - y1) * (x - x1));
    if (c && sign && c !== sign) return false;
    if (c) sign = c;
  }
  return true;
}

/** @param {{ x: number, y: number }} it @param {Room} room */
const inRoom = (it, room) => it.x >= 0 && it.x <= room.w && it.y >= 0 && it.y <= room.l;

/** Items that take part in the checks: visible and inside the room.
 * @param {Item[]} items @param {Room} room */
const activeItems = (items, room) => items.filter(i => !i.hidden && inRoom(i, room));

const normRot = r => ((Math.round(r * 10) / 10 % 360) + 360) % 360;

// Free gaps of the piece to the left/right/top/bottom up to the wall or the nearest obstacle
/** @param {Item} it @param {Item[]} items @param {Room} room @returns {Gap[]} */
function gaps(it, items, room) {
  const g = roomGeo(room), A = aabb(itemPoly(it));
  const others = [...g.obstacles.map(o => aabb(o.poly)),
                  ...activeItems(items, room).filter(o => o !== it).flatMap(o => itemParts(o).map(aabb))];
  const cx = (A.x0 + A.x1) / 2, cy = (A.y0 + A.y1) / 2;
  const ov = (a0, a1, b0, b1) => b1 > a0 + EPS && b0 < a1 - EPS;
  // Dimension line where both pieces face each other (no neighbour: centre of the piece)
  const mid = (a0, a1, b0, b1) => (Math.max(a0, b0) + Math.min(a1, b1)) / 2;
  let l = 0, r = g.W, t = 0, b = g.L, ly = cy, ry = cy, tx = cx, bx = cx;
  for (const B of others) {
    if (ov(A.y0, A.y1, B.y0, B.y1)) {
      if (B.x1 <= A.x0 + EPS && B.x1 > l) { l = B.x1; ly = mid(A.y0, A.y1, B.y0, B.y1); }
      if (B.x0 >= A.x1 - EPS && B.x0 < r) { r = B.x0; ry = mid(A.y0, A.y1, B.y0, B.y1); }
    }
    if (ov(A.x0, A.x1, B.x0, B.x1)) {
      if (B.y1 <= A.y0 + EPS && B.y1 > t) { t = B.y1; tx = mid(A.x0, A.x1, B.x0, B.x1); }
      if (B.y0 >= A.y1 - EPS && B.y0 < b) { b = B.y0; bx = mid(A.x0, A.x1, B.x0, B.x1); }
    }
  }
  return [
    { x1: l, y1: ly, x2: A.x0, y2: ly, d: A.x0 - l },
    { x1: A.x1, y1: ry, x2: r, y2: ry, d: r - A.x1 },
    { x1: tx, y1: t, x2: tx, y2: A.y0, d: A.y0 - t },
    { x1: bx, y1: A.y1, x2: bx, y2: b, d: b - A.y1 },
  ].filter(s => s.d > EPS);
}

// Grid + snapping to walls and to edges of other pieces (axis-aligned)
/** @param {Item} it @param {Item[]} items @param {Room} room @param {Item[]} [mates] move along, so they do not attract it */
function snapItem(it, items, room, mates = []) {
  const A = aabb(itemPoly(it)), g = roomGeo(room);
  const xs = [0, g.W], ys = [0, g.L];
  for (const o of g.obstacles) { const B = aabb(o.poly); xs.push(B.x0, B.x1); ys.push(B.y0, B.y1); }
  for (const o of items) {
    if (o === it || o.hidden || mates.includes(o)) continue;
    for (const P of itemParts(o)) { const B = aabb(P); xs.push(B.x0, B.x1); ys.push(B.y0, B.y1); }
  }
  const best = (lo, hi, edges) => {
    let d = null;
    for (const e of edges) for (const v of [lo, hi])
      if (Math.abs(e - v) <= MAGNET && (d === null || Math.abs(e - v) < Math.abs(d))) d = e - v;
    return d ?? Math.round(lo / GRID) * GRID - lo;
  };
  it.x += best(A.x0, A.x1, xs);
  it.y += best(A.y0, A.y1, ys);
}

/** @param {Item[]} items @param {Room} room */
function parkBounds(items, room) {
  const out = items.filter(i => !i.hidden && !inRoom(i, room));
  if (!out.length) return null;
  const bs = out.map(i => aabb(itemPoly(i)));
  return { x0: Math.min(...bs.map(b => b.x0)) - 15, y0: Math.min(...bs.map(b => b.y0)) - 15,
           x1: Math.max(...bs.map(b => b.x1)) + 15, y1: Math.max(...bs.map(b => b.y1)) + 15 };
}

/** Moves pieces to the parking area right of the room as one block: below the last column while that stays as long as the
 * room, then in a new column. A catalog fills this area quickly, and one long row would shrink the plan to nothing. Only pieces
 * in that area steer the column. Pieces dragged elsewhere do not, but nothing that reaches into the area gets overlapped.
 * @param {Item[]} list @param {Item[]} items @param {Room} room */
function parkItems(list, items, room) {
  const edge = room.w + room.wall + 50, others = items.filter(i => !list.includes(i) && !i.hidden).map(i => aabb(itemPoly(i)));
  const parked = others.filter(b => b.x0 >= edge && b.y1 > 0 && b.y0 < room.l);
  const bs = list.map(i => aabb(itemPoly(i))), x0 = Math.min(...bs.map(b => b.x0)), y0 = Math.min(...bs.map(b => b.y0));
  const w = Math.max(...bs.map(b => b.x1)) - x0, h = Math.max(...bs.map(b => b.y1)) - y0;
  let x = edge + 20, y = 15;
  if (parked.length) {
    const left = Math.max(...parked.map(b => b.x0)), below = Math.max(...parked.filter(b => b.x0 > left - 1).map(b => b.y1)) + 20;
    if (below + h <= room.l) { x = left; y = Math.max(y, below); } else x = Math.max(...parked.map(b => b.x1)) + 35;
  }
  // Every step passes one box, downwards or to the right, so this ends
  for (let hit; (hit = others.find(b => x < b.x1 + 10 && x + w > b.x0 - 10 && y < b.y1 + 10 && y + h > b.y0 - 10));) {
    y = hit.y1 + 20;
    if (y + h > room.l) { x = hit.x1 + 35; y = 15; }
  }
  for (const it of list) { it.x += x - x0; it.y += y - y0; }
}

/** @param {Item} it @param {Item[]} items @param {Room} room */
const park = (it, items, room) => parkItems([it], items, room);

/**
 * Where along a wall a handle sits: the middle, or the nearest spot that leaves the openings of that wall free.
 * @param {Room} room @param {string} wall @param {number} clear cm the handle takes on each side @returns {number} cm along the wall
 */
function handleAlong(room, wall, clear) {
  const len = wall === 'top' || wall === 'bottom' ? room.w : room.l, mid = len / 2;
  const taken = room.openings.filter(o => o.wall === wall).map(o => [o.pos - clear, o.pos + o.width + clear]);
  const free = v => v >= clear && v <= len - clear && !taken.some(([a, b]) => v > a && v < b);
  return [mid, ...taken.flat()].filter(free).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0] ?? mid;
}

/** @param {Item[]} items @param {Room} room @returns {Box} */
function contentBounds(items, room) {
  const T = room.wall;
  const b = { x0: -T - 50, y0: -T - 35, x1: room.w + T + 30, y1: room.l + T + 25 };
  for (const s of roomGeo(room).outSwings) {
    const A = aabb(s.poly);
    b.x0 = Math.min(b.x0, A.x0 - 15); b.y0 = Math.min(b.y0, A.y0 - 15);
    b.x1 = Math.max(b.x1, A.x1 + 15); b.y1 = Math.max(b.y1, A.y1 + 15);
  }
  for (const it of items) {
    if (it.hidden) continue;
    const A = aabb(itemPoly(it));
    b.x0 = Math.min(b.x0, A.x0 - 15); b.y0 = Math.min(b.y0, A.y0 - 15);
    b.x1 = Math.max(b.x1, A.x1 + 15); b.y1 = Math.max(b.y1, A.y1 + 15);
  }
  return b;
}

/** @param {Room} room @param {ItemDef[]} defs @returns {Item[]} */
function defaultItems(room, defs) {
  // Park pieces in columns to the right of the room
  const items = [];
  let x = room.w + room.wall + 50, y = 0, colW = 0;
  for (const def of defs) {
    if (y + def.d > room.l && y > 0) { x += colW + PARK_GAP; y = 0; colW = 0; }
    items.push({ ...def, x: x + def.w / 2, y: y + def.d / 2, rot: 0, hidden: false });
    y += def.d + PARK_GAP; colW = Math.max(colW, def.w);
  }
  return items;
}

/**
 * Applies a preset placement to the items in place.
 * @param {Item[]} items
 * @param {Record<string, number[]>} place id -> [x, y, rot]
 * @param {Room} room
 */
function applyPlacement(items, place, room) {
  // Put pieces the placement leaves out into the parking area one by one (park() goes by the
  // visible parked pieces, so hide them first)
  const placed = it => Object.hasOwn(place, it.id);
  const rest = items.filter(it => !placed(it) && !it.hidden);
  for (const it of rest) it.hidden = true;
  for (const it of items) {
    if (placed(it)) { [it.x, it.y, it.rot] = place[it.id]; it.hidden = false; }
  }
  for (const it of rest) { park(it, items, room); it.hidden = false; }
}

/** Applies a layout to the items in place. What an older file kept hidden is parked like anything the layout leaves out.
 * @param {Item[]} items @param {Placement} layout @param {Room} room */
function applyLayout(items, layout, room) {
  const hidden = layout.hidden ?? [];
  applyPlacement(items, hidden.length ? Object.fromEntries(Object.entries(layout.place).filter(([id]) => !hidden.includes(id)))
    : layout.place, room);
}

/** Fresh items laid out by a layout; without one everything stays parked.
 * @param {Room} room @param {ItemDef[]} defs @param {Placement | null | undefined} layout */
function presetItems(room, defs, layout) {
  const items = defaultItems(room, defs);
  if (layout) applyLayout(items, layout, room);
  return items;
}
