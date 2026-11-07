'use strict';
// The review of a layout: computed scores, rule-based advice, room profiles and the demo rooms.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, plain, ROOM, ROOT, item, PROJECT_SCRIPTS } = require('./load');

const { get } = load(PROJECT_SCRIPTS);
const names = ['DEMO_ROOMS', 'STARTER_PROJECT', 'PROFILES', 'CRIT', 'DEFAULT_W', 'CLASH_CAP', 'MAX_TIPS', 'RULES', 'CHECK_RULES', 'reviewLayout',
  'reviewTotal', 'reviewEntries', 'standardWeights', 'loadWeights', 'fsEstimate', 'fengShui', 'analyze', 'templateProject', 'layoutItems',
  'projectItems', 'validateProject', 'centreGoal', 'emptyProject', 'activeItems', 'roomProblems'];
const g = Object.fromEntries(names.map(n => [n, get(n)]));
const { reviewLayout, reviewTotal, reviewEntries } = g;

const has = (list, re) => list.some(t => re.test(t));
const review = items => reviewLayout(items, ROOM);
// A plain room with a door at the top and a window at the bottom: nothing in it gets in the way of the rules
const PLAIN = { w: 500, l: 600, wall: 20, fixtures: [], openings: [
  { type: 'door', wall: 'top', pos: 380, width: 90, hinge: 'end' }, { type: 'window', wall: 'bottom', pos: 150, width: 200 }] };

// ---------- Rules ----------

const SCENES = [
  ['two pieces overlap', [item('a', 'custom', 150, 150, 80, 80), item('b', 'custom', 170, 170, 80, 80)], { con: /a and b overlap/, tip: /Move a and b apart/ }],
  ['a piece stands in a wall', [item('a', 'custom', 10, 150, 80, 80)], { con: /a reaches into a wall/ }],
  ['a piece stands on a fixture', [item('a', 'custom', 340, 300 - 280, 80, 80)], { con: /fixed part/ }],
  ['a piece stands in a door swing', [item('a', 'custom', 340, 150, 60, 60)], { con: /where a door swings/ }],
  ['a shelf stands alone', [item('a', 'shelf', 200, 250, 80, 30)], { con: /nothing behind it/, tip: /long side/ }],
  ['the bed has no wall behind it', [item('b', 'bed', 200, 250, 140, 200)], { con: /no wall behind the headboard/, tip: /head of b against a wall/ }],
];

test('what the checks find comes back as advice in plain words', () => {
  for (const [title, items, want] of SCENES) {
    const r = review(items);
    assert.ok(has(r.con, want.con), `${title}: ${r.con}`);
    if (want.tip) assert.ok(has(r.tips, want.tip), `${title}: ${r.tips}`);
  }
});

