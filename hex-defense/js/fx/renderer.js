// Everything that draws.
//
// The sim never touches Pixi; it leaves plain event objects in world.events and
// this drains them. Sprites are synced immediate-mode from pools each frame
// rather than being owned by entities, which keeps entity code free of view
// bookkeeping and makes spawning and reaping allocation-free.

import { Application, Container, Graphics, Sprite } from 'pixi.js';
import { buildTextures, textures } from './textures.js';
import { Particles } from './particles.js';
import { PostFX, pickQuality } from './postfx.js';
import { TERRAIN } from '../grid.js';
import { COLORS, QUALITY, MAX_SHAKE } from '../constants.js';
import { corners, DIRECTIONS } from '../hex.js';
import { PROJ } from '../entities/projectile.js';

export class Renderer {
  constructor() {
    this.app = new Application();
    this.transients = [];      // beams, tracers, chains, rings
    this.enemySprites = [];
    this.enemyGlows = [];
    this.towerSprites = [];
    this.towerGlows = [];
    this.projSprites = [];
    this.hover = null;
    this.ghost = null;         // { towerId, cell, ok }
    this.frameCount = 0;
    this.probeStart = 0;
    this.probeFrames = 0;
  }

  async init(canvas) {
    await this.app.init({
      canvas,
      background: COLORS.bg,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      powerPreference: 'high-performance',
      preference: 'webgl',
    });
    buildTextures();

    // Start optimistic and step down after a short frame-time probe.
    this.quality = QUALITY.HIGH;
    this.probeStart = performance.now();

    const stage = this.app.stage;
    this.worldRoot = new Container();       // everything that shakes and blooms
    this.boardLayer = new Graphics();
    this.decalLayer = new Graphics();       // range rings, ghost, highlights
    this.towerLayer = new Container();
    this.enemyLayer = new Container();
    this.projLayer = new Container();
    this.fxLayer = new Graphics();
    this.overlayLayer = new Graphics();     // health bars, level pips
    this.particles = new Particles(this.quality.particles);

    this.worldRoot.addChild(
      this.boardLayer, this.decalLayer, this.towerLayer, this.enemyLayer,
      this.projLayer, this.fxLayer, this.particles.container, this.overlayLayer,
    );
    stage.addChild(this.worldRoot);

    this.postfx = new PostFX(this.quality);
    this.worldRoot.filters = this.postfx.filters;
    return this;
  }

  resize(width, height) {
    this.app.renderer.resize(width, height);
  }

  get width() { return this.app.renderer.width / this.app.renderer.resolution; }
  get height() { return this.app.renderer.height / this.app.renderer.resolution; }

  /**
   * Drop a quality tier if the first couple of seconds ran slowly. Measuring
   * beats guessing from a user-agent string, and it catches a hot phone as well
   * as an old one.
   */
  probePerformance(frameMs) {
    if (this.probeFrames < 0) return;
    this.probeFrames++;
    if (this.probeFrames === 1) this.probeAccum = 0;
    this.probeAccum += frameMs;
    if (this.probeFrames >= 90) {
      const avg = this.probeAccum / this.probeFrames;
      const tier = pickQuality(avg, QUALITY);
      this.probeFrames = -1;
      if (tier !== this.quality) this.applyQuality(tier);
    }
  }

  applyQuality(tier) {
    this.quality = tier;
    this.worldRoot.filters = [];
    this.postfx = new PostFX(tier);
    this.worldRoot.filters = this.postfx.filters;
    // The particle pool is fixed-size, so a tier change rebuilds it.
    this.worldRoot.removeChild(this.particles.container);
    this.particles.container.destroy();
    this.particles = new Particles(tier.particles);
    this.worldRoot.addChildAt(this.particles.container, this.worldRoot.children.length - 1);
  }

  // --- Board ----------------------------------------------------------------

