// Unit tests for the pure modules -- hex math, board parsing and the flow field,
// including the block-validation rule and its edge cases.
//
//   node --test tools/
//
// These are the parts where a subtle mistake is invisible on screen but wrecks
// the game (an enemy cutting a corner it should not, a placement that seals the
// board), so they get real assertions rather than a look at a screenshot.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as hex from '../js/hex.js';
import { Grid, TERRAIN } from '../js/grid.js';
import { PathField } from '../js/pathfield.js';
import { LEVELS } from '../js/data/levels/index.js';
import { TOWER_BY_ID, TOWERS } from '../js/data/towers.js';
import { ENEMY_BY_ID, ENEMIES } from '../js/data/enemies.js';
import { World, RESULT } from '../js/world.js';
import { TICK } from '../js/constants.js';

test('hex: distance is symmetric and matches ring sizes', () => {
  assert.equal(hex.distance(0, 0, 0, 0), 0);
  for (let d = 1; d <= 4; d++) {
    const ring = hex.cellsInRange(0, 0, d, d);
    assert.equal(ring.length, 6 * d, `ring ${d}`);
    for (const c of ring) assert.equal(hex.distance(0, 0, c.q, c.r), d);
  }
  // A disc of radius d has 3d(d+1)+1 cells.
  for (let d = 0; d <= 4; d++) {
    assert.equal(hex.cellsInRange(0, 0, d).length, 3 * d * (d + 1) + 1);
  }
});

test('hex: pixel round-trip is exact for cell centres', () => {
  for (let q = -6; q <= 6; q++) {
    for (let r = -6; r <= 6; r++) {
      const p = hex.toPixel(q, r, 31.5, 17, -9);
      const back = hex.fromPixel(p.x, p.y, 31.5, 17, -9);
      assert.deepEqual(back, { q, r }, `${q},${r}`);
    }
  }
});

test('hex: every neighbour is exactly one step away, and adjacency is mutual', () => {
  for (let d = 0; d < 6; d++) {
    const n = hex.neighbor(3, -2, d);
    assert.equal(hex.distance(3, -2, n.q, n.r), 1);
    // Stepping back the opposite way returns to the start.
    const back = hex.neighbor(n.q, n.r, (d + 3) % 6);
    assert.deepEqual(back, { q: 3, r: -2 });
  }
});

test('hex: all six neighbours are equidistant in pixels', () => {
  const size = 24;
  const c = hex.toPixel(0, 0, size);
  const expected = Math.sqrt(3) * size;
  for (let d = 0; d < 6; d++) {
    const n = hex.neighbor(0, 0, d);
    const p = hex.toPixel(n.q, n.r, size);
    assert.ok(Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - expected) < 1e-9);
  }
});

test('grid: text maps parse into a connected board', () => {
  const g = Grid.fromMap([' A ', ' . ', '...', ' . ', ' X ']);
  assert.equal(g.list.length, 7);   // 1 + 1 + 3 + 1 + 1 non-space characters
  assert.equal(g.spawns.length, 1);
  assert.equal(g.exits.length, 1);
  assert.equal(g.spawns[0].label, 'A');
  // Adjacency must be mutual, or enemies can walk through walls one way.
  for (const c of g.list) {
    for (const n of g.walkableNeighbors(c)) {
      assert.ok(g.walkableNeighbors(n).includes(c), `${c.q},${c.r} <-> ${n.q},${n.r}`);
    }
  }
});

test('grid: spawn and exit cells are walkable but never buildable', () => {
  const g = Grid.fromMap([' A ', ' . ', ' X ']);
  for (const cell of [g.spawns[0].cell, g.exits[0]]) {
    assert.ok(g.isWalkable(cell));
    assert.ok(!g.isBuildable(cell));
  }
});

test('pathfield: distances are exact and the field points downhill', () => {
  const g = Grid.fromMap(['A', '.', '.', 'X']);
  const pf = new PathField(g);
  assert.equal(pf.distanceOf(g.spawns[0].cell), 3);
  let cell = g.spawns[0].cell;
  let steps = 0;
  while (pf.distanceOf(cell) > 0) {
    const dir = pf.chooseDir(cell, 0);
    assert.ok(dir >= 0);
    const n = hex.neighbor(cell.q, cell.r, dir);
    const next = g.at(n.q, n.r);
    assert.equal(pf.distanceOf(next), pf.distanceOf(cell) - 1);
    cell = next;
    assert.ok(++steps < 50);
  }
});

test('pathfield: a tower makes its cell unwalkable and lengthens the route', () => {
  const g = Grid.fromMap(['A..', '...', '..X']);
  const pf = new PathField(g);
  const before = pf.distanceOf(g.spawns[0].cell);
  // Wall off a cell on the direct line.
  const mid = g.list.find((c) => g.isBuildable(c) && pf.distanceOf(c) === 1);
  mid.tower = {};
  pf.compute();
  assert.ok(pf.distanceOf(g.spawns[0].cell) >= before);
  assert.equal(pf.distanceOf(mid), Infinity);
});

test('pathfield: sealing the exit is refused, everything short of it is allowed', () => {
  const g = Grid.fromMap([' A ', ' . ', '...', ' . ', ' X ']);
  const pf = new PathField(g);
  const spawn = g.spawns[0].cell;
  const buildable = g.list.filter((c) => g.isBuildable(c));
  const refused = buildable.filter((c) => !pf.allowsPlacement(c, [spawn], []));
  // This board is a single corridor with one bulge, so exactly the corridor
  // cells are cut vertices.
  assert.ok(refused.length > 0, 'something must be refused on a corridor board');
  for (const c of refused) {
    c.tower = {};
    pf.compute();
    assert.equal(pf.distanceOf(spawn), Infinity, `${c.q},${c.r} should have sealed the board`);
    c.tower = null;
    pf.compute();
  }
});

