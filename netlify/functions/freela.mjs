// Ponto eletrônico dos freelancers + fila de envio ao DP. Módulo usado por api.mjs.
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

export const UNIDADES = ["Buritis", "Sion", "Cidade Nova", "Castelo", "Expedição Sion"];
export const VALOR_HORA_CENTS = 1250;                 // R$ 12,50 por hora
const LIMITE_ALMOCO_MS = 30 * 60000;                  // até 30 min o almoço não é descontado
const TZ_H = parseFloat((process.env.TZ_OFFSET_HOURS ?? "-3").toString());
const HOUR = 3600000, DAY = 86400000;
const TIPOS = ["entrada", "saida_almoco", "retorno_almoco", "saida_final"];
const ROTULO = { entrada: "Entrada", saida_almoco: "Saída para almoço", retorno_almoco: "Retorno do almoço", saida_final: "Saída final" };
const STATUS_ROTULO = { aguardando: "Aguardando início", atividade: "Em atividade", intervalo: "Em intervalo", concluida: "Jornada concluída", cancelada: "Cancelada" };

const pad = n => String(n).padStart(2, "0");
const lp = ms => { const d = new Date(ms + TZ_H * HOUR); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() }; };
export const isoOf = ms => { const p = lp(ms); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; };
const hhmm = ms => { const p = lp(ms); return `${pad(p.h)}:${pad(p.mi)}`; };
const hhmmss = ms => { const p = lp(ms), s = new Date(ms).getUTCSeconds(); return `${pad(p.h)}:${pad(p.mi)}:${pad(s)}`; };
const localToMs = (iso, hm) => { const [y, m, d] = iso.split("-").map(Number), [h, mi] = hm.split(":").map(Number); return Date.UTC(y, m - 1, d, h, mi) - TZ_H * HOUR; };
const fmtHM = seg => `${pad(Math.floor(seg / 3600))}:${pad(Math.floor((seg % 3600) / 60))}`;
const brl = c => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ------------------------------------------------------------ regras de negócio (puras, testáveis)
export function calcular(m) {
  if (!m || !m.entrada || !m.saida_final || m.saida_final < m.entrada) return null;
  const total = m.saida_final - m.entrada;
  let intervalo = 0, descontado = 0;
  if (m.saida_almoco && m.retorno_almoco && m.retorno_almoco >= m.saida_almoco) {
    intervalo = m.retorno_almoco - m.saida_almoco;
    if (intervalo > LIMITE_ALMOCO_MS) descontado = intervalo;            // acima de 30 min desconta o intervalo inteiro
  }
  const seg = Math.round(Math.max(0, total - descontado) / 1000);
  return { total_seg: seg, intervalo_seg: Math.round(intervalo / 1000), descontado_seg: Math.round(descontado / 1000),
    horas_hm: fmtHM(seg), horas_decimal: Math.round(seg / 36) / 100, valor_hora_cents: VALOR_HORA_CENTS, valor_cents: Math.round(seg * VALOR_HORA_CENTS / 3600) };
}
export const statusDe = j => {
  if (j.cancelada) return "cancelada"; const m = j.marks;
  if (!m.entrada) return "aguardando"; if (m.saida_final) return "concluida";
  return m.saida_almoco && !m.retorno_almoco ? "intervalo" : "atividade";
};
export const proximos = j => {
  const m = j.marks; if (j.cancelada || m.saida_final) return []; if (!m.entrada) return ["entrada"];
  if (m.saida_almoco && !m.retorno_almoco) return ["retorno_almoco"];
  return m.saida_almoco ? ["saida_final"] : ["saida_almoco", "saida_final"];
};
export function validarCPF(v) {
  const c = String(v || "").replace(/\D/g, ""); if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return null;
  for (const n of [9, 10]) { let s = 0; for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i); const d = ((s * 10) % 11) % 10; if (d !== +c[n]) return null; }
  return c;
}
const maskCPF = c => `***.${c.slice(3, 6)}.${c.slice(6, 9)}-**`;
const maskPix = p => p.length <= 6 ? "***" : p.slice(0, 3) + "•••" + p.slice(-2);

export function payloadCsv(j) {
  const c = j.calc || calcular(j.marks), m = j.marks;
  return { id: j.id, origem: "ponto-freelancer", nome: j.nome, cpf: j.cpf, chave_pix: j.pix, unidade: j.unidade, data: j.data,
    entrada: m.entrada ? hhmm(m.entrada) : null, saida_almoco: m.saida_almoco ? hhmm(m.saida_almoco) : null,
    retorno_almoco: m.retorno_almoco ? hhmm(m.retorno_almoco) : null, saida_final: m.saida_final ? hhmm(m.saida_final) : null,
    horas_trabalhadas: c.horas_hm, horas_decimal: c.horas_decimal, valor_hora: c.valor_hora_cents / 100, valor_total: c.valor_cents / 100 };
}

// ------------------------------------------------------------ armazenamento
const store = () => getStore({ name: "freela", consistency: "strong" });
const getJ = async key => { try { return await store().get(key, { type: "json" }); } catch { return null; } };
const putJ = (key, v) => store().set(key, JSON.stringify(v));
// o identificador da jornada NUNCA contém o CPF: usa um código opaco (HMAC do CPF) — igual para o mesmo CPF, impossível de reverter
let SEGREDO = "freela";
const hashCpf = cpf => crypto.createHmac("sha256", SEGREDO).update("cpf:" + cpf).digest("hex").slice(0, 16);
const idOf = (data, cpf) => `${data}_${hashCpf(cpf)}`;
const keyOfId = id => { const [d, c] = String(id).split("_"); return /^\d{4}-\d\d-\d\d$/.test(d || "") && /^[0-9a-f]{16}$/.test(c || "") ? `j/${d}/${c}` : null; };
const locks = new Set();

