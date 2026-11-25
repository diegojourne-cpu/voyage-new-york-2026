/* New York · Noël 2026 — application (vanilla JS, aucune dépendance hors cartes).
   Données : data.json (généré depuis data/*.yaml). État partagé : /api/etat (Cloudflare). */
(() => {
"use strict";

/* ================================================================ outils */
const $ = (s, r = document) => r.querySelector(s);
function el(tag, props, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "style" && typeof v === "object") for (const [p, x] of Object.entries(v)) n.style.setProperty(p, x);
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(n.dataset, v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) n.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return n;
}
const pad = n => String(n).padStart(2, "0");
const hm = m => pad(Math.floor(m / 60) % 24) + ":" + pad(((m % 60) + 60) % 60);
const hFr = t => { if (!t) return ""; const [h, m] = t.split(":"); return `${+h}h${m === "00" ? "" : m}`; };
const majuscule = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const usd = v => v ? (Number.isInteger(v) ? `${v} $` : `${String(v.toFixed(2)).replace(".", ",")} $`) : "Gratuit";
const eur = v => `${Math.round(v).toLocaleString("fr-FR")} €`;
const lget = (k, d) => { try { const v = localStorage.getItem("nyc26:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lset = (k, v) => { try { localStorage.setItem("nyc26:" + k, JSON.stringify(v)); } catch (e) {} };
const sombre = () => { const t = document.documentElement.dataset.theme; return t ? t === "sombre" : matchMedia("(prefers-color-scheme: dark)").matches; };
const themeCarte = () => (sombre() ? "sombre" : "clair");

const ICONES = {
  aujourdhui: '<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3.5l2.6 6.2 6.6.5-5 4.3 1.6 6.5L14 17.6 8.2 21l1.6-6.5-5-4.3 6.6-.5z"/></svg>',
  programme: '<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4.5" y="5.5" width="19" height="18" rx="4"/><path d="M4.5 11h19M9.5 3.5v4M18.5 3.5v4M9 15.5h3M9 19h7"/></svg>',
  carte: '<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3.5 7l6.5-2.5 8 3 6.5-2.5v16.5L18 24l-8-3-6.5 2.5z"/><path d="M10 4.5V21M18 7.5V24"/></svg>',
  reveillon: '<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 4v4M14 20v4M4 14h4M20 14h4M7 7l2.8 2.8M18.2 18.2L21 21M21 7l-2.8 2.8M9.8 18.2L7 21"/><circle cx="14" cy="14" r="2.5"/></svg>',
  plus: '<svg viewBox="0 0 28 28" fill="currentColor"><circle cx="7" cy="14" r="2.2"/><circle cx="14" cy="14" r="2.2"/><circle cx="21" cy="14" r="2.2"/></svg>',
};

/* ================================================================ état partagé */
const QUI = { maman: "Maman", aine: "L'aîné", cadet: "Le cadet" };
const Sync = {
  etat: { resa: {}, bingo: {}, faits: {}, votes: {} },
  file: lget("file", []), mode: "local", abonnes: new Set(),
  init() {
    const loc = lget("etat", null);
    if (loc) this.etat = Object.assign(this.etat, loc);
    for (const r of D.reservations) if (r.statut === "fait") this.etat.resa[r.id] = true;
    this.tirer();
    setInterval(() => { if (document.visibilityState === "visible") this.tirer(); }, 20000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") this.tirer(); });
    addEventListener("online", () => this.tirer());
    this.indicateur();
  },
  appliquer(op) { const s = this.etat[op.section] = { ...(this.etat[op.section] || {}) }; if (op.valeur === null || op.valeur === false) delete s[op.cle]; else s[op.cle] = op.valeur; },
  async tirer() {
    try {
      await this.pousser();
      const r = await fetch("api/etat", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const srv = await r.json();
      this.etat = Object.assign({ resa: {}, bingo: {}, faits: {}, votes: {} }, srv);
      for (const op of this.file) this.appliquer(op);
      this.mode = "ok";
    } catch (e) { this.mode = navigator.onLine === false ? "hors" : (this.mode === "ok" ? "hors" : "local"); }
    lset("etat", this.etat); this.indicateur(); this.notifier();
  },
  async pousser() {
    while (this.file.length) {
      const op = this.file[0];
      const r = await fetch("api/etat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(op) });
      if (!r.ok) throw new Error(r.status);
      this.file.shift(); lset("file", this.file);
    }
  },
  ecrire(section, cle, valeur) {
    const op = { section, cle: String(cle), valeur };
    this.appliquer(op); lset("etat", this.etat);
    this.file.push(op); lset("file", this.file);
    this.notifier();
    this.pousser().then(() => { this.mode = "ok"; this.indicateur(); }).catch(() => { this.indicateur(); });
  },
  basculer(section, cle) { this.ecrire(section, cle, this.etat[section]?.[cle] ? null : true); },
  a(section, cle) { return !!this.etat[section]?.[cle]; },
  indicateur() {
    const e = $("#etat-sync"); if (!e) return;
    const t = { ok: "Synchronisé", hors: "Hors connexion", local: "Sur ce téléphone" }[this.mode];
    e.className = "etat-sync " + this.mode; e.replaceChildren(el("i"), t);
  },
  notifier() { for (const f of this.abonnes) f(); },
};

/* ================================================================ temps */
let simu = { jour: "", heure: "14:00" };
function heureNY() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}`, min: (+p.hour) * 60 + (+p.minute) };
}
function quand() {
  if (simu.jour) { const [h, m] = simu.heure.split(":").map(Number); return { iso: simu.jour, min: h * 60 + m, simu: true }; }
  return heureNY();
}
function situation() {
  const n = quand(), J = D.jours;
  if (n.iso < J[0].iso) return { avant: true, jours: Math.round((Date.parse(J[0].iso) - Date.parse(n.iso)) / 864e5), n };
  if (n.iso > J[J.length - 1].iso) return { apres: true, n };
  const jour = J.find(j => j.iso === n.iso);
  const et = jour.etapes.filter(e => e.duree > 0 || e.id_lieu === "hotel");
  return { jour, n, cur: et.find(e => e.debut_min <= n.min && n.min < e.fin_min), next: et.find(e => e.debut_min > n.min) };
}
const jourCourant = () => { const s = situation(); return s.jour ? s.jour.iso : (s.apres ? D.jours[D.jours.length - 1].iso : D.jours[1].iso); };
const ancre = iso => "j" + iso.slice(8);
const partirA = e => e.trajet ? e.debut_min - (e.attente || 0) - e.trajet.duree_totale : e.debut_min;

/* ================================================================ composants */
function ligneBadge(l) {
  const c = D.couleurs_lignes[l] || "#8e8e93";
  const txt = l === "MNR" ? "Metro-North" : l === "FERRY" ? "Ferry" : l;
  return el("span", { class: "ligne-b" + (D.lignes_noir.includes(l) ? " noir" : "") + (txt.length > 2 ? " mot" : ""), style: { background: c }, text: txt });
}
function badges(e) {
  return el("div", { class: "badges" },
    e.priorite === "absolument" && el("span", { class: "badge abs", text: "Absolument" }),
    e.priorite === "plus" && el("span", { class: "badge plus", text: "Envie forte" }),
    e.noel && el("span", { class: "badge noel", text: "Noël" }),
    e.creneau && el("span", { class: "badge", text: `Créneau ${hFr(e.creneau)}` }),
    e.pass.includes("citypass") && el("span", { class: "badge pass", text: "CityPASS" }),
    e.fiabilite === "a_verifier" && el("span", { class: "badge verif", text: "Horaires à confirmer" }),
    e.prix ? el("span", { class: "badge", text: usd(e.prix) }) : null);
}
function trajetTexte(t) {
  if (t.de) return `${t.de} → ${t.a}`;
  if (t.mode === "marche") return t.km ? `À pied · ${String(t.km).replace(".", ",")} km` : "À pied";
  return { taxi: "Taxi", ferry: "Ferry", train: "Train" }[t.mode] || t.mode;
}
function coche(section, cle, couleur, libelle) {
  const b = el("button", { class: "coche", type: "button", "aria-label": libelle, "aria-pressed": String(Sync.a(section, cle)), style: couleur ? { "--c": couleur } : null,
    onclick: ev => { ev.stopPropagation(); Sync.basculer(section, cle); } });
  const maj = () => b.setAttribute("aria-pressed", String(Sync.a(section, cle)));
  Sync.abonnes.add(maj);
  return b;
}

/* ================================================================ feuille (bottom sheet) */
const Feuille = {
  ouvrir(contenu, titreId) {
    const f = $("#feuille"), v = $("#voile");
    $("#feuille-corps").replaceChildren(contenu);
    f.setAttribute("aria-labelledby", titreId || "feuille-titre");
    f.hidden = false; v.hidden = false; f.scrollTop = 0;
    requestAnimationFrame(() => { f.classList.add("on"); v.classList.add("on"); });
    this.precedent = document.activeElement; $("#feuille-fermer").focus();
  },
  fermer() {
    const f = $("#feuille"), v = $("#voile");
    f.classList.remove("on"); v.classList.remove("on");
    setTimeout(() => { f.hidden = true; v.hidden = true; }, 280);
    if (this.precedent && this.precedent.focus) this.precedent.focus();
  },
};
function brancherFeuille() {
  $("#feuille-fermer").onclick = () => Feuille.fermer();
  $("#voile").onclick = () => Feuille.fermer();
  addEventListener("keydown", e => { if (e.key === "Escape" && !$("#feuille").hidden) Feuille.fermer(); });
  let y0 = null; const f = $("#feuille");
  f.addEventListener("touchstart", e => { y0 = f.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  f.addEventListener("touchmove", e => { if (y0 != null) { const d = e.touches[0].clientY - y0; if (d > 0) f.style.transform = `translateY(${d}px)`; } }, { passive: true });
  f.addEventListener("touchend", e => { if (y0 != null) { const d = (e.changedTouches[0].clientY - y0); f.style.transform = ""; if (d > 90) Feuille.fermer(); } y0 = null; });
}

function ouvrirEtape(e, jour) {
  const t = e.trajet;
  const lignes = [
    t && ["Trajet", el("span", {}, (t.lignes || []).map(ligneBadge), " ", trajetTexte(t), ` · ${t.duree_totale} min`, t.detail ? el("div", { class: "pied", text: t.detail }) : null)],
    e.adresse && ["Adresse", e.adresse],
    e.id_lieu !== "hotel" && ["Horaires", el("span", {}, e.horaires_jour, e.note_horaires ? el("div", { class: "pied", text: e.note_horaires }) : null)],
    (e.prix || e.prix_note) && ["Prix", `${usd(e.prix)}${e.prix_note ? " — " + e.prix_note : ""}`],
    e.conseil && ["Conseil", e.conseil],
    e.heure_creuse && ["Éviter la foule", e.heure_creuse],
    e.astuce_photo && ["Photo", e.astuce_photo],
    e.anecdote && ["Anecdote", e.anecdote],
    e.boutiques?.length && ["Adresses", el("span", {}, e.boutiques.map((b, i) => [i ? el("br") : null, b]))],
    e.noel && ["Noël", e.noel],
  ].filter(Boolean);
  const fait = e.id_lieu !== "hotel" && e.id_lieu !== "jfk";
  Feuille.ouvrir(el("div", { style: { "--c": jour.couleur }, class: "feuille-corps" },
    el("div", { class: "entete" },
      el("div", { class: "sur-titre", text: `${majuscule(jour.label)} · ${e.debut}${e.duree ? " → " + e.fin : ""}` }),
      el("h2", { class: "titre-m", id: "feuille-titre", text: e.titre }),
      el("div", { class: "pied", text: [e.quartier, e.duree ? `${e.duree} min sur place` : ""].filter(Boolean).join(" · ") }),
      badges(e)),
    e.quoi && el("p", { style: { "font-size": "17px" }, text: e.quoi }),
    el("div", { class: "rangee" },
      el("a", { class: "btn bleu", href: e.gmaps, target: "_blank", rel: "noopener", text: "Itinéraire" }),
      e.lien && el("a", { class: "btn", href: e.lien, target: "_blank", rel: "noopener", text: "Site officiel" }),
      fait && el("span", { class: "rangee" }, coche("faits", e.key, jour.couleur, "Marquer comme fait"), el("span", { class: "pied", text: "Fait" }))),
    el("dl", { class: "dl" }, lignes.map(([k, v]) => el("div", {}, el("dt", { text: k }), el("dd", {}, v))))));
}

/* ================================================================ cartes (MapLibre) */
let cartes = [];
function libererCartes() { for (const m of cartes) { try { m.remove(); } catch (e) {} } cartes = []; }
function marqueurs(map, jours, actif, surClic) {
  const out = [];
  const hotel = el("div", { class: "pin hotel", text: "H", title: "Hôtel" });
  out.push(new maplibregl.Marker({ element: hotel }).setLngLat([D.hotel[1], D.hotel[0]]).addTo(map));
  for (const j of jours) for (const e of j.etapes) {
    if (e.id_lieu === "hotel" || (e.id_lieu === "jfk" && j.iso !== "2026-12-27")) continue;
    if (!e.n) continue;
    const p = Carte.pastille(e.n, j.couleur, actif && actif !== j.iso ? "estompe" : "");
    p.addEventListener("click", ev => { ev.stopPropagation(); surClic(e, j); });
    out.push(new maplibregl.Marker({ element: p }).setLngLat([e.coord[1], e.coord[0]]).addTo(map));
  }
  return out;
}
function suivreTheme(map, features, jour) {
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const f = () => { map.setStyle(Carte.style(themeCarte())); map.once("style.load", () => { Carte.couches(map, themeCarte()); Carte.tracer(map, features, jour); }); };
  mq.addEventListener("change", f);
  addEventListener("nyc26-theme", f);
  map.on("remove", () => { mq.removeEventListener("change", f); removeEventListener("nyc26-theme", f); });
}

/* ================================================================ vues */
const V = {};

V.aujourdhui = () => {
  const s = situation();
  const graines = Array.from({ length: 34 }, (_, i) => el("i", { style: { left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`, "animation-delay": `${(i % 7) * 0.7}s` } }));
  const compteur = s.avant ? [el("b", { text: s.jours }), el("span", { text: s.jours > 1 ? "jours avant l'atterrissage à JFK" : "jour avant l'atterrissage à JFK" })]
    : s.apres ? [el("b", { text: "Merci" }), el("span", { text: "le voyage est terminé, bon retour." })]
    : [el("b", { text: hm(s.n.min) }), el("span", { text: `à New York · ${s.jour.label}` })];
  const heros = el("section", { class: "heros" }, el("div", { class: "paillettes" }, graines), el("div", { class: "page apparait" },
    el("div", { class: "sur-titre", text: "27 décembre 2026 — 1er janvier 2027" }),
    el("h1", { class: "titre-xl", text: "Noël à New York." }),
    el("p", { class: "chapeau", text: "Cinq jours pour s'imprégner de la magie des fêtes : sapins, vitrines, patinoires, et la ville qui s'illumine dès 17 heures." }),
    el("div", { class: "compteur" }, compteur),
    el("div", { class: "rangee" },
      el("a", { class: "btn blanc", href: "#" + ancre(jourCourant()), text: "Voir le programme" }),
      el("a", { class: "btn bleu", href: "#carte", text: "Ouvrir la carte" }))));

  const page = el("div", { class: "page" });
  if (s.jour) {
    const cible = s.cur || s.next;
    if (cible) {
      const t = cible.trajet;
      page.append(el("section", { class: "bloc apparait" },
        el("div", { class: "bloc-tete" }, el("div", { class: "sur-titre", text: s.cur ? "En ce moment" : "Prochaine étape" }), el("h2", { class: "titre-m", text: s.jour.titre })),
        el("div", { class: "prochaine", style: { "--c": s.jour.couleur } },
          el("div", { class: "heure", text: s.cur ? `jusqu'à ${s.cur.fin}` : cible.debut }),
          el("h3", { text: cible.titre }),
          el("div", { class: "pied", text: cible.quartier }),
          !s.cur && t && el("p", {}, `Partir à `, el("b", { text: hm(partirA(cible)) }), ` · `, (t.lignes || []).map(ligneBadge), ` ${trajetTexte(t)} · ${t.duree_totale} min`),
          s.cur && s.next && el("p", { class: "pied", text: `Ensuite à ${s.next.debut} : ${s.next.titre}${s.next.trajet ? ` (partir vers ${hm(partirA(s.next))})` : ""}` }),
          el("div", { class: "rangee" },
            el("a", { class: "btn bleu", href: (s.cur && s.next ? s.next : cible).gmaps, target: "_blank", rel: "noopener", text: "Itinéraire" }),
            el("button", { class: "btn", type: "button", text: "Détails", onclick: () => ouvrirEtape(cible, s.jour) })))));
    }
  }
  page.append(el("section", { class: "bloc" },
    el("div", { class: "bloc-tete" }, el("div", { class: "sur-titre", text: "La semaine" }), el("h2", { class: "titre-m", text: "Une journée, un quartier, une lumière." })),
    el("div", { class: "defile" }, D.jours.map(j => el("a", { class: "jour-tuile", href: "#" + ancre(j.iso), style: { "--c": j.couleur } },
      el("div", {}, el("div", { class: "d", text: j.label }), el("div", { class: "n", text: +j.iso.slice(8) })),
      el("div", { style: { display: "grid", gap: "6px" } }, el("h3", { text: j.titre }), el("p", { text: j.theme })))))));

  const reste = D.reservations.filter(r => !Sync.a("resa", r.id) && r.urgence <= 2);
  if (reste.length) page.append(el("section", { class: "bloc" },
    el("div", { class: "bloc-tete" }, el("div", { class: "sur-titre", text: "À faire" }), el("h2", { class: "titre-m", text: `${reste.length} réservation${reste.length > 1 ? "s" : ""} à faire.` })),
    listeResa(reste.slice(0, 5)), el("a", { class: "lien-fleche", href: "#resa", text: "Toutes les réservations" })));

  page.append(el("section", { class: "bloc" },
    el("div", { class: "bloc-tete" }, el("div", { class: "sur-titre", text: "Aperçu" }), el("h2", { class: "titre-s", text: "Voir l'appli à un autre moment du voyage" })),
    el("div", { class: "carte-bloc" },
      el("div", { class: "rangee" },
        el("select", { id: "simu-jour", class: "btn", "aria-label": "Jour", onchange: ev => { simu.jour = ev.target.value; rendre(); } },
          el("option", { value: "", text: "Maintenant" }), D.jours.map(j => el("option", { value: j.iso, text: majuscule(j.label), selected: simu.jour === j.iso }))),
        el("input", { id: "simu-heure", class: "btn", type: "time", value: simu.heure, "aria-label": "Heure", onchange: ev => { simu.heure = ev.target.value || "14:00"; if (simu.jour) rendre(); } })),
      el("p", { class: "pied", text: "Choisissez un jour et une heure pour voir ce que l'écran « Aujourd'hui » affichera pendant le voyage." }))));
  return [heros, page];
};

function listeResa(rs) {
  const couleur = u => ({ 1: "var(--red)", 2: "var(--orange)", 3: "var(--muted)" })[u];
  const box = el("div", { class: "liste" }, rs.map(r => {
    const ligne = el("div", { role: "button", tabindex: "0", class: Sync.a("resa", r.id) ? "fait" : "", onclick: () => ouvrirResa(r), onkeydown: ev => { if (ev.key === "Enter") ouvrirResa(r); } },
      coche("resa", r.id, couleur(r.urgence), "Réservation faite"),
      el("div", {}, el("div", { class: "t", text: r.titre }), el("div", { class: "s", text: r.creneau !== "—" ? r.creneau : r.quand })),
      el("span", { class: "chev", text: "›" }));
    Sync.abonnes.add(() => ligne.classList.toggle("fait", Sync.a("resa", r.id)));
    return ligne;
  }));
  return box;
}
function ouvrirResa(r) {
  Feuille.ouvrir(el("div", { class: "feuille-corps" },
    el("div", { class: "entete" }, el("div", { class: "sur-titre", text: `Urgence ${r.urgence}` }), el("h2", { class: "titre-m", id: "feuille-titre", text: r.titre })),
    el("dl", { class: "dl" }, [["Quand", r.quand], ["Créneau", r.creneau], ["Prix", r.prix], r.detail && ["Détail", r.detail]].filter(Boolean).map(([k, v]) => el("div", {}, el("dt", { text: k }), el("dd", { text: v })))),
    el("div", { class: "rangee" }, el("a", { class: "btn bleu", href: r.lien, target: "_blank", rel: "noopener", text: "Réserver sur le site officiel" }),
      coche("resa", r.id, "var(--green)", "Réservation faite"), el("span", { class: "pied", text: "C'est fait" }))));
}

function segmentsJours(actif) {
  return el("div", { class: "segments" }, el("div", { class: "page" }, el("nav", { class: "seg", "aria-label": "Jours" },
    D.jours.map(j => el("a", { href: "#" + ancre(j.iso), "aria-current": j.iso === actif ? "page" : null, style: { "--c": j.couleur } },
      el("span", { text: +j.iso.slice(8) }), el("small", { text: j.label.split(" ")[0].slice(0, 3) + "." }))))));
}

V.jour = iso => {
  const j = D.jours.find(x => x.iso === iso) || D.jours[1];
  const s = situation();
  const fin = j.etapes[j.etapes.length - 1];
  const carteDiv = el("div", { class: "carte-jour" },
    el("a", { class: "btn petit verre agrandir", href: "#carte", onclick: () => { etatCarte.jour = j.iso; }, text: "Agrandir" }));
  const fil = el("ol", { class: "fil" });
  for (const e of j.etapes) {
    if (e.trajet) fil.append(el("li", { class: "trajet" }, el("span"), el("span", { class: "ligne-v" }),
      el("div", { class: "tx" }, (e.trajet.lignes || []).map(ligneBadge), el("span", { text: trajetTexte(e.trajet) }), el("b", { text: `${e.trajet.duree_totale} min` }),
        e.attente >= 10 ? el("span", { text: `· ${e.attente} min d'avance` }) : null)));
    if (e.id_lieu === "hotel" && !e.duree && e === fin) {
      fil.append(el("li", { class: "etape" }, el("div", { class: "h", text: e.debut }), el("span", { class: "pt" }),
        el("div", { class: "corps", style: { cursor: "default" } }, el("h3", { text: e.titre }), el("div", { class: "q", text: "Fin de journée" }))));
      continue;
    }
    const ici = s.jour === j && s.cur === e;
    const li = el("li", { class: "etape" + (e.repas ? " repas" : "") + (ici ? " ici" : "") + (Sync.a("faits", e.key) ? " faite" : "") },
      el("div", { class: "h" }, e.debut, e.duree ? el("small", { text: e.fin }) : null),
      el("span", { class: "pt" }),
      el("div", { class: "corps", role: "button", tabindex: "0", onclick: () => ouvrirEtape(e, j), onkeydown: ev => { if (ev.key === "Enter") ouvrirEtape(e, j); } },
        el("h3", { text: (e.n ? e.n + ". " : "") + e.titre }),
        el("div", { class: "q", text: [e.quartier, e.duree ? `${e.duree} min` : ""].filter(Boolean).join(" · ") }),
        e.id_lieu !== "hotel" && e.id_lieu !== "jfk" ? coche("faits", e.key, j.couleur, "Marquer comme fait") : null,
        badges(e),
        e.quoi && el("p", { class: "resume", text: e.quoi })));
    Sync.abonnes.add(() => li.classList.toggle("faite", Sync.a("faits", e.key)));
    fil.append(li);
  }
  const defis = D.jeux.defis_photo[j.iso] || [];
  const idx = D.jours.indexOf(j), prec = D.jours[idx - 1], suiv = D.jours[idx + 1];
  const vue = el("div", { style: { "--c": j.couleur } },
    segmentsJours(j.iso),
    el("div", { class: "page" },
      el("header", { class: "jour-tete apparait" },
        el("div", { class: "sur-titre", style: { color: j.couleur }, text: majuscule(j.label) }),
        el("h1", { class: "titre-l", text: j.titre }),
        el("p", { class: "chapeau", text: j.theme }),
        el("div", { class: "meta" },
          el("span", {}, "Départ ", el("b", { text: j.depart })), el("span", {}, "Coucher du soleil ", el("b", { text: j.soleil.coucher })),
          el("span", {}, "Nuit ", el("b", { text: j.soleil.nuit })), el("span", {}, "Fin ", el("b", { text: fin.debut })))),
      j.note && el("p", { class: "pied", style: { "margin-top": "12px" }, text: j.note }),
      carteDiv,
      j.alertes.some(a => a.niveau !== "info") && el("div", { class: "alertes" }, j.alertes.filter(a => a.niveau !== "info").map(a =>
        el("div", { class: "alerte " + a.niveau }, el("span", { text: a.niveau === "erreur" ? "✕" : "!" }), el("span", {}, el("b", { text: a.etape }), " — ", a.message)))),
      fil,
      defis.length && el("section", { class: "bloc" }, el("div", { class: "bloc-tete" }, el("div", { class: "sur-titre", text: "Défis photo du jour" })),
        el("div", { class: "liste" }, defis.map((d, i) => el("div", {}, coche("faits", `defi-${j.iso}-${i + 1}`, j.couleur, "Défi réussi"), el("div", { class: "t", text: d }), el("span"))))),
      el("nav", { class: "bloc rangee", style: { "justify-content": "space-between" } },
        prec ? el("a", { class: "btn", href: "#" + ancre(prec.iso), text: `‹ ${majuscule(prec.label_court)}` }) : el("span"),
        suiv ? el("a", { class: "btn", href: "#" + ancre(suiv.iso), text: `${majuscule(suiv.label_court)} ›` }) : el("span"))));
  requestAnimationFrame(() => {
    const map = Carte.creer(carteDiv, { theme: themeCarte(), bounds: j.bounds, features: j.features, jour: j.iso, cooperatif: true, padding: 56,
      onload: m => marqueurs(m, [j], null, ouvrirEtape) });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    suivreTheme(map, j.features, j.iso);
    cartes.push(map);
  });
  return vue;
};

const etatCarte = { jour: null };
V.carte = () => {
  const boite = el("div", { class: "map" });
  let markers = [];
  const tous = D.jours.flatMap(j => j.features);
  const seg = el("div", { class: "seg", role: "group", "aria-label": "Filtrer par jour" },
    el("button", { type: "button", "aria-pressed": String(!etatCarte.jour), text: "Tous", dataset: { j: "" } }),
    D.jours.filter(j => j.iso !== "2026-12-27").map(j => el("button", { type: "button", "aria-pressed": String(etatCarte.jour === j.iso), dataset: { j: j.iso }, style: { "--c": j.couleur } },
      el("span", { text: +j.iso.slice(8) }), el("span", { class: "pt" }))));
  const vue = el("div", { class: "vue-carte" }, boite, el("div", { class: "flottant verre" }, seg));
  requestAnimationFrame(() => {
    const cadre = iso => {
      if (iso) return D.jours.find(j => j.iso === iso).bounds;
      const b = D.jours.filter(j => j.iso !== "2026-12-27").map(j => j.bounds);
      return [[Math.min(...b.map(x => x[0][0])), Math.min(...b.map(x => x[0][1]))], [Math.max(...b.map(x => x[1][0])), Math.max(...b.map(x => x[1][1]))]];
    };
    const map = Carte.creer(boite, { theme: themeCarte(), bounds: cadre(etatCarte.jour), features: tous, jour: etatCarte.jour, padding: { top: 90, bottom: 40, left: 40, right: 40 },
      onload: m => { markers = marqueurs(m, D.jours.filter(j => j.iso !== "2026-12-27"), etatCarte.jour, ouvrirEtape); } });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), "bottom-right");
    suivreTheme(map, tous, etatCarte.jour);
    cartes.push(map);
    seg.addEventListener("click", ev => {
      const b = ev.target.closest("button"); if (!b) return;
      etatCarte.jour = b.dataset.j || null;
      seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      Carte.tracer(map, tous, etatCarte.jour);
      markers.forEach(m => m.remove());
      markers = marqueurs(map, D.jours.filter(j => j.iso !== "2026-12-27"), etatCarte.jour, ouvrirEtape);
      map.fitBounds(cadre(etatCarte.jour), { padding: { top: 90, bottom: 40, left: 40, right: 40 }, duration: 700 });
    });
  });
  return vue;
};

