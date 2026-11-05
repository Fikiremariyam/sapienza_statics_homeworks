// =====================================================
// Homework 4 — Stochastic penetration processes
// Bernoulli / Rademacher increments, Sₙ, Sₙ/n, Sₙ/√n, LLN and CLT
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const facts = rows => rows.map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`).join("");
  const f = (v, d = 4) => Number.isFinite(v) ? v.toFixed(d) : "—";
  const tick = () => new Promise(r => setTimeout(r, 0));
  const BUDGET = 5e6;                     // max increments per experiment, keeps the page responsive

  // ---------- model ----------
  const M = { kind: "rademacher", p: 0.3, mu: 0, var: 1, step: 2 };
  function setModel() {
    M.kind = $("model-sel").value; M.p = +$("p").value;
    $("p-val").textContent = M.p.toFixed(2);
    $("p-wrap").style.display = M.kind === "bernoulli" ? "" : "none";
    if (M.kind === "bernoulli") { M.mu = M.p; M.var = M.p * (1 - M.p); M.step = 1; }
    else { M.mu = 0; M.var = 1; M.step = 2; }
  }
  const draw = () => M.kind === "bernoulli" ? (Math.random() < M.p ? 1 : 0) : (Math.random() < 0.5 ? 1 : -1);
  const rademacher = () => (Math.random() < 0.5 ? 1 : -1);
  function sum(n, gen = draw) { let s = 0; for (let i = 0; i < n; i++) s += gen(); return s; }

  // ---------- statistics helpers ----------
  const mean = a => { let s = 0; for (const v of a) s += v; return s / a.length; };
  const variance = a => { const m = mean(a); let s = 0; for (const v of a) s += (v - m) ** 2; return s / (a.length - 1); };
  const normalPdf = (x, mu = 0, s2 = 1) => Math.exp(-((x - mu) ** 2) / (2 * s2)) / Math.sqrt(2 * Math.PI * s2);
  function Phi(x) {                         // standard normal CDF (Abramowitz–Stegun 7.1.26)
    const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
    return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  }
  function ksDistance(values) {             // sup |Fₙ(x) − Φ(x)|, handling ties
    const v = [...values].sort((a, b) => a - b), m = v.length;
    let D = 0, i = 0;
    while (i < m) {
      let j = i; while (j < m && v[j] === v[i]) j++;
      const P = Phi(v[i]);
      D = Math.max(D, Math.abs(i / m - P), Math.abs(j / m - P));
      i = j;
    }
    return D;
  }
  // bins aligned with the lattice of possible values (avoids empty "gaps" in discrete data)
  function latticeHist(values, step, maxBins = 50, lo = -Infinity, hi = Infinity) {
    let vmin = Infinity, vmax = -Infinity;
    for (const x of values) { if (x >= lo && x < vmin) vmin = x; if (x <= hi && x > vmax) vmax = x; }
    const distinct = Math.round((vmax - vmin) / step) + 1;
    const g = Math.ceil(distinct / maxBins), bins = Math.ceil(distinct / g);
    const min = vmin - step / 2;
    return { min, max: min + bins * g * step, bins };
  }
  const pick = (arr, K) => { const out = [], n = arr.length; for (let i = 0; i < K; i++) out.push(arr[Math.round(i * (n - 1) / (K - 1))]); return out; };

  // ---------- 03 + 04: trajectories and distributions ----------
  async function run() {
    setModel();
    const n = Math.max(10, Math.min(20000, parseInt($("n").value, 10) || 1000));
    let m = Math.max(10, Math.min(20000, parseInt($("m").value, 10) || 1000));
    const capped = m * n > BUDGET; if (capped) m = Math.floor(BUDGET / n);
    const sd = Math.sqrt(M.var);

    $("model-facts").innerHTML = facts([
      ["Model", M.kind === "bernoulli" ? `Bernoulli(p = ${M.p.toFixed(2)})` : "Rademacher ±1"],
      ["μ = E[Xᵢ]", f(M.mu, 3)], ["σ² = Var(Xᵢ)", f(M.var, 3)],
      ["n systems × m attackers", `${n.toLocaleString()} × ${m.toLocaleString()}${capped ? " (m reduced)" : ""}`]
    ]);

    // 12 full trajectories
    const K = Math.min(n, 400), ks = pick([...Array(n).keys()].map(i => i + 1), K);
    const tot = [], avg = [], nor = [];
    for (let j = 0; j < 12; j++) {
      const S = new Float64Array(n); let s = 0;
      for (let i = 0; i < n; i++) { s += draw(); S[i] = s; }
      const idx = ks.map(k => k - 1);
      tot.push(idx.map(i => S[i])); avg.push(idx.map(i => S[i] / (i + 1))); nor.push(idx.map(i => S[i] / Math.sqrt(i + 1)));
    }
    const pal = [css("--accent"), css("--accent-2"), css("--muted")], ink = css("--ink");
    const ser = arr => arr.map((d, j) => ({ data: d, color: pal[j % 3] }));
    const band = (fn) => [-2, 0, 2].map(z => ({ data: ks.map(k => fn(k, z)), color: ink }));
    const opts = { xMin: 1, xMax: n, xLabel: "k = systems attacked" };
    Charts.lines($("t-total"), [...ser(tot), ...band((k, z) => k * M.mu + z * sd * Math.sqrt(k))], { ...opts, title: "Sₖ" });
    const [aLo, aHi] = M.kind === "bernoulli" ? [0, 1] : [-1, 1];
    Charts.lines($("t-avg"), [...ser(avg), { data: ks.map(() => M.mu), color: ink }], { ...opts, title: "Sₖ / k", yMin: aLo, yMax: aHi });
    const nMax = Math.sqrt(n) * M.mu + 4 * sd;
    Charts.lines($("t-norm"), [...ser(nor), ...band((k, z) => Math.sqrt(k) * M.mu + z * sd)], { ...opts, title: "Sₖ / √k", yMin: M.kind === "bernoulli" ? 0 : -4, yMax: M.kind === "bernoulli" ? nMax : 4 });

    await tick();
    // final values for all m attackers
    const T = new Float64Array(m);
    for (let j = 0; j < m; j++) T[j] = sum(n);
    const A = T.map(v => v / n), N = T.map(v => v / Math.sqrt(n));
    const h1 = latticeHist(T, M.step), h2 = latticeHist(A, M.step / n), h3 = latticeHist(N, M.step / Math.sqrt(n));
    Charts.histogram($("d-total"), [...T], { ...h1, title: "attackers", xLabel: "Sₙ" });
    Charts.histogram($("d-avg"), [...A], { ...h2, title: "attackers", xLabel: "Sₙ / n" });
    Charts.histogram($("d-norm"), [...N], { ...h3, title: "attackers", xLabel: "Sₙ / √n", curve: x => normalPdf(x, Math.sqrt(n) * M.mu, M.var) });
    const rows = [
      ["Sₙ", T, n * M.mu, n * M.var],
      ["Sₙ / n", A, M.mu, M.var / n],
      ["Sₙ / √n", N, Math.sqrt(n) * M.mu, M.var]
    ];
    $("dist-table").innerHTML = `<thead><tr><th>Quantity</th><th>Sample mean</th><th>Theory</th><th>Sample variance</th><th>Theory</th></tr></thead><tbody>` +
      rows.map(([name, arr, em, ev]) => `<tr><td>${name}</td><td>${f(mean(arr))}</td><td>${f(em)}</td><td>${f(variance(arr))}</td><td>${f(ev)}</td></tr>`).join("") + `</tbody>`;
  }

  // ---------- 05 + 06: LLN and variance scaling ----------
  async function runScaling() {
    setModel();
    const eps = +$("eps").value, mWanted = Math.max(10, parseInt($("m").value, 10) || 1000);
    const ns = [10, 30, 100, 300, 1000, 3000, 10000];
    const res = [];
    $("run-lln").disabled = true;
    for (const n of ns) {
      const m = Math.max(100, Math.min(mWanted, Math.floor(BUDGET / n)));
      const T = new Float64Array(m);
      for (let j = 0; j < m; j++) T[j] = sum(n);
      const A = T.map(v => v / n), N = T.map(v => v / Math.sqrt(n));
      const out = A.filter(a => Math.abs(a - M.mu) > eps).length / m;
      res.push({ n, m, out, cheb: Math.min(1, M.var / (n * eps * eps)), vT: variance(T), vA: variance(A), vN: variance(N) });
      $("lln-progress").textContent = `n = ${n} done`;
      await tick();
    }
    $("run-lln").disabled = false;
    $("lln-progress").textContent = `ε = ${eps}`;
    const labels = ns.map(String);
    Charts.lines($("c-lln"), [{ data: res.map(r => r.out) }, { data: res.map(r => r.cheb) }], { yMin: 0, yMax: 1, labels, title: "probability", xLabel: "n" });
    $("lln-table").innerHTML = `<thead><tr><th>n</th><th>attackers m</th><th>P(|Sₙ/n − μ| &gt; ${eps})</th><th>Chebyshev bound</th><th>SD of Sₙ/n</th><th>σ/√n</th></tr></thead><tbody>` +
      res.map(r => `<tr><td>${r.n}</td><td>${r.m}</td><td>${f(r.out)}</td><td>${f(r.cheb)}</td><td>${f(Math.sqrt(r.vA))}</td><td>${f(Math.sqrt(M.var / r.n))}</td></tr>`).join("") + `</tbody>`;
    Charts.lines($("v-total"), [{ data: res.map(r => r.vT) }, { data: ns.map(n => n * M.var) }], { yMin: 0, labels, title: "Var(Sₙ)", xLabel: "n" });
    Charts.lines($("v-avg"), [{ data: res.map(r => r.vA) }, { data: ns.map(n => M.var / n) }], { yMin: 0, labels, title: "Var(Sₙ/n)", xLabel: "n" });
    Charts.lines($("v-norm"), [{ data: res.map(r => r.vN) }, { data: ns.map(() => M.var) }], { yMin: 0, yMax: Math.max(...res.map(r => r.vN), M.var) * 1.4, labels, title: "Var(Sₙ/√n)", xLabel: "n" });
  }

  // ---------- 07: CLT (Rademacher) ----------
  async function runCLT() {
    const m = Math.max(100, Math.min(50000, parseInt($("m-clt").value, 10) || 5000));
    const ns = [1, 2, 5, 10, 30, 100, 1000];
    const grid = $("clt-grid"); grid.innerHTML = "";
    const ks = [];
    $("run-clt").disabled = true;
    for (const n of ns) {
      const mm = Math.min(m, Math.floor(2e7 / n));
      const V = new Float64Array(mm);
      for (let j = 0; j < mm; j++) V[j] = sum(n, rademacher) / Math.sqrt(n);
      const D = ksDistance(V); ks.push(D);
      const fig = document.createElement("figure");
      fig.innerHTML = `<canvas class="chart small"></canvas><figcaption>n = ${n} · KS = ${D.toFixed(3)}</figcaption>`;
      grid.appendChild(fig);
      const h = latticeHist(V, 2 / Math.sqrt(n), 40, -4, 4);
      Charts.histogram(fig.querySelector("canvas"), [...V], { ...h, title: "attackers", xLabel: "Sₙ/√n", curve: x => normalPdf(x) });
      await tick();
    }
    $("run-clt").disabled = false;
    Charts.lines($("c-ks"), [{ data: ks }, { data: ns.map(n => 0.4 / Math.sqrt(n)) }], { yMin: 0, labels: ns.map(String), title: "KS distance", xLabel: "n" });
  }

  // ---------- 08: effect of m ----------
  async function runM() {
    const n = Math.max(10, Math.min(5000, parseInt($("n-m").value, 10) || 500));
    const ms = [10, 100, 1000, 10000];
    let rows = "";
    for (const m of ms) {
      const mm = Math.min(m, Math.floor(1e7 / n));
      const V = new Float64Array(mm);
      let agg = 0;
      for (let j = 0; j < mm; j++) { const s = sum(n, rademacher); agg += s; V[j] = s / Math.sqrt(n); }
      let mx = -Infinity; for (const v of V) if (v > mx) mx = v;
      rows += `<tr><td>${mm.toLocaleString()}</td><td>${f(mean(V), 3)} ± ${f(1 / Math.sqrt(mm), 3)}</td><td>${f(mx, 2)}</td><td>${f(Math.sqrt(2 * Math.log(mm)), 2)}</td><td>${agg.toLocaleString()}</td><td>± ${Math.round(Math.sqrt(mm * n)).toLocaleString()}</td></tr>`;
      await tick();
    }
    $("m-table").innerHTML = `<thead><tr><th>Attackers m</th><th>Mean of Sₙ/√n (± SE)</th><th>Best attacker Sₙ/√n</th><th>√(2 ln m)</th><th>Aggregate Σ Sₙ</th><th>Typical size √(mn)</th></tr></thead><tbody>${rows}</tbody>` +
      `<caption class="muted">Rademacher model, n = ${n}. Nobody has any skill (μ = 0), yet the best attacker's score grows with m.</caption>`;
  }

  // ---------- events ----------
  $("model-sel").addEventListener("change", async () => { await run(); await runScaling(); });
  $("p").addEventListener("input", () => { setModel(); });
  $("p").addEventListener("change", async () => { await run(); await runScaling(); });
  $("run").addEventListener("click", async () => { await run(); await runScaling(); });
  $("run-lln").addEventListener("click", runScaling);
  $("eps").addEventListener("change", runScaling);
  $("run-clt").addEventListener("click", runCLT);
  $("run-m").addEventListener("click", runM);

  (async () => { await run(); await runScaling(); await runCLT(); await runM(); })();
});
