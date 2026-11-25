/* TrailTrace: aggancia una traccia disegnata a mano ai sentieri reali di OpenStreetMap.
 * Condiviso tra app Android (WebView) e sito web. Uso: TrailTrace.snap(drawn) con drawn = [[lat,lon],...]
 * Restituisce {points, snapped, lengthM, names:[[nome,metri]...], mtb} (mtb = scala OSM più frequente o null).
 * Algoritmo: scarica da Overpass i sentieri nel riquadro della traccia, costruisce il grafo, per ogni campione
 * (ogni ~20 m) sceglie fino a 3 nodi candidati entro 35 m e trova con Viterbi la sequenza con il miglior
 * compromesso fra vicinanza al dito e coerenza del percorso lungo il grafo; infine unisce i nodi scelti
 * con i cammini minimi. Se non ci sono sentieri vicini, restituisce la traccia a mano semplificata. */
(function () {
  // Spessore base delle linee del GPX (Preferenze → Spessore traccia GPX): Android lo passa in window.TT_GPX_W, il sito in localStorage.
  function gpxW() { var v = window.TT_GPX_W; if (v == null) { try { v = parseInt(localStorage.getItem('gc_gpx_w'), 10); } catch (e) {} } return v > 0 ? v : 3; }
  var EN = {
    'Sentieri OSM non raggiungibili: uso il tracciato a mano.': 'OSM paths unreachable: using the hand-drawn track.',
    'Nessun sentiero OSM nella zona: uso il tracciato a mano.': 'No OSM path in the area: using the hand-drawn track.',
    'Pochi sentieri vicini al tracciato: uso il tracciato a mano.': 'Few paths near the track: using the hand-drawn track.',
    '✎ Traccia col dito': '✎ Draw with finger',
    '☝ Tocca un sentiero': '☝ Tap a path',
    '▭ Disegna zona': '▭ Draw zone',
    '📍 POI': '📍 POI',
    '⬆ Importa GPX': '⬆ Import GPX',
    '✎ Traccia': '✎ Draw',
    '☝ Sentiero': '☝ Path',
    '▭ Zona': '▭ Zone',
    'Tocca la mappa dove mettere il punto': 'Tap the map where to put the point',
    'Punto di ritrovo': 'Meeting point',
    'Vetta': 'Summit',
    'Area picnic': 'Picnic area',
    'Altro punto': 'Other point',
    '🧭 Naviga': '🧭 Navigate',
    'Aggiunto da': 'Added by',
    'modificato da': 'edited by',
    'Modifica': 'Edit',
    'Elimina': 'Delete',
    'Disegna col dito lungo il sentiero': 'Draw with your finger along the path',
    'Annulla': 'Cancel',
    'Aggancio ai sentieri…': 'Snapping to paths…',
    'Errore: uso il tracciato a mano.': 'Error: using the hand-drawn track.',
    'agganciato ai sentieri OSM': 'snapped to OSM paths',
    'tracciato a mano': 'drawn by hand',
    'Ridisegna': 'Redraw',
    'Avanti': 'Next',
    'Tocca un sentiero sulla mappa': 'Tap a path on the map',
    '◀ Estendi': '◀ Extend',
    'Estendi ▶': 'Extend ▶',
    'Altro': 'Other',
    'Cerco il sentiero…': 'Looking for the path…',
    'Sentieri OSM non raggiungibili': 'OSM paths unreachable',
    'Riprova': 'Retry',
    'Cerca un luogo…': 'Search a place…',
    'Cerca luogo': 'Search place',
    'Nessun risultato': 'No results',
    'Ricerca non riuscita': 'Search failed',
    'Nessun sentiero qui: tocca più vicino': 'No path here: tap closer',
    '↶ Annulla ultimo': '↶ Undo last',
    'Fine': 'Done',
    'Tocca i vertici della zona': 'Tap the vertices of the zone',
    'vertici': 'vertices',
    'GPX': 'GPX',
    'Chiudi': 'Close',
    'Riduci': 'Collapse',
    'in parte': 'partly',
    'Nessun trail del database corrisponde.': 'No trail of the database matches.',
    'trail': 'trails',
    'Zona': 'Zone',
    'Apri link ›': 'Open link ›',
    'Dettagli ›': 'Details ›',
    '✎ Modifica': '✎ Edit',
    '🗑 Cancella': '🗑 Delete',
    '🏷 Costruttori': '🏷 Builders',
    'Eliminare il perimetro della zona': 'Delete the perimeter of the zone',
    'I trail della zona non vengono toccati.': 'The trails of the zone are not touched.',
    'Rimuovere il tracciato di': 'Remove the track of',
    'dalla mappa?': 'from the map?',
    'Il trail resta nell\'elenco.': 'The trail stays in the list.',
    'Sì, cancella': 'Yes, delete',
    'No': 'No',
    'Modifica la zona': 'Edit the zone',
    'Modifica': 'Edit',
    'Salva': 'Save',
    'Trascina i punti · tocca ◦ per aggiungerne uno · tieni premuto un punto per toglierlo': 'Drag the points · tap ◦ to add one · long-press a point to remove it',
    'Topografica': 'Topographic',
    'Chiara': 'Light',
    'Ciclismo (CyclOSM)': 'Cycling (CyclOSM)',
    'Percorsi MTB': 'MTB routes',
  };
  function tt(s) { return (window.TT_LANG === 'en' && EN[s]) || s; }
  var SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

  function K(lat) { return { kx: 111320 * Math.cos(lat * Math.PI / 180), ky: 110540 }; }
  function dist(a, b, k) { return Math.hypot((a[1] - b[1]) * k.kx, (a[0] - b[0]) * k.ky); }

  function densify(pts, step, k) {
    var out = [pts[0]], acc = 0;
    for (var i = 1; i < pts.length; i++) {
      var d = dist(pts[i - 1], pts[i], k);
      if (d === 0) continue;
      var t = step - acc;
      while (t <= d) {
        var f = t / d;
        out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]);
        t += step;
      }
      acc = d - (t - step);
    }
    var last = pts[pts.length - 1];
    if (dist(out[out.length - 1], last, k) > step / 3) out.push(last);
    return out;
  }

  function simplify(pts, tolM, maxPts) {
    tolM = tolM || 3; maxPts = maxPts || 1500;
    if (pts.length <= 2) return pts;
    var k = K(pts[0][0]);
    var X = pts.map(function (p) { return p[1] * k.kx; }), Y = pts.map(function (p) { return p[0] * k.ky; });
    function dp(tol) {
      var keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
      var st = [[0, pts.length - 1]];
      while (st.length) {
        var ab = st.pop(), a = ab[0], b = ab[1];
        var dx = X[b] - X[a], dy = Y[b] - Y[a], len = Math.hypot(dx, dy), md = 0, idx = -1;
        for (var q = a + 1; q < b; q++) {
          var d = len === 0 ? Math.hypot(X[q] - X[a], Y[q] - Y[a]) : Math.abs(dy * (X[q] - X[a]) - dx * (Y[q] - Y[a])) / len;
          if (d > md) { md = d; idx = q; }
        }
        if (idx >= 0 && md > tol) { keep[idx] = 1; st.push([a, idx], [idx, b]); }
      }
      return pts.filter(function (_, i) { return keep[i]; });
    }
    var tol = tolM, r = dp(tol);
    while (r.length > maxPts) { tol *= 1.5; r = dp(tol); }
    return r;
  }

  function lengthM(pts) {
    if (pts.length < 2) return 0;
    var k = K(pts[0][0]), s = 0;
    for (var i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i], k);
    return s;
  }

  function fetchWithTimeout(url, body, ms) {
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, ms);
    return fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(body), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal })
      .then(function (r) { clearTimeout(t); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }

  var cacheOp = {};
  /** Interroga in parallelo tutti i server Overpass e prende la prima risposta valida (di solito uno è lento o
   * sovraccarico); una sola passata con timeout di 20 s. Risultato in cache per la stessa zona. */
  async function overpass(bbox) {
    var key = bbox.map(function (x) { return x.toFixed(4); }).join(',');
    if (cacheOp[key]) return cacheOp[key];
    var q = '[out:json][timeout:25];way["highway"]["highway"!~"motorway|trunk|primary|secondary|motorway_link|trunk_link|primary_link"](' +
      bbox.join(',') + ');out geom;';
    var data = await Promise.any(SERVERS.map(function (u) { return fetchWithTimeout(u, q, 20000); }));
    cacheOp[key] = data;
    return data;
  }

  /** Solo i sentieri (path/track/bridleway/footway/cycleway/steps): query molto più leggera per "Tocca un sentiero". */
  async function overpassPaths(bbox) {
    var key = 'p' + bbox.map(function (x) { return x.toFixed(4); }).join(',');
    if (cacheOp[key]) return cacheOp[key];
    var q = '[out:json][timeout:25];way["highway"~"^(path|track|bridleway|footway|cycleway|steps)$"](' + bbox.join(',') + ');out geom qt;';
    var data = await Promise.any(SERVERS.map(function (u) { return fetchWithTimeout(u, q, 25000); }));
    cacheOp[key] = data;
    return data;
  }

  function buildGraph(data) {
    var nodes = new Map(), ways = [];
    data.elements.forEach(function (w) {
      if (!w.geometry || !w.nodes) return;
      var wi = ways.length; ways.push({ name: (w.tags && w.tags.name) || '', mtb: w.tags && w.tags['mtb:scale'] });
      for (var i = 0; i < w.nodes.length; i++) {
        var id = w.nodes[i];
        if (!nodes.has(id)) nodes.set(id, { id: id, lat: w.geometry[i].lat, lon: w.geometry[i].lon, adj: [] });
      }
      for (var j = 1; j < w.nodes.length; j++) {
        var a = nodes.get(w.nodes[j - 1]), b = nodes.get(w.nodes[j]);
        if (a === b) continue;
        var k = K(a.lat), d = Math.hypot((a.lon - b.lon) * k.kx, (a.lat - b.lat) * k.ky);
        a.adj.push({ to: b, len: d, w: wi }); b.adj.push({ to: a, len: d, w: wi });
      }
    });
    return { nodes: Array.from(nodes.values()), ways: ways };
  }

  // coda con priorità minimale (heap binario)
  function Heap() { this.a = []; }
  Heap.prototype.push = function (item, pri) {
    var a = this.a; a.push([pri, item]); var i = a.length - 1;
    while (i > 0) { var p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; var t = a[p]; a[p] = a[i]; a[i] = t; i = p; }
  };
  Heap.prototype.pop = function () {
    var a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; var i = 0;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break; var t = a[m]; a[m] = a[i]; a[i] = t; i = m;
      }
    }
    return top;
  };

  /** Dijkstra da src con limite di costo; restituisce Map nodo → {d, prev, w}. */
  function dijkstra(src, limit) {
    var best = new Map(); best.set(src, { d: 0, prev: null, w: -1 });
    var h = new Heap(); h.push(src, 0);
    while (h.a.length) {
      var top = h.pop(), d = top[0], n = top[1];
      if (d > best.get(n).d) continue;
      for (var i = 0; i < n.adj.length; i++) {
        var e = n.adj[i], nd = d + e.len;
        if (nd > limit) continue;
        var cur = best.get(e.to);
        if (!cur || nd < cur.d) { best.set(e.to, { d: nd, prev: n, w: e.w }); h.push(e.to, nd); }
      }
    }
    return best;
  }

  async function snap(drawn) {
    var k = K(drawn[0][0]);
    var raw = simplify(drawn, 3);
    var fallback = { points: raw, snapped: false, lengthM: lengthM(raw), names: [], mtb: null };
    var step = 20; var samples = densify(drawn, step, k);
    if (samples.length > 400) samples = densify(drawn, lengthM(drawn) / 400, k);
    var minLat = 90, minLon = 180, maxLat = -90, maxLon = -180;
    drawn.forEach(function (p) { minLat = Math.min(minLat, p[0]); maxLat = Math.max(maxLat, p[0]); minLon = Math.min(minLon, p[1]); maxLon = Math.max(maxLon, p[1]); });
    var padLat = 80 / k.ky, padLon = 80 / k.kx;
    var data;
    try { data = await overpass([minLat - padLat, minLon - padLon, maxLat + padLat, maxLon + padLon]); }
    catch (e) { fallback.warn = tt('Sentieri OSM non raggiungibili: uso il tracciato a mano.'); return fallback; }
    var g = buildGraph(data);
    if (g.nodes.length < 2) { fallback.warn = tt('Nessun sentiero OSM nella zona: uso il tracciato a mano.'); return fallback; }

    var R = 35, cands = [], withC = 0;
    samples.forEach(function (s) {
      var best = [];
      for (var i = 0; i < g.nodes.length; i++) {
        var n = g.nodes[i], d = Math.hypot((n.lon - s[1]) * k.kx, (n.lat - s[0]) * k.ky);
        if (d <= R) { best.push({ n: n, d: d }); }
      }
      best.sort(function (a, b) { return a.d - b.d; });
      best = best.slice(0, 3);
      cands.push(best); if (best.length) withC++;
    });
    if (withC < samples.length * 0.6) { fallback.warn = tt('Pochi sentieri vicini al tracciato: uso il tracciato a mano.'); return fallback; }

    // Viterbi sui campioni che hanno candidati
    var idx = []; cands.forEach(function (c, i) { if (c.length) idx.push(i); });
    var cache = new Map();
    function reach(n, limit) {
      var c = cache.get(n);
      if (!c || c.limit < limit) { c = { limit: limit, map: dijkstra(n, limit) }; cache.set(n, c); }
      return c.map;
    }
    var prevCost = cands[idx[0]].map(function (c) { return c.d * c.d / 400; }), back = [];
    for (var t = 1; t < idx.length; t++) {
      var A = cands[idx[t - 1]], B = cands[idx[t]];
      var crow = dist(samples[idx[t - 1]], samples[idx[t]], k), lim = Math.max(crow * 4, 60) + 40;
      var cost = [], bp = [];
      for (var j = 0; j < B.length; j++) {
        var bestC = Infinity, bestI = 0;
        for (var i2 = 0; i2 < A.length; i2++) {
          var r = reach(A[i2].n, lim).get(B[j].n);
          var tr = r ? Math.abs(r.d - crow) / 20 : 50;
          var c2 = prevCost[i2] + tr;
          if (c2 < bestC) { bestC = c2; bestI = i2; }
        }
        cost.push(bestC + B[j].d * B[j].d / 400); bp.push(bestI);
      }
      back.push(bp); prevCost = cost;
    }
    var bi = 0; for (var q = 1; q < prevCost.length; q++) if (prevCost[q] < prevCost[bi]) bi = q;
    var chosen = new Array(idx.length); chosen[idx.length - 1] = bi;
    for (var t2 = idx.length - 1; t2 > 0; t2--) { bi = back[t2 - 1][bi]; chosen[t2 - 1] = bi; }
    var seq = chosen.map(function (c, t3) { return cands[idx[t3]][c].n; });

    // cammini minimi fra i nodi consecutivi
    var route = [seq[0]], wayMeters = new Map(), mtbMeters = {};
    function addW(wi, d) {
      var w = g.ways[wi]; if (!w) return;
      if (w.name) wayMeters.set(w.name, (wayMeters.get(w.name) || 0) + d);
      if (w.mtb != null) mtbMeters[w.mtb] = (mtbMeters[w.mtb] || 0) + d;
    }
    for (var s2 = 1; s2 < seq.length; s2++) {
      var a = seq[s2 - 1], b = seq[s2];
      if (a === b) continue;
      var crow2 = dist([a.lat, a.lon], [b.lat, b.lon], k);
      var m = dijkstra(a, Math.max(crow2 * 4, 60) + 40);
      var rb = m.get(b);
      if (!rb) { route.push(b); continue; }
      var chain = [], cur = b;
      while (cur !== a) { var info = m.get(cur); chain.push([cur, info.w, info.d - m.get(info.prev).d]); cur = info.prev; }
      chain.reverse().forEach(function (c) { route.push(c[0]); addW(c[1], c[2]); });
    }
    // elimina i "ritorni" A-B-A
    var clean = [];
    route.forEach(function (n) {
      if (clean.length && clean[clean.length - 1] === n) return;
      if (clean.length >= 2 && clean[clean.length - 2] === n) { clean.pop(); return; }
      clean.push(n);
    });
    var pts = clean.map(function (n) { return [n.lat, n.lon]; });
    var names = Array.from(wayMeters.entries()).sort(function (x, y) { return y[1] - x[1]; }).slice(0, 4)
      .map(function (e) { return [e[0], Math.round(e[1])]; });
    var mtb = null, bm = 0; Object.keys(mtbMeters).forEach(function (kk) { if (mtbMeters[kk] > bm) { bm = mtbMeters[kk]; mtb = kk; } });
    var out = simplify(pts, 2);
    return { points: out, snapped: true, lengthM: lengthM(out), names: names, mtb: mtb };
  }

  /** Interfaccia di tracciamento a dito su una mappa Leaflet: bottone "Traccia", disegno, aggancio, risultato.
   * onDone(result) viene chiamato con "Avanti". Restituisce {show, hide} per mostrare la barra solo quando serve. */
  function attachUi(map, onDone, zIndex, onZone, onPoi, onImport) {
    if (!document.getElementById('tt-style')) {
      var st = document.createElement('style'); st.id = 'tt-style';
      st.textContent = '#tbar{position:fixed;left:10px;top:34%;width:fit-content;max-width:150px;display:flex;flex-direction:column;align-items:stretch;gap:5px;' +
        'background:rgba(255,255,255,.96);border-radius:14px;padding:6px;box-shadow:0 2px 8px rgba(0,0,0,.4);font:600 12px sans-serif;color:#222}' +
        '#tbar>span:empty{display:none}' +
        '#tbar button{border:0;border-radius:9px;padding:8px 10px;font:700 12px sans-serif;white-space:nowrap;text-align:left;background:#FC5200;color:#fff;cursor:pointer}' +
        '#tbar button.sec{background:#e0e0e0;color:#222}';
      document.head.appendChild(st);
    }
    var bar = document.createElement('div'); bar.id = 'tbar'; bar.style.zIndex = String(zIndex || 1200); document.body.appendChild(bar);
    var line = null, res = null, layer = L.layerGroup().addTo(map), active = false, pts = [], picking = false, sel = null, zoning = false, zpts = [], poiing = false;
    var container = map.getContainer();
    function ui(html, buttons) {
      // busy = una modalità di disegno/selezione è attiva: i tocchi non devono aprire trail o zone sotto il dito.
      window.TrailTrace.busy = !!html;
      bar.innerHTML = '<span>' + html + '</span>';
      buttons.forEach(function (b) {
        var el = document.createElement('button'); el.textContent = b[0]; if (b[2]) el.className = 'sec'; el.onclick = b[1]; bar.appendChild(el);
      });
    }
    function stop() { active = false; map.dragging.enable(); container.style.touchAction = ''; }
    function idle() { stop(); picking = false; zoning = false; poiing = false; layer.clearLayers(); res = null; var b = [[tt('✎ Traccia'), start], [tt('☝ Sentiero'), startPick]]; if (onZone) b.push([tt('▭ Zona'), startZone]); if (onPoi) b.push([tt('📍 POI'), startPoi]); if (onImport) b.push([tt('⬆ Importa GPX'), onImport]); ui('', b); }
    function start() {
      picking = false; zoning = false; layer.clearLayers(); res = null; active = true; pts = [];
      map.dragging.disable(); container.style.touchAction = 'none';
      ui(tt('Disegna col dito lungo il sentiero'), [[tt('Annulla'), idle, true]]);
    }
    function latlng(e) { var l = map.mouseEventToLatLng(e); return [l.lat, l.lng]; }
    container.addEventListener('pointerdown', function (e) {
      if (!active) return;
      if (!e.isPrimary) { pts = []; layer.clearLayers(); return; }
      pts = [latlng(e)]; layer.clearLayers();
      line = L.polyline(pts, { color: '#FC5200', weight: 4, dashArray: '6 6' }).addTo(layer);
    });
    container.addEventListener('pointermove', function (e) {
      if (!active || !pts.length || !e.isPrimary || e.buttons === 0) return;
      pts.push(latlng(e)); line.setLatLngs(pts);
    });
    container.addEventListener('pointerup', function (e) {
      if (!active || !pts.length || !e.isPrimary) return;
      if (pts.length < 6) { pts = []; layer.clearLayers(); return; }
      stop(); finish(pts.slice());
    });
    async function finish(drawnPts) {
      ui(tt('Aggancio ai sentieri…'), []);
      var r;
      try { r = await snap(drawnPts); }
      catch (err) { r = { points: simplify(drawnPts, 3), snapped: false, lengthM: lengthM(drawnPts), names: [], mtb: null, warn: tt('Errore: uso il tracciato a mano.') }; }
      res = r; layer.clearLayers();
      L.polyline(r.points, { color: '#fff', weight: 9, opacity: .9 }).addTo(layer);
      L.polyline(r.points, { color: '#1E6BFF', weight: 5 }).addTo(layer);
      L.circleMarker(r.points[0], { radius: 7, color: '#fff', fillColor: '#27AE60', fillOpacity: 1, weight: 2 }).addTo(layer);
      L.circleMarker(r.points[r.points.length - 1], { radius: 7, color: '#fff', fillColor: '#E74C3C', fillOpacity: 1, weight: 2 }).addTo(layer);
      map.fitBounds(L.latLngBounds(r.points), { padding: [60, 60] });
      var info = Math.round(r.lengthM) + ' m · ' + (r.snapped ? tt('agganciato ai sentieri OSM') : (r.warn || tt('tracciato a mano')));
      ui(info, [[tt('Ridisegna'), start, true], [tt('Avanti'), function () { var x = res; idle(); onDone(x); }]]);
    }
        // ── "Tocca un sentiero": un tocco seleziona il sentiero OSM sotto il dito, esteso in entrambe le direzioni
    //    fino al primo incrocio; "Estendi" supera l'incrocio scegliendo la prosecuzione più dritta.
    var PATHLIKE = /^(path|track|bridleway|footway|cycleway|steps)$/;
    function buildIndex(data) {
      var ways = [], nodeWays = new Map(), coords = new Map();
      data.elements.forEach(function (w) {
        if (!w.nodes || !w.geometry) return;
        var wi = ways.length; ways.push({ nodes: w.nodes, geom: w.geometry, tags: w.tags || {} });
        w.nodes.forEach(function (n, i) {
          coords.set(n, [w.geometry[i].lat, w.geometry[i].lon]);
          if (!nodeWays.has(n)) nodeWays.set(n, []);
          nodeWays.get(n).push(wi);
        });
      });
      return { ways: ways, nodeWays: nodeWays, coords: coords };
    }
    function segDist(p, a, b, k) {
      var ax = (a[1] - p[1]) * k.kx, ay = (a[0] - p[0]) * k.ky, bx = (b[1] - p[1]) * k.kx, by = (b[0] - p[0]) * k.ky;
      var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
      return Math.hypot(ax + t * dx, ay + t * dy);
    }
    function nearestWay(g, p) {
      var k = K(p[0]), best = -1, bd = 1e9, bestAny = -1, bdAny = 1e9;
      g.ways.forEach(function (w, i) {
        var d = 1e9;
        for (var j = 1; j < w.geom.length; j++) d = Math.min(d, segDist(p, [w.geom[j - 1].lat, w.geom[j - 1].lon], [w.geom[j].lat, w.geom[j].lon], k));
        if (d < bdAny) { bdAny = d; bestAny = i; }
        if (PATHLIKE.test(w.tags.highway || '') && d < bd) { bd = d; best = i; }
      });
      if (best >= 0 && bd <= 45) return best;
      return bdAny <= 30 ? bestAny : -1;
    }
    function bearing(a, b) {
      var t = Math.PI / 180, la1 = a[0] * t, la2 = b[0] * t, dl = (b[1] - a[1]) * t;
      return (Math.atan2(Math.sin(dl) * Math.cos(la2), Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dl)) * 180 / Math.PI + 360) % 360;
    }
    function segLen(g, ids, k) {
      var m = 0; for (var i = 1; i < ids.length; i++) m += dist(g.coords.get(ids[i - 1]), g.coords.get(ids[i]), k); return m;
    }
    function newSel(g, wi) {
      var k = K(g.coords.get(g.ways[wi].nodes[0])[0]);
      return { g: g, k: k, nodes: g.ways[wi].nodes.slice(), used: [wi], parts: [[wi, segLen(g, g.ways[wi].nodes, k)]] };
    }
    /** Segmenti che partono dal nodo n (verso fuori) e appartengono a sentieri non ancora usati. */
    function candidates(sel, n) {
      var out = [];
      (sel.g.nodeWays.get(n) || []).forEach(function (wi) {
        if (sel.used.indexOf(wi) >= 0) return;
        var w = sel.g.ways[wi]; if (!PATHLIKE.test(w.tags.highway || '')) return;
        var i = w.nodes.indexOf(n); if (i < 0) return;
        if (i < w.nodes.length - 1) out.push({ wi: wi, ids: w.nodes.slice(i) });
        if (i > 0) out.push({ wi: wi, ids: w.nodes.slice(0, i + 1).reverse() });
      });
      return out;
    }
    function extend(sel, atEnd, force) {
      for (var guard = 0; guard < 300; guard++) {
        var seq = atEnd ? sel.nodes : sel.nodes.slice().reverse();
        var n = seq[seq.length - 1], c = candidates(sel, n);
        if (c.length === 0 || (c.length > 1 && !force)) return;
        var pick = c[0];
        if (c.length > 1) {
          var prev = sel.g.coords.get(seq[Math.max(0, seq.length - 2)]), here = sel.g.coords.get(n), b0 = bearing(prev, here), bb = 999;
          c.forEach(function (x) {
            var turn = Math.abs(((bearing(here, sel.g.coords.get(x.ids[1])) - b0 + 540) % 360) - 180);
            if (turn < bb) { bb = turn; pick = x; }
          });
        }
        force = false;
        if (sel.nodes.indexOf(pick.ids[pick.ids.length - 1]) >= 0 && pick.ids.length > 1 && sel.nodes.indexOf(pick.ids[pick.ids.length - 1]) !== sel.nodes.indexOf(n)) { /* chiude un anello: lo si aggiunge e ci si ferma */ }
        var add = pick.ids.slice(1);
        if (atEnd) sel.nodes = sel.nodes.concat(add); else sel.nodes = add.reverse().concat(sel.nodes);
        sel.used.push(pick.wi); sel.parts.push([pick.wi, segLen(sel.g, pick.ids, sel.k)]);
        if (add.length && sel.nodes.filter(function (x) { return x === add[add.length - 1]; }).length > 1) return; // anello chiuso
      }
    }
    function selResult(sel) {
      var pts = sel.nodes.map(function (n) { return sel.g.coords.get(n); });
      var names = new Map(), mtb = {};
      sel.parts.forEach(function (p) {
        var t = sel.g.ways[p[0]].tags;
        if (t.name) names.set(t.name, (names.get(t.name) || 0) + p[1]);
        if (t['mtb:scale'] != null) mtb[t['mtb:scale']] = (mtb[t['mtb:scale']] || 0) + p[1];
      });
      var nm = Array.from(names.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 4).map(function (e) { return [e[0], Math.round(e[1])]; });
      var m = null, bm = 0; Object.keys(mtb).forEach(function (kk) { if (mtb[kk] > bm) { bm = mtb[kk]; m = kk; } });
      var out = simplify(pts, 2);
      return { points: out, snapped: true, lengthM: lengthM(out), names: nm, mtb: m };
    }
    function startPick() {
      stop(); zoning = false; layer.clearLayers(); res = null; sel = null; picking = true;
      ui(tt('Tocca un sentiero sulla mappa'), [[tt('Annulla'), idle, true]]);
    }
    function showSel(fit) {
      res = selResult(sel); layer.clearLayers();
      L.polyline(res.points, { color: '#fff', weight: 10, opacity: .9 }).addTo(layer);
      L.polyline(res.points, { color: '#1E6BFF', weight: 6 }).addTo(layer);
      L.circleMarker(res.points[0], { radius: 7, color: '#fff', fillColor: '#27AE60', fillOpacity: 1, weight: 2 }).addTo(layer);
      L.circleMarker(res.points[res.points.length - 1], { radius: 7, color: '#fff', fillColor: '#E74C3C', fillOpacity: 1, weight: 2 }).addTo(layer);
      if (fit) map.fitBounds(L.latLngBounds(res.points), { padding: [60, 60], maxZoom: 17 });
      var nm = res.names.length ? res.names[0][0] + ' · ' : '';
      ui(nm + Math.round(res.lengthM) + ' m', [
        [tt('◀ Estendi'), function () { extend(sel, false, true); showSel(false); }, true],
        [tt('Estendi ▶'), function () { extend(sel, true, true); showSel(false); }, true],
        [tt('Altro'), startPick, true],
        [tt('Avanti'), function () { var x = res; idle(); onDone(x); }]]);
    }
    async function pickAt(ll) {
      ui(tt('Cerco il sentiero…'), []);
      var data;
      try { data = await overpassPaths([ll.lat - 0.008, ll.lng - 0.011, ll.lat + 0.008, ll.lng + 0.011]); }
      catch (err) { ui(tt('Sentieri OSM non raggiungibili'), [[tt('Riprova'), startPick], [tt('Annulla'), idle, true]]); return; }
      var g = buildIndex(data), wi = nearestWay(g, [ll.lat, ll.lng]);
      if (wi < 0) { ui(tt('Nessun sentiero qui: tocca più vicino'), [[tt('Riprova'), startPick], [tt('Annulla'), idle, true]]); return; }
      sel = newSel(g, wi); extend(sel, true, false); extend(sel, false, false);
      showSel(true);
    }
    map.on('click', function (e) { if (picking && !active) { picking = false; pickAt(e.latlng); } else if (zoning) addZonePoint(e.latlng); else if (poiing) { poiing = false; var pl = e.latlng; idle(); onPoi(pl.lat, pl.lng); } });
    function startPoi() { stop(); picking = false; zoning = false; layer.clearLayers(); res = null; poiing = true; ui(tt('Tocca la mappa dove mettere il punto'), [[tt('Annulla'), idle, true]]); }

    // ── "Disegna zona": poligono solo informativo; i vertici si aggiungono con un tocco ciascuno.
    function drawZone() {
      layer.clearLayers();
      if (zpts.length > 2) L.polygon(zpts, { color: '#6A1B9A', weight: 2, fillColor: '#6A1B9A', fillOpacity: .15 }).addTo(layer);
      else if (zpts.length > 1) L.polyline(zpts, { color: '#6A1B9A', weight: 2, dashArray: '6 4' }).addTo(layer);
      zpts.forEach(function (p, i) { L.circleMarker(p, { radius: i === 0 ? 7 : 5, color: '#fff', weight: 2, fillColor: '#6A1B9A', fillOpacity: 1, interactive: false }).addTo(layer); });
      ui(zpts.length < 3 ? tt('Tocca i vertici della zona') + ' (' + zpts.length + ')' : zpts.length + ' ' + tt('vertici'),
        [[tt('↶ Annulla ultimo'), function () { zpts.pop(); drawZone(); }, true],
         [tt('Fine'), function () { if (zpts.length < 3) return; var z = zpts.slice(); idle(); onZone(z); }],
         [tt('Annulla'), idle, true]]);
    }
    function startZone() { stop(); picking = false; layer.clearLayers(); res = null; zoning = true; zpts = []; drawZone(); }
    function addZonePoint(ll) { zpts.push([ll.lat, ll.lng]); drawZone(); }

    idle();
    return { show: function () { bar.style.display = 'flex'; }, hide: function () { idle(); bar.style.display = 'none'; } };
  }


  /** "Vedi tuo GPX su mappa": disegna sopra la mappa un GPX personale (non viene salvato) e indica quali trail
   * del database ha percorso (copertura del trail entro 30 m dalla traccia). Si mostra/nasconde con la spunta
   * nel pannello o nel selettore dei layer. trails = [{id,name,path:[[lat,lon],...]}]; onOpen(id) apre il trail. */
  function attachMyGpx(map, layersCtl, trails, onOpen, onClear) {
    var group = L.layerGroup(), panel = null, ctl = null, inLayers = false;
    var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

    function distToPoly(p, poly, k) {
      var best = Infinity;
      for (var i = 0; i < poly.length - 1; i++) {
        var ax = (poly[i][1] - p[1]) * k.kx, ay = (poly[i][0] - p[0]) * k.ky, bx = (poly[i + 1][1] - p[1]) * k.kx, by = (poly[i + 1][0] - p[0]) * k.ky;
        var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
        var d = Math.hypot(ax + t * dx, ay + t * dy); if (d < best) best = d;
      }
      return best;
    }
    function matches(mine) {
      var k = K(mine[0][0]), pad = 40;
      var minLa = 90, maxLa = -90, minLo = 180, maxLo = -180;
      mine.forEach(function (p) { minLa = Math.min(minLa, p[0]); maxLa = Math.max(maxLa, p[0]); minLo = Math.min(minLo, p[1]); maxLo = Math.max(maxLo, p[1]); });
      var out = [];
      trails.forEach(function (t) {
        if (!t.path || t.path.length < 2) return;
        var tla = t.path.map(function (p) { return p[0]; }), tlo = t.path.map(function (p) { return p[1]; });
        if (Math.min.apply(null, tla) > maxLa + pad / k.ky || Math.max.apply(null, tla) < minLa - pad / k.ky ||
            Math.min.apply(null, tlo) > maxLo + pad / k.kx || Math.max.apply(null, tlo) < minLo - pad / k.kx) return;
        var samples = densify(t.path, 15, k), near = 0;
        samples.forEach(function (s) { if (distToPoly(s, mine, k) <= 30) near++; });
        var cov = near / samples.length;
        if (cov >= 0.25) out.push({ id: t.id, name: t.name, cov: cov });
      });
      out.sort(function (a, b) { return b.cov - a.cov; });
      return out;
    }
    // Frecce di direzione lungo il tracciato: una ogni ~90 px a schermo, rigenerate a ogni zoom.
    var arrows = L.layerGroup(), arrowPts = null, arrowFn = null;
    function drawArrows() {
      arrows.clearLayers();
      if (!arrowPts || arrowPts.length < 2) return;
      var acc = 70, step = 90;
      for (var i = 1; i < arrowPts.length; i++) {
        var a = map.latLngToContainerPoint(arrowPts[i - 1]), b = map.latLngToContainerPoint(arrowPts[i]);
        var d = a.distanceTo(b); if (d < 0.5) continue;
        acc += d;
        if (acc >= step) {
          acc = 0;
          var ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
          L.marker(arrowPts[i], { interactive: false, keyboard: false, icon: L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9],
            html: '<div style="width:18px;height:18px;transform:rotate(' + ang + 'deg)"><svg viewBox="0 0 18 18" width="18" height="18"><path d="M3 2 L16 9 L3 16 L6.5 9 Z" fill="#fff" stroke="#880E4F" stroke-width="1.5" stroke-linejoin="round"/></svg></div>' }) }).addTo(arrows);
        }
      }
    }
    function clear() {
      if (arrowFn) { map.off('zoomend', arrowFn); arrowFn = null; }
      arrowPts = null; arrows.clearLayers();
      group.clearLayers(); map.removeLayer(group);
      if (inLayers) { try { layersCtl.removeLayer(group); } catch (e) {} inLayers = false; }
      if (ctl) { map.removeControl(ctl); ctl = null; }
    }
    function show(pts, name, nofit) {
      clear();
      if (!pts || pts.length < 2) return;
      L.polyline(pts, { color: '#fff', weight: 9, opacity: .9 }).addTo(group);
      L.polyline(pts, { color: '#C2185B', weight: gpxW() + 1, opacity: .95 }).addTo(group);
      arrows.addTo(group); arrowPts = pts; drawArrows(); arrowFn = drawArrows; map.on('zoomend', arrowFn);
      group.addTo(map); layersCtl.addOverlay(group, tt('GPX')); inLayers = true;
      if (!nofit) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
      var km = lengthM(pts) / 1000, ms = matches(pts);
      ctl = L.control({ position: 'bottomleft' });
      ctl.onAdd = function () {
        var div = L.DomUtil.create('div', 'tt-mygpx');
        // Pillola compatta in basso a sinistra (sopra "Importa GPX"): "GPX · km · N trail" con una X per
        // rimuoverlo; toccando il testo si apre/chiude l'elenco dei trail percorsi. Mostra/nascondi si fa dal
        // selettore dei layer ("GPX").
        div.style.cssText = 'background:rgba(255,255,255,.96);color:#222;border-radius:18px;padding:4px 6px 4px 12px;margin-bottom:62px;max-width:260px;font:13px sans-serif;box-shadow:0 1px 5px rgba(0,0,0,.4)';
        var done = ms.filter(function (m) { return m.cov >= 0.6; });
        var rows = ms.length ? ms.map(function (m) {
          return '<div class="tt-row" data-id="' + esc(m.id) + '" style="padding:5px 0;border-top:1px solid #ddd;cursor:pointer"><b>' + esc(m.name) + '</b> <span style="color:' + (m.cov >= 0.6 ? '#2e7d32' : '#8d6e63') + '">' +
            Math.round(m.cov * 100) + '%' + (m.cov >= 0.6 ? '' : ' (' + tt('in parte') + ')') + '</span></div>';
        }).join('') : '<div style="color:#666;padding:4px 0">' + tt('Nessun trail del database corrisponde.') + '</div>';
        div.innerHTML = '<div style="display:flex;align-items:center;gap:6px"><div class="tt-head" style="flex:1;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
          '<b>' + tt('GPX') + '</b>' + (name ? ' · ' + esc(name) : '') + ' · ' + km.toFixed(1) + ' km · ' + done.length + ' ' + tt('trail') + ' <span class="tt-arrow">▾</span></div>' +
          '<button class="tt-min" aria-label="' + tt('Riduci') + '" style="display:none;width:30px;height:30px;border:0;border-radius:50%;background:#e0e0e0;font:700 16px sans-serif;color:#444">✕</button></div>' +
          '<div class="tt-list" style="display:none;max-height:' + Math.max(100, Math.round(map.getSize().y * 0.35)) + 'px;overflow:auto;margin-top:4px">' + rows + '</div>';
        L.DomEvent.disableClickPropagation(div); L.DomEvent.disableScrollPropagation(div);
        var list = div.querySelector('.tt-list'), minBtn = div.querySelector('.tt-min'), arrow = div.querySelector('.tt-arrow');
        function setOpen(on) { list.style.display = on ? 'block' : 'none'; minBtn.style.display = on ? 'inline-block' : 'none'; arrow.textContent = on ? '▴' : '▾'; }
        div.querySelector('.tt-head').onclick = function () { setOpen(list.style.display === 'none'); };
        minBtn.onclick = function () { setOpen(false); };
        div.querySelectorAll('.tt-row').forEach(function (r) { r.onclick = function () { onOpen(r.getAttribute('data-id')); }; });
        return div;
      };
      ctl.addTo(map);
    }
    // Occhio "G": mostra/nasconde il GPX personale senza eliminarlo (il pannello dati resta).
    function setVisible(on) {
      if (group.getLayers().length === 0) return;
      if (on) group.addTo(map); else map.removeLayer(group);
    }
    return { show: show, clear: clear, setVisible: setVisible };
  }

  /** Selettore dei layer compatto, allineato a destra e con una X per chiuderlo (non copre i pulsanti a sinistra). */
  function decorateLayers(ctl) {
    if (!document.getElementById('tt-lc-style')) {
      var st = document.createElement('style'); st.id = 'tt-lc-style';
      st.textContent = '.leaflet-control-layers{max-width:150px;text-align:left}' +
        '.leaflet-control-layers-expanded{padding:8px 10px 8px 8px;font-size:12.5px;line-height:1.3;max-width:150px}' +
        '.leaflet-control-layers label{margin:3px 0}.tt-lc-close{position:absolute;top:2px;right:4px;width:30px;height:30px;border:0;background:none;font:700 18px sans-serif;color:#555;cursor:pointer;z-index:2}' +
        '.leaflet-control-layers-expanded .leaflet-control-layers-list{padding-top:18px}';
      document.head.appendChild(st);
    }
    var list = ctl.getContainer().querySelector('.leaflet-control-layers-list');
    if (!list || list.querySelector('.tt-lc-close')) return;
    var x = document.createElement('button'); x.className = 'tt-lc-close'; x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', tt('Chiudi'));
    x.onclick = function (e) { e.preventDefault(); e.stopPropagation(); ctl.collapse(); };
    list.appendChild(x);
  }

  /** Ricerca di un luogo (paese, valle, rifugio…) con Nominatim: icona lente sotto il selettore dei layer, il risultato centra la mappa.
   * Rispetta la policy di Nominatim: 1 richiesta/s, solo su invio o dopo una pausa di scrittura, nessun autocompletamento a ogni tasto. */
  function attachSearch(map) {
    if (!document.getElementById('tt-srch-style')) {
      var st = document.createElement('style'); st.id = 'tt-srch-style';
      st.textContent = '.tt-srch{background:#fff;border-radius:4px;box-shadow:0 1px 5px rgba(0,0,0,.45);font:14px sans-serif;color:#222;max-width:230px}' +
        '.tt-srch .tt-sb{display:block;width:44px;height:44px;line-height:44px;text-align:center;font-size:22px;text-decoration:none;color:#333;cursor:pointer}' +
        '.tt-srch .tt-sbox{padding:6px;width:214px}.tt-srch input{width:100%;box-sizing:border-box;font-size:16px;padding:6px 8px;border:1px solid #bbb;border-radius:6px}' +
        '.tt-srch .tt-sl{max-height:220px;overflow:auto;margin-top:4px}.tt-srch .tt-sr{padding:7px 4px;border-top:1px solid #eee;font-size:13px;line-height:1.25;cursor:pointer}' +
        '.tt-srch .tt-sr small{display:block;color:#777}.tt-srch .tt-sx{float:right;border:0;background:none;font:700 16px sans-serif;color:#555;cursor:pointer;padding:0 2px}' +
        '.tt-srch .tt-sm{padding:6px 2px;color:#777;font-size:13px}';
      document.head.appendChild(st);
    }
    var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var pin = null, last = 0, timer = null, seq = 0;
    var ctl = L.control({ position: 'topright' });
    ctl.onAdd = function () {
      var div = L.DomUtil.create('div', 'tt-srch');
      div.innerHTML = '<a class="tt-sb" href="#" role="button" title="' + esc(tt('Cerca luogo')) + '" aria-label="' + esc(tt('Cerca luogo')) + '">🔍</a>' +
        '<div class="tt-sbox" hidden><button class="tt-sx" type="button" aria-label="' + esc(tt('Chiudi')) + '">✕</button><input type="search" enterkeyhint="search" placeholder="' + esc(tt('Cerca un luogo…')) + '"><div class="tt-sl"></div></div>';
      L.DomEvent.disableClickPropagation(div); L.DomEvent.disableScrollPropagation(div);
      var btn = div.querySelector('.tt-sb'), box = div.querySelector('.tt-sbox'), inp = div.querySelector('input'), list = div.querySelector('.tt-sl');
      function openBox(on) { box.hidden = !on; btn.style.display = on ? 'none' : 'block'; if (on) setTimeout(function () { inp.focus(); }, 50); }
      btn.onclick = function (e) { e.preventDefault(); openBox(true); };
      div.querySelector('.tt-sx').onclick = function () { openBox(false); };
      function go(r) {
        if (pin) map.removeLayer(pin);
        var lat = parseFloat(r.lat), lon = parseFloat(r.lon), bb = r.boundingbox;
        pin = L.circleMarker([lat, lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#e53935', fillOpacity: 1, interactive: false }).addTo(map);
        if (bb && bb.length === 4 && (bb[1] - bb[0]) > 0.0005) map.fitBounds([[+bb[0], +bb[2]], [+bb[1], +bb[3]]], { maxZoom: 15 });
        else map.setView([lat, lon], 14);
        openBox(false);
        setTimeout(function () { if (pin) { map.removeLayer(pin); pin = null; } }, 20000);
      }
      function search() {
        var q = inp.value.trim(); if (q.length < 2) return;
        var wait = Math.max(0, 1100 - (Date.now() - last)), my = ++seq;
        list.innerHTML = '<div class="tt-sm">…</div>';
        setTimeout(function () {
          last = Date.now();
          fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=7&addressdetails=0&accept-language=' + ((window.TT_LANG || window.GC_LANG) === 'en' ? 'en' : 'it') + '&q=' + encodeURIComponent(q))
            .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(function (res) {
              
              if (my !== seq) return;
              if (!res.length) { list.innerHTML = '<div class="tt-sm">' + esc(tt('Nessun risultato')) + '</div>'; return; }
              list.innerHTML = res.map(function (r, i) {
                var p = String(r.display_name).split(', ');
                return '<div class="tt-sr" data-i="' + i + '"><b>' + esc(p[0]) + '</b><small>' + esc(p.slice(1, 4).join(', ')) + '</small></div>';
              }).join('');
              [].forEach.call(list.querySelectorAll('.tt-sr'), function (el) { el.onclick = function () { go(res[+el.getAttribute('data-i')]); }; });
            })
            .catch(function (er) { if (my === seq) list.innerHTML = '<div class="tt-sm">' + esc(tt('Ricerca non riuscita')) + '</div>'; });
        }, wait);
      }
      inp.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); search(); } };
      inp.oninput = function () { clearTimeout(timer); timer = setTimeout(search, 900); };
      return div;
    };
    ctl.addTo(map);
    return ctl;
  }

  /** Riproduzione GPX: marker del punto corrente + foto in miniatura (cliccabili) sulla mappa. */
  function attachPlayback(map, onPhoto) {
    if (!document.getElementById('tt-play-style')) {
      var st = document.createElement('style'); st.id = 'tt-play-style';
      st.textContent = '.tt-pm{width:18px;height:18px;border-radius:50%;background:#e53935;border:3px solid #fff;box-shadow:0 0 0 4px rgba(229,57,53,.35)}' +
        '.tt-ph{position:absolute;left:0;top:0;transform:translate(-50%,-50%);width:var(--tt-ph,46px);height:var(--tt-ph,46px);object-fit:cover;border:2px solid #fff;border-radius:8px;box-shadow:0 1px 5px rgba(0,0,0,.6);background:#ddd;display:block}' +
        '.tt-ph.est{opacity:.8;border-style:dashed}';
      document.head.appendChild(st);
    }
    var marker = null, group = L.layerGroup().addTo(map), base = null, done = null, tpts = null;
    // Tracciato sotto in grigio; la parte già percorsa si colora (k = indice dell'ultimo punto passato in tpts).
    function setTrack(p) {
      if (base) { map.removeLayer(base); map.removeLayer(done); }
      tpts = p;
      base = L.polyline(p, { color: '#9E9E9E', weight: gpxW() + 1, opacity: 1, interactive: false }).addTo(map);
      done = L.polyline([], { color: '#FF6D00', weight: gpxW() + 1, opacity: 1, interactive: false }).addTo(map);
    }
    function setPos(lat, lon, follow, k) {
      if (done && tpts && k != null) done.setLatLngs(tpts.slice(0, k + 1).concat([[lat, lon]]));
      if (!marker) marker = L.marker([lat, lon], { icon: L.divIcon({ className: '', html: '<div class="tt-pm"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false, zIndexOffset: 3000 }).addTo(map);
      else marker.setLatLng([lat, lon]);
      if (follow !== false && !map.getBounds().pad(-0.2).contains([lat, lon])) map.panTo([lat, lon], { animate: false });
    }
    // Le miniature crescono con lo zoom (circa 22 px a zoom 11, 110 px a zoom 19).
    function sizePhotos() { var z = map.getZoom(); map.getContainer().style.setProperty('--tt-ph', Math.max(22, Math.min(110, 22 + (z - 11) * 11)) + 'px'); }
    map.on('zoomend', sizePhotos); sizePhotos();
    function setPhotosVisible(on) { if (on) { if (!map.hasLayer(group)) group.addTo(map); } else if (map.hasLayer(group)) map.removeLayer(group); }
    function clear() { if (marker) { map.removeLayer(marker); marker = null; } if (base) { map.removeLayer(base); map.removeLayer(done); base = done = tpts = null; } }
    function setPhotos(list) {
      group.clearLayers();
      (list || []).forEach(function (p) {
        var m = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', html: '<img class="tt-ph' + (p.est ? ' est' : '') + '" src="' + p.img + '">', iconSize: [0, 0], iconAnchor: [0, 0] }), zIndexOffset: 2000 });
        m.on('click', function () { onPhoto(p.id); });
        m.addTo(group);
      });
    }
    return { setPos: setPos, setTrack: setTrack, clear: clear, setPhotos: setPhotos, setPhotosVisible: setPhotosVisible };
  }

  /** Zone disegnate (poligoni solo informativi): contorno tratteggiato, riempimento leggero e nome al centro.
   * zones = [{id, zone, pts}]; hooks.onZoneTap(id) viene chiamato solo in modalità modifica (setEdit(true)). */
  function attachZones(map, layersCtl, hooks) {
    if (!document.getElementById('tt-zone-style')) {
      var st = document.createElement('style'); st.id = 'tt-zone-style';
      st.textContent = '.tt-zone-lbl{font:700 12px sans-serif;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff;white-space:nowrap;transform:translate(-50%,-50%);cursor:pointer}' +
        '.tt-bld{display:flex;gap:6px;justify-content:center;align-items:flex-start;transform-origin:50% 0}.tt-bld .b{width:84px;text-align:center;cursor:pointer}.tt-bld img{width:36px;height:36px;border-radius:50%;object-fit:cover;background:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)}.tt-bld .n{display:block;margin-top:1px;font:700 11px/1.15 sans-serif;color:#222;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff;white-space:normal;word-break:break-word}.tt-light{filter:grayscale(1) contrast(.8) brightness(1.18)}';
      document.head.appendChild(st);
    }
    var group = L.layerGroup().addTo(map), bgroup = L.layerGroup().addTo(map), edit = false;
    var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    function colorOf(name) { var h = 0; for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360; return 'hsl(' + h + ',65%,38%)'; }
    var current = [];
    function set(zones) {
      current = zones || [];
      group.clearLayers(); bgroup.clearLayers(); fits = [];
      (zones || []).forEach(function (z) {
        var c = colorOf(z.zone), center = null;
        if (z.pts && z.pts.length >= 3) {
          // Il poligono non è interattivo (non deve coprire i trail sotto di lui); in modifica si tocca l'etichetta.
          var poly = L.polygon(z.pts, { color: c, weight: 2, dashArray: '6 4', fillColor: c, fillOpacity: (window.TT_ZONE_OP != null ? window.TT_ZONE_OP : 22) / 100, interactive: false }).addTo(group);
          center = poly.getBounds().getCenter();
          L.marker(center, { interactive: true, keyboard: false,
            icon: L.divIcon({ className: '', html: '<div class="tt-zone-lbl" style="color:' + c + '">' + esc(z.zone) + '</div>', iconSize: null }) })
            .on('click', function () { if (edit && !window.TrailTrace.busy && hooks && hooks.onZoneTap) hooks.onZoneTap(z.id); })
            .on('contextmenu', function () { if (edit && !window.TrailTrace.busy && hooks && hooks.onZoneTap) hooks.onZoneTap(z.id); }).addTo(group);
        } else if (z.center) center = L.latLng(z.center[0], z.center[1]);
        // Loghi dei costruttori dei trail della zona (visibili finché la zona è attiva): un tocco apre nome e link social.
        var bl = (z.builders || []).filter(function (b) { return b && b.logo; });
        if (bl.length && center) {
          var html = '<div class="tt-bld">' + bl.map(function (b, i) { return '<div class="b" data-i="' + i + '"><img data-i="' + i + '" alt="" src="' + esc(/^(https?:\/\/|data:image\/)/i.test(String(b.logo)) ? b.logo : '') + '"><span class="n" data-i="' + i + '">' + esc(b.name || '') + '</span></div>'; }).join('') + '</div>';
          var mk = L.marker(center, { interactive: true, keyboard: false, zIndexOffset: 400,
            icon: L.divIcon({ className: '', html: html, iconSize: [bl.length * 90, 70], iconAnchor: [bl.length * 45, z.pts && z.pts.length >= 3 ? -8 : 35] }) })
            .on('click', function (e) {
              if (window.TrailTrace.busy) return;
              var t = e.originalEvent && e.originalEvent.target, i = t && t.closest ? parseInt((t.closest('[data-i]') || {dataset:{}}).dataset.i, 10) : NaN;
              var b = bl[isNaN(i) ? 0 : i]; if (!b) return;
              var el = document.createElement('div'); el.style.cssText = 'font:600 13px sans-serif;color:#222;text-align:center;min-width:140px';
              var h = document.createElement('div'); h.textContent = b.name || 'Trail builder'; el.appendChild(h);
              var sub = document.createElement('div'); sub.textContent = tt('Zona') + ' ' + z.zone; sub.style.cssText = 'font-weight:400;color:#666;font-size:12px'; el.appendChild(sub);
              if (b.url && /^https?:\/\//i.test(String(b.url).trim())) {
                var a = document.createElement('button'); a.textContent = tt('Apri link ›'); a.style.cssText = 'margin-top:6px;border:0;border-radius:8px;padding:6px 12px;font:700 12px sans-serif;background:#FC5200;color:#fff;cursor:pointer';
                a.onclick = function () { map.closePopup(); if (hooks && hooks.onOpenUrl) hooks.onOpenUrl(b.url); else window.open(b.url, '_blank', 'noopener'); };
                el.appendChild(a);
              }
              L.popup({ autoPan: false, offset: [0, -6] }).setLatLng(e.latlng).setContent(el).openOn(map);
            }).addTo(bgroup);
          // Con poco zoom il poligono si rimpicciolisce: i loghi scalano per restare dentro l'area, e spariscono se non ci stanno.
          if (z.pts && z.pts.length >= 3) { var bm = bm0(poly, bl.length, mk); fits.push(bm); }
        }
      });
      refit();
    }
    var fits = [];
    function bm0(poly, n, mk) { return { poly: poly, n: n, mk: mk }; }
    function refit() {
      fits.forEach(function (f) {
        var el = f.mk.getElement(); if (!el) return;
        var b = f.poly.getBounds(), p1 = map.latLngToContainerPoint(b.getNorthWest()), p2 = map.latLngToContainerPoint(b.getSouthEast());
        var k = Math.min(1, (p2.x - p1.x) / (f.n * 90 + 20), (p2.y - p1.y) / 150);
        var inner = el.firstChild; if (!inner) return;
        inner.style.transformOrigin = '50% 0'; inner.style.transform = 'scale(' + Math.max(k, .45) + ')';
      });
    }
    map.on('zoomend moveend', refit);
    return { set: set, get: function (id) { return current.filter(function (z) { return z.id === id; })[0]; }, setEdit: function (on) { edit = !!on; }, setVisible: function (on) { if (on) group.addTo(map); else map.removeLayer(group); }, setBuildersVisible: function (on) { if (on) { bgroup.addTo(map); refit(); } else map.removeLayer(bgroup); } };
  }


  /** Punti di interesse (POI): nome + descrizione + tipo, sulla mappa Leaflet. Un tocco apre il fumetto; in modalità
   * modifica il fumetto ha Modifica/Elimina (hooks.onEdit(id), hooks.onDelete(id)). set([{id,name,desc,type,lat,lon}]). */
  var POI_TYPES = { ritrovo: { e: '🚩', c: '#8E24AA', l: 'Punto di ritrovo', svg: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M6 3v18" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M7 4h12l-3.5 4.2L19 12.4H7z" fill="#fff"/></svg>' }, vetta: { e: '⛰️', c: '#6D4C41', l: 'Vetta' }, picnic: { e: '🧺', c: '#2E7D32', l: 'Area picnic' }, altro: { e: '⭐', c: '#F9A825', l: 'Altro punto' } };
  function poiType(t) { return POI_TYPES[t] || POI_TYPES.altro; }
  function attachPois(map, hooks) {
    if (!document.getElementById('tt-poi-style')) {
      var st = document.createElement('style'); st.id = 'tt-poi-style';
      st.textContent = '.tt-poi{width:22px;height:22px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-size:12px;line-height:1;position:relative}' +
        '.tt-poi-n{position:absolute;left:50%;top:24px;transform:translateX(-50%);font:700 10px sans-serif;color:#222;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff;white-space:nowrap;pointer-events:none}' +
        '.tt-poi-hide .tt-poi-n{display:none}';
      document.head.appendChild(st);
    }
    var group = L.layerGroup().addTo(map), edit = false, current = [];
    function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function labels() { map.getContainer().classList.toggle('tt-poi-hide', map.getZoom() < 13); }
    map.on('zoomend', labels); labels();
    function open(p, ll) {
      var ty = poiType(p.type), el = document.createElement('div'); el.style.cssText = 'font:600 13px sans-serif;color:#222;min-width:150px;max-width:240px';
      var h = document.createElement('div'); h.textContent = ty.e + ' ' + p.name; h.style.cssText = 'font-size:14px;font-weight:700'; el.appendChild(h);
      var sub = document.createElement('div'); sub.textContent = tt(ty.l); sub.style.cssText = 'font-weight:400;color:#666;font-size:12px'; el.appendChild(sub);
      if (p.by || p.upd) { var cr = document.createElement('div'); cr.textContent = [p.by ? tt('Aggiunto da') + ' ' + p.by : '', p.upd ? tt('modificato da') + ' ' + p.upd : ''].filter(Boolean).join(' · '); cr.style.cssText = 'font-weight:400;color:#888;font-size:11px;margin-top:2px'; el.appendChild(cr); }
      if (p.desc) { var d = document.createElement('div'); d.textContent = p.desc; d.style.cssText = 'font-weight:400;margin-top:6px;white-space:pre-wrap'; el.appendChild(d); }
      if (hooks) {
        var row = document.createElement('div'); row.style.cssText = 'margin-top:8px;display:flex;gap:6px;flex-wrap:wrap';
        var btns = [];
        if (hooks.onNavigate) btns.push([tt('🧭 Naviga'), '#1976D2', hooks.onNavigate]);
        if (edit) btns.push([tt('Modifica'), '#FC5200', hooks.onEdit], [tt('Elimina'), '#c62828', hooks.onDelete]);
        btns.forEach(function (b) {
          var x = document.createElement('button'); x.textContent = b[0]; x.style.cssText = 'border:0;border-radius:8px;padding:6px 12px;font:700 12px sans-serif;background:' + b[1] + ';color:#fff;cursor:pointer';
          x.onclick = function () { map.closePopup(); if (b[2]) b[2](p.id); }; row.appendChild(x);
        });
        el.appendChild(row);
      }
      var tb = document.getElementById('tbar'), pop = L.popup({ autoPan: true, offset: [0, -14] }).setLatLng(ll).setContent(el);
      if (tb) { tb.style.visibility = 'hidden'; pop.on('remove', function () { if (!window.TrailTrace.busy) tb.style.visibility = ''; }); }  // la barra non deve coprire il fumetto
      pop.openOn(map);
    }
    function set(list) {
      current = list || []; group.clearLayers();
      current.forEach(function (p) {
        var ty = poiType(p.type);
        L.marker([p.lat, p.lon], { keyboard: false, zIndexOffset: 500,
          icon: L.divIcon({ className: '', html: '<div class="tt-poi" style="background:' + ty.c + '">' + (ty.svg || ty.e) + '<span class="tt-poi-n">' + esc(p.name) + '</span></div>', iconSize: [22, 22], iconAnchor: [11, 11] }) })
          .on('click', function (e) { if (window.TrailTrace.busy) return; open(p, e.latlng); }).addTo(group);
      });
    }
    return { set: set, get: function (id) { return current.filter(function (p) { return p.id === id; })[0]; }, setEdit: function (on) { edit = !!on; }, setVisible: function (on) { if (on) group.addTo(map); else map.removeLayer(group); } };
  }


  /** Modifica del tracciato di un trail: tenendo premuto (o clic destro) sul tracciato compare un menu
   * MODIFICA / CANCELLA. MODIFICA = editor dei vertici (trascina i punti, tocca ◦ per aggiungerne uno, tieni
   * premuto un punto per toglierlo); CANCELLA = rimuove il tracciato dalla mappa (il trail resta in elenco).
   * hooks.onSave(id, pts) e hooks.onDelete(id) fanno il salvataggio vero (app/sito). */
  function attachEdit(map, hooks) {
    var enabled = false, layer = L.layerGroup().addTo(map), menu = null, editing = null;
    var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    function box(html) {
      var d = document.createElement('div');
      d.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:76px;z-index:' + (window.TrailTrace.editZ || 1300) + ';background:rgba(255,255,255,.97);color:#222;border-radius:14px;padding:10px 12px;box-shadow:0 2px 10px rgba(0,0,0,.45);font:600 14px sans-serif;max-width:calc(100vw - 24px);text-align:center';
      d.innerHTML = html; document.body.appendChild(d);
      d.querySelectorAll('button').forEach(function (b) { b.style.cssText = 'border:0;border-radius:10px;padding:9px 14px;margin:4px 3px 0;font:700 14px sans-serif;background:#FC5200;color:#fff;cursor:pointer'; if (b.dataset.sec) { b.style.background = '#e0e0e0'; b.style.color = '#222'; } if (b.dataset.danger) b.style.background = '#c62828'; });
      return d;
    }
    function closeMenu() { if (menu) { menu.remove(); menu = null; } }
    function openMenu(t) {
      if (!enabled || editing || window.TrailTrace.busy) return;
      closeMenu();
      var isZone = t.kind === 'zone';
      menu = box('<div style="margin-bottom:6px">' + (isZone ? tt('Zona') + ' ' : '') + esc(t.name) + '</div><button data-act="edit">' + tt('✎ Modifica') + '</button><button data-act="del" data-danger="1">' + tt('🗑 Cancella') + '</button><button data-act="no" data-sec="1">' + tt('Annulla') + '</button>');
      if (isZone && hooks.onBuilders) {
        var bb = document.createElement('button'); bb.dataset.act = 'bld'; bb.textContent = tt('🏷 Costruttori');
        bb.style.cssText = 'border:0;border-radius:10px;padding:9px 14px;margin:4px 3px 0;font:700 14px sans-serif;background:#6A1B9A;color:#fff;cursor:pointer';
        menu.insertBefore(bb, menu.querySelector('[data-act=no]'));
        bb.onclick = function () { closeMenu(); hooks.onBuilders(t.id); };
      }
      menu.querySelector('[data-act=no]').onclick = closeMenu;
      menu.querySelector('[data-act=edit]').onclick = function () { closeMenu(); startEdit(t); };
      menu.querySelector('[data-act=del]').onclick = function () {
        menu.innerHTML = '<div style="margin-bottom:6px">' + (isZone ? tt('Eliminare il perimetro della zona') + ' «' + esc(t.name) + '»?<br><span style="font-weight:400;color:#555">' + tt('I trail della zona non vengono toccati.') + '</span>' : tt('Rimuovere il tracciato di') + ' «' + esc(t.name) + '» ' + tt('dalla mappa?') + '<br><span style="font-weight:400;color:#555">' + tt("Il trail resta nell'elenco.") + '</span>') + '</div><button data-act="yes" data-danger="1">' + tt('Sì, cancella') + '</button><button data-act="no" data-sec="1">' + tt('No') + '</button>';
        menu.querySelectorAll('button').forEach(function (b) { b.style.cssText = 'border:0;border-radius:10px;padding:9px 14px;margin:4px 3px 0;font:700 14px sans-serif;background:' + (b.dataset.danger ? '#c62828' : '#e0e0e0') + ';color:' + (b.dataset.danger ? '#fff' : '#222') + ';cursor:pointer'; });
        menu.querySelector('[data-act=no]').onclick = closeMenu;
        menu.querySelector('[data-act=yes]').onclick = function () { closeMenu(); hooks.onDelete(t.id, t.kind || 'trail'); };
      };
    }
    function startEdit(t) {
      closeMenu();
      var pts = t.path.map(function (p) { return [p[0], p[1]]; });
      var closed = t.kind === 'zone', minPts = closed ? 3 : 2;
      if (!closed && pts.length > 250) pts = simplify(pts, 4, 250);  // troppi punti da trascinare: si lavora su una versione semplificata
      editing = { t: t, pts: pts }; window.TrailTrace.busy = true;
      var tb = document.getElementById('tbar'); if (tb) tb.style.visibility = 'hidden';
      var bar = box('<div id="ed-msg" style="margin-bottom:4px">' + (t.kind === 'zone' ? tt('Modifica la zona') + ' «' : tt('Modifica') + ' «') + esc(t.name) + '»</div><div style="font-weight:400;color:#555;font-size:12px;max-width:290px">' + tt('Trascina i punti · tocca ◦ per aggiungerne uno · tieni premuto un punto per toglierlo') + '</div><button data-act="save">' + tt('Salva') + '</button><button data-act="no" data-sec="1">' + tt('Annulla') + '</button>');
      var line = null, dots = [], mids = [];
      function stopEdit() { layer.clearLayers(); bar.remove(); editing = null; window.TrailTrace.busy = false; if (tb) tb.style.visibility = ''; }
      function redraw() {
        layer.clearLayers(); dots = []; mids = [];
        line = (closed ? L.polygon(editing.pts, { color: '#1E6BFF', weight: 4, fillColor: '#1E6BFF', fillOpacity: .12 }) : L.polyline(editing.pts, { color: '#1E6BFF', weight: 5 })).addTo(layer);
        function mk(cls, size) { return L.divIcon({ className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2], html: '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;' + cls + '"></div>' }); }
        editing.pts.forEach(function (p, i) {
          var m = L.marker(p, { draggable: true, icon: mk('background:#fff;border:3px solid #1E6BFF;box-sizing:border-box', 18), zIndexOffset: 500 }).addTo(layer);
          m.on('drag', function (e) { editing.pts[i] = [e.latlng.lat, e.latlng.lng]; line.setLatLngs(editing.pts); });
          m.on('dragend', redraw);
          m.on('contextmenu', function () { if (editing.pts.length > minPts) { editing.pts.splice(i, 1); redraw(); } });
          dots.push(m);
          if (closed || i < editing.pts.length - 1) {
            var q = editing.pts[(i + 1) % editing.pts.length], mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
            var mm = L.marker(mid, { icon: mk('background:rgba(255,255,255,.85);border:2px solid #1E6BFF;box-sizing:border-box', 12) }).addTo(layer);
            mm.on('click', function () { editing.pts.splice(i + 1, 0, mid); redraw(); });
            mids.push(mm);
          }
        });
      }
      redraw();
      map.fitBounds(L.latLngBounds(editing.pts), { padding: [60, 60], maxZoom: 18 });
      bar.querySelector('[data-act=no]').onclick = stopEdit;
      bar.querySelector('[data-act=save]').onclick = function () { var out = editing.pts.slice(), id = t.id; stopEdit(); hooks.onSave(id, out, t.kind || 'trail'); };
    }
    return { openMenu: openMenu, setEnabled: function (on) { enabled = !!on; if (!on) closeMenu(); } };
  }

  /** Tocco su un trail: in sola lettura mostra un fumetto con nome e km anche se i nomi sono spenti ("Dettagli"
   * apre la scheda; un secondo tocco sullo stesso trail lo chiude); in modalità modifica apre direttamente la
   * scheda. t = {id, name, path:[[lat,lon],...]|null}. */
  var tapState = { id: null, pop: null };
  function tapTrail(map, t, ll, open) {
    if (window.TrailTrace.busy) return;
    if (window.TrailTrace.editOn) { open(); return; }
    // Leaflet chiude il fumetto già all'inizio del tocco (evento "preclick"): un secondo tocco sullo stesso trail,
    // arrivato subito dopo quella chiusura, vuol dire "fai sparire il nome", quindi non si riapre.
    if (tapState.map !== map) { tapState.map = map; tapState.closedAt = 0; map.on('popupclose', function (e) { if (tapState.pop === e.popup) tapState.closedAt = Date.now(); }); }
    if (tapState.id === t.id && (Date.now() - tapState.closedAt < 400 || (tapState.pop && map.hasLayer(tapState.pop)))) {
      if (tapState.pop && map.hasLayer(tapState.pop)) map.closePopup(tapState.pop);
      tapState.id = null; return;
    }
    var km = t.path && t.path.length > 1 ? lengthM(t.path) / 1000 : 0;
    var el = document.createElement('div'); el.style.cssText = 'font:600 13px sans-serif;color:#222;text-align:center;min-width:120px';
    var h = document.createElement('div'); h.textContent = t.name + (km > 0 ? ' · ' + km.toFixed(1).replace('.', ',') + ' km' : ''); el.appendChild(h);
    var b = document.createElement('button'); b.textContent = tt('Dettagli ›'); b.style.cssText = 'margin-top:6px;border:0;border-radius:8px;padding:6px 12px;font:700 12px sans-serif;background:#FC5200;color:#fff;cursor:pointer';
    b.onclick = function () { map.closePopup(); open(); }; el.appendChild(b);
    var pop = L.popup({ autoPan: false, closeButton: true, offset: [0, -4] }).setLatLng(ll).setContent(el).openOn(map);
    tapState.id = t.id; tapState.pop = pop;
  }

  window.TrailTrace = { t: tt, tapTrail: tapTrail, editOn: false, attachEdit: attachEdit, busy: false, attachZones: attachZones, attachPois: attachPois, POI_TYPES: POI_TYPES, decorateLayers: decorateLayers, attachSearch: attachSearch, attachPlayback: attachPlayback, attachMyGpx: attachMyGpx, snap: snap, simplify: simplify, lengthM: lengthM, attachUi: attachUi };
})();