V.reveillon = () => {
  const R = D.reveillon;
  const moi = lget("moi", null);
  const votes = el("div", { class: "votes" });
  const majVotes = () => {
    const par = {};
    for (const [q, c] of Object.entries(Sync.etat.votes || {})) (par[c] = par[c] || []).push(QUI[q] || q);
    votes.replaceChildren(...(Object.keys(par).length ? Object.entries(par).sort((a, b) => b[1].length - a[1].length).map(([c, l]) =>
      el("span", { class: "badge", text: `${(R.choix.find(x => x.id === c) || {}).titre || c} · ${l.join(", ")}` })) : [el("span", { class: "pied", text: "Aucun vote pour l'instant." })]));
    document.querySelectorAll("[data-vote]").forEach(b => { const ok = Sync.etat.votes?.[lget("moi", "")] === b.dataset.vote; b.className = "btn" + (ok ? " bleu" : ""); b.textContent = ok ? "Mon choix ✓" : "Je vote pour ça"; });
  };
  Sync.abonnes.add(majVotes);
  const voter = id => { const q = lget("moi", null); if (!q) return choisirQui(() => voter(id)); Sync.ecrire("votes", q, id); };
  const vue = el("div", { class: "page" },
    el("header", { class: "bloc apparait" }, el("div", { class: "sur-titre", text: "Jeudi 31 décembre" }), el("h1", { class: "titre-l", text: "Où passer minuit ?" }), el("p", { class: "chapeau", text: R.intro })),
    el("section", { class: "bloc" }, el("div", { class: "carte-bloc", style: { "box-shadow": "0 0 0 2px var(--gold), var(--shadow)" } },
      el("div", { class: "sur-titre", style: { color: "var(--gold)" }, text: "Notre conseil" }), el("p", { style: { "font-size": "19px", "letter-spacing": "-.015em" }, text: R.recommandation }))),
    el("section", { class: "bloc" }, el("div", { class: "carte-bloc" },
      el("div", { class: "rangee", style: { "justify-content": "space-between" } }, el("h2", { class: "titre-s", text: "Le vote de la famille" }),
        el("button", { class: "btn petit", type: "button", text: moi ? `Je suis : ${QUI[moi]}` : "Qui suis-je ?", onclick: () => choisirQui(() => rendre()) })),
      votes)),
    el("section", { class: "bloc grille" }, R.choix.map((c, i) => el("article", { class: "carte-bloc option" + (i === 0 ? " reco" : "") },
      el("div", { class: "rangee", style: { "justify-content": "space-between" } }, el("h3", { class: "titre-s", text: c.titre }), el("span", { class: "etoiles", "aria-label": `${c.note} sur 5`, text: "★".repeat(c.note) + "☆".repeat(5 - c.note) })),
      el("dl", { class: "dl" }, [["Arrivée", c.arrivee], ["Attente", c.attente], ["Foule", c.foule], ["Froid", c.froid], ["Coût", c.cout], ["Retour", c.acces_retour], ["Pour", c.plus.join(" · ")], ["Contre", c.moins.join(" · ")]]
        .map(([k, v]) => el("div", {}, el("dt", { text: k }), el("dd", { text: v })))),
      el("button", { class: "btn", type: "button", dataset: { vote: c.id }, text: "Je vote pour ça", onclick: () => voter(c.id) })))));
  requestAnimationFrame(majVotes);
  return vue;
};
function choisirQui(ensuite) {
  Feuille.ouvrir(el("div", { class: "feuille-corps" },
    el("div", { class: "entete" }, el("h2", { class: "titre-m", id: "feuille-titre", text: "Qui tient ce téléphone ?" }), el("p", { class: "pied", text: "Pour savoir qui a voté quoi. Choix mémorisé sur ce téléphone." })),
    el("div", { class: "qui" }, Object.entries(QUI).map(([k, v]) => el("button", { class: "btn", type: "button", text: v, onclick: () => { lset("moi", k); Feuille.fermer(); if (ensuite) ensuite(); } })))));
}

