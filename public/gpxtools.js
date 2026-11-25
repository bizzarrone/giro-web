/* Strumenti per il "GPX" della Mappa: statistiche, ritaglia, inverti, semplifica, salva, condividi.
 * Il tracciato completo (quota/tempi) sta in state.myGpx.full = [{lat,lon,ele,t}]; sulla mappa va la versione alleggerita. */
(function () {
  var T = function (s) { return window.tr ? window.tr(s) : s; };
  var EN = window.GC_LANG === "en";
  var L10N = EN ? {
    stats: "Statistics", crop: "Crop", reverse: "Reverse", simplify: "Simplify", save: "Save", share: "Share", close: "Close",
    dist: "Distance", points: "Points", elev: "Elevation", alt: "Altitude", dur: "Duration", speed: "Average speed", apply: "Apply", cancel: "Cancel",
    keep: "Part to keep", tol: "Tolerance", from: "from", to: "to", saved: "File saved", tools: "GPX tools", convert: "Convert to…", savetrail: "Save as trail…", play: "Play", restart: "Restart", photos: "Add photos…", elev2: "Elevation", routephotos: "Route photos…", nophotos: "No photo in the track period", notimes: "This GPX has no times"
  } : {
    stats: "Statistiche", crop: "Ritaglia", reverse: "Inverti", simplify: "Semplifica", save: "Salva", share: "Condividi", close: "Chiudi",
    dist: "Distanza", points: "Punti", elev: "Dislivello", alt: "Quota", dur: "Durata", speed: "Velocità media", apply: "Applica", cancel: "Annulla",
    keep: "Parte da tenere", tol: "Tolleranza", from: "da", to: "a", saved: "File salvato", tools: "Strumenti GPX", convert: "Converti in…", savetrail: "Salva come trail…", play: "Riproduci", restart: "Ricomincia", photos: "Aggiungi foto…", elev2: "Altimetria", routephotos: "Foto del percorso…", nophotos: "Nessuna foto nel periodo del percorso", notimes: "Il GPX non ha i tempi"
  };
  function hav(a, b) {
    var R = 6371000, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
    var h = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  function stats(p) {
    var d = 0, up = 0, dn = 0, mn = null, mx = null, i;
    for (i = 0; i < p.length; i++) {
      if (i) { d += hav(p[i - 1], p[i]); if (p[i].ele != null && p[i - 1].ele != null) { var e = p[i].ele - p[i - 1].ele; if (e > 0) up += e; else dn -= e; } }
      if (p[i].ele != null) { mn = mn == null ? p[i].ele : Math.min(mn, p[i].ele); mx = mx == null ? p[i].ele : Math.max(mx, p[i].ele); }
    }
    var t1 = null, t2 = null;
    p.forEach(function (q) { if (q.t != null) { if (t1 == null) t1 = q.t; t2 = q.t; } });
    var dur = t1 != null && t2 != null ? Math.max(0, Math.round((t2 - t1) / 1000)) : null;
    return { d: d, up: up, dn: dn, mn: mn, mx: mx, dur: dur, avg: dur ? (d / 1000) / (dur / 3600) : null };
  }
  function fd(m) { return m >= 1000 ? (m / 1000).toFixed(2) + " km" : Math.round(m) + " m"; }
  function fdur(s) { var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h + ":" + (m < 10 ? "0" : "") + m + ":" + (x < 10 ? "0" : "") + x; }
  function simplify(p, tol) {
    if (p.length < 3) return p;
    var kx = 111320 * Math.cos(p[0].lat * Math.PI / 180), ky = 110540;
    var keep = new Uint8Array(p.length); keep[0] = keep[p.length - 1] = 1;
    var st = [[0, p.length - 1]];
    while (st.length) {
      var ab = st.pop(), a = ab[0], b = ab[1], dx = (p[b].lon - p[a].lon) * kx, dy = (p[b].lat - p[a].lat) * ky, len = Math.hypot(dx, dy), md = 0, idx = -1;
      for (var k = a + 1; k < b; k++) {
        var ex = (p[k].lon - p[a].lon) * kx, ey = (p[k].lat - p[a].lat) * ky;
        var d = len === 0 ? Math.hypot(ex, ey) : Math.abs(dy * ex - dx * ey) / len;
        if (d > md) { md = d; idx = k; }
      }
      if (idx >= 0 && md > tol) { keep[idx] = 1; st.push([a, idx], [idx, b]); }
    }
    return p.filter(function (_, i) { return keep[i]; });
  }
  function reverse(p) { var times = p.map(function (q) { return q.t; }); return p.slice().reverse().map(function (q, i) { return { lat: q.lat, lon: q.lon, ele: q.ele, t: times[i] }; }); }
  function parseGpx(xml) {
    var d = new DOMParser().parseFromString(xml, "application/xml");
    var els = [].slice.call(d.getElementsByTagName("trkpt"));
    if (!els.length) els = [].slice.call(d.getElementsByTagName("rtept"));
    return els.map(function (e) {
      var ele = e.getElementsByTagName("ele")[0], tm = e.getElementsByTagName("time")[0];
      var t = tm ? Date.parse(tm.textContent.trim()) : NaN;
      return { lat: parseFloat(e.getAttribute("lat")), lon: parseFloat(e.getAttribute("lon")), ele: ele ? parseFloat(ele.textContent) : null, t: isFinite(t) ? t : null };
    }).filter(function (q) { return isFinite(q.lat) && isFinite(q.lon); });
  }

  var FORMATS = [["gpx", "GPX", "application/gpx+xml"], ["kml", "KML", "application/vnd.google-earth.kml+xml"], ["geojson", "GeoJSON", "application/geo+json"], ["tcx", "TCX", "application/vnd.garmin.tcx+xml"], ["csv", "CSV", "text/csv"]];
  function ok(q) { return isFinite(q.lat) && isFinite(q.lon); }
  function ptT(s) { var t = s ? Date.parse(String(s).trim()) : NaN; return isFinite(t) ? t : null; }
  function txt(e, tag) { var x = e.getElementsByTagName(tag)[0]; return x ? x.textContent : null; }
  function num(x) { var v = parseFloat(x); return isFinite(v) ? v : null; }
  function parseKml(xml) {
    var d = new DOMParser().parseFromString(xml, "application/xml"), out = [];
    var tr = [].slice.call(d.getElementsByTagName("gx:Track"));
    tr.forEach(function (g) {
      var w = [].slice.call(g.getElementsByTagName("when")), c = [].slice.call(g.getElementsByTagName("gx:coord"));
      c.forEach(function (e, i) { var v = e.textContent.trim().split(/\s+/).map(parseFloat); out.push({ lat: v[1], lon: v[0], ele: isFinite(v[2]) ? v[2] : null, t: w[i] ? ptT(w[i].textContent) : null }); });
    });
    [].slice.call(d.getElementsByTagName("coordinates")).forEach(function (e) {
      e.textContent.trim().split(/\s+/).forEach(function (s) { var v = s.split(",").map(parseFloat); if (v.length >= 2) out.push({ lat: v[1], lon: v[0], ele: v.length > 2 && isFinite(v[2]) ? v[2] : null, t: null }); });
    });
    return out.filter(ok);
  }
  function parseTcx(xml) {
    var d = new DOMParser().parseFromString(xml, "application/xml");
    return [].slice.call(d.getElementsByTagName("Trackpoint")).map(function (e) {
      return { lat: num(txt(e, "LatitudeDegrees")), lon: num(txt(e, "LongitudeDegrees")), ele: num(txt(e, "AltitudeMeters")), t: ptT(txt(e, "Time")) };
    }).filter(function (q) { return q.lat != null && q.lon != null; });
  }
  function parseGeo(text) {
    var out = [];
    function geom(g, times) {
      if (!g) return;
      if (g.type === "LineString") g.coordinates.forEach(function (c, i) { out.push({ lat: c[1], lon: c[0], ele: c.length > 2 ? c[2] : null, t: times ? ptT(times[i]) : null }); });
      else if (g.type === "MultiLineString") g.coordinates.forEach(function (l) { geom({ type: "LineString", coordinates: l }); });
      else if (g.type === "GeometryCollection") g.geometries.forEach(function (x) { geom(x); });
    }
    (function node(o) {
      if (o.type === "FeatureCollection") o.features.forEach(node);
      else if (o.type === "Feature") geom(o.geometry, o.properties && o.properties.coordinateProperties && o.properties.coordinateProperties.times);
      else geom(o);
    })(JSON.parse(text));
    return out.filter(ok);
  }
  function parseCsv(text) {
    var rows = text.split(/\r?\n/).map(function (r) { return r.trim(); }).filter(Boolean);
    if (rows.length < 3) return [];
    var sep = rows[0].split(";").length > rows[0].split(",").length ? ";" : ",";
    var head = rows[0].split(sep).map(function (h) { return h.trim().replace(/"/g, "").toLowerCase(); });
    var ix = function (n) { for (var i = 0; i < head.length; i++) if (n.indexOf(head[i]) >= 0) return i; return -1; };
    var la = ix(["lat", "latitude", "latitudine"]), lo = ix(["lon", "lng", "long", "longitude", "longitudine"]), el = ix(["ele", "elevation", "alt", "altitude", "quota"]), tm = ix(["time", "timestamp", "date", "data"]), first = 1;
    if (la < 0 || lo < 0) { la = 0; lo = 1; first = isFinite(parseFloat(rows[0])) ? 0 : 1; }
    return rows.slice(first).map(function (r) {
      var c = r.split(sep).map(function (x) { return x.trim().replace(/"/g, "").replace(",", "."); });
      return { lat: num(c[la]), lon: num(c[lo]), ele: el >= 0 ? num(c[el]) : null, t: tm >= 0 ? ptT(c[tm]) : null };
    }).filter(function (q) { return q.lat != null && q.lon != null; });
  }
  /** Legge GPX, KML, GeoJSON, TCX o CSV (riconosciuti dal contenuto). */
  function parse(text) {
    var h = text.replace(/^﻿/, "").trimStart(), head = h.slice(0, 2000);
    if (h[0] === "{") return parseGeo(h);
    if (h[0] === "<") {
      if (head.indexOf("<kml") >= 0) return parseKml(h);
      if (head.indexOf("TrainingCenterDatabase") >= 0) return parseTcx(h);
      return parseGpx(h);
    }
    return parseCsv(h);
  }
  function xe(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function iso(t) { return new Date(t).toISOString(); }
  function r7(v) { return +v.toFixed(7); }
  function convert(name, p, fmt) {
    if (fmt === "gpx") return toGpx(name, p);
    if (fmt === "kml") return '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>' + xe(name) + "</name><Placemark><name>" + xe(name) +
      "</name><LineString><tessellate>1</tessellate><coordinates>" + p.map(function (q) { return r7(q.lon) + "," + r7(q.lat) + (q.ele != null ? "," + q.ele.toFixed(1) : ""); }).join(" ") + "</coordinates></LineString></Placemark></Document></kml>";
    if (fmt === "geojson") {
      var props = { name: name };
      if (p.length && p.every(function (q) { return q.t != null; })) props.coordinateProperties = { times: p.map(function (q) { return iso(q.t); }) };
      return JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: props, geometry: { type: "LineString", coordinates: p.map(function (q) { return q.ele != null ? [r7(q.lon), r7(q.lat), +q.ele.toFixed(1)] : [r7(q.lon), r7(q.lat)]; }) } }] }, null, 1);
    }
    if (fmt === "csv") return "lat,lon,ele,time\n" + p.map(function (q) { return r7(q.lat) + "," + r7(q.lon) + "," + (q.ele != null ? q.ele.toFixed(1) : "") + "," + (q.t != null ? iso(q.t) : ""); }).join("\n") + "\n";
    if (fmt === "tcx") {
      // TCX vuole un orario per ogni punto: se manca lo stimo a 15 km/h.
      var has = p.length && p.every(function (q) { return q.t != null; }), t0 = has ? p[0].t : Date.now(), cum = 0;
      var pts = p.map(function (q, i) {
        if (i) cum += hav(p[i - 1], q);
        var t = has ? q.t : t0 + cum / 4.1667 * 1000;
        return "<Trackpoint><Time>" + iso(t) + "</Time><Position><LatitudeDegrees>" + r7(q.lat) + "</LatitudeDegrees><LongitudeDegrees>" + r7(q.lon) + "</LongitudeDegrees></Position>" +
          (q.ele != null ? "<AltitudeMeters>" + q.ele.toFixed(1) + "</AltitudeMeters>" : "") + "<DistanceMeters>" + cum.toFixed(1) + "</DistanceMeters></Trackpoint>";
      }).join("");
      return '<?xml version="1.0" encoding="UTF-8"?>\n<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Biking"><Id>' + iso(t0) +
        '</Id><Lap StartTime="' + iso(t0) + '"><Track>' + pts + "</Track></Lap><Notes>" + xe(name) + "</Notes></Activity></Activities></TrainingCenterDatabase>";
    }
  }
  function fileAs(g, fmt) {
    var f = FORMATS.filter(function (x) { return x[0] === fmt; })[0];
    return new File([convert(g.name, g.full, fmt)], (g.name.replace(/[^\p{L}\p{N} _.-]/gu, "_") || "tracciato") + "." + fmt, { type: f[2] });
  }
  function download(f) { var a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
  function convertDlg(ctx, g) {
    var m = ctx.modal("<h3>" + L10N.convert + '</h3><div class="menu-list">' + FORMATS.filter(function (x) { return x[0] !== "gpx"; }).map(function (x) { return '<button data-f="' + x[0] + '">' + x[1] + " (." + x[0] + ")</button>"; }).join("") +
      '</div><p class="muted small" id="gcvInfo" style="margin:8px 0 0"></p><div class="row end"><button class="btn ghost" data-close>' + L10N.close + "</button></div>");
    m.querySelectorAll("[data-f]").forEach(function (b) {
      b.onclick = function () {
        var f = fileAs(g, b.getAttribute("data-f"));
        if (navigator.canShare && navigator.canShare({ files: [f] })) { m.remove(); navigator.share({ files: [f], title: g.name }).catch(function () {}); }
        else { download(f); m.remove(); ctx.toast(L10N.saved); }
      };
    });
  }
  function toGpx(name, p) {
    var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
    var x = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="GiroCalendar" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>' + esc(name) + "</name><trkseg>\n";
    p.forEach(function (q) {
      x += '<trkpt lat="' + q.lat + '" lon="' + q.lon + '">' + (q.ele != null ? "<ele>" + q.ele + "</ele>" : "") + (q.t != null ? "<time>" + new Date(q.t).toISOString() + "</time>" : "") + "</trkpt>\n";
    });
    return x + "</trkseg></trk></gpx>";
  }
  function fileOf(g) { return new File([toGpx(g.name, g.full)], (g.name.replace(/[^\p{L}\p{N} _.-]/gu, "_") || "tracciato") + ".gpx", { type: "application/gpx+xml" }); }

  /** ctx: { get():{name,full}, set(full,noFit), modal(html), toast(msg), wrap: elemento mappa } */
  // ── Riproduzione: un marker percorre il GPX con i tempi (1–20×, default 20×). ──
  function hasTimes(p) { return p.filter(function (q) { return q.t != null; }).length >= 2; }
  function posAt(p, ms) {   // [lat, lon, indice del punto passato]
    if (ms <= p[0].t) return [p[0].lat, p[0].lon, 0];
    if (ms >= p[p.length - 1].t) return [p[p.length - 1].lat, p[p.length - 1].lon, p.length - 1];
    var lo = 0, hi = p.length - 1;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (p[m].t <= ms) lo = m; else hi = m; }
    var a = p[lo], b = p[hi], f = b.t === a.t ? 0 : (ms - a.t) / (b.t - a.t);
    return [a.lat + (b.lat - a.lat) * f, a.lon + (b.lon - a.lon) * f, lo];
  }
  var player = null;
  function closePlayer() {
    if (!player) return;
    clearInterval(player.timer); player.el.remove(); if (player.api) player.api.clear();
    player = null;
  }
  function fmtT(ms) { var d = new Date(ms); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) + ":" + ("0" + d.getSeconds()).slice(-2); }
  function openPlayer(ctx, g) {
    closePlayer();
    var p = g.full.filter(function (q) { return q.t != null; });
    if (p.length < 2) { ctx.toast(L10N.notimes); return; }
    var api = ctx.playApi; if (!api) return;
    var t0 = p[0].t, dur = (p[p.length - 1].t - t0) / 1000, t = 0, playing = true, speed = 20, follow = false, showElev = true, seeking = false;
    var stride = Math.max(1, Math.floor(p.length / 3000));
    api.setTrack(p.filter(function (_, i) { return i % stride === 0; }).map(function (q) { return [q.lat, q.lon]; }));
    var hasEle = p.some(function (q) { return q.ele != null; });
    var el = document.createElement("div");
    el.style.cssText = "position:absolute;z-index:1100;left:8px;right:8px;bottom:8px;max-width:520px;margin:0 auto;background:var(--card,#fff);color:var(--text,#222);border-radius:10px;padding:4px 8px;box-shadow:0 2px 10px rgba(0,0,0,.4);font-size:12px";
    el.innerHTML = '<div class="row center" style="gap:4px"><button class="btn ghost" id="plPP" style="padding:2px 8px">⏸</button><button class="btn ghost" id="plRe" style="padding:2px 8px" title="' + L10N.restart + '">↺</button>' +
      '<span id="plInfo" style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></span>' +
      '<button class="btn ghost" id="plFo" style="padding:2px 8px" title="Segui">◎</button>' +
      (hasEle ? '<button class="btn ghost" id="plEl" style="padding:2px 8px">▼ ' + L10N.elev2 + '</button>' : '') +
      '<button class="btn ghost" id="plX" style="padding:2px 8px" aria-label="' + L10N.close + '">✕</button></div>' +
      '<input id="plT" type="range" min="0" max="' + Math.round(dur) + '" value="0" style="width:100%;margin:0;height:18px">' +
      '<div class="row center" style="gap:6px"><b id="plSp" style="min-width:30px">20×</b><input id="plS" type="range" min="1" max="60" step="1" value="20" style="flex:1;margin:0;height:18px"></div>' +
      (hasEle ? '<canvas id="plC" height="46" style="width:100%;height:46px;display:block;cursor:pointer"></canvas>' : '');
    ctx.wrap.appendChild(el);
    player = { el: el, api: api, timer: null, urls: [] };
    var T = el.querySelector("#plT"), info = el.querySelector("#plInfo"), PP = el.querySelector("#plPP"), C = el.querySelector("#plC");
    // altimetria: quota nel tempo, parte percorsa colorata, tocco/trascinamento per saltare
    var ys = [];
    if (C) {
      var lastE = null; p.some(function (q) { if (q.ele != null) { lastE = q.ele; return true; } });
      for (var i = 0; i < 160; i++) { var pp = posAt(p, t0 + dur * 1000 * i / 159), e = p[pp[2]].ele; if (e != null) lastE = e; ys.push(lastE); }
    }
    function drawElev() {
      if (!C || !showElev) return;
      var w = C.clientWidth, h = 46; if (C.width !== w) C.width = w;
      var c = C.getContext("2d"), mn = Math.min.apply(null, ys), mx = Math.max.apply(null, ys), sp = Math.max(10, mx - mn);
      var X = function (i) { return w * i / (ys.length - 1); }, Y = function (v) { return h - 3 - ((v - mn) / sp) * (h - 6); };
      function path() { c.beginPath(); ys.forEach(function (v, i) { if (i) c.lineTo(X(i), Y(v)); else c.moveTo(X(i), Y(v)); }); }
      c.clearRect(0, 0, w, h);
      path(); c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fillStyle = "rgba(158,158,158,.25)"; c.fill();
      path(); c.strokeStyle = "#9E9E9E"; c.lineWidth = 2; c.stroke();
      var cx = Math.min(1, t / dur) * w;
      c.save(); c.beginPath(); c.rect(0, 0, cx, h); c.clip();
      path(); c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fillStyle = "rgba(255,109,0,.35)"; c.fill();
      path(); c.strokeStyle = "#FF6D00"; c.lineWidth = 2.5; c.stroke(); c.restore();
      c.fillStyle = "#E53935"; c.fillRect(cx - 1, 0, 2, h);
      c.fillStyle = "#777"; c.font = "10px sans-serif"; c.textAlign = "right"; c.fillText(Math.round(mn) + "–" + Math.round(mx) + " m", w - 2, 10);
    }
    function draw() {
      var pos = posAt(p, t0 + t * 1000); api.setPos(pos[0], pos[1], follow, Math.floor(pos[2] / stride));
      T.value = Math.round(t); info.textContent = fmtT(t0 + t * 1000) + " · " + Math.floor(t / 60) + ":" + ("0" + Math.floor(t % 60)).slice(-2) + "/" + Math.floor(dur / 60) + ":" + ("0" + Math.floor(dur % 60)).slice(-2);
      PP.textContent = playing ? "⏸" : "▶"; drawElev();
    }
    var last = Date.now();
    player.timer = setInterval(function () {
      var now = Date.now(), dt = (now - last) / 1000; last = now;
      if (!playing || seeking) return;
      t = Math.min(dur, t + dt * speed); if (t >= dur) playing = false; draw();
    }, 80);
    PP.onclick = function () { if (t >= dur) t = 0; playing = !playing; draw(); };
    el.querySelector("#plRe").onclick = function () { t = 0; playing = true; draw(); };
    el.querySelector("#plX").onclick = closePlayer;
    el.querySelector("#plFo").onclick = function (e) { follow = !follow; e.target.textContent = follow ? "◉" : "◎"; };
    var El = el.querySelector("#plEl");
    if (El) El.onclick = function () { showElev = !showElev; C.style.display = showElev ? "block" : "none"; El.textContent = (showElev ? "▼ " : "▲ ") + L10N.elev2; drawElev(); };
    if (C) {
      var seek = function (e) { var r = C.getBoundingClientRect(); t = Math.max(0, Math.min(dur, (e.clientX - r.left) / r.width * dur)); draw(); };
      C.onpointerdown = function (e) { seeking = true; C.setPointerCapture(e.pointerId); seek(e); C.onpointermove = seek; };
      C.onpointerup = function () { C.onpointermove = null; seeking = false; last = Date.now(); };
    }
    T.onpointerdown = function () { seeking = true; };
    T.onpointerup = T.onpointercancel = function () { seeking = false; last = Date.now(); };
    T.oninput = function () { t = +T.value; draw(); };
    el.querySelector("#plS").oninput = function (e) { speed = +e.target.value; el.querySelector("#plSp").textContent = speed + "×"; };
    draw();
  }

  function openMenu(ctx) {
    var g = ctx.get(); if (!g) return;
    var m = ctx.modal('<h3>' + L10N.tools + '</h3><div class="menu-list">' +
      ["stats", "crop", "reverse", "simplify", "save", "convert", "share"].concat(ctx.saveTrail ? ["savetrail"] : []).concat(ctx.playApi && hasTimes(g.full) ? ["play"] : []).map(function (k) { return '<button data-k="' + k + '">' + L10N[k] + "</button>"; }).join("") +
      '</div><div class="row end"><button class="btn ghost" data-close>' + L10N.close + "</button></div>");
    m.querySelectorAll("[data-k]").forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute("data-k"); m.remove();
        if (k === "stats") statsDlg(ctx, g);
        else if (k === "crop") cropPanel(ctx, g);
        else if (k === "reverse") ctx.set(reverse(g.full));
        else if (k === "simplify") simplifyDlg(ctx, g);
        else if (k === "convert") convertDlg(ctx, g);
        else if (k === "savetrail") ctx.saveTrail(g);
        else if (k === "play") openPlayer(ctx, g);
        else if (k === "save") {
          var f = fileOf(g), a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); ctx.toast(L10N.saved);
        } else if (k === "share") {
          var f2 = fileOf(g);
          if (navigator.canShare && navigator.canShare({ files: [f2] })) navigator.share({ files: [f2], title: g.name }).catch(function () {});
          else { var a2 = document.createElement("a"); a2.href = URL.createObjectURL(f2); a2.download = f2.name; document.body.appendChild(a2); a2.click(); setTimeout(function () { a2.remove(); }, 1000); }
        }
      };
    });
  }
  function statsDlg(ctx, g) {
    var s = stats(g.full), esc = function (x) { return String(x).replace(/</g, "&lt;"); };
    var rows = [[L10N.dist, fd(s.d)], [L10N.points, g.full.length], [L10N.elev, "+" + Math.round(s.up) + " m / −" + Math.round(s.dn) + " m"]];
    if (s.mn != null) rows.push([L10N.alt, Math.round(s.mn) + " – " + Math.round(s.mx) + " m"]);
    if (s.dur != null) rows.push([L10N.dur, fdur(s.dur)]);
    if (s.avg != null) rows.push([L10N.speed, s.avg.toFixed(1) + " km/h"]);
    ctx.modal("<h3>" + esc(g.name) + "</h3>" + rows.map(function (r) { return '<p style="margin:6px 0"><b>' + r[0] + ":</b> " + r[1] + "</p>"; }).join("") +
      '<div class="row end"><button class="btn ghost" data-close>' + L10N.close + "</button></div>");
  }
  function simplifyDlg(ctx, g) {
    var m = ctx.modal("<h3>" + L10N.simplify + '</h3><p id="gsInfo" class="muted"></p><input id="gsTol" type="range" min="1" max="50" value="5" style="width:100%">' +
      '<div class="row end"><button class="btn ghost" data-close>' + L10N.cancel + '</button><button class="btn" id="gsOk">' + L10N.apply + "</button></div>");
    var tol = m.querySelector("#gsTol"), info = m.querySelector("#gsInfo");
    var upd = function () { info.textContent = L10N.tol + " " + tol.value + " m: " + L10N.from + " " + g.full.length + " " + L10N.to + " " + simplify(g.full, +tol.value).length; };
    tol.oninput = upd; upd();
    m.querySelector("#gsOk").onclick = function () { ctx.set(simplify(g.full, +tol.value)); m.remove(); };
  }
  function cropPanel(ctx, g) {
    var n = g.full.length, p = document.createElement("div");
    p.style.cssText = "position:absolute;z-index:1100;left:10px;right:10px;bottom:10px;background:var(--card,#fff);color:var(--text,#222);border-radius:12px;padding:12px;box-shadow:0 2px 10px rgba(0,0,0,.4)";
    p.innerHTML = '<div id="gcInfo" style="margin-bottom:6px"></div>' +
      '<input id="gcA" type="range" min="0" max="1000" value="0" style="width:100%"><input id="gcB" type="range" min="0" max="1000" value="1000" style="width:100%">' +
      '<div class="row end" style="margin-top:6px"><button class="btn ghost" id="gcNo">' + L10N.cancel + '</button><button class="btn" id="gcOk">' + L10N.apply + "</button></div>";
    ctx.wrap.appendChild(p);
    var A = p.querySelector("#gcA"), B = p.querySelector("#gcB"), info = p.querySelector("#gcInfo");
    var part = function () {
      var a = Math.min(+A.value, +B.value), b = Math.max(+A.value, +B.value);
      return g.full.slice(Math.floor(a / 1000 * (n - 1)), Math.floor(b / 1000 * (n - 1)) + 1);
    };
    var upd = function () { var q = part(); info.textContent = L10N.keep + ": " + fd(stats(q).d) + " · " + q.length + " " + L10N.points.toLowerCase(); ctx.preview(q); };
    A.oninput = B.oninput = upd; upd();
    p.querySelector("#gcNo").onclick = function () { p.remove(); ctx.set(g.full); };
    p.querySelector("#gcOk").onclick = function () { var q = part(); p.remove(); ctx.set(q.length >= 2 ? q : g.full); };
  }
  window.GpxTools = { _convert: convert, parse: parse, openMenu: openMenu, closePlayer: closePlayer, hasTimes: hasTimes, openPlayer: openPlayer, L10N: L10N };
})();
