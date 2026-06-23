// physics.js
// Flexural-gravity (hydroelastic) wave model for a thin elastic ice sheet
// floating on water of finite depth.
//
// The ice sheet is modelled as a thin elastic (Kirchhoff) plate resting on an
// inviscid, incompressible fluid layer. Linear potential-flow theory gives the
// flexural-gravity wave dispersion relation:
//
//   omega^2 = g*k*tanh(k*H) * (1 + (D/(rhoW*g)) * k^4)
//             / (1 + (rhoI*h/rhoW) * k*tanh(k*H))
//
// where
//   D     = E*h^3 / (12*(1-nu^2))   flexural rigidity of the plate
//   E     Young's modulus            [Pa]
//   nu    Poisson's ratio            [-]
//   h     ice thickness              [m]
//   rhoI  ice density                [kg/m^3]
//   rhoW  water density              [kg/m^3]
//   H     water depth                [m]
//   g     gravitational acceleration [m/s^2]
//   k     wavenumber                 [rad/m]
//   omega angular frequency          [rad/s]
//
// Setting D = 0 and rhoI = 0 recovers the familiar open-water dispersion
// relation omega^2 = g*k*tanh(k*H).

const G = 9.81; // m/s^2

// Flexural rigidity of the ice plate.
function flexuralRigidity(E, h, nu) {
  return (E * Math.pow(h, 3)) / (12 * (1 - nu * nu));
}

// Residual of the dispersion relation, f(k) = LHS - RHS, whose root is the
// wavenumber for the given angular frequency. f is negative for small k and
// grows to +infinity for large k, so a single positive root exists.
function dispersionResidual(k, omega, p) {
  const t = Math.tanh(k * p.H);
  const lhs = G * k * t * (1 + (p.D / (p.rhoW * G)) * Math.pow(k, 4));
  const rhs = omega * omega * (1 + ((p.rhoI * p.h) / p.rhoW) * k * t);
  return lhs - rhs;
}

// Forward evaluation: angular frequency as a function of wavenumber.
function omegaOfK(k, p) {
  const t = Math.tanh(k * p.H);
  const num = G * k * t * (1 + (p.D / (p.rhoW * G)) * Math.pow(k, 4));
  const den = 1 + ((p.rhoI * p.h) / p.rhoW) * k * t;
  return Math.sqrt(num / den);
}

// Solve the dispersion relation for the positive wavenumber k given omega,
// using bracketing + bisection (robust, derivative-free).
function solveWavenumber(omega, p) {
  let kLo = 1e-8;
  let kHi = 1e-3;
  let fHi = dispersionResidual(kHi, omega, p);
  let guard = 0;
  // Expand the upper bracket until the residual turns positive.
  while (fHi < 0 && guard < 300) {
    kHi *= 1.6;
    fHi = dispersionResidual(kHi, omega, p);
    guard++;
  }
  for (let i = 0; i < 200; i++) {
    const km = 0.5 * (kLo + kHi);
    const fm = dispersionResidual(km, omega, p);
    if (fm > 0) {
      kHi = km;
    } else {
      kLo = km;
    }
  }
  return 0.5 * (kLo + kHi);
}

// Build the parameter object used by the solver from raw UI inputs.
// E is supplied in GPa for convenience and converted to Pa here.
function makeParams(input) {
  return {
    H: input.H,
    rhoW: input.rhoW,
    rhoI: input.rhoI,
    h: input.h,
    D: flexuralRigidity(input.E * 1e9, input.h, input.nu),
  };
}

// Compute the full set of derived quantities for the current configuration.
//   input: { T, a, H, h, E (GPa), nu, rhoI, rhoW }
function computeModel(input) {
  const p = makeParams(input);
  const omega = (2 * Math.PI) / input.T;

  const k = solveWavenumber(omega, p);
  const lambda = (2 * Math.PI) / k;
  const phaseSpeed = omega / k;

  // Group speed via central finite difference of omega(k).
  const dk = k * 1e-4;
  const groupSpeed = (omegaOfK(k + dk, p) - omegaOfK(k - dk, p)) / (2 * dk);

  // Open-water reference (no ice): D = 0, rhoI = 0.
  const pOpen = { H: input.H, rhoW: input.rhoW, rhoI: 0, h: input.h, D: 0 };
  const kOpen = solveWavenumber(omega, pOpen);
  const lambdaOpen = (2 * Math.PI) / kOpen;

  // Ice buoyancy geometry.
  const draft = (input.rhoI / input.rhoW) * input.h; // submerged depth
  const freeboard = input.h - draft; // height above mean waterline

  // Maximum surface bending strain: eps = (h/2) * curvature, with the wave
  // curvature amplitude = a * k^2.
  const maxStrain = (input.h / 2) * input.a * k * k;

  return {
    omega,
    k,
    lambda,
    lambdaOpen,
    phaseSpeed,
    groupSpeed,
    draft,
    freeboard,
    maxStrain,
    D: p.D,
  };
}

// Sweep the wave period over a range and return arrays useful for plotting.
function sweepPeriod(input, Tmin, Tmax, n) {
  const periods = [];
  const lambdaIce = [];
  const lambdaOpen = [];
  const strain = [];
  for (let i = 0; i < n; i++) {
    const T = Tmin + ((Tmax - Tmin) * i) / (n - 1);
    const m = computeModel({ ...input, T });
    periods.push(T);
    lambdaIce.push(m.lambda);
    lambdaOpen.push(m.lambdaOpen);
    strain.push(m.maxStrain);
  }
  return { periods, lambdaIce, lambdaOpen, strain };
}

window.IcePhysics = {
  G,
  flexuralRigidity,
  computeModel,
  sweepPeriod,
};
