// Progress persistence. Best-effort: a private window or blocked site data must
// degrade to "nothing unlocked yet", never to a crash.

const KEY = 'hexswarm.progress.v1';

const EMPTY = { completed: {}, best: {}, muted: false };

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    return { ...EMPTY, ...parsed };
  } catch {
    return { ...EMPTY };
  }
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

/** Stars are health kept plus a score threshold, so surviving cleanly matters. */
export function starsFor(health, maxHealth) {
  const frac = health / maxHealth;
  if (frac >= 1) return 3;
  if (frac >= 0.6) return 2;
  return 1;
}

export function recordWin(state, levelId, stars, score) {
  state.completed[levelId] = Math.max(state.completed[levelId] || 0, stars);
  state.best[levelId] = Math.max(state.best[levelId] || 0, score);
  save(state);
}

/** A level is unlocked once the previous one has been cleared. */
export function isUnlocked(state, levels, index) {
  if (index === 0) return true;
  return !!state.completed[levels[index - 1].id];
}
