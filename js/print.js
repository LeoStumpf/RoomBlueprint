// @ts-check
// ---------- Plan print: technical drawing, black on white, viewBox in cm ----------

// Standard scales from large to small; 1 cm in the plan is 10 / scale mm on paper. The largest that fits is used.
const PRINT_SCALES = [20, 25, 30, 40, 50, 75, 100, 150, 200, 300, 500];
const PAGE_W = 190, PAGE_H = 281;   // mm inside the padding of #printSheet on A4 portrait
const ROW_GAP = 13;                 // cm between two rows of dimensions at 1:30
const ROW_H = 4.31;                 // mm of one row in the parts list
const BAR_LENGTHS = [2000, 1000, 500, 200, 100];   // cm the scale bar can show, longest first
const BAR_MAX = 67;                 // mm the bar may span inside the title block
const BAR_MARGIN = 1, BAR_HEIGHT = 5.4, BAR_TEXT = 2.2;   // mm on paper
const LIST_ON_SHEET = 40;           // rows of the parts list that still share the sheet with the plan
const WARN_CHARS = 125;             // letters of the warning line below the plan
const PRINT_LABEL_WIDTH = 0.56;     // of the font size, for one letter

// Lettering keeps its size on paper: below 1:30 it grows in plan units. Set for the sheet being built.
let printK = 1;
/** @param {number} scale */
const letterScale = scale => Math.max(1, scale / 30);

function printText(parent, x, y, str, size, attrs = {}) {
  return text(parent, x, y, str, size, { fill: '#000', stroke: '#fff', 'stroke-width': size / 3.5, 'paint-order': 'stroke',
    'stroke-linejoin': 'round', ...attrs });
}

// Dimension from (x1,y1) to (x2,y2) with slashes at the ends
function printDim(parent, x1, y1, x2, y2, label, size = 7) {
  const st = { stroke: '#000', 'stroke-width': 0.4 }, horiz = y1 === y2, t = 3 * printK;
  size *= printK;
  el('line', { x1, y1, x2, y2, ...st }, parent);
  for (const [x, y] of [[x1, y1], [x2, y2]]) el('line', { x1: x - t, y1: y + t, x2: x + t, y2: y - t, ...st, 'stroke-width': 0.8 }, parent);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  printText(parent, mx, my, label, size, horiz ? {} : { transform: `rotate(-90 ${mx} ${my})` });
}

// Chain of dimensions along a line: stops = positions along the axis
function printChain(parent, horiz, at, stops, from) {
  for (let i = 0; i + 1 < stops.length; i++) {
    const a = stops[i], b = stops[i + 1];
    if (horiz) printDim(parent, a, at, b, at, fmt(b - a)); else printDim(parent, at, a, at, b, fmt(b - a));
  }
  const end = at + (at > from ? 3 : -3) * printK;
  for (const v of stops) el('line', horiz ? { x1: v, y1: from, x2: v, y2: end, stroke: '#000', 'stroke-width': 0.25 }
    : { x1: from, y1: v, x2: end, y2: v, stroke: '#000', 'stroke-width': 0.25 }, parent);
}

// Switch the colours of the planner details to black and white
function printMono(g) {
  for (const e of [...g.children]) {
    if (e.tagName === 'circle') { e.remove(); continue; }   // the projector's lens gets in the way of the labels
    const image = e.getAttribute('stroke') === PLAN.image;
    if (e.getAttribute('fill') !== 'none') e.setAttribute('fill', '#fff');
    e.setAttribute('stroke', '#000');
    e.setAttribute('stroke-width', image ? 0.9 : 0.45);
    e.removeAttribute('opacity');
    if (image) e.setAttribute('stroke-dasharray', '12 3 2 3');
  }
}

function drawPrintRoom(root, hatch, room) {
  const g = roomGeo(room), R = room, T = R.wall;
  el('path', { 'fill-rule': 'evenodd', fill: hatch, stroke: '#000', 'stroke-width': 1.2,
    d: `M${-T},${-T}H${g.W + T}V${g.L + T}H${-T}Z M0,0V${g.L}H${g.W}V0Z` }, root);
  // Openings: glass as a double line, name inside the wall
  for (const o of g.openings) {
    const A = wallGap(o, T, 0.6), [dx, dy] = o.inward.map(v => -v * T / 2), off = wallLabelOffset(T, 7 * printK);
    const x = o.mid[0] - o.inward[0] * off, y = o.mid[1] - o.inward[1] * off;
    el('rect', { x: A.x0, y: A.y0, width: A.x1 - A.x0, height: A.y1 - A.y0, fill: '#fff', stroke: '#000', 'stroke-width': 0.8 }, root);
    if (o.type !== 'door') el('line', { x1: o.a[0] + dx, y1: o.a[1] + dy, x2: o.b[0] + dx, y2: o.b[1] + dy, stroke: '#000', 'stroke-width': 0.4 }, root);
    const turn = { right: 90, left: -90 }[o.wall];
    printText(root, x, y, o.label, 7 * printK, turn ? { transform: `rotate(${turn} ${x} ${y})` } : {});
  }
  for (const o of g.obstacles) {
    el('polygon', { points: pts(o.poly), fill: o.type === 'radiator' ? '#fff' : hatch, stroke: '#000', 'stroke-width': 0.9 }, root);
    const A = aabb(o.poly);
    printText(root, (A.x0 + A.x1) / 2, (A.y0 + A.y1) / 2, o.label, 7 * printK);
  }
}

