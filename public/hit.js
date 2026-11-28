    // Contatore anonimo di visite e banda (vedi /api/hit): una volta per caricamento, a pagina assestata.
    addEventListener("load", function () {
      setTimeout(function () {
        try {
          var bytes = 0;
          performance.getEntriesByType("navigation").concat(performance.getEntriesByType("resource")).forEach(function (e) { bytes += e.transferSize || 0; });
          var fresh = 0;
          try { if (!sessionStorage.getItem("gc_sess")) { sessionStorage.setItem("gc_sess", "1"); fresh = 1; } } catch (e) {}
          fetch("/api/hit", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ s: fresh, b: bytes, p: "app" }) }).catch(function () {});
        } catch (e) {}
      }, 3000);
    });
  
