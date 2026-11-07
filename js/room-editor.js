// @ts-check
// The “Edit room” mode of the planner. The changes themselves are in room-edit.js, this file only connects them to the
// canvas and the sidebar. Loaded before app.js, whose state it uses once the page runs.

const FIXTURE_LABELS = { radiator: 'Radiator', chimney: 'Chimney', niche: 'Niche', column: 'Column', block: 'Wall block' };
const OPENING_LABELS = { door: 'Door', balcony: 'Balcony door', window: 'Window' };
const WALL_LABELS = { top: 'Top', right: 'Right', bottom: 'Bottom', left: 'Left' };

let editRoom = false;
/** What is selected in the mode @type {{ kind: string, i: number } | null} */
let roomSel = null;
let roomNotice = '';
/** A notice that reports success is not a warning: this is the text that shows as one */
let goodNotice = '';

const selectedOpening = () => roomSel?.kind === 'opening' ? proj.room.openings[roomSel.i] : undefined;
const selectedFixture = () => roomSel?.kind === 'fixture' ? proj.room.fixtures[roomSel.i] : undefined;

/** cm per pixel on screen */
const cmPerPixel = () => view ? view.w / (svg.getBoundingClientRect().width || 1) : 1;

function setEditRoom(on) {
  const inPanel = $('#roomPanel').contains(document.activeElement);
  editRoom = on;
  roomSel = null;
  if (on) selected = null; else roomNotice = '';
  document.body.classList.toggle('editing-room', on);
  svg.classList.toggle('editing', on);
  $('#roomPanel').hidden = !on;
  $('#editRoom').textContent = on ? 'Done' : 'Edit room';
  $('#editRoom').setAttribute('aria-pressed', String(on));
  $('#navCheck').textContent = on ? 'Room' : 'Check';
  $('#navAdd').disabled = $('#navLayouts').disabled = on;
  renderAll();
  if (inPanel && !on) $('#editRoom').focus();   // The panel is hidden now, and focus must not fall back to the page
}

// ---------- Applying a change ----------

/** Shows a room while it is being changed. The furniture is always worked out from where it was at the start.
 * @param {Room} next @param {{ room: Room, items: Item[] }} base @param {number[]} [shift] see resizeFromStart() */
function showRoom(next, base, shift) {
  try { cleanRoom(next); } catch { return; }   // A stored project that fails this would disappear from the list
  proj.room = next;
  state.items = moveParked(base.items, base.room, next, shift);
  analysis = analyze(state.items, next);
  renderPlan(); renderStatus(); roomCheckSoon(); renderRoomPanel();
}

/** Ends a change: the layouts follow, everything is written and the message is set, because changed() clears it. */
function commitRoom(base, note = '', shift = [0, 0]) {
  const layouts = proj.layouts;
  proj.layouts = keepLayoutsParked(layouts, base.room, proj.room, shift);
  changed();
  pushProjects();
  roomNotice = [note, outsideNotice(base.items, layouts, base.room, proj.room, shift)].filter(Boolean).join(' ');
  renderRoomPanel();
  if (boundsOf(state.items, proj.room) !== boundsOf(base.items, base.room)) fitView();
}

/** A change in one step, from the sidebar or the keyboard. @param {Room} next @param {string} [note] @param {number[]} [shift] */
function changeRoom(next, note, shift) {
  if (JSON.stringify(next) === JSON.stringify(proj.room)) { roomNotice = note ?? ''; renderAll(); return; }
  pushHistory();
  const base = { room: proj.room, items: state.items };
  showRoom(next, base, shift);
  commitRoom(base, note, shift);
}

/** Says why a room did not get the size asked for. @param {Room} room @param {{ w?: number, l?: number }} asked
 * @param {boolean} [fromStart] the left or top wall moves */
function sizeNote(room, asked, fromStart = false) {
  const min = fromStart ? minRoomSizeFromStart(room) : minRoomSize(room), out = [];
  if (asked.w < min.w) out.push(`The width stops at ${min.w} cm because of ${min.whyW || 'the smallest room size'}.`);
  if (asked.l < min.l) out.push(`The length stops at ${min.l} cm because of ${min.whyL || 'the smallest room size'}.`);
  return out.join(' ');
}

// ---------- Canvas ----------

