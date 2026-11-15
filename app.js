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
  const v = { '': home, workout, ex: exercise, splits, split: splitEdit, history, settings }[route] || home;
  app.innerHTML = v(id);
  window.scrollTo(0, 0);
}
const nav = h => { location.hash = h; };
const footer = () => `<nav class="foot"><a href="#/splits">Splits</a><a href="#/history">History</a><a href="#/settings">Backup</a></nav>`;

function home() {
  const a = active();
  if (a) return `
    <h1>Workout in progress</h1>
    <button class="big" data-act="go" data-h="#/workout">Resume · ${esc(a.name)}</button>
    <button class="ghost" data-act="discard">Discard workout</button>${footer()}`;
  if (!S.splits.length) return `
    <h1>LiftLog</h1><p class="muted">No splits yet.</p>
    <button class="big" data-act="go" data-h="#/splits">Set up your splits</button>
    <button class="ghost" data-act="example">Load example (Push / Pull / Legs)</button>${footer()}`;
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
  start(d) {
    const sp = splitById(d.id);
    const s = { id: uid(), splitId: sp.id, name: sp.name, date: new Date().toISOString(), done: false, exercises: structuredClone(sp.exercises), entries: {} };
    S.sessions.push(s); S.activeId = s.id; save(); nav('#/workout');
  },
  discard() { if (!confirm('Discard this workout?')) return; S.sessions = S.sessions.filter(s => s.id !== S.activeId); S.activeId = null; save(); render(); },
  finish() {
    const a = active();
    if (!Object.keys(a.entries).length) { if (!confirm('Nothing logged — discard workout?')) return; S.sessions = S.sessions.filter(s => s.id !== a.id); }
    else { a.done = true; a.date = new Date().toISOString(); }
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
render();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
if (navigator.storage?.persist) navigator.storage.persist();
