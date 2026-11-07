// @ts-check
// Draws a plan into any <svg>. Holds no state of its own, so a page can show several plans at once.

const STORE_REFUSED = 'This change is not saved: the storage of this browser is full or blocked. Export the project to keep your work.';

/** A problem with saving or sharing. It stays on screen until it is over. @param {string} text empty hides the bar */
function noticeBar(text) {
  const bar = document.getElementById('appNotice');
  if (!bar) return;
  bar.textContent = text;
  bar.hidden = !text;
}

/** Everything a page has to say about saving and sharing. Both have to go through here, or one wipes out the other.
 * @param {boolean} refused the last write was refused */
const showNotices = refused => noticeBar([refused ? STORE_REFUSED : '', syncNotice()].filter(Boolean).join(' '));

const NS = 'http://www.w3.org/2000/svg';
// The Blueprint fonts only if this device has them: nothing is ever loaded, so the tool works offline
const PLAN_FONT = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
const LABEL_WIDTH = 0.62;   // of the font size, for one letter of that font

// Colours of the plan are tokens from css/app.css, so the plan follows the theme and is light on paper.
// Exporting a picture has to replace them, see resolveTokens().
const PLAN = Object.fromEntries(['bg', 'floor', 'grid', 'grid-major', 'wall', 'on-wall', 'fixture', 'door', 'glass', 'glass-soft', 'on-glass',
  'ink', 'muted', 'item', 'line', 'halo', 'accent', 'bad', 'warn', 'flow', 'sun', 'image', 'device', 'lens',
  'zone-rest', 'zone-live', 'zone-work'].map(k => [k, `var(--plan-${k})`]));

/** A furniture colour, thinned with a token so that it works on either theme. @param {string} color @param {number} pct @param {string} base */
const tint = (color, pct, base) => `color-mix(in srgb, ${color} ${pct}%, ${base})`;

/** Cuts text to a number of letters. @param {string} s @param {number} chars */
const clipLabel = (s, chars) => s.length <= chars ? s : `${s.slice(0, Math.max(1, Math.floor(chars) - 1)).trimEnd()}…`;
/** @param {string} s @returns {any} */
const $ = s => document.querySelector(s);
/** @param {string} id @returns {any} */
const $id = id => document.getElementById(id);
/** @param {string} s @returns {any[]} */
const $$ = s => [...document.querySelectorAll(s)];

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** The computed part of a review, for the analysis and compare pages. Texts come from the rules and from furniture names.
 * @param {{ pro: string[], con: string[], tips: string[] }} r */
