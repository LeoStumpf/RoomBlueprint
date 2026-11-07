'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain, ROOM, item, PROJECT_SCRIPTS } = require('./load');

const { get } = load(PROJECT_SCRIPTS);
const [validateProject, parseProjectFile, mergeProjects, exportProject, projectItems, layoutItems, takeItems, convertRoomV1] =
  ['validateProject', 'parseProjectFile', 'mergeProjects', 'exportProject', 'projectItems', 'layoutItems', 'takeItems',
    'convertRoomV1'].map(get);
const PROJECT_VERSION = get('PROJECT_VERSION');
const STARTER = get('STARTER_PROJECT');

const def = (id, extra = {}) => ({ id, name: id, kind: 'custom', w: 40, d: 40, color: '#888888', ...extra });
const project = (over = {}) => ({ name: 'Test', room: ROOM, furniture: [def('a'), def('b')], layouts: [], ...over });
const score = { bed: 1, desk: 2, sofa: 3, flow: 4, zones: 5 };
const roomV1 = { w: 400, l: 500, wall: 20, balcony: { left: 100, right: 100 }, radiator: { offset: 10, w: 50, d: 10 },
  chimney: [40, 40], door: { fromTop: 100, w: 90, hingeTop: true } };
const rejects = (p, re) => assert.throws(() => validateProject(p), re);

test('the starter project is valid and all checks run on it', () => {
  const p = validateProject(STARTER);
  const items = projectItems(p);
  assert.equal(items.length, p.furniture.length);
  for (const it of items) { it.x = 100; it.y = 100; }
  get('analyze')(items, p.room);
  get('fsEstimate')(get('fengShui')(items, p.room), items, p.room);
});

test('validateProject keeps known fields only', () => {
  const p = validateProject(project({ evil: 1, furniture: [def('a', { onclick: 'x', image: 200 })] }));
  assert.equal(p.evil, undefined);
  assert.deepEqual(Object.keys(p.furniture[0]).sort(), ['color', 'd', 'id', 'image', 'kind', 'name', 'w']);
});

test('validateProject refuses a bad kind, colour or number', () => {
  rejects(project({ furniture: [def('a', { kind: 'bomb' })] }), /furniture\[0\]\.kind/);
  rejects(project({ furniture: [def('a', { color: 'red"><script>' })] }), /furniture\[0\]\.color/);
  rejects(project({ furniture: [def('a', { color: '#12' })] }), /color/);
  for (const w of [0, -5, '40', NaN, Infinity, null, 1e9]) rejects(project({ furniture: [def('a', { w })] }), /furniture\[0\]\.w/);
  rejects(project({ furniture: [def('a'), def('a')] }), /same id/);
  rejects(project({ furniture: [def('a', { beamer: [1] })] }), /beamer/);
  rejects(project({ furniture: 'nope' }), /furniture/);
  rejects(null, /project/);
});

test('validateProject checks openings and fixtures against the room', () => {
  const withOpening = o => ({ ...ROOM, openings: [o, ROOM.openings[1]] });
  rejects(project({ room: withOpening({ ...ROOM.openings[0], width: 900 }) }), /room\.openings\[0\]/);
  rejects(project({ room: withOpening({ ...ROOM.openings[0], pos: 450 }) }), /does not fit/);
  rejects(project({ room: withOpening({ ...ROOM.openings[0], wall: 'north' }) }), /wall/);
  rejects(project({ room: withOpening({ ...ROOM.openings[0], type: 'hole' }) }), /type/);
  rejects(project({ room: { ...ROOM, fixtures: [{ type: 'column', x: 390, y: 0, w: 40, d: 40 }] } }), /does not fit/);
  rejects(project({ room: { ...ROOM, fixtures: [{ type: 'cat', x: 0, y: 0, w: 40, d: 40 }] } }), /type/);
  rejects(project({ room: { ...ROOM, w: 'wide' } }), /room\.w/);
});

