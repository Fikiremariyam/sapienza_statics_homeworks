# Statistics Notebook

Coursework for the Statistics course — MSc Cybersecurity, Sapienza University of Rome.
Author: Fikiremariyam Babu Yalew

Static site (HTML, CSS, vanilla JavaScript), ready for GitHub Pages.

## Structure

```
index.html                 home page with the list of homeworks
assets/css/theme.css       shared theme (light + dark), layout, components
assets/js/main.js          dark-mode toggle, footer year, active nav link
assets/js/charts.js        tiny canvas charts: histogram, lines, bars, scatter
assets/js/ecc.js           elliptic-curve library (toy curves + secp256k1) used by Homeworks 1–3
homeworks/hw1-ecc            Homework 1 — private key → public key (toy ECC)
homeworks/hw2-wallet         Homework 2 — wallet seed → Ethereum address (BIP-39/32/44, Keccak, EIP-55)
homeworks/hw3-cryptanalysis  Homework 3 — EC-ElGamal, Caesar, cryptanalysis, key-space attack
homeworks/hw4-stochastic     Homework 4 — stochastic penetration processes (LLN, CLT)
homeworks/hw5-welford        Homework 5 — Welford & sampling statistics
```

## Publish on GitHub Pages

1. Create a new public repository (e.g. `statistics-homeworks`).
2. Upload the contents of this folder to the root of the repository.
3. Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)` → Save.
4. Your site will appear at `https://<your-username>.github.io/statistics-homeworks/`.

## Editing

- Your matricola goes in `index.html` (sidebar, currently `0000000`).
- Colors are CSS variables at the top of `assets/css/theme.css` — change `--accent` to recolor the whole site.
- On each homework page, replace the dashed **TODO** panels with your own text and the demo in `script.js` with your implementation.