const reviewHtml = r => `<ul class="pro">${r.pro.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
  <ul class="con">${r.con.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
  ${r.tips.length ? `<div class="tip"><b>To try:</b><ul>${r.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}`;

/** Notes an older file brought for a layout. @param {{ pro: string[], con: string[], tip: string } | undefined} n */
const notesHtml = n => !n || !(n.pro.length || n.con.length || n.tip) ? '' : `<div class="own"><b>Notes from the project file</b>
  <ul class="pro">${n.pro.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
  <ul class="con">${n.con.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
  ${n.tip ? `<p>${esc(n.tip)}</p>` : ''}</div>`;

/** A criterion as a percentage: 5 of 5 points are 100 %. @param {{ fine?: any, score: any }} r @param {string} k @returns {number | null} */
const critPercent = (r, k) => r.score[k] === null ? null : Math.round((r.fine?.[k] ?? r.score[k]) * 20);

/** A percentage as text. @param {number | null} v */
const pctText = v => v === null ? 'n/a' : `${Math.round(v)} %`;

/** A criterion as a short percentage bar with its number, for a table cell. Same scale as barsHtml(). @param {number | null} v */
const pctBar = v => v === null ? '<span class="pct-bar na" title="Does not apply, so it does not count">n/a</span>'
  : `<span class="pct-bar"><span class="bar-track" aria-hidden="true"><i style="width:${v}%"></i></span><span class="n">${pctText(v)}</span></span>`;

/** The criteria of a review as percentage bars, with what each rests on in measured words.
 * @param {{ fine?: any, score: any, why: Record<string, string> }} r */
const barsHtml = r => CRIT.map(([k, l]) => {
  const v = critPercent(r, k);
  return `<div class="bar-row crit"><div class="bar-head"><span>${esc(l)}</span><span class="pct"${v === null
    ? ' title="Does not apply, so it does not count"' : ''}>${pctText(v)}</span></div>
    <div class="bar-track" aria-hidden="true"><i style="width:${v ?? 0}%"></i></div>
    <div class="bar-why why">${esc(r.why[k])}</div></div>`;
}).join('');

/** A line of the reading. A text that opens with its term does not need the term in front of it.
 * @param {{ term: string, good: boolean, text: string }} f */
const fengLine = f => f.text.toLowerCase().startsWith(f.term.toLowerCase()) ? esc(f.text) : `<b>${esc(f.term)}:</b> ${esc(f.text)}`;

/** The Feng Shui reading of a layout, shown while that layer is on. @param {{ term: string, good: boolean, text: string }[]} list */
const fengHtml = list => !list.length ? '' : `<div class="feng-only feng-read"><b>Feng Shui reading</b><ul>${list.map(f =>
  `<li class="${f.good ? 'good' : 'bad'}">${fengLine(f)}</li>`).join('')}</ul></div>`;

/** A date that reads the same everywhere. @param {number} [ms] */
const dateText = (ms = Date.now()) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const FENG_KEY = 'roomBlueprint.fengShui';

/**
 * The Feng Shui layer is one switch across all pages. It only changes words and adds its reading, never a score. Parts of a page
 * that belong to it carry the class feng-only.
 * @param {any} box its checkbox @param {(on: boolean) => void} changed @returns {boolean} whether it is on now
 */
function fengSwitch(box, changed) {
  const apply = on => document.documentElement.classList.toggle('feng', on);
  box.checked = storeGet(FENG_KEY) === true;
  apply(box.checked);
  box.onchange = () => { storeSet(FENG_KEY, box.checked); apply(box.checked); changed(box.checked); };
  return box.checked;
}

/** The tag of a layout on the analysis page. @param {{ now: boolean, working: boolean, idea: string[] }} s */
const entryTag = s => s.working ? 'not saved' : s.now ? 'current' : s.idea.length ? 'example' : 'saved';

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
const pts = P => P.map(p => p.join(',')).join(' ');

function text(parent, x, y, str, size, attrs = {}) {
  const t = el('text', { x, y, 'font-size': size, 'text-anchor': 'middle', 'dominant-baseline': 'central',
    fill: PLAN.ink, ...attrs }, parent);
  t.textContent = str;
  return t;
}

/** How far outside the inner face of a wall a name sits: in the wall, or in the room just off it when a wall is too thin for
 * lettering of this size. @param {number} T wall @param {number} size */
const wallLabelOffset = (T, size) => T >= size * 1.2 ? T / 2 : -size * 0.9;

// The wall below an opening is cut out. Glass gets a line: at the outer face for a balcony door, in the middle for a window.
/** @param {any} root @param {OpeningGeo} o @param {number} T */
function drawOpening(root, o, T) {
  const A = wallGap(o, T), isDoor = o.type === 'door';
  el('rect', { x: A.x0, y: A.y0, width: A.x1 - A.x0, height: A.y1 - A.y0, fill: isDoor ? PLAN.floor : PLAN['glass-soft'] }, root);
  if (!isDoor) {
    const out = o.type === 'window' ? T / 2 : T, [dx, dy] = o.inward.map(v => -v * out);
    el('line', { x1: o.a[0] + dx, y1: o.a[1] + dy, x2: o.b[0] + dx, y2: o.b[1] + dy, stroke: PLAN.glass, 'stroke-width': 3 }, root);
  }
  // Right and bottom have free space outside, top and left carry the rulers, so the name goes into the wall there
  const size = 10, outside = o.wall === 'right' || o.wall === 'bottom';
  const off = outside ? T + (o.wall === 'right' ? 8 : 10) : wallLabelOffset(T, size);
  const x = o.mid[0] - o.inward[0] * off, y = o.mid[1] - o.inward[1] * off;
  const turn = { right: 90, left: -90 }[o.wall];
  text(root, x, y, o.label, size, { fill: outside ? PLAN.muted : isDoor || off < 0 ? PLAN.ink : PLAN['on-glass'],
    ...(turn ? { transform: `rotate(${turn} ${x} ${y})` } : {}) });
}

/** @param {any} root @param {Room} room */
function drawRoom(root, room) {
  const g = roomGeo(room), R = room, T = R.wall;
  el('rect', { x: -T, y: -T, width: g.W + 2 * T, height: g.L + 2 * T, fill: PLAN.wall }, root);
  el('rect', { x: 0, y: 0, width: g.W, height: g.L, fill: PLAN.floor }, root);
  for (let v = 50; v < Math.max(g.W, g.L); v += 50) {
    const major = v % 100 === 0, st = { stroke: major ? PLAN['grid-major'] : PLAN.grid, 'stroke-width': major ? 1 : 0.6 };
    if (v < g.W) el('line', { x1: v, y1: 0, x2: v, y2: g.L, ...st }, root);
    if (v < g.L) el('line', { x1: 0, y1: v, x2: g.W, y2: v, ...st }, root);
  }
  for (let v = 0; v <= g.W; v += 100) text(root, v, -T - 9, `${v / 100} m`, 9, { fill: PLAN.muted });
  for (let v = 100; v <= g.L; v += 100) text(root, -T - 14, v, `${v / 100} m`, 9, { fill: PLAN.muted });

  // Openings
  for (const o of g.openings) drawOpening(root, o, T);

  for (const o of g.obstacles) {
    // A wall block is more wall: it gives the room its L or U shape
    const block = o.type === 'block';
    el('polygon', { points: pts(o.poly), fill: block ? PLAN.wall : PLAN.fixture, stroke: PLAN.wall, 'stroke-width': 1 }, root);
    const A = aabb(o.poly);
    text(root, (A.x0 + A.x1) / 2, (A.y0 + A.y1) / 2, o.label, 9, { fill: block ? PLAN['on-wall'] : PLAN.ink });
  }
  for (const s of [...g.swings, ...g.outSwings]) {
    el('polygon', { points: pts(s.poly), fill: PLAN.door, 'fill-opacity': 0.06, stroke: 'none' }, root);
    const [px, py] = s.pivot, a = rad(s.open);
    const ex = px + s.r * Math.cos(rad(s.a0)), ey = py + s.r * Math.sin(rad(s.a0));
    const fx = px + s.r * Math.cos(rad(s.a1)), fy = py + s.r * Math.sin(rad(s.a1));
    el('path', { d: `M${ex},${ey} A${s.r},${s.r} 0 0 1 ${fx},${fy}`, fill: 'none', stroke: PLAN.door,
      'stroke-width': 1, 'stroke-dasharray': '4 3' }, root);
    el('line', { x1: px, y1: py, x2: px + s.r * Math.cos(a), y2: py + s.r * Math.sin(a),
      stroke: PLAN.door, 'stroke-width': 2 }, root);
  }
  text(root, g.W / 2, -T - 24, `${g.W} cm`, 12, { fill: PLAN.muted, 'font-weight': 600 });
  text(root, -T - 34, g.L / 2, `${g.L} cm`, 12, { fill: PLAN.muted, 'font-weight': 600,
    transform: `rotate(-90 ${-T - 34} ${g.L / 2})` });
}

const HANDLE_R = 10, TOUCH_R = 22;   // px on screen: what a handle shows, and what a finger can hit (44 px across)

/**
 * What can be grabbed in the “Edit room” mode, on top of the plan. Sizes that must stay the same on screen use px.
 * @param {any} svg @param {Room} room @param {{ kind: string, i: number } | null} sel @param {number} px cm per screen pixel
 */
function drawRoomEditor(svg, room, sel, px) {
  const root = el('g', {}, svg), g = roomGeo(room), T = room.wall, BLUE = PLAN.accent, r = HANDLE_R * px;
  const hit = (A, on, data) => el('rect', { x: A.x0, y: A.y0, width: A.x1 - A.x0, height: A.y1 - A.y0, fill: BLUE,
    'fill-opacity': on ? 0.35 : 0.12, stroke: BLUE, 'stroke-width': (on ? 2 : 1) * px, cursor: 'move', ...data }, root);
  g.obstacles.forEach((o, i) =>
    hit(aabb(o.poly), sel?.kind === 'fixture' && sel.i === i, { 'data-fixture': i }));
  g.openings.forEach((o, i) =>
    hit(wallGap(o, T, 8 * px), sel?.kind === 'opening' && sel.i === i, { 'data-opening': i }));
  const dot = (cx, cy, what, cursor, label) => {
    // Bigger than it looks, so that a finger can take it
    el('circle', { cx, cy, r: TOUCH_R * px, fill: 'transparent', cursor, 'data-room': what }, root);
    const c = el('circle', { cx, cy, r, fill: PLAN.floor, stroke: BLUE, 'stroke-width': 2 * px, cursor, 'data-room': what }, root);
    el('title', {}, c).textContent = label;
  };
  // Beside a door or window, which can then be grabbed all along
  const clear = TOUCH_R * px;
  dot(g.W + T / 2, handleAlong(room, 'right', clear), 'w', 'ew-resize', 'Drag to change the width');
  dot(handleAlong(room, 'bottom', clear), g.L + T / 2, 'l', 'ns-resize', 'Drag to change the length');
  dot(g.W + T / 2, g.L + T / 2, 'wl', 'nwse-resize', 'Drag to change width and length');
  dot(-T / 2, handleAlong(room, 'left', clear), 'x0', 'ew-resize', 'Drag to move the left wall');
  dot(handleAlong(room, 'top', clear), -T / 2, 'y0', 'ns-resize', 'Drag to move the top wall');
  // Out at the bottom left corner, clear of the other handles even without a wall and of the undo buttons at the top left.
  // Dragging it to the left makes the wall thicker.
  const out = T + clear * Math.SQRT1_2;
  dot(-out, g.L + out, 'wall', 'ew-resize', 'Drag to change the wall thickness');
  if (sel?.kind === 'fixture' && room.fixtures[sel.i]) {
    const [hx, hy] = fixtureHandle(room.fixtures[sel.i], room);
    dot(hx, hy, 'size', 'nwse-resize', 'Drag to change its size');
  }
}

/** @param {any} g @param {Item} it */
function drawDetails(g, it) {
  const w = it.w, d = it.d, x0 = -w / 2, y0 = -d / 2, dark = tint(it.color, 55, PLAN.line), lite = tint(it.color, 10, PLAN.item);
  const sw = { stroke: dark, 'stroke-width': 0.8 };
  switch (it.kind) {
    case 'bed': {
      el('rect', { x: x0, y: y0, width: w, height: Math.min(6, d), fill: dark }, g);
      // Any size can become a bed, and a negative size is an error in SVG
      for (const i of [0, 1]) el('rect', { x: x0 + 8 + i * w / 2, y: y0 + 10, width: Math.max(0, w / 2 - 16),
        height: Math.min(38, d / 3), rx: 6, fill: lite, ...sw }, g);
      el('rect', { x: x0 + 2, y: y0 + 55, width: Math.max(0, w - 4), height: Math.max(0, d - 57), rx: 4, fill: tint(it.color, 22, PLAN.item), ...sw }, g);
      break;
    }
    case 'sofa': {
      const bt = Math.min(20, d / 3);
      el('rect', { x: x0, y: y0, width: w, height: bt, fill: dark }, g);
      if (it.shape === 'L') {
        const [leg, bar] = legOf(it), x = (it.flip ? x0 + leg : w / 2 - leg);
        el('line', { x1: it.flip ? x0 : x, y1: y0 + bar, x2: it.flip ? x : w / 2, y2: y0 + bar, ...sw }, g);
      }
      break;
    }
    case 'table': {
      if (it.shape) break;
      for (const x of [x0, w / 2 - 4]) el('rect', { x, y: y0, width: 4, height: d, fill: dark, opacity: 0.5 }, g);
      el('rect', { x: x0 + 4, y: y0, width: Math.max(0, w - 8), height: 2, fill: dark, opacity: 0.5 }, g);
      break;
    }
    case 'tv': {
      for (const i of [1, 2]) el('line', { x1: x0 + i * w / 3, y1: d / 2 - 6, x2: x0 + i * w / 3, y2: d / 2, ...sw }, g);
      if (it.beamer) {
        const [bw, bd] = it.beamer;
        el('rect', { x: -bw / 2, y: -bd / 2, width: bw, height: bd, rx: 4, fill: PLAN.device }, g);
        el('circle', { cx: 0, cy: -bd / 2 + 6, r: 4, fill: PLAN.lens }, g);
      }
      if (it.image) {
        const iy = y0 - 4, h = it.image / 2;
        el('line', { x1: -h, y1: iy, x2: h, y2: iy, stroke: PLAN.image, 'stroke-width': 2.5 }, g);
        for (const x of [-h, h]) el('line', { x1: x, y1: iy - 5, x2: x, y2: iy + 5, stroke: PLAN.image, 'stroke-width': 1.5 }, g);
      }
      break;
    }
    case 'television': {
      // Stand with a flat screen along the back
      el('rect', { x: x0 + w * 0.1, y: y0 + 1, width: w * 0.8, height: Math.min(4, d / 3), fill: PLAN.device }, g);
      break;
    }
    case 'wardrobe': {
      const n = it.doors || 3, dw = w / n, fy = d / 2;
      for (let i = 1; i < n; i++) el('line', { x1: x0 + i * dw, y1: fy - 5, x2: x0 + i * dw, y2: fy, ...sw }, g);
      // A front set by hand means other doors than these, so it gets the strip below instead
      for (let i = 0; i < n && it.clear === undefined; i++) {
        const hx = x0 + i * dw;
        el('path', { d: `M${hx + dw},${fy} A${dw},${dw} 0 0 1 ${hx},${fy + dw}`, fill: 'none', stroke: PLAN.door,
          'stroke-width': 0.8, 'stroke-dasharray': '3 3' }, g);
        el('line', { x1: hx, y1: fy, x2: hx, y2: fy + dw, stroke: PLAN.door, 'stroke-width': 0.8 }, g);
      }
      break;
    }
    case 'shelf': {
      for (const [x, y] of [[x0, y0], [w / 2 - 3, y0], [x0, d / 2 - 3], [w / 2 - 3, d / 2 - 3]])
        el('rect', { x, y, width: 3, height: 3, fill: PLAN.line }, g);
      break;
    }
  }
  if (it.clear) el('rect', { x: x0, y: d / 2, width: w, height: it.clear, fill: 'none', stroke: PLAN.door, 'stroke-width': 0.8,
    'stroke-dasharray': '3 3', 'pointer-events': 'none' }, g);
}

/** The body of an item, in its own coordinates. @param {any} g @param {Item} it @param {Record<string, any>} attrs */
function drawBody(g, it, attrs) {
  if (it.shape === 'round') return el('ellipse', { cx: 0, cy: 0, rx: it.w / 2, ry: it.d / 2, ...attrs }, g);
  if (it.shape === 'L') return el('polygon', { points: pts(localShape(it).outline), ...attrs }, g);
  return el('rect', { x: -it.w / 2, y: -it.d / 2, width: it.w, height: it.d, ...attrs }, g);
}

/** Where the label of an item goes: an L has its middle in the bar, the centre of its box can be empty. @param {Item} it */
function labelPoint(it) {
  if (it.shape === 'L') return toWorld(it, 0, -it.d / 2 + legOf(it)[1] / 2);
  const A = aabb(itemPoly(it));
  return [(A.x0 + A.x1) / 2, (A.y0 + A.y1) / 2];
}

/** @param {any} root @param {Item} it @param {number} lvl */
function drawItem(root, it, lvl) {
  const g = el('g', { 'data-id': it.id, transform: `translate(${it.x} ${it.y}) rotate(${it.rot})`, cursor: 'move' }, root);
  drawBody(g, it, { fill: tint(it.color, 30, PLAN.item), stroke: PLAN.line, 'stroke-width': 1.2 });
  drawDetails(g, it);

  const A = aabb(itemPoly(it)), bw = A.x1 - A.x0, bh = A.y1 - A.y0;
  const vertical = bh > bw * 1.3, len = vertical ? bh : bw, thick = vertical ? bw : bh;
  const fs = Math.max(6, Math.min(14, (len * 0.9) / (it.name.length * LABEL_WIDTH), thick * 0.28));
  const [cx, cy] = labelPoint(it);
  const lab = el('g', { 'data-id': it.id, cursor: 'move',
    transform: vertical ? `rotate(-90 ${cx} ${cy})` : '' }, root);
  const style = { stroke: PLAN.halo, 'stroke-opacity': 0.8, 'stroke-width': fs / 4, 'paint-order': 'stroke', 'font-weight': 500 };
  text(lab, cx, cy - fs * 0.55, clipLabel(it.name, len * 0.95 / (fs * LABEL_WIDTH)), fs, style);
  text(lab, cx, cy + fs * 0.6, `${fmt(it.w)} × ${fmt(it.d)}`, fs * 0.75, { ...style, 'font-weight': 400, fill: PLAN.muted });

  if (lvl) {
    // Colour alone does not tell the two apart: the frame and the sign differ too
    const c = lvl === 2 ? PLAN.bad : PLAN.warn;
    el('polygon', { points: pts(itemPoly(it)), fill: lvl === 2 ? c : 'none', 'fill-opacity': 0.14, stroke: c, 'stroke-width': 3,
      ...(lvl === 2 ? {} : { 'stroke-dasharray': '8 5' }), 'pointer-events': 'none' }, root);
    text(root, A.x0 + 9, A.y0 + 10, lvl === 2 ? '✕' : '!', 13, { fill: c, 'font-weight': 700, stroke: PLAN.halo, 'stroke-width': 3,
      'paint-order': 'stroke', 'pointer-events': 'none' });
  }
}

/** @param {any} root @param {Item} it @param {Item[]} items @param {Room} room @param {number} px cm per screen pixel */
function drawSelection(root, it, items, room, px) {
  const BLUE = PLAN.accent;
  el('polygon', { points: pts(itemPoly(it)), fill: 'none', stroke: BLUE, 'stroke-width': 2, 'pointer-events': 'none' }, root);
  for (const m of groupMembers(it, items)) if (m !== it) el('polygon', { points: pts(itemPoly(m)), fill: 'none', stroke: BLUE,
    'stroke-width': 1.5, 'stroke-dasharray': '2 3', 'pointer-events': 'none' }, root);
  // Far enough from the piece for a finger to take the handle and not the piece
  const hl = it.d / 2 + Math.max(28, (TOUCH_R + 4) * px), [hx, hy] = toWorld(it, 0, -hl), [bx, by] = toWorld(it, 0, -it.d / 2);
  el('line', { x1: bx, y1: by, x2: hx, y2: hy, stroke: BLUE, 'stroke-width': 1.5, 'data-handle': 1 }, root);
  el('circle', { cx: hx, cy: hy, r: TOUCH_R * px, fill: 'transparent', 'data-handle': 'rotate', 'data-touch': 1, cursor: 'crosshair' }, root);
  el('circle', { cx: hx, cy: hy, r: 9, fill: PLAN.floor, stroke: BLUE, 'stroke-width': 2,
    'data-handle': 'rotate', cursor: 'crosshair' }, root);
  if (!inRoom(it, room)) return;
  for (const s of gaps(it, items, room)) {
    const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2, horiz = s.y1 === s.y2;
    const st = { stroke: BLUE, 'stroke-width': 1, 'pointer-events': 'none' };
    el('line', { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, ...st, 'stroke-dasharray': '3 2' }, root);
    for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]])
      el('line', horiz ? { x1: x, y1: y - 5, x2: x, y2: y + 5, ...st } : { x1: x - 5, y1: y, x2: x + 5, y2: y, ...st }, root);
    text(root, mx, my, `${fmt(s.d)}`, 11, { fill: BLUE, 'font-weight': 700, stroke: PLAN.halo, 'stroke-width': 3,
      'paint-order': 'stroke', 'pointer-events': 'none' });
  }
}

/**
 * Draws the whole plan into `svg`. `uid` makes SVG ids unique per plan: several plans share one document,
 * and a reference into a plan inside a closed <details> would not resolve. fs is what the checks found, drawn over the plan;
 * feng puts that in the terms of Feng Shui.
 * @param {any} svg
 * @param {{ room: Room, items: Item[], flag: Map<string, number>, fs?: any, feng?: boolean, selected?: string | null,
 *   uid?: string, px?: number }} scene px is cm per screen pixel
 */
function drawPlan(svg, { room, items, flag, fs = null, feng = false, selected = null, uid = '', px = 1 }) {
  svg.replaceChildren();
  el('rect', { x: -1e4, y: -1e4, width: 2e4, height: 2e4, fill: PLAN.bg }, svg);
  const root = el('g', {}, svg);
  const pb = parkBounds(items, room);
  if (pb) {
    el('rect', { x: pb.x0, y: pb.y0, width: pb.x1 - pb.x0, height: pb.y1 - pb.y0, fill: PLAN.floor, 'fill-opacity': 0.5,
      stroke: PLAN.muted, 'stroke-dasharray': '6 4' }, root);
    text(root, pb.x0 + 8, pb.y0 - 9, 'Parking area (outside the room)', 10, { 'text-anchor': 'start', fill: PLAN.muted });
  }
  drawRoom(root, room);
  const words = PLAN_WORDS[feng ? 'feng' : 'neutral'];
  if (fs) drawFsUnder(root, fs, uid, words);
  const visible = items.filter(i => !i.hidden);
  // Selected piece last, so that it lies on top
  visible.sort((a, b) => Number(a.id === selected) - Number(b.id === selected));
  for (const it of visible) drawItem(root, it, inRoom(it, room) ? flag.get(it.id) : 0);
  if (fs) drawFsOver(root, fs, uid, words);
  const sel = items.find(i => i.id === selected);
  if (sel && !sel.hidden) drawSelection(root, sel, items, room, px);
}

/**
 * Read-only plan for the analysis and compare pages, fitted to the element by its viewBox. Only what stands in the room counts for
 * the fit, so all layouts of a room are drawn at one size, whatever waits in the parking area.
 * @param {any} svg @param {Room} room @param {Item[]} items @param {boolean} withFs @param {string} uid @param {boolean} [feng]
 */
function drawPreview(svg, room, items, withFs, uid, feng = false) {
  svg.setAttribute('font-family', PLAN_FONT);
  drawPlan(svg, { room, items, flag: analyze(items, room).flag, fs: withFs ? fengShui(items, room) : null, feng, uid });
  const b = contentBounds(activeItems(items, room), room);
  svg.setAttribute('viewBox', `${b.x0} ${b.y0} ${b.x1 - b.x0} ${b.y1 - b.y0}`);
}

// ---------- What the checks found, over the plan ----------

const ZONE_COLOR = { rest: PLAN['zone-rest'], live: PLAN['zone-live'], work: PLAN['zone-work'] };
const VIEW_COLOR = { good: PLAN['zone-work'], side: PLAN.warn, back: PLAN.bad, blocked: PLAN.bad };

// The same findings in plain words, and in the terms of Feng Shui when that layer is on
const PLAN_WORDS = {
  neutral: { rest: 'Quiet zone', live: 'Living zone', work: 'Work zone', way: 'Way through the room', doorLine: 'Line of the door',
    centre: 'Open floor', good: 'door in sight', side: 'door at the edge of sight', back: 'door behind you',
    blocked: 'view of the door blocked', inLine: 'lies in line with the door', mirror: 'Mirror faces the bed' },
  feng: { rest: 'Rest (yin)', live: 'Living (yang)', work: 'Work (yang)', way: 'Chi flow', doorLine: 'Door line: chi rushes in',
    centre: 'Open centre', good: 'commanding position', side: 'near the commanding position', back: 'no commanding position',
    blocked: 'no commanding position', inLine: 'takes the chi from the door', mirror: 'Mirror bounces chi at the bed' },
};

const LIGHT_REACH = 430;  // cm, daylight is drawn this far

// The band straight across the room from a door, with its name at the end of the door
/** @param {any} root @param {RoomGeo} g @param {OpeningGeo} o @param {string} name */
function drawDoorLine(root, g, o, name) {
  const far = o.inward[0] ? g.W : g.L;
  const A = aabb([o.a, o.b, ...[o.a, o.b].map(p => [p[0] + o.inward[0] * far, p[1] + o.inward[1] * far])]);
  el('rect', { x: A.x0, y: A.y0, width: A.x1 - A.x0, height: A.y1 - A.y0, fill: PLAN.bad, opacity: 0.06 }, root);
  const x = o.b[0] + o.inward[0] * 6 - o.along[0] * 8, y = o.b[1] + o.inward[1] * 6 - o.along[1] * 8;
  text(root, x, y, name, 9, { 'text-anchor': o.inward[0] > 0 ? 'start' : 'end', fill: PLAN.bad, opacity: 0.8 });
}

// Below the furniture: light, door line, zones
function drawFsUnder(root, fs, uid, words) {
  const { g } = fs;
  const defs = el('defs', {}, root);
  g.lights.forEach((o, i) => {
    const id = `fsLight${uid}_${i}`;
    const grad = el('radialGradient', { id, cx: o.mid[0], cy: o.mid[1], r: LIGHT_REACH, gradientUnits: 'userSpaceOnUse' }, defs);
    el('stop', { offset: 0, 'stop-color': PLAN.sun, 'stop-opacity': 0.42 }, grad);
    el('stop', { offset: 1, 'stop-color': PLAN.sun, 'stop-opacity': 0 }, grad);
    el('rect', { x: 0, y: 0, width: g.W, height: g.L, fill: `url(#${id})` }, root);
  });
  for (const o of fs.doors) drawDoorLine(root, g, o, words.doorLine);
  for (const z of fs.zones) {
    const c = ZONE_COLOR[z.kind];
    el('rect', { x: z.x0, y: z.y0, width: z.x1 - z.x0, height: z.y1 - z.y0, rx: 14, fill: c, 'fill-opacity': 0.1,
      stroke: c, 'stroke-opacity': 0.45, 'stroke-width': 1.5, 'stroke-dasharray': '7 5' }, root);
  }
}

