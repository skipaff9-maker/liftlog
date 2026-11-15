# LiftLog — gym workout tracker

Personal workout tracker for one user (Karl). The guiding principle: **the fewest taps from walking into the gym to having the workout logged.** He hates being on his phone in the gym. Every feature gets judged against that.

## Hard constraints (don't break these)
- **Free to run.** Static files only. No backend, no database server, no paid APIs, no accounts.
- **No build step.** Plain HTML/CSS/vanilla JS. No npm, no bundler, no framework, no TypeScript. You deploy by copying the files.
- **Offline-first PWA.** Must work with no signal (gym basements). Service worker caches the app shell.
- **Data lives on the device** in `localStorage` under the key `liftlog.v1`, as one JSON blob. Export/import JSON is the backup path.
- Phone-first, one-handed use: tap targets ≥ 48px, primary action at the bottom/large, no hover-dependent UI.

## Files
| File | Purpose |
|---|---|
| `index.html` | Shell. Loads `styles.css` and `app.js`. |
| `app.js` | All logic: state, routing (hash-based), views (template strings), actions (event delegation via `data-act`). |
| `styles.css` | All styling. The current look is a placeholder until the Claude Design work comes back (see `docs/claude-design-brief.md`). |
| `sw.js` | Service worker. **Bump `CACHE` version on every change** or phones keep the old version. |
| `manifest.json`, `icon.svg` | PWA install metadata. |

## Data model (`localStorage['liftlog.v1']`)
```js
{
  version: 1,
  unit: 'kg' | 'lb',
  splits: [ { id, name, exercises: [ { id, name, sets, repMin, repMax, increment, startWeight } ] } ], // array order = rotation order
  sessions: [ { id, splitId, name, date /*ISO*/, done, exercises /*snapshot of split at start*/, entries: { [exerciseNameLowercase]: [ { w, r } ] } } ],
  activeId: sessionId | null,
  introSeen: true | undefined // first-run guide dismissed (optional; missing = not seen)
}
```
- History is keyed by **exercise name (lowercased)**, not id, so the same lift in two splits shares progression history.
- A session snapshots its split's exercises at start, so editing a split mid-workout won't break anything.
- If you change the shape, bump `version` and write a migration in `load()`. Never wipe user data on upgrade.

## Core behaviour
1. **Next split suggestion:** the split after the one most recently finished, wrapping round. If none, the first one. User can pick any other split from the home screen.
2. **In a workout:** a list of exercises showing ✓ + what was logged, or → the suggestion.
3. **Exercise screen:** shows last time's numbers + the suggestion, pre-filled into per-set weight × reps steppers. **One tap ("Log it") accepts the suggestion**, then it auto-advances to the next unlogged exercise. If they did something different, they use the steppers before logging.
4. **Progressive overload (double progression)** in `suggest()`:
   - No history → `startWeight` × `repMin`.
   - Every set ≥ `repMax` last time → weight + `increment`, reps reset to `repMin`.
   - Otherwise → same weight, +1 rep per set (capped at `repMax`).

## Dev / test
- Run locally: `python -m http.server 8000` and open http://localhost:8000 (a service worker needs http, not file://).
- Test on a phone: same Wi-Fi, http://<pc-ip>:8000. Or just push to GitHub Pages.
- No test framework. Keep `suggest()` and `nextSplit()` pure enough to check in the browser console.
- After changes, test in Chrome DevTools mobile view at 375px wide.

## Deploy (free)
GitHub Pages: push to a repo → Settings → Pages → deploy from branch `main` / root. Cloudflare Pages or Netlify drop also work. Bump `sw.js` CACHE first.

## Backlog (ideas, in rough priority order; check with Karl before building)
- [ ] Apply the Claude Design visual design (`/design` folder once it exists). Keep the class names and `data-act` hooks or update `app.js` to match.
- [ ] PNG icons (180/192/512) for a proper iOS home-screen icon.
- [ ] Optional rest timer after logging (vibrate when done). Off by default.
- [ ] "Deload" rule: suggest −10% after 2 sessions missing `repMin`.
- [ ] Per-exercise notes (seat height, grip).
- [ ] Simple progress chart per exercise in History (inline SVG, no library).
- [ ] Optional sync between devices (e.g. a GitHub Gist via a personal token) — only if wanted; local-only is fine.

## Style rules for changes
- Keep it small. If a feature adds taps to the core flow (start → log → finish), push back or make it optional.
- No dependencies. If something seems to need a library, write the 30 lines instead.
- Use `confirm()` only for destructive actions.
