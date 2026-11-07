// @ts-check
// The review of a layout: scores, what speaks for it, what against it and what to change. Everything is worked out from the
// plan by the rules below, nothing is written by hand. No DOM and no global state.

// As many points in favour as there are criteria: reviewLayout() takes them in turn, so that none of them goes unmentioned
const MAX_TIPS = 3, MAX_PROS = 5;
const EMPTY_TIP = 'Place furniture in the room to get a review.';
// Pieces that overlap or stand in a wall cannot be built as drawn, however well the rest scores
const CLASH_CAP = 40;
const WAY_GOOD = 110, WAY_TIGHT = 70, WAY_ENOUGH = 90;  // clear width on the way through the room (cm)
const DESK_FAR = 260, SOFA_FAR = 100;                   // from the window (cm)

/** @param {number} cm */
const metres = cm => `${(cm / 100).toFixed(1)} m`;

/** @param {string} s */
const capitalised = s => s[0].toUpperCase() + s.slice(1);

// What analyze() reports, in the words of a recommendation. a and b are the names of the pieces concerned, fixed is the
// part of the room a check is about.
/** @type {Record<string, (a: string, b: string, fixed: string) => { con: string, tip: string }>} */
const CHECK_RULES = {
  overlap: (a, b) => ({ con: `${a} and ${b} overlap`, tip: `Move ${a} and ${b} apart: as drawn they do not fit.` }),
  wall: a => ({ con: `${a} reaches into a wall`, tip: `Move ${a} away from the wall.` }),
  fixture: a => ({ con: `${a} runs into a fixed part of the room`, tip: `Move ${a} clear of the fixed part of the room.` }),
  swing: a => ({ con: `${a} stands where a door swings`, tip: `Move ${a} out of the door’s swing, or hinge the door on the other side.` }),
  shelf: a => ({ con: `${a} has nothing behind it`, tip: `Put a long side of ${a} against a wall or a wardrobe, so that it stands safely.` }),
  front: a => ({ con: `The front of ${a} is not free`, tip: `Leave room in front of ${a}, or it will not open all the way.` }),
  'image-covered': a => ({ con: `${a} covers part of the projected picture`, tip: `Move ${a} away from the wall with the picture.` }),
  'image-off': a => ({ con: `The picture of ${a} does not fall on a plain wall`, tip: `Move ${a} along the wall until the picture has a plain wall behind it.` }),
  'image-fixed': (a, b, fixed) => ({ con: `${capitalised(fixed)} covers part of the projected picture`, tip: `Move ${a} along the wall, so that ${fixed} is out of the picture.` }),
  'tv-sight': a => ({ con: `${a} stands between the seats and the TV`, tip: `Move ${a} out of the view of the TV.` }),
  'tv-fixed': (a, b, fixed) => ({ con: `${capitalised(fixed)} stands between the seats and the TV`, tip: `Move ${a} or the seats, so that ${fixed} is out of the view.` }),
};

// over lists what a rule looks at (the layout itself if left out) and when decides whether it applies. A rule gives a
// point in favour (pro), or a point against (con) with what to do about it (tip).
/** @type {{ crit: string, over?: (f: any) => any[], when: (x: any) => any, pro?: (x: any) => string,
 *   con?: (x: any) => string, tip?: (x: any) => string }[]} */
