// @ts-check
// Room checks and scoring. No DOM and no global state: items and room are always passed in.

// The five criteria every layout is scored on, 1–5
const CRIT = [
  ['bed', 'Bed & rest'],
  ['desk', 'Desk & daylight'],
  ['sofa', 'Seating & view'],
  ['flow', 'Ways & doors'],
  ['zones', 'Zones'],
];

// Weight 0–3 per criterion; a project can bring its own
const DEFAULT_W = { bed: 2, desk: 2, sofa: 2, flow: 2, zones: 2 };

// What a room is mostly used for decides what counts. A profile is the standard a project returns to.
const PROFILES = {
  balanced: { label: 'Balanced', weights: DEFAULT_W },
  homeoffice: { label: 'Home office', weights: { bed: 1, desk: 3, sofa: 1, flow: 2, zones: 2 } },
  sleep: { label: 'Sleeping', weights: { bed: 3, desk: 1, sofa: 1, flow: 2, zones: 3 } },
  living: { label: 'Living', weights: { bed: 1, desk: 1, sofa: 3, flow: 3, zones: 2 } },
  studio: { label: 'Studio', weights: { bed: 2, desk: 2, sofa: 2, flow: 3, zones: 3 } },
};

// Heights (cm) for the check of what blocks a view
// tv is a media board, which may carry a projector (image). television is an ordinary TV set.
const KIND_H = { bed: 45, sofa: 80, table: 75, tv: 45, television: 110, wardrobe: 200, shelf: 180, custom: 100 };
const IMG_BOTTOM = 85;  // anything lower (bed, sofa, tables) hardly gets in the way of the image
const IMG_FRONT = 60;   // this close to the image wall a piece counts as "in front of" it
// Fixed parts of the room that are tall enough to stand in a view. A radiator stays below it, and a chimney or a niche belongs to its wall.
const SIGHT_FIXTURES = ['column', 'block'];
/** @param {RoomGeo} g */
const sightFixtures = g => g.obstacles.filter(o => SIGHT_FIXTURES.includes(o.type));
// Fixed parts of the room that are masonry, so that furniture can stand against them as against a wall: all but the radiator.
// A block in a corner makes the room an L, and its faces are the walls of that L.
const WALL_FIXTURES = ['chimney', 'niche', 'column', 'block'];
/** @param {RoomGeo} g */
const wallFixtures = g => g.obstacles.filter(o => WALL_FIXTURES.includes(o.type));

/**
 * How far each side of a box is from what stands behind it: the room wall, or a wall fixture that faces at least a third of
 * that side. In the order left, right, top, bottom.
 * @param {Box} B @param {RoomGeo} g @returns {number[]}
 */
function sideGaps(B, g) {
  const out = [B.x0, g.W - B.x1, B.y0, g.L - B.y1];
  const faces = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) >= (a1 - a0) / 3;
  for (const o of wallFixtures(g)) {
    const F = aabb(o.poly), alongY = faces(B.y0, B.y1, F.y0, F.y1), alongX = faces(B.x0, B.x1, F.x0, F.x1);
    if (alongY && F.x1 <= B.x0 + EPS) out[0] = Math.min(out[0], B.x0 - F.x1);
    if (alongY && F.x0 >= B.x1 - EPS) out[1] = Math.min(out[1], F.x0 - B.x1);
    if (alongX && F.y1 <= B.y0 + EPS) out[2] = Math.min(out[2], B.y0 - F.y1);
    if (alongX && F.y0 >= B.y1 - EPS) out[3] = Math.min(out[3], F.y0 - B.y1);
  }
  return out;
}

/** Distance from a point to a box, 0 inside it. @param {number[]} p @param {Box} A */
const boxDist = ([x, y], A) => Math.hypot(Math.max(A.x0 - x, 0, x - A.x1), Math.max(A.y0 - y, 0, y - A.y1));
/** @param {Item} o */
const itemHeight = o => o.h ?? KIND_H[o.kind] ?? 100;

// Projector image on the wall behind the board: which tall pieces stand in front of it (width in cm),
// and does the image fall on a door opening or past the corner of the room?
/** @param {Item} tv @param {Item[]} act @param {RoomGeo} g */
function beamerCheck(tv, act, g) {
  const c = Math.cos(rad(tv.rot)), s = Math.sin(rad(tv.rot));
  const toLocal = ([x, y]) => [(x - tv.x) * c + (y - tv.y) * s, -(x - tv.x) * s + (y - tv.y) * c];
  const h = tv.image / 2, wall = -tv.d / 2;
  // How much of the image width a shape takes when it stands in front of the wall with the image
  const widthOver = (P, back) => {
    const L = P.map(toLocal), xs = L.map(p => p[0]), ys = L.map(p => p[1]);
    const w = Math.min(h, Math.max(...xs)) - Math.max(-h, Math.min(...xs));
    return w > EPS && Math.min(...ys) < wall + IMG_FRONT && Math.max(...ys) > wall + back ? w : 0;
  };
  /** @type {[Item, number][]} */
  const covered = [];
  for (const o of act) {
    if (o === tv || itemHeight(o) <= IMG_BOTTOM) continue;
    const w = widthOver(itemPoly(o), -10);
    if (w) covered.push([o, w]);
  }
  // A wall block behind the image is the wall it falls on, so only what stands in front of that wall counts
  /** @type {[string, number][]} */
  const fixed = [];
  for (const o of sightFixtures(g)) {
    const w = widthOver(o.poly, EPS);
    if (w) fixed.push([o.name, w]);
  }
  // Every problem along the image counts, whatever comes after it. A board against a chimney or a wall block throws the
  // picture onto that, and past its edge there is no wall but the room.
  const off = new Set(), boxes = wallFixtures(g).map(o => ({ o, A: aabb(o.poly) }));
  const backing = boxes.find(({ A }) => boxDist(toWorld(tv, 0, wall - 4), A) === 0);
  for (let x = -h; x <= h; x += 5) {
    const p = toWorld(tv, x, wall - 4), [px, py] = p;
    const hit = g.openings.find(o => { const s = alongAt(o, p); return depthAt(o, p) < 15 && s > 0 && s < o.width; });
    if (hit) off.add(`partly onto ${hit.label}`);
    else if (px < -15 || px > g.W + 15 || py < -15 || py > g.L + 15) off.add('past the corner of the room');
    else if (backing && px > 0 && px < g.W && py > 0 && py < g.L && boxes.every(({ A }) => boxDist(p, A) > 15))
      off.add(`past the edge of ${backing.o.name}`);
  }
  return { covered, fixed, offWall: [...off].join(' and ') };
}

