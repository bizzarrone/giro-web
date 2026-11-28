    // Applica subito tema e dimensione testo salvati, per evitare il flash al primo paint
    try {
      var t = localStorage.getItem("gc_theme");
      if (t) document.documentElement.dataset.theme = t;
      var s = parseFloat(localStorage.getItem("gc_text_scale") || "1");
      if (s) document.documentElement.style.setProperty("--text-scale", Math.min(1.5, Math.max(0.5, s)));
    } catch (e) {}
  

// Pulsanti "torna alla ricerca" (prima erano onclick="" inline, che una CSP senza 'unsafe-inline' bloccherebbe).
addEventListener("click", function (e) { if (e.target.closest && e.target.closest("[data-home]")) location.hash = ""; });
