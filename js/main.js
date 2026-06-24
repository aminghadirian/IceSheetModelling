// main.js
// Orchestrates the 2D scattering solve and the 3D animation. Heavy solve runs
// on parameter change (slider release); the 3D surface then animates by
// phase-stepping the stored complex field, so playback stays smooth.

(function () {
  const { computeScene } = window.Physics2D;
  const R = window.Render3D;

  const CONTROLS = {
    T: (v) => `${v.toFixed(1)} s`,
    a: (v) => `${v.toFixed(2)} m`,
    H: (v) => `${v.toFixed(0)} m`,
    domLx: (v) => `${v.toFixed(0)} m`,
    domLy: (v) => `${v.toFixed(0)} m`,
    platLen: (v) => `${v.toFixed(0)} m`,
    platWid: (v) => `${v.toFixed(0)} m`,
    platAngle: (v) => `${v.toFixed(0)}°`,
    platCxFrac: (v) => `${Math.round(v * 100)}% in`,
    Dx: (v) => `${Math.pow(10, v).toExponential(1)} N·m`,
    Dy: (v) => `${Math.pow(10, v).toExponential(1)} N·m`,
    eta: (v) => v.toFixed(2),
    ms: (v) => `${v.toFixed(0)} kg/m²`,
    speed: (v) => `${v.toFixed(2)}×`,
    quality: (v) => ["fast", "balanced", "fine"][v],
  };

  const inputs = {};
  for (const id of Object.keys(CONTROLS)) inputs[id] = document.getElementById(id);

  const scene3d = document.getElementById("scene3d");
  const heatmap = document.getElementById("heatmap");
  const legend = document.getElementById("legend");
  const readoutEl = document.getElementById("readout");
  const validityEl = document.getElementById("validity");
  const busyEl = document.getElementById("busy");

  let scene = null;
  let mesh = null;
  let playing = true;
  let phase = 0;
  let lastFrame = performance.now();
  let dirty = true;

  function readInputs() {
    const domLx = parseFloat(inputs.domLx.value);
    const domLy = parseFloat(inputs.domLy.value);
    const ang = parseFloat(inputs.platAngle.value);
    return {
      T: parseFloat(inputs.T.value),
      a: parseFloat(inputs.a.value),
      H: parseFloat(inputs.H.value),
      heading: ang, // incident wave is +x; platform heading relative to it
      Dx: Math.pow(10, parseFloat(inputs.Dx.value)),
      Dy: Math.pow(10, parseFloat(inputs.Dy.value)),
      eta: parseFloat(inputs.eta.value),
      ms: parseFloat(inputs.ms.value),
      Lx: 1.2,
      Ly: 0.4,
      domLx,
      domLy,
      platLen: parseFloat(inputs.platLen.value),
      platWid: parseFloat(inputs.platWid.value),
      platAngle: ang,
      platCx: domLx * parseFloat(inputs.platCxFrac.value),
      platCy: domLy * 0.5,
    };
  }

  function qualityOpts() {
    const q = parseInt(inputs.quality.value, 10);
    return [
      { maxN: 130, ppw: 7, maxSteps: 2600 },
      { maxN: 165, ppw: 8, maxSteps: 3400 },
      { maxN: 200, ppw: 9, maxSteps: 4200 },
    ][q];
  }

  function updateLabels() {
    for (const id of Object.keys(CONTROLS)) {
      const el = document.querySelector(`[data-control="${id}"] .val`);
      if (el) el.textContent = CONTROLS[id](parseFloat(inputs[id].value));
    }
  }

  // ---- Heavy recompute (debounced via busy overlay + rAF) ------------------
  function recompute() {
    busyEl.hidden = false;
    // Let the overlay paint before the blocking solve.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const input = readInputs();
        const t0 = performance.now();
        scene = computeScene(input, qualityOpts());
        mesh = R.buildMesh(scene, 76);
        const dt = Math.round(performance.now() - t0);
        R.drawHeatmap(heatmap, scene);
        renderReadout(scene, dt);
        renderValidity(scene);
        busyEl.hidden = true;
        dirty = false;
      })
    );
  }

  function renderValidity(s) {
    const ppw = s.pointsPerWave;
    const cpw = s.cellsPerWaveOpen;
    let bg = "#1f6f43";
    let label = "✓ Resolution & homogenisation OK";
    if (cpw < 6 || ppw < 6) {
      bg = "#7a2233";
      label = "✕ Under-resolved / homogenisation breaks down";
    } else if (cpw < 10 || ppw < 8) {
      bg = "#7a5b16";
      label = "▲ Marginal resolution";
    }
    validityEl.style.background = bg;
    validityEl.textContent =
      `${label} — ${ppw.toFixed(1)} grid points/wavelength, ` +
      `${cpw.toFixed(1)} floater cells/wavelength (λ open = ${s.lambda0.toFixed(1)} m, ` +
      `λ under platform = ${s.lambdaP.toFixed(1)} m).`;
  }

  function renderReadout(s, solveMs) {
    const stats = [
      ["Open-water wavelength", s.lambda0.toFixed(1), "m"],
      ["Wavelength under platform", s.lambdaP.toFixed(1), "m"],
      ["Phase speed (open)", s.c0.toFixed(2), "m/s"],
      ["Attenuation decay length", s.alphaP > 0 ? (1 / s.alphaP).toFixed(0) : "∞", "m"],
      ["Lee transmission |A|/a", s.transmission.toFixed(2), "–"],
      ["Min shadow |A|/a", s.shadowMin.toFixed(2), "–"],
      ["Max amplification |A|/a", (s.maxAmp / s.a).toFixed(2), "–"],
      ["Solve time", String(solveMs), "ms"],
    ];
    readoutEl.innerHTML = stats
      .map(
        ([k, v, u]) =>
          `<div class="stat"><span class="k">${k}</span><span class="v">${v} <small>${u}</small></span></div>`
      )
      .join("");
  }

  function drawLegend() {
    const ctx = legend.getContext("2d");
    const w = legend.width;
    const h = legend.height;
    for (let x = 0; x < w; x++) {
      const v = (x / w) * 2;
      const c = legendColor(v);
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.fillRect(x, 0, 1, h - 14);
    }
    ctx.fillStyle = "#9fb3c8";
    ctx.font = "10px system-ui";
    ctx.textAlign = "left";
    ctx.fillText("0", 0, h - 2);
    ctx.textAlign = "center";
    ctx.fillText("1 (incident)", w * 0.5, h - 2);
    ctx.textAlign = "right";
    ctx.fillText("2", w, h - 2);
  }
  function legendColor(v) {
    const x = Math.max(0, Math.min(2, v));
    if (x < 1) return [Math.round(20 + 40 * x), Math.round(40 + 180 * x), Math.round(90 + 165 * x)];
    const t = Math.min(1, x - 1);
    return [Math.round(60 + 195 * t), Math.round(220 - 120 * t), Math.round(255 - 230 * t)];
  }

  // ---- Animation loop ------------------------------------------------------
  function frame(now) {
    const dt = (now - lastFrame) / 1000;
    lastFrame = now;
    const speed = parseFloat(inputs.speed.value);
    if (playing) phase += dt * speed * 2.0;
    if (scene && mesh) R.drawSurface(scene3d, scene, mesh, phase);
    requestAnimationFrame(frame);
  }

  // ---- Wiring --------------------------------------------------------------
  for (const id of Object.keys(CONTROLS)) {
    inputs[id].addEventListener("input", () => {
      updateLabels();
      if (id === "speed") return; // no resolve needed
    });
    inputs[id].addEventListener("change", () => {
      if (id === "speed") return;
      recompute();
    });
  }

  document.getElementById("playPause").addEventListener("click", (e) => {
    playing = !playing;
    e.target.textContent = playing ? "Pause" : "Play";
  });
  document.getElementById("resetView").addEventListener("click", () => R.resetView());

  R.attachControls(scene3d, () => {});

  // ---- Init ----------------------------------------------------------------
  updateLabels();
  drawLegend();
  recompute();
  requestAnimationFrame(frame);
})();
