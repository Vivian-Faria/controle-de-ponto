// Ponte entre a API admin da Órion (somente leitura) e o dashboard da Central.
// O token NUNCA vai para o navegador: fica na variável de ambiente ORION_ADMIN_TOKEN.
// Estratégia: cada dia fechado é agregado uma vez e guardado (Netlify Blobs); hoje é recalculado a cada ~60 s.
// A API limita 60 req/min e janelas de 31 dias, então o histórico é preenchido aos poucos (mais recente primeiro).
import { getStore } from "@netlify/blobs";
import { lerEscala, isoOf } from "./alerta.mjs";

const TZ = parseFloat((process.env.TZ_OFFSET_HOURS ?? "-3").toString()), HOUR = 3600000, DAY = 86400000;
const BASE = (process.env.ORION_ADMIN_URL || "https://admin.orioncloudkitchens.com.br/api/admin/v1").replace(/\/+$/, "");
const TOKEN = () => process.env.ORION_ADMIN_TOKEN || "";
const DIAS = 60, PER = 100, ORCAMENTO_REQ = 12, AO_VIVO_MS = 60000;
const st = () => getStore({ name: "dash", consistency: "strong" });
const getJ = async k => { try { return await st().get(k, { type: "json" }); } catch { return null; } };
const putJ = (k, v) => st().setJSON(k, v);

// ---------------------------------------------------------------- hubs
export const HUBS = ["sion", "cn", "bur", "cas", "exp"];
const nrm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
let extra = []; try { extra = Object.entries(JSON.parse(process.env.ORION_HUB_MAP || "{}")).map(([k, v]) => [nrm(k), v]); } catch { /* mapa opcional */ }
// Regras de identificação (definidas pela Vívian, comparação exata do texto, sem acento/maiúscula):
//   Varanda Sion  = pedidos do estabelecimento "Varanda 1389"
//   Varanda CN    = pedidos do estabelecimento "Varanda 1389 CN"
//   Expedição     = pedidos cujo hub é "DS Sion"
//   Buritis e Castelo: ainda sem dados na API, então não recebem pedido algum.
export function hubDe(hub, unidade, negocio) {
  const t = [nrm(hub), nrm(unidade), nrm(negocio)].join(" | ");
  for (const [k, v] of extra) if (t.includes(k)) return v;
  if (nrm(hub) === "ds sion") return "exp";
  if (nrm(negocio) === "varanda 1389 cn") return "cn";
  if (nrm(negocio) === "varanda 1389") return "sion";
  return null;
}
// nomes de hub da ESCALA (outro sistema) -> id da Central
const hubEscala = n => { const t = nrm(n); return /expedic/.test(t) ? "exp" : /cidade nova|\bcn\b/.test(t) ? "cn" : /buritis/.test(t) ? "bur" : /castelo/.test(t) ? "cas" : /sion/.test(t) ? "sion" : null; };

// ---------------------------------------------------------------- horário de funcionamento (minutos do dia, hora local)
// Sion: 09:30 às 00:30. Demais hubs: 11h às 23h. Pedidos fora da janela não entram nos indicadores.
const JANELA = { sion: { ini: 570, fim: 30, h: 15 } }, JANELA_PADRAO = { ini: 660, fim: 1380, h: 12 };
const janela = id => JANELA[id] || JANELA_PADRAO;
const dentro = (id, ms) => { const w = janela(id), t = ((Math.floor((ms + TZ * HOUR) / 60000) % 1440) + 1440) % 1440; return w.ini < w.fim ? t >= w.ini && t < w.fim : t >= w.ini || t < w.fim; };
const horasJanela = id => { const w = janela(id), o = []; for (let m = w.ini, n = 0; n < w.h * 2; n++, m = (m + 30) % 1440) { const h = Math.floor(m / 60); if (!o.includes(h)) o.push(h); } return o; };
const horasDecorridas = (id, agora) => { const w = janela(id), t = (((Math.floor((agora + TZ * HOUR) / 60000)) % 1440) + 1440) % 1440;
  const m = w.ini < w.fim ? Math.min(Math.max(t - w.ini, 0), w.fim - w.ini) : Math.min(t, w.fim) + Math.max(t - w.ini, 0); return Math.max(0.25, m / 60); };