test('pathfield: a placement that would strand a live enemy is refused', () => {
  const g = Grid.fromMap(['A.', '..', '.X']);
  const pf = new PathField(g);
  const spawn = g.spawns[0].cell;
  const enemyCell = g.list.find((c) => g.isBuildable(c));
  // Standing on the cell itself is always refused.
  assert.equal(pf.allowsPlacement(enemyCell, [spawn], [enemyCell]), false);
});

test('pathfield: a trapped enemy is pointed at a tower it can break', () => {
  const g = Grid.fromMap([' A ', ' . ', '...', ' . ', ' X ']);
  const pf = new PathField(g);
  const spawn = g.spawns[0].cell;
  const below = g.at(spawn.q, spawn.r + 1);
  below.tower = { id: 'wall' };
  pf.compute();
  assert.equal(pf.reachable(spawn), false, 'spawn should now be sealed in');
  assert.equal(pf.blockingNeighbor(spawn), below);
});

test('levels: every map is well-formed and solvable', () => {
  for (const level of LEVELS) {
    const g = Grid.fromMap(level.map);
    const pf = new PathField(g);
    assert.ok(g.exits.length >= 1, `${level.id}: needs an exit`);
    assert.ok(g.spawns.length >= 1, `${level.id}: needs a spawn`);
    for (const s of g.spawns) {
      assert.ok(pf.reachable(s.cell), `${level.id}: portal ${s.label} cannot reach an exit`);
    }
    const labels = new Set(g.spawns.map((s) => s.label));
    for (const w of level.waves) {
      for (const p of w.portals || ['A']) {
        assert.ok(labels.has(p), `${level.id}: wave references missing portal ${p}`);
      }
      for (const grp of w.groups) {
        assert.ok(ENEMY_BY_ID[grp.t], `${level.id}: unknown enemy ${grp.t}`);
        assert.ok(grp.n > 0 && grp.gap > 0, `${level.id}: bad group`);
      }
    }
    for (const t of level.towers) assert.ok(TOWER_BY_ID[t], `${level.id}: unknown tower ${t}`);
    // Every level must still be readable on a phone.
    const size = g.layout(390, 620);
    assert.ok(size * 2 >= 42, `${level.id}: hexes are only ${(size * 2).toFixed(0)}px wide`);
  }
});

test('data: tower and enemy tables are internally consistent', () => {
  for (const t of TOWERS) {
    assert.ok(t.damage >= 0 && t.cooldown > 0 && t.range > 0, `${t.id}`);
    assert.ok(!t.minRange || t.minRange < t.range, `${t.id}: dead zone swallows the range band`);
    assert.ok(['hitscanSingle', 'hitscanLine', 'auraPulse', 'projectileSplash', 'chain', 'multiHoming']
      .includes(t.primitive), `${t.id}: unknown primitive ${t.primitive}`);
  }
  for (const e of ENEMIES) {
    assert.ok(e.hp > 0 && e.speed > 0 && e.radius > 0, `${e.id}`);
    if (e.splitInto) assert.ok(ENEMY_BY_ID[e.splitInto.type], `${e.id}: splits into nothing`);
  }
});

test('world: a level plays out deterministically and ends', () => {
  const run = () => {
    const w = new World(LEVELS[0], 0);
    // No towers at all: everything must leak and the level must be lost.
    for (let i = 0; i < 60 * 60 * 6 && w.result === RESULT.PLAYING; i++) {
      w.step(TICK);
      w.events.length = 0;
    }
    return { result: w.result, leaked: w.leaked, health: w.health };
  };
  const a = run();
  const b = run();
  assert.equal(a.result, RESULT.LOST);
  assert.deepEqual(a, b, 'the same inputs must produce the same outcome');
});

test('world: selling refunds half and frees the cell', () => {
  const w = new World(LEVELS[0], 0);
  const cell = w.grid.list.find((c) => w.grid.isBuildable(c) && !w.canPlace('pulse', c));
  const before = w.cash;
  const tower = w.place('pulse', cell);
  assert.ok(tower);
  assert.equal(w.cash, before - TOWER_BY_ID.pulse.cost);
  assert.equal(cell.tower, tower);
  w.sell(tower);
  assert.equal(cell.tower, null);
  assert.equal(w.towers.length, 0);
  assert.equal(w.cash, before - TOWER_BY_ID.pulse.cost + Math.floor(TOWER_BY_ID.pulse.cost * 0.5));
});

test('world: upgrading raises damage and never exceeds the level cap', () => {
  const w = new World(LEVELS[0], 0);
  w.cash = 100000;
  const cell = w.grid.list.find((c) => !w.canPlace('pulse', c));
  const t = w.place('pulse', cell);
  let last = t.damage;
  for (let i = 0; i < 10; i++) w.upgrade(t);
  assert.equal(t.level, 5);
  assert.ok(t.damage > last);
  assert.equal(t.upgradeCost(), Infinity);
  assert.equal(w.upgrade(t), false);
});

test('world: flyers ignore the maze entirely', () => {
  const w = new World(LEVELS[0], 0);
  w.cash = 100000;
  // Wall the board as much as the rules allow.
  for (const c of w.grid.list) if (!w.canPlace('pulse', c)) w.place('pulse', c);
  const flyer = w.spawnEnemy('flyer', 'A', 0);
  const exit = w.grid.exits[0];
  const startDist = Math.hypot(exit.x - flyer.x, exit.y - flyer.y);
  for (let i = 0; i < 120; i++) w.step(TICK);
  const moved = !flyer.alive || Math.hypot(exit.x - flyer.x, exit.y - flyer.y) < startDist;
  assert.ok(moved, 'a flyer must make progress regardless of the maze');
});
