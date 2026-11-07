// @ts-check
// The furniture part of the sidebar and the catalog dialog. The changes themselves are in item-edit.js, this file connects
// them to the page. Loaded before app.js, whose state it uses once the page runs.

/** In the room and in the checks, as opposed to waiting in the parking area. @param {Item} it */
const inPlay = it => !it.hidden && inRoom(it, proj.room);

// A problem says what it is in a sign and in words for a screen reader, not only in its colour
const FLAGS = { 2: ['✕', 'runs into something'], 1: ['!', 'blocks a door'] };

function renderList() {
  const box = $('#itemList'), focus = /** @type {any} */ (document.activeElement), id = box.contains(focus) ? focus.closest('li')?.dataset.id : null;
  box.innerHTML = state.items.map((it, i) => {
    const play = inPlay(it), f = play ? analysis.flag.get(it.id) : 0;
    return `<li data-id="${esc(it.id)}" class="${it.id === selected ? 'sel' : ''} ${play ? '' : 'parked'}">
      <button class="pick" aria-pressed="${it.id === selected}">
        <span class="pos">${String(i + 1).padStart(2, '0')}</span>
        <span class="sw" style="background:${esc(it.color)}"></span>
        <span class="nm">${esc(it.name)}${f ? ` <span class="flag${f}" title="${FLAGS[f][1]}" aria-label="${FLAGS[f][1]}">${FLAGS[f][0]}</span>` : ''}</span>
        <span class="dim">${fmt(it.w)} × ${fmt(it.d)}${play ? '' : ' · parked'}</span>
      </button>
      ${play ? `<button data-act="aside" title="Set aside" aria-label="Set ${esc(it.name)} aside">⇥</button>` : ''}
    </li>`;
  }).join('');
  // The list is drawn anew at every change, and the keys of the plan must not lose their place in it
  if (id) [...box.querySelectorAll('li')].find(li => li.dataset.id === id)?.querySelector('.pick').focus();
}

const number = (label, f, value, attrs = '') => `<label>${label}</label><input type="number" data-f="${f}" aria-label="${label}" value="${value}" ${attrs}>`;
const check = (label, f, on) => `<label class="check"><input type="checkbox" data-f="${f}"${on ? ' checked' : ''}>${label}</label>`;

/** The fields only some kinds and shapes have. @param {Item} it */
function optionFields(it) {
  const rows = [];
  if (it.kind === 'wardrobe') rows.push(`${number('Doors', 'doors', it.doors ?? 3, 'min="1" max="20"')}${check('Mirror', 'mirror', it.mirror !== false)}`);
  if (it.kind === 'tv') {
    const on = !!(it.beamer || it.image), [bw, bd] = it.beamer ?? PROJECTOR.beamer;
    rows.push(check('Projector on it', 'projector', on));
    if (on) rows.push(`${number('Image', 'image', fmt(it.image ?? PROJECTOR.image), 'min="1"')}${number('W', 'beamerW', fmt(bw), 'min="1"')}${number('D', 'beamerD', fmt(bd), 'min="1"')}`);
  }
  if (it.shape === 'L') {
    const [leg, bar] = legOf(it);
    rows.push(`${number('Leg', 'legW', fmt(leg), 'min="1"')}${number('Back', 'legD', fmt(bar), 'min="1"')}${check('Other side', 'flip', it.flip)}`);
  }
  rows.push(number('Free in front', 'clear', it.clear ?? '', `min="0" placeholder="${fmt(clearance({ ...it, clear: undefined }))}" title="Empty: what the doors need"`));
  return rows.map(r => `<div class="row">${r}</div>`).join('');
}

function groupRow(it) {
  const mates = groupMembers(it, state.items).filter(m => m !== it), group = new Set(mates);
  const others = state.items.filter(o => o !== it && !group.has(o) && !o.hidden);
  const join = others.length ? `<select data-group aria-label="Group with"><option value="">Group with…</option>${
    others.map(o => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('')}</select>` : '';
  if (!it.group) return `<div class="row">${join}</div>`;
  return `<div class="sub">Moves with ${esc(mates.map(m => m.name).join(', ') || 'nothing yet')}</div>
    <div class="row">${join}<button data-act="ungroup">Ungroup</button></div>`;
}