// ------------------------------------------------------------ envio ao DP (API de integração do Sólides/DP: pagamentos avulsos)
const dpCfg = () => ({ base: (process.env.DP_BASE_URL || "https://sistema-dp-one.vercel.app").trim().replace(/\/+$/, ""), token: (process.env.DP_API_TOKEN || "").trim(), scheme: (process.env.DP_AUTH_SCHEME || "Bearer").trim() });
export const dpConfigurado = () => !!dpCfg().token;
const dpFetch = (path, opt = {}) => { const c = dpCfg(); return fetch(c.base + path, { ...opt, headers: { Authorization: `${c.scheme} ${c.token}`, "Content-Type": "application/json; charset=utf-8", Accept: "application/json" }, signal: AbortSignal.timeout(8500) }); };
const normTxt = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
let hubsCache = null;
async function hubsDP(forcar = false) {
  if (!forcar && hubsCache && Date.now() - hubsCache.t < 600000) return hubsCache.v;
  const r = await dpFetch("/api/integracao/hubs");
  if (r.status === 401) throw new Error("Token do DP recusado (401). Confira DP_API_TOKEN no Netlify.");
  if (!r.ok) throw new Error(`O DP respondeu HTTP ${r.status} ao listar os hubs.`);
  const v = (await r.json()).hubs || []; hubsCache = { t: Date.now(), v }; return v;
}
// unidade do ponto -> hub_id do DP (pelo nome; DP_HUB_MAP='{"Castelo":"<id>"}' sobrescreve/complementa)
function hubIdPara(unidade, hubs) {
  let map = {}; try { map = JSON.parse(process.env.DP_HUB_MAP || "{}"); } catch { /* ignora */ }
  if (map[unidade]) return map[unidade];
  const alias = { "expedicao sion": "Sion", "castelo": "Pampulha" };      // unidade do ponto -> nome do hub no DP, quando os nomes diferem
  const nome = alias[normTxt(unidade)] || unidade;
  return hubs.find(h => normTxt(h.nome) === normTxt(nome))?.id || null;
}
export function payloadDP(j, hubId) {      // formato da documentação do DP; NÃO envia valor (o DP calcula)
  const m = j.marks, o = { tipo: "freelancer", nome: j.nome, cpf: j.cpf, data_trabalho: j.data, hub_id: hubId, pix: j.pix, entrada: hhmm(m.entrada), saida: hhmm(m.saida_final), observacoes: `Ponto eletrônico · jornada ${j.id}` };
  // O DP compara só HH:mm e exige ordem estritamente crescente. Intervalo "colado" na entrada/saída (mesmo minuto) é descartado: dura menos de 1 min, então não é descontado e o valor não muda.
  const mn = ms => Math.floor(ms / 60000);
  if (m.saida_almoco && m.retorno_almoco && mn(m.entrada) < mn(m.saida_almoco) && mn(m.saida_almoco) < mn(m.retorno_almoco) && mn(m.retorno_almoco) < mn(m.saida_final)) { o.saida_intervalo = hhmm(m.saida_almoco); o.retorno_intervalo = hhmm(m.retorno_almoco); }
  return o;
}
// envia um lote (até 500) numa única chamada e trata o resultado item a item, na mesma ordem do envio
async function enviarLote(js) {
  js = js.filter(j => !j.cancelada && statusDe(j) === "concluida" && j.dp?.status !== "enviado");
  const marca = (j, st, erro) => { const dp = j.dp = j.dp || { tentativas: 0 }; dp.status = st; dp.erro = erro || null; dp.ultimaTentativa = Date.now(); if (st === "enviado") dp.enviadoEm = Date.now(); };
  if (!dpConfigurado()) { for (const j of js) marca(j, "pendente", "DP não configurado: defina DP_API_TOKEN nas variáveis do Netlify."); return { configurado: false }; }
  let hubs; try { hubs = await hubsDP(); } catch (e) { for (const j of js) { (j.dp = j.dp || {}).tentativas = ((j.dp || {}).tentativas || 0) + 1; marca(j, "falha", e.message); } return { erro: e.message }; }
  const envio = [], itens = [];
  for (const j of js) {
    if (Math.floor(j.marks.entrada / 60000) >= Math.floor(j.marks.saida_final / 60000)) { marca(j, "falha", "Jornada com menos de 1 minuto: o DP exige a saída depois da entrada (em horas e minutos)."); continue; }
    const hub = hubIdPara(j.unidade, hubs);
    if (!hub) { marca(j, "falha", `A unidade "${j.unidade}" não existe como hub no DP. Cadastre o hub no DP ou defina DP_HUB_MAP no Netlify.`); continue; }
    (j.dp = j.dp || {}).tentativas = (j.dp.tentativas || 0) + 1; envio.push(j); itens.push(payloadDP(j, hub));
  }
  if (!itens.length) return {};
  try {
    const r = await dpFetch("/api/integracao/pagamentos-avulsos", { method: "POST", body: JSON.stringify(itens) });
    if (r.status === 401) { for (const j of envio) marca(j, "falha", "Token do DP recusado (401)."); return { erro: "Token do DP recusado (401). Confira DP_API_TOKEN no Netlify." }; }
    const txt = await r.text().catch(() => ""); let corpo = null; try { corpo = JSON.parse(txt); } catch { /* ignora */ }
    if (!Array.isArray(corpo?.resultados)) { const t = txt.replace(/\s+/g, " ").slice(0, 160); for (const j of envio) marca(j, "falha", `HTTP ${r.status}: ${t}`); return { erro: `O DP respondeu HTTP ${r.status}.` }; }
    const res = corpo.resultados, vistos = new Set();   // o DP também devolve "resultados" item a item em HTTP 422 (ex.: horário inválido)
    for (const x of res) { const j = envio[x.indice]; if (!j) continue; vistos.add(x.indice);
      if (x.status === "criado") marca(j, "enviado"); else if (x.status === "duplicado") marca(j, "enviado", "O DP já tinha este registro (duplicado)."); else marca(j, "falha", x.erro || "O DP recusou o registro."); }
    envio.forEach((j, i) => { if (!vistos.has(i)) marca(j, "falha", "O DP não devolveu resultado para este registro."); });
    return {};
  } catch (e) { const m = "Falha de conexão com o DP: " + (e.name === "TimeoutError" ? "tempo esgotado" : e.message); for (const j of envio) marca(j, "falha", m); return { erro: m }; }
}

// ------------------------------------------------------------ visões
const visaoAberta = j => ({ id: j.id, nome: j.nome, unidade: j.unidade, data: j.data, status: statusDe(j), statusRotulo: STATUS_ROTULO[statusDe(j)],
  ultima: (() => { const t = TIPOS.filter(k => j.marks[k]).pop(); return t ? { tipo: t, rotulo: ROTULO[t], hora: hhmm(j.marks[t]) } : null; })(),
  proximos: proximos(j).map(t => ({ tipo: t, rotulo: ROTULO[t] })) });
const resumo = j => { const c = j.calc || calcular(j.marks); return { nome: j.nome, cpf: j.cpf, pix: j.pix, unidade: j.unidade, data: j.data,
  horarios: TIPOS.filter(t => j.marks[t]).map(t => ({ tipo: t, rotulo: ROTULO[t], hora: hhmmss(j.marks[t]) })),
  intervalo_min: c ? Math.round(c.intervalo_seg / 60) : 0, intervalo_descontado: !!(c && c.descontado_seg), horas: c?.horas_hm, valor_hora: brl(VALOR_HORA_CENTS), valor_total: c ? brl(c.valor_cents) : null,
  aviso: "Valor calculado a receber — não é confirmação de pagamento." }; };
