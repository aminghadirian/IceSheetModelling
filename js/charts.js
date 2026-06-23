// charts.js
// Minimal dependency-free 2D line charts drawn on a canvas. Each chart takes
// one or more series of {x, y} data, plus optional reference lines and a marker
// for the current operating point.

const CHART_COLORS = {
  axis: "#3a5273",
  text: "#9fb3c8",
  grid: "#243650",
};

// Set up a canvas backing store that matches its CSS size at devicePixelRatio,
// returning the 2D context and logical (CSS) width/height to draw in.
function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || canvas.width;
  const cssH = canvas.clientHeight || canvas.height;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: cssW, h: cssH };
}

function niceMax(v) {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const f = v / base;
  let nice;
  if (f <= 1) nice = 1;
  else if (f <= 2) nice = 2;
  else if (f <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}

// Draw a line chart.
//   opts: {
//     series: [{ data: [{x,y}], color, label }],
//     refLines: [{ y, color, label, dashed }],
//     marker: { x, y },              // highlighted current point
//     xLabel, yLabel,
//     yUnitFormatter: (v) => string  // for axis ticks / readouts
//   }
function drawLineChart(canvas, opts) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);

  const padL = 52;
  const padR = 12;
  const padT = 12;
  const padB = 34;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  // Determine data ranges.
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMax = 0;
  for (const s of opts.series) {
    for (const pt of s.data) {
      if (pt.x < xMin) xMin = pt.x;
      if (pt.x > xMax) xMax = pt.x;
      if (pt.y > yMax) yMax = pt.y;
    }
  }
  for (const r of opts.refLines || []) {
    if (r.y > yMax) yMax = r.y;
  }
  if (!isFinite(xMin)) {
    xMin = 0;
    xMax = 1;
  }
  yMax = niceMax(yMax * 1.05);

  const sx = (x) => padL + ((x - xMin) / (xMax - xMin || 1)) * plotW;
  const sy = (y) => padT + plotH - (y / yMax) * plotH;

  // Grid + y ticks.
  ctx.font = "11px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  const yTicks = 4;
  for (let i = 0; i <= yTicks; i++) {
    const yv = (yMax * i) / yTicks;
    const yp = sy(yv);
    ctx.strokeStyle = CHART_COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, yp);
    ctx.lineTo(w - padR, yp);
    ctx.stroke();
    ctx.fillStyle = CHART_COLORS.text;
    ctx.textAlign = "right";
    const label = opts.yTickFormatter ? opts.yTickFormatter(yv) : String(Math.round(yv * 100) / 100);
    ctx.fillText(label, padL - 6, yp);
  }

  // X ticks.
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const xTicks = 5;
  for (let i = 0; i <= xTicks; i++) {
    const xv = xMin + ((xMax - xMin) * i) / xTicks;
    const xp = sx(xv);
    ctx.fillStyle = CHART_COLORS.text;
    ctx.fillText(String(Math.round(xv)), xp, h - padB + 6);
  }

  // Axis labels.
  ctx.fillStyle = CHART_COLORS.text;
  ctx.textAlign = "center";
  ctx.fillText(opts.xLabel || "", padL + plotW / 2, h - 14);

  // Reference lines.
  for (const r of opts.refLines || []) {
    const yp = sy(r.y);
    ctx.strokeStyle = r.color || "#888";
    ctx.lineWidth = 1.5;
    ctx.setLineDash(r.dashed ? [5, 4] : []);
    ctx.beginPath();
    ctx.moveTo(padL, yp);
    ctx.lineTo(w - padR, yp);
    ctx.stroke();
    ctx.setLineDash([]);
    if (r.label) {
      ctx.fillStyle = r.color || "#888";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(r.label, padL + 4, yp - 2);
    }
  }

  // Series lines.
  for (const s of opts.series) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    s.data.forEach((pt, i) => {
      const xp = sx(pt.x);
      const yp = sy(pt.y);
      if (i === 0) ctx.moveTo(xp, yp);
      else ctx.lineTo(xp, yp);
    });
    ctx.stroke();
  }

  // Current-point marker.
  if (opts.marker) {
    const xp = sx(opts.marker.x);
    const yp = sy(opts.marker.y);
    ctx.strokeStyle = "#ffffff55";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(xp, padT);
    ctx.lineTo(xp, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = opts.marker.color || "#fff";
    ctx.beginPath();
    ctx.arc(xp, yp, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Legend.
  if (opts.series.some((s) => s.label)) {
    let lx = padL + 6;
    const ly = padT + 6;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (const s of opts.series) {
      if (!s.label) continue;
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, ly - 4, 14, 3);
      ctx.fillStyle = CHART_COLORS.text;
      ctx.fillText(s.label, lx + 18, ly);
      lx += 24 + ctx.measureText(s.label).width + 14;
    }
  }
}

window.IceCharts = { drawLineChart };