// ---------------------------------------------------------------- tempo
const tms = s => { if (!s) return null; s = String(s); if (/(z|[+-]\d\d:?\d\d)$/i.test(s)) { const v = Date.parse(s); return Number.isFinite(v) ? v : null; }
  const m = /^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)(?::(\d\d))?/.exec(s); if (!m) return null; return Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - TZ * HOUR; };
const horaDe = ms => new Date(ms + TZ * HOUR).getUTCHours();
const addDays = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") + n * DAY).toISOString().slice(0, 10);
const dowOf = iso => new Date(iso + "T12:00:00Z").getUTCDay();

// ---------------------------------------------------------------- cliente da API
const rl = { ate: 0 };
class ApiErro extends Error { constructor(status, msg) { super(msg); this.status = status; } }
async function api(path, params, ctx) {
  if (!TOKEN()) throw new ApiErro(500, "Falta definir ORION_ADMIN_TOKEN nas variáveis de ambiente do Netlify.");
  if (Date.now() < rl.ate) throw new ApiErro(429, "Limite de requisições da API atingido; aguardando.");
  if (ctx && ctx.req >= ctx.max) throw new ApiErro(0, "orçamento");
  if (ctx) ctx.req++;
  const u = new URL(BASE + path); for (const [k, v] of Object.entries(params || {})) if (v != null) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { Accept: "application/json", Authorization: `Bearer ${TOKEN()}` }, signal: AbortSignal.timeout(8000) });
  if (r.status === 429) { rl.ate = Date.now() + (Number(r.headers.get("retry-after")) || 60) * 1000; throw new ApiErro(429, "Limite de requisições da API atingido."); }
  if (r.status === 401) throw new ApiErro(401, "A API recusou o token (401). Confira ORION_ADMIN_TOKEN.");
  if (r.status === 422) throw new ApiErro(422, "A API recusou o período (422).");
  if (!r.ok) throw new ApiErro(r.status, `A API respondeu ${r.status}.`);
  return r.json();
}

// ---------------------------------------------------------------- classificação dos erros
const tipoErro = e => { const t = nrm([e.comments, e.conclusion, e.incorrect_product, e.replacement_product].join(" "));
  if (/embal|vazou|amassad|derram|lacre/.test(t)) return "emb";
  if (/atras|demor|coleta|motoboy|entregador/.test(t)) return "atr";
  if (e.replacement_product && nrm(e.replacement_product)) return "troc";
  if (/troc|errad|incorret|outro produto/.test(t)) return "troc";
  return "falt"; };

// ---------------------------------------------------------------- agregação de um dia (retomável)
const novoHub = () => ({ pedidos: 0, cancel: 0, erros: 0, errTipos: { falt: 0, troc: 0, emb: 0, atr: 0 }, tSoma: 0, tN: 0, horas: Array(24).fill(0) });
const novoEstado = dia => ({ dia, fase: "orders", pag: 1, hubs: Object.fromEntries(HUBS.map(h => [h, novoHub()])), semHub: 0, vistos: { hubs: {}, unidades: {}, negocios: {} }, fim: false });
function somaPedido(e, o) {
  const k = o.hub, ctx = e.vistos; const rot = [o.hub, o.unit_name, o.business_name];
  for (const [bag, v] of [["hubs", o.hub], ["unidades", o.unit_name], ["negocios", o.business_name]]) { const n = String(v ?? "(vazio)"); if (Object.keys(ctx[bag]).length < 40 || n in ctx[bag]) ctx[bag][n] = (ctx[bag][n] || 0) + 1; }
  const id = hubDe(o.hub, o.unit_name, o.business_name); if (!id) { e.semHub++; return; }
  const c = tms(o.created_at); if (c != null && !dentro(id, c)) { e.fora = (e.fora || 0) + 1; return; }      // fora do horário de funcionamento do hub
  const h = e.hubs[id]; h.pedidos++;
  if (c != null) h.horas[horaDe(c)]++;
  if (o.status === "canceled" || o.canceled_at) { h.cancel++; return; }
  const p = tms(o.ready_to_collect_at); if (c != null && p != null) { const m = (p - c) / 60000; if (m >= 0 && m <= 240) { h.tSoma += m; h.tN++; } }
}
function somaErro(e, x) {
  const id = hubDe(x.hub, x.unit_name, x.business_name); if (!id) { e.semHub++; return; }
  const h = e.hubs[id]; h.erros++; h.errTipos[tipoErro(x)]++;
}
async function avancaDia(e, ctx) {
  while (!e.fim) {
    const rota = e.fase === "orders" ? "/reports/orders" : "/reports/order-errors";
    let r;
    try { r = await api(rota, { from: e.dia, to: e.dia, page: e.pag, per_page: PER, ...(e.fase === "orders" ? { cancellation_status: "all" } : {}) }, ctx); }
    catch (err) {
      // o relatório de erros é complementar: se ele falhar (ex.: 500 da API), o dia fecha com os pedidos e tenta os erros de novo depois
      if (e.fase === "errors" && err instanceof ApiErro && ![0, 401, 429].includes(err.status)) { e.errosFalhou = err.status; e.errosTent = Date.now(); e.fim = true; break; }
      throw err;
    }
    for (const x of r.data || []) (e.fase === "orders" ? somaPedido : somaErro)(e, x);
    const ult = r.meta?.last_page ?? 1;
    if (e.pag >= ult || !(r.data || []).length) { if (e.fase === "orders") { e.fase = "errors"; e.pag = 1; } else e.fim = true; } else e.pag++;
  }
  return e;
}

