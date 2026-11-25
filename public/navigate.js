/* Navigazione GPX sul sito (come «Naviga» nell'app): segue la posizione GPS sul percorso aperto, avvisa a voce le svolte
 * («Svolta a destra»), dice quando si esce dal tracciato e quando si rientra, tiene lo schermo acceso e ha una prova simulata.
 * Le svolte si ricavano solo dalla geometria della traccia (dove la direzione cambia di almeno 70° tra i 40 m prima e dopo),
 * come in GiroLegacy: non conosce la rete stradale. Uso: GcNav.start({ map, pts:[{lat,lon}], name, onStop, toast }). */
(function () {
  var EN = window.GC_LANG === "en";
  var STEP = 5, W = 8, GAP = 6, MIN_TURN = 70, MERGE = 80;
  var TXT = EN ? {
    wait: "Waiting for GPS…", far: "Far from the route", off: "Off route", back: "Back on route", arrive: "You have arrived!",
    keep: "Keep going on the route", left: "left", right: "right", uturn: "U-turn", sharp: "Sharp turn to the", turn: "Turn", slight: "Slight turn to the",
    remaining: "Remaining", stop: "Stop navigation", follow: "Centre on me", voiceOn: "Voice on", voiceOff: "Voice off", sim: "Test along the route",
    denied: "Location permission denied: you only see the route (use ▶ to test).", nogeo: "This browser has no location service.", turns: "turns"
  } : {
    wait: "In attesa del GPS…", far: "Lontano dal percorso", off: "Fuori percorso", back: "Di nuovo sul percorso", arrive: "Arrivo!",
    keep: "Prosegui sul percorso", left: "sinistra", right: "destra", uturn: "Inversione a U", sharp: "Curva stretta a", turn: "Svolta a", slight: "Gira leggermente a",
    remaining: "Mancano", stop: "Chiudi la navigazione", follow: "Centra su di me", voiceOn: "Voce attiva", voiceOff: "Voce spenta", sim: "Prova lungo il percorso",
    denied: "Permesso di posizione negato: vedi solo il percorso (usa ▶ per una prova).", nogeo: "Questo browser non ha il servizio di posizione.", turns: "svolte"
  };
  function fmt(m) {
    if (m >= 1000) return (m / 1000).toFixed(1).replace(".", ",") + " km";
    if (m >= 100) return Math.round(m / 10) * 10 + " m";
    return Math.round(m / 5) * 5 + " m";
  }
  function turnText(angle) {
    var a = Math.abs(angle), side = angle > 0 ? TXT.right : TXT.left;
    if (a >= 165) return TXT.uturn;
    if (a >= 125) return TXT.sharp + " " + side;
    if (a >= 85) return TXT.turn + " " + side;
    return TXT.slight + " " + side;
  }
  function turnArrow(angle) {
    var a = Math.abs(angle);
    if (a >= 165) return "↶";
    if (a >= 85) return angle > 0 ? "↱" : "↰";
    return angle > 0 ? "↗" : "↖";
  }

  /** Percorso ricampionato ogni STEP metri su un piano locale (x = est, y = sud), con le svolte. */
  function Route(pts) {
    var lat0 = pts[0].lat, lon0 = pts[0].lon, mLat = 111132, mLon = 111320 * Math.cos(lat0 * Math.PI / 180);
    this.lat0 = lat0; this.lon0 = lon0; this.mLat = mLat; this.mLon = mLon;
    var rx = [], ry = [], i;
    for (i = 0; i < pts.length; i++) { rx.push((pts[i].lon - lon0) * mLon); ry.push(-(pts[i].lat - lat0) * mLat); }
    var ox = [rx[0]], oy = [ry[0]], carry = 0;
    for (i = 1; i < pts.length; i++) {
      var ax = rx[i - 1], ay = ry[i - 1], seg = Math.hypot(rx[i] - ax, ry[i] - ay);
      if (seg === 0) continue;
      var ux = (rx[i] - ax) / seg, uy = (ry[i] - ay) / seg, need = STEP - carry;
      while (seg >= need) { ax += ux * need; ay += uy * need; seg -= need; ox.push(ax); oy.push(ay); need = STEP; carry = 0; }
      carry += seg;
    }
    var lx = rx[rx.length - 1], ly = ry[ry.length - 1];
    if (Math.hypot(lx - ox[ox.length - 1], ly - oy[oy.length - 1]) > 1) { ox.push(lx); oy.push(ly); }
    this.x = ox; this.y = oy; this.n = ox.length; this.cum = [0];
    for (i = 1; i < this.n; i++) this.cum.push(this.cum[i - 1] + Math.hypot(ox[i] - ox[i - 1], oy[i] - oy[i - 1]));
    this.length = this.cum[this.n - 1];
    this.turns = this.findTurns();
  }
  Route.prototype.xOf = function (lon) { return (lon - this.lon0) * this.mLon; };
  Route.prototype.yOf = function (lat) { return -(lat - this.lat0) * this.mLat; };
  Route.prototype.latOf = function (i) { return this.lat0 - this.y[i] / this.mLat; };
  Route.prototype.lonOf = function (i) { return this.lon0 + this.x[i] / this.mLon; };
  Route.prototype.bearing = function (i, j) {
    var b = Math.atan2(this.x[j] - this.x[i], -(this.y[j] - this.y[i])) * 180 / Math.PI;
    return b < 0 ? b + 360 : b;
  };
  Route.prototype.findTurns = function () {
    var out = [], self = this, best = -1, bestD = 0, lastCand = -100;
    function flush() {
      if (best >= 0) {
        var t = { idx: best, dist: self.cum[best], angle: bestD };
        var last = out[out.length - 1];
        if (last && t.dist - last.dist < MERGE) { if (Math.abs(t.angle) > Math.abs(last.angle)) out[out.length - 1] = t; } else out.push(t);
      }
      best = -1; bestD = 0;
    }
    for (var i = W; i < this.n - W; i++) {
      var d = this.bearing(i, i + W) - this.bearing(i - W, i);
      if (d > 180) d -= 360; if (d < -180) d += 360;
      if (Math.abs(d) >= MIN_TURN) {
        if (i - lastCand > GAP) flush();
        if (Math.abs(d) > Math.abs(bestD)) { best = i; bestD = d; }
        lastCand = i;
      }
    }
    flush();
    return out;
  };

  var cur = null;

  function stop() {
    if (!cur) return;
    var c = cur; cur = null;
    try { if (c.watch != null) navigator.geolocation.clearWatch(c.watch); } catch (e) { }
    if (c.simTimer) clearInterval(c.simTimer);
    try { if (c.wake) c.wake.release(); } catch (e) { }
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { }
    try { c.layer.remove(); } catch (e) { }
    try { c.ui.remove(); } catch (e) { }
    try { c.map.off("dragstart", c.onDrag); } catch (e) { }
    if (c.onStop) c.onStop();
  }

  function start(o) {
    stop();
    var pts = o.pts || [];
    if (pts.length < 2) return null;
    var map = o.map, route = new Route(pts), host = map.getContainer().parentElement;
    var c = cur = {
      map: map, route: route, onStop: o.onStop, progress: 0, hasFix: false, offRoute: 0, follow: true, voice: true, sim: false, simDist: 0,
      nearSaid: {}, off: false, wake: null, watch: null, simTimer: null, lastDone: 0
    };
    // livello: percorso fatto (grigio) e posizione
    c.layer = L.layerGroup().addTo(map);
    c.done = L.polyline([], { color: "#9e9e9e", weight: 7, opacity: 0.95 }).addTo(c.layer);
    c.me = L.circleMarker([0, 0], { radius: 9, color: "#fff", weight: 3, fillColor: "#1e88e5", fillOpacity: 1 });
    // interfaccia: banner in alto e comandi
    var ui = c.ui = document.createElement("div");
    ui.className = "nav-ui";
    ui.innerHTML =
      '<div class="nav-banner" id="navBanner"></div>' +
      '<div class="nav-keys">' +
      '<button type="button" id="navStop" title="' + TXT.stop + '">✕</button>' +
      '<button type="button" id="navFollow" class="on" title="' + TXT.follow + '">◎</button>' +
      '<button type="button" id="navVoice" class="on" title="' + TXT.voiceOn + '">🔊</button>' +
      '<button type="button" id="navSim" title="' + TXT.sim + '">▶</button>' +
      '</div>';
    host.appendChild(ui);
    var banner = ui.querySelector("#navBanner");
    ["mousedown", "touchstart", "click", "dblclick", "wheel"].forEach(function (ev) { ui.addEventListener(ev, function (e) { e.stopPropagation(); }); });

    // voce
    var pickVoice = function () {
      var vs = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
      var pre = EN ? "en" : "it";
      return vs.filter(function (v) { return (v.lang || "").toLowerCase().indexOf(pre) === 0; })[0] || null;
    };
    var say = function (t) {
      if (!c.voice || !window.speechSynthesis) return;
      try {
        window.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(t); u.lang = EN ? "en-US" : "it-IT";
        var v = pickVoice(); if (v) u.voice = v;
        window.speechSynthesis.speak(u);
      } catch (e) { }
    };

    var nextTurn = function () {
      if (!c.hasFix) return null;
      for (var i = 0; i < route.turns.length; i++) if (route.turns[i].idx > c.progress + 1) return route.turns[i];
      return null;
    };
    var render = function () {
      var remaining = c.hasFix ? route.length - route.cum[c.progress] : route.length, nt = nextTurn();
      var cls = "nav-banner", html;
      if (!c.hasFix) html = "<b>" + TXT.wait + "</b><span>" + fmt(route.length) + " · " + route.turns.length + " " + TXT.turns + "</span>";
      else if (c.offRoute > 1500) { html = "<b>" + TXT.far + "</b><span>" + fmt(c.offRoute) + " · " + fmt(route.length) + "</span>"; }
      else if (c.offRoute > 40) { cls += " off"; html = "<b>" + TXT.off + "</b><span>" + fmt(c.offRoute) + "</span>"; }
      else if (remaining < 30) html = "<b>" + TXT.arrive + "</b>";
      else if (!nt) html = "<b>" + TXT.keep + "</b><span>" + TXT.remaining + " " + fmt(remaining) + "</span>";
      else html = '<i class="nav-arrow">' + turnArrow(nt.angle) + "</i><div><b>" + fmt(nt.dist - route.cum[c.progress]) + "</b><span>" + turnText(nt.angle) + " · " + TXT.remaining + " " + fmt(remaining) + "</span></div>";
      banner.className = cls; banner.innerHTML = html;
    };

    var fix = function (lat, lon) {
      var nx = route.xOf(lon), ny = route.yOf(lat), first = !c.hasFix, best = -1, bd = Infinity, i;
      var scan = function (lo, hi) { for (var k = lo; k <= hi; k++) { var dx = route.x[k] - nx, dy = route.y[k] - ny, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = k; } } };
      if (!first) scan(Math.max(0, c.progress - 20), Math.min(route.n - 1, c.progress + 150));
      if (best < 0 || Math.sqrt(bd) > 60) { bd = Infinity; scan(0, route.n - 1); }
      c.progress = best; c.offRoute = Math.sqrt(bd); c.hasFix = true;
      if (!c.me._map) c.me.addTo(c.layer);
      c.me.setLatLng([lat, lon]);
      var d = []; for (i = 0; i <= best; i += 2) d.push([route.latOf(i), route.lonOf(i)]);
      c.done.setLatLngs(d);
      if (c.follow && c.offRoute < 1500) map.setView([lat, lon], Math.max(map.getZoom(), 16), { animate: true });
      // voce: solo quando sei davanti alla svolta (entro 40 m), poi fuori/di nuovo sul percorso
      var doneM = route.cum[best];
      if (doneM < c.lastDone - 200) { c.nearSaid = {}; c.off = false; }
      c.lastDone = doneM;
      if (!c.off && c.offRoute > 50 && c.offRoute < 1500) { c.off = true; say(TXT.off); }
      else if (c.off) { if (c.offRoute < 30) { c.off = false; say(TXT.back); } }
      else {
        var t = nextTurn();
        if (t && t.dist - doneM <= 40 && !c.nearSaid[t.idx]) { c.nearSaid[t.idx] = 1; say(turnText(t.angle)); }
        if (route.length - doneM < 30 && !c.nearSaid.end) { c.nearSaid.end = 1; say(TXT.arrive); }
      }
      render();
    };

    ui.querySelector("#navStop").onclick = stop;
    var fol = ui.querySelector("#navFollow");
    fol.onclick = function () { c.follow = true; fol.classList.add("on"); if (c.hasFix) map.setView(c.me.getLatLng(), Math.max(map.getZoom(), 16)); };
    c.onDrag = function () { c.follow = false; fol.classList.remove("on"); };
    map.on("dragstart", c.onDrag);
    var vo = ui.querySelector("#navVoice");
    vo.onclick = function () {
      c.voice = !c.voice; vo.classList.toggle("on", c.voice); vo.textContent = c.voice ? "🔊" : "🔇"; vo.title = c.voice ? TXT.voiceOn : TXT.voiceOff;
      if (c.voice) say(TXT.voiceOn); else try { window.speechSynthesis.cancel(); } catch (e) { }
    };
    var sim = ui.querySelector("#navSim");
    sim.onclick = function () {
      c.sim = !c.sim; sim.classList.toggle("on", c.sim); sim.textContent = c.sim ? "■" : "▶";
      if (c.simTimer) { clearInterval(c.simTimer); c.simTimer = null; }
      if (c.sim) {
        c.simDist = 0; c.follow = true; fol.classList.add("on");
        c.simTimer = setInterval(function () {
          c.simDist += 12; if (c.simDist >= route.length - 5) c.simDist = 0;
          var i = Math.min(route.n - 2, Math.max(0, Math.floor(c.simDist / STEP)));
          fix(route.latOf(i), route.lonOf(i));
        }, 300);
      }
    };

    // posizione reale
    if (!navigator.geolocation) { if (o.toast) o.toast(TXT.nogeo); }
    else {
      c.watch = navigator.geolocation.watchPosition(function (p) {
        if (c.sim || p.coords.accuracy > 80) return;
        fix(p.coords.latitude, p.coords.longitude);
      }, function (err) { if (err && err.code === 1 && o.toast) o.toast(TXT.denied); }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
    }
    // schermo acceso
    try { if (navigator.wakeLock) navigator.wakeLock.request("screen").then(function (w) { c.wake = w; }).catch(function () { }); } catch (e) { }
    // il browser sblocca le voci solo dopo un gesto: una frase muta all'avvio le "prepara"
    try { if (window.speechSynthesis) { var u0 = new SpeechSynthesisUtterance(" "); u0.volume = 0; window.speechSynthesis.speak(u0); } } catch (e) { }
    map.fitBounds(L.latLngBounds(pts.map(function (p) { return [p.lat, p.lon]; })), { padding: [60, 40] });
    render();
    return c;
  }

  window.GcNav = { start: start, stop: stop, active: function () { return !!cur; }, Route: Route };
})();
