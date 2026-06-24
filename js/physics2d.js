// physics2d.js
// Full 2D scattering of a monochromatic wave by a FINITE floating platform
// sitting in a larger water basin. Solves the single-frequency, variable-
// coefficient mild-slope wave equation in the TIME DOMAIN, marched to periodic
// steady state:
//
//   u_tt = div( c(x,y)^2 grad u ) - 2*gamma(x,y)*u_t + S(x,y,t)
//
//   c(x,y) = omega / k(x,y)   local phase speed (open water vs. platform)
//   gamma  = dissipation: platform damping (-> wave attenuation under the
//            platform) plus sponge layers near the basin edges (absorb
//            outgoing/reflected waves so the basin behaves like open water)
//   S      = soft line source that launches the incident plane wave
//
// Because the run is monochromatic, choosing c = omega/k(x,y) reproduces the
// correct wavelength in open water and under the platform, hence the correct
// refraction, reflection at the platform edge, diffraction around it, and the
// downstream shadow/wake. Steady-state complex amplitude is extracted by
// accumulating u*cos(wt) and u*sin(wt) over the final whole periods.
//
// This is a screening-grade scattering model: the platform is represented by a
// region of modified (complex) effective wavenumber, not by the full
// hydroelastic plate-edge conditions. It captures the wake physics the user
// wants, not detailed near-edge bending.

const G = 9.81;

function solveDispersion(f) {
  let lo = 1e-8;
  let hi = 1e-3;
  let guard = 0;
  while (f(hi) < 0 && guard < 400) {
    hi *= 1.6;
    guard++;
  }
  for (let i = 0; i < 240; i++) {
    const m = 0.5 * (lo + hi);
    if (f(m) > 0) hi = m;
    else lo = m;
  }
  return 0.5 * (lo + hi);
}

// Open-water wavenumber: omega^2 = g k tanh(kH).
function openWavenumber(omega, H) {
  return solveDispersion((k) => G * k * Math.tanh(k * H) - omega * omega);
}

// Flexural-gravity wavenumber under the platform.
function plateWavenumber(omega, H, D, ms, rhoW) {
  return solveDispersion((k) => {
    const t = Math.tanh(k * H);
    return G * k * t * (1 + (D / (rhoW * G)) * Math.pow(k, 4)) - omega * omega * (1 + (ms / rhoW) * k * t);
  });
}

// Group speed dω/dk under the platform (for converting structural loss factor
// into a spatial attenuation rate).
function plateGroupSpeed(omega, H, D, ms, rhoW, k) {
  const w = (kk) => {
    const t = Math.tanh(kk * H);
    const num = G * kk * t * (1 + (D / (rhoW * G)) * Math.pow(kk, 4));
    const den = 1 + (ms / rhoW) * kk * t;
    return Math.sqrt(num / den);
  };
  const dk = k * 1e-4;
  return (w(k + dk) - w(k - dk)) / (2 * dk);
}

function directionalD(Dx, Dy, headingDeg) {
  const t = (headingDeg * Math.PI) / 180;
  const c2 = Math.cos(t) ** 2;
  const s2 = Math.sin(t) ** 2;
  return Dx * c2 * c2 + 2 * Math.sqrt(Dx * Dy) * c2 * s2 + Dy * s2 * s2;
}

// Attenuation rate (1/m) under the platform from the structural loss factor.
function plateAttenuation(omega, H, D, ms, rhoW, k, eta) {
  if (eta <= 0) return 0;
  const dFdD = (Math.pow(k, 5) * Math.tanh(k * H)) / rhoW;
  const res = (kk) => {
    const t = Math.tanh(kk * H);
    return G * kk * t * (1 + (D / (rhoW * G)) * Math.pow(kk, 4)) - omega * omega * (1 + (ms / rhoW) * kk * t);
  };
  const dk = k * 1e-5;
  const dFdk = (res(k + dk) - res(k - dk)) / (2 * dk);
  return Math.abs((eta * D * dFdD) / dFdk);
}

// Is world point (x,y) inside the rotated platform rectangle?
function makePlatformMask(plat) {
  const ca = Math.cos((-plat.angle * Math.PI) / 180);
  const sa = Math.sin((-plat.angle * Math.PI) / 180);
  const hx = plat.length / 2;
  const hy = plat.width / 2;
  return (x, y) => {
    const dx = x - plat.cx;
    const dy = y - plat.cy;
    const lx = dx * ca - dy * sa; // platform-local coords
    const ly = dx * sa + dy * ca;
    return Math.abs(lx) <= hx && Math.abs(ly) <= hy;
  };
}