test('any number of openings on any wall is accepted', () => {
  const door = { type: 'door', wall: 'left', pos: 100, width: 80, hinge: 'both', main: true };
  const window = { type: 'window', wall: 'top', pos: 50, width: 120 };
  const room = validateProject(project({ room: { ...ROOM, openings: [door, window] } })).room;
  assert.deepEqual(plain(room.openings), [door, window]);
  assert.deepEqual(plain(validateProject(project({ room: { ...ROOM, openings: [] } })).room.openings), []);
});

test('openings: a door needs a hinge, a window does not, and they may not overlap', () => {
  const at = openings => project({ room: { ...ROOM, openings } });
  rejects(at([{ type: 'door', wall: 'left', pos: 0, width: 80 }]), /hinge/);
  const a = { type: 'window', wall: 'top', pos: 0, width: 100 };
  rejects(at([a, { ...a, pos: 99 }]), /overlaps/);
  assert.doesNotThrow(() => validateProject(at([a, { ...a, pos: 100 }])));
  assert.doesNotThrow(() => validateProject(at([a, { ...a, wall: 'bottom' }])));
});

test('there is one main entrance at most, and a window cannot be one', () => {
  const at = openings => project({ room: { ...ROOM, openings } });
  const door = { type: 'door', wall: 'left', pos: 0, width: 80, hinge: 'start' };
  rejects(at([{ type: 'window', wall: 'top', pos: 0, width: 100, main: true }]), /main/);
  rejects(at([{ ...door, main: 'yes' }]), /main/);
  rejects(at([{ ...door, main: true }, { ...door, pos: 100, main: true }]), /one main entrance/);
  const clean = validateProject(at([{ ...door, main: false }])).room.openings[0];
  assert.equal('main' in clean, false, 'false is the same as not set');
});

test('television is a furniture kind of its own', () => {
  assert.equal(validateProject(project({ furniture: [def('t', { kind: 'television' })] })).furniture[0].kind, 'television');
});

test('layouts: placement is checked, deleted furniture is dropped, names are unique', () => {
  const layouts = [{ name: 'L', place: { a: [1, 2, 3], gone: [1, 2, 3] } }];
  assert.deepEqual(plain(validateProject(project({ layouts })).layouts[0]), { name: 'L', place: { a: [1, 2, 3] } });
  rejects(project({ layouts: [{ name: 'L', place: { a: [1, 2] } }] }), /layouts\[0\]\.place\.a/);
  rejects(project({ layouts: [{ name: 'L', place: { a: [1, 'x', 3] } }] }), /place\.a\[1\]/);
  rejects(project({ layouts: [{ name: 'L', place: {} }, { name: 'L', place: {} }] }), /same name/);
});

test('a layout keeps the notes of a review, and scores from an older file go', () => {
  const notes = { pro: ['p'], con: [], tip: 't', now: true };
  for (const old of [score, { ...score, sofa: null }, { bed: 99 }, 'x', undefined]) {
    const ok = validateProject(project({ layouts: [{ name: 'L', place: {}, review: { ...notes, score: old } }] }));
    assert.deepEqual(plain(ok.layouts[0].review), notes);
  }
});

test('a project keeps its profile and the weights its file brought', () => {
  const p = validateProject(project({ profile: 'sleep', weights: { bed: 3 }, baseWeights: { bed: 1, evil: 2 } }));
  assert.equal(p.profile, 'sleep');
  assert.deepEqual(plain(p.baseWeights), { bed: 1 });
  rejects(project({ profile: 'party' }), /profile/);
  rejects(project({ baseWeights: { bed: 9 } }), /baseWeights.bed/);
  rejects(project({ baseWeights: 3 }), /baseWeights/);
});

test('the weights of a file become the standard of that project', () => {
  const weights = { bed: 3, desk: 0, sofa: 1, flow: 2, zones: 2 };
  const file = { app: 'room-blueprint', version: 2, ...project({ weights }) };
  assert.deepEqual(plain(parseProjectFile(file).project.baseWeights), weights);
  assert.deepEqual(plain(parseProjectFile({ ...file, weights: { ...weights, bed: 0 }, baseWeights: weights }).project.baseWeights), weights,
    'an export that was changed since keeps its standard');
  assert.equal(parseProjectFile({ ...file, profile: 'sleep' }).project.baseWeights, undefined);
  assert.equal(parseProjectFile({ ...file, weights: undefined }).project.baseWeights, undefined);
  assert.deepEqual(plain(parseProjectFile({ ROOM: roomV1, DEFAULT_W: weights }).project.baseWeights), weights);
});

