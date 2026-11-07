// @ts-check
// Changes to a piece of furniture. No DOM: the functions change the item they are given, and what they leave behind always
// passes validateProject, because a stored project that does not is hidden from the list.

const KIND_LABELS = { bed: 'Bed', sofa: 'Sofa or armchair', table: 'Desk', tv: 'Media board', television: 'TV', wardrobe: 'Wardrobe',
  shelf: 'Open shelf', custom: 'Other' };
// What choosing a kind does, so that it is not a mere label
const KIND_HINTS = {
  bed: 'Checked for a wall behind the head, a place in the corner and the view of the door.',
  sofa: 'Checked for the view of the screen and the distance to the window.',
  table: 'Gets a chair in front. Checked for light and the view of the door.',
  tv: 'A low board. Only with a projector on it is it checked: for a free picture on the wall behind.',
  television: 'Checked for tall furniture between it and the sofa.',
  wardrobe: 'Checked for room to open its doors.',
  shelf: 'Checked for a long side at a wall or against a wardrobe.',
  custom: 'Only checked for collisions and for the free space in front.',
};
const SHAPE_LABELS = { rect: 'Rectangle', round: 'Round or oval', L: 'L shape' };
const PROJECTOR = { beamer: [35, 25], image: 220 };
const DEFAULT_COLOR = '#a5c3e6';

/** What a kind cannot use goes, or the checks of the old kind would keep running. @param {Item} it @param {string} kind */
function setItemKind(it, kind) {
  it.kind = kind;
  if (kind !== 'wardrobe') { delete it.doors; delete it.mirror; }
  if (kind !== 'tv') { delete it.image; delete it.beamer; }
  if (it.shape && !shapesFor(kind).includes(it.shape)) setItemShape(it, 'rect');
}

/** @param {Item} it @param {string} shape one of SHAPE_LABELS */
function setItemShape(it, shape) {
  if (shape === 'rect') delete it.shape; else it.shape = shape;
  if (shape !== 'L') { delete it.leg; delete it.flip; }
}

/** The fields of the panel that hold a number: lowest, highest, whole numbers only */
const NUMBER_FIELDS = {
  w: [1, MAX_ITEM], d: [1, MAX_ITEM], h: [1, MAX_ROOM], doors: [1, 20, true], clear: [0, MAX_ITEM], image: [1, MAX_ROOM],
  legW: [1, MAX_ITEM], legD: [1, MAX_ITEM], beamerW: [1, MAX_ITEM], beamerD: [1, MAX_ITEM],
};

// Two values of one list: changing one keeps the other, and without a list the shape starts from what it shows
const PAIRS = { legW: ['leg', 0], legD: ['leg', 1], beamerW: ['beamer', 0], beamerD: ['beamer', 1] };

/** Sets a number. An empty height or front goes back to what the kind stands for. @returns {boolean} false if it is no valid value */
function setItemNumber(it, field, raw) {
  const text = String(raw).trim();
  if (!text && (field === 'h' || field === 'clear')) { delete it[field]; return true; }
  const v = Number(text), [lo, hi, whole] = NUMBER_FIELDS[field];
  if (!text || !Number.isFinite(v) || v < 0 || (v === 0 && lo > 0)) return false;
  const value = clamp(whole ? Math.round(v) : v, lo, hi);
  if (field in PAIRS) {
    const [key, i] = PAIRS[field];
    const both = key === 'leg' ? legOf(it).map(n => Math.max(1, n)) : [...(it.beamer ?? PROJECTOR.beamer)];
    both[i] = value;
    it[key] = both;
  } else it[field] = value;
  return true;
}

/**
 * A change from the panel. The value is the text of a field or the state of a checkbox.
 * @param {Item} it @param {string} field @param {any} value @returns {boolean} whether the item changed
 */
function editItem(it, field, value) {
  const before = JSON.stringify(it);
  if (field === 'name') it.name = String(value).trim().slice(0, MAX_NAME) || it.name;
  else if (field === 'color') it.color = value;
  else if (field === 'rot') { const v = parseFloat(value); if (Number.isFinite(v)) it.rot = normRot(v); }
  else if (field === 'kind') setItemKind(it, value);
  else if (field === 'shape') setItemShape(it, value);
  else if (field === 'mirror') it.mirror = !!value;
  else if (field === 'flip') { if (value) it.flip = true; else delete it.flip; }
  else if (field === 'projector') {
    if (value) { it.beamer ??= [...PROJECTOR.beamer]; it.image ??= PROJECTOR.image; } else { delete it.beamer; delete it.image; }
  } else if (field in NUMBER_FIELDS) setItemNumber(it, field, value);
  return JSON.stringify(it) !== before;
}

/**
 * A piece from the form for your own furniture, in one step. A catalog entry or template can be the starting point: what the
 * form does not show (doors, legs, free space) comes from it, as long as the kind and shape keep it.
 * @param {Partial<ItemDef> | null} base @param {{ name?: string, kind: string, shape: string, w: any, d: any, h?: any }} form
 * @returns {Omit<ItemDef, 'id'> | null} null when the width, depth or height is no valid size
 */
function customPiece(base, form) {
  const { id, also, x, y, rot, hidden, group, ...start } = /** @type {any} */ (base ?? {});
  const it = /** @type {any} */ ({ color: DEFAULT_COLOR, ...start, kind: start.kind ?? 'custom' });
  it.name = String(form.name ?? '').trim().slice(0, MAX_NAME) || start.name || 'Furniture';
  for (const f of ['w', 'd']) if (!setItemNumber(it, f, form[f] ?? '')) return null;
  if (!setItemNumber(it, 'h', form.h ?? '')) return null;
  if (KIND_LABELS[form.kind]) setItemKind(it, form.kind);
  setItemShape(it, shapesFor(it.kind).includes(form.shape) ? form.shape : 'rect');
  // Legs stay inside a smaller piece
  if (it.leg) it.leg = legOf(it);
  return it;
}

/** What a template keeps of a piece: everything but its place in this project. @param {Item} it @returns {Omit<ItemDef, 'id'>} */
function templateOf(it) {
  const { id, x, y, rot, hidden, group, ...def } = it;
  return def;
}

/** @param {Item[]} items @returns {string} a group id that is still free */
function freeGroupId(items) {
  let n = 1;
  while (items.some(i => i.group === `group-${n}`)) n++;
  return `group-${n}`;
}

/** Puts two pieces, and whatever is grouped with them, into one group.
 * @param {Item} a @param {Item} b @param {Item[]} items @returns {boolean} whether anything changed */
function joinGroup(a, b, items) {
  if (a === b || (a.group && a.group === b.group)) return false;
  const id = a.group ?? b.group ?? freeGroupId(items), from = [a.group, b.group];
  for (const i of items) if (i === a || i === b || (i.group && from.includes(i.group))) i.group = id;
  return true;
}

/** @param {Item} it @param {Item[]} items */
function ungroup(it, items) {
  const id = it.group;
  for (const i of items) if (i.group === id) delete i.group;
}

/** A group of one is no group. @param {Item[]} items */
function pruneGroups(items) {
  for (const i of items) if (i.group && !items.some(o => o !== i && o.group === i.group)) delete i.group;
}