const RULES = [
  // Bed
  { crit: 'bed', over: f => f.beds, when: b => b.noHead,
    con: b => `${b.name} has no wall behind the headboard`, tip: b => `Put the head of ${b.name} against a wall.` },
  { crit: 'bed', over: f => f.beds, when: b => !b.noHead && b.free,
    con: b => `${b.name} stands out into the room`, tip: b => `Push ${b.name} to a wall or into a corner: the free floor stays in one piece.` },
  { crit: 'bed', over: f => f.beds, when: b => b.view === 'blocked',
    con: b => `Something tall hides the door from ${b.name}`, tip: b => `Keep the line from ${b.name} to the door free.` },
  { crit: 'bed', over: f => f.beds, when: b => b.view === 'back',
    con: b => `In ${b.name} the door is behind you`, tip: b => `Turn ${b.name} so that you can see the door from the pillow.` },
  { crit: 'bed', over: f => f.beds, when: b => b.doorLine,
    con: b => `${b.name} lies in line with the door`, tip: b => `Move ${b.name} out of the line of the door.` },
  { crit: 'bed', over: f => f.beds, when: b => b.mirror,
    con: b => `A mirror faces ${b.name}`, tip: b => `Move the mirror so that it no longer faces ${b.name}.` },
  { crit: 'bed', over: f => f.beds, when: b => b.deskAtHead,
    con: b => `A desk stands at the head of ${b.name}`, tip: b => `Give the desk a place of its own, away from ${b.name}.` },
  { crit: 'bed', over: f => f.beds, when: b => !b.noHead && !b.free && b.view !== 'blocked' && b.view !== 'back',
    pro: b => `${b.name} has a wall at its head${b.view === 'good' ? ' and the door in sight' : ''}` },

  // Desk
  { crit: 'desk', when: f => f.noSeat, con: () => 'No table has a free seat',
    tip: () => 'Leave about 60 cm free at the long side of a table, so that a chair fits.' },
  { crit: 'desk', over: f => f.desk ? [f.desk] : [], when: d => d.dist >= DESK_FAR,
    con: d => `${d.name} is ${metres(d.dist)} from the nearest window`, tip: d => `Bring ${d.name} closer to a window.` },
  { crit: 'desk', over: f => f.desk ? [f.desk] : [], when: d => d.near && d.facing > 0.7,
    con: d => `At ${d.name} you look straight into the window`, tip: d => `Turn ${d.name} so that daylight comes from the side.` },
  { crit: 'desk', over: f => f.desk ? [f.desk] : [], when: d => d.dist < DESK_FAR && d.facing < -0.7,
    con: d => `At ${d.name} the window is behind you`, tip: d => `Turn ${d.name}: a window behind you reflects in a screen.` },
  { crit: 'desk', over: f => f.desk ? [f.desk] : [], when: d => d.dist < DESK_FAR && Math.abs(d.facing) <= 0.7,
    pro: d => `${d.name} gets daylight from the side` },
  { crit: 'desk', over: f => f.desk ? [f.desk] : [], when: d => d.level === 'good', pro: d => `You see the door from ${d.name}` },

  // Sofa
  { crit: 'sofa', over: f => f.sofa ? [f.sofa] : [], when: s => s.gap !== null && s.gap > SOFA_FAR,
    con: s => `${s.name} is ${metres(s.gap)} from the window`, tip: s => `Move ${s.name} closer to a window for the view.` },
  { crit: 'sofa', over: f => f.sofa ? [f.sofa] : [], when: s => s.gap !== null && s.gap <= SOFA_FAR, pro: s => `${s.name} sits at the window` },
  { crit: 'sofa', over: f => f.sofa ? [f.sofa] : [], when: s => s.screen && !s.sees,
    con: s => s.count > 1 ? 'No seat faces the screen' : `${s.name} does not face the screen`,
    tip: s => s.count > 1 ? 'Turn a seat towards the screen.' : `Turn ${s.name} towards the screen.` },
  { crit: 'sofa', over: f => f.sofa ? [f.sofa] : [], when: s => s.screen && s.sees, pro: s => `${s.viewer} faces the screen` },

  // Way through the room
  { crit: 'flow', over: f => f.flow ? [f.flow] : [], when: w => w.width === -1,
    con: () => 'There is no free way across the room', tip: () => `Clear a way of at least ${WAY_TIGHT} cm from the door to the window.` },
  { crit: 'flow', over: f => f.flow ? [f.flow] : [], when: w => w.width !== null && w.width >= 0 && w.width < WAY_ENOUGH,
    con: w => `The way across the room narrows to ${fmt(w.width)} cm`, tip: () => `Move furniture so that the way stays ${WAY_ENOUGH} cm wide.` },
  { crit: 'flow', over: f => f.flow ? [f.flow] : [], when: w => w.width !== null && w.width >= WAY_GOOD,
    pro: w => `The way across the room is ${fmt(w.width)} cm wide` },
  { crit: 'flow', over: f => f.flow?.cutOff ?? [], when: () => true,
    con: door => `${door} cannot be reached`, tip: door => `Clear a way to ${door}.` },
  { crit: 'flow', over: f => f.flow ? [f.flow] : [], when: w => w.width !== -1 && w.worst >= 85, pro: () => 'All doors open fully' },
  { crit: 'flow', over: f => f.flow ? [f.flow] : [], when: w => w.centre < w.goal,
    con: w => `The open floor is only ${fmt(w.centre)} cm across`, tip: w => `Move furniture to the walls to free a circle of ${fmt(w.goal)} cm.` },
  { crit: 'flow', over: f => f.flow ? [f.flow] : [], when: w => w.centre >= w.goal, pro: w => `Open floor of ${fmt(w.centre)} cm across` },

  // Zones
  { crit: 'zones', when: f => f.zones.bed === 'busy', con: () => 'The bed is not in the quiet part of the room',
    tip: () => 'Move the bed to the side of the room away from the windows.' },
  { crit: 'zones', when: f => f.zones.bed === 'quiet', pro: () => 'The bed is in the quiet part of the room' },
  { crit: 'zones', when: f => f.zones.work === 'dark', con: () => 'The desk is in the dark part of the room',
    tip: () => 'Move the desk to the bright side of the room.' },
  { crit: 'zones', when: f => f.zones.work === 'bright', pro: () => 'The desk is in the bright part of the room' },
  { crit: 'zones', when: f => f.zones.cinema, con: () => 'You watch from the bed instead of the sofa',
    tip: () => 'Turn the sofa towards the screen, so that resting and watching stay apart.' },
];

