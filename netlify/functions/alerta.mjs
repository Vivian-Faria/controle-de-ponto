// Central de alertas de furo de escala: cruza a escala (Firebase do app "escala-operacional") com quem bateu o ponto (Tangerino + freelancers),
// avisa o líder do hub, registra toda a linha do tempo e manda o relatório diário. Usado por api.mjs (rotas) e vigia.mjs (agendado, a cada 5 min).
import { getStore } from "@netlify/blobs";

const TZ = parseFloat((process.env.TZ_OFFSET_HOURS ?? "-3").toString()), HOUR = 3600000, DAY = 86400000;
const ESCALA_SITE = process.env.ESCALA_SITE || "https://escala-operacional-orion.netlify.app";
const BASE_URL = (process.env.URL || "https://controle-de-ponto-solides.netlify.app").replace(/\/+$/, "");
const pad = n => String(n).padStart(2, "0");
const lp = ms => { const d = new Date(ms + TZ * HOUR); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay() }; };
export const isoOf = ms => { const p = lp(ms); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; };
const hm = ms => { const p = lp(ms); return `${pad(p.h)}:${pad(p.mi)}`; };
const toMs = (iso, t) => { const [y, m, d] = iso.split("-").map(Number), [h, mi] = String(t).split(":").map(Number); return Date.UTC(y, m - 1, d, h, mi) - TZ * HOUR; };
const addDays = (iso, n) => { const [y, m, d] = iso.split("-").map(Number), x = new Date(Date.UTC(y, m - 1, d) + n * DAY); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; };
const dowOf = iso => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };   // 0 = domingo, igual ao app da escala
const br = iso => iso.split("-").reverse().join("/");
export const nrm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
function lev(a, b) { const m = a.length, n = b.length; if (!m) return n; if (!n) return m; let p = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[n]; }
// a escala costuma ter só o primeiro nome ("Luna") e o ponto o nome completo; dentro do mesmo hub não há dois nomes iguais
export function mesmoNome(a, b) {
  a = nrm(a); b = nrm(b); if (!a || !b) return false; if (a === b) return true;
  if (b.startsWith(a + " ") || a.startsWith(b + " ")) return true;
  const tok = (x, y) => !x.includes(" ") && x.length >= 4 && y.includes(" ") && y.split(" ").includes(x);      // apelido = um dos nomes (ex.: escala "Luna", ponto "Maria Luna")
  if (tok(a, b) || tok(b, a)) return true;
  return a.includes(" ") && b.includes(" ") && lev(a, b) <= Math.max(1, Math.round(Math.min(a.length, b.length) * 0.22));
}

// ------------------------------------------------------------ armazenamento (Netlify Blobs)
const st = () => getStore({ name: "alerta", consistency: "strong" });
const getJ = async k => { try { return await st().get(k, { type: "json" }); } catch { return null; } };
const putJ = (k, v) => st().setJSON(k, v);
export const lerConfig = async () => (await getJ("cfg")) || null;
export const gravarConfig = c => putJ("cfg", c);
const listar = async prefix => { const { blobs } = await st().list({ prefix }); return (await Promise.all(blobs.map(b => getJ(b.key)))).filter(Boolean); };
const idDe = (...p) => { let h = 0; const s = p.join("|"); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h.toString(36) + s.length.toString(36); };

// ------------------------------------------------------------ leitura da escala (Firestore público do app da escala)
let fbCache = null;
async function firebaseCfg() {
  if (fbCache) return fbCache;
  const t = await (await fetch(ESCALA_SITE + "/firebase-config.js", { signal: AbortSignal.timeout(8000) })).text();
  const g = k => new RegExp(k + '\\s*:\\s*"([^"]+)"').exec(t)?.[1];
  const c = { apiKey: g("apiKey"), projectId: g("projectId") }; if (!c.apiKey || !c.projectId) throw new Error("Não consegui ler a configuração do Firebase da escala.");
  return (fbCache = c);
}
const fsVal = x => { const [k, v] = Object.entries(x)[0]; if (k === "arrayValue") return (v.values || []).map(fsVal); if (k === "mapValue") return Object.fromEntries(Object.entries(v.fields || {}).map(([a, b]) => [a, fsVal(b)])); if (k === "integerValue") return +v; if (k === "nullValue") return null; return v; };
const fsDoc = d => Object.fromEntries(Object.entries(d.fields || {}).map(([a, b]) => [a, fsVal(b)]));
export async function lerEscala(datas) {
  const f = await firebaseCfg(), base = `https://firestore.googleapis.com/v1/projects/${f.projectId}/databases/(default)/documents`;
  const [c, q] = await Promise.all([
    fetch(`${base}/config/principal?key=${f.apiKey}`, { signal: AbortSignal.timeout(9000) }).then(r => r.json()),
    fetch(`${base}:runQuery?key=${f.apiKey}`, { method: "POST", signal: AbortSignal.timeout(9000),
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "escalas" }], where: { fieldFilter: { field: { fieldPath: "data" }, op: "IN", value: { arrayValue: { values: datas.map(stringValue => ({ stringValue })) } } } } } }) }).then(r => r.json())]);
  if (!c.fields) throw new Error("A escala não respondeu (config).");
  if (!Array.isArray(q)) throw new Error("A escala não respondeu (escalas).");
  const cfg = fsDoc(c), docs = {};
  for (const r of q) if (r.document) { const d = fsDoc(r.document); d.__upd = Date.parse(r.document.updateTime) || 0; docs[`${d.hubId}_${d.data}`] = d; }
  return { cfg: { hubs: cfg.hubs || [], turnos: cfg.turnos || [], colaboradores: cfg.colaboradores || [] }, docs };
}

// ------------------------------------------------------------ regra de cruzamento (pura)
const partesDe = v => { const lim = p => { const nome = String(p?.nome || "").replace(/\s+/g, " ").trim(); return nome ? { nome, tipo: p.tipo || "", inicio: p.inicio || "", fim: p.fim || "" } : null; };
  if (!v) return []; if (typeof v === "string") return [lim({ nome: v })].filter(Boolean); if (Array.isArray(v.partes)) return v.partes.map(lim).filter(Boolean); return [lim(v)].filter(Boolean); };
