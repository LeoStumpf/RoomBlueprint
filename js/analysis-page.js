// @ts-check
// Room Check page (room-check.html)

(() => {


const proj = activeProject();
// A starter room the store refused was never there, so finding it missing later means nothing
const wasStored = !!readProject(proj.id);
const ENTRIES = reviewEntries(proj);

// Weight 0–3 per criterion
const LEVELS = ['not at all', 'a little', 'important', 'very important'];
let weights = loadWeights(proj);
let sortKey = 'score', asc = false;
/** The last weights were refused, so what the page shows is the only copy */
let weightsRefused = false;

const value = s => reviewTotal(s.review, weights);
const percent = s => pctText(value(s));
const keyOf = (s, k) => k === 'score' ? value(s) : k === 'name' ? s.name : s.review.score[k];
const anchor = s => 'a-' + encodeURIComponent(s.name).replace(/%/g, '');

function saveWeights() {
  proj.weights = weights;
  weightsRefused = !storeWeights(proj.id, weights, proj.profile);
  // Deleted in another tab or on another device: nothing is wrong with the store, there is just no project left here
  if (weightsRefused && wasStored && !readProject(proj.id)) return reloadPage();
  showNotices(weightsRefused);
  pushProjects();
}

// “file” stands for the weights the project file came with
const profileKey = () => proj.profile ?? (proj.baseWeights ? 'file' : 'balanced');
const profileOptions = () => [...(proj.baseWeights ? [['file', 'As in the project file']] : []),
  ...Object.entries(PROFILES).map(([k, p]) => [k, p.label])];

function applyStandard() {
  weights = standardWeights(proj); saveWeights();
  $$('#weights select[data-k]').forEach(sel => { sel.value = weights[sel.dataset.k]; });
  sortKey = 'score'; asc = false; render();
}

$id('projectName').textContent = proj.name;
$id('weights').innerHTML = CRIT.map(([k, l]) => `<label>${l}
  <select data-k="${k}">${LEVELS.map((t, i) => `<option value="${i}"${weights[k] === i ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`).join('') +
  `<label>Room profile <select id="profile">${profileOptions().map(([k, l]) =>
    `<option value="${k}"${k === profileKey() ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
  <button id="resetW" title="Back to the weights of the room profile">Standard</button>`;
$id('weights').addEventListener('change', e => {
  const k = e.target.dataset.k; if (!k) return;
  weights[k] = +e.target.value; saveWeights(); sortKey = 'score'; asc = false; render();
});
$id('profile').onchange = e => {
  const key = e.target.value;
  if (key === 'file') delete proj.profile; else proj.profile = key;
  applyStandard();
};
$id('resetW').onclick = applyStandard;

function sorted() {
  return [...ENTRIES].sort((a, b) => {
    const x = keyOf(a, sortKey), y = keyOf(b, sortKey);
    const c = typeof x === 'string' ? x.localeCompare(y, 'en') : (y - x) || (value(b) - value(a));  // n/a counts as 0
    return asc ? -c : c;
  });
}

let overlayOn = storeGet(OVERLAY_KEYS.check) !== 0;   // on until it is switched off
const toggle = $id('overlayToggle');
toggle.checked = overlayOn;
toggle.onchange = () => {
  overlayOn = toggle.checked;
  storeSet(OVERLAY_KEYS.check, overlayOn ? 1 : 0);
  renderLegend();
  $$('details.setup').forEach(drawCardPlan);
};
let fengOn = fengSwitch($id('fengToggle'), on => {
  fengOn = on;
  renderLegend();
  $$('details.setup').forEach(drawCardPlan);
});

// The legend says what the plans say, in the same words. Each open plan has it below.
function legendHtml() {
  const w = PLAN_WORDS[fengOn ? 'feng' : 'neutral'], cap = capitalised;
  const swatch = (style, label, cls = '') => `<span><i class="sw ${cls}" style="${style}"></i>${esc(label)}</span>`;
  const zone = (k, label) => swatch(`border-color:var(--zone-${k});background:color-mix(in srgb, var(--zone-${k}) 12%, transparent)`, label, 'zone');
  return [
    swatch('background:linear-gradient(0deg,var(--plan-sun),transparent)', 'Daylight from windows and balcony doors'),
    zone('rest', w.rest),
    zone('live', w.live),
    zone('work', `${w.work}, with chair`),
    swatch('border-color:var(--plan-flow)', `${w.way}: the widest way from the entrance`, 'dash'),
    swatch('border-color:var(--plan-warn)', 'Narrow spot (chairs count)', 'ring'),
    swatch('border-style:dashed;border-color:var(--plan-flow);background:none', w.centre, 'ring'),
    swatch('border-color:var(--plan-zone-work)', cap(w.good), 'line'),
    swatch('border-color:var(--plan-warn)', cap(w.side), 'dash'),
    swatch('border-color:var(--plan-bad)', `${cap(w.back)}, or the door hidden`, 'dash'),
    swatch('background:color-mix(in srgb, var(--plan-bad) 15%, transparent)', w.doorLine),
  ].join('');
}
function renderLegend() {
  const html = legendHtml();
  $$('.legend-items').forEach(box => { box.innerHTML = html; box.hidden = !(overlayOn || fengOn); });
}

// Draw the plans only once the card is open: the path search takes time
function drawCardPlan(d) {
  const plan = d.querySelector('svg.plan');
  const key = `${overlayOn}|${fengOn}`;
  if (!d.open || plan.dataset.drawn === key) return;
  plan.dataset.drawn = key;
  const s = ENTRIES.find(x => x.name === plan.dataset.name);
  drawPreview(plan, proj.room, s.items, overlayOn || fengOn, plan.dataset.uid, fengOn);
}

const th = (k, label) => `<th class="sort${sortKey === k ? ' active' + (asc ? ' asc' : '') : ''}" data-k="${k}"${
  sortKey === k ? ` aria-sort="${asc ? 'ascending' : 'descending'}"` : ''}><button>${label}</button></th>`;

function render() {
  const list = sorted();
  $id('summary').innerHTML =
    `<tr><th></th>${th('name', 'Layout')}${th('score', 'Your score')}${CRIT.map(([k, l]) => th(k, l)).join('')}</tr>` +
    list.map((s, i) => `<tr class="${s.now ? 'now' : ''}"><td class="rank">${i + 1}.</td>
      <td><a href="#${anchor(s)}" data-open="${anchor(s)}">${esc(s.name)}</a></td>
      <td class="num"><span class="bar" style="width:${Math.round((value(s) ?? 0) * 0.6)}px"></span>${percent(s)}</td>
      ${CRIT.map(([k]) => `<td class="crit-pct">${pctText(critPercent(s.review, k))}</td>`).join('')}</tr>`).join('');

  // Cards in the same order; open cards stay open
  const cards = $id('cards');
  if (!list.length) return;
  const open = new Set([...cards.querySelectorAll('details[open]')].map(d => d.id));
  const first = !cards.children.length;
  const existing = new Map([...cards.children].map(d => [d.id, d]));
  list.forEach((s, i) => {
    let d = existing.get(anchor(s));
    if (!d) {
      d = document.createElement('details');
      d.className = 'setup'; d.id = anchor(s);
      d.innerHTML = `<summary></summary>
        <div class="card">
          <div class="check-text">
            ${s.idea.map(t => `<p class="idea">${esc(t)}</p>`).join('')}
            <div class="bars">${barsHtml(s.review)}</div>
            <h4>Recommendations</h4>
            ${reviewHtml(s.review)}
            ${fengHtml(s.review.feng)}
            ${notesHtml(s.notes)}
          </div>
          <div class="check-plan">
            <svg class="plan" role="img" aria-label="Plan of ${esc(s.name)}" data-name="${esc(s.name)}" data-uid="p${ENTRIES.indexOf(s)}"></svg>
            <div class="legend-items"></div>
          </div>
        </div>`;
      d.addEventListener('toggle', () => drawCardPlan(d));
    }
    d.querySelector('summary').innerHTML = `<span class="sub">${i + 1}.</span><h3>${esc(s.name)}</h3>
      <span class="tag">${entryTag(s)}</span>
      <span class="minis">${CRIT.map(([k, l]) => `<span title="${l}">${l.split(/[ ,]/)[0]} ${pctText(critPercent(s.review, k))}</span>`).join('')}</span>
      <b class="num">${percent(s)}</b>`;
    if (first ? i < 1 : open.has(d.id)) d.open = true;
    cards.appendChild(d);
  });
  renderLegend();
}

$id('summary').addEventListener('click', e => {
  const h = e.target.closest('th.sort');
  if (h) { const k = h.dataset.k; if (sortKey === k) asc = !asc; else { sortKey = k; asc = k === 'name'; } render(); return; }
  const a = e.target.closest('a[data-open]');
  if (a) { const d = $id(a.dataset.open); if (d) d.open = true; }
});
$id('openAll').onclick = () => $$('details.setup').forEach(d => { d.open = true; });
$id('closeAll').onclick = () => $$('details.setup').forEach(d => { d.open = false; });

if (!ENTRIES.length) $id('cards').innerHTML = '<p class="sub">Nothing to review yet: place furniture in the planner or save a layout.</p>';
render();
onSync(() => showNotices(weightsRefused));
syncAndFollow(proj);

})();