/** Whether the front of an item points at a place, within 60°. @param {Item} it @param {number[]} p */
function faces(it, [x, y]) {
  const c = Math.cos(rad(it.rot)), s = Math.sin(rad(it.rot)), vx = x - it.x, vy = y - it.y, len = Math.hypot(vx, vy) || 1;
  return Math.acos(Math.max(-1, Math.min(1, (vx * -s + vy * c) / len))) * 180 / Math.PI <= 60;
}

// What stands between a sofa and a TV it faces. The sight is the triangle from the sofa to both ends of the screen, and as
// with the projector image, what stays below the lower edge of the picture does not count.
/** @param {Item[]} act @param {RoomGeo} g @returns {{ sofa: Item, tv: Item, blockers: Item[], fixed: string[] }[]} */
function tvSight(act, g) {
  const sofas = act.filter(i => i.kind === 'sofa'), sets = act.filter(i => i.kind === 'television');
  return sets.flatMap(tv => sofas.filter(sofa => faces(sofa, [tv.x, tv.y])).map(sofa => {
    const sight = [[sofa.x, sofa.y], toWorld(tv, -tv.w / 2, 0), toWorld(tv, tv.w / 2, 0)];
    const blockers = act.filter(o => o !== sofa && o !== tv && itemHeight(o) > IMG_BOTTOM && partsOverlap([sight], itemParts(o)) > EPS);
    const fixed = sightFixtures(g).filter(o => partsOverlap([sight], [o.poly]) > EPS).map(o => o.name);
    return { sofa, tv, blockers, fixed };
  }));
}

// Open shelf: one long side must stand against a wall, a radiator or chimney, or the side of a wardrobe
const SHELF_GAP = 25;
/** @param {Item} it @param {Item[]} act @param {RoomGeo} g */
function shelfBacked(it, act, g) {
  const P = itemPoly(it);
  const backs = [...g.obstacles.map(o => aabb(o.poly)), ...act.filter(o => o.kind === 'wardrobe').map(o => aabb(itemPoly(o)))];
  const wallD = (/** @type {number[]} */ [x, y]) => [x, g.W - x, y, g.L - y];
  for (const [a, b] of [[P[0], P[1]], [P[2], P[3]]]) {
    const wa = wallD(a), wb = wallD(b);
    if (wa.some((v, k) => Math.max(v, wb[k]) <= SHELF_GAP)) return true;
    if (backs.some(A => Math.max(boxDist(a, A), boxDist(b, A)) <= SHELF_GAP)) return true;
  }
  return false;
}

/** @param {Item[]} items @param {Room} room */
function analyze(items, room) {
  /** @type {{ lvl: number, text: string }[]} */
  const issues = [];
  /** @type {{ lvl: number, code: string, ids: string[], fixture?: string }[]} */
  const checks = [];
  const g = roomGeo(room), flag = new Map();
  const mark = (id, lvl) => { if ((flag.get(id) || 0) < lvl) flag.set(id, lvl); };
  // issues are the messages of the planner, checks say the same for the rules in recommend.js
  const add = (lvl, code, text, ...ids) => {
    issues.push({ lvl, text }); checks.push({ lvl, code, ids }); ids.forEach(id => mark(id, lvl));
  };
  // A fixed part of the room is not furniture, so it travels beside the ids
  const addFixed = (code, text, id, fixture) => { add(1, code, text, id); checks[checks.length - 1].fixture = fixture; };
  const act = activeItems(items, room);
  const poly = new Map(act.map(i => [i.id, itemPoly(i)])), parts = new Map(act.map(i => [i.id, itemParts(i)]));
  const outside = P => Math.max(...P.map(([x, y]) => Math.max(-x, x - g.W, -y, y - g.L)));

  for (const it of act) {
    const P = parts.get(it.id), out = outside(poly.get(it.id));
    if (out > EPS) add(2, 'wall', `${it.name} reaches ${fmt(out)} cm into the wall`, it.id);
    for (const o of g.obstacles)
      if (partsOverlap(P, [o.poly]) > EPS) add(2, 'fixture', `${it.name} runs into ${o.name}`, it.id);
    for (const s of g.swings)
      if (partsOverlap(P, [s.poly]) > EPS)
        add(1, 'swing', `${it.name} is in the swing of ${s.name}: it opens only about ${partsOpening(s, P)}°`, it.id);
    if (it.kind === 'shelf' && !shelfBacked(it, act, g))
      add(1, 'shelf', `${it.name} has no back: put a long side against a wall`, it.id);
    const c = clearance(it);
    if (c) {
      const C = frontPoly(it, c);
      const blockers = act.filter(o => o !== it && partsOverlap([C], parts.get(o.id)) > EPS).map(o => o.name);
      for (const o of g.obstacles) if (overlap(C, o.poly) > EPS) blockers.push(o.label);
      if (outside(C) > EPS) blockers.push('wall');
      if (blockers.length) add(1, 'front', it.clear === undefined ? `${it.name}: the doors cannot open (${blockers.join(', ')})`
        : `${it.name}: ${fmt(c)} cm in front are not free (${blockers.join(', ')})`, it.id);
    }
  }
  for (let i = 0; i < act.length; i++)
    for (let j = i + 1; j < act.length; j++) {
      const a = act[i], b = act[j];
      if (partsOverlap(parts.get(a.id), parts.get(b.id)) > EPS) add(2, 'overlap', `${a.name} ↔ ${b.name} overlap`, a.id, b.id);
    }
  for (const tv of act.filter(i => i.image)) {
    const b = beamerCheck(tv, act, g);
    for (const [o, w] of b.covered) add(1, 'image-covered', `${o.name} covers ${fmt(w)} cm of the projected picture`, o.id);
    for (const [name, w] of b.fixed) addFixed('image-fixed', `${name} covers ${fmt(w)} cm of the projected picture`, tv.id, name);
    if (b.offWall) add(1, 'image-off', `The projected picture falls ${b.offWall}`, tv.id);
  }
  for (const { sofa, tv, blockers, fixed } of tvSight(act, g)) {
    for (const o of blockers) add(1, 'tv-sight', `${o.name} blocks the view from ${sofa.name} to ${tv.name}`, o.id);
    for (const name of fixed) addFixed('tv-fixed', `${name} blocks the view from ${sofa.name} to ${tv.name}`, tv.id, name);
  }
  issues.sort((a, b) => b.lvl - a.lvl);
  return { issues, flag, checks };
}

