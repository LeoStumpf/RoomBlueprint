// @ts-check
// The start assistant: a new project from the room library or as an empty room. Loaded before app.js, like room-editor.js.

const STARTED_KEY = 'roomBlueprint.started';

// The library shows one group at a time, so it stays short on a phone. Every room is in the dialog from the start, the
// others are only hidden, and its plan is drawn with the example layout it opens on the first time its group is shown.
function drawStartTemplates() {
  const box = $('#startTemplates');
  if (box.childElementCount) return;
  const groups = libraryGroups();
  $('#startGroups').innerHTML = groups.map(g => `<button type="button" data-group="${esc(g.name)}" aria-pressed="false">${esc(g.name)}`
    + ` <span class="sub">${g.rooms.length}</span></button>`).join('');
  box.innerHTML = groups.flatMap(g => g.rooms.map(({ i, room: t }) => `<button type="button" class="tpl" data-tpl="${i}"
    data-group="${esc(g.name)}" hidden><svg aria-hidden="true" xmlns="${NS}"></svg><b>${esc(t.name)}</b><span class="sub">${esc(t.hint)}</span></button>`)).join('');
  showStartGroup(groups[0].name);
}

/** @param {string} name of a group in DEMO_GROUPS */
function showStartGroup(name) {
  for (const b of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('#startGroups [data-group]'))) b.setAttribute('aria-pressed', String(b.dataset.group === name));
  for (const b of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('#startTemplates [data-tpl]'))) {
    b.hidden = b.dataset.group !== name;
    const svg = b.querySelector('svg'), t = DEMO_ROOMS[+b.dataset.tpl];
    if (b.hidden || svg.childElementCount) continue;
    drawPreview(svg, t.room, projectItems(templateProject(t, t.name)), false, `tpl${b.dataset.tpl}`);
  }
}

$('#startGroups').addEventListener('click', e => {
  const b = e.target.closest('[data-group]');
  if (b) showStartGroup(b.dataset.group);
});

/** @param {boolean} replacing the page opened on an untouched starter room, which the choice replaces */
function openStart(replacing) {
  drawStartTemplates();
  $('#startDialog').dataset.replacing = replacing ? '1' : '';
  $('#startName').value = '';
  $('#startError').textContent = '';
  $('#startDialog').showModal();
}

/** @param {Project} p @param {boolean} [edit] open the room in the editor */
function startWith(p, edit = false) {
  const stand = $('#startDialog').dataset.replacing ? proj.id : null;
  try {
    const made = addProject(p);
    if (stand) { removeProject(stand); setActiveProject(made.id); }
    storeSet(STARTED_KEY, true);
    $('#startDialog').close();
    openProject(made);
    pushProjects();
    setEditRoom(edit);
  } catch (err) {
    $('#startError').textContent = `That did not work: ${err.message}`;
  }
}

$('#startTemplates').addEventListener('click', e => {
  const t = DEMO_ROOMS[+e.target.closest('[data-tpl]')?.dataset.tpl];
  if (t) startWith(templateProject(t, $('#startName').value.trim().slice(0, MAX_NAME) || t.name));
});

$('#startEmpty').onclick = () => {
  const w = Math.round(+$('#startW').value), l = Math.round(+$('#startL').value), wall = Math.round(+$('#startWall').value);
  const ok = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
  if (!ok(w, ROOM_MIN, MAX_ROOM) || !ok(l, ROOM_MIN, MAX_ROOM) || !ok(wall, 0, WALL_MAX)) {
    $('#startError').textContent = `Width and length must be ${ROOM_MIN} to ${MAX_ROOM} cm, the wall 0 to ${WALL_MAX} cm.`;
    return;
  }
  startWith(emptyProject($('#startName').value.trim().slice(0, MAX_NAME) || 'Empty room', { w, l, wall }), true);
};

$('#startImport').onclick = () => { $('#startDialog').close(); $('#importFile').click(); };
$('#startCancel').onclick = () => { storeSet(STARTED_KEY, true); $('#startDialog').close(); };
$('#startDialog').addEventListener('cancel', () => storeSet(STARTED_KEY, true));

/** A browser with nothing of its own yet gets the assistant on its first visit. */
function offerStart() {
  if (storeGet(STARTED_KEY) || proj.updatedAt || proj.legacy || allProjects().length !== 1) return;
  if (!$('dialog[open]')) openStart(true);
}
