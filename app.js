/* LiftLog — vanilla JS, no build step, all data in localStorage. See CLAUDE.md. */
'use strict';

const KEY = 'liftlog.v1';
const app = document.getElementById('app');
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round = n => Math.round(n * 100) / 100;
const keyOf = name => String(name).trim().toLowerCase();
const fmtDate = iso => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/* ---------- state ---------- */
let S = load();
function blank() { return { version: 1, unit: 'kg', splits: [], sessions: [], activeId: null }; }
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.version === 1) return d; } catch (e) {}
  return blank();
}
function save() { localStorage.setItem(KEY, JSON.stringify(S)); }

const finished = () => S.sessions.filter(s => s.done).sort((a, b) => b.date.localeCompare(a.date));
const active = () => S.sessions.find(s => s.id === S.activeId) || null;
const splitById = id => S.splits.find(s => s.id === id);

/* Next split = the one after the split you trained last time (wraps round). */
function nextSplit() {
  if (!S.splits.length) return null;
  const last = finished()[0];
  if (!last) return S.splits[0];
  const i = S.splits.findIndex(s => s.id === last.splitId);
  return S.splits[(i + 1) % S.splits.length];
}

/* History is keyed by exercise NAME so "Bench Press" shares history across splits. */
function lastSets(name) {
  for (const s of finished()) {
    const e = s.entries[keyOf(name)];
    if (e && e.length) return { sets: e, date: s.date };
  }
  return null;
}

/* Progressive overload — double progression.
   - No history: start weight × bottom of rep range.
   - Every set hit the top of the rep range: add the weight increment, reset reps to bottom.
   - Otherwise: same weight, +1 rep per set (capped at top of range). */
function suggest(ex) {
  const last = lastSets(ex.name);
  const n = ex.sets;
  if (!last) return { sets: Array.from({ length: n }, () => ({ w: ex.startWeight || 0, r: ex.repMin })), why: 'First time — set your starting weight.' };
  const L = last.sets;
  const allTop = L.length >= n && L.every(s => s.r >= ex.repMax);
  if (allTop) {
    const w = round(Math.max(...L.map(s => s.w)) + ex.increment);
    return { sets: Array.from({ length: n }, () => ({ w, r: ex.repMin })), why: `Hit ${ex.repMax} on every set → +${ex.increment}${S.unit}` };
  }
  return {
    sets: Array.from({ length: n }, (_, i) => { const p = L[i] || L[L.length - 1]; return { w: p.w, r: Math.min(p.r + 1, ex.repMax) }; }),
    why: `Same weight, +1 rep until you hit ${ex.repMax} on every set`,
  };
}
const fmtSets = sets => {
  if (!sets?.length) return '';
  const sameW = sets.every(s => s.w === sets[0].w);
  return sameW ? `${sets[0].w}${S.unit} × ${sets.map(s => s.r).join(', ')}` : sets.map(s => `${s.w}×${s.r}`).join(', ');
};

/* ---------- views ---------- */
function render() {
  const [, route = '', id] = location.hash.split('/');
  const v = { '': home, workout, ex: exercise, splits, split: splitEdit, history, settings, guide }[route] || home;
  app.innerHTML = v(id);
  window.scrollTo(0, 0);
  tourRender();
}

/* ---------- guided tour ----------
   Coach marks on the real screens: highlights the thing to tap and explains it.
   "do" steps vanish once you do the action (their `when` stops being true);
   "ack" steps have a Got it button. State: S.tour = { acks: [], finished } or null. */
