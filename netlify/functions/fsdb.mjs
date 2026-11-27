// Banco de documentos (substitui os dois Firestores: "central" = compras/operações/demandas; "escala" = escala operacional).
// Guarda cada documento como JSON no Postgres e reproduz o que o código usava do Firestore:
//   set com merge profundo, arrayUnion/arrayRemove, serverTimestamp, lotes atômicos, transação com versão, consulta com where e "ouvir" por versão.
import { q, banco, preparar } from "./_pg.mjs";

const PROJ = { central: new Set(["compras_pedidos"]), escala: new Set(["config", "escalas", "aprovacoes"]) };
const isObj = v => v && typeof v === "object" && !Array.isArray(v);
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sent = v => isObj(v) && typeof v.$fs === "string" ? v : null;

// resolve o valor novo contra o que já existe naquele campo
function resolver(novo, atual, merge, agora) {
  const s = sent(novo);
  if (s) {
    if (s.$fs === "ts") return new Date(agora).toISOString();
    const base = Array.isArray(atual) ? atual : [], v = Array.isArray(s.v) ? s.v : [];
    if (s.$fs === "union") return [...base, ...v.filter(x => !base.some(y => igual(x, y)))];
    if (s.$fs === "remove") return base.filter(y => !v.some(x => igual(x, y)));
    return null;
  }
  if (Array.isArray(novo)) return novo.map(x => resolver(x, undefined, false, agora));
  if (isObj(novo)) {
    const base = merge && isObj(atual) ? { ...atual } : {};
    for (const [k, v] of Object.entries(novo)) base[k] = resolver(v, merge && isObj(atual) ? atual[k] : undefined, merge, agora);
    return base;
  }
  return novo;
}
export const aplicar = (atual, dados, merge, agora) => resolver(dados, atual, !!merge, agora);

// regras de acesso (as mesmas do Firestore de antes; a escala só pede login para config e aprovações)
function pode(proj, col, id, op, dados, admin) {
  if (!PROJ[proj]?.has(col)) return false;
  if (op === "read") return true;
  if (proj === "central") return op === "set" && dados?.id === id;
  if (col === "escalas") return op === "set";
  return admin;      // config e aprovacoes: só o administrador
}

const compara = { "==": (a, b) => a === b, "<": (a, b) => a < b, "<=": (a, b) => a <= b, ">": (a, b) => a > b, ">=": (a, b) => a >= b };
function filtrar(rows, where) {
  return rows.filter(r => (where || []).every(([f, op, v]) => op === "in" ? (Array.isArray(v) && v.includes(r.data?.[f])) : compara[op]?.(r.data?.[f], v)));
}
export async function consultar(proj, col, where = []) {
  // filtros de texto vão para o SQL; o resto (números, booleanos) o JS confere em seguida
  const par = [proj, col], cond = [];
  for (const [f, op, v] of where) {
    if (!/^[A-Za-z0-9_]+$/.test(f)) continue;
    if (op === "in" && Array.isArray(v) && v.every(x => typeof x === "string")) { par.push(f, v); cond.push(`data->>$${par.length - 1} = any($${par.length})`); }
    else if (compara[op] && typeof v === "string") { par.push(f, v); cond.push(`data->>$${par.length - 1} ${op === "==" ? "=" : op} $${par.length}`); }
  }
  const r = await q(`select id, data, upd from fsdocs where proj=$1 and col=$2 ${cond.length ? "and " + cond.join(" and ") : ""} order by id`, par);
  return filtrar(r.rows.map(x => ({ id: x.id, data: x.data, upd: Number(x.upd) })), where);
}
const versao = docs => `${docs.length}:${docs.reduce((m, d) => Math.max(m, d.upd), 0)}`;

export async function lerDoc(proj, col, id) { const r = await q("select data, upd from fsdocs where proj=$1 and col=$2 and id=$3", [proj, col, id]); return r.rows[0] ? { data: r.rows[0].data, upd: Number(r.rows[0].upd) } : null; }

