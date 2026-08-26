// Shared tunables for the whole game. Keep gameplay-affecting numbers here
// so balance can be tweaked without hunting through system files.

// --- World geometry ---
export const PLAY_RADIUS = 12;          // radius of the circle the player is confined to (world units, XZ plane at y=0)
export const BLACK_HOLE_HEIGHT = 34;    // world Y of the black hole center, above the player's plane
export const BLACK_HOLE_RADIUS = 2.2;   // visual radius of the event-horizon sphere
export const WORLD_TOP_Y = 60;          // rough upper bound of the visible/simulated volume (despawn bullets/particles beyond this)
export const WORLD_SIDE_BOUND = 30;     // rough +/- X and Z bound of the visible/simulated volume

// --- Camera ---
// Fixed camera, side-on like classic Space Invaders but pulled back and
// slightly elevated so perspective foreshortening gives depth cues and
// makes the player's movement circle read as a wide ellipse on screen.
export const CAMERA_FOV = 52;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 220;
export const CAMERA_POSITION = [0, 4, 42];
export const CAMERA_LOOK_AT = [0, 18.4, -5.9];

// --- Orbital mechanics ---
// MU is the two-body gravitational parameter (mu = G*M) for the black hole,
// already tuned (with SIM_TIME_SCALE) to give ~3-20s stable orbital periods
// at the radii enemies are placed on. Purely a game-feel constant, not
// physically to scale.
export const MU = 2600;
export const SIM_TIME_SCALE = 1;        // extra multiplier on simulated orbital time (waveManager also nudges this up per wave)

// Bounds for randomly generated stable enemy orbits (semi-major axis in world units)
export const ENEMY_ORBIT_A_MIN = 10;
export const ENEMY_ORBIT_A_MAX = 22;
export const ENEMY_ORBIT_E_MIN = 0.0;
export const ENEMY_ORBIT_E_MAX = 0.45;
export const ENEMY_ORBIT_INCLINATION_MAX = Math.PI / 3.2; // keep most orbits from going too edge-on

// --- Player ---
export const PLAYER_MAX_SPEED = 14;     // world units / second, cap for keyboard AND the mouse/touch seek behavior
export const PLAYER_SEEK_MAX_SPEED = 14; // must match PLAYER_MAX_SPEED per design (capped at keyboard speed)
export const PLAYER_FIRE_COOLDOWN = 0.28; // seconds between shots
export const PLAYER_LIVES_START = 3;
export const PLAYER_INVINCIBILITY_TIME = 1.5; // seconds of invincibility after taking a hit
export const PLAYER_SHIP_SCALE = 1.0;

// --- Bullets ---
export const PLAYER_BULLET_SPEED = 26;
export const PLAYER_BULLET_RADIUS = 0.18;
export const ENEMY_BULLET_FALL_SPEED = 9;
export const ENEMY_BULLET_RADIUS = 0.22;
export const ENEMY_BULLET_ORBITAL_KICK_MIN = 4;
export const ENEMY_BULLET_ORBITAL_KICK_MAX = 9;
export const BULLET_TYPE_ORBITAL_CHANCE = 0.4; // fraction of enemy shots that are orbital vs straight-fall

// --- Enemy ships ---
export const ENEMY_SHIP_SCALE_MIN = 1.6; // enemy ships are deliberately exaggerated in size vs the player ship
export const ENEMY_SHIP_SCALE_MAX = 2.6;
export const ENEMY_BASE_FIRE_INTERVAL_MIN = 2.5; // seconds, at wave 1
export const ENEMY_BASE_FIRE_INTERVAL_MAX = 5.0;

// --- Waves ---
export const WAVE_BASE_COUNT = 5;
export const WAVE_COUNT_PER_LEVEL = 1;
export const WAVE_COUNT_MAX = 20;
export const WAVE_ARRIVAL_STAGGER = 0.18; // seconds between each ship's arrival within the initial burst
export const WAVE_CLEAR_PAUSE = 2.2; // seconds shown on the "Wave Clear" overlay before next wave starts
export const WAVE_MIDWAVE_SPAWN_BASE_CHANCE = 0.0; // per-second chance of an extra spawn, scales with wave number
export const WAVE_MIDWAVE_SPAWN_PER_LEVEL = 0.015;
export const WAVE_ORBIT_SPEED_PER_LEVEL = 0.06; // multiplicative speed-up of orbital sim time per wave
export const WAVE_FIRE_RATE_PER_LEVEL = 0.05;   // fractional reduction of fire interval per wave

// --- Colors ---
export const COLOR_PLAY_CIRCLE = 0x2a2a2e;
export const COLOR_DEPTH_GUIDE = 0x555560;
export const COLOR_SPARK = 0xffdd88;
export const PLAYER_HUE_RANGE = [0.45, 0.62]; // friendly blues/cyans/greens (HSL hue 0-1)
export const ENEMY_HUE_EXCLUDE_RANGE = [0.4, 0.66]; // enemies avoid the player's friendly hue band

// --- Starfield ---
export const STARFIELD_COUNT = 900;
export const STARFIELD_SPAWN_HEIGHT = 55;
export const STARFIELD_SPEED_MIN = 18;
export const STARFIELD_SPEED_MAX = 40;
