// @ts-check
// Compare page (compare.html)

(() => {

const MAX = 4;
const proj = activeProject();
const ENTRIES = reviewEntries(proj);
$id('projectName').textContent = proj.name;
const PICK_KEY = `roomBlueprint.compare.${proj.id}`;
const byName = new Map(ENTRIES.map(s => [s.name, s]));

// Weights as set on Room Check
const weights = loadWeights(proj);
const value = s => reviewTotal(s.review, weights);
const percent = s => pctText(value(s));
// Without a choice of your own: the four that score best
const DEFAULT_PICK = [...ENTRIES].sort((a, b) => (value(b) ?? 0) - (value(a) ?? 0)).slice(0, MAX).map(s => s.name);

let pick = (storeGet(PICK_KEY) || DEFAULT_PICK).filter(n => byName.has(n)).slice(0, MAX);
let overlayOn = storeGet(OVERLAY_KEYS.compare) === true;
const save = () => storeSet(PICK_KEY, pick);

function renderChips() {
  $id('chips').innerHTML = ENTRIES.map(s => {
    const i = pick.indexOf(s.name);
    return `<button class="chip${i >= 0 ? ' on' : ''}" aria-pressed="${i >= 0}" data-name="${esc(s.name)}"${i < 0 && pick.length >= MAX ? ' disabled' : ''}>${i >= 0 ? `<b>${i + 1}.</b>` : ''}${esc(s.name)}</button>`;
  }).join('');
}

function render() {
  renderChips();
  const list = pick.map(n => byName.get(n));
  for (const g of ['plans', 'texts']) $id(g).style.setProperty('--n', String(Math.max(list.length, 1)));
  const head = (s, i, move) => `<h3><span class="prio">${i + 1}.</span>${esc(s.name)}${move ? `<span class="move">
    <button data-mv="-1" data-i="${i}" title="Move forward" aria-label="Move ${esc(s.name)} forward"${i ? '' : ' disabled'}>◀</button>
    <button data-mv="1" data-i="${i}" title="Move back" aria-label="Move ${esc(s.name)} back"${i < list.length - 1 ? '' : ' disabled'}>▶</button></span>` : ''}</h3>`;

  // Redraw the plans only when something changed (the path search takes time)
  const plans = $id('plans');
  const key = [...list.map(s => s.name), overlayOn, fengOn].join('|');
  if (plans.dataset.key !== key) {
    plans.dataset.key = key;
    plans.innerHTML = list.length ? list.map((s, i) => `<div class="col">${head(s, i, true)}
      <svg class="plan" role="img" aria-label="Plan of ${esc(s.name)}" data-name="${esc(s.name)}"></svg>
      <table class="score">${CRIT.map(([k, l]) => `<tr><td>${l}</td><td>${pctBar(critPercent(s.review, k))}</td></tr>`).join('')}
        <tr class="total"><td>Score (your weights)</td><td>${percent(s)}</td></tr></table>
    </div>`).join('') : `<p class="sub">${ENTRIES.length ? 'Pick up to four layouts above.' : 'Nothing to compare yet: place furniture in the planner or save a layout.'}</p>`;
    plans.querySelectorAll('svg.plan').forEach((plan, i) => {
      drawPreview(plan, proj.room, byName.get(plan.dataset.name).items, overlayOn || fengOn, `c${i}`, fengOn);
    });
  }
  // A table, because its head comes back on every page when the texts run on. On screen it is taken apart into the same grid.
  $id('texts').innerHTML = `<table><thead><tr>${list.map((s, i) => `<th scope="col"><span class="prio">${i + 1}.</span> ${esc(s.name)}</th>`).join('')}</tr></thead>
    <tbody><tr>${list.map((s, i) => `<td class="col">${head(s, i, false)}
    ${reviewHtml(s.review)}
    ${fengHtml(s.review.feng)}
    ${notesHtml(s.notes)}
    <div class="notes">Notes / gut feeling<i></i><i></i><i></i></div>
  </td>`).join('')}</tr></tbody></table>`;
}

$id('chips').onclick = e => {
  const b = e.target.closest('button[data-name]'); if (!b) return;
  const n = b.dataset.name, i = pick.indexOf(n);
  if (i >= 0) pick.splice(i, 1); else if (pick.length < MAX) pick.push(n);
  save(); render();
};
$id('plans').onclick = e => {
  const b = e.target.closest('button[data-mv]'); if (!b) return;
  const i = +b.dataset.i, j = i + +b.dataset.mv;
  [pick[i], pick[j]] = [pick[j], pick[i]];
  save(); render();
};
const toggle = $id('overlayToggle');
toggle.checked = overlayOn;
toggle.onchange = () => { overlayOn = toggle.checked; storeSet(OVERLAY_KEYS.compare, overlayOn); render(); };
let fengOn = fengSwitch($id('fengToggle'), on => { fengOn = on; render(); });
$id('reset').onclick = () => { pick = [...DEFAULT_PICK]; save(); render(); };
$id('print').onclick = () => printPlan();
$$('.date').forEach(e => { e.textContent = dateText(); });

// The tab Print view is compare.html?print. Printing from Compare uses the same layout.
const PAPER = new URLSearchParams(location.search).has('print');
const tab = $id(PAPER ? 'tabPaper' : 'tabCmp');
tab.classList.add('active'); tab.setAttribute('aria-current', 'page');
$id('title').textContent = PAPER ? 'Print view' : 'Compare';
document.title = `${PAPER ? 'Print view' : 'Compare'} · Room Blueprint`;
const paper = on => document.documentElement.classList.toggle('paper', on);
paper(PAPER);
addEventListener('beforeprint', () => paper(true));
addEventListener('afterprint', () => paper(PAPER));
render();
syncAndFollow(proj);

})();