// ---------- Feng-Shui-Ebene ----------
// Zones (rest/living/work), daylight, energy flow (widest path from the room door to the balcony door or the window),
// view of the door from the bed and the desks, door line and free centre.

const FS_CELL = 5;      // grid size of the path search (cm)
const SEAT = 35;        // seat in front of the table, or head on the pillow (cm from the edge)
const MIN_WAY = 12;     // the least clearance a cell needs to count as part of a path (cm)
const WINDOW_REACH = 150;  // from further away than this, the way to a window counts as cut off (cm)
const WINDOW_CLEARANCES = [55, 40, 30, 20, MIN_WAY];  // clearances tried for the way to a window, widest first (cm)

// Door and balcony openings per wall, in room order. Windows stay wall.
function wallHoles(g) {
  /** @type {Record<string, any[]>} */
  const holes = { top: [], right: [], bottom: [], left: [] };
  for (const o of g.openings) if (o.type !== 'window') holes[o.wall].push(o);
  return holes;
}

// Distance from a point to a wall. Door openings are no wall, only their reveals count. Windows stay wall.
function wallClearance(wall, g, x, y, holes = wallHoles(g)) {
  const depth = wall === 'top' ? y : wall === 'bottom' ? g.L - y : wall === 'left' ? x : g.W - x;
  const s = wall === 'top' || wall === 'bottom' ? x : y;
  const list = holes[wall];
  for (let k = 0; k < list.length; k++) {
    const o = list[k];
    if (s >= o.pos && s <= o.pos + o.width) return Math.min(Math.hypot(depth, s - o.pos), Math.hypot(depth, s - o.pos - o.width));
  }
  return depth;
}

// Distance from every grid cell to the nearest piece, obstacle or wall (chamfer distance)
function distanceField(g, polys) {
  const C = FS_CELL, nx = Math.ceil(g.W / C), ny = Math.ceil(g.L / C);
  // The grid sits in the middle of the room, so that a turned or mirrored plan gets the same cells. Rooms whose way ends at a
  // balcony door keep it at the top left corner: their results are the reference of the private baseline.
  const anchored = g.target?.type === 'balcony';
  const ox = anchored ? 0 : (g.W - nx * C) / 2, oy = anchored ? 0 : (g.L - ny * C) / 2;
  const d = new Float32Array(nx * ny), holes = wallHoles(g);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = (i + 0.5) * C + ox, y = (j + 0.5) * C + oy;
    d[j * nx + i] = Math.min(wallClearance('top', g, x, y, holes), wallClearance('right', g, x, y, holes),
      wallClearance('bottom', g, x, y, holes), wallClearance('left', g, x, y, holes));
  }
  for (const raw of polys) {
    // A turned piece carries rounding noise, which would decide on which side of an edge a cell falls
    const P = raw.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6]), A = aabb(P);
    for (let j = Math.max(0, Math.floor((A.y0 - oy) / C)); j <= Math.min(ny - 1, Math.floor((A.y1 - oy) / C)); j++)
      for (let i = Math.max(0, Math.floor((A.x0 - ox) / C)); i <= Math.min(nx - 1, Math.floor((A.x1 - ox) / C)); i++)
        if (inPoly((i + 0.5) * C + ox, (j + 0.5) * C + oy, P)) d[j * nx + i] = 0;
  }
  const a = C, b = C * Math.SQRT2, at = (i, j) => (i < 0 || j < 0 || i >= nx || j >= ny) ? Infinity : d[j * nx + i];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++)
    d[j * nx + i] = Math.min(d[j * nx + i], at(i - 1, j) + a, at(i, j - 1) + a, at(i - 1, j - 1) + b, at(i + 1, j - 1) + b);
  for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--)
    d[j * nx + i] = Math.min(d[j * nx + i], at(i + 1, j) + a, at(i, j + 1) + a, at(i + 1, j + 1) + b, at(i - 1, j + 1) + b);
  return { d, nx, ny, ox, oy };
}

const DOOR_ZONE = 60;  // the walkway width is not measured this close behind the doors
function nearDoors({ nx, ny, ox, oy }, from, to) {
  const m = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = (i + 0.5) * FS_CELL + ox, y = (j + 0.5) * FS_CELL + oy;
    if (Math.hypot(x - from[0], y - from[1]) < DOOR_ZONE || Math.hypot(x - to[0], y - to[1]) < DOOR_ZONE) m[j * nx + i] = 1;
  }
  return m;
}