const vagasDe = v => { const o = []; if (v) for (const [k, x] of Object.entries(v)) { const i = Number(k); if (Number.isInteger(i) && i >= 0) o[i] = partesDe(x); } return Array.from(o, x => x || []); };
const na = (lista, nome) => (lista || []).some(x => mesmoNome(x, nome));
// cada pessoa escalada (ou vaga sem ninguém) vira uma "situação" com horário previsto; presença = bateu o ponto no hub certo
// "compareceu" marcado na escala só vale depois do início do turno e se o documento foi editado perto/depois dele (a escala copiada de outro dia traz marcas velhas)
const marcaValida = (doc, ini, agora) => (agora == null || agora >= ini) && (!doc?.__upd || doc.__upd >= ini - 2 * HOUR);
export function situacoes(escala, dia, cfgA, agora = null) {      // agora: marcas de "compareceu" feitas na escala só valem depois do início do turno
  const out = [], dow = dowOf(dia);
  for (const hub of escala.cfg.hubs) {
    const doc = escala.docs[`${hub.id}_${dia}`], hc = cfgA?.hubs?.[hub.id] || {};
    for (const t of escala.cfg.turnos.filter(x => x.hubId === hub.id)) {
      const n = Number(t.vagas?.[dow]) || 0; if (!n) continue;
      const salvas = vagasDe(doc?.slots?.[t.id]), sobress = new Set((escala.cfg.colaboradores || []).filter(c => c.papel === "supervisor").map(c => nrm(c.nome)));
      const creditos = (doc?.folgas?.[t.id] || []).filter(x => sobress.has(nrm(x))).length; let cred = creditos;
      const ini = toMs(dia, t.inicio); let fim = toMs(dia, t.fim); if (fim <= ini) fim += DAY;
      for (let i = 0; i < n; i++) {
        const partes = salvas[i] || [];
        if (!partes.length) { if (cred > 0) { cred--; continue; } out.push({ hubId: hub.id, hubNome: hub.nome, turnoId: t.id, turno: t.nome, vaga: i, vazia: true, nome: "", inicio: ini, fim, dia, tIni: ini, tFim: fim }); continue; }
        for (const [pidx, p] of partes.entries()) {
          const pi = p.inicio ? toMs(dia, p.inicio) : ini; let pf = p.fim ? toMs(dia, p.fim) : fim; if (pf <= pi) pf += DAY;
          const folga = na(doc?.folgas?.[t.id], p.nome), marcouFalta = na(doc?.faltas?.[t.id], p.nome), compareceu = na(doc?.compareceram?.[t.id], p.nome) && marcaValida(doc, pi, agora);
          if (folga) continue;
          out.push({ hubId: hub.id, hubNome: hub.nome, turnoId: t.id, turno: t.nome, vaga: i, pidx, vazia: false, nome: p.nome, tipo: p.tipo, inicio: pi, fim: pf, dia, marcouFalta, compareceu, split: !!(p.inicio || p.fim), tIni: ini, tFim: fim });
        }
      }
      // nomes lançados além do nº de vagas do dia: só contam se a pessoa realmente bater o ponto (nunca geram furo)
      for (let i = n; i < salvas.length; i++) for (const [pidx, p] of (salvas[i] || []).entries()) {
        if (na(doc?.folgas?.[t.id], p.nome)) continue;
        const pi = p.inicio ? toMs(dia, p.inicio) : ini; let pf = p.fim ? toMs(dia, p.fim) : fim; if (pf <= pi) pf += DAY;
        out.push({ hubId: hub.id, hubNome: hub.nome, turnoId: t.id, turno: t.nome, vaga: i, pidx, vazia: false, nome: p.nome, tipo: p.tipo, inicio: pi, fim: pf, dia, marcouFalta: false, compareceu: na(doc?.compareceram?.[t.id], p.nome) && marcaValida(doc, pi, agora), split: !!(p.inicio || p.fim), extra: true, tIni: ini, tFim: fim });
      }
    }
  }
  return out;
}
const casaHub = (pres, hubId, cfgA) => { const hc = cfgA?.hubs?.[hubId] || {};
  if (pres.fonte === "freela") return (hc.freela || []).some(u => nrm(u) === nrm(pres.unidade));
  return !pres.unidade || (hc.ponto || []).some(u => nrm(u) === nrm(pres.unidade)); };         // Tangerino sem hub definido no painel: não dá para descartar
export function chegada(s, pres, cfgA, nome = s.nome) {      // primeira batida da pessoa, no hub certo, a partir de 2 h antes do início
  const achou = pres.filter(p => mesmoNome(p.nome, nome) && casaHub(p, s.hubId, cfgA) && p.t >= s.inicio - 2 * HOUR && p.t <= s.fim).sort((a, b) => a.t - b.t)[0];
  return achou || null;
}
export function foraDoHub(s, pres, cfgA) { return pres.find(p => mesmoNome(p.nome, s.nome) && !casaHub(p, s.hubId, cfgA) && p.t >= s.inicio - 2 * HOUR && p.t <= s.fim) || null; }