/** @returns {boolean} whether the mode took the pointer. Anything else pans. */
function roomPointerDown(e, p) {
  const t = e.target.closest('[data-room], [data-opening], [data-fixture]');
  if (!t) return false;
  const { room: what, opening, fixture } = t.dataset;
  if (opening !== undefined) roomSel = { kind: 'opening', i: +opening };
  else if (fixture !== undefined) roomSel = { kind: 'fixture', i: +fixture };
  const f = selectedFixture(), kind = what ?? (opening !== undefined ? 'opening' : 'fixture');
  drag = { mode: 'room', what: kind, i: roomSel?.i, p0: p, off: grabOffset(proj.room, kind, roomSel?.i, p), moved: false,
    base: { room: proj.room, items: state.items }, at: f && [f.x, f.y], step: snapshot(), shift: [0, 0] };
  renderPlan(); renderRoomPanel();
  return true;
}

function roomPointerMove(e, p) {
  const { what, i, base, p0, at, off } = drag, { room } = base;
  if (!drag.moved) {
    if (Math.hypot(p[0] - p0[0], p[1] - p0[1]) < 1.5) return;
    drag.moved = true;
  }
  const snap = v => e.shiftKey ? Math.round(v) : Math.round(v / GRID) * GRID;
  if (what === 'x0' || what === 'y0') return moveStartWall(what, p, snap);
  const x = p[0] - off[0], y = p[1] - off[1];   // Where the dragged value is now: it moves with the pointer, not to it
  const asked = { w: what === 'w' || what === 'wl' ? snap(x) : undefined, l: what === 'l' || what === 'wl' ? snap(y) : undefined };
  drag.note = sizeNote(room, asked);
  if (what === 'wall') return showRoom(resizeRoom(room, { wall: snap(-x) }), base);
  if (what === 'opening') return showRoom(dropOpening(room, i, x, y, snap), base);
  if (what === 'fixture') return showRoom(moveFixture(room, i, at[0] + p[0] - p0[0], at[1] + p[1] - p0[1], !e.shiftKey), base);
  if (what === 'size') return showRoom(sizeFixtureTo(room, i, x, y, snap), base);
  showRoom(resizeRoom(room, asked), base);
}

/**
 * The left or top wall follows the pointer. The plan counts from that corner, so the numbers of everything in the room
 * change by the shift. The view moves by the same amount, so that on screen the room stays put and only the wall moves.
 * @param {string} what 'x0' or 'y0' @param {number[]} p the pointer in the coordinates shown now @param {(v: number) => number} snap
 */
function moveStartWall(what, p, snap) {
  const { base, off, shift: shown } = drag, { room } = base, k = what === 'x0' ? 0 : 1;
  // Where the wall is asked to be, in the coordinates of the room at the start of the drag
  const at = snap(p[k] - shown[k] - off[k]), size = (k ? room.l : room.w) - at;
  const asked = k ? { l: size } : { w: size };
  drag.note = sizeNote(room, asked, true);
  const { room: next, shift } = resizeFromStart(room, asked);
  view.x += shift[0] - shown[0]; view.y += shift[1] - shown[1];
  drag.shift = shift;
  applyView();
  showRoom(next, base, shift);
}

function roomPointerUp() {
  const { moved, base, note, step, shift } = drag;
  if (!moved) return;
  // Furniture only follows the room, so with the same room there is nothing to undo. The step comes from the start of the
  // drag, and undo is blocked until it ends.
  if (JSON.stringify(proj.room) === JSON.stringify(base.room)) { roomNotice = note ?? ''; renderAll(); return; }
  pushHistory(step);
  commitRoom(base, note, shift);
}

// ---------- Keyboard ----------

function roomKey(e) {
  if (drag) return;   // The next pointer move works from the start of the drag and would take the key back
  const k = e.key, step = e.shiftKey ? 10 : 1, o = selectedOpening(), f = selectedFixture();
  const room = proj.room, i = roomSel?.i;
  const shove = (dx, dy) => {
    if (o) changeRoom(placeOpening(room, i, o.wall, o.pos + dx + dy));
    else if (f) changeRoom(moveFixture(room, i, f.x + dx, f.y + dy, false));
  };
  const map = {
    ArrowLeft: () => shove(-step, 0), ArrowRight: () => shove(step, 0), ArrowUp: () => shove(0, -step), ArrowDown: () => shove(0, step),
    Delete: removeSelected, Backspace: removeSelected,
    Escape: () => { if (roomSel) { roomSel = null; renderPlan(); renderRoomPanel(); } else setEditRoom(false); },
  };
  if (map[k]) { e.preventDefault(); map[k](); }
}