/** Whether “More options” stays open from one piece to the next */
let moreOpen = false;

function selPanelHtml(it) {
  const shapes = shapesFor(it.kind), shape = it.shape ?? 'rect';
  const shapeOptions = Object.fromEntries(['rect', ...shapes].map(s => [s, SHAPE_LABELS[s]]));
  return `
    <div class="row"><input type="text" data-f="name" aria-label="Name" maxlength="200" value="${esc(it.name)}">
      <input type="color" data-f="color" aria-label="Colour" value="${esc(it.color)}"></div>
    <div class="row"><label>Type</label><select data-f="kind" aria-label="Type">${options(KIND_LABELS, it.kind)}</select></div>
    <div class="row">${number('W', 'w', fmt(it.w), 'min="1"')}${number('D', 'd', fmt(it.d), 'min="1"')}
      ${number('H', 'h', it.h === undefined ? '' : fmt(it.h), `min="1" placeholder="${fmt(itemHeight({ ...it, h: undefined }))}" title="Empty: usual height of this type"`)}</div>
    <div class="btns">
      <button data-act="rot" data-v="-90" title="Turn left (Shift+R)" aria-label="Turn 90° left">⟲ 90°</button>
      <button data-act="rot" data-v="90" title="Turn right (R)" aria-label="Turn 90° right">⟳ 90°</button>
      <button data-act="dup" title="D">Duplicate</button>${inPlay(it) ? '<button data-act="aside" title="Del">Set aside</button>' : ''}
      <button class="danger" data-act="del">Delete</button>
    </div>
    <details class="more-opts"${moreOpen ? ' open' : ''}><summary>More options</summary>
      <div class="sub">${esc(KIND_HINTS[it.kind])}</div>
      ${shapes.length ? `<div class="row"><label>Shape</label><select data-f="shape" aria-label="Shape">${options(shapeOptions, shape)}</select></div>` : ''}
      ${optionFields(it)}
      <div class="row">${number('°', 'rot', fmt(it.rot))}</div>
      <div class="btns">
        <button data-act="rot" data-v="-15" title="Q" aria-label="Turn 15° left">−15°</button>
        <button data-act="rot" data-v="15" title="E" aria-label="Turn 15° right">+15°</button>
      </div>
      <div class="btns nudge" role="group" aria-label="Move by 10 cm">
        <button data-act="nudge" data-x="-10" data-y="0" aria-label="Move left" title="Move 10 cm left">←</button>
        <button data-act="nudge" data-x="0" data-y="-10" aria-label="Move up" title="Move 10 cm up">↑</button>
        <button data-act="nudge" data-x="0" data-y="10" aria-label="Move down" title="Move 10 cm down">↓</button>
        <button data-act="nudge" data-x="10" data-y="0" aria-label="Move right" title="Move 10 cm right">→</button>
      </div>
      <div class="btns"><button data-act="template">Save as template</button><button data-act="deselect" title="Esc">Deselect</button></div>
      <div style="margin-top:6px">${groupRow(it)}</div>
    </details>`;
}

// The panel is only built anew when its fields change. Otherwise Tab would lose its place at every commit, and a press on a
// button right after typing would hit a button that the commit just replaced.
// The value of an <option> stays in: it says which pieces the select offers, and names alone do not tell them apart.
const panelShape = html => html.replace(/(?<!<option) value="[^"]*"| placeholder="[^"]*"| checked| open(?=>)/g, '');

