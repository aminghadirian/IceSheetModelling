// physics.js
// Self-consistent screening model for a large moored floating array (e.g. a
// floating-PV field of many small floaters) treated as an equivalent
// ORTHOTROPIC thin plate floating on finite-depth water.
//
// The structure AND the hydrodynamics are homogenised together: instead of
// thousands of bodies with individual RAOs/QTFs, the array is a continuous
// plate whose flexural rigidity, areal mass and structural damping come from
// the floater + connector unit cell. The fluid is treated by linear
// potential-flow theory, giving the flexural-gravity (hydroelastic) dispersion
// relation:
//
//   omega^2 = g*k*tanh(k*H) * (1 + (D/(rhoW*g))*k^4)
//             / (1 + (ms/rhoW)*k*tanh(k*H))
//
//   D   effective bending rigidity in the wave-propagation direction [N·m]
//   ms  areal mass of the array (mass per unit plan area)            [kg/m^2]
//   H   water depth                                                  [m]
//   k   wavenumber, omega angular frequency
//
// Orthotropy: the floaters are rectangular, so bending rigidity differs about
// the two axes (Dx, Dy). For a wave travelling at heading theta to the x-axis
// the effective directional rigidity uses Huber's orthotropic approximation
// (cross term ~ sqrt(Dx*Dy)):
//
//   D(theta) = Dx*cos^4 + 2*sqrt(Dx*Dy)*cos^2*sin^2 + Dy*sin^4
//
// Structural/joint damping is included as a loss factor eta (complex rigidity
// D->D(1+i*eta)), which makes the wavenumber complex and produces spatial
// ATTENUATION of the wave into the array. NOTE: radiation alone does not
// attenuate a 1-D propagating flexural-gravity wave; the decay comes from the
// dissipative loss factor, which is the most uncertain input and should be
// calibrated.

const G = 9.81; // m/s^2

// Effective directional bending rigidity (Huber orthotropy).
function directionalD(Dx, Dy, headingDeg) {
  const t = (headingDeg * Math.PI) / 180;
  const c2 = Math.cos(t) ** 2;
  const s2 = Math.sin(t) ** 2;
  return Dx * c2 * c2 + 2 * Math.sqrt(Dx * Dy) * c2 * s2 + Dy * s2 * s2;
}

// Dispersion residual whose positive root is the (real) wavenumber.
function residual(k, omega, p) {
  const t = Math.tanh(k * p.H);
  const lhs = G * k * t * (1 + (p.D / (p.rhoW * G)) * Math.pow(k, 4));
  const rhs = omega * omega * (1 + (p.ms / p.rhoW) * k * t);
  return lhs - rhs;
}

function omegaOfK(k, p) {
  const t = Math.tanh(k * p.H);
  const num = G * k * t * (1 + (p.D / (p.rhoW * G)) * Math.pow(k, 4));
  const den = 1 + (p.ms / p.rhoW) * k * t;
  return Math.sqrt(num / den);
}

// Bracketing + bisection solve for the real wavenumber.
function solveWavenumber(omega, p) {
  let kLo = 1e-8;
  let kHi = 1e-3;
  let fHi = residual(kHi, omega, p);
  let guard = 0;
  while (fHi < 0 && guard < 400) {
    kHi *= 1.6;
    fHi = residual(kHi, omega, p);
    guard++;
  }
  for (let i = 0; i < 200; i++) {
    const km = 0.5 * (kLo + kHi);
    if (residual(km, omega, p) > 0) kHi = km;
    else kLo = km;
  }
  return 0.5 * (kLo + kHi);
}

// Spatial attenuation rate alpha (1/m) from the structural loss factor, via
// first-order perturbation of the complex rigidity D -> D(1+i*eta):
//   alpha = | eta * D * (dF/dD) / (dF/dk) |
// dF/dD is analytic; dF/dk is taken numerically.
function attenuationRate(k, omega, p, eta) {
  if (eta <= 0) return 0;
  const dFdD = (Math.pow(k, 5) * Math.tanh(k * p.H)) / p.rhoW;
  const dk = k * 1e-5;
  const dFdk = (residual(k + dk, omega, p) - residual(k - dk, omega, p)) / (2 * dk);
  return Math.abs((eta * p.D * dFdD) / dFdk);
}