const COMMAND = { good: 'keeps the door in sight, as the commanding position asks',
  side: 'is close to the commanding position: the door stays at the edge of sight',
  blocked: 'is out of the commanding position: something tall hides the door',
  back: 'is out of the commanding position: the door is behind you' };

/**
 * The same findings as the review in the terms of Feng Shui. This layer explains and never scores: nothing here changes a number.
 * @param {ReturnType<typeof fengShui>} fs @param {any} facts from rateLayout()
 * @returns {{ term: string, good: boolean, text: string }[]}
 */
function fengShuiReading(fs, facts) {
  const out = [], say = (term, good, text) => out.push({ term, good, text });
  const COMMANDING = 'Commanding position', CHI = 'Chi', YIN_YANG = 'Yin and yang';
  for (const v of fs.views) if (v.level) say(COMMANDING, v.level === 'good', `${v.it.name} ${COMMAND[v.level]}`);
  for (const b of facts.beds) {
    if (b.noHead) say(COMMANDING, false, `${b.name} has no solid wall behind the headboard, so it lacks support`);
    if (b.doorLine) say(CHI, false, `Chi from the door rushes straight at ${b.name}`);
    if (b.mirror) say(CHI, false, `A mirror bounces chi back at ${b.name} and unsettles sleep`);
    if (b.deskAtHead) say(YIN_YANG, false, `Work at the head of ${b.name} brings yang into the place of rest`);
  }
  const way = facts.flow;
  if (way) {
    if (way.width === -1) say(CHI, false, 'Chi finds no free way across the room');
    else if (way.width !== null && way.width < WAY_ENOUGH) say(CHI, false, `Chi is squeezed to ${fmt(way.width)} cm on its way through the room`);
    else say(CHI, true, 'Chi flows freely from the door through the room');
    for (const door of way.cutOff) say(CHI, false, `Chi cannot reach ${door}`);
    say(CHI, way.centre >= way.goal, way.centre >= way.goal ? 'The open centre lets chi gather' : 'The centre is crowded, so chi cannot gather');
  }
  if (facts.zones.bed) say(YIN_YANG, facts.zones.bed === 'quiet', facts.zones.bed === 'quiet'
    ? 'The bed rests in the yin part of the room' : 'The bed lies outside the yin part of the room');
  if (facts.zones.work) say(YIN_YANG, facts.zones.work === 'bright', facts.zones.work === 'bright'
    ? 'Work sits in the yang part of the room' : 'Work sits in the yin part of the room');
  if (facts.zones.cinema) say(YIN_YANG, false, 'Watching from the bed mixes yang into the place of rest');
  return out;
}

