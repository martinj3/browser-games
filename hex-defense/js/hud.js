// The DOM heads-up display: score strip, tower palette, selection bar, the
// level menu, and the level-1 tutorial callouts.

import { TOWER_BY_ID } from './data/towers.js';
import { canvases } from './fx/textures.js';
import { PHASE } from './wave.js';


const $ = (id) => document.getElementById(id);

/** How long a tutorial callout stays up if the player does not dismiss it. */
const CALLOUT_TIMEOUT = 10000;

export class Hud {
  constructor(game) {
    this.game = game;
    this.el = {
      score: $('score'), combo: $('combo'), health: $('health'), healthValue: $('health-value'),
      wave: $('wave'), cash: $('cash'), sendNow: $('send-now'), breakTimer: $('break-timer'),
      incoming: $('incoming'), palette: $('palette'), selection: $('selection'),
      selIcon: $('sel-icon'), selName: $('sel-name'), selStats: $('sel-stats'), selBlurb: $('sel-blurb'),
      towerInfo: $('tower-info'), towerInfoName: $('tower-info-name'), towerInfoBlurb: $('tower-info-blurb'),
      modeCancel: $('mode-cancel'),
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
    this.el.modeCancel.addEventListener('click', () => g.cancelMode());
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
      // Name and price under every icon: a new player should not have to guess
      // what a glyph means, or hover something that has no hover on a phone.
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = def.short;
      const price = document.createElement('span');
      price.className = 'price';
      price.textContent = '$' + def.cost;
      btn.append(img, label, price);
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
    this.updateTowerInfo(game, world);

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

  /**
   * What the armed tower is and what it does. The row keeps its height either
   * way -- collapsing it would only leave the same gap -- so when nothing is
   * armed it carries a hint instead of sitting blank.
   */
  updateTowerInfo(game, world) {
    // The selection bar covers the same ground for an already-placed tower, so
    // only one of the two is ever up.
    const def = (game.armedTower && !world.selected) ? TOWER_BY_ID[game.armedTower] : null;
    const sel = world.selected;
    const key = def ? 'arm:' + def.id : (sel ? 'sel:' + sel.id + ':' + sel.level : 'idle');
    if (this._infoFor === key) return;
    this._infoFor = key;

    // The row doubles as the exit for whichever mode is active, so there is one
    // obvious way out of both instead of having to guess at an empty hex.
    this.el.modeCancel.classList.toggle('hidden', !def && !sel);
    this.el.towerInfo.classList.toggle('idle', !def && !sel);

    if (def) {
      this.el.towerInfoName.textContent = `${def.name} $${def.cost}`;
      this.el.towerInfoName.style.color = hex(def.color);
      this.el.towerInfoBlurb.textContent = ' — ' + def.blurb;
    } else if (sel) {
      this.el.towerInfoName.textContent = `${sel.def.name} Lv ${sel.level}`;
      this.el.towerInfoName.style.color = hex(sel.def.color);
      this.el.towerInfoBlurb.textContent = sel.maxed
        ? ' — fully upgraded; sell below, or ✕ to close'
        : ' — upgrade or sell below, or ✕ to close';
    } else {
      this.el.towerInfoName.textContent = '';
      this.el.towerInfoBlurb.textContent =
        'Tap a tower below to build · tap one on the board to upgrade or sell';
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
    clearTimeout(this._calloutTimer);
    this.el.tutorial.innerHTML = '';
    this.el.tutorial.classList.toggle('hidden', !steps || steps.length === 0);
  }

  /**
   * Hide the callout currently on screen. The step it belongs to is already
   * marked as shown, so it stays gone; the next step appears when its own
   * trigger fires.
   */
  dismissCallout() {
    clearTimeout(this._calloutTimer);
    this.el.tutorial.classList.add('hidden');
  }

  updateTutorial(world, game) {
    if (!this.tutorialSteps) return;
    const step = this.tutorialSteps[this.tutorialIndex];
    if (!step) { this.el.tutorial.classList.add('hidden'); return; }
    if (this._shownIndex !== this.tutorialIndex) {
      this._shownIndex = this.tutorialIndex;
      this.el.tutorial.innerHTML = '';

      const div = document.createElement('div');
      div.className = 'callout';
      const text = document.createElement('span');
      text.className = 'callout-text';
      text.textContent = step.text;

      // Only this button is interactive. The callout body stays inert, because
      // it floats over the top rows of the board and anything clickable there
      // silently eats taps meant for the hexes underneath.
      const close = document.createElement('button');
      close.className = 'callout-close';
      close.type = 'button';
      close.setAttribute('aria-label', 'Dismiss');
      close.textContent = '\u2715';
      close.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.dismissCallout();
      });

      div.append(text, close);
      this.el.tutorial.appendChild(div);
      this.el.tutorial.classList.remove('hidden');
      // Callouts also get out of the way on their own, in case the player never
      // does the thing they suggest and never reaches for the button.
      clearTimeout(this._calloutTimer);
      this._calloutTimer = setTimeout(() => this.dismissCallout(), CALLOUT_TIMEOUT);
    }
    if (step.done(world, game)) {
      this.tutorialIndex++;
      clearTimeout(this._calloutTimer);
      if (this.tutorialIndex >= this.tutorialSteps.length) this.el.tutorial.classList.add('hidden');
    }
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

