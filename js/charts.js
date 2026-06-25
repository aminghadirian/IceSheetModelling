// charts.js — minimal dependency-free canvas line charts.

const CHART_INK = "#9fb3c8";
const CHART_GRID = "#243650";

function setupCanvas(canvas, aspect) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || canvas.width;
  const cssH = cssW * (aspect || 0.6);
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
  const e = Math.floor(Math.log10(v));
  const b = Math.pow(10, e);
  const f = v / b;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * b;
}

// opts: { series:[{data:[{x,y}],color,label}], xLabel, yMax, yMin,
//         refLines:[{y,color,label,dashed}], marker:{x,y,color},
//         yTickFmt, aspect }
function drawLineChart(canvas, opts) {
  const { ctx, w, h } = setupCanvas(canvas, opts.aspect);
  ctx.clearRect(0, 0, w, h);
  const padL = 52, padR = 12, padT = 14, padB = 32;
  const pw = w - padL - padR, ph = h - padT - padB;

  let xMin = Infinity, xMax = -Infinity, yMax = opts.yMax || 0, yMin = opts.yMin || 0;
  for (const s of opts.series)
    for (const p of s.data) {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y > yMax) yMax = p.y;
      if (p.y < yMin) yMin = p.y;
    }
  for (const r of opts.refLines || []) if (r.y > yMax) yMax = r.y;
  if (!isFinite(xMin)) { xMin = 0; xMax = 1; }
  if (!opts.yMax) yMax = niceMax(yMax * 1.08);

  const sx = (x) => padL + ((x - xMin) / (xMax - xMin || 1)) * pw;
  const sy = (y) => padT + ph - ((y - yMin) / (yMax - yMin || 1)) * ph;

  ctx.font = "11px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i++) {
    const yv = yMin + ((yMax - yMin) * i) / 4;
    const yp = sy(yv);
    ctx.strokeStyle = CHART_GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, yp);
    ctx.lineTo(w - padR, yp);
    ctx.stroke();
    ctx.fillStyle = CHART_INK;
    ctx.textAlign = "right";
    ctx.fillText(opts.yTickFmt ? opts.yTickFmt(yv) : (Math.round(yv * 100) / 100).toString(), padL - 6, yp);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = 0; i <= 5; i++) {
    const xv = xMin + ((xMax - xMin) * i) / 5;
    ctx.fillStyle = CHART_INK;
    ctx.fillText((Math.round(xv * 10) / 10).toString(), sx(xv), h - padB + 6);
  }
  ctx.fillText(opts.xLabel || "", padL + pw / 2, h - 13);

  for (const r of opts.refLines || []) {
    const yp = sy(r.y);
    ctx.strokeStyle = r.color || "#888";
    ctx.lineWidth = 1.4;
    ctx.setLineDash(r.dashed ? [5, 4] : []);
    ctx.beginPath();
    ctx.moveTo(padL, yp);
    ctx.lineTo(w - padR, yp);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const s of opts.series) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    s.data.forEach((p, i) => (i ? ctx.lineTo(sx(p.x), sy(p.y)) : ctx.moveTo(sx(p.x), sy(p.y))));
    ctx.stroke();
  }
  if (opts.marker) {
    const xp = sx(opts.marker.x);
    ctx.strokeStyle = "#ffffff55";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(xp, padT);
    ctx.lineTo(xp, padT + ph);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const labelled = opts.series.filter((s) => s.label);
  if (labelled.length) {
    let lx = padL + 6;
    const ly = padT + 6;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (const s of labelled) {
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, ly - 4, 14, 3);
      ctx.fillStyle = CHART_INK;
      ctx.fillText(s.label, lx + 18, ly);
      lx += 26 + ctx.measureText(s.label).width + 12;
    }
  }
}

window.IceCharts = { drawLineChart };
