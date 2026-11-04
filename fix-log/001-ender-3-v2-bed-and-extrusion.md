# 001 — Ender 3 V2: bed that won't level, plus extrusion problems

**Status:** In progress
**Opened:** 2026-11-04
**Owner's skill level at start:** competent — own machine, self-maintained
**Time spent so far:** —

---

## The complaint

Two symptoms, reported together. They are probably **two unrelated problems**, which matters — fix them one at a time or you'll never know what worked.

### 1. Bed can't be leveled
> "One of the screws is way too loose and will fall off if I make it flat."

**Translation:** that corner is maxed out. The spring is fully extended and the bed is as high as the hardware physically allows, and it's *still* too low. The knob is not the problem — the knob is the messenger. This is not an adjustment issue, it's an alignment issue.

### 2. Extrusion problems, suspected moisture
> "Extruding problems due to humidity."

Separately: **this needs a symptom, not a cause.** Moisture is one hypothesis. "Extrusion problems" could mean under-extrusion, popping/crackling, stringing, gaps between layers, or weak parts — and each points a different direction. Don't accept a diagnosis before there's a symptom.

---

## Diagnosis tree — bed leveling

Work top to bottom. Do not buy parts until one of these lights up.

### A. X gantry is not level  ← check this first, it's free and it's the most common cause
The V2 has a **single Z lead screw on the left**. The right side is carried only by the roller wheels on the right extrusion. If the gantry is tilted, the nozzle plane is tilted relative to the bed, and one corner will *always* bottom out — you'd be leveling against a crooked reference, which is impossible.

- [ ] Disable steppers (Move → Disable steppers)
- [ ] Measure the gap from the bottom of the X-gantry extrusion to the base, **left side and right side**. Compare.
- [ ] Second check: set two identical objects (mugs, wood blocks) on the left and right of the bed, lower the nozzle by hand until it just touches one, and look at the other.

**If tilted:** turn both Z couplers by hand until level, then tighten the right-side eccentric nuts so the gantry can't rock. Re-check with a ruler. Only then touch the bed knobs.

### B. Y carriage is bent
Those stamped plates bend, and a bent corner eats the entire adjustment range.

- [ ] Remove the bed, lay a straightedge across the Y carriage in both directions
- [ ] Sight along the bed plate itself
- [ ] Note: the V2's glass is flat. If the glass is level and the metal underneath isn't, the carriage is the culprit.

### C. Bed plate is warped
- [ ] Straightedge across the bed diagonally and corner to corner
- [ ] Dished in the center = normal and tolerable. A **raised or dropped corner** = warp

### D. Assembly-level checks (five minutes, catches stupid stuff)
- [ ] All four screws the same length and present
- [ ] All four springs present, same length, installed below the bed and above the carriage
- [ ] All four screw heads sitting flush in the countersinks on top of the bed — a screw head not seated raises that corner
- [ ] Knob threads not stripped (plastic knobs wear out; a stripped knob feels loose and walks off)
- [ ] Eccentric nuts on the Y carriage properly tensioned — the bed shouldn't rock on the rail
- [ ] Frame square: diagonals corner to corner should measure equal

---

## Diagnosis tree — extrusion

**First, the 30-second discriminator:** load a brand-new sealed spool.

- Prints fine → it was moisture. Go to the drying section.
- Still bad → mechanical. Moisture is a red herring; drying filament will never fix it.

### Mechanical suspects (Ender 3 V2 specific, in order)
- [ ] **PTFE tube not seated against the nozzle.** The classic Ender flaw. The tube must butt directly against the back of the nozzle; any gap collects molten plastic, clogs, and under-extrudes. Fix: heat to temp, loosen the fitting a quarter turn, push the tube firmly down against the nozzle, retighten, trim the tube end square if it's deformed.
- [ ] **Partially clogged nozzle.** Cold pull, or swap the nozzle (~$1).
- [ ] **Cracked extruder arm** — if yours is still the stock plastic one, it cracks underneath where you can't see it. Remove it and inspect. Metal replacement is ~$15.
- [ ] **Worn brass drive gear** — flattened teeth, or filament slipping.
- [ ] **Extruder tension too low** — slipping without grinding.
- [ ] **PTFE coupler not biting the tube** — the tube walks out under pressure. The little blue clips are a real fix.
- [ ] **E-steps / flow** — should be 93 for the V2 stock; recalibrate if anything in the extruder was changed.

### If it's moisture
- Dry PLA at **40–45°C for 4–6 hours**. **Do not exceed 50°C** — PLA's glass transition is around 60°C and a food dehydrator on "jerky" will soften and deform the spool.
- Food dehydrator works. A purpose-built dryer is ~$40. A sealed tote with color-changing desiccant and a $10 hygrometer is ~$15 and prevents it from coming back.
- Desiccant alone does not dry filament — it only keeps dry filament dry. You need heat *and* a sealed box.

---

## The permanent bed fix (only after the diagnosis)

| Part | ~Price | Fixes |
|---|---|---|
| Silicone bed spacers (or yellow die springs) + nyloc nuts | $10–15 | Springs that hold tension; knobs stop walking loose |
| Metal extruder | $15 | Cracked plastic arm |
| Spare nozzles | $5 | Clogs |
| ABL probe (CR Touch / BLTouch) | ~$35 | Compensates for a warped bed |

**Important:** an ABL probe does **not** fix a corner that can't hold tension, and it does **not** fix a crooked gantry. It only compensates for a warped surface. Diagnose first, then buy.

---

## What was actually wrong

*(Fill this in when it's solved. This is the section people read.)*

**Root cause:**

**What fixed it:**

**Time spent:** — **Parts cost:** —

---

## What it's worth

*(Is this a "here's what three shops said, it was a $2 part" entry that's worth posting? If yes, where?)*