V.plus = () => {
  const items = [
    ["resa", "Réservations", "Par ordre d'urgence", "var(--red)", "✓"], ["pass", "Pass et budget", "CityPASS, C-All, dépenses", "var(--green)", "$"],
    ["options", "Options et idées", "Statue de la Liberté, match, Greeter, plan pluie", "var(--accent)", "＋"], ["jeux", "Jeux", "Bingo, défis photo, quiz", "var(--orange)", "★"],
    ["infos", "Infos pratiques", "Métro, JFK, pourboires, urgences", "#8e8e93", "i"], ["fichiers", "PDF, agenda, Google Maps", "À télécharger ou importer", "#5e5ce6", "↓"],
    ["verif", "Vérification du planning", `${D.nb.erreur} erreur · ${D.nb.attention} points à confirmer`, "var(--gold)", "!"],
  ];
  const actuel = lget("theme", "auto");
  const seg = el("div", { class: "seg", role: "group", "aria-label": "Apparence" }, [["auto", "Automatique"], ["clair", "Clair"], ["sombre", "Sombre"]].map(([v, t]) =>
    el("button", { type: "button", "aria-pressed": String(actuel === v), text: t, onclick: ev => {
      appliquerTheme(v); seg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b === ev.currentTarget))); } })));
  return el("div", { class: "page" },
    el("header", { class: "bloc apparait" }, el("h1", { class: "titre-l", text: "Plus." })),
    el("section", { class: "bloc", style: { gap: "8px" } }, el("div", { class: "liste-titre", text: "Apparence" }), seg,
      el("p", { class: "liste-note", text: "« Automatique » suit le réglage du téléphone. Le choix est mémorisé sur ce téléphone." })),
    el("section", { class: "bloc" }, el("nav", { class: "liste" }, items.map(([id, t, s, c, ic]) =>
      el("a", { href: "#" + id }, el("span", { class: "ic", style: { background: c }, text: ic }), el("div", {}, el("div", { class: "t", text: t }), el("div", { class: "s", text: s })), el("span", { class: "chev", text: "›" }))))),
    el("p", { class: "pied bloc", text: `Programme généré le ${D.genere_le}. Pour toute modification, écrivez à Claude dans la conversation du voyage.` }));
};