const visaoAdmin = j => { const c = j.calc || calcular(j.marks), st = statusDe(j); return { id: j.id, data: j.data, nome: j.nome, cpf: maskCPF(j.cpf), pix: maskPix(j.pix), unidade: j.unidade,
  status: st, statusRotulo: STATUS_ROTULO[st], marks: Object.fromEntries(TIPOS.map(t => [t, j.marks[t] ? hhmm(j.marks[t]) : null])),
  horas: c?.horas_hm || null, valor: c ? c.valor_cents / 100 : null, ajustes: j.ajustes || [], cancelada: !!j.cancelada, motivoCancel: j.motivoCancel || null,
  incompleta: st !== "concluida" && st !== "cancelada" && j.data < isoOf(Date.now()),
  dp: j.cancelada ? { status: "nao_aplica" } : (j.dp || { status: st === "concluida" ? "pendente" : "aguardando" }) }; };

// ------------------------------------------------------------ rotas
const rate = new Map();
function limite(ip, max = 90) { const w = Math.floor(Date.now() / 60000), k = ip + ":" + w; const n = (rate.get(k) || 0) + 1; rate.set(k, n); if (rate.size > 5000) for (const x of rate.keys()) if (!x.endsWith(":" + w)) rate.delete(x); return n <= max; }

export async function listarPeriodo(d0, d1) {
  const { blobs } = await store().list({ prefix: "j/" });
  const keys = blobs.map(b => b.key).filter(k => { const d = k.split("/")[1]; return d >= d0 && d <= d1; }), out = [];
  for (let i = 0; i < keys.length; i += 20) out.push(...(await Promise.all(keys.slice(i, i + 20).map(getJ))).filter(Boolean));
  return out.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : a.nome.localeCompare(b.nome, "pt-BR")));
}
async function abertas() {
  const { blobs } = await store().list({ prefix: "open/" });
  return (await Promise.all(blobs.map(b => getJ(keyOfId(b.key.slice(5)))))).filter(j => j && !j.marks.saida_final && !j.cancelada);
}

