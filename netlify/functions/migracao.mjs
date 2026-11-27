// Migração de dados Netlify/Firebase → Postgres (Railway). Protegida por MIGRACAO_TOKEN (variável de ambiente; apague depois da troca).
//   Roda NO RAILWAY: puxa os armazéns do Netlify (função exportar-dados.mjs) e os documentos do Firestore e grava no Postgres. Pode rodar várias vezes (regrava por cima).
import crypto from "node:crypto";
import fs from "node:fs";
import { temBanco, q } from "./_pg.mjs";

const STORES = ["ponto", "alerta", "freela", "dash"];
const ORIGEM = () => (process.env.MIGRACAO_ORIGEM || "https://controle-de-ponto-solides.netlify.app").replace(/\/+$/, "");
const tokenOk = req => { const t = process.env.MIGRACAO_TOKEN || ""; const x = req.headers.get("x-migracao") || ""; return t.length >= 16 && x.length === t.length && crypto.timingSafeEqual(Buffer.from(x), Buffer.from(t)); };

// ---- Firestore (REST público) → objeto JS ----
function fsVal(x) {
  const [k, v] = Object.entries(x)[0];
  if (k === "nullValue") return null; if (k === "stringValue" || k === "booleanValue" || k === "timestampValue") return v;
  if (k === "integerValue" || k === "doubleValue") return Number(v);
  if (k === "arrayValue") return (v.values || []).map(fsVal);
  if (k === "mapValue") return Object.fromEntries(Object.entries(v.fields || {}).map(([a, b]) => [a, fsVal(b)]));
  return v;
}
const fsDoc = d => Object.fromEntries(Object.entries(d.fields || {}).map(([a, b]) => [a, fsVal(b)]));
const leia = (arq, re) => re.exec(fs.readFileSync(new URL(arq, import.meta.url), "utf8"))?.[1];
const PROJETOS = () => [
  { proj: "central", id: leia("../../public/orion/assets/config.js", /projectId:\s*"([^"]+)"/), key: leia("../../public/orion/assets/config.js", /apiKey:\s*"([^"]+)"/), cols: ["compras_pedidos"] },
  { proj: "escala", id: leia("../../public/escala/firebase-config.js", /projectId:\s*"([^"]+)"/), key: leia("../../public/escala/firebase-config.js", /apiKey:\s*"([^"]+)"/), cols: ["config", "escalas", "aprovacoes"] },
];

async function importarFirestore(log) {
  for (const p of PROJETOS()) for (const col of p.cols) {
    let token = "", n = 0, erro = null;
    try { do {
      const r = await fetch(`https://firestore.googleapis.com/v1/projects/${p.id}/databases/(default)/documents/${col}?pageSize=300&key=${p.key}${token ? "&pageToken=" + encodeURIComponent(token) : ""}`, { signal: AbortSignal.timeout(30000) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { erro = j.error?.message || `HTTP ${r.status}`; break; }
      for (const d of j.documents || []) {
        const id = d.name.split("/").pop();
        await q("insert into fsdocs (proj,col,id,data,upd) values ($1,$2,$3,$4,$5) on conflict (proj,col,id) do update set data=excluded.data, upd=excluded.upd", [p.proj, col, id, JSON.stringify(fsDoc(d)), Date.parse(d.updateTime) || Date.now()]);
        n++;
      }
      token = j.nextPageToken || "";
    } while (token); } catch (e) { erro = e.message; }
    log.push({ firestore: `${p.proj}/${col}`, documentos: n, ...(erro ? { erro } : {}) });
  }
}

async function importarBlobs(log, stores) {
  for (const store of stores) {
    let off = 0, n = 0, total = null, erro = null;
    while (off !== null) { try {
      const r = await fetch(`${ORIGEM()}/exportar-dados?store=${store}&offset=${off}&limit=50`, { headers: { "x-migracao": process.env.MIGRACAO_TOKEN }, signal: AbortSignal.timeout(60000) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { erro = j.error || `HTTP ${r.status}`; break; }
      total = j.total;
      for (const it of j.itens) { await q("insert into kv (store,key,value,upd) values ($1,$2,$3,$4) on conflict (store,key) do update set value=excluded.value, upd=excluded.upd", [store, it.key, it.value, Date.now()]); n++; }
      off = j.proximo;
    } catch (e) { erro = e.message; break; } }
    log.push({ armazem: store, copiados: n, naOrigem: total, ...(erro ? { erro } : {}) });
  }
}

export async function rotaMigracao(req, path, { json }) {
  if (!tokenOk(req)) return json({ error: "Não autorizado." }, 403);
  try {
    if (path === "/api/migracao/importar" && req.method === "POST") {
      if (!temBanco()) return json({ error: "Importar só no servidor com Postgres." }, 400);
      const b = await req.json().catch(() => ({})), log = [];
      if (b.firestore !== false) await importarFirestore(log);
      if (b.blobs !== false) await importarBlobs(log, Array.isArray(b.stores) ? b.stores.filter(s => STORES.includes(s)) : STORES);
      return json({ ok: !log.some(l => l.erro), resumo: log });
    }
    return json({ error: "Rota inválida." }, 404);
  } catch (e) { return json({ error: e.message }, 500); }
}
