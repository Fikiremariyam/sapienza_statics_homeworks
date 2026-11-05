// Minimal canvas charts that follow the site theme.
// Usage:
//   Charts.histogram(canvas, values, { bins: 20, title: "Scores" });
//   Charts.lines(canvas, [{ name: "mean", data: [..] }], { xLabel: "n" });
window.Charts = (function () {
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function setup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h, pad: { l: 48, r: 16, t: 24, b: 36 } };
  }

  function axes(ctx, w, h, pad, xMin, xMax, yMin, yMax, opts) {
    ctx.strokeStyle = css("--line"); ctx.fillStyle = css("--muted");
    ctx.font = "11px 'JetBrains Mono', monospace"; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (h - pad.t - pad.b) * (i / 4);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      const v = yMax - (yMax - yMin) * (i / 4);
      ctx.textAlign = "right"; ctx.fillText(fmt(v), pad.l - 6, y + 4);
    }
    ctx.textAlign = "center";
    ctx.fillText(fmt(xMin), pad.l, h - pad.b + 16);
    ctx.fillText(fmt(xMax), w - pad.r, h - pad.b + 16);
    if (opts.xLabel) ctx.fillText(opts.xLabel, (w + pad.l) / 2, h - 6);
    if (opts.title) { ctx.textAlign = "left"; ctx.fillStyle = css("--ink"); ctx.fillText(opts.title, pad.l, 14); }
  }

  const fmt = v => typeof v !== "number" ? String(v) : Math.abs(v) >= 1e6 ? v.toExponential(1) : Math.abs(v) >= 1000 ? Math.round(v).toString() : (+v.toFixed(2)).toString();

  function histogram(canvas, values, opts = {}) {
    const draw = () => {
      const { ctx, w, h, pad } = setup(canvas);
      if (!values.length) return;
      const bins = opts.bins || 20;
      const min = opts.min ?? Math.min(...values), max = opts.max ?? Math.max(...values);
      const width = (max - min) / bins || 1;
      const counts = new Array(bins).fill(0);
      values.forEach(v => { if (v >= min && v <= max) counts[Math.min(bins - 1, Math.floor((v - min) / width))]++; });
      // optional theoretical density opts.curve(x), scaled to counts
      const scale = values.length * width;
      const cx = [], cy = [];
      if (opts.curve) for (let i = 0; i <= 200; i++) { const x = min + (max - min) * i / 200; cx.push(x); cy.push(opts.curve(x) * scale); }
      const top = Math.max(...counts, ...cy, 1);
      axes(ctx, w, h, pad, min, max, 0, top, opts);
      const bw = (w - pad.l - pad.r) / bins;
      ctx.fillStyle = css("--accent");
      counts.forEach((c, i) => {
        const bh = (h - pad.t - pad.b) * (c / top);
        ctx.fillRect(pad.l + i * bw + (bw > 4 ? 1 : 0), h - pad.b - bh, Math.max(1, bw - (bw > 4 ? 2 : 0)), bh);
      });
      if (cx.length) {
        ctx.strokeStyle = css("--accent-2"); ctx.lineWidth = 2; ctx.beginPath();
        cx.forEach((x, i) => {
          const px = pad.l + (w - pad.l - pad.r) * ((x - min) / (max - min));
          const py = h - pad.b - (h - pad.t - pad.b) * (cy[i] / top);
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        });
        ctx.stroke();
      }
    };
    draw(); bind(canvas, draw);
  }

  function lines(canvas, series, opts = {}) {
    const draw = () => {
      const { ctx, w, h, pad } = setup(canvas);
      const all = series.flatMap(s => s.data);
      if (!all.length) return;
      const n = Math.max(...series.map(s => s.data.length));
      const yMin = opts.yMin ?? Math.min(...all), yMax = opts.yMax ?? Math.max(...all);
      axes(ctx, w, h, pad, opts.labels ? "" : (opts.xMin ?? 1), opts.labels ? "" : (opts.xMax ?? n), yMin, yMax, opts);
      if (opts.labels) {
        ctx.fillStyle = css("--muted"); ctx.textAlign = "center";
        opts.labels.forEach((lab, i) => {
          const x = pad.l + (w - pad.l - pad.r) * (n > 1 ? i / (n - 1) : 0);
          ctx.fillText(lab, x, h - pad.b + 16);
        });
      }
      const palette = [css("--accent"), css("--accent-2"), css("--ink"), css("--muted")];
      series.forEach((s, k) => {
        ctx.strokeStyle = s.color || palette[k % palette.length]; ctx.lineWidth = 1.5;
        ctx.beginPath();
        s.data.forEach((v, i) => {
          const x = pad.l + (w - pad.l - pad.r) * (n > 1 ? i / (n - 1) : 0);
          const y = pad.t + (h - pad.t - pad.b) * (1 - (v - yMin) / ((yMax - yMin) || 1));
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.stroke();
      });
    };
    draw(); bind(canvas, draw);
  }

  // counts: array of numbers; opts.labels: optional array of x labels (sparse ok)
  function bars(canvas, counts, opts = {}) {
    const draw = () => {
      const { ctx, w, h, pad } = setup(canvas);
      if (!counts.length) return;
      const top = opts.yMax ?? (Math.max(...counts) || 1);
      axes(ctx, w, h, pad, opts.xMin ?? 0, opts.xMax ?? counts.length - 1, opts.yMin ?? 0, top, opts);
      const bw = (w - pad.l - pad.r) / counts.length;
      counts.forEach((c, i) => {
        const bh = (h - pad.t - pad.b) * (Math.min(c, top) / top);
        ctx.fillStyle = opts.colorAt ? opts.colorAt(i) : css("--accent");
        ctx.fillRect(pad.l + i * bw + (bw > 4 ? 1 : 0), h - pad.b - bh, Math.max(1, bw - (bw > 4 ? 2 : 0)), bh);
      });
      if (opts.refLine != null) {
        const y = pad.t + (h - pad.t - pad.b) * (1 - opts.refLine / top);
        ctx.strokeStyle = css("--accent-2"); ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke(); ctx.setLineDash([]);
      }
    };
    draw(); bind(canvas, draw);
  }

  // points: [{x, y}]
  function scatter(canvas, points, opts = {}) {
    const draw = () => {
      const { ctx, w, h, pad } = setup(canvas);
      if (!points.length) return;
      const xs = points.map(p => p.x), ys = points.map(p => p.y);
      const xMin = opts.xMin ?? Math.min(...xs), xMax = opts.xMax ?? Math.max(...xs);
      const yMin = opts.yMin ?? Math.min(...ys), yMax = opts.yMax ?? Math.max(...ys);
      axes(ctx, w, h, pad, xMin, xMax, yMin, yMax, opts);
      ctx.fillStyle = css("--accent");
      const r = points.length > 2000 ? 1.5 : 3;
      points.forEach(p => {
        const x = pad.l + (w - pad.l - pad.r) * ((p.x - xMin) / ((xMax - xMin) || 1));
        const y = pad.t + (h - pad.t - pad.b) * (1 - (p.y - yMin) / ((yMax - yMin) || 1));
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      });
    };
    draw(); bind(canvas, draw);
  }

  function bind(canvas, draw) {
    if (canvas._redraw) {
      window.removeEventListener("resize", canvas._redraw);
      document.removeEventListener("themechange", canvas._redraw);
    }
    canvas._redraw = () => requestAnimationFrame(draw);
    window.addEventListener("resize", canvas._redraw);
    document.addEventListener("themechange", canvas._redraw);
  }

  return { histogram, lines, bars, scatter };
})();