export async function rotaFreela(req, path, ctx) {
  if (ctx.secret) SEGREDO = ctx.secret;
  const { json, isAdmin, isFreela, freelaCookie } = ctx, url = new URL(req.url), q = url.searchParams;
  const ip = req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "?";
  const body = async () => { const t = await req.text(); if (t.length > 4000) throw Object.assign(new Error("Requisição grande demais"), { status: 413 }); try { return JSON.parse(t || "{}"); } catch { throw Object.assign(new Error("JSON inválido"), { status: 400 }); } };
  const erro = (m, s = 400) => json({ error: m }, s);

  // ---- acesso do freelancer: cria uma sessão que só vale para /api/freela/* (nunca para o painel administrativo)
  if (path === "/api/freela/entrar" && req.method === "POST") return json({ ok: true, unidades: UNIDADES }, 200, { "Set-Cookie": freelaCookie() });

  // ---- área administrativa (exige sessão de administrador)
  if (path.startsWith("/api/freela/admin")) {
    if (!isAdmin(req)) return erro("Não autorizado", 401);
    const t = isoOf(Date.now()), d0 = /^\d{4}-\d\d-\d\d$/.test(q.get("start") || "") ? q.get("start") : t.slice(0, 8) + "01", d1 = /^\d{4}-\d\d-\d\d$/.test(q.get("end") || "") ? q.get("end") : t;
    if (path === "/api/freela/admin/jornadas" && req.method === "GET") {
      if ((Date.parse(d1) - Date.parse(d0)) / DAY > 92 || d1 < d0) return erro("Período inválido (máx. 92 dias)");
      const js = (await listarPeriodo(d0, d1)).map(visaoAdmin);
      const tot = { jornadas: 0, horas_seg: 0, valor: 0, pendente: 0, enviado: 0, falha: 0, incompletas: 0 };
      for (const v of js) { if (v.status === "concluida") { tot.jornadas++; tot.valor += v.valor || 0; tot[v.dp.status] = (tot[v.dp.status] || 0) + 1; } if (v.incompleta) tot.incompletas++; }
      tot.valor = Math.round(tot.valor * 100) / 100;
      return json({ start: d0, end: d1, unidades: UNIDADES, dp_configurado: dpConfigurado(), totais: tot, jornadas: js });
    }
    if (path === "/api/freela/admin/jornada" && req.method === "GET") {        // dados completos de uma jornada (CPF e Pix inteiros)
      const key = keyOfId(q.get("id")), j = key && await getJ(key); if (!j) return erro("Jornada não encontrada", 404);
      return json({ ...visaoAdmin(j), cpf_completo: j.cpf, pix_completo: j.pix });
    }
    if (path === "/api/freela/admin/ajustar" && req.method === "POST") {      // só preenche batida que FALTA; nunca sobrescreve uma batida existente
      const b = await body(), key = keyOfId(b.id), j = key && await getJ(key); if (!j) return erro("Jornada não encontrada", 404);
      if (!TIPOS.includes(b.tipo)) return erro("Tipo de batida inválido"); if (j.marks[b.tipo]) return erro("Essa batida já existe e não pode ser alterada.");
      const motivo = String(b.motivo || "").trim(); if (motivo.length < 5) return erro("Informe o motivo do ajuste (mín. 5 caracteres).");
      if (!/^\d{4}-\d\d-\d\d$/.test(b.data || "") || !/^\d{2}:\d{2}$/.test(b.hora || "")) return erro("Data/hora inválida");
      const ms = localToMs(b.data, b.hora), ord = TIPOS.map(k => k === b.tipo ? ms : j.marks[k]);
      const ok = ord.filter(Boolean).every((v, i, a) => i === 0 || v >= a[i - 1]);
      if (!ok || ms > Date.now() + 5 * 60000) return erro("O horário precisa respeitar a ordem das batidas e não pode ser futuro.");
      if (b.tipo !== "entrada" && !j.marks.entrada) return erro("Jornada sem entrada.");
      j.marks[b.tipo] = ms; (j.ajustes = j.ajustes || []).push({ tipo: b.tipo, hora: hhmm(ms), data: isoOf(ms), motivo, em: Date.now() });
      if (j.marks.saida_final) { j.calc = calcular(j.marks); j.dp = { status: "pendente", tentativas: 0 }; await store().delete("open/" + j.id); }
      await putJ(key, j); return json({ ok: true, jornada: visaoAdmin(j) });
    }
    if (path === "/api/freela/admin/cancelar" && req.method === "POST") {      // não apaga: marca como cancelada e guarda o motivo
      const b = await body(), key = keyOfId(b.id), j = key && await getJ(key); if (!j) return erro("Jornada não encontrada", 404);
      const motivo = String(b.motivo || "").trim(); if (motivo.length < 5) return erro("Informe o motivo (mín. 5 caracteres).");
      if (j.dp?.status === "enviado") return erro("Jornada já enviada ao DP; corrija direto no DP.");
      j.cancelada = true; j.motivoCancel = motivo; await store().delete("open/" + j.id); await putJ(key, j); return json({ ok: true });
    }
    if (path === "/api/freela/admin/enviar" && req.method === "POST") {        // envia/reenvia (pendentes e com falha), até 500 por chamada
      const b = await body(); let alvo;
      if (Array.isArray(b.ids)) alvo = (await Promise.all(b.ids.map(i => { const k = keyOfId(i); return k ? getJ(k) : null; }))).filter(Boolean);
      else alvo = await listarPeriodo(d0, d1);
      alvo = alvo.filter(j => statusDe(j) === "concluida" && j.dp?.status !== "enviado"); const restantes = Math.max(0, alvo.length - 500); alvo = alvo.slice(0, 500);
      const r = await enviarLote(alvo); for (const j of alvo) await putJ(keyOfId(j.id), j);
      if (r.configurado === false) return json({ ok: false, error: "DP não configurado: defina DP_API_TOKEN nas variáveis de ambiente do Netlify. Os registros continuam pendentes e guardados.", tentados: 0 });
      const enviados = alvo.filter(j => j.dp.status === "enviado").length, falhas = alvo.length - enviados;
      return json({ ok: !r.erro, error: r.erro || null, enviados, falhas, restantes });
    }
    if (path === "/api/freela/admin/dp-teste" && req.method === "GET") {        // GET /hubs: se voltar a lista, o token está certo
      if (!dpConfigurado()) return json({ ok: false, error: "DP não configurado: defina DP_API_TOKEN no Netlify." });
      try { const hubs = await hubsDP(true); return json({ ok: true, hubs: hubs.map(h => h.nome), unidades: UNIDADES.map(u => ({ unidade: u, hub_no_dp: !!hubIdPara(u, hubs) })) }); }
      catch (e) { return json({ ok: false, error: e.message }); }
    }
    if (path === "/api/freela/admin/export.csv" && req.method === "GET") {
      const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`, rows = (await listarPeriodo(d0, d1)).filter(j => statusDe(j) === "concluida");
      const head = ["id", "data", "unidade", "nome", "cpf", "chave_pix", "entrada", "saida_almoco", "retorno_almoco", "saida_final", "horas_trabalhadas", "valor_hora", "valor_total", "status_dp"];
      const lines = rows.map(j => { const p = payloadCsv(j); return [p.id, p.data, p.unidade, p.nome, p.cpf, p.chave_pix, p.entrada, p.saida_almoco, p.retorno_almoco, p.saida_final, p.horas_trabalhadas, p.valor_hora.toFixed(2).replace(".", ","), String(p.valor_total.toFixed(2)).replace(".", ","), j.dp?.status || "pendente"].map(esc).join(";"); });
      return new Response("﻿" + [head.join(";"), ...lines].join("\r\n"), { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="freelancers_${d0}_${d1}.csv"`, "Cache-Control": "no-store" } });
    }
    return erro("not found", 404);
  }

  // ---- área do freelancer (sessão de freelancer ou administrador)
  if (!isFreela(req) && !isAdmin(req)) return erro("Sessão expirada. Volte à página inicial.", 401);
  if (!limite(ip)) return erro("Muitas requisições. Aguarde um instante.", 429);

  if (path === "/api/freela/abertos" && req.method === "GET") return json({ unidades: UNIDADES, agora: Date.now(), abertos: (await abertas()).map(visaoAberta).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) });

  if (path === "/api/freela/entrada" && req.method === "POST") {
    const b = await body(), nome = String(b.nome || "").replace(/\s+/g, " ").trim(), cpf = validarCPF(b.cpf), pix = String(b.pix || "").trim(), unidade = String(b.unidade || "");
    if (nome.split(" ").length < 2 || nome.length < 5 || nome.length > 120) return erro("Informe o nome completo.");
    if (!cpf) return erro("CPF inválido."); if (pix.length < 5 || pix.length > 140) return erro("Informe a chave Pix.");
    if (!UNIDADES.includes(unidade)) return erro("Escolha a unidade.");
    const agora = Date.now(), data = isoOf(agora), id = idOf(data, cpf), key = keyOfId(id);
    if (locks.has(id)) return erro("Aguarde, registrando…", 429); locks.add(id);
    try {
      const antigas = (await abertas()).find(j => j.cpf === cpf);
      if (antigas) return erro(`Você já tem uma jornada em aberto (${antigas.data.split("-").reverse().join("/")}). Selecione seu nome na lista.`, 409);
      if (await getJ(key)) return erro("Já existe uma jornada sua registrada hoje. Se ela está em aberto, selecione seu nome na lista.", 409);
      const j = { id, data, nome, cpf, pix, unidade, marks: { entrada: agora }, criadoEm: agora };
      await putJ(key, j); await putJ("open/" + id, { id }); return json({ ok: true, jornada: visaoAberta(j) });
    } finally { locks.delete(id); }
  }

  if (path === "/api/freela/bater" && req.method === "POST") {
    const b = await body(), key = keyOfId(b.id); if (!key || !TIPOS.includes(b.tipo) || b.tipo === "entrada") return erro("Pedido inválido");
    const id = String(b.id); if (locks.has(id)) return erro("Aguarde, registrando…", 429); locks.add(id);
    try {
      const j = await getJ(key); if (!j) return erro("Jornada não encontrada", 404);
      if (!proximos(j).includes(b.tipo)) return erro(j.marks.saida_final ? "Esta jornada já foi concluída." : `Sequência inválida. Próximo registro: ${proximos(j).map(t => ROTULO[t]).join(" ou ")}.`, 409);
      const agora = Date.now(), ult = Math.max(...Object.values(j.marks)); if (agora - ult < 10000) return erro("Batida muito rápida; aguarde alguns segundos.", 429);
      j.marks[b.tipo] = agora;
      if (b.tipo === "saida_final") {
        j.calc = calcular(j.marks); j.dp = { status: "pendente", tentativas: 0 }; await store().delete("open/" + id);
        if (dpConfigurado()) await enviarLote([j]);
        await putJ(key, j); return json({ ok: true, concluida: true, resumo: resumo(j) });        // CPF/Pix só aparecem aqui, para quem acabou de bater
      }
      await putJ(key, j); return json({ ok: true, jornada: visaoAberta(j) });
    } finally { locks.delete(id); }
  }
  return erro("not found", 404);
}
/ Ponto eletrônico dos freelancers + fila de envio ao DP. Módulo usado por api.mjs.
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

