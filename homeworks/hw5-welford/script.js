// =====================================================
// Homework 4 — Welford's algorithm & sampling statistics
// =====================================================

// ---------- Ex. 1: Welford's online mean / variance ----------
class Welford {
  constructor() { this.n = 0; this.mean = 0; this.ss = 0; }
  add(x) {
    this.n++;
    const delta = x - this.mean;          // xₙ − x̄ₙ₋₁
    this.mean += delta / this.n;          // Knuth:   x̄ₙ = x̄ₙ₋₁ + δ/n
    this.ss += delta * (x - this.mean);   // Welford: SSₙ = SSₙ₋₁ + δ(xₙ − x̄ₙ)
  }
  get variance() { return this.n > 1 ? this.ss / (this.n - 1) : 0; }
  get populationVariance() { return this.n > 0 ? this.ss / this.n : 0; }
}

document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const facts = rows => rows.map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`).join("");
  const f = (v, d = 4) => Number.isFinite(v) ? v.toFixed(d) : "—";

  // ---------- Ex. 1 check ----------
  function check() {
    const offset = Number($("offset").value) || 0;
    const xs = $("data").value.split(/[\s,;]+/).filter(Boolean).map(Number).filter(Number.isFinite);
    if (xs.length < 2) { $("check-table").innerHTML = "<tbody><tr><td>Enter at least two numbers.</td></tr></tbody>"; return; }
    const run = data => {
      const w = new Welford(); data.forEach(x => w.add(x));
      const n = data.length, sum = data.reduce((a, b) => a + b, 0), sq = data.reduce((a, b) => a + b * b, 0);
      const naive = (sq - n * (sum / n) ** 2) / (n - 1);
      return { mean: w.mean, welford: w.variance, naive };
    };
    const a = run(xs), b = run(xs.map(x => x + offset));
    $("check-table").innerHTML =
      `<thead><tr><th>Data</th><th>Mean</th><th>Welford s²</th><th>Textbook (Σx² − n·x̄²)/(n−1)</th></tr></thead><tbody>
        <tr><td>original</td><td>${a.mean}</td><td>${a.welford}</td><td>${a.naive}</td></tr>
        <tr><td>+ ${offset.toExponential(0)}</td><td>${b.mean}</td><td>${b.welford}</td><td>${b.naive}</td></tr>
      </tbody><caption class="muted">Shifting every value by a constant cannot change the variance. Any difference in the last column is floating-point cancellation.</caption>`;
  }

  // ---------- distribution ----------
  let pmf = [], cdf = [], MU = 0, VAR = 0, MU4 = 0;

  function binom(n, k) { let c = 1; for (let i = 1; i <= k; i++) c = c * (n - k + i) / i; return c; }

  function setDistribution() {
    const kind = $("dist").value, p = +$("p").value;
    $("p-val").textContent = p.toFixed(2);
    $("p-label").style.display = kind === "binom" ? "" : "none";
    if (kind === "binom") pmf = [...Array(11).keys()].map(k => binom(10, k) * p ** k * (1 - p) ** (10 - k));
    else if (kind === "uniform") pmf = new Array(11).fill(1 / 11);
    else { const w = [30, 20, 14, 10, 8, 6, 4, 3, 2, 2, 1], t = w.reduce((a, b) => a + b, 0); pmf = w.map(v => v / t); }
    let acc = 0; cdf = pmf.map(v => (acc += v));
    MU = pmf.reduce((s, v, k) => s + k * v, 0);
    VAR = pmf.reduce((s, v, k) => s + (k - MU) ** 2 * v, 0);
    MU4 = pmf.reduce((s, v, k) => s + (k - MU) ** 4 * v, 0);
    const names = { binom: `Binomial(10, ${p.toFixed(2)})`, uniform: "Uniform {0,…,10}", skewed: "Skewed" };
    $("dist-facts").innerHTML = facts([
      ["Distribution", names[kind]], ["Theoretical mean μ", f(MU)], ["Theoretical variance σ²", f(VAR)], ["σ", f(Math.sqrt(VAR))]
    ]);
    Charts.bars($("c-pmf"), pmf, { title: "P(X = k)", xMin: 0, xMax: 10, xLabel: "score k" });
  }

  // inverse-CDF sampling of one score
  function score() {
    const u = Math.random();
    for (let k = 0; k < 10; k++) if (u < cdf[k]) return k;
    return 10;
  }

  // m hackers × n systems → per-hacker Welford results
  function experiment(m, n, keepTraj = 0) {
    const means = new Float64Array(m), vars = new Float64Array(m), pvars = new Float64Array(m), traj = [];
    for (let j = 0; j < m; j++) {
      const w = new Welford(), t = j < keepTraj ? [] : null;
      for (let i = 0; i < n; i++) { w.add(score()); if (t) t.push(w.mean); }
      means[j] = w.mean; vars[j] = w.variance; pvars[j] = w.populationVariance;
      if (t) traj.push(t);
    }
    return { means, vars, pvars, traj };
  }

  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = a => { const mu = avg(a); return Math.sqrt(a.reduce((s, v) => s + (v - mu) ** 2, 0) / (a.length - 1)); };
  const theorySdVar = n => Math.sqrt((MU4 - VAR * VAR * (n - 3) / (n - 1)) / n);

  // ---------- Ex. 2 simulation ----------
  function simulate() {
    const m = Math.max(2, Math.min(20000, parseInt($("m").value, 10) || 1000));
    const n = Math.max(2, Math.min(5000, parseInt($("n").value, 10) || 50));
    const r = experiment(m, n, 6);
    const am = avg(r.means), av = avg(r.vars), apv = avg(r.pvars);
    $("sim-facts").innerHTML = facts([
      ["Average of sample means", `${f(am)}  (μ = ${f(MU)})`],
      ["Average of sample variances s²", `${f(av)}  (σ² = ${f(VAR)})`],
      ["Average of SS/n (biased)", `${f(apv)}  (σ²·(n−1)/n = ${f(VAR * (n - 1) / n)})`],
      ["SD of sample means", `${f(sd(r.means))}  (σ/√n = ${f(Math.sqrt(VAR / n))})`],
      ["SD of sample variances", `${f(sd(r.vars))}  (theory ${f(theorySdVar(n))})`],
      ["Total attempts simulated", (m * n).toLocaleString()]
    ]);
    const pal = [css("--accent"), css("--accent-2"), css("--muted")];
    Charts.lines($("c-traj"), [
      ...r.traj.map((t, i) => ({ name: `hacker ${i + 1}`, data: t, color: pal[i % 3] })),
      { name: "μ", data: new Array(n).fill(MU), color: css("--ink") }
    ], { yMin: 0, yMax: 10, title: "running mean", xLabel: `systems attacked (1 … ${n})` });
    Charts.histogram($("c-means"), [...r.means], { bins: 30, title: "hackers", xLabel: "sample mean x̄" });
    Charts.histogram($("c-vars"), [...r.vars], { bins: 30, title: "hackers", xLabel: "sample variance s²" });
  }

  // ---------- vary n ----------
  function vary() {
    const m = Math.max(10, Math.min(5000, parseInt($("m2").value, 10) || 1000));
    const ns = [5, 10, 20, 50, 100, 200, 500, 1000, 2000];
    const rows = [];
    let i = 0;
    $("vary").disabled = true;
    const next = () => {
      const n = ns[i], r = experiment(m, n);
      rows.push({ n, am: avg(r.means), av: avg(r.vars), apv: avg(r.pvars), sdm: sd(r.means), sdv: sd(r.vars) });
      $("vary-progress").textContent = `n = ${n} done`;
      i++;
      if (i < ns.length) setTimeout(next, 0); else done();
    };
    const done = () => {
      $("vary").disabled = false;
      $("vary-progress").textContent = `${m} hackers per n`;
      const labels = ns.map(String);
      Charts.lines($("c-sdmean"), [
        { name: "simulated", data: rows.map(r => r.sdm) },
        { name: "σ/√n", data: ns.map(n => Math.sqrt(VAR / n)) }
      ], { yMin: 0, labels, title: "SD(x̄)", xLabel: "n" });
      Charts.lines($("c-sdvar"), [
        { name: "simulated", data: rows.map(r => r.sdv) },
        { name: "theory", data: ns.map(theorySdVar) }
      ], { yMin: 0, labels, title: "SD(s²)", xLabel: "n" });
      $("vary-table").innerHTML =
        `<thead><tr><th>n</th><th>avg x̄ (μ = ${f(MU, 3)})</th><th>avg s² (σ² = ${f(VAR, 3)})</th><th>avg SS/n (biased)</th><th>SD of x̄ · σ/√n</th><th>SD of s² · theory</th></tr></thead><tbody>` +
        rows.map(r => `<tr><td>${r.n}</td><td>${f(r.am)}</td><td>${f(r.av)}</td><td>${f(r.apv)}</td><td>${f(r.sdm)} · ${f(Math.sqrt(VAR / r.n))}</td><td>${f(r.sdv)} · ${f(theorySdVar(r.n))}</td></tr>`).join("") +
        `</tbody>`;
    };
    next();
  }

  // ---------- events ----------
  $("check").addEventListener("click", check);
  $("dist").addEventListener("change", () => { setDistribution(); simulate(); vary(); });
  $("p").addEventListener("input", setDistribution);
  $("p").addEventListener("change", () => { simulate(); vary(); });
  $("simulate").addEventListener("click", simulate);
  $("vary").addEventListener("click", vary);

  check();
  setDistribution();
  simulate();
  vary();
});