function removeSelected() {
  const o = selectedOpening(), f = selectedFixture(), i = roomSel?.i, room = proj.room;
  if (!o && !f) return;
  // From the keyboard the next row takes over, whether the key came from the list or from the Remove button
  const row = $('#roomPanel').contains(document.activeElement) ? roomParts(room).findIndex(p => p.kind === roomSel.kind && p.i === i) : -1;
  roomSel = null;
  changeRoom(o ? removeOpening(room, i) : removeFixture(room, i));
  if (row >= 0) focusPart(row);
}

// ---------- Sidebar ----------

function hingeOptions(o) {
  const across = o.wall === 'top' || o.wall === 'bottom';
  const names = { start: across ? 'Left' : 'Top', end: across ? 'Right' : 'Bottom', both: 'Both (double door)' };
  return HINGES.map(h => `<option value="${h}"${o.hinge === h ? ' selected' : ''}>${names[h]}</option>`).join('');
}

const options = (labels, value) => Object.entries(labels)
  .map(([k, l]) => `<option value="${k}"${k === value ? ' selected' : ''}>${esc(l)}</option>`).join('');

function openingPanel(o, i) {
  const geo = roomGeo(proj.room), entry = geo.entry === geo.openings[i], isWindow = o.type === 'window';
  return `
    <div class="row"><input type="text" data-o="name" aria-label="Name" maxlength="200" value="${esc(o.name ?? '')}"
      placeholder="${esc(geo.openings[i].label)}"></div>
    <div class="row"><label>Type</label><select data-o="type" aria-label="Type">${options(OPENING_LABELS, o.type)}</select>
      <label>Wall</label><select data-o="wall" aria-label="Wall">${options(WALL_LABELS, o.wall)}</select></div>
    <div class="row"><label>Position</label><input type="number" data-o="pos" aria-label="Position" value="${fmt(o.pos)}" min="0">
      <label>Width</label><input type="number" data-o="width" aria-label="Width" value="${fmt(o.width)}" min="${OPENING_MIN}"></div>
    ${isWindow ? '' : `
    <div class="row"><label>Hinge</label><select data-o="hinge" aria-label="Hinge">${hingeOptions(o)}</select>
      <label>Opens</label><select data-o="swing" aria-label="Opens">${options({ in: 'Into room', out: 'Outward' }, o.swing ?? 'in')}</select></div>`}
    <div class="btns">
      ${isWindow ? '' : entry ? '<span class="sub">Main entrance</span>' : '<button data-a="main">Make main entrance</button>'}
      <button class="danger" data-a="remove" title="Del">Remove</button>
    </div>`;
}

function fixturePanel(f) {
  return `
    <div class="row"><label>Type</label><select data-x="type" aria-label="Type">${options(FIXTURE_LABELS, f.type)}</select></div>
    <div class="row"><label>X</label><input type="number" data-x="x" aria-label="X" value="${fmt(f.x)}" min="0">
      <label>Y</label><input type="number" data-x="y" aria-label="Y" value="${fmt(f.y)}" min="0"></div>
    <div class="row"><label>Width</label><input type="number" data-x="w" aria-label="Width" value="${fmt(f.w)}" min="${FIXTURE_MIN}">
      <label>Depth</label><input type="number" data-x="d" aria-label="Depth" value="${fmt(f.d)}" min="${FIXTURE_MIN}"></div>
    <div class="btns"><button data-a="turn">Turn 90°</button><button class="danger" data-a="remove">Remove</button></div>`;
}

/** What the list of parts shows now. A redraw in the middle of a click would lose the click, so the same list stays. */
let partsHtml = '';

/** Focus on a row of the list, or the first add button once the room is empty. @param {number} at */
function focusPart(at) {
  const rows = $('#roomParts').querySelectorAll('button');
  (rows[Math.min(at, rows.length - 1)] ?? $('#roomPanel [data-add-opening]')).focus();
}

function renderRoomParts() {
  const box = $('#roomParts'), html = roomParts(proj.room).map(({ kind, i, label, note }) => {
    const on = roomSel?.kind === kind && roomSel.i === i;
    return `<li class="${on ? 'sel' : ''}"><button class="pick" data-part="${kind}:${i}" aria-pressed="${on}">
      <span class="nm">${esc(label)}</span><span class="dim">${esc(note)}</span></button></li>`;
  }).join('');
  if (html === partsHtml) return;
  // The list is drawn anew, and the keys of the room must not lose their place in it
  const focus = /** @type {any} */ (document.activeElement), at = box.contains(focus) ? [...box.querySelectorAll('button')].indexOf(focus) : -1;
  box.innerHTML = partsHtml = html;
  if (at >= 0) focusPart(at);
}

