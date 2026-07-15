# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page browser tool that solves the canonical **hydroelastic scattering
problem**: a linear water wave hitting a finite floating elastic plate
(homogenised model of a floating array / ice sheet / VLFS). It's solved by
**eigenfunction matching** (Fox & Squire / Meylan formulation) with proper
plate free-edge conditions, and self-validates every run via energy
conservation (`R² + T² = 1`).

Plain HTML/CSS/JavaScript, Canvas 2D. **No build step, no dependencies, no
package manager, no bundler.** Everything runs directly in the browser or in
plain Node.

## Running and validating

Serve locally (any static file server works):

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

There is no test suite or build/lint tooling — validate the physics directly
in Node by calling the solver and checking the energy-conservation identity:

```bash
node -e 'const{solvePlateScattering}=require("./js/plate.js");
  const s=solvePlateScattering({T:8,a:1,H:100,L:200,D:1e10,ms:100,eta:0,hIce:1,rhoW:1025},{N:12});
  console.log("R^2+T^2 =", s.energy);'
```

For undamped input (`eta: 0`), `energy` must equal `1` to ~1e-13. This is the
correctness check for *any* change to `js/plate.js` — run it (with a few
different `T`/`D`/`L`/`H` values) after touching the solver. Also sanity-check
known limits: a vanishingly small/soft plate should give `R→0, T→1`; a very
stiff/short plate should reflect strongly; damping (`eta > 0`) should give
`R² + T² < 1` with absorbed fraction increasing monotonically in `eta`.

`js/plate.js` exports via both `window.Plate` (browser) and `module.exports`
(Node), specifically to support this Node-based validation workflow without
any test framework.

## Architecture

Three files, cleanly separated by concern, loaded in this order from
`index.html`:

```
js/plate.js    physics: complex arithmetic, dispersion roots, eigenfunction
               matching, linear solve, R/T, deflection, moment, strain, drift
js/charts.js   minimal dependency-free canvas line-chart renderer
js/main.js     UI wiring: reads control inputs, calls the solver, renders
               the energy bar, readout stats, and the three charts
```

### The physics model (`js/plate.js`)

2D problem (x–z), constant depth `H`, free surface `z = 0`, three regions
along x:

```
Region I (x<0)     Region II (0<x<L)     Region III (x>L)
open water          floating plate        open water
incident + refl.    flexural-gravity      transmitted
```

Velocity potentials are expanded in depth eigenmodes
`cosh(k(z+H))/cosh(kH)`. Dispersion relations (`K = ω²/g`,
`β = D/(ρ_w g)`, `d = m_s/ρ_w`):

```
open water:  k·tanh(kH) = K
plate:       (β·k⁴ + 1 − d·K) · k·tanh(kH) = K
```

At each interface (`x=0`, `x=L`) the solver imposes continuity of potential
and horizontal velocity over the full depth (projected onto the water
modes), plus the plate's free-edge conditions — zero bending moment
(`w_xx = 0`) and zero shear (`w_xxx = 0`) at both plate ends. Structural
damping enters as `D → D(1 − iη)`. The resulting complex linear system is
assembled as five row-blocks (A: x=0 potential, B: x=0 velocity, C: x=L
potential, D: x=L velocity, E: the four free-edge conditions) and solved
with a hand-rolled complex Gaussian elimination (`solveComplex`) — there is
no external linear algebra library.

Key internal pieces, roughly in dependency order:

- **Complex arithmetic helpers** (`cx`, `cadd`, `cmul`, `cdiv`, `cexp`,
  `ccosh`, `ctanh`, …) — everything downstream operates on `{re, im}`
  objects, not native numbers, because the plate roots and the damped
  solution are complex.
- **`solveComplex`** — dense complex linear solve, partial pivoting.
- **`openRoots`** / **`plateRoots`** — find the real propagating root plus
  evanescent (and, for the plate, two complex) roots of each dispersion
  relation, via bisection (`bisect`), Newton iteration on complex functions
  (`newtonComplex`), and a Durand-Kerner quintic solver (`quinticRoots`)
  used to seed the plate's complex root pair.
- **`modeNorm`** / **`crossInner`** — the vertical-mode inner products used
  to project matching conditions onto each mode.
- **`solvePlateScattering(input, opts)`** — assembles and solves the linear
  system above, then derives `R`, `T`, energy residual, deflection profile
  `w(x)`, bending moment, max bending strain, and mean drift force. This is
  the one function that matters for physics correctness; `opts.N` controls
  the number of evanescent modes (accuracy vs. cost).
- **`sweepPeriodPlate`** — repeatedly calls `solvePlateScattering` across a
  period range for the R/T/energy-vs-period chart.

When modifying the matching-condition assembly (the row blocks in
`solvePlateScattering`), preserve the unknown-vector layout
(`idxR, idxA, idxB, idxT`) and re-run the energy-conservation check above —
a sign or indexing error there typically breaks `R² + T² = 1` immediately.

### UI layer (`js/main.js`)

An IIFE that binds slider inputs (`T`, `a`, `H`, `L`, `D`, `ms`, `hIce`,
`eta`) to `solvePlateScattering`. `D` is stored/edited as `log₁₀` in the UI
(`Math.pow(10, v)` on read) since flexural rigidity spans many orders of
magnitude. On every `input` event it does a fast single-config solve
(~5 ms) and redraws the energy bar, stat readout, and deflection/moment
profile charts; the more expensive period sweep (64 solves) is debounced
(120 ms) on `input` and run immediately on `change`/resize.

### Chart layer (`js/charts.js`)

`drawLineChart(canvas, opts)` is a minimal, generic canvas line-chart
renderer (axes, gridlines, optional reference lines, a vertical marker,
legend) — no plotting library. It knows nothing about the physics; `main.js`
maps solver output into `{x, y}` series before calling it.

## Conventions

- Keep the three-file separation: physics stays in `plate.js` (must remain
  loadable from both Node and the browser), rendering primitives stay
  generic in `charts.js`, and DOM/solver wiring stays in `main.js`.
- No build tooling is expected or wanted — don't add a bundler, package.json,
  or transpilation step for what is deliberately a zero-dependency static
  page.
- Every change to the solver must keep the energy-conservation identity
  intact for the undamped case; that check *is* the test suite here.

## Deploying

Deployed via GitHub Pages, serving directly from a branch (`.nojekyll` is
present so Pages doesn't run Jekyll on the raw HTML/CSS/JS). See README.md
for the exact Pages settings.
