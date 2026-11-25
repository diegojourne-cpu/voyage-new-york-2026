/* Service worker : l'appli et ses cartes fonctionnent sans réseau.
   __VERSION__, __TUILES__ et __PRECACHE__ sont remplacés par tools/build.py. */
const VERSION = "__VERSION__";
const APP = "nyc26-app-" + VERSION;
const TUILES = "nyc26-tuiles-__TUILES__";
const PRECACHE = __PRECACHE__;
const URL_TUILES = new URL("tiles/nyc.pmtiles", self.registration.scope).href;

self.addEventListener("install", ev => {
  ev.waitUntil(caches.open(APP).then(c => Promise.all(PRECACHE.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", ev => {
  ev.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("nyc26-") && k !== APP && k !== TUILES) await caches.delete(k);
    await self.clients.claim();
    telechargerTuiles();
  })());
});

async function diffuser(msg) { for (const c of await self.clients.matchAll()) c.postMessage({ type: "tuiles", ...msg }); }

let enCours = null;
function telechargerTuiles() {
  if (enCours) return enCours;
  enCours = (async () => {
    const cache = await caches.open(TUILES);
    const deja = await cache.match(URL_TUILES);
    if (deja) { const b = await deja.blob(); return diffuser({ pret: true, octets: b.size }); }
    try {
      const r = await fetch(URL_TUILES, { cache: "no-store" });
      if (!r.ok || !r.body) throw new Error(r.status);
      const total = +r.headers.get("content-length") || 0;
      const lecteur = r.body.getReader(); const morceaux = []; let recu = 0, dernier = -1;
      for (;;) {
        const { done, value } = await lecteur.read();
        if (done) break;
        morceaux.push(value); recu += value.length;
        const pct = total ? Math.floor(recu / total * 100) : null;
        if (pct !== dernier && pct % 5 === 0) { dernier = pct; diffuser({ pret: false, pct }); }
      }
      const blob = new Blob(morceaux, { type: "application/octet-stream" });
      await cache.put(URL_TUILES, new Response(blob, { headers: { "content-type": "application/octet-stream", "content-length": String(blob.size) } }));
      diffuser({ pret: true, octets: blob.size });
    } catch (e) { enCours = null; diffuser({ pret: false, pct: null }); }
  })();
  return enCours;
}

async function servirTuiles(req) {
  const cache = await caches.open(TUILES);
  const plein = await cache.match(URL_TUILES);
  if (!plein) { telechargerTuiles(); return fetch(req); }
  const blob = await plein.blob();
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.get("range") || "");
  if (!m) return new Response(blob, { headers: { "content-type": "application/octet-stream" } });
  const debut = +m[1], fin = m[2] ? Math.min(+m[2], blob.size - 1) : blob.size - 1;
  return new Response(blob.slice(debut, fin + 1), { status: 206, headers: {
    "content-type": "application/octet-stream", "content-range": `bytes ${debut}-${fin}/${blob.size}`, "content-length": String(fin - debut + 1), "accept-ranges": "bytes" } });
}

self.addEventListener("message", ev => { if (ev.data?.type === "tuiles?") telechargerTuiles(); });

self.addEventListener("fetch", ev => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes("/api/")) return;                       // synchro : toujours le réseau
  if (url.href.split("?")[0] === URL_TUILES) return ev.respondWith(servirTuiles(req));
  const frais = req.mode === "navigate" || url.pathname.endsWith("/data.json") || url.pathname.endsWith(".pdf");
  if (frais) {                                                      // réseau d'abord, cache en secours
    ev.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(APP).then(x => x.put(req.mode === "navigate" ? "./" : req, c)); } return r; })
      .catch(async () => (await caches.match(req, { ignoreSearch: true })) || (await caches.match("./")) || Response.error()));
    return;
  }
  ev.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req).then(res => {
    if (res.ok) { const c = res.clone(); caches.open(APP).then(x => x.put(req, c)); }
    return res;
  })));
});