  /** Redraw the static lattice. Only called on resize or when a tower changes. */
  drawBoard(world) {
    const g = this.boardLayer;
    const grid = world.grid;
    g.clear();
    const pts = corners(grid.size * 0.94);

    for (const cell of grid.list) {
      if (cell.terrain === TERRAIN.BLOCKED) {
        // Voids read as holes in the lattice: a faint outline, nothing inside.
        this.hexPath(g, cell, pts);
        g.fill({ color: 0x000000, alpha: 0.85 });
        g.stroke({ width: 1, color: 0x123033, alpha: 0.5 });
        continue;
      }

      let fill = COLORS.gridFill, fillAlpha = 0.55;
      let line = COLORS.gridLine, lineAlpha = 0.75, lineWidth = 1.5;

      switch (cell.terrain) {
        case TERRAIN.PATH_ONLY: fill = 0x010b0e; fillAlpha = 0.9; lineAlpha = 0.28; break;
        case TERRAIN.SPAWN: line = COLORS.spawn; lineAlpha = 1; lineWidth = 3.5; fill = 0x0a4a30; fillAlpha = 0.9; break;
        case TERRAIN.EXIT: line = COLORS.exit; lineAlpha = 1; lineWidth = 3.5; fill = 0x50081c; fillAlpha = 0.9; break;
        case TERRAIN.PAD_POWER: line = COLORS.padPower; lineAlpha = 0.95; lineWidth = 2; fill = 0x2a1603; break;
        case TERRAIN.PAD_FOCUS: line = COLORS.padFocus; lineAlpha = 0.95; lineWidth = 2; fill = 0x1a0730; break;
        default: break;
      }
      // Cells the enemies can actually reach glow a touch warmer, which makes
      // the shape of the current maze readable at a glance.
      if (cell.tower === null && cell.dist !== Infinity && cell.terrain === TERRAIN.BUILDABLE) {
        fill = COLORS.gridBuildable; fillAlpha = 0.45;
      }

      this.hexPath(g, cell, pts);
      g.fill({ color: fill, alpha: fillAlpha });
      g.stroke({ width: lineWidth, color: line, alpha: lineAlpha });
    }
    this.routes = this.traceRoutes(world);
  }

  /**
   * The path enemies will actually walk, cached whenever the board changes.
   * Showing it during the build phase is what makes mazing legible: you can see
   * your maze getting longer as you build it, which is the whole point.
   */
  traceRoutes(world) {
    const routes = [];
    for (const spawn of world.grid.spawns) {
      const pts = [];
      let cell = spawn.cell;
      for (let guard = 0; guard < 600; guard++) {
        pts.push(cell.x, cell.y);
        const dir = world.pathfield.chooseDir(cell, 0);
        if (dir < 0) break;
        const d = DIRECTIONS[dir];
        const next = world.grid.at(cell.q + d.q, cell.r + d.r);
        if (!next) break;
        cell = next;
      }
      routes.push(pts);
    }
    return routes;
  }

  hexPath(g, cell, pts) {
    g.moveTo(cell.x + pts[0].x, cell.y + pts[0].y);
    for (let i = 1; i < 6; i++) g.lineTo(cell.x + pts[i].x, cell.y + pts[i].y);
    g.closePath();
  }

  // --- Frame ----------------------------------------------------------------

  /** `alpha` is the interpolation factor between the last two sim steps. */
  render(world, dt, alpha, showRoute) {
    this.frameCount++;
    this.drainEvents(world);
    this.particles.update(dt);
    this.postfx.update(dt, world.intensity);

    this.syncEnemies(world, alpha);
    this.syncTowers(world);
    this.syncProjectiles(world, alpha);
    this.drawTransients(dt);
    this.drawDecals(world, showRoute);
    this.drawOverlay(world);

    // Screen shake. Applied to the world root only, so the DOM HUD stays put.
    const s = world.shake;
    if (s > 0.001) {
      const mag = s * s * MAX_SHAKE;
      this.worldRoot.x = (Math.random() - 0.5) * mag;
      this.worldRoot.y = (Math.random() - 0.5) * mag;
    } else if (this.worldRoot.x !== 0) {
      this.worldRoot.x = 0; this.worldRoot.y = 0;
    }
  }

