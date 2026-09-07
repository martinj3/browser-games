// Pooled projectiles. Nothing transient is allocated during play -- GC pauses
// read as stutter on a phone, and the late waves put a lot of these in flight.

export const PROJ = {
  SHELL: 0,    // mortar: arcs to a point, then splash
  BOLT: 1,     // prism: homes on a target
  PELLET: 2,   // pulse gun: a small, very fast slug
};

export class Projectile {
  constructor() { this.alive = false; }

  launchShell(tower, tx, ty, speedPx, damage, splashPx) {
    this.kind = PROJ.SHELL;
    this.alive = true;
    this.x = tower.x; this.y = tower.y;
    this.prevX = this.x; this.prevY = this.y;
    this.sx = this.x; this.sy = this.y;
    this.tx = tx; this.ty = ty;
    this.damage = damage;
    this.splashPx = splashPx;
    this.color = tower.def.color;
    this.ignoresArmor = false;
    const dist = Math.hypot(tx - this.x, ty - this.y) || 1;
    this.duration = dist / speedPx;
    this.t = 0;
    this.arc = Math.min(dist * 0.35, 140);
    return this;
  }

  /**
   * A pellet: small, quick, and locked onto its target. It tracks hard enough
   * that it always connects -- the Pulse Gun's promise is that it never misses
   * -- but it is a real object in flight rather than an instant hit, so the
   * cheapest tower reads as a gun rather than a second laser.
   */
  launchPellet(tower, target, speedPx, damage) {
    this.kind = PROJ.PELLET;
    this.alive = true;
    this.x = tower.x; this.y = tower.y;
    this.prevX = this.x; this.prevY = this.y;
    this.target = target;
    this.damage = damage;
    this.ignoresArmor = false;
    this.speed = speedPx;
    this.color = tower.def.color;
    this.rainbow = false;
    this.life = 1.5;
    const a = Math.atan2(target.y - this.y, target.x - this.x)
      + (Math.random() - 0.5) * 0.10;   // a touch of spray, purely cosmetic
    this.vx = Math.cos(a) * speedPx;
    this.vy = Math.sin(a) * speedPx;
    return this;
  }

  launchBolt(tower, target, speedPx, damage, ignoresArmor) {
    this.kind = PROJ.BOLT;
    this.alive = true;
    this.x = tower.x; this.y = tower.y;
    this.prevX = this.x; this.prevY = this.y;
    this.target = target;
    this.damage = damage;
    this.ignoresArmor = ignoresArmor;
    this.speed = speedPx;
    this.color = tower.def.color;
    this.rainbow = !!tower.def.rainbow;
    this.life = 3;
    // Fan the volley out so three simultaneous bolts read as three, not one.
    const spread = (Math.random() - 0.5) * 1.2;
    const dx = target.x - this.x, dy = target.y - this.y;
    const a = Math.atan2(dy, dx) + spread;
    this.vx = Math.cos(a) * speedPx;
    this.vy = Math.sin(a) * speedPx;
    return this;
  }
}
