// Ponte entre a API admin da Órion (somente leitura) e o dashboard da Central.
// O token NUNCA vai para o navegador: fica na variável de ambiente ORION_ADMIN_TOKEN.
// Estratégia: cada dia fechado é agregado uma vez e guardado (Netlify Blobs); hoje é recalculado a cada ~60 s.
// A API limita 60 req/min e janelas de 31 dias, então o histórico é preenchido aos poucos (mais recente primeiro).
import { getStore } from "./_store.mjs";
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
const hubEscala = n => { const t = nrm(n); if (/expedic/.test(t)) return /sion/.test(t) ? "exp" : null;       // só "Expedição Sion (dia/noite)"; "Expedição CN" não entra
  return /cidade nova|\bcn\b/.test(t) ? "cn" : /buritis/.test(t) ? "bur" : /castelo/.test(t) ? "cas" : /sion/.test(t) ? "sion" : null; };

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
const tipoErro = e => { const c = nrm(e.comments || "");
  if (/embal|sacola|vazou|amassad|derram|lacre|derret/.test(c)) return "emb";
  if ((e.replacement_product && nrm(e.replacement_product)) || /errad|incorret|no lugar|ao inves|outra loja|trocad|troca|2 itens|dois produtos|a mais|em excesso/.test(c)) return "troc";
  if (/nao (foi )?(enviad|enivad|entreg|veio|tinha)|nao enviou|nao enviaram|faltou|faltand|incomplet|apenas (1|um|uma)\b|sem estoque|no estoque/.test(c)) return "falt";
  if (/atras|demor|motoboy|entregador/.test(c)) return "atr";
  return "out"; };                                                                           // sem descrição ou outro motivo (ex.: operação não aceitou o pedido)

// Varandas: erro = pedido cancelado por item faltante, errado, não enviado ou trocado. Definição da Ví (25/11/2026): só esses; qualquer outro motivo NÃO conta.
// Fora da regra (não contam): desistência, pagamento, cliente não encontrado, veículo, atraso, duplicado etc.
// "emb" (embalagem) e "qual" (qualidade/transporte) ficam registrados na lista, mas NÃO contam como erro.
const CONTA_QUALIDADE = false;
function tipoCancel(motivo) {
  const t = nrm(String(motivo || "").replace(/\s+/g, " "));
  if (!t || t === "null") return null;
  if (/embalagem|derram|vazou|selad|lacre|amassad/.test(t)) return "emb";
  if (/missing_item|faltand|faltou|faltante|nao (foi )?(enviad|enivad|entreg\w* o item)|incomplet|sem o item|nao veio/.test(t)) return "falt";
  if (/itens? errad|veio errad|salada veio errada|em vez de|no lugar de|trocad|outras? (sobremesa|item|produto)s?|produto errado|item errado/.test(t)) return "troc";
  if (/improprio|violad|revirad|nao esta apto|caracteristica de qualidade|damaged_on_transport|item indisponivel|desatualizado/.test(t)) return "qual";
  return null;
}
function regCancel(e, x, id, tipo) {
  return { id: x.id, dia: e.dia, origem: "cancelamento", conta: tipo === "falt" || tipo === "troc", reportadoEm: x.canceled_at ?? null, reportadoPor: x.business_name ?? null, hubApi: x.hub ?? null, negocio: x.business_name ?? null, unidade: x.unit_name ?? null,
    hub: id, tipo, produto: null, troca: null, trocaAutorizada: null, perdaFinanceira: false, comentario: String(x.cancellation_reason || "").replace(/\s+/g, " ").trim(), conclusao: null, finalizadoEm: x.finished_at ?? null,
    pedidoId: x.id ?? null, pedidoRef: x.reference ?? null, pedidoTotal: x.total ?? null, pedidoCriadoEm: x.created_at ?? null, pedidoCanceladoEm: x.canceled_at ?? null };
}
const VARANDAS = new Set(["sion", "cn", "bur", "cas"]);
function somaCancel(e, x) {
  const id = hubDe(x.hub, x.unit_name, x.business_name); if (!id || !VARANDAS.has(id)) return;
  const c = tms(x.created_at); if (c != null && !dentro(id, c)) return;                       // mesma janela dos pedidos
  const tipo = tipoCancel(x.cancellation_reason); if (!tipo) return;
  const r = regCancel(e, x, id, tipo); (e.lista ||= []).push(r);
  if (!r.conta) { e.qualidade = (e.qualidade || 0) + 1; return; }
  const h = e.hubs[id]; h.erros++; h.errTipos[tipo]++;
}