const routeNow = () => location.hash.split('/')[1] || '';
const logged = () => Object.keys(active()?.entries || {}).length;
const exNow = () => active()?.exercises.find(e => e.id === location.hash.split('/')[2]);
const TOUR = [
  { id: 'setup', route: '', when: () => !S.splits.length, el: '[data-tour=setup]',
    text: `<b>Quick tour:</b> I'll point at what to tap as you go. First you need your training days (<b>splits</b>). Quickest: load the ready-made Push / Pull / Legs and tweak it later. Or tap <b>Set up your splits</b> to build your own.` },
  { id: 'addsplit', route: 'splits', when: () => !S.splits.length, el: '[data-act=addsplit]',
    text: `A split is one training day, e.g. <i>Push</i> or <i>Legs</i>. Tap <b>+ Add split</b> to make your first.` },
  { id: 'splitfields', route: 'split', ack: true, el: 'fieldset',
    text: `Name the day at the top, then fill in each exercise:<br><b>Sets</b> and <b>Reps min–max</b> (your rep range).<br><b>+${S.unit} step</b>: added when you hit max reps on every set.<br><b>Start ${S.unit}</b>: weight for your first session.<br>Everything saves as you type.` },
  { id: 'splitback', route: 'split', ack: true, el: '.bar a',
    text: `Use <b>+ Add exercise</b> for the rest of this day. When it's done, tap <b>‹</b> to go back and add your other days.` },
  { id: 'splits', route: 'splits', ack: true, when: () => S.splits.length, el: '.list',
    text: `Splits run in this order, on rotation. Reorder with ↑ ↓, tap one to edit it. When you've added all your days, tap <b>‹</b>.` },
  { id: 'start', route: '', when: () => S.splits.length && !active() && !S.tour.finished, el: '[data-act=start]',
    get text() { return `This is your next workout. LiftLog rotates through your splits for you${S.splits.length > 1 ? ', and you can pick a different one below' : ''}. In the gym, just tap <b>Start</b>. Try it now.`; } },
  { id: 'resume', route: '', when: () => active(), el: '[data-act=go]', text: `You've got a workout going. Tap <b>Resume</b> to carry on.` },
  { id: 'list', route: 'workout', when: () => !logged(), el: '.list .row',
    text: `Here are today's exercises. <b>→</b> is your target. Tap one to log it.` },
  { id: 'sets', route: 'ex', ack: true, when: () => !logged(), el: '#sets',
    text: `Each row is one set: <b>weight × reps</b>, already filled in with your target. First time? Set your real weight with <b>−</b> / <b>+</b>. Next time it's remembered.` },
  { id: 'log', route: 'ex', when: () => !logged(), el: '[data-act=log]',
    text: `Done the sets? Tap <b>Log it</b>. If you did something different, change the numbers first.` },
  { id: 'next', route: 'ex', ack: true, when: () => logged() && !active().entries[keyOf(exNow()?.name)], el: '.bar h1',
    text: `Logged. It jumped straight to the next exercise, so in the gym it's just <b>Log it</b>, <b>Log it</b>, <b>Log it</b>. Tap <b>‹</b> to see the list any time.` },
  { id: 'finish', route: 'workout', when: () => logged(), el: '[data-act=finish]',
    text: `✓ = logged. When you're done (skipping some is fine), tap <b>Finish workout</b>.` },
  { id: 'done', route: '', ack: true, end: true, when: () => S.tour.finished && !active(), el: '[data-act=start]',
    text: `That's the whole loop. Next time it suggests this split, and your targets go up as you hit them. Help in the footer has the details.` },
];
function tourRender() {
  $('.coach')?.remove(); $('.tour-hl')?.classList.remove('tour-hl');
  if (!S.tour) return;
  const r = routeNow();
  const step = TOUR.find(s => s.route === r && !S.tour.acks.includes(s.id) && (!s.when || s.when()));
  const el = step && $(step.el, app); if (!el) return;
  el.classList.add('tour-hl');
  el.scrollIntoView({ block: 'nearest' });
  const b = el.getBoundingClientRect();
  app.insertAdjacentHTML('beforeend', `<div class="coach ${b.top + b.height / 2 > innerHeight / 2 ? 'top' : ''}" role="dialog">
    <p>${step.text}</p>
    <div class="coach-btns"><button class="link" data-act="tourend">End tour</button>${step.ack ? `<button class="sm ok" data-act="tourack" data-id="${step.id}">${step.end ? 'Finish tour' : 'Got it'}</button>` : ''}</div></div>`);
}
const nav = h => { location.hash = h; };
const footer = () => `<nav class="foot"><a href="#/splits">Splits</a><a href="#/history">History</a><a href="#/settings">Backup</a><a href="#/guide">Help</a></nav>`;

