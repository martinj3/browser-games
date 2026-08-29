// Pooled additive particle system.
//
// The whole pool is allocated once and every particle stays parked in the
// ParticleContainer for the life of the level -- dead ones just sit at alpha 0.
// Adding and removing thousands of children per second would cost more than
// drawing them.

import { ParticleContainer, Particle } from 'pixi.js';
import { textures } from './textures.js';

export class Particles {
  constructor(capacity) {
    this.capacity = capacity;
    this.container = new ParticleContainer({
      dynamicProperties: { position: true, scale: true, rotation: true, color: true },
    });
    this.container.blendMode = 'add';
    this.particles = [];
    this.state = [];
    this.cursor = 0;

    for (let i = 0; i < capacity; i++) {
      const p = new Particle({
        texture: textures.spark,
        x: -1000, y: -1000, anchorX: 0.5, anchorY: 0.5,
        scaleX: 1, scaleY: 1, alpha: 0, tint: 0xffffff,
      });
      this.particles.push(p);
      this.state.push({ life: 0, maxLife: 1, vx: 0, vy: 0, drag: 0, spin: 0, grow: 0, size: 1, fade: 1 });
      this.container.addParticle(p);
    }
  }

  /**
   * Claim a slot. When the pool is exhausted we overwrite the oldest slot
   * rather than allocating -- a dropped particle is invisible, a GC pause is not.
   */
  emit(opts) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const p = this.particles[i];
    const s = this.state[i];

    p.texture = opts.texture || textures.spark;
    p.x = opts.x; p.y = opts.y;
    p.tint = opts.color;
    p.alpha = opts.alpha != null ? opts.alpha : 1;
    p.rotation = opts.rotation || 0;
    s.size = opts.size;
    p.scaleX = p.scaleY = opts.size;
    if (opts.stretch) p.scaleX = opts.size * opts.stretch;

    s.life = s.maxLife = opts.life;
    s.vx = opts.vx || 0;
    s.vy = opts.vy || 0;
    s.drag = opts.drag != null ? opts.drag : 2.2;
    s.spin = opts.spin || 0;
    s.grow = opts.grow || 0;
    s.fade = opts.fade != null ? opts.fade : 1;
    s.stretch = opts.stretch || 1;
    return p;
  }

  /** Radial burst -- the workhorse for deaths, impacts and explosions. */
  burst(x, y, count, opts) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = opts.speed * (0.35 + Math.random() * 0.9);
      this.emit({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        color: opts.color,
        size: opts.size * (0.5 + Math.random() * 0.8),
        life: opts.life * (0.6 + Math.random() * 0.7),
        texture: opts.texture,
        rotation: a,
        stretch: opts.stretch,
        drag: opts.drag,
        grow: opts.grow,
        spin: opts.spin,
      });
    }
  }

  update(dt) {
    const { particles, state } = this;
    for (let i = 0; i < particles.length; i++) {
      const s = state[i];
      if (s.life <= 0) continue;
      const p = particles[i];
      s.life -= dt;
      if (s.life <= 0) { p.alpha = 0; p.x = -1000; continue; }

      const k = s.life / s.maxLife;
      const decay = Math.exp(-s.drag * dt);
      s.vx *= decay; s.vy *= decay;
      p.x += s.vx * dt;
      p.y += s.vy * dt;
      p.rotation += s.spin * dt;
      const scale = s.size * (1 + s.grow * (1 - k));
      p.scaleY = scale;
      p.scaleX = scale * s.stretch;
      p.alpha = Math.pow(k, s.fade);
    }
    this.container.update();
  }

  clear() {
    for (let i = 0; i < this.particles.length; i++) {
      this.state[i].life = 0;
      this.particles[i].alpha = 0;
      this.particles[i].x = -1000;
    }
  }
}
