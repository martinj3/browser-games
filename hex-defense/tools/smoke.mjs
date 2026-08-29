// Browser smoke test: boot the game, play a level, assert nothing threw.
//
// Needs a static server on the port below and Playwright available:
//   npx http-server -p 8123 -s .
//   node tools/smoke.mjs [levelIndex]
//
// Chromium is driven with software GL here, so the frame rate it reports is not
// representative of real hardware -- this checks correctness, not performance.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('playwright not found; install it or run with a global install on NODE_PATH');
  process.exit(2);
}

const URL = process.env.SMOKE_URL || 'http://127.0.0.1:8123/index.html';
const LEVEL = Number(process.argv[2] || 0);

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });

const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction('window.game && window.game.renderer && window.game.hud', null, { timeout: 20000 });

const levelCount = await page.locator('.level-btn').count();
assert(levelCount === 5, `expected 5 levels in the menu, saw ${levelCount}`);

await page.evaluate((i) => window.game.startLevel(i), LEVEL);
await page.waitForTimeout(400);

// Build a comb maze and confirm mazing actually lengthens the route.
const maze = await page.evaluate(() => {
  const w = window.game.world;
  w.cash = 100000;
  const before = w.pathfield.distanceOf(w.grid.spawns[0].cell);
  const textRow = (c) => c.r + ((c.q - (c.q & 1)) >> 1);
  const rows = [...new Set(w.grid.list.map(textRow))].sort((a, b) => a - b);
  let gapLeft = true, placed = 0;
  for (const row of rows.slice(2, -2)) {
    if (row % 2) continue;
    const inRow = w.grid.list.filter((c) => textRow(c) === row).sort((a, b) => a.q - b.q);
    if (!inRow.length) continue;
    const gapCol = (gapLeft ? inRow[0] : inRow[inRow.length - 1]).q;
    gapLeft = !gapLeft;
    for (const c of inRow) {
      if (c.q !== gapCol && !w.canPlace('pulse', c) && w.place('pulse', c)) placed++;
    }
  }
  return { before, after: w.pathfield.distanceOf(w.grid.spawns[0].cell), placed };
});
assert(maze.placed > 0, 'no towers could be placed');
assert(maze.after > maze.before, `maze did not lengthen the route (${maze.before} -> ${maze.after})`);

// The exit can never be sealed.
const sealed = await page.evaluate(() => {
  const w = window.game.world;
  for (const c of w.grid.list) if (!w.canPlace('pulse', c)) w.place('pulse', c);
  return { reachable: w.pathfield.reachable(w.grid.spawns[0].cell), towers: w.towers.length };
});
assert(sealed.reachable, 'the board was sealed off, which must be impossible');

// Play several waves at 3x.
await page.evaluate(() => { window.game.speedIndex = 2; });
for (let i = 0; i < 4; i++) {
  await page.evaluate(() => window.game.sendNextWave());
  await page.waitForTimeout(2000);
}

const state = await page.evaluate(() => {
  const w = window.game.world;
  return { wave: w.director.waveIndex + 1, kills: w.kills, score: w.score, mode: window.game.mode };
});
assert(state.kills > 0, 'nothing was killed across four waves');

console.log(`level ${LEVEL + 1}: path ${maze.before} -> ${maze.after} hexes, ${sealed.towers} towers, ` +
  `wave ${state.wave}, ${state.kills} kills, score ${state.score}`);

await browser.close();

if (problems.length) {
  console.error('FAILED -- console/page errors:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('smoke test passed');

function assert(cond, msg) {
  if (!cond) { console.error('FAILED -- ' + msg); problems.push(msg); }
}
