// Armazenamento chave-valor. Com DATABASE_URL usa o Postgres; sem ela, o Netlify Blobs de sempre.
// A interface é a mesma do @netlify/blobs usada no projeto: get(key,{type}), set, setJSON, delete, list({prefix}).
import { temBanco, q } from "./_pg.mjs";

const like = p => p.replace(/[\\%_]/g, "\\$&") + "%";

function storePg(name) {
  return {
    async get(key, opt = {}) {
      const r = await q("select value from kv where store=$1 and key=$2", [name, key]); if (!r.rows.length) return null;
      const v = r.rows[0].value; if (opt.type === "json") { try { return JSON.parse(v); } catch { return null; } } return v;
    },
    async set(key, value) { await q("insert into kv (store,key,value,upd) values ($1,$2,$3,$4) on conflict (store,key) do update set value=excluded.value, upd=excluded.upd", [name, key, typeof value === "string" ? value : String(value), Date.now()]); },
    async setJSON(key, value) { return this.set(key, JSON.stringify(value)); },
    async delete(key) { await q("delete from kv where store=$1 and key=$2", [name, key]); },
    async list(opt = {}) { const r = await q("select key from kv where store=$1 and key like $2 escape '\\' order by key", [name, like(opt.prefix || "")]); return { blobs: r.rows.map(x => ({ key: x.key })) }; },
  };
}

export function getStore(opt) {
  const name = typeof opt === "string" ? opt : opt.name;
  if (temBanco()) return storePg(name);
  // Netlify Blobs: carregado só se necessário (no Railway o pacote nem precisa existir)
  const lazy = fn => async (...a) => { const m = await import("@netlify/blobs"); return fn(m.getStore(opt))(...a); };
  return { get: lazy(s => (...a) => s.get(...a)), set: lazy(s => (...a) => s.set(...a)), setJSON: lazy(s => (...a) => s.setJSON(...a)),
    delete: lazy(s => (...a) => s.delete(...a)), list: lazy(s => (...a) => s.list(...a)) };
}