function renderSel() {
  const it = byId(selected), p = $('#selPanel');
  if (!it) {
    p.innerHTML = '<span class="sub">Nothing selected. Click a piece of furniture.</span>';
    delete p.dataset.shape;
    return;
  }
  const html = selPanelHtml(it), shape = panelShape(html);
  if (p.dataset.shape !== shape) { p.innerHTML = html; p.dataset.shape = shape; return; }
  const fresh = document.createElement('div');
  fresh.innerHTML = html;
  const inputs = fresh.querySelectorAll('input');
  p.querySelectorAll('input').forEach((input, i) => {
    input.value = input.defaultValue = inputs[i].value;
    input.placeholder = inputs[i].placeholder;
    input.checked = inputs[i].checked;
  });
}

// A toggle does not bubble, so this listens on the way down
$('#selPanel').addEventListener('toggle', e => { moreOpen = e.target.open; }, true);

$('#itemList').addEventListener('click', e => {
  const li = e.target.closest('li[data-id]'); if (!li) return;
  const it = byId(li.dataset.id);
  if (e.target.closest('[data-act="aside"]')) return setAside(it);
  selected = it.id;
  // A piece a layout left out of sight comes back in the parking area
  if (it.hidden) { pushHistory(); it.hidden = false; park(it, state.items, proj.room); changed(); } else renderAll();
});

// Layouts keep only placements, so deleting furniture takes it out of all of them
async function confirmDelete(it) {
  const n = layoutsWith(proj, it.id).length;
  if (!n) return true;
  return askYes(`“${it.name}” is part of ${n === 1 ? '1 layout' : `${n} layouts`}. Deleting it removes it from `
    + `${n === 1 ? 'that layout' : 'all of them'}, and undo cannot bring it back after a reload.\n\n`
    + 'To keep it in the layouts, press Cancel and use “Set aside” instead.', 'Delete', true);
}

/** Saves a piece as a template. A template of that name goes only if the user says so. @param {Item} it */
async function storeTemplate(it) {
  const t = templateOf(it);
  if (readTemplates().some(o => o.name === t.name) && !await askYes(`Replace your template “${t.name}”?`, 'Replace')) return;
  const done = saveTemplate(t);
  roomNotice = done ? `“${it.name}” is now in your templates.` : 'This browser could not store the template.';
  goodNotice = done ? roomNotice : '';
  renderRoomPanel();
}

/** The two steps of the Delete button. The question is modal, but a sync can bring in new furniture while it is open. @param {Item} it */
async function deleteItem(it) {
  if (!await confirmDelete(it) || byId(it.id) !== it) return;
  pushHistory();
  state.items = state.items.filter(i => i !== it); pruneGroups(state.items); selected = null;
  changed();
}

/** Takes a piece out of the room, or out of the project when it already waits outside. @param {Item} it */
const removeItem = it => inPlay(it) ? setAside(it) : deleteItem(it);

$('#selPanel').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]'), it = byId(selected);
  if (!b || !it) return;
  const act = b.dataset.act;
  if (act === 'rot') return rotateSel(+b.dataset.v);
  if (act === 'nudge') return moveSel(+b.dataset.x, +b.dataset.y);
  if (act === 'dup') return duplicate();
  if (act === 'aside') return setAside(it);
  if (act === 'template') return storeTemplate(it);
  if (act === 'del') return deleteItem(it);
  if (act === 'deselect') { selected = null; return renderAll(); }
  pushHistory();
  if (act === 'ungroup') ungroup(it, state.items);
  changed();
});

$('#selPanel').addEventListener('change', e => {
  const it = byId(selected), input = e.target;
  if (!it) return;
  if (input.matches('[data-group]')) {
    const other = byId(input.value);
    if (!other) return;
    const step = snapshot();
    if (joinGroup(it, other, state.items)) { pushHistory(step); changed(); }
    return;
  }
  const f = input.dataset.f;
  if (!f) return;
  // A box keeps the focus after a click, which would catch the keys of the plan
  if (input.type === 'checkbox') input.blur();
  const step = snapshot();
  if (editItem(it, f, input.type === 'checkbox' ? input.checked : input.value)) { pushHistory(step); changed(); } else renderSel();
});

// Enter ends the entry, so that the keys of the plan work again. Tab goes on to the next field instead.
$('#selPanel').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });

