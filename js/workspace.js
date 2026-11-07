// @ts-check
// The projects in this browser: one storage key per project plus an index. Older browser data is carried over here.

const INDEX_KEY = 'roomBlueprint.index', PROJECT_KEY = 'roomBlueprint.project.', TEMPLATES_KEY = 'roomBlueprint.templates';
const DELETED_KEY = 'roomBlueprint.deleted';
const LEGACY_CURRENT = 'roomPlanner.current', LEGACY_VARIANTS = 'roomPlanner.variants', LEGACY_WEIGHTS = 'roomPlanner.fsWeights';
// One "Show on the plan" switch per page
const OVERLAY_KEYS = { plan: 'roomBlueprint.overlay.plan', check: 'roomBlueprint.overlay.check', compare: 'roomBlueprint.overlay.compare' };
// Saved under the old product name. Their values move, once, before any page reads them.
const RENAMED_KEYS = [['roomPlanner.fs', OVERLAY_KEYS.plan], ['roomPlanner.fsAnalysis', OVERLAY_KEYS.check], ['roomPlanner.compareFs', OVERLAY_KEYS.compare]];
// Nothing reads these any more
const ABANDONED_KEYS = ['roomPlanner.compare', 'roomPlanner.planName'];
// The data of the old single-room version. Read once to build the stand-in project, then removed (see dropLegacyKeys).
const LEGACY_KEYS = [LEGACY_CURRENT, LEGACY_VARIANTS, LEGACY_WEIGHTS];

/** A value already under the new name wins. A refused write keeps the old key for the next load. */
function renameStoreKeys() {
  for (const [from, to] of RENAMED_KEYS) {
    const value = storeGet(from);
    if (value === null || storeGet(to) !== null || storeSet(to, value)) storeRemove(from);
  }
  ABANDONED_KEYS.forEach(storeRemove);
  // A browser that carried the old data over before the keys were removed: the stand-in already holds it
  const index = storeGet(INDEX_KEY);
  if (Array.isArray(index?.ids) && index.ids.some(id => storeGet(PROJECT_KEY + id)?.legacy === true)) dropLegacyKeys();
}

const dropLegacyKeys = () => LEGACY_KEYS.forEach(storeRemove);
renameStoreKeys();

const newProjectId = () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Every project needs an id of its own: two devices with the same id count as one project when they sync, and the
// newer furniture replaces the other. Only a project that goes through addProject may start without one.
/** @param {string} [id] @param {string} [name] @returns {Project} */
const starterProject = (id, name = STARTER_PROJECT.name) => validateProject({ ...templateProject(STARTER_PROJECT, name), id });

/** @param {string} id @returns {Project | null} */
function readProject(id) {
  const raw = storeGet(PROJECT_KEY + id);
  if (!raw) return null;
  // Saved before projects remembered their standard: the weights they have are the best guess, and Balanced stays selectable
  try { return withBaseWeights(validateProject(raw)); } catch { return null; }
}

/** @param {Project} p @returns {boolean} whether it was stored */
const writeProject = p => storeSet(PROJECT_KEY + p.id, p);

/** Listed projects that fail the checks, so that no list shows them. The stored text stays for rescue.
 * @returns {{ id: string, text: string }[]} */
const unreadableProjects = () => readIndex().ids.filter(id => !readProject(id)).flatMap(id => {
  const text = storeRaw(PROJECT_KEY + id);
  return text === null ? [] : [{ id, text }];
});

/** What a browser of the old single-room version still holds. Unreadable keys are left alone. */
function legacyState() {
  const current = storeGet(LEGACY_CURRENT), variants = storeGet(LEGACY_VARIANTS);
  const placed = current?.items?.length > 0;
  if (!placed && !(variants && Object.keys(variants).length)) return null;
  return { current: placed ? current : undefined, variants: variants ?? undefined,
    weights: storeGet(LEGACY_WEIGHTS) ?? undefined };
}

