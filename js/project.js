// @ts-check
// The project format: what a project holds, how it is checked and how older files are converted.
// No DOM and no storage. Every file from outside goes through validateProject(), which keeps only known
// fields, so nothing unchecked reaches the page.

/**
 * Scores are worked out by reviewLayout(). What a layout can carry are the notes of an older file.
 * @typedef {{ pro: string[], con: string[], tip: string, now?: boolean }} Review
 * @typedef {Placement & { name: string, savedAt?: number, idea?: string[], review?: Review }} Layout
 * @typedef {Placement & { name?: string }} Current
 * @typedef {{ id?: string, name: string, room: Room, furniture: ItemDef[], layouts: Layout[], current?: Current,
 *   weights?: Record<string, number>, baseWeights?: Record<string, number>, profile?: string, updatedAt?: number,
 *   legacy?: boolean, deletedLayouts?: { name: string, at: number }[] }} Project
 */

const PROJECT_APP = 'room-blueprint', PROJECT_VERSION = 2;
const WALLS = ['top', 'right', 'bottom', 'left'];
const OPENING_TYPES = ['door', 'balcony', 'window'], HINGES = ['start', 'end', 'both'], SWINGS = ['in', 'out'];
const KINDS = Object.keys(KIND_H);
// The kinds a shape other than a plain rectangle is drawn and checked for
const ITEM_SHAPES = { round: ['table', 'custom'], L: ['sofa', 'custom'] };
const MAX_ROOM = 5000, MAX_ITEM = 2000, MAX_COORD = 1e6, MAX_NAME = 200, MAX_TEXT = 5000, MAX_LIST = 1000;

class ProjectError extends Error {}

/**
 * A name or id with a suffix, shortened so that the result still passes validateProject.
 * @param {string} base @param {string} suffix
 */
const withSuffix = (base, suffix) => base.slice(0, MAX_NAME - suffix.length).trimEnd() + suffix;

/** @param {string} path @param {string} msg @returns {never} */
const fail = (path, msg) => { throw new ProjectError(`${path} ${msg}`); };
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

function num(v, path, min, max) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(path, `must be a number from ${min} to ${max}`);
  return v;
}
function int(v, path, min, max) {
  if (!Number.isInteger(num(v, path, min, max))) fail(path, 'must be a whole number');
  return v;
}
function str(v, path, max = MAX_NAME) {
  if (typeof v !== 'string' || !v || v.length > max) fail(path, `must be a text of 1 to ${max} characters`);
  return v;
}
function oneOf(v, path, allowed) {
  if (!allowed.includes(v)) fail(path, `must be one of: ${allowed.join(', ')}`);
  return v;
}
function list(v, path) {
  if (!Array.isArray(v) || v.length > MAX_LIST) fail(path, `must be a list of at most ${MAX_LIST} entries`);
  return v;
}
function obj(v, path) {
  if (!isObj(v)) fail(path, 'must be an object');
  return v;
}
const texts = (v, path) => list(v, path).map((t, i) => {
  if (typeof t !== 'string' || t.length > MAX_TEXT) fail(`${path}[${i}]`, 'must be a text');
  return t;
});