const cellOf = ({ nx, ny, ox, oy }, [x, y]) =>
  Math.min(ny - 1, Math.max(0, Math.floor((y - oy) / FS_CELL))) * nx + Math.min(nx - 1, Math.max(0, Math.floor((x - ox) / FS_CELL)));

// All cells that can be reached from cell s with at least th clearance. Stops as soon as it finds cell t.
function flood({ d, nx, ny }, s, near, th, t = -1) {
  const seen = new Uint8Array(nx * ny), queue = [s]; seen[s] = 1;
  while (queue.length) {
    const u = queue.pop(); if (u === t) break;
    const ui = u % nx, uj = (u - ui) / nx;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const i = ui + di, j = uj + dj, v = j * nx + i;
      if (i < 0 || j < 0 || i >= nx || j >= ny || seen[v] || (d[v] < th && !near[v])) continue;
      seen[v] = 1; queue.push(v);
    }
  }
  return seen;
}

// Shortest distance from a point in the room to the opening itself
const openingDist = (o, p) => {
  const s = alongAt(o, p);
  return Math.hypot(s - Math.max(0, Math.min(o.width, s)), depthAt(o, p));
};

// Nobody has to reach a window, so furniture may stand in front of it, and a slot behind that furniture is no reason to
// squeeze in. The way ends at the cell closest to the opening among those reached with the widest clearance that gets
// anywhere near it, or null when no reachable cell is near it. Ties go to the middle of the window, then to the shorter
// way from the door, so that the goal does not depend on how the plan is turned.
function windowGoal(field, from, o) {
  const { d, nx, ny, ox, oy } = field, s = cellOf(field, from), near = nearDoors(field, from, from);
  for (const th of WINDOW_CLEARANCES) {
    const seen = flood(field, s, near, th);
    let goal = null, best = WINDOW_REACH, bestMid = Infinity, bestFrom = Infinity;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!seen[k] || d[k] < th) continue;
      const p = [(i + 0.5) * FS_CELL + ox, (j + 0.5) * FS_CELL + oy], w = openingDist(o, p);
      if (w > best) continue;
      const mid = Math.hypot(p[0] - o.mid[0], p[1] - o.mid[1]), start = Math.hypot(p[0] - from[0], p[1] - from[1]);
      if (w === best && (mid > bestMid || (mid === bestMid && start >= bestFrom))) continue;
      goal = p; best = w; bestMid = mid; bestFrom = start;
    }
    if (goal) return goal;
  }
  return null;
}

// Widest passage: the largest clearance that still gets you from "from" to "to"
function bottleneck(field, from, to) {
  const s = cellOf(field, from), t = cellOf(field, to), near = nearDoors(field, from, to);
  const reach = th => flood(field, s, near, th, t)[t] === 1;
  if (!reach(MIN_WAY)) return 0;
  let lo = MIN_WAY, hi = 250;
  while (hi - lo > 1) { const m = (lo + hi) / 2; if (reach(m)) lo = m; else hi = m; }
  return lo;
}

// Cheapest path (Dijkstra) through cells with clearance ≥ minD that avoids narrow spots
function flowPath(field, from, to, minD) {
  const { d, nx, ny, ox, oy } = field, C = FS_CELL, n = nx * ny;
  const s = cellOf(field, from), t = cellOf(field, to), near = nearDoors(field, from, to);
  const cost = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1);
  const heap = [[0, s]]; cost[s] = 0;
  const push = e => { heap.push(e); let k = heap.length - 1;
    while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop();
    if (heap.length) { heap[0] = last; let k = 0;
      for (;;) { const l = 2 * k + 1, r = l + 1; let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } }
    return top; };
  while (heap.length) {
    const [c0, u] = pop();
    if (u === t) break;
    if (c0 > cost[u]) continue;
    const ui = u % nx, uj = (u - ui) / nx;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const i = ui + di, j = uj + dj;
      if ((!di && !dj) || i < 0 || j < 0 || i >= nx || j >= ny) continue;
      const v = j * nx + i, dv = d[v];
      if (dv < minD && !near[v]) continue;
      const c = cost[u] + Math.hypot(di, dj) * (1 + Math.max(0, 45 - dv) / 6);
      if (c < cost[v]) { cost[v] = c; prev[v] = u; push([c, v]); }
    }
  }
  if (prev[t] < 0) return null;
  const pts = [];
  for (let v = t; v >= 0; v = prev[v]) pts.push(v);
  pts.reverse();
  return pts.map(v => { const i = v % nx, j = (v - i) / nx; return { x: (i + 0.5) * C + ox, y: (j + 0.5) * C + oy, d: d[v] }; });
}

// A point just inside the room, in front of an opening
const insideOf = (o, depth = 3) => [o.mid[0] + o.inward[0] * depth, o.mid[1] + o.inward[1] * depth];

// Seat and view direction: bed = head on the pillow; table = chair in front of the free long side
function seatOf(it, g, others) {
  const dir = (lx, ly) => { const c = Math.cos(rad(it.rot)), s = Math.sin(rad(it.rot)); return [lx * c - ly * s, lx * s + ly * c]; };
  if (it.kind === 'bed') return { p: toWorld(it, 0, -it.d / 2 + SEAT), dir: dir(0, 1) };
  for (const side of [1, -1]) {
    const p = toWorld(it, 0, side * (it.d / 2 + SEAT));
    const free = p[0] > 15 && p[0] < g.W - 15 && p[1] > 15 && p[1] < g.L - 15 && !others.some(P => inPoly(p[0], p[1], P));
    if (free) return { p, dir: dir(0, -side) };
  }
  return null;
}

