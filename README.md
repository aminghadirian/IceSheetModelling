# Wave Scattering by a Floating Elastic Plate

A small, **physically rigorous** browser tool for the canonical hydroelastic
problem: scattering of a linear water wave by a **finite floating elastic
plate** (a homogenised model of a floating array / ice sheet / VLFS). It is
solved by **eigenfunction matching** with the proper plate free-edge conditions
and **validates itself** every run by checking energy conservation.

This deliberately replaces an earlier 2D/3D visualisation that, while
impressive, represented the platform only as a region of modified wavenumber —
not the actual floating-plate boundary value problem. Here every number maps to
a real physical quantity and is checked against `R² + T² = 1`.

## The model

2D problem (x–z), constant depth `H`, free surface `z = 0`, three regions:

```
 Region I (x<0)   |  Region II (0<x<L)  |  Region III (x>L)
 open water        |  floating plate      |  open water
 incident + refl.  |  flexural-gravity    |  transmitted
```

Velocity potentials are expanded in depth eigenmodes `cosh(k(z+H))/cosh(kH)`.
Dispersion relations (`K = ω²/g`, `β = D/(ρ_w g)`, `d = m_s/ρ_w`):

```
open water:  k·tanh(kH) = K
plate:       (β·k⁴ + 1 − d·K) · k·tanh(kH) = K
```

At each interface we impose continuity of potential and horizontal velocity over
the full depth (projected onto the water modes), **plus** the plate free-edge
conditions — zero bending moment `w_xx = 0` and zero shear `w_xxx = 0` at both
plate ends. The plate dispersion contributes one propagating, two complex and
many evanescent roots; structural damping enters as `D → D(1 − iη)`, which
dissipates energy. The resulting complex linear system is solved directly.

### Outputs (all physical, all from one solve)

- **Reflection `R` and transmission `T`** coefficients, vs. wave period.
- **Energy check** `R² + T²` — equals 1 with no damping (shown live; the
  numerical residual is ~10⁻¹³), and `1 − R² − T²` is the absorbed fraction
  when `η > 0`.
- **Deflection** profile `|w(x)|/a` along the plate.
- **Bending moment** `|M(x)| = D·|w_xx|` along the plate, and **maximum bending
  strain** `(h/2)·|w_xx|` → connector / fracture loads.
- **Mean drift force** per unit crest width (momentum estimate from `R`, `T`)
  for a mooring-load sanity check.

### Validation

The solver is verified in `node`:

- **Energy conservation** `R² + T² = 1` to ~10⁻¹³ across periods and stiffnesses
  (no damping).
- **Damping** gives `R² + T² < 1` with absorbed energy increasing monotonically
  with `η`.
- **Limits**: a vanishingly small or very soft plate is transparent
  (`R→0, T→1`); long waves pass through; short / stiff plates reflect strongly;
  the wavelength lengthens under the plate.

## Controls

Wave (period, amplitude, depth) · Plate (length, flexural rigidity `D` as
log₁₀ N·m, areal mass, section depth for strain, loss factor `η`).

## Scope and limits

- **Linear** theory, small amplitude, **single frequency**, constant depth,
  normal incidence, uniform plate properties.
- The plate is a **homogenised continuum**: effective `D`, areal mass and `η`
  must be calibrated from a unit-cell sub-model of the real floater + connector.
- Still **not** captured (needs local nonlinear time-domain analysis): snap
  loads, connector gap/contact, tension-only / buckling asymmetry, slow-drift
  mooring resonance, line dynamics, individual-floater resonances, oblique-sea
  spreading and irregular spectra.

Recommended workflow: **unit-cell sub-model → this validated global model →
local time-domain sub-model at the hotspots it reveals.**

## Tech

Plain HTML/CSS/JavaScript, Canvas 2D. **No build step, no dependencies.**

```
index.html      markup + controls
styles.css      styling
js/plate.js     complex arithmetic, dispersion roots, eigenfunction matching,
                linear solve, R/T, deflection, moment, strain, drift
js/charts.js    minimal canvas line charts
js/main.js      UI wiring + plotting
```

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

Validate the physics directly:

```bash
node -e 'const{solvePlateScattering}=require("./js/plate.js");
  const s=solvePlateScattering({T:8,a:1,H:100,L:200,D:1e10,ms:100,eta:0,hIce:1,rhoW:1025},{N:12});
  console.log("R^2+T^2 =", s.energy);'
```

## Deploy on GitHub Pages (from this branch)

1. Repository **Settings → Pages**.
2. **Source:** Deploy from a branch.
3. **Branch:** `claude/ice-sheet-wave-model-rl9cvz`, folder `/ (root)` → **Save**.
4. Open the published URL. (`.nojekyll` is included.)