test('notes must still be an object with texts', () => {
  rejects(project({ layouts: [{ name: 'L', place: {}, review: 'good' }] }), /review/);
  rejects(project({ layouts: [{ name: 'L', place: {}, review: { pro: 'x' } }] }), /review\.pro/);
  rejects(project({ layouts: [{ name: 'L', place: {}, review: { con: [1] } }] }), /review\.con/);
});

test('ids that collide with object internals are plain ids', () => {
  const place = JSON.parse('{"__proto__": [1, 2, 3], "constructor": [4, 5, 6]}');
  const p = validateProject(project({ furniture: [def('__proto__'), def('constructor'), def('toString')], layouts: [{ name: 'L', place }] }));
  const items = layoutItems(p, p.layouts[0]);
  assert.deepEqual(plain(items.map(i => i.x)), [1, 4, items[2].x]);
  assert.ok(items[2].x > ROOM.w, 'toString is not placed, so it is parked');
  assert.equal(Object.getPrototypeOf(p.layouts[0].place), get('Object').prototype);
});

test('a hidden piece from an older file is parked on load, and the format stops carrying it', () => {
  const p = validateProject(project({ layouts: [{ name: 'L', place: { a: [50, 60, 90], b: [100, 100, 0] }, hidden: ['b', 'gone'] }],
    current: { place: { a: [50, 60, 90], b: [100, 100, 0] }, hidden: ['a'] } }));
  assert.deepEqual(plain(p.layouts[0]), { name: 'L', place: { a: [50, 60, 90] } });
  assert.deepEqual(plain(p.current), { place: { b: [100, 100, 0] } });
  for (const items of [layoutItems(p, p.layouts[0]), projectItems(p)]) assert.ok(items.every(i => !i.hidden), 'nothing is invisible');
  // The analysis sees only what stands in the room, as it did while the piece was hidden
  assert.deepEqual(plain(get('activeItems')(layoutItems(p, p.layouts[0]), p.room).map(i => i.id)), ['a']);
  assert.deepEqual(plain(get('activeItems')(projectItems(p), p.room).map(i => i.id)), ['b']);
  assert.deepEqual(plain(validateProject(p)), plain(p), 'the conversion is stable');
});

test('a raw placement that still hides a piece parks it too', () => {
  const items = get('presetItems')(ROOM, [def('a'), def('b')], { place: { a: [50, 60, 0], b: [100, 100, 0] }, hidden: ['b'] });
  const b = items.find(i => i.id === 'b');
  assert.equal(b.hidden, false);
  assert.equal(get('inRoom')(b, ROOM), false, 'b waits in the parking area');
});

test('placementOf leaves a hidden item out, so it is parked next time', () => {
  const items = get('presetItems')(ROOM, [def('a'), def('b')], { place: { a: [50, 60, 0], b: [100, 100, 0] } });
  items[1].hidden = true;
  assert.deepEqual(plain(get('placementOf')(items)), { place: { a: [50, 60, 0] } });
});

test('layouts and working items survive a round trip through the file', () => {
  const p = validateProject(project({ layouts: [{ name: 'L', place: { a: [50, 60, 90] } }] }));
  const items = layoutItems(p, p.layouts[0]);
  assert.equal(items.find(i => i.id === 'a').x, 50);
  assert.equal(get('inRoom')(items.find(i => i.id === 'b'), p.room), false);
  items[0].w = 77;
  takeItems(p, items, 'Plan');
  const file = JSON.parse(JSON.stringify(exportProject({ ...p, id: 'x', updatedAt: 5 })));
  assert.equal(file.app, 'room-blueprint');
  assert.equal(file.version, PROJECT_VERSION);
  assert.equal(file.id, undefined);
  const back = parseProjectFile(file).project;
  assert.equal(back.name, 'Test');
  assert.equal(back.current.name, 'Plan');
  assert.deepEqual(plain(projectItems(back)), plain(items));
  assert.deepEqual(plain(back.room), plain(p.room));
});

