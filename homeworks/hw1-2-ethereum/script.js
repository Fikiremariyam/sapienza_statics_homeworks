// Homework 1.2 — Ethereum Wallet Derivation
// Replace the demo below with your own implementation.
// Charts.histogram(canvas, values, opts) and Charts.lines(canvas, series, opts)
// are available from assets/js/charts.js.

document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const canvas = $("chart"), out = $("output");

  function run() {
    const n = Math.max(1, parseInt($("n").value, 10) || 1000);
    const bins = Math.max(1, parseInt($("bins").value, 10) || 20);

    // DEMO: n uniform random numbers in [0, 1). Replace with your experiment.
    const sample = Array.from({ length: n }, () => Math.random());

    const mean = sample.reduce((a, b) => a + b, 0) / n;
    const variance = sample.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1 || 1);

    Charts.histogram(canvas, sample, { bins, min: 0, max: 1, title: "Demo: Uniform(0,1) sample", xLabel: "value" });
    out.textContent = `n = ${n}\nsample mean     = ${mean.toFixed(4)}\nsample variance = ${variance.toFixed(4)}`;
  }

  $("run").addEventListener("click", run);
  $("reset").addEventListener("click", () => {
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    out.textContent = "Press Run to start.";
  });
});
