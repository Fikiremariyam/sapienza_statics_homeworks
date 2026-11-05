// =====================================================
// wallet.js — Ethereum wallet pipeline, written step by step (educational).
// Mnemonic → BIP-39 seed → BIP-32/44 keys → secp256k1 public key
//          → Keccak-256 → address → EIP-55 checksum
// Needs ECC (assets/js/ecc.js) and BIP39_WORDS (wordlist.js).
// SHA-256, HMAC-SHA512 and PBKDF2 come from the browser's Web Crypto API.
// =====================================================
(function (global) {
  const ECClib = global.ECC || (typeof require !== "undefined" ? require("../../assets/js/ecc.js") : null);
  const WORDS = global.BIP39_WORDS || (typeof require !== "undefined" ? require("./wordlist.js") : null);
  const subtle = (global.crypto || require("crypto").webcrypto).subtle;
  const getRandom = n => (global.crypto || require("crypto").webcrypto).getRandomValues(new Uint8Array(n));
  const enc = new TextEncoder();

  // ---------------- byte helpers ----------------
  const toHex = b => [...b].map(x => x.toString(16).padStart(2, "0")).join("");
  const fromHex = h => Uint8Array.from((h.replace(/^0x/, "").match(/../g) || []).map(x => parseInt(x, 16)));
  const concat = (...arrs) => { const out = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0)); let o = 0; arrs.forEach(a => { out.set(a, o); o += a.length; }); return out; };
  const bigToBytes = (v, len = 32) => fromHex(v.toString(16).padStart(len * 2, "0"));
  const bytesToBig = b => BigInt("0x" + (toHex(b) || "0"));
  const ser32 = i => Uint8Array.from([(i >>> 24) & 255, (i >>> 16) & 255, (i >>> 8) & 255, i & 255]);
  const bits = b => [...b].map(x => x.toString(2).padStart(8, "0")).join("");

  // ---------------- Keccak-256 (original Keccak padding, as used by Ethereum) ----------------
  const RC = [
    [0x00000001, 0x00000000], [0x00008082, 0x00000000], [0x0000808a, 0x80000000], [0x80008000, 0x80000000],
    [0x0000808b, 0x00000000], [0x80000001, 0x00000000], [0x80008081, 0x80000000], [0x00008009, 0x80000000],
    [0x0000008a, 0x00000000], [0x00000088, 0x00000000], [0x80008009, 0x00000000], [0x8000000a, 0x00000000],
    [0x8000808b, 0x00000000], [0x0000008b, 0x80000000], [0x00008089, 0x80000000], [0x00008003, 0x80000000],
    [0x00008002, 0x80000000], [0x00000080, 0x80000000], [0x0000800a, 0x00000000], [0x8000000a, 0x80000000],
    [0x80008081, 0x80000000], [0x00008080, 0x80000000], [0x80000001, 0x00000000], [0x80008008, 0x80000000]
  ];
  const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];

  function keccakF(s) {                       // s: Uint32Array(50), lane i = (s[2i] lo, s[2i+1] hi)
    const C = new Uint32Array(10), B = new Uint32Array(50);
    for (let round = 0; round < 24; round++) {
      // θ
      for (let x = 0; x < 5; x++) {
        C[2 * x] = s[2 * x] ^ s[2 * x + 10] ^ s[2 * x + 20] ^ s[2 * x + 30] ^ s[2 * x + 40];
        C[2 * x + 1] = s[2 * x + 1] ^ s[2 * x + 11] ^ s[2 * x + 21] ^ s[2 * x + 31] ^ s[2 * x + 41];
      }
      for (let x = 0; x < 5; x++) {
        const l1 = C[2 * ((x + 1) % 5)], h1 = C[2 * ((x + 1) % 5) + 1];
        const dl = C[2 * ((x + 4) % 5)] ^ ((l1 << 1) | (h1 >>> 31));
        const dh = C[2 * ((x + 4) % 5) + 1] ^ ((h1 << 1) | (l1 >>> 31));
        for (let y = 0; y < 25; y += 5) { s[2 * (x + y)] ^= dl; s[2 * (x + y) + 1] ^= dh; }
      }
      // ρ and π
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
        const i = x + 5 * y, n = ROT[i], lo = s[2 * i], hi = s[2 * i + 1];
        let rl, rh;
        if (n === 0) { rl = lo; rh = hi; }
        else if (n < 32) { rl = (lo << n) | (hi >>> (32 - n)); rh = (hi << n) | (lo >>> (32 - n)); }
        else if (n === 32) { rl = hi; rh = lo; }
        else { const m = n - 32; rl = (hi << m) | (lo >>> (32 - m)); rh = (lo << m) | (hi >>> (32 - m)); }
        const j = y + 5 * ((2 * x + 3 * y) % 5);
        B[2 * j] = rl; B[2 * j + 1] = rh;
      }
      // χ
      for (let y = 0; y < 25; y += 5) for (let x = 0; x < 5; x++) {
        const a = x + y, b = ((x + 1) % 5) + y, c = ((x + 2) % 5) + y;
        s[2 * a] = B[2 * a] ^ (~B[2 * b] & B[2 * c]);
        s[2 * a + 1] = B[2 * a + 1] ^ (~B[2 * b + 1] & B[2 * c + 1]);
      }
      // ι
      s[0] ^= RC[round][0]; s[1] ^= RC[round][1];
    }
  }

  function keccak256(data, padByte = 0x01) {   // padByte 0x06 would give FIPS SHA3-256
    if (typeof data === "string") data = enc.encode(data);
    const rate = 136, s = new Uint32Array(50);
    const q = rate - (data.length % rate);
    const msg = new Uint8Array(data.length + q);
    msg.set(data); msg[data.length] |= padByte; msg[msg.length - 1] |= 0x80;
    for (let off = 0; off < msg.length; off += rate) {
      for (let i = 0; i < rate / 4; i++) {
        s[i] ^= msg[off + 4 * i] | (msg[off + 4 * i + 1] << 8) | (msg[off + 4 * i + 2] << 16) | (msg[off + 4 * i + 3] << 24);
      }
      keccakF(s);
    }
    const out = new Uint8Array(32);
    for (let i = 0; i < 8; i++) { const w = s[i]; out[4 * i] = w & 255; out[4 * i + 1] = (w >>> 8) & 255; out[4 * i + 2] = (w >>> 16) & 255; out[4 * i + 3] = (w >>> 24) & 255; }
    return out;
  }

  // ---------------- Web Crypto wrappers ----------------
  const sha256 = async b => new Uint8Array(await subtle.digest("SHA-256", b));
  async function hmacSha512(key, data) {
    const k = await subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
    return new Uint8Array(await subtle.sign("HMAC", k, data));
  }
  async function pbkdf2Sha512(password, salt, iterations, bytes) {
    const k = await subtle.importKey("raw", password, "PBKDF2", false, ["deriveBits"]);
    return new Uint8Array(await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-512", salt, iterations }, k, bytes * 8));
  }

  // ---------------- BIP-39 ----------------
  async function entropyToMnemonic(entropy) {
    const ENT = entropy.length * 8, CS = ENT / 32;
    const checksumBits = bits(await sha256(entropy)).slice(0, CS);
    const all = bits(entropy) + checksumBits;
    const indices = all.match(/.{11}/g).map(b => parseInt(b, 2));
    return { words: indices.map(i => WORDS[i]), indices, entropyBits: bits(entropy), checksumBits, ENT, CS };
  }

  const randomMnemonic = (words = 12) => entropyToMnemonic(getRandom(words === 24 ? 32 : 16));

  // returns { ok, reason, entropy, checksumBits, expected }
  async function validateMnemonic(phrase) {
    const words = phrase.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (![12, 15, 18, 21, 24].includes(words.length)) return { ok: false, reason: `${words.length} words (must be 12, 15, 18, 21 or 24)` };
    const idx = words.map(w => WORDS.indexOf(w));
    const bad = words.filter((w, i) => idx[i] < 0);
    if (bad.length) return { ok: false, reason: `not in the BIP-39 word list: ${bad.join(", ")}` };
    const all = idx.map(i => i.toString(2).padStart(11, "0")).join("");
    const CS = all.length / 33, ENT = all.length - CS;
    const entropy = Uint8Array.from(all.slice(0, ENT).match(/.{8}/g).map(b => parseInt(b, 2)));
    const expected = bits(await sha256(entropy)).slice(0, CS), got = all.slice(ENT);
    return { ok: expected === got, reason: expected === got ? "checksum OK" : "checksum mismatch", entropy, words, indices: idx, checksumBits: got, expected, ENT, CS };
  }

  function mnemonicToSeed(phrase, passphrase = "") {
    const m = phrase.trim().toLowerCase().split(/\s+/).join(" ").normalize("NFKD");
    return pbkdf2Sha512(enc.encode(m), enc.encode(("mnemonic" + passphrase).normalize("NFKD")), 2048, 64);
  }

  // ---------------- BIP-32 / BIP-44 ----------------
  const N = ECClib.SECP.n, HARD = 0x80000000;

  function compressedPub(k) {
    const P = ECClib.secp.mul(k);
    return concat(Uint8Array.from([P.y % 2n === 0n ? 2 : 3]), bigToBytes(P.x));
  }

  async function masterKey(seed) {
    const I = await hmacSha512(enc.encode("Bitcoin seed"), seed);
    return { k: bytesToBig(I.slice(0, 32)), c: I.slice(32), path: "m", depth: 0 };
  }

  async function childKey(parent, index) {
    const hardened = index >= HARD;
    const data = hardened
      ? concat(Uint8Array.from([0]), bigToBytes(parent.k), ser32(index))   // 0x00 ‖ k ‖ i
      : concat(compressedPub(parent.k), ser32(index));                    // serP(K) ‖ i
    const I = await hmacSha512(parent.c, data);
    const IL = bytesToBig(I.slice(0, 32));
    const label = hardened ? `${index - HARD}'` : `${index}`;
    return { k: ECClib.mod(IL + parent.k, N), c: I.slice(32), path: `${parent.path}/${label}`, depth: parent.depth + 1, index, hardened };
  }

  function parsePath(path) {
    const parts = path.trim().split("/");
    if (parts[0] !== "m") throw new Error("path must start with m");
    return parts.slice(1).map(p => {
      const h = /['hH]$/.test(p), n = parseInt(p, 10);
      if (!Number.isInteger(n) || n < 0 || n >= HARD) throw new Error(`bad path element ${p}`);
      return h ? n + HARD : n;
    });
  }

  async function derivePath(seed, path) {
    let key = await masterKey(seed);
    const chain = [key];
    for (const i of parsePath(path)) { key = await childKey(key, i); chain.push(key); }
    return chain;
  }

  // ---------------- secp256k1 → address → EIP-55 ----------------
  function addressFromPrivate(k) {
    const P = ECClib.secp.mul(k);
    const pub = concat(bigToBytes(P.x), bigToBytes(P.y));        // 64 bytes, without the 0x04 prefix
    const hash = keccak256(pub);
    const address = toHex(hash.slice(12));                       // last 20 bytes
    return { P, pub, hash, address, checksummed: toChecksum(address) };
  }

  function toChecksum(addr) {
    const a = addr.replace(/^0x/i, "").toLowerCase();
    const h = toHex(keccak256(a));                               // hash of the ASCII hex string
    return "0x" + [...a].map((ch, i) => /[a-f]/.test(ch) && parseInt(h[i], 16) >= 8 ? ch.toUpperCase() : ch).join("");
  }

  // true / false for mixed-case input, null if all-lowercase or all-uppercase (no checksum)
  function checkChecksum(addr) {
    const a = addr.replace(/^0x/i, "");
    if (a === a.toLowerCase() || a === a.toUpperCase()) return null;
    return toChecksum(a) === "0x" + a;
  }

  const Wallet = {
    WORDS, toHex, fromHex, concat, bits, bigToBytes, bytesToBig,
    keccak256, sha256, hmacSha512, pbkdf2Sha512,
    entropyToMnemonic, randomMnemonic, validateMnemonic, mnemonicToSeed,
    masterKey, childKey, parsePath, derivePath, compressedPub, HARD,
    addressFromPrivate, toChecksum, checkChecksum, getRandom
  };
  global.Wallet = Wallet;
  if (typeof module !== "undefined") module.exports = Wallet;
})(typeof window !== "undefined" ? window : globalThis);