// Run the time-domain solver. Returns Float64 P,Q so that
//   u(x,y,t) ≈ P*cos(omega t) + Q*sin(omega t).
function runSolver(cfg) {
  const { nx, ny, dx, dt, nSteps, accSteps, omega } = cfg;
  const N = nx * ny;
  const u0 = new Float64Array(N);
  const u1 = new Float64Array(N);
  const u2 = new Float64Array(N);
  const P = new Float64Array(N);
  const Q = new Float64Array(N);
  const c2 = cfg.c2;
  const gamma = cfg.gamma;
  const srcCol = cfg.srcCol;
  const srcMask = cfg.srcMask; // transverse profile along y at the source column
  const idt2 = dt * dt;
  const invdx2 = 1 / (dx * dx);

  const accStart = nSteps - accSteps;
  for (let n = 0; n < nSteps; n++) {
    const t = n * dt;
    const srcVal = Math.sin(omega * t);
    for (let i = 1; i < nx - 1; i++) {
      for (let j = 1; j < ny - 1; j++) {
        const idx = i * ny + j;
        const cC = c2[idx];
        const cxp = 0.5 * (cC + c2[idx + ny]);
        const cxm = 0.5 * (cC + c2[idx - ny]);
        const cyp = 0.5 * (cC + c2[idx + 1]);
        const cym = 0.5 * (cC + c2[idx - 1]);
        const lap =
          invdx2 *
          (cxp * (u1[idx + ny] - u1[idx]) - cxm * (u1[idx] - u1[idx - ny]) +
            cyp * (u1[idx + 1] - u1[idx]) - cym * (u1[idx] - u1[idx - 1]));
        let s = 0;
        if (i === srcCol) s = srcMask[j] * srcVal;
        const g = gamma[idx];
        u2[idx] = (2 * u1[idx] - (1 - g * dt) * u0[idx] + idt2 * (lap + s)) / (1 + g * dt);
      }
    }
    // Rotate buffers.
    u0.set(u1);
    u1.set(u2);

    if (n >= accStart) {
      const co = Math.cos(omega * (t + dt));
      const si = Math.sin(omega * (t + dt));
      for (let idx = 0; idx < N; idx++) {
        P[idx] += u1[idx] * co;
        Q[idx] += u1[idx] * si;
      }
    }
  }
  const scale = 2 / accSteps;
  for (let idx = 0; idx < N; idx++) {
    P[idx] *= scale;
    Q[idx] *= scale;
  }
  return { P, Q };
}