// grava um lote inteiro numa transação; ifUpd (opcional) garante que ninguém mexeu no documento desde a leitura
export async function gravarLote(proj, ops, admin) {
  await preparar();
  for (const o of ops) if (!pode(proj, o.col, o.id, o.op, o.data, admin)) { const e = new Error(`Sem permissão para ${o.op} em ${o.col}/${o.id}.`); e.status = 403; throw e; }
  const c = await banco().connect();
  try {
    await c.query("begin");
    const agora = Date.now(), pend = new Map();
    for (const o of [...ops].sort((a, b) => (a.col + a.id).localeCompare(b.col + b.id))) {      // ordem fixa evita travas cruzadas
      const k = o.col + "/" + o.id;
      const r = pend.has(k) ? { rows: [{ data: pend.get(k).data, upd: pend.get(k).upd }] } : await c.query("select data, upd from fsdocs where proj=$1 and col=$2 and id=$3 for update", [proj, o.col, o.id]);
      const atual = r.rows[0] ? r.rows[0].data : undefined, updAtual = r.rows[0] ? Number(r.rows[0].upd) : 0;
      if (o.ifUpd != null && Number(o.ifUpd) !== updAtual) { await c.query("rollback"); const e = new Error("Documento alterado por outra pessoa."); e.status = 409; throw e; }
      const upd = Math.max(agora, updAtual + 1);
      if (o.op === "delete") { await c.query("delete from fsdocs where proj=$1 and col=$2 and id=$3", [proj, o.col, o.id]); pend.set(k, { data: undefined, upd }); continue; }
      const novo = aplicar(o.merge ? atual : undefined, o.data, o.merge, agora);
      await c.query("insert into fsdocs (proj,col,id,data,upd) values ($1,$2,$3,$4,$5) on conflict (proj,col,id) do update set data=excluded.data, upd=excluded.upd", [proj, o.col, o.id, JSON.stringify(novo), upd]);
      pend.set(k, { data: novo, upd });
    }
    await c.query("commit"); return { ok: true };
  } catch (e) { try { await c.query("rollback"); } catch { /* já revertido */ } throw e; } finally { c.release(); }
}

// leitura da escala para o motor de alertas (no lugar da API do Firebase)
export async function lerEscalaDB(datas) {
  const [cfg, docs] = await Promise.all([lerDoc("escala", "config", "principal"), consultar("escala", "escalas", [["data", "in", datas]])]);
  if (!cfg) throw new Error("A escala não respondeu (config).");
  const c = cfg.data || {}, out = {};
  for (const d of docs) out[`${d.data.hubId}_${d.data.data}`] = { ...d.data, __upd: d.upd };
  return { cfg: { hubs: c.hubs || [], turnos: c.turnos || [], colaboradores: c.colaboradores || [] }, docs: out };
}

// rotas /api/fs/<projeto>/...  (ctx.admin(req): true quando há login de administrador)
export async function rotaFs(req, path, { json, admin }) {
  const [, , , proj, a, b] = path.split("/");      // ["", "api", "fs", proj, col|"lote", id]
  if (!PROJ[proj]) return json({ error: "Projeto inválido." }, 404);
  const ehAdmin = !!admin(req);
  try {
    if (a === "lote" && req.method === "POST") {
      const body = await req.json().catch(() => null); if (!body || !Array.isArray(body.ops) || body.ops.length > 500) return json({ error: "Lote inválido." }, 400);
      const ops = body.ops.map(o => ({ op: o.op === "delete" ? "delete" : "set", col: String(o.col || ""), id: String(o.id || ""), data: o.data, merge: !!o.merge, ifUpd: o.ifUpd ?? null }));
      if (ops.some(o => !o.col || !o.id || o.id.includes("/"))) return json({ error: "Lote inválido." }, 400);
      return json(await gravarLote(proj, ops, ehAdmin));
    }
    if (req.method !== "GET") return json({ error: "Método inválido." }, 405);
    if (!a || !PROJ[proj].has(a)) return json({ error: "Coleção inválida." }, 404);
    if (b) { const d = await lerDoc(proj, a, b); return json(d ? { exists: true, data: d.data, upd: d.upd } : { exists: false, data: null, upd: 0 }); }
    const u = new URL(req.url); let where = []; try { where = JSON.parse(u.searchParams.get("where") || "[]"); } catch { return json({ error: "Filtro inválido." }, 400); }
    const docs = await consultar(proj, a, where), ver = versao(docs);
    if (u.searchParams.get("ver") === ver) return json({ ver, igual: true });
    return json({ ver, docs });
  } catch (e) { return json({ error: e.message }, e.status || 500); }
}