/**
 * The full review of an arrangement.
 * @param {Item[]} items @param {Room} room @param {ReturnType<typeof fengShui>} [fs] if the caller has it already
 * @returns {{ score: Record<string, number | null>, fine: Record<string, number | null>, why: Record<string, string>,
 *   pro: string[], con: string[], tips: string[], clashes: number, feng: { term: string, good: boolean, text: string }[] }}
 */
function reviewLayout(items, room, fs = fengShui(items, room)) {
  const { score, why, facts, fine } = rateLayout(fs, items, room), { checks } = analyze(items, room);
  const nameOf = id => items.find(i => i.id === id)?.name ?? id;
  // Worst first: first what cannot be built, then what costs the most points, then the smaller conflicts
  const found = RULES.flatMap(r => (r.over ? r.over(facts) : [facts]).filter(r.when).map(x => ({
    crit: r.crit, pro: r.pro?.(x), con: r.con?.(x), tip: r.tip?.(x), order: score[r.crit] ?? 5 })));
  for (const c of checks) {
    const [a, b] = c.ids.map(nameOf);
    found.push({ crit: '', pro: undefined, ...CHECK_RULES[c.code](a, b, c.fixture), order: c.lvl === 2 ? 0 : 3.5 });
  }
  const unique = list => [...new Set(list)];
  const cons = found.filter(f => f.con).sort((a, b) => a.order - b.order);
  // One from each criterion first, or the first criteria take all the room
  const pros = CRIT.map(([k]) => unique(found.filter(f => f.crit === k).flatMap(f => f.pro ?? [])));
  const inTurn = pros.flatMap(list => list.map((text, i) => ({ text, i }))).sort((a, b) => a.i - b.i).map(p => p.text);
  // An empty room has free ways and open doors, but that says nothing about a layout
  if (!activeItems(items, room).length)
    return { score: Object.fromEntries(CRIT.map(([k]) => [k, null])), fine: {}, why, pro: [], con: [], tips: [EMPTY_TIP], clashes: 0, feng: [] };
  return { score, fine, why, pro: unique(inTurn).slice(0, MAX_PROS), con: unique(cons.map(f => f.con)),
    tips: unique(cons.map(f => f.tip)).slice(0, MAX_TIPS), clashes: checks.filter(c => c.lvl === 2).length,
    feng: fengShuiReading(fs, facts) };
}

/** The total of a review as a percentage, null when nothing in it applies.
 * @param {ReturnType<typeof reviewLayout>} review @param {any} weights @returns {number | null} */
function reviewTotal({ score, fine, clashes }, weights) {
  if (!CRIT.some(([k]) => score[k] !== null)) return null;
  const total = weightedScore(fine, weights);
  return clashes ? Math.min(total, CLASH_CAP) : total;
}

// What stands in the room, whatever waits in the parking area
const placedState = (items, room) => JSON.stringify(activeItems(items, room).map(i => [i.id, i.x, i.y, i.rot]));

/**
 * Everything the analysis and compare pages show: each layout of a project with its review, and in front of them the working
 * arrangement, unless it is one of the layouts or nothing stands in the room yet.
 * @param {Project} p
 */
function reviewEntries(p) {
  const saved = p.layouts.map(layout => ({ name: layout.name, items: layoutItems(p, layout), idea: layout.idea ?? [],
    notes: layout.review, now: !!layout.review?.now, working: false }));
  const items = projectItems(p), state = placedState(items, p.room);
  const known = saved.some(e => placedState(e.items, p.room) === state);
  const base = p.current?.name ? `${p.current.name} (edited)` : 'Current arrangement';
  const list = activeItems(items, p.room).length && !known
    ? [{ name: uniqueLayoutName(p.layouts, base), items, idea: [], notes: undefined, now: false, working: true }, ...saved] : saved;
  return list.map(e => ({ ...e, review: reviewLayout(e.items, p.room) }));
}
