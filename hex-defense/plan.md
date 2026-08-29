# HEXSWARM — design & implementation plan

A 2D, mobile-first maze tower-defense game on a hexagonal grid, in the vein of
*geoDefense Swarm*: neon vector art on black, additive glow everywhere, screen-filling
particle carnage, and mazes built out of the towers themselves.

Working title *HEXSWARM*; directory `hex-defense/`. Both are easy to change later.

Status: **planning only — no code written yet.** This document is the thing to argue
with before implementation starts.

---

## 1. Constraints and what they imply

| Constraint | Consequence |
|---|---|
| Hosted on GitHub Pages | 100% client-side, static files, no server, no build step. Libraries vendored under `js/vendor/` and loaded via an import map — same pattern as `space-invaders-3d/`. |
| Primarily smartphones | Portrait-first layout. Touch targets ≥ 44 px. 60 fps on a mid-range phone is a hard design constraint, not a stretch goal. Battery/thermal matter: a fixed 60 Hz sim, not an uncapped one. |
| Desktop should also work | Same code path, mouse = touch, plus keyboard shortcuts. No separate desktop UI, no desktop-specific testing effort this round. |
| Heavy glow / particles / distortion | Needs WebGL with post-processing. Canvas2D `shadowBlur` is not viable at this particle count on mobile. |
| Maze-building is the core mechanic | Pathfinding must be re-run on *every* tower placement and must be cheap enough to run on every frame of a placement drag (for the live "this would block" preview). |

---

## 2. Technology choices

### Renderer: PixiJS v8 + `pixi-filters` (recommended)

PixiJS is a 2D WebGL renderer with automatic sprite batching, a mature filter
(post-processing) pipeline, and good mobile behaviour. Everything we need is either
built in or in the official `pixi-filters` package:

- `AdvancedBloomFilter` — the neon bloom that defines the whole look.
- `ShockwaveFilter` — the ripple/warp distortion on big explosions.
- `RGBSplitFilter` — subtle chromatic aberration that ramps with on-screen chaos.
- `CRTFilter` / custom vignette — optional scanline grit.
- `ParticleContainer` — cheap batched draw path for thousands of additive sprites.

Alternatives weighed:

- **Canvas 2D.** Simplest, zero deps, but `shadowBlur` glow costs a full blur per
  drawn object and collapses on mobile past a few dozen glowing things. No bloom, no
  screen-space ripple. Rejected — it can't hit the requested look.
- **three.js with an orthographic camera + `EffectComposer`/`UnrealBloomPass`.**
  Would work, and three.js is *already vendored in this repo*. But for a purely 2D
  sprite game we'd be writing our own batching and paying for a 3D scene graph we
  don't use. Pixi is roughly half the code for this specific job. Keep three.js in
  mind only if we later want real 3D depth on the board.
- **Hand-rolled WebGL.** Best possible performance ceiling, worst time-to-playable.
  Rejected.

Vendoring: pin an exact PixiJS v8 ESM build plus `pixi-filters`, commit them under
`js/vendor/`, wire them through the `<script type="importmap">` in `index.html`.
Versions get verified against the real API at vendor time — the filter names above
are from memory and must be confirmed against the pinned build before we rely on them.

### No image or audio assets

Every sprite is **procedurally generated at boot** into a `RenderTexture`: draw the
neon shape once (soft additive radial halo underneath + crisp bright polygon outline
on top), cache it, then tint and reuse. Benefits: no binary files in the repo, sprites
render at the device's true pixel ratio, and recolouring a tower tier is a tint rather
than a new asset. Audio, if we do it, is a small WebAudio synth (see §12).

### Language / tooling

Plain ES modules, no TypeScript, no bundler — consistent with the existing game and
with "just push it to Pages". JSDoc type comments on the data tables where they help.

---

## 3. Hex grid model

**Flat-top hexagons, axial coordinates `(q, r)`** (Red Blob Games conventions).

