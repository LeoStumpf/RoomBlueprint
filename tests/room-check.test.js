'use strict';
// Phase 7: a neutral Room Check, Feng Shui as a layer of its own, and every word of the interface in English.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, plain, ROOT, item, PROJECT_SCRIPTS } = require('./load');

const { get } = load([...PROJECT_SCRIPTS, 'js/render.js']);
const names = ['DEMO_ROOMS', 'CRIT', 'DEFAULT_W', 'PLAN_WORDS', 'reviewLayout', 'reviewTotal', 'fengShui', 'fsEstimate', 'analyze', 'validateProject',
  'parseProjectFile', 'layoutItems', 'loadWeights', 'dateText', 'drawFsOver', 'drawFsUnder', 'windowGoal', 'roomGeo'];
const g = Object.fromEntries(names.map(n => [n, get(n)]));
const estimate = (items, room) => g.fsEstimate(g.fengShui(items, room), items, room);
const has = (list, re) => list.some(t => re.test(t));

const door = (wall, pos, extra = {}) => ({ type: 'door', wall, pos, width: 90, hinge: 'start', ...extra });
const windowOn = (wall, pos, width = 120) => ({ type: 'window', wall, pos, width });
const room = (openings, fixtures = [], size = {}) => ({ w: 500, l: 600, wall: 20, openings, fixtures, ...size });
const demos = () => g.DEMO_ROOMS.map(d => g.validateProject({ ...d }));
const reviews = () => demos().flatMap(p => p.layouts.map(l => ({ p, l, r: g.reviewLayout(g.layoutItems(p, l), p.room) })));

// ---------- Project format ----------

test('weights with the old German keys arrive under the new ones', () => {
  const p = demos()[0];
  const file = { app: 'room-blueprint', version: 2, name: 'x', room: p.room, furniture: [], layouts: [], weights: { bett: 3, tisch: 0, sofa: 1, fluss: 2, zonen: 1 } };
  const { project } = g.parseProjectFile(file);
  assert.deepEqual(plain(project.weights), { bed: 3, desk: 0, sofa: 1, flow: 2, zones: 1 });
  assert.deepEqual(plain(project.baseWeights), { bed: 3, desk: 0, sofa: 1, flow: 2, zones: 1 });
  assert.deepEqual(plain(g.parseProjectFile({ ...file, weights: { bett: 3, bed: 1 } }).project.weights), { bed: 1 }, 'the new key wins');
  assert.throws(() => g.parseProjectFile({ ...file, weights: { bett: 9 } }), /weights\.bed/);
  assert.equal(g.loadWeights(project).bett, undefined);
});

// ---------- Doors ----------

test('a bed in line with a second door is reported, and the plan names that door', () => {
  const r = room([door('top', 40), door('bottom', 200), windowOn('left', 300)]);
  const bed = item('b', 'bed', 245, 400, 140, 200, 180), fsr = g.fengShui([bed], r);
  assert.equal(fsr.doorLines.length, 1);
  assert.equal(fsr.doorLines[0].door.label, 'Door 2');
  assert.match(estimate([bed], r).why.bed, /in line with the door/);
});

test('a balcony door has no door line unless it is the entrance', () => {
  const bed = item('b', 'bed', 245, 400, 140, 200, 180);
  const balcony = { type: 'balcony', wall: 'bottom', pos: 200, width: 90, hinge: 'start' };
  assert.equal(g.fengShui([bed], room([door('top', 40), balcony])).doorLines.length, 0);
  assert.equal(g.fengShui([bed], room([door('top', 40), { ...balcony, main: true }])).doorLines.length, 1);
});

test('the main entrance decides the view from a bed, not the door seen worst', () => {
  const bed = item('b', 'bed', 250, 110, 140, 200);    // head at the top wall, looking down the room
  const front = room([door('bottom', 200), windowOn('left', 300)]);
  const both = main => room([door('bottom', 200, main === 0 ? { main: true } : {}), door('top', 60, main === 1 ? { main: true } : {}),
    windowOn('left', 300)]);
  assert.equal(g.fengShui([bed], front).views[0].level, 'good');
  assert.equal(g.fengShui([bed], both(0)).views[0].level, 'good', 'a second door behind the head does not count');
  assert.equal(g.fengShui([bed], both(1)).views[0].level, 'back', 'unless it is the main entrance');
  assert.equal(g.fengShui([bed], both(-1)).views[0].level, 'good', 'unmarked, the first door is the entrance');
});