// That version kept the room in its code, so the browser only knows the furniture: the project gets the starter room
// and keeps the legacy mark until a file with the real room is imported.
function legacyProject() {
  const old = legacyState();
  if (!old) return null;
  try {
    const { project: p } = parseProjectFile({ current: old.current, variants: old.variants, DEFAULT_W: old.weights },
      { name: 'Earlier browser data', fallbackRoom: STARTER_PROJECT.room });
    return { ...p, id: newProjectId(), legacy: true };
  } catch { return null; }
}

function readIndex() {
  const index = storeGet(INDEX_KEY);
  if (Array.isArray(index?.ids) && index.ids.length) return index;
  const first = legacyProject() ?? starterProject(newProjectId());
  const fresh = { active: first.id, ids: [first.id] };
  // Without an index the next read starts over with a new id, and this project would stay behind for good
  if (writeProject(first)) {
    if (!storeSet(INDEX_KEY, fresh)) storeRemove(PROJECT_KEY + first.id);
    // Only once project and index are stored does the stand-in hold the old data for good
    else if (first.legacy) dropLegacyKeys();
  }
  return fresh;
}

/** @returns {Project[]} every readable project, in the order of the index */
const allProjects = () => readIndex().ids.map(readProject).filter(p => p !== null);

let startersChecked = false;

// A browser from before the demo rooms holds a starter room without layouts. Nothing was ever saved in it (no updatedAt), so
// the current one can take its place.
function renewStarters({ ids }) {
  if (startersChecked) return;
  startersChecked = true;
  for (const id of ids) {
    const p = readProject(id);
    if (p && !p.updatedAt && !p.legacy && !p.layouts.length && p.name === STARTER_PROJECT.name) writeProject(starterProject(id));
  }
}

/** The open project. Falls back to another one, or to the starter room if nothing is readable. @returns {Project} */
function activeProject() {
  const index = readIndex();
  renewStarters(index);
  const open = readProject(index.active) ?? allProjects()[0];
  if (open) return open;
  // Unlisted, its first save would be gone on the next load
  const first = starterProject(newProjectId());
  if (writeProject(first) && !storeSet(INDEX_KEY, { active: first.id, ids: [...index.ids, first.id] })) storeRemove(PROJECT_KEY + first.id);
  return first;
}

/** A demo room to work with: it opens on its first layout. Its weights follow its profile until they are changed.
 * @param {typeof DEMO_ROOMS[number]} template @param {string} name @returns {Project} ready for addProject */
const templateProject = ({ room, furniture, layouts, profile }, name) => validateProject({ name, room, furniture, layouts, profile,
  current: { place: layouts[0].place, name: layouts[0].name } });

/** The room library by group, in the order of DEMO_GROUPS. Each room keeps its index in DEMO_ROOMS, which the start
 * dialog uses as its key. A room with a group that is not listed comes last under its own name, so none goes missing.
 * @param {typeof DEMO_ROOMS} [rooms] @param {string[]} [groups] @returns {{ name: string, rooms: { i: number, room: typeof DEMO_ROOMS[number] }[] }[]} */
function libraryGroups(rooms = DEMO_ROOMS, groups = DEMO_GROUPS) {
  const names = [...groups, ...rooms.map(r => r.group).filter(g => !groups.includes(g))];
  return [...new Set(names)].map(name => ({ name, rooms: rooms.map((room, i) => ({ i, room })).filter(e => e.room.group === name) }))
    .filter(g => g.rooms.length);
}

/** An empty room: no openings, no fixtures, no furniture.
 * @param {string} name @param {{ w: number, l: number, wall: number }} size @returns {Project} ready for addProject */
const emptyProject = (name, { w, l, wall }) =>
  validateProject({ name, room: { w, l, wall, openings: [], fixtures: [] }, furniture: [], layouts: [] });

