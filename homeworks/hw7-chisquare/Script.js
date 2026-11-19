// =====================================================
// Homework 7 — Contingency tables, expected frequencies and the chi-square test
// Everything is computed from raw records (x, f) in the browser.
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const css = (v, fb) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fb;
  const colors = () => ({
    accent: css("--accent", "#7c3aed"), accent2: css("--accent-2", "#db2777"),
    ink: css("--ink", "#1f1a33"), muted: css("--muted", "#6b6785"), line: css("--line", "#e7e2f3"),
    surface: css("--surface", "#ffffff"),
    blue: "#2563eb", pink: "#db2777", teal: "#0f9d7a", orange: "#d97706"
  });
  const tick = () => new Promise(r => setTimeout(r, 0));
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const facts = rows => rows.map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`).join("");
  const int = v => Math.round(v).toLocaleString("en-US");
  const f2 = v => v.toFixed(2);
  const pct = v => Number.isFinite(v) ? (100 * v).toFixed(1) + " %" : "–";
  const SUP = { "-": "⁻", "+": "", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  const sup = s => String(s).split("").map(ch => SUP[ch] ?? ch).join("");
  function sciFmt(v, d = 2) {
    if (v === 0) return "0";
    const [m, e] = v.toExponential(d).split("e");
    return `${m} × 10${sup(+e)}`;
  }
  const pFmt = p => !Number.isFinite(p) ? "–" : p === 0 ? "&lt; 10⁻³⁰⁰" : p >= 1e-4 ? p.toFixed(4) : sciFmt(p, 2);

  // seeded random numbers, so every visit shows the same samples until you ask for new ones
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // =====================================================
  // 1. Special functions: ln Γ and the χ² distribution
  // =====================================================
  const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  function lnGamma(z) {
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
    z -= 1;
    let x = LANCZOS[0];
    for (let i = 1; i < 9; i++) x += LANCZOS[i] / (z + i);
    const t = z + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }
  function gammaPSeries(a, x) {
    let sum = 1 / a, term = sum, ap = a;
    for (let n = 1; n < 1000; n++) {
      term *= x / ++ap; sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-16) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  function gammaQContinuedFraction(a, x) {
    const TINY = 1e-300;
    let b = x + 1 - a, c = 1 / TINY, d = 1 / b, h = d;
    for (let i = 1; i < 1000; i++) {
      const an = -i * (i - a); b += 2;
      d = an * d + b; if (Math.abs(d) < TINY) d = TINY;
      c = b + an / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d; const delta = d * c; h *= delta;
      if (Math.abs(delta - 1) < 1e-16) break;
    }
    return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
  }
  // P(χ²_k ≥ x) = Q(k/2, x/2)
  function chiSquareSF(x, k) {
    if (!(k > 0)) return NaN;
    if (x <= 0) return 1;
    const a = k / 2, y = x / 2;
    return y < a + 1 ? 1 - gammaPSeries(a, y) : gammaQContinuedFraction(a, y);
  }
  function chiSquarePDF(x, k) {
    if (x <= 0) return k === 2 ? 0.5 : 0;
    return Math.exp((k / 2 - 1) * Math.log(x) - x / 2 - (k / 2) * Math.LN2 - lnGamma(k / 2));
  }
  // critical value: the x with P(χ²_k ≥ x) = q, by bisection
  function chiSquareInv(q, k) {
    let lo = 0, hi = Math.max(2, k);
    while (chiSquareSF(hi, k) > q) hi *= 2;
    for (let i = 0; i < 200; i++) {
      const m = (lo + hi) / 2;
      if (chiSquareSF(m, k) > q) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  }

  // =====================================================
  // 2. Core statistics
  // =====================================================
  // one pass over the records; optional orders only sort the labels that occur
  function contingency(records, xOrder, fOrder) {
    const xs = [], fs = [], xi = new Map(), fi = new Map();
    for (const [x, f] of records) {
      if (!xi.has(x)) { xi.set(x, xs.length); xs.push(x); }
      if (!fi.has(f)) { fi.set(f, fs.length); fs.push(f); }
    }
    const byOrder = order => (a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
    };
    if (xOrder) { xs.sort(byOrder(xOrder)); xs.forEach((v, i) => xi.set(v, i)); }
    if (fOrder) { fs.sort(byOrder(fOrder)); fs.forEach((v, i) => fi.set(v, i)); }
    const N = xs.map(() => fs.map(() => 0));
    const xc = new Int32Array(records.length), fc = new Int32Array(records.length);
    records.forEach(([x, f], k) => {
      const i = xi.get(x), j = fi.get(f);
      N[i][j]++; xc[k] = i; fc[k] = j;
    });
    return { xs, fs, N, xc, fc };
  }

  function analyse(N) {
    const r = N.length, c = N[0].length;
    const rowT = N.map(row => row.reduce((a, b) => a + b, 0));
    const colT = N[0].map((_, j) => N.reduce((a, row) => a + row[j], 0));
    const n = rowT.reduce((a, b) => a + b, 0);
    const joint = N.map(row => row.map(v => v / n));
    const fX = rowT.map(v => v / n), fF = colT.map(v => v / n);
    const condFgivenX = N.map((row, i) => row.map(v => v / rowT[i]));
    const condXgivenF = N.map(row => row.map((v, j) => v / colT[j]));
    const E = N.map((row, i) => row.map((_, j) => rowT[i] * colT[j] / n));
    let chi2 = 0;
    const contrib = N.map((row, i) => row.map((v, j) => {
      const q = (v - E[i][j]) ** 2 / E[i][j];
      chi2 += q;
      return q;
    }));
    const resid = N.map((row, i) => row.map((v, j) => (v - E[i][j]) / Math.sqrt(E[i][j])));
    // the shortcut formula, as a check: χ² = n (Σ nᵢⱼ² / (nᵢ· n·ⱼ) − 1)
    let s = 0;
    N.forEach((row, i) => row.forEach((v, j) => { s += v * v / (rowT[i] * colT[j]); }));
    const chi2Short = n * (s - 1);
    const df = (r - 1) * (c - 1);
    const p = df > 0 ? chiSquareSF(chi2, df) : NaN;
    const k = Math.min(r - 1, c - 1);
    const V = k > 0 ? Math.sqrt(chi2 / (n * k)) : NaN;
    const Ef = E.flat();
    return {
      r, c, n, rowT, colT, joint, fX, fF, condFgivenX, condXgivenF, E, contrib, resid,
      chi2, chi2Short, df, p, V, minE: Math.min(...Ef), lowE: Ef.filter(e => e < 5).length, cells: Ef.length
    };
  }

  function chi2FromCodes(xc, fc, r, c, rowT, colT, n, buf) {
    buf.fill(0);
    for (let k = 0; k < xc.length; k++) buf[xc[k] * c + fc[k]]++;
    let s = 0;
    for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) {
      const e = rowT[i] * colT[j] / n, d = buf[i * c + j] - e;
      s += d * d / e;
    }
    return s;
  }

  // =====================================================
  // 3. Datasets
  // =====================================================
  const TITANIC = {
    xName: "Class", fName: "Survived", xs: ["1st", "2nd", "3rd", "Crew"], fs: ["No", "Yes"],
    N: [[122, 203], [167, 118], [528, 178], [673, 212]],
    desc: "Everyone on board RMS Titanic in April 1912: passengers by class, and crew. X = travel class, F = survived. Counts from R's built-in Titanic dataset (British Board of Trade inquiry). They are expanded into 2,201 individual records and shuffled, so the program has to count them like any raw dataset."
  };
  const HAIREYE = {
    xName: "Hair", fName: "Eye", xs: ["Black", "Brown", "Red", "Blond"], fs: ["Brown", "Blue", "Hazel", "Green"],
    N: [[68, 20, 15, 5], [119, 84, 54, 29], [26, 17, 14, 14], [7, 94, 10, 16]],
    desc: "592 statistics students at the University of Delaware (Snee, 1974), R's HairEyeColor dataset summed over sex. X = hair colour, F = eye colour. Expanded into individual records and shuffled."
  };
  const FW = {
    xName: "Protocol", fName: "Verdict", xs: ["TCP", "UDP", "ICMP"], fs: ["Allowed", "Blocked"],
    px: [0.55, 0.30, 0.15], base: 0.25, dep: [0.12, 0.25, 0.75]
  };

  function expand(T, seed) {
    const recs = [];
    T.N.forEach((row, i) => row.forEach((v, j) => { for (let k = 0; k < v; k++) recs.push([T.xs[i], T.fs[j]]); }));
    const rng = mulberry32(seed);
    for (let k = recs.length - 1; k > 0; k--) {
      const m = Math.floor(rng() * (k + 1));
      [recs[k], recs[m]] = [recs[m], recs[k]];
    }
    return recs;
  }
  // block probability per protocol: strength 0 → same for all (independent), 1 → fully protocol-dependent
  const blockProb = (strength, i) => FW.base + strength * (FW.dep[i] - FW.base);
  function firewallSample(strength, n, rng) {
    const recs = new Array(n);
    for (let k = 0; k < n; k++) {
      const u = rng(), i = u < FW.px[0] ? 0 : u < FW.px[0] + FW.px[1] ? 1 : 2;
      recs[k] = [FW.xs[i], rng() < blockProb(strength, i) ? "Blocked" : "Allowed"];
    }
    return recs;
  }
  // Cramér's V of the true population table of the firewall model
  function firewallTrueV(strength) {
    const P = FW.px.map((p, i) => [p * (1 - blockProb(strength, i)), p * blockProb(strength, i)]);
    const pc = [0, 1].map(j => P.reduce((a, row) => a + row[j], 0));
    let phi2 = 0;
    P.forEach((row, i) => row.forEach((v, j) => { const e = FW.px[i] * pc[j]; phi2 += (v - e) ** 2 / e; }));
    return Math.sqrt(phi2 / 1);
  }

  function parseCSV(text, header) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length);
    if (!lines.length) throw new Error("There is no data in the box.");
    const sep = ["\t", ";", ","].find(s => lines[0].includes(s));
    if (!sep) throw new Error("Could not find a comma, semicolon or tab between the two columns.");
    const split = l => l.split(sep).map(s => s.trim().replace(/^"(.*)"$/, "$1"));
    let names = ["X", "F"], start = 0;
    if (header) { const h = split(lines[0]); names = [h[0] || "X", h[1] || "F"]; start = 1; }
    const recs = []; let skipped = 0;
    for (let k = start; k < lines.length; k++) {
      const p = split(lines[k]);
      if (p.length < 2 || p[0] === "" || p[1] === "") { skipped++; continue; }
      recs.push([p[0], p[1]]);
    }
    if (recs.length < 2) throw new Error("Need at least two complete records.");
    const nx = new Set(recs.map(r => r[0])).size, nf = new Set(recs.map(r => r[1])).size;
    if (nx < 2 || nf < 2) throw new Error("Each column needs at least two different values.");
    if (nx > 15 || nf > 15) throw new Error(`Too many categories (${nx} × ${nf}). If a column is numeric, group it into classes first (for example 0–9, 10–19, …).`);
    return { names, recs, skipped };
  }

  // =====================================================
  // 4. State
  // =====================================================
  let D = null;       // { key, xName, fName, records, xOrder, fOrder, desc }
  let T = null;       // contingency
  let A = null;       // analysis
  let fwSeed = 7;
  let view = "counts";
  let permToken = 0;
  let permValues = null;
  const alpha = () => +$("alpha-select").value;

  function loadDataset(key) {
    $("ds-firewall").hidden = key !== "firewall";
    $("ds-custom").hidden = key !== "custom";
    $("csv-msg").textContent = ""; $("csv-msg").classList.remove("error");
    if (key === "titanic") D = { key, ...TITANIC, records: expand(TITANIC, 11), xOrder: TITANIC.xs, fOrder: TITANIC.fs };
    else if (key === "haireye") D = { key, ...HAIREYE, records: expand(HAIREYE, 12), xOrder: HAIREYE.xs, fOrder: HAIREYE.fs };
    else if (key === "firewall") {
      const s = +$("fw-alpha").value, n = +$("fw-n").value;
      D = {
        key, xName: FW.xName, fName: FW.fName, xOrder: FW.xs, fOrder: FW.fs,
        records: firewallSample(s, n, mulberry32(fwSeed)),
        desc: `Simulated connections: X = protocol (TCP 55 %, UDP 30 %, ICMP 15 %), F = firewall verdict. With strength 0 every protocol is blocked 25 % of the time (X and F independent). At strength ${s.toFixed(2)} the true block rates are TCP ${pct(blockProb(s, 0))}, UDP ${pct(blockProb(s, 1))}, ICMP ${pct(blockProb(s, 2))}.`
      };
    } else {
      try {
        const { names, recs, skipped } = parseCSV($("csv-text").value, $("csv-header").checked);
        D = { key, xName: names[0], fName: names[1], records: recs, xOrder: null, fOrder: null,
              desc: "Your own data. Categories appear in the order they first occur." };
        $("csv-msg").textContent = `${int(recs.length)} records read${skipped ? `, ${skipped} incomplete line${skipped > 1 ? "s" : ""} skipped` : ""}.`;
      } catch (e) {
        $("csv-msg").textContent = e.message; $("csv-msg").classList.add("error");
        return false;
      }
    }
    T = contingency(D.records, D.xOrder, D.fOrder);
    A = analyse(T.N);
    return true;
  }

  // =====================================================
  // 5. Canvas helpers
  // =====================================================
  function setup(cv) {
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 600, H = cv.clientHeight || 260;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = "12px Inter, system-ui, sans-serif";
    return { ctx, W, H };
  }
  function niceStep(raw) {
    const p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  function residColor(r) {
    const m = Math.min(Math.abs(r) / 4, 1), a = 0.10 + 0.75 * m;
    return r >= 0 ? `rgba(37,99,235,${a.toFixed(3)})` : `rgba(219,39,119,${a.toFixed(3)})`;
  }
  const residText = r => Math.min(Math.abs(r) / 4, 1) > 0.75 ? "#fff" : null;
  function fitText(ctx, s, w) {
    s = String(s);
    if (ctx.measureText(s).width <= w) return s;
    while (s.length > 1 && ctx.measureText(s + "…").width > w) s = s.slice(0, -1);
    return s + "…";
  }

  function drawMosaic(cv, TT, AA, small = false) {
    const { ctx, W, H } = setup(cv), c = colors();
    const pad = small ? { l: 62, r: 10, t: 10, b: 26 } : { l: 92, r: 14, t: 14, b: 34 };
    const gapX = small ? 4 : 6, gapY = 3, r = TT.xs.length, cc = TT.fs.length;
    const availW = W - pad.l - pad.r - gapX * (r - 1), availH = H - pad.t - pad.b - gapY * (cc - 1);
    let x = pad.l;
    for (let i = 0; i < r; i++) {
      const w = AA.rowT[i] / AA.n * availW;
      let y = pad.t;
      for (let j = 0; j < cc; j++) {
        const h = AA.condFgivenX[i][j] * availH;
        ctx.fillStyle = residColor(AA.resid[i][j]);
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = c.line; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, Math.max(0, w - 1), Math.max(0, h - 1));
        if (w > 34 && h > 16 && !small) {
          ctx.fillStyle = residText(AA.resid[i][j]) || c.ink; ctx.textAlign = "center";
          ctx.fillText(int(TT.N[i][j]), x + w / 2, y + h / 2 + 4);
        }
        y += h + gapY;
      }
      ctx.fillStyle = c.muted; ctx.textAlign = "center";
      ctx.fillText(fitText(ctx, TT.xs[i], Math.max(w, 14)), x + w / 2, H - pad.b + 16);
      x += w + gapX;
    }
    // where tiles would end under independence: the marginal distribution of F
    let y = pad.t;
    ctx.setLineDash([5, 4]); ctx.strokeStyle = c.ink; ctx.lineWidth = 1.2;
    for (let j = 0; j < cc; j++) {
      const h = AA.fF[j] * availH;
      ctx.fillStyle = c.muted; ctx.textAlign = "right";
      ctx.fillText(fitText(ctx, TT.fs[j], pad.l - 12), pad.l - 8, y + h / 2 + 4);
      if (j < cc - 1) {
        const yy = y + h + gapY / 2;
        ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(W - pad.r, yy); ctx.stroke();
      }
      y += h + gapY;
    }
    ctx.setLineDash([]);
  }

  function drawBars(cv, labels, fracs, counts, color) {
    const { ctx, W, H } = setup(cv), c = colors(), pad = { l: 44, r: 12, t: 20, b: 30 };
    const top = Math.min(1, Math.ceil(Math.max(...fracs) * 10 + 0.5) / 10);
    const Y = v => H - pad.b - v / top * (H - pad.t - pad.b);
    const step = top > 0.5 ? 0.2 : 0.1;
    ctx.strokeStyle = c.line; ctx.fillStyle = c.muted; ctx.textAlign = "right";
    for (let v = 0; v <= top + 1e-9; v += step) {
      ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(W - pad.r, Y(v)); ctx.stroke();
      ctx.fillText(Math.round(v * 100) + "%", pad.l - 6, Y(v) + 4);
    }
    const slot = (W - pad.l - pad.r) / labels.length, bw = Math.min(70, slot * 0.6);
    labels.forEach((lab, i) => {
      const x = pad.l + slot * i + (slot - bw) / 2;
      ctx.fillStyle = color; ctx.fillRect(x, Y(fracs[i]), bw, Y(0) - Y(fracs[i]));
      ctx.fillStyle = c.ink; ctx.textAlign = "center";
      ctx.fillText(pct(fracs[i]), x + bw / 2, Y(fracs[i]) - 6);
      ctx.fillStyle = c.muted;
      ctx.fillText(fitText(ctx, lab, slot - 4), x + bw / 2, H - pad.b + 16);
    });
  }

  function axesX(ctx, X, y0, xmax, W, padR, c) {
    const st = niceStep(xmax / 6);
    ctx.fillStyle = c.muted; ctx.strokeStyle = c.line; ctx.textAlign = "center";
    for (let v = 0; v <= xmax + 1e-9; v += st) {
      ctx.beginPath(); ctx.moveTo(X(v), y0); ctx.lineTo(X(v), y0 + 4); ctx.stroke();
      ctx.fillText(+v.toFixed(6), X(v), y0 + 16);
    }
  }

  function drawChiDist(cv, chi2, df, crit, a) {
    const { ctx, W, H } = setup(cv), c = colors(), pad = { l: 20, r: 20, t: 34, b: 36 };
    let xmax = Math.max(crit * 1.6, df + 5 * Math.sqrt(2 * df), 6);
    const onChart = chi2 <= xmax * 1.6;
    if (onChart) xmax = Math.max(xmax, chi2 * 1.12);
    const X = v => pad.l + v / xmax * (W - pad.l - pad.r);
    let ymax = 0;
    for (let k = 1; k <= 300; k++) ymax = Math.max(ymax, chiSquarePDF(xmax * (0.02 + 0.98 * k / 300), df));
    ymax *= 1.08;
    const Y = v => H - pad.b - Math.min(v, ymax) / ymax * (H - pad.t - pad.b);
    const area = (from, color) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(X(from), Y(0));
      for (let k = 0; k <= 200; k++) { const v = from + (xmax - from) * k / 200; ctx.lineTo(X(v), Y(chiSquarePDF(v, df))); }
      ctx.lineTo(X(xmax), Y(0)); ctx.closePath(); ctx.fill();
    };
    area(crit, "rgba(219,39,119,0.14)");
    if (onChart) area(chi2, "rgba(124,58,237,0.38)");
    // density curve
    ctx.strokeStyle = c.ink; ctx.lineWidth = 2; ctx.beginPath();
    for (let k = 0; k <= 400; k++) {
      const v = Math.max(1e-6, xmax * k / 400), y = Y(chiSquarePDF(v, df));
      k ? ctx.lineTo(X(v), y) : ctx.moveTo(X(v), y);
    }
    ctx.stroke();
    ctx.strokeStyle = c.muted; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, Y(0)); ctx.lineTo(W - pad.r, Y(0)); ctx.stroke();
    axesX(ctx, X, Y(0), xmax, W, pad.r, c);
    // critical value
    ctx.setLineDash([5, 4]); ctx.strokeStyle = c.pink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(X(crit), pad.t - 4); ctx.lineTo(X(crit), Y(0)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = c.pink; ctx.textAlign = X(crit) > W - 150 ? "right" : "left";
    ctx.fillText(`critical value ${f2(crit)} (α = ${a})`, X(crit) + (ctx.textAlign === "left" ? 5 : -5), pad.t - 18);
    // observed
    ctx.fillStyle = c.accent; ctx.strokeStyle = c.accent; ctx.lineWidth = 2.5;
    if (onChart) {
      ctx.beginPath(); ctx.moveTo(X(chi2), pad.t + 10); ctx.lineTo(X(chi2), Y(0)); ctx.stroke();
      ctx.textAlign = X(chi2) > W - 160 ? "right" : "left";
      ctx.fillText(`observed χ² = ${f2(chi2)}`, X(chi2) + (ctx.textAlign === "left" ? 5 : -5), pad.t + 4);
    } else {
      const y = pad.t + 30;
      ctx.beginPath(); ctx.moveTo(W - pad.r - 150, y); ctx.lineTo(W - pad.r - 4, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W - pad.r, y); ctx.lineTo(W - pad.r - 10, y - 5); ctx.lineTo(W - pad.r - 10, y + 5); ctx.fill();
      ctx.textAlign = "right";
      ctx.fillText(`observed χ² = ${f2(chi2)}, far off the chart`, W - pad.r, y - 10);
    }
  }

  function drawHistogram(cv, values, df, obs, crit) {
    const { ctx, W, H } = setup(cv), c = colors(), pad = { l: 20, r: 20, t: 30, b: 36 };
    const sorted = Float64Array.from(values).sort();
    let xmax = Math.max(sorted[Math.floor(sorted.length * 0.995)] || 1, crit * 1.3);
    const onChart = obs <= xmax * 1.5;
    if (onChart) xmax = Math.max(xmax, obs * 1.1);
    const bins = 40, bw = xmax / bins, cnt = new Array(bins).fill(0);
    for (const v of values) { const b = Math.floor(v / bw); if (b < bins) cnt[b]++; }
    const dens = cnt.map(k => k / (values.length * bw));
    let ymax = Math.max(...dens);
    for (let k = 1; k <= 200; k++) ymax = Math.max(ymax, chiSquarePDF(xmax * (0.03 + 0.97 * k / 200), df));
    ymax *= 1.1;
    const X = v => pad.l + v / xmax * (W - pad.l - pad.r);
    const Y = v => H - pad.b - Math.min(v, ymax) / ymax * (H - pad.t - pad.b);
    ctx.fillStyle = "rgba(124,58,237,0.30)";
    dens.forEach((d, b) => ctx.fillRect(X(b * bw) + 1, Y(d), X(bw) - X(0) - 2, Y(0) - Y(d)));
    ctx.strokeStyle = c.ink; ctx.lineWidth = 2; ctx.beginPath();
    for (let k = 0; k <= 300; k++) {
      const v = Math.max(1e-6, xmax * k / 300), y = Y(chiSquarePDF(v, df));
      k ? ctx.lineTo(X(v), y) : ctx.moveTo(X(v), y);
    }
    ctx.stroke();
    ctx.strokeStyle = c.muted; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, Y(0)); ctx.lineTo(W - pad.r, Y(0)); ctx.stroke();
    axesX(ctx, X, Y(0), xmax, W, pad.r, c);
    ctx.fillStyle = c.accent; ctx.strokeStyle = c.accent; ctx.lineWidth = 2.5;
    if (onChart) {
      ctx.beginPath(); ctx.moveTo(X(obs), pad.t); ctx.lineTo(X(obs), Y(0)); ctx.stroke();
      ctx.textAlign = X(obs) > W - 160 ? "right" : "left";
      ctx.fillText(`observed χ² = ${f2(obs)}`, X(obs) + (ctx.textAlign === "left" ? 5 : -5), pad.t - 8);
    } else {
      const y = pad.t + 14;
      ctx.beginPath(); ctx.moveTo(W - pad.r - 150, y); ctx.lineTo(W - pad.r - 4, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W - pad.r, y); ctx.lineTo(W - pad.r - 10, y - 5); ctx.lineTo(W - pad.r - 10, y + 5); ctx.fill();
      ctx.textAlign = "right";
      ctx.fillText(`observed χ² = ${f2(obs)}, far beyond every shuffle`, W - pad.r, y - 10);
    }
  }

  const legend = (el, items) => {
    el.innerHTML = items.map(([color, name]) => `<span><i style="background:${color}"></i>${name}</span>`).join("");
  };

  // =====================================================
  // 6. Table rendering
  // =====================================================
  function buildTable(TT, opts) {
    const r = TT.xs.length, c = TT.fs.length;
    const style = opts.style || (() => "");
    let h = `<thead><tr><th class="corner">${esc(D.xName)} ↓ &nbsp; ${esc(D.fName)} →</th>` +
      TT.fs.map(f => `<th>${esc(f)}</th>`).join("") +
      (opts.rowTot ? `<th class="tot">${opts.rowTotLabel || "Total"}</th>` : "") + `</tr></thead><tbody>`;
    for (let i = 0; i < r; i++) {
      h += `<tr><th>${esc(TT.xs[i])}</th>`;
      for (let j = 0; j < c; j++) h += `<td style="${style(i, j)}">${opts.cell(i, j)}</td>`;
      if (opts.rowTot) h += `<td class="tot">${opts.rowTot(i)}</td>`;
      h += `</tr>`;
    }
    if (opts.colTot) {
      h += `<tr><th class="tot">${opts.colTotLabel || "Total"}</th>` +
        TT.fs.map((_, j) => `<td class="tot">${opts.colTot(j)}</td>`).join("") +
        (opts.rowTot ? `<td class="tot">${opts.grand}</td>` : "") + `</tr>`;
    }
    return h + `</tbody>` + (opts.caption ? `<caption class="muted">${opts.caption}</caption>` : "");
  }
  const residStyle = (i, j) => {
    const fg = residText(A.resid[i][j]);
    return `background:${residColor(A.resid[i][j])};${fg ? `color:${fg};` : ""}`;
  };

  function renderDataset() {
    $("ds-desc").textContent = D.desc;
    $("ds-facts").innerHTML = facts([
      ["Records n", int(A.n)],
      [`X = ${esc(D.xName)}`, `${A.r} categories`],
      [`F = ${esc(D.fName)}`, `${A.c} categories`],
      ["Table size", `${A.r} × ${A.c}`]
    ]);
    const rows = D.records.slice(0, 8).map(([x, f], k) => `<tr><td>${k + 1}</td><td>${esc(x)}</td><td>${esc(f)}</td></tr>`).join("");
    $("ds-preview").innerHTML = `<thead><tr><th>k</th><th>xₖ (${esc(D.xName)})</th><th>fₖ (${esc(D.fName)})</th></tr></thead><tbody>${rows}` +
      (D.records.length > 8 ? `<tr><td colspan="3" class="muted">… ${int(D.records.length - 8)} more records</td></tr>` : "") + `</tbody>`;
  }

  function renderCounts() {
    $("ct-counts").innerHTML = buildTable(T, {
      cell: (i, j) => int(T.N[i][j]),
      rowTot: i => int(A.rowT[i]), colTot: j => int(A.colT[j]), grand: int(A.n),
      caption: "nᵢⱼ: number of records with X = xᵢ and F = fⱼ. Last column: row totals nᵢ·. Last row: column totals n·ⱼ. Corner: n."
    });
    drawMosaic($("mosaic"), T, A);
  }

  const VIEWS = {
    counts: {
      formula: "nᵢⱼ = #{ k : xₖ = xᵢ and fₖ = fⱼ }        nᵢ· = Σⱼ nᵢⱼ        n·ⱼ = Σᵢ nᵢⱼ        n = Σᵢ Σⱼ nᵢⱼ",
      note: "Absolute frequencies. The margins are the absolute marginal frequencies of X (right) and F (bottom).",
      opts: () => ({ cell: (i, j) => int(T.N[i][j]), rowTot: i => int(A.rowT[i]), colTot: j => int(A.colT[j]), grand: int(A.n) })
    },
    joint: {
      formula: "fᵢⱼ = nᵢⱼ / n        fᵢ· = nᵢ· / n  (marginal of X)        f·ⱼ = n·ⱼ / n  (marginal of F)        Σᵢ Σⱼ fᵢⱼ = 1",
      note: "Relative joint frequencies: the share of all records in each cell. They estimate the joint probabilities P(X = xᵢ, F = fⱼ).",
      opts: () => ({ cell: (i, j) => pct(A.joint[i][j]), rowTot: i => pct(A.fX[i]), colTot: j => pct(A.fF[j]), grand: "100 %" })
    },
    rowcond: {
      formula: "f(F = fⱼ | X = xᵢ) = nᵢⱼ / nᵢ·        each row adds up to 100 %",
      note: "Each row is the distribution of F inside one group of X (the row profile). Compare every row with the last one, the marginal distribution of F: under independence all rows would be identical to it. Cell colour = Pearson residual, as in the mosaic.",
      opts: () => ({
        cell: (i, j) => pct(A.condFgivenX[i][j]), rowTot: () => "100 %", rowTotLabel: "Row total",
        colTot: j => pct(A.fF[j]), colTotLabel: `All (marginal of ${esc(D.fName)})`, grand: "100 %", style: residStyle
      })
    },
    colcond: {
      formula: "f(X = xᵢ | F = fⱼ) = nᵢⱼ / n·ⱼ        each column adds up to 100 %",
      note: "Each column is the distribution of X inside one group of F (the column profile). Under independence every column would equal the last column, the marginal distribution of X.",
      opts: () => ({
        cell: (i, j) => pct(A.condXgivenF[i][j]), rowTot: i => pct(A.fX[i]), rowTotLabel: `All (marginal of ${esc(D.xName)})`,
        colTot: () => "100 %", colTotLabel: "Column total", grand: "100 %", style: residStyle
      })
    }
  };
  function renderFrequencies() {
    const V = VIEWS[view];
    $("freq-table").innerHTML = buildTable(T, V.opts());
    $("freq-formula").textContent = V.formula;
    $("freq-note").textContent = V.note;
    document.querySelectorAll("#freq-tabs button").forEach(b => b.classList.toggle("on", b.dataset.view === view));
    const c = colors();
    drawBars($("marg-x"), T.xs, A.fX, A.rowT, c.accent);
    drawBars($("marg-f"), T.fs, A.fF, A.colT, c.teal);
    $("marg-x-cap").textContent = `Marginal distribution of X = ${D.xName}: fᵢ· = nᵢ· / n`;
    $("marg-f-cap").textContent = `Marginal distribution of F = ${D.fName}: f·ⱼ = n·ⱼ / n`;
  }

  function renderExpected() {
    const i = 0, j = 0;
    $("exp-example").textContent =
      `Cell (X = ${T.xs[i]}, F = ${T.fs[j]}):\n` +
      `e₁₁ = n₁· × n·₁ / n = ${A.rowT[i]} × ${A.colT[j]} / ${A.n} = ${f2(A.E[i][j])}        (observed n₁₁ = ${T.N[i][j]})\n` +
      `Read it as: ${pct(A.fF[j])} of all records have F = ${T.fs[j]}, so if X did not matter we would expect\n` +
      `${pct(A.fF[j])} of the ${A.rowT[i]} records with X = ${T.xs[i]} to have it too.`;
    $("exp-table").innerHTML = buildTable(T, {
      cell: (a, b) => f2(A.E[a][b]),
      rowTot: a => int(A.rowT[a]), colTot: b => int(A.colT[b]), grand: int(A.n),
      caption: "Expected counts eᵢⱼ. They are usually not whole numbers. The margins are the same as in the observed table: independence redistributes the records inside the table without changing the totals."
    });
  }

  function renderChi() {
    const rowQ = A.contrib.map(row => row.reduce((s, v) => s + v, 0));
    const colQ = A.contrib[0].map((_, j) => A.contrib.reduce((s, row) => s + row[j], 0));
    $("oe-table").innerHTML = buildTable(T, {
      cell: (i, j) => `<span class="o">${int(T.N[i][j])}</span><span class="e">e = ${f2(A.E[i][j])}</span><span class="q">${f2(A.contrib[i][j])}</span>`,
      style: residStyle,
      rowTot: i => f2(rowQ[i]), rowTotLabel: "Σ row",
      colTot: j => f2(colQ[j]), colTotLabel: "Σ column", grand: `χ² = ${f2(A.chi2)}`,
      caption: "In each cell: observed n (bold), expected e, and the contribution (n − e)² / e. The contributions add up to χ²."
    });
    renderTest();
  }

  function renderTest() {
    const a = alpha();
    if (!(A.df > 0)) {
      $("chi-facts").innerHTML = facts([["χ²", f2(A.chi2)], ["Degrees of freedom", "0"], ["Test", "needs at least 2 rows and 2 columns"]]);
      return;
    }
    const crit = chiSquareInv(a, A.df), reject = A.p < a;
    $("chi-facts").innerHTML = facts([
      ["χ² statistic", f2(A.chi2)],
      ["Check: n(Σ nᵢⱼ²/(nᵢ· n·ⱼ) − 1)", f2(A.chi2Short)],
      ["Degrees of freedom (r−1)(c−1)", `(${A.r}−1)(${A.c}−1) = ${A.df}`],
      [`Critical value χ²(${A.df}) at α = ${a}`, f2(crit)],
      ["p-value P(χ² ≥ observed | H₀)", pFmt(A.p)],
      ["Cramér's V", A.V.toFixed(3)],
      ["Smallest expected count", f2(A.minE)],
      ["Decision", reject ? "reject H₀: dependent" : "do not reject H₀"]
    ]);
    const c = colors();
    drawChiDist($("chi-dist"), A.chi2, A.df, crit, a);
    legend($("chi-legend"), [
      [c.ink, `χ² density, df = ${A.df}`],
      ["rgba(219,39,119,0.35)", `rejection region (area α = ${a})`],
      ["rgba(124,58,237,0.5)", "p-value (area right of observed χ²)"]
    ]);
    renderInterpretation();
    if (permValues) renderPermFacts();
  }

  // =====================================================
  // 7. Permutation test
  // =====================================================
  let permSeed = 2026;
  let permP = NaN;
  async function runPermutation() {
    const token = ++permToken;
    if (!(A.df > 0)) { $("perm-facts").innerHTML = ""; return; }
    const B = +$("perm-b").value, rng = mulberry32(permSeed);
    const r = A.r, c = A.c, buf = new Float64Array(r * c), f = Int32Array.from(T.fc);
    const vals = new Float64Array(B);
    let atLeast = 0;
    const tol = 1e-9 * Math.max(1, A.chi2);
    for (let b = 0; b < B; b++) {
      for (let k = f.length - 1; k > 0; k--) {
        const m = Math.floor(rng() * (k + 1));
        const t = f[k]; f[k] = f[m]; f[m] = t;
      }
      const v = chi2FromCodes(T.xc, f, r, c, A.rowT, A.colT, A.n, buf);
      vals[b] = v;
      if (v >= A.chi2 - tol) atLeast++;
      if (b % 250 === 249) { await tick(); if (token !== permToken) return; }
    }
    permValues = { vals, atLeast, B };
    permP = (atLeast + 1) / (B + 1);
    const c2 = colors();
    drawHistogram($("perm-hist"), vals, A.df, A.chi2, chiSquareInv(alpha(), A.df));
    legend($("perm-legend"), [["rgba(124,58,237,0.45)", `χ² of ${int(B)} shuffled datasets`], [c2.ink, `χ² density, df = ${A.df}`]]);
    renderPermFacts();
    renderInterpretation();
  }
  function renderPermFacts() {
    const { atLeast, B, vals } = permValues;
    let mx = 0; for (const v of vals) mx = Math.max(mx, v);
    $("perm-facts").innerHTML = facts([
      ["Shuffles", int(B)],
      ["Shuffles with χ² ≥ observed", int(atLeast)],
      ["Largest χ² among shuffles", f2(mx)],
      ["Permutation p-value (count + 1)/(B + 1)", atLeast === 0 ? `&lt; ${(1 / (B + 1)).toPrecision(2)}` : permP.toFixed(4)],
      ["χ²-distribution p-value", pFmt(A.p)]
    ]);
  }

  // =====================================================
  // 8. Interpretation
  // =====================================================
  function strength(V) {
    return V < 0.1 ? "negligible" : V < 0.2 ? "weak" : V < 0.4 ? "moderate" : V < 0.6 ? "relatively strong" : "very strong";
  }
  function renderInterpretation() {
    if (!(A.df > 0)) { $("verdict").textContent = "The table needs at least two rows and two columns to test independence."; $("interp").innerHTML = ""; return; }
    const a = alpha(), reject = A.p < a, crit = chiSquareInv(a, A.df);
    const vd = $("verdict");
    vd.className = "verdict " + (reject ? "dep" : "ind");
    vd.innerHTML = reject
      ? `${esc(D.xName)} and ${esc(D.fName)} are statistically dependent (p = ${pFmt(A.p)} &lt; α = ${a}).`
      : `No evidence against independence of ${esc(D.xName)} and ${esc(D.fName)} (p = ${pFmt(A.p)} ≥ α = ${a}).`;

    // which F category varies most across the rows
    let best = 0, bestRange = -1;
    for (let j = 0; j < A.c; j++) {
      const col = A.condFgivenX.map(row => row[j]);
      const range = Math.max(...col) - Math.min(...col);
      if (range >= bestRange - 1e-12) { bestRange = range; best = j; }   // on a tie, the later category
    }
    const col = A.condFgivenX.map(row => row[best]);
    const iMax = col.indexOf(Math.max(...col)), iMin = col.indexOf(Math.min(...col));

    const cells = [];
    A.contrib.forEach((row, i) => row.forEach((q, j) => cells.push({ i, j, q })));
    cells.sort((u, v) => v.q - u.q);
    const top = cells.slice(0, Math.min(3, cells.length)).map(({ i, j, q }) =>
      `<li><strong>${esc(T.xs[i])} &amp; ${esc(T.fs[j])}</strong>: observed ${int(T.N[i][j])}, expected ${f2(A.E[i][j])}, so <em>${T.N[i][j] > A.E[i][j] ? "more" : "fewer"}</em> than independence predicts. It contributes ${f2(q)}, which is ${pct(q / A.chi2)} of χ².</li>`).join("");

    const permLine = permValues && Number.isFinite(permP)
      ? `The permutation test agrees: ${permValues.atLeast === 0 ? `none of the ${int(permValues.B)} shuffled datasets reached the observed χ²` : `${int(permValues.atLeast)} of ${int(permValues.B)} shuffled datasets reached it (p ≈ ${permP.toFixed(4)})`}.`
      : "";

    $("interp").innerHTML = `
      <p><strong>Hypotheses.</strong> H₀: ${esc(D.xName)} and ${esc(D.fName)} are independent, P(X = xᵢ, F = fⱼ) = P(X = xᵢ) P(F = fⱼ) for all cells. H₁: they are dependent.</p>
      <p><strong>Test.</strong> χ² = ${f2(A.chi2)} with ${A.df} degree${A.df > 1 ? "s" : ""} of freedom. At α = ${a} the critical value is ${f2(crit)}, and the p-value is ${pFmt(A.p)}. ${reject
        ? `Since χ² &gt; ${f2(crit)} (equivalently p &lt; α), we <strong>reject H₀</strong>. If the variables were independent, a table this far from the expected counts would occur with probability ${pFmt(A.p)}.`
        : `Since χ² ≤ ${f2(crit)} (equivalently p ≥ α), we <strong>do not reject H₀</strong>. The table is compatible with independence. This is not a proof of independence: a dependence too weak to detect with n = ${int(A.n)} records could still exist.`} ${permLine}</p>
      <p><strong>Strength.</strong> Cramér's V = ${A.V.toFixed(3)}, a ${strength(A.V)} association (rough guide: below 0.1 negligible, 0.1–0.2 weak, 0.2–0.4 moderate, above 0.4 strong). ${reject && A.V < 0.1 ? "The result is statistically significant but the association is very weak: with a large n, even tiny differences become significant." : ""}</p>
      <p><strong>What the dependence looks like.</strong> The share of ${esc(D.fName)} = ${esc(T.fs[best])} ranges from ${pct(col[iMin])} (${esc(D.xName)} = ${esc(T.xs[iMin])}) to ${pct(col[iMax])} (${esc(D.xName)} = ${esc(T.xs[iMax])}), against ${pct(A.fF[best])} overall. The cells that contribute most to χ²:</p>
      <ul>${top}</ul>
      ${A.lowE > 0 ? `<div class="warn">${A.lowE} of the ${A.cells} expected counts are below 5 (smallest ${f2(A.minE)}), so the χ² approximation may be inaccurate. Prefer the permutation p-value, or merge rare categories.</div>` : `<p class="muted">All expected counts are at least 5 (smallest ${f2(A.minE)}), so the χ² approximation is reliable here.</p>`}
      <p><strong>Association, not causation.</strong> The test says that ${esc(D.xName)} and ${esc(D.fName)} ${reject ? "are" : "may not be"} associated, not why. It is symmetric in X and F and cannot tell cause from effect, nor rule out a third variable behind both. See the <a href="#causality">causality section</a>.</p>`;
  }

  // =====================================================
  // 9. Simulation
  // =====================================================
  let simSeed = 99;
  async function runSimulation() {
    const s = +$("sim-alpha").value, n = +$("sim-n").value, M = 400;
    $("sim-alpha-val").textContent = s.toFixed(2);
    $("sim-n-val").textContent = n;
    const rng = mulberry32(simSeed);
    const ps = [], Vs = [];
    let shown = null;
    for (let m = 0; m < M; m++) {
      const recs = firewallSample(s, n, rng);
      const TT = contingency(recs, FW.xs, FW.fs);
      if (TT.xs.length < 2 || TT.fs.length < 2) { ps.push(1); continue; }
      const AA = analyse(TT.N);
      ps.push(AA.p); Vs.push(AA.V);
      if (!shown) shown = { TT, AA };
      if (m % 100 === 99) await tick();
    }
    const c = colors();
    // histogram of p-values
    {
      const cv = $("sim-p"), { ctx, W, H } = setup(cv), pad = { l: 40, r: 12, t: 14, b: 34 };
      const bins = 20, cnt = new Array(bins).fill(0);
      ps.forEach(p => cnt[Math.min(bins - 1, Math.floor(p * bins))]++);
      const ymax = Math.max(M / bins * 2, ...cnt) * 1.18;
      const X = v => pad.l + v * (W - pad.l - pad.r), Y = v => H - pad.b - v / ymax * (H - pad.t - pad.b);
      cnt.forEach((k, b) => {
        ctx.fillStyle = b === 0 ? "rgba(37,99,235,0.75)" : "rgba(124,58,237,0.30)";
        ctx.fillRect(X(b / bins) + 1, Y(k), X(1 / bins) - X(0) - 2, Y(0) - Y(k));
      });
      ctx.setLineDash([4, 4]); ctx.strokeStyle = c.muted; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.l, Y(M / bins)); ctx.lineTo(W - pad.r, Y(M / bins)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = c.muted; ctx.textAlign = "right"; ctx.fillText("dashed line: flat level expected under independence", W - pad.r, pad.t + 2);
      ctx.strokeStyle = c.pink; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(X(0.05), pad.t); ctx.lineTo(X(0.05), Y(0)); ctx.stroke();
      ctx.strokeStyle = c.muted; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.l, Y(0)); ctx.lineTo(W - pad.r, Y(0)); ctx.stroke();
      ctx.fillStyle = c.muted; ctx.textAlign = "center";
      [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(v => ctx.fillText(v.toFixed(1), X(v), H - pad.b + 16));
      ctx.fillText("p-value", (pad.l + W - pad.r) / 2, H - 4);
      ctx.textAlign = "right";
      for (let v = 0; v <= ymax; v += niceStep(ymax / 4)) ctx.fillText(v, pad.l - 6, Y(v) + 4);
    }
    if (shown) drawMosaic($("sim-mosaic"), shown.TT, shown.AA, true);
    const rej = ps.filter(p => p < 0.05).length / M;
    const meanV = Vs.reduce((a, b) => a + b, 0) / Math.max(1, Vs.length);
    $("sim-facts").innerHTML = facts([
      ["Truth", s === 0 ? "independent" : "dependent"],
      ["True Cramér's V in the population", firewallTrueV(s).toFixed(3)],
      ["Samples with p < 0.05", `${(rej * 100).toFixed(1)} %`],
      [s === 0 ? "These are false alarms (type I)" : "Missed dependence (type II)", s === 0 ? `${(rej * 100).toFixed(1)} % ≈ α = 5 %` : `${((1 - rej) * 100).toFixed(1)} %`],
      ["Average sample V", meanV.toFixed(3)]
    ]);
  }

  // =====================================================
  // 10. Berkeley admissions (Bickel et al., 1975)
  // =====================================================
  const BERK = {
    A: { men: [512, 313], women: [89, 19] },
    B: { men: [353, 207], women: [17, 8] },
    C: { men: [120, 205], women: [202, 391] },
    D: { men: [138, 279], women: [131, 244] },
    E: { men: [53, 138], women: [94, 299] },
    F: { men: [22, 351], women: [24, 317] }
  };
  function renderBerkeley() {
    const depts = Object.keys(BERK);
    const men = [0, 0], women = [0, 0];
    depts.forEach(d => { [0, 1].forEach(k => { men[k] += BERK[d].men[k]; women[k] += BERK[d].women[k]; }); });
    const Tb = { xs: ["Men", "Women"], fs: ["Admitted", "Rejected"], N: [men, women] };
    const Ab = analyse(Tb.N);
    const saveD = D;
    D = { xName: "Gender", fName: "Decision" };
    $("berk-agg").innerHTML = buildTable(Tb, {
      cell: (i, j) => int(Tb.N[i][j]), rowTot: i => int(Ab.rowT[i]), colTot: j => int(Ab.colT[j]), grand: int(Ab.n)
    });
    D = saveD;
    $("berk-agg-facts").innerHTML = facts([
      ["Admission rate, men", pct(Ab.condFgivenX[0][0])],
      ["Admission rate, women", pct(Ab.condFgivenX[1][0])],
      ["χ² (df = 1)", f2(Ab.chi2)],
      ["p-value", pFmt(Ab.p)],
      ["Cramér's V", Ab.V.toFixed(3)]
    ]);
    const rows = depts.map(d => {
      const a = analyse([BERK[d].men, BERK[d].women]);
      const nm = BERK[d].men[0] + BERK[d].men[1], nw = BERK[d].women[0] + BERK[d].women[1];
      return { d, nm, nw, rm: BERK[d].men[0] / nm, rw: BERK[d].women[0] / nw, chi2: a.chi2, p: a.p };
    });
    $("berk-dept").innerHTML = `<thead><tr><th>Department</th><th>Men applied</th><th>Men admitted</th><th>Women applied</th><th>Women admitted</th><th>χ² (df = 1)</th><th>p-value</th><th>At α = 0.05</th></tr></thead><tbody>` +
      rows.map(o => `<tr><td>${o.d}</td><td>${int(o.nm)}</td><td>${pct(o.rm)}</td><td>${int(o.nw)}</td><td>${pct(o.rw)}</td><td>${f2(o.chi2)}</td><td>${pFmt(o.p)}</td><td>${o.p < 0.05 ? (o.rw > o.rm ? "dependent, favours women" : "dependent, favours men") : "no significant difference"}</td></tr>`).join("") +
      `<tr><td class="tot"><strong>All</strong></td><td class="tot">${int(Ab.rowT[0])}</td><td class="tot">${pct(Ab.condFgivenX[0][0])}</td><td class="tot">${int(Ab.rowT[1])}</td><td class="tot">${pct(Ab.condFgivenX[1][0])}</td><td class="tot">${f2(Ab.chi2)}</td><td class="tot">${pFmt(Ab.p)}</td><td class="tot">dependent, favours men</td></tr></tbody>`;

    // grouped bar chart
    const cv = $("berk-chart"), { ctx, W, H } = setup(cv), c = colors(), pad = { l: 44, r: 12, t: 18, b: 48 };
    const cats = [...rows.map(o => ({ lab: `Dept ${o.d}`, rm: o.rm, rw: o.rw, nm: o.nm, nw: o.nw })),
      { lab: "All", rm: Ab.condFgivenX[0][0], rw: Ab.condFgivenX[1][0], nm: Ab.rowT[0], nw: Ab.rowT[1] }];
    const Y = v => H - pad.b - v * (H - pad.t - pad.b);
    ctx.strokeStyle = c.line; ctx.fillStyle = c.muted; ctx.textAlign = "right";
    for (let v = 0; v <= 1.0001; v += 0.2) {
      ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(W - pad.r, Y(v)); ctx.stroke();
      ctx.fillText(Math.round(v * 100) + "%", pad.l - 6, Y(v) + 4);
    }
    const slot = (W - pad.l - pad.r) / cats.length, bw = Math.min(34, slot * 0.34);
    cats.forEach((o, k) => {
      const x0 = pad.l + slot * k + slot / 2;
      if (o.lab === "All") { ctx.fillStyle = "rgba(124,58,237,0.06)"; ctx.fillRect(pad.l + slot * k + 2, pad.t, slot - 4, Y(0) - pad.t); }
      [[o.rm, c.accent, -1], [o.rw, c.orange, 0]].forEach(([v, col, off]) => {
        const x = x0 + off * bw - (off === 0 ? -1 : 1);
        ctx.fillStyle = col; ctx.fillRect(x, Y(v), bw, Y(0) - Y(v));
        ctx.fillStyle = c.ink; ctx.textAlign = "center"; ctx.font = "11px Inter, system-ui, sans-serif";
        ctx.fillText(Math.round(v * 100) + "%", x + bw / 2, Y(v) - 4);
      });
      ctx.font = "12px Inter, system-ui, sans-serif";
      ctx.fillStyle = c.ink; ctx.textAlign = "center"; ctx.fillText(o.lab, x0, H - pad.b + 16);
      ctx.fillStyle = c.muted; ctx.font = "11px Inter, system-ui, sans-serif";
      ctx.fillText(`${int(o.nm)} / ${int(o.nw)}`, x0, H - pad.b + 32);
      ctx.font = "12px Inter, system-ui, sans-serif";
    });
    legend($("berk-legend"), [[c.accent, "men admitted"], [c.orange, "women admitted"], ["transparent", "numbers under each group: applicants, men / women"]]);
  }

  // =====================================================
  // 11. Wiring
  // =====================================================
  function renderAll() {
    renderDataset();
    renderCounts();
    renderFrequencies();
    renderExpected();
    renderChi();
    permValues = null;
    $("perm-facts").innerHTML = "";
    return runPermutation();
  }

  $("ds-select").addEventListener("change", () => { if (loadDataset($("ds-select").value)) renderAll(); });
  $("fw-alpha").addEventListener("input", () => { $("fw-alpha-val").textContent = (+$("fw-alpha").value).toFixed(2); });
  $("fw-n").addEventListener("input", () => { $("fw-n-val").textContent = $("fw-n").value; });
  ["fw-alpha", "fw-n"].forEach(id => $(id).addEventListener("change", () => { if (loadDataset("firewall")) renderAll(); }));
  $("fw-resample").addEventListener("click", () => { fwSeed++; if (loadDataset("firewall")) renderAll(); });
  $("csv-apply").addEventListener("click", () => { if (loadDataset("custom")) renderAll(); });
  $("freq-tabs").addEventListener("click", e => {
    const b = e.target.closest("button[data-view]");
    if (!b) return;
    view = b.dataset.view; renderFrequencies();
  });
  $("alpha-select").addEventListener("change", () => {
    renderTest();
    if (permValues) drawHistogram($("perm-hist"), permValues.vals, A.df, A.chi2, chiSquareInv(alpha(), A.df));
  });
  $("perm-run").addEventListener("click", () => { permSeed++; runPermutation(); });
  $("perm-b").addEventListener("change", runPermutation);
  $("sim-alpha").addEventListener("input", () => { $("sim-alpha-val").textContent = (+$("sim-alpha").value).toFixed(2); });
  $("sim-n").addEventListener("input", () => { $("sim-n-val").textContent = $("sim-n").value; });
  ["sim-alpha", "sim-n"].forEach(id => $(id).addEventListener("change", runSimulation));
  $("sim-run").addEventListener("click", () => { simSeed++; runSimulation(); });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      drawMosaic($("mosaic"), T, A);
      renderFrequencies();
      renderTest();
      if (permValues) drawHistogram($("perm-hist"), permValues.vals, A.df, A.chi2, chiSquareInv(alpha(), A.df));
      renderBerkeley();
      runSimulation();
    }, 200);
  });

  // expose the core for testing in the console
  window.hw7 = { contingency, analyse, chiSquareSF, chiSquareInv, lnGamma };

  (async () => {
    loadDataset("titanic");
    renderBerkeley();
    await renderAll();
    await runSimulation();
    document.body.dataset.ready = "1";
  })();
});