/* First-run wizard: #/guide/<step>. Reachable later from the Help link. */
const GUIDE = [
  () => `<h1>Welcome to LiftLog</h1>
    <p>Built for one thing: <b>log your workout in as few taps as possible</b>, then get off your phone.</p>
    <ol class="steps"><li>Set up your <b>splits</b> once (your training days).</li><li>In the gym, tap <b>Start</b>.</li><li>For each exercise, tap <b>Log it</b>.</li><li>Tap <b>Finish</b>.</li></ol>
    <p class="muted">Everything stays on this phone and works with no signal.</p>`,
  () => `<h1>1 · Splits</h1>
    <p>A <b>split</b> is one training day, e.g. <i>Push</i>, <i>Pull</i>, <i>Legs</i>. They run in a rotation: LiftLog always suggests the one after the split you did last.</p>
    <p>Each exercise in a split has:</p>
    <dl class="defs">
      <dt>Sets</dt><dd>How many working sets, e.g. 3.</dd>
      <dt>Reps min–max</dt><dd>Your rep range, e.g. 8–12.</dd>
      <dt>+${S.unit} step</dt><dd>How much to add when you go up, e.g. 2.5.</dd>
      <dt>Start ${S.unit}</dt><dd>The weight for your very first session.</dd>
    </dl>
    <p class="muted">Same exercise name in two splits = shared history.</p>`,
  () => `<h1>2 · How it picks your numbers</h1>
    <p>Every exercise is pre-filled with a suggestion based on last time:</p>
    <table class="prog"><tr><th>Session</th><th>Suggested</th></tr>
      <tr><td>1</td><td>40${S.unit} × 8, 8, 8</td></tr>
      <tr><td>2</td><td>40${S.unit} × 9, 9, 9</td></tr>
      <tr><td>…</td><td>+1 rep each time</td></tr>
      <tr><td>5</td><td>40${S.unit} × 12, 12, 12</td></tr>
      <tr class="up"><td>6</td><td>42.5${S.unit} × 8, 8, 8</td></tr></table>
    <p>Hit the top of the range on <b>every</b> set → weight goes up, reps reset. Miss it → same weight, aim for one more rep.</p>`,
  () => `<h1>3 · In the gym</h1>
    <ol class="steps">
      <li>Open the app and tap <b>Start</b>. Your next split is already chosen.</li>
      <li>It opens the list of exercises. Tap one: it's pre-filled with today's target.</li>
      <li>Did exactly that? Tap <b>Log it ✓</b>. It jumps straight to the next exercise.</li>
      <li>Did something different? Fix it with <b>− / +</b> (or <b>+ Set / − Set</b>) first, then Log it.</li>
      <li>Tap <b>Finish workout</b> when done.</li>
    </ol>
    <p class="muted">Closed the app mid-workout? It's saved: tap Resume.</p>`,
  () => `<h1>Let's set up</h1>
    <p>Start from a ready-made <b>Push / Pull / Legs</b> routine and tweak it, or build your own from scratch.</p>
    <p class="muted">Tip: set a sensible <b>Start ${S.unit}</b> per exercise so your first session is right. You can change splits any time under <b>Splits</b>.</p>
    <p class="muted">Your data only lives on this phone: use <b>Backup</b> to export it now and then.</p>`,
];
function guide(id) {
  const i = Math.min(Math.max(+id || 0, 0), GUIDE.length - 1);
  const last = i === GUIDE.length - 1;
  const setup = !S.splits.length;
  return `
    <header class="bar">${i ? `<a href="#/guide/${i - 1}">‹</a>` : '<span></span>'}<span class="dots">${GUIDE.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</span><button class="link" data-act="guidedone">${last ? 'Close' : 'Skip'}</button></header>
    <div class="guide">${GUIDE[i]()}</div>
    ${!last ? `<button class="big" data-act="go" data-h="#/guide/${i + 1}">Next</button>`
      : setup ? `<button class="big" data-act="guidedone" data-then="example">Load Push / Pull / Legs</button>
                 <button class="ghost" data-act="guidedone" data-then="own">Build my own splits</button>`
      : `<button class="big" data-act="guidedone">Got it</button>`}
    ${last ? `<button class="ghost" data-act="guidedone" data-then="tour">Show me on the real screens (guided tour)</button>` : ''}`;
}

function home() {
  const a = active();
  if (a) return `
    <h1>Workout in progress</h1>
    <button class="big" data-act="go" data-h="#/workout">Resume · ${esc(a.name)}</button>
    <button class="ghost" data-act="discard">Discard workout</button>${footer()}`;
  if (!S.splits.length) return `
    <h1>LiftLog</h1><p class="muted">No splits yet.</p>
    <div data-tour="setup"><button class="big" data-act="go" data-h="#/splits">Set up your splits</button>
    <button class="ghost" data-act="example">Load example (Push / Pull / Legs)</button></div>${footer()}`;
  const nx = nextSplit();
  const others = S.splits.filter(s => s.id !== nx.id);
  const last = finished()[0];
  return `
    <h1>Next up</h1>
    ${last ? `<p class="muted">Last: ${esc(last.name)} · ${fmtDate(last.date)}</p>` : ''}
    <button class="big" data-act="start" data-id="${nx.id}">Start ${esc(nx.name)}</button>
    ${others.length ? `<p class="muted">Or do a different one</p><div class="list">${others.map(s => `<button data-act="start" data-id="${s.id}">${esc(s.name)}</button>`).join('')}</div>` : ''}
    ${footer()}`;
}