// Above the furniture: path, narrow spot, free centre, view of the door
function drawFsOver(root, fs, uid, words) {
  const g = el('g', { 'pointer-events': 'none' }, root);
  // View and mirror arrows need the arrowhead even when there is no path
  const defs = el('defs', {}, g);
  const m = el('marker', { id: `fsArrow${uid}`, viewBox: '0 0 10 10', refX: 5, refY: 5, markerWidth: 4, markerHeight: 4, orient: 'auto' }, defs);
  el('path', { d: 'M0,0 L10,5 L0,10 z', fill: PLAN.flow }, m);
  for (const z of fs.zones) {
    const c = ZONE_COLOR[z.kind];
    text(g, Math.max(z.x0, 0) + 6, Math.max(z.y0, 0) + 10, words[z.kind], 10, { 'text-anchor': 'start', fill: c, 'font-weight': 700,
      stroke: PLAN.halo, 'stroke-width': 3, 'paint-order': 'stroke' });
  }
  const { circle } = fs;
  el('circle', { cx: circle.x, cy: circle.y, r: circle.r, fill: 'none', stroke: PLAN.flow, 'stroke-width': 1.5,
    'stroke-dasharray': '3 4', opacity: 0.8 }, g);
  text(g, circle.x, circle.y + circle.r - 10, `${words.centre} ⌀ ${fmt(circle.r * 2)} cm`, 10,
    { fill: PLAN.flow, 'font-weight': 700, stroke: PLAN.halo, 'stroke-width': 3, 'paint-order': 'stroke' });
  if (fs.path) {
    const pts = fs.path.filter((_, k) => k % 4 === 0 || k === fs.path.length - 1);
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let k = 1; k < pts.length - 1; k++) {
      const mx = (pts[k].x + pts[k + 1].x) / 2, my = (pts[k].y + pts[k + 1].y) / 2;
      d += ` Q${pts[k].x},${pts[k].y} ${mx},${my}`;
    }
    d += ` L${pts[pts.length - 1].x},${pts[pts.length - 1].y}`;
    el('path', { d, fill: 'none', stroke: PLAN.flow, 'stroke-width': 9, 'stroke-opacity': 0.18, 'stroke-linecap': 'round' }, g);
    el('path', { d, fill: 'none', stroke: PLAN.flow, 'stroke-width': 2.5, 'stroke-dasharray': '10 6',
      'marker-end': `url(#fsArrow${uid})`, 'stroke-linecap': 'round' }, g);
    const entry = fs.g.entry;
    text(g, pts[0].x + entry.inward[0] * 30, pts[0].y + entry.inward[1] * 30 - 14, words.way, 10, { fill: PLAN.flow, 'font-weight': 700, stroke: PLAN.halo, 'stroke-width': 3, 'paint-order': 'stroke' });
    if (fs.narrow) {
      const w = fs.narrow.d * 2, c = w < 70 ? PLAN.bad : w < 90 ? PLAN.warn : PLAN.flow;
      el('circle', { cx: fs.narrow.x, cy: fs.narrow.y, r: 6, fill: PLAN.floor, stroke: c, 'stroke-width': 2.5 }, g);
      text(g, fs.narrow.x, fs.narrow.y - 14, `Narrow spot ~${fmt(w)} cm`, 10, { fill: c, 'font-weight': 700, stroke: PLAN.halo, 'stroke-width': 3, 'paint-order': 'stroke' });
    }
  } else if (fs.g.entry && fs.g.target) {
    text(g, fs.g.W / 2, fs.g.L / 2, `No free way from the door to the ${OPENINGS[fs.g.target.type].place}`, 14, { fill: PLAN.bad, 'font-weight': 700, stroke: PLAN.halo, 'stroke-width': 4, 'paint-order': 'stroke' });
  }
  for (const o of fs.cutOff) {
    text(g, o.mid[0] + o.inward[0] * 30, o.mid[1] + o.inward[1] * 30, `${o.label}: no free way`, 10, { fill: PLAN.bad, 'font-weight': 700, stroke: PLAN.halo, 'stroke-width': 3, 'paint-order': 'stroke' });
  }
  for (const v of fs.views) {
    if (!v.door) continue;
    const c = VIEW_COLOR[v.level], label = words[v.level], [x, y] = v.seat.p;
    el('line', { x1: x, y1: y, x2: v.door[0], y2: v.door[1], stroke: c, 'stroke-width': 1.5, 'stroke-dasharray': v.level === 'good' ? '' : '5 4', opacity: 0.75 }, g);
    el('line', { x1: x, y1: y, x2: x + v.seat.dir[0] * 32, y2: y + v.seat.dir[1] * 32, stroke: c, 'stroke-width': 3, 'marker-end': `url(#fsArrow${uid})` }, g);
    el('circle', { cx: x, cy: y, r: 5, fill: c, stroke: PLAN.halo, 'stroke-width': 1.5 }, g);
    text(g, x, y + 15, `${v.it.name}: ${label}`, 9, { fill: c, 'font-weight': 700, stroke: PLAN.halo, 'stroke-width': 3, 'paint-order': 'stroke' });
  }
  for (const w of fs.mirrors) {
    const [x, y] = toWorld(w, 0, w.d / 2 + 18);
    el('line', { x1: toWorld(w, 0, w.d / 2)[0], y1: toWorld(w, 0, w.d / 2)[1], x2: toWorld(w, 0, w.d / 2 + 60)[0], y2: toWorld(w, 0, w.d / 2 + 60)[1],
      stroke: PLAN.bad, 'stroke-width': 2.5, 'stroke-dasharray': '4 3', 'marker-end': `url(#fsArrow${uid})` }, g);
    text(g, x, y, words.mirror, 10, { fill: PLAN.bad, 'font-weight': 700, stroke: PLAN.halo, 'stroke-width': 3, 'paint-order': 'stroke' });
  }
  for (const { bed: b, door: o } of fs.doorLines) {
    const A = aabb(itemPoly(b)), depth = depthAt(o, [(A.x0 + A.x1) / 2, (A.y0 + A.y1) / 2]);
    const x = o.b[0] + o.along[0] * 12 + o.inward[0] * depth, y = o.b[1] + o.along[1] * 12 + o.inward[1] * depth;
    text(g, x, y, `${b.name} ${words.inLine}`, 10, { fill: PLAN.bad, 'font-weight': 700, stroke: PLAN.halo, 'stroke-width': 3, 'paint-order': 'stroke' });
  }
}

/** A plan as a file of its own: outside this page the tokens mean nothing, so they become the colours in use now.
 * @param {string} svgText @param {Element} [scope] */
function resolveTokens(svgText, scope = document.documentElement) {
  const css = getComputedStyle(scope);
  return svgText.replace(/var\((--[\w-]+)\)/g, (_, name) => css.getPropertyValue(name).trim());
}
