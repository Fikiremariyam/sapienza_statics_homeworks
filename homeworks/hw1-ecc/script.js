// =====================================================
// Homework 1 — Private key → public key (toy ECC)
// Uses ECC (assets/js/ecc.js) and Charts (assets/js/charts.js)
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const { Curve, str, eq, popcount } = ECC;
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  const state = { curve: null, G: null, points: [], n: 0, groupOrder: 0, subgroup: new Set(), trace: null, stepIdx: -1, timer: null };
  const key = P => P ? `${P.x},${P.y}` : "O";

  // ---------- 03: curve & base point ----------
  function setCurve() {
    const p = BigInt($("prime").value);
    state.curve = new Curve(p, 0n, 7n);
    state.points = state.curve.points();
    state.groupOrder = state.points.length + 1;
    const sel = $("base");
    sel.innerHTML = "";
    const small = p <= 97n;
    state.points.forEach((P, i) => {
      const o = document.createElement("option");
      o.value = i;
      o.textContent = str(P) + (small ? `  · order ${orderOf(P)}` : "");
      sel.appendChild(o);
    });
    // default base point: (1,5) on p = 17, otherwise a point of maximal order
    let idx = state.points.findIndex(P => P.x === 1n && P.y === 5n);
    if (p !== 17n || idx < 0) {
      let best = 0, bestOrd = 0;
      state.points.slice(0, 60).forEach((P, i) => { const o = orderOf(P); if (o > bestOrd) { bestOrd = o; best = i; } });
      idx = best;
    }
    sel.value = idx;
    setBase();
  }

  // order of P divides the group order N, so test divisors in increasing order
  function orderOf(P) {
    const N = state.groupOrder;
    for (let d = 1; d <= N; d++) if (N % d === 0 && state.curve.mul(d, P) === null) return d;
    return N;
  }

  function setBase() {
    state.G = state.points[+$("base").value];
    state.n = orderOf(state.G);
    state.subgroup = new Set();
    let R = state.G;
    while (R !== null) { state.subgroup.add(key(R)); R = state.curve.add(R, state.G); }

    const N = state.groupOrder;
    $("curve-facts").innerHTML = facts([
      ["Curve", `y² = x³ + 7 (mod ${state.curve.p})`],
      ["Points on the curve", `${state.points.length} + O = ${N}`],
      ["Base point G", str(state.G)],
      ["Order n of G", `${state.n}${state.n === N ? " (generator)" : ""}`],
      ["Distinct private keys", `${state.n - 1} (k is taken mod ${state.n})`]
    ]);
    const list = $("point-list");
    list.innerHTML = "";
    if (state.points.length <= 120) {
      state.points.forEach(P => {
        const s = document.createElement("span");
        s.className = "chip" + (state.subgroup.has(key(P)) ? " in" : "");
        s.textContent = str(P);
        list.appendChild(s);
      });
    } else {
      list.innerHTML = `<p class="muted">${state.points.length} points — too many to list; see the grid in section 05.</p>`;
    }
    compute();
  }

  function facts(rows) {
    return rows.map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`).join("");
  }

  // ---------- 04: compute Q = kG ----------
  function compute() {
    let k = BigInt(Math.max(1, parseInt($("k").value, 10) || 1));
    let method = $("method").value;
    if (method === "repeated" && k > 5000n) {
      method = "double-add"; $("method").value = "double-add";
    }
    const trace = state.curve.mulTrace(k, state.G, method);
    state.trace = trace;

    $("pubkey").innerHTML =
      `<span class="pk-label">TOY PUBLIC KEY</span>
       <span class="pk-value">Q = ${k}G = ${str(trace.Q)}</span>
       <span class="pk-sub">private key k = ${k}${k >= BigInt(state.n) ? ` ≡ ${k % BigInt(state.n)} (mod ${state.n})` : ""} · ${trace.steps.length} step(s) with ${method === "repeated" ? "repeated addition" : "double-and-add"} · ${state.curve.isOnCurve(trace.Q) ? "Q is on the curve ✓" : "error"}</span>`;

    const rows = trace.steps.slice(0, 400).map(s => `
      <tr>
        <td>${s.label}</td>
        <td>${s.kind === "start" ? "—" : s.kind}</td>
        <td>${s.lambda !== undefined ? `${s.num}·${s.den}⁻¹ = ${s.lambda}` : "—"}</td>
        <td><strong>${str(s.R)}</strong></td>
      </tr>`).join("");
    $("steps-table").innerHTML = `<thead><tr><th>Step</th><th>Operation</th><th>λ (mod p)</th><th>Result</th></tr></thead><tbody>${rows}</tbody>`;
    resetAnimation();
  }

  // ---------- 05: visualisation ----------
  const grid = $("grid");

  function drawGrid() {
    const dpr = window.devicePixelRatio || 1;
    const w = grid.clientWidth, h = grid.clientHeight;
    grid.width = w * dpr; grid.height = h * dpr;
    const ctx = grid.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const p = Number(state.curve.p), pad = 34;
    const size = Math.min(w, h) - pad * 2;
    const ox = (w - size) / 2, oy = (h - size) / 2;
    const cell = size / p;
    const X = x => ox + (Number(x) + 0.5) * cell;
    const Y = y => oy + size - (Number(y) + 0.5) * cell;

    // grid lines
    ctx.strokeStyle = css("--line"); ctx.lineWidth = 1;
    if (p <= 31) {
      for (let i = 0; i <= p; i++) {
        ctx.beginPath(); ctx.moveTo(ox + i * cell, oy); ctx.lineTo(ox + i * cell, oy + size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox, oy + i * cell); ctx.lineTo(ox + size, oy + i * cell); ctx.stroke();
      }
    } else {
      ctx.strokeRect(ox, oy, size, size);
    }
    ctx.fillStyle = css("--muted"); ctx.font = "11px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
    const ticks = p <= 31 ? [...Array(p).keys()] : [0, Math.floor(p / 2), p - 1];
    ticks.forEach(t => {
      ctx.fillText(t, X(t), oy + size + 14);
      ctx.textAlign = "right"; ctx.fillText(t, ox - 6, Y(t) + 4); ctx.textAlign = "center";
    });
    ctx.fillText("x", ox + size + 14, oy + size + 14);
    ctx.fillText("y", ox - 14, oy - 8);

    // points
    const r = Math.max(1.5, Math.min(7, cell * 0.3));
    state.points.forEach(P => {
      const inSub = state.subgroup.has(key(P));
      ctx.fillStyle = inSub ? css("--accent-2") : css("--line");
      ctx.beginPath(); ctx.arc(X(P.x), Y(P.y), r, 0, Math.PI * 2); ctx.fill();
    });

    // path so far
    const steps = state.trace ? state.trace.steps : [];
    const upto = state.stepIdx;
    for (let i = 1; i <= upto && i < steps.length; i++) {
      const A = steps[i - 1].R, B = steps[i].R;
      if (!A || !B) continue;
      arrow(ctx, X(A.x), Y(A.y), X(B.x), Y(B.y), i === upto ? css("--accent") : css("--muted"), i === upto ? 2.5 : 1, i === upto ? 1 : 0.35);
    }
    if (upto >= 0 && steps[upto]) {
      const s = steps[upto];
      if (s.R) {
        ctx.fillStyle = css("--accent");
        ctx.beginPath(); ctx.arc(X(s.R.x), Y(s.R.y), r + 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = css("--ink"); ctx.font = "600 12px 'JetBrains Mono', monospace"; ctx.textAlign = "left";
        ctx.fillText(`${s.i}G`, X(s.R.x) + r + 7, Y(s.R.y) - r - 4);
      }
      if (s.P2 && s.kind === "add" && s.P2 !== s.P1) {
        ctx.strokeStyle = css("--accent"); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(X(s.P2.x), Y(s.P2.y), r + 4, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  function arrow(ctx, x1, y1, x2, y2, color, width, alpha) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
    if (x1 === x2 && y1 === y2) { ctx.beginPath(); ctx.arc(x1, y1 - 12, 10, 0.3, Math.PI * 2 - 0.3); ctx.stroke(); ctx.restore(); return; }
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1), L = 9;
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - L * Math.cos(a - 0.4), y2 - L * Math.sin(a - 0.4));
    ctx.lineTo(x2 - L * Math.cos(a + 0.4), y2 - L * Math.sin(a + 0.4));
    ctx.closePath(); ctx.fill(); ctx.restore();
  }

  function caption() {
    const s = state.trace && state.trace.steps[state.stepIdx];
    const p = state.curve.p;
    if (!s) { $("caption").textContent = "Press Play or Step to start."; $("bits").innerHTML = bitsHtml(-1); return; }
    let txt = `${s.label} = ${str(s.R)}`;
    if (s.kind === "add") {
      txt += `\n  λ = (y₂ − y₁)·(x₂ − x₁)⁻¹ = (${s.P2.y} − ${s.P1.y})·(${s.P2.x} − ${s.P1.x})⁻¹ ≡ ${s.num}·${s.den}⁻¹ ≡ ${s.lambda} (mod ${p})`;
      txt += `\n  x₃ = λ² − x₁ − x₂ ≡ ${s.R.x},  y₃ = λ(x₁ − x₃) − y₁ ≡ ${s.R.y}`;
    } else if (s.kind === "double") {
      txt += `\n  λ = (3x²)·(2y)⁻¹ = (3·${s.P1.x}²)·(2·${s.P1.y})⁻¹ ≡ ${s.num}·${s.den}⁻¹ ≡ ${s.lambda} (mod ${p})`;
      txt += `\n  x₃ = λ² − 2x₁ ≡ ${s.R.x},  y₃ = λ(x₁ − x₃) − y₁ ≡ ${s.R.y}`;
    } else if (s.kind === "inverse") {
      txt += `\n  the two points have the same x and opposite y → the sum is the point at infinity O`;
    } else {
      txt += `\n  start from the base point`;
    }
    if (state.stepIdx === state.trace.steps.length - 1) txt += `\n\n  ✓ TOY PUBLIC KEY Q = ${str(state.trace.Q)}`;
    $("caption").textContent = txt;
    $("bits").innerHTML = bitsHtml(s.bitIndex ?? -1, s.bits);
  }

  function bitsHtml(idx, bits) {
    if (!bits) return "";
    return `<span class="muted">k in binary:</span> ` + bits.split("").map((b, i) =>
      `<span class="bit${i === idx ? " cur" : ""}${i < idx ? " done" : ""}">${b}</span>`).join("");
  }

  function stepForward() {
    if (!state.trace) return;
    if (state.stepIdx < state.trace.steps.length - 1) { state.stepIdx++; drawGrid(); caption(); }
    else stop();
  }
  function play() {
    if (state.timer) { stop(); return; }
    if (state.stepIdx >= state.trace.steps.length - 1) state.stepIdx = -1;
    $("play").textContent = "❚❚ Pause";
    const tick = () => { stepForward(); if (state.timer) state.timer = setTimeout(tick, 2150 - +$("speed").value); };
    state.timer = setTimeout(tick, 10);
  }
  function stop() { clearTimeout(state.timer); state.timer = null; $("play").textContent = "▶ Play"; }
  function resetAnimation() { stop(); state.stepIdx = -1; drawGrid(); caption(); }

  // ---------- 06: statistics ----------
  function pearson(a, b) {
    const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    return da && db ? num / Math.sqrt(da * db) : 0;
  }

  function runStats() {
    const { curve, G, n } = state, p = Number(curve.p);
    if (n < 3) {
      $("stats-out").textContent = `G has order ${n}: it only produces ${n - 1} point(s). Choose a base point of larger order.`;
      return;
    }
    const bitsLen = (p - 1).toString(2).length;
    const ks = [], xs = [], ys = [], Q = [null];
    let R = null;
    for (let k = 1; k < n; k++) { R = curve.add(R, G); Q.push(R); ks.push(k); xs.push(Number(R.x)); ys.push(Number(R.y)); }

    const xc = new Array(p).fill(0), yc = new Array(p).fill(0);
    xs.forEach(v => xc[v]++); ys.forEach(v => yc[v]++);
    const ones = new Array(bitsLen).fill(0);
    xs.forEach(v => { for (let b = 0; b < bitsLen; b++) if ((v >> b) & 1) ones[b]++; });
    const share = ones.map(c => c / xs.length).reverse(); // most significant bit first

    // symmetry x(kG) = x((n−k)G)
    let sym = 0;
    for (let k = 1; k < n; k++) if (Q[k].x === Q[n - k].x) sym++;

    // avalanche: flip one bit of k
    const kBits = (n - 1).toString(2).length;
    const hd = new Array(bitsLen + 1).fill(0);
    let pairs = 0, total = 0, unchanged = 0;
    for (let k = 1; k < n; k++) for (let b = 0; b < kBits; b++) {
      const k2 = k ^ (1 << b);
      if (k2 < 1 || k2 >= n) continue;
      const d = popcount(Q[k].x ^ Q[k2].x);
      hd[d]++; pairs++; total += d; if (d === 0) unchanged++;
    }

    const rx = pearson(ks, xs), ry = pearson(ks, ys);
    const distinctX = xc.filter(c => c > 0).length;
    const meanBit = ones.reduce((s, c) => s + c, 0) / (xs.length * bitsLen);

    // order of every possible base point
    const orders = state.points.map(orderOf).sort((a, b) => a - b);
    const orderCount = {};
    orders.forEach(o => orderCount[o] = (orderCount[o] || 0) + 1);

    $("stats-facts").innerHTML = facts([
      ["Keys tested", `k = 1 … ${n - 1}`],
      ["Distinct public keys", `${new Set(Q.slice(1).map(key)).size}`],
      ["Distinct x values", `${distinctX} of ${p}`],
      ["Mean share of 1-bits in x", meanBit.toFixed(3)],
      ["corr(k, x) / corr(k, y)", `${rx.toFixed(3)} / ${ry.toFixed(3)}`],
      ["Avg. bits of x changed (1-bit flip of k)", `${(total / pairs).toFixed(2)} of ${bitsLen}`]
    ]);

    Charts.bars($("c-x"), xc, { title: "count", xMin: 0, xMax: p - 1, xLabel: "x" });
    Charts.bars($("c-y"), yc, { title: "count", xMin: 0, xMax: p - 1, xLabel: "y" });
    Charts.bars($("c-bits"), share, { yMax: 1, refLine: 0.5, title: "share of 1s", xMin: 1, xMax: bitsLen, xLabel: "bit (MSB → LSB)" });
    Charts.scatter($("c-kx"), ks.map((k, i) => ({ x: k, y: xs[i] })), { yMin: 0, yMax: p - 1, xLabel: "k", title: "x(kG)" });
    Charts.bars($("c-aval"), hd, { title: "pairs", xMin: 0, xMax: bitsLen, xLabel: "Hamming distance" });
    Charts.bars($("c-bases"), orders, { title: "order", xMin: 1, xMax: orders.length, xLabel: "base point (sorted)" });

    $("stats-out").textContent =
      `Base points by order (group order N = ${state.groupOrder}): ` +
      Object.entries(orderCount).map(([o, c]) => `order ${o}: ${c}`).join(" · ") +
      `\nx(kG) = x((n−k)G) for ${sym} of ${n - 1} keys, because (n−k)G = −kG.` +
      `\nOne-bit flips of k left x unchanged in ${unchanged} of ${pairs} cases.`;

    const small = p <= 31;
    $("stats-notes").innerHTML = `
      <h3>What the numbers say</h3>
      <ul>
        <li><strong>Coordinates.</strong> x takes only ${distinctX} values and each appears at most twice, because a point and its negative share the same x. ${small ? "With so few points, “uniformity” can barely be tested." : "The non-empty x values are spread over the whole range with no visible pattern."}</li>
        <li><strong>Bits.</strong> The share of 1-bits is ${meanBit.toFixed(2)} on average. On a small field this is distorted because p is not a power of two (values ≥ p never occur, so the top bit is biased).</li>
        <li><strong>Correlation.</strong> Linear correlation between k and the coordinates is weak (${rx.toFixed(2)}, ${ry.toFixed(2)}), but the output is fully structured: kG and (n−k)G are mirror images, and (a+b)G = aG + bG.</li>
        <li><strong>Avalanche.</strong> Flipping one bit of k changes ${(100 * total / pairs / bitsLen).toFixed(0)}% of the bits of x on average, against 50% for an ideal hash.</li>
        <li><strong>Base points.</strong> The group order ${state.groupOrder} is ${isPrime(state.groupOrder) ? "prime, so every point except O is a generator" : "not prime, so some base points generate small subgroups"}. A real curve must use a base point of large prime order.</li>
      </ul>`;
  }

  function isPrime(v) { if (v < 2) return false; for (let d = 2; d * d <= v; d++) if (v % d === 0) return false; return true; }

  // ---------- 07: secp256k1 ----------
  function parseScalar(s) {
    s = s.trim();
    if (!s) return ECC.randomScalar();
    if (/^0x/i.test(s) || /[a-f]/i.test(s)) return BigInt("0x" + s.replace(/^0x/i, ""));
    return BigInt(s);
  }

  function secpOne() {
    let k;
    try { k = parseScalar($("secp-k").value); } catch { $("secp-key").textContent = "Could not read the key."; return; }
    if (k <= 0n || k >= ECC.SECP.n) { $("secp-key").textContent = "k must be between 1 and n − 1."; return; }
    const Q = ECC.secp.mul(k);
    const prefix = Q.y % 2n === 0n ? "02" : "03";
    $("secp-key").textContent =
      `private key k   = 0x${ECC.hex(k)}\n` +
      `public key  Q.x = 0x${ECC.hex(Q.x)}\n` +
      `            Q.y = 0x${ECC.hex(Q.y)}\n` +
      `compressed      = ${prefix}${ECC.hex(Q.x)}\n` +
      `on secp256k1    = ${ECC.SECP.curve.isOnCurve(Q) ? "yes ✓" : "no"}`;
  }

  function secpRun() {
    const N = +$("secp-n").value;
    const bitOnes = new Array(256).fill(0), lead = new Array(16).fill(0), hds = [];
    let done = 0;
    $("secp-run").disabled = true;
    const chunk = () => {
      const end = Math.min(N, done + 20);
      for (; done < end; done++) {
        const k = ECC.randomScalar();
        const x = ECC.secp.mul(k).x;
        for (let b = 0; b < 256; b++) if ((x >> BigInt(255 - b)) & 1n) bitOnes[b]++;
        lead[Number(x >> 252n)]++;
        let k2 = k ^ (1n << BigInt(Math.floor(Math.random() * 256)));
        k2 = ECC.mod(k2, ECC.SECP.n); if (k2 === 0n) k2 = 1n;
        hds.push(ECC.hamming(x, ECC.secp.mul(k2).x));
      }
      $("secp-progress").textContent = `${done} / ${N}`;
      if (done < N) setTimeout(chunk, 0);
      else finish();
    };
    const finish = () => {
      $("secp-run").disabled = false;
      const share = bitOnes.map(c => c / N);
      const e = N / 16, chi = lead.reduce((s, o) => s + (o - e) ** 2 / e, 0);
      const mean = hds.reduce((s, v) => s + v, 0) / N;
      const sd = Math.sqrt(hds.reduce((s, v) => s + (v - mean) ** 2, 0) / (N - 1));
      const overall = bitOnes.reduce((s, c) => s + c, 0) / (256 * N);
      Charts.bars($("s-bits"), share, { yMax: 1, refLine: 0.5, title: "share of 1s", xMin: 1, xMax: 256, xLabel: "bit (MSB → LSB)" });
      Charts.bars($("s-byte"), lead, { refLine: e, title: "count", xMin: 0, xMax: 15, xLabel: "top 4 bits of x" });
      Charts.histogram($("s-aval"), hds, { bins: 24, min: 80, max: 176, title: "pairs", xLabel: "Hamming distance (of 256)" });
      $("secp-out").textContent =
        `${N} random private keys\n` +
        `share of 1-bits in x: ${overall.toFixed(4)} overall · per bit between ${Math.min(...share).toFixed(2)} and ${Math.max(...share).toFixed(2)} (expected 0.5 ± ${(0.5 / Math.sqrt(N)).toFixed(3)})\n` +
        `χ² test on the top 4 bits: χ² = ${chi.toFixed(2)} with 15 degrees of freedom (5% critical value 25.00) → ${chi < 25 ? "consistent with uniform" : "deviates from uniform"}\n` +
        `avalanche: flipping one bit of k changes on average ${mean.toFixed(1)} of 256 bits of x (sd ${sd.toFixed(1)}; ideal 128 ± 8)`;
    };
    chunk();
  }

  // ---------- events ----------
  $("prime").addEventListener("change", setCurve);
  $("base").addEventListener("change", setBase);
  $("compute-btn").addEventListener("click", compute);
  $("k").addEventListener("keydown", e => { if (e.key === "Enter") compute(); });
  $("method").addEventListener("change", compute);
  $("play").addEventListener("click", play);
  $("step").addEventListener("click", () => { stop(); stepForward(); });
  $("restart").addEventListener("click", resetAnimation);
  $("stats-btn").addEventListener("click", runStats);
  $("secp-one").addEventListener("click", secpOne);
  $("secp-run").addEventListener("click", secpRun);
  window.addEventListener("resize", drawGrid);
  document.addEventListener("themechange", drawGrid);

  setCurve();
  runStats();
  $("secp-k").value = "6";
  secpOne();
  $("secp-k").value = "";
});
