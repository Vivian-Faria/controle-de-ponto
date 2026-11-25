/* ============ Central · Operações ============
   Triagem do dia, visita (observação, infraestrutura, auditoria, ficha de saúde), plano de ação, demandas do CS/DP e pauta.
   Nada é digitado à mão que a Central já sabe: números vêm de /api/dash, furos de /api/alerta/painel, manutenções e compras do banco.
   Visitas (VS), ações (AC) e demandas (DX) ficam na mesma coleção das manutenções, campo kind, então não exige regra nova no Firestore. */
(function(){
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const dayKey = d => d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
const addD = (k, n) => { const d = new Date(k + 'T12:00:00'); d.setDate(d.getDate() + n); return dayKey(d); };
const fmtD = k => k ? k.slice(8,10) + '/' + k.slice(5,7) : '';
const nf = (v, d=1) => Number(v).toLocaleString('pt-BR', {minimumFractionDigits:d, maximumFractionDigits:d});
const St = () => window.ComprasStore, CD = () => window.CentralData, App = () => window.CentralApp;
const hoje = () => dayKey(new Date());
const HUBS = () => CD().HUBS;
const hubById = id => HUBS().find(h => h.id === id);
const HUB_NOME = { sion:'Varanda Sion', cn:'Varanda Cidade Nova', bur:'Varanda Buritis', cas:'Varanda Castelo', exp:'Expedição Órion Sion' };
const hubIdByNome = n => Object.keys(HUB_NOME).find(k => HUB_NOME[k] === n) || '';

/* limites do semáforo da ficha de saúde (editáveis) */
const LIM = { kpiRuimVermelho:2, kpiRuimAmarelo:1, kpiAlertaAmarelo:2, manutUrgVermelho:2, manutAbertasAmarelo:3, acoesVencidasAmarelo:1 };

/* ---------------- dados do dashboard ---------------- */
let DD = null, ddAt = 0;
async function getData(){
  const a = App() && App().data;
  if(a && a.days && a.days.length){ DD = a; ddAt = Date.now(); return DD; }
  if(DD && Date.now() - ddAt < 60000) return DD;
  DD = await CD().load(); ddAt = Date.now(); return DD;
}
function aggHub(h, rows){
  let p=0, e=0, c=0, tp=0, vp=0, vh=0; const n = rows.length || 1;
  rows.forEach(r => { p += r.pedidos; e += r.erros; c += r.cancel; tp += r.tempo * r.pedidos; if(r.cabecas > 0){ vp += r.pedidos; vh += r.cabecas; } });
  return { ped:p, prod: vh ? vp/vh : null, cancel: c/(p||1)*100, assert: (1 - e/(p||1))*100, tempo: tp/(p||1), erros: e/n*7, errTot:e, dias: rows.length };     // erros = por semana
}
function gapK(D, k, v, h){
  if(v == null) return 0;
  const T = D.targets[k], G = k === 'tempo' ? h.tempoGoal : k === 'prod' ? h.prodGoal : T.goal;
  if(k === 'assert') return ((100 - v) - (100 - T.goal)) / (100 - T.goal);
  return T.dir === 'up' ? (G - v)/G : (v - G)/G;
}
const stat = g => g <= 0 ? 'ok' : g <= .15 ? 'wa' : 'bd';
const KPIS = ['prod','cancel','assert','tempo','erros'];
const temDados = (D, id) => (D.byHub[id] || []).some(r => r.pedidos > 0);
const rowsN = (D, id, n, fim) => { const r = D.byHub[id] || []; const e = fim == null ? r.length : fim; return r.slice(Math.max(0, e - n), e); };
const goalOf = (D, k, h) => k === 'tempo' ? h.tempoGoal : k === 'prod' ? h.prodGoal : D.targets[k].goal;
const fmtK = (D, k, v) => v == null ? '—' : nf(v, D.targets[k].dec);
function topErro(D, id, rows){
  const t = D.errTypes.map(e => ({e, v: rows.reduce((a, r) => a + ((r.errTipos || {})[e.id] || 0), 0)})).sort((a,b) => b.v - a.v);
  const tot = t.reduce((a, x) => a + x.v, 0); return tot ? { name: t[0].e.name, pct: Math.round(t[0].v / tot * 100), tot } : null;
}

/* ---------------- registros no banco ---------------- */
const manut = () => St().list();
const visitas = () => St().listKind('visita').sort((a,b) => (b.dia || '').localeCompare(a.dia || '') || b.createdAt.localeCompare(a.createdAt));
const acoes = () => St().listKind('acao');
const demandas = () => St().listKind('demanda');
const vencida = a => a.status !== 'feita' && a.prazo && a.prazo < hoje();
const manutAbertaHub = hid => manut().filter(o => o.status !== 'resolvida' && hubIdByNome(o.hub) === hid);

/* ---------------- ficha de saúde: automática + poucos toques ---------------- */
function fichaAuto(D, hid, manual, infra){
  const h = hubById(hid), r = { kpi:{}, ruins:0, alertas:0, motivos:[], nivel:'ok' };
  if(D && temDados(D, hid)){
    const m = aggHub(h, rowsN(D, hid, 7));
    KPIS.forEach(k => { const g = gapK(D, k, m[k], h), s = stat(g); r.kpi[k] = { v:m[k], s }; if(s === 'bd') r.ruins++; if(s === 'wa') r.alertas++; });
    const nomes = { prod:'produtividade', cancel:'cancelamento', assert:'assertividade', tempo:'tempo de processamento', erros:'erros por semana' };
    const ruins = KPIS.filter(k => r.kpi[k].s === 'bd').map(k => nomes[k]);
    if(ruins.length) r.motivos.push(ruins.join(' e ') + ' fora da meta nos últimos 7 dias');
  } else r.motivos.push('sem dados da API para este hub');
  const ab = manutAbertaHub(hid), urg = ab.filter(o => o.urgencia === 'alta').length, av = acoes().filter(a => vencida(a) && (a.hub === HUB_NOME[hid])).length;
  if(urg) r.motivos.push(urg + ' manutenção(ões) urgente(s) em aberto'); else if(ab.length >= LIM.manutAbertasAmarelo) r.motivos.push(ab.length + ' manutenções em aberto');
  if(av) r.motivos.push(av + ' ação(ões) vencida(s)');
  const mv = Object.values(manual || {}).map(x => x.v), iv = Object.values(infra || {}).map(x => x.v);
  const nomeM = { limpeza:'limpeza e organização', clima:'clima da equipe', estoque:'estoque e reposição', lider:'postura do líder' };
  Object.entries(manual || {}).forEach(([k, x]) => { if(x.v === 'pr') r.motivos.push(nomeM[k] + ': problema'); else if(x.v === 'at') r.motivos.push(nomeM[k] + ': atenção'); });
  const qb = Object.values(infra || {}).filter(x => x.v === 'qb').length; if(qb) r.motivos.push(qb + ' item(ns) de infraestrutura quebrado(s)');
  if(mv.includes('pr') || qb || r.ruins >= LIM.kpiRuimVermelho || urg >= LIM.manutUrgVermelho) r.nivel = 'bd';
  else if(mv.includes('at') || iv.includes('at') || r.ruins >= LIM.kpiRuimAmarelo || r.alertas >= LIM.kpiAlertaAmarelo || av >= LIM.acoesVencidasAmarelo || ab.length >= LIM.manutAbertasAmarelo || urg) r.nivel = 'wa';
  return r;
}
const NIVEL = { ok:'Verde', wa:'Amarelo', bd:'Vermelho' };

/* ---------------- período (vale para todas as abas) ---------------- */
const P = { k:'padrao', de:'', ate:'' };
const PRES = [['padrao','Padrão'],['7','7 dias'],['14','14 dias'],['30','30 dias'],['0','Tudo']];
function rangeP(){        // {de, ate} do filtro; vazio = sem limite
  if(P.k === 'custom') return { de:P.de, ate:P.ate };
  if(P.k === '7' || P.k === '14' || P.k === '30') return { de:addD(hoje(), -(+P.k - 1)), ate:hoje() };
  return { de:'', ate:'' };
}
const filtrando = () => P.k !== 'padrao';
const inR = dia => { const r = rangeP(); dia = (dia || '').slice(0,10); return (!r.de || dia >= r.de) && (!r.ate || dia <= r.ate); };
const dtRef = o => (o.createdAt || '').slice(0,10);
const rowsIn = (D, id, de, ate) => (D.byHub[id] || []).filter(r => (!de || r.date >= de) && (!ate || r.date <= ate));
const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000) + 1;
function renderPer(){
  const host = $('#opPer'); if(!host) return; const r = rangeP();
  host.innerHTML = `<span class="lb">PERÍODO</span>` + PRES.map(([k,l]) => `<button type="button" class="chip ${P.k === k ? 'on' : ''}" data-per="${k}">${l}</button>`).join('')
    + `<span class="sep"></span><label>de <input type="date" class="inp" id="opDe" value="${esc(P.k === 'custom' ? P.de : r.de)}" max="${hoje()}"></label><label>até <input type="date" class="inp" id="opAte" value="${esc(P.k === 'custom' ? P.ate : r.ate)}" max="${hoje()}"></label>`
    + `<span class="hint">${P.k === 'padrao' ? 'Padrão: triagem de ontem e de hoje; pauta dos últimos 7 dias; listas completas.' : 'Filtra triagem, visitas, ações, demandas e pauta.'}</span>`;
}

/* ---------------- TRIAGEM ---------------- */
async function furosDia(d){
  try{ const r = await fetch('/api/alerta/painel?d=' + d, {credentials:'same-origin', cache:'no-store'}); if(!r.ok) return null; return await r.json(); }catch(e){ return null; }
}
async function buildTriagem(){
  const D = await getData(), itens = [], t0 = hoje(), ontem = addD(t0, -1), fil = filtrando(), R = rangeP();
  const ateI = R.ate && R.ate < ontem ? R.ate : ontem;      // indicadores só de dias fechados
  if(D && D.days && D.days.length && D.meta && D.meta.live !== false){
    HUBS().forEach(h => {
      if(!temDados(D, h.id)) return;
      const rows = fil ? rowsIn(D, h.id, R.de, ateI) : (D.byHub[h.id] || []).filter(r => r.date === ontem);
      if(!rows.length) return;
      const y = aggHub(h, rows), sem = aggHub(h, rowsN(D, h.id, 7, D.byHub[h.id].length - (D.days[D.days.length-1] === t0 ? 1 : 0)));
      const nome = h.short, quando = fil ? 'do período' : 'de ontem';
      [['tempo','Tempo de processamento','min'], ['cancel','Cancelamentos','%'], ['erros','Erros por semana','erros'], ['prod','Produtividade','ped/pessoa']].forEach(([k, lab, un]) => {
        if(y.ped < 10 && k !== 'erros') return;   // dia com pouquíssimos pedidos não diz nada
        const yy = (k === 'erros' && !fil) ? sem : y;          // erros: meta é semanal, então no padrão olha os últimos 7 dias fechados
        const g = gapK(D, k, yy[k], h), s = stat(g); if(s === 'ok') return;
        const sg = stat(gapK(D, k, sem[k], h)), meta = goalOf(D, k, h);
        let txt = `${k === 'erros' && !fil ? 'Erros nos últimos 7 dias' : lab + ' ' + quando}: ${fmtK(D, k, yy[k])} ${un} (meta ${k === 'cancel' ? 'abaixo de ' : k === 'erros' ? 'no máximo ' : k === 'tempo' ? 'até ' : 'a partir de '}${nf(meta, k === 'prod' ? 0 : 1)})`;
        if(k === 'erros'){ const te = topErro(D, h.id, fil ? rows : rowsN(D, h.id, 7, D.byHub[h.id].length - (D.days[D.days.length-1] === t0 ? 1 : 0))); if(te) txt += `; mais comum: ${te.name.toLowerCase()} (${te.pct}%)`; }
        if(!fil && sg !== 'ok') txt += '. A média de 7 dias também está fora da meta';
        itens.push({ sev: k === 'prod' ? 'media' : (s === 'bd' ? 'alta' : 'media'), hub:nome, txt, onde:'dashboard', tag:'Indicador' });
      });
    });
  } else itens.push({ sev:'media', hub:'Central', txt:'Os números da API não carregaram agora (sessão ou API indisponível); a triagem dos indicadores fica incompleta.', onde:'dashboard', tag:'Dados' });

  /* escala: hoje (padrão) ou os dias do período (até 14) */
  const dFuros = fil ? Array.from({length: Math.min(14, R.de ? diasEntre(R.de, R.ate && R.ate < t0 ? R.ate : t0) : 14)}, (_, i) => addD(R.ate && R.ate < t0 ? R.ate : t0, -i)).filter(d => !R.de || d >= R.de) : [t0];
  const resF = await Promise.all(dFuros.map(furosDia));
  let furosRes = 0, lidos = 0;
  resF.forEach((fp, i) => { if(fp && Array.isArray(fp.furos)){ lidos++; fp.furos.forEach(f => { if(f.estado === 'resolvido'){ furosRes++; return; }
      itens.push({ sev:'alta', hub:f.hub || '', txt:`Furo de escala ${fil ? 'em ' + fmtD(dFuros[i]) : 'hoje'}${f.turno ? ' no turno ' + f.turno : ''}${f.nome ? ' (' + f.nome + ')' : f.vazia ? ' (posição vazia)' : ''}: ${String(f.estado || 'em aberto').replace(/_/g, ' ')}${f.inicio ? ', início ' + f.inicio : ''}`, onde:'presencas', tag:'Escala' }); }); } });
  if(!lidos) itens.push({ sev:'info', hub:'Central', txt:'Não consegui ler os furos de escala agora. Confira a página Presenças.', onde:'presencas', tag:'Escala' });

  manut().filter(o => o.status !== 'resolvida' && (!fil || inR(o.ocorreuEm || ''))).forEach(o => {
    const dias = Math.max(0, Math.round((Date.now() - new Date((o.ocorreuEm || t0) + 'T12:00:00')) / 86400000));
    const rec = { kind:'manut', id:o.id };
    if(o.urgencia === 'alta') itens.push({ sev:'alta', hub:o.hub.replace(/^Varanda /,''), txt:`Manutenção urgente em aberto há ${dias} dia(s): ${o.title}`, onde:'manut', tag:'Manutenção', rec });
    else if(dias >= 7) itens.push({ sev:'media', hub:o.hub.replace(/^Varanda /,''), txt:`Manutenção em aberto há ${dias} dias: ${o.title}`, onde:'manut', tag:'Manutenção', rec });
  });
  acoes().filter(a => a.status !== 'feita' && a.prazo && (!fil || inR(a.prazo))).forEach(a => {
    const rec = { kind:'acao', id:a.id };
    if(a.prazo < t0) itens.push({ sev:'alta', hub:a.hub, txt:`Ação vencida em ${fmtD(a.prazo)}: ${a.texto}${a.resp ? ' (' + a.resp + ')' : ''}`, onde:'acoes', tag:'Plano de ação', rec });
    else if(a.prazo === t0) itens.push({ sev:'media', hub:a.hub, txt:`Ação vence hoje: ${a.texto}${a.resp ? ' (' + a.resp + ')' : ''}`, onde:'acoes', tag:'Plano de ação', rec });
    else if(fil) itens.push({ sev:'media', hub:a.hub, txt:`Ação com prazo em ${fmtD(a.prazo)}: ${a.texto}${a.resp ? ' (' + a.resp + ')' : ''}`, onde:'acoes', tag:'Plano de ação', rec });
  });
  demandas().filter(d => !fil || inR(dtRef(d))).forEach(d => {
    const rec = { kind:'demanda', id:d.id };
    if(d.status === 'nova') itens.push({ sev: d.urgencia === 'alta' ? 'alta' : 'media', hub:d.hub || 'Geral', txt:`Demanda nova (${d.de}${d.quem ? ', ' + d.quem : ''}): ${d.texto}`, onde:'demandas', tag:'Demanda ' + d.de, rec });
    else if(d.status === 'processo' && d.updatedAt && (Date.now() - new Date(d.updatedAt)) > 3*86400000) itens.push({ sev:'media', hub:d.hub || 'Geral', txt:`Demanda de ${d.de} em processo há mais de 3 dias: ${d.texto}`, onde:'demandas', tag:'Demanda ' + d.de, rec });
  });
  const ordem = { alta:0, media:1, info:2 };
  itens.sort((a,b) => ordem[a.sev] - ordem[b.sev]);
  return { itens, furosRes, ontem, fil, R, ateI };
}
async function renderTriagem(){
  const host = $('#opTriagem'); host.innerHTML = '<div class="empty"><b>ATUALIZANDO</b>Lendo indicadores, escala, manutenções, ações e demandas…</div>';
  const t = await buildTriagem();
  const n = s => t.itens.filter(i => i.sev === s).length;
  const BT = { acao:'Marcar como feita', demanda:'Marcar como resolvida', manut:'Marcar como resolvida' };
  const grp = (sev, titulo) => { const l = t.itens.filter(i => i.sev === sev); return l.length ? `<div class="op-grp"><h4>${titulo} <span>${l.length}</span></h4>${l.map(i => `<div class="op-it ${sev}"><span class="op-tag">${esc(i.tag)}</span><b>${esc(i.hub)}</b><p>${esc(i.txt)}</p><span class="op-btns">${i.rec ? `<button type="button" class="btn ghost sm" data-resolve="${i.rec.kind}|${esc(i.rec.id)}">${BT[i.rec.kind]}</button>` : ''}<a href="#" data-go="${i.onde}">Abrir</a></span></div>`).join('')}</div>` : ''; };
  const per = t.fil ? (t.R.de ? fmtD(t.R.de) : 'início') + ' a ' + fmtD(t.R.ate || hoje()) : fmtD(t.ontem);
  host.innerHTML = `<div class="stats"><div class="${n('alta') ? 'rd' : 'gr'}"><small>PRECISAM DE AÇÃO${t.fil ? '' : ' HOJE'}</small><strong>${n('alta')}</strong></div><div class="am"><small>PARA ACOMPANHAR</small><strong>${n('media')}</strong></div><div><small>FUROS DE ESCALA RESOLVIDOS${t.fil ? '' : ' HOJE'}</small><strong>${t.furosRes}</strong></div><div><small>${t.fil ? 'PERÍODO' : 'DIA ANALISADO'}</small><strong style="font-size:24px">${per}</strong></div></div>`
    + (grp('alta', 'Precisam de ação') + grp('media', 'Para acompanhar') + grp('info', 'Avisos') || '<div class="empty"><b>Nada fora do normal</b>Indicadores, escala, manutenções, ações e demandas estão em ordem.</div>')
    + `<p class="mn-note">Gerada agora a partir da API, da escala, das manutenções, do plano de ação e das demandas. Indicadores comparados com as metas do dashboard. Os botões marcam o item como resolvido direto aqui.</p>`;
}
function resolveItem(spec){
  const [kind, id] = spec.split('|');
  if(kind === 'acao') St().updateKind(id, o => { o.status = 'feita'; o.doneAt = new Date().toISOString(); });
  else if(kind === 'demanda') St().updateKind(id, o => { o.status = 'resolvida'; o.statusEm = new Date().toISOString(); });
  else if(kind === 'manut') St().update(id, o => { o.status = 'resolvida'; o.resolvedAt = new Date().toISOString(); });
  St().toast(kind === 'acao' ? 'Ação marcada como feita' : 'Marcado como resolvido');
  renderTriagem();
}

/* ---------------- VISITA ---------------- */
const OBS = [['fluxo','Fluxo','O tempo de montagem está dentro da meta?'], ['espera','Espera','Fila de pedidos ou motoboy esperando?'], ['equipe','Equipe','Quem está na escala está nas posições?'], ['reposicao','Reposição','Algum item acabando durante o turno?'], ['lideranca','Líder e supervisor','Como reagem quando o ritmo aperta?']];
const TRAVA = ['Insumo','Equipamento','Comunicação','Montagem','Equipe curta','Pedidos/sistema','Outro'];
const INFRA = [['freezer','Freezers e geladeiras','Refrigeração (freezer/geladeira)'], ['ar','Ar-condicionado','Ar-condicionado'], ['exaustor','Exaustor e coifa','Equipamento de cozinha'], ['fogao','Fogão, forno e chapa','Equipamento de cozinha'], ['eletrica','Elétrica e iluminação','Elétrica'], ['hidraulica','Hidráulica e esgoto','Hidráulica'], ['estrutura','Estrutura (piso, teto, goteiras)','Estrutura / civil'], ['rede','Internet e rede','Internet / TI'], ['mobiliario','Mobiliário','Mobiliário']];
const FICHA = [['limpeza','Limpeza e organização'], ['clima','Clima da equipe'], ['estoque','Estoque e reposição'], ['lider','Postura do líder']];
let V = null;
const novaVisita = () => ({ hub:'', dia:hoje(), obs:{}, infra:{}, ficha:{}, trava:[], aud:[{item:'',res:''},{item:'',res:''},{item:'',res:''}], slaBate:'', acoes:[] });
const tri = (grupo, k, op) => `<div class="tri" data-g="${grupo}" data-k="${k}">${op.map(([v,l]) => `<button type="button" data-v="${v}" class="t-${v}">${l}</button>`).join('')}</div><input class="inp tn" data-g="${grupo}" data-k="${k}" placeholder="O que viu? (opcional)" hidden maxlength="200">`;
const OKP = [['ok','Ok'],['at','Atenção'],['pr','Problema']], OKI = [['ok','Ok'],['at','Atenção'],['qb','Quebrado']];
function renderVisitaForm(){
  V = V || novaVisita();
  const hubOpt = '<option value="">Selecione o hub…</option>' + HUBS().map(h => `<option value="${h.id}" ${V.hub === h.id ? 'selected' : ''}>${esc(HUB_NOME[h.id])}</option>`).join('');
  $('#opVisitaForm').innerHTML = `
  <div class="g2"><div class="fg"><label>HUB <i>*</i></label><select class="inp" id="vHub">${hubOpt}</select></div><div class="fg"><label>DATA</label><input class="inp" id="vDia" type="date" value="${V.dia}" max="${hoje()}"></div></div>
  <div class="op-sec"><h4>1. Análise de campo <small>analisar a operação, sem compor a escala</small></h4>
    ${OBS.map(([k,t,q]) => `<div class="op-q"><div><b>${t}</b><span>${q}</span></div>${tri('obs', k, OKP)}</div>`).join('')}
    <div class="op-q col"><div><b>Onde trava</b><span>Marque o que mais atrapalhou</span></div><div class="op-chips" id="vTrava">${TRAVA.map(t => `<button type="button" class="chip" data-trava="${esc(t)}">${t}</button>`).join('')}</div></div>
    <div class="fg"><label>O QUE MAIS ATRAPALHA HOJE, SEGUNDO A EQUIPE</label><input class="inp" id="vAtrapalha" maxlength="240" placeholder="Uma frase com o que ouviu de quem está na linha"></div></div>
  <div class="op-sec"><h4>2. Análise de infraestrutura <small>o que estiver quebrado já abre a manutenção</small></h4>
    ${INFRA.map(([k,t]) => `<div class="op-q"><div><b>${t}</b></div>${tri('infra', k, OKI)}</div>`).join('')}</div>
  <div class="op-sec"><h4>3. Auditoria por amostragem <small>3 itens que o líder marcou como ok</small></h4>
    ${[0,1,2].map(i => `<div class="op-q"><input class="inp" data-aud="${i}" placeholder="Item reconferido ${i+1}" maxlength="120"><div class="tri" data-g="aud" data-k="${i}"><button type="button" data-v="ok" class="t-ok">Conforme</button><button type="button" data-v="pr" class="t-pr">Não conforme</button></div></div>`).join('')}
    <div class="op-q"><div><b>O SLA do painel bate com o reporte do líder?</b></div><div class="tri" data-g="sla" data-k="sla"><button type="button" data-v="ok" class="t-ok">Sim</button><button type="button" data-v="pr" class="t-pr">Não</button></div></div></div>
  <div class="op-sec"><h4>4. Ficha de saúde <small>os números e as manutenções entram sozinhos; você só marca 4 itens</small></h4>
    ${FICHA.map(([k,t]) => `<div class="op-q"><div><b>${t}</b></div>${tri('ficha', k, OKP)}</div>`).join('')}
    <div class="fg"><label>UMA LINHA LIVRE <s>(opcional)</s></label><input class="inp" id="vLinha" maxlength="200"></div>
    <div id="vPrev" class="op-prev"></div></div>
  <div class="op-sec"><h4>5. Encaminhamentos <small>viram ações com responsável e prazo</small></h4><div id="vAcoes"></div><button type="button" class="btn ghost sm" id="vAddAcao">+ Adicionar ação</button></div>
  <div class="acts"><button type="button" class="btn ghost" id="vLimpa">Limpar</button><button type="button" class="btn lime" id="vSalva">Salvar visita</button></div>`;
  renderAcoesForm(); marcaVisita(); prevFicha();
}
function marcaVisita(){
  $$('#opVisitaForm .tri').forEach(el => { const g = el.dataset.g, k = el.dataset.k; const cur = g === 'aud' ? V.aud[+k].res : g === 'sla' ? V.slaBate : (V[g][k] || {}).v;
    el.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === cur));
    const tn = el.parentElement.querySelector('.tn[data-g="' + g + '"][data-k="' + k + '"]'); if(tn){ tn.hidden = !(cur && cur !== 'ok'); tn.value = (V[g][k] || {}).note || tn.value || ''; } });
  $$('#vTrava .chip').forEach(c => c.classList.toggle('on', V.trava.includes(c.dataset.trava)));
}
function renderAcoesForm(){
  $('#vAcoes').innerHTML = V.acoes.map((a, i) => `<div class="op-ac"><input class="inp" data-ac="${i}" data-f="texto" placeholder="O que precisa ser feito" value="${esc(a.texto)}" maxlength="200"><input class="inp" data-ac="${i}" data-f="resp" placeholder="Responsável" value="${esc(a.resp)}" maxlength="60"><input class="inp" type="date" data-ac="${i}" data-f="prazo" value="${esc(a.prazo)}"><button type="button" class="btn ghost sm" data-rm="${i}" aria-label="Remover">×</button></div>`).join('') || '<p class="mn-note" style="margin:0 0 8px">Nenhuma ação ainda.</p>';
}
async function prevFicha(){
  const el = $('#vPrev'); if(!el) return; if(!V.hub){ el.innerHTML = '<span class="dim">Escolha o hub para ver o semáforo.</span>'; return; }
  const D = await getData(), r = fichaAuto(D, V.hub, V.ficha, V.infra);
  el.innerHTML = `<span class="op-pill ${r.nivel}">${NIVEL[r.nivel]}</span> <span>${r.motivos.length ? esc(r.motivos.join('; ')) : 'Indicadores, manutenções e ações em ordem.'}</span>`;
}
async function salvaVisita(){
  if(!V.hub){ St().toast('Escolha o hub da visita', true); return; }
  const feito = Object.keys(V.obs).length + Object.keys(V.infra).length + Object.keys(V.ficha).length;
  if(!feito){ St().toast('Marque ao menos um item da observação, da infraestrutura ou da ficha', true); return; }
  const D = await getData();
  $$('#opVisitaForm .tn').forEach(i => { const g = i.dataset.g, k = i.dataset.k; if(V[g] && V[g][k]) V[g][k].note = i.value.trim(); });
  V.aud = V.aud.map((a, i) => ({ item: ($(`[data-aud="${i}"]`) || {}).value ? $(`[data-aud="${i}"]`).value.trim() : '', res:a.res }));
  const nomeHub = HUB_NOME[V.hub];
  /* infraestrutura quebrada ou em atenção vira manutenção */
  const criadas = [];
  for(const [k, t, tipo] of INFRA){ const x = V.infra[k]; if(!x || x.v === 'ok') continue;
    if(x.v === 'qb'){ const rec = await St().add({ title: t + (x.note ? ': ' + x.note : ' quebrado'), hub:nomeHub, tipo, ocorreuEm:V.dia, urgencia:'alta', custo:'', desc:'Registrada na visita de ' + fmtD(V.dia) }); criadas.push(rec.id); x.manut = rec.id; } }
  const auto = fichaAuto(D, V.hub, V.ficha, V.infra);
  const linha = ($('#vLinha') || {}).value || '', atrap = ($('#vAtrapalha') || {}).value || '';
  const rec = await St().addKind('visita', 'VS', { hub:nomeHub, hubId:V.hub, dia:V.dia, obs:V.obs, trava:V.trava, atrapalha:atrap.trim(), infra:V.infra, aud:V.aud.filter(a => a.item || a.res), slaBate:V.slaBate, ficha:V.ficha, fichaLinha:linha.trim(),
    semaforo:auto.nivel, motivos:auto.motivos, kpi:Object.fromEntries(KPIS.map(k => [k, auto.kpi[k] ? { v:auto.kpi[k].v == null ? null : +Number(auto.kpi[k].v).toFixed(2), s:auto.kpi[k].s } : null])), manutAbertas:criadas, status:'feita' });
  for(const a of V.acoes){ if(!a.texto.trim()) continue; await St().addKind('acao', 'AC', { hub:nomeHub, texto:a.texto.trim(), resp:a.resp.trim(), prazo:a.prazo || addD(V.dia, 7), origem:'Visita ' + rec.id, status:'aberta' }); }
  St().toast('Visita ' + rec.id + ' salva' + (criadas.length ? ' · ' + criadas.length + ' manutenção(ões) aberta(s)' : ''));
  V = novaVisita(); renderVisitaForm(); renderVisitas();
}
function renderVisitas(){
  const l = visitas().filter(v => inR(v.dia)).slice(0, filtrando() ? 60 : 12);
  $('#opVisitas').innerHTML = l.length ? l.map(v => `<article class="row op-v" data-v="${esc(v.id)}"><div class="id">${esc(v.id)}</div><div class="nm-col"><div class="nm">${esc(v.hub)} · ${fmtD(v.dia)}</div><div class="meta">${v.trava && v.trava.length ? `<span>Trava: ${esc(v.trava.join(', '))}</span>` : ''}${v.atrapalha ? `<span>“${esc(v.atrapalha)}”</span>` : ''}${(v.manutAbertas || []).length ? `<span>${v.manutAbertas.length} manutenção(ões)</span>` : ''}</div></div><div><span class="op-pill ${esc(v.semaforo)}">${NIVEL[v.semaforo] || ''}</span></div><div class="op-why">${esc((v.motivos || []).join('; '))}</div></article>`).join('') : '<div class="empty"><b>Nenhuma visita ' + (filtrando() ? 'neste período' : 'registrada') + '</b>' + (filtrando() ? 'Ajuste o período acima.' : 'Registre a primeira acima.') + '</div>';
}

