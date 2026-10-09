// Painel de Ponto — API (Netlify Function v2). Port do server.py.
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import HIST from "./historico.json";

// ------------------------------------------------------------ configuração (variáveis de ambiente do Netlify)
const env = (k, d = "") => (process.env[k] ?? d).toString().trim();
let TOKEN = env("TANGERINO_TOKEN");
if (/^basic /i.test(TOKEN)) TOKEN = TOKEN.slice(6).trim();
const PASSWORD = env("APP_PASSWORD");
const TZ_OFFSET_H = parseFloat(env("TZ_OFFSET_HOURS", "-3"));          // Brasília (sem horário de verão)
const SCHED_OFFSET_MS = parseFloat(env("SCHEDULE_UTC_OFFSET_HOURS", "-3")) * 3600000;
const TOL = parseInt(env("LATE_TOLERANCE_MIN", "10"), 10);
const HOLIDAYS = new Set(env("HOLIDAYS").split(",").map(s => s.trim()).filter(Boolean));
const SECRET = env("SESSION_SECRET") || crypto.createHash("sha256").update("ponto:" + PASSWORD + ":" + TOKEN).digest("hex");

const EMPLOYER = "https://employer.tangerino.com.br";
const PUNCH_BASES = ["https://apis.tangerino.com.br/punch/", "https://api.tangerino.com.br/api/punch/"];
const HOUR = 3600000, DAY = 86400000;

