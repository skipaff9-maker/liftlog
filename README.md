# LiftLog

A no-fuss gym tracker. Open it, tap **Start**, tap **Log it** for each exercise, tap **Finish**. It suggests the next split and the next weight/reps for you.

- Free: static files on GitHub Pages, no backend.
- Works offline once it's loaded.
- Data stays on your phone. Use **Settings → Export backup** now and then.

## Get it on your phone (about 5 minutes)
1. Create a GitHub repo (e.g. `liftlog`) and upload these files to the root.
2. Repo → **Settings → Pages** → Source: *Deploy from a branch* → `main` / `/ (root)` → Save.
3. Open `https://<your-username>.github.io/liftlog/` on your phone.
4. **iPhone:** Share → *Add to Home Screen*. **Android:** ⋮ → *Install app*.
5. Tap **Load example (Push / Pull / Legs)**, or set up your own splits.

## Working on it with Claude Code
Open this folder in Claude Code. `CLAUDE.md` has the constraints, data model and backlog.
Example prompts:
- "Apply the design in /design to the app. Keep all behaviour the same."
- "Add the optional rest timer from the backlog."
- "Add PNG icons for iOS."

## Local run
```
python -m http.server 8000
```
Then open http://localhost:8000
