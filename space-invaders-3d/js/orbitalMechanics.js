// Two-body Kepler orbital mechanics, used for enemy ships and orbital bullets
// orbiting the black hole. Enemy masses are assumed negligible (pure
// restricted two-body problem, black hole is the only source of gravity).
//
// Orbital elements are stored relative to a "frame" coordinate system
// centered on the black hole, where the reference (inclination=0) plane is
// horizontal. Because the game world's "up" axis is Y but classical orbital
// mechanics conventionally treats Z as the polar/inclination axis, we swap
// Y and Z when converting between world space and this internal frame.
// Swapping Y and Z is its own inverse, so the same helper works both ways.

import * as THREE from 'three';

const TWO_PI = Math.PI * 2;

function swapYZ(v) {
  return { x: v.x, y: v.z, z: v.y };
}

/** Solve Kepler's equation M = E - e*sin(E) for E (elliptical, 0 <= e < 1). */
function solveEccentricAnomaly(M, e) {
  M = ((M % TWO_PI) + TWO_PI) % TWO_PI;
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 30; i++) {
    const f = E - e * Math.sin(E) - M;
    const fp = 1 - e * Math.cos(E);
    const dE = f / fp;
    E -= dE;
    if (Math.abs(dE) < 1e-9) break;
  }
  return E;
}

/** Solve the hyperbolic Kepler equation M = e*sinh(H) - H for H (e > 1). */
function solveHyperbolicAnomaly(M, e) {
  let H = Math.sign(M) * Math.log(2 * Math.abs(M) / e + 1.8);
  if (!isFinite(H)) H = 0;
  for (let i = 0; i < 50; i++) {
    const f = e * Math.sinh(H) - H - M;
    const fp = e * Math.cosh(H) - 1;
    const dH = f / fp;
    H -= dH;
    if (Math.abs(dH) < 1e-9) break;
  }
  return H;
}

/**
 * Propagate an orbit to time t.
 * elements = { a, e, i, Omega, omega, M0, epoch, mu }
 *   a: semi-major axis (negative for hyperbolic orbits, per convention)
 *   M0: mean anomaly at `epoch`
 * Returns { position: THREE.Vector3, velocity: THREE.Vector3 } in world
 * space, RELATIVE TO THE BLACK HOLE (caller adds the black hole's world
 * position).
 */
export function propagateOrbit(elements, t) {
  const { a, e, i, Omega, omega, M0, epoch, mu } = elements;
  const dt = t - epoch;
  const n = Math.sqrt(mu / Math.abs(a * a * a));
  const M = M0 + n * dt;

  let x, y, vx, vy;

  if (e < 1) {
    const E = solveEccentricAnomaly(M, e);
    const cosE = Math.cos(E);
    const sinE = Math.sin(E);
    const r = a * (1 - e * cosE);
    x = a * (cosE - e);
    y = a * Math.sqrt(1 - e * e) * sinE;
    const coeff = Math.sqrt(mu * a) / r;
    vx = -coeff * sinE;
    vy = coeff * Math.sqrt(1 - e * e) * cosE;
  } else {
    const H = solveHyperbolicAnomaly(M, e);
    const coshH = Math.cosh(H);
    const sinhH = Math.sinh(H);
    const r = a * (1 - e * coshH); // a < 0 so this is positive
    x = a * (coshH - e);
    y = a * Math.sqrt(e * e - 1) * sinhH;
    const coeff = Math.sqrt(-mu * a) / r;
    vx = -coeff * sinhH;
    vy = coeff * Math.sqrt(e * e - 1) * coshH;
  }

  // Rotate from the perifocal (orbital) plane into the frame via the
  // classical 313 Euler sequence (Omega, i, omega).
  const cosO = Math.cos(Omega), sinO = Math.sin(Omega);
  const cosI = Math.cos(i), sinI = Math.sin(i);
  const cosW = Math.cos(omega), sinW = Math.sin(omega);

  const Px = cosO * cosW - sinO * sinW * cosI;
  const Py = sinO * cosW + cosO * sinW * cosI;
  const Pz = sinW * sinI;
  const Qx = -cosO * sinW - sinO * cosW * cosI;
  const Qy = -sinO * sinW + cosO * cosW * cosI;
  const Qz = cosW * sinI;

  const framePos = { x: Px * x + Qx * y, y: Py * x + Qy * y, z: Pz * x + Qz * y };
  const frameVel = { x: Px * vx + Qx * vy, y: Py * vx + Qy * vy, z: Pz * vx + Qz * vy };

  const worldPos = swapYZ(framePos);
  const worldVel = swapYZ(frameVel);

  return {
    position: new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z),
    velocity: new THREE.Vector3(worldVel.x, worldVel.y, worldVel.z),
  };
}

/**
 * Convert a state vector (position/velocity relative to the black hole, in
 * world space) into orbital elements at the given epoch. Works for both
 * elliptical and hyperbolic trajectories.
 */