Flat-top means each cell has a flat top and bottom edge, columns line up vertically,
and the six neighbours are **N, S, NE, SE, NW, SW**. That gives direct north–south
movement, which is what we want on a portrait screen with the spawn at the top and the
exit at the bottom. (Pointy-top would give E/W movement and no direct N/S — wrong axis
for a phone.) The reference screenshots are also flat-top.

`js/hex.js` provides:

- axial ↔ pixel conversion for a given hex radius and board origin
- `neighbors(q, r)` in a fixed clockwise order (so pathing is deterministic)
- `distance(a, b)` (axial/cube distance)
- `cellsWithinRange(center, minR, maxR)` — used to precompute a tower's target set
- `hexLine(from, direction)` — the straight run of cells used by the laser tower
- `pixelToHex(x, y)` with cube rounding — used by touch input

All of this is pure math with no rendering dependency, so it is directly unit-testable.

### Board sizing (a real design constraint)

A hex must be ~44–56 px across on screen to be tappable. On a 390 px-wide phone that
caps the board at roughly **9–11 columns**. Rows are cheaper (a tall portrait viewport
fits ~14–18). Level maps must be authored inside that envelope, or they need
pinch-zoom, which fights with tap-to-place. Decision: **every level fits the viewport
with no camera control**; pinch-zoom is an optional accessibility extra, not a
gameplay assumption.

---

## 4. Pathfinding and the maze rules

### Flow field, not per-enemy A*

One **multi-source BFS from the exit tile(s)** over the whole board produces, for every
walkable cell, its distance-to-exit and its best next neighbour. Cost:
a few hundred cells, microseconds. Recomputed only when the board changes (tower
placed, sold, or destroyed).

Each enemy then just reads `flow[cell].next` — O(1) per enemy per step. This scales to
hundreds of enemies for free, and gives us "distance to exit" as a bonus, which is
exactly the sort key for the *first* / *last* tower targeting modes.

Multiple entrances need no extra machinery; multiple exits would also just be extra BFS
sources.

### Rule: you may not seal the exit

On every candidate placement (i.e. continuously while a placement ghost is being
dragged) we run the BFS on the hypothetical board and reject the placement if:

1. any **active spawn portal** has no path to an exit, **or**
2. any **living ground enemy's current cell** has no path to an exit.

Rejected placements are never silently swallowed: the ghost turns red, the cells that
would become unreachable pulse red, and the tap does nothing but a short buzz/flash.
This is the primary rule, because it teaches the constraint before the player wastes
money.

### Fallback: trapped enemies eat towers

Condition 2 can still be violated by cases the placement check can't see — an enemy
spawning into a pocket, a tower destroyed and rebuilt during a re-path, a future
mechanic that changes terrain. So the safety net the brief asks for is implemented too:

> An enemy with **no path to any exit** switches to `ENRAGED`: it targets the nearest
> tower blocking its shortest theoretical route, walks to it, winds up for ~0.5 s with
> a loud visual tell, and **destroys it in one hit** (no refund to the player). The
> flow field recomputes and it resumes walking.

The wind-up matters: it gives the player a beat to see what's happening and understand
why they just lost a tower. Flying enemies never trigger this — they ignore the board.

### Movement between cells

Enemies hold `{cell, nextCell, t}` and advance `t` at `speed / hexWidth` per second.
Position is **not** a straight lerp centre-to-centre — that produces visible zig-zag
kinks. Instead we draw a quadratic Bézier from *entry-edge midpoint → cell centre →
exit-edge midpoint*, so movement curves smoothly through each cell and the enemy's
facing is the curve tangent.

Re-path timing: when the flow field changes mid-transit, an enemy **finishes its
current edge** before consulting the new field. This prevents mid-edge snapping and
backtracking. Enemies only ever step to a strictly lower distance value; ties are
broken by a stable per-enemy hash so that a stream of identical enemies fans out across
equal-length routes instead of forming a single-file line.

Placement is also forbidden on a cell that is currently occupied by, or is the
`nextCell` of, any living enemy.

---

## 5. Simulation architecture

**Fixed timestep, 60 Hz, with render interpolation.**

