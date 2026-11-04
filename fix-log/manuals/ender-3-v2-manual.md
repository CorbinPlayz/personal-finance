# FIXING YOUR ENDER 3 V2
### An instruction manual for humans

---

## BEFORE YOU START

**Time:** about 45 minutes
**Difficulty:** moderate. Nothing here is hard. The order is what matters.

**Tools:**

- [ ] Ruler or tape measure
- [ ] Two identical objects — two mugs, two wood blocks, two cans
- [ ] One sheet of ordinary printer paper
- [ ] The hex key and wrench that came with the printer
- [ ] A marker or pen
- [ ] Phone (for photos)

**Rules:**

1. **Do the phases in order.** Phase 2 is impossible if Phase 1 is wrong.
2. **One change at a time.** Change two things and you won't know which one worked.
3. **Write down the number before you change it.** Every time.
4. **When a step says STOP, stop.** That's where the money gets wasted.

---

# PHASE 1 — IS THE PRINTER CROOKED?
### *10 minutes. Free. Do this first.*

**Why:** If the arm that holds the nozzle is tilted, one side of the bed will never be reachable. You'd be adjusting the bed against a crooked ruler. This is the single most common reason a bed "can't be leveled."

---

**STEP 1.1** — Turn the printer **off**. Wait 5 seconds.

**STEP 1.2** — Turn it back on. On the screen: **Prepare → Disable steppers.**
The motors now let you move things by hand.

**STEP 1.3** — Stand facing the printer. Notice the **horizontal bar** across the top that the nozzle hangs from. That's the gantry. We're checking it's level.

**STEP 1.4** — Put the ruler upright against the **left** vertical post. Measure from the **base** up to the **bottom edge of the gantry bar**.

> **✏️ WRITE IT DOWN:  LEFT = ______ mm**

**STEP 1.5** — Do the exact same thing on the **right** side.

> **✏️ WRITE IT DOWN:  RIGHT = ______ mm**

**STEP 1.6** — Compare the two numbers.

---

### 🔀 DECISION POINT

**If LEFT and RIGHT are within 1 mm of each other:**
✅ Your gantry is fine. **Skip to Phase 2.**

**If they differ by more than 1 mm:**
❌ Your gantry is tilted. That is the actual cause of your bed problem. **Continue to Step 1.7.**

---

**STEP 1.7** — Find the **two eccentric nuts** on the right side of the gantry. They're the odd-looking nuts behind the wheels that ride on the right vertical post. They have a flat side — you turn them with the wrench to loosen or tighten the wheel grip.

**STEP 1.8** — Loosen both eccentric nuts a **quarter turn**. The right side of the gantry should now be able to move slightly.

**STEP 1.9** — Grip the **right end** of the gantry bar with one hand and gently move it **up or down** until the right measurement matches the left measurement.

> **💡 TIP:** Whichever side is *lower* is the one that sagged. Gravity does this. It's not your fault.

**STEP 1.10** — Hold it in place. Tighten both eccentric nuts until the wheels grip firmly — the gantry shouldn't wobble, but shouldn't be so tight the wheels can't turn.

**STEP 1.11** — Measure left and right again. Within 1 mm?

- **Yes** → ✅ Phase 1 complete. Go to Phase 2.
- **No** → Repeat steps 1.8–1.11 once. Still no? Stop and take a photo of the wheel assembly — something else is bent (see Phase 5).

---

# PHASE 2 — LEVEL THE BED
### *15 minutes. The part everyone does badly.*

**Why this order:** Most people adjust one corner, then the opposite corner, and undo their own work. Follow the numbered order below and do it **twice**.

---

**STEP 2.1** — Turn the four knobs under the bed until the springs are about **half squashed** — roughly 10 mm of spring showing. Do this by eye for all four. Don't level yet.

**STEP 2.2** — On the screen: **Prepare → Auto Home.** Wait for it to finish.

**STEP 2.3** — **Prepare → Disable steppers** again.

**STEP 2.4** — Slide the print head by hand so the nozzle sits over the **front-left** corner of the bed, about 2 cm in from the edge.

**STEP 2.5** — Slide the paper under the nozzle.

**STEP 2.6** — Turn the knob under that corner **slowly** until the paper slides out with a **slight drag** — like a fingernail on a table, not gripped, not loose.

**STEP 2.7** — Move to the **back-left** corner. Repeat 2.5–2.6.

**STEP 2.8** — Move to the **back-right** corner.

**STEP 2.9** — Move to the **front-right** corner.

**STEP 2.10** — 🔁 **Now do 2.4 through 2.9 a second time.** The first pass always throws the others off. This is normal, not a mistake.

---

### 🔀 DECISION POINT

**If all four corners drag the paper and no knob is loose or wobbly:**
✅ **Bed is level. Go to Phase 3.**

**If one knob has to be so loose it's about to fall off — or is already loose/wobbly:**
❌ **STOP.** Do not keep turning. This is your original complaint. One of these is true:

| Check | How | Fix |
|---|---|---|
| **Screw head not seated** | Look down at the top of the bed. All four screw heads sunk in flat? | Push it down / check it's the same length as the others |
| **Spring missing or wrong one** | All four springs the same length? | Match them, or replace all four |
| **Knob threads stripped** | Does the loose knob spin freely without gripping? | Replace knob (cheap) |
| **Bed plate warped** | Straightedge across the bed corner to corner | Silicone spacers, or ABL probe |
| **Y carriage bent** | Remove bed, straightedge across the metal plate underneath | Replace carriage |

**Go back to Phase 1 once more before assuming a bent part.** A tilted gantry mimics a bent carriage almost perfectly, and it's free to fix.

---