  syncEnemies(world, alpha) {
    const layer = this.enemyLayer;
    const size = world.grid.size;
    let i = 0;
    for (const e of world.enemies) {
      if (!e.alive) continue;
      const x = e.prevX + (e.x - e.prevX) * alpha;
      const y = e.prevY + (e.y - e.prevY) * alpha;

      let glow = this.enemyGlows[i];
      let sp = this.enemySprites[i];
      if (!sp) {
        glow = new Sprite(textures.glow);
        glow.anchor.set(0.5); glow.blendMode = 'add';
        sp = new Sprite(textures.glow);
        sp.anchor.set(0.5); sp.blendMode = 'add';
        layer.addChild(glow); layer.addChild(sp);
        this.enemyGlows[i] = glow; this.enemySprites[i] = sp;
      }
      const def = e.def;
      const r = def.radius * size;
      const phasedOut = e.phased;

      glow.visible = true;
      glow.texture = textures.glow;
      glow.position.set(x, y);
      glow.tint = def.color;
      glow.alpha = (phasedOut ? 0.1 : 0.30) + (e.hitFlash > 0 ? 0.45 : 0);
      glow.scale.set((r * 3.0) / textures.glow.width);

      sp.visible = true;
      sp.texture = textures['enemy_' + def.shape] || textures.glow;
      sp.position.set(x, y);
      sp.rotation = def.shape === 'pac'
        ? Math.atan2(e.y - e.prevY, e.x - e.prevX) || 0
        : e.spin * (def.shape === 'star' || def.shape === 'phase' ? 1 : 0.25);
      sp.tint = e.hitFlash > 0 ? 0xffffff : def.color;
      sp.alpha = phasedOut ? 0.25 : 1;
      sp.scale.set((r * 2.9) / sp.texture.width);
      i++;
    }
    for (let j = i; j < this.enemySprites.length; j++) {
      this.enemySprites[j].visible = false;
      this.enemyGlows[j].visible = false;
    }
    this.liveEnemySprites = i;
  }

  syncTowers(world) {
    const layer = this.towerLayer;
    const size = world.grid.size;
    let i = 0;
    for (const t of world.towers) {
      let glow = this.towerGlows[i];
      let sp = this.towerSprites[i];
      if (!sp) {
        glow = new Sprite(textures.glow);
        glow.anchor.set(0.5); glow.blendMode = 'add';
        sp = new Sprite(textures.glow);
        sp.anchor.set(0.5); sp.blendMode = 'add';
        layer.addChild(glow); layer.addChild(sp);
        this.towerGlows[i] = glow; this.towerSprites[i] = sp;
      }
      // Pop-in on build, and a kick backwards on each shot.
      const pop = 1 + t.buildAnim * 0.9;
      const recoil = 1 - t.recoil * 0.12;
      const color = t.def.rainbow
        ? hsvTint((this.frameCount * 0.01 + t.id * 0.3) % 1)
        : t.def.color;

      glow.visible = true;
      glow.texture = textures.glow;
      glow.position.set(t.x, t.y);
      glow.tint = color;
      glow.alpha = 0.17 + t.level * 0.04 + t.recoil * 0.3;
      glow.scale.set((size * 2.0 * pop) / textures.glow.width);

      sp.visible = true;
      sp.texture = textures['tower_' + t.def.shape] || textures.glow;
      sp.position.set(t.x, t.y);
      sp.tint = color;
      sp.alpha = 1;
      sp.rotation = t.def.targeting === null ? t.spin * 0.6 : t.angle;
      sp.scale.set((size * 1.55 * pop * recoil) / sp.texture.width);
      i++;
    }
    for (let j = i; j < this.towerSprites.length; j++) {
      this.towerSprites[j].visible = false;
      this.towerGlows[j].visible = false;
    }
  }