/**
 * Moves a layout from the open project into a stored one. The other project is written first, so a refused write
 * loses nothing.
 * @param {Project} source the open project @param {string} targetId @param {string} name of the layout
 * @returns {ReturnType<typeof transferLayout>}
 * @throws {ProjectError} if the other project is gone or cannot be stored
 */
function moveLayout(source, targetId, name) {
  const target = readProject(targetId);
  if (!target) throw new ProjectError('The other project could not be read.');
  const out = transferLayout(source, target, name);
  validateProject(out.target);
  if (!saveProject(out.target)) throw new ProjectError('This browser could not store the project. Its storage is full or blocked.');
  return out;
}

/** @param {string} id */
const setActiveProject = id => storeSet(INDEX_KEY, { ...readIndex(), active: id });

/** Stores a change to a project. @param {Project} p @returns {boolean} whether it was stored */
function saveProject(p) {
  p.updatedAt = Date.now();
  return writeProject(p);
}

const workingState = p => {
  const { room, furniture, current } = validateProject(p);
  return JSON.stringify({ room, furniture, current });
};

/**
 * Whether what a page has open differs from the stored project in anything its working items are built from.
 * Both go through validateProject, so only what a stored project would really hold is compared.
 * @param {Project} open @param {Project} stored
 */
const staleWorkingState = (open, stored) => workingState(open) !== workingState(stored);

/**
 * What a drag that is about to be saved can stand on, after the stored project changed while it ran.
 * @param {Project} open the page's project. Only a room drag has changed it so far, in room.
 * @param {Project} stored
 * @param {Room} [startRoom] the room at the start of a room drag
 * @returns {Project | null} the stored copy with the room of the drag, or null if the room, furniture or placement changed:
 *   the drag worked on what is no longer there, and saving it would undo that change
 */
function dragOverStored(open, stored, startRoom = open.room) {
  return staleWorkingState({ ...open, room: startRoom }, stored) ? null : { ...stored, room: open.room };
}

/** @param {string} base @param {string} [self] id of a project that may keep its name */
function uniqueProjectName(base, self) {
  const names = allProjects().filter(p => p.id !== self).map(p => p.name);
  let name = base.slice(0, MAX_NAME);
  for (let n = 2; names.includes(name); n++) name = withSuffix(base, ` (${n})`);
  return name;
}

/**
 * Adds a project and opens it. If it cannot be stored, everything stays as it was.
 * @param {Project} p @returns {Project} the stored project
 * @throws {ProjectError} if the browser refuses to store it
 */
function addProject(p) {
  const index = readIndex();
  const stored = { ...p, id: newProjectId(), name: uniqueProjectName(p.name) };
  if (saveProject(stored) && storeSet(INDEX_KEY, { active: stored.id, ids: [...index.ids, stored.id] })) return stored;
  storeRemove(PROJECT_KEY + stored.id);
  throw new ProjectError('This browser could not store the project. Its storage is full or blocked.');
}

/** Takes a project out of this browser; the last one is replaced by a fresh starter room. @param {string} id */
function forgetProject(id) {
  const index = readIndex(), ids = index.ids.filter(i => i !== id);
  storeRemove(PROJECT_KEY + id);
  if (!ids.length) {
    const first = starterProject(newProjectId());
    writeProject(first);
    ids.push(first.id);
  }
  storeSet(INDEX_KEY, { active: ids.includes(index.active) ? index.active : ids[0], ids });
}

/**
 * Removes a project. One that may have been shared leaves a note, or another device would bring it back. The note gets the
 * space the project leaves, so a full store can still be cleaned up. If it does not fit even then, the project stays.
 * @param {string} id @returns {boolean} whether it is gone
 */
function removeProject(id) {
  const p = readProject(id);
  if (p?.updatedAt && !p.legacy) {
    const key = PROJECT_KEY + id, raw = storeGet(key);
    storeRemove(key);
    if (!writeDeleted(readDeleted().set(id, Date.now()))) { storeSet(key, raw); return false; }
  }
  forgetProject(id);
  return true;
}

