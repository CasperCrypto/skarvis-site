# SKARVIS Trener (operator training console)

Plays back a run of the scenario simulator (`software/czapla/sim.py`) as an
operator console in Polish. **Everything on this page is synthetic.** The run
file says so, the page says so on every screen, and the debrief repeats it.

| Path | What it is |
|---|---|
| `index.html` | The console. Plain HTML, opens from disk (`file://`), no build step |
| `sim.css` | Styles. Light set follows the public site; dark set for night shifts |
| `sim.js` | Playback, alarm queue, operator actions, debrief. No sensor models |
| `runs/podstacja.js` | Demo run of `software/czapla/scenarios/podstacja.json` |

## Open it

Double-click `web/preview-sim.bat` on Windows, or open `web/site/trener/index.html` in
any browser. Other runs: button "Wczytaj przebieg…" accepts a `.json` or `.js`
run file.

## Make a run

```bash
cd software
python -m czapla.sim --no-store --out ../web/site/trener/runs/podstacja.js
```

`--out x.js` writes a file the page loads with a plain `<script>` tag (works
from disk); `--out x.json` writes plain JSON for the file picker. Edit the
scenario JSON (sensors, actors, assumptions) to build a new exercise; the
simulator refuses a scenario that asks the KrakenSDR to hear 2.4 GHz.

## What an exercise looks like

1. **Ćwiczenie** (drill) mode hides the ground truth. The operator sees what the
   system sees: bearings, Remote ID positions, ground tracks with a class and
   the sensors that confirmed it.
2. Each alarm needs **Potwierdź odbiór** (acknowledge), optionally
   **Weryfikuj** (a camera or visual check that answers after 8 s of simulated
   time), and a decision: threat (start the site procedure), authorised, or
   false alarm.
3. **Podsumowanie** (debrief) scores the decisions against the simulator's
   ground truth, lists every object in the scenario including the ones the
   system never saw (the fibre-optic drone), and repeats the assumptions.
   "Kopiuj raport z ćwiczenia" copies a plain-text exercise record.
4. **Instruktor** mode shows the ground truth on the map and on each alarm.

## Rules

- The page never presents a simulated number as a measured one. Scores
  describe the scenario's assumptions, not the product.
- No attack, evasion or countermeasure training. A red-team mode that teaches
  someone to fly around a site's sensors is out of scope for any public version
  (see `product/simulator.md`).
- CASPER is not mentioned here.