// ---------- What stands in a view ----------

const screenRoom = fixtures => room([door('right', 60), windowOn('top', 100)], fixtures);
const sofa = item('sofa', 'sofa', 250, 120, 170, 85), set = item('tv', 'television', 250, 570, 100, 40, 180);

test('a column between the sofa and the TV counts like tall furniture', () => {
  const free = screenRoom([]), blocked = screenRoom([{ type: 'column', x: 235, y: 300, w: 30, d: 30 }]);
  assert.deepEqual(plain(g.analyze([sofa, set], free).issues), []);
  assert.ok(has(g.analyze([sofa, set], blocked).issues.map(i => i.text), /the column blocks the view from sofa to tv/));
  const r = g.reviewLayout([sofa, set], blocked);
  assert.ok(has(r.con, /^The column stands between the seats and the TV/), r.con.join());
  assert.ok(has(r.tips, /Move tv or the seats/), r.tips.join());
  assert.equal(estimate([sofa, set], blocked).score.sofa, estimate([sofa, set], free).score.sofa - 1);
});

test('a radiator or a chimney is no obstacle to the view', () => {
  const low = screenRoom([{ type: 'radiator', x: 235, y: 300, w: 30, d: 30 }, { type: 'chimney', x: 200, y: 330, w: 30, d: 30 }]);
  assert.deepEqual(plain(g.analyze([sofa, set], low).issues), []);
});

test('a wall block in front of a projected picture covers it, one behind it is the wall', () => {
  const tv = item('tv', 'tv', 250, 500, 120, 40, 180, { image: 200 });
  const front = room([door('right', 60), windowOn('top', 100)], [{ type: 'block', x: 230, y: 460, w: 40, d: 10 }]);
  const texts = rm => g.analyze([tv], rm).issues.map(i => i.text);
  assert.ok(has(texts(front), /the wall block covers 40 cm of the projected picture/), texts(front).join());
  assert.ok(has(g.reviewLayout([tv], front).con, /^The wall block covers part/));
  const behind = room([door('right', 60), windowOn('top', 100)], [{ type: 'block', x: 100, y: 520, w: 300, d: 80 }]);
  assert.deepEqual(plain(texts(behind)), []);
});

// ---------- Scores ----------

test('a double bed with its head at a wall loses nothing for standing free, a narrow one does', () => {
  const r = room([door('bottom', 200), windowOn('left', 300)]);
  const of = w => item('b', 'bed', 250, 110, w, 200);
  assert.equal(estimate([of(160)], r).score.bed, 4);
  assert.equal(estimate([of(90)], r).score.bed, 2);
  assert.ok(!has(g.reviewLayout([of(160)], r).con, /stands out/));
  assert.ok(has(g.reviewLayout([of(90)], r).con, /stands out/));
});

test('in a short room a bed as far back as it goes is in the quiet part', () => {
  const r = room([door('right', 30), windowOn('bottom', 150)], [], { l: 400 });
  const back = item('b', 'bed', 150, 100, 140, 200), forward = { ...back, y: 160 };
  assert.match(estimate([back], r).why.zones, /bed in the quiet part/);
  assert.match(estimate([forward], r).why.zones, /bed in the middle/);
});

test('with several sofas the words name the sofa they are true for', () => {
  const r = room([door('right', 60), windowOn('top', 100)]);
  const far = item('far', 'sofa', 250, 400, 170, 85), near = item('near', 'sofa', 100, 60, 170, 85, 180);
  const tv = item('tv', 'television', 250, 570, 100, 40, 180);
  // near is at the window with its back to the screen, far faces the screen, in either order of the list
  for (const list of [[far, near, tv], [near, far, tv]]) {
    const rr = g.reviewLayout(list, r);
    assert.ok(has(rr.pro, /^near sits at the window/), rr.pro.join());
    assert.ok(has(rr.pro, /^far faces the screen/), rr.pro.join());
  }
  const away = g.reviewLayout([{ ...far, rot: 180 }, near, tv], r);
  assert.ok(has(away.con, /^No seat faces the screen/), away.con.join());
});

test('points in favour come from every criterion, zones too', () => {
  const r = reviews().find(x => x.r.pro.length === 5 && x.r.score.bed !== null).r;
  assert.ok(has(r.pro, /quiet part/), r.pro.join());
});