V.resa = () => el("div", { class: "page" },
  el("header", { class: "bloc apparait" }, el("div", { class: "sur-titre", text: "Par ordre d'urgence" }), el("h1", { class: "titre-l", text: "Réservations." }),
    el("p", { class: "chapeau", text: "Cochez quand c'est fait : la case se met à jour sur les trois téléphones." })),
  [1, 2, 3].map(u => el("section", { class: "bloc", style: { gap: "8px" } }, el("div", { class: "liste-titre", text: { 1: "Maintenant", 2: "Avant mi-décembre", 3: "Avant le départ" }[u] }), listeResa(D.reservations.filter(r => r.urgence === u)))));

V.pass = () => {
  const P = D.pass, best = P.scenarios.find(s => s.code === P.meilleur), sans = P.scenarios.find(s => s.code === "aucun"), call = P.scenarios.find(s => s.code === "call");
  const B = D.budget;
  return el("div", { class: "page" },
    el("header", { class: "bloc apparait" }, el("div", { class: "sur-titre", text: "Calculé à partir du programme" }), el("h1", { class: "titre-l", text: `${best.nom}.` }),
      el("p", { class: "chapeau", text: `${eur(best.total_eur_3)} pour vous trois, entrées payées à part comprises. Contre ${eur(sans.total_eur_3)} sans pass et ${eur(call.total_eur_3)} avec le C-All.` })),
    el("section", { class: "bloc" }, el("div", { class: "tableau" }, el("table", {},
      el("thead", {}, el("tr", {}, el("th", { text: "Option" }), el("th", { text: "Couvre dans le programme" }), el("th", { class: "n", text: "Par pers." }), el("th", { class: "n", text: "× 3" }))),
      el("tbody", {}, P.scenarios.map(s => el("tr", { class: s.code === P.meilleur ? "meilleur" : "" },
        el("td", {}, el("b", { text: s.nom }), el("div", { class: "pied", text: s.cout_pass_eur ? `pass ${eur(s.cout_pass_eur)}` : "billets séparés" })),
        el("td", { text: (s.couvre.map(c => c.nom.split(" (")[0].split(" —")[0]).join(", ") || "—") + (s.bonus.length ? ` (+ ${s.bonus.map(b => b.nom.split(" (")[0]).join(", ")} hors programme)` : "") }),
        el("td", { class: "n", text: eur(s.total_eur_pp) }), el("td", { class: "n" }, el("b", { text: eur(s.total_eur_3) })))))))),
    el("section", { class: "bloc grille" },
      el("div", { class: "carte-bloc" }, el("h3", { class: "titre-s", text: "Pourquoi le CityPASS" }),
        el("p", { text: "Depuis septembre 2026, c'est 5 attractions au choix parmi 10. Le programme en utilise 4 : Top of the Rock au coucher du soleil, Empire State de nuit, Natural History, 9/11 Museum. La 5e : la Statue de la Liberté si vous prenez l'option, sinon Edge le 1er janvier, au bout de la High Line." }),
        el("p", { class: "pied", text: "Le C-All ajoute surtout le MoMA (30 $) et des attractions qu'on n'a pas le temps de caser sans sacrifier les balades et les lumières." })),
      Object.values(P.offres).map(o => el("div", { class: "carte-bloc" }, el("h3", { class: "titre-s", text: o.nom }), el("div", { class: "pied", text: `${String(o.prix_eur).replace(".", ",")} € + ${String(o.frais_eur).replace(".", ",")} € de frais` }),
        el("ul", { style: { margin: 0, "padding-left": "18px", display: "grid", gap: "6px", "font-size": "15px" } }, o.conditions.map(c => el("li", { text: c })))))),
    el("section", { class: "bloc" }, el("h2", { class: "titre-m", text: "Budget par personne." }),
      el("div", { class: "tableau" }, el("table", {}, el("tbody", {},
        el("tr", {}, el("td", { text: "Métro (plafond OMNY)" }), el("td", { class: "n", text: usd(B.metro) })),
        el("tr", {}, el("td", { text: "Metro-North et NYC Ferry" }), el("td", { class: "n", text: usd(B.autres_transports) })),
        el("tr", {}, el("td", { text: "Taxis JFK aller et retour (part de chacun)" }), el("td", { class: "n", text: usd(B.taxis) })),
        P.lignes.map(l => el("tr", {}, el("td", {}, l.nom.split(" (")[0], l.pass.includes("citypass") ? el("span", { class: "badge pass", style: { "margin-left": "8px" }, text: "CityPASS" }) : null), el("td", { class: "n", text: usd(l.prix) }))),
        el("tr", {}, el("td", { text: "Repas sur 5 jours (taxe et pourboire compris)" }), el("td", { class: "n", text: `${B.repas_estimation.bas}–${B.repas_estimation.haut} $` })))))));
};

