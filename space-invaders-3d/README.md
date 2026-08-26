# Orbital Invaders

A 3D reimagining of Space Invaders built with [three.js](https://threejs.org/). You fly a ship confined to a circular patch of space; waves of enemies arrive on hyperbolic approach trajectories and settle into real two-body Keplerian orbits around a central black hole, sped up so a typical orbit takes a few seconds. Your shots always fire straight up; enemy fire either falls straight down or follows its own orbital path that can curve down into your plane.

## Running it

This is a plain static site with no build step — `three.js` is vendored locally under `js/vendor/`. Because it uses ES module imports, it needs to be served over `http(s)://` rather than opened as a `file://` path:

```sh
cd space-invaders-3d
python3 -m http.server 8000
# then open http://localhost:8000/
```

It also deploys as-is to GitHub Pages with no configuration.

## Controls

- **Desktop**: Arrow keys / WASD to move, or move the mouse to steer (speed-capped, same as keyboard). Spacebar or click to fire.
- **Mobile**: Drag on the elliptical trackpad below the play area to steer; tap either FIRE button in the corners to shoot.

Firing is single-shot per press, on a short cooldown — no auto-fire.