export function stateToElements(relWorldPos, relWorldVel, mu, epoch = 0) {
  const r = swapYZ(relWorldPos);
  const v = swapYZ(relWorldVel);

  const rv = new THREE.Vector3(r.x, r.y, r.z);
  const vv = new THREE.Vector3(v.x, v.y, v.z);
  const rMag = rv.length();
  const vMag = vv.length();

  const h = new THREE.Vector3().crossVectors(rv, vv); // specific angular momentum
  const hMag = h.length();

  const kAxis = new THREE.Vector3(0, 0, 1);
  const nVec = new THREE.Vector3().crossVectors(kAxis, h); // node vector
  const nMag = nVec.length();

  // Eccentricity vector: e = ((v x h) / mu) - r/|r|
  const eVec = new THREE.Vector3().crossVectors(vv, h).divideScalar(mu).sub(rv.clone().divideScalar(rMag));
  const e = eVec.length();

  const energy = (vMag * vMag) / 2 - mu / rMag;
  let a = -mu / (2 * energy);

  let i = Math.acos(THREE.MathUtils.clamp(h.z / hMag, -1, 1));

  let Omega;
  if (nMag < 1e-8) {
    Omega = 0;
  } else {
    Omega = Math.atan2(nVec.y, nVec.x);
  }

  let omega;
  if (e < 1e-8) {
    omega = 0;
  } else if (nMag < 1e-8) {
    // Equatorial orbit: measure omega directly from the X axis.
    omega = Math.atan2(eVec.y, eVec.x);
    if (h.z < 0) omega = TWO_PI - omega;
  } else {
    const cosOmega = THREE.MathUtils.clamp(nVec.dot(eVec) / (nMag * e), -1, 1);
    omega = Math.acos(cosOmega);
    if (eVec.z < 0) omega = TWO_PI - omega;
  }

  // True anomaly from position along the eccentricity vector (or node
  // vector / position itself for circular / equatorial special cases).
  let nu;
  const rDotV = rv.dot(vv);
  if (e < 1e-8) {
    // Circular: measure true anomaly from the node vector (or X axis if equatorial too).
    const ref = nMag < 1e-8 ? new THREE.Vector3(1, 0, 0) : nVec.clone().normalize();
    const cosNu = THREE.MathUtils.clamp(ref.dot(rv) / rMag, -1, 1);
    nu = Math.acos(cosNu);
    if (rv.dot(new THREE.Vector3().crossVectors(h, ref)) < 0) nu = TWO_PI - nu;
  } else {
    const cosNu = THREE.MathUtils.clamp(eVec.dot(rv) / (e * rMag), -1, 1);
    nu = Math.acos(cosNu);
    if (rDotV < 0) nu = TWO_PI - nu;
  }

  let M0;
  if (e < 1) {
    const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
    M0 = E - e * Math.sin(E);
  } else {
    const H = 2 * Math.atanh(THREE.MathUtils.clamp(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2), -0.9999999, 0.9999999));
    M0 = e * Math.sinh(H) - H;
  }

  return { a, e, i, Omega, omega, M0, epoch, mu };
}

/**
 * Build a hyperbolic "approach" orbit that shares its periapsis point and
 * orbital plane with `targetElements` (a stable, bound orbit with M0=0 at
 * `arrivalTime`), so that at `arrivalTime` the incoming ship is located
 * exactly at the point where it should be captured onto the target orbit
 * ("capture burn": swap velocity for the target orbit's periapsis velocity
 * at that same instant). Returns { approachElements, spawnTime }.
 */
export function createHyperbolicApproach(targetElements, arrivalTime, mu, opts = {}) {
  const eccentricity = opts.eccentricity ?? 1.15 + Math.random() * 0.6;
  const spawnRadius = opts.spawnRadius ?? 55 + Math.random() * 20;

  const rp = targetElements.a * (1 - targetElements.e);
  const aApproach = rp / (1 - eccentricity); // negative, since eccentricity > 1

  const coshH = (1 - spawnRadius / aApproach) / eccentricity;
  const H = -Math.acosh(Math.max(1, coshH));
  const M = eccentricity * Math.sinh(H) - H;
  const n = Math.sqrt(mu / Math.abs(aApproach * aApproach * aApproach));
  const spawnTime = arrivalTime + M / n;

  const approachElements = {
    a: aApproach,
    e: eccentricity,
    i: targetElements.i,
    Omega: targetElements.Omega,
    omega: targetElements.omega,
    M0: 0,
    epoch: arrivalTime,
    mu,
  };

  return { approachElements, spawnTime };
}

/** Random stable bound-orbit elements within the given bounds, periapsis at t = periapsisTime. */
export function randomStableElements({ aMin, aMax, eMin, eMax, iMax, mu, periapsisTime }) {
  const a = aMin + Math.random() * (aMax - aMin);
  const e = eMin + Math.random() * (eMax - eMin);
  const i = Math.random() * iMax;
  const Omega = Math.random() * TWO_PI;
  const omega = Math.random() * TWO_PI;
  return { a, e, i, Omega, omega, M0: 0, epoch: periapsisTime, mu };
}