V.options = () => {
  const S = D.statue, M = D.match, G = D.greeter;
  const dl = rows => el("dl", { class: "dl" }, rows.map(([k, v]) => el("div", {}, el("dt", { text: k }), el("dd", { text: v }))));
  return el("div", { class: "page" },
    el("header", { class: "bloc apparait" }, el("div", { class: "sur-titre", text: "Hors programme" }), el("h1", { class: "titre-l", text: "Options et idées." })),
    el("section", { class: "bloc" }, el("div", { class: "carte-bloc" }, el("div", { class: "sur-titre", text: "Option demi-journée" }), el("h2", { class: "titre-m", text: "Statue de la Liberté et Ellis Island" }),
      dl([["Incluse ?", S.incluse_dans], ["Meilleur moment", S.meilleur_moment], ["Remplace", S.creneau_remplace], ["Ce qu'on perd", S.ce_qu_on_perd], ["Verdict", S.verdict]]),
      el("details", {}, el("summary", { class: "lien-fleche", style: { cursor: "pointer" }, text: "Déroulé de la matinée" }), el("ul", { style: { "padding-left": "18px" } }, S.deroule.map(d => el("li", { class: "num", text: d })))))),
    el("section", { class: "bloc grille" },
      el("div", { class: "carte-bloc" }, el("div", { class: "sur-titre", text: "Match" }), el("h3", { class: "titre-s", text: M.verdict }), el("ul", { style: { margin: 0, "padding-left": "18px", "font-size": "15px", display: "grid", gap: "6px" } }, M.details.map(d => el("li", { text: d })))),
      el("div", { class: "carte-bloc" }, el("div", { class: "sur-titre", text: "Big Apple Greeter" }), el("h3", { class: "titre-s", text: G.verdict }), el("ul", { style: { margin: 0, "padding-left": "18px", "font-size": "15px", display: "grid", gap: "6px" } }, G.details.map(d => el("li", { text: d }))),
        el("p", { class: "pied", text: "Créneau conseillé : " + G.creneau_conseille }), el("a", { class: "btn bleu", href: G.lien, target: "_blank", rel: "noopener", text: "Faire la demande" }))),
    el("section", { class: "bloc" }, el("h2", { class: "titre-m", text: "À glisser si l'envie vous prend." }),
      el("div", { class: "grille" }, D.autres.map(a => el("div", { class: "carte-bloc" }, el("h3", { class: "titre-s", text: a.titre }), el("p", { text: a.pourquoi }), el("p", { class: "pied", text: "Où le placer : " + a.ou_le_placer }), el("p", { class: "pied", text: a.prix }))))),
    el("section", { class: "bloc" }, el("h2", { class: "titre-m", text: "S'il pleut ou s'il neige." }), el("p", { class: "chapeau", text: D.plan_pluie.principe }),
      el("div", { class: "grille" }, Object.entries(D.plan_pluie.par_quartier).map(([q, l]) => el("div", { class: "carte-bloc" }, el("h3", { class: "titre-s", text: q }), el("ul", { style: { margin: 0, "padding-left": "18px", "font-size": "15px" } }, l.map(x => el("li", { text: x }))))))));
};

