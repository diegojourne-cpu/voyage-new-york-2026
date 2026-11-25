// Cloudflare Pages Function — état partagé entre les téléphones de la famille
// (réservations faites, étapes cochées, bingo, votes du réveillon).
// Stockage : Workers KV, lié au projet sous le nom « ETAT » (Réglages → Liaisons).
//   GET  /api/etat  → { resa:{}, bingo:{}, faits:{}, votes:{}, maj }
//   POST /api/etat  { section, cle, valeur }  (valeur null = effacer)

const SECTIONS = new Set(["resa", "bingo", "faits", "votes"]);
const CLE = /^[A-Za-z0-9_.:-]{1,80}$/;
const VIDE = () => ({ resa: {}, bingo: {}, faits: {}, votes: {}, maj: null });
const json = (d, status = 200) => new Response(JSON.stringify(d), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

async function lire(env) {
  const v = await env.ETAT.get("etat", "json");
  return Object.assign(VIDE(), v || {});
}

export async function onRequestGet({ env }) {
  if (!env.ETAT) return json({ erreur: "Stockage non configuré (liaison KV « ETAT » manquante)." }, 503);
  return json(await lire(env));
}

export async function onRequestPost({ request, env }) {
  if (!env.ETAT) return json({ erreur: "Stockage non configuré (liaison KV « ETAT » manquante)." }, 503);
  let op;
  try { op = await request.json(); } catch { return json({ erreur: "JSON invalide" }, 400); }
  const { section, cle, valeur } = op || {};
  if (!SECTIONS.has(section) || !CLE.test(String(cle))) return json({ erreur: "Section ou clé invalide" }, 400);
  const ok = valeur === null || valeur === true || (typeof valeur === "string" && valeur.length <= 40 && CLE.test(valeur));
  if (!ok) return json({ erreur: "Valeur invalide" }, 400);
  const etat = await lire(env);
  if (valeur === null) delete etat[section][cle]; else etat[section][cle] = valeur;
  etat.maj = new Date().toISOString();
  await env.ETAT.put("etat", JSON.stringify(etat));
  return json(etat);
}