export const UNIDADES = ["Buritis", "Sion", "Cidade Nova", "Castelo", "Expedição Sion"];
export const VALOR_HORA_CENTS = 1250;                 // R$ 12,50 por hora
const LIMITE_ALMOCO_MS = 30 * 60000;                  // até 30 min o almoço não é descontado
const TZ_H = parseFloat((process.env.TZ_OFFSET_HOURS ?? "-3").toString());
const HOUR = 3600000, DAY = 86400000;
const TIPOS = ["entrada", "saida_almoco", "retorno_almoco", "saida_final"];
const ROTULO = { entrada: "Entrada", saida_almoco: "Saída para almoço", retorno_almoco: "Retorno do almoço", saida_final: "Saída final" };
const STATUS_ROTULO = { aguardando: "Aguardando início", atividade: "Em atividade", intervalo: "Em intervalo", concluida: "Jornada concluída", cancelada: "Cancelada" };

const pad = n => String(n).padStart(2, "0");
const lp = ms => { const d = new Date(ms + TZ_H * HOUR); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() }; };
export const isoOf = ms => { const p = lp(ms); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; };
const hhmm = ms => { const p = lp(ms); return `${pad(p.h)}:${pad(p.mi)}`; };
const hhmmss = ms => { const p = lp(ms), s = new Date(ms).getUTCSeconds(); return `${pad(p.h)}:${pad(p.mi)}:${pad(s)}`; };
const localToMs = (iso, hm) => { const [y, m, d] = iso.split("-").map(Number), [h, mi] = hm.split(":").map(Number); return Date.UTC(y, m - 1, d, h, mi) - TZ_H * HOUR; };
const fmtHM = seg => `${pad(Math.floor(seg / 3600))}:${pad(Math.floor((seg % 3600) / 60))}`;
const brl = c => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ------------------------------------------------------------ regras de negócio (puras, testáveis)
export function calcular(m) {
  if (!m || !m.entrada || !m.saida_final || m.saida_final < m.entrada) return null;
  const total = m.saida_final - m.entrada;
  let intervalo = 0, descontado = 0;
  if (m.saida_almoco && m.retorno_almoco && m.retorno_almoco >= m.saida_almoco) {
    intervalo = m.retorno_almoco - m.saida_almoco;
    if (intervalo > LIMITE_ALMOCO_MS) descontado = intervalo;            // acima de 30 min desconta o intervalo inteiro
  }
  const seg = Math.round(Math.max(0, total - descontado) / 1000);
  return { total_seg: seg, intervalo_seg: Math.round(intervalo / 1000), descontado_seg: Math.round(descontado / 1000),
    horas_hm: fmtHM(seg), horas_decimal: Math.round(seg / 36) / 100, valor_hora_cents: VALOR_HORA_CENTS, valor_cents: Math.round(seg * VALOR_HORA_CENTS / 3600) };
}
export const statusDe = j => {
  if (j.cancelada) return "cancelada"; const m = j.marks;
  if (!m.entrada) return "aguardando"; if (m.saida_final) return "concluida";
  return m.saida_almoco && !m.retorno_almoco ? "intervalo" : "atividade";
};
export const proximos = j => {
  const m = j.marks; if (j.cancelada || m.saida_final) return []; if (!m.entrada) return ["entrada"];
  if (m.saida_almoco && !m.retorno_almoco) return ["retorno_almoco"];
  return m.saida_almoco ? ["saida_final"] : ["saida_almoco", "saida_final"];
};
export function validarCPF(v) {
  const c = String(v || "").replace(/\D/g, ""); if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return null;
  for (const n of [9, 10]) { let s = 0; for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i); const d = ((s * 10) % 11) % 10; if (d !== +c[n]) return null; }
  return c;
}
const maskCPF = c => `***.${c.slice(3, 6)}.${c.slice(6, 9)}-**`;
const maskPix = p => p.length <= 6 ? "***" : p.slice(0, 3) + "•••" + p.slice(-2);

export function payloadCsv(j) {
  const c = j.calc || calcular(j.marks), m = j.marks;
  return { id: j.id, origem: "ponto-freelancer", nome: j.nome, cpf: j.cpf, chave_pix: j.pix, unidade: j.unidade, data: j.data,
    entrada: m.entrada ? hhmm(m.entrada) : null, saida_almoco: m.saida_almoco ? hhmm(m.saida_almoco) : null,
    retorno_almoco: m.retorno_almoco ? hhmm(m.retorno_almoco) : null, saida_final: m.saida_final ? hhmm(m.saida_final) : null,
    horas_trabalhadas: c.horas_hm, horas_decimal: c.horas_decimal, valor_hora: c.valor_hora_cents / 100, valor_total: c.valor_cents / 100 };
}

// ------------------------------------------------------------ armazenamento
const store = () => getStore({ name: "freela", consistency: "strong" });
const getJ = async key => { try { return await store().get(key, { type: "json" }); } catch { return null; } };
const putJ = (key, v) => store().set(key, JSON.stringify(v));
// o identificador da jornada NUNCA contém o CPF: usa um código opaco (HMAC do CPF) — igual para o mesmo CPF, impossível de reverter
let SEGREDO = "freela";
const hashCpf = cpf => crypto.createHmac("sha256", SEGREDO).update("cpf:" + cpf).digest("hex").slice(0, 16);
const idOf = (data, cpf) => `${data}_${hashCpf(cpf)}`;
const keyOfId = id => { const [d, c] = String(id).split("_"); return /^\d{4}-\d\d-\d\d$/.test(d || "") && /^[0-9a-f]{16}$/.test(c || "") ? `j/${d}/${c}` : null; };
const locks = new Set();