V.jeux = () => {
  const lignesB = []; for (let i = 0; i < 5; i++) { lignesB.push([0, 1, 2, 3, 4].map(k => i * 5 + k)); lignesB.push([0, 1, 2, 3, 4].map(k => k * 5 + i)); }
  lignesB.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);
  const grille = el("div", { class: "bingo" }, D.jeux.bingo.cases.map((c, i) => el("button", { type: "button", "aria-pressed": "false", dataset: { b: i }, text: c, onclick: () => Sync.basculer("bingo", i) })));
  const maj = () => { const ok = new Set(); lignesB.forEach(l => { if (l.every(i => Sync.a("bingo", i))) l.forEach(i => ok.add(i)); });
    grille.querySelectorAll("button").forEach(b => { const i = +b.dataset.b; b.setAttribute("aria-pressed", String(Sync.a("bingo", i))); b.classList.toggle("ligne", ok.has(i)); }); };
  Sync.abonnes.add(maj); requestAnimationFrame(maj);
  const quiz = el("div", { class: "carte-bloc quiz" });
  let qi = 0, score = 0;
  const poser = () => {
    const Q = D.jeux.quiz;
    if (qi >= Q.length) { quiz.replaceChildren(el("h3", { class: "titre-m", text: `${score} / ${Q.length}` }), el("p", { class: "pied", text: score >= 11 ? "Guide new-yorkais certifié." : "Les réponses sont dans le programme : on retente ?" }), el("button", { class: "btn", type: "button", text: "Recommencer", onclick: () => { qi = 0; score = 0; poser(); } })); return; }
    const q = Q[qi]; let fini = false;
    const choix = el("div", { class: "choix" }, q.choix.map((c, i) => el("button", { class: "btn", type: "button", text: c, onclick: ev => {
      if (fini) return; fini = true; if (i === q.r) score++;
      [...choix.children].forEach((b, k) => { if (k === q.r) b.classList.add("bon"); else if (b === ev.currentTarget) b.classList.add("faux"); });
      quiz.append(el("button", { class: "btn bleu", type: "button", text: "Question suivante", onclick: () => { qi++; poser(); } }));
    } })));
    quiz.replaceChildren(el("div", { class: "sur-titre", text: `Question ${qi + 1} sur ${Q.length} · score ${score}` }), el("h3", { class: "titre-s", text: q.q }), choix);
  };
  poser();
  return el("div", { class: "page" },
    el("header", { class: "bloc apparait" }, el("div", { class: "sur-titre", text: "Pour les files d'attente" }), el("h1", { class: "titre-l", text: "Bingo de Noël." }), el("p", { class: "chapeau", text: D.jeux.bingo.regle })),
    el("section", { class: "bloc" }, grille),
    el("section", { class: "bloc" }, el("h2", { class: "titre-m", text: "Quiz des anecdotes." }), quiz));
};

