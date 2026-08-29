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

    // Pixi resolves ONE resolution for the whole filtered container, as the
    // minimum over its enabled filters -- and Filter's default is 1, not the
    // renderer's. Left alone that rasterises the entire world at 1 CSS pixel
    // and upscales it to a 2x or 3x screen, which reads as heavy pixelation.
    // Every filter here must therefore say 'inherit'.

    if (quality.bloom) {
      this.bloom = new AdvancedBloomFilter({
        // A high threshold on purpose: only the hot cores bloom, so towers and
        // enemies keep their colour instead of clipping to white.
        threshold: 0.46,
        bloomScale: 0.85,
        brightness: 1.0,
        blur: 7,
        quality: quality.bloomQuality,
        // Widen the blur's sample step instead of shrinking the render target.
        // This is the cheap knob: it costs the same as pixelSize 1 but reaches
        // further, so a low tier gets a softer glow rather than a coarser world.
        pixelSize: { x: quality.bloomPixelSize, y: quality.bloomPixelSize },
      });
      this.bloom.resolution = 'inherit';
      this.bloom.antialias = 'inherit';
      this.filters.push(this.bloom);
    }

    for (let i = 0; i < quality.shockwaves; i++) {
      const sw = new ShockwaveFilter({
        center: { x: -1000, y: -1000 },
        amplitude: 0, wavelength: 110, radius: 260, brightness: 1.05, speed: 620,
      });
      sw.enabled = false;
      sw.time = 0;
      sw.resolution = 'inherit';
      sw.antialias = 'inherit';
      this.shockwaves.push(sw);
      this.filters.push(sw);
    }

    if (quality.aberration) {
      this.rgb = new RGBSplitFilter();
      this.rgb.resolution = 'inherit';
      this.rgb.antialias = 'inherit';
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
 * look survives: shockwaves go first, then blur width and particle count, and
 * only last does bloom switch off entirely -- the baked halos carry the neon
 * look on their own even with no post-processing at all. Crucially, no tier
 * ever lowers the filter resolution: a soft glow still looks intentional, a
 * pixelated board just looks broken.
 */
export function pickQuality(sampleMs, tiers) {
  if (sampleMs > 26) return tiers.LOW;
  if (sampleMs > 19) return tiers.MEDIUM;
  return tiers.HIGH;
}