/** @param {any} r @returns {Room} */
function cleanRoom(r) {
  obj(r, 'room');
  const w = num(r.w, 'room.w', 50, MAX_ROOM), l = num(r.l, 'room.l', 50, MAX_ROOM);
  const wall = num(r.wall, 'room.wall', 0, 200);
  const openings = list(r.openings, 'room.openings').map((o, i) => {
    const at = `room.openings[${i}]`;
    obj(o, at);
    const side = oneOf(o.wall, `${at}.wall`, WALLS), max = side === 'top' || side === 'bottom' ? w : l;
    const pos = num(o.pos, `${at}.pos`, 0, max), width = num(o.width, `${at}.width`, 1, max);
    if (pos + width > max) fail(at, 'does not fit on its wall');
    const type = oneOf(o.type, `${at}.type`, OPENING_TYPES);
    /** @type {Opening} */
    const out = { type, wall: side, pos, width };
    // A window does not swing, so its hinge is optional
    if (type !== 'window' || o.hinge !== undefined) out.hinge = oneOf(o.hinge, `${at}.hinge`, HINGES);
    // Into the room is the normal case and is not written down
    if (o.swing !== undefined && oneOf(o.swing, `${at}.swing`, SWINGS) === 'out') {
      if (type === 'window') fail(`${at}.swing`, 'cannot be set on a window');
      out.swing = 'out';
    }
    if (o.name !== undefined) out.name = str(o.name, `${at}.name`);
    if (o.main !== undefined && o.main !== false) {
      if (o.main !== true) fail(`${at}.main`, 'must be true or false');
      if (type === 'window') fail(`${at}.main`, 'cannot be set on a window');
      out.main = true;
    }
    return out;
  });
  if (openings.filter(o => o.main).length > 1) fail('room.openings', 'can have only one main entrance');
  openings.forEach((a, i) => {
    if (openings.some((b, j) => j > i && a.wall === b.wall && a.pos < b.pos + b.width && b.pos < a.pos + a.width))
      fail(`room.openings[${i}]`, 'overlaps another opening');
  });
  const fixtures = list(r.fixtures, 'room.fixtures').map((f, i) => {
    const at = `room.fixtures[${i}]`;
    obj(f, at);
    const x = num(f.x, `${at}.x`, 0, w), y = num(f.y, `${at}.y`, 0, l);
    const fw = num(f.w, `${at}.w`, 1, w), fd = num(f.d, `${at}.d`, 1, l);
    if (x + fw > w || y + fd > l) fail(at, 'does not fit in the room');
    return { type: oneOf(f.type, `${at}.type`, Object.keys(FIXTURES)), x, y, w: fw, d: fd };
  });
  return { w, l, wall, openings, fixtures };
}

/** Shapes a kind can have, without the plain rectangle. @param {string} kind @returns {string[]} */
const shapesFor = kind => Object.keys(ITEM_SHAPES).filter(s => ITEM_SHAPES[s].includes(kind));

function pair(v, path) {
  if (!Array.isArray(v) || v.length !== 2) fail(path, 'must be two numbers');
  return v.map((n, i) => num(n, `${path}[${i}]`, 1, MAX_ITEM));
}

/** @param {any} f @param {string} at @returns {ItemDef} */
function cleanFurniture(f, at) {
  obj(f, at);
  const out = { id: str(f.id, `${at}.id`), name: str(f.name, `${at}.name`), kind: oneOf(f.kind, `${at}.kind`, KINDS),
    w: num(f.w, `${at}.w`, 1, MAX_ITEM), d: num(f.d, `${at}.d`, 1, MAX_ITEM), color: f.color };
  if (typeof f.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(f.color)) fail(`${at}.color`, 'must look like #a1b2c3');
  if (f.h !== undefined) out.h = num(f.h, `${at}.h`, 1, MAX_ROOM);
  if (f.doors !== undefined) out.doors = int(f.doors, `${at}.doors`, 1, 20);
  for (const key of ['mirror', 'flip']) {
    if (f[key] === undefined) continue;
    if (typeof f[key] !== 'boolean') fail(`${at}.${key}`, 'must be true or false');
    out[key] = f[key];
  }
  if (f.image !== undefined) out.image = num(f.image, `${at}.image`, 1, MAX_ROOM);
  if (f.beamer !== undefined) out.beamer = pair(f.beamer, `${at}.beamer`);
  if (f.clear !== undefined) out.clear = num(f.clear, `${at}.clear`, 0, MAX_ITEM);
  if (f.shape !== undefined) out.shape = oneOf(f.shape, `${at}.shape`, shapesFor(out.kind));
  if (f.leg !== undefined) out.leg = pair(f.leg, `${at}.leg`);
  if (f.group !== undefined) out.group = str(f.group, `${at}.group`);
  return out;
}

// Entries for furniture that was deleted since are dropped: that is normal, not a broken file. Older files could also hide
// a piece; it goes to the parking area instead, which the analysis leaves out just the same, so that nothing is invisible.
/** @param {any} p @param {string} at @param {Set<string>} ids @returns {Placement} */
function cleanPlacement(p, at, ids) {
  const place = Object.fromEntries(Object.entries(obj(p.place, `${at}.place`)).filter(([id]) => ids.has(id)).map(([id, pos]) => {
    const where = `${at}.place.${id}`;
    if (!Array.isArray(pos) || pos.length !== 3) fail(where, 'must be [x, y, rotation]');
    return [id, pos.map((v, i) => num(v, `${where}[${i}]`, -MAX_COORD, MAX_COORD))];
  }));
  const hidden = new Set(p.hidden === undefined ? [] : texts(p.hidden, `${at}.hidden`));
  for (const id of hidden) delete place[id];
  return { place };
}

