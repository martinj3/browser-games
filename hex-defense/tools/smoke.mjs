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
// A real phone profile: touch enabled and DPR 3, so touch hit-testing and the
// filter-resolution path are both exercised the way a device would hit them.
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });

// --- Boot ------------------------------------------------------------------
// On a slow connection the vendored Pixi bundle takes a while, and the game UI
// used to be visible underneath until the menu appeared. Hold the bundle back
// and confirm the loading overlay covers everything the whole time.
// Note: 'commit' rather than 'domcontentloaded' -- module scripts are deferred,
// so domcontentloaded would not resolve until boot had already finished.
const slowBundle = async (route) => {
  await new Promise((r) => setTimeout(r, 1500));
  await route.continue().catch(() => {});   // page may have navigated on already
};
await page.route('**/vendor/pixi*.mjs', slowBundle);
await page.goto(URL, { waitUntil: 'commit' });
// `window.game` only exists once main.js has run, which cannot happen until the
// bundle it imports has arrived -- so it is an implementation-independent
// signal for "still loading". Deliberately NOT the `booting` class: keying the
// check off the fix would make this test skip itself if the fix were removed.
let sampled = 0;
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(300);
  const boot = await page.evaluate(() => ({
    booted: typeof window.game !== 'undefined',
    appVisible: getComputedStyle(document.getElementById('app')).visibility === 'visible',
    overlayShown: !document.getElementById('overlay').classList.contains('hidden'),
  }));
  if (boot.booted) break;
  sampled++;
  assert(!boot.appVisible, 'gameplay UI was visible while the game was still loading');
  assert(boot.overlayShown, 'nothing covered the screen while the game was still loading');
}
assert(sampled > 0, 'never observed the loading state; the bundle delay did not take effect');
await page.unroute('**/vendor/pixi*.mjs', slowBundle);

await page.waitForFunction('window.game && window.game.renderer && window.game.hud', null, { timeout: 30000 });
await page.waitForFunction('!document.body.classList.contains("booting")', null, { timeout: 30000 });

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

// --- Input ---------------------------------------------------------------
// Drive real touch taps through the DOM rather than calling the game API, so
// that hit-testing is actually exercised. A previous build offset every touch
// point upward by ~46px, which is about one hex tall, so every tap landed a
// full cell high -- and no test caught it, because they all bypassed input.js.
await page.evaluate(() => {
  const g = window.game, w = g.world;
  for (const t of [...w.towers]) w.destroyTower(t.cell, false);
  w.cash = 100000;
  w.selected = null;
  g.armedTower = null;
});

const canvasBox = await page.locator('#game-canvas').boundingBox();

// Sample across the board -- top, bottom, both edges, middle -- since a
// constant offset shows up most clearly far from centre. Coordinates are
// re-read immediately before each tap rather than snapshotted up front,
// because anything that refits the board would invalidate them.
const sampleKeys = await page.evaluate(() => {
  const w = window.game.world;
  const open = w.grid.list.filter((c) => !w.canPlace('pulse', c));
  const byY = [...open].sort((a, b) => a.y - b.y);
  const byX = [...open].sort((a, b) => a.x - b.x);
  return [byY[0], byY[byY.length - 1], byX[0], byX[byX.length - 1], byY[byY.length >> 1]]
    .map((c) => `${c.q},${c.r}`);
});

for (const govKey of sampleKeys) {
  const target = await page.evaluate((key) => {
    const [q, r] = key.split(',').map(Number);
    const w = window.game.world;
    const c = w.grid.at(q, r);
    if (!c || w.canPlace('pulse', c)) return null;   // no longer a legal spot
    window.game.armedTower = 'pulse';
    return { q, r, x: c.x, y: c.y };
  }, govKey);
  if (!target) continue;

  await page.touchscreen.tap(canvasBox.x + target.x, canvasBox.y + target.y);
  await page.waitForTimeout(60);

  const hit = await page.evaluate(({ q, r }) => {
    const w = window.game.world;
    const cell = w.grid.at(q, r);
    const newest = w.towers[w.towers.length - 1];
    return { onTarget: !!(cell && cell.tower), landedAt: newest ? `${newest.cell.q},${newest.cell.r}` : null };
  }, target);
  assert(hit.onTarget, `tap at hex ${govKey} landed on ${hit.landedAt} instead`);
}

// Tapping a placed tower must select that same tower, not a neighbour.
const selKey = sampleKeys.find(Boolean);
const selTarget = await page.evaluate((key) => {
  const [q, r] = key.split(',').map(Number);
  const c = window.game.world.grid.at(q, r);
  if (!c || !c.tower) return null;
  window.game.armedTower = null;
  window.game.world.selected = null;
  return { q, r, x: c.x, y: c.y };
}, selKey);
if (selTarget) {
  await page.touchscreen.tap(canvasBox.x + selTarget.x, canvasBox.y + selTarget.y);
  await page.waitForTimeout(60);
  const got = await page.evaluate(() => {
    const sel = window.game.world.selected;
    return sel ? `${sel.cell.q},${sel.cell.r}` : null;
  });
  assert(got === selKey, `tapping the tower at ${selKey} selected ${got}`);
}

// --- Leaving a mode ---------------------------------------------------------
// Every mode needs a way out that is not "tap some unrelated hex". Drive each
// exit through the DOM the way a player would.
await page.evaluate(() => { window.game.cancelMode(); });
await page.waitForTimeout(60);

const paletteBtn = page.locator('.tower-btn').first();
await paletteBtn.tap();
await page.waitForTimeout(80);
assert(await page.evaluate(() => window.game.armedTower !== null), 'tapping a palette button did not arm it');
await paletteBtn.tap();
await page.waitForTimeout(80);
assert(await page.evaluate(() => window.game.armedTower === null),
  'tapping the armed tower again did not put it away');

// The cancel button clears build mode.
await paletteBtn.tap();
await page.waitForTimeout(80);
assert(await page.evaluate(() => !document.getElementById('mode-cancel').classList.contains('hidden')),
  'no cancel button appeared while a tower was armed');
await page.locator('#mode-cancel').tap();
await page.waitForTimeout(80);
assert(await page.evaluate(() => window.game.armedTower === null), 'the cancel button did not disarm');

// The same button also closes the upgrade/sell view for a placed tower.
await page.evaluate(() => {
  const w = window.game.world;
  window.game.world.selected = w.towers[0] || null;
});
await page.waitForTimeout(80);
const hadSelection = await page.evaluate(() => !!window.game.world.selected);
if (hadSelection) {
  assert(await page.evaluate(() => !document.getElementById('mode-cancel').classList.contains('hidden')),
    'no cancel button appeared while a placed tower was selected');
  await page.locator('#mode-cancel').tap();
  await page.waitForTimeout(80);
  assert(await page.evaluate(() => window.game.world.selected === null),
    'the cancel button did not close the selected tower');
}

// Reset for the wave run.
await page.evaluate(() => {
  const g = window.game, w = g.world;
  w.selected = null; g.armedTower = null;
  for (const c of w.grid.list) if (!w.canPlace('pulse', c)) w.place('pulse', c);
});

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
