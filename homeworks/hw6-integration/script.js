// =====================================================
// Homework 6 — Riemann and Lebesgue integration
// Riemann sums (domain partitions) vs Lebesgue sums (range partitions + preimage measures)
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const css = (v, fb) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fb;
  const colors = () => ({
    accent: css("--accent", "#7c3aed"), accent2: css("--accent-2", "#db2777"),
    ink: css("--ink", "#1f1a33"), muted: css("--muted", "#6b6785"), line: css("--line", "#e7e2f3"),
    teal: "#0f9d7a", orange: "#d97706", blue: "#2563eb"
  });
  const tick = () => new Promise(r => setTimeout(r, 0));
  const facts = rows => rows.map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`).join("");
  const sci = v => !Number.isFinite(v) ? "∞" : v === 0 ? "0" : v.toExponential(1);
  const num = (v, d = 8) => !Number.isFinite(v) ? "∞" : v.toFixed(d);

  // ---------- 1. the test functions ----------
  // meas(t) = m({ x : f(x) > t }) for t > 0, i.e. the measure of a preimage, solved by hand
  const sinc = x => x === 0 ? 1 : Math.sin(x) / x;
  function sincPreimage(t) {                 // sinc is decreasing on [0, π] → { sinc > t } = [0, xₜ)
    if (t >= 1) return 0;
    if (t <= 0) return Math.PI;
    let lo = 0, hi = Math.PI;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (sinc(m) > t) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  const FUNCS = {
    sin:    { name: "f₁ = sin x", dom: "[0, π]", a: 0, b: Math.PI, f: Math.sin, exact: 2, max: 1,
              meas: t => t >= 1 ? 0 : Math.PI - 2 * Math.asin(Math.max(0, t)), cost: 1 },
    sq:     { name: "f₂ = x²", dom: "[0, 1]", a: 0, b: 1, f: x => x * x, exact: 1 / 3, max: 1,
              meas: t => t >= 1 ? 0 : 1 - Math.sqrt(Math.max(0, t)), cost: 1 },
    step13: { name: "f₃ = 1 | 3 step", dom: "[0, 1]", a: 0, b: 1, f: x => x < 0.5 ? 1 : 3, exact: 2, max: 3,
              meas: t => t < 1 ? 1 : t < 3 ? 0.5 : 0, cost: 1 },
    abs:    { name: "f₄ = |x − ½|", dom: "[0, 1]", a: 0, b: 1, f: x => Math.abs(x - 0.5), exact: 0.25, max: 0.5,
              meas: t => t >= 0.5 ? 0 : 1 - 2 * Math.max(0, t), cost: 1 },
    invsqrt:{ name: "f₅ = 1/√x", dom: "(0, 1]", a: 0, b: 1, f: x => 1 / Math.sqrt(x), exact: 2, max: Infinity, unbounded: true,
              meas: t => t <= 1 ? 1 : 1 / (t * t), cost: 1 },
    ind:    { name: "f₆ = 1 | 0 step", dom: "[0, 1]", a: 0, b: 1, f: x => x < 0.5 ? 1 : 0, exact: 0.5, max: 1,
              meas: t => t < 1 ? 0.5 : 0, cost: 1 },
    sinc:   { name: "f₇ = sin x / x", dom: "[0, π]", a: 0, b: Math.PI, f: sinc, exact: 1.8519370519824662, max: 1,
              meas: sincPreimage, cost: 60 }
  };
  const KEYS = Object.keys(FUNCS);

  // m({f ≥ t}) is the left limit of m({f > s}) as s ↑ t
  const analyticMeasure = F => (t, ge) => F.meas(ge ? t - 1e-12 * Math.max(1, t) : t);

  // ---------- 2. the schemes ----------
  function riemann(F, n, tag) {                       // tag 0 = left, 0.5 = midpoint
    const h = (F.b - F.a) / n;
    let s = 0;
    for (let i = 0; i < n; i++) s += F.f(F.a + (i + tag) * h);
    return s * h;
  }
  function lebesgue(F, n, kind, measure) {            // layer cake: Σ Δt · m({f > t})
    const H = F.unbounded ? Math.sqrt(n) : F.max;     // truncation min(f, H) for unbounded f
    const dt = H / n;
    let s = 0;
    for (let j = 1; j <= n; j++) {
      s += kind === "lower" ? measure(j * dt, true) : measure((j - 0.5) * dt, false);
    }
    return s * dt;
  }
  // sampled preimage measure: sort N samples once, then count points above each level
  const N_GRID = 1 << 17;
  const samplerCache = {};
  function sampler(key) {
    if (samplerCache[key]) return samplerCache[key];
    const F = FUNCS[key], N = N_GRID, h = (F.b - F.a) / N, ys = new Float64Array(N);
    for (let i = 0; i < N; i++) ys[i] = F.f(F.a + (i + 0.5) * h);
    ys.sort();
    const first = (t, ge) => {                        // first index with ys[i] > t (or ≥ t)
      let lo = 0, hi = N;
      while (lo < hi) { const m = (lo + hi) >> 1; if (ge ? ys[m] >= t : ys[m] > t) hi = m; else lo = m + 1; }
      return lo;
    };
    const S = { measure: (t, ge) => (N - first(t, ge)) * h, max: ys[N - 1] };
    samplerCache[key] = S;
    return S;
  }
  function lebesgueSampled(key, n) {
    const F = FUNCS[key], S = sampler(key);
    const G = F.unbounded ? F : { ...F, max: S.max };  // a generic method only knows the sampled max
    return lebesgue(G, n, "mid", S.measure);
  }

  const METHODS = [
    { id: "rl", name: "Riemann left",      color: c => c.muted,   run: (k, n) => riemann(FUNCS[k], n, 0) },
    { id: "rm", name: "Riemann midpoint",  color: c => c.accent,  run: (k, n) => riemann(FUNCS[k], n, 0.5) },
    { id: "ll", name: "Lebesgue lower",    color: c => c.orange,  run: (k, n) => lebesgue(FUNCS[k], n, "lower", analyticMeasure(FUNCS[k])) },
    { id: "lm", name: "Lebesgue midpoint", color: c => c.accent2, run: (k, n) => lebesgue(FUNCS[k], n, "mid", analyticMeasure(FUNCS[k])) },
    { id: "ls", name: "Lebesgue sampled",  color: c => c.teal,    run: (k, n) => lebesgueSampled(k, n) }
  ];
  const err = (k, v) => Math.abs(v - FUNCS[k].exact);

  // ---------- 3. small canvas helpers ----------
  function setup(cv) {
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 600, H = cv.clientHeight || 260;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = "12px Inter, system-ui, sans-serif";
    return { ctx, W, H };
  }
  const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  const pow10 = k => "10" + String(k).split("").map(ch => SUP[ch]).join("");

  function logChart(cv, series, o = {}) {
    const { ctx, W, H } = setup(cv), c = colors(), pad = { l: 56, r: 16, t: 14, b: 38 };
    const floor = o.floor ?? 1e-16;
    const xs = [], ys = [];
    series.forEach(s => s.pts.forEach(([x, y]) => { xs.push(x); if (y > floor && Number.isFinite(y)) ys.push(y); }));
    if (!ys.length) ys.push(1);
    const x0 = Math.log10(Math.min(...xs)), x1 = Math.log10(Math.max(...xs));
    let y0 = Math.floor(Math.log10(Math.min(...ys))), y1 = Math.ceil(Math.log10(Math.max(...ys)));
    if (series.some(s => s.pts.some(([, y]) => y <= floor))) y0 -= 1;
    if (y1 - y0 < 2) y1 = y0 + 2;
    const X = v => pad.l + (Math.log10(v) - x0) / (x1 - x0) * (W - pad.l - pad.r);
    const Y = v => H - pad.b - (Math.log10(Math.max(v, 10 ** y0)) - y0) / (y1 - y0) * (H - pad.t - pad.b);
    ctx.strokeStyle = c.line; ctx.fillStyle = c.muted; ctx.lineWidth = 1;
    const ystep = Math.max(1, Math.ceil((y1 - y0) / 7));
    for (let k = y0; k <= y1; k += ystep) {
      ctx.beginPath(); ctx.moveTo(pad.l, Y(10 ** k)); ctx.lineTo(W - pad.r, Y(10 ** k)); ctx.stroke();
      ctx.textAlign = "right"; ctx.fillText(pow10(k), pad.l - 6, Y(10 ** k) + 4);
    }
    for (let k = Math.ceil(x0); k <= Math.floor(x1); k++) {
      ctx.beginPath(); ctx.moveTo(X(10 ** k), pad.t); ctx.lineTo(X(10 ** k), H - pad.b); ctx.stroke();
      ctx.textAlign = "center"; ctx.fillText(pow10(k), X(10 ** k), H - pad.b + 16);
    }
    ctx.textAlign = "center"; ctx.fillText(o.xLabel || "n", (pad.l + W - pad.r) / 2, H - 4);
    ctx.save(); ctx.translate(12, (pad.t + H - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(o.yLabel || "error", 0, 0); ctx.restore();
    series.forEach(s => {
      ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = 2; ctx.setLineDash(s.dash || []);
      ctx.beginPath(); let on = false;
      s.pts.forEach(([x, y]) => {
        if (!Number.isFinite(y)) { on = false; return; }
        const px = X(x), py = Y(y);
        on ? ctx.lineTo(px, py) : ctx.moveTo(px, py); on = true;
      });
      ctx.stroke(); ctx.setLineDash([]);
      if (s.dash) return;
      s.pts.forEach(([x, y]) => {
        if (!Number.isFinite(y)) return;
        ctx.beginPath(); ctx.arc(X(x), Y(y), y <= floor ? 4 : 2.5, 0, 7);
        y <= floor ? (ctx.lineWidth = 1.5, ctx.stroke()) : ctx.fill();
      });
    });
  }
  const legend = (el, series) => {
    el.innerHTML = series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join("");
  };

  // fitted order p in error ≈ C·n^(−p), least squares on log–log points
  function order(pts) {
    const P = pts.filter(([, e]) => e > 1e-14 && Number.isFinite(e));
    if (!pts.some(([, e]) => Number.isFinite(e))) return { text: "diverges" };
    if (P.length === 0) return { text: "exact" };
    if (P.length < 3) return { text: "≈ exact" };
    const lx = P.map(([n]) => Math.log(n)), ly = P.map(([, e]) => Math.log(e));
    const mx = lx.reduce((a, b) => a + b) / lx.length, my = ly.reduce((a, b) => a + b) / ly.length;
    let sxy = 0, sxx = 0;
    lx.forEach((x, i) => { sxy += (x - mx) * (ly[i] - my); sxx += (x - mx) ** 2; });
    const p = -sxy / sxx;
    return { p, text: p.toFixed(2) };
  }

  // ---------- 4. explorer ----------
  function fillSelect(sel, def) {
    sel.innerHTML = KEYS.map(k => `<option value="${k}"${k === def ? " selected" : ""}>${FUNCS[k].name}, ${FUNCS[k].dom}</option>`).join("");
  }
  fillSelect($("ex-f"), "sin");
  fillSelect($("cv-f"), "sin");

  function drawExplorer() {
    const key = $("ex-f").value, F = FUNCS[key], method = $("ex-m").value, n = +$("ex-n").value;
    $("ex-n-val").textContent = n;
    const cv = $("ex-canvas"), { ctx, W, H } = setup(cv), c = colors(), pad = { l: 40, r: 16, t: 14, b: 30 };
    const yTop = F.unbounded ? 8 : F.max * 1.12;
    const X = x => pad.l + (x - F.a) / (F.b - F.a) * (W - pad.l - pad.r);
    const Y = y => H - pad.b - Math.min(y, yTop) / yTop * (H - pad.t - pad.b);
    let value;
    ctx.lineWidth = 1;
    if (method === "riemann") {
      const h = (F.b - F.a) / n;
      ctx.fillStyle = c.accent + "40"; ctx.strokeStyle = c.accent;
      for (let i = 0; i < n; i++) {
        const x = F.a + i * h, y = F.f(x + h / 2);
        ctx.fillRect(X(x), Y(y), X(x + h) - X(x), Y(0) - Y(y));
        ctx.strokeRect(X(x), Y(y), X(x + h) - X(x), Y(0) - Y(y));
      }
      value = riemann(F, n, 0.5);
    } else {
      const Htop = F.unbounded ? Math.sqrt(n) : F.max, dt = Htop / n, M = 1200, gx = [], gy = [];
      for (let i = 0; i < M; i++) { const x = F.a + (i + 0.5) * (F.b - F.a) / M; gx.push(x); gy.push(F.f(x)); }
      const w = (F.b - F.a) / M;
      ctx.fillStyle = c.accent2 + "38"; ctx.strokeStyle = c.accent2;
      for (let j = 1; j <= n; j++) {
        const t = (j - 0.5) * dt, y0 = (j - 1) * dt, y1 = j * dt;
        let start = null;
        for (let i = 0; i <= M; i++) {
          const on = i < M && gy[i] > t;
          if (on && start === null) start = gx[i] - w / 2;
          if (!on && start !== null) {
            const end = gx[i - 1] + w / 2;
            ctx.fillRect(X(start), Y(y1), X(end) - X(start), Y(y0) - Y(y1));
            ctx.strokeRect(X(start), Y(y1), X(end) - X(start), Y(y0) - Y(y1));
            start = null;
          }
        }
      }
      value = lebesgue(F, n, "mid", analyticMeasure(F));
    }
    // the curve itself
    ctx.strokeStyle = c.ink; ctx.lineWidth = 2; ctx.beginPath();
    const P = 800;
    let prev = null;
    for (let i = 0; i <= P; i++) {
      const x = F.a + (F.b - F.a) * (i === 0 && F.unbounded ? 1e-4 : i / P), y = F.f(x);
      if (prev !== null && Math.abs(y - prev) > yTop * 0.3 && !F.unbounded) { ctx.stroke(); ctx.beginPath(); ctx.moveTo(X(x), Y(y)); }
      else i === 0 ? ctx.moveTo(X(x), Y(y)) : ctx.lineTo(X(x), Y(y));
      prev = y;
    }
    ctx.stroke();
    ctx.strokeStyle = c.muted; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, Y(0)); ctx.lineTo(W - pad.r, Y(0)); ctx.moveTo(pad.l, Y(0)); ctx.lineTo(pad.l, pad.t); ctx.stroke();
    ctx.fillStyle = c.muted; ctx.textAlign = "center";
    ctx.fillText(F.a === 0 ? "0" : F.a.toFixed(2), X(F.a), H - 10);
    ctx.fillText(F.b === Math.PI ? "π" : String(F.b), X(F.b), H - 10);
    ctx.textAlign = "right"; ctx.fillText(F.unbounded ? "8 (clipped)" : String(+F.max.toFixed(2)), pad.l - 4, Y(F.unbounded ? 8 : F.max) + 4);
    $("ex-facts").innerHTML = facts([
      [method === "riemann" ? `Riemann midpoint, n = ${n}` : `Lebesgue midpoint, n = ${n} levels`, num(value, 6)],
      ["Exact value", num(F.exact, 6)],
      ["Absolute error", sci(err(key, value))]
    ]);
  }
  ["ex-f", "ex-m"].forEach(id => $(id).addEventListener("change", drawExplorer));
  $("ex-n").addEventListener("input", drawExplorer);

  // ---------- 5. results at n = 1000 ----------
  function resultsTable() {
    const n = 1000;
    let html = `<thead><tr><th>Function</th><th>Exact</th>${METHODS.map(m => `<th>${m.name}</th>`).join("")}</tr></thead><tbody>`;
    for (const k of KEYS) {
      html += `<tr><td>${FUNCS[k].name}<br><span class="muted">${FUNCS[k].dom}</span></td><td><span class="val">${num(FUNCS[k].exact)}</span></td>`;
      for (const m of METHODS) {
        const v = m.run(k, n), e = err(k, v);
        const cls = !Number.isFinite(e) ? "bad" : e < 1e-6 ? "good" : "";
        html += `<td><span class="val">${num(v)}</span><span class="err ${cls}">err ${sci(e)}</span></td>`;
      }
      html += `</tr>`;
    }
    $("res-table").innerHTML = html + `</tbody>`;
  }

  // ---------- 6. convergence ----------
  const NS = [5, 9, 17, 33, 65, 129, 257, 513, 1025, 2049, 4097, 8193, 16385];
  const convCache = {};
  function convergence(key) {
    if (convCache[key]) return convCache[key];
    const out = METHODS.map(m => ({ ...m, pts: NS.map(n => [n, err(key, m.run(key, n))]) }));
    convCache[key] = out;
    return out;
  }
  function drawConvergence() {
    const key = $("cv-f").value, c = colors();
    const data = convergence(key).map(m => ({ name: `${m.name} (p = ${order(m.pts).text})`, color: m.color(c), pts: m.pts }));
    logChart($("cv-canvas"), data, { xLabel: "n (subintervals or levels)", yLabel: "absolute error" });
    legend($("cv-legend"), data);
  }
  $("cv-f").addEventListener("change", drawConvergence);
  async function orderTable() {
    let html = `<thead><tr><th>Function</th>${METHODS.map(m => `<th>${m.name}</th>`).join("")}</tr></thead><tbody>`;
    for (const k of KEYS) {
      html += `<tr><td>${FUNCS[k].name}</td>` + convergence(k).map(m => `<td class="order-cell">${order(m.pts).text}</td>`).join("") + `</tr>`;
      await tick();
    }
    $("order-table").innerHTML = html + `</tbody><caption class="muted">p = 1: error halves when n doubles. p = 2: error quarters. "exact": zero error at every n tested. The sampled scheme stops improving at the error of its own N = 2¹⁷ grid, which lowers its fitted p.</caption>`;
  }

  // ---------- 7. efficiency ----------
  const COST = {
    rl: () => "n values of f", rm: () => "n values of f",
    ll: k => FUNCS[k].cost > 1 ? "n preimages (bisection, 60 f each)" : "n closed-form preimages",
    lm: k => FUNCS[k].cost > 1 ? "n preimages (bisection, 60 f each)" : "n closed-form preimages",
    ls: () => "2¹⁷ values of f + sort + n searches"
  };
  async function efficiency() {
    const tol = 1e-6, btn = $("eff-run");
    btn.disabled = true;
    let rows = "";
    for (const k of KEYS) {
      for (const m of METHODS) {
        $("eff-progress").textContent = `${FUNCS[k].name} · ${m.name}`;
        await tick();
        let found = null;
        for (let p = 2; p <= 20; p++) {
          const n = (1 << p) + 1;
          // repeat short runs so the timer resolution does not matter;
          // the sampled scheme rebuilds its sorted grid every time, so its cost is counted
          let v, reps = 0;
          const t0 = performance.now();
          do {
            if (m.id === "ls") delete samplerCache[k];
            v = m.run(k, n); reps++;
          } while (performance.now() - t0 < 20 && reps < 2000);
          const ms = (performance.now() - t0) / reps;
          const e = err(k, v);
          if (!Number.isFinite(e)) { found = { fail: "f(0) = ∞" }; break; }
          if (e < tol) { found = { n, ms, e }; break; }
          if (ms > 1500) break;
        }
        rows += `<tr><td>${FUNCS[k].name}</td><td>${m.name}</td>` +
          (found && found.n ? `<td>${found.n.toLocaleString()}</td><td>${found.ms < 0.01 ? "&lt; 0.01" : found.ms.toFixed(2)} ms</td><td>${sci(found.e)}</td>`
                            : `<td>—</td><td>—</td><td>${found ? found.fail : "not within ~10⁶"}</td>`) +
          `<td class="muted">${COST[m.id](k)}</td></tr>`;
      }
    }
    $("eff-table").innerHTML = `<thead><tr><th>Function</th><th>Scheme</th><th>n for error &lt; 10⁻⁶</th><th>Time</th><th>Error reached</th><th>Cost per run</th></tr></thead><tbody>${rows}</tbody>`;
    $("eff-progress").textContent = "done";
    btn.disabled = false;
  }
  $("eff-run").addEventListener("click", efficiency);

  // ---------- 8. pathological functions ----------
  const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };

  function pathologicalPlots() {
    const c = colors();
    // Dirichlet
    {
      const { ctx, W, H } = setup($("dir-plot")), pad = { l: 30, r: 12, t: 18, b: 26 };
      const X = x => pad.l + x * (W - pad.l - pad.r), Y = y => H - pad.b - y / 1.2 * (H - pad.t - pad.b);
      ctx.fillStyle = c.accent;
      for (let i = 0; i <= 300; i++) { ctx.beginPath(); ctx.arc(X(i / 300), Y(1), 1.6, 0, 7); ctx.fill(); }
      ctx.fillStyle = c.accent2;
      for (let i = 0; i <= 300; i++) { ctx.beginPath(); ctx.arc(X((i + Math.SQRT1_2) / 301), Y(0), 1.6, 0, 7); ctx.fill(); }
      ctx.fillStyle = c.muted; ctx.textAlign = "left";
      ctx.fillText("x rational → 1", pad.l, Y(1) - 8); ctx.fillText("x irrational → 0", pad.l, Y(0) - 8);
      ctx.textAlign = "center"; ctx.fillText("0", X(0), H - 8); ctx.fillText("1", X(1), H - 8);
    }
    // Thomae
    {
      const { ctx, W, H } = setup($("tho-plot")), pad = { l: 30, r: 12, t: 12, b: 26 };
      const X = x => pad.l + x * (W - pad.l - pad.r), Y = y => H - pad.b - y / 1.05 * (H - pad.t - pad.b);
      ctx.fillStyle = c.accent;
      for (let q = 1; q <= 50; q++) for (let p = 0; p <= q; p++) {
        if (gcd(p, q) !== 1) continue;
        ctx.beginPath(); ctx.arc(X(p / q), Y(1 / q), q < 6 ? 3 : 1.6, 0, 7); ctx.fill();
      }
      ctx.strokeStyle = c.accent2; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(1), Y(0)); ctx.stroke();
      ctx.fillStyle = c.muted; ctx.textAlign = "center";
      ctx.fillText("0", X(0), H - 8); ctx.fillText("½", X(0.5), H - 8); ctx.fillText("1", X(1), H - 8);
    }
  }

  function dirichletTable() {
    // tags are stored symbolically as r + s·√2 with r, s rational: irrational ⇔ s ≠ 0
    const dirichlet = tag => tag.s === 0 ? 1 : 0;
    let rows = "";
    for (const n of [10, 100, 1000, 10000]) {
      let rat = 0, irr = 0;
      for (let i = 0; i < n; i++) {
        rat += dirichlet({ r: (i + 0.5) / n, s: 0 });
        irr += dirichlet({ r: (i + 0.5) / n, s: 1 / (4 * n) });
      }
      rows += `<tr><td>${n.toLocaleString()}</td><td>${(rat / n).toFixed(1)}</td><td>${(irr / n).toFixed(1)}</td><td>1</td><td>0</td><td>1</td><td>0</td></tr>`;
    }
    $("dir-table").innerHTML = `<thead><tr><th>n</th><th>Riemann, rational tags</th><th>Riemann, irrational tags</th><th>Upper sum U</th><th>Lower sum L</th><th>U − L</th><th>Lebesgue</th></tr></thead><tbody>${rows}</tbody>` +
      `<caption class="muted">U − L stays 1: no Riemann integral. The Lebesgue value is 0 for every number of levels, because each preimage is a subset of ℚ.</caption>`;
  }

  // exact value of a double as p/q (q is a power of two)
  function exactFraction(x) {
    const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, x);
    const hi = dv.getUint32(0), lo = dv.getUint32(4);
    let exp = (hi >>> 20) & 0x7ff;
    let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
    if (exp === 0) exp = 1; else mant |= 1n << 52n;
    const e = exp - 1075;
    let p = mant, q = 1n;
    if (e >= 0) p <<= BigInt(e); else q <<= BigInt(-e);
    while (p % 2n === 0n && q % 2n === 0n) { p /= 2n; q /= 2n; }
    return { p, q, k: q.toString(2).length - 1 };
  }
  function floatDemo() {
    const v = $("fl-sel").value;
    const map = { "0.1": [0.1, "0.1"], "1/3": [1 / 3, "1/3"], sqrt2: [Math.SQRT2, "√2 (Math.SQRT2)"], pi: [Math.PI, "π (Math.PI)"] };
    const [x, label] = map[v], fr = exactFraction(x);
    $("fl-out").innerHTML = facts([
      ["You typed", label],
      ["Stored exactly as", `${fr.p} / ${fr.q}`],
      ["Denominator", `2^${fr.k}`],
      ["So the computer's isRational(x)", "true"]
    ]);
  }
  $("fl-sel").addEventListener("change", floatDemo);

  async function thomae() {
    const ns = [10, 30, 100, 300, 1000, 3000, 10000, 30000, 100000];
    const rows = [], rat = [], up = [];
    for (const n of ns) {
      // rational midpoint tags (2i+1)/(2n): f = 1/q with q = 2n / gcd(2i+1, 2n)
      let r = 0;
      for (let i = 0; i < n; i++) r += gcd(2 * i + 1, 2 * n) / (2 * n);
      r /= n;
      // upper sum: on [i/n, (i+1)/n] the sup is 1/q for the smallest q with a fraction p/q inside
      let u = 0;
      for (let i = 0; i < n; i++) {
        let q = 1;
        while (Math.floor((q * i + n - 1) / n) > Math.floor(q * (i + 1) / n)) q++;
        u += 1 / q;
      }
      u /= n;
      rows.push(`<tr><td>${n.toLocaleString()}</td><td>${r.toExponential(3)}</td><td>0</td><td>${u.toExponential(3)}</td><td>0</td><td>0</td></tr>`);
      rat.push([n, r]); up.push([n, u]);
      await tick();
    }
    $("tho-table").innerHTML = `<thead><tr><th>n</th><th>Riemann, rational tags</th><th>Riemann, irrational tags</th><th>Upper sum U</th><th>Lower sum L</th><th>Lebesgue</th></tr></thead><tbody>${rows.join("")}</tbody>` +
      `<caption class="muted">U − L → 0, so Thomae is Riemann-integrable with integral 0, matching Lebesgue.</caption>`;
    const c = colors();
    const series = [
      { name: "Upper sum Uₙ", color: c.accent, pts: up },
      { name: "Riemann sum, rational midpoint tags", color: c.accent2, pts: rat },
      { name: "reference 1/√n", color: c.muted, dash: [5, 5], pts: ns.map(n => [n, 1 / Math.sqrt(n)]) }
    ];
    logChart($("tho-conv"), series, { xLabel: "n", yLabel: "sum" });
    legend($("tho-legend"), series);
  }

  // ---------- 9. run everything ----------
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { drawExplorer(); drawConvergence(); pathologicalPlots(); }, 150);
  });

  (async () => {
    drawExplorer();
    pathologicalPlots();
    dirichletTable();
    floatDemo();
    await tick();
    resultsTable();
    await tick();
    drawConvergence();
    await orderTable();
    await thomae();
    await efficiency();
  })();
});