// Older files carry scores given by hand. Scores are worked out now, so whatever a file says there is ignored.
/** @param {any} r @param {string} at @returns {Review} */
function cleanReview(r, at) {
  obj(r, at);
  /** @type {Review} */
  const out = { pro: texts(r.pro ?? [], `${at}.pro`), con: texts(r.con ?? [], `${at}.con`),
    tip: typeof r.tip === 'string' ? r.tip.slice(0, MAX_TEXT) : '' };
  if (r.now === true) out.now = true;
  return out;
}

// Files and browsers from before the English keys
const OLD_CRITERIA = { bett: 'bed', tisch: 'desk', fluss: 'flow', zonen: 'zones' };

/** @param {any} w @param {string} at @returns {Record<string, number>} */
function cleanWeights(w, at) {
  obj(w, at);
  const renamed = Object.fromEntries(Object.entries(OLD_CRITERIA).filter(([old]) => w[old] !== undefined).map(([old, k]) => [k, w[old]]));
  const all = { ...renamed, ...w };
  return Object.fromEntries(CRIT.filter(([k]) => all[k] !== undefined).map(([k]) => [k, int(all[k], `${at}.${k}`, 0, 3)]));
}

/** @param {any} l @param {string} at @param {Set<string>} ids @returns {Layout} */
function cleanLayout(l, at, ids) {
  obj(l, at);
  /** @type {Layout} */
  const out = { name: str(l.name, `${at}.name`), ...cleanPlacement(l, at, ids) };
  if (l.savedAt !== undefined) out.savedAt = num(l.savedAt, `${at}.savedAt`, 0, Number.MAX_SAFE_INTEGER);
  if (l.idea !== undefined) out.idea = texts(l.idea, `${at}.idea`);
  if (l.review !== undefined) out.review = cleanReview(l.review, `${at}.review`);
  return out;
}

/**
 * Checks a project and returns a clean copy with known fields only.
 * @param {any} p
 * @returns {Project}
 * @throws {ProjectError} naming the first thing that is wrong
 */
function validateProject(p) {
  obj(p, 'project');
  const room = cleanRoom(p.room);
  const furniture = list(p.furniture, 'furniture').map((f, i) => cleanFurniture(f, `furniture[${i}]`));
  const ids = new Set(furniture.map(f => f.id));
  if (ids.size !== furniture.length) fail('furniture', 'has the same id twice');
  const layouts = list(p.layouts, 'layouts').map((l, i) => cleanLayout(l, `layouts[${i}]`, ids));
  if (new Set(layouts.map(l => l.name)).size !== layouts.length) fail('layouts', 'has the same name twice');
  /** @type {Project} */
  const out = { name: str(p.name, 'name'), room, furniture, layouts };
  if (p.id !== undefined) out.id = str(p.id, 'id');
  if (p.current !== undefined && p.current !== null) {
    out.current = cleanPlacement(obj(p.current, 'current'), 'current', ids);
    if (p.current.name !== undefined && p.current.name !== null) out.current.name = str(p.current.name, 'current.name');
  }
  if (p.weights !== undefined) out.weights = cleanWeights(p.weights, 'weights');
  if (p.baseWeights !== undefined) out.baseWeights = cleanWeights(p.baseWeights, 'baseWeights');
  if (p.profile !== undefined) out.profile = oneOf(p.profile, 'profile', Object.keys(PROFILES));
  if (p.updatedAt !== undefined) out.updatedAt = num(p.updatedAt, 'updatedAt', 0, Number.MAX_SAFE_INTEGER);
  if (p.legacy === true) out.legacy = true;
  if (p.deletedLayouts !== undefined) out.deletedLayouts = list(p.deletedLayouts, 'deletedLayouts').map((d, i) => {
    const at = `deletedLayouts[${i}]`;
    obj(d, at);
    return { name: str(d.name, `${at}.name`), at: num(d.at, `${at}.at`, 0, Number.MAX_SAFE_INTEGER) };
  });
  return out;
}

/** The items as they stand right now: furniture plus the working placement.
 * @param {Project} p @returns {Item[]} */
const projectItems = p => presetItems(p.room, p.furniture, p.current);

/** @param {Project} p @param {Layout} layout @returns {Item[]} */
const layoutItems = (p, layout) => presetItems(p.room, p.furniture, layout);

/** The layouts that use a piece of furniture. @param {Project} p @param {string} id @returns {Layout[]} */
const layoutsWith = (p, id) => p.layouts.filter(l => Object.hasOwn(l.place, id) || l.hidden?.includes(id));