/* ---------------- PLANO DE AÇÃO ---------------- */
const AF = { st:'abertas', hub:'' };
function renderAcoes(){
  const all = acoes().filter(a => inR(a.prazo || dtRef(a))), t = hoje();   // pelo prazo (ou criação, se não tiver prazo)
  const fechadas30 = all.filter(a => a.status === 'feita' && a.doneAt && (filtrando() || a.doneAt.slice(0,10) >= addD(t, -30)));
  const noPrazo = fechadas30.filter(a => !a.prazo || a.doneAt.slice(0,10) <= a.prazo).length;
  const venc = all.filter(vencida).length, ab = all.filter(a => a.status !== 'feita').length;
  const base = fechadas30.length + venc, pct = base ? Math.round(noPrazo / base * 100) : null;
  $('#opAcStats').innerHTML = `<div class="am"><small>EM ABERTO</small><strong>${ab}</strong></div><div class="${venc ? 'rd' : 'gr'}"><small>VENCIDAS</small><strong>${venc}</strong></div><div class="gr"><small>FEITAS${filtrando() ? '' : ' (30 DIAS)'}</small><strong>${fechadas30.length}</strong></div><div><small>FECHADAS NO PRAZO</small><strong>${pct == null ? '—' : pct + '%'}</strong></div>`;
  const chips = [['abertas','Em aberto'],['vencidas','Vencidas'],['feitas','Feitas'],['todas','Todas']];
  $('#opAcChips').innerHTML = chips.map(([k,l]) => `<button class="chip ${AF.st === k ? 'on' : ''}" data-st="${k}">${l}</button>`).join('') + '<span class="sep"></span>' + `<select class="inp" id="opAcHub" style="width:auto;display:inline-block"><option value="">Todos os hubs</option>${['Geral', ...Object.values(HUB_NOME)].map(h => `<option ${AF.hub === h ? 'selected' : ''}>${h}</option>`).join('')}</select>`;
  let l = all.filter(a => (AF.st === 'todas') || (AF.st === 'abertas' && a.status !== 'feita') || (AF.st === 'vencidas' && vencida(a)) || (AF.st === 'feitas' && a.status === 'feita')).filter(a => !AF.hub || a.hub === AF.hub);
  l.sort((a,b) => (a.status === 'feita') - (b.status === 'feita') || (a.prazo || '9').localeCompare(b.prazo || '9'));
  $('#opAcList').innerHTML = l.length ? l.map(a => `<article class="row mn-row ${vencida(a) ? 'u-alta' : ''} ${a.status === 'feita' ? 'ok' : ''}"><div class="id">${esc(a.id)}</div><div class="nm-col"><div class="nm">${esc(a.texto)}</div><div class="meta"><span>${esc(a.hub)}</span>${a.resp ? `<span>${esc(a.resp)}</span>` : ''}<span>${esc(a.origem || '')}</span></div></div><div class="dt">${a.prazo ? 'Prazo ' + fmtD(a.prazo) : 'Sem prazo'}</div><div class="op-btns">${a.status === 'feita' ? `<button class="btn ghost sm" data-ac-st="${esc(a.id)}" data-to="aberta">Reabrir</button>` : `${a.status !== 'andamento' ? `<button class="btn ghost sm" data-ac-st="${esc(a.id)}" data-to="andamento">Em andamento</button>` : '<span class="hint">em andamento</span>'}<button class="btn ghost sm" data-ac-st="${esc(a.id)}" data-to="feita">Feita</button>`}</div></article>`).join('') : '<div class="empty"><b>Nenhuma ação aqui</b>As ações das visitas e das reuniões aparecem nesta lista.</div>';
}
function dlgAcao(){
  const hubs = ['Geral', ...Object.values(HUB_NOME)];
  $('#aqHub').innerHTML = hubs.map(h => `<option>${h}</option>`).join(''); $('#aqTexto').value = ''; $('#aqResp').value = ''; $('#aqPrazo').value = addD(hoje(), 7); $('#aqOrigem').value = 'Reunião de líderes';
  $('#dAcao').showModal(); $('#aqTexto').focus();
}