// Build everything, run a homogeneous reference solve (for incident-amplitude
// normalisation) and the actual solve, then return display-ready fields.
function computeScene(input, opts) {
  opts = opts || {};
  const omega = (2 * Math.PI) / input.T;
  const rhoW = 1000;

  const k0 = openWavenumber(omega, input.H);
  const lambda0 = (2 * Math.PI) / k0;
  const Deff = directionalD(input.Dx, input.Dy, input.heading);
  const kP = plateWavenumber(omega, input.H, Deff, input.ms, rhoW);
  const lambdaP = (2 * Math.PI) / kP;
  const cgP = plateGroupSpeed(omega, input.H, Deff, input.ms, rhoW, kP);
  const alphaP = plateAttenuation(omega, input.H, Deff, input.ms, rhoW, kP, input.eta);

  const c0 = omega / k0;
  const cP = omega / kP;
  const cMax = Math.max(c0, cP);

  // Grid: target ~9 points per shortest wavelength, capped for performance.
  const ppw = opts.ppw || 9;
  const maxN = opts.maxN || 170;
  const dxTarget = lambda0 / ppw;
  let nx = Math.min(maxN, Math.max(60, Math.round(input.domLx / dxTarget)));
  let ny = Math.min(maxN, Math.max(60, Math.round(input.domLy / dxTarget)));
  const dx = input.domLx / (nx - 1); // assume square cells (domLy/(ny-1) ≈ dx)
  const dt = 0.5 * (dx / (cMax * Math.SQRT2));

  // Sponge + source geometry.
  const pml = Math.max(8, Math.round(lambda0 / dx));
  const srcCol = pml + 2;
  const gammaMax = 3 * omega;

  // Field property arrays.
  const N = nx * ny;
  const c2 = new Float64Array(N);
  const gamma = new Float64Array(N);
  const inMask = new Uint8Array(N); // platform footprint (display)
  const platform = {
    cx: input.platCx,
    cy: input.platCy,
    length: input.platLen,
    width: input.platWid,
    angle: input.platAngle,
  };
  const insidePlatform = makePlatformMask(platform);

  const gammaPlate = alphaP * cgP; // temporal damping giving spatial decay alphaP
  const c2open = c0 * c0;
  const c2plate = cP * cP;

  for (let i = 0; i < nx; i++) {
    const x = i * dx;
    for (let j = 0; j < ny; j++) {
      const y = j * dx;
      const idx = i * ny + j;
      const inside = insidePlatform(x, y);
      inMask[idx] = inside ? 1 : 0;
      c2[idx] = inside ? c2plate : c2open;
      // Sponge ramp (quadratic) within pml cells of each edge.
      const dEdge = Math.min(i, nx - 1 - i, j, ny - 1 - j);
      let g = 0;
      if (dEdge < pml) {
        const r = (pml - dEdge) / pml;
        g = gammaMax * r * r;
      }
      if (inside) g += gammaPlate;
      gamma[idx] = g;
    }
  }

  // Transverse source profile: plane-wave amplitude, tapered into the y-sponges.
  const srcMask = new Float64Array(ny);
  for (let j = 0; j < ny; j++) {
    let taper = 1;
    if (j < pml) taper = j / pml;
    else if (j > ny - 1 - pml) taper = (ny - 1 - j) / pml;
    srcMask[j] = Math.max(0, taper);
  }

  // Time-stepping budget: enough to cross the basin a couple of times.
  const stepsPerPeriod = Math.max(12, Math.round(input.T / dt));
  let periods = Math.ceil((2.2 * input.domLx) / c0 / input.T) + 6;
  let nSteps = periods * stepsPerPeriod;
  const maxSteps = opts.maxSteps || 4200;
  if (nSteps > maxSteps) nSteps = maxSteps;
  const accSteps = 4 * stepsPerPeriod; // accumulate over final whole periods

  const cfg = { nx, ny, dx, dt, nSteps, accSteps, omega, c2, gamma, srcCol, srcMask };

  // Reference (no platform) solve -> incident amplitude for normalisation.
  const c2ref = new Float64Array(N).fill(c2open);
  const gammaRef = new Float64Array(N);
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      const idx = i * ny + j;
      const dEdge = Math.min(i, nx - 1 - i, j, ny - 1 - j);
      gammaRef[idx] = dEdge < pml ? gammaMax * ((pml - dEdge) / pml) ** 2 : 0;
    }
  const ref = runSolver({ ...cfg, c2: c2ref, gamma: gammaRef });

  // Incident amplitude: mean over a clean window downstream of the source.
  const iA = Math.round(nx * 0.25);
  const iB = Math.round(nx * 0.38);
  let sum = 0;
  let cnt = 0;
  for (let i = iA; i < iB; i++)
    for (let j = pml + 2; j < ny - pml - 2; j++) {
      const idx = i * ny + j;
      sum += Math.hypot(ref.P[idx], ref.Q[idx]);
      cnt++;
    }
  const incidentAmp = cnt > 0 ? sum / cnt : 1;
  const norm = incidentAmp > 1e-9 ? input.a / incidentAmp : 1;

  // Actual solve.
  const sol = runSolver(cfg);
  for (let idx = 0; idx < N; idx++) {
    sol.P[idx] *= norm;
    sol.Q[idx] *= norm;
  }

  // Metrics.
  let maxAmp = 0;
  for (let idx = 0; idx < N; idx++) {
    const amp = Math.hypot(sol.P[idx], sol.Q[idx]);
    if (amp > maxAmp) maxAmp = amp;
  }
  // Downstream shadow window (behind the platform, near its lee face).
  const downA = Math.round(nx * 0.66);
  const downB = Math.round(nx * 0.82);
  let dSum = 0;
  let dCnt = 0;
  let dMin = Infinity;
  for (let i = downA; i < downB; i++)
    for (let j = pml + 2; j < ny - pml - 2; j++) {
      const idx = i * ny + j;
      const amp = Math.hypot(sol.P[idx], sol.Q[idx]);
      dSum += amp;
      dCnt++;
      if (amp < dMin) dMin = amp;
    }
  const transmission = dCnt > 0 ? dSum / dCnt / input.a : 0;
  const shadowMin = isFinite(dMin) ? dMin / input.a : 0;

  return {
    nx, ny, dx, omega, P: sol.P, Q: sol.Q, inMask,
    k0, kP, lambda0, lambdaP, alphaP, cP, c0,
    a: input.a, maxAmp, transmission, shadowMin,
    domLx: input.domLx, domLy: input.domLy,
    platform, pml,
    cellsPerWaveOpen: lambda0 / Math.max(input.Lx, input.Ly),
    pointsPerWave: lambda0 / dx,
    D: Deff,
  };
}

window.Physics2D = { computeScene, directionalD };
