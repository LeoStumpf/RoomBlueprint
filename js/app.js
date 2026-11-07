// @ts-check
// The planner page: state, undo, pointer and keyboard input, sidebar. Everything else lives in the other js/ files.

const svg = $('#plan');

// ---------- State ----------

/** The open project. state holds its working items, save() writes them back. */
let proj = activeProject();
/** @type {{ items: Item[] }} */
let state = { items: projectItems(proj) };
/** @type {string | null} */
let selected = null;
/** @type {string[]} */
let undoStack = [];
/** @type {string[]} */
let redoStack = [];

const active = () => activeItems(state.items, proj.room);

// One step holds the furniture and the room, so undo goes through changes to both in the order they happened. It also holds
// where the saved layouts put their pieces, because moving the left or top wall moves them with the floor.
const snapshot = () => JSON.stringify({ ...state, room: proj.room, places: proj.layouts.map(({ name, savedAt, place }) => ({ name, savedAt, place })) });
function pushHistory(step = snapshot()) { undoStack.push(step); if (undoStack.length > 200) undoStack.shift(); redoStack = []; }
function restore(json) {
  const { room, places = [], ...rest } = JSON.parse(json), roomChanged = JSON.stringify(room) !== JSON.stringify(proj.room);
  const bounds = boundsOf(state.items, proj.room);
  state = rest;
  proj.room = room;
  // Only a change of the room moves layouts. One saved since the step keeps its own places, and so does one deleted since.
  if (roomChanged) proj.layouts = proj.layouts.map(l => {
    const was = places.find(p => p.name === l.name && p.savedAt === l.savedAt);
    return was ? { ...l, place: was.place } : l;
  });
  if (!byId(selected)) selected = null;
  if (!selectedOpening() && !selectedFixture()) roomSel = null;
  roomNotice = '';
  save(); renderAll();
  if (!roomChanged) return;
  pushProjects();
  if (boundsOf(state.items, proj.room) !== bounds) fitView();
}
function undo() { if (undoStack.length && !drag) { redoStack.push(snapshot()); restore(undoStack.pop()); } }
function redo() { if (redoStack.length && !drag) { undoStack.push(snapshot()); restore(redoStack.pop()); } }

const byId = id => state.items.find(i => i.id === id);

/** Name of the arrangement, for the print title @type {string | null} */
let planName = proj.current?.name ?? null;

/** The last write was refused, so what the page shows is the only copy */
let saveFailed = false;

function noteSaved(ok) {
  if (ok === !saveFailed) return;
  saveFailed = !ok;
  renderNotice();
}

function save() {
  takeItems(proj, state.items, planName);
  noteSaved(saveProject(proj));
}

// After every change: save and redraw
function changed() { roomNotice = ''; save(); renderAll(); }

function renderUndo() {
  $('#undoBtn').disabled = !undoStack.length;
  $('#redoBtn').disabled = !redoStack.length;
  $('#clearRoom').disabled = !state.items.some(inPlay);
}

// ---------- Drawing ----------

/** @type {{ x: number, y: number, w: number, h: number } | null} */
let view = null;

// A change that leaves these alone keeps the zoom and the position the user chose
const boundsOf = (items, room) => JSON.stringify(contentBounds(items, room));

function fitView() {
  const b = contentBounds(state.items, proj.room), r = svg.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const bw = b.x1 - b.x0, bh = b.y1 - b.y0, aspect = r.height / r.width;
  let w = bw, h = bw * aspect;
  if (h < bh) { h = bh; w = bh / aspect; }
  view = { x: b.x0 - (w - bw) / 2, y: b.y0 - (h - bh) / 2, w, h };
  applyView();
  if (editRoom) renderPlan();
}

