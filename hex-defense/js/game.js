// The game state machine and the main loop.
//
// The loop is a fixed 60 Hz accumulator with render interpolation. That makes
// behaviour identical on a 60 Hz phone and a 144 Hz monitor, and it makes the
// fast-forward button nothing more than "run N sim steps per frame" instead of
// a time-scale factor threaded through every system.

import { World, RESULT } from './world.js';
import { Renderer } from './fx/renderer.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { LEVELS } from './data/levels/index.js';
import { TOWER_BY_ID } from './data/towers.js';
import { PHASE } from './wave.js';
import { TICK, MAX_FRAME_TIME, SPEEDS } from './constants.js';
import * as save from './save.js';
import { SQRT3 } from './hex.js';

export const MODE = { MENU: 'menu', PLAYING: 'playing', OVER: 'over' };

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new Renderer();
    this.world = null;
    this.mode = MODE.MENU;
    this.speedIndex = 0;
    this.paused = false;
    this.armedTower = null;
    this.accumulator = 0;
    this.lastTime = 0;
    this.progress = save.load();
    this.levelIndex = 0;
  }

  get speed() { return SPEEDS[this.speedIndex]; }

  async init() {
    await this.renderer.init(this.canvas);
    this.hud = new Hud(this);
    this.input = new Input(this.canvas, this);
    window.addEventListener('resize', () => this.resize());
    // iOS fires resize late on rotation, so settle again shortly after.
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    this.resize();
    this.showMenu();
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  resize() {
    const wrap = this.canvas.parentElement;
    const w = Math.max(1, wrap.clientWidth);
    const h = Math.max(1, wrap.clientHeight);
    this.renderer.resize(w, h);
    if (this.world) {
      // Leave room for the top HUD strip so the first row of hexes is never
      // hidden behind the score readout. Tutorial callouts deliberately do NOT
      // reserve space: they float over the board and dismiss themselves. Giving
      // them their own band made the whole board jump the moment one appeared
      // or expired, which moved cells out from under the player's finger
      // mid-placement.
      this.world.relayout(w, h, Math.max(6, w * 0.02), Math.min(46, h * 0.06));
      this.renderer.drawBoard(this.world);
    }
  }

  // --- Level lifecycle ------------------------------------------------------

  showMenu() {
    this.mode = MODE.MENU;
    this.world = null;
    document.body.classList.add('at-menu');
    this.hud.showOverlay({
      title: 'HEXSWARM',
      subtitle: 'Build a maze out of your own towers.<br>Longer path, more time to shoot — but you may never seal the exit.',
      levels: LEVELS.map((level, index) => ({
        level, index,
        unlocked: save.isUnlocked(this.progress, LEVELS, index),
        stars: this.progress.completed[level.id] || 0,
        best: this.progress.best[level.id] || 0,
      })),
      actions: [],
    });
  }

  startLevel(index) {
    this.levelIndex = index;
    const level = LEVELS[index];
    this.world = new World(level, index);
    this.mode = MODE.PLAYING;
    this.paused = false;
    this.speedIndex = 0;
    // Deliberately nothing armed: the first tutorial line tells the player to
    // pick a tower, and pre-arming one made following that instruction toggle
    // it back off again.
    this.armedTower = null;
    this.accumulator = 0;

    document.body.classList.remove('at-menu');
    this.renderer.clearLevel();
    this.hud.hideOverlay();
    this.hud.buildPalette(level);
    this.hud.setTutorial(index === 0 ? TUTORIAL : null);
    this.resize();   // after setTutorial: the callout band changes the board fit
    this.hud.showBanner(level.name.toUpperCase());
  }

  finishLevel() {
    const world = this.world;
    const level = world.level;
    this.mode = MODE.OVER;
    const won = world.result === RESULT.WON;
    let stars = 0;
    if (won) {
      stars = save.starsFor(world.health, level.health);
      save.recordWin(this.progress, level.id, stars, world.score);
    }
    const nextIndex = this.levelIndex + 1;
    const actions = [];
    if (won && nextIndex < LEVELS.length) {
      actions.push({ label: 'NEXT LEVEL', onClick: () => this.startLevel(nextIndex) });
    }
    actions.push({ label: won ? 'REPLAY' : 'RETRY', onClick: () => this.startLevel(this.levelIndex) });
    actions.push({ label: 'LEVELS', onClick: () => this.showMenu() });

    this.hud.showOverlay({
      title: won ? 'LEVEL CLEAR' : 'OVERRUN',
      subtitle: won
        ? `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}<br>Score ${world.score.toLocaleString()} — ${world.health}/${level.health} health — ${world.kills} kills`
        : `You reached wave ${world.director.waveIndex + 1} of ${world.director.totalWaves}.<br>Score ${world.score.toLocaleString()} — ${world.kills} kills`,
      levels: null,
      actions,
    });
  }

  // --- Controls -------------------------------------------------------------

  /**
   * Picking a tower always arms it. It used to toggle, which meant tapping the
   * tower you already had armed silently disarmed it and building stopped
   * working for no visible reason. Deselect with Esc, or by tapping a tower
   * already on the board.
   */
  armTower(id) {
    if (this.mode !== MODE.PLAYING) return;
    this.armedTower = id;
    this.deselect();
    this.renderer.ghost = null;
  }

  disarm() { this.armedTower = null; this.renderer.ghost = null; }
  deselect() { if (this.world) this.world.selected = null; }

  cycleSpeed() { this.speedIndex = (this.speedIndex + 1) % SPEEDS.length; }
  togglePause() { if (this.mode === MODE.PLAYING) this.paused = !this.paused; }

  sendNextWave() {
    if (this.mode !== MODE.PLAYING || !this.world) return;
    if (this.world.director.phase !== PHASE.BUILD) return;
    const bonus = this.world.director.startNextWave(true);
    this.world.cash += bonus;
    this.hud.showBanner(`WAVE ${this.world.director.waveIndex + 1}`);
  }

  upgradeSelected() {
    const w = this.world;
    if (!w || !w.selected) return;
    w.upgrade(w.selected);
  }

  sellSelected() {
    const w = this.world;
    if (!w || !w.selected) return;
    w.sell(w.selected);
    w.selected = null;
  }

  // --- Pointer --------------------------------------------------------------

  cellAt(x, y) {
    return this.world ? this.world.grid.cellAtPixel(x, y) : null;
  }

  onPointerDown(x, y) {
    if (this.mode !== MODE.PLAYING) return;
    const cell = this.cellAt(x, y);
    if (this.armedTower && cell && !cell.tower) {
      this.updateGhost(cell);
      return;
    }
    // Not placing: select or deselect a tower.
    if (cell && cell.tower) {
      this.world.selected = cell.tower;
      this.armedTower = null;
      this.renderer.ghost = null;
    } else {
      this.world.selected = null;
    }
  }

  onPointerDrag(x, y) {
    if (this.mode !== MODE.PLAYING) return;
    if (!this.armedTower) return;
    const cell = this.cellAt(x, y);
    this.updateGhost(cell);
  }

  onPointerHover(x, y) {
    if (this.mode !== MODE.PLAYING) { this.renderer.hover = null; return; }
    const cell = this.cellAt(x, y);
    this.renderer.hover = cell;
    if (this.armedTower) this.updateGhost(cell);
  }

  onPointerUp(x, y) {
    if (this.mode !== MODE.PLAYING) return;
    if (!this.armedTower) return;
    const cell = this.cellAt(x, y);
    const ghost = this.renderer.ghost;
    if (cell && ghost && ghost.cell === cell && ghost.ok) {
      const tower = this.world.place(this.armedTower, cell);
      if (tower) {
        this.placedAny = true;
        // Stay armed so a run of walls can be laid down in one go, but drop the
        // arming as soon as the next one is unaffordable.
        if (this.world.cash < TOWER_BY_ID[this.armedTower].cost) this.armedTower = null;
      }
    }
    this.renderer.ghost = null;
  }

  onPointerCancel() { this.renderer.ghost = null; }

  /**
   * Recompute the placement preview. The block-validation runs live on every
   * move so the ghost can turn red *before* the player commits, rather than the
   * placement silently failing.
   */
  updateGhost(cell) {
    if (!cell || !this.armedTower) { this.renderer.ghost = null; return; }
    const reason = this.world.canPlace(this.armedTower, cell);
    const def = TOWER_BY_ID[this.armedTower];
    this.renderer.ghost = {
      cell, ok: !reason, reason,
      rangePx: def.range * SQRT3 * this.world.grid.size,
    };
  }

  // --- Loop -----------------------------------------------------------------

  frame = (now) => {
    requestAnimationFrame(this.frame);
    const realDt = Math.min((now - this.lastTime) / 1000, MAX_FRAME_TIME);
    this.lastTime = now;
    this.renderer.probePerformance((now - (this._prevNow || now)));
    this._prevNow = now;

    const world = this.world;
    if (!world) { this.renderer.app.render(); return; }

    if (this.mode === MODE.PLAYING && !this.paused) {
      this.accumulator += realDt * this.speed;
      let steps = 0;
      // Cap the catch-up so a stall cannot spiral into an unbounded loop.
      while (this.accumulator >= TICK && steps < 12) {
        world.step(TICK);
        this.accumulator -= TICK;
        steps++;
        if (world.result !== RESULT.PLAYING) break;
      }
      if (steps >= 12) this.accumulator = 0;
    }

    if (this.renderer.boardDirty) {
      this.renderer.drawBoard(world);
      this.renderer.boardDirty = false;
    }

    const alpha = this.paused ? 1 : Math.min(1, this.accumulator / TICK);
    // The route preview only shows while building -- during a wave the enemies
    // themselves show you where the path goes, and the board is busy enough.
    const showRoute = world.director.phase === PHASE.BUILD || this.paused;
    this.renderer.render(world, realDt, alpha, showRoute);
    this.hud.update(world, this);
    this.hud.updateTutorial(world, this);
    this.renderer.app.render();

    if (this.mode === MODE.PLAYING && world.result !== RESULT.PLAYING) this.finishLevel();
  };
}

/** Level-1 callouts, advanced by watching the actual game state. */
const TUTORIAL = [
  {
    text: 'Pick a tower from the tray below — its name and what it does show just above it — then tap a hex to build. Towers block the path, and the longer the maze, the longer enemies stay under fire.',
    done: (w) => w.towers.length >= 1,
  },
  {
    text: 'The orange trail is the route enemies will take. You can never seal the exit off completely — an illegal spot shows red.',
    done: (w) => w.towers.length >= 4,
  },
  {
    text: 'Tap a tower you have placed to select it. The green circle is its range. Upgrade it, or sell it back for half.',
    done: (w) => !!w.selected,
  },
  {
    text: 'SEND NOW starts the next wave early and pays a cash bonus for the time you skipped.',
    done: (w) => w.director.waveIndex >= 2,
  },
];
