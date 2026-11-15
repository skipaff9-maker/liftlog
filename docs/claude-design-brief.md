# Brief to paste into Claude Design

Copy everything below the line into Claude Design. When you're happy with it, export or download the design (HTML or images), drop it into a `/design` folder in this project, and ask Claude Code to "apply the design in /design".

---

Design a mobile-first gym workout tracker web app called **LiftLog**. Phone portrait, around 390px wide, dark theme. The user hates being on their phone in the gym, so the whole design should be about the **fewest taps and least reading**: huge tap targets, one obvious primary action per screen, numbers big enough to read at arm's length between sets, and usable one-handed with sweaty hands. No social features, no badges, no clutter.

Please design these 6 screens:

1. **Home / Next up.** Shows "Next up" with a giant primary button, e.g. "Start Day 2 · Pull". A small line under it: "Last: Day 1 · Push · Thu 12 Nov". Below that, smaller secondary buttons for the other splits ("Or do a different one"). Small footer links: Splits · History · Backup. Also show the variant where a workout is in progress: "Resume · Day 2 · Pull" plus a quiet "Discard" link.

2. **Workout (exercise list).** Header: back arrow, split name, progress "2/5". A list of exercise rows. A logged row shows a ✓ and what was done, e.g. "✓ 60kg × 10, 10, 9", in the accent colour. A row not yet logged shows the suggestion, e.g. "→ 62.5kg × 8, 8, 8". A big "Finish workout" button at the bottom.

3. **Exercise (the most important screen).** Header: back, exercise name, target "3×8–12".
   - Line: "Last (Thu 12 Nov): 60kg × 12, 12, 11"
   - Suggestion reason in the accent colour: "Same weight, +1 rep until you hit 12 on every set" (or "Hit 12 on every set → +2.5kg")
   - One row per set: set number, then a weight stepper [− 60 +], then "×", then a reps stepper [− 12 +]. These are pre-filled with the suggestion. The numbers should be large.
   - Small "+ Set / − Set" controls.
   - A huge "Log it ✓" button at the bottom, within thumb reach. One tap accepts the suggestion and moves to the next exercise.

4. **Splits list.** Splits shown in rotation order ("1. Day 1 · Push — 5 exercises") with up/down reorder controls. "+ Add split" button.

5. **Edit split.** Split name field. Each exercise as a compact card: name, sets, reps min, reps max, weight step (e.g. 2.5kg), start weight. Reorder and remove controls. "+ Add exercise".

6. **History.** Cards per past workout: split name, date, and one line per exercise ("Bench Press: 60kg × 10, 10, 9").

Also include:
- **Backup screen**: Export button, Import button, units toggle kg/lb, and an "Erase all data" danger action.
- A simple app icon.

Design system: one bold accent colour on a near-black background (currently a lime #c6ff3d; feel free to propose better options), a system font stack, 14px corner radius, minimum 48px tap targets. Show the pressed state for the steppers and the primary button. Keep it buildable in plain HTML/CSS: no custom fonts that need paid licences, and no complex animations.
