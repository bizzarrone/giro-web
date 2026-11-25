/* Volo 3D sul tracciato (prototipo): MapLibre GL con rilievo (tile Terrarium), texture OpenStreetMap, camera che segue il
 * percorso dall'alto-dietro. Usa i tempi del GPX se ci sono, altrimenti una velocità costante di 15 km/h.
 * Uso: Flight3D.open({ name, full: [{lat, lon, ele, t}] }). MapLibre si scarica solo alla prima apertura. */
(function () {
  var EN = window.GC_LANG === "en";
  var L = EN ? { close: "Close", restart: "Restart", loading: "Loading 3D map…", fail: "3D map not available", north: "North", nInit: "N", locate: "Locate me", locFail: "Position not available",  area: "area", areaHint: "Drag to move · two fingers to rotate · tap a trail", dist: "Distance", topo: "Topographic", topoS: "Topo", light: "Light", sat: "Satellite", cam: "Camera", tilt: "Tilt", zoomL: "Zoom", rot: "Rotation", follow: "◎ Follow: off", followOn: "◉ Follow: on", free: "Free view: drag to move, two fingers to rotate", up: "Ascent", dur: "Duration", alt: "Altitude", km: "km", eyes: "Show/hide layers", eL: "Logos", eZ: "Zones", eT: "Trails", eN: "Trail names" }
    : { close: "Chiudi", restart: "Ricomincia", loading: "Carico la mappa 3D…", fail: "Mappa 3D non disponibile", north: "Nord", nInit: "N", locate: "Localizzami", locFail: "Posizione non disponibile",  area: "zona", areaHint: "Trascina · due dita per ruotare · tocca un trail", dist: "Distanza", topo: "Topografica", topoS: "Topo", light: "Chiara", sat: "Satellite", cam: "Inquadratura", tilt: "Inclinazione", zoomL: "Zoom", rot: "Rotazione", follow: "◎ Segui: off", followOn: "◉ Segui: on", free: "Vista libera: trascina per spostarti, due dita per ruotare", up: "Salita", dur: "Durata", alt: "Quota", km: "km", eyes: "Mostra/nascondi livelli", eL: "Loghi", eZ: "Zone", eT: "Trail", eN: "Nomi trail" };
  var VER = "4.7.1", loading = null;
  function gw() { var v = window.TT_GPX_W; if (v == null) { try { v = parseInt(localStorage.getItem("gc_gpx_w"), 10); } catch (e) {} } return v > 0 ? v : 3; }

  function loadLib() {
    if (window.maplibregl) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (res, rej) {
      var css = document.createElement("link"); css.rel = "stylesheet";
      css.href = "https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/" + VER + "/maplibre-gl.css"; document.head.appendChild(css);
      var s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/" + VER + "/maplibre-gl.js";
      s.onload = res; s.onerror = function () { loading = null; rej(new Error("maplibre")); }; document.head.appendChild(s);
    });
    return loading;
  }
  function hav(a, b) {
    var R = 6371000, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
    var h = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  function bearing(a, b) {
    var r = Math.PI / 180, y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r);
    var x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
    return (Math.atan2(y, x) / r + 360) % 360;
  }
  /** Riquadro che contiene tutto il tracciato: la prima inquadratura del 3D è già l'intero GPX (niente salto da uno zoom ravvicinato). */
  function allBounds(coords) { var b = new maplibregl.LngLatBounds(coords[0], coords[0]); coords.forEach(function (c) { b.extend(c); }); return b; }
  function fmtDur(s) { s = Math.round(s); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? h + " h " + m + " min" : m + " min"; }
  function clock(s) { s = Math.round(s); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ":" + ("0" + m).slice(-2) : m) + ":" + ("0" + s % 60).slice(-2); }

  function styleObj() {
    return {
          version: 8,
          sources: {
            osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap contributors" },
            topo: { type: "raster", tiles: ["https://a.tile.opentopomap.org/{z}/{x}/{y}.png", "https://b.tile.opentopomap.org/{z}/{x}/{y}.png", "https://c.tile.opentopomap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 17, attribution: "© OpenStreetMap contributors, SRTM, OpenTopoMap (CC-BY-SA)" },
            sat: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 19, attribution: "Tiles © Esri, Maxar, Earthstar Geographics" },
            cyclo: { type: "raster", tiles: ["https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png", "https://b.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png", "https://c.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 20, attribution: "© OpenStreetMap contributors, CyclOSM" },
            dem: { type: "raster-dem", tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 14, encoding: "terrarium" }
          },
          layers: [
            { id: "bg", type: "background", paint: { "background-color": "#cfd8dc" } },
            { id: "osm", type: "raster", source: "osm" },
            { id: "light", type: "raster", source: "osm", layout: { visibility: "none" }, paint: { "raster-saturation": -0.85, "raster-brightness-min": 0.35, "raster-contrast": -0.1 } },
            { id: "topo", type: "raster", source: "topo", layout: { visibility: "none" } },
            { id: "cyclo", type: "raster", source: "cyclo", layout: { visibility: "none" } },
            { id: "sat", type: "raster", source: "sat", layout: { visibility: "none" } },
            { id: "hill", type: "hillshade", source: "dem", paint: { "hillshade-exaggeration": 0.45 } }
          ]
        };
  }

  // Bussola: la freccia rossa indica il nord e ruota insieme alla mappa; un tocco riporta il nord in alto.
  function addCompass(map, el) {
    var c = document.createElement("div");
    c.title = L.north; c.setAttribute("aria-label", L.north);
    c.style.cssText = "position:absolute;left:8px;top:64px;width:46px;height:46px;border-radius:50%;background:rgba(0,0,0,.55);cursor:pointer;z-index:5";
    c.innerHTML = '<div style="position:absolute;inset:0"><svg viewBox="-30 -30 60 60" width="46" height="46"><polygon points="0,-20 7,2 0,-2 -7,2" fill="#e53935"/><polygon points="0,20 7,-2 0,2 -7,-2" fill="#ddd"/>' +
      '<text x="0" y="-22" text-anchor="middle" font-size="9" font-weight="700" fill="#fff" font-family="sans-serif">' + L.nInit + '</text></svg></div>';
    el.appendChild(c);
    var rot = c.firstChild;
    function upd() { rot.style.transform = "rotate(" + (-map.getBearing()) + "deg)"; }
    map.on("rotate", upd); map.on("move", upd); upd();
    c.onclick = function () { map.easeTo({ bearing: 0, duration: 400 }); };
  }

  // Localizzami: centra la mappa 3D sulla posizione e mostra un puntino blu (che poi si aggiorna da solo).
  function addLocate(map, el, st) {
    var dot = null, watch = null, btn = el.querySelector("#f3Loc");
    function msg(t) {
      var m = document.createElement("div");
      m.style.cssText = "position:absolute;left:50%;top:70px;transform:translateX(-50%);background:rgba(0,0,0,.75);padding:6px 12px;border-radius:8px;z-index:6";
      m.textContent = t; el.appendChild(m); setTimeout(function () { m.remove(); }, 2500);
    }
    function show(p) {
      var ll = [p.coords.longitude, p.coords.latitude];
      if (!dot) {
        var d = document.createElement("div");
        d.style.cssText = "width:18px;height:18px;border-radius:50%;background:#1E88E5;border:3px solid #fff;box-shadow:0 0 0 6px rgba(30,136,229,.3)";
        dot = new maplibregl.Marker({ element: d }).setLngLat(ll).addTo(map);
      } else dot.setLngLat(ll);
      return ll;
    }
    function doLocate() {
      if (!navigator.geolocation) { msg(L.locFail); return; }
      navigator.geolocation.getCurrentPosition(function (p) {
        var ll = show(p);
        if (st.setFollow) st.setFollow(false);
        map.flyTo({ center: ll, zoom: Math.max(map.getZoom(), 14), speed: 1.2 });
        if (watch == null) watch = navigator.geolocation.watchPosition(show, function () {}, { enableHighAccuracy: true, maximumAge: 5000 });
      }, function () { msg(L.locFail); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
    }
    st.stopLocate = function () { if (watch != null) { navigator.geolocation.clearWatch(watch); watch = null; } };
    window.f3DoLocate = doLocate;
    btn.onclick = function () { if (window.Android && Android.locPerm) Android.locPerm(); else doLocate(); };
  }

  // Zone (perimetri) e trail del database come contesto sul rilievo; toccando un trail compare il nome.
  function addAreaLayers(map, o) {
        var zf = { type: "FeatureCollection", features: (o.zones || []).filter(function (z) { return z.pts && z.pts.length > 2; }).map(function (z) {
          var ring = z.pts.map(function (p) { return [p[1], p[0]]; }); ring.push(ring[0]);
          return { type: "Feature", properties: { name: z.name || "" }, geometry: { type: "Polygon", coordinates: [ring] } }; }) };
        var tf = { type: "FeatureCollection", features: (o.trails || []).filter(function (t) { return t.path && t.path.length > 1; }).map(function (t) {
          return { type: "Feature", properties: { name: t.name || "", color: t.color || "#9E9E9E", closed: t.closed ? 1 : 0 }, geometry: { type: "LineString", coordinates: t.path.map(function (p) { return [p[1], p[0]]; }) } }; }) };
        map.addSource("zones", { type: "geojson", data: zf });
        map.addLayer({ id: "zones-fill", type: "fill", source: "zones", paint: { "fill-color": "#7B1FA2", "fill-opacity": 0.12 } });
        map.addLayer({ id: "zones-line", type: "line", source: "zones", paint: { "line-color": "#7B1FA2", "line-width": 2, "line-dasharray": [3, 2] } });
        map.addSource("trails", { type: "geojson", data: tf });
        map.addLayer({ id: "trails-casing", type: "line", source: "trails", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": 4.5, "line-opacity": 0.85 } });
        map.addLayer({ id: "trails", type: "line", source: "trails", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 3 } });
        map.on("click", "trails", function (e) {
          var f = e.features && e.features[0]; if (!f) return;
          new maplibregl.Popup({ closeButton: false }).setLngLat(e.lngLat).setHTML('<b style="color:#111">' + String(f.properties.name).replace(/</g, "&lt;") + '</b>').addTo(map);
        });
        map.on("mouseenter", "trails", function () { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "trails", function () { map.getCanvas().style.cursor = ""; });
  }

  /* Occhi Z / T / N come sulla mappa 2D: zone (perimetro + NOME), trail (linee), nomi dei trail. Il tasto 👁 in alto li nasconde. */
  var EYE_ON = "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z";
  var EYE_OFF = "M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z";
  function eyeSvg(on, col) { return '<svg viewBox="0 0 24 24" width="22" height="22" fill="' + (col || "#fff") + '"><path d="' + (on ? EYE_ON : EYE_OFF) + '"/></svg>'; }
  var EYE_BTN = 'border:0;border-radius:20px;height:36px;padding:0 10px;display:flex;align-items:center;gap:4px;color:#fff;font:700 13px sans-serif;cursor:pointer;';
  function addEyes(map, el, o) {
    var zones = (o.zones || []).filter(function (z) { return z.pts && z.pts.length > 2; });
    var trails = (o.trails || []).filter(function (t) { return t.path && t.path.length > 1; });
    var pois = window.GC_POIS || [];
    if (!zones.length && !trails.length && !pois.length) return;
    var S = { z: true, l: true, t: true, n: false, p: true, show: true };
    try { var sv = JSON.parse(localStorage.getItem("gc_f3d_eyes")); if (sv) { ["z", "l", "t", "n", "p", "show"].forEach(function (k) { if (typeof sv[k] === "boolean") S[k] = sv[k]; }); } } catch (e) {}
    function label(txt, ll, css) {
      var d = document.createElement("div"); d.textContent = txt;
      d.style.cssText = "pointer-events:none;white-space:nowrap;font:700 13px sans-serif;color:#fff;text-shadow:0 0 3px #000,0 0 3px #000,0 1px 4px #000;" + css;
      return { m: new maplibregl.Marker({ element: d, anchor: "center" }).setLngLat(ll).addTo(map), d: d };
    }
    // I nomi sono marker DOM: con il rilievo MapLibre li riposiziona a ogni movimento cercando la quota del terreno,
    // quindi si creano solo quando l'occhio e' acceso e si tolgono quando e' spento (altrimenti la navigazione 3D rallenta).
    var zl = [], tl = [], pl = [], ll = [];
    var withLogos = zones.filter(function (z) { return (z.builders || []).some(function (b) { return b && b.logo; }); });
    // Loghi dei costruttori (occhio L): sotto il nome di ogni zona, come sulla mappa 2D; un tocco apre nome e link.
    function buildLogos() {
      withLogos.forEach(function (z) {
        var bl = (z.builders || []).filter(function (b) { return b && b.logo; });
        var a = 0, b2 = 0; z.pts.forEach(function (p) { a += p[0]; b2 += p[1]; });
        var d = document.createElement("div");
        d.style.cssText = "display:flex;gap:6px;margin-top:22px;z-index:4";
        bl.forEach(function (b) {
          var im = document.createElement("img"); im.src = b.logo; im.alt = b.name || "";
          im.style.cssText = "width:44px;height:44px;object-fit:contain;border-radius:50%;background:#fff;border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.6);cursor:pointer";
          im.onclick = function (ev) {
            ev.stopPropagation();
            var box = document.createElement("div"); box.style.cssText = "font:600 13px sans-serif;color:#222;text-align:center;min-width:130px";
            var h = document.createElement("div"); h.textContent = b.name || "Trail builder"; box.appendChild(h);
            var sb = document.createElement("div"); sb.textContent = (EN ? "Zone " : "Zona ") + z.name; sb.style.cssText = "font-weight:400;color:#666;font-size:12px"; box.appendChild(sb);
            if (b.url) {
              var bt = document.createElement("button"); bt.textContent = EN ? "Open link \u203A" : "Apri link \u203A";
              bt.style.cssText = "margin-top:6px;border:0;border-radius:8px;padding:6px 12px;font:700 12px sans-serif;background:#FC5200;color:#fff;cursor:pointer";
              bt.onclick = function () { if (window.Android && Android.openUrl) Android.openUrl(b.url); else window.open(b.url, "_blank", "noopener"); };
              box.appendChild(bt);
            }
            new maplibregl.Popup({ offset: 24, closeButton: true }).setLngLat([b2 / z.pts.length, a / z.pts.length]).setDOMContent(box).addTo(map);
          };
          d.appendChild(im);
        });
        ll.push({ m: new maplibregl.Marker({ element: d, anchor: "top" }).setLngLat([b2 / z.pts.length, a / z.pts.length]).addTo(map), d: d });
      });
    }
    var PT = { ritrovo: ["\u{1F6A9}", "#8E24AA", EN ? "Meeting point" : "Punto di ritrovo", '<svg viewBox="0 0 24 24" width="13" height="13"><path d="M6 3v18" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M7 4h12l-3.5 4.2L19 12.4H7z" fill="#fff"/></svg>'], vetta: ["\u26F0\uFE0F", "#6D4C41", EN ? "Summit" : "Vetta"], picnic: ["\u{1F9FA}", "#2E7D32", EN ? "Picnic area" : "Area picnic"], altro: ["\u2B50", "#F9A825", EN ? "Other point" : "Altro punto"] };
    // Punti di interesse: marker DOM (la quota la trova MapLibre dal rilievo, quindi stanno sul terreno); un tocco apre nome e descrizione.
    function buildPois() {
      pois.forEach(function (p) {
        var t = PT[p.type] || PT.altro, d = document.createElement("div");
        d.style.cssText = "cursor:pointer;";
        var w = document.createElement("div"); w.style.cssText = "display:flex;flex-direction:column;align-items:center;transform-origin:50% 100%;";
        var c = document.createElement("div"); if (t[3]) c.innerHTML = t[3]; else c.textContent = t[0];
        c.style.cssText = "width:20px;height:20px;border-radius:50%;background:" + t[1] + ";border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;font-size:11px;";
        var n = document.createElement("div"); n.textContent = p.name;
        n.style.cssText = "margin-top:1px;white-space:nowrap;font:700 10px sans-serif;color:#fff;text-shadow:0 0 3px #000,0 0 3px #000,0 1px 4px #000;";
        w.appendChild(c); w.appendChild(n); d.appendChild(w);
        d.onclick = function (ev) {
          ev.stopPropagation();
          var box = document.createElement("div"); box.style.cssText = "font:600 13px sans-serif;color:#222;max-width:220px";
          var h = document.createElement("div"); h.textContent = t[0] + " " + p.name; h.style.fontWeight = "700"; box.appendChild(h);
          var sb = document.createElement("div"); sb.textContent = t[2]; sb.style.cssText = "font-weight:400;color:#666;font-size:12px"; box.appendChild(sb);
          if (p.by || p.upd) { var cr = document.createElement("div"); cr.textContent = [p.by ? (EN ? "Added by " : "Aggiunto da ") + p.by : "", p.upd ? (EN ? "edited by " : "modificato da ") + p.upd : ""].filter(Boolean).join(" · "); cr.style.cssText = "font-weight:400;color:#888;font-size:11px;margin-top:2px"; box.appendChild(cr); }
          if (p.desc) { var ds = document.createElement("div"); ds.textContent = p.desc; ds.style.cssText = "font-weight:400;margin-top:6px;white-space:pre-wrap"; box.appendChild(ds); }
          new maplibregl.Popup({ offset: 22, closeButton: true }).setLngLat([p.lon, p.lat]).setDOMContent(box).addTo(map);
        };
        pl.push({ m: new maplibregl.Marker({ element: d, anchor: "bottom" }).setLngLat([p.lon, p.lat]).addTo(map), d: d, w: w, n: n });
      });
      scalePois();
    }
    // I POI si rimpiccioliscono con lo zoom (da zoom 14 in su dimensione piena); il nome sparisce quando si e' lontani.
    function scalePois() {
      var z = map.getZoom(), k = Math.max(0.35, Math.min(0.9, (z - 9) / 6));
      pl.forEach(function (x) { x.w.style.transform = "scale(" + k + ")"; x.n.style.display = z < 12 ? "none" : ""; });
    }
    map.on("zoom", scalePois);
    function clear(arr) { arr.forEach(function (x) { x.m.remove(); }); arr.length = 0; }
    function buildZones() {
      zones.forEach(function (z) {
        var a = 0, b = 0; z.pts.forEach(function (p) { a += p[0]; b += p[1]; });
        zl.push(label(z.name || "", [b / z.pts.length, a / z.pts.length], "z-index:5;font-size:15px;letter-spacing:.5px;text-transform:uppercase;"));
      });
    }
    // Nomi dei trail: solo quelli nell'inquadratura (max 40, quelli piu' vicini al centro), ricalcolati a fine movimento.
    // Con il tetto "i primi 60" nelle zone con tanti trail (Mottarone) i nomi cadevano tutti fuori vista.
    function buildTrails() {
      clear(tl);
      var bd = map.getBounds(), c = map.getCenter();
      var cand = [];
      trails.forEach(function (t) {
        if (!t.name) return;
        var p = t.path[Math.floor(t.path.length / 2)];
        if (!bd.contains([p[1], p[0]])) return;
        cand.push({ t: t, p: p, d: Math.pow(p[1] - c.lng, 2) + Math.pow(p[0] - c.lat, 2) });
      });
      cand.sort(function (a, b) { return a.d - b.d; });
      cand.slice(0, 40).forEach(function (x) { tl.push(label(x.t.name, [x.p[1], x.p[0]], "z-index:1;font-size:11px;color:#fff59d;")); });
    }
    var rebuildT = 0;
    map.on("moveend", function () { if (!S.n) return; clearTimeout(rebuildT); rebuildT = setTimeout(buildTrails, 250); });
    var box = el.querySelector("#f3Chips");
    var chips = {};
    [["z", L.eZ, "Z"], ["l", L.eL, "L"], ["t", L.eT, "T"], ["n", L.eN, "N"], ["p", EN ? "Points of interest" : "Punti di interesse", "P"]].forEach(function (c) {
      if (c[0] === "z" && !zones.length) return;
      if (c[0] === "l" && !withLogos.length) return;
      if ((c[0] === "t" || c[0] === "n") && !trails.length) return;
      if (c[0] === "p" && !pois.length) return;
      var b = document.createElement("button"); b.title = c[1]; b.setAttribute("aria-label", c[1]); b.style.cssText = BTN;
      b.onclick = function () { S[c[0]] = !S[c[0]]; apply(); };
      chips[c[0]] = { b: b, k: c[2] }; box.appendChild(b);
    });
    function vis(id, v) { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v ? "visible" : "none"); }
    function apply() {
      vis("zones-fill", S.z); vis("zones-line", S.z); vis("trails-casing", S.t); vis("trails", S.t);
      if (S.z && !zl.length) buildZones(); else if (!S.z && zl.length) clear(zl);
      if (S.l && !ll.length) buildLogos(); else if (!S.l && ll.length) clear(ll);
      if (S.n) buildTrails(); else if (tl.length) clear(tl);
      if (S.p && !pl.length) buildPois(); else if (!S.p && pl.length) clear(pl);
      Object.keys(chips).forEach(function (k) { var c = chips[k]; c.b.style.background = S[k] ? "#A5651F" : "#F3EBDD"; c.b.style.color = S[k] ? "#fff" : "#2b2118"; c.b.innerHTML = eyeSvg(S[k], S[k] ? "#fff" : "#2b2118") + c.k; });
      try { localStorage.setItem("gc_f3d_eyes", JSON.stringify(S)); } catch (e) {}
    }
    apply();
  }


  // Comandi disposti come nella Mappa 2D: fila in alto (occhi Z/T/N/P come i pulsanti della mappa + «2D» che torna alla mappa),
  // colonna a destra (livelli, posizione), zoom in basso a destra e «pillola» con il nome del GPX in basso a sinistra.
  var BTN = "min-width:46px;height:42px;padding:0 10px;border:0;border-radius:14px;background:#F3EBDD;color:#2b2118;font:700 16px sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:2px;box-shadow:0 1px 3px rgba(0,0,0,.3);";
  var WBOX = "width:46px;height:46px;border:2px solid rgba(0,0,0,.25);border-radius:8px;background:#fff;color:#000;display:flex;align-items:center;justify-content:center;box-sizing:border-box;box-shadow:0 1px 3px rgba(0,0,0,.3);";
  var LAYERS_SVG = '<svg viewBox="0 0 24 24" width="26" height="26" fill="#444"><path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z"/></svg>';
  function chromeHtml() {
    return '<div style="position:absolute;left:8px;right:8px;top:8px;display:flex;gap:6px;align-items:center;z-index:3">' +
      '<span id="f3Chips" style="display:flex;gap:6px"></span><span style="flex:1"></span>' +
      '<button id="f3X" aria-label="2D" title="2D" style="' + BTN + '">2D</button></div>' +
      '<div style="position:absolute;right:8px;top:64px;display:flex;flex-direction:column;gap:8px;z-index:3">' +
      '<div style="position:relative;' + WBOX + '">' + LAYERS_SVG +
      '<select id="f3L" aria-label="Layer" style="position:absolute;inset:0;width:100%;height:100%;opacity:0;font-size:16px"><option value="osm">OSM</option><option value="topo">' + L.topoS + '</option><option value="cyclo">Cyclo</option><option value="light">' + L.light + '</option><option value="sat">' + L.sat + '</option></select></div>' +
      '<button id="f3Loc" title="' + L.locate + '" aria-label="' + L.locate + '" style="' + WBOX + 'font-size:26px;cursor:pointer;padding:0">&#9678;</button></div>' +
      '<div id="f3Pill" style="position:absolute;left:8px;bottom:8px;max-width:calc(100% - 90px);background:#fff;color:#111;border-radius:22px;padding:10px 16px;font:600 15px sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;z-index:3;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>';
  }

  var cur = null;
  function close() {
    if (!cur) return;
    cancelAnimationFrame(cur.raf); if (cur.ro) cur.ro.disconnect(); if (cur.stopLocate) cur.stopLocate(); window.f3DoLocate = null; document.removeEventListener("keydown", cur.key);
    try { cur.map.remove(); } catch (e) {}
    cur.el.remove(); cur = null;
    if (window.Flight3D && typeof window.Flight3D.onClose === "function") window.Flight3D.onClose();
  }

  function open(g) {
    close();
    var raw = (g.full || []).filter(function (q) { return isFinite(q.lat) && isFinite(q.lon); });
    if (raw.length < 2) return;
    var timed = raw.filter(function (q) { return q.t != null; });
    var useTimes = timed.length >= 2;
    var pts = useTimes ? timed : raw;
    // profilo: distanza cumulata e tempo virtuale (secondi) di ogni punto
    var d = [0], i;
    for (i = 1; i < pts.length; i++) d.push(d[i - 1] + hav(pts[i - 1], pts[i]));
    var tl = pts.map(function (q, k) { return useTimes ? (q.t - pts[0].t) / 1000 : d[k] / 4.1667; });
    var total = tl[tl.length - 1] || 1, dist = d[d.length - 1], up = 0;
    for (i = 1; i < pts.length; i++) if (pts[i].ele != null && pts[i - 1].ele != null && pts[i].ele > pts[i - 1].ele) up += pts[i].ele - pts[i - 1].ele;

    if (!document.getElementById("f3-style")) { var stl = document.createElement("style"); stl.id = "f3-style"; stl.textContent = ".maplibregl-ctrl-bottom-right,.maplibregl-ctrl-bottom-left{margin-bottom:8px}"; document.head.appendChild(stl); }
    var el = document.createElement("div");
    el.style.cssText = "position:fixed;inset:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px) 0;box-shadow:0 0 0 100vmax #111;z-index:400;background:#111;color:#fff;font:13px sans-serif";
    el.innerHTML = '<div id="f3Map" style="position:absolute;inset:0"></div>' +
      '<div id="f3Msg" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:16px">' + L.loading + '</div>' +
      chromeHtml();
    document.body.appendChild(el);
    el.querySelector("#f3Pill").textContent = "GPX · " + (g.name || "") + " · " + (dist / 1000).toFixed(1) + " " + L.km + (up ? " · ↑" + Math.round(up) + " m" : "");
    var st = { el: el, raf: 0, map: null, key: function (e) { if (e.key === "Escape") close(); } };
    cur = st; document.addEventListener("keydown", st.key);
    el.querySelector("#f3X").onclick = close;

    loadLib().then(function () {
      if (cur !== st) return;
      var coords = pts.map(function (q) { return [q.lon, q.lat]; });
      var map = new maplibregl.Map({
        container: el.querySelector("#f3Map"), interactive: true, attributionControl: { compact: true },
        bounds: allBounds(coords), fitBoundsOptions: { pitch: 45, padding: { top: 90, bottom: 150, left: 40, right: 40 }, maxZoom: 15 }, pitch: 45, bearing: 0, maxPitch: 80,
        style: styleObj()
      });
      st.map = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      if (window.ResizeObserver) { st.ro = new ResizeObserver(function () { try { map.resize(); } catch (e) {} }); st.ro.observe(el); }
      map.on("error", function () { var m = el.querySelector("#f3Msg"); if (m && m.style.display !== "none" && !st.ready) m.textContent = L.fail; });
      map.on("load", function () {
        st.ready = true; el.querySelector("#f3Msg").style.display = "none"; addCompass(map, el); addLocate(map, el, st);
        var LAY = ["osm", "light", "topo", "cyclo", "sat"], sel = el.querySelector("#f3L"), saved = null;
        try { saved = localStorage.getItem("gc_f3d_base"); if (!saved) { var mb = localStorage.getItem("gc_map_base") || ""; saved = /topograf/i.test(mb) ? "topo" : /ciclismo|cyclo/i.test(mb) ? "cyclo" : /chiara/i.test(mb) ? "light" : /satell/i.test(mb) ? "sat" : "osm"; } } catch (e) {}
        function setBase(k) {
          if (LAY.indexOf(k) < 0) k = "osm";
          LAY.forEach(function (id) { map.setLayoutProperty(id, "visibility", id === k ? "visible" : "none"); });
          sel.value = k; try { localStorage.setItem("gc_f3d_base", k); } catch (e) {}
        }
        sel.onchange = function () { setBase(sel.value); };
        setBase(saved);
        // Inquadratura libera: inclinazione, zoom e rotazione dal pannello 🎥 (o con le dita sulla mappa).
        map.setTerrain({ source: "dem", exaggeration: 1.5 });
        var line = function (c) { return { type: "Feature", geometry: { type: "LineString", coordinates: c } }; };
        if (g.extra) { addAreaLayers(map, g.extra); addEyes(map, el, g.extra); } else if (window.GC_POIS && window.GC_POIS.length) addEyes(map, el, {});
        map.addSource("trk", { type: "geojson", data: line(coords) });
        map.addLayer({ id: "trk-casing", type: "line", source: "trk", paint: { "line-color": "#fff", "line-width": gw() + 3, "line-opacity": 0.85 }, layout: { "line-cap": "round", "line-join": "round" } });
        map.addLayer({ id: "trk", type: "line", source: "trk", paint: { "line-color": "#E91E63", "line-width": gw() + 1 }, layout: { "line-cap": "round", "line-join": "round" } });
        // All'apertura si vede tutto il tracciato in 3D; la camera è libera (trascina, ruota, zoom).
        var bnd = new maplibregl.LngLatBounds(coords[0], coords[0]); coords.forEach(function (c) { bnd.extend(c); });
        map.fitBounds(bnd, { pitch: 45, bearing: 0, padding: { top: 90, bottom: 150, left: 40, right: 40 }, duration: 0, maxZoom: 15 });
      });
    }).catch(function () { var m = el.querySelector("#f3Msg"); if (m) m.textContent = L.fail; });
  }

  // ── Vista 3D della zona: la mappa corrente in 3D con i trail (colore = difficoltà) e le zone; camera libera ──
  function openArea(o) {
    close();
    if (!document.getElementById("f3-style")) { var stl = document.createElement("style"); stl.id = "f3-style"; stl.textContent = ".maplibregl-ctrl-bottom-right,.maplibregl-ctrl-bottom-left{margin-bottom:8px}"; document.head.appendChild(stl); }
    var el = document.createElement("div");
    el.style.cssText = "position:fixed;inset:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px) 0;box-shadow:0 0 0 100vmax #111;z-index:400;background:#111;color:#fff;font:13px sans-serif";
    el.innerHTML = '<div id="f3Map" style="position:absolute;inset:0"></div>' +
      '<div id="f3Msg" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:16px">' + L.loading + '</div>' +
      chromeHtml();
    document.body.appendChild(el);
    el.querySelector("#f3Pill").textContent = "3D · " + L.area;
    var st = { el: el, raf: 0, map: null, key: function (e) { if (e.key === "Escape") close(); } };
    cur = st; document.addEventListener("keydown", st.key);
    el.querySelector("#f3X").onclick = close;
    loadLib().then(function () {
      if (cur !== st) return;
      var map = new maplibregl.Map({ container: el.querySelector("#f3Map"), interactive: true, attributionControl: { compact: true },
        center: [o.center[1], o.center[0]], zoom: Math.max(8, o.zoom - 1), pitch: 60, bearing: 0, maxPitch: 80, style: styleObj() });
      st.map = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      if (window.ResizeObserver) { st.ro = new ResizeObserver(function () { try { map.resize(); } catch (e) {} }); st.ro.observe(el); }
      map.on("error", function () { var m = el.querySelector("#f3Msg"); if (m && m.style.display !== "none" && !st.ready) m.textContent = L.fail; });
      map.on("load", function () {
        st.ready = true; el.querySelector("#f3Msg").style.display = "none"; addCompass(map, el); addLocate(map, el, st);
        map.setTerrain({ source: "dem", exaggeration: 1.5 });
        var LAY = ["osm", "light", "topo", "cyclo", "sat"], sel = el.querySelector("#f3L"), saved = null;
        try { saved = localStorage.getItem("gc_f3d_base"); } catch (e) {}
        function setBase(k) { if (LAY.indexOf(k) < 0) k = "osm"; LAY.forEach(function (id) { map.setLayoutProperty(id, "visibility", id === k ? "visible" : "none"); }); sel.value = k; try { localStorage.setItem("gc_f3d_base", k); } catch (e) {} }
        sel.onchange = function () { setBase(sel.value); }; setBase(saved);
        addAreaLayers(map, o); addEyes(map, el, o);
      });
    }).catch(function () { var m = el.querySelector("#f3Msg"); if (m) m.textContent = L.fail; });
  }
  window.Flight3D = { open: open, openArea: openArea, close: close, _u: { styleObj: styleObj, loadLib: loadLib, hav: hav, bearing: bearing } };
})();