// ------------------------------------------------------------ envio ao DP (API de integração do Sólides/DP: pagamentos avulsos)
const dpCfg = () => ({ base: (process.env.DP_BASE_URL || "https://sistema-dp-one.vercel.app").trim().replace(/\/+$/, ""), token: (process.env.DP_API_TOKEN || "").trim(), scheme: (process.env.DP_AUTH_SCHEME || "Bearer").trim() });
export const dpConfigurado = () => !!dpCfg().token;
const dpFetch = (path, opt = {}) => { const c = dpCfg(); return fetch(c.base + path, { ...opt, headers: { Authorization: `${c.scheme} ${c.token}`, "Content-Type": "application/json; charset=utf-8", Accept: "application/json" }, signal: AbortSignal.timeout(8500) }); };
const normTxt = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
let hubsCache = null;
async function hubsDP(forcar = false) {
  if (!forcar && hubsCache && Date.now() - hubsCache.t < 600000) return hubsCache.v;
  const r = await dpFetch("/api/integracao/hubs");
  if (r.status === 401) throw new Error("Token do DP recusado (401). Confira DP_API_TOKEN no Netlify.");
  if (!r.ok) throw new Error(`O DP respondeu HTTP ${r.status} ao listar os hubs.`);
  const v = (await r.json()).hubs || []; hubsCache = { t: Date.now(), v }; return v;
}
// unidade do ponto -> hub_id do DP (pelo nome; DP_HUB_MAP='{"Castelo":"<id>"}' sobrescreve/complementa)
function hubIdPara(unidade, hubs) {
  let map = {}; try { map = JSON.parse(process.env.DP_HUB_MAP || "{}"); } catch { /* ignora */ }
  if (map[unidade]) return map[unidade];
  const alias = { "expedicao sion": "Sion", "castelo": "Pampulha" };      // unidade do ponto -> nome do hub no DP, quando os nomes diferem
  const nome = alias[normTxt(unidade)] || unidade;
  return hubs.find(h => normTxt(h.nome) === normTxt(nome))?.id || null;
}
export function payloadDP(j, hubId) {      // formato da documentação do DP; NÃO envia valor (o DP calcula)
  const m = j.marks, o = { tipo: "freelancer", nome: j.nome, cpf: j.cpf, data_trabalho: j.data, hub_id: hubId, pix: j.pix, entrada: hhmm(m.entrada), saida: hhmm(m.saida_final), observacoes: `Ponto eletrônico · jornada ${j.id}` };
  if (m.saida_almoco && m.retorno_almoco) { o.saida_intervalo = hhmm(m.saida_almoco); o.retorno_intervalo = hhmm(m.retorno_almoco); }
  return o;
}
// envia um lote (até 500) numa única chamada e trata o resultado item a item, na mesma ordem do envio
async function enviarLote(js) {
  js = js.filter(j => !j.cancelada && statusDe(j) === "concluida" && j.dp?.status !== "enviado");
  const marca = (j, st, erro) => { const dp = j.dp = j.dp || { tentativas: 0 }; dp.status = st; dp.erro = erro || null; dp.ultimaTentativa = Date.now(); if (st === "enviado") dp.enviadoEm = Date.now(); };
  if (!dpConfigurado()) { for (const j of js) marca(j, "pendente", "DP não configurado: defina DP_API_TOKEN nas variáveis do Netlify."); return { configurado: false }; }
  let hubs; try { hubs = await hubsDP(); } catch (e) { for (const j of js) { (j.dp = j.dp || {}).tentativas = ((j.dp || {}).tentativas || 0) + 1; marca(j, "falha", e.message); } return { erro: e.message }; }
  const envio = [], itens = [];
  for (const j of js) {
    const hub = hubIdPara(j.unidade, hubs);
    if (!hub) { marca(j, "falha", `A unidade "${j.unidade}" não existe como hub no DP. Cadastre o hub no DP ou defina DP_HUB_MAP no Netlify.`); continue; }
    (j.dp = j.dp || {}).tentativas = (j.dp.tentativas || 0) + 1; envio.push(j); itens.push(payloadDP(j, hub));
  }
  if (!itens.length) return {};
  try {
    const r = await dpFetch("/api/integracao/pagamentos-avulsos", { method: "POST", body: JSON.stringify(itens) });
    if (r.status === 401) { for (const j of envio) marca(j, "falha", "Token do DP recusado (401)."); return { erro: "Token do DP recusado (401). Confira DP_API_TOKEN no Netlify." }; }
    const txt = await r.text().catch(() => ""); let corpo = null; try { corpo = JSON.parse(txt); } catch { /* ignora */ }
    if (!Array.isArray(corpo?.resultados)) { const t = txt.replace(/\s+/g, " ").slice(0, 160); for (const j of envio) marca(j, "falha", `HTTP ${r.status}: ${t}`); return { erro: `O DP respondeu HTTP ${r.status}.` }; }
    const res = corpo.resultados, vistos = new Set();   // o DP também devolve "resultados" item a item em HTTP 422 (ex.: horário inválido)
    for (const x of res) { const j = envio[x.indice]; if (!j) continue; vistos.add(x.indice);
      if (x.status === "criado") marca(j, "enviado"); else if (x.status === "duplicado") marca(j, "enviado", "O DP já tinha este registro (duplicado)."); else marca(j, "falha", x.erro || "O DP recusou o registro."); }
    envio.forEach((j, i) => { if (!vistos.has(i)) marca(j, "falha", "O DP não devolveu resultado para este registro."); });
    return {};
  } catch (e) { const m = "Falha de conexão com o DP: " + (e.name === "TimeoutError" ? "tempo esgotado" : e.message); for (const j of envio) marca(j, "falha", m); return { erro: m }; }
}

// ------------------------------------------------------------ visões
const visaoAberta = j => ({ id: j.id, nome: j.nome, unidade: j.unidade, data: j.data, status: statusDe(j), statusRotulo: STATUS_ROTULO[statusDe(j)],
  ultima: (() => { const t = TIPOS.filter(k => j.marks[k]).pop(); return t ? { tipo: t, rotulo: ROTULO[t], hora: hhmm(j.marks[t]) } : null; })(),
  proximos: proximos(j).map(t => ({ tipo: t, rotulo: ROTULO[t] })) });
const resumo = j => { const c = j.calc || calcular(j.marks); return { nome: j.nome, cpf: j.cpf, pix: j.pix, unidade: j.unidade, data: j.data,
  horarios: TIPOS.filter(t => j.marks[t]).map(t => ({ tipo: t, rotulo: ROTULO[t], hora: hhmmss(j.marks[t]) })),
  intervalo_min: c ? Math.round(c.intervalo_seg / 60) : 0, intervalo_descontado: !!(c && c.descontado_seg), horas: c?.horas_hm, valor_hora: brl(VALOR_HORA_CENTS), valor_total: c ? brl(c.valor_cents) : null,
  aviso: "Valor calculado a receber — não é confirmação de pagamento." }; };