/* ---------------- DEMANDAS CS e DP ---------------- */
const DF = { de:'', st:'abertas' };
const DST = { nova:'Nova', vista:'Vista', processo:'Em processo', resolvida:'Resolvida' };
function renderDemandas(){
  const all = demandas().filter(d => inR(dtRef(d))).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  const c = s => all.filter(d => d.status === s).length;
  $('#opDmStats').innerHTML = `<div class="${c('nova') ? 'rd' : 'gr'}"><small>NOVAS (NÃO VISTAS)</small><strong>${c('nova')}</strong></div><div><small>VISTAS</small><strong>${c('vista')}</strong></div><div class="am"><small>EM PROCESSO</small><strong>${c('processo')}</strong></div><div class="gr"><small>RESOLVIDAS</small><strong>${c('resolvida')}</strong></div>`;
  $('#opDmChips').innerHTML = [['','Todas as áreas'],['CS','CS'],['DP','DP'],['RH','RH'],['Financeiro','Financeiro']].map(([k,l]) => `<button class="chip ${DF.de === k ? 'on' : ''}" data-de="${k}">${l}</button>`).join('') + '<span class="sep"></span>' + [['abertas','Em aberto'],['resolvidas','Resolvidas'],['todas','Todas']].map(([k,l]) => `<button class="chip ${DF.st === k ? 'on' : ''}" data-dst="${k}">${l}</button>`).join('');
  const l = all.filter(d => (!DF.de || d.de === DF.de) && (DF.st === 'todas' || (DF.st === 'abertas' && d.status !== 'resolvida') || (DF.st === 'resolvidas' && d.status === 'resolvida')));
  $('#opDmList').innerHTML = l.length ? l.map(d => `<article class="row mn-row ${d.status === 'nova' ? 'u-alta' : ''} ${d.status === 'resolvida' ? 'ok' : ''}"><div class="id">${esc(d.id)}</div><div class="nm-col"><div class="nm">${esc(d.texto)}</div><div class="meta"><span>${esc(d.de)}${d.quem ? ' · ' + esc(d.quem) : ''}</span><span>${esc(d.hub || 'Geral')}</span><span>Urgência ${esc({baixa:'baixa',media:'média',alta:'alta'}[d.urgencia] || 'média')}</span><span>${fmtD((d.createdAt || '').slice(0,10))}</span>${d.retorno ? `<span>Retorno: ${esc(d.retorno)}</span>` : ''}</div></div><div><span class="op-pill ${d.status === 'nova' ? 'bd' : d.status === 'processo' ? 'wa' : 'ok'}">${DST[d.status] || d.status}</span></div><div class="op-btns">${['vista','processo','resolvida'].filter(s => s !== d.status).map(s => `<button class="btn ghost sm" data-dm="${esc(d.id)}" data-to="${s}">${s === 'vista' ? 'Visto' : s === 'processo' ? 'Em processo' : 'Resolvida'}</button>`).join('')}<button class="btn ghost sm" data-dm-ret="${esc(d.id)}">Retorno</button></div></article>`).join('') : '<div class="empty"><b>Nenhuma demanda aqui</b>CS, DP, RH e Financeiro lançam pela página própria; elas chegam aqui na hora.</div>';
  const b = $('#opDmBadge'); if(b){ b.textContent = c('nova') || ''; b.hidden = !c('nova'); }
}