V.infos = () => el("div", { class: "page" },
  el("header", { class: "bloc apparait" }, el("div", { class: "sur-titre", text: "Mode d'emploi" }), el("h1", { class: "titre-l", text: "Infos pratiques." })),
  D.infos.map(s => el("section", { class: "bloc", style: { gap: "8px" } }, el("div", { class: "liste-titre", text: s.titre }),
    el("div", { class: "liste" }, s.points.map(p => el("div", { style: { "grid-template-columns": "1fr", cursor: "default" } }, el("div", { class: "s", style: { color: "var(--ink)", "font-size": "15.5px" }, text: p })))))),
  el("section", { class: "bloc", style: { gap: "8px" } }, el("div", { class: "liste-titre", text: "Urgences et hôtel" }),
    el("div", { class: "liste" }, [...D.voyage.urgences, D.voyage.hotel.adresse, ...D.voyage.hotel.stations].map(p => el("div", { style: { "grid-template-columns": "1fr", cursor: "default" } }, el("div", { class: "s", style: { color: "var(--ink)", "font-size": "15.5px" }, text: p }))))),
  el("section", { class: "bloc", style: { gap: "8px" } }, el("div", { class: "liste-titre", text: "Modifier le programme" }),
    el("div", { class: "carte-bloc" }, el("p", { text: "Écrivez à Claude dans la conversation du voyage : « il pleut », « on a une heure de retard », « on préfère faire X demain ». Il réorganise, revérifie les horaires et les trajets, et l'appli se met à jour d'elle-même en quelques minutes." }))));

