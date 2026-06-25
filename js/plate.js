// plate.js
// Scattering of a linear water wave by a FINITE floating thin elastic plate,
// solved by eigenfunction matching (Fox & Squire 1994; Meylan). This is the
// canonical, literature-benchmarked hydroelastic model. It is self-validating:
// with no structural damping, reflected + transmitted energy must satisfy
// R^2 + T^2 = 1.
//
// Geometry (2D, x-z), constant depth H, free surface z = 0, bed z = -H:
//   Region I   (x < 0):  open water, incident (+x) + reflected (-x)
//   Region II  (0<x<L):  water covered by the elastic plate
//   Region III (x > L):  open water, transmitted (+x)
//
// Potentials are expanded in depth eigenmodes cosh(k(z+H))/cosh(kH). At each
// interface we impose continuity of potential and horizontal velocity over the
// full depth (projected onto the water modes), plus the plate FREE-EDGE
// conditions (zero bending moment w_xx = 0 and zero shear w_xxx = 0) at x = 0
// and x = L.
//
// Dispersion relations (K = omega^2/g, beta = D/(rho_w g), d = m_s/rho_w):
//   open water:  k*tanh(kH) = K
//   plate:       (beta*q^4 + 1 - d*K) * q*tanh(qH) = K
// Plate roots: one real propagating, two complex (Re>0), and many imaginary
// (evanescent). Structural damping enters as D -> D(1+i*eta) (complex beta),
// shifting the plate roots off the real/imaginary axes and dissipating energy.

const G = 9.81;

// ---- Complex arithmetic ----------------------------------------------------
const cx = (re, im) => ({ re, im: im || 0 });
const cadd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const csub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
const cmul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cscale = (a, s) => ({ re: a.re * s, im: a.im * s });
function cdiv(a, b) {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}
const cabs = (a) => Math.hypot(a.re, a.im);
function cexp(a) {
  const e = Math.exp(a.re);
  return { re: e * Math.cos(a.im), im: e * Math.sin(a.im) };
}
function ccosh(a) {
  const p = cexp(a);
  const m = cexp({ re: -a.re, im: -a.im });
  return cscale(cadd(p, m), 0.5);
}
function csinh(a) {
  const p = cexp(a);
  const m = cexp({ re: -a.re, im: -a.im });
  return cscale(csub(p, m), 0.5);
}
const ctanh = (a) => cdiv(csinh(a), ccosh(a));
const cmulr = (a, r) => ({ re: a.re * r, im: a.im * r });

// ---- Complex dense linear solver (Gaussian elimination, partial pivot) -----
function solveComplex(A, b) {
  const n = b.length;
  const M = A.map((row, i) => row.slice().concat([b[i]]));
  for (let col = 0; col < n; col++) {
    let piv = col;
    let best = cabs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      const v = cabs(M[r][col]);
      if (v > best) { best = v; piv = r; }
    }
    if (piv !== col) { const tmp = M[piv]; M[piv] = M[col]; M[col] = tmp; }
    const d = M[col][col];
    for (let r = col + 1; r < n; r++) {
      const f = cdiv(M[r][col], d);
      for (let c = col; c <= n; c++) M[r][c] = csub(M[r][c], cmul(f, M[col][c]));
    }
  }
  const x = new Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c++) s = csub(s, cmul(M[r][c], x[c]));
    x[r] = cdiv(s, M[r][r]);
  }
  return x;
}

// ---- Dispersion roots ------------------------------------------------------
function bisect(f, lo, hi, iters) {
  let flo = f(lo);
  for (let i = 0; i < (iters || 200); i++) {
    const mid = 0.5 * (lo + hi);
    const fm = f(mid);
    if (flo * fm <= 0) hi = mid;
    else { lo = mid; flo = fm; }
  }
  return 0.5 * (lo + hi);
}

// Open-water roots: k0 real, then k_n = i*alpha_n (evanescent), n=1..N.
function openRoots(K, H, N) {
  const roots = [];
  // Real root of k tanh(kH) = K.
  let hi = 1e-3;
  while (hi * Math.tanh(hi * H) < K) hi *= 1.6;
  const k0 = bisect((k) => k * Math.tanh(k * H) - K, 1e-9, hi);
  roots.push(cx(k0, 0));
  // Imaginary roots: alpha*tan(alpha*H) = -K, alpha in ((n-1/2)pi/H, n*pi/H).
  for (let n = 1; n <= N; n++) {
    const lo = ((n - 0.5) * Math.PI) / H + 1e-7;
    const hiB = (n * Math.PI) / H - 1e-7;
    const a = bisect((al) => al * Math.tan(al * H) + K, lo, hiB);
    roots.push(cx(0, a));
  }
  return roots;
}