function workout() {
  const a = active(); if (!a) { setTimeout(() => nav('#/'), 0); return ''; }
  const done = a.exercises.filter(e => a.entries[keyOf(e.name)]).length;
  return `
    <header class="bar"><a href="#/">‹</a><h1>${esc(a.name)}</h1><span class="muted">${done}/${a.exercises.length}</span></header>
    <div class="list">${a.exercises.map(ex => {
      const logged = a.entries[keyOf(ex.name)];
      const sub = logged ? '✓ ' + fmtSets(logged) : '→ ' + fmtSets(suggest(ex).sets);
      return `<button class="row ${logged ? 'done' : ''}" data-act="go" data-h="#/ex/${ex.id}"><b>${esc(ex.name)}</b><small>${esc(sub)}</small></button>`;
    }).join('')}</div>
    <button class="big" data-act="finish">Finish workout</button>`;
}

function exercise(id) {
  const a = active(); const ex = a?.exercises.find(e => e.id === id);
  if (!ex) { setTimeout(() => nav('#/workout'), 0); return ''; }
  const logged = a.entries[keyOf(ex.name)];
  const sg = suggest(ex); const last = lastSets(ex.name);
  const sets = logged || sg.sets;
  const step = ex.increment || 2.5;
  return `
    <header class="bar"><a href="#/workout">‹</a><h1>${esc(ex.name)}</h1><span class="muted">${ex.sets}×${ex.repMin}–${ex.repMax}</span></header>
    ${last ? `<p class="muted">Last (${fmtDate(last.date)}): ${esc(fmtSets(last.sets))}</p>` : ''}
    <p class="why">${esc(sg.why)}</p>
    <div id="sets">${sets.map((s, i) => setRow(i, s, step)).join('')}</div>
    <div class="pair"><button class="ghost" data-act="addset">+ Set</button><button class="ghost" data-act="rmset">− Set</button></div>
    <button class="big" data-act="log" data-id="${ex.id}">${logged ? 'Update' : 'Log it'} ✓</button>`;
}
function setRow(i, s, step) {
  return `<div class="set" data-step="${step}"><span class="n">${i + 1}</span>
    <div class="stp"><button data-act="step" data-d="-${step}" data-f="w">−</button><input class="w" type="number" inputmode="decimal" step="any" value="${s.w}"><button data-act="step" data-d="${step}" data-f="w">+</button></div>
    <span class="x">×</span>
    <div class="stp"><button data-act="step" data-d="-1" data-f="r">−</button><input class="r" type="number" inputmode="numeric" value="${s.r}"><button data-act="step" data-d="1" data-f="r">+</button></div></div>`;
}

function splits() {
  return `
    <header class="bar"><a href="#/">‹</a><h1>Splits</h1><span></span></header>
    <p class="muted">Rotation order — the app suggests the next one after whatever you did last.</p>
    <div class="list">${S.splits.map((s, i) => `
      <div class="row edit"><button class="grow" data-act="go" data-h="#/split/${s.id}"><b>${i + 1}. ${esc(s.name)}</b><small>${s.exercises.length} exercises</small></button>
      <button class="sm" data-act="mv" data-id="${s.id}" data-d="-1">↑</button><button class="sm" data-act="mv" data-id="${s.id}" data-d="1">↓</button></div>`).join('')}</div>
    <button class="big" data-act="addsplit">+ Add split</button>`;
}

function splitEdit(id) {
  const s = splitById(id); if (!s) { setTimeout(() => nav('#/splits'), 0); return ''; }
  return `
    <header class="bar"><a href="#/splits">‹</a><h1>Edit split</h1><span></span></header>
    <label>Name<input data-sf="name" value="${esc(s.name)}"></label>
    ${s.exercises.map((e, i) => `
      <fieldset data-i="${i}">
        <label>Exercise<input data-ef="name" value="${esc(e.name)}"></label>
        <div class="grid">
          <label>Sets<input data-ef="sets" type="number" inputmode="numeric" value="${e.sets}"></label>
          <label>Reps min<input data-ef="repMin" type="number" inputmode="numeric" value="${e.repMin}"></label>
          <label>Reps max<input data-ef="repMax" type="number" inputmode="numeric" value="${e.repMax}"></label>
          <label>+${S.unit} step<input data-ef="increment" type="number" inputmode="decimal" step="any" value="${e.increment}"></label>
          <label>Start ${S.unit}<input data-ef="startWeight" type="number" inputmode="decimal" step="any" value="${e.startWeight}"></label>
        </div>
        <div class="pair"><button class="sm" data-act="exmv" data-i="${i}" data-d="-1">↑</button><button class="sm" data-act="exmv" data-i="${i}" data-d="1">↓</button><button class="sm danger" data-act="exrm" data-i="${i}">Remove</button></div>
      </fieldset>`).join('')}
    <button class="big" data-act="addex" data-id="${s.id}">+ Add exercise</button>
    <button class="ghost danger" data-act="rmsplit" data-id="${s.id}">Delete split</button>`;
}