test('every code analyze() reports has words', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/analyze.js'), 'utf8');
  const codes = [...src.matchAll(/\badd(?:\(\d,|Fixed\() ?'([a-z-]+)'/g)].map(m => m[1]);
  assert.equal(codes.length, 11);
  for (const c of codes) assert.equal(typeof g.CHECK_RULES[c], 'function', c);
});

test('a bed: the rules follow the plan', () => {
  const corner = review([item('b', 'bed', 70, 100, 140, 200)]);
  assert.ok(has(corner.pro, /has a wall at its head/), corner.pro.join());
  assert.ok(!has(corner.con, /headboard/));
  const line = reviewLayout([item('b', 'bed', 425, 100, 150, 200, 180)], PLAIN);
  assert.ok(has(line.con, /in line with the door/), line.con.join());
  const back = reviewLayout([item('b', 'bed', 250, 100, 140, 200)], PLAIN);
  assert.ok(has(back.con, /door is behind you/), back.con.join());
});

test('a desk: distance and direction of the light', () => {
  const far = reviewLayout([item('d', 'table', 100, 30, 120, 60)], PLAIN);
  assert.ok(has(far.con, /m from the nearest window/), far.con.join());
  assert.ok(has(far.tips, /closer to a window/));
  const glare = reviewLayout([item('d', 'table', 250, 500, 120, 60, 180)], PLAIN);
  assert.ok(has(glare.con, /look straight into the window/), glare.con.join());
  const side = reviewLayout([item('d', 'table', 30, 480, 120, 60, 90)], PLAIN);
  assert.ok(has(side.pro, /daylight from the side/), side.pro.join());
});

test('a table nobody can sit at', () => {
  const items = [item('t', 'table', 30, 30, 60, 60), item('x', 'custom', 45, 110, 90, 100), item('y', 'custom', 120, 30, 90, 60)];
  const r = reviewLayout(items, PLAIN);
  assert.equal(r.score.desk, 1);
  assert.ok(has(r.con, /No table has a free seat/), r.con.join());
  assert.ok(has(r.tips, /60 cm free/), r.tips.join());
});

test('a sofa: window and screen', () => {
  const far = [item('s', 'sofa', 250, 45, 180, 90), item('v', 'television', 70, 15, 120, 25)];
  const r = reviewLayout(far, PLAIN);
  assert.ok(has(r.con, /m from the window/), r.con.join());
  assert.ok(has(r.con, /does not face the screen/), r.con.join());
  const good = reviewLayout([item('s', 'sofa', 250, 540, 180, 90, 180), item('v', 'television', 250, 15, 120, 25)], PLAIN);
  assert.ok(has(good.pro, /sits at the window/) && has(good.pro, /faces the screen/), good.pro.join());
});

test('the way through the room', () => {
  const closed = reviewLayout([item('w', 'custom', 250, 300, 500, 60)], PLAIN);
  assert.ok(has(closed.con, /no free way/), closed.con.join());
  const narrow = reviewLayout([item('w', 'custom', 215, 300, 430, 60)], PLAIN);
  assert.ok(has(narrow.con, /narrows to \d+ cm/), narrow.con.join());
  assert.ok(has(narrow.tips, /stays 90 cm wide/));
  const open = reviewLayout([item('a', 'custom', 40, 40, 80, 80)], PLAIN);
  assert.ok(has(open.pro, /way across the room is \d+ cm wide/), open.pro.join());
});

test('a door that cannot be reached is named', () => {
  const room = { ...PLAIN, openings: [...PLAIN.openings, { type: 'door', wall: 'left', pos: 100, width: 90, hinge: 'start' }] };
  const r = reviewLayout([item('w', 'custom', 60, 145, 120, 500)], room);
  assert.ok(has(r.con, /Door 2 cannot be reached/), r.con.join());
});

test('tips: first what cannot be built, then the worst criterion, and only a few', () => {
  const items = [item('b', 'bed', 200, 250, 140, 200), item('c', 'custom', 220, 260, 80, 80), item('d', 'shelf', 330, 330, 80, 30)];
  const r = review(items);
  assert.match(r.tips[0], /apart/);
  assert.equal(r.tips.length, g.MAX_TIPS);
  assert.ok(r.con.length > r.tips.length, 'con lists everything');
  assert.equal(new Set(r.con).size, r.con.length);
});

test('no furniture, no judgement', () => {
  const r = review([]);
  assert.deepEqual(plain(r.pro), []);
  assert.deepEqual(plain(r.con), []);
  assert.match(r.tips[0], /Place furniture/);
  assert.equal(reviewTotal(r, g.DEFAULT_W), null);
});

test('the review uses the same scores as the planner estimate', () => {
  const items = [item('b', 'bed', 70, 400, 140, 200), item('d', 'table', 30, 200, 120, 60, 90)];
  assert.deepEqual(plain(review(items).score), plain(g.fsEstimate(g.fengShui(items, ROOM), items, ROOM).score));
  assert.deepEqual(Object.keys(g.fsEstimate(g.fengShui(items, ROOM), items, ROOM)).sort(), ['score', 'why'], 'the baseline holds these two');
});

test('a layout that cannot be built never scores high', () => {
  const fine = [item('b', 'bed', 70, 400, 140, 200)], clash = [...fine, item('c', 'custom', 80, 410, 60, 60)];
  assert.equal(review(fine).clashes, 0);
  assert.equal(review(clash).clashes, 1);
  assert.ok(reviewTotal(review(fine), g.DEFAULT_W) > g.CLASH_CAP);
  assert.equal(reviewTotal(review(clash), g.DEFAULT_W), g.CLASH_CAP);
});

test('rules hold up in random rooms: no broken text, no crash', () => {
  let seed = 42;
  const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 * n; };
  const kinds = ['bed', 'sofa', 'table', 'tv', 'television', 'wardrobe', 'shelf', 'custom'];
  for (let n = 0; n < 150; n++) {
    const w = 200 + rnd(500) | 0, l = 200 + rnd(500) | 0;
    const room = { w, l, wall: 10, fixtures: [], openings: [
      ...(rnd(4) < 3 ? [{ type: 'door', wall: 'top', pos: 10, width: 80, hinge: 'start' }] : []),
      ...(rnd(4) < 3 ? [{ type: rnd(2) < 1 ? 'window' : 'balcony', wall: 'bottom', pos: 20, width: 120, hinge: 'both' }] : []),
      ...(rnd(4) < 1 ? [{ type: 'door', wall: 'left', pos: 100, width: 80, hinge: 'end' }] : [])] };
    const items = Array.from({ length: rnd(8) | 0 }, (_, i) => item(`i${i}`, kinds[rnd(kinds.length) | 0], rnd(w), rnd(l), 40 + rnd(160), 40 + rnd(160),
      [0, 90, 180, 270, 37][rnd(5) | 0], rnd(5) < 1 ? { image: 200 } : {}));
    const r = reviewLayout(items, room);
    for (const t of [...r.pro, ...r.con, ...r.tips]) assert.ok(t && !/undefined|NaN|null/.test(t), t);
    const v = reviewTotal(r, g.DEFAULT_W);
    assert.ok(v === null || (v >= 0 && v <= 100), String(v));
  }
});

