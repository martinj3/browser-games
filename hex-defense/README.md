# HEXSWARM

A neon hex-grid maze tower defense game, in the spirit of *geoDefense Swarm*.
Towers are the walls: you build the maze out of them, and the longer you make the
route, the longer the swarm stays under your guns. You may never seal the exit
completely — and if something does get trapped, it will chew its way out through
one of your towers.

Built for phones first, playable on desktop. No build step, no server, no assets:
it deploys to GitHub Pages exactly as it sits in this folder.

## Running it

Plain static site with ES modules, so it needs `http(s)://` rather than a
`file://` path:

```sh
cd hex-defense
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Controls

**Touch** — tap a tower in the dock to arm it, then tap a hex to place. Drag to
move the placement ghost (it sits above your finger so the target cell stays
visible); the ghost turns red when a placement would seal the exit, and the
portals it would cut off pulse red. Tap a placed tower to select it: the dock
shows its stats with **Upgrade** and **Sell** buttons, and the board shows its
range ring.

**Desktop** — the same, plus `1`–`7` to pick a tower, `Esc` to cancel,
`Space` to send the next wave, `U` upgrade, `X` sell, `P` pause, `F` fast-forward.

## How it works

- **Flat-top hexes on axial coordinates.** Flat-top gives direct north–south
  movement, which is the axis a portrait phone cares about.
- **One flow field, not per-enemy A\*.** A single multi-source BFS from the exit
  gives every cell its distance and its best next step, so each enemy is an O(1)
  lookup. That is what makes it cheap enough to re-path on *every* frame of a
  placement drag, which is what makes the live red "this would seal the exit"
  preview possible.
- **Two blocking rules, not one.** Placement is refused outright when it would cut
  a portal off from the exit. That cannot catch an enemy already sealed inside a
  pocket, so trapped enemies also enrage: they walk to the tower in their way,
  wind up visibly, and destroy it outright. No refund.
- **Fixed 60 Hz simulation with render interpolation.** Behaviour is identical on
  a 60 Hz phone and a 144 Hz monitor, fast-forward is just "run N steps per
  frame", and the sim is deterministic — which is what lets `tools/simulate.mjs`
  play a whole level headlessly and measure the balance.
- **Baked neon, not filtered neon.** Every sprite is drawn once at boot with
  Canvas 2D — halo included, via `shadowBlur` — and handed to Pixi as a texture.
  At runtime they are tinted, batched sprites, so the expensive part of the glow
  costs nothing per frame and the repo ships no image files at all.
- **Quality tiers from measurement.** A short frame-time probe picks High/Medium/
  Low and degrades in an order that protects the look: shockwaves first, then
  blur width and particle count, and only last does bloom switch off — the baked
  halos carry the neon on their own. No tier ever lowers the *filter* resolution.
  Pixi resolves one resolution for a filtered container as the minimum over its
  filters, and `Filter`'s default is 1 rather than the renderer's — so a filter
  left alone rasterises the whole world at 1 CSS pixel and upscales it to a 2x or
  3x screen. Every filter here sets `resolution: 'inherit'`; cheap bloom comes
  from `pixelSize` and blur passes instead. A soft glow still looks deliberate;
  a pixelated board just looks broken.

Simulation cost with 44 towers and 200 live enemies measures ~0.2 ms per tick,
about 1% of a frame budget; the rest of the time is drawing.

## Towers

| Tower | Cost | Role | Air? |
|---|---|---|---|
| Pulse Gun | $8 | Fast hitscan, never misses. Cheap enough to build walls from. | yes |
| Laser Lance | $30 | Instant beam down a hex line, hits everything on it. | yes |
| Resonator | $20 | Untargeted shockrings, hits everything close. | **no** |
| Cryo Emitter | $25 | Almost no damage; slows everything in reach. | yes |
| Tesla Coil | $35 | Chains between enemies, weakening per jump. | yes |
| Mortar | $45 | Splash shells, with a dead zone up close. | **no** |
| Prism | $90 | Homing volleys that ignore armour. Unlocks on level 5. | yes |

Mortar and Resonator deliberately cannot hit air. Without that, one perfect
ground maze would be the answer to every level; Flyers force you to diversify.
Armour is *flat* damage reduction rather than a percentage, which is what makes
Pulse Gun spam fall off against Tanks instead of scaling forever.

Towers go to level 5. Each upgrade multiplies damage and fire rate; range steps
at levels 3 and 5, because on a discrete grid a smooth range curve mostly does
nothing and then jumps. Selling refunds half of everything invested.

## Levels

1. **Onramp** — open, one portal, tutorial callouts.
2. **Bottleneck** — void cells make the chokepoints; long lanes for the Laser.
3. **Fork** — two portals alternating by wave, converging on one exit. Flyers.
4. **Serpentine** — walls force a long switchback; a placement puzzle. Armour.
5. **Crucible** — open arena, two portals, every enemy type, a Hive Core finale.

Maps are text art (`js/data/levels/*.js`) — `.` buildable, `#` void, `,` walkable
but not buildable, `A`–`D` portals, `X` exit, `o` damage pad, `p` range/rate pad.
Each string is one row; odd columns sit half a hex lower.

Map dimensions are not free: the whole board is fitted on screen with no panning,
so a map whose aspect ratio is far from the device's leaves dead black margins,
and one with too many columns makes the hexes untappable. 9x13 and 11x15 are the
sizes that fill a modern phone while keeping hexes big enough; `tools/test.mjs`
asserts both properties against real device profiles, including the smallest
supported one.

Enemy health comes from a curve, so wave tables only specify *composition*:
`hp = type.hp × BASE_HP × LEVEL_HP_SCALE[level] × WAVE_HP_GROWTH^wave`.

## Tools

```sh
node --test tools/test.mjs      # unit tests: hex math, flow field, block rules, world
node tools/simulate.mjs         # headless balance harness, all five levels
node tools/simulate.mjs 4 -v    # one level, wave by wave
node tools/smoke.mjs 0          # browser smoke test (needs a server on :8123)
```

The balance harness plays each level with a scripted build order. It is a
mediocre player — it does not really maze — so it clearing levels 1–3 and falling
short late on 4 and 5 is roughly the intended difficulty shape.

## Third-party

[PixiJS](https://pixijs.com/) v8 and `pixi-filters` v6, vendored under
`js/vendor/` (MIT, licences alongside).
