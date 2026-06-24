# Floating Array — Equivalent-Plate Hydroelastic Screening Tool

A browser-based **screening** model for a large moored floating array (for
example a floating-PV field of thousands of small floaters) that is too large to
model body-by-body in a panel/mooring code. The array is treated as an
**equivalent orthotropic thin plate floating on water**, and the response is
solved with linear **flexural-gravity (hydroelastic)** theory.

> ⚠️ **This is a screening tool, not a design-load tool.** It gives global
> response, wave penetration and a first-pass connector-load distribution.
> Extreme and nonlinear loads (snap loads, connector gap/contact, slow-drift
> mooring response) require local time-domain sub-modelling. See *Limits* below.

## Why this approach

A 300 × 400 m array of thousands of floaters and thousands of mooring lines is
intractable as a discrete body-by-body model. Very large floating structures
(floating runways, pontoon bridges) are routinely reduced to an **equivalent
plate on water** — the same idea used here. Crucially, the model homogenises
the **structure and the hydrodynamics together**: there are *no per-floater
RAOs/QTFs* (an isolated-body RAO is meaningless inside a dense, hydrodynamically
interacting, wave-attenuating array). Instead the plate's own hydroelastic
dispersion supplies the fluid coupling.

## The model

Linear potential-flow theory for a thin plate on finite-depth water gives the
flexural-gravity dispersion relation:

```
omega^2 = g·k·tanh(k·H) · (1 + (D/(rhoW·g))·k^4)
          / (1 + (ms/rhoW)·k·tanh(k·H))
```

- `D`  — effective bending rigidity in the propagation direction [N·m]
- `ms` — areal mass of the array [kg/m²]
- `H`  — water depth, `k` wavenumber, `omega` angular frequency

**Orthotropy** (rectangular floaters ⇒ direction-dependent stiffness). For a
wave heading `theta` to the array x-axis, Huber's orthotropic approximation:

```
D(theta) = Dx·cos⁴θ + 2·√(Dx·Dy)·cos²θ·sin²θ + Dy·sin⁴θ
```

**Damping / attenuation.** A structural loss factor `eta` (complex rigidity
`D → D(1+i·eta)`) makes the wavenumber complex, giving spatial **attenuation**
of the wave into the array (amplitude `~ exp(-alpha·x)`). A 1-D propagating
flexural-gravity wave is otherwise conservative, so this dissipative decay is
controlled entirely by `eta` — the most uncertain input, to be calibrated.

**Outputs**

- Wavelength in the array vs. open water; phase/group speed.
- Attenuation decay length and amplitude-vs-distance into the array.
- **Connector loads**: bending moment per unit width `M = D·κ` from the wave
  curvature `κ = a·k²`, the per-connector moment over its tributary width, and
  the relative rotation between adjacent floaters.
- Crude leading-edge reflection coefficient and mean **drift force** per unit
  crest width (energy estimate) for a first mooring-load sanity check.
- A live **homogenisation-validity** check (cells per wavelength).

## Controls

- **Wave:** period, amplitude, water depth, heading.
- **Array (equivalent plate):** bending rigidity Dₓ and D_y (entered as log₁₀
  N·m), structural loss factor η, areal mass, array length.
- **Floater unit cell:** footprint Lₓ × L_y and height (set the cell spacing and
  buoyancy geometry).

Defaults reflect a reservoir floating-PV case: 16 m depth, T ≈ 3 s, small waves,
1.2 × 0.4 × 0.4 m floaters.

## Validity and limits (read this)

The equivalent-plate continuum is trustworthy only when:

1. **Scale separation** — wavelength ≫ floater cell (rule of thumb ≳ 6–10
   cells per wavelength; the app flags this live). Short, steep wind-sea on a
   small cell breaks the continuum and excites discrete/band-gap effects.
2. **Connections carry moment** — true here (floaters bend via their flap
   extensions), so a plate is appropriate. Pin-only connections would instead
   call for a tension/membrane model.
3. **Effective properties are calibrated** — Dₓ, D_y, η and `ms` must come from
   a detailed **unit-cell sub-model**; the defaults are placeholders.

What this tool **cannot** do (needs local nonlinear time-domain modelling):

- Snap loads, connector gaps/contact, tension-only / compression-buckling
  asymmetry.
- Slow-drift mooring resonance, line dynamics, seabed friction, nonlinear
  catenary stiffness.
- Edge/corner stress concentrations and mooring-attachment hotspots.
- Hydrodynamic gap resonances and individual-floater heave/pitch resonances.

Recommended workflow: **unit-cell sub-model → this global screening tool →
local time-domain sub-model at the hotspots** it identifies.

## Tech

Plain HTML/CSS/JavaScript with the Canvas 2D API. **No build step, no external
dependencies.**

```
index.html      markup + control panel
styles.css      styling
js/physics.js   dispersion solver, orthotropy, attenuation, connector loads
js/charts.js    minimal canvas line charts
js/main.js      UI wiring + animation loop
```

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Deploy on GitHub Pages (from this branch)

These files live at the repository root and need no build:

1. Repository **Settings → Pages**.
2. **Source:** Deploy from a branch.
3. **Branch:** `claude/ice-sheet-wave-model-rl9cvz`, folder `/ (root)` → **Save**.
4. Open the published URL shown on that page. (`.nojekyll` is included.)