test('layoutsWith finds placed furniture, and nothing for an inherited key', () => {
  const p = validateProject(project({ layouts: [{ name: 'L', place: { a: [1, 2, 0] } }, { name: 'M', place: {} },
    { name: 'N', place: { b: [1, 2, 0] } }] }));
  const names = id => plain(get('layoutsWith')(p, id).map(l => l.name));
  assert.deepEqual(names('a'), ['L']);
  assert.deepEqual(names('b'), ['N']);
  assert.deepEqual(names('constructor'), []);
});

test('a file from a newer version or of unknown shape is refused', () => {
  assert.throws(() => parseProjectFile({ app: 'room-blueprint', version: 99 }), /version 99/);
  for (const bad of [null, 5, [], {}, { foo: 1 }]) assert.throws(() => parseProjectFile(bad), /not a project/);
});

test('v1 room becomes openings and fixtures', () => {
  assert.deepEqual(plain(convertRoomV1(roomV1)), { w: 400, l: 500, wall: 20,
    openings: [{ type: 'door', wall: 'right', pos: 100, width: 90, hinge: 'start' },
      { type: 'balcony', wall: 'bottom', pos: 100, width: 200, hinge: 'both' }],
    fixtures: [{ type: 'chimney', x: 360, y: 0, w: 40, d: 40 }, { type: 'radiator', x: 310, y: 490, w: 50, d: 10 }] });
  assert.equal(convertRoomV1({ ...roomV1, door: { ...roomV1.door, hingeTop: false } }).openings[0].hinge, 'end');
  const g = get('roomGeo'), a = g(convertRoomV1(roomV1)), b = g(ROOM);
  assert.deepEqual(plain(a), plain(b));
});

test('v1 export: room, furniture, working state and variants all arrive', () => {
  const a = item('a', 'bed', 100, 110, 140, 200, 90), b = item('b', 'custom', 700, 50, 40, 40);
  const file = { app: 'roomPlanner', version: 1, room: roomV1, current: { items: [a, { ...b, hidden: true }] },
    variants: { V: { items: [{ ...a, x: 200 }, b], savedAt: 7 } } };
  const { project: p, warnings } = parseProjectFile(file, { name: 'Old' });
  assert.deepEqual(plain(warnings), []);
  assert.equal(p.name, 'Old');
  assert.deepEqual(plain(p.room.fixtures.map(f => f.type)), ['chimney', 'radiator']);
  assert.deepEqual(plain(p.furniture.map(f => f.id)), ['a', 'b']);
  assert.equal(p.furniture[0].x, undefined);
  assert.deepEqual(plain(p.current), { place: { a: [100, 110, 90] } }, 'the hidden piece is parked');
  assert.deepEqual(plain(p.layouts), [{ name: 'V', savedAt: 7, place: { a: [200, 110, 90], b: [700, 50, 0] } }]);
});

test('v1 without a room lands in the fallback room with a warning, or fails', () => {
  const data = { items: [item('a', 'custom', 10, 10, 40, 40)] };
  const { project: p, warnings } = parseProjectFile(data, { fallbackRoom: ROOM });
  assert.equal(p.room.w, ROOM.w);
  assert.match(warnings[0], /no room/);
  assert.throws(() => parseProjectFile(data), /room is missing/);
});

test('v1 variants: a differing size becomes furniture of its own, a stale name does not', () => {
  const shelf = item('s', 'shelf', 10, 10, 80, 30);
  const { project: p } = parseProjectFile({ room: roomV1, current: { items: [shelf] }, variants: {
    Renamed: { items: [{ ...shelf, name: 'Old name' }] },
    Wider: { items: [{ ...shelf, w: 120 }] },
    Again: { items: [{ ...shelf, w: 120 }] },
  } });
  assert.deepEqual(plain(p.furniture.map(f => [f.id, f.w])), [['s', 80], ['s_2', 120]]);
  const by = n => plain(p.layouts.find(l => l.name === n));
  assert.deepEqual(Object.keys(by('Renamed').place), ['s']);
  assert.deepEqual(Object.keys(by('Wider').place), ['s_2']);
  assert.deepEqual(Object.keys(by('Again').place), ['s_2']);
  assert.ok(p.layouts.every(l => !l.hidden));
  const inRoom = items => plain(get('activeItems')(items, p.room).map(i => i.w));
  assert.deepEqual(inRoom(layoutItems(p, p.layouts.find(l => l.name === 'Wider'))), [120]);
  assert.deepEqual(inRoom(projectItems(p)), [80], 'the extra copy waits in the parking area of the working room');
});

