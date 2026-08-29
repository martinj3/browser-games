// The DOM heads-up display: score strip, tower palette, selection bar, the
// level menu, and the level-1 tutorial callouts.

import { TOWER_BY_ID } from './data/towers.js';
import { canvases } from './fx/textures.js';
import { PHASE } from './wave.js';


const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(game) {
    this.game = game;
    this.el = {
      score: $('score'), combo: $('combo'), health: $('health'), healthValue: $('health-value'),
      wave: $('wave'), cash: $('cash'), sendNow: $('send-now'), breakTimer: $('break-timer'),
      incoming: $('incoming'), palette: $('palette'), selection: $('selection'),
      selIcon: $('sel-icon'), selName: $('sel-name'), selStats: $('sel-stats'), selBlurb: $('sel-blurb'),
      upgradeBtn: $('upgrade-btn'), upgradeCost: $('upgrade-cost'),
      sellBtn: $('sell-btn'), sellValue: $('sell-value'),
      speedBtn: $('speed-btn'), pauseBtn: $('pause-btn'),
      banner: $('wave-banner'), tutorial: $('tutorial'),
      overlay: $('overlay'), overlayTitle: $('overlay-title'), overlaySubtitle: $('overlay-subtitle'),
      levelList: $('level-list'), overlayActions: $('overlay-actions'),
    };
    this.iconCache = new Map();
    this.towerButtons = [];
    this.lastSelected = null;
    this.bindStaticControls();
  }

  bindStaticControls() {
    const g = this.game;
    this.el.sendNow.addEventListener('click', () => g.sendNextWave());
    this.el.speedBtn.addEventListener('click', () => g.cycleSpeed());
    this.el.pauseBtn.addEventListener('click', () => g.togglePause());
    this.el.upgradeBtn.addEventListener('click', () => g.upgradeSelected());
    this.el.sellBtn.addEventListener('click', () => g.sellSelected());
  }

  /** Reuse the baked neon artwork for the DOM buttons rather than redrawing it. */
  iconFor(key) {
    let url = this.iconCache.get(key);
    if (!url) {
      url = canvases[key] ? canvases[key].toDataURL() : '';
      this.iconCache.set(key, url);
    }
    return url;
  }

  buildPalette(level) {
    const g = this.game;
    this.el.palette.innerHTML = '';
    this.towerButtons = [];
    for (const id of level.towers) {
      const def = TOWER_BY_ID[id];
      const btn = document.createElement('button');
      btn.className = 'tower-btn';
      btn.type = 'button';
      btn.title = `${def.name} — ${def.blurb}`;
      const img = document.createElement('img');
      img.src = this.iconFor('tower_' + def.shape);
      img.alt = def.name;
      img.style.width = img.style.height = 'clamp(30px, 9vw, 44px)';
      img.style.filter = `drop-shadow(0 0 6px ${hex(def.color)})`;
      const price = document.createElement('span');
      price.className = 'price';
      price.textContent = '$' + def.cost;
      btn.append(img, price);
      btn.addEventListener('click', () => g.armTower(id));
      this.el.palette.appendChild(btn);
      this.towerButtons.push({ id, def, btn, price });
    }
  }

  showBanner(text) {
    const b = this.el.banner;
    b.textContent = text;
    b.classList.remove('hidden');
    // Restart the CSS animation.
    b.style.animation = 'none';
    void b.offsetWidth;
    b.style.animation = '';
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => b.classList.add('hidden'), 1600);
  }

  update(world, game) {
    const e = this.el;
    e.score.textContent = String(Math.floor(world.score)).padStart(10, '0');
    const combo = Math.floor(world.combo);
    e.combo.textContent = 'x' + combo;
    e.combo.classList.toggle('hot', combo >= 25);
    e.healthValue.textContent = world.health;
    e.health.classList.toggle('low', world.health <= 5);
    e.wave.textContent = `${Math.max(0, world.director.waveIndex + 1)}/${world.director.totalWaves}`;
    e.cash.textContent = '$' + Math.floor(world.cash);

    const building = world.director.phase === PHASE.BUILD;
    e.sendNow.disabled = !building;
    // Kept terse: the full "SEND NOW (23s +$25)" truncated on a 390px screen.
    e.breakTimer.textContent = building
      ? `${Math.ceil(world.director.breakTimer)}s +$${world.director.earlySendBonus()}`
      : '';
    this.updateIncoming(world);

    e.speedBtn.textContent = game.speed + '×';
    e.pauseBtn.textContent = game.paused ? '▶' : 'II';

    for (const tb of this.towerButtons) {
      tb.btn.classList.toggle('armed', game.armedTower === tb.id);
      tb.btn.classList.toggle('poor', world.cash < tb.def.cost);
    }

    this.updateSelection(world);
  }

  updateIncoming(world) {
    const key = world.director.waveIndex + '|' + world.director.phase;
    if (key === this._incomingKey) return;
    this._incomingKey = key;
    const preview = world.director.previewNext();
    this.el.incoming.innerHTML = '';
    for (const { def, count } of preview.slice(0, 4)) {
      const img = document.createElement('img');
      img.src = this.iconFor('enemy_' + def.shape);
      img.alt = def.name;
      img.title = def.name;
      img.style.filter = `drop-shadow(0 0 5px ${hex(def.color)})`;
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = count;
      this.el.incoming.append(img, n);
    }
  }

  updateSelection(world) {
    const sel = world.selected;
    if (!sel) {
      this.el.selection.classList.add('hidden');
      this.el.palette.classList.remove('hidden');
      this.lastSelected = null;
      return;
    }
    // The selection bar takes the palette's place rather than covering it.
    this.el.selection.classList.remove('hidden');
    this.el.palette.classList.add('hidden');
    if (this.lastSelected !== sel) {
      this.lastSelected = sel;
      const ctx = this.el.selIcon.getContext('2d');
      ctx.clearRect(0, 0, 56, 56);
      const src = canvases['tower_' + sel.def.shape];
      if (src) {
        ctx.save();
        ctx.filter = `drop-shadow(0 0 6px ${hex(sel.def.color)})`;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(src, 0, 0, 56, 56);
        ctx.restore();
      }
      this.el.selBlurb.textContent = sel.def.blurb;
    }
    this.el.selName.textContent = `${sel.def.name}  Lv ${sel.level}${sel.maxed ? ' MAX' : ''}`;
    const dps = (sel.damage / sel.cooldown);
    this.el.selStats.textContent =
      `dmg ${sel.damage.toFixed(0)}  rate ${(1 / sel.cooldown).toFixed(1)}/s  ~${dps.toFixed(0)} dps  range ${sel.rangeHexes.toFixed(1)}`;

    const cost = sel.upgradeCost();
    this.el.upgradeBtn.disabled = sel.maxed || world.cash < cost;
    this.el.upgradeCost.textContent = sel.maxed ? 'MAX' : '$' + cost;
    this.el.sellValue.textContent = '$' + world.sellValue(sel);
  }

  // --- Tutorial -------------------------------------------------------------

  setTutorial(steps) {
    this.tutorialSteps = steps;
    this.tutorialIndex = 0;
    this._shownIndex = -1;
    this._calloutVisible = false;
    clearTimeout(this._calloutTimer);
    this.el.tutorial.innerHTML = '';
    this.el.tutorial.classList.toggle('hidden', !steps || steps.length === 0);
  }

  /** How much vertical room a visible callout needs right now, in CSS px. */
  calloutHeight() {
    const el = this.el.tutorial;
    if (!this.tutorialSteps || el.classList.contains('hidden')) return 0;
    return el.offsetHeight + 10;
  }

  /**
   * Returns true when the callout appeared or disappeared since the last call,
   * so the board can refit. Visibility is tracked across frames rather than
   * within one call, because the auto-dismiss timer fires between frames.
   */
  updateTutorial(world, game) {
    if (!this.tutorialSteps) return false;
    const step = this.tutorialSteps[this.tutorialIndex];
    if (!step) { this.el.tutorial.classList.add('hidden'); return this._visibilityChanged(); }
    if (this._shownIndex !== this.tutorialIndex) {
      this._shownIndex = this.tutorialIndex;
      this.el.tutorial.innerHTML = '';
      const div = document.createElement('div');
      div.className = 'callout';
      div.textContent = step.text;
      this.el.tutorial.appendChild(div);
      this.el.tutorial.classList.remove('hidden');
      // Callouts sit over the top of the board, so they get out of the way on
      // their own even if the player never does what they suggest.
      clearTimeout(this._calloutTimer);
      this._calloutTimer = setTimeout(() => this.el.tutorial.classList.add('hidden'), 9000);
    }
    if (step.done(world, game)) {
      this.tutorialIndex++;
      clearTimeout(this._calloutTimer);
      if (this.tutorialIndex >= this.tutorialSteps.length) this.el.tutorial.classList.add('hidden');
    }
    return this._visibilityChanged();
  }

  _visibilityChanged() {
    const visible = !this.el.tutorial.classList.contains('hidden');
    if (visible === this._calloutVisible) return false;
    this._calloutVisible = visible;
    return true;
  }

  // --- Overlay --------------------------------------------------------------

  showOverlay({ title, subtitle, levels, progress, actions }) {
    const e = this.el;
    e.overlayTitle.textContent = title;
    e.overlaySubtitle.innerHTML = subtitle || '';
    e.levelList.innerHTML = '';
    if (levels) {
      levels.forEach(({ level, index, unlocked, stars, best }) => {
        const btn = document.createElement('button');
        btn.className = 'level-btn' + (unlocked ? '' : ' locked');
        btn.type = 'button';
        btn.disabled = !unlocked;
        btn.innerHTML =
          `<span class="idx">${index + 1}</span>` +
          `<span class="nm">${level.name}</span>` +
          `<span class="best">${best ? String(best).padStart(8, '0') : ''}</span>` +
          `<span class="stars">${unlocked ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '✖'}</span>`;
        btn.addEventListener('click', () => this.game.startLevel(index));
        e.levelList.appendChild(btn);
      });
    }
    e.overlayActions.innerHTML = '';
    for (const a of actions || []) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = a.label;
      btn.addEventListener('click', a.onClick);
      e.overlayActions.appendChild(btn);
    }
    e.overlay.classList.remove('hidden');
  }

  hideOverlay() { this.el.overlay.classList.add('hidden'); }
}

function hex(color) {
  return '#' + color.toString(16).padStart(6, '0');
}

