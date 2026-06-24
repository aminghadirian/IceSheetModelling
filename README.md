# Floating Platform Wake — 3D Wave Scattering (Screening Tool)

An interactive, browser-based **screening** model of how a *finite* floating
platform / array sitting in a larger water basin scatters an incoming wave:
**reflection** in front of it, **diffraction** around its edges, attenuation
under it, and the **downstream wake** (shadow zone and its recovery). Rendered
as an animated 3D water surface.

> ⚠️ **Screening tool, not a design-load tool.** It shows global wave-field
> behaviour and the wake. Extreme/nonlinear connector and mooring loads need
> local time-domain sub-modelling. See *Limits*.

## What it solves

A monochromatic wave field is computed by time-marching the single-frequency,
variable-coefficient **mild-slope wave equation** to periodic steady state:

```
u_tt = div( c(x,y)^2 · grad u ) − 2·gamma(x,y)·u_t + S(x,y,t)
```

- `c(x,y) = omega / k(x,y)` — local phase speed. Open water uses the
  open-water wavenumber `k0` (`omega² = g·k·tanh(kH)`); the platform footprint
  uses the **flexural-gravity** wavenumber `kP` (a longer wavelength). This
  reproduces the correct refraction, **reflection** at the platform edge,
  **diffraction** around it, and the **downstream shadow/wake**.
- `gamma` — dissipation: a structural loss term inside the platform (giving
  wave attenuation under it) plus **sponge layers** at the basin edges so the
  box behaves like open water (no spurious tank reflections).
- `S` — a soft line source launching the incident plane wave.

The solver runs **once per parameter change** (≈0.4–1.5 s), stores the complex
amplitude field `A(x,y)`, and the 3D surface then animates by phase-stepping
that stored field — so playback stays smooth without re-solving.

Because the run is **full 2D and time-domain**, it captures upstream reflection
and standing waves as well as the downstream wake (unlike a forward-marching
parabolic approximation).

### Why a continuum / "equivalent plate"?

A 300 × 400 m array of thousands of floaters and moorings is intractable
body-by-body. The platform is therefore homogenised into a region of modified
(complex) flexural-gravity wavenumber — **structure and hydrodynamics together,
with no per-floater RAO/QTF** (an isolated-body RAO is meaningless inside a
dense, hydrodynamically interacting, wave-attenuating array). The effective
`Dx, Dy, eta` and areal mass are the screening inputs.

## Visualisation

- **3D surface** — animated, shaded height field; the platform footprint is
  drawn in grey. Drag to orbit, scroll to zoom, *Reset camera* to recentre.
- **Top-down amplitude map** `|A|/a` — blue = sheltered, cyan ≈ incident,
  yellow/red = amplified (reflection / focusing). The shadow + edge diffraction
  lobes behind the platform are the wake.
- **Readouts** — open vs. under-platform wavelength, attenuation decay length,
  lee transmission, minimum shadow amplitude, peak amplification, solve time.
- **Validity banner** — grid points per wavelength and floater cells per
  wavelength (homogenisation check), updated live.

## Controls

Wave (period, amplitude, depth) · Basin (length × width) · Platform (size,
heading angle, position along x) · Equivalent plate (Dₓ, D_y as log₁₀ N·m, loss
factor η, areal mass) · Animation speed · **Solver quality** (fast / balanced /
fine — grid resolution vs. speed).

Defaults reflect a reservoir floating-PV case (16 m depth, T ≈ 3 s, small waves,
orthotropic plate from ~1.2 × 0.4 m floaters).

## Validity and limits (read this)

Trustworthy only when:

1. **Resolution** — ≳ 8 grid points per wavelength (banner flags this; raise
   *Solver quality* if marginal).
2. **Scale separation** — wavelength ≫ floater cell (≳ 6–10 cells/wavelength)
   for the equivalent-continuum to hold.
3. **Calibrated properties** — Dₓ, D_y, η, areal mass from a unit-cell
   sub-model; the defaults are placeholders.

Deliberately **not** modelled (need local nonlinear time-domain analysis):

- The platform is a region of modified wavenumber, **not** the full hydroelastic
  plate-edge conditions, so near-edge bending detail is approximate.
- Snap loads, connector gap/contact, tension-only / buckling asymmetry.
- Slow-drift mooring resonance, line dynamics, nonlinear catenary stiffness.
- Individual-floater and gap resonances; nonlinear/steep-wave effects.
- Single monochromatic frequency (no spectrum) and constant water depth.

Recommended workflow: **unit-cell sub-model → this global screening tool →
local time-domain sub-model at the hotspots it reveals.**

## Tech

Plain HTML/CSS/JavaScript, Canvas 2D. **No build step, no external
dependencies** (the 3D renderer is hand-rolled).

```
index.html         markup + controls
styles.css         styling
js/physics2d.js    dispersion + time-domain mild-slope scattering solver
js/render3d.js     dependency-free 3D height-field renderer + heatmap
js/main.js         UI wiring, solve orchestration, animation loop
```

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Deploy on GitHub Pages (from this branch)

1. Repository **Settings → Pages**.
2. **Source:** Deploy from a branch.
3. **Branch:** `claude/ice-sheet-wave-model-rl9cvz`, folder `/ (root)` → **Save**.
4. Open the published URL. (`.nojekyll` is included.)