test('v1 backup: proposals and reviews become one layout type', () => {
  const data = { ROOM: roomV1, DEFAULT_ITEMS: [def('a'), def('b')], DEFAULT_W: { bed: 3 },
    PRESETS: [{ name: 'P1', idea: ['i'], place: { a: [10, 20, 0] } }, { name: 'P2', idea: [], place: { b: [30, 40, 0] } }],
    SETUPS: [{ name: 'P2', now: true, score, pro: ['p'], con: ['c'], tip: 't' }, { name: 'Lost', score }],
    variants: { P1: { items: [item('a', 'custom', 1, 2, 40, 40)], savedAt: 3 } } };
  const { project: p, warnings } = parseProjectFile(data);
  assert.deepEqual(plain(p.layouts.map(l => l.name)), ['P1', 'P2', 'P1 (saved)']);
  assert.equal(p.layouts[1].review.now, true);
  assert.equal(p.layouts[0].review, undefined);
  assert.deepEqual(plain(p.current.place), { b: [30, 40, 0] }, 'starts on the layout marked as today');
  assert.equal(p.weights.bed, 3);
  assert.match(warnings[0], /1 review/);
});

test('a damaged v1 file fails as a whole', () => {
  assert.throws(() => parseProjectFile({ room: { w: 400 }, items: [] }), /room/);
  assert.throws(() => parseProjectFile({ room: roomV1, items: [{ id: 'a', name: 'a', kind: 'x', w: 1, d: 1, color: '#000000', x: 0, y: 0, rot: 0 }] }), /kind/);
  assert.throws(() => parseProjectFile({ room: roomV1, items: [item('a', 'custom', 'x', 0, 40, 40)] }), /place/);
  assert.throws(() => parseProjectFile({ room: roomV1, variants: { V: {} } }), /variants\.V\.items/);
  assert.throws(() => parseProjectFile({ room: roomV1, PRESETS: [{ name: 'P' }] }), /PRESETS\[0\]/);
});

test('deleted layouts: a note outlives older copies, a later save beats it, and it stays out of files', () => {
  const copy = (over = {}) => validateProject(project({ id: 'x', updatedAt: 5, ...over }));
  const named = p => plain(p.layouts.map(l => l.name));
  const withLayouts = copy({ layouts: [{ name: 'A', place: {}, savedAt: 10 }, { name: 'B', place: {} }] });
  const gone = get('withoutLayout')(withLayouts, 'A');
  assert.deepEqual(named(gone), ['B']);
  assert.equal(gone.deletedLayouts[0].name, 'A');
  assert.equal(named(withLayouts).length, 2, 'the copy it came from stays as it was');
  for (const [a, b] of [[gone, withLayouts], [withLayouts, gone]]) assert.deepEqual(named(mergeProjects(a, b)), ['B']);
  assert.deepEqual(plain(mergeProjects(withLayouts, gone).deletedLayouts), plain(gone.deletedLayouts));

  const noted = copy({ layouts: [], deletedLayouts: [{ name: 'A', at: 20 }] });
  const later = copy({ layouts: [{ name: 'A', place: {}, savedAt: 30 }] }), same = copy({ layouts: [{ name: 'A', place: {}, savedAt: 20 }] });
  assert.deepEqual(named(mergeProjects(noted, later)), ['A']);
  assert.deepEqual(named(mergeProjects(noted, same)), [], 'a tie stays deleted');
  assert.deepEqual(plain(mergeProjects(copy({ deletedLayouts: [{ name: 'A', at: 3 }] }), noted).deletedLayouts), [{ name: 'A', at: 20 }]);

  assert.equal(exportProject(gone).deletedLayouts, undefined);
  const file = { ...JSON.parse(JSON.stringify(exportProject(gone))), deletedLayouts: [{ name: 'A', at: 1 }] };
  assert.equal(parseProjectFile(file).project.deletedLayouts, undefined);
});