// ---------- Catalog ----------

/** Puts a new piece into the parking area and selects it. @param {any} def @param {string} color */
function addItem(def, color) {
  const bounds = boundsOf(state.items, proj.room);
  pushHistory();
  /** @type {Item} */
  const it = { color, ...def, id: uniqueId(def.name.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '_').slice(0, 60)), x: 0, y: 0, rot: 0, hidden: false };
  state.items.push(it); park(it, state.items, proj.room); selected = it.id;
  changed();
  if (boundsOf(state.items, proj.room) !== bounds) fitView();
}

/** One row of the dialog. note is the second line: the group in a search, the difference to the size searched for. */
const entryRow = (e, color, data, note = '', extra = '') => `<div class="cat-entry"><button class="add" ${data}>
    <span class="sw" style="background:${esc(color)}"></span><span class="nm">${esc(e.name)}${note ? `<small class="sub note">${esc(note)}</small>` : ''}</span>
    <span class="dim">${fmt(e.w)}×${fmt(e.d)}</span></button><button class="start" ${data} data-start title="Change the size first"
    aria-label="Change the size of ${esc(e.name)} before adding">✎</button>${extra}</div>`;

const dropButton = (t, i) => `<button class="danger" data-drop="${i}" title="Remove template" aria-label="Remove template ${esc(t.name)}">✕</button>`;
/** A search with only a size matches everything, so it shows the closest few */
const SIZE_ONLY_HITS = 12, MAX_HITS = 40;

function renderCatalog() {
  const q = $('#catalogSearch').value.trim(), templates = readTemplates();
  const section = (name, rows) => rows ? `<h3>${esc(name)}</h3><div class="cat-grid">${rows}</div>` : '';
  if (!q) {
    $('#catalogList').innerHTML = section('Your templates', templates.map((t, i) => entryRow(t, t.color, `data-template="${i}"`, '', dropButton(t, i))).join(''))
      + CATALOG.map((c, i) => section(c.name, c.items.map((e, k) => entryRow(e, c.color, `data-cat="${i}" data-item="${k}"`)).join(''))).join('');
    return;
  }
  const { words, size } = parseSearch(q), cap = words.length ? MAX_HITS : SIZE_ONLY_HITS;
  const own = searchFurniture(q, templates.map(e => ({ e }))).slice(0, cap)
    .map(h => entryRow(h.e, h.e.color, `data-template="${h.at}"`, h.diff, dropButton(h.e, h.at))).join('');
  const hits = searchFurniture(q, catalogList()).slice(0, cap);
  const rows = hits.map(h => entryRow(h.e, h.group.color, `data-cat="${h.gi}" data-item="${h.k}"`,
    [h.group.name, h.diff].filter(Boolean).join(' · '))).join('');
  const make = `<button class="make-own" data-own>+ Make your own${size.length ? `, ${size.map(fmt).join(' × ')} cm` : ''}</button>`;
  $('#catalogList').innerHTML = section('Your templates', own)
    + (rows ? section(size.length ? 'Closest sizes' : 'Best matches', rows) : `<p class="sub">Nothing in the catalog matches “${esc(q)}”.</p>`)
    + `<div class="btns">${make}</div>`;
}

// ---------- Your own piece ----------
// One form for a new piece: from nothing, from a catalog entry or template (✎), or from the words and size of a search.

/** What the form starts from. Fields it does not show, such as doors or legs, come from here. @type {any} */
let customBase = null;
const CUSTOM_HINT = 'Name, size, shape and type. ✎ next to a piece starts from it.';

function drawCustomKind(shape = $('#newShape').value) {
  const kind = $('#newKind').value, shapes = ['rect', ...shapesFor(kind)];
  $('#newShape').innerHTML = options(Object.fromEntries(shapes.map(s => [s, SHAPE_LABELS[s]])), shapes.includes(shape) ? shape : 'rect');
  $('#newShape').disabled = shapes.length < 2;
  $('#newKindHint').textContent = KIND_HINTS[kind];
  $('#newH').placeholder = `${fmt(KIND_H[kind])} usual`;
}

