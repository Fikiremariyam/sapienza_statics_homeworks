// =====================================================
// Homework 2 — Encryption & cryptanalysis
// Uses ECC (assets/js/ecc.js), Charts (assets/js/charts.js), ENGLISH (english.js)
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const { SECP, secp, hex, short, mod } = ECC;
  const curve = SECP.curve, G = SECP.G;
  const facts = rows => rows.map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`).join("");
  const esc = s => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  // =========================================================
  // 02 — Toy EC-ElGamal
  // =========================================================
  const ecc = { bits: 16, d: null, Q: null, cipher: [], table: new Map(), points: [] };

  // lookup table m·G for m = 1 … 255  (used for encoding and decoding)
  (function buildTable() {
    let A = secp.INF;
    for (let m = 1; m <= 255; m++) {
      A = secp.jAddAffine(A, G);
      const P = secp.toAffine(A);
      ecc.points[m] = P;
      ecc.table.set(hex(P.x), m);
    }
  })();

  function keygen() {
    ecc.bits = +$("bits").value;
    ecc.d = ECC.randomScalar(32, 2n ** BigInt(ecc.bits));      // 1 … 2^b
    ecc.Q = secp.mul(ecc.d);
    ecc.cipher = [];
    $("keys").innerHTML = facts([
      ["Private key d (secret)", ecc.d.toString()],
      ["Key space", `1 … 2^${ecc.bits} = ${(2 ** ecc.bits).toLocaleString()}`],
      ["Public key Q.x", short(ecc.Q.x)],
      ["Public key Q.y", short(ecc.Q.y)]
    ]);
    $("cipher-table").innerHTML = "";
    $("ecc-result").innerHTML = `<span class="pk-label">DECRYPTED</span><span class="pk-value">—</span>`;
    $("attack-out").textContent = "New key pair: encrypt a message, then attack it here.";
    extrapolation();
  }

  function encodeChar(ch) {
    let m = ch.charCodeAt(0);
    if (m < 1 || m > 255) m = 63; // '?'
    return m;
  }

  function encrypt() {
    const text = $("message").value.slice(0, 300);
    ecc.cipher = [...text].map(ch => {
      const m = encodeChar(ch);
      const r = ECC.randomScalar();                 // fresh ephemeral key
      const C1 = secp.mul(r);                       // r·G
      const C2 = curve.add(ecc.points[m], secp.mul(r, ecc.Q)); // M + r·Q
      return { ch, m, r, C1, C2 };
    });
    $("cipher-table").innerHTML =
      `<thead><tr><th>#</th><th>char</th><th>m</th><th>ephemeral r</th><th>C₁ = rG (x)</th><th>C₂ = M + rQ (x)</th></tr></thead><tbody>` +
      ecc.cipher.map((c, i) => `<tr><td>${i + 1}</td><td>${esc(c.ch === " " ? "␣" : c.ch)}</td><td>${c.m}</td><td>${short(c.r, 6)}</td><td>${short(c.C1.x, 8)}</td><td>${short(c.C2.x, 8)}</td></tr>`).join("") +
      `</tbody>`;
    $("ecc-progress").textContent = `${ecc.cipher.length} characters → ${ecc.cipher.length * 2} curve points`;
    $("ecc-result").innerHTML = `<span class="pk-label">DECRYPTED</span><span class="pk-value">— press Decrypt —</span>`;
  }

  // decrypt with any candidate key (used by the owner and by the attacker)
  function decryptWith(d, cipher = ecc.cipher) {
    return cipher.map(({ C1, C2 }) => {
      const S = secp.mul(d, C1);                    // d·C1 = r·Q
      const M = curve.add(C2, curve.neg(S));        // C2 − d·C1
      const m = M ? ecc.table.get(hex(M.x)) : undefined;
      return m && ecc.points[m].y === M.y ? String.fromCharCode(m) : "�";
    }).join("");
  }

  function decrypt() {
    if (!ecc.cipher.length) encrypt();
    const plain = decryptWith(ecc.d);
    $("ecc-result").innerHTML = `<span class="pk-label">DECRYPTED WITH THE PRIVATE KEY d = ${ecc.d}</span><span class="pk-value">${esc(plain)}</span>
      <span class="pk-sub">${plain === $("message").value.slice(0, 300) ? "identical to the original message ✓" : "differs from the message"}</span>`;
  }

  // =========================================================
  // 03 — Caesar
  // =========================================================
  function caesar(text, s) {
    s = ((s % 26) + 26) % 26;
    return text.replace(/[a-z]/gi, ch => {
      const base = ch <= "Z" ? 65 : 97;
      return String.fromCharCode(base + (ch.charCodeAt(0) - base + s) % 26);
    });
  }

  function caesarDemo() {
    const s = Math.max(0, Math.min(25, parseInt($("shift").value, 10) || 0));
    const msg = $("message").value;
    const c = caesar(msg, s);
    $("caesar-out").innerHTML = facts([
      ["Plaintext", esc(msg)], ["Key s", s], ["Ciphertext", esc(c)], ["Decrypted (shift −s)", esc(caesar(c, -s))]
    ]);
    $("ciphertext").value = c;
    crackFull();
  }

  // =========================================================
  // 05 — Cryptanalysis
  // =========================================================
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let ref = [], bigramLog = new Float64Array(676);

  function setReference(letterPct, bigramPct) {
    const tot = Object.values(letterPct).reduce((a, b) => a + b, 0);
    ref = [...A].map(ch => (letterPct[ch] || 0.001) / tot);
    const btot = 100; // table is % of all pairs
    const floor = Math.log(0.002 / btot);
    bigramLog.fill(floor);
    Object.entries(bigramPct).forEach(([bg, pct]) => {
      bigramLog[(bg.charCodeAt(0) - 65) * 26 + bg.charCodeAt(1) - 65] = Math.log(pct / btot);
    });
  }
  setReference(ENGLISH.letters, ENGLISH.bigrams);

  function counts(text) {
    const c = new Array(26).fill(0);
    for (const ch of text.toUpperCase()) { const i = ch.charCodeAt(0) - 65; if (i >= 0 && i < 26) c[i]++; }
    return c;
  }

  const chiSquare = (c, s, N) => {
    let chi = 0;
    for (let i = 0; i < 26; i++) { const o = c[(i + s) % 26], e = N * ref[i]; chi += (o - e) ** 2 / e; }
    return chi;
  };

  function bigramScore(text, s) {
    const up = text.toUpperCase();
    let score = 0, prev = -1;
    for (const ch of up) {
      const i = ch.charCodeAt(0) - 65;
      if (i >= 0 && i < 26) {
        const p = (i - s + 26) % 26;
        if (prev >= 0) score += bigramLog[prev * 26 + p];
        prev = p;
      } else prev = -1;           // only pairs inside words
    }
    return score;
  }

  // returns the key found by each method
  function recover(text) {
    const c = counts(text), N = c.reduce((a, b) => a + b, 0);
    const maxI = c.indexOf(Math.max(...c));
    const freqKey = (maxI - 4 + 26) % 26;
    let chiKey = 0, chiBest = Infinity, bgKey = 0, bgBest = -Infinity;
    const rows = [];
    for (let s = 0; s < 26; s++) {
      const chi = N ? chiSquare(c, s, N) : 0, bg = bigramScore(text, s);
      rows.push({ s, chi, bg });
      if (chi < chiBest) { chiBest = chi; chiKey = s; }
      if (bg > bgBest) { bgBest = bg; bgKey = s; }
    }
    return { c, N, freqKey, chiKey, bgKey, rows };
  }

  function crackFull() {
    const text = $("ciphertext").value;
    const r = recover(text);
    if (!r.N) { $("crack-facts").innerHTML = facts([["Ciphertext", "no letters to analyse"]]); return; }
    const agree = r.chiKey === r.bgKey && r.bgKey === r.freqKey;
    $("crack-facts").innerHTML = facts([
      ["Letters analysed", r.N],
      ["Most-frequent-letter key", r.freqKey],
      ["χ² key", r.chiKey],
      ["Bigram key", r.bgKey],
      ["Recovered plaintext (bigram key)", esc(caesar(text, -r.bgKey)).slice(0, 160)],
      ["Methods agree?", agree ? "yes" : "no — see the table"]
    ]);
    Charts.bars($("c-cipher"), r.c.map(v => v / r.N), { title: "share", xMin: "A", xMax: "Z" });
    Charts.bars($("c-ref"), ref, { title: "share", xMin: "A", xMax: "Z" });
    const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    Charts.bars($("c-chi"), r.rows.map(x => x.chi), {
      title: "χ²", xMin: 0, xMax: 25, xLabel: "candidate shift",
      colorAt: i => i === r.chiKey ? css("--accent-2") : css("--accent")
    });
    const sorted = [...r.rows].sort((a, b) => a.chi - b.chi);
    $("candidates").innerHTML =
      `<thead><tr><th>Shift</th><th>χ²</th><th>Bigram score</th><th>Decryption</th></tr></thead><tbody>` +
      sorted.map(x => `<tr class="${x.s === r.chiKey ? "hit" : ""}"><td>${x.s}${x.s === r.chiKey ? " ← χ²" : ""}${x.s === r.bgKey ? " ← bigram" : ""}</td><td>${x.chi.toFixed(1)}</td><td>${x.bg.toFixed(1)}</td><td>${esc(caesar(text, -x.s).slice(0, 60))}</td></tr>`).join("") +
      `</tbody>`;
  }

  function useCorpus() {
    const t = $("corpus").value, c = counts(t), N = c.reduce((a, b) => a + b, 0);
    if (N < 500) { $("corpus-info").textContent = `Only ${N} letters — paste a longer text (thousands of letters).`; return; }
    const letters = {}; [...A].forEach((ch, i) => letters[ch] = 100 * c[i] / N);
    let bigrams = ENGLISH.bigrams, note = "built-in bigram table";
    if (N >= 20000) {
      const bc = {}; let tot = 0;
      t.toUpperCase().split(/[^A-Z]+/).forEach(w => { for (let i = 1; i < w.length; i++) { const k = w[i - 1] + w[i]; bc[k] = (bc[k] || 0) + 1; tot++; } });
      bigrams = {}; Object.entries(bc).forEach(([k, v]) => bigrams[k] = 100 * v / tot);
      note = "bigrams from the corpus";
    }
    setReference(letters, bigrams);
    $("corpus-info").textContent = `Using your corpus: ${N.toLocaleString()} letters (${note}).`;
    crackFull();
  }

  // =========================================================
  // 06 — Length experiment
  // =========================================================
  const sample = ENGLISH.sample;
  function excerpt(L) {
    const start = Math.floor(Math.random() * sample.length);
    let out = "", letters = 0, i = start;
    while (letters < L) {
      const ch = sample[i % sample.length];
      out += ch; if (/[a-z]/i.test(ch)) letters++;
      i++;
    }
    return out;
  }

  function runLengths() {
    const lengths = [3, 5, 8, 10, 15, 20, 30, 50, 75, 100, 200];
    const T = +$("trials").value;
    const res = { freq: [], chi: [], bg: [] };
    let idx = 0;
    $("run-lengths").disabled = true;
    const next = () => {
      const L = lengths[idx];
      let f = 0, c = 0, b = 0;
      for (let t = 0; t < T; t++) {
        const key = 1 + Math.floor(Math.random() * 25);
        const r = recover(caesar(excerpt(L), key));
        if (r.freqKey === key) f++; if (r.chiKey === key) c++; if (r.bgKey === key) b++;
      }
      res.freq.push(f / T); res.chi.push(c / T); res.bg.push(b / T);
      idx++;
      if (idx < lengths.length) setTimeout(next, 0); else done();
    };
    const done = () => {
      $("run-lengths").disabled = false;
      Charts.lines($("c-lengths"), [
        { name: "Most frequent = E", data: res.freq },
        { name: "χ²", data: res.chi },
        { name: "Bigram", data: res.bg }
      ], { yMin: 0, yMax: 1, title: "success rate", labels: lengths.map(String), xLabel: "letters in the ciphertext" });
      $("legend").innerHTML = `<span class="sw s1"></span>Most frequent letter = E <span class="sw s2"></span>χ² <span class="sw s3"></span>Bigram scoring`;
      $("length-table").innerHTML =
        `<thead><tr><th>Letters</th><th>Most frequent = E</th><th>χ²</th><th>Bigram</th></tr></thead><tbody>` +
        lengths.map((L, i) => `<tr><td>${L}</td><td>${pct(res.freq[i])}</td><td>${pct(res.chi[i])}</td><td>${pct(res.bg[i])}</td></tr>`).join("") +
        `</tbody>`;
    };
    next();
  }
  const pct = v => (100 * v).toFixed(1) + "%";

  // =========================================================
  // 07 — Attacking the restricted private key
  // =========================================================
  let attack = { running: false, rate: null };

  // compare Jacobian point A with affine Q without an inversion
  function jEquals(Aj, Q) {
    if (Aj.Z === 0n) return false;
    const p = SECP.p, Z2 = mod(Aj.Z * Aj.Z, p);
    return mod(Aj.X - Q.x * Z2, p) === 0n && mod(Aj.Y - Q.y * Z2 * Aj.Z, p) === 0n;
  }

  function needCipher() {
    if (!ecc.cipher.length) encrypt();
  }

  function bruteForce() {
    if (attack.running) return;
    needCipher();
    attack.running = true;
    const target = ecc.Q, max = 2 ** ecc.bits;
    let Aj = secp.INF, d = 0;
    const t0 = performance.now();
    $("attack-out").textContent = "Searching…";
    const chunk = () => {
      if (!attack.running) { $("attack-out").textContent = `Stopped after ${d.toLocaleString()} keys.`; return; }
      const end = Math.min(max, d + 25000);
      while (d < end) {
        d++;
        Aj = secp.jAddAffine(Aj, G);
        if (jEquals(Aj, target)) return found(d);
      }
      const secs = (performance.now() - t0) / 1000;
      $("attack-progress").textContent = `${d.toLocaleString()} / ${max.toLocaleString()} keys · ${Math.round(d / secs).toLocaleString()} keys/s`;
      if (d >= max) { attack.running = false; $("attack-out").textContent = "Key not found in range."; return; }
      setTimeout(chunk, 0);
    };
    const found = dk => {
      attack.running = false;
      const secs = (performance.now() - t0) / 1000;
      attack.rate = dk / Math.max(secs, 1e-3);
      $("attack-progress").textContent = `${dk.toLocaleString()} keys tried · ${Math.round(attack.rate).toLocaleString()} keys/s`;
      $("attack-out").textContent =
        `EXHAUSTIVE SEARCH\n` +
        `found d = ${dk}  (true key ${ecc.d}) after ${dk.toLocaleString()} point additions in ${secs.toFixed(2)} s\n` +
        `that is ${(100 * dk / max).toFixed(1)}% of the key space (expected on average: 50%)\n` +
        `decrypted message with the recovered key: “${decryptWith(BigInt(dk))}”`;
      extrapolation();
    };
    chunk();
  }

  function bsgs() {
    if (attack.running) return;
    needCipher();
    attack.running = true;
    setTimeout(() => {
      const t0 = performance.now();
      const N = 2 ** ecc.bits, m = Math.ceil(Math.sqrt(N));
      // baby steps: j·G for j = 1 … m
      const baby = new Map();
      let Aj = secp.INF;
      for (let j = 1; j <= m; j++) {
        Aj = secp.jAddAffine(Aj, G);
        const P = secp.toAffine(Aj);
        baby.set(hex(P.x), { j, y: P.y });
      }
      // giant steps: Q − i·(m·G)
      const stepNeg = curve.neg(secp.mul(BigInt(m)));
      let P = ecc.Q, d = null, ops = m, i = 0;
      for (; i <= m; i++) {
        const hit = P && baby.get(hex(P.x));
        if (hit) {
          const j = hit.y === P.y ? hit.j : -hit.j; // P = ±jG
          d = i * m + j;
          if (d > 0) break;
        }
        P = curve.add(P, stepNeg); ops++;
      }
      const secs = (performance.now() - t0) / 1000;
      attack.running = false;
      $("attack-progress").textContent = `${ops.toLocaleString()} group operations`;
      $("attack-out").textContent = d
        ? `BABY-STEP GIANT-STEP\n` +
          `m = ⌈√2^${ecc.bits}⌉ = ${m}: stored ${m.toLocaleString()} baby steps, took ${i} giant step(s)\n` +
          `found d = ${i}·${m} + ${d - i * m} = ${d}  (true key ${ecc.d}) with ${ops.toLocaleString()} operations in ${secs.toFixed(2)} s\n` +
          `brute force would need up to ${N.toLocaleString()} additions: ${(N / ops).toFixed(0)}× more\n` +
          `decrypted message with the recovered key: “${decryptWith(BigInt(d))}”`
        : "Not found (unexpected).";
    }, 20);
  }

  function fmtTime(s) {
    if (!isFinite(s)) return "∞";
    if (s < 1) return `${(s * 1000).toFixed(0)} ms`;
    if (s < 120) return `${s.toFixed(1)} s`;
    if (s < 7200) return `${(s / 60).toFixed(1)} min`;
    if (s < 172800) return `${(s / 3600).toFixed(1)} h`;
    const y = s / 31557600;
    if (y < 2) return `${(s / 86400).toFixed(0)} days`;
    return y < 1e6 ? `${y.toFixed(0)} years` : `${y.toExponential(1)} years`;
  }

  function benchmark() {
    let Aj = secp.INF; const t0 = performance.now();
    for (let i = 0; i < 10000; i++) Aj = secp.jAddAffine(Aj, G);
    return 10000 / ((performance.now() - t0) / 1000);
  }

  function extrapolation() {
    const rate = attack.rate || (attack.rate = benchmark());
    const rows = [...new Set([ecc.bits, 32, 48, 64, 80, 128, 256])].sort((a, b) => a - b);
    $("extrapolation").innerHTML =
      `<thead><tr><th>Key bits b</th><th>Keys</th><th>Brute force (worst case)</th><th>BSGS / Pollard ρ ≈ 2·2^(b/2)</th><th>BSGS memory</th></tr></thead><tbody>` +
      rows.map(b => {
        const keys = 2 ** b, mem = 2 ** (b / 2) * 64;
        return `<tr class="${b === ecc.bits ? "hit" : ""}"><td>${b}${b === ecc.bits ? " (this key)" : b === 256 ? " (secp256k1)" : ""}</td><td>${keys < 1e7 ? keys.toLocaleString() : keys.toExponential(2)}</td><td>${fmtTime(keys / rate)}</td><td>${fmtTime(2 * 2 ** (b / 2) / rate)}</td><td>${fmtBytes(mem)}</td></tr>`;
      }).join("") +
      `</tbody><caption class="muted">Measured on this device: ${Math.round(rate).toLocaleString()} point additions per second (one browser thread).</caption>`;
  }
  const fmtBytes = b => b < 1024 ** 2 ? `${(b / 1024).toFixed(0)} KB` : b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(0)} MB` : b < 1024 ** 4 ? `${(b / 1024 ** 3).toFixed(1)} GB` : `${(b / 1024 ** 4).toExponential(1)} TB`;

  // =========================================================
  // events & initial state
  // =========================================================
  $("bits").addEventListener("change", keygen);
  $("keygen").addEventListener("click", keygen);
  $("encrypt").addEventListener("click", encrypt);
  $("decrypt").addEventListener("click", decrypt);
  $("caesar-enc").addEventListener("click", caesarDemo);
  $("crack").addEventListener("click", crackFull);
  $("use-corpus").addEventListener("click", useCorpus);
  $("reset-corpus").addEventListener("click", () => { setReference(ENGLISH.letters, ENGLISH.bigrams); $("corpus-info").textContent = "Using built-in English frequencies."; crackFull(); });
  $("run-lengths").addEventListener("click", runLengths);
  $("brute").addEventListener("click", bruteForce);
  $("bsgs").addEventListener("click", bsgs);
  $("stop-attack").addEventListener("click", () => attack.running = false);

  keygen();
  encrypt();
  decrypt();
  caesarDemo();
  crackFull();
});
