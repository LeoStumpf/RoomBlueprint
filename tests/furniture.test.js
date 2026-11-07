'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, plain, ROOT, ROOM, item, PROJECT_SCRIPTS } = require('./load');

const { get } = load(PROJECT_SCRIPTS);
const names = ['CATALOG', 'KIND_H', 'KIND_LABELS', 'KIND_HINTS', 'analyze', 'fengShui', 'fsEstimate', 'validateProject', 'cleanFurniture',
  'itemPoly', 'itemParts', 'partsOverlap', 'partsOpening', 'aabb', 'gaps', 'snapItem', 'clearance', 'itemHeight', 'editItem', 'setItemKind',
  'setItemShape', 'templateOf', 'joinGroup', 'ungroup', 'pruneGroups', 'groupMembers', 'parkItems', 'park', 'transferLayout',
  'exportProject', 'parseProjectFile', 'sameShape', 'tvSight', 'roomGeo', 'legOf', 'shapesFor', 'presetItems', 'catalogDef',
  'catalogList', 'parseSearch', 'searchFurniture', 'customPiece'];
const g = Object.fromEntries(names.map(n => [n, get(n)]));

const def = (id, extra = {}) => ({ id, name: id, kind: 'custom', w: 40, d: 40, color: '#888888', ...extra });
const project = (furniture, over = {}) => ({ name: 'Test', room: ROOM, furniture, layouts: [], ...over });
const stored = it => { const { x, y, rot, hidden, ...d } = it; return d; };
const valid = it => g.validateProject(project([stored(it)])).furniture[0];
const levels = r => plain(r.issues.map(i => i.lvl));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} is not ${b}`);
const open = { w: 600, l: 600, wall: 20, openings: [], fixtures: [] };

// ---------- Catalog ----------

const entries = () => g.CATALOG.flatMap(c => c.items.map(e => ({ ...g.catalogDef(e), category: c.name, color: c.color })));

test('the catalog has categories, and every entry can be stored in a project', () => {
  assert.ok(g.CATALOG.length >= 5);
  for (const c of g.CATALOG) assert.ok(c.items.length >= 3, c.name);
  for (const { category, ...e } of entries()) {
    assert.deepEqual(plain(g.cleanFurniture({ ...e, id: 'x' }, e.name)), plain({ ...e, id: 'x' }), e.name);
  }
  // All of it at once, as one project: every entry passes the validation of a stored project
  const all = entries().map(({ category, ...e }, i) => ({ ...e, id: `f${i}` }));
  assert.equal(g.validateProject(project(all)).furniture.length, all.length);
});

test('the catalog is a library: about 100 to 150 pieces, with the rooms people furnish', () => {
  const n = entries().length;
  assert.ok(n >= 100 && n <= 150, `${n} entries`);
  const groups = g.CATALOG.map(c => c.name.toLowerCase()).join(' | ');
  for (const room of ['kitchen', 'dining', 'bathroom', 'hallway', 'kids', 'office', 'balcony', 'bed', 'sofa', 'tv'])
    assert.match(groups, new RegExp(room), room);
  assert.equal(new Set(g.CATALOG.map(c => c.color)).size, g.CATALOG.length, 'every group has its own colour');
});

test('the catalog has no duplicates: no name twice, no entry that copies another under a new name', () => {
  const all = entries(), plainName = n => n.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  assert.equal(new Set(all.map(e => plainName(e.name))).size, all.length);
  // A cooker and a dishwasher may share a size; a copy would also share the words it is found by
  const words = g.CATALOG.flatMap(c => c.items.map(e => e.also ?? ''));
  const same = all.map(({ name, category, color, ...rest }, i) => JSON.stringify([rest, words[i]]));
  const twice = same.filter((k, i) => same.indexOf(k) !== i);
  assert.deepEqual(plain(twice.map(k => all[same.lastIndexOf(k)].name)), []);
  for (const c of g.CATALOG) for (const e of c.items) assert.ok(e.also === undefined || typeof e.also === 'string', e.name);
});

test('no default carries a projector: a TV comes first', () => {
  for (const e of entries()) assert.ok(e.beamer === undefined && e.image === undefined, e.name);
  const screens = g.CATALOG.find(c => c.items.some(e => e.kind === 'television'));
  assert.equal(screens.items[0].kind, 'television', 'the first screen is a TV set');
  assert.equal(g.searchFurniture('tv', g.catalogList())[0].e.kind, 'television');
  const src = ['js/catalog.js', 'demo/rooms.js', 'js/workspace.js', 'js/start.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  assert.doesNotMatch(src, /beamer:|image:|projector/i);
});

test('catalog names are unique, sizes are plausible and every kind can be found', () => {
  const all = entries();
  assert.equal(new Set(all.map(e => e.name)).size, all.length);
  for (const e of all) {
    assert.ok(e.w >= 25 && e.w <= 300 && e.d >= 25 && e.d <= 250, e.name);
    assert.ok((e.h ?? g.KIND_H[e.kind]) <= 230, e.name);
  }
  assert.deepEqual([...new Set(all.map(e => e.kind))].sort(), Object.keys(g.KIND_H).sort());
});

test('the catalog is generic: no brand or product line', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/catalog.js'), 'utf8');
  const brands = /\b(ikea|billy|kallax|malm|pax|hemnes|besta|bestå|ektorp|kivik|friheten|lack|poäng|poang|expedit|ivar|muji|hay|vitra|samsung|lg|sony|philips|bosch|miele|siemens|epson|benq|smeg|liebherr|duravit|villeroy|grohe|hansgrohe|stressless|tempur|herman|steelcase|weber|peloton|yamaha|steinway|bang|bose|sonos|panasonic)\b/i;
  assert.doesNotMatch(src, brands);
  assert.ok(entries().some(e => e.shape === 'round') && entries().some(e => e.shape === 'L'));
});

test('a table that is no workplace stays out of the desk checks', () => {
  for (const name of ['Dining table for 4', 'Round dining table', 'Coffee table']) {
    assert.equal(entries().find(e => e.name === name).kind, 'custom', name);
  }
});

test('every kind has a label and a hint', () => {
  for (const k of Object.keys(g.KIND_H)) { assert.ok(g.KIND_LABELS[k], k); assert.ok(g.KIND_HINTS[k], k); }
});

// ---------- Catalog search ----------

const top = (q, n = 3) => plain(g.searchFurniture(q, g.catalogList())).slice(0, n);
const hitNames = (q, n) => top(q, n).map(h => h.e.name);

test('a search reads words and sizes', () => {
  const parse = q => plain(g.parseSearch(q));
  assert.deepEqual(parse('sofa 200'), { words: ['sofa'], size: [200] });
  assert.deepEqual(parse('200x90'), { words: [], size: [200, 90] });
  assert.deepEqual(parse('200 x 90'), { words: [], size: [200, 90] });
  assert.deepEqual(parse('200 × 90 cm'), { words: [], size: [200, 90] });
  assert.deepEqual(parse('Bed 1,6 x 2 m'), { words: ['bed'], size: [160, 200] });
  assert.deepEqual(parse('2 m sofa'), { words: ['sofa'], size: [200] });
  assert.deepEqual(parse('200cm'), { words: [], size: [200] });
  assert.deepEqual(parse('2-seater'), { words: ['2', 'seater'], size: [] }, 'a number in a word is no size');
  assert.deepEqual(parse('  '), { words: [], size: [] });
});

test('other words find the same pieces: couch, telly, closet', () => {
  for (const [q, kind] of [['couch', 'sofa'], ['settee', 'sofa'], ['telly', 'television'], ['television', 'television'],
    ['closet', 'wardrobe'], ['nightstand', 'custom'], ['crib', 'bed'], ['fridge freezer', 'custom'], ['bookshelf', 'shelf']]) {
    const hits = top(q, 50);
    assert.ok(hits.length, q);
    assert.equal(hits[0].e.kind, kind, q);
  }
  assert.ok(hitNames('couch', 3).every(n => /sofa/i.test(n)));
  assert.ok(hitNames('closet', 3).every(n => /wardrobe/i.test(n)));
  assert.match(hitNames('loo', 1)[0], /toilet/i);
  assert.match(hitNames('sofas', 1)[0], /sofa/i, 'a plural finds the singular');
  assert.deepEqual(top('zzz unknown'), []);
});

test('words in the name come before other words, and a group word comes last', () => {
  // "bed" is in the name of the sofa bed too, but the beds come first
  assert.equal(top('bed', 1)[0].e.kind, 'bed');
  // "kitchen" in the name before a chair that is only in the kitchen group
  const hits = top('kitchen', 200);
  const firstGroupOnly = hits.findIndex(h => !/kitchen/i.test(`${h.e.name} ${h.e.also ?? ''}`));
  assert.ok(firstGroupOnly > 0);
  assert.ok(hits.slice(firstGroupOnly).every(h => !/kitchen/i.test(h.e.name)));
  assert.ok(hits.some(h => h.e.name === 'Chair'), 'the group finds the chair');
});

test('a size puts the closest pieces first and says how far they are off', () => {
  const sofas = top('sofa 200', 4);
  assert.ok(sofas.every(h => /sofa|couch/i.test(`${h.e.name} ${h.e.also}`)));
  const offs = sofas.map(h => Math.abs(h.e.w - 200));
  assert.deepEqual(offs, [...offs].sort((a, b) => a - b), 'closest width first');
  assert.equal(sofas[0].diff, 'same width');
  assert.equal(sofas[1].diff, '+10 cm wide');
  // Both spellings, and turned round: a 90 × 200 bed is what 200 x 90 means
  assert.deepEqual(hitNames('200x90', 5), hitNames('200 x 90', 5));
  assert.deepEqual(hitNames('200x90', 5), hitNames('90x200', 5));
  assert.equal(top('200x90', 1)[0].diff, 'same size');
  const near = top('sofa 230x100', 1)[0];
  assert.equal(near.e.name, 'Four-seat sofa');
  assert.equal(near.diff, '+20 × ±0 cm');
  assert.ok(top('sofa 230x100', 100).every(h => /sofa|couch/i.test(`${h.e.name} ${h.e.also}`)), 'with a size, the group alone is not enough');
  assert.equal(top('bed 150x200', 1)[0].diff.includes('cm'), true);
  // A number in the name is a size the user means: TV 55, table for 6
  assert.equal(hitNames('tv 55', 1)[0], 'TV 55 inch');
  assert.equal(hitNames('dining table 6', 1)[0], 'Dining table for 6');
});

test('own templates are searched the same way', () => {
  const list = [{ e: { name: 'Old couch', kind: 'sofa', w: 190, d: 90 } }, { e: { name: 'Desk from home', kind: 'table', w: 140, d: 70 } }];
  assert.deepEqual(plain(g.searchFurniture('couch', list).map(h => h.at)), [0]);
  assert.deepEqual(plain(g.searchFurniture('150x70', list).map(h => h.at)), [1, 0]);
});

// ---------- Your own piece ----------

test('an own piece is made in one step from name, size, shape and type', () => {
  const it = g.customPiece(null, { name: '  Old trunk ', kind: 'custom', shape: 'round', w: '90', d: '50', h: '' });
  assert.deepEqual(plain(it), { color: '#a5c3e6', kind: 'custom', name: 'Old trunk', w: 90, d: 50, shape: 'round' });
  assert.equal(valid({ ...it, id: 'a', x: 0, y: 0, rot: 0, hidden: false }).shape, 'round');
  assert.equal(g.customPiece(null, { kind: 'custom', shape: 'rect', w: '90', d: '' }), null, 'a depth is needed');
  assert.equal(g.customPiece(null, { kind: 'custom', shape: 'rect', w: 'abc', d: '40' }), null);
  assert.equal(g.customPiece(null, { kind: 'custom', shape: 'rect', w: '40', d: '40', h: '-3' }), null);
  assert.equal(g.customPiece(null, { kind: 'bed', shape: 'rect', w: '90', d: '200' }).name, 'Furniture');
  assert.equal(g.customPiece(null, { kind: 'shelf', shape: 'rect', w: '80', d: '30', h: '120' }).h, 120);
});

test('a catalog entry is a starting point: its sizes change, what the form does not show stays', () => {
  const wardrobe = g.CATALOG.flatMap(c => c.items).find(e => e.name === 'Wardrobe, 3 doors');
  const it = g.customPiece({ ...wardrobe, color: '#bdb0e0' }, { name: '', kind: 'wardrobe', shape: 'rect', w: '170', d: '58', h: '236' });
  assert.deepEqual(plain(it), { color: '#bdb0e0', name: 'Wardrobe, 3 doors', kind: 'wardrobe', w: 170, d: 58, h: 236, doors: 3, mirror: false });
  assert.equal(wardrobe.w, 150, 'the catalog itself stays');
  // Another type drops what only the old one used, a shape the type cannot have goes back to a rectangle
  const shelf = g.customPiece(wardrobe, { name: 'Open wardrobe', kind: 'shelf', shape: 'round', w: '170', d: '58', h: '' });
  assert.deepEqual(plain(shelf), { color: '#a5c3e6', name: 'Open wardrobe', kind: 'shelf', w: 170, d: 58 });
  // An L keeps its legs inside a smaller piece
  const corner = g.CATALOG.flatMap(c => c.items).find(e => e.name === 'L-shaped sofa');
  const small = g.customPiece(corner, { name: 'Small corner', kind: 'sofa', shape: 'L', w: '80', d: '60' });
  assert.deepEqual(plain(small.leg), [80, 60]);
  assert.equal(small.also, undefined, 'search words stay in the catalog');
  assert.ok(valid({ ...small, id: 'a', x: 0, y: 0, rot: 0, hidden: false }));
  // A template with its place in a project leaves the place behind
  const t = g.customPiece({ ...item('a', 'custom', 10, 20, 50, 50, 90, { group: 'group-1' }) }, { kind: 'custom', shape: 'rect', w: '60', d: '50' });
  for (const k of ['id', 'x', 'y', 'rot', 'hidden', 'group']) assert.equal(t[k], undefined, k);
});

// ---------- Kind, height and options ----------

test('a new kind makes its checks apply', () => {
  const it = item('a', 'custom', 300, 300, 80, 30);
  assert.deepEqual(levels(g.analyze([it], open)), []);
  assert.equal(g.editItem(it, 'kind', 'shelf'), true);
  assert.match(g.analyze([it], open).issues[0].text, /has no back/);
});

test('changing the kind drops what the old kind used, so that its checks stop', () => {
  const tv = item('a', 'tv', 100, 300, 120, 40, 0, { image: 200, beamer: [35, 25] });
  g.editItem(tv, 'kind', 'custom');
  assert.equal(tv.image, undefined);
  assert.equal(tv.beamer, undefined);
  const w = item('b', 'wardrobe', 100, 300, 100, 60, 0, { doors: 2, mirror: true });
  g.editItem(w, 'kind', 'shelf');
  assert.equal(w.doors, undefined);
  assert.equal(w.mirror, undefined);
});

test('changing the kind keeps a shape only where the kind can have it', () => {
  const it = item('a', 'custom', 100, 300, 200, 160, 0, { shape: 'L', leg: [80, 80], flip: true });
  g.editItem(it, 'kind', 'sofa');
  assert.equal(it.shape, 'L');
  g.editItem(it, 'kind', 'bed');
  assert.deepEqual(plain(stored(it)).shape, undefined);
  assert.equal(it.leg, undefined);
  assert.equal(it.flip, undefined);
  valid(it);
});

test('the height can be set, and empty goes back to the height of the kind', () => {
  const it = item('a', 'shelf', 100, 300, 80, 30);
  assert.equal(g.itemHeight(it), 180);
  g.editItem(it, 'h', '90');
  assert.equal(g.itemHeight(it), 90);
  assert.equal(g.editItem(it, 'h', ''), true);
  assert.equal(it.h, undefined);
  assert.equal(g.itemHeight(it), 180);
});

test('the height decides whether a piece covers a projector image', () => {
  const tv = item('tv', 'tv', 200, 580, 120, 40, 180, { image: 200 });
  const shelf = item('s', 'shelf', 200, 530, 80, 30, 180);
  assert.match(g.analyze([tv, shelf], open).issues.map(i => i.text).join(), /projected picture/);
  g.editItem(shelf, 'h', '80');
  assert.doesNotMatch(g.analyze([tv, shelf], open).issues.map(i => i.text).join(), /projected picture/);
});

test('invalid numbers change nothing', () => {
  const it = item('a', 'wardrobe', 100, 300, 100, 60, 0, { doors: 2 });
  for (const [f, v] of [['w', '0'], ['w', '-5'], ['w', 'x'], ['w', ''], ['d', 'NaN'], ['doors', 'x'], ['doors', '-1'], ['h', '-1'], ['clear', '-1'], ['rot', 'x']])
    assert.equal(g.editItem(it, f, v), false, `${f}=${v}`);
});

test('values are kept to what a project file may hold', () => {
  const it = item('a', 'wardrobe', 100, 300, 100, 60);
  g.editItem(it, 'w', '99999');
  g.editItem(it, 'd', '0.2');
  g.editItem(it, 'h', '99999');
  g.editItem(it, 'doors', '2.6');
  assert.equal(it.w, 2000);
  assert.equal(it.d, 1);
  assert.equal(it.doors, 3);
  g.editItem(it, 'doors', '99');
  assert.equal(it.doors, 20);
  valid(it);
});

test('a projector can be switched on and off, and its fields keep each other', () => {
  const it = item('a', 'tv', 100, 300, 120, 40);
  g.editItem(it, 'projector', true);
  assert.ok(it.image > 0);
  assert.equal(it.beamer.length, 2);
  g.editItem(it, 'beamerW', '50');
  g.editItem(it, 'image', '180');
  assert.equal(it.beamer[0], 50);
  assert.equal(it.image, 180);
  valid(it);
  g.editItem(it, 'projector', false);
  assert.equal(it.image, undefined);
  assert.equal(it.beamer, undefined);
});

test('mirror off is kept, because a wardrobe without the field counts as having one', () => {
  const it = item('a', 'wardrobe', 100, 300, 100, 60);
  g.editItem(it, 'mirror', false);
  assert.equal(it.mirror, false);
  g.editItem(it, 'mirror', true);
  assert.equal(it.mirror, true);
});

test('any series of edits leaves an item that a project accepts', () => {
  let seed = 7;
  const rnd = n => { seed = (seed * 48271) % 2147483647; return seed % n; };
  const kinds = Object.keys(g.KIND_H), shapes = ['rect', 'round', 'L'];
  const values = ['1', '0.4', '-3', '', 'x', '50', '2000', '5000', '1e9', ' 12 '];
  const fields = ['w', 'd', 'h', 'doors', 'clear', 'image', 'legW', 'legD', 'beamerW', 'beamerD', 'rot', 'name'];
  for (let n = 0; n < 500; n++) {
    const it = item('a', kinds[rnd(kinds.length)], 100, 300, 1 + rnd(300), 1 + rnd(300));
    for (let k = 0; k < 12; k++) {
      const step = rnd(5);
      if (step === 0) g.setItemKind(it, kinds[rnd(kinds.length)]);
      else if (step === 1) {
        const s = shapes[rnd(3)];
        if (s === 'rect' || g.shapesFor(it.kind).includes(s)) g.setItemShape(it, s);
      } else if (step === 2) g.editItem(it, ['mirror', 'flip', 'projector'][rnd(3)], !!rnd(2));
      else g.editItem(it, fields[rnd(fields.length)], values[rnd(values.length)]);
    }
    valid(it);
    g.analyze([it], open);
  }
});

// ---------- Free space in front ----------

test('the free space in front applies to any kind', () => {
  const box = item('a', 'custom', 300, 100, 80, 40), chair = item('b', 'custom', 300, 150, 40, 40);
  assert.equal(g.clearance(box), 0);
  assert.deepEqual(levels(g.analyze([box, chair], open)), []);
  box.clear = 40;
  const r = g.analyze([box, chair], open);
  assert.deepEqual(levels(r), [1]);
  assert.match(r.issues[0].text, /40 cm in front are not free \(b\)/);
});

test('the front of a wardrobe follows its doors until it is set by hand', () => {
  const w = item('a', 'wardrobe', 300, 100, 120, 60, 0, { doors: 3 });
  assert.equal(g.clearance(w), 40);
  w.doors = 2;
  assert.equal(g.clearance(w), 60);
  w.clear = 0;
  assert.equal(g.clearance(w), 0);
  const wall = item('b', 'custom', 300, 150, 200, 40);
  assert.deepEqual(levels(g.analyze([w, wall], open)), [], 'sliding doors need no room');
  delete w.clear;
  assert.deepEqual(levels(g.analyze([w, wall], open)), [1]);
});

// ---------- Shapes ----------

test('a round item stays inside its box and its corners are free', () => {
  const table = item('a', 'custom', 300, 300, 120, 120, 0, { shape: 'round' });
  const A = g.aabb(g.itemPoly(table));
  near(A.x0, 240); near(A.x1, 360); near(A.y0, 240); near(A.y1, 360);
  const corner = item('b', 'custom', 240, 240, 30, 30);
  assert.deepEqual(levels(g.analyze([table, corner], open)), [], 'the box overlaps, the shape does not');
  assert.deepEqual(levels(g.analyze([table, { ...corner, x: 270, y: 270 }], open)), [2]);
});

test('an oval follows width and depth, also when turned', () => {
  const A = g.aabb(g.itemPoly(item('a', 'custom', 300, 300, 180, 100, 90, { shape: 'round' })));
  near(A.x1 - A.x0, 100); near(A.y1 - A.y0, 180);
});

test('a round item against the wall counts only where it reaches it', () => {
  const r = g.analyze([item('a', 'custom', 50, 300, 120, 120, 0, { shape: 'round' })], open);
  assert.deepEqual(levels(r), [2]);
  assert.match(r.issues[0].text, /10 cm/);
});

const sofaL = (over = {}) => item('L', 'sofa', 300, 300, 260, 170, 0, { shape: 'L', leg: [95, 95], ...over });

test('an L has its leg on the right, flipped on the left, with an outline around both', () => {
  assert.deepEqual(plain(g.itemPoly(sofaL())), [[170, 215], [430, 215], [430, 385], [335, 385], [335, 310], [170, 310]]);
  const parts = g.itemParts(sofaL());
  assert.equal(parts.length, 2);
  assert.deepEqual(plain(g.aabb(parts[1])), { x0: 335, y0: 310, x1: 430, y1: 385 });
  assert.deepEqual(plain(g.aabb(g.itemParts(sofaL({ flip: true }))[1])), { x0: 170, y0: 310, x1: 265, y1: 385 });
});

test('the empty corner of an L is free', () => {
  const table = item('t', 'custom', 240, 340, 80, 50);
  assert.deepEqual(levels(g.analyze([sofaL(), table], open)), []);
  assert.deepEqual(levels(g.analyze([sofaL({ flip: true }), table], open)), [2]);
});

test('an L turns as a whole', () => {
  const turned = sofaL({ rot: 90 }), piece = (x, y) => item('t', 'custom', x, y, 50, 80);
  // At 90 degrees the bar stands on the right and the leg at the bottom left, so the free corner is at the top left
  assert.deepEqual(levels(g.analyze([turned, piece(250, 250)], open)), []);
  assert.deepEqual(levels(g.analyze([turned, piece(250, 380)], open)), [2]);
  assert.deepEqual(levels(g.analyze([turned, piece(340, 250)], open)), [2]);
});

test('an L that became smaller than its leg stays a valid shape', () => {
  const it = sofaL({ w: 60, d: 60 });
  assert.deepEqual(plain(g.legOf(it)), [60, 60]);
  assert.equal(g.itemParts(it).length, 1, 'the leg has no length left');
  assert.deepEqual(levels(g.analyze([it], open)), []);
});

test('an L without sizes of its own gets a leg and a back that fit', () => {
  const it = item('a', 'custom', 300, 300, 100, 80, 0, { shape: 'L' });
  assert.deepEqual(plain(g.legOf(it)), [50, 40]);
  g.editItem(it, 'legW', '30');
  assert.deepEqual(plain(it.leg), [30, 40]);
  valid(it);
});

test('a door opens into the empty corner of an L, and is stopped by the leg', () => {
  const room = { ...open, openings: [{ type: 'door', wall: 'top', pos: 100, width: 90, hinge: 'start' }] };
  const swing = g.roomGeo(room).swings[0], sofa = extra => sofaL({ x: 250, y: 140, rot: 180, ...extra });
  const leg = g.itemParts(sofa());
  assert.ok(g.partsOverlap(leg, [swing.poly]) > 0);
  assert.ok(g.partsOpening(swing, leg) < 90);
  const corner = g.itemParts(sofa({ flip: true }));
  assert.equal(g.partsOverlap(corner, [swing.poly]), 0);
  assert.ok(g.partsOverlap(g.itemParts(sofa({ shape: undefined })), [swing.poly]) > 0, 'the plain box would hit it');
});

test('the way through the room passes the empty corner of an L', () => {
  const room = { w: 500, l: 300, wall: 20, fixtures: [], openings: [
    { type: 'door', wall: 'left', pos: 220, width: 60, hinge: 'start' },
    { type: 'balcony', wall: 'bottom', pos: 280, width: 100, hinge: 'start' }] };
  const L = item('a', 'custom', 250, 150, 500, 300, 0, { shape: 'L', leg: [100, 200] });
  assert.ok(g.fengShui([L], room).path);
  assert.equal(g.fengShui([{ ...L, shape: undefined }], room).path, null, 'the plain box fills the room');
});

test('gaps measure to the leg and not across the empty corner', () => {
  const t = item('t', 'custom', 230, 400, 60, 40);
  const down = plain(g.gaps(t, [sofaL(), t], open));
  const up = down.find(s => s.y2 === 380);
  assert.equal(up.d, 380 - 310, 'to the bar');
});

test('other pieces snap to the inner edges of an L', () => {
  const t = item('t', 'custom', 300, 330, 60, 40);
  g.snapItem(t, [sofaL(), t], open);
  assert.equal(t.x + 30, 335, 'right edge at the leg');
  assert.equal(t.y - 20, 310, 'top edge at the bar');
});

test('shapes are kept and checked in a project', () => {
  const round = def('a', { shape: 'round' }), L = def('b', { kind: 'sofa', shape: 'L', leg: [90, 80], flip: true });
  const p = g.validateProject(project([round, L]));
  assert.deepEqual(plain(p.furniture), [round, L]);
  const file = JSON.parse(JSON.stringify(g.exportProject(p)));
  assert.deepEqual(plain(g.parseProjectFile(file).project.furniture), [round, L]);
});

test('a project with a shape, a leg or a front that cannot be is refused', () => {
  const bad = [[{ shape: 'star' }, /shape/], [{ kind: 'bed', shape: 'round' }, /shape/], [{ kind: 'bed', shape: 'L' }, /shape/],
    [{ leg: [0, 10] }, /leg/], [{ leg: [10] }, /leg/], [{ leg: 'x' }, /leg/], [{ flip: 'yes' }, /flip/], [{ clear: -1 }, /clear/],
    [{ clear: '5' }, /clear/], [{ group: 5 }, /group/], [{ group: '' }, /group/], [{ beamer: [1] }, /beamer/]];
  for (const [extra, re] of bad) assert.throws(() => g.validateProject(project([def('a', extra)])), re, JSON.stringify(extra));
});

test('pieces of another shape are not the same piece', () => {
  assert.equal(g.sameShape(def('a', { shape: 'round' }), def('a', { shape: 'L' })), false);
  assert.equal(g.sameShape(def('a', { clear: 10 }), def('a', { clear: 20 })), false);
  assert.equal(g.sameShape(def('a', { group: 'x' }), def('a', { group: 'y' })), true);
});

// ---------- TV ----------

const sofa = item('s', 'sofa', 200, 100, 180, 85);
const set = item('t', 'television', 200, 470, 120, 30, 180);

test('a tall piece between sofa and TV is reported on that piece', () => {
  const shelf = item('x', 'shelf', 200, 300, 80, 30, 0, { h: 180 });
  const r = g.analyze([sofa, set, shelf], open);
  assert.match(r.issues.map(i => i.text).join(), /x blocks the view from s to t/);
  assert.equal(r.flag.get('x'), 1);
});

test('a low piece, one beside the view and a sofa turned away are no problem for the TV', () => {
  const text = items => g.analyze(items, open).issues.map(i => i.text).join();
  assert.doesNotMatch(text([sofa, set, item('x', 'custom', 200, 300, 110, 60, 0, { h: 45 })]), /blocks/);
  assert.doesNotMatch(text([sofa, set, item('x', 'shelf', 450, 300, 80, 30)]), /blocks/);
  assert.doesNotMatch(text([{ ...sofa, rot: 180 }, set, item('x', 'shelf', 200, 300, 80, 30)]), /blocks/);
});

test('a blocked TV costs the sofa score, one free view is enough', () => {
  const shelf = item('x', 'shelf', 200, 300, 80, 30, 0, { h: 180 });
  const score = items => g.fsEstimate(g.fengShui(items, open), items, open);
  const free = score([sofa, set]), blocked = score([sofa, set, shelf]);
  assert.equal(blocked.score.sofa, free.score.sofa - 1);
  assert.match(blocked.why.sofa, /view of the TV blocked/);
  const second = item('s2', 'sofa', 420, 100, 180, 85, 25);
  assert.equal(g.tvSight([sofa, second, set, shelf], g.roomGeo(open)).filter(v => !v.blockers.length).length, 1);
  assert.doesNotMatch(score([sofa, second, set, shelf]).why.sofa, /blocked/);
});

// ---------- Groups ----------

test('grouping joins two pieces and everything grouped with them', () => {
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(id => item(id, 'custom', 100, 100, 40, 40)), all = [a, b, c, d];
  g.joinGroup(a, b, all);
  assert.ok(a.group);
  assert.equal(b.group, a.group);
  g.joinGroup(c, d, all);
  assert.notEqual(c.group, a.group);
  g.joinGroup(b, d, all);
  assert.equal(new Set(all.map(i => i.group)).size, 1);
  assert.equal(g.groupMembers(c, all).length, 4);
  g.ungroup(c, all);
  assert.ok(all.every(i => i.group === undefined));
});

test('a piece does not join itself, and joining inside a group changes nothing', () => {
  const [a, b, c] = ['a', 'b', 'c'].map(id => item(id, 'custom', 100, 100, 40, 40)), all = [a, b, c];
  assert.equal(g.joinGroup(a, a, all), false);
  assert.equal(a.group, undefined, 'no group of one');
  assert.equal(g.joinGroup(a, b, all), true);
  const id = a.group;
  assert.equal(g.joinGroup(b, a, all), false);
  assert.equal(g.joinGroup(a, a, all), false);
  assert.deepEqual([a.group, b.group, c.group], [id, id, undefined]);
  assert.equal(g.joinGroup(c, a, all), true);
  assert.equal(c.group, id);
});

test('ungrouping one group leaves another alone', () => {
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(id => item(id, 'custom', 100, 100, 40, 40)), all = [a, b, c, d];
  g.joinGroup(a, b, all);
  g.joinGroup(c, d, all);
  g.ungroup(a, all);
  assert.equal(a.group, undefined);
  assert.ok(c.group);
  assert.equal(c.group, d.group);
});

test('a piece without a group moves alone, and out of sight pieces stay', () => {
  const a = item('a', 'custom', 100, 100, 40, 40), b = item('b', 'custom', 100, 100, 40, 40, 0, { group: 'g', hidden: true });
  assert.deepEqual(plain(g.groupMembers(a, [a, b])).map(i => i.id), ['a']);
  const c = item('c', 'custom', 100, 100, 40, 40, 0, { group: 'g' });
  assert.deepEqual(plain(g.groupMembers(c, [a, b, c])).map(i => i.id), ['c']);
});

test('a group of one dissolves', () => {
  const a = item('a', 'custom', 100, 100, 40, 40, 0, { group: 'g' }), b = item('b', 'custom', 100, 100, 40, 40, 0, { group: 'g' });
  g.pruneGroups([a, b]);
  assert.equal(a.group, 'g');
  g.pruneGroups([a]);
  assert.equal(a.group, undefined);
});

test('a dragged piece does not snap to what moves with it', () => {
  const a = item('a', 'custom', 203, 303, 40, 40), mate = item('b', 'custom', 247, 303, 40, 40);
  const lone = { ...a };
  g.snapItem(lone, [lone, mate], open);
  assert.equal(lone.x, 207, 'without the group it jumps to the neighbour');
  g.snapItem(a, [a, mate], open, [mate]);
  assert.equal(a.x, 205, 'with it the grid decides');
});

test('a group goes to the parking area as one block, and stays clear of what is there', () => {
  const room = open, a = item('a', 'custom', 100, 100, 40, 40), b = item('b', 'custom', 160, 130, 40, 40);
  const waiting = item('w', 'custom', 700, 60, 60, 60), all = [a, b, waiting];
  g.parkItems([a, b], all, room);
  assert.equal(b.x - a.x, 60);
  assert.equal(b.y - a.y, 30);
  assert.equal(a.x - 20, 670, 'in the column of what waits there');
  assert.equal(a.y - 20, 110, 'below it');
});

// A stray piece was dragged around the room, not into the parking area. The room is 400 by 500 with a wall of 20.
const strays = [['below the room', 100, 560, 100], ['above the room', 200, -80, 100], ['left, mid height', -100, 300, 300],
  ['left, near the bottom', -100, 480, 100]];
const parkedClear = (moved, all) => {
  for (const it of moved) {
    assert.equal(get('inRoom')(it, ROOM), false, `${it.id} stands at ${it.x}, ${it.y}`);
    assert.ok(g.aabb(g.itemPoly(it)).x0 >= ROOM.w + ROOM.wall + 40, `${it.id} is right of the room`);
    for (const o of all) if (o !== it) assert.equal(g.partsOverlap(g.itemParts(it), g.itemParts(o)), 0, `${it.id} on ${o.id}`);
  }
};

for (const [where, x, y, w] of strays) {
  test(`a new piece goes to the parking area with a stray piece ${where}`, () => {
    const stray = item('stray', 'custom', x, y, 80, 60), neu = item('neu', 'custom', 0, 0, w, 60), all = [stray, neu];
    g.park(neu, all, ROOM);
    parkedClear([neu], all);
    assert.equal(g.aabb(g.itemPoly(neu)).x0, 490, 'the column does not follow the stray piece');
    assert.equal(g.aabb(g.itemPoly(neu)).y0, 15);
    assert.deepEqual([stray.x, stray.y], [x, y]);
  });

  test(`a group of two goes to the parking area with a stray piece ${where}`, () => {
    const stray = item('stray', 'custom', x, y, 80, 60);
    const a = item('a', 'custom', 100, 100, w, 60), b = item('b', 'custom', 130, 170, 100, 60), all = [stray, a, b];
    g.parkItems([a, b], all, ROOM);
    parkedClear([a, b], all);
    assert.deepEqual([b.x - a.x, b.y - a.y], [30, 70], 'the block keeps its form');
  });
}

test('a piece beside the right wall that reaches into the parking column is not overlapped', () => {
  for (const [x, y, w, d] of [[440, 45, 300, 60], [395, 250, 300, 60], [500, 250, 40, 1000], [470, 10, 60, 700]]) {
    const wide = item('wide', 'custom', x, y, w, d), neu = item('neu', 'custom', 0, 0, 100, 60), all = [wide, neu];
    g.park(neu, all, ROOM);
    parkedClear([neu], all);
  }
});

test('a wide piece of an earlier column is not overlapped by the last column', () => {
  const wide = item('wide', 'custom', 660, 300, 300, 60), late = item('late', 'custom', 600, 100, 60, 60);
  const neu = item('neu', 'custom', 0, 0, 100, 300), all = [wide, late, neu];
  g.park(neu, all, ROOM);
  parkedClear([neu], all);
});

test('a block taller than the room still finds a free column', () => {
  const first = item('first', 'custom', 540, 45, 100, 60), neu = item('neu', 'custom', 0, 0, 100, 900), all = [first, neu];
  g.park(neu, all, ROOM);
  parkedClear([neu], all);
});

test('pieces out of sight do not take up room in the parking area', () => {
  const gone = item('gone', 'custom', 540, 45, 100, 60, 0, { hidden: true }), neu = item('neu', 'custom', 0, 0, 100, 60);
  g.park(neu, [gone, neu], ROOM);
  assert.deepEqual([neu.x, neu.y], [540, 45]);
});

test('wherever other pieces stand, a parked block lands right of the room on free ground', () => {
  let seed = 7;
  const rnd = (lo, hi) => { seed = (seed * 16807) % 2147483647; return lo + seed % (hi - lo); };
  for (let n = 0; n < 400; n++) {
    const others = Array.from({ length: rnd(1, 12) }, (_, i) =>
      item(`o${i}`, 'custom', rnd(-300, 1200), rnd(-300, 900), rnd(30, 320), rnd(30, 320), rnd(0, 4) * 45));
    const a = item('a', 'custom', rnd(50, 350), rnd(50, 450), rnd(30, 320), rnd(30, 320), rnd(0, 4) * 90);
    const b = item('b', 'custom', a.x + rnd(-80, 80), a.y + rnd(-80, 80), rnd(30, 200), rnd(30, 200));
    const all = [...others, a, b];
    g.parkItems([a, b], all, ROOM);
    parkedClear([a, b], others);
  }
});

test('the parking area grows in columns as long as the room', () => {
  const room = { ...open, l: 300 }, all = [];
  for (let n = 0; n < 12; n++) {
    const it = item(`i${n}`, 'custom', 100, 100, 80, 80);
    all.push(it);
    g.park(it, all, room);
  }
  const box = g.aabb(all.flatMap(i => g.itemPoly(i)));
  assert.ok(box.y1 <= 300);
  assert.equal(new Set(all.map(i => i.x)).size, 4, 'three pieces per column');
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++)
    assert.equal(g.partsOverlap(g.itemParts(all[i]), g.itemParts(all[j])), 0);
});

test('a piece longer than the room gets a column of its own', () => {
  const room = { ...open, l: 300 }, a = item('a', 'custom', 100, 100, 80, 80), b = item('b', 'custom', 100, 100, 80, 500);
  g.park(a, [a, b], room);
  g.park(b, [a, b], room);
  assert.ok(b.x > a.x + 40);
  assert.equal(b.y, 15 + 250);
});

test('parking one piece works as before', () => {
  const a = item('a', 'custom', 100, 100, 40, 20, 90), all = [a];
  g.park(a, all, open);
  assert.equal(a.x, 600 + 20 + 50 + 20 + 10);
  assert.equal(a.y, 15 + 20);
});

test('moving a layout to another project leaves groups behind', () => {
  const source = g.validateProject(project([def('a', { group: 'g' }), def('b', { group: 'g' })],
    { layouts: [{ name: 'L', place: { a: [100, 100, 0], b: [200, 100, 0] } }] }));
  const target = g.validateProject(project([def('c', { group: 'g' })]));
  const { target: out } = g.transferLayout(source, target, 'L');
  assert.deepEqual(plain(out.furniture.filter(f => f.group).map(f => f.id)), ['c']);
  g.validateProject(out);
});

test('a group survives saving and loading', () => {
  const p = g.validateProject(project([def('a', { group: 'g' }), def('b')]));
  assert.equal(g.presetItems(p.room, p.furniture, null)[0].group, 'g');
});

// ---------- Templates ----------

function browser(start = {}) {
  const mem = new Map(Object.entries(start).map(([k, v]) => [k, JSON.stringify(v)]));
  const quota = { full: false };
  const localStorage = { getItem: k => mem.get(k) ?? null, removeItem: k => mem.delete(k),
    setItem: (k, v) => { if (quota.full) throw new Error('quota'); mem.set(k, v); } };
  return { quota, ...load(PROJECT_SCRIPTS, { localStorage, fetch: async () => ({}), location: { protocol: 'file:' } }) };
}

const template = it => g.templateOf(it);

test('a template keeps what makes the piece and nothing of its place', () => {
  const it = item('Mine', 'wardrobe', 100, 300, 100, 60, 90, { doors: 2, mirror: false, h: 210, clear: 30, group: 'g' });
  const t = plain(template(it));
  assert.deepEqual(t, { name: 'Mine', kind: 'wardrobe', w: 100, d: 60, color: '#888888', doors: 2, mirror: false, h: 210, clear: 30 });
});

test('templates are kept across pages, and a new one of the same name replaces the old', () => {
  const b = browser();
  assert.deepEqual(plain(b.get('readTemplates')()), []);
  assert.equal(b.get('saveTemplate')(template(item('A', 'custom', 0, 0, 40, 40))), true);
  b.get('saveTemplate')(template(item('B', 'sofa', 0, 0, 200, 150, 0, { shape: 'L', leg: [80, 80] })));
  b.get('saveTemplate')(template(item('A', 'custom', 0, 0, 55, 40)));
  const list = plain(b.get('readTemplates')());
  assert.deepEqual(list.map(t => t.name), ['B', 'A']);
  assert.equal(list[1].w, 55);
  assert.equal(list[0].shape, 'L');
  b.get('removeTemplate')('B');
  assert.deepEqual(plain(b.get('readTemplates')()).map(t => t.name), ['A']);
});

test('broken stored templates are left out', () => {
  const b = browser({ 'roomBlueprint.templates': [{ name: 'ok', kind: 'custom', w: 40, d: 40, color: '#888888' },
    { name: 'bad', kind: 'nope', w: 40, d: 40, color: '#888888' }, { name: '<b>', kind: 'custom', w: -1, d: 40, color: 'red' }, 5] });
  assert.deepEqual(plain(b.get('readTemplates')()).map(t => t.name), ['ok']);
  assert.deepEqual(plain(browser({ 'roomBlueprint.templates': 'x' }).get('readTemplates')()), []);
});

test('a full storage says so', () => {
  const b = browser();
  b.quota.full = true;
  assert.equal(b.get('saveTemplate')(template(item('A', 'custom', 0, 0, 40, 40))), false);
});

test('templates do not end up in a project file', () => {
  const b = browser();
  b.get('saveTemplate')(template(item('Secret piece', 'custom', 0, 0, 40, 40)));
  assert.doesNotMatch(JSON.stringify(b.get('exportProject')(b.get('activeProject')())), /Secret piece/);
});