/** Stores new weights. Only those: another tab may hold a newer copy of the rest of the project.
 * @param {string} id @param {Record<string, number>} weights @param {string} [profile]
 * @returns {boolean} whether it was stored */
function storeWeights(id, weights, profile) {
  const p = readProject(id);
  if (!p) return false;
  p.weights = weights;
  if (profile) p.profile = profile; else delete p.profile;
  // Named, so that these weights cannot be taken for ones a file brought (see readProject)
  if (!p.profile && !p.baseWeights) p.profile = 'balanced';
  return saveProject(p);
}

/**
 * The stand-in in the shape of the old keys, so that a v1 file can take it in as the old version would have.
 * Furniture a layout leaves out was not in that variant, so it gets no item.
 * @param {Project} p @returns {{ current?: { items: any[] }, variants: Record<string, any>, weights?: Record<string, number> }}
 */
function standInV1(p) {
  const defs = new Map(p.furniture.map(f => [f.id, f]));
  const items = ({ place }) => Object.entries(place).filter(([id]) => defs.has(id)).map(([id, [x, y, rot]]) => ({ ...defs.get(id), x, y, rot }));
  const current = p.current && items(p.current);
  return { current: current?.length ? { items: current } : undefined, weights: p.weights,
    variants: Object.fromEntries(p.layouts.map(l => [l.name, { items: items(l), ...(l.savedAt ? { savedAt: l.savedAt } : {}) }])) };
}

/**
 * Imports a file as a new project; existing projects are never overwritten. A v1 file brings the room that the carried
 * over browser data lacks, so that data joins it and its stand-in project goes. A stand-in that was edited here (it has
 * an updatedAt from then on) stays as it is.
 * @param {any} data parsed JSON @param {string} name for files without a name
 * @returns {{ project: Project, warnings: string[] }}
 */
function importProject(data, name) {
  const stray = allProjects().find(p => p.legacy), old = stray && standInV1(stray), raw = data?.ROOM ?? data?.room;
  const fits = stray && old && raw && data.app !== PROJECT_APP, adopt = fits && !stray.updatedAt;
  const merged = adopt ? {
    ...data, current: old.current ?? data.current, DEFAULT_W: { ...data.DEFAULT_W, ...old.weights },
    variants: mergeVariantsV1(data.variants ?? {}, old.variants ?? {}),
  } : data;
  const { project: p, warnings } = parseProjectFile(merged, { name, fallbackRoom: STARTER_PROJECT.room });
  const project = addProject(p);
  if (adopt) {
    removeProject(stray.id);
    setActiveProject(project.id);
    warnings.push('The earlier data of this browser was merged into this project.');
  } else if (fits) {
    warnings.push(`“${stray.name}” was edited in this browser, so it stays a separate project and was not merged into this one.`);
  }
  return { project, warnings };
}

// Same name: the newer save wins, as it always did between devices
function mergeVariantsV1(a, b) {
  const out = { ...a };
  for (const [n, v] of Object.entries(b)) if (!out[n] || (v?.savedAt || 0) > (out[n].savedAt || 0)) out[n] = v;
  return out;
}

// ---------- Optional local project folder ----------
// A gitignored local/projects.js may set ROOM_BLUEPRINT_LOCAL to { projects: [{ id, createdAt, file }] }, file being a
// project file in any format parseProjectFile reads. Only pages on this computer load it (loadLocalScript in platform.js).
// Each project joins a browser once, under its fixed id, so that devices sharing through serve.py see one project and not
// a copy each. Its date is that of the file: any change made since, here or on another device, is newer and wins a merge.

const LOCAL_KEY = 'roomBlueprint.local';
const LOCAL_ID = /^local-[a-z0-9-]{1,60}$/;

/** The usable projects of the local folder; anything else in it is left out. @param {any} [data]
 * @returns {{ id: string, createdAt: number, project: Project }[]} */
