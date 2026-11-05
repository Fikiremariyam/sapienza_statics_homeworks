// =====================================================
// ecc.js — small elliptic-curve library (educational, NOT secure)
// Curves of the form  y² = x³ + a·x + b  (mod p), p prime.
// Points are {x: BigInt, y: BigInt}; the point at infinity is null.
// Shared by Homeworks 1, 2 and 3.
// =====================================================
(function (global) {
  const mod = (a, p) => { const r = a % p; return r < 0n ? r + p : r; };

  // modular inverse with the extended Euclidean algorithm
  function inv(a, p) {
    let r0 = mod(a, p), r1 = p, s0 = 1n, s1 = 0n;
    if (r0 === 0n) throw new Error("no inverse of 0");
    while (r1 !== 0n) {
      const q = r0 / r1;
      [r0, r1] = [r1, r0 - q * r1];
      [s0, s1] = [s1, s0 - q * s1];
    }
    return mod(s0, p);
  }

  const eq = (P, Q) => (P === null && Q === null) || (P !== null && Q !== null && P.x === Q.x && P.y === Q.y);
  const str = P => P === null ? "O" : `(${P.x}, ${P.y})`;

  class Curve {
    constructor(p, a, b, name) { this.p = BigInt(p); this.a = BigInt(a); this.b = BigInt(b); this.name = name || `y² = x³ + ${b} (mod ${p})`; }

    isOnCurve(P) {
      if (P === null) return true;
      const { p, a, b } = this;
      return mod(P.y * P.y - (P.x * P.x * P.x + a * P.x + b), p) === 0n;
    }

    neg(P) { return P === null ? null : { x: P.x, y: mod(-P.y, this.p) }; }

    // Returns { R, kind, lambda } so the steps can be shown / animated.
    addInfo(P, Q) {
      const { p, a } = this;
      if (P === null) return { R: Q, kind: "identity" };
      if (Q === null) return { R: P, kind: "identity" };
      if (P.x === Q.x && mod(P.y + Q.y, p) === 0n) return { R: null, kind: "inverse" };
      let lambda, kind, num, den;
      if (P.x === Q.x && P.y === Q.y) {
        num = mod(3n * P.x * P.x + a, p); den = mod(2n * P.y, p); kind = "double";
      } else {
        num = mod(Q.y - P.y, p); den = mod(Q.x - P.x, p); kind = "add";
      }
      lambda = mod(num * inv(den, p), p);
      const x3 = mod(lambda * lambda - P.x - Q.x, p);
      const y3 = mod(lambda * (P.x - x3) - P.y, p);
      return { R: { x: x3, y: y3 }, kind, lambda, num, den };
    }

    add(P, Q) { return this.addInfo(P, Q).R; }

    // Fast scalar multiplication (left-to-right double-and-add)
    mul(k, P) {
      k = BigInt(k);
      if (k < 0n) return this.mul(-k, this.neg(P));
      let R = null;
      for (const bit of k.toString(2)) {
        R = this.add(R, R);
        if (bit === "1") R = this.add(R, P);
      }
      return R;
    }

    // Scalar multiplication that records every step.
    // method: "repeated"  → G, 2G, 3G, …, kG
    //         "double-add" → binary method
    mulTrace(k, P, method = "repeated") {
      k = BigInt(k);
      const steps = [];
      if (k <= 0n) return { Q: null, steps };
      if (method === "repeated") {
        let R = P;
        steps.push({ i: 1n, label: "1G = G", R, kind: "start" });
        for (let i = 2n; i <= k; i++) {
          const prev = R, info = this.addInfo(R, P);
          R = info.R;
          steps.push({ i, label: `${i}G = ${i - 1n}G + G`, P1: prev, P2: P, R, ...info });
        }
        return { Q: R, steps };
      }
      let R = null, acc = 0n;
      const bits = k.toString(2);
      bits.split("").forEach((bit, idx) => {
        if (R !== null) {
          const prev = R, info = this.addInfo(R, R);
          acc *= 2n; R = info.R;
          steps.push({ i: acc, label: `${acc}G = 2 · ${acc / 2n}G`, bitIndex: idx, bits, P1: prev, P2: prev, R, ...info });
        }
        if (bit === "1") {
          if (R === null) { acc = 1n; R = P; steps.push({ i: 1n, label: "1G = G", bitIndex: idx, bits, R, kind: "start" }); }
          else {
            const prev = R, info = this.addInfo(R, P);
            acc += 1n; R = info.R;
            steps.push({ i: acc, label: `${acc}G = ${acc - 1n}G + G`, bitIndex: idx, bits, P1: prev, P2: P, R, ...info });
          }
        }
      });
      return { Q: R, steps };
    }

    // All affine points (only for small p)
    points() {
      const { p, a, b } = this, P = Number(p);
      if (P > 20000) throw new Error("p too large to enumerate");
      const roots = new Map();
      for (let y = 0n; y < p; y++) {
        const s = mod(y * y, p);
        if (!roots.has(s)) roots.set(s, []);
        roots.get(s).push(y);
      }
      const pts = [];
      for (let x = 0n; x < p; x++) {
        const rhs = mod(x * x * x + a * x + b, p);
        (roots.get(rhs) || []).forEach(y => pts.push({ x, y }));
      }
      return pts;
    }

    // order of a point: smallest n > 0 with nP = O (small curves only)
    order(P, limit = 100000) {
      let R = P, n = 1;
      while (R !== null) { R = this.add(R, P); n++; if (n > limit) return null; }
      return n;
    }
  }

  // ---------------- secp256k1 (Jacobian coordinates for speed) ----------------
  const SECP = {
    p: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn,
    n: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n,
    G: {
      x: 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n,
      y: 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n
    }
  };
  SECP.curve = new Curve(SECP.p, 0n, 7n, "secp256k1");

  const P_ = SECP.p, m = a => mod(a, P_);
  const INF = { X: 0n, Y: 1n, Z: 0n };

  function jDouble(A) {
    if (A.Z === 0n || A.Y === 0n) return INF;
    const XX = m(A.X * A.X), YY = m(A.Y * A.Y), YYYY = m(YY * YY);
    const S = m(2n * (m((A.X + YY) * (A.X + YY)) - XX - YYYY));
    const M = m(3n * XX);
    const X3 = m(M * M - 2n * S);
    const Y3 = m(M * (S - X3) - 8n * YYYY);
    const Z3 = m(2n * A.Y * A.Z);
    return { X: X3, Y: Y3, Z: Z3 };
  }

  // Jacobian A + affine Q
  function jAddAffine(A, Q) {
    if (Q === null) return A;
    if (A.Z === 0n) return { X: Q.x, Y: Q.y, Z: 1n };
    const Z1Z1 = m(A.Z * A.Z);
    const U2 = m(Q.x * Z1Z1), S2 = m(Q.y * A.Z * Z1Z1);
    const H = m(U2 - A.X), r = m(S2 - A.Y);
    if (H === 0n) return r === 0n ? jDouble(A) : INF;
    const HH = m(H * H), HHH = m(H * HH), V = m(A.X * HH);
    const X3 = m(r * r - HHH - 2n * V);
    const Y3 = m(r * (V - X3) - A.Y * HHH);
    const Z3 = m(A.Z * H);
    return { X: X3, Y: Y3, Z: Z3 };
  }

  function toAffine(A) {
    if (A.Z === 0n) return null;
    const zi = inv(A.Z, P_), zi2 = m(zi * zi);
    return { x: m(A.X * zi2), y: m(A.Y * zi2 * zi) };
  }

  // k · P on secp256k1 (P affine, default G)
  function secpMul(k, P = SECP.G) {
    k = mod(BigInt(k), SECP.n);
    if (k === 0n) return null;
    let R = INF;
    for (const bit of k.toString(2)) {
      R = jDouble(R);
      if (bit === "1") R = jAddAffine(R, P);
    }
    return toAffine(R);
  }

  // ---------------- helpers ----------------
  function randomScalar(bits = 256, max = SECP.n - 1n) {
    const bytes = new Uint8Array(Math.ceil(bits / 8));
    (global.crypto || require("crypto").webcrypto).getRandomValues(bytes);
    let k = 0n;
    bytes.forEach(b => k = (k << 8n) | BigInt(b));
    return mod(k, max) + 1n; // 1 … max
  }

  function popcount(v) { let c = 0; for (const ch of v.toString(2)) if (ch === "1") c++; return c; }
  const hamming = (a, b) => popcount(a ^ b);
  const hex = (v, len = 64) => v.toString(16).padStart(len, "0");
  const short = (v, n = 10) => { const h = hex(v); return h.slice(0, n) + "…" + h.slice(-n); };

  const ECC = {
    mod, inv, eq, str, Curve, SECP,
    secp: { mul: secpMul, jDouble, jAddAffine, toAffine, INF },
    randomScalar, popcount, hamming, hex, short
  };
  global.ECC = ECC;
  if (typeof module !== "undefined") module.exports = ECC;
})(typeof window !== "undefined" ? window : globalThis);
