'use strict';
// Loads the classic browser scripts into a sandbox, the same way the pages do: one shared global scope,
// no modules. get('name') reads a top-level const, let or function from that scope.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const PRIVATE_DIR = process.env.ROOM_PRIVATE_DIR || path.join(os.homedir(), '.config/roomblueprint');
const PROJECT_SCRIPTS = ['demo/rooms.js', 'js/platform.js', 'js/geometry.js', 'js/analyze.js', 'js/project.js', 'js/recommend.js', 'js/workspace.js',
  'js/room-edit.js', 'js/catalog.js', 'js/item-edit.js'];

function load(files, globals = {}) {
  const ctx = vm.createContext({ ...globals });
  for (const f of files)
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { get: name => vm.runInContext(name, ctx), ctx };
}

// Values from the sandbox have foreign prototypes, which deepStrictEqual rejects
const plain = v => JSON.parse(JSON.stringify(v));

// Invented room, unrelated to any real one: door in the right wall, balcony door at the bottom
const ROOM = {
  w: 400, l: 500, wall: 20,
  openings: [
    { type: 'door', wall: 'right', pos: 100, width: 90, hinge: 'start' },
    { type: 'balcony', wall: 'bottom', pos: 100, width: 200, hinge: 'both' },
  ],
  fixtures: [
    { type: 'chimney', x: 360, y: 0, w: 40, d: 40 },
    { type: 'radiator', x: 310, y: 490, w: 50, d: 10 },
  ],
};

const item = (id, kind, x, y, w, d, rot = 0, extra = {}) =>
  ({ id, name: id, kind, x, y, w, d, rot, color: '#888888', hidden: false, ...extra });

module.exports = { ROOT, PRIVATE_DIR, PROJECT_SCRIPTS, load, plain, ROOM, item };