```
accumulator += min(realDelta, 0.25)
while (accumulator >= 1/60) { simStep(1/60); accumulator -= 1/60 }
render(accumulator / (1/60))   // interpolate positions for smoothness
```

Three payoffs:

1. Behaviour is identical on a 60 Hz phone and a 144 Hz monitor.
2. The **fast-forward button (1× / 2× / 3×)** is just "run N sim steps per frame" —
   no per-system time scaling bugs.
3. The sim is deterministic given a seed, which makes the headless balance harness in
   §13 possible.

Ordering inside `simStep`: spawn → status effects → enemy movement → tower targeting
and firing → projectile integration → collision/damage → deaths and rewards →
particles/FX → win/lose check.

**Everything transient is pooled**: projectiles, particles, damage numbers, beam
segments. No allocation in the hot loop; GC pauses are visible as stutter on phones.

---

## 6. Towers

Data-driven. Each definition is a plain object: identity, cost, per-level stat curve,
targeting mode, and one of a small set of **firing primitives** so we aren't writing
bespoke combat code seven times.

Firing primitives: `hitscanSingle`, `hitscanLine` (pierce), `projectileSplash`,
`auraPulse`, `chain`, `beamSustained`.

| Tower | Cost | Role | Behaviour | Air? |
|---|---|---|---|---|
| **Pulse Gun** | $8 | The maze brick | Fast hitscan, never misses, single target, short range, low damage. Cheap enough to build walls out of. | Yes |
| **Laser Lance** | $30 | Positional skill | Instant beam down a straight hex line, damages **every** enemy on that line, long range, long cooldown. Rewards aiming a corridor of your own maze down its barrel. | Yes |
| **Resonator (Thumper)** | $20 | Crowd control | Untargeted expanding rings; damages everything within a short radius. Ignores stealth/evasion. | No |
| **Mortar** | $45 | Artillery | **Annulus range** — a dead zone up close and a hard outer limit. Slow, high damage, arcing shell, splash on impact. Cannot defend itself. | No |
| **Tesla Coil** | $35 | Anti-swarm | Chains to N targets, damage decaying per jump. | Yes |
| **Cryo Emitter** | $25 | Support | Little damage; applies a stacking slow field in radius. Force-multiplies everything around it. | Yes |
| **Prism** | $90 | Late unlock (L5) | Multi-shot homing bolts that ignore armour. The rainbow ring from the screenshots. | Yes |

Two deliberate counter-design decisions:

- **Mortar and Resonator can't hit air.** Without this, a perfectly optimised ground
  maze is the answer to every level and there's no reason to diversify.
- **Armour is flat damage reduction, not a percentage.** That makes the Pulse Gun
  spam strategy fall off hard against Tanks and gives the Mortar a clear identity.

### Upgrades and selling

Matches the reference UI exactly: tap a placed tower → it is selected, its range ring
draws in green, and a bottom info bar shows `name / level / range / description` plus
an **Upgrade** button with its price and a **Sell** button.

- Levels 1–5. Upgrade cost `round(baseCost * 1.6^level)`.
- Each level: ×1.35 damage, ×1.12 fire rate, ×1.06 range, and a visual tier change
  (more geometry, brighter core, extra orbiting ring at max).