/** @param {string} base @param {(id: string) => boolean} taken @returns {string} a furniture id that is still free */
function uniqueItemId(base, taken) {
  let id = base;
  for (let n = 2; taken(id); n++) id = withSuffix(base, `_${n}`);
  return id;
}

/** @param {Item[]} items @returns {ItemDef[]} */
const furnitureOf = items => items.map(({ x, y, rot, hidden, ...def }) => def);

/** A hidden piece is left out, so it is parked when the placement is applied. @param {Item[]} items @returns {Placement} */
const placementOf = items => ({ place: Object.fromEntries(items.filter(i => !i.hidden).map(i => [i.id, [i.x, i.y, i.rot]])) });

/** Writes the working items back into the project.
 * @param {Project} p @param {Item[]} items @param {string | null} [name] of the arrangement, for the print title */
function takeItems(p, items, name = p.current?.name) {
  p.furniture = furnitureOf(items);
  p.current = placementOf(items);
  if (name) p.current.name = name;
}

/** @param {Layout[]} layouts @param {string} base @returns {string} a layout name that is still free */
function uniqueLayoutName(layouts, base) {
  let name = base.slice(0, MAX_NAME);
  for (let n = 2; layouts.some(l => l.name === name); n++) name = withSuffix(base, ` (${n})`);
  return name;
}

/**
 * A copy of a project without a layout. The note of when it went keeps another device's older copy from bringing it back.
 * @template {Project} P @param {P} p @param {string} name @returns {P}
 */
function withoutLayout(p, name) {
  const notes = (p.deletedLayouts ?? []).filter(d => d.name !== name);
  return { ...p, layouts: p.layouts.filter(l => l.name !== name),
    deletedLayouts: [...notes, { name, at: Date.now() }].slice(-MAX_LIST) };
}

/**
 * Moves a layout into another project. Furniture the other project does not have comes along; a piece with the same shape
 * and the same id or name is the same piece, so a second layout finds what the first one brought under a new id. Each
 * piece stands for one only, or two equal chairs of a layout would become one. A piece the layout left in the parking area
 * stays parked there too. Notes describe the room they were written for, so they stay behind unless both rooms are the same.
 * @param {Project} source @param {Project} target @param {string} name of the layout
 * @returns {{ source: Project, target: Project, layout: Layout, outside: string[], lostReview: boolean }} new copies;
 *   outside names what lies beyond the walls of the other room
 */
function transferLayout(source, target, name) {
  const layout = source.layouts.find(l => l.name === name);
  if (!layout) fail(`Layout “${name}”`, 'does not exist');
  const furniture = [...target.furniture];
  const taken = id => furniture.some(f => f.id === id);
  const defOf = id => source.furniture.find(f => f.id === id);
  const used = new Set();
  const bring = id => {
    const def = defOf(id), free = target.furniture.filter(f => !used.has(f.id) && sameShape(f, def));
    const same = free.find(f => f.id === id) ?? free.find(f => f.name === def.name);
    const to = same?.id ?? uniqueItemId(id, taken);
    // A group is only known inside its project, and the same name there may mean another group
    if (!same) { const { group, ...own } = def; furniture.push({ ...own, id: to }); }
    used.add(to);
    return to;
  };
  const ids = new Map(Object.keys(layout.place).filter(defOf).map(id => [id, bring(id)]));
  const parked = id => { const [x, y] = layout.place[id]; return !inRoom({ x, y }, source.room); };
  const place = Object.fromEntries([...ids].filter(([id]) => !parked(id)).map(([id, to]) => [to, layout.place[id]]));
  // Whatever the layout hides but the other project lacks was never part of this arrangement
  const hidden = (layout.hidden ?? []).map(id => ids.get(id) ?? (taken(id) ? id : null)).filter(id => id !== null);
  const sameRoom = JSON.stringify(source.room) === JSON.stringify(target.room);
  const { review, ...rest } = layout;
  const moved = { ...rest, ...(sameRoom && review ? { review } : {}), name: uniqueLayoutName(target.layouts, name),
    place, savedAt: Date.now() };
  if (hidden.length) moved.hidden = hidden; else delete moved.hidden;
  const outside = Object.entries(place).filter(([id, [x, y]]) => !hidden.includes(id) && !inRoom({ x, y }, target.room))
    .map(([id]) => furniture.find(f => f.id === id).name);
  return { source: withoutLayout(source, name),
    target: { ...target, furniture, layouts: [...target.layouts, moved] }, layout: moved, outside,
    lostReview: !!review && !sameRoom };
}