// ---------- Free centre ----------

test('the free centre is asked of a room according to its size', () => {
  assert.equal(g.centreGoal({ W: 500, L: 600 }), 170);
  assert.equal(g.centreGoal({ W: 340, L: 900 }), 170);
  assert.equal(g.centreGoal({ W: 300, L: 300 }), 150);
  const small = { w: 280, l: 300, wall: 10, fixtures: [], openings: [
    { type: 'door', wall: 'top', pos: 10, width: 80, hinge: 'start', swing: 'out' }, { type: 'window', wall: 'bottom', pos: 100, width: 120 }] };
  // The same 145 cm of free floor: all this room can ask for, but too little for a larger one
  const items = [item('a', 'custom', 212.5, 150, 135, 300)];
  const r = reviewLayout(items, small);
  assert.ok(has(r.pro, /Open floor of 14\d cm/), r.pro.join());
  assert.ok(!has(r.con, /open floor is only/), r.con.join());
  const large = { ...small, w: 500, l: 500 };
  const crowded = [item('a', 'custom', 322.5, 250, 355, 500)];
  assert.ok(has(reviewLayout(crowded, large).con, /open floor is only 14\d cm/));
});

// ---------- Profiles ----------

test('profiles cover every criterion with a weight of 0 to 3', () => {
  for (const [k, p] of Object.entries(g.PROFILES)) {
    assert.ok(p.label, k);
    for (const [c] of g.CRIT) assert.ok(Number.isInteger(p.weights[c]) && p.weights[c] >= 0 && p.weights[c] <= 3, `${k}.${c}`);
  }
  for (const k of ['homeoffice', 'sleep', 'living', 'studio']) assert.ok(g.PROFILES[k], k);
});

test('Standard goes back to the profile, else to what the file brought, else to neutral', () => {
  const brought = { bed: 0, desk: 1, sofa: 3, flow: 3, zones: 0 };
  assert.deepEqual(plain(g.standardWeights({})), plain(g.DEFAULT_W));
  assert.deepEqual(plain(g.standardWeights({ baseWeights: brought })), brought);
  assert.deepEqual(plain(g.standardWeights({ profile: 'sleep', baseWeights: brought })), plain(g.PROFILES.sleep.weights));
  assert.deepEqual(plain(g.loadWeights({ profile: 'sleep' })), plain(g.PROFILES.sleep.weights));
  assert.equal(g.loadWeights({ profile: 'sleep', weights: { bed: 0 } }).bed, 0, 'a change of your own stays');
});

test('the profile changes which layout comes first', () => {
  const p = { ...g.templateProject(g.DEMO_ROOMS[0], 'S') };
  const entries = reviewEntries(p);
  const best = key => [...entries].sort((a, b) => reviewTotal(b.review, g.PROFILES[key].weights) - reviewTotal(a.review, g.PROFILES[key].weights))[0];
  const all = Object.keys(g.PROFILES).map(k => reviewTotal(best(k).review, g.PROFILES[k].weights));
  assert.ok(new Set(all).size > 1, 'totals differ per profile');
});

// ---------- Entries of the analysis and compare pages ----------

test('every layout is reviewed, saved ones of your own too', () => {
  const p = g.templateProject(g.DEMO_ROOMS[1], 'R');
  p.layouts = [...p.layouts, { name: 'Mine', place: { bed: [60, 100, 0] }, savedAt: 5 }];
  const list = reviewEntries(p), mine = list.find(e => e.name === 'Mine');
  assert.equal(list.length, p.layouts.length, 'the working arrangement is the first layout');
  assert.equal(list.find(e => e.name === g.DEMO_ROOMS[1].layouts[0].name).working, false);
  assert.equal(mine.idea.length, 0);
  assert.ok(mine.review.score.bed >= 1);
});