// ------------------------------------------------------------ utilidades
const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
const pick = (o, ...names) => { for (const n of names) if (o && o[n] !== undefined && o[n] !== null) return o[n]; return undefined; };
const pad = n => String(n).padStart(2, "0");
const localParts = ms => { const d = new Date(ms + TZ_OFFSET_H * HOUR); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay() }; };
const isoOf = ms => { const p = localParts(ms); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; };
const isoToUtcMidnight = iso => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const isoToLocalStartMs = iso => isoToUtcMidnight(iso) - TZ_OFFSET_H * HOUR;
const addDays = (iso, n) => { const d = new Date(isoToUtcMidnight(iso) + n * DAY); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const apiDay = iso => new Date(isoToUtcMidnight(iso)).getUTCDay() + 1;       // 1=Dom … 7=Sáb
const schedMin = ms => Math.floor((((ms + SCHED_OFFSET_MS) % DAY) + DAY) % DAY / 60000);
const hm2min = t => { const [h, m] = String(t).split(":").map(Number); if (isNaN(h) || isNaN(m)) throw new Error("hora inválida"); return h * 60 + m; };
const hhmm = p => `${pad(p.h)}:${pad(p.mi)}`;
const empId = p => { const e = pick(p, "employee", "employeeDTO"); return (e && typeof e === "object") ? e.id : (pick(p, "employeeId") ?? e); };

// ------------------------------------------------------------ chamadas à API Tangerino
const deadline = { t: 0 };
async function httpGet(url, params) {
  const u = new URL(url); for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
  const left = deadline.t - Date.now(); if (left < 500) throw Object.assign(new Error("Tempo esgotado: escolha um período menor (ex.: semana)."), { status: 504 });
  const r = await fetch(u, { headers: { Authorization: "Basic " + TOKEN, Accept: "application/json" }, signal: AbortSignal.timeout(Math.min(left, 9000)) });
  if (!r.ok) throw Object.assign(new Error(`Erro HTTP ${r.status} da API Tangerino`), { status: 502, upstream: r.status });
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
async function paged(url, params = {}, size = 200) {
  const first = await httpGet(url, { ...params, page: 0, size });
  if (Array.isArray(first) || !first) return first || [];
  const items = [...(first.content || [])];
  const total = Math.min(first.totalPages || 1, 200);
  if (first.last === true || total <= 1 || !items.length) return items;
  const rest = Array.from({ length: total - 1 }, (_, i) => i + 1);
  for (let i = 0; i < rest.length; i += 6) {
    const got = await Promise.all(rest.slice(i, i + 6).map(p => httpGet(url, { ...params, page: p, size })));
    for (const g of got) items.push(...(Array.isArray(g) ? g : (g?.content || [])));
  }
  return items;
}
const memo = new Map();
async function cached(key, ttl, fn) { const h = memo.get(key); if (h && Date.now() - h.t < ttl) return h.v; const v = await fn(); memo.set(key, { t: Date.now(), v }); return v; }
let punchBase = null;
async function punchUrl() {
  if (punchBase) return punchBase; let last;
  for (const b of PUNCH_BASES) { try { await httpGet(b, { page: 0, size: 1 }); punchBase = b; return b; } catch (e) { last = e; } }
  throw new Error("Não consegui acessar a API de pontos: " + (last?.message || ""));
}
const loadEmployees = () => cached("emp", 600000, () => paged(EMPLOYER + "/employee/find-all"));
const loadSchedules = () => cached("sch", 600000, async () => Object.fromEntries((await paged(EMPLOYER + "/work-schedule")).map(s => [s.id, s])));
const normName = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
// histórico importado do Tangerino (relatório "Coleta de Pontos Originais", setembro/2026): só entra onde a API não trouxe a batida
async function withHistory(api, a, b) {
  const emps = await loadEmployees(), idByName = new Map(emps.map(e => [normName(pick(e, "name", "nome")), e.id]));
  const have = new Set(api.map(p => empId(p) + "|" + Math.floor(pick(p, "dateIn", "startDate", "date", "punchDate") / 60000)));
  const extra = [];
  for (const [n, pairs] of Object.entries(HIST)) {
    const id = idByName.get(n); if (id == null) continue;
    for (const [i, o] of pairs) if (i >= a && i <= b && !have.has(id + "|" + Math.floor(i / 60000))) extra.push({ employee: { id }, dateIn: i, dateOut: o, _hist: true });
  }
  return api.concat(extra);
}
const loadPunches = (d0, d1) => { const a = isoToLocalStartMs(d0), b = isoToLocalStartMs(addDays(d1, 1)) - 1; return cached(`p${a}-${b}`, 120000, async () => withHistory(await paged(await punchUrl(), { startDate: a, endDate: b }), a, b)); };
const loadAdjustments = (d0, d1) => { const a = isoToLocalStartMs(d0), b = isoToLocalStartMs(addDays(d1, 1)) - 1;
  return cached(`a${a}-${b}`, 300000, async () => { try { return await paged(EMPLOYER + "/adjustment/find-all", { startDate: a, endDate: b }); } catch { return []; } }); };

// ------------------------------------------------------------ armazenamento (horários e hubs) no Netlify Blobs
const store = () => getStore({ name: "ponto", consistency: "strong" });
const readKey = async k => (await store().get(k, { type: "json" })) || {};
const writeKey = (k, v) => store().setJSON(k, v);
const TIPOS = ["6x1", "12x36", "intermitente"];
function validateHorario(h) {
  try { return validateHorarioRaw(h); } catch (e) { throw Object.assign(new Error(e.message === "hora inválida" ? "Preencha entrada e saída" : e.message), { status: 400 }); }
}
function validateHorarioRaw(h) {
  const type = TIPOS.includes(h.type) ? h.type : "6x1";
  if (type === "intermitente") return { type, days: [], start: "", end: "", break_min: 0 };
  hm2min(h.start); hm2min(h.end);
  const break_min = Math.max(0, parseInt(h.break_min || 0, 10) || 0);
  if (type === "12x36") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(h.anchor || "")) throw new Error("12x36: informe o dia de trabalho de referência");
    return { type, days: [], start: h.start, end: h.end, break_min, anchor: h.anchor };
  }
  const days = [...new Set((h.days || []).map(Number).filter(d => d >= 1 && d <= 7))].sort();
  if (days.length !== 6) throw new Error("6x1: marque exatamente 6 dias de trabalho (1 folga)");
  return { type, days, start: h.start, end: h.end, break_min };
}
const labelHorario = h => {
  const brk = h.break_min ? ` (pausa ${h.break_min} min)` : "";
  if (h.type === "intermitente") return "Intermitente · sem horário fixo";
  if (h.type === "12x36") return `12x36 · ${h.start}–${h.end}${brk} · ref. ${String(h.anchor).split("-").reverse().join("/")}`;
  const n = (h.days || []).length;
  return `${h.type === "6x1" || n === 6 ? "6x1" : n === 5 ? "5x2" : n + " dias"} · ${h.start}–${h.end}${brk}`;
};
const hmFmt = m => { const s = m < 0 ? "-" : ""; m = Math.abs(Math.round(m)); return `${s}${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };

// ------------------------------------------------------------ análise
async function analyze(d0, d1) {
  const [empsAll, schedules, hor, hubs, punches, adjs, exc] = await Promise.all([loadEmployees(), loadSchedules(), readKey("horarios"), readKey("hubs"), loadPunches(d0, d1), loadAdjustments(d0, d1), readKey("excluidos")]);
  const emps = empsAll.filter(e => pick(e, "active", "ativo") !== false && !e.fired && !exc[String(e.id)]);
  const nowMs = Date.now(), nowP = localParts(nowMs), today = isoOf(nowMs), nowMin = nowP.h * 60 + nowP.mi;

  const byEmpDay = new Map();
  for (const p of punches) {
    const eid = empId(p), din = pick(p, "dateIn", "startDate", "date", "punchDate"), dout = pick(p, "dateOut", "endDate");
    if (eid == null || din == null) continue;
    const k = eid + "|" + isoOf(din); if (!byEmpDay.has(k)) byEmpDay.set(k, []); byEmpDay.get(k).push([din, dout ?? null]);
  }
  const adjDays = new Map();
  for (const a of adjs) {
    const eid = empId(a), s = pick(a, "startDate"), e = pick(a, "endDate", "startDate"); if (eid == null || s == null) continue;
    if (String(pick(a, "status") ?? "APROVADO").toUpperCase() === "REPROVADO") continue;
    const reason = pick(a, "adjustmentReasonDTO", "adjustmentReason") || {};
    for (let c = isoOf(s), last = isoOf(e); c <= last; c = addDays(c, 1))
      adjDays.set(eid + "|" + c, { desc: pick(reason, "description") ?? "Ajuste", full: pick(a, "fullDay") !== undefined ? !!pick(a, "fullDay") : true, missing: !!pick(reason, "countAsMissing") });
  }

  const result = [];
  for (const e of emps) {
    const eid = e.id;
    const ws = pick(e, "currentWorkSchedule", "workSchedule", "workScheduleDTO");
    const wsId = ws && typeof ws === "object" ? ws.id : ws;
    const sch = schedules[wsId] || (ws && typeof ws === "object" && ws.workScheduleTimetableList ? ws : null);
    let table = {};
    for (const t of (sch?.workScheduleTimetableList || [])) {
      const segs = [];
      for (const [a, b] of [["startShift1", "endShift1"], ["startShift2", "endShift2"]]) if (t[a] != null && t[b] != null) segs.push([schedMin(t[a]), schedMin(t[b])]);
      table[t.day] = segs;
    }
    let brk = 0, src = sch?.name || "— sem escala —";
    const custom = hor[String(eid)];
    const isInter = custom?.type === "intermitente";
    let segsFor = cur => table[apiDay(cur)] || [];
    if (custom) {
      brk = custom.break_min || 0; src = "✔ " + labelHorario(custom);
      if (isInter) segsFor = () => [];
      else {
        const a = hm2min(custom.start); let b = hm2min(custom.end); if (b <= a) b += 1440;     // turno que passa da meia-noite
        if (custom.type === "12x36") {
          segsFor = cur => { const n = Math.round((isoToUtcMidnight(cur) - isoToUtcMidnight(custom.anchor)) / DAY); return ((n % 2) + 2) % 2 === 0 ? [[a, b]] : []; };
        } else {
          table = {}; for (const d of custom.days) table[d] = [[a, b]];
        }
      }
    }
    const admRaw = pick(e, "admissionDate", "admission"); const admIso = typeof admRaw === "number" ? isoOf(admRaw) : (typeof admRaw === "string" && /^\d{4}-\d\d-\d\d/.test(admRaw) ? admRaw.slice(0, 10) : null);
    const tot = { early: 0, early_min: 0, late: 0, late_min: 0, absences: 0, expected: 0, worked: 0, incomplete: 0 };
    const days = [];
    for (let cur = d0; cur <= d1; cur = addDays(cur, 1)) {
      const segs = segsFor(cur);
      let expected = segs.length ? Math.max(0, segs.reduce((s, [a, b]) => s + b - a, 0) - brk) : 0;
      const marks = [...(byEmpDay.get(eid + "|" + cur) || [])].sort((x, y) => x[0] - y[0]);
      const adj = adjDays.get(eid + "|" + cur);
      const pre = admIso && cur < admIso && !marks.length; if (pre) expected = 0;     // antes da admissão: não conta falta
      const rec = { date: cur, weekday: apiDay(cur), expected, status: "folga", marks: [] };
      let worked = 0, firstIn = null, open = false;
      for (const [din, dout] of marks) {
        const li = localParts(din); rec.marks.push([hhmm(li), dout ? hhmm(localParts(dout)) : null]);
        const liMin = li.h * 60 + li.mi; firstIn = firstIn === null ? liMin : Math.min(firstIn, liMin);
        if (dout) worked += Math.max(0, Math.floor((dout - din) / 60000)); else open = true;
      }
      rec.worked = worked;
      if (isInter) {                       // intermitente: sem previsto — conta só o que foi trabalhado (saldo sempre 0)
        if (cur > today) { rec.status = "futuro"; }
        else if (marks.length) {
          rec.status = "trabalhou";
          if (open) { rec.note = "Saída sem batida"; if (cur < today) tot.incomplete++; else worked = 0; }
          expected = worked; rec.expected = worked;
        }
      }
      else if (HOLIDAYS.has(cur)) { rec.status = "feriado"; expected = 0; rec.expected = 0; }
      else if (adj && (adj.full || !marks.length)) {
        rec.status = "abonado"; rec.note = adj.desc;
        if (adj.missing) { tot.absences++; rec.status = "falta"; }
        if (rec.status === "abonado") expected = 0;
      }
      else if (cur > today) { rec.status = "futuro"; expected = 0; }
      else if (expected > 0 && !marks.length && !pre) {
        if (cur === today) {
          rec.status = nowMin > segs[0][0] + TOL ? "atrasado-sem-batida" : "aguardando";
          if (rec.status === "atrasado-sem-batida") tot.late++;
          expected = 0;
        } else { rec.status = "falta"; tot.absences++; }
      }
      else if (marks.length) {
        rec.status = "ok";
        if (expected > 0 && firstIn !== null) {
          const delay = firstIn - segs[0][0];
          if (delay > TOL) { rec.status = "atraso"; rec.late_min = delay; tot.late++; tot.late_min += delay; }
          else if (delay < -TOL) { rec.early_min = -delay; tot.early++; tot.early_min += -delay; }
        }
        if (open && cur < today) { rec.status = "incompleto"; tot.incomplete++; }
        if (cur === today) { if (open) { expected = 0; worked = 0; } else if (worked < expected) expected = worked; }
      }
      else if (expected === 0) rec.status = "folga";
      if (!["futuro", "feriado", "aguardando"].includes(rec.status)) { tot.expected += expected; tot.worked += worked; }
      rec.balance = !["futuro", "folga", "aguardando"].includes(rec.status) ? worked - expected : 0;
      days.push(rec);
    }
    result.push({ id: eid, name: pick(e, "name", "nome") ?? `#${eid}`, schedule: src, custom: !!custom, hub: hubs[String(eid)] || "",
      totals: { ...tot, balance: tot.worked - tot.expected }, days });
  }
  result.sort((a, b) => b.totals.absences - a.totals.absences || b.totals.late - a.totals.late || a.name.localeCompare(b.name));
  const np = localParts(nowMs);
  return { start: d0, end: d1, tolerance: TOL, generated: `${pad(np.d)}/${pad(np.m)}/${np.y} ${pad(np.h)}:${pad(np.mi)}`, employees: result };
}

