import onramp from './onramp.js';
import bottleneck from './bottleneck.js';
import fork from './fork.js';
import spiral from './spiral.js';
import crucible from './crucible.js';

export const LEVELS = [onramp, bottleneck, fork, spiral, crucible];
export const LEVEL_BY_ID = Object.fromEntries(LEVELS.map((l) => [l.id, l]));