  syncProjectiles(world, alpha) {
    const layer = this.projLayer;
    const size = world.grid.size;
    let i = 0;
    for (const p of world.projectiles) {
      let sp = this.projSprites[i];
      if (!sp) {
        sp = new Sprite(textures.spark);
        sp.anchor.set(0.5); sp.blendMode = 'add';
        layer.addChild(sp);
        this.projSprites[i] = sp;
      }
      const x = p.prevX + (p.x - p.prevX) * alpha;
      const y = p.prevY + (p.y - p.prevY) * alpha;
      sp.visible = true;
      sp.position.set(x, y);
      sp.tint = p.rainbow ? hsvTint((this.frameCount * 0.02 + i * 0.2) % 1) : p.color;
      if (p.kind === PROJ.SHELL) {
        sp.texture = textures.spark;
        sp.rotation = 0;
        sp.scale.set((size * 0.65) / sp.texture.width);
      } else {
        sp.texture = textures.shard;
        sp.rotation = Math.atan2(p.vy, p.vx);
        sp.scale.set((size * 0.9) / sp.texture.width);
      }
      i++;
    }
    for (let j = i; j < this.projSprites.length; j++) this.projSprites[j].visible = false;
  }

  // --- Transient beams and rings --------------------------------------------

  drawTransients(dt) {
    const g = this.fxLayer;
    g.clear();
    let w = 0;
    for (let i = 0; i < this.transients.length; i++) {
      const t = this.transients[i];
      t.life -= dt;
      if (t.life <= 0) continue;
      this.transients[w++] = t;
      const k = t.life / t.maxLife;

      switch (t.kind) {
        case 'beam': {
          // Draw the beam three times at falling width and rising brightness --
          // a cheap way to get a hot white core inside a coloured sheath.
          const x2 = t.x + Math.cos(t.angle) * t.length;
          const y2 = t.y + Math.sin(t.angle) * t.length;
          for (const [mult, alphaMult] of [[3.2, 0.22], [1.6, 0.5], [0.55, 1]]) {
            g.moveTo(t.x, t.y).lineTo(x2, y2);
            g.stroke({ width: t.width * mult * k, color: mult < 1 ? 0xffffff : t.color, alpha: k * alphaMult });
          }
          break;
        }
        case 'tracer': {
          g.moveTo(t.x, t.y).lineTo(t.x2, t.y2);
          g.stroke({ width: 3.2 * k, color: t.color, alpha: k * 0.9 });
          g.moveTo(t.x, t.y).lineTo(t.x2, t.y2);
          g.stroke({ width: 1.2 * k, color: 0xffffff, alpha: k });
          break;
        }
        case 'chain': {
          const p = t.points;
          for (const [width, color, a] of [[5 * k, t.color, 0.5], [1.8 * k, 0xffffff, 1]]) {
            g.moveTo(p[0], p[1]);
            for (let n = 2; n < p.length; n += 2) {
              // Jitter the mid-points so the arc crackles instead of being a
              // set of straight segments.
              const jx = (Math.random() - 0.5) * 10 * k;
              const jy = (Math.random() - 0.5) * 10 * k;
              g.lineTo(p[n] + jx, p[n + 1] + jy);
            }
            g.stroke({ width, color, alpha: k * a });
          }
          break;
        }
        case 'ring': {
          const r = t.r * (1.05 - k * 0.75);
          g.circle(t.x, t.y, r);
          g.stroke({ width: 3.5 * k + 1, color: t.color, alpha: k * 0.85 });
          g.circle(t.x, t.y, r * 0.82);
          g.stroke({ width: 1.5 * k, color: 0xffffff, alpha: k * 0.6 });
          break;
        }
        case 'blast': {
          const r = t.r * (1.6 - k * 0.6);
          g.circle(t.x, t.y, r);
          g.stroke({ width: 6 * k, color: t.color, alpha: k * 0.8 });
          break;
        }
        default: break;
      }
    }
    this.transients.length = w;
  }

  // --- Decals: range rings, ghost, selection --------------------------------