/** @param {any} base a catalog entry with its colour, a template, or null @param {{ name?: string, w?: number, d?: number }} [over] */
function fillCustom(base, over = {}) {
  customBase = base;
  $('#newName').value = over.name ?? base?.name ?? '';
  $('#newW').value = over.w ?? (base ? fmt(base.w) : '');
  $('#newD').value = over.d ?? (base ? fmt(base.d) : '');
  $('#newH').value = base?.h === undefined ? '' : fmt(base.h);
  $('#newKind').innerHTML = options(KIND_LABELS, base?.kind ?? 'custom');
  drawCustomKind(base?.shape ?? 'rect');
  $('#newKeep').checked = false;
  $('#newError').textContent = '';
  $('#customFrom').textContent = base ? `Starting from “${base.name}”. Change what you need, then Add.` : CUSTOM_HINT;
}

function openCustom(base, over) {
  fillCustom(base, over);
  const box = $('#customBox');
  box.open = true;
  box.scrollIntoView({ block: 'nearest' });
  $(over?.w ? '#newName' : '#newW').focus();
}

/** The piece a button of the list stands for, with the colour it gets. @param {DOMStringMap} d */
function pieceOf(d) {
  if (d.template !== undefined) return readTemplates()[+d.template];
  const group = CATALOG[+d.cat];
  return { ...catalogDef(group.items[+d.item]), color: group.color };
}

/** "sofa 230x100" starts from the closest sofa, with the name and size searched for */
function customFromSearch() {
  const q = $('#catalogSearch').value.trim(), { words, size } = parseSearch(q);
  const best = searchFurniture(q, [...readTemplates().map(e => ({ e })), ...catalogList()])[0];
  const base = best && (best.group ? { ...catalogDef(best.e), color: best.group.color } : best.e);
  openCustom(base ?? null, { name: words.length ? capitalised(words.join(' ')) : undefined, w: size[0], d: size[1] });
}

$('#openCatalog').onclick = () => {
  $('#catalogSearch').value = '';
  renderCatalog();
  fillCustom(null);
  $('#customBox').open = false;
  $('#catalogDialog').showModal();
  // A phone opens its keyboard on focus, and that would cover the catalog
  if (matchMedia('(pointer: fine)').matches) $('#catalogSearch').focus();
};
$('#catalogSearch').oninput = renderCatalog;
// Enter in the search adds the best match, as a click on it would
$('#catalogSearch').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing) return;
  e.preventDefault();
  /** @type {HTMLElement | null} */ ($('#catalogList .cat-entry .add'))?.click();
});
$('#catalogClose').onclick = () => $('#catalogDialog').close();
$('#newKind').onchange = () => drawCustomKind();
$('#customReset').onclick = () => { fillCustom(null); $('#newName').focus(); };

$('#catalogList').addEventListener('click', e => {
  const b = e.target.closest('button'), d = b?.dataset;
  if (!b) return;
  if (d.own !== undefined) return customFromSearch();
  if (d.drop !== undefined) { removeTemplate(readTemplates()[+d.drop].name); return renderCatalog(); }
  const piece = pieceOf(d);
  if (d.start !== undefined) return openCustom(piece);
  addItem(piece, piece.color);
  $('#catalogDialog').close();
});

$('#addItem').onclick = async () => {
  const def = customPiece(customBase, { name: $('#newName').value, kind: $('#newKind').value, shape: $('#newShape').value,
    w: $('#newW').value, d: $('#newD').value, h: $('#newH').value });
  if (!def) {
    $('#newError').textContent = `Width and depth are needed: 1 to ${MAX_ITEM} cm. The height can stay empty.`;
    $('#newW').focus();
    return;
  }
  const keep = $('#newKeep').checked;
  $('#catalogDialog').close();
  addItem(def, def.color);
  fillCustom(null);
  const it = byId(selected);
  if (keep && it) await storeTemplate(it);
};