/* ---------------- PAUTA ---------------- */
let PAUTA = null;
async function criaPauta(){
  const host = $('#opPautaOut');
  host.innerHTML = '<div class="empty"><b>ATUALIZANDO</b>Montando a pauta a partir dos dados do período…</div>';
  const D = await getData(), t0 = hoje(), blocos = [], txt = [], ontem = addD(t0, -1), R = rangeP();
  const ate = R.ate && R.ate < ontem ? R.ate : ontem;                                     // hoje ainda está aberto: a pauta fecha em ontem
  const de = P.k === 'padrao' ? addD(ate, -6) : (R.de || (D.days && D.days[0]) || addD(ate, -29));
  const dias = Math.max(1, diasEntre(de, ate)), dePrev = addD(de, -dias), atePrev = addD(de, -1);
  const per = `${fmtD(de)} a ${fmtD(ate)}`, noP = d => (d || '').slice(0,10) >= de && (d || '').slice(0,10) <= ate;
  txt.push(`PAUTA DA REUNIÃO · ${per} (${dias} dias)`, '');
  /* 1 indicadores */
  const ind = [], desv = [];
  HUBS().forEach(h => { if(!temDados(D, h.id)){ ind.push(`<tr><td>${esc(h.short)}</td><td colspan="5" class="dim">sem dados na API</td></tr>`); txt.push(`${h.short}: sem dados na API`); return; }
    const cur = aggHub(h, rowsIn(D, h.id, de, ate)), prev = aggHub(h, rowsIn(D, h.id, dePrev, atePrev));
    const cel = k => { const g = gapK(D, k, cur[k], h), s = stat(g); if(s !== 'ok') desv.push({ h:h.short, k, g, v:cur[k], meta:goalOf(D, k, h) }); const d = (prev.dias >= dias && prev[k] != null && cur[k] != null) ? cur[k] - prev[k] : null; return `<td class="k-${s}">${fmtK(D, k, cur[k])}${d != null ? `<small>${d >= 0 ? '+' : ''}${nf(d, D.targets[k].dec)}</small>` : ''}</td>`; };
    ind.push(`<tr><td>${esc(h.short)}</td>${KPIS.map(cel).join('')}</tr>`);
    txt.push(`${h.short}: produtividade ${fmtK(D,'prod',cur.prod)}, cancelamento ${fmtK(D,'cancel',cur.cancel)}%, assertividade ${fmtK(D,'assert',cur.assert)}%, tempo ${fmtK(D,'tempo',cur.tempo)} min, erros/semana ${fmtK(D,'erros',cur.erros)}`); });
  desv.sort((a,b) => b.g - a.g);
  const nm = { prod:'produtividade', cancel:'cancelamento', assert:'assertividade', tempo:'tempo de processamento', erros:'erros por semana' };
  const top3 = desv.slice(0, 3);
  blocos.push(`<section class="pt"><h3>1. Indicadores do período</h3><div class="pt-t"><table><thead><tr><th>Hub</th>${KPIS.map(k => `<th>${esc(D.targets[k].short)}</th>`).join('')}</tr></thead><tbody>${ind.join('')}</tbody></table></div><p class="dim">Metas: produtividade ${KPIS.length ? '25 por pessoa (Varandas) e 30 (Expedição)' : ''}, cancelamento abaixo de ${D.targets.cancel.goal}%, assertividade a partir de ${D.targets.assert.goal}%, tempo até 7 min (Varandas) e 3 min (Expedição), erros no máximo ${D.targets.erros.goal} por semana em cada hub. Variação em relação ao período anterior, em pequeno.</p></section>`);
  txt.push('', 'DESVIOS PARA O DIRETOR');
  const desvTxt = top3.map((d, i) => `${i+1}. ${d.h}: ${nm[d.k]} em ${fmtK(D, d.k, d.v)} (meta ${nf(d.meta, d.k === 'prod' ? 0 : 1)})`);
  blocos.push(`<section class="pt"><h3>2. Três desvios para levar ao diretor</h3>${top3.length ? `<ol>${desvTxt.map(x => `<li>${esc(x.replace(/^\d\. /, ''))}</li>`).join('')}</ol>` : '<p>Nenhum indicador fora da meta no período.</p>'}</section>`);
  txt.push(...(desvTxt.length ? desvTxt : ['Nenhum indicador fora da meta no período.']));
  /* 3 por unidade */
  const vis = visitas().filter(v => v.dia >= de && v.dia <= ate), mt = manut(), ac = acoes();
  const un = HUBS().map(h => {
    const nome = HUB_NOME[h.id], li = [];
    if(temDados(D, h.id)){ const rows = rowsIn(D, h.id, de, ate), te = topErro(D, h.id, rows); if(te) li.push(`Erro mais frequente: ${te.name.toLowerCase()} (${te.pct}% de ${te.tot} erros)`); }
    const vh = vis.filter(v => v.hub === nome);
    if(vh.length){ const trav = {}; vh.forEach(v => (v.trava || []).forEach(t => trav[t] = (trav[t] || 0) + 1)); const tt = Object.entries(trav).sort((a,b) => b[1]-a[1]).map(([t, n]) => `${t} (${n})`).join(', '); if(tt) li.push('Onde trava, segundo as visitas: ' + tt); vh.filter(v => v.atrapalha).slice(0, 2).forEach(v => li.push(`Equipe disse (${fmtD(v.dia)}): “${v.atrapalha}”`)); const u = vh[0]; li.push(`Ficha de saúde (${fmtD(u.dia)}): ${NIVEL[u.semaforo]}${(u.motivos || []).length ? ' — ' + u.motivos.join('; ') : ''}`); }
    else li.push('Sem visita registrada no período');
    const ma = mt.filter(o => o.hub === nome && o.status !== 'resolvida'), mn = mt.filter(o => o.hub === nome && noP(o.ocorreuEm));
    li.push(`Manutenção: ${ma.length} em aberto${ma.filter(o => o.urgencia === 'alta').length ? ` (${ma.filter(o => o.urgencia === 'alta').length} urgente)` : ''}, ${mn.length} nova(s) no período`);
    const aa = ac.filter(a => a.hub === nome && a.status !== 'feita'); li.push(`Ações: ${aa.length} em aberto, ${aa.filter(vencida).length} vencida(s)`);
    return { nome, li };
  });
  blocos.push(`<section class="pt"><h3>3. Por unidade</h3>${un.map(u => `<div class="pt-u"><h4>${esc(u.nome)}</h4><ul>${u.li.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}</section>`);
  txt.push('', 'POR UNIDADE'); un.forEach(u => { txt.push(u.nome); u.li.forEach(x => txt.push('  - ' + x)); });
  /* 4 escala */
  const furos = {}; let okF = 0, totF = 0;
  const dl = Array.from({length: Math.min(dias, 14)}, (_, i) => addD(ate, -i));
  const res = await Promise.all(dl.map(d => fetch('/api/alerta/painel?d=' + d, {credentials:'same-origin', cache:'no-store'}).then(r => r.ok ? r.json() : null).catch(() => null)));
  res.forEach(p => { if(p && p.furos) p.furos.forEach(f => { totF++; if(f.estado === 'resolvido') okF++; furos[f.hub || '—'] = (furos[f.hub || '—'] || 0) + 1; }); });
  const okRes = res.filter(Boolean).length;
  const fl = Object.entries(furos).sort((a,b) => b[1]-a[1]).map(([h, n]) => `${h}: ${n}`).join(' · ');
  blocos.push(`<section class="pt"><h3>4. Escala e cobertura</h3><p>${okRes ? `${totF} furo(s) de escala em ${okRes} dia(s) lidos (${okF} resolvidos).${fl ? ' Por hub: ' + esc(fl) + '.' : ''}` : 'Não consegui ler os furos de escala neste momento.'}${dias > 14 ? ' (últimos 14 dias)' : ''}</p></section>`);
  txt.push('', 'ESCALA E COBERTURA', okRes ? `${totF} furo(s) em ${okRes} dia(s) (${okF} resolvidos). ${fl}` : 'Furos não lidos.');
  /* 5 plano de ação */
  const abertas = ac.filter(a => a.status !== 'feita').sort((a,b) => (a.prazo || '9').localeCompare(b.prazo || '9')), feitas = ac.filter(a => a.status === 'feita' && a.doneAt && noP(a.doneAt));
  const linhaA = a => `${a.hub}: ${a.texto}${a.resp ? ' (' + a.resp + ')' : ''}${a.prazo ? ', prazo ' + fmtD(a.prazo) : ''}${vencida(a) ? ' — VENCIDA' : ''}`;
  blocos.push(`<section class="pt"><h3>5. Plano de ação</h3><p>${feitas.length} ação(ões) feita(s) no período; ${abertas.length} em aberto, ${abertas.filter(vencida).length} vencida(s).</p>${abertas.length ? `<ul>${abertas.map(a => `<li class="${vencida(a) ? 'k-bd' : ''}">${esc(linhaA(a))}</li>`).join('')}</ul>` : ''}</section>`);
  txt.push('', `PLANO DE AÇÃO (${feitas.length} feitas; ${abertas.length} em aberto)`); abertas.forEach(a => txt.push('  - ' + linhaA(a)));
  /* 6 demandas */
  const dm = demandas().filter(d => d.status !== 'resolvida');
  blocos.push(`<section class="pt"><h3>6. Demandas das áreas (CS, DP, RH e Financeiro)</h3>${dm.length ? `<ul>${dm.map(d => `<li>${esc(d.de)} · ${esc(DST[d.status])} · ${esc(d.hub || 'Geral')}: ${esc(d.texto)}</li>`).join('')}</ul>` : '<p>Nenhuma demanda em aberto.</p>'}</section>`);
  txt.push('', 'DEMANDAS DAS ÁREAS (CS, DP, RH, FINANCEIRO)'); (dm.length ? dm.map(d => `  - ${d.de} (${DST[d.status]}) ${d.hub || 'Geral'}: ${d.texto}`) : ['  Nenhuma em aberto.']).forEach(x => txt.push(x));
  PAUTA = txt.join('\n');
  host.innerHTML = `<div class="op-pbar"><button class="btn ghost sm" id="opPCopia">Copiar texto</button><button class="btn ghost sm" id="opPPrint">Imprimir ou salvar em PDF</button></div><div id="opPautaDoc">${blocos.join('')}</div>`;
}

/* ---------------- shell ---------------- */
const TABS = ['triagem','visita','acoes','demandas','pauta'];
function setTab(t, force){
  if(!TABS.includes(t)) t = 'triagem';
  renderPer();
  $$('#opTabs button').forEach(b => b.classList.toggle('on', b.dataset.op === t));
  TABS.forEach(x => { const el = $('#op-' + x); if(el) el.hidden = x !== t; });
  if(t === 'triagem') renderTriagem();
  if(t === 'visita'){ if(!$('#opVisitaForm').innerHTML.trim()) renderVisitaForm(); renderVisitas(); }
  if(t === 'acoes') renderAcoes();
  if(t === 'demandas') renderDemandas();
  if(t === 'pauta' && force && !PAUTA) criaPauta();
}
function init(){
  if(!$('#v-operacoes')) return;
  const root = $('#v-operacoes');
  const cur = () => ($('#opTabs .on') || {dataset:{op:'triagem'}}).dataset.op;
  const aplicaPer = () => { PAUTA = null; $('#opPautaOut').innerHTML = ''; setTab(cur()); };
  $('#opPer').addEventListener('click', e => { const b = e.target.closest('[data-per]'); if(!b) return; P.k = b.dataset.per; P.de = P.ate = ''; aplicaPer(); });
  $('#opPer').addEventListener('change', e => { if(e.target.id !== 'opDe' && e.target.id !== 'opAte') return; P.k = 'custom'; P.de = $('#opDe').value; P.ate = $('#opAte').value; if(P.de && P.ate && P.de > P.ate){ St().toast('A data inicial passou da final', true); return; } aplicaPer(); });
  $('#opTabs').addEventListener('click', e => { const b = e.target.closest('[data-op]'); if(b) setTab(b.dataset.op); });
  root.addEventListener('click', e => {
    const go = e.target.closest('a[data-go]'); if(go){ e.preventDefault(); const w = go.dataset.go; if(w === 'manut'){ location.hash = '#/compras'; setTimeout(() => { const b = document.querySelector('#cpTabs [data-cp="man"]'); if(b) b.click(); }, 60); } else if(w === 'acoes' || w === 'demandas'){ setTab(w); } else if(App()) App().go(w); return; }
    const rs = e.target.closest('[data-resolve]'); if(rs){ resolveItem(rs.dataset.resolve); return; }
    const t = e.target.closest('.tri button');
    if(t && V){ const w = t.parentElement, g = w.dataset.g, k = w.dataset.k, v = t.dataset.v;
      if(g === 'aud'){ V.aud[+k].res = V.aud[+k].res === v ? '' : v; } else if(g === 'sla'){ V.slaBate = V.slaBate === v ? '' : v; }
      else { if(V[g][k] && V[g][k].v === v) delete V[g][k]; else V[g][k] = { v, note: (V[g][k] || {}).note || '' }; }
      marcaVisita(); prevFicha(); return; }
    const tr = e.target.closest('[data-trava]'); if(tr && V){ const x = tr.dataset.trava; V.trava = V.trava.includes(x) ? V.trava.filter(y => y !== x) : [...V.trava, x]; marcaVisita(); return; }
    if(e.target.id === 'vAddAcao'){ V.acoes.push({ texto:'', resp:'', prazo:addD(V.dia, 7) }); renderAcoesForm(); return; }
    const rm = e.target.closest('[data-rm]'); if(rm){ V.acoes.splice(+rm.dataset.rm, 1); renderAcoesForm(); return; }
    if(e.target.id === 'vSalva'){ salvaVisita(); return; }
    if(e.target.id === 'vLimpa'){ V = novaVisita(); renderVisitaForm(); return; }
    const cs = e.target.closest('#opAcChips [data-st]'); if(cs){ AF.st = cs.dataset.st; renderAcoes(); return; }
    const as = e.target.closest('[data-ac-st]'); if(as){ St().updateKind(as.dataset.acSt, o => { o.status = as.dataset.to; o.doneAt = as.dataset.to === 'feita' ? new Date().toISOString() : null; }); return; }
    if(e.target.id === 'opNovaAcao'){ dlgAcao(); return; }
    const ds = e.target.closest('#opDmChips [data-de], #opDmChips [data-dst]'); if(ds){ if('de' in ds.dataset) DF.de = ds.dataset.de; if(ds.dataset.dst) DF.st = ds.dataset.dst; renderDemandas(); return; }
    const dm = e.target.closest('[data-dm]'); if(dm){ St().updateKind(dm.dataset.dm, o => { o.status = dm.dataset.to; o.statusEm = new Date().toISOString(); }); St().toast('Demanda marcada como ' + DST[dm.dataset.to].toLowerCase()); return; }
    const rt = e.target.closest('[data-dm-ret]'); if(rt){ const id = rt.dataset.dmRet, o = demandas().find(x => x.id === id); const v = prompt('Retorno para ' + o.de + ' (aparece na página de demandas):', o.retorno || ''); if(v != null) St().updateKind(id, x => { x.retorno = v.trim(); }); return; }
    if(e.target.id === 'opPCria'){ PAUTA = null; criaPauta(); return; }
    if(e.target.id === 'opPCopia'){ navigator.clipboard.writeText(PAUTA || '').then(() => St().toast('Pauta copiada')).catch(() => St().toast('Não consegui copiar; selecione o texto na tela', true)); return; }
    if(e.target.id === 'opPPrint'){ document.body.classList.add('printing-pauta'); window.print(); setTimeout(() => document.body.classList.remove('printing-pauta'), 500); return; }
    if(e.target.closest('#opRefTri')){ renderTriagem(); }
  });
  root.addEventListener('change', e => {
    if(e.target.id === 'vHub'){ V.hub = e.target.value; prevFicha(); }
    if(e.target.id === 'vDia') V.dia = e.target.value || hoje();
    if(e.target.id === 'opAcHub'){ AF.hub = e.target.value; renderAcoes(); }
    if(e.target.dataset && e.target.dataset.ac != null){ V.acoes[+e.target.dataset.ac][e.target.dataset.f] = e.target.value; }
  });
  root.addEventListener('input', e => { const i = e.target; if(i.dataset && i.dataset.ac != null && i.dataset.f !== 'prazo') V.acoes[+i.dataset.ac][i.dataset.f] = i.value; if(i.classList.contains('tn') && V[i.dataset.g] && V[i.dataset.g][i.dataset.k]) V[i.dataset.g][i.dataset.k].note = i.value; });
  $('#fAcao').addEventListener('submit', async e => {
    e.preventDefault(); const texto = $('#aqTexto').value.trim(); if(!texto){ $('#aqTexto').classList.add('err'); St().toast('Escreva o que precisa ser feito', true); return; }
    $('#aqTexto').classList.remove('err');
    await St().addKind('acao', 'AC', { hub:$('#aqHub').value, texto, resp:$('#aqResp').value.trim(), prazo:$('#aqPrazo').value || addD(hoje(), 7), origem:$('#aqOrigem').value.trim() || 'Manual', status:'aberta' });
    $('#dAcao').close(); St().toast('Ação registrada'); renderAcoes();
  });
  if(St()) St().onChange(() => { if($('#v-operacoes').hidden) return; const t = ($('#opTabs .on') || {}).dataset; if(!t) return; if(t.op === 'acoes') renderAcoes(); if(t.op === 'demandas') renderDemandas(); if(t.op === 'visita') renderVisitas(); });
  const updBadge = () => renderDemandasBadge();
  if(St()) St().onChange(updBadge);
  setTimeout(updBadge, 1500);
}
function renderDemandasBadge(){ const b = $('#opDmBadge'); if(!b || !St()) return; const n = demandas().filter(d => d.status === 'nova').length; b.textContent = n || ''; b.hidden = !n; const nb = $('#navOpBadge'); if(nb){ nb.textContent = n || ''; nb.hidden = !n; } }
window.Operacoes = { open(tab){ if(App()) App().go('operacoes'); setTab(tab || 'triagem', true); }, setTab };
document.addEventListener('central:view', e => { if(e.detail === 'operacoes') setTab(($('#opTabs .on') || {dataset:{op:'triagem'}}).dataset.op, false); });
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