/**
 * The names to list projects by. Projects from another device can share a name, and renaming them here would rename them
 * everywhere, so only the list tells them apart.
 * @param {Project[]} projects @returns {string[]} in the same order
 */
function projectLabels(projects) {
  const taken = new Set(projects.map(p => p.name)), seen = new Map();
  return projects.map(p => {
    const n = (seen.get(p.name) ?? 0) + 1;
    seen.set(p.name, n);
    if (n === 1) return p.name;
    let k = n, label = `${p.name} (${k})`;
    while (taken.has(label)) label = `${p.name} (${++k})`;
    taken.add(label);
    return label;
  });
}

/** The file a project is saved as. @param {Project} p */
function exportProject(p) {
  const { id, updatedAt, legacy, deletedLayouts, ...rest } = p;
  return { app: PROJECT_APP, version: PROJECT_VERSION, ...rest };
}

// ---------- Format v1 ----------
// Three shapes exist: the planner's export ({ app, version: 1, room, current, variants }), a bare { items }, and the
// backup of the code constants ({ ROOM, DEFAULT_ITEMS, PRESETS, SETUPS, DEFAULT_W, variants }).

/** @param {any} r */
function convertRoomV1(r) {
  obj(r, 'room');
  const fixtures = [];
  if (Array.isArray(r.chimney)) fixtures.push({ type: 'chimney', x: r.w - r.chimney[0], y: 0, w: r.chimney[0], d: r.chimney[1] });
  if (r.radiator) fixtures.push({ type: 'radiator', x: r.w - r.balcony?.right + r.radiator.offset,
    y: r.l - r.radiator.d, w: r.radiator.w, d: r.radiator.d });
  return { w: r.w, l: r.l, wall: r.wall, fixtures, openings: [
    { type: 'door', wall: 'right', pos: r.door?.fromTop, width: r.door?.w, hinge: r.door?.hingeTop ? 'start' : 'end' },
    { type: 'balcony', wall: 'bottom', pos: r.balcony?.left, width: r.w - r.balcony?.left - r.balcony?.right, hinge: 'both' },
  ] };
}

// In v1 every saved variant carried its own copy of all furniture. Copies that really differ become furniture of their
// own. Names, colours and fields the copy does not have yet do not count: variants were often saved before an edit.
const SHAPE_KEYS = ['kind', 'w', 'd', 'h', 'doors', 'mirror', 'image', 'beamer', 'clear', 'shape', 'leg', 'flip'];
const sameShape = (a, b) => SHAPE_KEYS.every(k => a[k] === undefined || b[k] === undefined ||
  JSON.stringify(a[k]) === JSON.stringify(b[k]));

/** Adds a v1 item to the furniture unless it is there already. @returns {string} the id it has there */
function addFurniture(furniture, item, at) {
  obj(item, at);
  for (let n = 1; ; n++) {
    const id = n === 1 ? item.id : `${item.id}_${n}`, have = furniture.find(f => f.id === id);
    if (!have) { furniture.push({ ...item, id }); return id; }
    if (sameShape(have, item)) return id;
  }
}

/** @param {any[]} items @param {any[]} furniture @param {string} at @returns {Placement} */
function placeV1(items, furniture, at) {
  /** @type {Placement} */
  const out = { place: {}, hidden: [] };
  list(items, at).forEach((it, i) => {
    const id = addFurniture(furniture, it, `${at}[${i}]`);
    Object.defineProperty(out.place, id, { value: [it.x, it.y, it.rot], enumerable: true, writable: true, configurable: true });
    if (it.hidden) out.hidden.push(id);
  });
  return out;
}


