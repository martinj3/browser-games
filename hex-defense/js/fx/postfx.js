// The post-processing stack, and the global "intensity" value that drives it.
//
// Bloom, chromatic aberration and screen shake all scale with how much carnage
// is currently on screen, so a late wave literally looks more overloaded than an
// early one rather than just having more sprites in it.

import { AdvancedBloomFilter, ShockwaveFilter, RGBSplitFilter } from 'pixi-filters';

export class PostFX {
  constructor(quality) {
    this.quality = quality;
    this.filters = [];
    this.shockwaves = [];

    if (quality.bloomRes > 0) {
      this.bloom = new AdvancedBloomFilter({
        // A high threshold on purpose: only the hot cores bloom, so towers and
        // enemies keep their colour instead of clipping to white.
        threshold: 0.46,
        bloomScale: 0.85,
        brightness: 1.0,
        blur: 7,
        quality: 4,
      });
      // Full-resolution bloom at DPR 3 is the single most likely thing to melt a
      // phone, so it renders at a fraction of the screen size and gets scaled up.
      this.bloom.resolution = quality.bloomRes;
      this.filters.push(this.bloom);
    }

    for (let i = 0; i < quality.shockwaves; i++) {
      const sw = new ShockwaveFilter({
        center: { x: -1000, y: -1000 },
        amplitude: 0, wavelength: 110, radius: 260, brightness: 1.05, speed: 620,
      });
      sw.enabled = false;
      sw.time = 0;
      this.shockwaves.push(sw);
      this.filters.push(sw);
    }

    if (quality.aberration) {
      this.rgb = new RGBSplitFilter();
      this.rgb.red = { x: 0, y: 0 };
      this.rgb.green = { x: 0, y: 0 };
      this.rgb.blue = { x: 0, y: 0 };
      this.filters.push(this.rgb);
    }
    this._sw = 0;
  }

  /** Kick off a ripple centred on a world point. Silently ignored on low quality. */
  shockwave(x, y, strength = 1) {
    if (this.shockwaves.length === 0) return;
    const sw = this.shockwaves[this._sw % this.shockwaves.length];
    this._sw++;
    sw.center = { x, y };
    sw.time = 0;
    sw.amplitude = 26 * strength;
    sw.wavelength = 90 + 60 * strength;
    sw.radius = 200 + 220 * strength;
    sw.enabled = true;
  }

  update(dt, intensity) {
    for (const sw of this.shockwaves) {
      if (!sw.enabled) continue;
      sw.time += dt;
      // The ripple dies once it has run past its own radius.
      if (sw.time > (sw.radius / sw.speed) + 0.25) {
        sw.enabled = false;
        sw.amplitude = 0;
      }
    }
    if (this.bloom) {
      this.bloom.bloomScale = 0.75 + intensity * 0.7;
      this.bloom.threshold = 0.48 - intensity * 0.12;
    }
    if (this.rgb) {
      const a = intensity * intensity * 3.2;
      const t = performance.now() / 1000;
      this.rgb.red = { x: -a, y: Math.sin(t * 7) * a * 0.3 };
      this.rgb.blue = { x: a, y: -Math.sin(t * 5) * a * 0.3 };
    }
  }
}

/**
 * Pick a quality tier from a short frame-time probe. Degrading is ordered so the
 * look survives: shockwaves go first, then bloom resolution, then particles, and
 * only last does bloom switch off entirely -- the baked halos carry the neon
 * look on their own even with no post-processing at all.
 */
export function pickQuality(sampleMs, tiers) {
  if (sampleMs > 26) return tiers.LOW;
  if (sampleMs > 19) return tiers.MEDIUM;
  return tiers.HIGH;
}