function renderRoomPanel() {
  const notice = $('#roomNotice');
  notice.hidden = !roomNotice;
  notice.textContent = roomNotice;
  notice.classList.toggle('good', !!roomNotice && roomNotice === goodNotice);
  renderSelBar();
  if (!editRoom) return;
  const room = proj.room, o = selectedOpening(), f = selectedFixture(), active = document.activeElement;
  // A field being typed in keeps its text until it is committed
  for (const [id, key] of [['#roomW', 'w'], ['#roomL', 'l'], ['#roomWall', 'wall']])
    if ($(id) !== active) $(id).value = $(id).defaultValue = room[key];
  renderRoomParts();
  const box = $('#roomSelPanel');
  if (!box.contains(active) || !(o || f)) {
    box.innerHTML = o ? openingPanel(o, roomSel.i) : f ? fixturePanel(f)
      : `<span class="sub">${roomParts(room).length ? 'Select a door, window or fixture in the list above or on the plan.' : 'Nothing in the room yet. Add a door, window or fixture above.'}</span>`;
  }
  const issues = roomProblems(room);
  $('#roomProblems').hidden = !issues.length;
  $('#roomProblems').textContent = issues.join(' ');
}

/** Whether a field has no undo of its own worth keeping: a select has none, and a field of a panel has none once it shows
 * what is stored, with nothing typed that is not committed yet. @param {any} el */
const fieldCommitted = el => el.matches('select') || (el.matches('#roomPanel input[type=number], #selPanel input') && el.value === el.defaultValue);

const numberIn = e => {
  const v = Math.round(parseFloat(e.target.value));
  return Number.isFinite(v) ? v : null;
};

function sizeInput(key) {
  return e => {
    const v = numberIn(e);
    // Enter keeps the focus. The field shows the result, and Ctrl+Z goes to the app, as in the panel below.
    e.target.blur();
    if (v === null) return renderRoomPanel();
    changeRoom(resizeRoom(proj.room, { [key]: v }), key === 'wall' ? '' : sizeNote(proj.room, { [key]: v }));
  };
}
$('#roomW').onchange = sizeInput('w');
$('#roomL').onchange = sizeInput('l');
$('#roomWall').onchange = sizeInput('wall');

$('#editRoom').onclick = () => setEditRoom(!editRoom);

function added(result) {
  changeRoom(result.room);
  roomSel = { kind: result.kind, i: result.index };
  renderPlan(); renderRoomPanel();
}

$('#roomPanel').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const { addOpening: type, addFixture: fixture, addShape: shape, addCorner: corner, a: act, part } = b.dataset, room = proj.room;
  if (part) {
    const [kind, i] = part.split(':');
    roomSel = { kind, i: +i };
    renderPlan(); renderRoomPanel();
  }
  if (type) {
    const r = addOpening(room, type);
    if (r) added({ ...r, kind: 'opening' });
    else { roomNotice = 'No wall has space left for another opening.'; renderRoomPanel(); }
  }
  if (fixture) added({ ...addFixture(room, fixture), kind: 'fixture' });
  if (shape) added({ ...addShape(room, shape), kind: 'fixture' });
  if (corner) added({ ...addCorner(room, corner), kind: 'fixture' });
  if (act === 'remove') removeSelected();
  if (act === 'main') changeRoom(setMainEntrance(room, roomSel.i));
  if (act === 'turn') changeRoom(turnFixture(room, roomSel.i));
});

$('#roomSelPanel').addEventListener('change', e => {
  const { o: field, x: part } = e.target.dataset, room = proj.room, i = roomSel?.i;
  // The panel is drawn anew now, so focus goes back to the page and the fields show the result
  e.target.blur();
  if (field) {
    const raw = e.target.value, numeric = field === 'pos' || field === 'width', v = numeric ? numberIn(e) : raw.trim();
    if (v === null) return renderRoomPanel();
    changeRoom(setOpening(room, i, { [field]: v }));
  } else if (part) {
    const v = part === 'type' ? e.target.value : numberIn(e);
    if (v === null) return renderRoomPanel();
    changeRoom(setFixture(room, i, { [part]: v }));
  }
});
