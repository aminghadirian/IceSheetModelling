// main.js
// Wires the controls to the equivalent-plate screening model, drives the
// cross-section animation (wave attenuating into the array) and the live
// charts (amplitude + connector moment vs distance into the array).

(function () {
  const { computeArray, penetrationProfile } = window.IcePhysics;
  const { drawLineChart } = window.IceCharts;

  // Dx and Dy sliders are entered as log10 of the rigidity in N·m.
  const CONTROLS = {
    T: (v) => `${v.toFixed(1)} s`,
    a: (v) => `${v.toFixed(2)} m`,
    H: (v) => `${v.toFixed(0)} m`,
    heading: (v) => `${v.toFixed(0)}°`,
    Dx: (v) => `${fmtPow(v)} N·m`,
    Dy: (v) => `${fmtPow(v)} N·m`,
    eta: (v) => v.toFixed(2),
    ms: (v) => `${v.toFixed(0)} kg/m²`,
    arrayLen: (v) => `${v.toFixed(0)} m`,
    Lx: (v) => `${v.toFixed(1)} m`,
    Ly: (v) => `${v.toFixed(1)} m`,
    floatH: (v) => `${v.toFixed(2)} m`,
    speed: (v) => `${v.toFixed(2)}×`,
  };

  function fmtPow(log10v) {
    return Math.pow(10, log10v).toExponential(1);
  }

  const inputs = {};
  for (const id of Object.keys(CONTROLS)) inputs[id] = document.getElementById(id);

  let playing = true;
  let simTime = 0;
  let lastFrame = performance.now();

  const scene = document.getElementById("scene");
  const sceneCtx = scene.getContext("2d");
  const chartPenetration = document.getElementById("chartPenetration");
  const chartMoment = document.getElementById("chartMoment");
  const readoutEl = document.getElementById("readout");
  const validityEl = document.getElementById("validity");

  function readInputs() {
    return {
      T: parseFloat(inputs.T.value),
      a: parseFloat(inputs.a.value),
      H: parseFloat(inputs.H.value),
      heading: parseFloat(inputs.heading.value),
      Dx: Math.pow(10, parseFloat(inputs.Dx.value)),
      Dy: Math.pow(10, parseFloat(inputs.Dy.value)),
      eta: parseFloat(inputs.eta.value),
      ms: parseFloat(inputs.ms.value),
      arrayLen: parseFloat(inputs.arrayLen.value),
      Lx: parseFloat(inputs.Lx.value),
      Ly: parseFloat(inputs.Ly.value),
      floatH: parseFloat(inputs.floatH.value),
      rhoW: 1000, // fresh reservoir water
    };
  }

  function updateLabels() {
    for (const id of Object.keys(CONTROLS)) {
      const el = document.querySelector(`[data-control="${id}"] .val`);
      if (el) el.textContent = CONTROLS[id](parseFloat(inputs[id].value));
    }
  }

  // ---- Validity banner -----------------------------------------------------
  function renderValidity(model) {
    const map = {
      ok: ["#1f6f43", "✓ Homogenisation OK"],
      marginal: ["#7a5b16", "▲ Homogenisation marginal"],
      poor: ["#7a2233", "✕ Homogenisation breaks down"],
    };
    const [bg, label] = map[model.validity];
    validityEl.style.background = bg;
    validityEl.textContent =
      `${label} — ${model.cellsPerWave.toFixed(1)} cells per wavelength ` +
      `(λ = ${model.lambda.toFixed(1)} m, cell = ${model.cellAlong.toFixed(2)} m). ` +
      `Need ≳ 6–10 for the equivalent-plate continuum to be valid.`;
  }

  // ---- Readout -------------------------------------------------------------
  function renderReadout(model) {
    const drift = model.meanDriftPerWidth;
    const stats = [
      ["Wavelength in array", model.lambda.toFixed(1), "m"],
      ["Wavelength open water", model.lambdaOpen.toFixed(1), "m"],
      ["Phase speed", model.phaseSpeed.toFixed(2), "m/s"],
      ["Attenuation decay length", isFinite(model.decayLength) ? model.decayLength.toFixed(0) : "∞", "m"],
      ["Connector moment (front)", (model.connectorMoment / 1e3).toFixed(2), "kN·m"],
      ["Adjacent-cell rotation", model.relRotationDeg.toFixed(2), "°"],
      ["Char. flexural length ℓ", model.charLength.toFixed(1), "m"],
      ["Reflection coeff (crude)", model.R.toFixed(2), "–"],
      ["Mean drift / crest width", (drift / 1e3).toFixed(2), "kN/m"],
      ["Ice draft", model.draft.toFixed(3), "m"],
    ];
    readoutEl.innerHTML = stats
      .map(
        ([k, v, u]) =>
          `<div class="stat"><span class="k">${k}</span><span class="v">${v} <small>${u}</small></span></div>`
      )
      .join("");
  }

  // ---- Cross-section animation --------------------------------------------
  // Side view along the wave heading: the plate flexes and the wave amplitude
  // decays into the array. Vertical seams hint at discrete floater cells.
  function drawScene(input, model) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = scene.clientWidth || scene.width;
    const cssH = (cssW * 360) / 900;
    if (scene.width !== Math.round(cssW * dpr) || scene.height !== Math.round(cssH * dpr)) {
      scene.width = Math.round(cssW * dpr);
      scene.height = Math.round(cssH * dpr);
    }
    const ctx = sceneCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = cssW;
    const H = cssH;
    ctx.clearRect(0, 0, W, H);

    const yWater = H * 0.45;

    // Show enough of the array to see attenuation: a few decay lengths or a few
    // wavelengths, capped by the array length.
    const wantM = isFinite(model.decayLength)
      ? Math.min(model.decayLength * 3, input.arrayLen)
      : Math.min(model.lambda * 3, input.arrayLen);
    const xSpan = Math.max(wantM, model.lambda * 1.5, 10);
    const mPerPxX = xSpan / W;

    const verticalSpanM = Math.max(input.a * 2.4, input.floatH * 1.6, 0.4);
    const vScale = (H * 0.3) / verticalSpanM;

    const k = model.k;
    const omega = model.omega;
    const alpha = model.alpha;
    const draftPx = model.draft * vScale;
    const freeboardPx = model.freeboard * vScale;

    // Sky.
    const sky = ctx.createLinearGradient(0, 0, 0, yWater);
    sky.addColorStop(0, "#0c1622");
    sky.addColorStop(1, "#16263a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, yWater);

    // Surface elevation with attenuation into the array.
    const eta = (xPx) => {
      const xm = xPx * mPerPxX;
      const a = input.a * Math.exp(-alpha * xm);
      return a * Math.cos(k * xm - omega * simTime);
    };

    // Water body.
    const water = ctx.createLinearGradient(0, yWater, 0, H);
    water.addColorStop(0, "#2a6ea0");
    water.addColorStop(1, "#0e3354");
    ctx.fillStyle = water;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 2) ctx.lineTo(x, yWater + draftPx - eta(x) * vScale);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();

    // Plate strip.
    ctx.beginPath();
    for (let x = 0; x <= W; x += 2) {
      const topY = yWater - freeboardPx - eta(x) * vScale;
      if (x === 0) ctx.moveTo(x, topY);
      else ctx.lineTo(x, topY);
    }
    for (let x = W; x >= 0; x -= 2) ctx.lineTo(x, yWater + draftPx - eta(x) * vScale);
    ctx.closePath();
    ctx.fillStyle = "#e6f1fb";
    ctx.fill();
    ctx.strokeStyle = "#7fb4d8";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Floater seams (every cell spacing along the heading).
    const cellPx = model.cellAlong / mPerPxX;
    if (cellPx > 4) {
      ctx.strokeStyle = "#9bbdd6";
      ctx.lineWidth = 0.6;
      for (let xm = 0; xm <= xSpan; xm += model.cellAlong) {
        const x = xm / mPerPxX;
        const topY = yWater - freeboardPx - eta(x) * vScale;
        const botY = yWater + draftPx - eta(x) * vScale;
        ctx.beginPath();
        ctx.moveTo(x, topY);
        ctx.lineTo(x, botY);
        ctx.stroke();
      }
    }

    // Mean waterline.
    ctx.strokeStyle = "#ffffff33";
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(0, yWater);
    ctx.lineTo(W, yWater);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#cfe3f5cc";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(
      `→ wave into array (heading ${input.heading.toFixed(0)}°)   |   view ≈ ${xSpan.toFixed(0)} m   |   vert. ×${vScale.toFixed(0)}`,
      10,
      8
    );
  }

  // ---- Charts --------------------------------------------------------------
  function renderCharts(input, model) {
    const prof = penetrationProfile(input, model, 120);

    drawLineChart(chartPenetration, {
      series: [
        { color: "#58c4ff", label: "amplitude", data: prof.dist.map((x, i) => ({ x, y: prof.amp[i] })) },
      ],
      xLabel: "Distance into array (m)",
      yTickFormatter: (v) => v.toFixed(2),
    });

    drawLineChart(chartMoment, {
      series: [
        { color: "#ff7a93", label: "connector moment", data: prof.dist.map((x, i) => ({ x, y: prof.moment[i] })) },
      ],
      xLabel: "Distance into array (m)",
      yTickFormatter: (v) => v.toFixed(1),
    });
  }

  // ---- Loop ----------------------------------------------------------------
  function frame(now) {
    const dt = (now - lastFrame) / 1000;
    lastFrame = now;
    const speed = parseFloat(inputs.speed.value);
    if (playing) simTime += dt * speed;

    const input = readInputs();
    const model = computeArray(input);
    drawScene(input, model);
    requestAnimationFrame(frame);
  }

  function refreshStatic() {
    updateLabels();
    const input = readInputs();
    const model = computeArray(input);
    renderValidity(model);
    renderReadout(model);
    renderCharts(input, model);
  }

  for (const id of Object.keys(CONTROLS)) inputs[id].addEventListener("input", refreshStatic);

  document.getElementById("playPause").addEventListener("click", (e) => {
    playing = !playing;
    e.target.textContent = playing ? "Pause" : "Play";
  });
  document.getElementById("reset").addEventListener("click", () => {
    simTime = 0;
  });
  window.addEventListener("resize", refreshStatic);

  refreshStatic();
  requestAnimationFrame(frame);
})();