function history() {
  const f = finished();
  return `
    <header class="bar"><a href="#/">‹</a><h1>History</h1><span></span></header>
    ${f.length ? f.map(s => `<div class="card"><b>${esc(s.name)}</b> <span class="muted">${fmtDate(s.date)}</span>
      <ul>${Object.entries(s.entries).map(([k, v]) => `<li>${esc((s.exercises.find(e => keyOf(e.name) === k) || { name: k }).name)}: ${esc(fmtSets(v))}</li>`).join('')}</ul>
      <button class="sm danger" data-act="rmsession" data-id="${s.id}">Delete</button></div>`).join('') : '<p class="muted">Nothing logged yet.</p>'}`;
}

function settings() {
  return `
    <header class="bar"><a href="#/">‹</a><h1>Backup</h1><span></span></header>
    <p class="muted">Everything lives on this phone only. Export now and then so a cleared browser doesn't lose your history.</p>
    <button class="big" data-act="export">Export backup (.json)</button>
    <label class="ghost filebtn">Import backup<input type="file" accept="application/json" data-act-change="import" hidden></label>
    <label>Units<select data-act-change="unit"><option ${S.unit === 'kg' ? 'selected' : ''}>kg</option><option ${S.unit === 'lb' ? 'selected' : ''}>lb</option></select></label>
    <button class="ghost danger" data-act="wipe">Erase all data</button>`;
}

/* ---------- actions ---------- */
const newEx = (name = 'New exercise', sets = 3, repMin = 8, repMax = 12, increment = 2.5) => ({ id: uid(), name, sets, repMin, repMax, increment, startWeight: 0 });
const readSets = () => $$('#sets .set').map(r => ({ w: round(+$('.w', r).value || 0), r: Math.max(0, Math.round(+$('.r', r).value || 0)) }));