function localEntries(data = /** @type {any} */ (globalThis).ROOM_BLUEPRINT_LOCAL) {
  if (!isObj(data) || !Array.isArray(data.projects)) return [];
  const seen = new Set();
  return data.projects.flatMap(e => {
    if (!isObj(e) || typeof e.id !== 'string' || !LOCAL_ID.test(e.id) || seen.has(e.id)) return [];
    const createdAt = Number.isFinite(e.createdAt) && e.createdAt > 0 ? e.createdAt : 1;
    try {
      const { project } = parseProjectFile(e.file, { name: 'Local project', fallbackRoom: STARTER_PROJECT.room });
      seen.add(e.id);
      return [{ id: e.id, createdAt, project }];
    } catch { return []; }
  });
}

/**
 * Adds the local projects this browser has never had, and opens the first of them. One that is here already, came from
 * the server, was deleted here or was added once before stays as it is, so later work is never overwritten. An untouched
 * starter room that was the only project gives way, as it does for a choice in the start assistant.
 * @param {ReturnType<typeof localEntries>} entries @returns {Project[]} the projects added
 */
function takeLocalProjects(entries) {
  if (!entries.length) return [];
  const had = storeGet(LOCAL_KEY), seen = new Set(Array.isArray(had) ? had.filter(id => typeof id === 'string') : []);
  const before = allProjects(), deleted = readDeleted();
  const starter = before.length === 1 && !before[0].updatedAt && !before[0].legacy ? before[0] : null;
  const added = [];
  for (const e of entries) {
    if (seen.has(e.id) || readIndex().ids.includes(e.id) || deleted.has(e.id)) { seen.add(e.id); continue; }
    const p = { ...e.project, id: e.id, name: uniqueProjectName(e.project.name), updatedAt: e.createdAt };
    const index = readIndex();
    if (!writeProject(p)) continue;
    if (!storeSet(INDEX_KEY, { active: added.length ? index.active : p.id, ids: [...index.ids, p.id] })) {
      storeRemove(PROJECT_KEY + p.id);
      continue;
    }
    seen.add(e.id);
    added.push(p);
  }
  storeSet(LOCAL_KEY, [...seen].slice(-MAX_LIST));
  if (added.length && starter) forgetProject(starter.id);
  if (added.length) setActiveProject(added[0].id);
  return added;
}

/**
 * The saved state of the local projects as new projects next to the others, which stay as they are.
 * @param {ReturnType<typeof localEntries>} entries @returns {Project[]}
 * @throws {ProjectError} if the browser refuses to store one
 */
const restoreLocalProjects = entries => entries.map(e => addProject({ ...e.project, name: withSuffix(e.project.name, ' (restored)') }));

// ---------- Furniture templates ----------
// They belong to the browser and not to a project, so that they are at hand in every project.

/** @returns {Omit<ItemDef, 'id'>[]} what is stored and still valid */
function readTemplates() {
  const raw = storeGet(TEMPLATES_KEY);
  return (Array.isArray(raw) ? raw : []).flatMap(t => {
    try {
      const { id, ...def } = cleanFurniture({ ...t, id: 'template' }, 'template');
      return [def];
    } catch { return []; }
  });
}

/** Stores a template. One of the same name is replaced.
 * @param {Omit<ItemDef, 'id'>} def @returns {boolean} whether it was stored */
const saveTemplate = def => storeSet(TEMPLATES_KEY, [...readTemplates().filter(t => t.name !== def.name), def].slice(-MAX_LIST));

/** @param {string} name */
const removeTemplate = name => storeSet(TEMPLATES_KEY, readTemplates().filter(t => t.name !== name));

// ---------- Sharing through serve.py ----------
// The server holds one entry per project id: the project, or { id, deletedAt } for one that was deleted. A device always
// fetches and merges before it writes, and the server refuses a write based on an older version, so nothing a device has not
// seen gets replaced. All of it runs one job at a time.

const MAX_PUSH_TRIES = 4;

