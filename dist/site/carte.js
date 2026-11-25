/* Cartes : fond OpenStreetMap (Protomaps, servi par le site lui-même) habillé façon
   Apple Plans, + tracés et étapes du voyage. Utilisé par l'appli et par le rendu du PDF.
   Dépendances globales : maplibregl, pmtiles, basemaps (vendor/). */
(function () {
  "use strict";
  const abs = p => new URL(p, document.baseURI).href;

  let protocoleOk = false;
  function protocole() {
    if (protocoleOk) return;
    const pr = new pmtiles.Protocol();
    // Les tuiles détaillées n'existent que dans les zones du voyage : une tuile absente
    // est signalée comme erreur, ce qui fait afficher la tuile parente (moins détaillée)
    // au lieu d'un trou blanc.
    maplibregl.addProtocol("pmtiles", async (params, abort) => {
      const r = await pr.tile(params, abort);
      if (params.type !== "json" && (!r || !r.data || r.data.byteLength === 0)) throw new Error("tuile hors zone");
      return r;
    });
    protocoleOk = true;
  }

  // Palettes inspirées d'Apple Plans (clair / sombre)
  const PALETTES = {
    clair: {
      background: "#f6f4f0", earth: "#f6f4f0", water: "#9fd3f8", park_a: "#c9e8b5", park_b: "#b5df9b",
      wood_a: "#cbe7b9", wood_b: "#b5df9b", scrub_a: "#d6ebc6", scrub_b: "#c9e5b6", hospital: "#f6e3e3",
      school: "#efe9dd", industrial: "#eceae5", pedestrian: "#f1eee8", sand: "#f2ead3", beach: "#f2ead3",
      zoo: "#d5ecc3", aerodrome: "#eceae5", runway: "#e3e1dc", pier: "#eae7e1", buildings: "#e9e5df",
      glacier: "#ffffff", military: "#ecebe8",
      other: "#ffffff", minor_service: "#ffffff", minor_a: "#ffffff", minor_b: "#ffffff", link: "#ffffff",
      major: "#ffffff", highway: "#ffd98a",
      minor_service_casing: "#e2ded7", minor_casing: "#e2ded7", link_casing: "#e2ded7",
      major_casing_late: "#ddd8cf", major_casing_early: "#ddd8cf", highway_casing_late: "#e7b75c", highway_casing_early: "#e7b75c",
      railway: "#c9c5be", boundaries: "#bdb8b0",
      roads_label_minor: "#7b7a7f", roads_label_minor_halo: "#ffffff", roads_label_major: "#5d5c61", roads_label_major_halo: "#ffffff",
      ocean_label: "#5f8fc4", subplace_label: "#86858b", subplace_label_halo: "#f6f4f0", city_label: "#3a3a3c", city_label_halo: "#f6f4f0",
      state_label: "#a8a8ad", state_label_halo: "#f6f4f0", country_label: "#8e8e93", address_label: "#a3a2a6", address_label_halo: "#ffffff",
    },
    sombre: {
      background: "#1c1c1e", earth: "#1f2022", water: "#0f2a44", park_a: "#1d3326", park_b: "#21402c",
      wood_a: "#1d3326", wood_b: "#21402c", scrub_a: "#22302a", scrub_b: "#223a2c", hospital: "#2e2526",
      school: "#2a2824", industrial: "#262628", pedestrian: "#28282b", sand: "#2e2b22", beach: "#2e2b22",
      zoo: "#203527", aerodrome: "#262628", runway: "#323236", pier: "#2a2a2d", buildings: "#2b2c30",
      glacier: "#2c2c2e", military: "#262628",
      other: "#3a3a3e", minor_service: "#38383c", minor_a: "#3f3f44", minor_b: "#3f3f44", link: "#4a4a50",
      major: "#505056", highway: "#7a6533",
      minor_service_casing: "#1f2022", minor_casing: "#1f2022", link_casing: "#1f2022",
      major_casing_late: "#1f2022", major_casing_early: "#1f2022", highway_casing_late: "#1f2022", highway_casing_early: "#1f2022",
      railway: "#4a4a4f", boundaries: "#5a5a60",
      roads_label_minor: "#9a9aa0", roads_label_minor_halo: "#1f2022", roads_label_major: "#c2c2c7", roads_label_major_halo: "#1f2022",
      ocean_label: "#6f9bd1", subplace_label: "#8e8e93", subplace_label_halo: "#1f2022", city_label: "#e5e5ea", city_label_halo: "#1f2022",
      state_label: "#6e6e73", state_label_halo: "#1f2022", country_label: "#8e8e93", address_label: "#7d7d82", address_label_halo: "#1f2022",
    },
  };

  function style(theme) {
    protocole();
    const base = basemaps.namedFlavor(theme === "sombre" ? "dark" : "light");
    const flavor = Object.assign({}, base, PALETTES[theme]);
    return {
      version: 8,
      glyphs: abs("vendor/glyphs/") + "{fontstack}/{range}.pbf",
      sprite: abs(theme === "sombre" ? "vendor/sprites/dark" : "vendor/sprites/light"),
      sources: {
        protomaps: {
          type: "vector", url: "pmtiles://" + abs("tiles/nyc.pmtiles"),
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Protomaps',
        },
      },
      layers: epurer(basemaps.layers("protomaps", flavor, { lang: "fr" })),
    };
  }

  // Comme Apple Plans : peu de points d'intérêt avant le zoom de rue (musées, parcs,
  // gares, théâtres, monuments), tous au-delà. Pas de numéros d'immeubles.
  const POI_UTILES = ["station", "museum", "attraction", "theatre", "stadium", "zoo", "aquarium", "park", "national_park",
    "landmark", "monument", "memorial", "place_of_worship", "library", "garden", "ferry_terminal", "marina", "artwork", "viewpoint"];
  function epurer(layers) {
    return layers.filter(l => l.id !== "address_label").map(l => {
      if (l.id !== "pois") return l;
      const filtre = ["any", [">=", ["zoom"], 16.5], ["in", ["get", "kind"], ["literal", POI_UTILES]]];
      return { ...l, filter: l.filter ? ["all", l.filter, filtre] : filtre };
    });
  }

  // ---------------------------------------------------------------- tracés et étapes
  function couches(map, theme) {
    if (!map.getSource("voyage")) map.addSource("voyage", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    const casing = theme === "sombre" ? "#000000" : "#ffffff";
    const add = l => { if (!map.getLayer(l.id)) map.addLayer(l); };
    add({ id: "v-balade-casing", type: "line", source: "voyage", filter: ["==", ["get", "mode"], "balade"],
      layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": casing, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 4, 16, 10] } });
    add({ id: "v-balade", type: "line", source: "voyage", filter: ["==", ["get", "mode"], "balade"],
      layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "couleur"], "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2.5, 16, 6], "line-opacity": ["get", "opacite"] } });
    add({ id: "v-metro-casing", type: "line", source: "voyage", filter: ["in", ["get", "mode"], ["literal", ["metro", "train"]]],
      layout: { "line-cap": "round" }, paint: { "line-color": casing, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 16, 9], "line-opacity": ["get", "opacite"] } });
    add({ id: "v-metro", type: "line", source: "voyage", filter: ["in", ["get", "mode"], ["literal", ["metro", "train"]]],
      layout: { "line-cap": "round" }, paint: { "line-color": ["get", "couleur"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 16, 6], "line-opacity": ["get", "opacite"] } });
    add({ id: "v-ferry", type: "line", source: "voyage", filter: ["==", ["get", "mode"], "ferry"],
      paint: { "line-color": "#0a84ff", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 16, 5], "line-dasharray": [2, 1.5], "line-opacity": ["get", "opacite"] } });
    add({ id: "v-taxi", type: "line", source: "voyage", filter: ["==", ["get", "mode"], "taxi"],
      layout: { "line-cap": "round" }, paint: { "line-color": "#f5b400", "line-width": 3, "line-dasharray": [0.1, 2], "line-opacity": ["get", "opacite"] } });
    add({ id: "v-marche", type: "line", source: "voyage", filter: ["==", ["get", "mode"], "marche"],
      layout: { "line-cap": "round" }, paint: { "line-color": theme === "sombre" ? "#d1d1d6" : "#636366", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2, 16, 4.5], "line-dasharray": [0.1, 1.8], "line-opacity": ["get", "opacite"] } });
  }

  // features : liste GeoJSON (build.py → data.json, par jour). jourActif : iso ou null (tous)
  function tracer(map, features, jourActif) {
    const fc = { type: "FeatureCollection", features: features.map(f => ({ ...f, properties: { ...f.properties, opacite: !jourActif || f.properties.jour === jourActif ? 0.95 : 0.12 } })) };
    const src = map.getSource("voyage");
    if (src) src.setData(fc);
  }

  function pastille(n, couleur, classe) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "pin " + (classe || "");
    el.style.setProperty("--c", couleur);
    el.setAttribute("aria-label", "Étape " + n);
    el.textContent = n;
    return el;
  }

  function creer(conteneur, opts) {
    const map = new maplibregl.Map({
      container: conteneur, style: style(opts.theme), attributionControl: { compact: true },
      bounds: opts.bounds, fitBoundsOptions: { padding: opts.padding || 48 }, maxZoom: 18.5, minZoom: 9,
      cooperativeGestures: !!opts.cooperatif, dragRotate: false, pitchWithRotate: false, touchPitch: false,
      preserveDrawingBuffer: !!opts.impression, fadeDuration: opts.impression ? 0 : 300,
      locale: { "CooperativeGesturesHandler.WindowsHelpText": "Ctrl + molette pour zoomer", "CooperativeGesturesHandler.MacHelpText": "⌘ + molette pour zoomer", "CooperativeGesturesHandler.MobileHelpText": "Deux doigts pour déplacer la carte" },
    });
    map.touchZoomRotate.disableRotation();
    map.on("load", () => { couches(map, opts.theme); if (opts.features) tracer(map, opts.features, opts.jour || null); if (opts.onload) opts.onload(map); });
    return map;
  }

  // Pastilles au même endroit (≤ 45 m, ex. musée puis déjeuner à côté) : on les écarte
  // côte à côte de quelques pixels, pour qu'elles restent toutes visibles à tout zoom.
  // points : [{lat, lon}] (hôtel compris) → décalages en pixels [[dx, dy], …]
  function decalages(points, ecart) {
    ecart = ecart || 30;
    const groupes = [];
    points.forEach((p, i) => {
      const g = groupes.find(g => Math.hypot((g.lat - p.lat) * 111000, (g.lon - p.lon) * 84000) < 45);
      if (g) g.idx.push(i); else groupes.push({ lat: p.lat, lon: p.lon, idx: [i] });
    });
    const out = points.map(() => [0, 0]);
    for (const g of groupes) {
      const n = g.idx.length;
      if (n < 2) continue;
      g.idx.forEach((i, k) => {
        if (n <= 3) out[i] = [Math.round((k - (n - 1) / 2) * ecart), 0];
        else { const a = (2 * Math.PI * k) / n - Math.PI / 2, r = ecart * 0.75 * n / Math.PI; out[i] = [Math.round(r * Math.cos(a)), Math.round(r * Math.sin(a))]; }
      });
    }
    return out;
  }

  // Regroupement selon le zoom (façon Plans) : les pastilles qui se chevauchent À L'ÉCRAN
  // fusionnent en une seule pastille « 4–5 » (même jour) ou « 3 » multicolore (plusieurs jours) ;
  // on touche → la carte zoome dessus et elles se séparent. Au zoom de rue (≥ 15), celles qui
  // se touchent encore (même adresse) se mettent côte à côte au lieu de fusionner.
  // liste : [{lat, lon, marker, hotel?, e?, j?, estompe?}] ; l'hôtel n'est jamais regroupé.
  function repartir(map, liste, ecart) {
    ecart = ecart || 30;
    let bulles = [], prevu = 0;
    const etiquette = membres => {
      const jours = [...new Set(membres.map(x => x.j.iso))];
      if (jours.length > 1) return String(membres.length);
      const n = membres.map(x => +x.e.n).sort((a, b) => a - b);
      const suite = n.every((v, i) => !i || v === n[i - 1] + 1);
      return suite ? (n.length > 2 ? `${n[0]}–${n[n.length - 1]}` : n.join("·")) : n.join("·");
    };
    const bulle = (g, membres) => {
      const couleurs = [...new Set(membres.map(x => x.j.couleur))];
      const el = document.createElement("button");
      el.type = "button";
      el.className = "pin groupe" + (membres[0].estompe ? " estompe" : "");
      if (couleurs.length > 1) {
        const pas = 360 / couleurs.length;
        el.classList.add("mixte");
        el.style.background = `linear-gradient(var(--fond-pin), var(--fond-pin)) padding-box, conic-gradient(${couleurs.map((c, i) => `${c} ${i * pas}deg ${(i + 1) * pas}deg`).join(",")}) border-box`;
      } else el.style.setProperty("--c", couleurs[0]);
      el.textContent = membres[0].marker.getElement().textContent ? etiquette(membres) : membres.length;
      el.setAttribute("aria-label", `${membres.length} étapes regroupées : toucher pour zoomer`);
      el.addEventListener("click", ev => {
        ev.stopPropagation();
        const lo = membres.map(x => x.lon), la = membres.map(x => x.lat);
        const z = map.getZoom();
        map.fitBounds([[Math.min(...lo), Math.min(...la)], [Math.max(...lo), Math.max(...la)]],
          { padding: 90, maxZoom: Math.max(z + 2, 15.5), duration: 600 });
      });
      return new maplibregl.Marker({ element: el }).setLngLat(map.unproject([g.x, g.y])).addTo(map);
    };
    const maj = () => {
      prevu = 0;
      bulles.forEach(b => b.remove()); bulles = [];
      const px = liste.map(x => map.project([x.lon, x.lat]));
      const rue = map.getZoom() >= 15;
      // groupes par proximité à l'écran, fusionnés jusqu'à stabilité (pas de bulles qui se chevauchent)
      let groupes = [];
      liste.forEach((x, i) => {
        if (x.hotel) { x.marker.setOffset([0, 0]); x.marker.getElement().style.visibility = ""; return; }
        groupes.push({ x: px[i].x, y: px[i].y, idx: [i], cle: !!x.estompe });
      });
      for (let fusion = true; fusion;) {
        fusion = false;
        for (let a = 0; a < groupes.length && !fusion; a++) for (let b = a + 1; b < groupes.length; b++) {
          const A = groupes[a], B = groupes[b];
          if (A.cle !== B.cle || Math.hypot(A.x - B.x, A.y - B.y) >= ecart * 0.95) continue;
          const n = A.idx.length + B.idx.length;
          A.x = (A.x * A.idx.length + B.x * B.idx.length) / n; A.y = (A.y * A.idx.length + B.y * B.idx.length) / n;
          A.idx.push(...B.idx); groupes.splice(b, 1); fusion = true; break;
        }
      }
      for (const g of groupes) {
        const n = g.idx.length;
        if (n > 1 && !rue) {
          g.idx.forEach(i => { liste[i].marker.getElement().style.visibility = "hidden"; });
          bulles.push(bulle(g, g.idx.map(i => liste[i])));
          continue;
        }
        g.idx.sort((a, b) => (liste[a].j.iso + String(liste[a].e.n).padStart(2, "0")).localeCompare(liste[b].j.iso + String(liste[b].e.n).padStart(2, "0")));
        g.idx.forEach((i, k) => {
          let dx = 0, dy = 0;
          if (n > 1 && n <= 4) dx = (k - (n - 1) / 2) * ecart;
          else if (n > 4) { const a = (2 * Math.PI * k) / n - Math.PI / 2, r = ecart * 0.8 * n / Math.PI; dx = r * Math.cos(a); dy = r * Math.sin(a); }
          liste[i].marker.getElement().style.visibility = "";
          liste[i].marker.setOffset(n > 1 ? [Math.round(g.x + dx - px[i].x), Math.round(g.y + dy - px[i].y)] : [0, 0]);
        });
      }
    };
    const surZoom = () => { if (!prevu) prevu = requestAnimationFrame(maj); };
    maj();
    map.on("zoom", surZoom);
    maj.detacher = () => { map.off("zoom", surZoom); if (prevu) cancelAnimationFrame(prevu); bulles.forEach(b => b.remove()); bulles = []; };
    return maj;
  }

  window.Carte = { style, creer, tracer, couches, pastille, decalages, repartir, PALETTES };
})();
