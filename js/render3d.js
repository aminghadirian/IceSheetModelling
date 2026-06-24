// render3d.js
// Dependency-free 3D height-field renderer (plain Canvas 2D) plus a top-down
// amplitude heatmap. The water surface is drawn as a shaded mesh with the
// finite platform marked; the camera orbits/zooms via mouse/touch.

(function () {
  const cam = { az: -0.7, pitch: 0.85, zoom: 1, autoFit: true };

  function attachControls(canvas, onChange) {
    let dragging = false;
    let lx = 0;
    let ly = 0;
    canvas.addEventListener("pointerdown", (e) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      cam.az += (e.clientX - lx) * 0.008;
      cam.pitch += (e.clientY - ly) * 0.006;
      cam.pitch = Math.max(0.12, Math.min(1.45, cam.pitch));
      lx = e.clientX;
      ly = e.clientY;
      if (onChange) onChange();
    });
    canvas.addEventListener("pointerup", (e) => {
      dragging = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        cam.zoom *= e.deltaY < 0 ? 1.1 : 0.9;
        cam.zoom = Math.max(0.3, Math.min(4, cam.zoom));
        if (onChange) onChange();
      },
      { passive: false }
    );
  }

  function resetView() {
    cam.az = -0.7;
    cam.pitch = 0.85;
    cam.zoom = 1;
  }

  // Downsample the solved complex field to a display mesh.
  function buildMesh(scene, maxDisp) {
    const md = Math.min(maxDisp, scene.nx);
    const nd = Math.min(maxDisp, scene.ny);
    const P = new Float64Array(md * nd);
    const Q = new Float64Array(md * nd);
    const mask = new Uint8Array(md * nd);
    for (let a = 0; a < md; a++) {
      const i = Math.round((a / (md - 1)) * (scene.nx - 1));
      for (let b = 0; b < nd; b++) {
        const j = Math.round((b / (nd - 1)) * (scene.ny - 1));
        const sidx = i * scene.ny + j;
        const didx = a * nd + b;
        P[didx] = scene.P[sidx];
        Q[didx] = scene.Q[sidx];
        mask[didx] = scene.inMask[sidx];
      }
    }
    return { md, nd, P, Q, mask };
  }

  // Draw the 3D surface at the given animation phase (radians).
  function drawSurface(canvas, scene, mesh, phase) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || canvas.width;
    const cssH = (cssW * 520) / 900;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = cssW;
    const H = cssH;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0a1320";
    ctx.fillRect(0, 0, W, H);

    const { md, nd, P, Q, mask } = mesh;
    const cphase = Math.cos(phase);
    const sphase = Math.sin(phase);

    // Heights in metres, plus vertical exaggeration so small waves are visible.
    const exag = (0.10 * scene.domLx) / Math.max(scene.maxAmp, 1e-3);
    const heights = new Float64Array(md * nd);
    for (let idx = 0; idx < md * nd; idx++) heights[idx] = (P[idx] * cphase + Q[idx] * sphase) * exag;

    const ca = Math.cos(cam.az);
    const sa = Math.sin(cam.az);
    const cp = Math.cos(cam.pitch);
    const sp = Math.sin(cam.pitch);

    // Fit scale.
    const span = Math.max(scene.domLx, scene.domLy);
    const scl = ((Math.min(W, H) * 0.78) / span) * cam.zoom;
    const cx = W * 0.5;
    const cy = H * 0.55;

    const sxArr = new Float64Array(md * nd);
    const syArr = new Float64Array(md * nd);
    const wzArr = new Float64Array(md * nd); // world height for shading/colour
    for (let a = 0; a < md; a++) {
      const X = (a / (md - 1) - 0.5) * scene.domLx;
      for (let b = 0; b < nd; b++) {
        const Y = (b / (nd - 1) - 0.5) * scene.domLy;
        const Z = heights[a * nd + b];
        const xr = X * ca - Y * sa;
        const yr = X * sa + Y * ca;
        const yr2 = yr * cp - Z * sp;
        const zr2 = yr * sp + Z * cp;
        const idx = a * nd + b;
        sxArr[idx] = cx + xr * scl;
        syArr[idx] = cy - zr2 * scl;
        wzArr[idx] = yr2; // depth
      }
    }

    // Build quads with average depth, then painter-sort (far first).
    const quads = [];
    const light = normalize3([-0.4, -0.5, 0.75]);
    for (let a = 0; a < md - 1; a++) {
      for (let b = 0; b < nd - 1; b++) {
        const i00 = a * nd + b;
        const i10 = (a + 1) * nd + b;
        const i01 = a * nd + (b + 1);
        const i11 = (a + 1) * nd + (b + 1);
        const depth = wzArr[i00] + wzArr[i10] + wzArr[i01] + wzArr[i11];
        // World-space normal (use the un-exaggerated geometry footprint).
        const dxw = scene.domLx / (md - 1);
        const dyw = scene.domLy / (nd - 1);
        const hz = heights;
        const nx = -(hz[i10] - hz[i00]) * dyw;
        const ny = -(hz[i01] - hz[i00]) * dxw;
        const nz = dxw * dyw;
        const nl = normalize3([nx, ny, nz]);
        const diff = Math.max(0, nl[0] * light[0] + nl[1] * light[1] + nl[2] * light[2]);
        const shade = 0.35 + 0.65 * diff;
        const isPlat = mask[i00] + mask[i10] + mask[i01] + mask[i11] >= 2;
        const avgH = 0.25 * (hz[i00] + hz[i10] + hz[i01] + hz[i11]) / exag; // back to metres
        quads.push({ i00, i10, i11, i01, depth, shade, isPlat, avgH });
      }
    }
    quads.sort((p, q) => p.depth - q.depth);

    const ampRef = Math.max(scene.maxAmp, 1e-3);
    for (const qd of quads) {
      ctx.beginPath();
      ctx.moveTo(sxArr[qd.i00], syArr[qd.i00]);
      ctx.lineTo(sxArr[qd.i10], syArr[qd.i10]);
      ctx.lineTo(sxArr[qd.i11], syArr[qd.i11]);
      ctx.lineTo(sxArr[qd.i01], syArr[qd.i01]);
      ctx.closePath();
      let col;
      if (qd.isPlat) {
        const s = qd.shade;
        col = `rgb(${Math.round(150 * s)},${Math.round(160 * s)},${Math.round(175 * s)})`;
      } else {
        // Water: blue base, crest -> lighter, trough -> darker.
        const t = Math.max(-1, Math.min(1, qd.avgH / ampRef));
        const r = 30 + 90 * Math.max(0, t);
        const g = 110 + 90 * Math.max(0, t) - 30 * Math.max(0, -t);
        const bl = 150 + 60 * Math.max(0, t) - 40 * Math.max(0, -t);
        const s = qd.shade;
        col = `rgb(${Math.round(r * s)},${Math.round(g * s)},${Math.round(bl * s)})`;
      }
      ctx.fillStyle = col;
      ctx.fill();
    }

    // Caption.
    ctx.fillStyle = "#cfe3f5cc";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("drag to orbit · scroll to zoom · → wave travels +x", 12, 18);
  }

  // Top-down amplitude heatmap (|A|/a), cheap, updated once per solve.
  function drawHeatmap(canvas, scene) {
    const nx = scene.nx;
    const ny = scene.ny;
    const ctx = canvas.getContext("2d");
    canvas.width = ny;
    canvas.height = nx;
    const img = ctx.createImageData(ny, nx);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const idx = i * ny + j;
        const amp = Math.hypot(scene.P[idx], scene.Q[idx]) / scene.a;
        const [r, g, b] = ampColor(amp);
        const p = ((nx - 1 - i) * ny + j) * 4; // flip so +x points up
        img.data[p] = r;
        img.data[p + 1] = g;
        img.data[p + 2] = b;
        img.data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // Platform outline.
    ctx.strokeStyle = "#ffffffcc";
    ctx.lineWidth = 0.6;
    const P = scene.platform;
    const ang = (-P.angle * Math.PI) / 180;
    const corners = [
      [P.length / 2, P.width / 2],
      [-P.length / 2, P.width / 2],
      [-P.length / 2, -P.width / 2],
      [P.length / 2, -P.width / 2],
    ].map(([lx, ly]) => {
      const wx = P.cx + lx * Math.cos(ang) + ly * Math.sin(ang);
      const wy = P.cy - lx * Math.sin(ang) + ly * Math.cos(ang);
      const jj = (wy / scene.domLy) * ny;
      const ii = nx - 1 - (wx / scene.domLx) * nx;
      return [jj, ii];
    });
    ctx.beginPath();
    corners.forEach(([jj, ii], n) => (n === 0 ? ctx.moveTo(jj, ii) : ctx.lineTo(jj, ii)));
    ctx.closePath();
    ctx.stroke();
  }

  // Blue (low) -> cyan/white (~incident) -> yellow/red (amplified).
  function ampColor(v) {
    const x = Math.max(0, Math.min(2, v));
    if (x < 1) {
      const t = x;
      return [Math.round(20 + 40 * t), Math.round(40 + 180 * t), Math.round(90 + 165 * t)];
    }
    const t = Math.min(1, x - 1);
    return [Math.round(60 + 195 * t), Math.round(220 - 120 * t), Math.round(255 - 230 * t)];
  }

  function normalize3(v) {
    const m = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / m, v[1] / m, v[2] / m];
  }

  window.Render3D = { attachControls, resetView, buildMesh, drawSurface, drawHeatmap };
})();