/** Why this device is not sharing right now. 'refused' lasts for this page load: a push built from a merge that could not
 * be stored would remove what is missing here. @type {null | 'refused' | 'offline'} */
let syncProblem = null;
/** @type {Promise<any>} */
let syncJobs = Promise.resolve();
/** @type {(changed: boolean) => void} */
let syncListener = () => {};

const SYNC_NOTICES = {
  refused: 'This browser could not store the shared projects, so your changes here do not reach your other devices. Free up storage and reload.',
  offline: 'The server does not answer. Your changes are kept in this browser and go out with your next save or reload.',
};

/** What to tell the user about sharing, if anything. @returns {string} */
const syncNotice = () => syncProblem ? SYNC_NOTICES[syncProblem] : '';

/** Calls back when a sync changed what is stored here (true), and when a sync has finished (false). A page uses it to follow.
 * @param {(changed: boolean) => void} fn */
const onSync = fn => { syncListener = fn; };

/** Projects deleted in this browser, by id. @returns {Map<string, number>} */
function readDeleted() {
  const raw = storeGet(DELETED_KEY);
  return new Map(Array.isArray(raw) ? raw.filter(e => typeof e?.[0] === 'string' && Number.isFinite(e[1])) : []);
}

/** @param {Map<string, number>} notes */
const writeDeleted = notes => storeSet(DELETED_KEY, [...notes].slice(-MAX_LIST));

const tombstoneOf = raw => isObj(raw) && raw.room === undefined && typeof raw.id === 'string' && Number.isFinite(raw.deletedAt) ?
  { id: raw.id, deletedAt: raw.deletedAt } : null;

// An entry that fails the checks may come from a newer version. It stays on the server, as long as the server accepts its shape.
const keepsShape = (raw, key) => isObj(raw) && raw.id === key && isObj(raw.room) && Array.isArray(raw.furniture) &&
  Array.isArray(raw.layouts) && typeof raw.name === 'string';

// A starter room nobody touched and the stand-in for old data stay out of it, or every device would add its own
const sharedProjects = () => Object.fromEntries(allProjects().filter(p => !p.legacy && p.updatedAt).map(p => [p.id, p]));

// For comparing: the working placement differs per device and is no reason to write
const sharedState = projects => JSON.stringify(Object.keys(projects).sort().map(id => ({ ...projects[id], current: null })));

/**
 * Stores a project from the server and lists it if it is new here. A new one the index refuses is taken back. A browser that
 * could not store its first project still lists that id, which goes here.
 * @param {Project} p @param {{ active: string, ids: string[] }} index @param {boolean} isNew
 * @returns {boolean} whether it is stored here now
 */
function keepServerProject(p, index, isNew) {
  if (!writeProject(p)) return false;
  if (!isNew) return true;
  const ids = index.ids.filter(id => storeRaw(PROJECT_KEY + id) !== null);
  if (storeSet(INDEX_KEY, { active: ids.includes(index.active) ? index.active : p.id, ids: [...ids, p.id] })) return true;
  storeRemove(PROJECT_KEY + p.id);
  return false;
}

/**
 * Takes in what the server holds. The later of a change and a deletion wins, on both sides.
 * @param {Record<string, any>} entries
 * @returns {{ changed: boolean, stored: boolean, remote: Record<string, any>, foreign: [string, any][] }} remote is the server's
 *   state as entries comparable to what this device would send
 */