test('the total tells good layouts apart, the 1 to 5 scores stay whole', () => {
  const all = reviews();
  for (const { p, r } of all) {
    const v = g.reviewTotal(r, g.loadWeights(p));
    assert.ok(v < 100, `no layout is perfect: ${v}`);
    for (const [k] of g.CRIT) if (r.score[k] !== null) assert.ok(Number.isInteger(r.score[k]) && r.fine[k] >= 1 && r.fine[k] <= 5, k);
  }
  const totals = all.map(({ p, r }) => `${p.name} ${g.reviewTotal(r, g.loadWeights(p)).toFixed(2)}`);
  assert.equal(new Set(totals).size, totals.length, totals.join());
});

// ---------- Feng Shui layer ----------

const FENG_WORDS = /\b(chi|yin|yang|feng|shui|commanding)\b/i;

test('the neutral review uses no Feng Shui terms, the layer does', () => {
  const all = reviews();
  for (const { r } of all) {
    const neutral = [...r.pro, ...r.con, ...r.tips, ...Object.values(r.why)];
    assert.ok(!has(neutral, FENG_WORDS), neutral.join(' | '));
    assert.ok(r.feng.length > 0);
    for (const f of r.feng) assert.ok(FENG_WORDS.test(`${f.term} ${f.text}`), f.text);
  }
  for (const [k, l] of g.CRIT) assert.doesNotMatch(l, FENG_WORDS, k);
  assert.doesNotMatch(Object.values(g.PLAN_WORDS.neutral).join(' '), FENG_WORDS);
  assert.match(Object.values(g.PLAN_WORDS.feng).join(' '), /chi/i);
  assert.match(Object.values(g.PLAN_WORDS.feng).join(' '), /yin/);
  assert.match(Object.values(g.PLAN_WORDS.feng).join(' '), /commanding position/);
  assert.deepEqual(Object.keys(g.PLAN_WORDS.feng), Object.keys(g.PLAN_WORDS.neutral));
});

test('the reading follows the plan', () => {
  const r = room([door('bottom', 200), windowOn('left', 300)]);
  const good = g.reviewLayout([item('b', 'bed', 250, 110, 160, 200)], r);
  assert.ok(good.feng.some(f => f.term === 'Commanding position' && f.good), JSON.stringify(good.feng));
  const line = g.reviewLayout([item('b', 'bed', 245, 490, 150, 200, 180)], r);
  assert.ok(line.feng.some(f => /rushes straight at b/.test(f.text) && !f.good), JSON.stringify(line.feng));
  assert.deepEqual(plain(g.reviewLayout([], r).feng), []);
});

// A document just big enough for the drawing code, which only appends elements and sets attributes
function fakeSvg() {
  const node = tag => ({ tag, attrs: {}, children: [], textContent: '', setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(c) { this.children.push(c); return c; } });
  const ctx = load([...PROJECT_SCRIPTS, 'js/render.js'], { document: { createElementNS: (_, tag) => node(tag) } });
  const walk = (n, out = []) => { out.push(n); n.children.forEach(c => walk(c, out)); return out; };
  return { ctx, root: node('g'), walk };
}

function overlay(items, r, feng) {
  const { ctx, root, walk } = fakeSvg(), found = ctx.get('fengShui')(items, r), words = ctx.get('PLAN_WORDS')[feng ? 'feng' : 'neutral'];
  ctx.get('drawFsUnder')(root, found, 'u', words);
  ctx.get('drawFsOver')(root, found, 'u', words);
  const nodes = walk(root);
  return { nodes, texts: nodes.filter(n => n.tag === 'text').map(n => n.textContent) };
}

const roomWithWay = room([door('top', 380), windowOn('bottom', 150)]);
const twoSeats = [item('b', 'bed', 75, 110, 150, 200), item('d', 'table', 300, 550, 120, 60)];

test('the plan says the same in plain words or in the terms of Feng Shui', () => {
  const plainWords = overlay(twoSeats, roomWithWay, false).texts, fengWords = overlay(twoSeats, roomWithWay, true).texts;
  assert.ok(has(plainWords, /^Way through the room$/) && has(plainWords, /^Quiet zone$/), plainWords.join());
  assert.ok(!has(plainWords, FENG_WORDS), plainWords.join());
  assert.ok(has(fengWords, /^Chi flow$/) && has(fengWords, /yin/), fengWords.join());
  assert.equal(plainWords.length, fengWords.length, 'the same findings');
});