// ---------------------------------------------------------------- agregação de um dia (retomável)
const novoHub = () => ({ pedidos: 0, cancel: 0, erros: 0, errTipos: { falt: 0, troc: 0, emb: 0, atr: 0, out: 0 }, tSoma: 0, tN: 0, horas: Array(24).fill(0) });
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
const CONHECIDOS = new Set(["id", "reported_at", "reported_by", "hub", "business_name", "unit_name", "incorrect_product", "replacement_product", "swap_authorized", "financial_loss", "comments", "conclusion", "finished_at", "order"]);
function regErro(e, x, id) {                                                              // registro permanente de UM erro reportado (nada é descartado)
  const o = x.order || {}, extra = Object.fromEntries(Object.entries(x).filter(([k]) => !CONHECIDOS.has(k)));
  return { id: x.id, dia: e.dia, origem: "relatorio-erros", conta: true, reportadoEm: x.reported_at ?? null, reportadoPor: x.reported_by ?? null, hubApi: x.hub ?? null, negocio: x.business_name ?? null, unidade: x.unit_name ?? null,
    hub: id || null, tipo: tipoErro(x), produto: x.incorrect_product ?? null, troca: x.replacement_product ?? null, trocaAutorizada: x.swap_authorized ?? null, perdaFinanceira: !!x.financial_loss,
    comentario: x.comments ?? null, conclusao: x.conclusion ?? null, finalizadoEm: x.finished_at ?? null,
    pedidoId: o.id ?? null, pedidoRef: o.reference ?? null, pedidoTotal: o.total ?? null, pedidoCriadoEm: o.created_at ?? null, pedidoCanceladoEm: o.canceled_at ?? null,
    ...(Object.keys(extra).length ? { extra } : {}) };
}
function somaErro(e, x) {
  const id = hubDe(x.hub, x.unit_name, x.business_name);
  const r = regErro(e, x, id); (e.lista ||= []).push(r);
  if (!id) { e.semHub++; return; }
  if (id !== "exp") { r.conta = false; return; }                                             // relatório de erros = Expedição; Varandas contam pelos cancelamentos
  const h = e.hubs[id]; h.erros++; h.errTipos[tipoErro(x)]++;
}
const ROTAS = { orders: "/reports/orders", errors: "/reports/order-errors", cancel: "/reports/cancellations" };
const PROX = { orders: "errors", errors: "cancel" };
async function avancaDia(e, ctx) {
  while (!e.fim) {
    let r;
    try { r = await api(ROTAS[e.fase], { from: e.dia, to: e.dia, page: e.pag, per_page: PER, ...(e.fase === "orders" ? { cancellation_status: "all" } : {}) }, ctx); }
    catch (err) {
      // erros e cancelamentos são complementares: se falharem (ex.: 500 da API), o dia fecha com os pedidos e tenta de novo depois
      if (e.fase !== "orders" && err instanceof ApiErro && ![0, 401, 429].includes(err.status)) { e.errosFalhou = err.status; e.errosTent = Date.now(); e.fim = true; break; }
      throw err;
    }
    for (const x of r.data || []) ({ orders: somaPedido, errors: somaErro, cancel: somaCancel })[e.fase](e, x);
    const ult = r.meta?.last_page ?? 1;
    if (e.pag >= ult || !(r.data || []).length) { if (PROX[e.fase]) { e.fase = PROX[e.fase]; e.pag = 1; } else e.fim = true; } else e.pag++;
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
            const mm = z => { const [h, m] = String(z || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
            const a = mm(t.inicio); let f = mm(t.fim); if (f <= a) f += 1440;
            for (let x = Math.floor(a / 60); x * 60 < f; x++) { const ov = Math.min(f, (x + 1) * 60) - Math.max(a, x * 60); if (ov > 0) hh.h[x % 24] += cheias * ov / 60; }
          }
        }
        out[dia] = por;
      }
    }
  } catch (err) { out.__erro = String(err.message || err); }
  return out;
}

// ---------------------------------------------------------------- orquestração
const LOGV = 5;                                                                            // versão do diário de erros (subir força refazer a fase de erros)
const PV = 3;                                                                              // versão da regra de contagem de pessoas
const chaveDia = d => `v3/dia/${d}`;
const fechado = (d, agora) => agora >= Date.parse(d + "T00:00:00Z") - TZ * HOUR + DAY + 2 * HOUR;       // 2 h depois da meia-noite local

