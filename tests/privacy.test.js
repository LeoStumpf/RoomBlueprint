'use strict';
// Nothing of the private project may be in the published files: no names, no texts, no room measures.
// Reads the private file, so it is skipped where that does not exist.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ROOT, PRIVATE_DIR } = require('./load');

const file = path.join(PRIVATE_DIR, 'private-project.json');
const noPrivateFile = !fs.existsSync(file) && 'no private project';

const toolFiles = () => execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter(f => f && fs.existsSync(path.join(ROOT, f)));

// A short phrase is only looked for as a whole word, or any longer word that contains it would count
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const finder = p => p.length <= 4 ? new RegExp(`(?<![\\p{L}\\p{N}])${escape(p)}(?![\\p{L}\\p{N}])`, 'iu') : new RegExp(escape(p), 'iu');
// The brand filter of the catalog test names real brands on purpose, so that the catalog cannot use them. One of them is
// also a private term; the term alone gives nothing away (an open question in the roadmap).
const BRAND_LIST = /const brands = \/.*\/i;/;
// One room of the library is the private room itself, shared by its owner (decision of 2026-11-07): its size, wall, door,
// balcony door, radiator and chimney, with generic furniture names and layouts of its own. Only the size line of that one
// room in demo/rooms.js is exempt, and only once. The same measures anywhere else, and every other private phrase, still fail.
const LIBRARY_FILE = 'demo/rooms.js', LIBRARY_ROOM = 'Long bedroom with a chimney', LIBRARY_REACH = 400;
/** @param {string} src @param {{ w: number, l: number, wall: number }} room */
function withoutLibraryRoom(src, room) {
  const size = `w: ${room.w}, l: ${room.l}, wall: ${room.wall},`, at = src.indexOf(`name: '${LIBRARY_ROOM}'`);
  const i = at < 0 ? -1 : src.indexOf(size, at);
  return i < 0 || i - at > LIBRARY_REACH ? src : src.slice(0, i) + src.slice(i + size.length);
}
const published = (f, room) => {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (f === LIBRARY_FILE && room) return withoutLibraryRoom(src, room);
  return f === 'tests/furniture.test.js' ? src.replace(BRAND_LIST, '') : src;
};

test('no private content in the tool', { skip: noPrivateFile }, () => {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  // Words that would give the source away if this test listed them itself
  const termFile = path.join(PRIVATE_DIR, 'private-terms.json');
  const terms = fs.existsSync(termFile) ? JSON.parse(fs.readFileSync(termFile, 'utf8')) : [];
  // Furniture names are plain words like any catalog's, so only the telling ones count (a number, a note in brackets)
  const phrases = [
    ...data.PRESETS.flatMap(p => [p.name, ...p.idea]),
    ...data.SETUPS.flatMap(s => [...s.pro, ...s.con, s.tip]),
    ...data.DEFAULT_ITEMS.map(i => i.name).filter(n => /\d|\(/.test(n) && n.length > 4),
    ...Object.keys(data.variants),
    `${data.ROOM.w} × ${data.ROOM.l}`, `w: ${data.ROOM.w}, l: ${data.ROOM.l}`, ...terms,
  ].map(s => s.trim()).filter(s => s.length > 2 && !/^test\d$/i.test(s));
  assert.ok(phrases.length > 50);
  assert.ok(terms.every(t => phrases.includes(t.trim())), 'every private term is checked, the short ones too');
  const finders = phrases.map(p => [p, finder(p)]);
  for (const f of toolFiles()) {
    const src = published(f, data.ROOM);
    for (const [p, re] of finders) assert.ok(!re.test(src), `${f} contains a private phrase (${p.length} characters)`);
  }
});

test('the privacy check ignores case and finds short terms as words only', () => {
  assert.ok(finder('Some private phrase').test('… SOME PRIVATE phrase …'));
  assert.ok(finder('Abcd').test('see abcd.'));
  assert.ok(finder('Abcd').test('"ABCD"'));
  assert.ok(!finder('Abcd').test('abcdef xabcd'), 'part of a longer word is no hit');
  assert.ok(!finder('Äbc').test('xäbc'), 'letters beyond ASCII count as word letters');
  assert.ok(finder('a.b').test('A.B') && !finder('a.b').test('axb'), 'the phrase is literal text, not a pattern');
  assert.match(published('tests/furniture.test.js'), /brands/, 'only the list itself is left out');
  assert.doesNotMatch(published('tests/furniture.test.js'), /const brands = \//);
});

test('the exception for the shared library room is narrow', () => {
  const room = { w: 111, l: 222, wall: 9 }, line = 'w: 111, l: 222, wall: 9,';
  const src = `{\n    group: 'Bedroom', name: '${LIBRARY_ROOM}', hint: 'x',\n    room: {\n      ${line}\n`;
  assert.ok(!withoutLibraryRoom(src, room).includes(line), 'the size of that room is left out');
  assert.ok(withoutLibraryRoom(`${src}\n${line}`, room).includes(line), 'a second copy is still found');
  assert.ok(withoutLibraryRoom(`${line}\n${src}`, room).includes(line), 'a copy before the room is still found');
  assert.ok(withoutLibraryRoom(src.replace(LIBRARY_ROOM, 'Some other room'), room).includes(line), 'no other room is exempt');
  assert.ok(withoutLibraryRoom(`${src.slice(0, -line.length - 1)}${' '.repeat(LIBRARY_REACH)}${line}`, room).includes(line),
    'only right at the name of the room');
});

test('the shared library room is the private room, and no more of it than allowed', { skip: noPrivateFile }, () => {
  const { load, PROJECT_SCRIPTS } = require('./load');
  const { get } = load(PROJECT_SCRIPTS);
  const data = JSON.parse(fs.readFileSync(file, 'utf8')), t = get('DEMO_ROOMS').find(r => r.name === LIBRARY_ROOM);
  assert.ok(t, 'the room is in the library');
  const mine = JSON.parse(JSON.stringify(get('convertRoomV1')(data.ROOM)));
  const shape = r => ({ w: r.w, l: r.l, wall: r.wall, fixtures: r.fixtures,
    openings: r.openings.map(({ name, ...o }) => o) });
  assert.deepEqual(shape(JSON.parse(JSON.stringify(t.room))), shape(mine), 'room, door, balcony door, radiator and chimney');
  // The furniture keeps its sizes under generic names. The projector board became an ordinary TV.
  const sizes = list => list.filter(i => i.kind !== 'tv' && i.kind !== 'television').map(i => `${i.kind} ${i.w}x${i.d}`).sort();
  assert.deepEqual([...sizes(t.furniture)], sizes(data.DEFAULT_ITEMS));
  assert.ok(t.furniture.every(i => !data.DEFAULT_ITEMS.some(d => d.name === i.name || d.id === i.id)), 'names and ids are generic');
  assert.ok(t.furniture.every(i => !i.beamer && !i.image), 'no projector');
  const own = new Set([...data.PRESETS.map(p => p.name), ...Object.keys(data.variants)].map(n => n.toLowerCase()));
  assert.ok(t.layouts.every(l => !own.has(l.name.toLowerCase())), 'layouts of its own');
});

test('no colour of the private furniture in any file', { skip: noPrivateFile }, () => {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const colors = [...new Set(data.DEFAULT_ITEMS.map(i => i.color.toLowerCase()))];
  assert.ok(colors.length > 0);
  for (const f of toolFiles()) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8').toLowerCase();
    for (const c of colors) assert.ok(!src.includes(c), `${f} contains a colour of the private project`);
  }
});
