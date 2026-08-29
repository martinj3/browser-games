// Boot.

import { Game } from './game.js';

const canvas = document.getElementById('game-canvas');
const game = new Game(canvas);
window.game = game;   // handy for debugging and for the smoke test

game.init().catch((err) => {
  console.error(err);
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const sub = document.getElementById('overlay-subtitle');
  overlay.classList.remove('hidden');
  title.textContent = 'WEBGL UNAVAILABLE';
  sub.textContent = String(err && err.message ? err.message : err);
});
