# Ice Sheet on Water — Flexural-Gravity Wave Model

An interactive, browser-based model of a thin elastic **ice sheet floating on
water** and flexing under ocean waves. Adjust the wave and ice properties and
watch the ice sheet bend in real time, alongside live plots of wavelength and
bending strain.

🌐 **Live demo:** enable GitHub Pages (see below), then visit the published URL.

## What it models

The ice is treated as a thin elastic (Kirchhoff) plate resting on an inviscid,
incompressible fluid layer of finite depth. Linear potential-flow theory gives
the **flexural-gravity wave dispersion relation**:

```
omega^2 = g·k·tanh(k·H) · (1 + (D/(rhoW·g))·k^4)
          / (1 + (rhoI·h/rhoW)·k·tanh(k·H))
```

with flexural rigidity `D = E·h³ / (12·(1−ν²))`. Setting `D = 0` and `rhoI = 0`
recovers ordinary open-water waves, which the app draws for comparison.

For a given wave **period** the app solves this relation for the wavenumber
`k`, then derives:

- wavelength under the ice vs. in open water,
- phase and group speed,
- maximum surface **bending strain** (`(h/2)·a·k²`), compared against a typical
  sea-ice breaking strain,
- ice draft and freeboard from buoyancy.

## Controls

- **Wave:** period, amplitude, water depth
- **Ice sheet:** thickness, Young's modulus, Poisson's ratio, ice density,
  water density
- **Animation:** play/pause, speed, reset
- **Presets:** ocean swell, storm, thin ice

## Tech

Plain HTML/CSS/JavaScript with the Canvas 2D API. **No build step and no
external dependencies** — every file is served as-is.

```
index.html      markup + control panel
styles.css      styling
js/physics.js   dispersion solver + derived quantities
js/charts.js    minimal canvas line charts
js/main.js      UI wiring + animation loop
```

## Run locally

Just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy on GitHub Pages (from this branch)

These files live at the repository root and need no build, so GitHub Pages can
serve them directly:

1. Go to **Settings → Pages** in the repository.
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Set **Branch** to `claude/ice-sheet-wave-model-rl9cvz` and folder `/ (root)`,
   then **Save**.
4. Wait for the deployment, then open the published URL shown on that page.

The included `.nojekyll` file disables Jekyll processing so all assets are
served verbatim.

## Caveats

This is an educational tool using **linear** theory: small-amplitude waves, a
continuous (unbroken) ice sheet covering the water, and uniform ice properties.
The breaking-strain line is an indicative reference, not a calibrated fracture
criterion.