// ---------------------------------------------------------------- escala (pessoas por hora)
async function pessoasDoDia(dias) {
  const out = {};
  try {
    for (let i = 0; i < dias.length; i += 10) {
      const esc = await lerEscala(dias.slice(i, i + 10));
      const mapa = Object.fromEntries(esc.cfg.hubs.map(h => [h.id, hubEscala(h.nome || h.id)]));
      for (const dia of dias.slice(i, i + 10)) {
        const por = {};
        for (const hub of esc.cfg.hubs) {
          const id = mapa[hub.id]; if (!id) continue; const doc = esc.docs[`${hub.id}_${dia}`]; const hh = por[id] ||= { h: Array(24).fill(0), total: 0, tem: !!doc };
          if (!doc) continue;
          for (const t of esc.cfg.turnos.filter(x => x.hubId === hub.id)) {
            const n = Number(t.vagas?.[dowOf(dia)]) || 0; if (!n) continue;
            const slots = doc.slots?.[t.id] || {}; let cheias = 0;
            for (let v = 0; v < n; v++) { const x = slots[v] ?? slots[String(v)]; const nome = typeof x === "string" ? x : Array.isArray(x?.partes) ? x.partes.find(p => p?.nome)?.nome : x?.nome; if (nome) cheias++; }
            if (!cheias) continue; hh.total += cheias;
            const a = Number(String(t.inicio).split(":")[0]), b = Number(String(t.fim).split(":")[0]); let f = b <= a ? b + 24 : b;
            for (let x = a; x < f; x++) hh.h[x % 24] += cheias;
          }
        }
        out[dia] = por;
      }
    }
  } catch (err) { out.__erro = String(err.message || err); }
  return out;
}

// ---------------------------------------------------------------- orquestração
const chaveDia = d => `v3/dia/${d}`;
const fechado = (d, agora) => agora >= Date.parse(d + "T00:00:00Z") - TZ * HOUR + DAY + 2 * HOUR;       // 2 h depois da meia-noite local

export async function atualizar({ ate = DIAS, max = ORCAMENTO_REQ } = {}) {
  const agora = Date.now(), hoje = isoOf(agora), ctx = { req: 0, max };
  const dias = Array.from({ length: ate }, (_, i) => addDays(hoje, i - ate + 1)), pend = [];
  let erro = null, escalaErro = null;
  const alvo = [];                                                                       // ordem: hoje, depois do mais novo para o mais antigo
  for (const d of [...dias].reverse()) {
    const reg = await getJ(chaveDia(d)), parc = await getJ(`v3/parc/${d}`);
    const rever = reg?.errosFalhou && Date.now() - (reg.errosTent || 0) > 10 * 60000;          // só os erros, sem refazer os pedidos
    const precisa = parc || rever || !reg || (d === hoje ? agora - (reg.em || 0) > AO_VIVO_MS : !reg.final && fechado(d, agora));
    if (precisa) alvo.push({ d, parc, reg });
  }
  for (const { d, parc, reg } of alvo) {
    let e = parc || novoEstado(d);
    if (!parc && reg?.errosFalhou && reg.fim) { e = { ...reg, fase: "errors", pag: 1, fim: false, errosFalhou: null }; for (const h of Object.values(e.hubs)) { h.erros = 0; h.errTipos = { falt: 0, troc: 0, emb: 0, atr: 0 }; } }
    try {
      e = await avancaDia(e, ctx);
      e.em = Date.now(); e.final = fechado(d, agora);
      const p = await pessoasDoDia([d]); if (p.__erro) escalaErro = p.__erro; e.pessoas = p[d] || null;
      await putJ(chaveDia(d), e); try { await st().delete(`v3/parc/${d}`); } catch { /* sem parcial */ }
    } catch (err) {
      await putJ(`v3/parc/${d}`, e);                                                        // guarda o progresso; a dia anterior continua visível
      if (!(err instanceof ApiErro && err.status === 0)) erro = err;
      break;
    }
  }
  return { erro, escalaErro, req: ctx.req };
}

