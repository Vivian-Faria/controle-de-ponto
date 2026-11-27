// Conexão com o Postgres (Railway). Só é usada quando DATABASE_URL existe; sem ela, o sistema continua no Netlify Blobs.
import pg from "pg";

let pool = null, pronto = null;
export const temBanco = () => !!process.env.DATABASE_URL;

export function banco() {
  if (!pool) {
    const url = process.env.DATABASE_URL, local = /@(localhost|127\.0\.0\.1|postgres\.railway\.internal)[:/]/.test(url) || /sslmode=disable/.test(url);
    pool = new pg.Pool({ connectionString: url, max: Number(process.env.PG_POOL_MAX || 8), ssl: local ? false : { rejectUnauthorized: false }, idleTimeoutMillis: 30000 });
    pool.on("error", e => console.error("[pg] conexão ociosa caiu:", e.message));
  }
  return pool;
}

// tabelas: kv (substitui o Netlify Blobs) e fsdocs (substitui os Firestores, mesma estrutura de documentos)
export function preparar() {
  return (pronto ||= banco().query(`
    create table if not exists kv (store text not null, key text not null, value text not null, upd bigint not null default 0, primary key (store, key));
    create table if not exists fsdocs (proj text not null, col text not null, id text not null, data jsonb not null, upd bigint not null, primary key (proj, col, id));
    create index if not exists fsdocs_col on fsdocs (proj, col);
  `).catch(e => { pronto = null; throw e; }));
}
export async function q(sql, params) { await preparar(); return banco().query(sql, params); }
