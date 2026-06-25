// main.js — wires controls to the validated plate-scattering solver and draws
// the plots. Single-config solve (~5 ms) runs live; the period sweep refreshes
// on release.

(function () {
  const { solvePlateScattering, sweepPeriodPlate } = window.Plate;
  const { drawLineChart } = window.IceCharts;

  const CONTROLS = {
    T: (v) => `${v.toFixed(1)} s`,
    a: (v) => `${v.toFixed(2)} m`,
    H: (v) => `${v.toFixed(0)} m`,
    L: (v) => `${v.toFixed(0)} m`,
    D: (v) => `${Math.pow(10, v).toExponential(1)} N·m`,
    ms: (v) => `${v.toFixed(0)} kg/m²`,
    hIce: (v) => `${v.toFixed(1)} m`,
    eta: (v) => v.toFixed(2),
  };
  const inputs = {};
  for (const id of Object.keys(CONTROLS)) inputs[id] = document.getElementById(id);

  const energyEl = document.getElementById("energy");
  const readoutEl = document.getElementById("readout");
  const chartRT = document.getElementById("chartRT");
  const chartDefl = document.getElementById("chartDefl");
  const chartMoment = document.getElementById("chartMoment");

  const N_MODES = 12;
  const rhoW = 1025;

  function readInputs() {
    return {
      T: parseFloat(inputs.T.value),
      a: parseFloat(inputs.a.value),
      H: parseFloat(inputs.H.value),
      L: parseFloat(inputs.L.value),
      D: Math.pow(10, parseFloat(inputs.D.value)),
      ms: parseFloat(inputs.ms.value),
      hIce: parseFloat(inputs.hIce.value),
      eta: parseFloat(inputs.eta.value),
      rhoW,
    };
  }

  function updateLabels() {
    for (const id of Object.keys(CONTROLS))
      document.querySelector(`[data-control="${id}"] .val`).textContent = CONTROLS[id](
        parseFloat(inputs[id].value)
      );
  }

  function renderEnergy(s, input) {
    const refl = s.R * s.R;
    const trans = s.T * s.T;
    const abs = Math.max(0, s.absorbed);
    if (input.eta === 0) {
      const residual = Math.abs(1 - s.energy);
      energyEl.style.background = "#1f6f43";
      energyEl.innerHTML =
        `✓ <strong>Energy conserved</strong> — R² + T² = ${s.energy.toFixed(5)} ` +
        `(numerical residual ${residual.toExponential(1)}). ` +
        `Reflected ${(refl * 100).toFixed(0)}% · transmitted ${(trans * 100).toFixed(0)}%.`;
    } else {
      energyEl.style.background = "#26506f";
      energyEl.innerHTML =
        `<strong>Energy balance</strong> — reflected ${(refl * 100).toFixed(0)}% · ` +
        `transmitted ${(trans * 100).toFixed(0)}% · absorbed ${(abs * 100).toFixed(0)}% ` +
        `(loss factor η = ${input.eta.toFixed(2)}).`;
    }
  }

  function renderReadout(s) {
    const stats = [
      ["Reflection R", s.R.toFixed(3), "–"],
      ["Transmission T", s.T.toFixed(3), "–"],
      ["Open-water wavelength", s.lambdaOpen.toFixed(1), "m"],
      ["Wavelength under plate", s.lambdaPlate.toFixed(1), "m"],
      ["Max bending moment", s.maxMoment.toExponential(2), "N"],
      ["Max bending strain", s.maxStrain.toExponential(2), "–"],
      ["Mean drift force", (s.drift / 1e3).toFixed(2), "kN/m"],
      ["Absorbed power", (Math.max(0, s.absorbed) * 100).toFixed(0), "%"],
    ];
    readoutEl.innerHTML = stats
      .map(
        ([k, v, u]) =>
          `<div class="stat"><span class="k">${k}</span><span class="v">${v} <small>${u}</small></span></div>`
      )
      .join("");
  }

  function renderProfiles(s, input) {
    drawLineChart(chartDefl, {
      series: [{ color: "#58c4ff", data: s.xs.map((x, i) => ({ x, y: s.wAbs[i] })) }],
      xLabel: "x along plate (m)",
      yMin: 0,
      aspect: 0.55,
      yTickFmt: (v) => v.toFixed(2),
    });
    drawLineChart(chartMoment, {
      series: [{ color: "#ff7a93", data: s.xs.map((x, i) => ({ x, y: s.momentAbs[i] })) }],
      xLabel: "x along plate (m)",
      yMin: 0,
      aspect: 0.55,
      yTickFmt: (v) => v.toExponential(0),
    });
  }

  let sweepTimer = null;
  function renderSweep(input) {
    const sw = sweepPeriodPlate(input, 2, 18, 64, { N: N_MODES });
    drawLineChart(chartRT, {
      series: [
        { color: "#58c4ff", label: "R", data: sw.periods.map((T, i) => ({ x: T, y: sw.R[i] })) },
        { color: "#ffd479", label: "T", data: sw.periods.map((T, i) => ({ x: T, y: sw.T[i] })) },
        { color: "#8fd99a", label: "R²+T²", data: sw.periods.map((T, i) => ({ x: T, y: sw.energy[i] })) },
      ],
      refLines: [{ y: 1, color: "#3a5273", dashed: true }],
      marker: { x: input.T },
      xLabel: "Wave period (s)",
      yMin: 0,
      yMax: 1.1,
      aspect: 0.5,
      yTickFmt: (v) => v.toFixed(2),
    });
  }

  function refresh(full) {
    updateLabels();
    const input = readInputs();
    const s = solvePlateScattering(input, { N: N_MODES });
    renderEnergy(s, input);
    renderReadout(s);
    renderProfiles(s, input);
    if (full) renderSweep(input);
    else {
      // Update only the marker cheaply by scheduling a debounced sweep.
      clearTimeout(sweepTimer);
      sweepTimer = setTimeout(() => renderSweep(input), 120);
    }
  }

  for (const id of Object.keys(CONTROLS)) {
    inputs[id].addEventListener("input", () => refresh(false));
    inputs[id].addEventListener("change", () => refresh(true));
  }
  window.addEventListener("resize", () => refresh(true));

  refresh(true);
})();