  drawDecals(world, showRoute) {
    const g = this.decalLayer;
    g.clear();
    const grid = world.grid;
    const pts = corners(grid.size * 0.94);
    const t = this.frameCount * 0.03;

    // Breathing portal markers, so the entrances and the exit are never lost in
    // a busy board.
    for (const s of grid.spawns) {
      const pulse = 0.55 + 0.45 * Math.sin(t * 2 + s.q);
      g.circle(s.cell.x, s.cell.y, grid.size * (0.45 + pulse * 0.28));
      g.stroke({ width: 2, color: COLORS.spawn, alpha: 0.35 + pulse * 0.5 });
    }
    for (const ex of grid.exits) {
      const pulse = 0.55 + 0.45 * Math.sin(t * 2 + Math.PI);
      g.circle(ex.x, ex.y, grid.size * (0.45 + pulse * 0.28));
      g.stroke({ width: 2, color: COLORS.exit, alpha: 0.35 + pulse * 0.5 });
    }

    if (showRoute && this.routes) {
      for (const pts2 of this.routes) {
        for (let i = 0; i < pts2.length - 2; i += 2) {
          g.moveTo(pts2[i], pts2[i + 1]).lineTo(pts2[i + 2], pts2[i + 3]);
        }
        g.stroke({ width: Math.max(1.5, grid.size * 0.06), color: 0xff6a4d, alpha: 0.28 });
        // Dots crawling toward the exit show which way the route runs.
        const segs = (pts2.length / 2) - 1;
        for (let k = 0; k < segs; k += 1) {
          const f = ((t * 0.55 + k * 0.5) % 1);
          const i = k * 2;
          const x = pts2[i] + (pts2[i + 2] - pts2[i]) * f;
          const y = pts2[i + 1] + (pts2[i + 3] - pts2[i + 1]) * f;
          g.circle(x, y, grid.size * 0.09);
          g.fill({ color: 0xff8a6d, alpha: 0.55 });
        }
      }
    }

    if (this.hover && !this.ghost) {
      this.hexPath(g, this.hover, pts);
      g.stroke({ width: 2, color: COLORS.range, alpha: 0.5 });
    }

    const sel = world.selected;
    if (sel) {
      g.circle(sel.x, sel.y, sel.rangePx(grid));
      g.stroke({ width: 2, color: COLORS.range, alpha: 0.85 });
      g.circle(sel.x, sel.y, sel.rangePx(grid));
      g.fill({ color: COLORS.range, alpha: 0.045 });
      if (sel.minRangeHexes > 0) {
        // The mortar's dead zone is part of its identity, so show it.
        g.circle(sel.x, sel.y, sel.minRangePx(grid));
        g.stroke({ width: 1.5, color: COLORS.exit, alpha: 0.6 });
      }
      this.hexPath(g, sel.cell, pts);
      g.stroke({ width: 2.5, color: COLORS.white, alpha: 0.7 });
    }

    const ghost = this.ghost;
    if (ghost && ghost.cell) {
      const color = ghost.ok ? COLORS.ghostOk : COLORS.ghostBad;
      this.hexPath(g, ghost.cell, pts);
      g.fill({ color, alpha: 0.16 });
      g.stroke({ width: 2.5, color, alpha: 0.95 });
      g.circle(ghost.cell.x, ghost.cell.y, ghost.rangePx);
      g.stroke({ width: 2, color, alpha: 0.6 });
      if (!ghost.ok && ghost.reason === 'would seal the exit') {
        // Pulse the portals that would be cut off, so the refusal explains
        // itself rather than just being a red hex.
        const pulse = 0.5 + 0.5 * Math.sin(this.frameCount * 0.25);
        for (const s of grid.spawns) {
          this.hexPath(g, s.cell, pts);
          g.stroke({ width: 3, color: COLORS.ghostBad, alpha: 0.35 + pulse * 0.55 });
        }
        this.hexPath(g, grid.exits[0], pts);
        g.stroke({ width: 3, color: COLORS.ghostBad, alpha: 0.35 + pulse * 0.55 });
      }
    }
  }

