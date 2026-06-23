// main.js
// Wires the UI controls to the physics model, drives the cross-section
// animation, and renders the live charts.

(function () {
  const { computeModel, sweepPeriod } = window.IcePhysics;
  const { drawLineChart } = window.IceCharts;

  // ---- Control definitions -------------------------------------------------
  // id -> formatter for the value label shown next to each slider.
  const CONTROLS = {
    T: (v) => `${v.toFixed(1)} s`,
    a: (v) => `${v.toFixed(1)} m`,
    H: (v) => `${v.toFixed(0)} m`,
    h: (v) => `${v.toFixed(1)} m`,
    E: (v) => `${v.toFixed(1)} GPa`,
    nu: (v) => v.toFixed(2),
    rhoI: (v) => `${v.toFixed(0)} kg/m³`,
    rhoW: (v) => `${v.toFixed(0)} kg/m³`,
    speed: (v) => `${v.toFixed(2)}×`,
  };

  const inputs = {};
  for (const id of Object.keys(CONTROLS)) {
    inputs[id] = document.getElementById(id);
  }

  const PRESETS = {
    swell: { T: 12, a: 1.2, H: 200, h: 1.5, E: 5, nu: 0.3, rhoI: 917, rhoW: 1025 },
    storm: { T: 7, a: 3.5, H: 200, h: 2.5, E: 5, nu: 0.3, rhoI: 917, rhoW: 1025 },
    thinice: { T: 9, a: 1, H: 100, h: 0.4, E: 4, nu: 0.3, rhoI: 910, rhoW: 1025 },
  };

  // Typical flexural failure strain for sea ice, used as a reference line.
  const BREAKING_STRAIN = 5e-5;

  // ---- State ---------------------------------------------------------------
  let playing = true;
  let simTime = 0; // seconds of simulated time
  let lastFrame = performance.now();

  const scene = document.getElementById("scene");
  const sceneCtx = scene.getContext("2d");
  const chartWavelength = document.getElementById("chartWavelength");
  const chartStrain = document.getElementById("chartStrain");
  const readoutEl = document.getElementById("readout");

  function readInputs() {
    return {
      T: parseFloat(inputs.T.value),
      a: parseFloat(inputs.a.value),
      H: parseFloat(inputs.H.value),
      h: parseFloat(inputs.h.value),
      E: parseFloat(inputs.E.value),
      nu: parseFloat(inputs.nu.value),
      rhoI: parseFloat(inputs.rhoI.value),
      rhoW: parseFloat(inputs.rhoW.value),
    };
  }

  function updateLabels() {
    for (const id of Object.keys(CONTROLS)) {
      const ctrl = document.querySelector(`[data-control="${id}"] .val`);
      if (ctrl) ctrl.textContent = CONTROLS[id](parseFloat(inputs[id].value));
    }
  }

  // ---- Readout -------------------------------------------------------------
  function renderReadout(model) {
    const stats = [
      ["Wavelength (ice)", `${model.lambda.toFixed(1)}`, "m"],
      ["Wavelength (open water)", `${model.lambdaOpen.toFixed(1)}`, "m"],
      ["Phase speed", `${model.phaseSpeed.toFixed(1)}`, "m/s"],
      ["Group speed", `${model.groupSpeed.toFixed(1)}`, "m/s"],
      ["Max bending strain", `${(model.maxStrain * 1e3).toFixed(3)}`, "×10⁻³"],
      ["Flexural rigidity", `${model.D.toExponential(2)}`, "N·m"],
      ["Ice draft", `${model.draft.toFixed(2)}`, "m"],
      ["Freeboard", `${model.freeboard.toFixed(2)}`, "m"],
    ];
    readoutEl.innerHTML = stats
      .map(
        ([k, v, u]) =>
          `<div class="stat"><span class="k">${k}</span><span class="v">${v} <small>${u}</small></span></div>`
      )
      .join("");
  }

  // ---- Cross-section animation --------------------------------------------
  function drawScene(input, model) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = scene.clientWidth || scene.width;
    const cssH = (cssW * 420) / 900; // keep 900x420 aspect
    if (scene.width !== Math.round(cssW * dpr) || scene.height !== Math.round(cssH * dpr)) {
      scene.width = Math.round(cssW * dpr);
      scene.height = Math.round(cssH * dpr);
    }
    const ctx = sceneCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = cssW;
    const H = cssH;
    ctx.clearRect(0, 0, W, H);

    const yWater = H * 0.42; // mean waterline in pixels

    // Horizontal scale: show ~2.5 wavelengths across the canvas.
    const xSpan = Math.max(model.lambda * 2.5, 20); // metres across the view
    const mPerPxX = xSpan / W;

    // Vertical scale (exaggerated) so the wave is clearly visible.
    const verticalSpanM = Math.max(input.a * 2.2, input.h * 1.6, 1);
    const vScale = (H * 0.32) / verticalSpanM; // px per metre

    const k = model.k;
    const omega = model.omega;
    const draftPx = model.draft * vScale;
    const freeboardPx = model.freeboard * vScale;

    // Sky.
    const sky = ctx.createLinearGradient(0, 0, 0, yWater);
    sky.addColorStop(0, "#0c1622");
    sky.addColorStop(1, "#16263a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, yWater);

    // Surface displacement at a pixel column.
    const eta = (xPx) => {
      const xm = xPx * mPerPxX;
      return input.a * Math.cos(k * xm - omega * simTime);
    };

    // Ice underside path -> water body fill.
    const water = ctx.createLinearGradient(0, yWater, 0, H);
    water.addColorStop(0, "#2a6ea0");
    water.addColorStop(1, "#0e3354");
    ctx.fillStyle = water;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 2) {
      const bottomY = yWater + draftPx - eta(x) * vScale;
      ctx.lineTo(x, bottomY);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();

    // Ice sheet strip (between top and bottom surfaces).
    ctx.beginPath();
    for (let x = 0; x <= W; x += 2) {
      const topY = yWater - freeboardPx - eta(x) * vScale;
      if (x === 0) ctx.moveTo(x, topY);
      else ctx.lineTo(x, topY);
    }
    for (let x = W; x >= 0; x -= 2) {
      const bottomY = yWater + draftPx - eta(x) * vScale;
      ctx.lineTo(x, bottomY);
    }
    ctx.closePath();
    const iceGrad = ctx.createLinearGradient(0, yWater - freeboardPx - input.a * vScale, 0, yWater + draftPx);
    iceGrad.addColorStop(0, "#ffffff");
    iceGrad.addColorStop(1, "#bcd9ee");
    ctx.fillStyle = iceGrad;
    ctx.fill();
    ctx.strokeStyle = "#7fb4d8";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Mean waterline reference.
    ctx.strokeStyle = "#ffffff33";
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, yWater);
    ctx.lineTo(W, yWater);
    ctx.stroke();
    ctx.setLineDash([]);

    // Wave direction arrow + scale note.
    ctx.fillStyle = "#cfe3f5cc";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`→ wave travels right   |   view width ≈ ${xSpan.toFixed(0)} m   |   vertical scale ×${vScale.toFixed(0)} px/m`, 10, 8);
  }

  // ---- Charts --------------------------------------------------------------
  function renderCharts(input, model) {
    const sweep = sweepPeriod(input, 2, 25, 80);

    // Wavelength vs period.
    drawLineChart(chartWavelength, {
      series: [
        {
          color: "#58c4ff",
          label: "ice",
          data: sweep.periods.map((T, i) => ({ x: T, y: sweep.lambdaIce[i] })),
        },
        {
          color: "#ffd479",
          label: "open water",
          data: sweep.periods.map((T, i) => ({ x: T, y: sweep.lambdaOpen[i] })),
        },
      ],
      marker: { x: input.T, y: model.lambda, color: "#58c4ff" },
      xLabel: "Wave period (s)",
      yTickFormatter: (v) => `${Math.round(v)}`,
    });

    // Max bending strain vs period (×10⁻³).
    drawLineChart(chartStrain, {
      series: [
        {
          color: "#ff7a93",
          label: "max strain",
          data: sweep.periods.map((T, i) => ({ x: T, y: sweep.strain[i] * 1e3 })),
        },
      ],
      refLines: [
        { y: BREAKING_STRAIN * 1e3, color: "#ffd479", label: "typical breaking strain", dashed: true },
      ],
      marker: { x: input.T, y: model.maxStrain * 1e3, color: "#ff7a93" },
      xLabel: "Wave period (s)",
      yTickFormatter: (v) => v.toFixed(2),
    });
  }

  // ---- Main loop -----------------------------------------------------------
  function frame(now) {
    const dt = (now - lastFrame) / 1000;
    lastFrame = now;
    const speed = parseFloat(inputs.speed.value);
    if (playing) simTime += dt * speed;

    const input = readInputs();
    const model = computeModel(input);
    drawScene(input, model);
    requestAnimationFrame(frame);
  }

  // Recompute the (non-animated) panels when a parameter changes.
  function refreshStatic() {
    updateLabels();
    const input = readInputs();
    const model = computeModel(input);
    renderReadout(model);
    renderCharts(input, model);
  }

  // ---- Wiring --------------------------------------------------------------
  for (const id of Object.keys(CONTROLS)) {
    inputs[id].addEventListener("input", refreshStatic);
  }

  document.getElementById("playPause").addEventListener("click", (e) => {
    playing = !playing;
    e.target.textContent = playing ? "Pause" : "Play";
  });

  document.getElementById("reset").addEventListener("click", () => {
    simTime = 0;
  });

  document.querySelectorAll(".preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = PRESETS[btn.dataset.preset];
      if (!preset) return;
      for (const [id, val] of Object.entries(preset)) {
        if (inputs[id]) inputs[id].value = val;
      }
      refreshStatic();
    });
  });

  window.addEventListener("resize", refreshStatic);

  // ---- Init ----------------------------------------------------------------
  refreshStatic();
  requestAnimationFrame(frame);
})();