/** @param {Item[]} items @param {Room} room */
function fengShui(items, room) {
  const g = roomGeo(room), act = activeItems(items, room), polys = new Map(act.map(i => [i.id, itemPoly(i)]));
  const parts = new Map(act.map(i => [i.id, itemParts(i)]));
  const seats = new Map();
  for (const it of act.filter(i => i.kind === 'bed' || i.kind === 'table')) {
    // A chair cannot stand in a chimney or a wall block either
    const seat = seatOf(it, g, [...act.filter(o => o !== it).flatMap(o => parts.get(o.id)), ...g.obstacles.map(o => o.poly)]);
    if (seat) seats.set(it, seat);
  }
  // office chair ≈ 60 × 60 cm, stands in the way
  const chairs = [...seats].filter(([it]) => it.kind === 'table').map(([, st]) => rectPoly(st.p[0] - 30, st.p[1] - 30, 60, 60));
  const field = distanceField(g, [...[...parts.values()].flat(), ...chairs, ...g.obstacles.map(o => o.poly)]);
  const { entry, target } = g;
  // Everyone who comes in comes through one of these. A balcony door counts only when it is the entrance.
  const doors = g.openings.filter(o => o === entry || o.type === 'door');
  // Without an entrance or anything to walk to there is no way to look for. A balcony door has to be reached, a window not.
  const from = entry && insideOf(entry);
  const to = !from || !target ? null : target.type === 'window' ? windowGoal(field, from, target) : insideOf(target);
  const width = from && to ? bottleneck(field, from, to) : 0;
  const path = width ? flowPath(field, from, to, width) : null;
  // Every other door must stay reachable too
  const cutOff = from ? g.openings.filter(o => o.type !== 'window' && o !== entry && o !== target)
    .filter(o => !bottleneck(field, from, insideOf(o))) : [];
  // Narrow spot: the point with the least clearance on the path (leaving out the stretches right at the doors)
  let narrow = null;
  if (path) for (const q of path) if (Math.hypot(q.x - from[0], q.y - from[1]) >= DOOR_ZONE && Math.hypot(q.x - to[0], q.y - to[1]) >= DOOR_ZONE && (!narrow || q.d < narrow.d)) narrow = q;
  // Free centre: largest circle without furniture
  let circle = { r: 0 };
  for (let k = 0; k < field.d.length; k++) {
    const i = k % field.nx, j = (k - i) / field.nx, x = (i + 0.5) * FS_CELL + field.ox, y = (j + 0.5) * FS_CELL + field.oy;
    const r = Math.min(field.d[k], x, y, g.W - x, g.L - y);
    if (r > circle.r) circle = { x, y, r };
  }

  const zones = [];
  const zone = (items, pad, kind) => {
    if (!items.length) return;
    const bs = items.map(i => aabb(polys.get(i.id)));
    zones.push({ kind, x0: Math.min(...bs.map(b => b.x0)) - pad, y0: Math.min(...bs.map(b => b.y0)) - pad,
      x1: Math.max(...bs.map(b => b.x1)) + pad, y1: Math.max(...bs.map(b => b.y1)) + pad });
  };
  const beds = act.filter(i => i.kind === 'bed');
  // Every bed rests on its own: one box around two beds could span the whole room
  for (const b of beds) zone([b], 20, 'rest');
  zone(act.filter(i => i.kind === 'sofa' || i.kind === 'tv' || i.kind === 'television'), 15, 'live');

  const views = [];
  for (const [it, seat] of seats) {
    if (it.kind === 'table') {
      const [sx, sy] = seat.p;
      const A = aabb(polys.get(it.id));
      zones.push({ kind: 'work', x0: Math.min(A.x0, sx - 30) - 8, y0: Math.min(A.y0, sy - 30) - 8,
        x1: Math.max(A.x1, sx + 30) + 8, y1: Math.max(A.y1, sy + 30) + 8 });
    }
    // The view rates the door people come in by: the marked main entrance, else the first door (geometry.js picks it).
    // Other doors still count for the door line and the way, not here.
    if (!entry) { views.push({ it, seat, level: null, door: null }); continue; }
    const levelOf = door => {
      const vx = door[0] - seat.p[0], vy = door[1] - seat.p[1], len = Math.hypot(vx, vy);
      const ang = Math.acos(Math.max(-1, Math.min(1, (vx * seat.dir[0] + vy * seat.dir[1]) / len))) * 180 / Math.PI;
      // Line of sight blocked by tall furniture (wardrobe, shelf …)?
      const nxv = -vy / len * 2, nyv = vx / len * 2;
      const ray = [[seat.p[0] + nxv, seat.p[1] + nyv], [door[0] + nxv, door[1] + nyv], [door[0] - nxv, door[1] - nyv], [seat.p[0] - nxv, seat.p[1] - nyv]];
      const blocked = act.some(o => o !== it && itemHeight(o) > 120 && partsOverlap([ray], parts.get(o.id)) > EPS)
        || sightFixtures(g).some(o => overlap(ray, o.poly) > EPS);
      return blocked ? 'blocked' : ang <= 60 ? 'good' : ang <= 100 ? 'side' : 'back';
    };
    views.push({ it, seat, door: entry.mid, level: levelOf(entry.mid) });
  }
  // Bed in the door line: does at least half of the "door beam" hit the bed with no tall piece in between?
  // Boxes in the door's frame: s along the wall, d into the room
  const inLineOf = door => {
    const span = A => {
      const c = [[A.x0, A.y0], [A.x1, A.y1]], ss = c.map(p => alongAt(door, p)), ds = c.map(p => depthAt(door, p));
      return { s0: Math.min(...ss), s1: Math.max(...ss), d0: Math.min(...ds), d1: Math.max(...ds) };
    };
    const tall = [...act.filter(o => itemHeight(o) > 120).map(o => aabb(polys.get(o.id))), ...sightFixtures(g).map(o => aabb(o.poly))].map(span);
    return beds.filter(i => {
      const B = span(aabb(polys.get(i.id)));
      let hit = 0, rays = 0;
      for (let s = 2.5; s < door.width; s += 5) {
        rays++;
        if (s > B.s0 && s < B.s1 && !tall.some(T => s > T.s0 && s < T.s1 && T.d1 <= B.d0 + EPS)) hit++;
      }
      return hit * 2 >= rays;
    }).map(bed => ({ bed, door }));
  };
  const doorLines = doors.flatMap(inLineOf), doorLine = [...new Set(doorLines.map(l => l.bed))];
  // Mirror on the middle wardrobe door: does it face the bed (with no tall piece in between)?
  const mirroredBeds = new Set();
  const mirrors = act.filter(w => w.kind === 'wardrobe' && w.mirror !== false).filter(w => {
    const a = toWorld(w, -2, w.d / 2), b = toWorld(w, 2, w.d / 2 + 400), c2 = toWorld(w, 2, w.d / 2), d2 = toWorld(w, -2, w.d / 2 + 400);
    const ray = [a, c2, b, d2];
    const seen = beds.filter(bed => {
      if (partsOverlap([ray], parts.get(bed.id)) <= EPS) return false;
      const [bx, by] = [bed.x - c2[0], bed.y - c2[1]], bd = Math.hypot(bx, by);
      return !act.some(o => o !== w && o !== bed && itemHeight(o) > 120 && partsOverlap([ray], parts.get(o.id)) > EPS &&
        Math.hypot(o.x - c2[0], o.y - c2[1]) < bd) && !sightFixtures(g).some(o => overlap(ray, o.poly) > EPS &&
        boxDist(c2, aabb(o.poly)) < bd);
    });
    seen.forEach(bed => mirroredBeds.add(bed));
    return seen.length > 0;
  });
  return { g, doors, path, narrow, cutOff, circle, zones, views, doorLine, doorLines, mirrors, mirroredBeds };
}