/** @param {any} data @param {string} name @param {Room} [fallbackRoom] @param {string[]} [warnings] */
function convertV1(data, name, fallbackRoom, warnings = []) {
  const rawRoom = data.ROOM ?? data.room;
  if (!rawRoom && !fallbackRoom) fail('room', 'is missing');
  if (!rawRoom) warnings.push('The file has no room. It was placed in the starter room.');
  const room = rawRoom ? convertRoomV1(rawRoom) : fallbackRoom;

  const furniture = [];
  const defs = data.DEFAULT_ITEMS === undefined ? [] : list(data.DEFAULT_ITEMS, 'DEFAULT_ITEMS');
  defs.forEach((d, i) => addFurniture(furniture, d, `DEFAULT_ITEMS[${i}]`));
  const cur = data.current ?? (Array.isArray(data.items) ? data : null);
  const start = cur ? placeV1(cur.items, furniture, 'current.items') : null;

  const presets = data.PRESETS === undefined ? [] : list(data.PRESETS, 'PRESETS');
  const setups = data.SETUPS === undefined ? [] : list(data.SETUPS, 'SETUPS');
  const layouts = presets.map((p, i) => {
    const review = setups.find(s => s?.name === p?.name);
    return { name: p?.name, idea: p?.idea, place: obj(p?.place, `PRESETS[${i}].place`), ...(review ? { review } : {}) };
  });
  const orphans = setups.filter(s => !presets.some(p => p?.name === s?.name)).length;
  if (orphans) warnings.push(`${orphans} review(s) had no layout and were left out.`);

  const taken = new Set(layouts.map(l => l.name));
  const variants = data.variants === undefined ? {} : obj(data.variants, 'variants');
  const saved = Object.entries(variants).map(([n, v]) => {
    const at = `variants.${n}`;
    const name = taken.has(n) ? `${n} (saved)` : n;
    taken.add(name);
    return { name, savedAt: obj(v, at).savedAt, ...placeV1(v.items, furniture, `${at}.items`) };
  });
  // Furniture a v1 variant did not contain was not part of it: like its hidden items, it waits in the parking area there
  layouts.push(...saved);

  const now = layouts.find(l => l.review?.now);
  const current = start ?? (now && { place: now.place });
  return { name, room, furniture, layouts, current, weights: data.DEFAULT_W };
}

// The weights a file brings are the standard of that project, or the first change would lose them. Checked again for the
// order of the fields: a sync compares projects as text, and this one must equal the same project coming back from the server.
/** @param {Project} p */
const withBaseWeights = p => p.weights && !p.baseWeights && !p.profile ? validateProject({ ...p, baseWeights: { ...p.weights } }) : p;

/**
 * Turns the content of a project file, in any known format, into a checked project.
 * @param {any} data parsed JSON
 * @param {{ name?: string, fallbackRoom?: Room }} [opts] name if the file has none; room for v1 files without one
 * @returns {{ project: Project, warnings: string[] }}
 */
function parseProjectFile(data, { name = 'Imported project', fallbackRoom } = {}) {
  if (!isObj(data)) fail('The file', 'is not a project');
  if (data.app === PROJECT_APP) {
    if (data.version !== PROJECT_VERSION) fail('The file', `has version ${data.version}, this app reads ${PROJECT_VERSION}`);
    const { app, version, id, updatedAt, legacy, deletedLayouts, ...rest } = data;
    return { project: withBaseWeights(validateProject({ ...rest, name: rest.name ?? name })), warnings: [] };
  }
  if (['ROOM', 'room', 'DEFAULT_ITEMS', 'PRESETS', 'current', 'variants', 'items'].some(k => k in data)) {
    const warnings = [];
    return { project: withBaseWeights(validateProject(convertV1(data, name, fallbackRoom, warnings))), warnings };
  }
  return fail('The file', 'is not a project');
}

/**
 * Brings two copies of a project together: the newer one decides room and furniture, layouts are joined by name with the
 * newer save winning. A layout deleted after its last save stays deleted. The working placement stays local, each device
 * keeps its own.
 * @param {Project} local @param {Project} remote @returns {Project}
 */
function mergeProjects(local, remote) {
  const [a, b] = (remote.updatedAt || 0) > (local.updatedAt || 0) ? [remote, local] : [local, remote];
  const notes = new Map();
  for (const d of [...(a.deletedLayouts ?? []), ...(b.deletedLayouts ?? [])]) notes.set(d.name, Math.max(d.at, notes.get(d.name) ?? 0));
  const layouts = new Map(a.layouts.map(l => [l.name, l]));
  for (const l of b.layouts) {
    const have = layouts.get(l.name);
    if (!have || (l.savedAt || 0) > (have.savedAt || 0)) layouts.set(l.name, l);
  }
  const alive = [...layouts.values()].filter(l => !notes.has(l.name) || (l.savedAt || 0) > notes.get(l.name));
  const merged = { ...a, layouts: alive };
  if (notes.size) merged.deletedLayouts = [...notes].map(([name, at]) => ({ name, at })).sort((x, y) => x.at - y.at).slice(-MAX_LIST);
  const current = local.current ?? remote.current;
  if (current) merged.current = current; else delete merged.current;
  return merged;
}