// Build the solver parameter set for a given heading.
function makeParams(input) {
  return {
    H: input.H,
    rhoW: input.rhoW,
    ms: input.ms,
    D: directionalD(input.Dx, input.Dy, input.heading),
  };
}

// Full screening result for one configuration.
//   input: { T, a, H, rhoW, ms, Dx, Dy, heading, Lx, Ly, floatH, arrayLen }
function computeArray(input) {
  const p = makeParams(input);
  const omega = (2 * Math.PI) / input.T;

  const k = solveWavenumber(omega, p);
  const lambda = (2 * Math.PI) / k;
  const phaseSpeed = omega / k;
  const dk = k * 1e-4;
  const groupSpeed = (omegaOfK(k + dk, p) - omegaOfK(k - dk, p)) / (2 * dk);

  // Open-water reference (rigid-free water: no plate).
  const pOpen = { H: input.H, rhoW: input.rhoW, ms: 0, D: 0 };
  const kOpen = solveWavenumber(omega, pOpen);
  const lambdaOpen = (2 * Math.PI) / kOpen;

  // Attenuation into the array.
  const alpha = attenuationRate(k, omega, p, input.eta);
  const decayLength = alpha > 0 ? 1 / alpha : Infinity; // amplitude 1/e distance

  // Buoyancy geometry from areal mass.
  const draft = input.ms / input.rhoW;
  const freeboard = Math.max(input.floatH - draft, 0);

  // Cell geometry along/across the propagation direction.
  const c2 = Math.cos((input.heading * Math.PI) / 180) ** 2;
  const s2 = 1 - c2;
  const cellAlong = input.Lx * c2 + input.Ly * s2; // spacing along heading
  const cellAcross = input.Ly * c2 + input.Lx * s2; // transverse connector span

  // Connector loads at the most-exposed (front) edge, where amplitude = a.
  const curvature = input.a * k * k; // wave curvature amplitude [1/m]
  const momentPerWidth = p.D * curvature; // bending moment per unit width [N]
  const connectorMoment = momentPerWidth * cellAcross; // [N·m]
  const relRotationDeg = (curvature * cellAlong * 180) / Math.PI; // adjacent-cell rotation

  // Crude global reflection / mean drift at the array's leading edge.
  const R = Math.abs((kOpen - k) / (kOpen + k));
  const meanDriftPerWidth = 0.5 * input.rhoW * G * input.a * input.a * R * R; // N/m of crest

  // Homogenisation validity: cells per wavelength along the heading.
  const cellsPerWave = lambda / cellAlong;
  let validity = "ok";
  if (cellsPerWave < 6) validity = "poor";
  else if (cellsPerWave < 10) validity = "marginal";

  // Characteristic flexural length.
  const charLength = Math.pow(p.D / (input.rhoW * G), 0.25);

  return {
    omega, k, lambda, lambdaOpen, phaseSpeed, groupSpeed,
    alpha, decayLength, draft, freeboard, cellAlong, cellAcross,
    curvature, momentPerWidth, connectorMoment, relRotationDeg,
    R, meanDriftPerWidth, cellsPerWave, validity, charLength,
    D: p.D,
  };
}

// Distance-into-array profiles for plotting (amplitude + connector moment).
function penetrationProfile(input, model, n) {
  const L = input.arrayLen;
  const dist = [];
  const amp = [];
  const moment = [];
  for (let i = 0; i < n; i++) {
    const x = (L * i) / (n - 1);
    const a = input.a * Math.exp(-model.alpha * x);
    dist.push(x);
    amp.push(a);
    moment.push((model.D * a * model.k * model.k * model.cellAcross) / 1e3); // kN·m
  }
  return { dist, amp, moment };
}

// Sweep wave heading 0..90 deg to expose orthotropic directionality.
function headingSweep(input, n) {
  const head = [];
  const lambda = [];
  const connMoment = [];
  for (let i = 0; i < n; i++) {
    const hdg = (90 * i) / (n - 1);
    const m = computeArray({ ...input, heading: hdg });
    head.push(hdg);
    lambda.push(m.lambda);
    connMoment.push(m.connectorMoment / 1e3); // kN·m
  }
  return { head, lambda, connMoment };
}

window.IcePhysics = {
  G,
  directionalD,
  computeArray,
  penetrationProfile,
  headingSweep,
};
