// Exportação temporária dos dados (Netlify Blobs) para a migração ao Railway. Inativa sem MIGRACAO_TOKEN; apague depois da troca.
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

const STORES = ["ponto", "alerta", "freela", "dash"];
const resp = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export default async (req) => {
  const t = process.env.MIGRACAO_TOKEN || "", x = req.headers.get("x-migracao") || "";
  if (t.length < 16 || x.length !== t.length || !crypto.timingSafeEqual(Buffer.from(x), Buffer.from(t))) return resp({ error: "Não autorizado." }, 403);
  const u = new URL(req.url), store = u.searchParams.get("store") || "", off = Math.max(0, Number(u.searchParams.get("offset") || 0)), lim = Math.min(200, Math.max(1, Number(u.searchParams.get("limit") || 50)));
  if (!STORES.includes(store)) return resp({ error: "Armazém inválido." }, 400);
  try {
    const s = getStore({ name: store, consistency: "strong" }), { blobs } = await s.list(), chaves = blobs.map(b => b.key).sort();
    const itens = []; let bytes = 0, i = off;
    for (; i < chaves.length && itens.length < lim && bytes < 3_000_000; i++) { const v = await s.get(chaves[i], { type: "text" }); if (v == null) continue; bytes += v.length; itens.push({ key: chaves[i], value: v }); }
    return resp({ store, total: chaves.length, proximo: i < chaves.length ? i : null, itens });
  } catch (e) { return resp({ error: e.message }, 500); }
};
export const config = { path: "/exportar-dados" };