// ------------------------------------------------------------ autenticação (senha + cookie assinado)
const sign = s => crypto.createHmac("sha256", SECRET).update(s).digest("base64url");
const makeSession = () => { const exp = Date.now() + 7 * DAY; return `${exp}.${sign(String(exp))}`; };
function validSession(req) {
  const m = /(?:^|;\s*)ponto_session=([^;]+)/.exec(req.headers.get("cookie") || ""); if (!m) return false;
  const [exp, sig] = m[1].split("."); if (!exp || !sig || Number(exp) < Date.now()) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(exp)); return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const safeEq = (a, b) => { const x = crypto.createHash("sha256").update(a).digest(), y = crypto.createHash("sha256").update(b).digest(); return crypto.timingSafeEqual(x, y); };
let fails = 0, failWindow = 0;

// ------------------------------------------------------------ rotas
export default async (req) => {
  deadline.t = Date.now() + 9000;
  const url = new URL(req.url), path = url.pathname.replace(/\/+$/, "");
  try {
    if (!TOKEN || !PASSWORD) return json({ error: "Configuração incompleta: defina TANGERINO_TOKEN e APP_PASSWORD nas variáveis de ambiente do Netlify." }, 500);

    if (path === "/api/login" && req.method === "POST") {
      if (Date.now() - failWindow > 600000) { fails = 0; failWindow = Date.now(); }
      if (fails >= 8) return json({ error: "Muitas tentativas. Aguarde alguns minutos." }, 429);
      const body = await req.json().catch(() => ({}));
      if (!safeEq(String(body.password || ""), PASSWORD)) { fails++; await new Promise(r => setTimeout(r, 800)); return json({ error: "Senha incorreta" }, 401); }
      return json({ ok: true }, 200, { "Set-Cookie": `ponto_session=${makeSession()}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${7 * 86400}` });
    }
    if (path === "/api/logout") return json({ ok: true }, 200, { "Set-Cookie": "ponto_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" });
    if (!validSession(req)) return json({ error: "Não autorizado" }, 401);

    if (path === "/api/report" && req.method === "GET") {
      const t = isoOf(Date.now()); const d0 = url.searchParams.get("start") || t.slice(0, 8) + "01", d1 = url.searchParams.get("end") || t;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d0) || !/^\d{4}-\d{2}-\d{2}$/.test(d1) || d1 < d0) return json({ error: "Datas inválidas" }, 400);
      if ((isoToUtcMidnight(d1) - isoToUtcMidnight(d0)) / DAY > 92) return json({ error: "Período máximo: 92 dias" }, 400);
      return json(await analyze(d0, d1));
    }
    if (path === "/api/horarios" && req.method === "GET") {
      const [emps, sch, hor, hubs, exc] = await Promise.all([loadEmployees(), loadSchedules(), readKey("horarios"), readKey("hubs"), readKey("excluidos")]);
      const out = emps.filter(e => !e.fired).map(e => { const ws = pick(e, "currentWorkSchedule", "workSchedule"); const wid = ws && typeof ws === "object" ? ws.id : ws;
        return { id: e.id, name: e.name ?? `#${e.id}`, tangerino: sch[wid]?.name || "—", horario: hor[String(e.id)] || null, hub: hubs[String(e.id)] || "", excluded: !!exc[String(e.id)] }; })
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
      return json({ employees: out });
    }
    if (path === "/api/horarios" && req.method === "POST") {
      const body = await req.json(); const ids = body.ids || [body.id]; const data = await readKey("horarios");
      for (const i of ids) { if (body.horario == null) delete data[String(i)]; else data[String(i)] = validateHorario(body.horario); }
      await writeKey("horarios", data); return json({ ok: true, saved: ids.length });
    }
    if (path === "/api/hubs" && req.method === "POST") {
      const body = await req.json(); const ids = body.ids || [body.id]; const hub = String(body.hub || "").trim().slice(0, 60); const data = await readKey("hubs");
      for (const i of ids) { if (hub) data[String(i)] = hub; else delete data[String(i)]; }
      await writeKey("hubs", data); return json({ ok: true });
    }
    if (path === "/api/excluir" && req.method === "POST") {
      const body = await req.json(); const ids = body.ids || [body.id];
      if (!ids.length || !ids.every(i => Number.isInteger(Number(i)))) return json({ error: "Colaborador inválido" }, 400);
      const data = await readKey("excluidos");
      for (const i of ids) { if (body.excluir === false) delete data[String(i)]; else data[String(i)] = isoOf(Date.now()); }
      await writeKey("excluidos", data); return json({ ok: true });
    }
    if (path === "/api/probe" && req.method === "GET") {       // quanto de histórico a API realmente devolve (sem dados pessoais)
      const q = new URL(req.url).searchParams, t = isoOf(Date.now()), d0 = /^\d{4}-\d\d-\d\d$/.test(q.get("d0") || "") ? q.get("d0") : "2026-09-01", d1 = q.get("d1") || t;
      const a = isoToLocalStartMs(d0), b = isoToLocalStartMs(addDays(d1, 1)) - 1, raw = await paged(await punchUrl(), { startDate: a, endDate: b });
      const ts = raw.map(p => pick(p, "dateIn", "startDate", "date", "punchDate")).filter(x => x != null).sort((x, y) => x - y), perDay = {};
      for (const m of ts) perDay[isoOf(m)] = (perDay[isoOf(m)] || 0) + 1;
      return json({ pedido: { d0, d1 }, api_total: raw.length, primeira_batida: ts.length ? isoOf(ts[0]) : null, ultima_batida: ts.length ? isoOf(ts[ts.length - 1]) : null, por_dia: perDay, historico_importado: Object.values(HIST).reduce((s, v) => s + v.length, 0) });
    }
    if (path === "/api/diagnose" && req.method === "GET") {
      const redact = o => { const bad = ["cpf", "email", "pis", "phone", "ctps", "name", "birth", "lat", "lon", "photo", "image", "address", "pin"];
        if (Array.isArray(o)) return o.map(redact); if (o && typeof o === "object") return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, bad.some(b => k.toLowerCase().includes(b)) ? "***" : redact(v)])); return o; };
      const t = isoOf(Date.now()), emps = await loadEmployees(), sch = await loadSchedules(), pn = await loadPunches(addDays(t, -7), t);
      return json({ punch_base: punchBase, employees_total: emps.length, employee_sample: redact(emps.slice(0, 1)), schedules_total: Object.keys(sch).length,
        schedule_sample: redact(Object.values(sch).slice(0, 1)), punches_7d_total: pn.length, punch_sample: redact(pn.slice(0, 2)) });
    }
    return json({ error: "not found" }, 404);
  } catch (e) {
    const msg = e.upstream === 401 ? "Token da Tangerino recusado (401). Confira TANGERINO_TOKEN." : e.upstream === 403 ? "Sem permissão (403) na API da Tangerino." : e.message;
    return json({ error: msg }, e.status && e.status >= 400 ? e.status : 500);
  }
};

export const config = { path: "/api/*" };