const visaoAdmin = j => { const c = j.calc || calcular(j.marks), st = statusDe(j); return { id: j.id, data: j.data, nome: j.nome, cpf: maskCPF(j.cpf), pix: maskPix(j.pix), unidade: j.unidade,
  status: st, statusRotulo: STATUS_ROTULO[st], marks: Object.fromEntries(TIPOS.map(t => [t, j.marks[t] ? hhmm(j.marks[t]) : null])),
  horas: c?.horas_hm || null, valor: c ? c.valor_cents / 100 : null, ajustes: j.ajustes || [], cancelada: !!j.cancelada, motivoCancel: j.motivoCancel || null,
  incompleta: st !== "concluida" && st !== "cancelada" && j.data < isoOf(Date.now()),
  dp: j.cancelada ? { status: "nao_aplica" } : (j.dp || { status: st === "concluida" ? "pendente" : "aguardando" }) }; };

// ------------------------------------------------------------ rotas
const rate = new Map();
function limite(ip, max = 90) { const w = Math.floor(Date.now() / 60000), k = ip + ":" + w; const n = (rate.get(k) || 0) + 1; rate.set(k, n); if (rate.size > 5000) for (const x of rate.keys()) if (!x.endsWith(":" + w)) rate.delete(x); return n <= max; }

export async function listarPeriodo(d0, d1) {
  const { blobs } = await store().list({ prefix: "j/" });
  const keys = blobs.map(b => b.key).filter(k => { const d = k.split("/")[1]; return d >= d0 && d <= d1; }), out = [];
  for (let i = 0; i < keys.length; i += 20) out.push(...(await Promise.all(keys.slice(i, i + 20).map(getJ))).filter(Boolean));
  return out.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : a.nome.localeCompare(b.nome, "pt-BR")));
}
async function abertas() {
  const { blobs } = await store().list({ prefix: "open/" });
  return (await Promise.all(blobs.map(b => getJ(keyOfId(b.key.slice(5)))))).filter(j => j && !j.marks.saida_final && !j.cancelada);
}

