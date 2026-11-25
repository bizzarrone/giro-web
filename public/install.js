// Registra il service worker e mostra un invito a installare l'app.
// Android/desktop Chrome: bottone che apre il prompt nativo. iPhone/iPad Safari: istruzioni "Condividi → Aggiungi a Home".
// Uso: <script src="install.js" defer></script> in index.html.
(function () {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});

  var standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  var KEY = "gc_install_dismissed";
  var dismissed = false;
  try { dismissed = Date.now() - Number(localStorage.getItem(KEY) || 0) < 14 * 864e5; } catch (e) {}
  if (standalone || dismissed) return;

  var ua = navigator.userAgent;
  var ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var iosSafari = ios && !/CriOS|FxiOS|EdgiOS|GSA\//.test(ua);

  function banner(text, actionLabel, onAction) {
    var b = document.createElement("div");
    b.setAttribute("role", "dialog");
    b.style.cssText = "position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:99999;" +
      "background:#1a1200;color:#fff;border:1px solid #f5c400;border-radius:14px;padding:12px 14px;display:flex;gap:10px;" +
      "align-items:center;font:500 15px/1.35 'DM Sans',system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.5)";
    var t = document.createElement("div"); t.style.flex = "1"; t.textContent = text; b.appendChild(t);
    if (actionLabel) {
      var a = document.createElement("button"); a.textContent = actionLabel;
      a.style.cssText = "background:#f5c400;color:#1a1200;border:0;border-radius:10px;padding:8px 12px;font-weight:700";
      a.onclick = function () { onAction(); b.remove(); }; b.appendChild(a);
    }
    var x = document.createElement("button"); x.textContent = "✕"; x.setAttribute("aria-label", "Chiudi");
    x.style.cssText = "background:none;border:0;color:#fff;font-size:18px;padding:4px 6px";
    x.onclick = function () { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {} b.remove(); };
    b.appendChild(x);
    document.body.appendChild(b);
  }

  if (iosSafari) {
    setTimeout(function () {
      banner("Installa Giro: tocca Condividi ⬆︎ e poi «Aggiungi alla schermata Home».");
    }, 4000);
  } else if (ios) {
    setTimeout(function () { banner("Per installare Giro su iPhone apri questa pagina in Safari."); }, 4000);
  } else {
    addEventListener("beforeinstallprompt", function (ev) {
      ev.preventDefault();
      banner("Installa Giro sul telefono: si apre come un'app, anche offline.", "Installa", function () { ev.prompt(); });
    });
  }
})();