  drawOverlay(world) {
    const g = this.overlayLayer;
    g.clear();
    const size = world.grid.size;

    for (const e of world.enemies) {
      if (!e.alive) continue;
      const hpFrac = e.hp / e.maxHp;
      const shieldFrac = e.shieldMax > 0 ? e.shield / e.shieldMax : 0;
      if (hpFrac >= 0.999 && shieldFrac <= 0) continue;
      const w = size * (e.def.boss ? 1.5 : 0.8);
      const x = e.x - w / 2;
      const y = e.y - e.def.radius * size - size * 0.28;
      g.rect(x, y, w, 3).fill({ color: 0x000000, alpha: 0.55 });
      if (hpFrac > 0) {
        const color = hpFrac > 0.5 ? 0x5cff8f : hpFrac > 0.22 ? 0xffd23d : 0xff3355;
        g.rect(x, y, w * hpFrac, 3).fill({ color, alpha: 0.95 });
      }
      if (shieldFrac > 0) {
        g.rect(x, y - 3.5, w * shieldFrac, 2).fill({ color: 0x6fd0ff, alpha: 0.95 });
      }
    }

    // Upgrade pips under each tower, so investment is visible on the board.
    for (const t of world.towers) {
      if (t.level <= 1) continue;
      const r = size * 0.16;
      const spacing = size * 0.2;
      const total = (t.level - 1) * spacing;
      for (let i = 0; i < t.level - 1; i++) {
        g.circle(t.x - total / 2 + i * spacing, t.y + size * 0.62, r * 0.42);
        g.fill({ color: 0xffffff, alpha: 0.6 });
      }
    }
  }

  // --- Sim events -> effects -------------------------------------------------

  drainEvents(world) {
    const P = this.particles;
    for (const ev of world.events) {
      switch (ev.type) {
        case 'tracer':
          this.transients.push({ kind: 'tracer', x: ev.x1, y: ev.y1, x2: ev.x2, y2: ev.y2, color: ev.color, life: 0.09, maxLife: 0.09 });
          break;
        case 'beam':
          this.transients.push({ kind: 'beam', x: ev.x, y: ev.y, angle: ev.angle, length: ev.length, width: ev.width, color: ev.color, life: 0.22, maxLife: 0.22 });
          world.addShake(2.5);
          break;
        case 'chain':
          this.transients.push({ kind: 'chain', points: ev.points, color: ev.color, life: 0.16, maxLife: 0.16 });
          break;
        case 'ring':
          this.transients.push({ kind: 'ring', x: ev.x, y: ev.y, r: ev.r, color: ev.color, life: 0.3, maxLife: 0.3 });
          break;
        case 'impact':
          P.burst(ev.x, ev.y, Math.round(3 + ev.power * 5), {
            color: ev.color, speed: 130 * ev.power, size: 0.35, life: 0.28,
            texture: textures.spark, drag: 5,
          });
          break;
        case 'muzzle':
          P.emit({
            x: ev.x, y: ev.y, color: ev.color, size: 0.9, life: 0.14,
            texture: textures.spark, vx: Math.cos(ev.angle) * 90, vy: Math.sin(ev.angle) * 90, drag: 8,
          });
          break;
        case 'shieldHit':
          this.transients.push({ kind: 'ring', x: ev.x, y: ev.y, r: ev.r * 1.6, color: 0x6fd0ff, life: 0.18, maxLife: 0.18 });
          break;
        case 'death':
          this.deathBurst(world, ev);
          break;
        case 'explosion':
          this.explosion(world, ev);
          break;
        case 'leak':
          P.burst(ev.x, ev.y, 26, { color: 0xff2f4a, speed: 320, size: 0.55, life: 0.6, texture: textures.shard, stretch: 3, drag: 2.4 });
          this.transients.push({ kind: 'blast', x: ev.x, y: ev.y, r: world.grid.size * 1.6, color: 0xff2f4a, life: 0.4, maxLife: 0.4 });
          break;
        case 'build':
          this.transients.push({ kind: 'ring', x: ev.x, y: ev.y, r: world.grid.size * 2.2, color: ev.color, life: 0.35, maxLife: 0.35 });
          P.burst(ev.x, ev.y, 14, { color: ev.color, speed: 150, size: 0.4, life: 0.4, texture: textures.spark, drag: 4 });
          this.boardDirty = true;
          break;
        case 'sell':
          P.burst(ev.x, ev.y, 12, { color: 0xffe14d, speed: 120, size: 0.35, life: 0.35, texture: textures.spark, drag: 4 });
          this.boardDirty = true;
          break;
        case 'towerLost':
          P.burst(ev.x, ev.y, 34, { color: ev.color, speed: 340, size: 0.6, life: 0.7, texture: textures.shard, stretch: 3, drag: 2 });
          this.transients.push({ kind: 'blast', x: ev.x, y: ev.y, r: world.grid.size * 2, color: 0xff3355, life: 0.5, maxLife: 0.5 });
          this.postfx.shockwave(ev.x, ev.y, 0.7);
          this.boardDirty = true;
          break;
        case 'enrage':
          this.transients.push({ kind: 'ring', x: ev.x, y: ev.y, r: world.grid.size * 1.8, color: 0xff3355, life: 0.5, maxLife: 0.5 });
          break;
        default: break;
      }
    }
    world.events.length = 0;
  }