function takeServerEntries(entries) {
  const remote = new Map(), notes = readDeleted(), notesBefore = JSON.stringify([...notes]);
  /** @type {[string, any][]} */
  const foreign = [];
  let changed = false, stored = true;
  for (const [key, raw] of Object.entries(entries)) {
    const gone = tombstoneOf(raw);
    if (gone) {
      remote.set(gone.id, gone);
      if ((readProject(gone.id)?.updatedAt ?? 0) > gone.deletedAt) { notes.delete(gone.id); continue; }
      notes.set(gone.id, Math.max(gone.deletedAt, notes.get(gone.id) ?? 0));
      if (readIndex().ids.includes(gone.id)) { forgetProject(gone.id); changed = true; }
      continue;
    }
    /** @type {Project} */
    let theirs;
    try { theirs = validateProject(raw); } catch {
      if (keepsShape(raw, key)) { remote.set(key, raw); foreign.push([key, raw]); }
      continue;
    }
    if (!theirs.id) continue;
    remote.set(theirs.id, theirs);
    if ((notes.get(theirs.id) ?? -1) >= (theirs.updatedAt ?? 0)) continue;
    notes.delete(theirs.id);
    const index = readIndex(), mine = readProject(theirs.id);
    const merged = mine ? mergeProjects(mine, theirs) : theirs;
    if (JSON.stringify(merged) === JSON.stringify(mine)) continue;
    if (keepServerProject(merged, index, !index.ids.includes(theirs.id))) changed = true;
    else stored = false;
  }
  // A note that cannot be stored must not go out as a missing tombstone. With nothing new there is nothing to store.
  if (JSON.stringify([...notes]) !== notesBefore && !writeDeleted(notes)) stored = false;
  return { changed, stored, remote: Object.fromEntries(remote), foreign };
}

/** What this device has to say to the server. @param {[string, any][]} foreign @returns {Record<string, any>} */
function outgoingEntries(foreign) {
  const notes = Object.fromEntries([...readDeleted()].map(([id, deletedAt]) => [id, { id, deletedAt }]));
  return { ...Object.fromEntries(foreign), ...notes, ...sharedProjects() };
}

/**
 * Fetches, merges and writes back if that is new to the server. Another device writing in between makes the server refuse,
 * and the round starts over with what that device wrote.
 * @returns {Promise<boolean>} whether anything here changed
 */
async function exchange() {
  let changed = false;
  try {
    for (let tries = 0; tries < MAX_PUSH_TRIES; tries++) {
      const { projects, rev } = await fetchServerProjects();
      const got = takeServerEntries(projects);
      changed ||= got.changed;
      if (got.changed) syncListener(true);
      // Without an index nothing here survives, so even an empty server gives this device nothing to push later
      readIndex();
      if (!got.stored || !storeGet(INDEX_KEY)) { syncProblem = 'refused'; return changed; }
      const out = outgoingEntries(got.foreign);
      if (sharedState(out) === sharedState(got.remote)) { syncProblem = null; return changed; }
      const sent = await pushServerProjects(out, rev);
      if (sent === 'conflict') continue;
      syncProblem = sent === 'saved' ? null : 'offline';
      return changed;
    }
  } catch { /* keep working locally */ }
  syncProblem = 'offline';
  return changed;
}

/** @template T @param {() => Promise<T>} job @returns {Promise<T>} */
function nextSyncJob(job) {
  const run = syncJobs.then(job);
  syncJobs = run.catch(() => {});
  return run;
}

/** Joins the projects on the server with the ones here. If this device cannot store one of them, it keeps working
 * locally and pushes nothing from this page.
 * @returns {Promise<boolean>} whether anything here changed */
const syncProjects = () => nextSyncJob(async () => {
  if (!await serverAvailable()) return false;
  const changed = await exchange();
  syncListener(false);
  return changed;
});

/** Shares a change. A round that finds nothing new writes nothing, so several in a row do no harm.
 * @returns {Promise<void>} */
const pushProjects = () => nextSyncJob(async () => {
  if (syncProblem === 'refused' || !await serverAvailable()) return;
  await exchange();
  syncListener(false);
});

/** For a page that only shows the open project: a sync can change what it has drawn, so it starts over once with the new data.
 * @param {Project} open */
function syncAndFollow(open) {
  syncProjects().then(changed => { if (changed && JSON.stringify(activeProject()) !== JSON.stringify(open)) reloadPage(); });
}