// A free circle of this size is the goal, but no room can offer more than about half its short side: the rest is furniture
const CENTRE_GOAL = 170, CENTRE_SHARE = 0.5;
const DOUBLE_BED = 120;   // cm from here on a bed gets in from both sides
const DESK_NEAR = 170, WAY_PLENTY = 160, CENTRE_PLENTY = 1.5;   // cm from the window, cm of way, share of the goal for the centre
const DESK_SLACK = 0.25, SOFA_SLACK = 0.25, WAY_SLACK = 0.5;    // points the finer value can lose
const QUIET_PART = 0.42, QUIET_SLACK = 0.02;  // share of the way from the dark end to the bright end of the room
/** @param {{ W: number, L: number }} g */
const centreGoal = g => Math.min(CENTRE_GOAL, Math.min(g.W, g.L) * CENTRE_SHARE);

// The five criteria (CRIT, 1–5), worked out from the plan. Null means “does not apply”: what is not in the room is not
// scored and does not count in the weighting.
// facts holds what led to the scores, for the rules in recommend.js.
/** @param {ReturnType<typeof fengShui>} fs @param {Item[]} items @param {Room} room */
function rateLayout(fs, items, room) {
  const { g } = fs, act = activeItems(items, room), poly = new Map(act.map(i => [i.id, itemPoly(i)]));
  const parts = new Map(act.map(i => [i.id, itemParts(i)]));
  // Path to the light: nearest point of the nearest window opening
  const lightFrom = p => g.lights.map(o => ({ o, w: openingDist(o, p) })).sort((a, b) => a.w - b.w)[0];
  const angle = (dir, to) => {
    const vx = to[0], vy = to[1], len = Math.hypot(vx, vy) || 1;
    return Math.acos(Math.max(-1, Math.min(1, (vx * dir[0] + vy * dir[1]) / len))) * 180 / Math.PI;
  };
  const inRange = v => Math.max(1, Math.min(5, v)), clamp = v => inRange(Math.round(v));
  // How far a measure stays below what would be plenty, from 0 (plenty) to 1
  const short = (v, plenty) => Math.max(0, 1 - v / plenty);
  /** @type {Record<string, number | null>} */
  const score = {};
  // Whole points hide what sets two good layouts apart, so the total uses these: the value before rounding, less a little
  // for what could still be roomier
  /** @type {Record<string, number | null>} */
  const fine = { bed: null, desk: null, sofa: null, flow: null, zones: null };
  /** @type {Record<string, string>} */
  const why = {};
  /** @type {any} */
  const facts = { beds: [], desk: null, noSeat: false, sofa: null, flow: null, zones: { bed: null, work: null, cinema: false } };
  const viewOf = it => fs.views.find(v => v.it === it);
  const beds = act.filter(i => i.kind === 'bed');
  const tables = fs.views.filter(v => v.it.kind === 'table');
  // Main seat: the table with the most light
  const desk = g.lights.length ? tables.map(v => ({ ...v, ...lightFrom(v.seat.p) })).sort((a, b) => a.w - b.w)[0] : undefined;
  const tv = act.find(i => i.image);
  // What you look at: the projector image on the wall behind the board, otherwise the TV itself
  const screens = [...(tv ? [toWorld(tv, 0, -tv.d / 2)] : []),
    ...act.filter(i => i.kind === 'television').map(i => [i.x, i.y])];
  const beamer = tv ? beamerCheck(tv, act, g) : null;
  const sofas = act.filter(i => i.kind === 'sofa');
  const viewers = sofas.filter(i => screens.some(p => faces(i, p))), sofaSeesScreen = viewers.length > 0;
  // With several sofas or TVs, one free view is enough
  const sights = tvSight(act, g), tvBlocked = sights.length > 0 && !tv && sights.every(v => v.blockers.length || v.fixed.length);
  // Does a table stand right at the headboard?
  const deskAtHead = bed => {
    const [hx, hy] = toWorld(bed, 0, -bed.d / 2), r = bed.w / 2 + 12;
    return act.some(t => {
      if (t.kind !== 'table') return false;
      const A = aabb(poly.get(t.id));
      return Math.hypot(Math.max(A.x0 - hx, 0, hx - A.x1), Math.max(A.y0 - hy, 0, hy - A.y1)) <= r;
    });
  };

  // Bed & rest: every bed counts, and the worst one decides
  const rateBed = bed => {
    const B = aabb(poly.get(bed.id)), v = viewOf(bed), r = [];
    const [hx, hy] = toWorld(bed, 0, -bed.d / 2), sides = sideGaps(B, g);
    const walls = sides.filter(d => d < 15).length;
    let s = 4;
    // The head rests against a wall, or against a chimney, column or wall block. Turned square, that is the side of the head.
    const headSide = { 0: 2, 90: 1, 180: 3, 270: 0 }[normRot(bed.rot)];
    const noHead = Math.min(hx, g.W - hx, hy, g.L - hy) > 15 && (headSide === undefined
      ? wallFixtures(g).every(o => boxDist([hx, hy], aabb(o.poly)) > 15) : sides[headSide] >= 15);
    // A double bed with its head at a wall is meant to stand free on both sides, so only a narrow one is told to go to a corner
    const free = walls < 2 && (noHead || bed.w < DOUBLE_BED);
    if (noHead) { s -= 2; r.push('no wall behind the headboard'); }
    if (free) { s -= 2; r.push('bed stands out into the room'); }
    if (v?.level === 'blocked') { s -= 1; r.push('view of the door blocked'); }
    else if (v?.level === 'back') { s -= 1; r.push('door behind you'); }
    else if (v?.level === 'side') r.push('door at the edge of sight');
    if (fs.doorLine.includes(bed)) { s -= 0.5; r.push('in line with the door'); }
    if (fs.mirroredBeds.has(bed)) { s -= 1; r.push('mirror faces the bed'); }
    if (deskAtHead(bed)) { s -= 0.5; r.push('desk at the headboard'); }
    facts.beds.push({ name: bed.name, noHead, free, view: v?.level ?? null, doorLine: fs.doorLine.includes(bed),
      mirror: fs.mirroredBeds.has(bed), deskAtHead: deskAtHead(bed) });
    return { bed, s, text: r.join(', ') || (g.entry ? 'wall behind the head, door in sight' : 'wall behind the head') };
  };
  if (beds.length) {
    const rated = beds.map(rateBed);
    const worst = Math.min(...rated.map(b => b.s));
    score.bed = clamp(worst); fine.bed = inRange(worst);
    why.bed = rated.length > 1 ? rated.map(b => `${b.bed.name}: ${b.text}`).join('; ') : rated[0].text;
  } else { score.bed = null; why.bed = 'no bed in the room'; }

  // Desk & light
  if (desk) {
    const m = Math.round(desk.w / 10) / 10, r = [`${desk.it.name} ${m} m from the window`];
    // +1 = faces the window, −1 = window behind
    const near = desk.w < DESK_NEAR, facing = -(desk.seat.dir[0] * desk.o.inward[0] + desk.seat.dir[1] * desk.o.inward[1]);
    let s = near ? 5 : desk.w < 260 ? 4.5 : desk.w < 360 ? 2 : 1;
    if (facing > 0.7) {
      if (near) { s -= 1; r.push('facing the window (glare)'); }
      else { s += 1; r.push('view outside'); }
    } else if (facing < -0.7) { s -= desk.w < 260 ? 1 : 0; r.push('window behind you'); }
    else r.push('daylight from the side');
    if (desk.level === 'good') { s += 0.5; r.push('door in sight'); }
    score.desk = clamp(s); why.desk = r.join(', ');
    fine.desk = inRange(inRange(s) - DESK_SLACK * (1 - short(desk.w, DESK_NEAR)));
    facts.desk = { name: desk.it.name, dist: desk.w, near, facing, level: desk.level };
  } else if (!act.some(i => i.kind === 'table')) { score.desk = null; why.desk = 'no table in the room'; }
  else if (!g.lights.length) { score.desk = null; why.desk = 'no window in the room'; }
  // A table nobody can sit at is a fault of the layout, not missing furniture
  else { score.desk = 1; fine.desk = 1; why.desk = 'no table with a free seat'; facts.noSeat = true; }

  // Sofa, view & projector: window and screen count only if there are any
  if (sofas.length && (g.lights.length || screens.length)) {
    const r = [];
    let s = 5;
    // Every sofa counts, so what is said about the window or the screen has to name the one it is true for
    facts.sofa = { name: sofas[0].name, gap: null, screen: screens.length > 0, sees: sofaSeesScreen,
      viewer: viewers[0]?.name ?? null, count: sofas.length };
    if (g.lights.length) {
      const gapOf = i => Math.min(...g.lights.map(o => Math.min(...poly.get(i.id).map(p => depthAt(o, p)))));
      const closest = [...sofas].sort((a, b) => gapOf(a) - gapOf(b))[0], gap = gapOf(closest);
      facts.sofa.name = closest.name; facts.sofa.gap = gap;
      if (gap > 100) { s -= 1; r.push(`sofa ${fmt(gap)} cm from the window`); } else r.push('sofa at the window');
    }
    if (screens.length) {
      if (!sofaSeesScreen) { s -= 2; r.push('does not face the screen'); } else r.push('faces the screen');
      if (tvBlocked) { s -= 1; r.push('view of the TV blocked'); }
    }
    if (beamer) {
      const cov = [...beamer.covered, ...beamer.fixed].reduce((a, [, w]) => a + w, 0);
      if (cov > EPS) { s -= cov > 40 ? 2 : 1; r.push(`${fmt(cov)} cm of the picture covered`); }
      if (beamer.offWall) { s -= 1; r.push('picture not fully on the wall'); }
    }
    score.sofa = clamp(s); why.sofa = r.join(', ');
    fine.sofa = inRange(inRange(s) - (facts.sofa.gap === null ? 0 : SOFA_SLACK * (1 - short(facts.sofa.gap, 100))));
  } else {
    score.sofa = null;
    why.sofa = sofas.length ? 'no window or screen to look at' : 'no sofa in the room';
  }

  // Chi-Fluss & Weite
  if (g.entry && g.target) {
    const r = [], w = fs.narrow ? fs.narrow.d * 2 : fs.path ? null : -1;
    const open = g.swings.map(sw => {
      const hit = act.map(i => parts.get(i.id)).filter(P => partsOverlap(P, [sw.poly]) > EPS);
      return Math.min(90, ...hit.map(P => partsOpening(sw, P)));
    });
    const worst = Math.min(...open);
    let s;
    if (w === -1) { s = 1; r.push(`no way to the ${OPENINGS[g.target.type].place}`); }
    else {
      // Door and window so close together that nothing lies between them: no gap to measure, so none to blame
      if (w === null) { s = 4.5; r.push('short way, no gap to measure'); }
      else { s = w >= 110 ? 4.5 : w >= 90 ? 4 : w >= 70 ? 3 : 2; r.push(`narrowest point ~${fmt(w)} cm`); }
      if (worst >= 85) { s += 0.5; r.push('all doors open fully'); }
      else { if (worst < 50) s -= 1; else if (worst < 80) s -= 0.5; r.push(`one door opens only ${worst}°`); }
    }
    for (const o of fs.cutOff) { s -= 1; r.push(`${o.label}: no free way`); }
    r.push(`open floor ⌀ ${fmt(fs.circle.r * 2)}`);
    const centre = fs.circle.r * 2, goal = centreGoal(g);
    if (centre < goal) s -= 0.5;
    score.flow = clamp(s); why.flow = r.join(', ');
    fine.flow = inRange(inRange(s) - WAY_SLACK * (w === null ? 0 : short(Math.max(w, 0), WAY_PLENTY)) - WAY_SLACK * short(centre, goal * CENTRE_PLENTY));
    facts.flow = { width: w, worst, cutOff: fs.cutOff.map(o => o.label), centre, goal };
  } else {
    score.flow = null;
    why.flow = g.entry ? 'no window or balcony door to walk to' : 'no door in the room';
  }

  // Zones (yin/yang): without a window no part of the room is brighter than another
  if (beds.length || desk) {
    const r = [], lit = !!g.lightDir, at = p => lightPos(g, p);
    let s = 4;
    if (lit && beds.length) {
      const seat = desk?.seat.p;
      const rest = beds.map(bed => {
        if (at([bed.x, bed.y]) < 0.5 && (!seat || at(seat) > at([bed.x, bed.y]))) {
          // In a short room a long bed cannot stay out of the middle: as far back as it goes is quiet enough
          const reach = poly.get(bed.id).map(at), far = Math.max(...reach), length = far - Math.min(...reach);
          return far < Math.max(QUIET_PART, length + QUIET_SLACK) ? { d: 0, text: 'bed in the quiet part' }
            : { d: -1, text: 'bed in the middle of the room' };
        }
        return { d: -1, text: 'bed not in the quiet part' };
      }).sort((a, b) => a.d - b.d)[0];
      s += rest.d; r.push(rest.text);
      facts.zones.bed = rest.d === 0 ? 'quiet' : 'busy';
    }
    if (lit && desk) {
      if (at(desk.seat.p) >= 0.6) { s += 0.5; r.push('work in the bright part'); facts.zones.work = 'bright'; }
      else if (at(desk.seat.p) < 0.4) { s -= 0.5; r.push('work in the dark part'); facts.zones.work = 'dark'; }
    }
    // Cinema from the bed instead of the sofa mixes rest and activity
    if (screens.length && !sofaSeesScreen && beds.some(bed => {
      const v = viewOf(bed);
      return v && screens.some(p => angle(v.seat.dir, [p[0] - v.seat.p[0], p[1] - v.seat.p[1]]) < 60);
    })) { s -= 1; r.push('watching from the bed instead of the sofa'); facts.zones.cinema = true; }
    if (beds.some(deskAtHead)) { s -= 0.5; r.push('work right at the bed'); }
    score.zones = clamp(s); why.zones = r.join(', ') || 'no clear zones';
    fine.zones = inRange(s);
  } else {
    score.zones = null;
    // The table here has no window or no free seat, so it is no workplace
    why.zones = !act.some(i => i.kind === 'table') ? 'no bed or desk in the room'
      : g.lights.length ? 'no bed, and no free seat at the table' : 'no bed, and no window for the table';
  }
  return { score, why, facts, fine };
}

/** The scores of a layout with their reasons. @param {ReturnType<typeof fengShui>} fs @param {Item[]} items @param {Room} room */
function fsEstimate(fs, items, room) {
  const { score, why } = rateLayout(fs, items, room);
  return { score, why };
}

/** What Standard goes back to: the profile picked for a project, else the weights its file came with, else neutral.
 * @param {{ profile?: string, baseWeights?: any }} p */
const standardWeights = p => ({ ...DEFAULT_W, ...(PROFILES[p.profile]?.weights ?? p.baseWeights) });

/** Criterion weights of a project, as set on the analysis page.
 * @param {{ weights?: any, profile?: string, baseWeights?: any }} p */
const loadWeights = p => ({ ...standardWeights(p), ...(p.weights || {}) });

/** Weighted total of a 1-5 score as a percentage. A criterion without a score does not apply, and its weight goes too.
 * @param {any} score @param {any} weights @param {any[][]} [crit] */
function weightedScore(score, weights, crit = CRIT) {
  const used = crit.filter(([k]) => score[k] !== null && score[k] !== undefined);
  const sum = used.reduce((a, [k]) => a + weights[k], 0) || 1;
  return used.reduce((a, [k]) => a + weights[k] * score[k], 0) / (5 * sum) * 100;
}