// Plate dispersion residual P(q) for complex q (beta may be complex w/ damping).
function plateResidual(q, beta, dK1, K, H) {
  // (beta*q^4 + (1 - d*K)) * q*tanh(qH) - K
  const q2 = cmul(q, q);
  const q4 = cmul(q2, q2);
  const fac = cadd(cmul(beta, q4), dK1); // dK1 = (1 - d*K) as complex
  const qt = cmul(q, ctanh(cmulr(q, H)));
  return csub(cmul(fac, qt), cx(K, 0));
}

function newtonComplex(q, fn) {
  for (let i = 0; i < 60; i++) {
    const f = fn(q);
    const h = (Math.abs(q.re) + Math.abs(q.im) + 1) * 1e-7;
    const dp = csub(fn(cadd(q, cx(h, 0))), fn(csub(q, cx(h, 0))));
    const der = cscale(dp, 1 / (2 * h));
    if (cabs(der) < 1e-30) break;
    const step = cdiv(f, der);
    q = csub(q, step);
    if (cabs(step) < 1e-12) break;
  }
  return q;
}

// Durand-Kerner roots of monic quintic q^5 + c1*q + c0 (real coeffs).
function quinticRoots(c1, c0) {
  let z = [];
  for (let i = 0; i < 5; i++) {
    const ang = (2 * Math.PI * i) / 5 + 0.4;
    z.push(cx(0.9 * Math.cos(ang), 0.9 * Math.sin(ang)));
  }
  const P = (q) => {
    const q2 = cmul(q, q);
    const q4 = cmul(q2, q2);
    const q5 = cmul(q4, q);
    return cadd(cadd(q5, cmulr(q, c1)), cx(c0, 0));
  };
  for (let it = 0; it < 200; it++) {
    let maxd = 0;
    for (let i = 0; i < 5; i++) {
      let den = cx(1, 0);
      for (let j = 0; j < 5; j++) if (j !== i) den = cmul(den, csub(z[i], z[j]));
      const corr = cdiv(P(z[i]), den);
      z[i] = csub(z[i], corr);
      maxd = Math.max(maxd, cabs(corr));
    }
    if (maxd < 1e-14) break;
  }
  return z;
}

// Plate roots: q0 real, 2 complex (Re>0), then i*tau_n (evanescent), n=1..N.
function plateRoots(K, H, beta0, dK1val, N, betaC) {
  const roots = [];
  // Real root with lossless beta0.
  let hi = 1e-3;
  const realRes = (q) => (beta0 * Math.pow(q, 4) + dK1val) * q * Math.tanh(q * H) - K;
  while (realRes(hi) < 0) hi *= 1.6;
  const q0 = bisect(realRes, 1e-9, hi);
  roots.push(cx(q0, 0));
  // Two complex roots: seed from deep-water quintic, refine with finite depth.
  const c1 = dK1val / beta0;
  const c0 = -K / beta0;
  const qz = quinticRoots(c1, c0).filter((r) => r.re > 1e-6 && Math.abs(r.im) > 1e-6);
  // Keep the two with smallest |Im| (the physical damped-propagating pair).
  qz.sort((a, b) => Math.abs(a.im) - Math.abs(b.im));
  const betaLoss = betaC || cx(beta0, 0);
  const dK1c = cx(dK1val, 0);
  for (let i = 0; i < 2 && i < qz.length; i++) {
    const q = newtonComplex(qz[i], (qq) => plateResidual(qq, cx(beta0, 0), dK1c, K, H));
    roots.push(q);
  }
  // Imaginary roots: (beta*tau^4 + dK1)*tau*tan(tauH) = -K.
  for (let n = 1; n <= N; n++) {
    const lo = ((n - 0.5) * Math.PI) / H + 1e-7;
    const hiB = (n * Math.PI) / H - 1e-7;
    const f = (tau) => (beta0 * Math.pow(tau, 4) + dK1val) * tau * Math.tan(tau * H) + K;
    const tau = bisect(f, lo, hiB);
    roots.push(cx(0, tau));
  }
  // If damped, polish every plate root with the complex beta.
  if (betaC && (betaC.im !== 0)) {
    for (let i = 0; i < roots.length; i++) {
      roots[i] = newtonComplex(roots[i], (qq) => plateResidual(qq, betaC, dK1c, K, H));
    }
  }
  return roots;
}

// Vertical-mode self inner product N_n = (2kH + sinh(2kH)) / (4 k cosh^2(kH)).
function modeNorm(k, H) {
  const kH = cmulr(k, H);
  const num = cadd(cmulr(k, 2 * H), csinh(cmulr(kH, 2)));
  const ch = ccosh(kH);
  const den = cmul(cmulr(k, 4), cmul(ch, ch));
  return cdiv(num, den);
}