export async function rotaFreela(req, path, ctx) {
  if (ctx.secret) SEGREDO = ctx.secret;
  const { json, isAdmin, isFreela, freelaCookie } = ctx, url = new URL(req.url), q = url.searchParams;
  const ip = req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "?";
  const body = async () => { const t = await req.text(); if (t.length > 4000) throw Object.assign(new Error("Requisição grande demais"), { status: 413 }); try { return JSON.parse(t || "{}"); } catch { throw Object.assign(new Error("JSON inválido"), { status: 400 }); } };
  const erro = (m, s = 400) => json({ error: m }, s);

  // ---- acesso do freelancer: cria uma sessão que só vale para /api/freela/* (nunca para o painel administrativo)
  if (path === "/api/freela/entrar" && req.method === "POST") return json({ ok: true, unidades: UNIDADES }, 200, { "Set-Cookie": freelaCookie() });

  // ---- área administrativa (exige sessão de administrador)
  if (path.startsWith("/api/freela/admin")) {
    if (!isAdmin(req)) return erro("Não autorizado", 401);
    const t = isoOf(Date.now()), d0 = /^\d{4}-\d\d-\d\d$/.test(q.get("start") || "") ? q.get("start") : t.slice(0, 8) + "01", d1 = /^\d{4}-\d\d-\d\d$/.test(q.get("end") || "") ? q.get("end") : t;
    if (path === "/api/freela/admin/jornadas" && req.method === "GET") {
      if ((Date.parse(d1) - Date.parse(d0)) / DAY > 92 || d1 < d0) return erro("Período inválido (máx. 92 dias)");
      const js = (await listarPeriodo(d0, d1)).map(visaoAdmin);
      const tot = { jornadas: 0, horas_seg: 0, valor: 0, pendente: 0, enviado: 0, falha: 0, incompletas: 0 };
      for (const v of js) { if (v.status === "concluida") { tot.jornadas++; tot.valor += v.valor || 0; tot[v.dp.status] = (tot[v.dp.status] || 0) + 1; } if (v.incompleta) tot.incompletas++; }
      tot.valor = Math.round(tot.valor * 100) / 100;
      return json({ start: d0, end: d1, unidades: UNIDADES, dp_configurado: dpConfigurado(), totais: tot, jornadas: js });
    }
    if (path === "/api/freela/admin/jornada" && req.method === "GET") {        // dados completos de uma jornada (CPF e Pix inteiros)
      const key = keyOfId(q.get("id")), j = key && await getJ(key); if (!j) return erro("Jornada não encontrada", 404);
      return json({ ...visaoAdmin(j), cpf_completo: j.cpf, pix_completo: j.pix });
    }
    if (path === "/api/freela/admin/ajustar" && req.method === "POST") {      // só preenche batida que FALTA; nunca sobrescreve uma batida existente
      const b = await body(), key = keyOfId(b.id), j = key && await getJ(key); if (!j) return erro("Jornada não encontrada", 404);
      if (!TIPOS.includes(b.tipo)) return erro("Tipo de batida inválido"); if (j.marks[b.tipo]) return erro("Essa batida já existe e não pode ser alterada.");
      const motivo = String(b.motivo || "").trim(); if (motivo.length < 5) return erro("Informe o motivo do ajuste (mín. 5 caracteres).");
      if (!/^\d{4}-\d\d-\d\d$/.test(b.data || "") || !/^\d{2}:\d{2}$/.test(b.hora || "")) return erro("Data/hora inválida");
      const ms = localToMs(b.data, b.hora), ord = TIPOS.map(k => k === b.tipo ? ms : j.marks[k]);
      const ok = ord.filter(Boolean).every((v, i, a) => i === 0 || v >= a[i - 1]);
      if (!ok || ms > Date.now() + 5 * 60000) return erro("O horário precisa respeitar a ordem das batidas e não pode ser futuro.");
      if (b.tipo !== "entrada" && !j.marks.entrada) return erro("Jornada sem entrada.");
      j.marks[b.tipo] = ms; (j.ajustes = j.ajustes || []).push({ tipo: b.tipo, hora: hhmm(ms), data: isoOf(ms), motivo, em: Date.now() });
      if (j.marks.saida_final) { j.calc = calcular(j.marks); j.dp = { status: "pendente", tentativas: 0 }; await store().delete("open/" + j.id); }
      await putJ(key, j); return json({ ok: true, jornada: visaoAdmin(j) });
    }
    if (path === "/api/freela/admin/cancelar" && req.method === "POST") {      // não apaga: marca como cancelada e guarda o motivo
      const b = await body(), key = keyOfId(b.id), j = key && await getJ(key); if (!j) return erro("Jornada não encontrada", 404);
      const motivo = String(b.motivo || "").trim(); if (motivo.length < 5) return erro("Informe o motivo (mín. 5 caracteres).");
      if (j.dp?.status === "enviado") return erro("Jornada já enviada ao DP; corrija direto no DP.");
      j.cancelada = true; j.motivoCancel = motivo; await store().delete("open/" + j.id); await putJ(key, j); return json({ ok: true });
    }
    if (path === "/api/freela/admin/enviar" && req.method === "POST") {        // envia/reenvia (pendentes e com falha), até 500 por chamada
      const b = await body(); let alvo;
      if (Array.isArray(b.ids)) alvo = (await Promise.all(b.ids.map(i => { const k = keyOfId(i); return k ? getJ(k) : null; }))).filter(Boolean);
      else alvo = await listarPeriodo(d0, d1);
      alvo = alvo.filter(j => statusDe(j) === "concluida" && j.dp?.status !== "enviado"); const restantes = Math.max(0, alvo.length - 500); alvo = alvo.slice(0, 500);
      const r = await enviarLote(alvo); for (const j of alvo) await putJ(keyOfId(j.id), j);
      if (r.configurado === false) return json({ ok: false, error: "DP não configurado: defina DP_API_TOKEN nas variáveis de ambiente do Netlify. Os registros continuam pendentes e guardados.", tentados: 0 });
      const enviados = alvo.filter(j => j.dp.status === "enviado").length, falhas = alvo.length - enviados;
      return json({ ok: !r.erro, error: r.erro || null, enviados, falhas, restantes });
    }
    if (path === "/api/freela/admin/dp-teste" && req.method === "GET") {        // GET /hubs: se voltar a lista, o token está certo
      if (!dpConfigurado()) return json({ ok: false, error: "DP não configurado: defina DP_API_TOKEN no Netlify." });
      try { const hubs = await hubsDP(true); return json({ ok: true, hubs: hubs.map(h => h.nome), unidades: UNIDADES.map(u => ({ unidade: u, hub_no_dp: !!hubIdPara(u, hubs) })) }); }
      catch (e) { return json({ ok: false, error: e.message }); }
    }
    if (path === "/api/freela/admin/export.csv" && req.method === "GET") {
      const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`, rows = (await listarPeriodo(d0, d1)).filter(j => statusDe(j) === "concluida");
      const head = ["id", "data", "unidade", "nome", "cpf", "chave_pix", "entrada", "saida_almoco", "retorno_almoco", "saida_final", "horas_trabalhadas", "valor_hora", "valor_total", "status_dp"];
      const lines = rows.map(j => { const p = payloadCsv(j); return [p.id, p.data, p.unidade, p.nome, p.cpf, p.chave_pix, p.entrada, p.saida_almoco, p.retorno_almoco, p.saida_final, p.horas_trabalhadas, p.valor_hora.toFixed(2).replace(".", ","), String(p.valor_total.toFixed(2)).replace(".", ","), j.dp?.status || "pendente"].map(esc).join(";"); });
      return new Response("﻿" + [head.join(";"), ...lines].join("\r\n"), { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="freelancers_${d0}_${d1}.csv"`, "Cache-Control": "no-store" } });
    }
    return erro("not found", 404);
  }

  // ---- área do freelancer (sessão de freelancer ou administrador)
  if (!isFreela(req) && !isAdmin(req)) return erro("Sessão expirada. Volte à página inicial.", 401);
  if (!limite(ip)) return erro("Muitas requisições. Aguarde um instante.", 429);

  if (path === "/api/freela/abertos" && req.method === "GET") return json({ unidades: UNIDADES, agora: Date.now(), abertos: (await abertas()).map(visaoAberta).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) });

  if (path === "/api/freela/entrada" && req.method === "POST") {
    const b = await body(), nome = String(b.nome || "").replace(/\s+/g, " ").trim(), cpf = validarCPF(b.cpf), pix = String(b.pix || "").trim(), unidade = String(b.unidade || "");
    if (nome.split(" ").length < 2 || nome.length < 5 || nome.length > 120) return erro("Informe o nome completo.");
    if (!cpf) return erro("CPF inválido."); if (pix.length < 5 || pix.length > 140) return erro("Informe a chave Pix.");
    if (!UNIDADES.includes(unidade)) return erro("Escolha a unidade.");
    const agora = Date.now(), data = isoOf(agora), id = idOf(data, cpf), key = keyOfId(id);
    if (locks.has(id)) return erro("Aguarde, registrando…", 429); locks.add(id);
    try {
      const antigas = (await abertas()).find(j => j.cpf === cpf);
      if (antigas) return erro(`Você já tem uma jornada em aberto (${antigas.data.split("-").reverse().join("/")}). Selecione seu nome na lista.`, 409);
      if (await getJ(key)) return erro("Já existe uma jornada sua registrada hoje. Se ela está em aberto, selecione seu nome na lista.", 409);
      const j = { id, data, nome, cpf, pix, unidade, marks: { entrada: agora }, criadoEm: agora };
      await putJ(key, j); await putJ("open/" + id, { id }); return json({ ok: true, jornada: visaoAberta(j) });
    } finally { locks.delete(id); }
  }

  if (path === "/api/freela/bater" && req.method === "POST") {
    const b = await body(), key = keyOfId(b.id); if (!key || !TIPOS.includes(b.tipo) || b.tipo === "entrada") return erro("Pedido inválido");
    const id = String(b.id); if (locks.has(id)) return erro("Aguarde, registrando…", 429); locks.add(id);
    try {
      const j = await getJ(key); if (!j) return erro("Jornada não encontrada", 404);
      if (!proximos(j).includes(b.tipo)) return erro(j.marks.saida_final ? "Esta jornada já foi concluída." : `Sequência inválida. Próximo registro: ${proximos(j).map(t => ROTULO[t]).join(" ou ")}.`, 409);
      const agora = Date.now(), ult = Math.max(...Object.values(j.marks)); if (agora - ult < 10000) return erro("Batida muito rápida; aguarde alguns segundos.", 429);
      j.marks[b.tipo] = agora;
      if (b.tipo === "saida_final") {
        j.calc = calcular(j.marks); j.dp = { status: "pendente", tentativas: 0 }; await store().delete("open/" + id);
        if (dpConfigurado()) await enviarLote([j]);
        await putJ(key, j); return json({ ok: true, concluida: true, resumo: resumo(j) });        // CPF/Pix só aparecem aqui, para quem acabou de bater
      }
      await putJ(key, j); return json({ ok: true, jornada: visaoAberta(j) });
    } finally { locks.delete(id); }
  }
  return erro("not found", 404);
}