test('deleted layouts: the note is checked like everything else and has an upper limit', () => {
  for (const bad of [3, [3], [{ name: '', at: 1 }], [{ name: 'A', at: 'x' }], [{ name: 'A', at: -1 }]])
    assert.throws(() => validateProject(project({ deletedLayouts: bad })), /deletedLayouts/);
  let p = validateProject(project({ layouts: [] }));
  p.deletedLayouts = Array.from({ length: get('MAX_LIST') }, (_, i) => ({ name: `n${i}`, at: i }));
  p = get('withoutLayout')(p, 'new');
  assert.equal(p.deletedLayouts.length, get('MAX_LIST'));
  assert.equal(p.deletedLayouts.at(-1).name, 'new');
  validateProject(p);
});

test('mergeProjects: newer copy decides, layouts join, newer save wins, working state stays', () => {
  const base = project({ layouts: [{ name: 'A', place: {}, savedAt: 5 }, { name: 'B', place: {}, savedAt: 5 }] });
  const mine = { ...base, name: 'Mine', updatedAt: 1, current: { place: { a: [1, 1, 0] } } };
  const theirs = { ...base, name: 'Theirs', updatedAt: 2, current: { place: { a: [9, 9, 0] } },
    layouts: [{ name: 'A', place: { a: [2, 2, 0] }, savedAt: 9 }, { name: 'C', place: {}, savedAt: 1 }] };
  const m = plain(mergeProjects(mine, theirs));
  assert.equal(m.name, 'Theirs');
  assert.deepEqual(m.layouts.map(l => l.name), ['A', 'C', 'B']);
  assert.equal(m.layouts[0].savedAt, 9);
  assert.deepEqual(m.current.place.a, [1, 1, 0]);
  const r = plain(mergeProjects({ ...theirs, current: undefined, updatedAt: 0 }, mine));
  assert.deepEqual(r.current.place.a, [1, 1, 0], 'a device without working state takes the other one');
  assert.equal(r.layouts.find(l => l.name === 'A').savedAt, 9, 'the newer save wins from the older copy too');
});

test('a suffix fits into the limit of a name', () => {
  const max = get('MAX_NAME'), suffixed = get('withSuffix');
  assert.equal(suffixed('Sofa', ' (copy)'), 'Sofa (copy)');
  const name = suffixed('n'.repeat(max), ' (copy)');
  assert.equal(name.length, max);
  assert.ok(name.endsWith(' (copy)'));
  assert.equal(suffixed(`${'n'.repeat(max - 8)} tail`, ' (copy)'), `${'n'.repeat(max - 8)} (copy)`, 'no blank before it');
});

test('a free furniture id stays within the limit', () => {
  const max = get('MAX_NAME'), unique = get('uniqueItemId'), long = 'i'.repeat(max);
  assert.equal(unique('sofa', () => false), 'sofa');
  assert.equal(unique('sofa', id => id === 'sofa'), 'sofa_2');
  assert.equal(unique(long, id => id === long), `${'i'.repeat(max - 2)}_2`);
  const taken = new Set([long, `${'i'.repeat(max - 2)}_2`]);
  assert.equal(unique(long, id => taken.has(id)), `${'i'.repeat(max - 2)}_3`);
});

test('a project stays valid after both limits are hit', () => {
  const max = get('MAX_NAME'), long = 'x'.repeat(max);
  const a = { id: long, name: long, kind: 'custom', w: 50, d: 50, color: '#888888' };
  const copy = { ...a, id: get('uniqueItemId')(a.id, id => id === a.id), name: get('withSuffix')(a.name, ' (Kopie)') };
  assert.doesNotThrow(() => get('validateProject')({ name: 'P', room: ROOM, furniture: [a, copy], layouts: [] }));
});