  deathBurst(world, ev) {
    const P = this.particles;
    const big = ev.boss;
    P.burst(ev.x, ev.y, big ? 90 : 16, {
      color: ev.color, speed: big ? 520 : 240, size: big ? 0.9 : 0.45,
      life: big ? 1.1 : 0.45, texture: textures.shard, stretch: 3.2, drag: 2.6,
    });
    P.burst(ev.x, ev.y, big ? 50 : 8, {
      color: 0xffffff, speed: big ? 380 : 170, size: big ? 0.8 : 0.4,
      life: big ? 0.8 : 0.3, texture: textures.spark, drag: 4,
    });
    this.transients.push({
      kind: 'blast', x: ev.x, y: ev.y, r: ev.radius * (big ? 4 : 1.5),
      color: ev.color, life: big ? 0.7 : 0.28, maxLife: big ? 0.7 : 0.28,
    });
    if (big) this.postfx.shockwave(ev.x, ev.y, 1.4);
  }

  explosion(world, ev) {
    const P = this.particles;
    P.burst(ev.x, ev.y, 30, {
      color: ev.color, speed: 380, size: 0.7, life: 0.55,
      texture: textures.shard, stretch: 2.6, drag: 3,
    });
    P.burst(ev.x, ev.y, 16, {
      color: 0xffffff, speed: 220, size: 0.75, life: 0.35, texture: textures.spark, drag: 4, grow: 1.4,
    });
    this.transients.push({ kind: 'blast', x: ev.x, y: ev.y, r: ev.r, color: ev.color, life: 0.35, maxLife: 0.35 });
    world.addShake(5 + Math.min(ev.hits, 8) * 1.5);
    world.addIntensity(0.14);
    // Only a hit that actually connected earns a screen-warping ripple.
    if (ev.hits > 0) this.postfx.shockwave(ev.x, ev.y, 0.55 + Math.min(ev.hits, 6) * 0.09);
  }

  clearLevel() {
    this.transients.length = 0;
    this.particles.clear();
    this.hover = null;
    this.ghost = null;
  }
}

/** Cheap full-saturation rainbow, for the Prism. */
function hsvTint(h) {
  const i = Math.floor(h * 6) % 6;
  const f = h * 6 - Math.floor(h * 6);
  const q = Math.round(255 * (1 - f));
  const t = Math.round(255 * f);
  switch (i) {
    case 0: return (255 << 16) | (t << 8);
    case 1: return (q << 16) | (255 << 8);
    case 2: return (255 << 8) | t;
    case 3: return (q << 8) | 255;
    case 4: return (t << 16) | 255;
    default: return (255 << 16) | q;
  }
}