export async function atualizar({ ate = DIAS, max = ORCAMENTO_REQ } = {}) {
  const agora = Date.now(), hoje = isoOf(agora), ctx = { req: 0, max };
  const dias = Array.from({ length: ate }, (_, i) => addDays(hoje, i - ate + 1)), pend = [];
  let erro = null, escalaErro = null;
  // pessoas da escala: refaz (sem tocar na API) quando a regra mudou ou nos últimos dias, que ainda podem ser preenchidos
  try {
    const rev = [];
    for (const d of dias) { if (rev.length >= 10) break; const reg = await getJ(chaveDia(d)); if (reg?.fim && (reg.pv !== PV || (d >= addDays(hoje, -2) && agora - (reg.pEm || 0) > 600000))) rev.push([d, reg]); }
    if (rev.length) { const pp = await pessoasDoDia(rev.map(x => x[0])); if (pp.__erro) escalaErro = pp.__erro;
      else for (const [d, reg] of rev) { reg.pessoas = pp[d] || null; reg.pv = PV; reg.pEm = agora; await putJ(chaveDia(d), reg); } }
  } catch (e) { escalaErro = String(e.message || e); }
  const alvo = [];                                                                       // ordem: hoje, depois do mais novo para o mais antigo
  for (const d of [...dias].reverse()) {
    const reg = await getJ(chaveDia(d)), parc = await getJ(`v3/parc/${d}`);
    const rever = (reg?.errosFalhou && Date.now() - (reg.errosTent || 0) > 10 * 60000) || (reg?.fim && !reg.errosFalhou && reg.logv !== LOGV);          // só os erros, sem refazer os pedidos (nova tentativa ou diário ainda não gravado)
    const precisa = parc || rever || !reg || (d === hoje ? agora - (reg.em || 0) > AO_VIVO_MS : !reg.final && fechado(d, agora));
    if (precisa) alvo.push({ d, parc, reg });
  }
  for (const { d, parc, reg } of alvo) {
    let e = parc || novoEstado(d);
    if (!parc && reg?.fim && (reg.errosFalhou || reg.logv !== LOGV)) { e = { ...reg, fase: "errors", pag: 1, fim: false, errosFalhou: null, lista: [], qualidade: 0 }; for (const h of Object.values(e.hubs)) { h.erros = 0; h.errTipos = { falt: 0, troc: 0, emb: 0, atr: 0, out: 0 }; } }
    try {
      e = await avancaDia(e, ctx);
      e.em = Date.now(); e.final = fechado(d, agora); e.pv = PV; e.pEm = Date.now();
      const p = await pessoasDoDia([d]); if (p.__erro) escalaErro = p.__erro; e.pessoas = p[d] || null;
      if (!e.errosFalhou) e.logv = LOGV;
      if (!e.errosFalhou) await putJ(`log/erros/${d}`, { dia: d, atualizado: Date.now(), n: (e.lista || []).length, registros: e.lista || [] });   // diário permanente dos erros
      delete e.lista;
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
  const out = { days: faixa, byHub: {}, hourly: {}, hourlyDia: {}, errTypes: undefined };
  const R = Object.fromEntries(regs); let semEscala = 0, semHub = 0;
  for (const id of HUBS) {
    out.byHub[id] = faixa.map(d => {
      const r = R[d], h = r.hubs[id] || novoHub(), p = r.pessoas?.[id];
      const hj = horasJanela(id), horas = d === hoje ? Math.min(janela(id).h, horasDecorridas(id, agora)) : janela(id).h;
      let pessoas = 0;
      if (p && p.tem) { const hs = hj.map(i => p.h[i]).filter(x => x > 0); pessoas = hs.length ? hs.reduce((a, b) => a + b, 0) / hs.length : 0; }
      if (!pessoas && h.pedidos) semEscala++;                                           // dia sem escala lançada: fica de fora da produtividade
      return { date: d, pedidos: h.pedidos, pessoas: +pessoas.toFixed(2), cabecas: p && p.tem ? p.total : 0, horas: +horas.toFixed(2), cancel: h.cancel, erros: h.erros, errTipos: { out: 0, ...h.errTipos }, tempo: h.tN ? +(h.tSoma / h.tN).toFixed(1) : 0 };
    });
    out.hourlyDia[id] = faixa.map(d => ({ p: Array.from({ length: 24 }, (_, hh) => R[d].hubs[id]?.horas[hh] || 0), q: Array.from({ length: 24 }, (_, hh) => +(R[d].pessoas?.[id]?.h?.[hh] || 0).toFixed(1)) }));   // por dia, para o fluxo por hora acompanhar o período escolhido
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

// estudo da produtividade: como ela se distribui hora a hora e dia a dia (para definir uma meta realista)
async function estudoProd(dias = 30) {
  const hoje = isoOf(Date.now()), ds = Array.from({ length: dias }, (_, i) => addDays(hoje, i - dias));          // só dias fechados
  const pct = (a, q) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return +b[Math.min(b.length - 1, Math.floor(q * b.length))].toFixed(1); };
  const out = { periodo: [ds[0], ds[ds.length - 1]], hubs: {} };
  const regs = await Promise.all(ds.map(d => getJ(chaveDia(d))));
  for (const id of HUBS) {
    const hj = horasJanela(id), horaHora = [], dia = [], porHora = Array.from({ length: 24 }, () => ({ n: 0, p: 0, d: 0 })); let sn = 0, sp = 0, dd = 0, semEsc = 0; const cab = [], sem = {}, pedDia = [], cabN = [];
    regs.forEach(r => { if (!r?.fim) return; const h = r.hubs?.[id], pe = r.pessoas?.[id]; if (!h || !h.pedidos) return;
      if (!pe || !pe.tem || !hj.some(x => pe.h[x] > 0)) { semEsc++; return; }
      let dn = 0, dp = 0; for (const x of hj) { const n = h.horas[x], q = pe.h[x]; if (q > 0) { horaHora.push({ x, v: n / q, n, q }); dn += n; dp += q; porHora[x].n += n; porHora[x].p += q; porHora[x].d++; } }
      if (dp) { dia.push(dn / dp); sn += dn; sp += dp; dd++; }
      if (pe.total > 0) { const v = h.pedidos / pe.total; cab.push(v); (sem[dowOf(r.dia)] ||= []).push(v); pedDia.push(h.pedidos); cabN.push(pe.total); } });
    const vs = horaHora.map(o => o.v), topo = [...horaHora].sort((a, b) => b.n - a.n).slice(0, Math.max(1, Math.round(horaHora.length * 0.25)));
    out.hubs[id] = { diasComEscala: dd, diasSemEscala: semEsc, geralPedidosPorPessoaHora: sp ? +(sn / sp).toFixed(1) : null,
      porCabeca: { dias: cab.length, pedidosPorDiaMedio: cab.length ? +(pedDia.reduce((a, b) => a + b, 0) / cab.length).toFixed(0) : null, pessoasPorDiaMedio: cab.length ? +(cabN.reduce((a, b) => a + b, 0) / cab.length).toFixed(1) : null, p25: pct(cab, .25), p50: pct(cab, .5), p75: pct(cab, .75), p90: pct(cab, .9), max: pct(cab, .999), porDiaSemana: Object.fromEntries(Object.entries(sem).map(([k, v]) => [["dom", "seg", "ter", "qua", "qui", "sex", "sab"][k], pct(v, .5)])) },
      porDia: { p25: pct(dia, .25), p50: pct(dia, .5), p75: pct(dia, .75), p90: pct(dia, .9), max: pct(dia, .999) },
      porHora: { p25: pct(vs, .25), p50: pct(vs, .5), p75: pct(vs, .75), p90: pct(vs, .9), max: pct(vs, .999) },
      horasDePico25pct: topo.length ? { pedidosPorHoraMedio: +(topo.reduce((a, o) => a + o.n, 0) / topo.length).toFixed(1), pessoasMedio: +(topo.reduce((a, o) => a + o.q, 0) / topo.length).toFixed(1), pedidosPorPessoaHora: +(topo.reduce((a, o) => a + o.n, 0) / topo.reduce((a, o) => a + o.q, 0)).toFixed(1) } : null,
      curvaPorHora: porHora.map((o, x) => o.d ? { h: x, pedidosPorHora: +(o.n / o.d).toFixed(1), pessoas: +(o.p / o.d).toFixed(1), pedPorPessoaHora: +(o.n / o.p).toFixed(1) } : null).filter(Boolean) };
  }
  return out;
}


// ---------------------------------------------------------------- diário de erros (documentação)
// ?de=&ate= (AAAA-MM-DD, padrão: últimos 30 dias) · ?hub=sion|cn|exp|... · ?conferir=1 compara o diário com o total da API · ?raw=1 busca ao vivo (diagnóstico)
export async function listaErros(q) {
  const hoje = isoOf(Date.now()), ate = q.get("ate") || hoje, de = q.get("de") || addDays(ate, -29);
  if (q.get("raw")) {
    const ctx = { req: 0, max: 12 }, out = [], vistoDia = {}; let pag = 1, tot = null;
    for (;;) { const r = await api("/reports/order-errors", { from: de, to: ate, page: pag, per_page: PER }, ctx); tot = r.meta?.total ?? tot; out.push(...(r.data || [])); if (pag >= (r.meta?.last_page ?? 1) || !(r.data || []).length) break; pag++; }
    for (const x of out) { const d = String(x.reported_at || "").slice(0, 10); vistoDia[d] = (vistoDia[d] || 0) + 1; }
    return { totalApi: tot, lidos: out.length, porDiaReportado: vistoDia, registros: out };
  }
  const dias = []; for (let d = de; d <= ate; d = addDays(d, 1)) dias.push(d);
  const logs = await Promise.all(dias.map(d => getJ(`log/erros/${d}`)));
  const todos = logs.flatMap(l => l?.registros || []), naoContados = todos.filter(r => r.conta === false), porMotivoNaoConta = naoContados.reduce((o, r) => { const k = (r.origem === "cancelamento" ? "cancelamento/" + r.tipo + ": " : "relatório de erros fora da Expedição: ") + String(r.comentario || "").slice(0, 90); o[k] = (o[k] || 0) + 1; return o; }, {});
  let regs = todos.filter(r => r.conta !== false); const hub = q.get("hub"); if (hub) regs = regs.filter(r => (hub === "sem" ? !r.hub : r.hub === hub));
  const conta = (f) => regs.reduce((o, r) => { const k = f(r) ?? "(vazio)"; o[k] = (o[k] || 0) + 1; return o; }, {});
  const out = { de, ate, total: regs.length, diasDocumentados: logs.filter(Boolean).length, diasSemRegistro: dias.filter((d, i) => !logs[i]), porHub: conta(r => r.hub || "sem hub"), porLoja: conta(r => r.reportadoPor), porTipo: conta(r => r.tipo), porNegocio: conta(r => r.negocio), naoContados: naoContados.length, porMotivoNaoConta, registros: regs.sort((a, b) => String(b.reportadoEm).localeCompare(String(a.reportadoEm))) };
  if (q.get("conferir")) { const r = await api("/reports/order-errors", { from: de, to: ate, page: 1, per_page: 1 }, { req: 0, max: 3 }); out.conferencia = { totalApi: r.meta?.total ?? null, totalDiario: todos.filter(x => x.origem !== "cancelamento").length, confere: (r.meta?.total ?? null) === todos.filter(x => x.origem !== "cancelamento").length }; }
  return out;
}


// diagnóstico dos cancelamentos: campos e motivos reais (?de=&ate=)
export async function motivosCancel(q) {
  const hoje = isoOf(Date.now()), ate = q.get("ate") || hoje, de = q.get("de") || addDays(ate, -29), ctx = { req: 0, max: 14 }, out = [];
  let pag = 1, tot = null;
  for (;;) { const r = await api("/reports/cancellations", { from: de, to: ate, page: pag, per_page: PER }, ctx); tot = r.meta?.total ?? tot; out.push(...(r.data || [])); if (pag >= (r.meta?.last_page ?? 1) || !(r.data || []).length) break; pag++; }
  const hf = q.get("hub"); if (hf) { const keep = out.filter(x => hubDe(x.hub, x.unit_name, x.business_name) === hf); out.length = 0; out.push(...keep); }
  const conta = f => out.reduce((o, x) => { const k = String(f(x) ?? "(vazio)").replace(/\s+/g, " ").slice(0, 220); o[k] = (o[k] || 0) + 1; return o; }, {});
  return { totalApi: tot, lidos: out.length, campos: out[0] ? Object.keys(out[0]) : [], exemplo: out[0] || null, porHub: conta(x => x.hub), porNegocio: conta(x => x.business_name),
    motivos: Object.fromEntries(Object.keys(out[0] || {}).filter(k => /reason|motivo|category|type|cause|origin|status/i.test(k)).map(k => [k, conta(x => typeof x[k] === "object" ? JSON.stringify(x[k]) : x[k])])) };
}

export async function rotaDash(req, path, { json, isAdmin }) {
  if (!isAdmin(req)) return json({ error: "Não autorizado" }, 401);
  if (path === "/api/dash/estudo") { try { return json(await estudoProd(Number(new URL(req.url).searchParams.get("dias")) || 30)); } catch (e) { return json({ error: String(e.message || e) }, 500); } }
  if (path === "/api/dash/escala") { const dia = new URL(req.url).searchParams.get("dia") || isoOf(Date.now()); try { return json(await sondaEscala(dia)); } catch (e) { return json({ error: String(e.message || e) }, 500); } }
  if (path === "/api/dash/erros") { try { return json(await listaErros(new URL(req.url).searchParams)); } catch (e) { return json({ error: String(e.message || e) }, 500); } }
  if (path === "/api/dash/cancel") { try { return json(await motivosCancel(new URL(req.url).searchParams)); } catch (e) { return json({ error: String(e.message || e) }, 500); } }
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
