// English language data for the Caesar cryptanalysis.
// Letter frequencies (%) — standard published English letter-frequency table.
window.ENGLISH = {
  letters: {
    A: 8.167, B: 1.492, C: 2.782, D: 4.253, E: 12.702, F: 2.228, G: 2.015, H: 6.094, I: 6.966,
    J: 0.153, K: 0.772, L: 4.025, M: 2.406, N: 6.749, O: 7.507, P: 1.929, Q: 0.095, R: 5.987,
    S: 6.327, T: 9.056, U: 2.758, V: 0.978, W: 2.360, X: 0.150, Y: 1.974, Z: 0.074
  },

  // Most common English bigrams (% of all letter pairs); unseen pairs get a small floor.
  bigrams: {
    TH: 3.56, HE: 3.07, IN: 2.43, ER: 2.05, AN: 1.99, RE: 1.85, ON: 1.76, AT: 1.49, EN: 1.45, ND: 1.35,
    TI: 1.34, ES: 1.34, OR: 1.28, TE: 1.20, OF: 1.17, ED: 1.17, IS: 1.13, IT: 1.12, AL: 1.09, AR: 1.07,
    ST: 1.05, TO: 1.04, NT: 1.04, NG: 0.95, SE: 0.93, HA: 0.93, AS: 0.87, OU: 0.87, IO: 0.83, LE: 0.83,
    VE: 0.83, CO: 0.79, ME: 0.79, DE: 0.76, HI: 0.76, RI: 0.73, RO: 0.73, IC: 0.70, NE: 0.69, EA: 0.69,
    RA: 0.69, CE: 0.65, LI: 0.62, CH: 0.60, LL: 0.58, BE: 0.58, MA: 0.57, SI: 0.55, OM: 0.55, UR: 0.54,
    CA: 0.54, EL: 0.53, TA: 0.53, LA: 0.53, NS: 0.51, DI: 0.50, FO: 0.50, HO: 0.50, PE: 0.49, EC: 0.49,
    PR: 0.49, NO: 0.49, CT: 0.49, US: 0.48, AC: 0.48, OT: 0.47, IL: 0.46, TR: 0.46, LY: 0.46, NC: 0.45,
    ET: 0.44, UT: 0.44, SS: 0.43, SO: 0.43, RS: 0.43, UN: 0.42, LO: 0.42, WA: 0.41, GE: 0.41, IE: 0.40,
    WH: 0.40, EE: 0.39, WI: 0.39, EM: 0.38, AD: 0.37, OL: 0.37, RT: 0.37, PO: 0.37, WE: 0.36, NA: 0.35,
    UL: 0.35, NI: 0.34, TS: 0.34, MO: 0.34, OW: 0.33, PA: 0.32, IM: 0.32, MI: 0.32, AI: 0.32, SH: 0.31
  },

  // Original sample text used to draw random test excerpts of different lengths.
  sample: `
For as long as people have written letters, other people have tried to read them. Generals sent
orders across hostile ground, merchants protected the prices they had agreed, and lovers hid their
words from curious families. The simplest way to keep a message private was to change every letter
by the same rule, and the shift that bears the name of Julius Caesar is the most famous example of
such a rule. Each letter moves a fixed number of places along the alphabet, so the word attack might
become dwwdfn, and only someone who knows the size of the shift can move the letters back.
The weakness of this idea was understood more than a thousand years ago. Scholars working in Baghdad
noticed that in any long text some letters appear far more often than others. In English the letter e
is the most common, followed by t, a, o, i and n, while letters such as q, x and z are rare. A shift does
not change how often a symbol appears; it only changes its name. If the most common symbol in a secret
message is h, a careful reader can guess that h stands for e, compute the shift, and recover the whole
text in a few minutes. The longer the message, the more clearly the familiar pattern of the language
shows through the disguise.
Modern cryptography takes a different path. Instead of hiding letters behind a secret rule that both
sides share, public key systems give every user two keys. One key is published so that anyone can lock
a message, and the other is kept private so that only its owner can open it. The private key is a very
large random number, and the public key is computed from it through an operation that is easy to perform
but extremely hard to reverse. On an elliptic curve this operation is the repeated addition of a fixed
point, and reversing it means solving the discrete logarithm problem. No useful statistics leak through
such a scheme, because every encryption uses fresh randomness and the result looks like noise.
Even strong mathematics can be undone by careless choices. If the private number is drawn from a small
range, an attacker does not need any clever theory at all; a computer can simply try every candidate
until one of them matches the public key. Security therefore depends on two things at once: a hard
problem underneath, and keys that are large and truly random. Students who build small toy versions of
these systems quickly learn both lessons, and they also learn that the gap between a toy and a real
system is measured not in ideas but in the number of bits.
The same reasoning applies outside the laboratory. Banks, hospitals and governments store information
that would be valuable to a thief, and every one of them depends on the quiet work of these algorithms.
When a phone connects to a website, it agrees on a fresh secret with the server in a fraction of a second,
and that secret protects passwords, messages and payments. Most people never notice this exchange, which
is exactly how good security should feel. It is only when a weak key, an old library or a reused number
appears that the hidden machinery becomes visible, usually in the news and usually too late.
`.replace(/\s+/g, " ").trim()
};
