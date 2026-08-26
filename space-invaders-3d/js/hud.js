export class Hud {
  constructor() {
    this.scoreEl = document.getElementById('score-value');
    this.waveEl = document.getElementById('wave-value');
    this.livesEl = document.getElementById('hud-lives');
    this.overlayEl = document.getElementById('overlay');
    this.overlayTitleEl = document.getElementById('overlay-title');
    this.overlaySubtitleEl = document.getElementById('overlay-subtitle');
    this.overlayButtonEl = document.getElementById('overlay-button');
  }

  setScore(value) {
    this.scoreEl.textContent = String(value);
  }

  setWave(value) {
    this.waveEl.textContent = String(value);
  }

  setLives(count, max) {
    this.livesEl.innerHTML = '';
    for (let i = 0; i < max; i++) {
      const icon = document.createElement('div');
      icon.className = 'life-icon' + (i < count ? '' : ' lost');
      this.livesEl.appendChild(icon);
    }
  }

  showOverlay({ title, subtitle, buttonText, onButton }) {
    this.overlayTitleEl.textContent = title || '';
    this.overlaySubtitleEl.textContent = subtitle || '';
    if (buttonText) {
      this.overlayButtonEl.textContent = buttonText;
      this.overlayButtonEl.classList.remove('hidden');
      this.overlayButtonEl.onclick = onButton || null;
    } else {
      this.overlayButtonEl.classList.add('hidden');
      this.overlayButtonEl.onclick = null;
    }
    this.overlayEl.classList.remove('hidden');
  }

  hideOverlay() {
    this.overlayEl.classList.add('hidden');
  }
}

export function createHud() {
  return new Hud();
}
