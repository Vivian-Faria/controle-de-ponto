// Servidor da Central Órion (Railway): serve as páginas de public/, responde /api/* com as mesmas funções de antes
// e roda o vigia (alertas de presença) a cada 5 minutos. Dados no Postgres (DATABASE_URL).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(RAIZ, "public");
const PORTA = Number(process.env.PORT || 8080);
if (!process.env.URL && process.env.RAILWAY_PUBLIC_DOMAIN) process.env.URL = "https://" + process.env.RAILWAY_PUBLIC_DOMAIN;

const { default: api } = await import("../netlify/functions/api.mjs");
const { default: vigia } = await import("../netlify/functions/vigia.mjs");
const { preparar } = await import("../netlify/functions/_pg.mjs");
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL não definida: ligue o serviço ao Postgres (Variables → Add Reference)."); process.exit(1); }
await preparar();

const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".ico": "image/x-icon", ".webp": "image/webp", ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2", ".map": "application/json" };
const SEG = { "X-Content-Type-Options": "nosniff", "X-Frame-Options": "SAMEORIGIN", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

function arquivoDe(pathname) {
  let p; try { p = decodeURIComponent(pathname); } catch { return null; }
  const alvo = path.normalize(path.join(PUBLIC, p));
  if (alvo !== PUBLIC && !alvo.startsWith(PUBLIC + path.sep)) return null;
  try {
    const st = fs.statSync(alvo);
    if (st.isDirectory()) { if (!pathname.endsWith("/")) return { redirect: pathname + "/" }; const i = path.join(alvo, "index.html"); return fs.existsSync(i) ? { file: i } : null; }
    return { file: alvo };
  } catch { return null; }
}

function estatico(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405, SEG).end(); return; }
  const a = arquivoDe(url.pathname);
  if (!a) { res.writeHead(404, { ...SEG, "Content-Type": "text/plain; charset=utf-8" }).end("Não encontrado"); return; }
  if (a.redirect) { res.writeHead(301, { ...SEG, Location: a.redirect + url.search }).end(); return; }
  const ext = path.extname(a.file).toLowerCase(), st = fs.statSync(a.file);
  const h = { ...SEG, "Content-Type": TIPOS[ext] || "application/octet-stream", "Content-Length": st.size, "Last-Modified": st.mtime.toUTCString(),
    "Cache-Control": ext === ".html" || ext === ".js" || ext === ".css" ? "no-cache" : "public, max-age=3600" };
  res.writeHead(200, h); if (req.method === "HEAD") res.end(); else fs.createReadStream(a.file).pipe(res);
}

async function chamarApi(req, res, url) {
  const proto = req.headers["x-forwarded-proto"] || "http", host = req.headers["x-forwarded-host"] || req.headers.host;
  const init = { method: req.method, headers: req.headers };
  if (req.method !== "GET" && req.method !== "HEAD") { init.body = Readable.toWeb(req); init.duplex = "half"; }
  const r = await api(new Request(`${proto}://${host}${req.url}`, init), {});
  const h = {}; const cookies = r.headers.getSetCookie?.() || [];
  r.headers.forEach((v, k) => { if (k !== "set-cookie") h[k] = v; });
  if (cookies.length) h["set-cookie"] = cookies;
  Object.assign(h, SEG, { "cache-control": h["cache-control"] || "no-store" });
  res.writeHead(r.status, h);
  res.end(Buffer.from(await r.arrayBuffer()));
}

const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/healthz") { res.writeHead(200, { "Content-Type": "text/plain" }).end("ok"); return; }
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return await chamarApi(req, res, url);
    estatico(req, res, url);
  } catch (e) {
    console.error("[erro]", req.method, req.url, e);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Erro interno." }));
  }
});
servidor.listen(PORTA, () => console.log(`Central Órion no ar na porta ${PORTA}`));

// vigia: o mesmo agendamento de 5 em 5 minutos que existia no Netlify
let rodando = false;
async function rodarVigia() {
  if (rodando) return; rodando = true;
  try { const r = await vigia(); if (r.status >= 400) console.error("[vigia]", r.status, (await r.text()).slice(0, 200)); } catch (e) { console.error("[vigia] falhou:", e.message); } finally { rodando = false; }
}
if (process.env.VIGIA !== "off") { setTimeout(rodarVigia, 20000); setInterval(rodarVigia, 5 * 60 * 1000); }

for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { servidor.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); });