const actions = {
  go: d => nav(d.h),
  guidedone(d) {
    S.introSeen = true; save();
    if (d.then === 'example') return actions.example(), nav('#/');
    if (d.then === 'own') return actions.addsplit();
    if (d.then === 'tour') S.tour = { acks: [] }, save();
    location.hash === '#/' || location.hash === '' ? render() : nav('#/');
  },
  // ack only redraws the coach mark: a full render would wipe numbers typed into the steppers
  tourack(d) { if (TOUR.find(s => s.id === d.id)?.end) S.tour = null; else S.tour.acks.push(d.id); save(); tourRender(); },
  tourend() { S.tour = null; save(); tourRender(); },
  start(d) {
    const sp = splitById(d.id);
    const s = { id: uid(), splitId: sp.id, name: sp.name, date: new Date().toISOString(), done: false, exercises: structuredClone(sp.exercises), entries: {} };
    S.sessions.push(s); S.activeId = s.id; save(); nav('#/workout');
  },
  discard() { if (!confirm('Discard this workout?')) return; S.sessions = S.sessions.filter(s => s.id !== S.activeId); S.activeId = null; save(); render(); },
  finish() {
    const a = active();
    if (!Object.keys(a.entries).length) { if (!confirm('Nothing logged — discard workout?')) return; S.sessions = S.sessions.filter(s => s.id !== a.id); }
    else { a.done = true; a.date = new Date().toISOString(); if (S.tour) S.tour.finished = true; }
    S.activeId = null; save(); nav('#/');
  },
  step(d, b) {
    const inp = $('input', b.parentElement);
    inp.value = Math.max(0, round((+inp.value || 0) + +d.d));
  },
  addset() { const rows = readSets(); const last = rows[rows.length - 1] || { w: 0, r: 8 }; const step = $('#sets .set')?.dataset.step || 2.5; $('#sets').insertAdjacentHTML('beforeend', setRow(rows.length, last, step)); },
  rmset() { const r = $$('#sets .set'); if (r.length > 1) r[r.length - 1].remove(); },
  log(d) {
    const a = active(); const ex = a.exercises.find(e => e.id === d.id);
    a.entries[keyOf(ex.name)] = readSets(); save();
    // straight on to the next unlogged exercise, else back to the list
    const next = a.exercises.find(e => !a.entries[keyOf(e.name)]);
    nav(next ? '#/ex/' + next.id : '#/workout');
  },
  example() {
    const mk = (name, list) => ({ id: uid(), name, exercises: list.map(a => newEx(...a)) });
    S.splits = [
      mk('Day 1 · Push', [['Bench Press', 3, 6, 10, 2.5], ['Overhead Press', 3, 8, 12, 2.5], ['Incline DB Press', 3, 8, 12, 2], ['Lateral Raise', 3, 12, 15, 1], ['Triceps Pushdown', 3, 10, 15, 2.5]]),
      mk('Day 2 · Pull', [['Deadlift', 3, 5, 8, 5], ['Lat Pulldown', 3, 8, 12, 2.5], ['Barbell Row', 3, 8, 12, 2.5], ['Face Pull', 3, 12, 15, 2.5], ['Bicep Curl', 3, 10, 15, 1]]),
      mk('Day 3 · Legs', [['Squat', 3, 6, 10, 5], ['Romanian Deadlift', 3, 8, 12, 5], ['Leg Press', 3, 10, 15, 10], ['Leg Curl', 3, 10, 15, 2.5], ['Calf Raise', 3, 10, 15, 5]]),
    ];
    save(); render();
  },
  addsplit() { const s = { id: uid(), name: `Day ${S.splits.length + 1}`, exercises: [newEx()] }; S.splits.push(s); save(); nav('#/split/' + s.id); },
  mv(d) { const i = S.splits.findIndex(s => s.id === d.id), j = i + +d.d; if (j < 0 || j >= S.splits.length) return; [S.splits[i], S.splits[j]] = [S.splits[j], S.splits[i]]; save(); render(); },
  rmsplit(d) { if (!confirm('Delete this split? History is kept.')) return; S.splits = S.splits.filter(s => s.id !== d.id); save(); nav('#/splits'); },
  addex(d) { splitById(d.id).exercises.push(newEx()); save(); render(); },
  exrm(d) { const s = curSplit(); s.exercises.splice(+d.i, 1); save(); render(); },
  exmv(d) { const s = curSplit(), i = +d.i, j = i + +d.d; if (j < 0 || j >= s.exercises.length) return; [s.exercises[i], s.exercises[j]] = [s.exercises[j], s.exercises[i]]; save(); render(); },
  rmsession(d) { if (!confirm('Delete this workout from history?')) return; S.sessions = S.sessions.filter(s => s.id !== d.id); save(); render(); },
  export() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
    a.download = `liftlog-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  },
  wipe() { if (!confirm('Erase ALL splits and history on this phone?')) return; S = blank(); save(); nav('#/'); },
};
const curSplit = () => splitById(location.hash.split('/')[2]);

app.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  e.preventDefault(); actions[b.dataset.act]?.(b.dataset, b);
});

// split editor: save every field as it changes
app.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.sf) { curSplit()[t.dataset.sf] = t.value; return save(); }
  if (t.dataset.ef) {
    const ex = curSplit().exercises[+t.closest('fieldset').dataset.i];
    ex[t.dataset.ef] = t.dataset.ef === 'name' ? t.value : +t.value || 0;
    if (ex.repMax < ex.repMin) ex.repMax = ex.repMin;
    return save();
  }
  if (t.dataset.actChange === 'unit') { S.unit = t.value; save(); }
  if (t.dataset.actChange === 'import' && t.files[0]) {
    t.files[0].text().then(txt => {
      const d = JSON.parse(txt);
      if (d.version !== 1 || !Array.isArray(d.splits)) throw new Error('Not a LiftLog backup');
      if (!confirm('Replace everything on this phone with this backup?')) return;
      S = d; save(); nav('#/');
    }).catch(err => alert('Import failed: ' + err.message));
  }
});

window.addEventListener('hashchange', render);
// Brand-new phone: start the guided tour on the real screens.
if (!S.introSeen && !S.splits.length && !S.sessions.length) { S.introSeen = true; S.tour = { acks: [] }; save(); }
render();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
if (navigator.storage?.persist) navigator.storage.persist();