// Swing areas lie over the furniture: that is exactly what to check in the room
function drawPrintSwings(root, room) {
  const g = roomGeo(room);
  for (const s of [...g.swings, ...g.outSwings]) {
    const [px, py] = s.pivot, a = rad(s.open);
    const ex = px + s.r * Math.cos(rad(s.a0)), ey = py + s.r * Math.sin(rad(s.a0));
    const fx = px + s.r * Math.cos(rad(s.a1)), fy = py + s.r * Math.sin(rad(s.a1));
    el('path', { d: `M${ex},${ey} A${s.r},${s.r} 0 0 1 ${fx},${fy}`, fill: 'none', stroke: '#000', 'stroke-width': 0.4, 'stroke-dasharray': '5 3' }, root);
    el('line', { x1: px, y1: py, x2: px + s.r * Math.cos(a), y2: py + s.r * Math.sin(a), stroke: '#000', 'stroke-width': 1 }, root);
  }
}

function drawPrintItem(root, it) {
  const g = el('g', { transform: `translate(${it.x} ${it.y}) rotate(${it.rot})` }, root);
  drawBody(g, it, { fill: '#fff', stroke: '#000', 'stroke-width': 1 });
  drawDetails(g, it);
  printMono(g);
  g.firstChild.setAttribute('stroke-width', 1);
}

function drawPrintLabel(root, it, no) {
  const A = aabb(itemPoly(it)), bw = A.x1 - A.x0, bh = A.y1 - A.y0, vertical = bh > bw * 1.3;
  const len = vertical ? bh : bw, [cx, cy] = labelPoint(it), name = `${no} ${it.name}`;
  const fs = Math.max(5.5 * printK, Math.min(9 * printK, len * 0.9 / (name.length * PRINT_LABEL_WIDTH)));
  const lab = el('g', vertical ? { transform: `rotate(-90 ${cx} ${cy})` } : {}, root);
  printText(lab, cx, cy - fs * 0.55, clipLabel(name, len * 0.98 / (fs * PRINT_LABEL_WIDTH)), fs, { 'font-weight': 700 });
  printText(lab, cx, cy + fs * 0.6, `${fmt(it.w)} × ${fmt(it.d)}`, fs * 0.8);
}

/** The wall a fixture is measured on. One in a corner counts for one wall only. @param {Fixture} f @param {Room} room */
function fixtureWall(f, room) {
  if (f.y === 0) return 'top';
  if (f.y + f.d === room.l) return 'bottom';
  if (f.x === 0) return 'left';
  return f.x + f.w === room.w ? 'right' : null;
}

/**
 * The walls a fixture is measured on. A wall block in a corner cuts the room into an L, so both of its sides belong to the
 * outline and are measured on both walls; any other fixture counts for one wall only. @param {Fixture} f @param {Room} room
 * @returns {string[]}
 */
function fixtureWalls(f, room) {
  const first = fixtureWall(f, room);
  if (!first || f.type !== 'block') return first ? [first] : [];
  const side = f.x === 0 ? 'left' : f.x + f.w === room.w ? 'right' : null;
  const across = first === 'top' || first === 'bottom';
  return across && side && !(f.x === 0 && f.x + f.w === room.w) && !(f.y === 0 && f.y + f.d === room.l) ? [first, side] : [first];
}

/**
 * The rows of dimensions outside each wall, inner row first: the openings, then the fixtures. Top and left also carry the
 * overall size. An empty wall has no row of its own.
 * @param {Room} room @returns {Record<string, number[][]>}
 */
