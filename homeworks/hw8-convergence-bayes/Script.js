/* =========================================================
   Homework 8 · Modes of convergence and Bayesian inference
   Fikiremariyam Babu Yalew · Statistics · Sapienza
   Plain JavaScript, no libraries. Every chart is drawn on a
   <canvas> from simulations or exact formulas.
   ========================================================= */
(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const MONO = '"JetBrains Mono", ui-monospace, monospace';
  const SANS = '"Inter", system-ui, sans-serif';

  /* ---------------------------------------------------------
     1. Random numbers (seeded, so pictures are reproducible)
     --------------------------------------------------------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeRng(seed) {
    const raw = mulberry32(seed >>> 0);
    let spare = null;
    const r = {
      u() { let x; do { x = raw(); } while (x === 0); return x; },       // (0, 1)
      normal() {                                                           // Box–Muller
        if (spare !== null) { const s = spare; spare = null; return s; }
        const a = r.u(), b = raw(), R = Math.sqrt(-2 * Math.log(a));
        spare = R * Math.sin(2 * Math.PI * b);
        return R * Math.cos(2 * Math.PI * b);
      },
      exp() { return -Math.log(r.u()); },
      cauchy() { return Math.tan(Math.PI * (r.u() - 0.5)); },
      bern(p) { return raw() < p ? 1 : 0; }
    };
    return r;
  }

  /* ---------------------------------------------------------
     2. Special functions
     --------------------------------------------------------- */
  // Complementary error function (Numerical Recipes erfcc, rel. error < 1.2e-7)
  function erfc(x) {
    const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
      t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
      t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }
  const Phi = x => 0.5 * erfc(-x / Math.SQRT2);           // standard normal CDF
  const Q = x => 0.5 * erfc(x / Math.SQRT2);              // upper tail 1 − Φ(x)
  const normPdf = (x, m = 0, s = 1) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
  const cauchyPdf = x => 1 / (Math.PI * (1 + x * x));
  const cauchyCdf = x => 0.5 + Math.atan(x) / Math.PI;

  // log Γ(x), Lanczos approximation (g = 7, n = 9)
  const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  function lgamma(x) {
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1;
    let a = LANCZOS[0];
    const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  const lbeta = (a, b) => lgamma(a) + lgamma(b) - lgamma(a + b);
  function betaPdf(x, a, b) {
    if (x <= 0 || x >= 1) return 0;
    return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - lbeta(a, b));
  }
  // Continued fraction for the incomplete beta (modified Lentz)
  function betacf(x, a, b) {
    const TINY = 1e-300, EPS = 1e-15;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < TINY) d = TINY;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 500; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  // Regularised incomplete beta I_x(a, b) = P(Beta(a, b) ≤ x)
  function betaInc(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const lbt = a * Math.log(x) + b * Math.log(1 - x) - lbeta(a, b);
    if (x < (a + 1) / (a + b + 2)) return Math.exp(lbt) * betacf(x, a, b) / a;
    return 1 - Math.exp(lbt) * betacf(1 - x, b, a) / b;
  }
  function betaQuantile(p, a, b) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 100; i++) {
      const mid = 0.5 * (lo + hi);
      if (betaInc(mid, a, b) < p) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
  }
  // Exact Var(X̄ₙ) for a stationary AR(1) sequence with unit variance
  function varMeanAR1(n, rho) {
    let s = n, rk = 1;
    for (let k = 1; k < n; k++) { rk *= rho; s += 2 * (n - k) * rk; }
    return s / (n * n);
  }
  const idsPosterior = (prior, sens, spec) => sens * prior / (sens * prior + (1 - spec) * (1 - prior));

  /* ---------------------------------------------------------
     3. Small canvas plotting toolkit
     --------------------------------------------------------- */
  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  function colors() {
    return {
      ink: cssVar("--ink", "#1f1a33"), muted: cssVar("--muted", "#6b6785"), line: cssVar("--line", "#e7e2f3"),
      bg: cssVar("--bg", "#faf9fe"), surface: cssVar("--surface", "#ffffff"),
      accent: cssVar("--accent", "#7c3aed"), soft: cssVar("--accent-soft", "#f1eafe"),
      pink: cssVar("--accent-2", "#db2777"),
      blue: "#2563eb", red: "#dc2626", green: "#059669", orange: "#ea580c", teal: "#0d9488", amber: "#d97706"
    };
  }
  function setup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth || 600, H = canvas.clientHeight || 300;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    return { ctx, W, H };
  }
  function niceTicks(a, b, count) {
    const raw = (b - a) / count, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    const st = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
    const out = [];
    for (let v = Math.ceil(a / st - 1e-9) * st; v <= b + st * 1e-9; v += st) out.push(Math.abs(v) < st * 1e-9 ? 0 : v);
    return out;
  }
  function logTicks(a, b) {
    const out = [];
    for (let e = Math.floor(Math.log10(a)); e <= Math.ceil(Math.log10(b)); e++)
      for (const m of [1, 2, 5]) { const v = m * Math.pow(10, e); if (v >= a * 0.999 && v <= b * 1.001) out.push(v); }
    if (out.length > 9) return out.filter(v => Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9);
    return out;
  }
  function tickLabel(v) {
    if (v === 0) return "0";
    const a = Math.abs(v);
    if (a >= 10000) return (v / 1000) + "k";
    if (a >= 1) return String(+v.toPrecision(4));
    return String(+v.toPrecision(3));
  }
  // Draws axes, grid and labels; returns coordinate mappers.
  function frame(canvas, o) {
    const { ctx, W, H } = setup(canvas);
    const c = colors();
    const pad = { l: o.padL || 54, r: 16, t: o.title ? 30 : 14, b: o.xlabel ? 42 : 26 };
    const fx = v => (o.xlog ? Math.log10(v) : v), fy = v => (o.ylog ? Math.log10(v) : v);
    const ax = fx(o.x[0]), bx = fx(o.x[1]), ay = fy(o.y[0]), by = fy(o.y[1]);
    const L = pad.l, R = W - pad.r, T = pad.t, B = H - pad.b;
    const X = v => L + (fx(v) - ax) / (bx - ax) * (R - L);
    const Y = v => B - (fy(v) - ay) / (by - ay) * (B - T);
    const F = { ctx, W, H, X, Y, L, R, T, B, c, xlog: !!o.xlog, ylog: !!o.ylog };

    ctx.lineWidth = 1;
    ctx.font = `11px ${MONO}`;
    const xt = o.xticks || (o.xlog ? logTicks(o.x[0], o.x[1]) : niceTicks(o.x[0], o.x[1], o.xn || 6));
    const yt = o.yticks || (o.ylog ? logTicks(o.y[0], o.y[1]) : niceTicks(o.y[0], o.y[1], o.yn || 5));
    ctx.strokeStyle = c.line; ctx.fillStyle = c.muted;
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (const v of xt) {
      const x = Math.round(X(v)) + 0.5;
      if (x < L - 1 || x > R + 1) continue;
      ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, B); ctx.stroke();
      ctx.fillText(o.xfmt ? o.xfmt(v) : tickLabel(v), x, B + 6);
    }
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (const v of yt) {
      const y = Math.round(Y(v)) + 0.5;
      if (y < T - 1 || y > B + 1) continue;
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke();
      ctx.fillText(o.yfmt ? o.yfmt(v) : tickLabel(v), L - 6, y);
    }
    ctx.strokeStyle = c.muted;
    ctx.beginPath(); ctx.moveTo(L + 0.5, T); ctx.lineTo(L + 0.5, B + 0.5); ctx.lineTo(R, B + 0.5); ctx.stroke();

    ctx.fillStyle = c.muted; ctx.font = `12px ${SANS}`;
    if (o.xlabel) { ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(o.xlabel, (L + R) / 2, H - 4); }
    if (o.ylabel) {
      ctx.save(); ctx.translate(13, (T + B) / 2); ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(o.ylabel, 0, 0); ctx.restore();
    }
    if (o.title) {
      ctx.fillStyle = c.ink; ctx.font = `600 13px ${SANS}`;
      ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText(o.title, L, 8);
    }
    return F;
  }
  function clip(F, fn) {
    const { ctx } = F;
    ctx.save(); ctx.beginPath(); ctx.rect(F.L, F.T, F.R - F.L, F.B - F.T); ctx.clip();
    fn(); ctx.restore();
  }
  const okY = (F, y) => Number.isFinite(y) && !(F.ylog && y <= 0);
  function poly(F, xs, ys, color, opt = {}) {
    const { ctx } = F;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = opt.w || 1.8; ctx.globalAlpha = opt.alpha ?? 1;
    ctx.setLineDash(opt.dash || []); ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath();
    let on = false;
    for (let i = 0; i < xs.length; i++) {
      if (!okY(F, ys[i])) { on = false; continue; }
      const px = F.X(xs[i]), py = F.Y(ys[i]);
      if (!on) { ctx.moveTo(px, py); on = true; } else ctx.lineTo(px, py);
    }
    ctx.stroke(); ctx.restore();
  }
  function area(F, xs, ys, color, alpha, base = 0) {
    const { ctx } = F;
    ctx.save(); ctx.fillStyle = color; ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.moveTo(F.X(xs[0]), F.Y(base));
    for (let i = 0; i < xs.length; i++) ctx.lineTo(F.X(xs[i]), F.Y(Number.isFinite(ys[i]) ? ys[i] : base));
    ctx.lineTo(F.X(xs[xs.length - 1]), F.Y(base)); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function dots(F, xs, ys, color, r = 3.2) {
    const { ctx } = F;
    ctx.save(); ctx.fillStyle = color;
    for (let i = 0; i < xs.length; i++) {
      if (!okY(F, ys[i])) continue;
      ctx.beginPath(); ctx.arc(F.X(xs[i]), F.Y(ys[i]), r, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.restore();
  }
  function vline(F, x, color, dash = [4, 4], w = 1.4) {
    const { ctx } = F;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(F.X(x), F.T); ctx.lineTo(F.X(x), F.B); ctx.stroke(); ctx.restore();
  }
  function hline(F, y, color, dash = [4, 4], w = 1.4) {
    const { ctx } = F;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(F.L, F.Y(y)); ctx.lineTo(F.R, F.Y(y)); ctx.stroke(); ctx.restore();
  }
  function bars(F, edges, heights, color, alpha = 0.55) {
    const { ctx } = F;
    ctx.save(); ctx.fillStyle = color; ctx.globalAlpha = alpha;
    for (let i = 0; i < heights.length; i++) {
      const x0 = F.X(edges[i]), x1 = F.X(edges[i + 1]), y = F.Y(heights[i]);
      ctx.fillRect(x0 + 0.5, y, Math.max(0.5, x1 - x0 - 1), F.B - y);
    }
    ctx.restore();
  }
  // items: [{label, color, dash, box}]
  function legend(F, items, where = "right") {
    const { ctx, c } = F;
    ctx.save(); ctx.font = `12px ${SANS}`;
    const rowH = 18, sw = 20;
    const wMax = Math.max(...items.map(it => ctx.measureText(it.label).width)) + sw + 22;
    const h = items.length * rowH + 10;
    const x0 = where === "left" ? F.L + 8 : F.R - wMax - 8, y0 = F.T + 8;
    ctx.globalAlpha = 0.92; ctx.fillStyle = c.surface; ctx.strokeStyle = c.line;
    ctx.fillRect(x0, y0, wMax, h); ctx.strokeRect(x0 + 0.5, y0 + 0.5, wMax - 1, h - 1);
    ctx.globalAlpha = 1;
    items.forEach((it, i) => {
      const y = y0 + 5 + rowH * i + rowH / 2;
      if (it.box) { ctx.fillStyle = it.color; ctx.globalAlpha = it.alpha ?? 0.6; ctx.fillRect(x0 + 8, y - 5, sw, 10); ctx.globalAlpha = 1; }
      else if (it.dot) { ctx.fillStyle = it.color; ctx.beginPath(); ctx.arc(x0 + 8 + sw / 2, y, 3.5, 0, 2 * Math.PI); ctx.fill(); }
      else {
        ctx.strokeStyle = it.color; ctx.lineWidth = 2; ctx.setLineDash(it.dash || []);
        ctx.beginPath(); ctx.moveTo(x0 + 8, y); ctx.lineTo(x0 + 8 + sw, y); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.fillStyle = c.ink; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(it.label, x0 + 14 + sw, y);
    });
    ctx.restore();
  }
  function note(F, text, x, y, color, align = "left") {
    const { ctx } = F;
    ctx.save(); ctx.font = `12px ${SANS}`; ctx.fillStyle = color || F.c.muted;
    ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.fillText(text, x, y); ctx.restore();
  }
  function histogram(values, lo, hi, bins) {
    const w = (hi - lo) / bins, counts = new Float64Array(bins), edges = [];
    for (let i = 0; i <= bins; i++) edges.push(lo + i * w);
    for (const v of values) { const k = Math.floor((v - lo) / w); if (k >= 0 && k < bins) counts[k]++; }
    const dens = Array.from(counts, c => c / (values.length * w));
    const mids = edges.slice(0, -1).map(e => e + w / 2);
    return { edges, dens, mids, w };
  }

  /* ---------------------------------------------------------
     4. Output helpers
     --------------------------------------------------------- */
  const fix = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : "—");
  function pct(x, d) {
    if (!Number.isFinite(x)) return "—";
    if (x === 0) return "0%";
    if (d === undefined) d = x < 0.001 ? 3 : x < 0.01 ? 2 : 1;
    return (100 * x).toFixed(d) + "%";
  }
  function kpis(el, items) {
    el.innerHTML = items.map(([label, value, hi]) =>
      `<div class="${hi ? "hi" : ""}"><span>${label}</span><strong>${value}</strong></div>`).join("");
  }
  function logGrid(N, count) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const n = Math.round(Math.pow(10, i / (count - 1) * Math.log10(N)));
      if (!out.length || n > out[out.length - 1]) out.push(n);
    }
    return out;
  }
  const linspace = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
  function schedule(fn) {
    let queued = false;
    return () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; fn(); }); };
  }

  /* =========================================================
     DEMO 1 · Convergence lab
     ========================================================= */
  const CV = { seed: 11, N: 200, M: 2000, key: "", data: null, kOf: null };
  CV.kOf = (() => {                       // block number k for typewriter index n
    const k = new Int32Array(CV.N + 1); let n = 1;
    for (let b = 1; n <= CV.N; b++) for (let j = 0; j < b && n <= CV.N; j++, n++) k[n] = b;
    return k;
  })();
  function cvGenerate(ex, seed) {
    const { N, M } = CV, r = makeRng(seed * 31 + ex.length), D = new Float64Array(M * (N + 1));
    for (let i = 0; i < M; i++) {
      const off = i * (N + 1);
      if (ex === "mean") {
        let s = 0;
        for (let n = 1; n <= N; n++) { s += r.u(); D[off + n] = s / n - 0.5; }
      } else if (ex === "typewriter") {
        const w = r.u(); let n = 1;
        for (let k = 1; n <= N; k++) for (let j = 0; j < k && n <= N; j++, n++) D[off + n] = (w >= j / k && w < (j + 1) / k) ? 1 : 0;
      } else if (ex === "spike") {
        const U = r.u();
        for (let n = 1; n <= N; n++) D[off + n] = U < 1 / n ? n : 0;
      } else {
        const X = r.normal();
        for (let n = 1; n <= N; n++) D[off + n] = -2 * X;
      }
    }
    return D;
  }
  const CV_TABLE = {
    mean: [
      ["Almost sure", true, "Strong LLN: the running mean of iid Uniform(0,1) draws converges to ½ for almost every ω."],
      ["In probability", true, "Implied by a.s. (and by L²): P(|X̄ₙ − ½| > ε) ≤ 1/(12nε²)."],
      ["Mean square", true, "E[(X̄ₙ − ½)²] = Var(X̄ₙ) = 1/(12n) → 0."],
      ["In distribution", true, "To the constant 0 (and √n·(X̄ₙ − ½) → N(0, 1/12) by the CLT)."]
    ],
    typewriter: [
      ["Almost sure", false, "Every ω is covered once in every block k, so Xₙ(ω) = 1 infinitely often: no path converges."],
      ["In probability", true, "P(Xₙ ≠ 0) = width of the block = 1/k → 0."],
      ["Mean square", true, "E[Xₙ²] = 1/k → 0. So L² does not imply a.s."],
      ["In distribution", true, "Implied by convergence in probability."]
    ],
    spike: [
      ["Almost sure", true, "For a fixed U > 0, Xₙ = 0 as soon as n > 1/U, and stays 0."],
      ["In probability", true, "P(Xₙ ≠ 0) = P(U < 1/n) = 1/n → 0."],
      ["Mean square", false, "E[Xₙ²] = n² · 1/n = n → ∞ (even E|Xₙ| = 1). Rare but huge values: a.s. does not imply L²."],
      ["In distribution", true, "Xₙ → 0 in distribution (point mass at 0)."]
    ],
    flip: [
      ["Almost sure", false, "Xₙ(ω) − X(ω) = −2X(ω) never changes with n."],
      ["In probability", false, "P(|Xₙ − X| > ε) = P(|X| > ε/2) is a constant, not → 0."],
      ["Mean square", false, "E[(Xₙ − X)²] = 4 for every n."],
      ["In distribution", true, "−X ~ N(0,1), the same law as X, so Fₙ = F for every n. Distributions agree, values do not."]
    ]
  };
  function cvRender() {
    const ex = $("cv-example").value, eps = +$("cv-eps").value;
    $("cv-eps-val").textContent = eps.toFixed(2);
    const key = ex + "|" + CV.seed;
    if (CV.key !== key) { CV.data = cvGenerate(ex, CV.seed); CV.key = key; }
    const { N, M, data: D, kOf } = CV;
    const ns = Array.from({ length: N }, (_, i) => i + 1);
    const prob = new Array(N), l2 = new Array(N);
    for (let n = 1; n <= N; n++) {
      let c = 0, s = 0;
      for (let i = 0; i < M; i++) { const d = D[i * (N + 1) + n]; if (Math.abs(d) > eps) c++; s += d * d; }
      prob[n - 1] = c / M; l2[n - 1] = s / M;
    }
    const thP = ns.map(n => ex === "mean" ? 2 * Q(eps * Math.sqrt(12 * n)) : ex === "typewriter" ? 1 / kOf[n] : ex === "spike" ? 1 / n : 2 * Q(eps / 2));
    const thL = ns.map(n => ex === "mean" ? 1 / (12 * n) : ex === "typewriter" ? 1 / kOf[n] : ex === "spike" ? n : 4);
    const c = colors();
    const pal = [c.accent, c.blue, c.orange, c.green, c.pink, c.teal, c.amber, c.red];

    // Paths
    const show = ex === "typewriter" ? 4 : 8;
    let ymin, ymax;
    if (ex === "mean") { ymin = -0.5; ymax = 0.5; }
    else if (ex === "typewriter") { ymin = -0.08; ymax = 1.2; }
    else {
      let m = 0;
      for (let i = 0; i < show; i++) for (let n = 1; n <= N; n++) m = Math.max(m, Math.abs(D[i * (N + 1) + n]));
      m = Math.max(m, 1);
      if (ex === "spike") { ymin = -0.05 * m; ymax = m * 1.1; } else { ymin = -m * 1.15; ymax = m * 1.15; }
    }
    const F = frame($("cv-paths"), { x: [1, N], y: [ymin, ymax], xlabel: "n", ylabel: "Xₙ(ω) − X(ω)",
      title: `${show} sample paths (one line = one outcome ω); shaded band = ±ε` });
    clip(F, () => {
      F.ctx.fillStyle = c.accent; F.ctx.globalAlpha = 0.12;
      F.ctx.fillRect(F.L, F.Y(eps), F.R - F.L, F.Y(-eps) - F.Y(eps)); F.ctx.globalAlpha = 1;
      hline(F, 0, c.muted, [2, 3], 1);
      for (let i = 0; i < show; i++) {
        const off = i * (N + 1), shift = ex === "typewriter" ? 0.035 * i : 0;
        const ys = ns.map(n => D[off + n] + shift);
        poly(F, ns, ys, pal[i], { w: ex === "typewriter" ? 1.4 : 1.6, alpha: 0.9 });
      }
    });

    // Probability of a big deviation
    const F2 = frame($("cv-prob"), { x: [1, N], y: [0, 1.02], xlabel: "n", title: "P( |Xₙ − X| > ε )", padL: 44 });
    clip(F2, () => { poly(F2, ns, thP, c.ink, { dash: [5, 4], w: 1.4, alpha: 0.7 }); poly(F2, ns, prob, c.accent, { w: 2 }); });
    legend(F2, [{ label: "simulation, 2,000 ω", color: c.accent }, { label: "exact", color: c.ink, dash: [5, 4] }]);

    // Mean square
    const lmax = Math.max(...thL, ...l2) * 1.1 || 1;
    const F3 = frame($("cv-l2"), { x: [1, N], y: [0, lmax], xlabel: "n", title: "E[ (Xₙ − X)² ]", padL: 44 });
    clip(F3, () => { poly(F3, ns, thL, c.ink, { dash: [5, 4], w: 1.4, alpha: 0.7 }); poly(F3, ns, l2, c.green, { w: 2 }); });
    legend(F3, [{ label: "simulation", color: c.green }, { label: "exact", color: c.ink, dash: [5, 4] }]);

    $("cv-table").innerHTML = CV_TABLE[ex].map(([m, ok, why]) =>
      `<tr><td>${m}</td><td class="${ok ? "yes" : "no"}">${ok ? "✓ yes" : "✗ no"}</td><td>${why}</td></tr>`).join("");
  }

  /* =========================================================
     DEMO 2 · Weak vs strong LLN
     ========================================================= */
  const LLN_D = {
    bern: { mu: 0.3, var: 0.21, h: 0.3, draw: r => r.bern(0.3) },
    unif: { mu: 0.5, var: 1 / 12, h: 0.3, draw: r => r.u() },
    exp: { mu: 1, var: 1, h: 0.9, draw: r => r.exp() },
    cauchy: { mu: 0, var: Infinity, h: 4, draw: r => r.cauchy() }
  };
  const LLN = { seed: 21, P: 400, show: 30, key: "", sim: null };
  function llnSimulate(dk, N, seed) {
    const d = LLN_D[dk], { P } = LLN, r = makeRng(seed * 7919 + N + dk.length);
    const grid = logGrid(N, 260), G = grid.length, gi = new Int32Array(N + 1).fill(-1);
    grid.forEach((n, i) => { gi[n] = i; });
    const DEV = new Float64Array(P * G), SUP = new Float64Array(P * G), dev = new Float64Array(N + 1);
    for (let p = 0; p < P; p++) {
      let s = 0;
      for (let m = 1; m <= N; m++) { s += d.draw(r); dev[m] = s / m - d.mu; }
      let sup = 0;
      for (let m = N; m >= 1; m--) {
        const a = Math.abs(dev[m]); if (a > sup) sup = a;
        const g = gi[m];
        if (g >= 0) { DEV[p * G + g] = dev[m]; SUP[p * G + g] = sup; }
      }
    }
    return { grid, G, DEV, SUP };
  }
  function llnRender() {
    const dk = $("lln-dist").value, eps = +$("lln-eps").value, N = +$("lln-n").value;
    $("lln-eps-val").textContent = eps.toFixed(2);
    const key = [dk, N, LLN.seed].join("|");
    if (LLN.key !== key) { LLN.sim = llnSimulate(dk, N, LLN.seed); LLN.key = key; }
    const { grid, G, DEV, SUP } = LLN.sim, d = LLN_D[dk], { P } = LLN, c = colors();
    const weak = new Array(G), strong = new Array(G);
    for (let g = 0; g < G; g++) {
      let a = 0, b = 0;
      for (let p = 0; p < P; p++) { if (Math.abs(DEV[p * G + g]) > eps) a++; if (SUP[p * G + g] > eps) b++; }
      weak[g] = a / P; strong[g] = b / P;
    }
    const pal = [c.accent, c.blue, c.orange, c.green, c.pink, c.teal];
    const F = frame($("lln-paths"), { x: [1, N], y: [d.mu - d.h, d.mu + d.h], xlog: true, xlabel: "n (log scale)", ylabel: "running mean X̄ₙ",
      title: dk === "cauchy" ? "30 running means of Cauchy data (band around the median 0)" : `30 running means; shaded band = μ ± ε, μ = ${d.mu}` });
    clip(F, () => {
      F.ctx.fillStyle = c.accent; F.ctx.globalAlpha = 0.13;
      F.ctx.fillRect(F.L, F.Y(d.mu + eps), F.R - F.L, F.Y(d.mu - eps) - F.Y(d.mu + eps)); F.ctx.globalAlpha = 1;
      for (let p = 0; p < LLN.show; p++) {
        const ys = new Array(G);
        for (let g = 0; g < G; g++) ys[g] = d.mu + DEV[p * G + g];
        poly(F, grid, ys, pal[p % pal.length], { w: 1.1, alpha: 0.65 });
      }
      hline(F, d.mu, c.ink, [5, 4], 1.4);
    });

    const F2 = frame($("lln-prob"), { x: [1, N], y: [0, 1.02], xlog: true, xlabel: "n (log scale)", ylabel: "probability", padL: 54 });
    clip(F2, () => {
      if (Number.isFinite(d.var)) poly(F2, grid, grid.map(n => Math.min(1, d.var / (n * eps * eps))), c.muted, { dash: [5, 4], w: 1.4 });
      poly(F2, grid, strong, c.red, { w: 2.2 });
      poly(F2, grid, weak, c.accent, { w: 2.2 });
    });
    const items = [{ label: "weak: P(|X̄ₙ − μ| > ε)", color: c.accent }, { label: `strong: P(sup over n ≤ m ≤ ${N.toLocaleString("en")} > ε)`, color: c.red }];
    if (Number.isFinite(d.var)) items.push({ label: "Chebyshev bound σ²/(nε²)", color: c.muted, dash: [5, 4] });
    legend(F2, items);

    const g0 = grid.findIndex(n => n >= N / 10), n0 = grid[g0];
    let meanEnd = 0;
    for (let p = 0; p < P; p++) meanEnd += d.mu + DEV[p * G + G - 1];
    kpis($("lln-out"), [
      [`weak P at n = ${n0.toLocaleString("en")}`, pct(weak[g0]), false],
      [`strong P from n = ${n0.toLocaleString("en")} on`, pct(strong[g0]), true],
      [`weak P at n = ${N.toLocaleString("en")}`, pct(weak[G - 1]), false],
      [`Chebyshev bound at n = ${n0.toLocaleString("en")}`, Number.isFinite(d.var) ? pct(Math.min(1, d.var / (n0 * eps * eps))) : "no variance", false],
      [dk === "cauchy" ? "spread of X̄ₙ at the end" : "average of 400 final means", dk === "cauchy" ? "does not shrink" : fix(meanEnd / P, 4), false]
    ]);
  }

  /* =========================================================
     DEMO 3 · CLT histogram
     ========================================================= */
  const CLT_NS = [1, 2, 3, 5, 10, 20, 30, 50, 100, 300, 1000];
  const CLT_D = {
    exp: { mu: 1, sd: 1, rho: 12 / Math.E - 2, skew: 2, draw: r => r.exp() },
    bern: { mu: 0.1, sd: 0.3, rho: 0.09 * (0.01 + 0.81), skew: 0.8 / 0.3, draw: r => r.bern(0.1) },
    unif: { mu: 0.5, sd: Math.sqrt(1 / 12), rho: 1 / 32, skew: 0, draw: r => r.u() },
    cauchy: { mu: 0, sd: NaN, draw: r => r.cauchy() }
  };
  const CLT = { seed: 31, R: 5000, key: "", z: null };
  function cltRender() {
    const dk = $("clt-dist").value, idx = +$("clt-n").value, n = CLT_NS[idx], d = CLT_D[dk], c = colors();
    $("clt-n-val").textContent = n;
    const key = [dk, n, CLT.seed].join("|");
    if (CLT.key !== key) {
      const r = makeRng(CLT.seed * 104729 + idx * 101 + dk.length), z = new Float64Array(CLT.R);
      for (let i = 0; i < CLT.R; i++) {
        let s = 0;
        for (let j = 0; j < n; j++) s += d.draw(r);
        z[i] = dk === "cauchy" ? s / n : Math.sqrt(n) * (s / n - d.mu) / d.sd;
      }
      z.sort(); CLT.z = z; CLT.key = key;
    }
    const z = CLT.z, R = z.length, cauchy = dk === "cauchy";
    const lo = cauchy ? -8 : -4, hi = -lo;
    const H = histogram(z, lo, hi, 64);
    const xs = linspace(lo, hi, 300);
    const ymax = Math.min(1.25, Math.max(0.45, ...H.dens) * 1.08);
    const F = frame($("clt-hist"), { x: [lo, hi], y: [0, ymax], xlabel: cauchy ? "X̄ₙ" : "Zₙ = √n (X̄ₙ − μ) / σ", ylabel: "density",
      title: cauchy ? `Cauchy: histogram of X̄ₙ for n = ${n} (it is standard Cauchy for every n)` : `Histogram of Zₙ for n = ${n} (5,000 samples)` });
    clip(F, () => {
      bars(F, H.edges, H.dens, c.accent, 0.45);
      if (cauchy) {
        poly(F, xs, xs.map(x => normPdf(x)), c.muted, { dash: [5, 4], w: 1.6 });
        poly(F, xs, xs.map(cauchyPdf), c.blue, { w: 2.2 });
      } else poly(F, xs, xs.map(x => normPdf(x)), c.blue, { w: 2.2 });
    });
    legend(F, cauchy
      ? [{ label: "simulated X̄ₙ", color: c.accent, box: true }, { label: "standard Cauchy", color: c.blue }, { label: "N(0, 1)", color: c.muted, dash: [5, 4] }]
      : [{ label: "simulated Zₙ", color: c.accent, box: true }, { label: "N(0, 1) density", color: c.blue }]);

    const ks = cdf => { let D = 0; for (let i = 0; i < R; i++) { const f = cdf(z[i]); D = Math.max(D, (i + 1) / R - f, f - i / R); } return D; };
    if (cauchy) {
      const medAbs = (Math.abs(z[Math.floor(R * 0.25)]) + Math.abs(z[Math.floor(R * 0.75)])) / 2;
      kpis($("clt-out"), [
        ["n", String(n), false],
        ["KS distance from Cauchy", fix(ks(cauchyCdf), 3), true],
        ["KS distance from N(0,1)", fix(ks(Phi), 3), false],
        ["half the IQR of X̄ₙ (Cauchy: 1)", fix(medAbs, 2), false],
        ["Why", "σ² = ∞: no CLT, no LLN", false]
      ]);
    } else {
      let m = 0, m2 = 0, m3 = 0;
      for (let i = 0; i < R; i++) m += z[i];
      m /= R;
      for (let i = 0; i < R; i++) { const e = z[i] - m; m2 += e * e; m3 += e * e * e; }
      const skew = (m3 / R) / Math.pow(m2 / R, 1.5);
      const be = Math.min(1, 0.4748 * d.rho / (Math.pow(d.sd, 3) * Math.sqrt(n)));
      kpis($("clt-out"), [
        ["n", String(n), false],
        ["KS distance D", fix(ks(Phi), 3), true],
        ["Berry–Esseen bound on D", fix(be, 3), false],
        ["skewness of Zₙ (simulated)", fix(skew, 2), false],
        ["skewness theory γ/√n", fix(d.skew / Math.sqrt(n), 2), false]
      ]);
    }
  }

  /* =========================================================
     DEMO 4 · Scaling by n^α
     ========================================================= */
  const SC = { seed: 41, ns: [10, 100, 1000], R: 3000, key: "", sums: null };
  function scRender() {
    const alpha = +$("sc-alpha").value, c = colors();
    $("sc-alpha-val").textContent = alpha.toFixed(2);
    const key = String(SC.seed);
    if (SC.key !== key) {
      const r = makeRng(SC.seed * 15485863);
      SC.sums = SC.ns.map(n => {
        const a = new Float64Array(SC.R);
        for (let i = 0; i < SC.R; i++) { let s = 0; for (let j = 0; j < n; j++) s += r.exp(); a[i] = s - n; }   // Sₙ − nμ, μ = σ = 1
        return a;
      });
      SC.key = key;
    }
    const cols = [c.orange, c.blue, c.accent];
    const hs = SC.sums.map((a, i) => histogram(Array.from(a, v => v / Math.pow(SC.ns[i], alpha)), -5, 5, 80));
    const top = Math.max(...hs.map(h => Math.max(...h.dens)));
    const ymax = Math.min(3, Math.max(0.45, top * 1.1));
    const F = frame($("sc-plot"), { x: [-5, 5], y: [0, ymax], xlabel: "(Sₙ − nμ) / n^α", ylabel: "density",
      title: `Exponential(1) data, scaled by n^${alpha.toFixed(2)}` + (top * 1.1 > ymax ? "  (peaks clipped)" : "") });
    clip(F, () => {
      if (Math.abs(alpha - 0.5) < 1e-9) poly(F, linspace(-5, 5, 300), linspace(-5, 5, 300).map(x => normPdf(x)), c.ink, { dash: [5, 4], w: 1.4 });
      hs.forEach((h, i) => poly(F, h.mids, h.dens, cols[i], { w: 2.2 }));
    });
    const items = SC.ns.map((n, i) => ({ label: `n = ${n.toLocaleString("en")}`, color: cols[i] }));
    if (Math.abs(alpha - 0.5) < 1e-9) items.push({ label: "N(0, 1)", color: c.ink, dash: [5, 4] });
    legend(F, items);
    kpis($("sc-out"), SC.ns.map((n, i) => {
      const a = SC.sums[i], s = Math.pow(n, alpha);
      let m2 = 0; for (const v of a) m2 += (v / s) ** 2;
      return [`SD at n = ${n.toLocaleString("en")} (theory n^(½−α))`, `${fix(Math.sqrt(m2 / a.length), 3)}  (${fix(Math.pow(n, 0.5 - alpha), 3)})`, Math.abs(alpha - 0.5) < 1e-9];
    }));
  }

  /* =========================================================
     DEMO 5 · Correlation and the 1/√n rate
     ========================================================= */
  const DEP = { seed: 51, R: 600, N: 2000, key: "", sim: null };
  function depRender() {
    const rho = +$("dep-rho").value, c = colors(), { R, N } = DEP;
    $("dep-rho-val").textContent = rho.toFixed(2);
    const key = rho + "|" + DEP.seed;
    if (DEP.key !== key) {
      const grid = logGrid(N, 28), gi = new Int32Array(N + 1).fill(-1);
      grid.forEach((n, i) => { gi[n] = i; });
      const acc = new Float64Array(grid.length), r = makeRng(DEP.seed * 7 + 1), k = Math.sqrt(1 - rho * rho);
      for (let rep = 0; rep < R; rep++) {
        let x = r.normal(), s = 0;
        for (let t = 1; t <= N; t++) {
          if (t > 1) x = rho * x + k * r.normal();
          s += x;
          const g = gi[t]; if (g >= 0) acc[g] += (s / t) ** 2;
        }
      }
      DEP.sim = { grid, sd: Array.from(acc, a => Math.sqrt(a / R)) };
      DEP.key = key;
    }
    const { grid, sd } = DEP.sim;
    const ns = logGrid(N, 80);
    const F = frame($("dep-plot"), { x: [1, N], y: [0.01, 2], xlog: true, ylog: true, xlabel: "n (log scale)", ylabel: "SD(X̄ₙ) (log scale)",
      title: `AR(1) with ρ = ${rho.toFixed(2)}, unit variance` });
    clip(F, () => {
      poly(F, ns, ns.map(() => 1), c.red, { dash: [6, 4], w: 1.5 });
      poly(F, ns, ns.map(n => 1 / Math.sqrt(n)), c.muted, { dash: [6, 4], w: 1.6 });
      poly(F, ns, ns.map(n => Math.sqrt(varMeanAR1(n, rho))), c.accent, { w: 2.4 });
      dots(F, grid, sd, c.accent);
    });
    legend(F, [
      { label: `exact, ρ = ${rho.toFixed(2)}`, color: c.accent },
      { label: "simulated (600 series)", color: c.accent, dot: true },
      { label: "independent: 1/√n (slope −½)", color: c.muted, dash: [6, 4] },
      { label: "ρ = 1: no averaging benefit", color: c.red, dash: [6, 4] }
    ], "left");
    const vN = varMeanAR1(N, rho), slope = (Math.log10(Math.sqrt(varMeanAR1(N, rho))) - Math.log10(Math.sqrt(varMeanAR1(200, rho)))) / 1;
    kpis($("dep-out"), [
      [`SD(X̄) at n = 2,000, simulated`, fix(sd[sd.length - 1], 4), false],
      ["exact", fix(Math.sqrt(vN), 4), false],
      ["if independent (1/√n)", fix(1 / Math.sqrt(N), 4), false],
      ["effective sample size n_eff", Math.round(1 / vN).toLocaleString("en"), true],
      ["approx. n(1−ρ)/(1+ρ)", Math.round(N * (1 - rho) / (1 + rho)).toLocaleString("en"), false],
      ["log-log slope, n = 200 → 2,000", fix(slope, 3), false]
    ]);
  }

  /* =========================================================
     DEMO 6 · Confidence-interval coverage
     ========================================================= */
  const CI = { seed: 61, R: 2000, show: 60 };
  function ciRender() {
    const dist = $("ci-dist").value, n = +$("ci-n").value, rho = +$("ci-rho").value, c = colors();
    $("ci-n-val").textContent = n; $("ci-rho-val").textContent = rho.toFixed(2);
    const r = makeRng(CI.seed * 1000003 + n * 17 + Math.round(rho * 100) + (dist === "exp" ? 5 : 0));
    const mu = dist === "exp" ? 1 : 0, k = Math.sqrt(1 - rho * rho);
    let cover = 0, half = 0, sx = 0, sxx = 0;
    const iv = [];
    for (let rep = 0; rep < CI.R; rep++) {
      let z = r.normal(), s = 0, ss = 0;
      for (let t = 0; t < n; t++) {
        if (t > 0) z = rho * z + k * r.normal();
        const x = dist === "exp" ? -Math.log(Q(z)) : z;     // Exponential(1) marginals via the normal CDF
        s += x; ss += x * x;
      }
      const m = s / n, v = Math.max(0, (ss - n * m * m) / (n - 1)), h = 1.96 * Math.sqrt(v / n);
      const ok = m - h <= mu && mu <= m + h;
      cover += ok; half += h; sx += m; sxx += m * m;
      if (iv.length < CI.show) iv.push([m - h, m + h, ok, m]);
    }
    const sdMean = Math.sqrt(sxx / CI.R - (sx / CI.R) ** 2);
    let lo = Math.min(...iv.map(v => v[0])), hi = Math.max(...iv.map(v => v[1]));
    const padY = (hi - lo) * 0.08; lo -= padY; hi += padY;
    const F = frame($("ci-plot"), { x: [0, CI.show + 1], y: [lo, hi], xlabel: "sample number", ylabel: "x̄ ± 1.96 s/√n",
      title: `First ${CI.show} of ${CI.R.toLocaleString("en")} intervals (n = ${n}, ρ = ${rho.toFixed(2)})` });
    clip(F, () => {
      hline(F, mu, c.ink, [5, 4], 1.4);
      iv.forEach(([a, b, ok, m], i) => {
        const x = F.X(i + 1), col = ok ? c.accent : c.red;
        F.ctx.strokeStyle = col; F.ctx.lineWidth = ok ? 2 : 2.6;
        F.ctx.beginPath(); F.ctx.moveTo(x, F.Y(a)); F.ctx.lineTo(x, F.Y(b)); F.ctx.stroke();
        F.ctx.fillStyle = col; F.ctx.beginPath(); F.ctx.arc(x, F.Y(m), 2.4, 0, 2 * Math.PI); F.ctx.fill();
      });
    });
    legend(F, [{ label: "covers the true mean", color: c.accent }, { label: "misses", color: c.red }, { label: `true mean μ = ${mu}`, color: c.ink, dash: [5, 4] }]);
    kpis($("ci-out"), [
      ["coverage (simulated)", pct(cover / CI.R, 1), true],
      ["nominal coverage", "95.0%", false],
      ["true SD of x̄ (across samples)", fix(sdMean, 4), false],
      ["average s/√n (assumes independence)", fix(half / CI.R / 1.96, 4), false],
      ["underestimation factor", "× " + fix(sdMean / (half / CI.R / 1.96), 2), false]
    ]);
  }

  /* =========================================================
     DEMO 7 · Intrusion alarm (Bayes for events)
     ========================================================= */
  function idsRender() {
    const p = Math.pow(10, +$("ids-prev").value), sens = +$("ids-sens").value, spec = +$("ids-spec").value, two = $("ids-two").checked;
    const c = colors();
    $("ids-prev-val").textContent = pct(p);
    $("ids-sens-val").textContent = pct(sens);
    $("ids-spec-val").textContent = pct(spec);
    const evidence = sens * p + (1 - spec) * (1 - p);
    const post1 = idsPosterior(p, sens, spec), post2 = idsPosterior(post1, sens, spec);
    const LR = sens / (1 - spec);

    // 1,000-connection grid
    const nAtt = Math.round(1000 * p), TP = Math.round(nAtt * sens), FN = nAtt - TP;
    const FP = Math.round((1000 - nAtt) * (1 - spec)), TN = 1000 - nAtt - FP;
    const cvs = $("ids-grid"), { ctx, W, H } = setup(cvs);
    const cols = 40, rows = 25, top = 34, bottom = 52;
    const s = Math.min((W - 24) / cols, (H - top - bottom) / rows), gx = (W - s * cols) / 2;
    const groups = [[TP, c.red, "attack, alarm (true positive)"], [FN, "#f4a3a3", "attack, no alarm"], [FP, c.orange, "benign, alarm (false alarm)"], [TN, c.line, "benign, no alarm"]];
    let idx = 0;
    for (const [count, col] of groups) for (let i = 0; i < count; i++, idx++) {
      const row = Math.floor(idx / cols), col2 = idx % cols;
      ctx.fillStyle = col; ctx.fillRect(gx + col2 * s + 0.6, top + row * s + 0.6, s - 1.2, s - 1.2);
    }
    ctx.fillStyle = c.ink; ctx.font = `600 13px ${SANS}`; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("1,000 connections (expected counts)", gx, 8);
    ctx.font = `12px ${SANS}`;
    groups.forEach(([count, col, label], i) => {
      const x = gx + (i % 2) * (s * cols / 2), y = H - bottom + 10 + Math.floor(i / 2) * 20;
      ctx.fillStyle = col; ctx.fillRect(x, y, 12, 12);
      ctx.fillStyle = c.ink; ctx.textBaseline = "middle"; ctx.fillText(`${count} ${label}`, x + 18, y + 6);
    });

    // Posterior as a function of the prior
    const ps = Array.from({ length: 160 }, (_, i) => Math.pow(10, -3 + i / 159 * (Math.log10(0.5) + 3)));
    const F = frame($("ids-curve"), { x: [0.001, 0.5], y: [0, 1], xlog: true, xlabel: "prior P(attack) (log scale)", ylabel: "posterior P(attack | alarm)",
      title: "Posterior vs prior", xfmt: v => pct(v, v < 0.01 ? 1 : 0), yfmt: v => pct(v, 0) });
    clip(F, () => {
      poly(F, ps, ps, c.muted, { dash: [2, 4], w: 1.4 });
      poly(F, ps, ps.map(q => idsPosterior(idsPosterior(q, sens, spec), sens, spec)), c.blue, { dash: [6, 4], w: 2, alpha: two ? 1 : 0.5 });
      poly(F, ps, ps.map(q => idsPosterior(q, sens, spec)), c.accent, { w: 2.4 });
      dots(F, [p], [post1], c.accent, 5);
      if (two) dots(F, [p], [post2], c.blue, 5);
    });
    legend(F, [{ label: "after one alarm", color: c.accent }, { label: "after two independent alarms", color: c.blue, dash: [6, 4] }, { label: "no information (posterior = prior)", color: c.muted, dash: [2, 4] }], "left");

    kpis($("ids-out"), [
      ["prior P(attack)", pct(p), false],
      ["evidence P(alarm)", pct(evidence), false],
      ["likelihood ratio sens/(1−spec)", fix(LR, 1), false],
      ["posterior after 1 alarm", pct(post1), true],
      ["posterior after 2 alarms", pct(post2), two],
      ["real attacks among alarms (grid)", `${TP} of ${TP + FP}`, false]
    ]);
    const odds = q => q / (1 - q);
    let txt =
`P(alarm)          = sens·p + (1−spec)(1−p) = ${fix(sens, 3)}·${fix(p, 4)} + ${fix(1 - spec, 3)}·${fix(1 - p, 4)} = ${fix(evidence, 5)}
P(attack | alarm) = sens·p / P(alarm)        = ${fix(sens * p, 5)} / ${fix(evidence, 5)} = ${fix(post1, 4)}

Odds form:  prior odds ${fix(odds(p), 4)}  ×  likelihood ratio ${fix(LR, 2)}  =  posterior odds ${fix(odds(post1), 4)}  →  P = ${fix(post1, 4)}`;
    if (two) txt += `
2nd alarm:  prior odds ${fix(odds(post1), 4)}  ×  ${fix(LR, 2)}  =  ${fix(odds(post2), 4)}  →  P(attack | 2 alarms) = ${fix(post2, 4)}`;
    $("ids-calc").textContent = txt;
  }

  /* =========================================================
     DEMO 8 · Beta–Binomial
     ========================================================= */
  const BB = { timer: null, seed: 71 };
  function bbRender() {
    const a = +$("bb-a").value, b = +$("bb-b").value, n = +$("bb-n").value;
    const kEl = $("bb-k");
    kEl.max = String(n);
    if (+kEl.value > n) kEl.value = String(n);
    const k = +kEl.value, c = colors();
    $("bb-a-val").textContent = a; $("bb-b-val").textContent = b; $("bb-n-val").textContent = n; $("bb-k-val").textContent = k;
    const A = a + k, B = b + n - k;
    const xs = linspace(0.0005, 0.9995, 600);
    const prior = xs.map(x => betaPdf(x, a, b)), post = xs.map(x => betaPdf(x, A, B)), lik = xs.map(x => betaPdf(x, k + 1, n - k + 1));
    const inner = (arr) => Math.max(...arr.filter((_, i) => xs[i] > 0.01 && xs[i] < 0.99));
    const ymax = Math.max(inner(post), inner(lik), inner(prior), 1) * 1.1;
    const lo = betaQuantile(0.025, A, B), hi = betaQuantile(0.975, A, B), pm = A / (A + B);
    const F = frame($("bb-plot"), { x: [0, 1], y: [0, ymax], xlabel: "θ = click probability", ylabel: "density",
      title: `Prior Beta(${a}, ${b})  ×  ${k} clicks of ${n}  →  posterior Beta(${A}, ${B})` });
    clip(F, () => {
      area(F, xs, post, c.accent, 0.12);
      const ci = xs.map((x, i) => (x >= lo && x <= hi ? post[i] : 0));
      area(F, xs, ci, c.accent, 0.2);
      poly(F, xs, prior, c.orange, { dash: [6, 4], w: 2 });
      poly(F, xs, lik, c.blue, { w: 1.8, alpha: n ? 1 : 0.4 });
      poly(F, xs, post, c.accent, { w: 2.6 });
      if (n) vline(F, k / n, c.blue, [2, 3], 1.3);
      vline(F, pm, c.accent, [2, 3], 1.3);
    });
    legend(F, [
      { label: "prior", color: c.orange, dash: [6, 4] },
      { label: "likelihood (normalised)", color: c.blue },
      { label: "posterior", color: c.accent },
      { label: "95% credible interval", color: c.accent, box: true, alpha: 0.3 }
    ]);
    const w = (a + b) / (a + b + n), pv = A * B / ((A + B) ** 2 * (A + B + 1));
    kpis($("bb-out"), [
      ["prior mean a/(a+b)", fix(a / (a + b), 3), false],
      ["MLE k/n", n ? fix(k / n, 3) : "—", false],
      ["posterior mean", fix(pm, 3), true],
      ["weight of the prior w", fix(w, 3), false],
      ["95% credible interval", `[${fix(lo, 3)}, ${fix(hi, 3)}]`, false],
      ["posterior SD", fix(Math.sqrt(pv), 3), false],
      ["P(θ > 0.2 | data)", fix(1 - betaInc(0.2, A, B), 3), false]
    ]);
  }
  function bbPlay() {
    const btn = $("bb-play");
    if (BB.timer) { clearInterval(BB.timer); BB.timer = null; btn.textContent = "▶ Observe one by one"; return; }
    const r = makeRng(BB.seed++), clicks = Array.from({ length: 200 }, () => r.bern(0.15));
    let t = 0, k = 0;
    btn.textContent = "■ Stop";
    $("bb-n").value = "0"; $("bb-k").value = "0"; bbRender();
    BB.timer = setInterval(() => {
      if (t >= 200) { clearInterval(BB.timer); BB.timer = null; btn.textContent = "▶ Observe one by one"; return; }
      k += clicks[t]; t++;
      $("bb-n").value = String(t); $("bb-k").max = String(t); $("bb-k").value = String(k);
      bbRender();
    }, 70);
  }

  /* =========================================================
     DEMO 9 · Normal–Normal
     ========================================================= */
  function nnRender() {
    const tau0 = +$("nn-tau").value, n = +$("nn-n").value, xbar = +$("nn-xbar").value, mu0 = 100, sigma = 30, c = colors();
    $("nn-tau-val").textContent = tau0; $("nn-n-val").textContent = n; $("nn-xbar-val").textContent = xbar;
    const prec = 1 / (tau0 * tau0) + n / (sigma * sigma), tn = Math.sqrt(1 / prec);
    const mn = (mu0 / (tau0 * tau0) + n * xbar / (sigma * sigma)) / prec, se = n ? sigma / Math.sqrt(n) : Infinity;
    const xs = linspace(40, 200, 500);
    const prior = xs.map(x => normPdf(x, mu0, tau0)), post = xs.map(x => normPdf(x, mn, tn));
    const lik = n ? xs.map(x => normPdf(x, xbar, se)) : xs.map(() => NaN);
    const ymax = Math.max(...post, ...prior, ...(n ? lik : [0])) * 1.1;
    const F = frame($("nn-plot"), { x: [40, 200], y: [0, ymax], xlabel: "μ = mean response time (ms)", ylabel: "density",
      title: `Prior N(100, ${tau0}²)  +  n = ${n}, x̄ = ${xbar}  →  posterior N(${fix(mn, 1)}, ${fix(tn, 2)}²)` });
    clip(F, () => {
      area(F, xs, post, c.accent, 0.14);
      poly(F, xs, prior, c.orange, { dash: [6, 4], w: 2 });
      if (n) poly(F, xs, lik, c.blue, { w: 1.8 });
      poly(F, xs, post, c.accent, { w: 2.6 });
    });
    legend(F, [{ label: "prior", color: c.orange, dash: [6, 4] }, { label: "likelihood: N(x̄, σ²/n)", color: c.blue }, { label: "posterior", color: c.accent }]);
    kpis($("nn-out"), [
      ["posterior mean μₙ", fix(mn, 2), true],
      ["posterior SD τₙ", fix(tn, 2), false],
      ["data alone: σ/√n", n ? fix(se, 2) : "—", false],
      ["weight of the prior τₙ²/τ₀²", fix(tn * tn / (tau0 * tau0), 3), false],
      ["95% credible interval", `[${fix(mn - 1.96 * tn, 1)}, ${fix(mn + 1.96 * tn, 1)}]`, false]
    ]);
  }

  /* =========================================================
     DEMO 10 · Prior sensitivity
     ========================================================= */
  const PS = { seed: 91, U: null, key: -1 };
  function psRender() {
    const theta = +$("ps-theta").value, n = +$("ps-n").value, c = colors();
    $("ps-theta-val").textContent = theta.toFixed(2); $("ps-n-val").textContent = n;
    if (PS.key !== PS.seed) { const r = makeRng(PS.seed * 2654435761); PS.U = Array.from({ length: 500 }, () => r.u()); PS.key = PS.seed; }
    let k = 0; for (let i = 0; i < n; i++) if (PS.U[i] < theta) k++;
    const priors = [
      ["Flat Beta(1, 1)", 1, 1, c.accent],
      ["Jeffreys Beta(½, ½)", 0.5, 0.5, c.blue],
      ["Sceptical Beta(2, 38)", 2, 38, c.green],
      ["Wrong & confident Beta(30, 10)", 30, 10, c.orange]
    ];
    const xs = linspace(0.002, 0.998, 600);
    const curves = priors.map(([, a, b]) => xs.map(x => betaPdf(x, a + k, b + n - k)));
    const ymax = Math.max(...curves.map(cu => Math.max(...cu.filter((_, i) => xs[i] > 0.01 && xs[i] < 0.99)))) * 1.1;
    const F = frame($("ps-plot"), { x: [0, 1], y: [0, ymax], xlabel: "θ", ylabel: "posterior density",
      title: `Same data for everyone: ${k} clicks out of ${n}` });
    clip(F, () => {
      vline(F, theta, c.red, [5, 4], 1.6);
      curves.forEach((cu, i) => poly(F, xs, cu, priors[i][3], { w: 2.3 }));
    });
    legend(F, [...priors.map(p => ({ label: p[0], color: p[3] })), { label: `true θ = ${theta.toFixed(2)}`, color: c.red, dash: [5, 4] }]);
    $("ps-table").innerHTML = priors.map(([name, a, b, col]) => {
      const A = a + k, B = b + n - k;
      return `<tr><td><span class="swatch" style="background:${col}"></span>${name}</td><td>${fix(a / (a + b), 3)}</td><td>${fix(A / (A + B), 3)}</td>` +
        `<td>[${fix(betaQuantile(0.025, A, B), 3)}, ${fix(betaQuantile(0.975, A, B), 3)}]</td><td>${fix(1 - betaInc(0.3, A, B), 3)}</td></tr>`;
    }).join("");
  }

  /* ---------------------------------------------------------
     Wiring
     --------------------------------------------------------- */
  const R = {
    cv: schedule(cvRender), lln: schedule(llnRender), clt: schedule(cltRender), sc: schedule(scRender),
    dep: schedule(depRender), ci: schedule(ciRender), ids: schedule(idsRender), bb: schedule(bbRender),
    nn: schedule(nnRender), ps: schedule(psRender)
  };
  const on = (ids, fn, ev = "input") => ids.forEach(id => $(id).addEventListener(ev, fn));

  function init() {
    on(["cv-example", "cv-eps"], R.cv); on(["cv-example"], R.cv, "change");
    $("cv-new").addEventListener("click", () => { CV.seed++; R.cv(); });

    on(["lln-dist", "lln-eps", "lln-n"], R.lln); on(["lln-dist", "lln-n"], R.lln, "change");
    $("lln-new").addEventListener("click", () => { LLN.seed++; R.lln(); });

    on(["clt-dist", "clt-n"], R.clt); on(["clt-dist"], R.clt, "change");
    $("clt-new").addEventListener("click", () => { CLT.seed++; R.clt(); });

    on(["sc-alpha"], R.sc);
    $("sc-half").addEventListener("click", () => { $("sc-alpha").value = "0.5"; R.sc(); });
    $("sc-one").addEventListener("click", () => { $("sc-alpha").value = "1"; R.sc(); });

    on(["dep-rho"], R.dep);
    $("dep-new").addEventListener("click", () => { DEP.seed++; R.dep(); });

    on(["ci-dist", "ci-n", "ci-rho"], R.ci); on(["ci-dist"], R.ci, "change");
    $("ci-new").addEventListener("click", () => { CI.seed++; R.ci(); });

    on(["ids-prev", "ids-sens", "ids-spec"], R.ids); on(["ids-two"], R.ids, "change");

    on(["bb-a", "bb-b", "bb-n", "bb-k"], R.bb);
    $("bb-play").addEventListener("click", bbPlay);

    on(["nn-tau", "nn-n", "nn-xbar"], R.nn);

    on(["ps-theta", "ps-n"], R.ps);
    $("ps-new").addEventListener("click", () => { PS.seed++; R.ps(); });

    const all = () => Object.values(R).forEach(f => f());
    let rt = null;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(all, 150); });
    document.querySelectorAll(".theme-toggle").forEach(b => b.addEventListener("click", () => setTimeout(all, 60)));

    // First draw, synchronously, then flag the page as ready
    [cvRender, llnRender, cltRender, scRender, depRender, ciRender, idsRender, bbRender, nnRender, psRender].forEach(f => f());
    document.querySelectorAll("[data-year]").forEach(e => { if (!e.textContent) e.textContent = new Date().getFullYear(); });
    document.body.dataset.ready = "1";
  }

  // Exposed for testing in the browser console
  window.hw8 = { betaInc, betaQuantile, lgamma, Phi, erfc, varMeanAR1, idsPosterior, betaPdf };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();