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
  const c = { apiKey: g("apiKey"), projectId: g("projectId"), adminEmail: /ADMIN_EMAIL\s*=\s*"([^"]+)"/.exec(t)?.[1] }; if (!c.apiKey || !c.projectId) throw new Error("Não consegui ler a configuração do Firebase da escala.");
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
  // Trava: mensagens aos líderes só saem de verdade com WA_LIDERES=sim, e as aos colaboradores com WA_COLABS=sim (as da gestão saem assim que o provedor está ligado).
  if (!tel) reg.estado = "sem_telefone"; else if (meta?.para_quem !== "gestor" && process.env[meta?.para_quem === "colab" ? "WA_COLABS" : "WA_LIDERES"] !== "sim") reg.estado = "simulado"; else Object.assign(reg, await enviarWA(tel.startsWith("55") ? tel : "55" + tel, texto));
  await putJ(`out/${dia}/${String(reg.t).padStart(13, "0")}-${Math.random().toString(36).slice(2, 6)}`, reg); return reg;
}
export const tokenFuro = (sign, dia, id) => sign(`furo:${dia}:${id}`);
const linkFuro = (sign, dia, id) => `${BASE_URL}/alerta.html?d=${dia}&f=${id}&t=${tokenFuro(sign, dia, id)}`;