export async function montar() {
  const agora = Date.now(), hoje = isoOf(agora), dias = Array.from({ length: DIAS }, (_, i) => addDays(hoje, i - DIAS + 1));
  const regs = await Promise.all(dias.map(async d => [d, await getJ(chaveDia(d))]));
  let n = 0; for (let i = dias.length - 1; i >= 0 && regs[i][1]?.fim; i--) n++;
  const faixa = dias.slice(dias.length - n);
  const out = { days: faixa, byHub: {}, hourly: {}, errTypes: undefined };
  const R = Object.fromEntries(regs); let semEscala = 0, semHub = 0;
  for (const id of HUBS) {
    out.byHub[id] = faixa.map(d => {
      const r = R[d], h = r.hubs[id] || novoHub(), p = r.pessoas?.[id];
      const hj = horasJanela(id), horas = d === hoje ? Math.min(janela(id).h, horasDecorridas(id, agora)) : janela(id).h;
      let pessoas = 0;
      if (p && p.tem) { const hs = hj.map(i => p.h[i]).filter(x => x > 0); pessoas = hs.length ? hs.reduce((a, b) => a + b, 0) / hs.length : p.total; }
      else if (h.pedidos) semEscala++;
      return { date: d, pedidos: h.pedidos, pessoas: h.pedidos ? Math.max(1, +pessoas.toFixed(1)) : 0, horas: +horas.toFixed(2), cancel: h.cancel, erros: h.erros, errTipos: h.errTipos, tempo: h.tN ? +(h.tSoma / h.tN).toFixed(1) : 0 };
    });
    const rec = faixa.slice(-14); const n = Math.max(1, rec.length);
    out.hourly[id] = Array.from({ length: 24 }, (_, hh) => ({ h: hh, pedidos: Math.round(rec.reduce((a, d) => a + (R[d].hubs[id]?.horas[hh] || 0), 0) / n),
      pessoas: Math.round(rec.reduce((a, d) => a + (R[d].pessoas?.[id]?.h?.[hh] || 0), 0) / n) }));
  }
  for (const d of faixa) semHub += R[d].semHub || 0;
  out.meta = { live: true, atualizado: Math.max(0, ...faixa.map(d => R[d].em || 0)), carregados: faixa.length, total: DIAS, pendente: faixa.length < DIAS, semEscala, semHub, hoje, errosIndisponiveis: faixa.filter(d => R[d].errosFalhou).length };
  return out;
}