function dimensionRows(room) {
  const rows = wall => {
    const size = wall === 'top' || wall === 'bottom' ? room.w : room.l;
    const chain = cuts => [...new Set([0, ...cuts, size])].sort((a, b) => a - b);
    const openings = room.openings.filter(o => o.wall === wall).flatMap(o => [o.pos, o.pos + o.width]);
    const fixtures = room.fixtures.filter(f => fixtureWalls(f, room).includes(wall))
      .flatMap(f => wall === 'top' || wall === 'bottom' ? [f.x, f.x + f.w] : [f.y, f.y + f.d]);
    return [...[openings, fixtures].filter(c => c.length).map(chain), ...(wall === 'top' || wall === 'left' ? [[0, size]] : [])];
  };
  return Object.fromEntries(Object.keys(WALL_FRAMES).map(w => [w, rows(w)]));
}

/** How far door leaves opening outward reach past each outer wall face, in cm. @param {Room} room */
function leafReach(room) {
  const T = room.wall, leaves = roomGeo(room).outSwings.map(s => aabb(s.poly));
  return { top: Math.max(0, ...leaves.map(A => -A.y0 - T)), left: Math.max(0, ...leaves.map(A => -A.x0 - T)),
    bottom: Math.max(0, ...leaves.map(A => A.y1 - room.l - T)), right: Math.max(0, ...leaves.map(A => A.x1 - room.w - T)) };
}

// Distance of a row from the wall. The first row sits closer at the top, which keeps the print as tight as it was. Rows start
// past a leaf that opens outward, so that it does not cross them.
const rowOffset = (wall, k, K, reach = 0) => Math.max((wall === 'top' ? 10 : 12) * K, reach ? reach + 6 * K : 0) + ROW_GAP * k * K;

/** The part of the plan a sheet shows, in cm. @param {Room} room @param {number} K lettering factor */
function printFrame(room, K) {
  const T = room.wall, rows = dimensionRows(room), reach = leafReach(room);
  const edge = (wall, min, tail) => Math.max(min * K, rowOffset(wall, rows[wall].length - 1, K, reach[wall]) + tail * K, reach[wall] + 4 * K);
  const top = edge('top', 34, 11), bottom = edge('bottom', 40, 15), left = edge('left', 44, 11), right = edge('right', 44, 11);
  return { x0: -T - left, y0: -T - top, w: room.w + 2 * T + left + right, h: room.l + 2 * T + top + bottom };
}

/** Largest standard scale at which the plan fits above the parts list. @param {Room} room @param {number} footMm */
function pickPrintScale(room, footMm) {
  const fits = scale => {
    const f = printFrame(room, letterScale(scale));
    return f.w * 10 / scale <= PAGE_W && f.h * 10 / scale <= PAGE_H - footMm;
  };
  return PRINT_SCALES.find(fits) ?? PRINT_SCALES[PRINT_SCALES.length - 1];
}

/** Height of everything below the plan. The sheet is hidden while it is built, so it cannot be measured. Every row of
 * the parts list stays on one line, and so does the warning, so this is exact: the rows or the title block, the gap above, one
 * line of warnings. A list too long for the sheet goes to a page of its own and takes nothing from the plan.
 * @param {number} rows of the parts list */
const footHeight = rows => Math.max(30, (rows > LIST_ON_SHEET ? 0 : rows + 1) * ROW_H) + 8;

/** What the checks found, in the one line the sheet has for it. @param {string[]} hits @param {number} [max] letters */
function warningLine(hits, max = WARN_CHARS) {
  if (!hits.length) return '';
  const head = 'Measure again: ', rest = n => n ? ` · +${n} more` : '';
  let line = head;
  for (let i = 0; i < hits.length; i++) {
    const next = `${line}${i ? ' · ' : ''}${hits[i]}`;
    if (next.length + rest(hits.length - i - 1).length > max) {
      return i ? line + rest(hits.length - i) : clipLabel(next, max - rest(hits.length - 1).length) + rest(hits.length - 1);
    }
    line = next;
  }
  return line;
}

/** The longest standard length that fits the title block.
 * @param {number} scale @returns {{ len: number, mm: number, width: number }} cm in the room, mm on paper, mm with margins */
function scaleBar(scale) {
  const len = BAR_LENGTHS.find(l => l * 10 / scale <= BAR_MAX), mm = len * 10 / scale;
  return { len, mm, width: mm + 2 * BAR_MARGIN };
}