- Sell refunds **50 %** of everything invested. Selling is a legitimate mid-wave
  tactic for re-shaping a maze, so it's instant, but it triggers the same
  block-validation as placement (you can't sell yourself into an unreachable board —
  which can't actually happen by removal, but the check is cheap and future-proof).

A cheap **Pylon** ($4, no weapon, pure blocker) is tempting for maze-building on a
budget. Flagged as a playtest question, not committed — it risks trivialising the
money-vs-maze tension that makes the genre interesting.

---

## 7. Enemies

Also a data table. Health scales by a formula, not by hand-tuning every wave (§11).

| Enemy | Shape | Traits |
|---|---|---|
| **Grunt** | circle with a bar | The baseline everything else is measured against. |
| **Runner** | star | ~2.2× speed, ~0.4× health. Punishes slow, high-damage towers. |
| **Tank** | heavy blob | ~4× health, 0.6× speed, high flat **armour**. |
| **Swarmling** | tiny dot | Spawns in packs of 10–14, trivial health. Punishes single-target. |
| **Shielded** | ringed hexagon | Absorb pool that recharges 2 s after last being hit. Punishes slow single shots, rewards fast fire. |
| **Flyer** | pac-man arc | **Ignores the maze entirely** — flies straight spawn→exit. Only air-capable towers touch it. |
| **Splitter** | cluster | Splits into 3 smaller units on death. |
| **Phaser** | flickering ring | Becomes untargetable for ~1 s on a cycle. |
| **Boss** | large composite | End-of-level. Huge health, immune to slow, projects an aura granting nearby enemies damage reduction. Costs 5 health if it leaks. |

Status effects kept deliberately minimal to avoid stat bloat: `slow`, `burn` (DoT),
`stun`. Damage model: raw damage → minus flat `armour` (floored at a small minimum) →
absorbed by `shield` pool → applied to health.

---

## 8. Levels

Five hand-authored maps, each a JS module with terrain + wave table. Structurally
distinct, not just re-skinned:

1. **Onramp** — small, open, one entrance / one exit, generous cash. Carries the
   tutorial callouts (styled exactly like the first reference screenshot: blue rounded
   speech bubbles with arrows). Teaches place → maze → upgrade → sell.
2. **Bottleneck** — void cells form natural chokepoints; teaches mazing *with* terrain
   and introduces the Laser Lance's line-of-hexes payoff.
3. **Fork** — two entrances, alternating per wave, converging on one exit. Introduces
   Flyers, so a single perfect ground maze is no longer sufficient.
4. **Spiral** — a long pre-carved corridor (`PATH_ONLY` cells) with limited buildable
   pockets. Less a maze, more a placement puzzle. Introduces armour and the Mortar.
5. **Crucible** — big open arena, two entrances, one exit, minimal terrain, every enemy
   type, boss finale, and the Prism unlock. Pure maze skill.

### Cell types

`BUILDABLE` · `BLOCKED` (void, neither walkable nor buildable) · `PATH_ONLY` (walkable,
not buildable) · `SPAWN` · `EXIT` · `PAD_POWER` (orange: tower here gets +25 % damage)
· `PAD_FOCUS` (purple: tower here gets +20 % range and rate).

The augment pads are the orange and purple hexes visible in the reference shots. They
give each map a personality and create "fight over this tile" moments.

### Authoring format

Human-editable text art, one line per axial row, using odd-q offset for readability.
A parser converts it to axial coordinates at load. This matters — hand-authoring five
maps as coordinate lists would be miserable.

```js
// legend: . buildable   # void   , path-only   A/B spawn   X exit
//         o power pad   p focus pad   (space) outside the board
export const ONRAMP = {
  name: 'Onramp',
  startCash: 60,
  health: 20,
  map: [
    '   A     ',
    '  ...    ',
    ' ....... ',
    '....o....',
    '....#....',
    '....p....',
    ' ....... ',
    '  .....  ',
    '    X    ',
  ],
  waves: [ /* see §11 */ ],
};
```

---

## 9. Waves, economy, and scoring

- **Wave table per level**: each entry is `{ groups: [{type, count, gapMs}], portals,
  breakSeconds }`. `portals: ['A','B']` on the final wave of multi-entrance maps.
- **Break between waves**: 30 s on level 1 wave 1, scaling down toward ~12 s by
  level 5. A **SEND NOW** button skips the remainder and awards a cash bonus
  proportional to the time skipped. This respects impatient mobile players *and*
  creates a real risk/reward decision, which is why the genre always has it.
- **Economy**: starting cash per level, cash per kill (scaled by enemy type),
  wave-clear bonus, early-send bonus. **No interest** — it turns the game into a
  spreadsheet.
- **Health**: 20 by default, −1 per leak, −5 per boss leak. 0 = level failed.
- **Score**: big zero-padded arcade counter, plus a **combo multiplier** that rises
  with kills in quick succession and decays over ~2 s of no kills (the `x1080` in the
  reference shots). The multiplier drives the score, so playing aggressively and
  killing in bursts is worth more than trickling damage — that's what makes the
  chaotic late-wave screen feel earned.
- **Per-level 3-star rating** from health remaining + score thresholds; persisted.

---

## 10. Presentation

The look is the feature, so it gets explicit engineering rather than being left to
"add glow at the end".

**Palette.** Near-black background. Dark teal hex lattice, brighter on buildable cells,
dimmed on void. Entities in saturated neon: lime/cyan for player towers, magenta and
gold for advanced tiers, blue and pink for enemies, red for danger states.

**Every entity is drawn twice** — a wide, soft, additive halo sprite behind a thin,
crisp, near-white core outline. That single trick is most of the neon look, it costs
one extra batched sprite, and it survives being scaled down for performance far better
than a filter does.

**Particles.** One pooled additive system with a cap (default 3000, lowered on weak
devices) rendered through a `ParticleContainer`. Emitters: muzzle flash, impact spark,
enemy death burst (coloured shards with drag and fade), tower destruction, explosion
shockwave ring, exit-leak flare.

**Post-processing** applied to the world container only, never the HUD:
- `AdvancedBloomFilter` at reduced resolution (half or quarter) — full-res bloom at
  DPR 3 is the single most likely thing to tank a phone.
- `ShockwaveFilter` per large explosion, hard-capped at 2 concurrent.
- `RGBSplitFilter` at very low amplitude, plus a static vignette.

**Global intensity value.** A scalar that ramps with recent kills, explosions and
on-screen enemy count, driving bloom strength, aberration amplitude and screen shake.
Late waves therefore *literally look* more chaotic and overloaded than early ones,
which is the emotional arc the reference screenshots are selling.

**Quality tiers.** Probe frame time over the first ~3 s, pick High / Medium / Low, and
degrade in this order: shockwave count → blur width → particle cap → bloom off
entirely (the drawn halos keep the look alive without it). Manual override in settings.

---

## 11. Balance methodology

Rather than hand-tuning ~60 wave entries, enemy health follows a curve:

```
hp(level, wave, type) = TYPE[type].hp * BASE_HP * growth^(globalWaveIndex)
```

with `growth ≈ 1.18` and per-level multipliers. Waves then only specify *composition*
and *count*, which is the interesting part. Tower DPS is tuned against a
"cash-per-second the player plausibly has" curve so that a competent build clears with
some margin and a lazy one leaks.

---

## 12. Input and UI

**Layout (portrait):** top HUD strip (score · multiplier · health · wave x/y) →
full-bleed hex board → bottom tower palette with prices → contextual info bar when a
tower is selected. This mirrors the reference screenshots closely.

**Touch model:**
- Tap a palette entry to arm it. Tap a board cell to place. The ghost preview and its
  range ring follow the finger *offset upward* so the fingertip doesn't hide the
  target cell; placement commits on release.
- Live block-validation while dragging: ghost red + affected cells pulsing when the
  placement would seal the exit.
- Tap a placed tower to select it (range ring + info bar). Tap empty space to deselect.
- Buttons: pause, speed 1×/2×/3×, SEND NOW.

**Desktop extras (cheap to add, not separately tested this round):** hover preview,
number keys `1–7` for tower selection, click to place, right-click / `Esc` to cancel,
`space` to send the next wave, `1`/`2`/`3` also mapped to speed if unambiguous.

**HUD is DOM, not canvas** — crisper text, free layout and accessibility, no font
atlas, and it stays outside the bloom filter automatically.

**Audio (deferred to a later phase):** a small WebAudio synth — no asset files — for
laser zaps, thumps, explosions and UI blips, behind a mute toggle that defaults to on
for mobile. Skipped entirely if it starts eating schedule.

---

## 13. Testing

- **Unit tests** (`node --test`, no framework) for the pure modules: hex math,
  coordinate rounding, `hexLine`, flow-field correctness, and the block-validation
  rule including the trapped-enemy edge cases.
- **Headless balance harness**: because the sim is fixed-step and deterministic, a
  Node script can run a level with a scripted build order and report leaks, cash
  curve, and time-to-clear — turning balance from guesswork into a measurement.
- **Playwright smoke test** (Chromium is available in this environment): load the page,
  start level 1, run at 3×, assert the level completes and the console is clean.
- Manual device pass on a real phone for touch ergonomics and thermals.

---

## 14. File layout

```
hex-defense/
  index.html            # import map, canvas, DOM HUD
  style.css
  README.md
  plan.md               # this file
  js/
    main.js             # boot, resize, main loop
    game.js             # state machine: menu / building / wave / paused / win / lose
    constants.js        # all balance tunables in one place
    hex.js              # axial math, layout, lines, ranges  (pure)
    grid.js             # cell state, terrain, occupancy
    pathfield.js        # multi-source BFS flow field + block validation  (pure)
    wave.js             # wave director and spawning
    combat.js           # targeting, damage, status effects
    economy.js          # cash, score, combo multiplier
    save.js             # localStorage progress and best scores
    input.js            # pointer + keyboard, placement gestures
    hud.js              # DOM HUD binding
    entities/
      enemy.js  tower.js  projectile.js
    data/
      towers.js  enemies.js
      levels/ onramp.js bottleneck.js fork.js spiral.js crucible.js
    fx/
      textures.js       # procedural neon sprite generation
      render.js         # scene graph, layers, entity views
      particles.js      # pooled additive particle system
      postfx.js         # bloom, shockwave, aberration, intensity driver
      camera.js         # fit-to-viewport, shake
    vendor/
      pixi.mjs  pixi-filters.mjs
```

---

## 15. Milestones

| Phase | Deliverable |
|---|---|
| **P0** | Static shell, Pixi boots, hex grid renders and fits any viewport, tap highlights a cell. |
| **P1** | Flow field + one enemy walking smoothly spawn→exit along Bézier-curved hex steps. |
| **P2** | Placement, block-validation, Pulse Gun, targeting, damage, death, the trapped-enemy tower-eating fallback. |
| **P3** | Waves, break timer, SEND NOW, economy, health, score/multiplier, win/lose, HUD. |
| **P4** | Full tower roster + upgrade/sell UI; full enemy roster with armour/shield/flying. |
| **P5** | FX pass: procedural neon textures, particle system, bloom, shockwave, shake, intensity ramp, quality tiers. |
| **P6** | Five levels, level select, tutorial callouts, save/progress, star ratings. |
| **P7** | Polish: fast-forward, settings, audio, desktop controls, device testing, README. |

The game is genuinely playable at the end of **P3** and genuinely *fun* at **P4**; the
look lands at **P5**. If time gets cut, cut from P7 backwards, never from P5.

---

## 16. Decisions made on the brief's behalf

1. **Flat-top hexes**, for direct north–south movement on a portrait screen.
2. **Both** block rules are implemented: placement is rejected when it would seal the
   exit (primary, better UX), *and* trapped enemies one-hit-kill a blocking tower
   (the fallback the brief asked for, which still needs to exist for pocket cases).
3. **Board always fits the screen, no camera pan** — pinch-to-pan fights with
   tap-to-place on a phone. This caps maps at ~9–11 columns wide.
4. **Mortar and Resonator can't hit air**, so flyers force build diversity.
5. **Flow field instead of per-enemy A***, because maze TD re-paths constantly.
6. **No interest mechanic**; SEND NOW bonus instead, for tempo without spreadsheets.

## 17. Open questions for playtesting

- Does the cheap **Pylon** blocker get included, or does forcing every maze wall to be
  a real (attacking) tower make the money tension better?
- Break length: is 30 s right for mobile, or does it want to start nearer 20 s?
- Should selling be free mid-wave, or carry a small penalty to prevent sell-and-rebuild
  wave cheesing?
- Is the maze fully free-form, or do some later levels want a partial pre-carved path
  (Spiral's approach) to control difficulty more tightly?