// ------------------------------------------------------------ cadência de mensagens por turno (pura)
const MIN = 60000;
export const tokenTurno = (sign, dia, hubId, ini) => sign(`turno:${dia}:${hubId}:${ini}`);
const linkTurno = (sign, dia, hubId, ini) => `${BASE_URL}/turno.html?d=${dia}&h=${encodeURIComponent(hubId)}&i=${ini}&t=${tokenTurno(sign, dia, hubId, ini)}`;
export const linkEquipe = (sign, hubId) => `${BASE_URL}/equipe.html?h=${encodeURIComponent(hubId)}&t=${sign(`equipe:${hubId}`)}`;
export const tokenColab = (sign, dia, sid) => sign(`eu:${dia}:${sid}`);
const linkColab = (sign, dia, sid) => `${BASE_URL}/eu.html?d=${dia}&s=${encodeURIComponent(sid)}&t=${tokenColab(sign, dia, sid)}`;
const rad = x => x * Math.PI / 180;
export const distM = (a, b) => { const R = 6371000, dl = rad(b.lat - a.lat), dn = rad(b.lon - a.lon), x = Math.sin(dl / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dn / 2) ** 2; return Math.round(2 * R * Math.asin(Math.sqrt(x)) / 10) * 10; };      // metros, em linha reta
const fmtDist = m => m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`;
const telDe = (tels, hubId, nome) => Object.values(tels?.[hubId] || {}).find(x => x?.tel && mesmoNome(x.nome, nome))?.tel || null;
export function cadenciaTurnos({ dia, agora, sit, furos, cad, cfgA, sign, tels = null, resps = {} }) {
  const c = cfgA.cadencia || {}, off = { c0: -(c.colab0 ?? 60), m1: -(c.antes ?? 30), m2: c.m2 ?? 5, m3: c.m3 ?? 10, m3b: c.m3b ?? 15, m4: c.m4 ?? 30, m5: c.m5 ?? 40 }, msgs = [], colabs = [];
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
    const temTel = s => !!telDe(tels, g.hubId, s.nome);
    const status = s => { const f = furos[s.id], l = f?.loc;
      if (f?.substituto) return f.estado === "trocado" ? (f.subAcaminho ? "a caminho (confirmado por você)" : "aguardando chegada") : "substituto informado";
      if (f?.naoVai) return "avisou que não vai conseguir ir";
      if (l) return l.dist == null ? "compartilhou a localização" : `a ${fmtDist(l.dist)} do hub (localização das ${hm(l.em)})`;
      if (f?.aCaminho) return f.aCaminhoPor === "colab" ? "a caminho (confirmou pelo link)" : "a caminho (você confirmou)";
      return temTel(s) ? (n === "m2" ? "aguardando localização" : "sem resposta") : "sem confirmação"; };
    // resposta do colaborador depois da cobrança do início do turno (+5 min)
    const resp5 = s => { const r = resps[s.id], t = Math.max(r?.respEm || 0, ...(r?.locs || []).map(x => x.em)); return t >= g.ini + (c.m2 ?? 5) * MIN; };
    const semNada = s => { const f = furos[s.id]; return !(f?.substituto || f?.naoVai || (f?.aCaminho && f.aCaminhoPor !== "colab") || resp5(s)); };
    const nomeSub = s => { const sb = furos[s.id]?.substituto; return sb && !sb.via && !mesmoNome(sb.nome, s.nome) ? `${sb.nome} (no lugar de ${s.nome})` : s.nome; };
    const nome = s => s.vazia ? "vaga sem ninguém lançado" : nomeSub(s);
    const pend = g.itens.filter(s => !s.cheg && !s.compareceu && !s.coberto);
    const lista = (arr, comStatus) => arr.map(s => `• ${nome(s)}${comStatus ? " — " + status(s) : ""}`).join("\n");
    let texto = null, gestor = null;
    if (n === "c0") { /* só os colaboradores recebem este passo */ }
    else if (n === "m1") {
      const vazias = g.itens.filter(s => s.vazia).length, multi = porTurno.size > 1;
      const presenca = s => { const r = resps[s.id]?.resp; return r === "nao_vou" ? " — avisou que não vai" : r ? " — confirmou presença" : temTel(s) ? " — sem resposta" : ""; };
      const quem = [...porTurno].map(([t, a]) => (multi ? `*${t}*\n` : "") + a.filter(s => !s.vazia).map(s => `• ${nomeSub(s)}${presenca(s)}`).join("\n")).filter(Boolean).join("\n");
      texto = `📋 *Escala de hoje — ${g.hubNome}*\n${turnos} · ${hm(g.ini)}\n\nQuem você escalou:\n${quem || "• (ninguém lançado)"}${vazias ? `\n⚠️ ${vazias} vaga${vazias > 1 ? "s" : ""} sem ninguém lançado na escala` : ""}\n\nConfira agora se todos chegam a tempo. Se alguém não vai conseguir, providencie a cobertura antes das ${hm(g.ini)}.${tels && !Object.keys(tels[g.hubId] || {}).length ? `\n\n📱 Cadastre os telefones da sua equipe e cada um recebe o lembrete do turno:\n👉 ${linkEquipe(sign, g.hubId)}` : ""}`;
    } else if (n === "m3b") {      // quem segue sem nenhuma resposta: o líder precisa agir
      const sem = pend.filter(semNada);
      if (sem.length) texto = `⚠️ ${cab}\nSem nenhuma resposta: ${sem.map(s => s.vazia ? "vaga sem ninguém lançado" : "*" + s.nome + "*").join(", ")}.\n\nAja agora: informe quem vai substituir.\n👉 ${link}`;
    } else if (pend.length) {
      const snap = pend.map(s => s.id + ":" + status(s).replace("aguardando localização", "sem resposta")).join("|");
      if (n === "m2") { st.snap = snap; texto = `🕗 ${cab}\nAtrasados, sem ponto batido:\n${lista(pend, true)}\n\nJá avisamos os colaboradores com telefone cadastrado. Acompanhe e resolva aqui:\n👉 ${link}`; }
      else if (n === "m3") { if (snap !== st.snap) { st.snap = snap; texto = `⏰ ${cab}\nAtualização dos atrasados:\n${lista(pend, true)}\n\nAcompanhe e resolva aqui:\n👉 ${link}`; } }
      else if (n === "m4") texto = `🔁 ${cab}\nContinuam sem bater o ponto:\n${lista(pend, true)}\n\nChegaram ou alguém vai substituí-los? Informe quem é o substituto:\n👉 ${link}`;
      else {
        texto = `🚨 ${cab}\nVocê vai ter um furo na sua escala se não corrigir isso imediatamente.\n\nFalta cobrir:\n${lista(pend, true)}\n\nInforme o substituto agora:\n👉 ${link}`;
        gestor = `🚨 *Furo iminente — ${g.hubNome}*\n${turnos} ${hm(g.ini)}: o líder ${lider.nome || "—"} ainda não resolveu, ${Math.max(0, Math.round((agora - g.ini) / MIN))} min após o início.\n\n${lista(pend, true)}\n\n👉 ${link}`;
      }
    }
    if (tels && (n === "c0" || n === "m1" || n === "m2" || n === "m3")) {      // mensagens diretas ao colaborador (só quem tem telefone cadastrado): 60 e 30 min antes, +5 e +10 min
      const alvo = n === "c0" || n === "m1" ? g.itens.filter(s => !s.vazia && !s.cheg && !s.compareceu) : pend.filter(s => !s.vazia);
      for (const s of alvo) {
        const tel = telDe(tels, g.hubId, s.nome), r = resps[s.id]; if (!tel || r?.resp === "nao_vou" || furos[s.id]?.naoVai) continue;
        if (n === "m3" && resp5(s)) continue;      // já respondeu depois da cobrança das +5: não insiste
        const pn = String(s.nome).split(" ")[0], lk = linkColab(sign, dia, s.id);
        const t2 = n === "c0" ? `Olá, ${pn}! 👋 Você está na escala de hoje em *${g.hubNome}* (${s.turno}), a partir das ${hm(s.inicio)}.\n\nVocê confirma que vai comparecer?\n👉 ${lk}`
          : n === "m1" ? `${pn}, seu turno em *${g.hubNome}* começa às ${hm(s.inicio)}.\n\nJá está a caminho? Confirme aqui:\n👉 ${lk}`
          : n === "m2" ? `${pn}, seu ponto em *${g.hubNome}* ainda não foi batido.\n\nToque no link e compartilhe sua localização, só para estimarmos quanto falta para você chegar. Usamos apenas a distância até o hub; o local exato não é mostrado a ninguém.\n👉 ${lk}`
          : `${pn}, você está chegando em *${g.hubNome}*?\n\nResponda pelo link. Se não houver resposta, seu líder vai providenciar outra pessoa para a vaga.\n👉 ${lk}`;
        colabs.push({ tel, texto: t2, eu: { sid: s.id, nome: s.nome, hubId: g.hubId, hubNome: g.hubNome, turnoId: s.turnoId, turno: s.turno, vaga: s.vaga, inicio: s.inicio, fim: s.fim, tIni: s.tIni ?? s.inicio }, meta: { tipo: "colab_" + n, hub: g.hubNome, dia, para_quem: "colab", nome: s.nome } });
      }
    }
    if (!texto) { st[n] = 0; continue; }      // ninguém pendente: nada a cobrar neste passo
    st[n] = agora;
    msgs.push({ tel: lider.tel, texto, meta: { tipo: "cad_" + n, hub: g.hubNome, dia, para_quem: "lider" } });
    if (gestor) msgs.push({ tel: cfgA.gestor?.tel, texto: gestor, meta: { tipo: "escalou", hub: g.hubNome, dia, para_quem: "gestor" } });
  }
  return { msgs, cad, colabs };
}

// ------------------------------------------------------------ o vigia
const relogio = { t: null };      // durante o vigia, o "agora" injetado (testável); fora dele, a hora real
const agoraMs = () => relogio.t ?? Date.now();
const evento = (f, tipo, msg, por) => { (f.eventos = f.eventos || []).push({ t: agoraMs(), tipo, msg, ...(por ? { por } : {}) }); };
export async function vigiar(a) { relogio.t = a.agora ?? null; try { return await vigiarInterno({ ...a, agora: a.agora ?? Date.now() }); } finally { relogio.t = null; } }
async function vigiarInterno({ agora, sign, presencas, escala }) {      // presencas: batidas de ontem e de hoje
  const cfgA = await lerConfig(); if (!cfgA?.hubs) return { ok: false, motivo: "sem configuração" };
  const tol = cfgA.tolerancia ?? 15, escalarMin = cfgA.escalarMin ?? 15, lembrar = cfgA.lembreteMin ?? 30, grace = cfgA.graceTrocaMin ?? 30;
  const hoje = isoOf(agora), dias = [addDays(hoje, -1), hoje, ...(agora >= toMs(hoje, "22:00") ? [addDays(hoje, 1)] : [])];      // à noite também olha o dia seguinte: turnos que começam logo após a meia-noite precisam do aviso de 1 h antes
  escala = escala || await lerEscala(dias);
  // apelidos: nome na escala = nome no ponto/freela, quando são diferentes (ex.: "Ana Alice" = "Analice Vital")
  const apel = (cfgA.apelidos || []).filter(a => a?.escala && a?.ponto);
  const pres = apel.length ? presencas.map(p => { const a = apel.find(x => mesmoNome(p.nome, x.ponto)); return a ? { ...p, nome: a.escala } : p; }) : presencas;
  const resultado = { dias: {}, enviadas: 0 };
  const tels = {}; for (const h of Object.keys(cfgA.hubs || {})) tels[h] = (await getJ(`tel/${h}`)) || {};      // telefones dos colaboradores, por hub (reserva na central)
  sobreporCadastro(tels, escala?.cfg?.colaboradores, Object.keys(cfgA.hubs || {}));      // e o cadastro de colaboradores da escala, que tem prioridade
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
    // vaga com substituto informado pelo líder: a marca "compareceu" da escala vale para o substituto, não para quem faltou
    for (const s of sit) { const sb = furos[s.id]?.substituto; if (sb && !sb.via && !s.vazia && !mesmoNome(sb.nome, s.nome) && !s.cheg && s.compareceu) { s.compareceu = false; s.subMarcado = true; } }
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
        // quem bateu o ponto fora da escala entra no lugar de quem faltou (passados 5 min do início); a marca "compareceu" sem ponto só é desfeita se houver alguém para entrar
        const ausentes = g.filter(s => !s.vazia && !s.semEscala && !s.cheg && !furos[s.id]?.substituto && agora >= s.inicio + (cfgA.cadencia?.m2 ?? 5) * MIN).sort((a, b) => (a.compareceu ? 1 : 0) - (b.compareceu ? 1 : 0) || a.vaga - b.vaga);
        let iv = 0;
        resto.sort((a, b) => a.t - b.t).forEach((p, i) => {
          const base = vazias[iv];
          if (base) { iv++; Object.assign(base, { vazia: false, nome: p.nome, cheg: { t: p.t }, semEscala: true }); return; }
          const aus = ausentes.shift();
          if (aus) { aus.subAuto = { nome: p.nome, t: p.t }; aus.compareceu = false; return; }
          { const r = g[0]; sit.push({ hubId: r.hubId, hubNome: r.hubNome, turnoId: r.turnoId, turno: r.turno, vaga: 100 + i, pidx: 0, vazia: false, nome: p.nome, inicio: r.inicio, fim: r.fim, tIni: r.tIni, tFim: r.tFim, dia, marcouFalta: false, compareceu: false, split: false, semEscala: true, cheg: { t: p.t }, id: idDe(dia, r.hubId, r.turnoId, 100 + i, 0) }); }
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
      const s0 = porId.get(f.id);
      if (s0?.subAuto && !f.substituto && !f.encerrado) {      // alguém bateu o ponto fora da escala e entra no lugar de quem faltou
        f.substituto = { nome: s0.subAuto.nome, auto: true, ponto: true, informadoEm: agora }; f.aCaminho = false; f.loc = null;
        evento(f, "entrou", `${s0.subAuto.nome} bateu o ponto às ${hm(s0.subAuto.t)} fora da escala e entra no lugar de ${f.nome || "quem faltou"}.`);
        aoLider(f, `🔁 *${s0.subAuto.nome}* bateu o ponto às ${hm(s0.subAuto.t)} e entra no lugar de *${f.nome || "quem faltou"}* em *${f.hubNome}* (${f.turno}). Ajuste o nome na escala.`, "troca");
        if (f.estado !== "resolvido") f.estado = "trocado";
      }
      if (f.estado === "resolvido") {      // furo resolvido pela marca da escala enquanto havia substituto: a presença é do substituto, não de quem faltou
        const sb = f.substituto;
        if (!f.encerrado && sb && !sb.via && s0 && !s0.vazia && !s0.cheg && !mesmoNome(sb.nome, s0.nome)) {
          for (const e of f.eventos || []) if (e.tipo === "chegou" && f.nome && String(e.msg).startsWith(f.nome + " bateu o ponto")) { e.msg = `${sb.nome} cobriu ${f.nome}: presença confirmada às ${hm(e.t)} (marcada na escala).`; f.resolvidoVia = "marca"; }
        }
        continue;
      }
      const s = s0, sub = f.substituto?.nome;
      const chegSub = sub && chegada({ ...(s || f), inicio: f.inicio, fim: f.fim, hubId: f.hubId }, pres, cfgA, sub);
      const chegMarc = !chegSub && sub && s?.subMarcado && { t: agora };
      const chegOrig = s && !s.vazia && (s.cheg || (s.compareceu && { t: agora }));
      const chegou = chegSub || chegMarc || chegOrig;
      if (chegou) {
        f.estado = "resolvido"; f.resolvidoEm = chegou.t; f.resolvidoVia = chegSub ? "ponto" : chegMarc ? "marca" : "original"; const quem = chegSub || chegMarc ? sub : s.nome;
        const sem = !chegSub && !chegMarc && s?.semEscala ? " Não estava lançado na escala: lance no app da escala." : "";
        const oque = chegMarc ? "teve a presença marcada na escala" : "bateu o ponto";
        evento(f, "chegou", `${quem} ${oque} às ${hm(chegou.t)}${chegSub || chegMarc ? ` (cobrindo ${f.nome || "a vaga"})` : ""}. Furo regularizado.${sem}`);
        aoLider(f, `🟢 *${quem}* ${oque} às ${hm(chegou.t)}${chegSub || chegMarc ? ` (no lugar de ${f.nome || "quem faltou"})` : ""}. Furo regularizado em *${f.hubNome}* (${f.turno}).${sem}`, "chegou"); continue;
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
      if (s.subAuto) {
        f.substituto = { nome: s.subAuto.nome, auto: true, ponto: true, informadoEm: agora }; f.estado = "resolvido"; f.resolvidoEm = s.subAuto.t; f.resolvidoVia = "ponto";
        evento(f, "entrou", `${s.subAuto.nome} bateu o ponto às ${hm(s.subAuto.t)} fora da escala e entra no lugar de ${s.nome}.`);
        aoLider(f, `🔁 *${s.subAuto.nome}* bateu o ponto às ${hm(s.subAuto.t)} e entra no lugar de *${s.nome}* em *${f.hubNome}* (${f.turno}). Ajuste o nome na escala.`, "troca");
      }
      // sem mensagem individual: o líder recebe a lista do turno pela cadência (cadenciaTurnos)
    }
    const euList = await listar(`eu/${dia}/`), resps = Object.fromEntries(euList.map(e => [e.sid, e]));
    for (const e of euList) { const f = furos[e.sid], l = e.locs?.[e.locs.length - 1];
      if (l && f && f.estado !== "resolvido" && !f.substituto && (!f.loc || f.loc.em < l.em)) { f.loc = { dist: l.dist, prec: l.prec ?? null, em: l.em }; evento(f, "localizacao", `${f.nome || "A pessoa"} compartilhou a localização: ${l.dist == null ? "sem referência do hub" : "a " + fmtDist(l.dist) + " do hub"}.`); }
      if (e.resp === "caminho" && f && f.estado !== "resolvido" && !f.substituto && !f.aCaminho) { f.aCaminho = true; f.aCaminhoEm = e.respEm || agora; f.aCaminhoPor = "colab"; if (f.estado === "aberto") f.estado = "cuidando"; evento(f, "caminho", `${f.nome || "A pessoa"} confirmou pelo link que está a caminho.`); } }
    for (const s of sit) { const f = furos[s.id]; s.coberto = !!(f && f.estado === "resolvido" && !f.encerrado && !s.cheg && !s.compareceu); s.trocaPor = s.cheg ? null : (f?.substituto && !f.substituto.via && !mesmoNome(f.substituto.nome, s.nome)) ? f.substituto.nome : (s.subAuto?.nome || null); if (s.subAuto && !f) s.coberto = true; }
    // cadência de mensagens por turno (07:30, +5, +10, +30, +40 min)
    {
      const cad = (await getJ(`cad/${dia}`)) || {};
      const r = cadenciaTurnos({ dia, agora, sit, furos, cad, cfgA, sign, tels, resps });
      for (const m of r.msgs) msgs.push(m);
      for (const c of r.colabs || []) { await putJ(`eu/${dia}/${c.eu.sid}`, { ...(resps[c.eu.sid] || {}), ...c.eu }); msgs.push({ tel: c.tel, texto: c.texto, meta: c.meta }); }
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
      pessoas: sit.filter(s => s.hubId === h.id && s.turnoId === c.tid).map(s => { const f = furos[s.id], tr = s.trocaPor, ok = !!(tr && s.coberto);      // vaga com substituto: o nome do substituto ocupa o lugar de quem faltou
        return { nome: tr || s.nome || "(vaga sem ninguém)", ...(tr ? { noLugar: s.nome } : {}), previsto: hm(s.inicio), chegou: s.cheg ? hm(s.cheg.t) : s.compareceu ? "marcado na escala" : ok ? (f?.resolvidoVia === "marca" ? "marcado na escala" : hm(f?.resolvidoEm ?? s.subAuto?.t ?? agora)) : null, sem: !!s.semEscala, por: !tr && s.coberto ? (f?.substituto?.nome || null) : null, ...(tr && !ok && f?.subAcaminho ? { aCaminho: true } : {}),
          estado: s.cheg || s.compareceu || ok ? "presente" : s.coberto ? "coberto" : s.vazia ? "vaga vazia" : agora < s.inicio + tol * 60000 ? "aguardando" : "ausente" }; }) })) })), completoAvisado: estadoDia.completoAvisado };
    await putJ(`dia/${dia}`, resumo); resultado.dias[dia] = { situacoes: sit.length, furos: Object.keys(furos).length };
  }
  await relatorioDiario({ agora, cfgA, escala: null });
  await cobrarCadastros({ agora, cfgA, sign }).catch(() => {});      // cobra só o líder: telefones que faltam na escala de amanhã (20h) e de hoje (7h)
  return { ok: true, ...resultado };
}

// ------------------------------------------------------------ relatório diário (só para a gestora, às 10:00)
export async function montarRelatorio(dia) {
  const [furos, resumo] = [await listar(`furo/${dia}/`), await getJ(`dia/${dia}`)];
  const linhas = furos.flatMap(f => (f.eventos || []).map(e => ({ t: e.t, hub: f.hubNome, turno: f.turno, ...e }))).sort((a, b) => a.t - b.t);
  return { dia, linhas, resumo };
}
// ------------------------------------------------------------ cobrança do cadastro de telefones (só o líder recebe; a gestão não)
const semTelDe = (tels, hubId, nome) => Object.values(tels?.[hubId] || {}).some(x => x?.semTel && mesmoNome(x.nome, nome));
// telefones do cadastro de colaboradores da escala (fonte principal); os cadastrados antes pela página da equipe continuam valendo como reserva
function sobreporCadastro(tels, colaboradores, hubIds) {
  for (const c of colaboradores || []) {
    const d = soDigitos(c.tel), tem = d.length === 10 || d.length === 11 || (d.length > 11 && d.startsWith("55"));
    if (!c.nome || !(tem || c.semTel)) continue;
    const reg = tem ? { nome: c.nome, tel: d.length > 11 ? d : "55" + d } : { nome: c.nome, tel: "", semTel: true, motivo: c.motivoSemTel || "" };
    for (const h of c.hubId ? [c.hubId] : hubIds) { tels[h] ||= {}; for (const n of [c.nome, ...(c.apelidos || [])]) tels[h]["cad:" + nrm(n)] = { ...reg, nome: n }; }
  }
  return tels;
}
export const faltamTel = (tels, hubId, nomes) => { const o = []; for (const n of nomes) if (n && !telDe(tels, hubId, n) && !semTelDe(tels, hubId, n) && !o.some(x => mesmoNome(x, n))) o.push(n); return o; };
export async function cobrarCadastros({ agora, cfgA, sign }) {
  const hoje = isoOf(agora), h = lp(agora).h;
  const slots = [{ k: "noite", dia: addDays(hoje, 1), de: 20, ate: 23, quando: "amanhã" }, { k: "manha", dia: hoje, de: 7, ate: 10, quando: "hoje" }];
  for (const s of slots) {
    if (h < s.de || h >= s.ate) continue;
    const key = `cobcad/${s.dia}/${s.k}`; if (await getJ(key)) continue;
    const esc = await lerEscala([s.dia]).catch(() => null); if (!esc) continue;      // sem leitura da escala: tenta de novo na próxima rodada
    await putJ(key, { t: agora });
    const porHub = new Map();
    for (const x of situacoes(esc, s.dia, cfgA).filter(x => !x.vazia && x.nome)) { if (!porHub.has(x.hubId)) porHub.set(x.hubId, { nome: x.hubNome, nomes: [] }); porHub.get(x.hubId).nomes.push(x.nome); }
    for (const [hubId, g] of porHub) {
      const tels = sobreporCadastro({ [hubId]: (await getJ(`tel/${hubId}`)) || {} }, esc.cfg.colaboradores, [hubId]), faltam = faltamTel(tels, hubId, g.nomes), lider = cfgA.hubs?.[hubId]?.lider;
      if (!faltam.length || !lider?.tel) continue;
      const n = faltam.length;
      await notificar(s.dia, lider.tel, `📱 *${g.nome}* — telefones pendentes\nNa escala de ${s.quando} (${br(s.dia)}) ${n === 1 ? "1 colaborador está" : n + " colaboradores estão"} sem telefone cadastrado:\n${faltam.map(x => "• " + x).join("\n")}\n\nSem o telefone, a pessoa não recebe a confirmação do turno e você fica sem o aviso dela.\nCadastre agora (leva 1 minuto), em Cadastros → Colaboradores, com a senha de administrador:\n👉 ${ESCALA_SITE}/cadastros.html\n\nQuem não tem celular: marque "Sem celular" no cadastro da pessoa.`, { tipo: "cadastro_telefones", hub: g.nome, dia: s.dia, para_quem: "lider" });
    }
  }
}

export async function relatorioDiario({ agora, cfgA }) {
  const hoje = isoOf(agora), h = lp(agora).h, h0 = cfgA?.relatorioHora ?? 10; if (!cfgA?.gestor?.tel || h < h0 || h >= h0 + 3) return;      // envia na primeira rodada a partir da hora marcada (janela de 3 h)
  const marca = await getJ(`rel/${hoje}`); if (marca) return; await putJ(`rel/${hoje}`, { t: agora, iniciado: true });
  const r2 = await montarRelatorio(hoje), agoraHm = hm(agora), linhas = [];      // só o resultado de hoje, uma linha por hub (turnos que já começaram)
  for (const hb of r2.resumo?.hubs || []) {
    let P = 0, N = 0; for (const t of hb.turnos) { if (t.inicio > agoraHm || !t.esperados) continue; P += t.presentes; N += t.esperados; }
    if (N) linhas.push(`${P >= N ? "✅" : "⚠️"} *${hb.nome}* — ${P}/${N}`);
  }
  const texto = `📊 *Resultado de hoje — ${br(hoje)} · ${agoraHm}*\n\n${linhas.join("\n") || "Nenhum turno iniciado ainda."}`;
  await notificar(hoje, cfgA.gestor.tel, texto.slice(0, 3800), { tipo: "relatorio", dia: hoje, para_quem: "gestor" });
  await putJ(`rel/${hoje}`, { t: agora, enviado: true });
}

// ------------------------------------------------------------ acompanhamento do dia (página dos líderes): quem confirmou, está a caminho, não vai ou não respondeu, com o carimbo de cada comunicação
const MSG_COLAB = { colab_c0: "Pedimos a confirmação de presença", colab_m1: "Perguntamos se já está a caminho", colab_m2: "Pedimos a localização", colab_m3: "Última cobrança: está chegando?" };
export async function montarAcompanhamento({ dia, hubId, esc, agora }) {
  const cfgA = (await lerConfig()) || { hubs: {} };
  const sit = situacoes(esc, dia, cfgA, agora).filter(s => s.hubId === hubId && !s.extra);
  for (const s of sit) s.id = idDe(dia, s.hubId, s.turnoId, s.vaga, s.pidx || 0);
  const [euL, furoL, outL, resumo, telsRaw] = await Promise.all([listar(`eu/${dia}/`), listar(`furo/${dia}/`), listar(`out/${dia}/`), getJ(`dia/${dia}`), getJ(`tel/${hubId}`)]);
  const eus = Object.fromEntries(euL.map(e => [e.sid, e])), furos = Object.fromEntries(furoL.map(f => [f.id, f]));
  const tels = sobreporCadastro({ [hubId]: telsRaw || {} }, esc.cfg.colaboradores, [hubId]);
  const hubNome = esc.cfg.hubs.find(h => h.id === hubId)?.nome || "";
  const pontoDe = turnoId => resumo?.hubs?.find(h => h.id === hubId)?.turnos?.find(t => t.id === turnoId)?.pessoas || [];
  const msgsHub = outL.filter(o => o.para_quem === "colab" && MSG_COLAB[o.tipo] && o.hub === hubNome && o.nome).sort((a, b) => a.t - b.t);
  const contagem = { presente: 0, caminho: 0, confirmou: 0, nao_vai: 0, sem_resposta: 0, aguardando: 0, sem_tel: 0, vaga: 0, coberto: 0 };
  const ORDEM = { nao_vai: 0, vaga: 1, sem_resposta: 2, sem_tel: 3, aguardando: 4, caminho: 5, confirmou: 6, substituido: 7, coberto: 8, presente: 9 };
  const txtResp = h => h.a === "vou" ? "Confirmou presença" : h.a === "nao_vou" ? "Avisou que não vai"
    : h.a === "caminho" ? (h.dist != null ? `Está a caminho · a ${fmtDist(h.dist)} do hub` : "Marcou que está a caminho") : (h.dist != null ? `Localização: a ${fmtDist(h.dist)} do hub` : "Compartilhou a localização");
  const montar = (s, p) => {
    const r = eus[s.id], f = furos[s.id], ev = [], msgs = s.vazia ? [] : msgsHub.filter(o => mesmoNome(o.nome, s.nome)), sb = f?.substituto;
    // vaga com substituto: o cartão é do substituto, "no lugar de" quem faltou
    const trocaPor = s.vazia ? null : p?.noLugar ? p.nome : (!p?.chegou && sb && !sb.via && !mesmoNome(sb.nome, s.nome) ? sb.nome : null), pre = trocaPor ? `${s.nome}: ` : "";
    // ponto: o resumo do vigia (até 5 min de atraso) ou a marcação na escala
    let tPonto = null, pontoTxt = null;
    if (p?.chegou && /^\d\d:\d\d$/.test(p.chegou)) { tPonto = toMs(dia, p.chegou); if (tPonto < s.inicio - 6 * HOUR) tPonto += DAY; pontoTxt = "Bateu o ponto no hub"; }
    else if (p?.chegou || s.compareceu) { tPonto = s.inicio; pontoTxt = "Presença marcada na escala"; }
    // respostas do colaborador (registros antigos não têm histórico: usa a última resposta e as localizações)
    let resp = [];
    if (r?.hist?.length) resp = r.hist.map(h => ({ ...h }));
    else { if (r?.resp) resp.push({ t: r.respEm || 0, a: r.resp }); for (const l of r?.locs || []) resp.push({ t: l.em, a: "loc", dist: l.dist }); }
    const base = resp.filter(h => h.a !== "loc" && h.t > 0);
    for (const l of resp.filter(h => h.a === "loc" && h.t > 0)) { const c = base.find(h => h.a === "caminho" && h.dist === undefined && Math.abs(h.t - l.t) < 5000); if (c) c.dist = l.dist; else base.push(l); }
    base.sort((a, b) => a.t - b.t);
    for (const m of msgs) ev.push({ t: m.t, k: "msg", txt: pre + MSG_COLAB[m.tipo], envio: m.estado });
    for (const h of base) ev.push({ t: h.t, k: h.a === "nao_vou" ? "nao" : "resp", txt: pre + txtResp(h) });
    for (const e of f?.eventos || []) if (["troca", "escala_alterada", "confirmou", "espelho", "entrou"].includes(e.tipo) || (e.tipo === "caminho" && !/pelo link/.test(e.msg || ""))) ev.push({ t: e.t, k: "lider", txt: e.msg });
    if (tPonto) ev.push({ t: tPonto, k: "ponto", txt: pontoTxt });
    ev.sort((a, b) => a.t - b.t);
    const marcas = ev.filter(e => e.k === "msg");
    marcas.forEach((m, i) => { if (m.envio !== "enviado") return; const prox = marcas[i + 1]?.t ?? Infinity;
      m.res = ev.some(e => (e.k === "resp" || e.k === "nao" || e.k === "ponto") && e.t > m.t && e.t < prox) ? "ok" : (prox !== Infinity || agora > m.t + 10 * MIN ? "sem" : "aguarda"); });
    // situação atual
    const tel = !s.vazia && telDe(tels, hubId, s.nome), sub = sb?.nome, ultDist = [...base].reverse().find(h => h.dist != null)?.dist ?? null; let st, rot, dist = null;
    if (s.vazia) { st = "vaga"; rot = "Vaga sem ninguém lançado"; }
    else if (trocaPor && !tPonto) { if (f?.subAcaminho) { st = "caminho"; rot = "A caminho (confirmado pelo líder)"; } else { st = "substituido"; rot = "Aguardando chegada"; } }
    else if (tPonto) { st = "presente"; rot = /^\d\d:\d\d$/.test(p?.chegou || "") ? `No hub desde ${p.chegou}` : "Presente (marcado na escala)"; }
    else if (f && f.estado === "resolvido" && !f.encerrado) { st = "coberto"; rot = sub ? `Coberto por ${sub}` : "Vaga coberta"; }
    else if (sub) { st = "substituido"; rot = `Substituto: ${sub}`; }
    else if (r?.resp === "nao_vou" || f?.naoVai) { st = "nao_vai"; rot = "Não vai"; }
    else if (r?.resp === "caminho" || f?.aCaminho) { st = "caminho"; dist = ultDist; rot = dist != null ? `A caminho · ${fmtDist(dist)} do hub` : "A caminho"; }
    else if (r?.resp === "vou") { st = "confirmou"; rot = "Confirmou presença"; }
    else if (!tel) { st = "sem_tel"; rot = semTelDe(tels, hubId, s.nome) ? "Sem celular" : "Sem telefone cadastrado"; }
    else if (msgs.some(m => m.estado === "enviado")) { st = "sem_resposta"; rot = "Sem resposta"; }
    else { st = "aguardando"; rot = "Aguardando"; }
    contagem[st === "substituido" ? "coberto" : st]++;
    return { id: s.id, nome: s.vazia ? "Vaga sem ninguém lançado" : (trocaPor || s.nome), ...(trocaPor ? { noLugar: s.nome } : {}), st, rot, dist, ev: ev.map(e => ({ hm: hm(e.t), k: e.k, txt: e.txt, ...(e.envio ? { envio: e.envio } : {}), ...(e.res ? { res: e.res } : {}) })) };
  };
  const turnos = new Map();
  for (const s of sit) {
    if (!turnos.has(s.turnoId)) turnos.set(s.turnoId, { id: s.turnoId, nome: s.turno, ini: s.tIni, inicio: hm(s.tIni), fim: hm(s.tFim), pessoas: [] });
    const pts = pontoDe(s.turnoId), p = s.vazia ? null : (pts.find(x => x.noLugar && mesmoNome(x.noLugar, s.nome)) || pts.find(x => !x.noLugar && mesmoNome(x.nome, s.nome)));
    turnos.get(s.turnoId).pessoas.push(montar(s, p));
  }
  for (const t of turnos.values()) {      // quem bateu o ponto sem estar na escala
    for (const p of pontoDe(t.id).filter(x => x.sem && !sit.some(s => s.turnoId === t.id && !s.vazia && mesmoNome(s.nome, x.nome)))) {
      contagem.presente++; t.pessoas.push({ id: "x" + nrm(p.nome), nome: p.nome, st: "presente", rot: `No hub desde ${p.chegou}`, dist: null, ev: [{ hm: p.chegou, k: "ponto", txt: "Bateu o ponto no hub (fora da escala: não estava lançado)" }] });
    }
    t.pessoas.sort((a, b) => ORDEM[a.st] - ORDEM[b.st] || a.nome.localeCompare(b.nome, "pt-BR"));
  }
  return { dia, hubId, hubNome, agora: hm(agora), pontoEm: resumo?.geradoEm ? hm(resumo.geradoEm) : null, contagem, turnos: [...turnos.values()].sort((a, b) => a.ini - b.ini).map(({ ini, ...t }) => t) };
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
      furos: fs.sort((a, b) => (a.estado === "resolvido") - (b.estado === "resolvido") || String(a.nome).localeCompare(String(b.nome))).map(f => ({ id: f.id, token: tokenFuro(sign, dia, f.id), nome: f.nome, vazia: f.vazia, turno: f.turno, estado: f.estado, aCaminho: !!f.aCaminho, naoVai: !!f.naoVai, substituto: f.substituto?.nome || null, subAcaminho: !!f.subAcaminho, encerrado: !!f.encerrado })) });
  }
  if (path === "/api/alerta/responder" && req.method === "POST") {
    const b = await req.json().catch(() => ({})), dia = String(b.d || ""), id = String(b.f || "");
    if (!/^\d{4}-\d\d-\d\d$/.test(dia) || String(b.t) !== tokenFuro(sign, dia, id)) return erro("Link inválido ou expirado.", 403);
    const f = await getJ(`furo/${dia}/${id}`); if (!f) return erro("Furo não encontrado.", 404); if (f.estado === "resolvido") return erro("Este furo já foi encerrado.", 409);
    const cfgA = await lerConfig(), lider = cfgA?.hubs?.[f.hubId]?.lider?.nome || "O líder", agora = Date.now();
    if (b.acao === "cuidando") { f.estado = "cuidando"; f.cuidandoEm = agora; evento(f, "cuidando", `${lider} informou que está cuidando.`, lider); await putJ(`furo/${dia}/${id}`, f);
      await notificar(dia, cfgA?.hubs?.[f.hubId]?.lider?.tel, `✅ Registrado: você está cuidando do furo em *${f.hubNome}* (${f.turno}). Quando cobrir, informe quem entrou pelo mesmo link.`, { tipo: "cuidando", hub: f.hubNome, furo: id, dia, para_quem: "lider" }); return json({ ok: true, estado: f.estado }); }
    if (b.acao === "caminho" && f.substituto) {      // há substituto: quem está a caminho é ele, não quem faltou
      f.subAcaminho = true; f.subAcaminhoEm = agora; if (f.estado === "aberto") f.estado = "cuidando"; evento(f, "caminho", `${lider} confirmou que ${f.substituto.nome} (no lugar de ${f.nome || "quem faltou"}) está a caminho.`, lider); await putJ(`furo/${dia}/${id}`, f); return json({ ok: true, estado: f.estado });
    }
    if (b.acao === "caminho") {      // o líder confirma que a pessoa está a caminho (sem mensagem de volta: o histórico guarda)
      f.aCaminho = true; f.aCaminhoEm = agora; if (f.estado === "aberto") f.estado = "cuidando"; evento(f, "caminho", `${lider} confirmou que ${f.nome || "a pessoa"} está a caminho.`, lider); await putJ(`furo/${dia}/${id}`, f); return json({ ok: true, estado: f.estado });
    }
    if (b.acao === "trocou") {
      const nome = String(b.substituto || "").replace(/\s+/g, " ").trim(); if (nome.length < 2) return erro("Informe quem vai cobrir.");
      const esc = await lerEscala([dia]).catch(() => null), cad = esc ? esc.cfg.colaboradores.map(c => c.nome).find(n => mesmoNome(n, nome)) : nome; if (!cad) return erro("Esse nome não está cadastrado na escala. Cadastre a pessoa lá primeiro.");
      // quem faltou deixa de contar como "a caminho" e o substituto começa do zero
      f.estado = "trocado"; f.substituto = { nome: cad, informadoEm: agora }; f.trocaEm = agora; f.aCaminho = false; delete f.aCaminhoPor; f.loc = null; f.subAcaminho = false; delete f.resolvidoVia; evento(f, "troca", `${lider} informou que ${cad} cobre a vaga${f.nome ? " de " + f.nome : ""}.`, lider); await putJ(`furo/${dia}/${id}`, f);
      await notificar(dia, cfgA?.hubs?.[f.hubId]?.lider?.tel, `🔁 Troca registrada em *${f.hubNome}* (${f.turno}): *${cad}* cobre ${f.nome ? "a vaga de " + f.nome : "a vaga"}. Você será avisado quando bater o ponto. Lembre de ajustar a escala.`, { tipo: "troca", hub: f.hubNome, furo: id, dia, para_quem: "lider" }); return json({ ok: true, estado: f.estado });
    }
    if (b.acao === "confirmou") {      // o líder garante que a vaga está coberta, mesmo sem ponto no hub (ex.: já bateu em outro lugar ou é o próprio líder)
      f.estado = "resolvido"; f.resolvidoEm = agora; f.confirmadoPor = lider; f.confirmadoEm = agora;
      evento(f, "confirmou", `${lider} confirmou que a vaga está coberta${f.substituto?.nome ? " por " + f.substituto.nome : ""} (confirmação manual, sem batida no hub).`, lider); await putJ(`furo/${dia}/${id}`, f);
      await notificar(dia, cfgA?.hubs?.[f.hubId]?.lider?.tel, `✅ Cobertura confirmada em *${f.hubNome}* (${f.turno}). Furo encerrado.`, { tipo: "confirmou", hub: f.hubNome, furo: id, dia, para_quem: "lider" }); return json({ ok: true, estado: f.estado });
    }
    return erro("Ação inválida.");
  }
  // acompanhamento do dia para os líderes (somente leitura): um link só, com o seletor de data e de hub na própria página
  if (path === "/api/alerta/acompanhar" && req.method === "GET") {
    if (String(q.get("t") || "") !== sign("acompanhar")) return erro("Link inválido ou expirado.", 403);
    const agora = Date.now(), dia = /^\d{4}-\d\d-\d\d$/.test(q.get("d") || "") ? q.get("d") : isoOf(agora);
    const esc = await lerEscala([dia]).catch(() => null); if (!esc) return erro("Não consegui ler a escala agora. Tente de novo em instantes.", 503);
    const hubs = esc.cfg.hubs.map(h => ({ id: h.id, nome: h.nome })), hubId = hubs.find(h => h.id === q.get("h"))?.id || hubs[0]?.id; if (!hubId) return erro("Nenhum hub cadastrado na escala.", 404);
    return json({ hubs, hoje: isoOf(agora), ...(await montarAcompanhamento({ dia, hubId, esc, agora })) });
  }
  // cadastro de telefones da equipe: o líder usa o link do próprio hub (token assinado); cada hub só enxerga e grava os seus
  const fmtTel = v => { let d = soDigitos(v); if (!d) return ""; if (d.startsWith("55") && d.length > 11) d = d.slice(2); return d.length === 10 || d.length === 11 ? "55" + d : null; };
  // exporta os telefones que os líderes já cadastraram na central, só para o administrador logado na escala (confere o login no Firebase)
  if (path === "/api/alerta/tel-export") {
    const CORS = { "Access-Control-Allow-Origin": "https://escala-operacional-orion.netlify.app", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method !== "POST") return json({ error: "Método inválido." }, 405, CORS);
    const b = await req.json().catch(() => ({})), f = await firebaseCfg();
    const u = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${f.apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: String(b.idToken || "") }), signal: AbortSignal.timeout(8000) }).then(r => r.json()).catch(() => null);
    const email = String(u?.users?.[0]?.email || "").toLowerCase();
    if (!email || !f.adminEmail || email !== f.adminEmail.toLowerCase()) return json({ error: "Acesso negado: entre como administrador." }, 403, CORS);
    const esc = await lerEscala([isoOf(Date.now())]), hubs = {};
    for (const h of esc.cfg.hubs) hubs[h.id] = Object.values((await getJ(`tel/${h.id}`)) || {}).map(x => ({ nome: x.nome, tel: x.tel || "", semTel: !!x.semTel, motivo: x.motivo || "" }));
    return json({ ok: true, hubs }, 200, CORS);
  }
  // consulta da escala (só nomes): quais destes colaboradores ainda estão sem telefone cadastrado. Não devolve telefone nem link.
  if (path === "/api/alerta/checar") {
    const CORS = { "Access-Control-Allow-Origin": "https://escala-operacional-orion.netlify.app", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method !== "POST") return json({ error: "Método inválido." }, 405, CORS);
    const b = await req.json().catch(() => ({})), h = String(b.h || "").slice(0, 80), nomes = Array.isArray(b.nomes) ? b.nomes.slice(0, 300).map(x => String(x || "").slice(0, 80)) : [];
    if (!h) return json({ error: "Hub inválido." }, 400, CORS);
    return json({ ok: true, faltam: faltamTel({ [h]: (await getJ(`tel/${h}`)) || {} }, h, nomes) }, 200, CORS);
  }
  if (path === "/api/alerta/equipe" && (req.method === "GET" || req.method === "POST")) {
    const b = req.method === "POST" ? await req.json().catch(() => ({})) : {}, h = String(b.h ?? q.get("h") ?? ""), t = String(b.t ?? q.get("t") ?? "");
    if (!h || t !== sign(`equipe:${h}`)) return erro("Link inválido ou expirado.", 403);
    const esc = await lerEscala([isoOf(Date.now())]).catch(() => null), hub = esc?.cfg.hubs.find(x => x.id === h); if (!hub) return erro("Hub não encontrado.", 404);
    const salvos = (await getJ(`tel/${h}`)) || {};
    if (req.method === "POST") {
      const lista = Array.isArray(b.lista) ? b.lista.slice(0, 300) : null; if (!lista) return erro("Lista inválida.");
      const novo = {}, ruins = [];
      for (const x of lista) {
        const nome = String(x?.nome || "").replace(/\s+/g, " ").trim().slice(0, 80); if (nome.length < 2) continue;
        const tel = fmtTel(x?.tel); if (tel === null) { ruins.push(nome); continue; }
        if (x?.semTel && !tel) novo[nrm(nome)] = { nome, tel: "", semTel: true, motivo: String(x.motivo || "").replace(/\s+/g, " ").trim().slice(0, 120), em: Date.now() };
        else if (tel) novo[nrm(nome)] = { nome, tel };
      }
      if (ruins.length) return erro(`Telefone inválido para: ${ruins.join(", ")}. Use DDD + número (ex.: 11 91234-5678).`);
      await putJ(`tel/${h}`, novo); return json({ ok: true, total: Object.values(novo).filter(x => x.tel).length, semCelular: Object.values(novo).filter(x => x.semTel).length });
    }
    const nomes = new Map(); for (const c of esc.cfg.colaboradores) if (c.hubId === h && c.nome) nomes.set(nrm(c.nome), c.nome);
    for (const [k, v] of Object.entries(salvos)) if (!nomes.has(k)) nomes.set(k, v.nome);
    const hl = await getJ(`hubloc/${h}`);
    return json({ hubNome: hub.nome, local: hl ? { em: hl.em } : null, pessoas: [...nomes].map(([k, nome]) => ({ nome, tel: salvos[k]?.tel ? salvos[k].tel.replace(/^55/, "") : "", semTel: !!salvos[k]?.semTel, motivo: salvos[k]?.motivo || "" })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) });
  }
  // página do colaborador: confirma que está a caminho ou avisa que não vai (vale só para ele neste turno, pelo token do link)
  if (path === "/api/alerta/eu" && (req.method === "GET" || req.method === "POST")) {
    const b = req.method === "POST" ? await req.json().catch(() => ({})) : {}, dia = String(b.d ?? q.get("d") ?? ""), sid = String(b.s ?? q.get("s") ?? ""), t = String(b.t ?? q.get("t") ?? "");
    if (!/^\d{4}-\d\d-\d\d$/.test(dia) || !sid || t !== tokenColab(sign, dia, sid)) return erro("Link inválido ou expirado.", 403);
    const e = await getJ(`eu/${dia}/${sid}`); if (!e) return erro("Link não encontrado.", 404); const agora = Date.now();
    const fase = agora >= e.fim ? "encerrado" : agora < e.inicio - 35 * MIN ? "antes" : agora < e.inicio + 4 * MIN ? "perto" : "atrasado", ult = e.locs?.[e.locs.length - 1];
    if (req.method === "GET") return json({ nome: e.nome, hubNome: e.hubNome, turno: e.turno, inicioHm: hm(e.inicio), resp: e.resp || null, fase, encerrado: fase === "encerrado", dist: ult?.dist ?? null, distEm: ult ? hm(ult.em) : null });
    if (fase === "encerrado") return erro("Este turno já terminou.", 409);
    const acao = b.acao; if (!["vou", "caminho", "nao_vou", "loc"].includes(acao)) return erro("Ação inválida.");
    const anterior = e.resp || null, lat = Number(b.lat), lon = Number(b.lon);
    let locNova = null;
    // localização: guarda só a distância até o hub (nunca as coordenadas da pessoa)
    if ((acao === "caminho" || acao === "loc") && b.lat != null && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      const hl = await getJ(`hubloc/${e.hubId}`); (e.locs ||= []).push({ dist: hl ? distM({ lat, lon }, hl) : null, prec: Number.isFinite(Number(b.prec)) ? Math.round(Number(b.prec)) : null, em: agora }); e.locs = e.locs.slice(-10); locNova = e.locs[e.locs.length - 1];
    }
    if (acao === "nao_vou") e.resp = "nao_vou"; else if (acao === "caminho") e.resp = "caminho"; else if (acao === "vou" && (!e.resp || e.resp === "nao_vou")) e.resp = "vou";
    if (acao !== "loc") e.respEm = agora;
    (e.hist ||= []).push({ t: agora, a: acao, ...(locNova ? { dist: locNova.dist } : {}) }); e.hist = e.hist.slice(-40);      // carimbo de cada resposta, para a página de acompanhamento
    await putJ(`eu/${dia}/${sid}`, e);
    let f = await getJ(`furo/${dia}/${sid}`); const cfgA = await lerConfig(), tel = cfgA?.hubs?.[e.hubId]?.lider?.tel, nova = e.locs?.[e.locs.length - 1], resp = { ok: true, resp: e.resp, dist: nova?.dist ?? ult?.dist ?? null };
    if (acao === "nao_vou") {
      if (anterior === "nao_vou" || f?.estado === "resolvido") return json(resp);
      if (!f) f = { id: sid, dia, hubId: e.hubId, hubNome: e.hubNome, turnoId: e.turnoId, turno: e.turno, vaga: e.vaga, nome: e.nome, vazia: false, inicio: e.inicio, fim: e.fim, estado: "aberto", criadoEm: agora, tIni: e.tIni, eventos: [] };
      f.naoVai = true; f.aCaminho = false; evento(f, "nao_vai", `${e.nome} avisou pelo link que não vai conseguir ir ao turno.`); await putJ(`furo/${dia}/${sid}`, f);
      await notificar(dia, tel, `⚠️ *${e.nome}* avisou que *não vai conseguir ir* ao turno de *${e.hubNome}* (${e.turno} ${hm(e.inicio)}). Providencie a cobertura agora:\n👉 ${linkTurno(sign, dia, e.hubId, e.tIni)}`, { tipo: "colab_nao_vou", hub: e.hubNome, furo: sid, dia, para_quem: "lider" });
      return json(resp);
    }
    let mudou = false;
    if (anterior === "nao_vou" && f?.naoVai && f.estado !== "resolvido") { f.naoVai = false; mudou = true; evento(f, "mudou_de_ideia", `${e.nome} mudou de ideia e vai comparecer.`);
      await notificar(dia, tel, `✅ *${e.nome}* mudou de ideia e avisou que *vai comparecer* ao turno de *${e.hubNome}* (${e.turno} ${hm(e.inicio)}).`, { tipo: "colab_voltou", hub: e.hubNome, furo: sid, dia, para_quem: "lider" }); }
    if (acao === "caminho" && f && f.estado !== "resolvido" && !f.substituto && !f.aCaminho) { f.aCaminho = true; f.aCaminhoEm = agora; f.aCaminhoPor = "colab"; if (f.estado === "aberto") f.estado = "cuidando"; mudou = true; evento(f, "caminho", `${e.nome} confirmou pelo link que está a caminho.`); }
    if (mudou) await putJ(`furo/${dia}/${sid}`, f);
    return json(resp);
  }
  // local do hub (só a distância até ele é usada): quem está no hub marca a posição atual, pelo link da equipe
  if (path === "/api/alerta/hub-local" && req.method === "POST") {
    const b = await req.json().catch(() => ({})), h = String(b.h || ""), lat = Number(b.lat), lon = Number(b.lon), prec = Number(b.prec);
    if (!h || String(b.t) !== sign(`equipe:${h}`)) return erro("Link inválido ou expirado.", 403);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return erro("Localização inválida.");
    if (Number.isFinite(prec) && prec > 300) return erro(`A localização está imprecisa (${Math.round(prec)} m). Vá para um lugar aberto e tente de novo.`);
    await putJ(`hubloc/${h}`, { lat, lon, prec: Number.isFinite(prec) ? Math.round(prec) : null, em: Date.now() }); return json({ ok: true });
  }
  if (!isAdmin(req)) return erro("Não autorizado", 401);
  if (path === "/api/alerta/equipe-links" && req.method === "GET") {      // links do cadastro de equipe, um por hub, para a gestão repassar aos líderes
    const esc = await lerEscala([isoOf(Date.now())]);
    return json({ acompanhar: `${BASE_URL}/acompanhar.html?t=${sign("acompanhar")}`, hubs: await Promise.all(esc.cfg.hubs.map(async h => ({ id: h.id, nome: h.nome, link: linkEquipe(sign, h.id), cadastrados: Object.keys((await getJ(`tel/${h.id}`)) || {}).length, local: !!(await getJ(`hubloc/${h.id}`)) }))) });
  }
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