// ---------------------------------------------------------------- diagnóstico (valores reais de hub/unidade para ajustar o mapa)
export async function sonda() {
  const r = { token: !!TOKEN(), base: BASE, hoje: isoOf(Date.now()) };
  if (!r.token) return { ...r, erro: "Falta definir ORION_ADMIN_TOKEN nas variáveis de ambiente do Netlify." };
  const ctx = { req: 0, max: 9 };
  try {
    const e = novoEstado(r.hoje);
    for (const dia of [r.hoje, addDays(r.hoje, -1), addDays(r.hoje, -2)]) {
      const p = await api("/reports/orders", { from: dia, to: dia, page: 1, per_page: PER, cancellation_status: "all" }, ctx);
      r.totalDia = r.totalDia || {}; r.totalDia[dia] = p.meta?.total ?? (p.data || []).length;
      for (const o of p.data || []) somaPedido(e, o);
      if ((p.data || []).length) { r.exemplo = r.exemplo || Object.fromEntries(Object.entries(p.data[0]).filter(([k]) => !/customer|name$/.test(k) || /unit|business/.test(k))); }
    }
    r.valores = e.vistos; r.semHub = e.semHub; r.pedidosAmostra = HUBS.map(h => [h, e.hubs[h].pedidos]);
    try {
    const er = await api("/reports/order-errors", { from: addDays(r.hoje, -7), to: r.hoje, page: 1, per_page: 5 }, ctx);
    r.errosSemana = er.meta?.total ?? (er.data || []).length;
    const e30 = await api("/reports/order-errors", { from: addDays(r.hoje, -30), to: r.hoje, page: 1, per_page: 5 }, ctx);
    r.erros30dias = e30.meta?.total ?? (e30.data || []).length; r.resumoErros30 = e30.summary ?? null; r.metaErros = e30.meta ?? null;
    if ((e30.data || []).length) r.exemploErro = Object.fromEntries(Object.entries(e30.data[0]).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 80) : v]));
    } catch (x) { r.errosRelatorioErro = x.message; r.errosRelatorioStatus = x.status; }
    try { const c = await api("/reports/cancellations", { from: addDays(r.hoje, -7), to: r.hoje, page: 1, per_page: 3 }, ctx); r.cancelamentos7dias = c.meta?.total ?? (c.data || []).length; r.resumoCancel = c.summary ?? null;
      if ((c.data || []).length) r.exemploCancel = Object.fromEntries(Object.entries(c.data[0]).filter(([k]) => /reason|hub|unit|business|status|canceled_at/.test(k))); } catch (x) { r.cancelErro = x.message; }
    r.ok = true;
  } catch (err) { r.ok = false; r.erro = err.message; r.status = err.status; }
  return r;
}

// conferência da escala de um dia: como a Central está contando as pessoas de cada hub
async function sondaEscala(dia) {
  const esc = await lerEscala([dia]), dow = dowOf(dia), out = { dia, hubs: [] };
  for (const hub of esc.cfg.hubs) {
    const doc = esc.docs[`${hub.id}_${dia}`], id = hubEscala(hub.nome || hub.id);
    const turnos = esc.cfg.turnos.filter(x => x.hubId === hub.id).map(t => {
      const n = Number(t.vagas?.[dow]) || 0, slots = doc?.slots?.[t.id] || {}, nomes = [];
      for (let v = 0; v < n; v++) { const x = slots[v] ?? slots[String(v)]; const nome = typeof x === "string" ? x : Array.isArray(x?.partes) ? x.partes.map(q => q?.nome).filter(Boolean).join(" / ") : x?.nome; nomes.push(nome || null); }
      return { turno: t.nome || t.id, inicio: t.inicio, fim: t.fim, vagasDoDia: n, preenchidas: nomes.filter(Boolean).length, nomes };
    });
    out.hubs.push({ hub: hub.nome || hub.id, idCentral: id, temDocumentoNoDia: !!doc, turnos });
  }
  return out;
}

export async function rotaDash(req, path, { json, isAdmin }) {
  if (!isAdmin(req)) return json({ error: "Não autorizado" }, 401);
  if (path === "/api/dash/escala") { const dia = new URL(req.url).searchParams.get("dia") || isoOf(Date.now()); try { return json(await sondaEscala(dia)); } catch (e) { return json({ error: String(e.message || e) }, 500); } }
  if (path === "/api/dash/probe") return json(await sonda());
  if (path === "/api/dash" && req.method === "GET") {
    if (!TOKEN()) return json({ error: "Falta definir ORION_ADMIN_TOKEN nas variáveis de ambiente do Netlify.", semToken: true }, 503);
    const r = await atualizar();
    if (r.erro && r.erro.status === 401) return json({ error: r.erro.message }, 502);
    const d = await montar();
    if (!d.days.length) return json({ error: r.erro ? r.erro.message : "Ainda carregando os primeiros dias da API.", carregando: true, meta: d.meta }, 202);
    d.meta.aviso = r.erro ? r.erro.message : r.escalaErro ? "Escala indisponível: pessoas estimadas." : d.meta.errosIndisponiveis ? `Relatório de erros da API indisponível em ${d.meta.errosIndisponiveis} dia(s); erros dessses dias podem estar incompletos.`.replace("dessses", "desses") : null;
    return json(d);
  }
  return json({ error: "Rota não encontrada" }, 404);
}
