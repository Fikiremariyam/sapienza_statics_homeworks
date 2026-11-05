// =====================================================
// Homework 2 — From wallet seed to Ethereum address
// Uses Wallet (wallet.js), ECC (assets/js/ecc.js), Charts (assets/js/charts.js)
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const W = Wallet, hex = W.toHex;
  const TEST = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
  const TEST_ADDR = "0x9858EfFD232B4033E47d90003D41EC34EcaEda94";
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const facts = rows => rows.map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`).join("");
  const big = v => v.toString(16).padStart(64, "0");
  const tick = () => new Promise(r => setTimeout(r, 0));

  // ---------- pipeline ----------
  const stage = (n, title, body, note = "") =>
    `<div class="stage"><span class="stage-n">${n}</span><div class="stage-body"><h4>${title}</h4>${body}${note ? `<p class="stage-note">${note}</p>` : ""}</div></div>`;

  function colourChecksum(addr) {
    return "0x" + [...addr.slice(2)].map(ch => /[A-F]/.test(ch) ? `<b class="up">${ch}</b>` : ch).join("");
  }

  async function derive() {
    const phrase = $("mnemonic").value, pass = $("passphrase").value, path = $("path").value.trim();
    const v = await W.validateMnemonic(phrase);
    if (!v.words) { $("stages").innerHTML = `<div class="warning">${v.reason}</div>`; $("accounts").innerHTML = ""; return; }

    let chain;
    const seed = await W.mnemonicToSeed(phrase, pass);
    try { chain = await W.derivePath(seed, path); }
    catch (e) { $("stages").innerHTML = `<div class="warning">Derivation path: ${e.message}</div>`; return; }
    const master = chain[0], leaf = chain[chain.length - 1];
    const a = W.addressFromPrivate(leaf.k);
    const allBits = v.indices.map(i => i.toString(2).padStart(11, "0")).join("");
    const ENT = v.ENT;

    const wordsHtml = v.words.map((w, i) =>
      `<span class="word"><small>${i + 1}</small>${w}<em>${v.indices[i]} · ${v.indices[i].toString(2).padStart(11, "0")}</em></span>`).join("");

    const pathRows = chain.slice(1).map(k =>
      `<tr><td>${k.path}</td><td>${k.hardened ? "hardened" : "normal"}</td><td>${big(k.k).slice(0, 16)}…</td></tr>`).join("");

    const hashHex = hex(a.hash);
    const isTest = phrase.trim().split(/\s+/).join(" ").toLowerCase() === TEST && pass === "" && path === "m/44'/60'/0'/0/0";

    $("stages").innerHTML =
      stage(1, `Entropy — ${ENT} bits`,
        `<code class="hexbox">${hex(v.entropy)}</code><code class="bitbox">${allBits.slice(0, ENT)}<b class="cs">${allBits.slice(ENT)}</b></code>`,
        `The ${v.CS} bits in colour are the checksum: the first ${v.CS} bits of SHA-256(entropy). ${v.ok ? "Checksum OK ✓" : "<strong>Checksum does NOT match — this is not a valid BIP-39 phrase</strong> (wallets would reject it; it is derived here anyway)."}`) +
      stage(2, `Mnemonic — ${v.words.length} words`, `<div class="words">${wordsHtml}</div>`,
        `Every 11 bits select one of the 2048 words (2¹¹ = 2048).`) +
      stage(3, "Seed — PBKDF2-HMAC-SHA512, 2048 iterations", `<code class="hexbox">${hex(seed)}</code>`,
        `password = the sentence, salt = "mnemonic"${pass ? ` + "${pass.replace(/</g, "&lt;")}"` : ""}. 512 bits.`) +
      stage(4, "BIP-32 master key", `<code class="hexbox"><span class="lbl">k</span> ${big(master.k)}\n<span class="lbl">c</span> ${hex(master.c)}</code>`,
        `HMAC-SHA512(key = "Bitcoin seed", seed): left half = master private key, right half = chain code.`) +
      stage(5, `BIP-44 path ${path}`, `<div class="table-wrap"><table class="steps"><thead><tr><th>Level</th><th>Type</th><th>Private key</th></tr></thead><tbody>${pathRows}</tbody></table></div>`,
        `44' = BIP-44, 60' = Ethereum, then account, change (0 = external) and address index.`) +
      stage(6, "Private key", `<code class="hexbox">0x${big(leaf.k)}</code>`, `A number between 1 and n − 1 of the secp256k1 group.`) +
      stage(7, "secp256k1 public key Q = k·G", `<code class="hexbox"><span class="lbl">x</span> ${big(a.P.x)}\n<span class="lbl">y</span> ${big(a.P.y)}</code>`,
        `Uncompressed form 04 ‖ x ‖ y. The address uses the 64 bytes x ‖ y.`) +
      stage(8, "Keccak-256(x ‖ y)", `<code class="hexbox"><span class="dim">${hashHex.slice(0, 24)}</span><b class="keep">${hashHex.slice(24)}</b></code>`,
        `The first 12 bytes are discarded; the last 20 bytes (highlighted) are the address.`) +
      stage(9, "Address", `<code class="hexbox">0x${a.address}</code>`) +
      stage(10, "EIP-55 checksummed address", `<code class="hexbox addr">${colourChecksum(a.checksummed)}</code>`,
        `Upper case where the matching hex digit of Keccak-256("${a.address.slice(0, 6)}…") is ≥ 8.` +
        (isTest ? ` <strong>${a.checksummed === TEST_ADDR ? "✓ Matches the published test address used by MetaMask." : "✗ does not match the published test address"}</strong>` : ""));

    // first five accounts m/44'/60'/0'/0/i
    const parentPath = "m/44'/60'/0'/0";
    const parent = (await W.derivePath(seed, parentPath)).pop();
    let rows = "";
    for (let i = 0; i < 5; i++) {
      const child = await W.childKey(parent, i);
      rows += `<tr><td>Account ${i + 1}</td><td>${parentPath}/${i}</td><td>${W.addressFromPrivate(child.k).checksummed}</td></tr>`;
    }
    $("accounts").innerHTML = `<thead><tr><th>Wallet name</th><th>Path</th><th>Address</th></tr></thead><tbody>${rows}</tbody>`;
  }

  async function newPhrase(n) {
    const m = await W.randomMnemonic(n);
    $("mnemonic").value = m.words.join(" ");
    derive();
  }

  // ---------- statistics ----------
  async function runStats() {
    const N = +$("n-wallets").value;
    $("run-stats").disabled = true;
    const groups = new Array(32).fill(0);
    const addrOnes = new Array(160).fill(0);
    const aval = [], childHD = [], upper = new Array(21).fill(0);
    let typos = 0, undetected = 0;

    for (let w = 0; w < N; w++) {
      const m = await W.entropyToMnemonic(W.getRandom(16));
      m.indices.forEach(i => groups[i >> 6]++);
      const seed = await W.mnemonicToSeed(m.words.join(" "));
      const parent = (await W.derivePath(seed, "m/44'/60'/0'/0")).pop();
      const k0 = (await W.childKey(parent, 0)).k, k1 = (await W.childKey(parent, 1)).k;
      childHD.push(ECC.hamming(k0, k1));

      const a = W.addressFromPrivate(k0);
      const abits = W.bits(W.fromHex(a.address));
      for (let b = 0; b < 160; b++) if (abits[b] === "1") addrOnes[b]++;

      // avalanche: flip one bit of the public key
      const pub2 = a.pub.slice(); const bit = Math.floor(Math.random() * 512);
      pub2[bit >> 3] ^= 1 << (bit & 7);
      aval.push(ECC.hamming(W.bytesToBig(a.hash), W.bytesToBig(W.keccak256(pub2))));

      // EIP-55: upper-case letters and typo detection
      const body = a.checksummed.slice(2);
      upper[Math.min(20, (body.match(/[A-F]/g) || []).length)]++;
      for (let t = 0; t < 5; t++) {
        const pos = Math.floor(Math.random() * 40), alphabet = "0123456789abcdefABCDEF";
        let ch; do { ch = alphabet[Math.floor(Math.random() * alphabet.length)]; } while (ch.toLowerCase() === body[pos].toLowerCase());
        const typo = "0x" + body.slice(0, pos) + ch + body.slice(pos + 1);
        typos++; if (W.checkChecksum(typo) === true) undetected++;
      }
      if (w % 10 === 9) { $("stats-progress").textContent = `${w + 1} / ${N} wallets`; await tick(); }
    }

    // checksum experiment: random word sequences
    const cs = {};
    for (const words of [12, 24]) {
      let valid = 0; const T = 2000;
      for (let t = 0; t < T; t++) {
        const phrase = Array.from({ length: words }, () => W.WORDS[Math.floor(Math.random() * 2048)]).join(" ");
        if ((await W.validateMnemonic(phrase)).ok) valid++;
        if (t % 200 === 199) await tick();
      }
      cs[words] = valid / T;
    }

    $("run-stats").disabled = false;
    $("stats-progress").textContent = `${N} wallets analysed`;
    const expWords = N * 12 / 32;
    const chi = groups.reduce((s, o) => s + (o - expWords) ** 2 / expWords, 0);
    const share = addrOnes.map(c => c / N);
    const meanShare = share.reduce((a, b) => a + b, 0) / 160;
    const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
    const upMean = upper.reduce((s, c, i) => s + c * i, 0) / N;

    $("stats-facts").innerHTML = facts([
      ["Word groups χ² (31 df)", `${chi.toFixed(1)} ${chi < 44.99 ? "· uniform ✓" : "· not uniform"}`],
      ["Valid random 12-word phrases", `${(100 * cs[12]).toFixed(2)}% (theory 6.25%)`],
      ["Valid random 24-word phrases", `${(100 * cs[24]).toFixed(2)}% (theory 0.39%)`],
      ["Share of 1-bits in addresses", meanShare.toFixed(4)],
      ["Keccak avalanche", `${mean(aval).toFixed(1)} of 256 bits`],
      ["Upper-case letters per address", `${upMean.toFixed(2)} (theory 7.5)`],
      ["EIP-55 typos caught", `${typos - undetected} of ${typos}`],
      ["Child-key Hamming distance", `${mean(childHD).toFixed(1)} of 256`]
    ]);

    Charts.bars($("c-words"), groups, { refLine: expWords, title: "words used", xMin: 1, xMax: 32, xLabel: "word group" });
    Charts.bars($("c-checksum"), [cs[12], 1 / 16, cs[24], 1 / 256], {
      title: "share valid", xMin: "12 words", xMax: "24 words",
      colorAt: i => i % 2 ? css("--accent-2") : css("--accent")
    });
    Charts.bars($("c-addrbits"), share, { yMax: 1, refLine: 0.5, title: "share of 1s", xMin: 1, xMax: 160, xLabel: "address bit" });
    Charts.histogram($("c-aval"), aval, { bins: 32, min: 96, max: 160, title: "wallets", xLabel: "Hamming distance (of 256)" });
    Charts.bars($("c-upper"), upper, { title: "addresses", xMin: 0, xMax: 20, xLabel: "upper-case letters" });
    Charts.histogram($("c-child"), childHD, { bins: 32, min: 96, max: 160, title: "wallets", xLabel: "Hamming distance (of 256)" });

    $("stats-notes").innerHTML = `
      <h3>Reading the results</h3>
      <ul>
        <li><strong>BIP-39 words</strong> are used uniformly (χ² = ${chi.toFixed(1)} against a 5% critical value of 45.0), because each word is just 11 random bits. A phrase chosen by a person would fail this test.</li>
        <li><strong>Checksum.</strong> A random sequence of words is valid ${(100 * cs[12]).toFixed(1)}% of the time for 12 words (theory 1/16 = 6.25%) and ${(100 * cs[24]).toFixed(2)}% for 24 words (theory 1/256 ≈ 0.39%). The checksum catches about 94% of random mistakes in a 12-word phrase.</li>
        <li><strong>Keccak-256.</strong> Address bits are balanced (mean ${meanShare.toFixed(3)}), and flipping a single public-key bit changes ${mean(aval).toFixed(0)} of 256 hash bits, close to the ideal 128: the avalanche effect of a good hash.</li>
        <li><strong>BIP-32.</strong> Two consecutive child keys differ in ${mean(childHD).toFixed(0)} of 256 bits on average, so neighbouring accounts look statistically unrelated, even though anyone with the parent key and chain code can derive both.</li>
        <li><strong>EIP-55.</strong> An address has ${upMean.toFixed(1)} upper-case letters on average (theory: 40 × 6/16 = 15 letters, half of them upper case). ${typos - undetected} of ${typos} random single-character typos were detected (${(100 * (typos - undetected) / typos).toFixed(2)}%). A typo slips through only if every letter happens to have the right case for the new hash, about 2⁻¹⁵ on average, so misses are rare and mostly come from addresses with few letters.</li>
      </ul>`;
  }

  // ---------- SHA-2 vs Keccak / SHA-3 ----------
  async function hashDemo() {
    const text = $("sha-in").value, bytes = new TextEncoder().encode(text);
    const k = hex(W.keccak256(bytes)), s3 = hex(W.keccak256(bytes, 0x06));
    const s256 = hex(await W.sha256(bytes));
    const s512 = hex(new Uint8Array(await crypto.subtle.digest("SHA-512", bytes)));
    const same = [...k].filter((c, i) => c === s3[i]).length;
    $("sha-out").innerHTML = facts([
      ["Keccak-256 (Ethereum, padding 0x01)", k],
      ["SHA3-256 (FIPS 202, padding 0x06)", s3],
      ["SHA-256 (SHA-2)", s256],
      ["SHA-512 (SHA-2)", s512],
      ["Keccak-256 vs SHA3-256", `${same} of 64 hex digits equal (≈ 4 expected by chance): unrelated outputs`]
    ]);
  }

  // ---------- events ----------
  $("sha-run").addEventListener("click", hashDemo);
  $("sha-in").addEventListener("input", hashDemo);
  hashDemo();
  $("gen12").addEventListener("click", () => newPhrase(12));
  $("gen24").addEventListener("click", () => newPhrase(24));
  $("vector").addEventListener("click", () => { $("mnemonic").value = TEST; $("passphrase").value = ""; $("path").value = "m/44'/60'/0'/0/0"; derive(); });
  $("derive").addEventListener("click", derive);
  $("run-stats").addEventListener("click", runStats);

  $("mnemonic").value = TEST;
  derive();
});