function applyView() { svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`); }

function zoomAt(f, sx, sy) {
  const r = svg.getBoundingClientRect();
  const fx = (sx - r.left) / r.width, fy = (sy - r.top) / r.height;
  const wx = view.x + fx * view.w, wy = view.y + fy * view.h;
  view.w *= f; view.h *= f;
  view.x = wx - fx * view.w; view.y = wy - fy * view.h;
  applyView();
  if (editRoom) renderPlan();
  // A handle keeps its size on screen, and for that one a redraw of the whole plan would be too much
  else svg.querySelectorAll('[data-touch]').forEach(c => c.setAttribute('r', String(TOUCH_R * cmPerPixel())));
}

// Show what the checks found on the plan, and whether to put it in the terms of Feng Shui
let overlayOn = false, fengOn = false;
let lastFs = null;

function renderPlan() {
  lastFs = overlayOn || fengOn ? fengShui(state.items, proj.room) : null;
  drawPlan(svg, { room: proj.room, items: state.items, flag: analysis.flag, fs: lastFs, feng: fengOn, selected, px: cmPerPixel() });
  if (editRoom) drawRoomEditor(svg, proj.room, roomSel, cmPerPixel());
}

// The review takes a while in a large room, and a drag asks for it on every move. Without the overlay nobody is watching it
// change, so it waits for a pause or for the drop.
let checkTimer = 0;
const CHECK_PAUSE = 150;   // ms
function roomCheckSoon() {
  if (lastFs) return renderRoomCheck();
  clearTimeout(checkTimer);
  checkTimer = setTimeout(renderRoomCheck, CHECK_PAUSE);
}

function renderRoomCheck() {
  clearTimeout(checkTimer);
  const fs = lastFs ?? fengShui(state.items, proj.room), review = reviewLayout(state.items, proj.room, fs), { tips } = review;
  // Nothing to judge is not the same as 0 %
  const total = pctText(reviewTotal(review, loadWeights(proj)));
  const clashes = analysis.checks.filter(c => c.lvl === 2).length, doors = analysis.checks.filter(c => c.code === 'swing').length;
  const route = fs.path ? fs.narrow ? `${fmt(fs.narrow.d * 2)} cm` : 'clear' : fs.g.entry && fs.g.target ? 'blocked' : 'n/a';
  const fact = (name, value, warn) => `<div><span>${name}</span><span${warn ? ' class="warn"' : ''}>${value}</span></div>`;
  const open = $('#critMore')?.open ? ' open' : '';
  $('#roomCheck').innerHTML = `<div class="total"><span>Worked out from the plan (your weights)</span><b>${total}</b></div>
    <div class="facts">${fact('Collisions', clashes, clashes)}${fact('Doors', doors ? `${doors} blocked` : 'open fully', doors)}
      ${fact('Main route', route, route === 'blocked')}</div>
    <details class="crit-more" id="critMore"${open}><summary>Why this score</summary>${barsHtml(review)}
      ${tips.length ? `<ul class="tips">${tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}</details>` + fengHtml(review.feng);
}

let analysis = { issues: [], flag: new Map(), checks: [] };

function renderStatus() {
  const s = $('#status'), { issues } = analysis;
  const n = active().length;
  if (!issues.length) {
    s.className = 'ok';
    planLabel(n, 0);
    s.textContent = n ? `✓ ${n} ${n === 1 ? 'piece' : 'pieces'} in the room, no conflicts` : 'Drag furniture from the parking area into the room.';
    return;
  }
  s.className = 'bad';
  planLabel(n, issues.length);
  s.innerHTML = `<b>${issues.length} conflict${issues.length > 1 ? 's' : ''}</b><ul>` +
    issues.map(i => `<li class="l${i.lvl}">${esc(i.text)}</li>`).join('') + '</ul>';
}

/** The plan in words, for whoever cannot see it. @param {number} n pieces in the room @param {number} conflicts */
const planLabel = (n, conflicts) => svg.setAttribute('aria-label',
  `Floor plan, ${proj.room.w} by ${proj.room.l} cm, ${n} ${n === 1 ? 'piece' : 'pieces'} in the room, ${conflicts} ${conflicts === 1 ? 'conflict' : 'conflicts'}`);

const layoutByName = name => proj.layouts.find(l => l.name === name);

function renderProjects() {
  const all = allProjects(), labels = projectLabels(all);
  $('#projectSelect').innerHTML = all.map((p, i) =>
    `<option value="${esc(p.id)}"${p.id === proj.id ? ' selected' : ''}>${esc(labels[i])}</option>`).join('');
}

function renderLayouts() {
  // Newest save first, suggestions from a file keep their order behind
  const list = [...proj.layouts].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  const others = allProjects().length > 1 ? '<button data-act="move" title="Move to another project">Move</button>' : '';
  $('#layoutList').innerHTML = list.length ? list.map(l => `<li data-name="${esc(l.name)}" class="${l.name === activeLayout ? 'on' : ''}">
      <span class="nm" data-act="load" title="Load">${esc(l.name)}</span>
      <span class="dim">${l.savedAt ? dateText(l.savedAt) : ''}</span>
      <button data-act="load">Load</button>${others}<button class="danger" data-act="delete" title="Delete">✕</button></li>`).join('')
    : '<li class="sub">No layouts yet.</li>';
  $('#layoutChips').innerHTML = proj.layouts.length ? proj.layouts.map(l => `<button data-name="${esc(l.name)}" aria-pressed="${l.name === activeLayout}"
    title="${esc([l.name, ...(l.idea ?? [])].join('\n'))}">${esc(l.name)}</button>`).join('') : '<span class="empty">None saved yet</span>';
  const idea = layoutByName(activeLayout)?.idea;
  $('#layoutIdea').innerHTML = idea?.length ? `<ul style="margin:8px 0 0;padding-left:18px">${
    idea.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '';
}

function renderAll() {
  analysis = analyze(state.items, proj.room);
  renderPlan(); renderStatus(); roomCheckSoon(); renderList(); renderSel();
  renderRoomInfo(); renderRoomPanel(); renderUndo();
}

function renderNotice() {
  showNotices(saveFailed);
}

function renderDamaged() {
  const bad = unreadableProjects(), box = $('#damagedNotice');
  box.hidden = !bad.length;
  box.innerHTML = bad.length ? `<p>${bad.length === 1 ? 'A stored project cannot be read, so it is not in the list.' :
    `${bad.length} stored projects cannot be read, so they are not in the list.`} Download the stored text to keep it.</p>
    <ul>${bad.map(({ id }) => `<li>${esc(damagedName(id))}
      <button data-damaged="${esc(id)}" data-act="save">Download</button>
      <button class="danger" data-damaged="${esc(id)}" data-act="remove">Remove</button></li>`).join('')}</ul>` : '';
}

const damagedText = id => unreadableProjects().find(b => b.id === id)?.text;

/** @param {string} id */
function damagedName(id) {
  try {
    const { name } = JSON.parse(damagedText(id));
    return typeof name === 'string' && name ? name.slice(0, MAX_NAME) : id;
  } catch { return id; }
}

$('#damagedNotice').addEventListener('click', async e => {
  const b = e.target.closest('button[data-damaged]'), id = b?.dataset.damaged;
  if (!id) return;
  if (b.dataset.act === 'save') {
    saveFile(new Blob([damagedText(id) ?? ''], { type: 'application/json' }), `room-blueprint-damaged-${stamp()}.json`);
  } else if (await askYes(`Remove “${damagedName(id)}” from this browser? This cannot be undone.`, 'Remove', true)) {
    forgetProject(id);
    renderDamaged(); renderProjects();
  }
});

function renderRoomInfo() {
  const { target, openings, entry } = roomGeo(proj.room);
  const side = target ? `, ${OPENINGS[target.type].place} on the ${WALL_LABELS[target.wall].toLowerCase()} wall` : '';
  $('#roomInfo').textContent = `${proj.room.w} × ${proj.room.l} cm · top view${side}`;
  // Any door can be the entrance. One plain door needs no choice. A balcony door only counts once it is marked, so without
  // a plain door the choice stays, and “None” with it.
  const ways = openings.filter(o => o.type !== 'window'), plain = ways.some(o => o.type === 'door');
  $('#mainEntrance').hidden = !ways.length || (ways.length === 1 && plain);
  const none = plain ? '' : `<option value="-1"${entry ? '' : ' selected'}>None</option>`;
  $('#mainEntranceSelect').innerHTML = none + ways.map(o => {
    const i = openings.indexOf(o);
    return `<option value="${i}"${o === entry ? ' selected' : ''}>${esc(`${o.label} (${WALL_LABELS[o.wall].toLowerCase()} wall)`)}</option>`;
  }).join('');
}

// ---------- Actions ----------

function rotateSel(delta) {
  const it = byId(selected); if (!it) return;
  pushHistory(); it.rot = normRot(it.rot + delta); changed();
}

function moveSel(dx, dy) {
  const it = byId(selected); if (!it) return;
  pushHistory();
  for (const m of groupMembers(it, state.items)) { m.x += dx; m.y += dy; }
  changed();
}

const uniqueId = base => uniqueItemId(base, id => !!byId(id));

function duplicate() {
  const it = byId(selected); if (!it) return;
  pushHistory();
  const c = { ...it, id: uniqueId(it.id), name: withSuffix(it.name, ' (copy)'), x: it.x + 20, y: it.y + 20, hidden: false };
  delete c.group;
  state.items.push(c); selected = c.id; changed();
}

/** Takes a piece, with its group, out of the room. It stays in the plan, in the parking area. @param {Item} it */
function setAside(it) {
  const bounds = boundsOf(state.items, proj.room), group = groupMembers(it, state.items);
  pushHistory();
  parkItems(group, state.items, proj.room);
  changed();
  if (boundsOf(state.items, proj.room) !== bounds) fitView();
}

// ---------- Mouse / touch ----------

const pointers = new Map();
let drag = null, lastTap = { id: null, t: 0 };

function svgPoint(e) {
  const r = svg.getBoundingClientRect();
  return [view.x + (e.clientX - r.left) / r.width * view.w, view.y + (e.clientY - r.top) / r.height * view.h];
}

/** Ends a drag of a piece or of the room with what it reached, or takes its undo step back if nothing moved. */
function finishDrag() {
  if (followWaits) followBeforeSaving();
  if (drag?.mode === 'room') roomPointerUp();
  if (drag?.mode === 'item' || drag?.mode === 'rotate') {
    if (drag.moved) changed(); else undoStack.pop();
  }
  renderUndo();
}

svg.addEventListener('pointerdown', e => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  svg.setPointerCapture(e.pointerId);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    // The second finger starts a pinch. What the first one did so far stays, or the plan would show a change nobody stored.
    finishDrag();
    drag = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), vw: view.w };
    return;
  }
  // A field commits when it loses focus, and that must happen before this press changes the selection or takes the base of a
  // drag. The commit can redraw the plan, so e.target may be detached below, which closest() and dataset do not mind, and it
  // can call fitView, so the point comes after it.
  const field = /** @type {HTMLElement | null} */ (document.activeElement);
  if (field?.matches('input, select, textarea')) field.blur();
  const p = svgPoint(e);
  if (editRoom && roomPointerDown(e, p)) { svg.classList.add('dragging'); return; }
  const handle = e.target.closest('[data-handle="rotate"]');
  // Furniture stays visible in the room editor but cannot be grabbed
  const g = editRoom ? null : e.target.closest('[data-id]');
  if (handle && byId(selected)) {
    pushHistory();
    drag = { mode: 'rotate', id: selected, moved: false };
  } else if (g) {
    const it = byId(g.dataset.id);
    const now = performance.now();
    // Ctrl or Cmd adds to the group of the selected piece; Shift is taken, it switches snapping off
    if ((e.ctrlKey || e.metaKey) && byId(selected) && selected !== it.id) {
      drag = null;
      const step = snapshot();
      if (joinGroup(byId(selected), it, state.items)) { pushHistory(step); changed(); }
      return;
    }
    if (lastTap.id === it.id && now - lastTap.t < 350) {
      lastTap = { id: null, t: 0 }; selected = it.id; drag = null; rotateSel(90); return;
    }
    lastTap = { id: it.id, t: now };
    if (selected !== it.id) { selected = it.id; renderAll(); }
    pushHistory();
    const mates = groupMembers(it, state.items).filter(m => m !== it);
    drag = { mode: 'item', id: it.id, p0: p, x0: it.x, y0: it.y, moved: false, mates, from: mates.map(m => [m.x, m.y]) };
  } else {
    drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
  }
  svg.classList.add('dragging');
});

svg.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId) || !drag) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (drag.mode === 'pinch') {
    if (pointers.size < 2) return;
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d > 0) zoomAt(drag.vw * drag.d0 / d / view.w, (a.x + b.x) / 2, (a.y + b.y) / 2);
    return;
  }
  if (drag.mode === 'pan') {
    const r = svg.getBoundingClientRect();
    view.x = drag.vx - (e.clientX - drag.sx) / r.width * view.w;
    view.y = drag.vy - (e.clientY - drag.sy) / r.height * view.h;
    drag.moved = true;
    applyView();
    return;
  }
  if (drag.mode === 'room') return roomPointerMove(e, svgPoint(e));
  const it = byId(drag.id), p = svgPoint(e);
  if (drag.mode === 'item') {
    if (!drag.moved && Math.hypot(p[0] - drag.p0[0], p[1] - drag.p0[1]) < 1.5) return;
    drag.moved = true;
    it.x = drag.x0 + p[0] - drag.p0[0];
    it.y = drag.y0 + p[1] - drag.p0[1];
    if (!e.shiftKey) snapItem(it, state.items, proj.room, drag.mates);
    drag.mates.forEach((m, i) => { m.x = drag.from[i][0] + it.x - drag.x0; m.y = drag.from[i][1] + it.y - drag.y0; });
  } else if (drag.mode === 'rotate') {
    drag.moved = true;
    // the handle sits behind the back (local −y)
    let a = Math.atan2(p[1] - it.y, p[0] - it.x) * 180 / Math.PI + 90;
    a = e.shiftKey ? Math.round(a) : Math.round(a / 15) * 15;
    it.rot = normRot(a);
  }
  analysis = analyze(state.items, proj.room);
  renderPlan(); renderStatus(); roomCheckSoon();
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (!drag) return;
  if (drag.mode === 'pinch') {
    if (pointers.size === 0) {
      drag = null; svg.classList.remove('dragging'); settleView();
      if (followWaits) followStored();
    }
    return;
  }
  if (drag.mode === 'pan' && !drag.moved && (selected || roomSel)) { selected = null; roomSel = null; renderAll(); }
  finishDrag();
  drag = null;
  svg.classList.remove('dragging');
  settleView();
  if (followWaits) followStored();
}
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);

svg.addEventListener('wheel', e => {
  e.preventDefault();
  zoomAt(Math.exp(e.deltaY * 0.0015), e.clientX, e.clientY);
}, { passive: false });

$('#zoomIn').onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(0.8, r.left + r.width / 2, r.top + r.height / 2); };
$('#zoomOut').onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(1.25, r.left + r.width / 2, r.top + r.height / 2); };
$('#zoomFit').onclick = fitView;

// A screen keyboard that closes during a drag changes the size of the plan. The change waits for the end of the drag, so that
// the point being dragged does not jump under the finger.
let resizeWaits = false;
function keepView() {
  const r = svg.getBoundingClientRect();
  if (!r.width || !r.height) return;
  if (!view) return fitView();
  const cx = view.x + view.w / 2, cy = view.y + view.h / 2;
  view.h = view.w * r.height / r.width;
  view.x = cx - view.w / 2; view.y = cy - view.h / 2;
  applyView();
}
function settleView() { if (resizeWaits) { resizeWaits = false; keepView(); } }
new ResizeObserver(() => { if (drag) resizeWaits = true; else keepView(); }).observe(svg);

$('#undoBtn').onclick = undo;
$('#redoBtn').onclick = redo;

document.addEventListener('keydown', (/** @type {any} */ e) => {
  if ($('dialog[open]')) return;
  const k = e.key, ctrl = e.ctrlKey || e.metaKey;
  if (e.target.closest('input, textarea, select')) {
    // Text still being typed keeps the browser's undo. A select has no undo, and once a room field is committed that undo
    // would only change the field and not the room, so the step goes to the app. A focused field is not redrawn, hence the blur.
    if (!(ctrl && 'zy'.includes(k.toLowerCase()) && fieldCommitted(e.target))) return;
    e.target.blur();
  }
  if (ctrl && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (ctrl && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (ctrl) return;
  if (drag && followWaits) return;   // An edit would save over the change that is waiting for this drag
  if (editRoom) return roomKey(e);
  if (!byId(selected)) return;
  const step = e.shiftKey ? 10 : 1;
  const map = {
    ArrowLeft: () => moveSel(-step, 0), ArrowRight: () => moveSel(step, 0),
    ArrowUp: () => moveSel(0, -step), ArrowDown: () => moveSel(0, step),
    r: () => rotateSel(90), R: () => rotateSel(-90), q: () => rotateSel(-15), e: () => rotateSel(15),
    d: duplicate, Delete: () => { if (inPlay(byId(selected))) setAside(byId(selected)); },
    Escape: () => { selected = null; renderAll(); },
  };
  map.Backspace = map.Delete;
  if (map[k]) { e.preventDefault(); map[k](); }
});

// ---------- Sidebar ----------

/** Name of the layout loaded last @type {string | null} */
let activeLayout = null;

function loadLayout(layout) {
  pushHistory();
  applyLayout(state.items, layout, proj.room);
  activeLayout = layout.name; selected = null;
  planName = layout.name;
  $('#layoutName').value = layout.name;
  changed(); renderLayouts(); fitView();
}

const saveCurrentLayout = async () => {
  const name = $('#layoutName').value.trim() || `Layout ${dateText()} ${new Date().toTimeString().slice(0, 5)}`;
  const have = layoutByName(name);
  const warn = have?.review ? ' Its notes go too.' : '';
  if (have && !await askYes(`Overwrite “${name}”?${warn}`, 'Overwrite', true)) return;
  const layout = { name, ...placementOf(state.items), savedAt: Date.now(), ...(have?.idea ? { idea: have.idea } : {}) };
  proj.layouts = layoutByName(name) ? proj.layouts.map(l => l.name === name ? layout : l) : [...proj.layouts, layout];
  activeLayout = name;
  planName = name;
  save(); pushProjects();
  $('#layoutName').value = '';
  renderLayouts();
  $('#layoutsDialog').close();
};
$('#saveLayout').onclick = saveCurrentLayout;
$('#layoutName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveCurrentLayout(); } });

/** @param {boolean} [naming] the user came to save, so the name comes first */
function openLayouts(naming) {
  $('#layoutsDialog').showModal();
  if (naming) $('#layoutName').focus();
}
$('#newLayout').onclick = () => openLayouts(true);
$('#allLayouts').onclick = () => openLayouts(false);
$('#layoutsClose').onclick = () => $('#layoutsDialog').close();
$('#layoutChips').addEventListener('click', e => {
  const layout = layoutByName(e.target.closest('button[data-name]')?.dataset.name);
  if (layout) loadLayout(layout);
});

$('#openHelp').onclick = () => $('#helpDialog').showModal();
$('#helpClose').onclick = () => $('#helpDialog').close();

$('#layoutList').addEventListener('click', async e => {
  const li = e.target.closest('li[data-name]'), act = e.target.closest('[data-act]')?.dataset.act;
  if (!li || !act) return;
  const layout = layoutByName(li.dataset.name);
  if (!layout) return;
  if (act === 'load') { $('#layoutsDialog').close(); loadLayout(layout); }
  if (act === 'move') openMove(layout);
  if (act === 'delete' && await askYes(`Delete layout “${layout.name}”?`, 'Delete', true)) {
    Object.assign(proj, withoutLayout(proj, layout.name));
    if (activeLayout === layout.name) activeLayout = null;
    save(); pushProjects(); renderLayouts();
  }
});

/** The layout the move dialog is open for @type {string | null} */
let movingLayout = null;

function openMove(layout) {
  movingLayout = layout.name;
  $('#moveText').textContent = `Move “${layout.name}” to:`;
  const all = allProjects(), labels = projectLabels(all);
  $('#moveTarget').innerHTML = all.map((p, i) => p.id === proj.id ? '' :
    `<option value="${esc(p.id)}">${esc(labels[i])}</option>`).join('');
  $('#moveDialog').showModal();
}

$('#moveDialog').addEventListener('close', () => {
  if ($('#moveDialog').returnValue !== 'move' || !movingLayout) return;
  $('#moveDialog').returnValue = '';
  try {
    save();
    const { source, layout, outside, lostReview } = moveLayout(proj, $('#moveTarget').value, movingLayout);
    Object.assign(proj, source);
    if (activeLayout === movingLayout) activeLayout = null;
    save(); pushProjects(); renderLayouts();
    const notes = [`Moved to “${$('#moveTarget').selectedOptions[0].textContent}” as “${layout.name}”.`];
    if (outside.length) notes.push(`Outside the walls there: ${outside.join(', ')}.`);
    if (lostReview) notes.push('Its notes stayed behind, because they were written for this room.');
    roomNotice = goodNotice = notes.join(' ');
    renderRoomPanel();
  } catch (err) {
    tell(`Move failed: ${err.message}`);
  }
});

// ---------- Projects ----------

// Everything that depends on the project is built anew. Undo steps and a running drag hold the old furniture, so they go.
function showProject(p) {
  proj = p;
  state = { items: projectItems(p) };
  if (!byId(selected)) selected = null;
  planName = p.current?.name ?? null;
  if (!layoutByName(activeLayout)) activeLayout = null;
  undoStack = []; redoStack = [];
  drag = null; svg.classList.remove('dragging');
  roomSel = null; roomNotice = '';
  renderAll(); renderLayouts(); renderProjects(); fitView();
}

function openProject(p) {
  setActiveProject(p.id);
  selected = null; activeLayout = null;
  $('#layoutName').value = '';
  showProject(p);
}

/** Another device or tab changed the stored project. A running drag finishes first. */
let followWaits = false;

function projectGone() {
  tell(`“${proj.name}” was deleted in another tab or on another device.`);
  openProject(activeProject());
}

/** Takes a stored copy whose working state is the one on screen. @param {Project} p */
function takeStored(p) {
  proj = p;
  if (!layoutByName(activeLayout)) activeLayout = null;
  renderLayouts(); renderProjects(); renderDamaged(); renderRoomCheck();
}

function followStored() {
  followWaits = !!drag;
  // After a refused save the page is ahead of storage, not behind it
  if (followWaits || saveFailed) return;
  const fresh = readProject(proj.id);
  if (!fresh) return projectGone();
  // state was built from the older copy. Left stale, the next edit would write the old furniture back as the newest version.
  if (staleWorkingState(proj, fresh)) return showProject(fresh);
  takeStored(fresh);
}

/** Whether ending the running drag writes anything. A room dragged back to where it started does not. */
function dragSaves() {
  if (!drag?.moved) return false;
  if (drag.mode === 'room') return JSON.stringify(proj.room) !== JSON.stringify(drag.base.room);
  return drag.mode === 'item' || drag.mode === 'rotate';
}

// The save at the end of a drag makes its copy the newest one, so a change that waited for the drag has to be settled before
// it. Otherwise the follow only reads back that save, and the other change is gone here and, by its older date, on the server.
// A drag that saves nothing just follows when it has ended.
function followBeforeSaving() {
  if (saveFailed || !dragSaves()) return;
  followWaits = false;
  const fresh = readProject(proj.id);
  if (!fresh) return projectGone();
  const kept = dragOverStored(proj, fresh, drag.base?.room);
  if (kept) return takeStored(kept);
  showProject(fresh);
  tell(`Your last move was not kept: “${fresh.name}” was changed in another tab or on another device.`);
}

$('#projectSelect').onchange = e => {
  const p = readProject(e.target.value);
  if (p) openProject(p);
};

$('#mainEntranceSelect').onchange = e => changeRoom(setMainEntrance(proj.room, +e.target.value));

$('#newProject').onclick = () => openStart(false);

$('#renameProject').onclick = async () => {
  const name = (await askText('Project name', proj.name))?.trim();
  if (!name) return;
  proj.name = uniqueProjectName(name.slice(0, MAX_NAME), proj.id);
  noteSaved(saveProject(proj)); pushProjects(); renderProjects();
};

$('#deleteProject').onclick = async () => {
  if (!await askYes(`Delete project “${proj.name}” with all its layouts? Export it first if you may need it again.`, 'Delete', true)) return;
  if (!removeProject(proj.id)) {
    return tell(`“${proj.name}” was not deleted: this browser has no room for the note that keeps it deleted on your other devices. Free up storage and try again.`);
  }
  openProject(activeProject());
  pushProjects();
};

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

const fileSlug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
const exportName = ext => `room-blueprint-${fileSlug(proj.name)}-${stamp()}.${ext}`;

$('#exportJson').onclick = () => {
  save();
  saveFile(new Blob([JSON.stringify(exportProject(proj), null, 2)], { type: 'application/json' }),
    exportName('json'));
};

const MAX_IMPORT = 8 * 1024 * 1024;

$('#importJson').onclick = () => $('#importFile').click();
$('#importFile').onchange = async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    if (file.size > MAX_IMPORT) throw new Error('The file is too large.');
    const { project, warnings } = importProject(JSON.parse(await file.text()), file.name.replace(/\.json$/i, ''));
    openProject(project);
    pushProjects();
    if (warnings.length) tell(warnings.join('\n'));
  } catch (err) {
    tell(`Import failed: ${err.message}`);
  }
};

$('#restoreLocal').onclick = async () => {
  const names = localData.map(e => `“${e.project.name}”`).join(', ');
  if (!localData.length || !await askYes(`Add the saved state of ${names} from the local project folder as a new project? `
    + 'Your projects stay as they are.', 'Restore')) return;
  try {
    const made = restoreLocalProjects(localData);
    openProject(made[0]);
    pushProjects();
  } catch (err) {
    tell(`Restore failed: ${err.message}`);
  }
};

$('#exportPng').onclick = () => {
  const keep = selected; selected = null; renderPlan();
  const b = contentBounds(state.items, proj.room), scale = 2.5;
  const clone = svg.cloneNode(true);
  selected = keep; renderPlan();
  clone.setAttribute('viewBox', `${b.x0} ${b.y0} ${b.x1 - b.x0} ${b.y1 - b.y0}`);
  clone.setAttribute('width', (b.x1 - b.x0) * scale);
  clone.setAttribute('height', (b.y1 - b.y0) * scale);
  clone.setAttribute('font-family', PLAN_FONT);
  const url = URL.createObjectURL(new Blob([resolveTokens(new XMLSerializer().serializeToString(clone))], { type: 'image/svg+xml' }));
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    c.toBlob(blob => saveFile(blob, exportName('png')));
  };
  img.src = url;
};

// Ctrl+P and the button print the same sheet. The title becomes the PDF file name.
const pageTitle = document.title;
addEventListener('beforeprint', () => {
  buildPrintSheet({ room: proj.room, items: state.items,
    title: $('#layoutName').value.trim() || planName || 'Current arrangement' });
  document.title = `Room Blueprint ${$('#printName').textContent}`;
});
addEventListener('afterprint', () => { document.title = pageTitle; });
$('#printPlanBtn').onclick = () => printPlan();

// A start from zero: every piece goes to the parking area, nothing is deleted, and undo brings the arrangement back
$('#clearRoom').onclick = async () => {
  if (!state.items.some(inPlay)) return;
  if (!await askYes('Move all furniture to the parking area, for a start from zero? Saved layouts stay, and Undo brings it back.',
    'Clear room')) return;
  pushHistory(); state = { items: defaultItems(proj.room, furnitureOf(state.items)) }; selected = null; changed(); fitView();
};

// ---------- Menu and phone ----------

/** The height the top bar has at this width, for what hangs below it */
const noteTopHeight = () => document.body.style.setProperty('--top-height', `${$('.topbar').getBoundingClientRect().bottom}px`);

// A menu closes when something in it was chosen, and on a click anywhere else or Escape
const menu = $('#moreMenu');
document.addEventListener('click', (/** @type {any} */ e) => { if (menu.open && (!menu.contains(e.target) || e.target.closest('.menu-list a, .menu-list button'))) menu.open = false; });
menu.addEventListener('toggle', () => { if (menu.open) noteTopHeight(); });
menu.addEventListener('keydown', e => { if (e.key === 'Escape') { menu.open = false; menu.querySelector('summary').focus(); e.stopPropagation(); } });

/** On a phone the inspector is a sheet over the plan. @param {boolean} on */
function setSheet(on) {
  document.body.classList.toggle('sheet-open', on);
  $('#navCheck').setAttribute('aria-expanded', String(on));
  $('#navCheck').setAttribute('aria-current', String(on));
  $('#navPlan').setAttribute('aria-current', String(!on));
  noteTopHeight();
}
$('#navPlan').onclick = () => setSheet(false);
$('#navCheck').onclick = () => setSheet(!document.body.classList.contains('sheet-open'));
$('#navAdd').onclick = () => $('#openCatalog').click();
$('#navLayouts').onclick = () => openLayouts(false);

/** What is selected, with the buttons a phone needs under the plan. */
function renderSelBar() {
  const it = byId(selected), o = selectedOpening(), f = selectedFixture(), bar = $('#selBar');
  bar.hidden = !it && !o && !f;
  if (bar.hidden) return;
  $('#sbName').textContent = it ? it.name : o ? (roomGeo(proj.room).openings[roomSel.i]?.label ?? '') : FIXTURE_LABELS[f.type];
  $('#sbDim').textContent = it ? `${fmt(it.w)} × ${fmt(it.d)}${it.h === undefined ? '' : ` × ${fmt(it.h)}`}` : o ? `${fmt(o.width)} cm` : `${fmt(f.w)} × ${fmt(f.d)}`;
  $('#sbRotate').hidden = !!o;
  $('#sbCopy').hidden = !it;
  $('#sbRemove').textContent = it ? inPlay(it) ? 'Set aside' : 'Delete' : 'Remove';
}
$('#sbRotate').onclick = () => { if (byId(selected)) rotateSel(90); else if (selectedFixture()) changeRoom(turnFixture(proj.room, roomSel.i)); };
$('#sbCopy').onclick = duplicate;
$('#sbSize').onclick = () => { setSheet(true); $(editRoom ? '#roomPanel' : '#selSection').scrollIntoView(); };
$('#sbRemove').onclick = () => { const it = byId(selected); if (it) removeItem(it); else removeSelected(); };

// ---------- Start-up ----------

// Both switches are remembered
overlayOn = storeGet(OVERLAY_KEYS.plan) === true;
$('#overlayToggle').checked = overlayOn;
$('#overlayToggle').onchange = e => { overlayOn = e.target.checked; storeSet(OVERLAY_KEYS.plan, overlayOn); renderPlan(); renderRoomCheck(); };
fengOn = fengSwitch($('#fengToggle'), on => { fengOn = on; renderPlan(); renderRoomCheck(); });
svg.setAttribute('font-family', PLAN_FONT);
fitView();
renderAll();
renderRoomCheck();
renderLayouts();
renderProjects();
renderDamaged();
onSync(changed => { if (changed) followStored(); renderNotice(); });
onStoreChange(key => {
  if (key === PROJECT_KEY + proj.id) followStored();
  if (key === INDEX_KEY) { renderProjects(); renderLayouts(); }
});
// The optional local project folder (gitignored) loads before the first sync, so that a project it adds is shared from the start
const LOCAL_SCRIPT = 'local/projects.js';
/** @type {ReturnType<typeof localEntries>} */
let localData = [];
loadLocalScript(LOCAL_SCRIPT).then(() => {
  localData = localEntries();
  $('#restoreLocal').hidden = !localData.length;
  const added = takeLocalProjects(localData);
  if (added.length) openProject(added[0]);
}).catch(() => {}).then(syncProjects).then(changed => { if (!changed) offerStart(); });
