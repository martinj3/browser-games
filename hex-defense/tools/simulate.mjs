// Headless balance harness.
//
// The simulation is fixed-step and never touches the renderer, so we can play a
// whole level in Node with a scripted build order and measure what happens.
// This turns balance from guesswork into a number.
//
//   node tools/simulate.mjs [levelIndex] [--verbose]

import { LEVELS } from '../js/data/levels/index.js';
import { World, RESULT } from '../js/world.js';
import { PHASE } from '../js/wave.js';
import { TICK } from '../js/constants.js';
import { TOWER_BY_ID } from '../js/data/towers.js';
import { DIRECTIONS } from '../js/hex.js';

/** Cells the enemies actually walk over, by following the flow field. */
function routeCells(world) {
  const marked = new Set();
  for (const spawn of world.grid.spawns) {
    let cell = spawn.cell;
    for (let guard = 0; guard < 500; guard++) {
      marked.add(cell.k);
      const dir = world.pathfield.chooseDir(cell, 0);
      if (dir < 0) break;
      const d = DIRECTIONS[dir];
      const next = world.grid.at(cell.q + d.q, cell.r + d.r);
      if (!next) break;
      cell = next;
    }
  }
  return marked;
}

/** Buildable cell with the most route cells beside it -- crude, but plausible. */
function bestCell(world, id, route) {
  let best = null, bestScore = -Infinity;
  for (const c of world.grid.list) {
    if (world.canPlace(id, c)) continue;   // canPlace returns a reason when illegal
    let adjacency = 0;
    for (const d of DIRECTIONS) {
      const n = world.grid.at(c.q + d.q, c.r + d.r);
      if (n && route.has(n.k)) adjacency++;
    }
    if (adjacency === 0) continue;
    const score = adjacency * 10 + (world.grid.isPad(c) ? 6 : 0) - c.dist * 0.05;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

/** A stand-in for a competent player: buy what it can afford, then upgrade. */
function autoBuild(world, preferred) {
  for (let guard = 0; guard < 60; guard++) {
    const route = routeCells(world);
    let acted = false;
    for (const id of preferred) {
      if (TOWER_BY_ID[id].cost > world.cash) continue;
      const cell = bestCell(world, id, route);
      if (cell && world.place(id, cell)) { acted = true; break; }
    }
    if (!acted) break;
  }
  const sorted = [...world.towers].filter((t) => !t.maxed)
    .sort((a, b) => a.upgradeCost() - b.upgradeCost());
  for (const t of sorted) {
    while (!t.maxed && world.cash >= t.upgradeCost() * 1.5) {
      if (!world.upgrade(t)) break;
    }
  }
}

function run(levelIndex, verbose) {
  const level = LEVELS[levelIndex];
  const world = new World(level, levelIndex);
  const preferred = ['mortar', 'tesla', 'laser', 'resonator', 'pulse', 'cryo', 'prism']
    .filter((id) => level.towers.includes(id));

  let steps = 0, lastWave = -1;
  const waveLog = [];

  while (world.result === RESULT.PLAYING && steps < 60 * 60 * 40) {
    if (world.director.phase === PHASE.BUILD) {
      autoBuild(world, preferred);
      world.cash += world.director.startNextWave(true);
    }
    world.step(TICK);
    world.events.length = 0;
    steps++;
    if (world.director.waveIndex !== lastWave) {
      lastWave = world.director.waveIndex;
      waveLog.push({ wave: lastWave + 1, health: world.health, cash: Math.round(world.cash), towers: world.towers.length });
    }
  }

  const res = world.result === RESULT.WON ? 'WON ' : world.result === RESULT.LOST ? 'LOST' : 'TIME';
  console.log(
    `${levelIndex + 1}. ${level.name.padEnd(11)} ${res}` +
    `  health ${String(world.health).padStart(2)}/${level.health}` +
    `  reached wave ${String(lastWave + 1).padStart(2)}/${level.waves.length}` +
    `  leaks ${String(world.leaked).padStart(3)}` +
    `  kills ${String(world.kills).padStart(4)}` +
    `  towers ${String(world.towers.length).padStart(3)}` +
    `  score ${world.score}`,
  );
  if (verbose) {
    for (const w of waveLog) {
      console.log(`     wave ${String(w.wave).padStart(2)}  hp ${String(w.health).padStart(2)}  $${String(w.cash).padStart(5)}  towers ${w.towers}`);
    }
  }
  return world;
}

const arg = process.argv[2];
const verbose = process.argv.includes('--verbose');
if (arg !== undefined && arg !== '--verbose') run(Number(arg), verbose);
else for (let i = 0; i < LEVELS.length; i++) run(i, verbose);
