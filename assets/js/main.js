// Theme toggle (remembers choice) + footer year + active nav link
(function () {
  const root = document.documentElement;
  try {
    const saved = localStorage.getItem("theme");
    if (saved) root.setAttribute("data-theme", saved);
  } catch (e) {}

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.querySelector(".theme-toggle");
    if (btn) {
      btn.addEventListener("click", () => {
        const current = root.getAttribute("data-theme") ||
          (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
        const next = current === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", next);
        try { localStorage.setItem("theme", next); } catch (e) {}
        document.dispatchEvent(new CustomEvent("themechange"));
      });
    }

    document.querySelectorAll("[data-year]").forEach(el => el.textContent = new Date().getFullYear());

    const links = [...document.querySelectorAll(".side-nav a[href^='#']")];
    const sections = links.map(a => document.querySelector(a.getAttribute("href"))).filter(Boolean);
    if (sections.length) {
      const obs = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            links.forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id));
          }
        });
      }, { rootMargin: "-40% 0px -55% 0px" });
      sections.forEach(s => obs.observe(s));
    }
  });
})();