# PHASE 3 — FIX THE EXTRUSION
### *15 minutes. Find out which problem you actually have.*

**Nobody can fix "extrusion problems." You have to name the symptom first.** Do the test.

---

**STEP 3.1** — Load a **brand-new, unopened** spool of filament.

**STEP 3.2** — Print a small test cube or benchy.

**STEP 3.3** — Look at the result.

---

### 🔀 DECISION POINT

**If it prints clean now →**
✅ It was **moisture.** Go to **Phase 4**, then come back and finish.

**If it still prints badly →**
❌ It's **mechanical.** Moisture was a red herring. **Continue to Step 3.4.**

---

**STEP 3.4** — Look at the nozzle. Is there plastic oozing from around the **outside** of it, or is plastic curling out sideways instead of straight down?

**If yes** → the tube isn't sealed against the nozzle. **Do Steps 3.5–3.8.**

**STEP 3.5** — Heat the nozzle to printing temperature (Prepare → Preheat → PLA).

**STEP 3.6** — Loosen the fitting that holds the white tube, by **half a turn**.

**STEP 3.7** — Push the tube **firmly down** so it presses flat against the back of the nozzle. Hold it there.

**STEP 3.8** — Tighten the fitting back up while still pushing. Done.

---

**STEP 3.9** — Still bad? Do a **cold pull**:

1. Heat to 200°C
2. Push filament through by hand until it extrudes
3. Set temp to 90°C and wait
4. Pull the filament out firmly, in one motion
5. Look at the tip — it should have a clean point with the gunk on it
6. Cut off that end, reload, test print

Repeat twice if the first pull comes out black.

---

**STEP 3.10** — Still bad? **Check the extruder arm.** That's the plastic lever on the motor that grips the filament.

Remove it and look at the **underside** — specifically for a **hairline crack**. It cracks where you can't see it, and it fails exactly like a clog.

**If cracked** → replace it with a metal one (~$15). This is a real upgrade, not a waste.

---

**STEP 3.11** — Still bad? Check the brass gear on the motor for flattened or shiny worn teeth. Replace if worn.

---

# PHASE 4 — IF IT WAS MOISTURE
### *4 to 6 hours of waiting, 5 minutes of work.*

**STEP 4.1** — Put the spool in a food dehydrator or filament dryer.

**STEP 4.2** — Set to **40–45°C.**

> ### ⚠️ WARNING
> **Do not go above 50°C.** PLA starts going soft around 60°C. A dehydrator set to "jerky" will warp the spool and ruin the filament. Low and slow.

**STEP 4.3** — Leave it **4–6 hours.**

**STEP 4.4** — Immediately move it to a sealed container with desiccant packets. It reabsorbs moisture within hours if left out.

**STEP 4.5** — Add a cheap hygrometer inside the container. Under 20% is good.

> **NOTE:** Desiccant does not dry filament. It only keeps dried filament dry. You need heat *and* a sealed box. Skip the heat and nothing improves.

---

# PHASE 5 — IF PHASES 1 AND 2 FAILED
### *This is the "buy a part" stage. Only now.*

**STEP 5.1** — Re-check Phase 1. Be honest about the measurement.

**STEP 5.2** — Remove the bed. Lay a straightedge across the metal plate underneath, in both directions. Bent = replace.

**STEP 5.3** — Lay the straightedge across the bed plate itself, corner to corner. A dish in the *middle* is normal. A raised or sunken *corner* is a warp.

**STEP 5.4** — Order accordingly:

| Part | ~Price | Fixes |
|---|---|---|
| Silicone spacers + nyloc nuts | $10–15 | Springs that hold tension, knobs that walk loose |
| Metal extruder arm | $15 | Cracks |
| Spare nozzles (pack) | $5 | Clogs |
| Bed carriage plate | $15 | Bends |
| ABL probe (CR Touch) | $35 | Warped bed |

> ### ⚠️ WARNING
> An ABL probe **does not** fix a tilted gantry and **does not** fix a corner that can't hold tension. It only compensates for a warped surface. Buying one to fix a leveling problem is the most common way people waste $35 and three weekends.

---

# FINAL CHECK

Print something with a large flat first layer — a 1-layer square test, or a benchy.

**What a good first layer looks like:** a smooth, slightly squashed ribbon. Lines touching, no gaps, no ridges you can catch a fingernail on.

**Fix a bad first layer by feel:**

| Looks like | Meaning | Do this |
|---|---|---|
| Gaps between lines | Nozzle too high | Raise bed slightly at that corner |
| Rough, rippled, transparent | Nozzle too low | Lower bed slightly |
| Good front, bad back | Bed isn't flat | Phase 2, second pass |
| Bad on one side only | Gantry still tilted | Phase 1 |

---

# WHEN YOU'RE DONE

**Write it in `001-ender-3-v2-bed-and-extrusion.md`.** Fill in:

- What was actually wrong
- What fixed it
- How long it took
- What you tried that didn't work

That last one is the part people never write down and it's the most valuable.

**Then photograph it.** The before, the after, the first good print. That's a fix — a real one, with a documented cause and a documented result.

**That's entry 001.** It's worth as much as the repair itself, because it's the only proof that exists that you can finish a difficult thing.

---

## QUICK REFERENCE

| Situation | Go to |
|---|---|
| Bed won't level, one corner maxed out | **Phase 1** — almost always the gantry |
| Bed won't stay level | Phase 5 — silicone spacers |
| Under-extruding, clicking, gaps | Phase 3 |
| Popping, crackling, rough surface | Phase 4 — moisture |
| Poor layer quality, one side worse | Phase 1 |
| Tried everything | Phase 5 |
| Don't know | Step 3.1 — new spool splits it in two |