// Cross inner product C(a,b) = (a tanh(aH) - b tanh(bH)) / (a^2 - b^2).
function crossInner(a, b, H) {
  const ta = cmul(a, ctanh(cmulr(a, H)));
  const tb = cmul(b, ctanh(cmulr(b, H)));
  const num = csub(ta, tb);
  const den = csub(cmul(a, a), cmul(b, b));
  return cdiv(num, den);
}

// ---- Main solve ------------------------------------------------------------
// input: { T, a, H, D, ms, eta, L, rhoW }   (D in N·m, ms in kg/m^2, L plate length)
// opts:  { N }  number of evanescent modes (default 10)
function solvePlateScattering(input, opts) {
  const N = (opts && opts.N) || 10;
  const rhoW = input.rhoW || 1025;
  const omega = (2 * Math.PI) / input.T;
  const K = (omega * omega) / G;
  const H = input.H;
  const L = input.L;
  const beta0 = input.D / (rhoW * G);
  const d = input.ms / rhoW;
  const dK1 = 1 - d * K;
  // Dissipative complex rigidity. With the e^{-i*omega*t} convention a decaying
  // wave needs Im(k) > 0, which requires D(1 - i*eta) here.
  const betaC = cx(beta0, -beta0 * input.eta);

  const kk = openRoots(K, H, N); // length N+1
  const qq = plateRoots(K, H, beta0, dK1, N, input.eta > 0 ? betaC : null); // length N+3
  const nW = kk.length; // N+1
  const Mp = qq.length; // N+3

  // Precompute per-mode quantities.
  const Nn = kk.map((k) => modeNorm(k, H));
  const C = kk.map((k) => qq.map((q) => crossInner(k, q, H))); // (N+1) x (N+3)
  const S = qq.map((q) => cmul(q, ctanh(cmulr(q, H)))); // q tanh(qH)
  const E = qq.map((q) => cexp(cmul(cx(0, 1), cmulr(q, L)))); // e^{i q L}
  const Einv = E.map((e) => cdiv(cx(1, 0), e));

  // Unknown layout: r_n (nW), a_m (Mp), b_m (Mp), t_n (nW).
  const nUnk = 2 * nW + 2 * Mp;
  const idxR = 0;
  const idxA = nW;
  const idxB = nW + Mp;
  const idxT = nW + 2 * Mp;
  const A = Array.from({ length: nUnk }, () => Array.from({ length: nUnk }, () => cx(0, 0)));
  const rhs = Array.from({ length: nUnk }, () => cx(0, 0));
  let row = 0;

  // Block A: x=0 potential continuity, projected on water mode n.
  for (let n = 0; n < nW; n++) {
    A[row][idxR + n] = Nn[n];
    for (let m = 0; m < Mp; m++) {
      A[row][idxA + m] = csub(A[row][idxA + m], C[n][m]);
      A[row][idxB + m] = csub(A[row][idxB + m], C[n][m]);
    }
    rhs[row] = n === 0 ? cscale(Nn[0], -1) : cx(0, 0);
    row++;
  }
  // Block B: x=0 horizontal velocity continuity.
  for (let n = 0; n < nW; n++) {
    A[row][idxR + n] = cmul(cx(0, -1), cmul(kk[n], Nn[n])); // -i k_n N_n
    for (let m = 0; m < Mp; m++) {
      const iqC = cmul(cx(0, 1), cmul(qq[m], C[n][m])); // i q_m C
      A[row][idxA + m] = csub(A[row][idxA + m], iqC);
      A[row][idxB + m] = cadd(A[row][idxB + m], iqC);
    }
    rhs[row] = n === 0 ? cmul(cx(0, -1), cmul(kk[0], Nn[0])) : cx(0, 0); // -i k0 N0 * delta
    row++;
  }
  // Block C: x=L potential continuity.
  for (let n = 0; n < nW; n++) {
    for (let m = 0; m < Mp; m++) {
      A[row][idxA + m] = cmul(C[n][m], E[m]);
      A[row][idxB + m] = cmul(C[n][m], Einv[m]);
    }
    A[row][idxT + n] = cscale(Nn[n], -1);
    rhs[row] = cx(0, 0);
    row++;
  }
  // Block D: x=L horizontal velocity continuity.
  for (let n = 0; n < nW; n++) {
    for (let m = 0; m < Mp; m++) {
      const iq = cmul(cx(0, 1), qq[m]);
      A[row][idxA + m] = cmul(iq, cmul(C[n][m], E[m]));
      A[row][idxB + m] = cscale(cmul(iq, cmul(C[n][m], Einv[m])), -1);
    }
    A[row][idxT + n] = cmul(cx(0, -1), cmul(kk[n], Nn[n]));
    rhs[row] = cx(0, 0);
    row++;
  }
  // Block E: free-edge conditions (moment w_xx=0, shear w_xxx=0) at x=0 and x=L.
  const q2 = qq.map((q) => cmul(q, q));
  const q3 = qq.map((q, m) => cmul(q2[m], q));
  // x=0 moment.
  for (let m = 0; m < Mp; m++) {
    const w = cmul(S[m], q2[m]);
    A[row][idxA + m] = w;
    A[row][idxB + m] = w;
  }
  row++;
  // x=0 shear.
  for (let m = 0; m < Mp; m++) {
    const w = cmul(S[m], q3[m]);
    A[row][idxA + m] = w;
    A[row][idxB + m] = cscale(w, -1);
  }
  row++;
  // x=L moment.
  for (let m = 0; m < Mp; m++) {
    const w = cmul(S[m], q2[m]);
    A[row][idxA + m] = cmul(w, E[m]);
    A[row][idxB + m] = cmul(w, Einv[m]);
  }
  row++;
  // x=L shear.
  for (let m = 0; m < Mp; m++) {
    const w = cmul(S[m], q3[m]);
    A[row][idxA + m] = cmul(w, E[m]);
    A[row][idxB + m] = cscale(cmul(w, Einv[m]), -1);
  }
  row++;

  const X = solveComplex(A, rhs);
  const r0 = X[idxR];
  const t0 = X[idxT];
  const R = cabs(r0);
  const Tc = cabs(t0);

  // Deflection w(x) along the plate, normalised to incident amplitude a.
  // Incident surface amplitude (potential coeff 1) is K/omega; multiply by
  // a*omega/K to express |w|/a directly. w = (i/omega) * sum S_m (a_m e + b_m e^-).
  const am = X.slice(idxA, idxA + Mp);
  const bm = X.slice(idxB, idxB + Mp);
  const nx = 160;
  const xs = new Array(nx);
  const wAbs = new Array(nx); // |w|/a
  const momentAbs = new Array(nx); // |M| = |D w_xx| per unit width [N]
  const ampScale = (input.a * omega) / K; // potential->physical elevation, then /a handled below
  let maxStrain = 0;
  for (let ix = 0; ix < nx; ix++) {
    const x = (L * ix) / (nx - 1);
    let w = cx(0, 0);
    let wxx = cx(0, 0);
    for (let m = 0; m < Mp; m++) {
      const ph = cexp(cmul(cx(0, 1), cmulr(qq[m], x)));
      const phi = cdiv(cx(1, 0), ph);
      const comb = cadd(cmul(am[m], ph), cmul(bm[m], phi));
      const sm = S[m];
      w = cadd(w, cmul(sm, comb));
      wxx = cadd(wxx, cmul(sm, cmul(cscale(q2[m], -1), comb)));
    }
    // w currently = sum S_m(...). Physical elevation = (i/omega)*that*ampScale.
    const wPhys = cscale(cmul(cx(0, 1), w), ampScale / omega);
    const wxxPhys = cscale(cmul(cx(0, 1), wxx), ampScale / omega);
    xs[ix] = x;
    wAbs[ix] = cabs(wPhys) / input.a;
    const M = cabs(wxxPhys) * input.D; // |D w_xx|
    momentAbs[ix] = M;
    const strain = (input.hIce ? input.hIce / 2 : 0) * cabs(wxxPhys);
    if (strain > maxStrain) maxStrain = strain;
  }

  // Energy residual (lossless target: R^2+T^2=1; with damping, deficit=absorbed).
  const energy = R * R + Tc * Tc;
  const absorbed = 1 - energy;

  // Mean drift force per unit crest width (standard momentum estimate).
  const drift = 0.25 * rhoW * G * input.a * input.a * (1 + R * R - Tc * Tc);

  return {
    omega, K, k0: kk[0].re, lambdaOpen: (2 * Math.PI) / kk[0].re,
    qReal: qq[0].re, lambdaPlate: (2 * Math.PI) / qq[0].re,
    R, T: Tc, energy, absorbed, drift,
    xs, wAbs, momentAbs, maxStrain,
    maxMoment: Math.max(...momentAbs),
    N, Mp,
  };
}

// Sweep wave period; returns R, T, energy arrays for plotting.
function sweepPeriodPlate(input, Tmin, Tmax, n, opts) {
  const periods = [], Rv = [], Tv = [], Ev = [];
  for (let i = 0; i < n; i++) {
    const T = Tmin + ((Tmax - Tmin) * i) / (n - 1);
    const s = solvePlateScattering({ ...input, T }, opts);
    periods.push(T); Rv.push(s.R); Tv.push(s.T); Ev.push(s.energy);
  }
  return { periods, R: Rv, T: Tv, energy: Ev };
}

if (typeof window !== "undefined") {
  window.Plate = { solvePlateScattering, sweepPeriodPlate };
}
if (typeof module !== "undefined") {
  module.exports = { solvePlateScattering, sweepPeriodPlate };
}