V.verif = () => el("div", { class: "page" },
  el("header", { class: "bloc apparait" }, el("div", { class: "sur-titre", text: "Vérification automatique" }), el("h1", { class: "titre-l", text: `${D.nb.erreur} erreur.` }),
    el("p", { class: "chapeau", text: `${D.nb.attention} points à confirmer. Le planning est recalculé à chaque modification : ouverture à la date prévue, dernière entrée, créneaux réservés, trajets avec 15 % de marge, coucher du soleil, retour à l'hôtel, arrivée à JFK.` })),
  el("section", { class: "bloc alertes" }, D.alertes.map(a => el("div", { class: "alerte " + a.niveau }, el("span", { class: "num", text: a.jour.slice(5) }), el("span", {}, el("b", { text: a.etape }), " — ", a.message)))));

V.fichiers = () => {
  const etatT = el("p", { class: "pied", text: "Préparation des cartes hors connexion…" });
  const majT = s => { etatT.textContent = s.pret ? `Cartes et programme disponibles hors connexion (${Math.round(s.octets / 1e6)} Mo).` : s.pct != null ? `Téléchargement des cartes hors connexion : ${s.pct} %` : "Les cartes seront disponibles hors connexion après la première ouverture avec réseau."; };
  majT(etatTuiles); abonnesTuiles.add(majT);
  const ios = /iPhone|iPad/.test(navigator.userAgent);
  return el("div", { class: "page" },
    el("header", { class: "bloc apparait" }, el("div", { class: "sur-titre", text: "À emporter" }), el("h1", { class: "titre-l", text: "PDF, agenda, cartes." })),
    el("section", { class: "bloc grille" },
      el("div", { class: "carte-bloc" }, el("h3", { class: "titre-s", text: "Le programme en PDF" }), el("p", { class: "pied", text: "Heure par heure, avec les cartes, à imprimer ou garder dans Fichiers." }), el("a", { class: "btn bleu", href: "fichiers/programme.pdf", target: "_blank", rel: "noopener", text: "Ouvrir le PDF" })),
      el("div", { class: "carte-bloc" }, el("h3", { class: "titre-s", text: "Dans votre agenda" }), el("p", { class: "pied", text: "Toutes les étapes avec l'adresse et le trajet. Sur iPhone, touchez le fichier puis « Tout ajouter »." }), el("a", { class: "btn", href: "fichiers/voyage.ics", text: "Ajouter à l'agenda" })),
      el("div", { class: "carte-bloc" }, el("h3", { class: "titre-s", text: "Dans Google Maps" }), el("p", { class: "pied", text: "Importez ce fichier dans Google My Maps (Créer une carte → Importer) : un calque par jour, visible ensuite dans l'appli Google Maps." }), el("a", { class: "btn", href: "fichiers/voyage.kml", text: "Télécharger le fichier KML" })),
      el("div", { class: "carte-bloc" }, el("h3", { class: "titre-s", text: "Installer l'appli" }),
        el("p", { class: "pied", text: ios ? "Dans Safari : bouton Partager, puis « Sur l'écran d'accueil ». L'appli s'ouvre alors en plein écran, même sans réseau." : "Dans le menu du navigateur : « Installer l'application » ou « Ajouter à l'écran d'accueil »." }), etatT)));
};

/* ================================================================ apparence */
function appliquerTheme(v) {
  lset("theme", v);
  if (v === "clair" || v === "sombre") document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme;
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.content = sombre() ? "#000000" : "#f5f5f7";
  dispatchEvent(new Event("nyc26-theme"));
}

/* ================================================================ service worker (hors connexion) */
const etatTuiles = { pret: false, pct: null, octets: 0 };
const abonnesTuiles = new Set();
function brancherSW() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  navigator.serviceWorker.register("sw.js").then(reg => {
    navigator.serviceWorker.addEventListener("message", ev => {
      if (ev.data?.type === "tuiles") { Object.assign(etatTuiles, ev.data); abonnesTuiles.forEach(f => f(etatTuiles)); }
    });
    navigator.serviceWorker.ready.then(r => r.active && r.active.postMessage({ type: "tuiles?" }));
  }).catch(() => {});
}

/* ================================================================ navigation */
const ONGLETS = [["aujourdhui", "Aujourd'hui"], ["programme", "Programme"], ["carte", "Carte"], ["reveillon", "Réveillon"], ["plus", "Plus"]];
const SOUS_PLUS = ["resa", "pass", "options", "jeux", "infos", "fichiers", "verif"];
function route() { const h = (location.hash || "#aujourdhui").slice(1).split("?")[0]; return h || "aujourdhui"; }
function rendre() {
  Sync.abonnes.clear(); abonnesTuiles.clear(); libererCartes();
  const r = route();
  let vue;
  if (/^j\d\d$/.test(r)) { const j = D.jours.find(x => ancre(x.iso) === r); vue = V.jour(j ? j.iso : jourCourant()); }
  else vue = (V[r] || V.aujourdhui)();
  const app = $("#app");
  app.replaceChildren(...[vue].flat());
  app.className = r === "carte" ? "plein" : "";
  const actif = /^j\d\d$/.test(r) ? "programme" : SOUS_PLUS.includes(r) ? "plus" : (V[r] ? r : "aujourdhui");
  for (const a of document.querySelectorAll(".onglets a, .liens a")) a.removeAttribute("aria-current");
  document.querySelectorAll(`.onglets a[data-o="${actif}"], .liens a[data-o="${actif}"]`).forEach(a => a.setAttribute("aria-current", "page"));
  document.title = { aujourdhui: "New York · Noël 2026", programme: "Programme · NY Noël", carte: "Carte · NY Noël", reveillon: "Réveillon · NY Noël", plus: "Plus · NY Noël" }[actif];
}
function construireNav() {
  const href = id => id === "programme" ? "#" + ancre(jourCourant()) : "#" + id;
  $("#onglets").replaceChildren(...ONGLETS.map(([id, t]) => { const a = el("a", { href: href(id), dataset: { o: id } }); a.innerHTML = ICONES[id]; a.append(el("span", { text: t })); return a; }));
  $(".liens").replaceChildren(...ONGLETS.map(([id, t]) => el("a", { href: href(id), dataset: { o: id }, text: t })));
}

/* ================================================================ démarrage */
let D;
async function demarrer() {
  try {
    const r = await fetch("data.json", { cache: "no-cache" });
    D = await r.json();
  } catch (e) {
    $("#app").replaceChildren(el("section", { class: "chargement" }, el("h1", { text: "Programme indisponible" }), el("p", { text: "Ouvrez l'appli une première fois avec du réseau pour l'enregistrer sur le téléphone." })));
    return;
  }
  construireNav(); brancherFeuille(); Sync.init(); brancherSW();
  addEventListener("hashchange", () => { rendre(); scrollTo({ top: 0 }); });
  rendre();
  setInterval(() => { if (route() === "aujourdhui" && !simu.jour && document.visibilityState === "visible" && $("#feuille").hidden) rendre(); }, 60000);
}
demarrer();
})();