test('arrow heads exist even without a free way', () => {
  const blocked = room([door('top', 200), windowOn('bottom', 150)]);
  const wall = item('w', 'custom', 250, 300, 500, 60);
  const { nodes, texts } = overlay([wall, item('b', 'bed', 75, 110, 150, 200)], blocked, false);
  assert.ok(has(texts, /No free way from the door to the window/), texts.join());
  const markers = nodes.filter(n => n.tag === 'marker');
  assert.deepEqual(markers.map(n => n.attrs.id), ['fsArrowu']);
  assert.equal(markers[0].children[0]?.tag, 'path', 'the arrow head has a shape');
  const used = nodes.filter(n => n.attrs['marker-end']).map(n => n.attrs['marker-end']);
  assert.ok(used.length > 0 && used.every(u => u === 'url(#fsArrowu)'));
});

// ---------- The way to a window ----------

test('a window reached only through a long slot reports that slot: the way is real, and it is narrow', () => {
  // A long block leaves a 30 cm slot along the right wall, and everything in front of it is too far from the window
  const r = room([door('top', 40), windowOn('bottom', 350)]);
  const block = item('x', 'custom', 235, 430, 470, 340);
  const { why, score } = estimate([block], r);
  assert.match(why.flow, /narrowest point ~[23]\d cm/);
  assert.ok(score.flow > 1 && score.flow <= 3, why.flow);
});

// ---------- Turning the plan ----------

test('window rooms of any size give the same cells when mirrored', () => {
  const base = { w: 437, l: 512, wall: 20, fixtures: [], openings: [door('top', 100), windowOn('bottom', 200)] };
  const mirrored = { ...base, openings: [door('top', 437 - 190), windowOn('bottom', 437 - 320)] };
  const bed = item('b', 'bed', 90, 120, 140, 200), mirror = { ...bed, x: 437 - 90 };
  const at = (items, r) => g.fengShui(items, r).circle.r;
  assert.equal(at([bed], base), at([mirror], mirrored));
});

// ---------- Language ----------

const pageFiles = ['index.html', 'room-check.html', 'compare.html'];
const scriptFiles = fs.readdirSync(path.join(ROOT, 'js')).map(f => `js/${f}`);
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
// Comments are for Phase 10, this is about what a person sees
const withoutComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[\s;{(,])\/\/.*$/gm, '$1');
const GERMAN = /[äöüßÄÖÜ]|\b(und|oder|nicht|kein|keine|Tür|Zimmer|Fenster|Möbel|Wand|Bett|Schreibtisch|Drucken|Vergleich|Anordnung|Wertung|Gewichtung)\b/;

test('no German in pages or scripts', () => {
  for (const f of pageFiles) assert.doesNotMatch(read(f), GERMAN, f);
  for (const f of scriptFiles) {
    // Ids of furniture may still come from names with umlauts
    const src = withoutComments(read(f)).replace('[^a-z0-9äöüß]', '');
    assert.doesNotMatch(src, GERMAN, f);
  }
});

test('no text a check produces is German', () => {
  for (const { p, l, r } of reviews()) {
    const items = g.layoutItems(p, l), texts = [...Object.values(r.why), ...r.pro, ...r.con, ...r.tips, ...r.feng.map(f => f.text),
      ...g.analyze(items, p.room).issues.map(i => i.text)];
    assert.ok(!has(texts, GERMAN), texts.join(' | '));
  }
});

test('pages are English by name and by language', () => {
  for (const f of pageFiles) assert.match(read(f), /<html lang="en">/, f);
  for (const f of [...pageFiles, ...scriptFiles, 'serve.py']) {
    assert.doesNotMatch(read(f), /de-DE|vergleich\.html|feng-shui\.html|[?]druck|localeCompare\([^)]*'de'/, f);
    assert.ok(!fs.existsSync(path.join(ROOT, 'vergleich.html')) && !fs.existsSync(path.join(ROOT, 'feng-shui.html')));
  }
});

test('a date reads the same in every browser', () => {
  assert.equal(g.dateText(Date.UTC(2026, 10, 7, 12)), '7 Nov 2026');
});
