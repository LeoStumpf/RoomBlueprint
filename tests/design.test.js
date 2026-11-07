'use strict';
// Phase 8: the Blueprint look. Tokens instead of fixed colours, nothing loaded from the net, the rules behind the new layout.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, plain, ROOT, item, ROOM, PROJECT_SCRIPTS } = require('./load');

const { get } = load([...PROJECT_SCRIPTS, 'js/render.js', 'js/print.js']);
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const HTML = ['index.html', 'room-check.html', 'compare.html'];
const CSS = ['css/app.css', 'css/planner.css', 'css/analysis.css', 'css/compare.css'];
const JS = fs.readdirSync(path.join(ROOT, 'js')).map(f => `js/${f}`);

test('the plan draws with tokens: no fixed colour is left in the renderer', () => {
  const code = read('js/render.js').replace(/&#39;/g, '');
  assert.deepEqual(code.match(/#[0-9a-f]{3,8}\b/gi) ?? [], []);
});

test('every plan token the renderer uses is defined, for light and for dark', () => {
  const css = read('css/app.css'), head = '@media screen and (prefers-color-scheme: dark)';
  const light = css.slice(0, css.indexOf(head)), dark = css.slice(css.indexOf(head), css.indexOf('* { box-sizing'));
  for (const [key, value] of Object.entries(plain(get('PLAN')))) {
    const name = /var\((--[\w-]+)\)/.exec(value)[1];
    assert.match(light, new RegExp(`${name}:`), `${key} in light`);
    if (!['glass', 'sun'].includes(key)) assert.match(dark, new RegExp(`${name}:`), `${key} in dark`);
  }
});

test('fixed colours stay out of the stylesheets of the pages, the tokens are in app.css', () => {
  for (const f of ['css/planner.css', 'css/analysis.css']) {
    const screen = read(f).split('@media print')[0];
    assert.deepEqual(screen.match(/#[0-9a-f]{3,8}\b(?![\w-]*\s*[,{])/gi) ?? [], [], f);
  }
});

test('paper is light on a dark screen: the sheet takes the light tokens', () => {
  assert.match(read('css/app.css'), /^:root, \.paper \.sheet \{/m);
});

test('nothing comes from the net: the fonts are the ones on the device, with system fonts behind them', () => {
  for (const f of [...HTML, ...CSS, ...JS]) assert.doesNotMatch(read(f), /https?:\/\/(?!www\.w3\.org)|fonts\.g|@import|@font-face/, f);
  assert.match(read('css/app.css'), /--font-sans: "IBM Plex Sans", system-ui/);
  assert.match(read('css/app.css'), /--font-mono: "IBM Plex Mono", ui-monospace/);
  assert.match(get('PLAN_FONT'), /monospace$/);
});

test('dark mode is for the screen, paper stays light', () => {
  for (const f of ['css/app.css', 'css/planner.css', 'css/analysis.css', 'css/compare.css']) {
    assert.doesNotMatch(read(f), /@media\s*\(prefers-color-scheme/, f);
  }
});

test('a text dialog answers Enter itself, the first button in the form is Cancel', () => {
  assert.match(read('js/dialogs.js'), /input\.addEventListener\('keydown'[\s\S]{0,120}'Enter' && !e\.isComposing[\s\S]{0,60}d\.close\('yes'\)/);
});

test('the browser dialogs are gone', () => {
  for (const f of JS) assert.doesNotMatch(read(f).replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ''), /(?<![\w.])(alert|confirm|prompt)\(/, f);
});

test('every page has the icon and the shared top bar', () => {
  for (const f of HTML) {
    const html = read(f);
    assert.match(html, /<link rel="icon" href="favicon.svg"/, f);
    assert.match(html, /<header class="topbar">/, f);
    assert.match(html, /<nav class="tabs" aria-label="Views">/, f);
  }
});

test('touch: everything that can be pressed is 44 px, on a coarse pointer and at phone width', () => {
  assert.match(read('css/app.css'), /@media \(pointer: coarse\), \(max-width: 760px\) \{\s*button, select, summary, \.tabs a, input\[type=text\], input\[type=number\], input\[type=search\] \{ min-height: 44px; \}/);
  assert.equal(get('TOUCH_R') * 2, 44);
});

// The top-level @media blocks of a stylesheet, in order, with where they start
const mediaBlocks = css => {
  const blocks = [];
  for (const m of css.matchAll(/@media ([^{]+?)\s*\{/g)) {
    let depth = 1, i = m.index + m[0].length;
    while (depth && i < css.length) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; }
    blocks.push({ query: m[1], start: m.index, body: css.slice(m.index + m[0].length, i - 1) });
  }
  return blocks;
};
const COARSE = '(pointer: coarse), (max-width: 760px)', PHONE = '(max-width: 760px)';

test('touch: what the pages set smaller is raised for every touch screen, not only at phone width', () => {
  const need = {
    'css/app.css': ['input[type=color] { min-height: 44px; min-width: 44px; }'],
    'css/planner.css': [
      '.menu summary { min-height: 44px; }',
      '.menu-list button, .menu-list a { min-height: 44px; }',
      '.canvas-tools button, #zoom button { min-width: 44px; min-height: 44px; }',
      '.dialog-link { display: inline-flex; align-items: center; min-height: 44px; }',
      '.nudge button { width: 44px; }',
    ],
    'css/analysis.css': [
      'th button { min-height: 44px; }',
      '#summary td a { display: inline-flex; align-items: center; min-height: 44px; }',
    ],
  };
  for (const [f, rules] of Object.entries(need)) {
    const css = read(f), block = mediaBlocks(css).find(b => b.query === COARSE);
    assert.ok(block, `${f} has a coarse-pointer block`);
    for (const rule of rules) {
      assert.ok(block.body.includes(rule), `${f}: ${rule}`);
      // Same specificity as the base rule, so it has to come after it
      const base = css.indexOf(`\n${rule.split(' {')[0]} {`);
      assert.ok(base < block.start, `${f}: the block stands after the base rule of ${rule}`);
    }
  }
});

test('touch: no 44 px rule hides behind max-width alone', () => {
  // The bar of the phone layout, not a target: the full bar is 48 px on any other screen
  const layout = ['.brand', '.topbar .brand, .topbar .top-project'];
  for (const f of CSS) {
    for (const b of mediaBlocks(read(f)).filter(x => x.query === PHONE)) {
      for (const [, selector, rule] of b.body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (layout.includes(selector.trim())) continue;
        assert.doesNotMatch(rule, /(^|[\s;])(min-)?(width|height): 44px/, `${f}: ${selector.trim()}`);
      }
    }
  }
});

test('the planner tabs are all reachable: below the width where they fit, the More menu has them', () => {
  const blocks = mediaBlocks(read('css/planner.css')), html = read('index.html');
  const tabs = /<nav class="tabs"[^>]*>(.*?)<\/nav>/.exec(html)[1];
  const links = [...html.matchAll(/<a class="phone-only" href="([^"]+)"/g)].map(m => m[1]);
  const needed = [...tabs.matchAll(/<a href="([^"]+)"/g)].map(m => m[1]).filter(h => h !== 'index.html');
  assert.deepEqual(links, needed);
  const block = blocks.find(b => /\.menu-list \.phone-only \{ display: block !important; \}/.test(b.body));
  assert.ok(block, 'a block shows the links of the menu');
  const width = +/^\(max-width: (\d+)px\)$/.exec(block.query)?.[1];
  assert.ok(width >= 1000 && width < 1280, `up to where the tabs fit, not on a desktop: ${block.query}`);
  // Where the menu has them, the tab bar is gone instead of cut off, at the same width
  assert.match(block.body, /\.topbar \.tabs \{ display: none; \}/, 'the tabs are hidden in the same block');
});

test('the tab bar of the planner is hidden below 1120 px, not only on the phone', () => {
  const block = mediaBlocks(read('css/planner.css')).find(b => /\.topbar \.tabs \{ display: none; \}/.test(b.body));
  assert.equal(block?.query, '(max-width: 1120px)');
});

test('the More menu fits a short screen: it scrolls, its entries keep their height, and it stays open while scrolling', () => {
  const css = read('css/planner.css'), rule = /\n\.menu-list \{([^}]*)\}/.exec(css)[1];
  assert.match(rule, /max-height: calc\(100dvh - /);
  assert.match(rule, /overflow-y: auto/);
  assert.match(css, /\n\.menu-list > \* \{ flex: none; \}/);
  // A press on the scrollbar is a press in the list, only an entry closes it
  assert.match(read('js/app.js'), /e\.target\.closest\('\.menu-list a, \.menu-list button'\)/);
});

test('the room panel lists what is in the room, and the list works without the mouse', () => {
  const html = read('index.html'), code = read('js/room-editor.js');
  assert.match(html, /<ul class="items" id="roomParts" aria-labelledby="[\w-]+">/);
  assert.ok(html.indexOf('id="roomParts"') > html.indexOf('id="roomPanel"') && html.indexOf('id="roomParts"') < html.indexOf('id="selSection"'));
  assert.doesNotMatch(/id="roomPanel"[^>]*>/.exec(html)[0], /plan-only/);
  assert.match(code, /aria-pressed="/);
  assert.doesNotMatch(code, /Click a door, window or fixture in the plan\.'/);
});

test('every opening and fixture has its row, under the name it has on the plan', () => {
  const parts = get('roomParts'), geo = get('roomGeo')(ROOM);
  const rows = plain(parts(ROOM));
  assert.deepEqual(rows.map(r => [r.kind, r.i]), [['opening', 0], ['opening', 1], ['fixture', 0], ['fixture', 1]]);
  assert.deepEqual(rows.map(r => r.label), [geo.openings[0].label, geo.openings[1].label, 'Chimney', 'Radiator']);
  assert.deepEqual(rows.map(r => r.note), ['right wall', 'bottom wall', 'x 360 · y 0', 'x 310 · y 490']);
  assert.deepEqual(plain(parts({ ...ROOM, openings: [], fixtures: [] })), []);
  // Named and numbered as in roomGeo
  const named = { ...ROOM, openings: [{ ...ROOM.openings[0], name: 'Hall' }, { ...ROOM.openings[0], pos: 250 }], fixtures: [] };
  assert.deepEqual(plain(parts(named)).map(r => r.label), plain(get('roomGeo')(named).openings).map(o => o.label));
});

test('parts list on one line: footHeight() relies on it', () => {
  const print = read('css/planner.css').split('@media print')[1];
  assert.match(print, /#printList th, #printList td \{[^}]*white-space: nowrap/);
  assert.match(print, /#printList td:nth-child\(2\) \{[^}]*overflow: hidden; text-overflow: ellipsis/);
  assert.match(print, /#printCheck \{[^}]*white-space: nowrap/);
});

// ---------- Texts ----------

test('a criterion is a percentage of 5 points, and n/a stays n/a', () => {
  const pct = get('critPercent');
  assert.equal(pct({ score: { bed: 5 } }, 'bed'), 100);
  assert.equal(pct({ score: { bed: 4 }, fine: { bed: 3.6 } }, 'bed'), 72);
  assert.equal(pct({ score: { bed: null } }, 'bed'), null);
  assert.equal(get('pctText')(null), 'n/a');
  assert.equal(get('pctText')(79.6), '80 %');
});

test('the bars show every criterion with its measured reason and escape what they show', () => {
  const r = get('reviewLayout')([], ROOM), html = get('barsHtml')({ ...r, why: { ...r.why, bed: '<b>x</b>' } });
  assert.equal(html.match(/class="bar-row/g).length, plain(get('CRIT')).length);
  assert.match(html, /&lt;b&gt;x/);
  assert.match(html, /width:0%/);
});

test('a criterion in a table cell is a short percentage bar, on the same scale as the bars', () => {
  const bar = get('pctBar');
  assert.match(bar(72), /width:72%/);
  assert.match(bar(72), /72 %/);
  assert.match(bar(null), /n\/a/);
  assert.doesNotMatch(bar(null), /width:/);
});

test('scores are percentages everywhere: no page shows points or dots', () => {
  for (const f of ['js/compare-page.js', 'js/analysis-page.js', 'js/app.js', 'js/print.js']) {
    assert.doesNotMatch(read(f), /\bdots\(|of 5\b/, f);
  }
  assert.match(read('js/compare-page.js'), /pctBar\(critPercent\(s\.review, k\)\)/);
  assert.doesNotMatch(read('css/app.css'), /\.dots\b|--dot\b/);
});

test('a line of the reading does not repeat its term', () => {
  const line = get('fengLine');
  assert.equal(line({ term: 'Chi', good: true, text: 'Chi flows freely' }), 'Chi flows freely');
  assert.equal(line({ term: 'Yin and yang', good: false, text: 'Work sits in the yin part' }), '<b>Yin and yang:</b> Work sits in the yin part');
});

test('a name is cut to what fits, and a short one stays', () => {
  const clip = get('clipLabel');
  assert.equal(clip('Bed', 10), 'Bed');
  assert.equal(clip('x'.repeat(200), 8), `${'x'.repeat(7)}…`);
  assert.equal(clip('Sofa bed', 6), 'Sofa…');
  assert.ok(clip('abc', 0.5).length <= 2);
});

test('the warning stays on one line and says how much it left out', () => {
  const line = get('warningLine'), hits = Array.from({ length: 14 }, (_, i) => `Piece number ${i} overlaps the piece next to it`);
  assert.equal(line([]), '');
  assert.equal(line(['a']), 'Measure again: a');
  const text = line(hits);
  assert.ok(text.length <= 125, text);
  assert.match(text, /\+1\d more$/);
  const long = line(['y'.repeat(300), 'b']);
  assert.ok(long.length <= 125, long);
  assert.match(long, /… · \+1 more$/);
});

// ---------- Plan ----------

test('a thin wall has no room for a name, so it goes just inside the room', () => {
  const off = get('wallLabelOffset');
  assert.equal(off(20, 10), 10);
  assert.ok(off(6, 10) < 0);
});

test('handles sit in the middle of a wall, or beside what is in the way', () => {
  const along = get('handleAlong'), room = (openings, l = 500) => ({ ...ROOM, l, openings });
  assert.equal(along(room([]), 'right', 12), 250);
  const door = { type: 'door', wall: 'right', pos: 200, width: 100, hinge: 'start' };
  const v = along(room([door]), 'right', 12);
  assert.ok(v <= 188 || v >= 312, String(v));
  assert.equal(along(room([door]), 'left', 12), 250, 'another wall is free');
  // A wall full of openings has no good spot: the handle stays in the middle
  assert.equal(along(room([{ ...door, pos: 0, width: 500 }]), 'right', 12), 250);
});

test('a parked piece does not change how a layout is fitted to its preview', () => {
  const bounds = get('contentBounds'), active = get('activeItems');
  const bed = item('bed', 'bed', 100, 150, 140, 200), lamp = item('lamp', 'custom', 800, 100, 40, 40);
  assert.deepEqual(plain(bounds(active([bed, lamp], ROOM), ROOM)), plain(bounds(active([bed], ROOM), ROOM)));
  assert.notDeepEqual(plain(bounds([bed, lamp], ROOM)), plain(bounds([bed], ROOM)));
  assert.match(read('js/render.js'), /contentBounds\(activeItems\(items, room\), room\)/);
});

// ---------- Print ----------

const outward = { w: 400, l: 300, wall: 15, fixtures: [], openings: [{ type: 'door', wall: 'right', pos: 100, width: 90, hinge: 'start', swing: 'out' }] };

test('a leaf that opens outward does not cross the rows of dimensions', () => {
  const offset = get('rowOffset'), reach = plain(get('leafReach')(outward));
  assert.ok(reach.right > 80, String(reach.right));
  assert.equal(reach.left, 0);
  assert.ok(offset('right', 0, 1, reach.right) > reach.right);
  assert.equal(offset('left', 0, 1, 0), 12);
  const f = get('printFrame')(outward, 1), rows = plain(get('dimensionRows')(outward));
  assert.ok(f.x0 + f.w >= 400 + 15 + offset('right', rows.right.length - 1, 1, reach.right), 'the frame holds the rows');
});

test('a list too long for the sheet takes nothing from the plan', () => {
  const foot = get('footHeight'), max = get('LIST_ON_SHEET');
  assert.ok(foot(max) > foot(10));
  assert.equal(foot(max + 1), foot(0));
  assert.ok(get('pickPrintScale')(ROOM, foot(200)) <= 30, 'an ordinary scale, whatever the length of the list');
});
