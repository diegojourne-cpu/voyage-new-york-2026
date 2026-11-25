// Petit serveur statique (avec requêtes « Range », indispensables aux tuiles PMTiles).
// Usage : node tools/serve.mjs [dossier=dist/site] [port=8787]
// Exporte aussi demarrer() pour les scripts de rendu (PDF).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".pbf": "application/x-protobuf",
  ".pmtiles": "application/octet-stream", ".pdf": "application/pdf", ".ics": "text/calendar; charset=utf-8",
  ".kml": "application/vnd.google-earth.kml+xml", ".geojson": "application/geo+json",
};

export function demarrer(racine, port = 0) {
  const root = path.resolve(racine);
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      if (p.startsWith("/api/")) { res.writeHead(503, { "content-type": "application/json" }); return res.end('{"erreur":"synchro absente en local"}'); }
      res.writeHead(404); return res.end("introuvable");
    }
    const taille = fs.statSync(f).size;
    const type = TYPES[path.extname(f)] || "application/octet-stream";
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
    if (m) {
      const debut = m[1] ? +m[1] : taille - +m[2];
      const fin = m[1] && m[2] ? Math.min(+m[2], taille - 1) : taille - 1;
      res.writeHead(206, { "content-type": type, "content-range": `bytes ${debut}-${fin}/${taille}`, "content-length": fin - debut + 1, "accept-ranges": "bytes" });
      return fs.createReadStream(f, { start: debut, end: fin }).pipe(res);
    }
    res.writeHead(200, { "content-type": type, "content-length": taille, "accept-ranges": "bytes" });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(ok => srv.listen(port, "127.0.0.1", () => ok({ srv, port: srv.address().port })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const racine = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "site");
  const { port } = await demarrer(racine, +(process.argv[3] || 8787));
  console.log(`Site servi sur http://127.0.0.1:${port}/`);
}