/** @param {{ room: Room, items: Item[], title: string }} plan */
function buildPrintSheet({ room, items, title }) {
  const g = roomGeo(room), T = room.wall, act = activeItems(items, room), sheet = $('#printSheet');
  // In the foot beside the title block, or on a page of its own
  const long = act.length > LIST_ON_SHEET;
  sheet.classList.toggle('long-list', long);
  if (long) sheet.append($('#printList')); else sheet.querySelector('.print-foot').prepend($('#printList'));
  const scale = pickPrintScale(room, footHeight(act.length));
  printK = letterScale(scale);
  const K = printK;
  $('#printRoom').textContent = `Room ${g.W} × ${g.L} cm`;
  $('#printScaleText').textContent = `Scale 1:${scale} (A4, print at 100 %)`;
  const { x0, y0, w, h } = printFrame(room, K);
  const p = $('#printPlan');
  p.replaceChildren();
  p.setAttribute('viewBox', `${x0} ${y0} ${w} ${h}`);
  p.setAttribute('width', `${w * 10 / scale}mm`);
  p.setAttribute('height', `${h * 10 / scale}mm`);
  p.setAttribute('font-family', '"Liberation Sans", Arial, Helvetica, sans-serif');
  const defs = el('defs', {}, p);
  const pat = el('pattern', { id: 'printHatch', width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
  el('line', { x1: 0, y1: 0, x2: 0, y2: 7, stroke: '#000', 'stroke-width': 0.5 }, pat);
  const hatch = 'url(#printHatch)';
  drawPrintRoom(p, hatch, room);
  act.forEach(it => drawPrintItem(p, it));
  drawPrintSwings(p, room);
  act.forEach((it, i) => drawPrintLabel(p, it, i + 1));

  // Free gaps between the pieces (each stretch once). Long stretches are in the parts list.
  const seen = new Set();
  for (const it of act) for (const s of gaps(it, items, room)) {
    const horiz = s.y1 === s.y2, key = horiz ? `h${Math.round(s.x1)}:${Math.round(s.x2)}` : `v${Math.round(s.y1)}:${Math.round(s.y2)}`;
    const inside = g.obstacles.some(o => inPoly((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, o.poly));
    if (s.d < 3 || s.d > 300 || inside || seen.has(key)) continue;
    seen.add(key);
    printDim(p, s.x1, s.y1, s.x2, s.y2, fmt(s.d), 6.5);
  }

  // Outer chains of dimensions
  const face = { top: -T, left: -T, right: g.W + T, bottom: g.L + T };
  const reach = leafReach(room);
  for (const [wall, rows] of Object.entries(dimensionRows(room))) {
    const sign = wall === 'top' || wall === 'left' ? -1 : 1, horiz = wall === 'top' || wall === 'bottom';
    rows.forEach((stops, k) => {
      const off = rowOffset(wall, k, K, reach[wall]);
      printChain(p, horiz, face[wall] + sign * off, stops, face[wall] + (k ? sign * (off - 10 * K) : 0));
    });
  }

  // Parts list, title block, scale
  const rows = act.map((it, i) => {
    const A = aabb(itemPoly(it));
    return `<tr><td>${i + 1}</td><td>${esc(it.name)}</td><td>${fmt(it.w)} × ${fmt(it.d)}</td>
      <td>${fmt(A.x0)}</td><td>${fmt(g.W - A.x1)}</td><td>${fmt(A.y0)}</td><td>${fmt(g.L - A.y1)}</td></tr>`;
  }).join('');
  $('#printList').innerHTML = `<thead><tr><th>No.</th><th>Furniture</th><th>W × D</th><th>left</th><th>right</th><th>top</th><th>bottom</th></tr></thead><tbody>${rows}</tbody>`;
  $('#printName').textContent = title;
  $('#printDate').textContent = dateText();
  const hits = analyze(items, room).issues.filter(i => i.lvl === 2).map(i => i.text);
  $('#printCheck').textContent = warningLine(hits);

  // Drawn in mm, so that the lettering keeps its size at every scale
  const bar = $('#printScale'), { len, mm, width } = scaleBar(scale), cmToBar = mm / len;
  bar.replaceChildren();
  bar.setAttribute('viewBox', `${-BAR_MARGIN} 0 ${width} ${BAR_HEIGHT}`);
  bar.setAttribute('width', `${width}mm`);
  bar.setAttribute('height', `${BAR_HEIGHT}mm`);
  bar.setAttribute('font-family', '"Liberation Sans", Arial, Helvetica, sans-serif');
  for (let i = 0; i < 4; i++) el('rect', { x: i * mm / 4, y: 0.4, width: mm / 4, height: 1.2, fill: i % 2 ? '#fff' : '#000', stroke: '#000', 'stroke-width': 0.15 }, bar);
  for (const v of [0, len / 2, len]) text(bar, v * cmToBar, 3.6, v ? `${v / 100} m` : '0', BAR_TEXT,
    { fill: '#000', 'text-anchor': v === len ? 'end' : v ? 'middle' : 'start' });
}
