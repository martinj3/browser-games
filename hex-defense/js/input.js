// Pointer and keyboard input.
//
// The board never pans or zooms, so a tap maps straight to a hex and there is no
// gesture ambiguity to resolve.
//
// A tap resolves to the cell directly under the point, with no offset. This once
// lifted touch points ~46px so the fingertip would not cover the target cell --
// but a hex is about that tall, so every tap landed a full cell high. Feedback
// for the cell under your finger comes from the ghost outline and its range
// ring, both of which extend well past a fingertip.

export class Input {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.pointerDown = false;
    this.movedFar = false;

    canvas.addEventListener('pointerdown', this.onDown, { passive: false });
    canvas.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp, { passive: false });
    window.addEventListener('pointercancel', this.onCancel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKey);
  }

  localPoint(ev) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  onDown = (ev) => {
    ev.preventDefault();
    this.pointerDown = true;
    this.movedFar = false;
    this.startX = ev.clientX; this.startY = ev.clientY;
    const p = this.localPoint(ev);
    if (ev.button === 2) { this.game.disarm(); return; }
    this.game.onPointerDown(p.x, p.y);
  };

  onMove = (ev) => {
    const p = this.localPoint(ev);
    if (this.pointerDown) {
      if (Math.hypot(ev.clientX - this.startX, ev.clientY - this.startY) > 12) this.movedFar = true;
      this.game.onPointerDrag(p.x, p.y);
    } else if (ev.pointerType === 'mouse') {
      this.game.onPointerHover(p.x, p.y);
    }
  };

  onUp = (ev) => {
    if (!this.pointerDown) return;
    this.pointerDown = false;
    const p = this.localPoint(ev);
    this.game.onPointerUp(p.x, p.y, this.movedFar);
  };

  onCancel = () => {
    this.pointerDown = false;
    this.game.onPointerCancel();
  };

  onKey = (ev) => {
    const g = this.game;
    if (ev.repeat) return;
    // Number keys arm towers, matching the palette order left to right.
    if (ev.key >= '1' && ev.key <= '9') {
      const idx = Number(ev.key) - 1;
      const level = g.world && g.world.level;
      if (level && level.towers[idx]) { g.armTower(level.towers[idx]); ev.preventDefault(); }
      return;
    }
    switch (ev.key) {
      case 'Escape': g.disarm(); g.deselect(); break;
      case ' ': g.sendNextWave(); ev.preventDefault(); break;
      case 'p': case 'P': g.togglePause(); break;
      case 'f': case 'F': g.cycleSpeed(); break;
      case 'u': case 'U': g.upgradeSelected(); break;
      case 'x': case 'X': g.sellSelected(); break;
      default: break;
    }
  };
}
