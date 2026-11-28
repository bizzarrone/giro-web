(function () {
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmtDate(iso) { try { return new Date(iso + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return iso; } }
  fetch("apk-info.json", { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
    $("mVer").textContent = d.versionName + " (build " + d.versionCode + ")";
    $("mDate").textContent = fmtDate(d.date);
    $("mSize").textContent = (d.sizeBytes / 1048576).toFixed(1).replace(".", ",") + " MB";
    $("mSha").textContent = d.sha256 || "";
    $("meta").hidden = false;
    $("dlHint").textContent = "Versione " + d.versionName + " · " + (d.sizeBytes / 1048576).toFixed(1).replace(".", ",") + " MB";
    $("releases").innerHTML = (d.releases || []).map(function (r, i) {
      return '<div class="rel"><h3>Versione ' + esc(r.version) + (i === 0 ? '<span class="tag">in download</span>' : "") + '<small>' + esc(fmtDate(r.date)) + '</small></h3><ul>' +
        r.items.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>";
    }).join("") || '<p class="note">Nessuna nota di versione.</p>';
  }).catch(function () {
    $("dlHint").textContent = "Versione non disponibile";
    $("releases").innerHTML = '<p class="note">Non riesco a caricare le novità. Riprova tra poco.</p>';
  });
})();