// ------------------------------------------------------------ envio (WhatsApp). Sem provedor configurado, a mensagem só fica registrada ("simulado").
async function enviarWA(tel, texto) {
  const url = process.env.WA_API_URL, tok = process.env.WA_API_TOKEN;
  if (!url || !tok) return { estado: "simulado" };
  // Omni Z-API: WA_API_URL = https://api.omni.z-api.io/v1/channels/<ID_DO_CANAL>/messages e WA_API_TOKEN = Secret Key.
  // Qualquer outra URL segue o formato do Z-API clássico (send-text), com WA_API_TOKEN como Client-Token.
  const omni = /\/v1\/channels\/[^/]+\/messages/.test(url);
  const headers = omni ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` } : { "Content-Type": "application/json", "Client-Token": tok };
  const corpo = omni ? { recipient: { identifier: tel }, content: { type: "TEXT", body: { message: texto } } } : { phone: tel, message: texto };
  try {
    const r = await fetch(url, { method: "POST", signal: AbortSignal.timeout(8000), headers, body: JSON.stringify(corpo) });
    if (r.ok) return { estado: "enviado" };
    const det = (await r.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 160);
    return { estado: "erro", erro: `HTTP ${r.status}${det ? " " + det : ""}` };
  } catch (e) { return { estado: "erro", erro: e.message }; }
}
const soDigitos = t => String(t || "").replace(/\D/g, "");
async function notificar(dia, para, texto, meta) {
  const tel = soDigitos(para); const reg = { t: agoraMs(), para: tel ? "…" + tel.slice(-4) : "(sem telefone)", texto, ...meta };
  // Trava: mensagens aos líderes só saem de verdade com WA_LIDERES=sim (as da gestão saem assim que o provedor está ligado).
  if (!tel) reg.estado = "sem_telefone"; else if (meta?.para_quem !== "gestor" && process.env.WA_LIDERES !== "sim") reg.estado = "simulado"; else Object.assign(reg, await enviarWA(tel.startsWith("55") ? tel : "55" + tel, texto));
  await putJ(`out/${dia}/${String(reg.t).padStart(13, "0")}-${Math.random().toString(36).slice(2, 6)}`, reg); return reg;
}
export const tokenFuro = (sign, dia, id) => sign(`furo:${dia}:${id}`);
const linkFuro = (sign, dia, id) => `${BASE_URL}/alerta.html?d=${dia}&f=${id}&t=${tokenFuro(sign, dia, id)}`;


// ------------------------------------------------------------ cadência de mensagens por turno (pura)
const MIN = 60000;
export const tokenTurno = (sign, dia, hubId, ini) => sign(`turno:${dia}:${hubId}:${ini}`);
const linkTurno = (sign, dia, hubId, ini) => `${BASE_URL}/turno.html?d=${dia}&h=${encodeURIComponent(hubId)}&i=${ini}&t=${tokenTurno(sign, dia, hubId, ini)}`;
export function cadenciaTurnos({ dia, agora, sit, furos, cad, cfgA, sign }) {
  const c = cfgA.cadencia || {}, off = { m1: -(c.antes ?? 30), m2: c.m2 ?? 5, m3: c.m3 ?? 10, m4: c.m4 ?? 30, m5: c.m5 ?? 40 }, msgs = [];
  const grupos = new Map();      // um grupo por hub + horário de início do turno
  for (const s of sit) {
    if (s.extra || s.semEscala) continue;
    const ini = s.tIni ?? s.inicio, k = s.hubId + "|" + ini;
    if (!grupos.has(k)) grupos.set(k, { hubId: s.hubId, hubNome: s.hubNome, ini, fim: s.tFim ?? s.fim, itens: [] });
    grupos.get(k).itens.push(s);
  }
  for (const [k, g] of grupos) {
    const st = (cad[k] ||= {});
    const devidos = Object.keys(off).filter(n => st[n] == null && agora >= g.ini + off[n] * MIN);
    if (!devidos.length || agora >= g.fim) continue;
    const n = devidos[devidos.length - 1], venceu = g.ini + off[n] * MIN;
    for (const m of devidos) st[m] = 0;      // passos anteriores que já passaram: não se repetem
    if (agora - venceu > 20 * MIN) continue;      // vigia ligado tarde demais: não manda mensagem atrasada
    const lider = cfgA.hubs?.[g.hubId]?.lider || {}, link = linkTurno(sign, dia, g.hubId, g.ini);
    const porTurno = new Map(); for (const s of g.itens) { if (!porTurno.has(s.turno)) porTurno.set(s.turno, []); porTurno.get(s.turno).push(s); }
    const turnos = [...porTurno.keys()].join(" / "), cab = `*${g.hubNome}* — ${turnos} ${hm(g.ini)}`;
    const status = s => { const f = furos[s.id]; return f?.aCaminho ? "a caminho (você confirmou)" : f?.substituto ? `substituto: ${f.substituto.nome}${f.estado === "trocado" ? " (aguardando chegada)" : ""}` : "sem confirmação"; };
    const nome = s => s.vazia ? "vaga sem ninguém lançado" : s.nome;
    const pend = g.itens.filter(s => !s.cheg && !s.compareceu && !s.coberto);
    const lista = (arr, comStatus) => arr.map(s => `• ${nome(s)}${comStatus ? " — " + status(s) : ""}`).join("\n");
    let texto = null, gestor = null;
    if (n === "m1") {
      const vazias = g.itens.filter(s => s.vazia).length, multi = porTurno.size > 1;
      const quem = [...porTurno].map(([t, a]) => (multi ? `*${t}*\n` : "") + a.filter(s => !s.vazia).map(s => `• ${s.nome}`).join("\n")).filter(Boolean).join("\n");
      texto = `📋 *Escala de hoje — ${g.hubNome}*\n${turnos} · ${hm(g.ini)}\n\nQuem você escalou:\n${quem || "• (ninguém lançado)"}${vazias ? `\n⚠️ ${vazias} vaga${vazias > 1 ? "s" : ""} sem ninguém lançado na escala` : ""}\n\nConfira agora se todos chegam a tempo. Se alguém não vai conseguir, providencie a cobertura antes das ${hm(g.ini)}.`;
    } else if (pend.length) {
      if (n === "m2") texto = `🕗 ${cab}\nAinda sem ponto batido:\n${lista(pend, false)}\n\nQuais deles já confirmaram que estão a caminho? Responda aqui:\n👉 ${link}`;
      else if (n === "m3") texto = `⏰ ${cab}\nSeu tempo para agir está acabando. Ainda sem ponto:\n${lista(pend, pend.some(s => furos[s.id]?.aCaminho || furos[s.id]?.substituto))}\n\nVocê já teve retorno deles ou já está providenciando um freela? Atualize aqui:\n👉 ${link}`;
      else if (n === "m4") texto = `🔁 ${cab}\nContinuam sem bater o ponto:\n${lista(pend, true)}\n\nAlguém vai substituir quem ainda não confirmou? Informe quem é o substituto:\n👉 ${link}`;
      else {
        texto = `🚨 ${cab}\nVocê vai ter um furo na sua escala se não corrigir isso imediatamente.\n\nFalta cobrir:\n${lista(pend, true)}\n\nInforme o substituto agora:\n👉 ${link}`;
        gestor = `🚨 *Furo iminente — ${g.hubNome}*\n${turnos} ${hm(g.ini)}: o líder ${lider.nome || "—"} ainda não resolveu, ${Math.max(0, Math.round((agora - g.ini) / MIN))} min após o início.\n\n${lista(pend, true)}\n\n👉 ${link}`;
      }
    }
    if (!texto) { st[n] = 0; continue; }      // ninguém pendente: nada a cobrar neste passo
    st[n] = agora;
    msgs.push({ tel: lider.tel, texto, meta: { tipo: "cad_" + n, hub: g.hubNome, dia, para_quem: "lider" } });
    if (gestor) msgs.push({ tel: cfgA.gestor?.tel, texto: gestor, meta: { tipo: "escalou", hub: g.hubNome, dia, para_quem: "gestor" } });
  }
  return { msgs, cad };
}

// ------------------------------------------------------------ o vigia
const relogio = { t: null };      // durante o vigia, o "agora" injetado (testável); fora dele, a hora real
const agoraMs = () => relogio.t ?? Date.now();
const evento = (f, tipo, msg, por) => { (f.eventos = f.eventos || []).push({ t: agoraMs(), tipo, msg, ...(por ? { por } : {}) }); };
export async function vigiar(a) { relogio.t = a.agora ?? null; try { return await vigiarInterno({ ...a, agora: a.agora ?? Date.now() }); } finally { relogio.t = null; } }
async function vigiarInterno({ agora, sign, presencas, escala }) {      // presencas: batidas de ontem e de hoje
  const cfgA = await lerConfig(); if (!cfgA?.hubs) return { ok: false, motivo: "sem configuração" };
  const tol = cfgA.tolerancia ?? 15, escalarMin = cfgA.escalarMin ?? 15, lembrar = cfgA.lembreteMin ?? 30, grace = cfgA.graceTrocaMin ?? 30;
  const hoje = isoOf(agora), dias = [addDays(hoje, -1), hoje];
  escala = escala || await lerEscala(dias);
  // apelidos: nome na escala = nome no ponto/freela, quando são diferentes (ex.: "Ana Alice" = "Analice Vital")
  const apel = (cfgA.apelidos || []).filter(a => a?.escala && a?.ponto);
  const pres = apel.length ? presencas.map(p => { const a = apel.find(x => mesmoNome(p.nome, x.ponto)); return a ? { ...p, nome: a.escala } : p; }) : presencas;
  const resultado = { dias: {}, enviadas: 0 };
  for (const dia of dias) {
    let sit = situacoes(escala, dia, cfgA, agora); const furos = Object.fromEntries((await listar(`furo/${dia}/`)).map(f => [f.id, f]));
    const liderDe = h => cfgA.hubs?.[h]?.lider || {};
    const msgs = [];                       // {tel, texto, meta}
    const aoLider = (f, texto, tipo) => msgs.push({ tel: liderDe(f.hubId).tel, texto, meta: { tipo, hub: f.hubNome, furo: f.id, dia, para_quem: "lider" } });
    const aoGestor = (f, texto, tipo) => msgs.push({ tel: cfgA.gestor?.tel, texto, meta: { tipo, hub: f.hubNome, furo: f.id, dia, para_quem: "gestor" } });
    // 1) registros abertos que dependem de um substituto informado ou de troca na escala
    const vistos = new Set();
    for (const s of sit) {
      s.id = idDe(dia, s.hubId, s.turnoId, s.vaga, s.pidx || 0);
      s.cheg = s.vazia ? null : chegada(s, pres, cfgA);
    }
    // presenças sem lançamento: quem bateu o ponto no hub mas não está na escala preenche as vagas vazias do turno (e é marcado "não lançado")
    {
      const hubsDe = p => Object.keys(cfgA.hubs || {}).filter(h => casaHub(p, h, cfgA));
      const siteDe = h => [...(cfgA.hubs[h]?.ponto || []), ...(cfgA.hubs[h]?.freela || [])].map(nrm).sort().join("|");      // hubs com as mesmas unidades = mesmo local, só turnos diferentes
      const nomes = sit.filter(s => !s.vazia).map(s => s.nome);
      const grupos = new Map(); for (const s of sit) { const k = s.hubId + "|" + s.turnoId; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(s); }
      const candidatos = new Map();
      for (const p of pres) {
        if (!p.nome || nomes.some(n => mesmoNome(n, p.nome))) continue;
        const hs = hubsDe(p); if (!hs.length || new Set(hs.map(siteDe)).size !== 1) continue;      // hubs diferentes (ex.: Varanda x Expedição) = ambíguo, não adivinha; turnos do mesmo local (ex.: Expedição Dia/Noite) podem seguir
        if (Object.values(furos).some(f => hs.includes(f.hubId) && f.substituto && mesmoNome(f.substituto.nome, p.nome))) continue;      // substituto de um furo deste hub já é tratado pelo furo
        let melhor = null;
        for (const [k, g] of grupos) { const r = g[0]; if (!hs.includes(r.hubId) || p.t < r.inicio - 2 * HOUR || p.t > r.fim) continue; const d = Math.abs(p.t - r.inicio) + (p.t < r.inicio ? 1 : 0); if (!melhor || d < melhor.d) melhor = { k, d }; }
        if (!melhor) continue;
        const lista = candidatos.get(melhor.k) || []; if (lista.some(x => mesmoNome(x.nome, p.nome))) continue;
        lista.push(p); candidatos.set(melhor.k, lista);
      }
      for (const [k, lista] of candidatos) {
        const g = grupos.get(k), vazias = g.filter(s => s.vazia).sort((a, b) => a.vaga - b.vaga);
        // grafia parecida no mesmo turno (ex.: escala "Raiane", ponto "Rayane Stefany"): é a mesma pessoa escalada que bateu o ponto
        const resto = lista.filter(p => {
          const pt = nrm(p.nome).split(" ")[0]; if (pt.length < 5) return true;
          const s = g.find(x => !x.vazia && !x.cheg && !x.semEscala && (() => { const st = nrm(x.nome).split(" ")[0]; return st.length >= 5 && st !== pt && lev(st, pt) <= 1; })());
          if (!s) return true; s.cheg = { t: p.t }; s.nomeNoPonto = p.nome; return false;
        });
        resto.sort((a, b) => a.t - b.t).forEach((p, i) => {
          const base = vazias[i];
          if (base) Object.assign(base, { vazia: false, nome: p.nome, cheg: { t: p.t }, semEscala: true });
          else { const r = g[0]; sit.push({ hubId: r.hubId, hubNome: r.hubNome, turnoId: r.turnoId, turno: r.turno, vaga: 100 + i, pidx: 0, vazia: false, nome: p.nome, inicio: r.inicio, fim: r.fim, tIni: r.tIni, tFim: r.tFim, dia, marcouFalta: false, compareceu: false, split: false, semEscala: true, cheg: { t: p.t }, id: idDe(dia, r.hubId, r.turnoId, 100 + i, 0) }); }
        });
      }
    }
    sit = sit.filter(s => !s.extra || s.cheg || s.compareceu);      // vagas além do previsto só entram se a pessoa apareceu
    // espelhos: o mesmo turno lançado em hubs do mesmo local (ex.: 12x36 em Expedição Dia e Noite) é um turno só; a cobertura informada num hub vale no outro
    {
      const siteH = h => [...(cfgA.hubs[h]?.ponto || []), ...(cfgA.hubs[h]?.freela || [])].map(nrm).sort().join("|");
      const grp = new Map();
      for (const s of sit) { if (s.vazia || s.extra || s.semEscala || !cfgA.hubs[s.hubId]) continue; const k = siteH(s.hubId) + "|" + s.inicio + "|" + s.fim; if (!grp.has(k)) grp.set(k, []); grp.get(k).push(s); }
      for (const lista of grp.values()) {
        const hs = [...new Set(lista.map(s => s.hubId))]; if (hs.length < 2) continue;
        for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
          const A = lista.filter(s => s.hubId === hs[i]), B = lista.filter(s => s.hubId === hs[j]), usados = new Set(), semPar = [];
          for (const a of A) { const b = B.find(x => !usados.has(x) && mesmoNome(x.nome, a.nome)); if (b) { usados.add(b); a.espelho = b; b.espelho = a; } else semPar.push(a); }      // mesma pessoa, mesmo horário
          const restB = B.filter(x => !usados.has(x));
          for (const tn of new Set(semPar.map(x => nrm(x.turno)))) { const sa = semPar.filter(x => nrm(x.turno) === tn), sb = restB.filter(x => nrm(x.turno) === tn); if (sa.length === 1 && sb.length === 1) { sa[0].espelho = sb[0]; sb[0].espelho = sa[0]; } }      // nome trocado só num dos hubs: pareia se for o único do turno de mesmo nome
        }
      }
      for (const s of sit) {
        const m = s.espelho; if (!m || s.cheg || s.compareceu) continue;
        const mesma = mesmoNome(s.nome, m.nome), fm = furos[m.id], fs = furos[s.id]; let por = null;
        if (m.cheg || m.compareceu) por = { nome: m.nome, t: m.cheg?.t ?? agora };
        else if (fm && fm.estado === "resolvido" && !fm.encerrado) por = { nome: fm.substituto?.nome || null, t: fm.resolvidoEm || agora };
        if (por) {
          if (fs && fs.estado === "resolvido") continue;
          const quem = por.nome ? (mesma ? `${por.nome} está presente` : `${por.nome} cobriu ${s.nome}`) : `a vaga de ${s.nome} foi confirmada como coberta`;
          const txt = `${quem} no mesmo turno de *${m.hubNome}* (${m.turno} ${hm(m.inicio)}). Ajuste o nome na escala de ${s.hubNome}.`;
          const sub = por.nome && !mesma ? { nome: por.nome, auto: true, via: m.hubNome, informadoEm: agora } : null;
          if (fs) { fs.estado = "resolvido"; fs.resolvidoEm = por.t; if (sub) fs.substituto = sub; evento(fs, "espelho", txt.replace(/\*/g, "")); aoLider(fs, `🔁 ${txt}`, "espelho"); }
          else { const f = { id: s.id, dia, hubId: s.hubId, hubNome: s.hubNome, turnoId: s.turnoId, turno: s.turno, vaga: s.vaga, nome: s.nome, vazia: false, inicio: s.inicio, fim: s.fim, estado: "resolvido", criadoEm: agora, resolvidoEm: por.t, espelho: true, tIni: s.tIni, ...(sub ? { substituto: sub } : {}), eventos: [] };
            evento(f, "espelho", txt.replace(/\*/g, "")); furos[f.id] = f; aoLider(f, `🔁 ${txt}`, "espelho"); }
        } else if (fm && fs && fs.estado !== "resolvido") {      // cobertura ainda a caminho no outro hub: acompanha o estado
          if (fm.estado === "trocado" && fm.substituto && !fs.substituto) { fs.substituto = { nome: fm.substituto.nome, auto: true, via: m.hubNome, informadoEm: agora }; fs.estado = "trocado"; evento(fs, "espelho", `${fm.substituto.nome} vai cobrir este turno (informado em ${m.hubNome}). Aguardando a chegada.`); aoLider(fs, `🔁 Em *${m.hubNome}* foi informado que *${fm.substituto.nome}* cobre o mesmo turno (${s.turno} ${hm(s.inicio)}). Ajuste a escala de ${s.hubNome}.`, "espelho"); }
          else if (fm.estado === "cuidando" && fs.estado === "aberto") { fs.estado = "cuidando"; fs.cuidandoEm = agora; evento(fs, "espelho", `O líder de ${m.hubNome} está cuidando deste mesmo turno.`); }
        }
      }
    }
    const porId = new Map(sit.map(s => [s.id, s]));
    // 2) atualiza registros existentes
    for (const f of Object.values(furos)) {
      if (f.estado === "resolvido") continue;
      const s = porId.get(f.id), sub = f.substituto?.nome;
      const chegSub = sub && chegada({ ...(s || f), inicio: f.inicio, fim: f.fim, hubId: f.hubId }, pres, cfgA, sub);
      const chegOrig = s && !s.vazia && (s.cheg || (s.compareceu && { t: agora }));
      const chegou = chegSub || chegOrig;
      if (chegou) {
        f.estado = "resolvido"; f.resolvidoEm = chegou.t; const quem = chegSub ? sub : s.nome;
        const sem = !chegSub && s?.semEscala ? " Não estava lançado na escala: lance no app da escala." : "";
        evento(f, "chegou", `${quem} bateu o ponto às ${hm(chegou.t)}${chegSub ? ` (cobrindo ${f.nome || "a vaga"})` : ""}. Furo regularizado.${sem}`);
        aoLider(f, `🟢 ${quem} bateu o ponto às ${hm(chegou.t)}. Furo regularizado em *${f.hubNome}* (${f.turno}).${sem}`, "chegou"); continue;
      }
      if (s) {
        const mudou = s.vazia ? !f.vazia : ((f.vazia || !mesmoNome(s.nome, f.nome)) && !(f.substituto && mesmoNome(f.substituto.nome, s.nome)));
        if (mudou && s.vazia) { f.vazia = true; evento(f, "escala_alterada", "O nome foi retirado da vaga na escala."); }
        else if (mudou) { f.vazia = false; f.substituto = { nome: s.nome, auto: true, informadoEm: agora }; f.estado = "trocado"; evento(f, "escala_alterada", `Escala alterada: ${s.nome} assumiu a vaga${f.nome ? " de " + f.nome : ""}. Aguardando a chegada.`);
          aoLider(f, `🔁 Escala alterada em *${f.hubNome}* (${f.turno} ${hm(f.inicio)}): *${s.nome}* assumiu a vaga${f.nome ? " de " + f.nome : ""}. Você será avisado quando bater o ponto.`, "troca"); }
      }
      // lembretes e escalada ao gestor agora seguem a cadência de mensagens por turno (cadenciaTurnos)
      if (agora >= f.fim) { f.estado = "resolvido"; f.encerrado = true; evento(f, "encerrou", "O turno terminou sem a cobertura da vaga."); }
    }
    // 3) novos furos
    const substitutos = new Set(Object.values(furos).filter(f => f.estado !== "resolvido" && f.substituto).map(f => nrm(f.substituto.nome)));
    for (const s of sit) {
      if (furos[s.id]) continue;
      if (s.compareceu || s.cheg) continue;
      if (s.espelho && !mesmoNome(s.nome, s.espelho.nome)) continue;      // vaga do mesmo turno em outro hub com outro nome: o furo nasce lá e vale para os dois
      if (!s.vazia && substitutos.has(nrm(s.nome))) continue;
      const prazo = s.vazia ? s.inicio - 2 * HOUR : s.inicio + (cfgA.cadencia?.m2 ?? 5) * 60000;
      if (agora < prazo || agora >= s.fim || agora - Math.max(prazo, s.inicio) > 3 * HOUR) continue;      // não cria alerta atrasado demais (ex.: vigia ligado depois do início); continua visível no painel
      const f = { id: s.id, dia, hubId: s.hubId, hubNome: s.hubNome, turnoId: s.turnoId, turno: s.turno, vaga: s.vaga, nome: s.nome, vazia: s.vazia, inicio: s.inicio, fim: s.fim, estado: "aberto", criadoEm: agora, tIni: s.tIni, eventos: [] };
      const fora = s.vazia ? null : foraDoHub(s, pres, cfgA), atraso = Math.max(0, Math.round((agora - s.inicio) / 60000));
      const total = sit.filter(x => x.hubId === s.hubId && x.turnoId === s.turnoId).length, ok = sit.filter(x => x.hubId === s.hubId && x.turnoId === s.turnoId && (x.cheg || x.compareceu)).length;
      evento(f, "furo", s.vazia ? "Vaga sem ninguém escalado perto do início do turno." : `${s.nome} não bateu o ponto (${atraso} min após ${hm(s.inicio)})${fora ? `; bateu em ${fora.unidade || "outro hub"}` : ""}${s.marcouFalta ? "; marcado como falta na escala" : ""}.`);
      furos[f.id] = f;
      // sem mensagem individual: o líder recebe a lista do turno pela cadência (cadenciaTurnos)
    }
    for (const s of sit) { const f = furos[s.id]; s.coberto = !!(f && f.estado === "resolvido" && !f.encerrado && !s.cheg && !s.compareceu); }
    // cadência de mensagens por turno (07:30, +5, +10, +30, +40 min)
    {
      const cad = (await getJ(`cad/${dia}`)) || {};
      const r = cadenciaTurnos({ dia, agora, sit, furos, cad, cfgA, sign });
      for (const m of r.msgs) msgs.push(m);
      await putJ(`cad/${dia}`, r.cad);
    }
    // 4) turno completo depois de ter tido furo
    const completos = {};
    for (const s of sit) { const k = s.hubId + "|" + s.turnoId; const c = (completos[k] ||= { hub: s.hubNome, turno: s.turno, hubId: s.hubId, tid: s.turnoId, n: 0, ok: 0, inicio: s.inicio, ate: s.inicio + tol * 60000, aberto: false }); c.n++; if (s.cheg || s.compareceu || s.coberto) c.ok++; }
    const estadoDia = (await getJ(`dia/${dia}`)) || { completoAvisado: {} }; estadoDia.completoAvisado ||= {};
    for (const [k, c] of Object.entries(completos)) {
      const teve = Object.values(furos).filter(f => f.hubId === c.hubId && f.turnoId === c.tid), abertos = teve.filter(f => f.estado !== "resolvido").length;
      c.status = c.ok === c.n ? "completo" : agora < c.ate ? "aguardando" : "furo"; c.furos = teve.length;
      if (teve.length && !abertos && c.ok >= c.n - teve.filter(f => f.encerrado).length && !estadoDia.completoAvisado[k]) {
        estadoDia.completoAvisado[k] = agora; const f0 = teve[0]; evento(f0, "completo", `${c.hub} — ${c.turno}: escala completa (${c.ok} de ${c.n}).`);
        msgs.push({ tel: liderDe(c.hubId).tel, texto: `✅ *${c.hub}* — ${c.turno} completo: ${c.ok} de ${c.n} presentes.`, meta: { tipo: "completo", hub: c.hub, dia, para_quem: "lider" } });
      }
    }
    // 5) grava
    for (const f of Object.values(furos)) await putJ(`furo/${dia}/${f.id}`, f);
    for (const m of msgs) { await notificar(dia, m.tel, m.texto, m.meta); resultado.enviadas++; }
    const resumo = { dia, geradoEm: agora, hubs: escala.cfg.hubs.map(h => ({ id: h.id, nome: h.nome, lider: liderDe(h.id).nome || "", turnos: Object.values(completos).filter(c => c.hubId === h.id).map(c => ({ id: c.tid, nome: c.turno, inicio: hm(c.inicio), esperados: c.n, presentes: c.ok, status: c.status, furos: c.furos,
      pessoas: sit.filter(s => s.hubId === h.id && s.turnoId === c.tid).map(s => ({ nome: s.nome || "(vaga sem ninguém)", previsto: hm(s.inicio), chegou: s.cheg ? hm(s.cheg.t) : s.compareceu ? "marcado na escala" : null, sem: !!s.semEscala, por: s.coberto ? (furos[s.id].substituto?.nome || null) : null, estado: s.cheg || s.compareceu ? "presente" : s.coberto ? "coberto" : s.vazia ? "vaga vazia" : agora < s.inicio + tol * 60000 ? "aguardando" : "ausente" })) })) })), completoAvisado: estadoDia.completoAvisado };
    await putJ(`dia/${dia}`, resumo); resultado.dias[dia] = { situacoes: sit.length, furos: Object.keys(furos).length };
  }
  await relatorioDiario({ agora, cfgA, escala: null });
  return { ok: true, ...resultado };
}

// ------------------------------------------------------------ relatório diário (só para a gestora, às 10:00)
export async function montarRelatorio(dia) {
  const [furos, resumo] = [await listar(`furo/${dia}/`), await getJ(`dia/${dia}`)];
  const linhas = furos.flatMap(f => (f.eventos || []).map(e => ({ t: e.t, hub: f.hubNome, turno: f.turno, ...e }))).sort((a, b) => a.t - b.t);
  return { dia, linhas, resumo };
}
export async function relatorioDiario({ agora, cfgA }) {
  const hoje = isoOf(agora), h = lp(agora).h, h0 = cfgA?.relatorioHora ?? 10; if (!cfgA?.gestor?.tel || h < h0 || h >= h0 + 3) return;      // envia na primeira rodada a partir da hora marcada (janela de 3 h)
  const marca = await getJ(`rel/${hoje}`); if (marca) return; await putJ(`rel/${hoje}`, { t: agora, iniciado: true });
  const ontem = addDays(hoje, -1), r = await montarRelatorio(ontem), r2 = await montarRelatorio(hoje);
  const linha = l => `${hm(l.t)} · ${l.hub} (${l.turno}): ${l.msg}`, hubsTxt = d => (d.resumo?.hubs || []).map(h => `• *${h.nome}*: ` + (h.turnos.length ? h.turnos.map(t => `${t.nome} ${t.presentes}/${t.esperados}${t.furos ? ` (${t.furos} furo${t.furos > 1 ? "s" : ""})` : ""}`).join("; ") : "sem turno hoje")).join("\n");
  const texto = `📋 *Relatório de escala — ${br(ontem)}*\n\n*Desfecho por hub*\n${hubsTxt(r) || "sem dados"}\n\n*Linha do tempo*\n${r.linhas.length ? r.linhas.map(linha).join("\n") : "Nenhum furo registrado."}\n\n*Hoje até agora (${br(hoje)})*\n${r2.linhas.length ? r2.linhas.map(linha).join("\n") : "Nenhum furo registrado."}`;
  await notificar(hoje, cfgA.gestor.tel, texto.slice(0, 3800), { tipo: "relatorio", dia: hoje, para_quem: "gestor" });
  await putJ(`rel/${hoje}`, { t: agora, enviado: true });
}

// ------------------------------------------------------------ rotas
export async function rotaAlerta(req, path, ctx) {
  const { json, isAdmin, sign } = ctx, q = new URL(req.url).searchParams, erro = (m, s = 400) => json({ error: m }, s);
  // página do líder (sem senha do painel): vale só para este furo, pelo token assinado do link
  if (path === "/api/alerta/furo" && req.method === "GET") {
    const dia = q.get("d") || "", id = q.get("f") || "", t = q.get("t") || "";
    if (!/^\d{4}-\d\d-\d\d$/.test(dia) || t !== tokenFuro(sign, dia, id)) return erro("Link inválido ou expirado.", 403);
    const f = await getJ(`furo/${dia}/${id}`); if (!f) return erro("Furo não encontrado.", 404);
    const esc = await lerEscala([dia]).catch(() => null);
    return json({ furo: { ...f, inicioHm: hm(f.inicio), fimHm: hm(f.fim), eventos: (f.eventos || []).map(e => ({ ...e, hm: hm(e.t) })) }, colaboradores: esc ? [...new Set(esc.cfg.colaboradores.map(c => c.nome))].sort((a, b) => a.localeCompare(b, "pt-BR")) : [] });
  }
  if (path === "/api/alerta/turno" && req.method === "GET") {      // página do turno: lista de quem falta, com a ação de cada pessoa
    const dia = q.get("d") || "", h = q.get("h") || "", i = Number(q.get("i")), t = q.get("t") || "";
    if (!/^\d{4}-\d\d-\d\d$/.test(dia) || !Number.isFinite(i) || t !== tokenTurno(sign, dia, h, i)) return erro("Link inválido ou expirado.", 403);
    const fs = (await listar(`furo/${dia}/`)).filter(f => f.hubId === h && (f.tIni ?? f.inicio) === i);
    const esc = await lerEscala([dia]).catch(() => null), nomes = [...new Set(fs.map(f => f.turno))];
    return json({ hubNome: fs[0]?.hubNome || "", turnos: nomes, inicioHm: hm(i), colaboradores: esc ? [...new Set(esc.cfg.colaboradores.map(c => c.nome))].sort((a, b) => a.localeCompare(b, "pt-BR")) : [],
      furos: fs.sort((a, b) => (a.estado === "resolvido") - (b.estado === "resolvido") || String(a.nome).localeCompare(String(b.nome))).map(f => ({ id: f.id, token: tokenFuro(sign, dia, f.id), nome: f.nome, vazia: f.vazia, turno: f.turno, estado: f.estado, aCaminho: !!f.aCaminho, substituto: f.substituto?.nome || null, encerrado: !!f.encerrado })) });
  }
  if (path === "/api/alerta/responder" && req.method === "POST") {
    const b = await req.json().catch(() => ({})), dia = String(b.d || ""), id = String(b.f || "");
    if (!/^\d{4}-\d\d-\d\d$/.test(dia) || String(b.t) !== tokenFuro(sign, dia, id)) return erro("Link inválido ou expirado.", 403);
    const f = await getJ(`furo/${dia}/${id}`); if (!f) return erro("Furo não encontrado.", 404); if (f.estado === "resolvido") return erro("Este furo já foi encerrado.", 409);
    const cfgA = await lerConfig(), lider = cfgA?.hubs?.[f.hubId]?.lider?.nome || "O líder", agora = Date.now();
    if (b.acao === "cuidando") { f.estado = "cuidando"; f.cuidandoEm = agora; evento(f, "cuidando", `${lider} informou que está cuidando.`, lider); await putJ(`furo/${dia}/${id}`, f);
      await notificar(dia, cfgA?.hubs?.[f.hubId]?.lider?.tel, `✅ Registrado: você está cuidando do furo em *${f.hubNome}* (${f.turno}). Quando cobrir, informe quem entrou pelo mesmo link.`, { tipo: "cuidando", hub: f.hubNome, furo: id, dia, para_quem: "lider" }); return json({ ok: true, estado: f.estado }); }
    if (b.acao === "caminho") {      // o líder confirma que a pessoa está a caminho (sem mensagem de volta: o histórico guarda)
      f.aCaminho = true; f.aCaminhoEm = agora; if (f.estado === "aberto") f.estado = "cuidando"; evento(f, "caminho", `${lider} confirmou que ${f.nome || "a pessoa"} está a caminho.`, lider); await putJ(`furo/${dia}/${id}`, f); return json({ ok: true, estado: f.estado });
    }
    if (b.acao === "trocou") {
      const nome = String(b.substituto || "").replace(/\s+/g, " ").trim(); if (nome.length < 2) return erro("Informe quem vai cobrir.");
      const esc = await lerEscala([dia]).catch(() => null), cad = esc ? esc.cfg.colaboradores.map(c => c.nome).find(n => mesmoNome(n, nome)) : nome; if (!cad) return erro("Esse nome não está cadastrado na escala. Cadastre a pessoa lá primeiro.");
      f.estado = "trocado"; f.substituto = { nome: cad, informadoEm: agora }; f.trocaEm = agora; evento(f, "troca", `${lider} informou que ${cad} cobre a vaga${f.nome ? " de " + f.nome : ""}.`, lider); await putJ(`furo/${dia}/${id}`, f);
      await notificar(dia, cfgA?.hubs?.[f.hubId]?.lider?.tel, `🔁 Troca registrada em *${f.hubNome}* (${f.turno}): *${cad}* cobre ${f.nome ? "a vaga de " + f.nome : "a vaga"}. Você será avisado quando bater o ponto. Lembre de ajustar a escala.`, { tipo: "troca", hub: f.hubNome, furo: id, dia, para_quem: "lider" }); return json({ ok: true, estado: f.estado });
    }
    if (b.acao === "confirmou") {      // o líder garante que a vaga está coberta, mesmo sem ponto no hub (ex.: já bateu em outro lugar ou é o próprio líder)
      f.estado = "resolvido"; f.resolvidoEm = agora; f.confirmadoPor = lider; f.confirmadoEm = agora;
      evento(f, "confirmou", `${lider} confirmou que a vaga está coberta${f.substituto?.nome ? " por " + f.substituto.nome : ""} (confirmação manual, sem batida no hub).`, lider); await putJ(`furo/${dia}/${id}`, f);
      await notificar(dia, cfgA?.hubs?.[f.hubId]?.lider?.tel, `✅ Cobertura confirmada em *${f.hubNome}* (${f.turno}). Furo encerrado.`, { tipo: "confirmou", hub: f.hubNome, furo: id, dia, para_quem: "lider" }); return json({ ok: true, estado: f.estado });
    }
    return erro("Ação inválida.");
  }
  if (!isAdmin(req)) return erro("Não autorizado", 401);
  if (path === "/api/alerta/painel" && req.method === "GET") {
    const dia = /^\d{4}-\d\d-\d\d$/.test(q.get("d") || "") ? q.get("d") : isoOf(Date.now());
    const [resumo, furos, out] = await Promise.all([getJ(`dia/${dia}`), listar(`furo/${dia}/`), listar(`out/${dia}/`)]);
    const linha = furos.flatMap(f => (f.eventos || []).map(e => ({ ...e, hm: hm(e.t), hub: f.hubNome, turno: f.turno, furo: f.id }))).sort((a, b) => a.t - b.t);
    return json({ dia, resumo, furos: furos.map(f => ({ id: f.id, hub: f.hubNome, turno: f.turno, nome: f.nome, vazia: f.vazia, estado: f.estado, inicio: hm(f.inicio), substituto: f.substituto?.nome || null })), linha,
      mensagens: out.sort((a, b) => a.t - b.t).map(o => ({ ...o, hm: hm(o.t) })), provedor: process.env.WA_API_URL ? "ligado" : "simulado" });
  }
  if (path === "/api/alerta/config" && req.method === "GET") { const c = await lerConfig(); return json({ config: c }); }
  if (path === "/api/alerta/config" && req.method === "POST") {
    const b = await req.json().catch(() => ({})); if (!b || typeof b.hubs !== "object") return erro("Configuração inválida.");
    await gravarConfig({ tolerancia: +b.tolerancia || 15, escalarMin: +b.escalarMin || 15, lembreteMin: +b.lembreteMin || 30, graceTrocaMin: +b.graceTrocaMin || 30, relatorioHora: b.relatorioHora ?? 10, gestor: b.gestor || null, hubs: b.hubs,
      apelidos: Array.isArray(b.apelidos) ? b.apelidos.map(a => ({ escala: String(a?.escala || "").trim().slice(0, 80), ponto: String(a?.ponto || "").trim().slice(0, 120) })).filter(a => a.escala && a.ponto).slice(0, 300) : ((await lerConfig())?.apelidos || []) }); return json({ ok: true });
  }
  if (path === "/api/alerta/escala-hubs" && req.method === "GET") { const e = await lerEscala([isoOf(Date.now())]); return json({ hubs: e.cfg.hubs.map(h => ({ id: h.id, nome: h.nome })) }); }
  if (path === "/api/alerta/teste" && req.method === "POST") { // manda UMA mensagem de teste, só ao número da gestão, e devolve o resultado do provedor
    const c = await lerConfig(); const tel = soDigitos(c?.gestor?.tel); if (!tel) return erro("Sem WhatsApp da gestão na configuração", 400);
    if (!process.env.WA_API_URL) return erro("Provedor não configurado", 400);
    const r = await enviarWA(tel.startsWith("55") ? tel : "55" + tel, "✅ Teste da Central de alertas: o WhatsApp está conectado. Pode ignorar esta mensagem.");
    const tk = process.env.WA_API_TOKEN || ""; // diagnóstico sem expor o valor: tipo (pelo prefixo), tamanho e se há espaço/quebra de linha
    return json({ para: "…" + tel.slice(-4), ...r, token: { prefixo: tk.slice(0, 3), tamanho: tk.length, comEspaco: /\s/.test(tk) } });
  }
  if (path === "/api/alerta/rodar" && req.method === "POST") { const h = isoOf(Date.now()); return json(await vigiar({ sign, presencas: [...await ctx.presencas(addDays(h, -1)), ...await ctx.presencas(h)] })); }
  return erro("not found", 404);
}

// ------------------------------------------------------------ saúde do vigia: se ele não consegue ler os dados, os alertas ficam pausados e a gestora é avisada
export async function registrarFalha(msg, agora = Date.now()) {
  const e = (await getJ("saude")) || { n: 0 }; e.n = (e.n || 0) + 1; e.ultimo = msg; e.t = agora;
  if (e.n >= 3 && !e.avisado) { const c = await lerConfig(); if (c?.gestor?.tel) { await notificar(isoOf(agora), c.gestor.tel, `⚠️ O vigia de escala não está conseguindo ler os dados (${String(msg).slice(0, 160)}). Os alertas estão pausados até normalizar.`, { tipo: "saude", para_quem: "gestor" }); e.avisado = true; } }
  await putJ("saude", e);
}
export async function registrarOk() { const e = await getJ("saude"); if (e?.n) await putJ("saude", { n: 0, ok: Date.now() }); }
