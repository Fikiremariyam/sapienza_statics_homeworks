// =====================================================
// Homework 6 — Es 2: numerical computation of the standard normal CDF
// Methods: trapezoid, Simpson, alternating erf series, Marsaglia's positive series,
// Abramowitz–Stegun 7.1.26, and a hybrid series + continued fraction (my method).
// Reference values: scipy.special.ndtr (cdf-reference.js)
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const { setup, logChart, legend, colors, pow10, tick, facts } = window.HW6;
  const REF = window.CDF_REF;

  // ---------- reference lookup (grid x = −10 … 10, step 0.01) ----------
  const round2 = x => Math.round(x * 100) / 100;
  function ref(x) {
    const i = Math.round((x - REF.x0) / REF.step);
    return i >= 0 && i < REF.p.length ? { p: REF.p[i], q: REF.q[i] } : null;
  }

  // ---------- the methods: each returns { p: Φ(x), q: 1 − Φ(x), work } ----------
  const SQRT_2PI = Math.sqrt(2 * Math.PI);
  const pdf = x => Math.exp(-x * x / 2) / SQRT_2PI;

  function trapezoid(x, n) {                       // Φ = ½ + ∫₀ˣ φ
    const h = x / n;
    let s = (pdf(0) + pdf(x)) / 2;
    for (let i = 1; i < n; i++) s += pdf(i * h);
    const p = 0.5 + s * h;
    return { p, q: 1 - p, work: n + 1 };
  }
  function simpson(x, n) {
    if (n % 2) n++;
    const h = x / n;
    let s = pdf(0) + pdf(x);
    for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * pdf(i * h);
    const p = 0.5 + s * h / 3;
    return { p, q: 1 - p, work: n + 1 };
  }
  function erfTaylor(z, maxTerms = 1000) {         // (2/√π) Σ (−1)ᵏ z^(2k+1) / (k!(2k+1))
    const z2 = z * z;
    let pw = z, sum = z, k = 1;
    for (; k < maxTerms; k++) {
      pw *= -z2 / k;
      const add = pw / (2 * k + 1);
      sum += add;
      if (k > z2 && Math.abs(add) <= 1e-17 * Math.abs(sum)) break;
    }
    return { value: 2 / Math.sqrt(Math.PI) * sum, terms: k };
  }
  function taylorCdf(x, maxTerms) {
    const r = erfTaylor(x / Math.SQRT2, maxTerms);
    const p = 0.5 * (1 + r.value);
    return { p, q: 1 - p, work: r.terms };
  }
  function marsagliaS(x, maxTerms = 10000) {      // S(x) = Σ x^(2k+1) / (2k+1)!!
    let s = x, term = x, k = 0;
    const x2 = x * x;
    while (k < maxTerms) {
      k++;
      term *= x2 / (2 * k + 1);
      if (s + term === s) break;
      s += term;
    }
    return { s, terms: k };
  }
  function marsaglia(x, maxTerms) {
    const r = marsagliaS(x, maxTerms === undefined ? 10000 : maxTerms - 1);
    const p = 0.5 + pdf(x) * r.s;
    return { p, q: 1 - p, work: r.terms };
  }
  function abramowitzStegun(x) {                   // A&S 7.1.26 for erfc, then Φ
    const z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.3275911 * z);
    const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
    const tail = 0.5 * poly * Math.exp(-z * z);   // ≈ Q(|x|)
    return x >= 0 ? { p: 1 - tail, q: tail, work: 1 } : { p: tail, q: 1 - tail, work: 1 };
  }
  function hybrid(x) {                             // my method
    const a = Math.abs(x), f = pdf(a);
    let p, q, work;
    if (a < 2.5) {
      const r = marsagliaS(a);
      p = 0.5 + f * r.s; q = 0.5 - f * r.s; work = r.terms;
    } else {
      const K = Math.ceil(10 + 300 / (a * a));
      let t = a;
      for (let k = K; k >= 1; k--) t = a + k / t;
      q = f / t; p = 1 - q; work = K;
    }
    return x >= 0 ? { p, q, work } : { p: q, q: p, work };
  }

  const METHODS = [
    { id: "trap", name: "Trapezoid, n = 1000", color: c => c.muted, run: x => trapezoid(x, 1000), work: "1001 exp" },
    { id: "simp", name: "Simpson, n = 100", color: c => c.blue, run: x => simpson(x, 100), work: "101 exp" },
    { id: "taylor", name: "erf Taylor series", color: c => c.orange, run: x => taylorCdf(x), work: "terms" },
    { id: "as", name: "A&S 7.1.26", color: c => c.accent2, run: x => abramowitzStegun(x), work: "1 exp" },
    { id: "mars", name: "Marsaglia series", color: c => c.teal, run: x => marsaglia(x), work: "1 exp + terms" },
    { id: "hyb", name: "Hybrid (my method)", color: c => c.accent, run: x => hybrid(x), work: "1 exp + terms" }
  ];

  // relative error of the smaller of Φ and 1 − Φ
  function tailError(x, r, R) {
    const [mine, exact] = x >= 0 ? [r.q, R.q] : [r.p, R.p];
    return Math.abs(mine - exact) / exact;
  }
  const sci = v => !Number.isFinite(v) ? "—" : v === 0 ? "0" : v.toExponential(1);
  const full = v => v === 0 ? "0" : (Math.abs(v) < 1e-3 ? v.toExponential(15) : v.toPrecision(16));

  // ---------- chart with linear x and linear or log y ----------
  function plot(cv, series, o) {
    const { ctx, W, H } = setup(cv), c = colors(), pad = { l: 56, r: 16, t: 14, b: 38 };
    const ly = !!o.logY, ty = v => ly ? Math.log10(v) : v;
    const y0 = ty(o.yMin), y1 = ty(o.yMax);
    const X = x => pad.l + (x - o.xMin) / (o.xMax - o.xMin) * (W - pad.l - pad.r);
    const Y = y => { const v = Math.min(Math.max(ty(Math.max(y, ly ? o.yMin : -Infinity)), y0), y1); return H - pad.b - (v - y0) / (y1 - y0) * (H - pad.t - pad.b); };
    ctx.strokeStyle = c.line; ctx.fillStyle = c.muted; ctx.lineWidth = 1;
    (o.yTicks || []).forEach(v => {
      ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(W - pad.r, Y(v)); ctx.stroke();
      ctx.textAlign = "right"; ctx.fillText(ly ? pow10(Math.round(Math.log10(v))) : String(v), pad.l - 6, Y(v) + 4);
    });
    (o.xTicks || []).forEach(v => {
      ctx.beginPath(); ctx.moveTo(X(v), pad.t); ctx.lineTo(X(v), H - pad.b); ctx.stroke();
      ctx.textAlign = "center"; ctx.fillText(String(v), X(v), H - pad.b + 16);
    });
    ctx.textAlign = "center"; ctx.fillText(o.xLabel || "", (pad.l + W - pad.r) / 2, H - 4);
    ctx.save(); ctx.translate(12, (pad.t + H - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(o.yLabel || "", 0, 0); ctx.restore();
    series.forEach(s => {
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 1.6; ctx.setLineDash(s.dash || []);
      ctx.beginPath(); let on = false;
      s.pts.forEach(([x, y]) => {
        if (!Number.isFinite(y)) { on = false; return; }
        on ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)); on = true;
      });
      ctx.stroke(); ctx.setLineDash([]);
    });
  }

  // ---------- 11. calculator ----------
  function calculator(x) {
    x = round2(Math.max(-10, Math.min(10, x)));
    const R = ref(x), c = colors();
    // bell curve with the area Φ(x) shaded
    const { ctx, W, H } = setup($("calc-canvas")), pad = { l: 30, r: 16, t: 12, b: 28 };
    const X = t => pad.l + (t + 4.5) / 9 * (W - pad.l - pad.r), Y = y => H - pad.b - y / 0.45 * (H - pad.t - pad.b);
    const xc = Math.max(-4.5, Math.min(4.5, x));
    ctx.fillStyle = c.accent + "40";
    ctx.beginPath(); ctx.moveTo(X(-4.5), Y(0));
    for (let i = 0; i <= 300; i++) { const t = -4.5 + (xc + 4.5) * i / 300; ctx.lineTo(X(t), Y(pdf(t))); }
    ctx.lineTo(X(xc), Y(0)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c.accent2 + "40";
    ctx.beginPath(); ctx.moveTo(X(xc), Y(0));
    for (let i = 0; i <= 300; i++) { const t = xc + (4.5 - xc) * i / 300; ctx.lineTo(X(t), Y(pdf(t))); }
    ctx.lineTo(X(4.5), Y(0)); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = c.ink; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i <= 400; i++) { const t = -4.5 + 9 * i / 400; i ? ctx.lineTo(X(t), Y(pdf(t))) : ctx.moveTo(X(t), Y(pdf(t))); }
    ctx.stroke();
    ctx.strokeStyle = c.muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad.l, Y(0)); ctx.lineTo(W - pad.r, Y(0)); ctx.stroke();
    ctx.fillStyle = c.muted; ctx.textAlign = "center";
    for (let k = -4; k <= 4; k++) ctx.fillText(String(k), X(k), H - 10);
    ctx.fillStyle = c.accent; ctx.textAlign = "left"; ctx.fillText("Φ(x)", X(Math.max(-4.3, Math.min(xc, 2.5)) - 1.2), Y(0.05));
    ctx.fillStyle = c.accent2; ctx.fillText("1 − Φ(x)", X(Math.min(3.4, xc + 0.25)), Y(0.05) - 14);
    $("calc-facts").innerHTML = facts([
      ["x", x.toFixed(2)],
      ["Φ(x), SciPy reference", full(R.p)],
      ["1 − Φ(x), SciPy reference", full(R.q)],
      ["Φ(x) stored as a double", R.p === 1 ? "exactly 1 (tail lost)" : "&lt; 1"]
    ]);
    $("calc-table").innerHTML = `<thead><tr><th>Method</th><th>Φ(x)</th><th>1 − Φ(x)</th><th>Rel. error of smaller tail</th></tr></thead><tbody>` +
      METHODS.map(m => { const r = m.run(x); return `<tr><td>${m.name}</td><td>${full(r.p)}</td><td>${full(r.q)}</td><td>${sci(tailError(x, r, R))}</td></tr>`; }).join("") + `</tbody>`;
  }
  $("calc-x").addEventListener("change", () => { const v = parseFloat($("calc-x").value) || 0; $("calc-slider").value = Math.round(Math.max(-8, Math.min(8, v)) * 100); calculator(v); });
  $("calc-slider").addEventListener("input", () => { const v = $("calc-slider").value / 100; $("calc-x").value = v.toFixed(2); calculator(v); });

  // ---------- 14. partial sums of the positive series ----------
  function partialSums() {
    const c = colors(), xs = [];
    for (let i = 0; i <= 320; i++) xs.push(-4 + 8 * i / 320);
    const series = [{ name: "exact Φ(x)", color: c.ink, width: 2.5, pts: xs.map(x => [x, ref(round2(x)).p]) }];
    const pal = [c.orange, c.accent2, c.teal, c.accent];
    [1, 3, 6, 12].forEach((N, j) => series.push({ name: `N = ${N} term${N > 1 ? "s" : ""}`, color: pal[j], pts: xs.map(x => [x, marsaglia(x, N).p]) }));
    plot($("partial-canvas"), series, { xMin: -4, xMax: 4, yMin: -0.2, yMax: 1.2, yTicks: [0, 0.5, 1], xTicks: [-4, -3, -2, -1, 0, 1, 2, 3, 4], xLabel: "x", yLabel: "Φ(x)" });
    legend($("partial-legend"), series);
  }

  // ---------- 15. reference tables ----------
  const PTS = [-8, -6, -5, -4, -3, -2, -1, -0.5, 0, 0.5, 1, 1.5, 1.96, 2, 2.5, 3, 4, 5, 6, 8, 10];
  function referenceTables() {
    let rows = "";
    for (const x of PTS) {
      const R = ref(x), h = hybrid(x);
      const ep = Math.abs(h.p - R.p) / R.p, eq = Math.abs(h.q - R.q) / R.q;
      rows += `<tr><td>${x}</td><td>${full(R.p)}</td><td>${full(h.p)}</td><td>${sci(ep)}</td><td>${full(R.q)}</td><td>${full(h.q)}</td><td>${sci(eq)}</td></tr>`;
    }
    $("ref-table").innerHTML = `<thead><tr><th>x</th><th>Φ(x) SciPy</th><th>Φ(x) mine</th><th>rel. err</th><th>1 − Φ(x) SciPy</th><th>1 − Φ(x) mine</th><th>rel. err</th></tr></thead><tbody>${rows}</tbody>` +
      `<caption class="muted">An error of 0 means every one of the 16–17 digits agrees. The 1 − Φ column is computed directly by the continued fraction for x ≥ 2.5, which is why it stays accurate down to 10⁻²³.</caption>`;
    const pos = [0.5, 1, 2, 3, 4, 5, 6, 8, 10];
    $("ref-all-table").innerHTML = `<thead><tr><th>x</th><th>1 − Φ(x) SciPy</th>${METHODS.map(m => `<th>${m.name}</th>`).join("")}</tr></thead><tbody>` +
      pos.map(x => { const R = ref(x); return `<tr><td>${x}</td><td>${R.q.toExponential(3)}</td>` + METHODS.map(m => `<td>${sci(tailError(x, m.run(x), R))}</td>`).join("") + `</tr>`; }).join("") +
      `</tbody><caption class="muted">A relative error of 1.0e+0 means 100%: the method returned 0 for a tail that is not 0, because Φ(x) rounded to 1.</caption>`;
  }

  // ---------- 16. accuracy and convergence charts ----------
  const GRID = []; for (let i = -800; i <= 800; i++) GRID.push(i / 100);
  function accuracyChart() {
    const c = colors(), FLOOR = 1e-17;
    const series = METHODS.map(m => ({
      name: m.name, color: m.color(c), width: m.id === "hyb" ? 2.2 : 1.4,
      pts: GRID.map(x => { const e = tailError(x, m.run(x), ref(x)); return [x, Math.max(FLOOR, Math.min(e, 10))]; })
    }));
    // draw the hybrid last so it sits on top
    plot($("acc-canvas"), series, { xMin: -8, xMax: 8, yMin: FLOOR, yMax: 10, logY: true,
      yTicks: [1e-16, 1e-13, 1e-10, 1e-7, 1e-4, 1e-1], xTicks: [-8, -6, -4, -2, 0, 2, 4, 6, 8], xLabel: "x", yLabel: "relative error" });
    legend($("acc-legend"), series);
  }
  function integrationChart() {
    const c = colors(), ns = []; for (let k = 1; k <= 14; k++) ns.push(2 ** k);
    const mk = (name, color, fn, x, dash) => ({ name, color, dash, pts: ns.map(n => [n, Math.abs(fn(x, n).p - ref(x).p)]) });
    const series = [
      mk("Trapezoid, x = 1", c.muted, trapezoid, 1), mk("Trapezoid, x = 3", c.muted, trapezoid, 3, [6, 4]),
      mk("Simpson, x = 1", c.blue, simpson, 1), mk("Simpson, x = 3", c.blue, simpson, 3, [6, 4])
    ];
    logChart($("int-canvas"), series, { xLabel: "n (panels)", yLabel: "|error of Φ(x)|", floor: 1e-17 });
    legend($("int-legend"), series);
  }
  function seriesChart() {
    const c = colors(), Ns = []; for (let N = 1; N <= 120; N++) Ns.push(N);
    const FLOOR = 1e-17;
    const mk = (name, color, fn, x, dash) => ({ name, color, dash, pts: Ns.map(N => [N, Math.max(FLOOR, Math.min(Math.abs(fn(x, N).p - ref(x).p), 10))]) });
    const series = [
      mk("Marsaglia, x = 1", c.teal, marsaglia, 1), mk("Marsaglia, x = 3", c.teal, marsaglia, 3, [6, 4]), mk("Marsaglia, x = 6", c.teal, marsaglia, 6, [2, 3]),
      mk("erf Taylor, x = 1", c.orange, taylorCdf, 1), mk("erf Taylor, x = 3", c.orange, taylorCdf, 3, [6, 4]), mk("erf Taylor, x = 6", c.orange, taylorCdf, 6, [2, 3])
    ];
    plot($("series-canvas"), series, { xMin: 1, xMax: 120, yMin: FLOOR, yMax: 10, logY: true,
      yTicks: [1e-16, 1e-12, 1e-8, 1e-4, 1], xTicks: [1, 20, 40, 60, 80, 100, 120], xLabel: "N (terms)", yLabel: "|error of Φ(x)|" });
    legend($("series-legend"), series);
  }

  // ---------- 17. efficiency ----------
  async function efficiency() {
    $("cdf-eff-run").disabled = true;
    const xs = new Float64Array(4096); for (let i = 0; i < xs.length; i++) xs[i] = -6 + 12 * Math.random();
    let rows = "";
    for (const m of METHODS) {
      $("cdf-eff-progress").textContent = m.name; await tick();
      let calls = 0, sink = 0;
      const t0 = performance.now();
      do { for (let i = 0; i < xs.length; i++) sink += m.run(xs[i]).p; calls += xs.length; } while (performance.now() - t0 < 120);
      const ns = (performance.now() - t0) / calls * 1e6;
      let maxAbs = 0, maxRel = 0, work = 0;
      GRID.forEach(x => { const r = m.run(x), R = ref(x); maxAbs = Math.max(maxAbs, Math.abs(r.p - R.p)); maxRel = Math.max(maxRel, tailError(x, r, R)); work += r.work; });
      const avg = (work / GRID.length).toFixed(0);
      const workText = m.id === "taylor" ? `~${avg} terms` : m.id === "mars" ? `1 exp + ~${avg} terms` : m.id === "hyb" ? `1 exp + ~${avg} terms or levels` : m.work;
      rows += `<tr><td>${m.name}</td><td>${ns < 10 ? ns.toFixed(1) : Math.round(ns).toLocaleString()} ns</td><td>${sci(maxAbs)}</td><td>${maxRel >= 1 ? "≥ 100%" : sci(maxRel)}</td><td class="muted">${workText}</td></tr>`;
      if (sink === 42) console.log(sink);              // keeps the timed loop from being optimised away
    }
    $("cdf-eff-table").innerHTML = `<thead><tr><th>Method</th><th>Time per Φ(x)</th><th>Max |error of Φ|, x ∈ [−8, 8]</th><th>Max rel. error of smaller tail</th><th>Work per call</th></tr></thead><tbody>${rows}</tbody>`;
    $("cdf-eff-progress").textContent = "done";
    $("cdf-eff-run").disabled = false;
  }
  $("cdf-eff-run").addEventListener("click", efficiency);

  // ---------- run ----------
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { calculator(parseFloat($("calc-x").value) || 0); partialSums(); accuracyChart(); integrationChart(); seriesChart(); }, 150);
  });
  (async () => {
    calculator(1);
    partialSums();
    referenceTables();
    await tick();
    accuracyChart();
    integrationChart();
    seriesChart();
    await tick();
    await efficiency();
  })();
});