test('an unsaved arrangement is listed first, once', () => {
  const p = g.templateProject(g.DEMO_ROOMS[1], 'R');
  p.current = { ...p.current, place: { ...p.current.place, chair: [200, 200, 0] } };
  const [first] = reviewEntries(p);
  assert.equal(first.working, true);
  assert.match(first.name, /\(edited\)$/);
  delete p.current.name;
  assert.equal(reviewEntries(p)[0].name, 'Current arrangement');
  assert.equal(new Set(reviewEntries(p).map(e => e.name)).size, reviewEntries(p).length);
});

test('a project without any layout is not empty as soon as something stands in the room', () => {
  const blank = g.emptyProject('B', { w: 400, l: 400, wall: 10 });
  assert.equal(reviewEntries(blank).length, 0);
  blank.furniture = [{ id: 'a', name: 'A', kind: 'bed', w: 100, d: 200, color: '#888888' }];
  assert.equal(reviewEntries(blank).length, 0, 'still parked');
  blank.current = { place: { a: [50, 100, 0] } };
  const list = reviewEntries(blank);
  assert.equal(list.length, 1);
  assert.equal(list[0].working, true);
});

test('scores follow the room: a change of the room changes the review', () => {
  const p = g.templateProject(g.DEMO_ROOMS[1], 'R');
  const before = reviewEntries(p)[0].review.score;
  const after = reviewEntries({ ...p, room: { ...p.room, openings: p.room.openings.filter(o => o.type !== 'window') } })[0].review.score;
  assert.notDeepEqual(plain(before), plain(after));
});

test('notes of a file stay apart from the computed review', () => {
  const p = g.validateProject({ ...g.templateProject(g.DEMO_ROOMS[1], 'R') });
  p.layouts[0].review = { pro: ['own'], con: [], tip: 'mine', now: true };
  const e = reviewEntries(p).find(x => x.name === p.layouts[0].name);
  assert.equal(e.now, true);
  assert.deepEqual(plain(e.notes.pro), ['own']);
  assert.ok(!e.review.pro.includes('own'));
});

// ---------- Demo rooms ----------

test('ten to twelve library rooms with two to four layouts, each with an idea', () => {
  assert.ok(g.DEMO_ROOMS.length >= 10 && g.DEMO_ROOMS.length <= 12, `${g.DEMO_ROOMS.length} rooms`);
  const profiles = new Set();
  for (const t of g.DEMO_ROOMS) {
    const p = g.templateProject(t, t.name);
    assert.ok(t.layouts.length >= 2 && t.layouts.length <= 4, t.name);
    const area = p.room.w * p.room.l / 1e4 - p.room.fixtures.filter(f => f.type === 'block').reduce((a, f) => a + f.w * f.d / 1e4, 0);
    assert.ok(Math.abs(area - parseFloat(t.hint)) < 0.5, `${t.name}: ${area} m²`);
    assert.equal(g.roomProblems(p.room).length, 0, t.name);
    assert.ok(g.PROFILES[t.profile], t.name);
    profiles.add(t.profile);
    for (const l of p.layouts) assert.ok(l.idea?.length && l.idea.every(s => s.length > 10 && s.length < 100), l.name);
  }
  assert.equal(profiles.size, 5, 'each room stands for another use');
});

test('demo layouts can be built, and all their pieces stand in the room', () => {
  for (const t of g.DEMO_ROOMS) {
    const p = g.templateProject(t, t.name);
    for (const l of p.layouts) {
      const items = g.layoutItems(p, l), r = reviewLayout(items, p.room);
      assert.equal(r.clashes, 0, `${t.name} / ${l.name}: ${r.con}`);
      assert.equal(g.activeItems(items, p.room).length, Object.keys(l.place).length, `${t.name} / ${l.name}`);
      assert.ok(reviewTotal(r, g.standardWeights(p)) > g.CLASH_CAP);
    }
    assert.ok(new Set(p.layouts.map(l => JSON.stringify(reviewLayout(g.layoutItems(p, l), p.room).score))).size > 1, `${t.name} shows a real choice`);
  }
});

test('the demo rooms have no scores or advice written by hand', () => {
  const src = fs.readFileSync(path.join(ROOT, 'demo/rooms.js'), 'utf8');
  assert.ok(!/\b(score|review|pro|con|tip)\s*:/.test(src));
  for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter(n => n !== 'project.js'))
    assert.ok(!/\bSETUPS\b/.test(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')), `${f} still knows hand scores`);
});

test('a new project opens furnished, so analysis and compare have something to show', () => {
  const p = g.validateProject(g.templateProject(g.STARTER_PROJECT, 'Starter room'));
  assert.equal(p.current.name, g.DEMO_ROOMS[0].layouts[0].name);
  assert.equal(p.profile, g.DEMO_ROOMS[0].profile);
  assert.ok(g.activeItems(g.projectItems(p), p.room).length > 0);
  assert.ok(reviewEntries(p).length >= 3);
});
