
/* ============ PERFIL (definido por cada página) ============ */
const ROLE = document.body.dataset.role;          // 'gestao' | 'financeiro'
const CFG = window.CENTRAL_CONFIG || {};
const HUBS = ['Varanda Sion','Varanda Cidade Nova','Varanda Buritis','Varanda Castelo','Expedição Órion Sion'];
const LS_DATA = 'orion_compras_v2', LS_DIRTY = 'orion_compras_dirty';

let state = { seq: 0, orders: [] };
let dirty = new Set(JSON.parse(localStorage.getItem(LS_DIRTY) || '[]'));
const F = { q:'', hub:'', from:'', to:'', status: ROLE === 'financeiro' ? 'pendente' : 'todos' };
let openId = null;
const role = ROLE;

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nowISO = () => new Date().toISOString();
const fmtDate = iso => new Date(iso).toLocaleDateString('pt-BR');
const fmtDT = iso => { const d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); };
const dayKey = iso => { const d = new Date(iso); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
const uid = () => Math.random().toString(36).slice(2,9);
function safeUrl(u){ try{ const x = new URL(u); return (x.protocol==='http:'||x.protocol==='https:') ? x.href : ''; }catch{ return ''; } }
function statusOf(o){ return o.awaiting ? 'aguardando' : o.status; }

/* ---- merge: o mais recente vence, mas as mensagens nunca se perdem ---- */
function mergeOrder(a, b){
  if(!a) return b; if(!b) return a;
  const [n, o] = (a.updatedAt||'') >= (b.updatedAt||'') ? [a, b] : [b, a];
  const nt = n.thread || [], ot = o.thread || [];
  const ids = new Set(nt.map(m => m.id));
  const thread = [...nt, ...ot.filter(m => !ids.has(m.id))].sort((x,y) => x.at.localeCompare(y.at));
  return { ...n, thread };
}
function mergeInto(list){
  const map = new Map(state.orders.map(o => [o.id, o]));
  list.forEach(o => map.set(o.id, mergeOrder(map.get(o.id), o)));
  state.orders = [...map.values()];
  state.seq = Math.max(state.seq||0, ...state.orders.filter(o => o.kind !== 'manutencao').map(o => parseInt(o.id.slice(3))||0));
}

/* ---- Firebase (Firestore) ---- */
const remote = !!(CFG.FIREBASE && CFG.FIREBASE.projectId && window.firebase);
let db = null, unsub = null;
if(remote){
  firebase.initializeApp(CFG.FIREBASE);
  db = firebase.firestore();
}
const col = () => db.collection(CFG.COLLECTION || 'compras_pedidos');

// Leitura única (usada antes de criar um pedido, para não repetir o código PC-xxxx)
async function pull(){
  if(!remote) return;
  try{
    const snap = await col().get();
    mergeInto(snap.docs.map(d => d.data()));
    localStorage.setItem(LS_DATA, JSON.stringify(state));
    setSync(true);
  }catch(e){ console.warn(e); setSync(false); }
}
// Tempo real: qualquer mudança feita pelo outro lado chega na hora
function listen(){
  if(!remote || unsub) return;
  unsub = col().onSnapshot(snap => {
    mergeInto(snap.docs.map(d => d.data()));
    localStorage.setItem(LS_DATA, JSON.stringify(state));
    setSync(true); render();
  }, err => { console.warn(err); setSync(false); });
}
// Grava com transação: junta com a versão da nuvem, então nenhuma mensagem se perde
async function flush(){
  if(!remote || !dirty.size) return;
  const ids = [...dirty];
  try{
    for(const id of ids){
      const local = state.orders.find(o => o.id === id); if(!local) { dirty.delete(id); continue; }
      const ref = col().doc(id);
      const merged = await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const m = snap.exists ? mergeOrder(snap.data(), local) : local;
        tx.set(ref, JSON.parse(JSON.stringify(m)));
        return m;
      });
      mergeInto([merged]);
      const cur = state.orders.find(o => o.id === id);
      if(cur && cur.updatedAt <= merged.updatedAt) dirty.delete(id);   // se houve edição nova durante o envio, continua pendente
    }
    localStorage.setItem(LS_DIRTY, JSON.stringify([...dirty])); setSync(true);
  }catch(e){ console.warn(e); setSync(false); }
}
function setSync(ok){
  const el = $('#sync'); if(!el) return;
  if(!remote){ el.textContent = 'modo local · banco não conectado'; el.className = 'sync off'; return; }
  el.textContent = ok ? 'sincronizado em tempo real' : 'sem conexão · tentando de novo';
  el.className = 'sync ' + (ok ? 'on' : 'off');
}
function save(...changed){
  changed.forEach(o => dirty.add(o.id));
  localStorage.setItem(LS_DATA, JSON.stringify(state));
  localStorage.setItem(LS_DIRTY, JSON.stringify([...dirty]));
  flush(); render();
}
function touch(o){ o.updatedAt = nowISO(); }

/* ============ AÇÕES ============ */
async function addOrder(d){
  await pull();
  state.seq++;
  const id = 'PC-' + String(state.seq).padStart(4,'0');
  state.orders.push({ id, name:d.name, hub:d.hub, qty:d.qty, link:d.link, specs:d.specs, createdAt:nowISO(), updatedAt:nowISO(),
    status:'pendente', reason:'', decidedAt:null, awaiting:false, alert:null, thread:[], deleted:false });
  const created = state.orders[state.orders.length-1]; save(created); toast('Pedido ' + id + ' registrado');
}
function buy(o, note){
  o.status = 'comprado'; o.reason = ''; o.decidedAt = nowISO(); o.awaiting = false;
  o.thread.push({ id:uid(), from:'sys', kind:'note', text:'Marcado como COMPRADO' + (note ? ' — ' + note : ''), at:nowISO() });
  o.alert = null; touch(o); save(o); toast('Marcado como comprado');
}
function notBuy(o, reason){
  o.status = 'nao_comprado'; o.reason = reason; o.decidedAt = nowISO(); o.awaiting = false;
  o.thread.push({ id:uid(), from:'sys', kind:'note', text:'Marcado como NÃO COMPRADO — ' + reason, at:nowISO() });
  o.alert = null; touch(o); save(o); toast('Marcado como não comprado');
}
function arrive(o){
  o.arrived = true; o.arrivedAt = nowISO();
  o.thread.push({ id:uid(), from:'sys', kind:'note', text:'Equipamento CHEGOU', at:nowISO() });
  touch(o); save(o); toast('Chegada registrada');
}
function unarrive(o){
  o.arrived = false; o.arrivedAt = null;
  o.thread.push({ id:uid(), from:'sys', kind:'note', text:'Chegada desfeita (voltou para "a caminho")', at:nowISO() });
  touch(o); save(o);
}
function undo(o){
  o.status = 'pendente'; o.reason = ''; o.decidedAt = null; o.arrived = false; o.arrivedAt = null;
  o.thread.push({ id:uid(), from:'sys', kind:'note', text:'Decisão desfeita, volta a pendente', at:nowISO() });
  touch(o); save(o);
}
function ask(o, text){
  o.awaiting = true; o.alert = 'gestao';
  o.thread.push({ id:uid(), from:'financeiro', kind:'question', text, at:nowISO() });
  touch(o); save(o); toast('Notificação enviada para a Gestão');
}
function answer(o, text){
  o.awaiting = false; o.alert = 'financeiro';
  o.thread.push({ id:uid(), from:'gestao', kind:'answer', text, at:nowISO() });
  touch(o); save(o); toast('Resposta enviada ao Financeiro');
}
function removeOrder(o){ o.deleted = true; touch(o); save(o); toast('Pedido removido'); }

/* ============ RENDER ============ */
function visibleOrders(){ return state.orders.filter(o => !o.deleted && o.kind !== 'manutencao'); }   // manutenções ficam no mesmo banco, mas só aparecem na aba própria

function filtered(){
  const q = F.q.trim().toLowerCase();
  return visibleOrders().filter(o => {
    if(F.hub && o.hub !== F.hub) return false;
    const k = dayKey(o.createdAt);
    if(F.from && k < F.from) return false;
    if(F.to && k > F.to) return false;
    if(F.status === 'acaminho'){ if(!(o.status === 'comprado' && !o.arrived)) return false; }
    else if(F.status === 'chegou'){ if(!(o.status === 'comprado' && o.arrived)) return false; }
    else if(F.status !== 'todos' && statusOf(o) !== F.status) return false;
    if(q){
      const hay = [o.id,o.name,o.hub,o.link,o.specs,o.qty,o.reason].join(' ').toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  }).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}

function render(){
  const all = visibleOrders();
  const n = { total: all.length, comprado:0, nao_comprado:0, aguardando:0, pendente:0 };
  all.forEach(o => n[statusOf(o)]++);

  // estatísticas
  const pct = n.total ? Math.round(n.comprado / n.total * 100) : 0;
  $('#stOpen').textContent = n.pendente + n.aguardando;
  $('#stAw').textContent = n.aguardando;
  $('#stOk').textContent = n.comprado;
  $('#stNo').textContent = n.nao_comprado;
  $('#stPct').textContent = pct + '% comprados';
  $('#stBar').style.width = pct + '%';
  $('#liveTxt').textContent = 'Compras · atualizado ' + new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});

  // notificações do papel atual
  const notifs = role === 'gestao' ? all.filter(o => o.awaiting) : all.filter(o => o.alert === 'financeiro');
  const bell = $('#bell'), bn = $('#bellN');
  bn.hidden = !notifs.length; bn.textContent = notifs.length; bell.classList.toggle('ring', notifs.length > 0);

  const ha = $('#heroAlert');
  if(role === 'gestao'){
    ha.innerHTML = n.aguardando
      ? `<div class="alert-pill" id="alertGo">${n.aguardando} ${n.aguardando>1?'itens esperam':'item espera'} sua resposta · compra travada até você responder</div>`
      : `<div class="alert-pill ok">Nenhuma pendência com você agora</div>`;
  } else {
    const open = n.pendente;
    ha.innerHTML = open
      ? `<div class="alert-pill" id="alertGo">${open} ${open>1?'itens aguardam':'item aguarda'} decisão do Financeiro</div>`
      : `<div class="alert-pill ok">Tudo decidido por aqui</div>`;
  }
  const ag = $('#alertGo'); if(ag) ag.onclick = () => { if(role==='gestao') document.getElementById('notificacoes').scrollIntoView(); else { F.status='pendente'; render(); document.getElementById('pedidos').scrollIntoView(); } };

  renderNotifs(notifs);


  // chips
  const defs = [['todos','Todos',n.total],['pendente','Pendentes',n.pendente],['aguardando','Aguardando resposta',n.aguardando],['comprado','Comprados',n.comprado],['acaminho','A caminho',all.filter(o => o.status==='comprado' && !o.arrived).length],['chegou','Chegaram',all.filter(o => o.status==='comprado' && o.arrived).length],['nao_comprado','Não comprados',n.nao_comprado]];
  $('#chips').innerHTML = defs.map(([k,l,c]) => `<button class="chip ${F.status===k?'on':''}" data-s="${k}">${l}<em>${c}</em></button>`).join('')
    + '<span class="sep"></span>'
    + [['hoje','Hoje'],['7','7 dias'],['30','30 dias'],['','Limpar datas']].map(([k,l]) => `<button class="chip" data-r="${k}">${l}</button>`).join('');

  // lista
  const list = filtered();
  $('#countTxt').textContent = list.length + ' de ' + n.total + ' pedidos';
  $('#list').innerHTML = list.length ? list.map(rowHTML).join('') : `<div class="empty"><b>${n.total ? 'Nada encontrado com esses filtros' : 'Nenhum pedido ainda'}</b>${n.total ? 'Ajuste a busca, o hub ou o período.' : 'Clique em “Novo pedido” para registrar o primeiro.'}</div>`;

  if(openId) drawDrawer();
  if(window.ComprasStore) ComprasStore.emit();
}

function rowHTML(o){
  const s = statusOf(o);
  const labels = { pendente:'Pendente', comprado:'Comprado', nao_comprado:'Não comprado', aguardando:'Aguardando resposta' };
  const link = safeUrl(o.link);
  return `<article class="row s-${s}" data-id="${o.id}">
    <div class="id">${o.id}</div>
    <div class="nm-col">
      <div class="nm">${esc(o.name)}</div>
      <div class="meta">${o.qty ? `<span>Qtd: ${esc(o.qty)}</span>` : ''}${link ? '<span>🔗 link</span>' : ''}${o.specs ? '<span>📋 especificações</span>' : ''}${o.thread.some(m=>m.kind==='question') ? '<span>💬 conversa</span>' : ''}</div>
      ${s==='nao_comprado' && o.reason ? `<div class="reason"><b>Motivo:</b> ${esc(o.reason)}</div>` : ''}
    </div>
    <div class="hub-tag">${esc(o.hub)}</div>
    <div class="dt">${fmtDate(o.createdAt)}</div>
    <div><span class="badge b-${s}${s==='comprado' && o.arrived ? ' b-chegou' : ''}">${s==='comprado' ? (o.arrived ? 'Chegou' : 'Comprado · a caminho') : labels[s]}</span>
      ${s==='comprado' && role==='gestao' ? (o.arrived ? `<div class="arr-at">chegou em ${fmtDate(o.arrivedAt)}</div>` : `<button type="button" class="btn lime sm arr-btn" data-arrive="${o.id}">📦 Chegou</button>`) : ''}</div>
  </article>`;
}

let lastNSig = '', lastDSig = '';
function renderNotifs(list){
  const sec = $('#notificacoes');
  if(!list.length){ sec.hidden = true; lastNSig = ''; return; }
  sec.hidden = false;
  const sig = list.map(o => o.id + o.updatedAt).join('|');
  if(sig === lastNSig) return;          // não recria enquanto a pessoa digita
  lastNSig = sig;
  if(role === 'gestao'){
    $('#nEyebrow').textContent = 'NOTIFICAÇÕES · ' + list.length;
    $('#nTitle').textContent = 'O Financeiro precisa da sua resposta';
    $('#np').innerHTML = list.map(o => {
      const q = [...o.thread].reverse().find(m => m.kind === 'question');
      return `<div class="nitem" data-id="${o.id}">
        <div class="top"><span>${o.id} · ${esc(o.hub)}</span><span>${q ? fmtDT(q.at) : ''}</span></div>
        <div class="pn">${esc(o.name)}</div>
        <div class="q">“${esc(q?.text || '')}”</div>
        <textarea class="t" placeholder="Escreva sua resposta ao financeiro…" data-reply="${o.id}"></textarea>
        <div class="acts"><button class="btn ghost sm" data-open="${o.id}">Ver pedido</button><button class="btn lime sm" data-send="${o.id}">Responder</button></div>
      </div>`;
    }).join('');
  } else {
    $('#nEyebrow').textContent = 'NOTIFICAÇÕES · ' + list.length;
    $('#nTitle').textContent = 'A Gestão respondeu';
    $('#np').innerHTML = list.map(o => {
      const a = [...o.thread].reverse().find(m => m.kind === 'answer');
      return `<div class="nitem fin" data-id="${o.id}">
        <div class="top"><span>${o.id} · ${esc(o.hub)}</span><span>${a ? fmtDT(a.at) : ''}</span></div>
        <div class="pn">${esc(o.name)}</div>
        <div class="q">“${esc(a?.text || '')}”</div>
        <div class="acts"><button class="btn ghost sm" data-open="${o.id}">Ver pedido</button><button class="btn lime sm" data-dismiss="${o.id}">Ok, visto</button></div>
      </div>`;
    }).join('');
  }
}

/* ---- Drawer ---- */
function drawDrawer(force){
  const o = state.orders.find(x => x.id === openId && !x.deleted);
  if(!o){ closeDrawer(); return; }
  const dsig = o.id + o.updatedAt;
  if(!force && dsig === lastDSig) return;
  lastDSig = dsig;
  const s = statusOf(o);
  const labels = { pendente:'Pendente', comprado:'Comprado', nao_comprado:'Não comprado', aguardando:'Aguardando resposta' };
  const link = safeUrl(o.link);
  const thread = o.thread.map(m => {
    const who = m.from==='financeiro' ? 'Financeiro' : m.from==='gestao' ? 'Gestão' : 'Sistema';
    const cls = m.from==='financeiro' ? 'fin' : m.from==='gestao' ? 'ges' : 'sys';
    return `<div class="msg ${cls}"><header><span>${who}${m.kind==='question'?' · pergunta':m.kind==='answer'?' · resposta':''}</span><span>${fmtDT(m.at)}</span></header>${esc(m.text)}</div>`;
  }).join('');

  let foot = '';
  if(role === 'financeiro'){
    if(o.status === 'pendente'){
      foot = `${o.awaiting ? '<div class="warn">Você pediu informação e ainda não houve resposta da Gestão. A compra só pode ser marcada depois da resposta.</div>' : ''}
        <div class="r"><button class="btn lime" data-act="buy" ${o.awaiting?'disabled':''}>✓ Comprado</button><button class="btn red" data-act="nobuy">✕ Não comprado</button></div>
        <div class="r"><button class="btn amber" data-act="ask">Pedir informação à Gestão</button></div>`;
    } else {
      foot = `<div class="r"><button class="btn ghost" data-act="undo">Desfazer decisão</button></div>`;
    }
  } else {
    const ed = `<div class="r"><button class="btn ghost" data-act="edit">✎ Editar pedido</button></div>`;
    if(o.awaiting){
      foot = `<div class="warn">O Financeiro pediu informação. Responda para liberar a compra.</div>
        <textarea class="t" id="dReply" placeholder="Sua resposta…"></textarea>
        <div class="r"><button class="btn lime" data-act="reply">Enviar resposta</button></div>` + ed;
    } else if(o.status === 'pendente'){
      foot = ed + `<div class="r"><button class="btn red" data-act="del">Remover pedido</button></div>`;
    } else if(o.status === 'comprado'){
      foot = (o.arrived
        ? `<div class="r"><div class="ok-box">📦 Chegou em ${fmtDT(o.arrivedAt)}</div><button class="btn ghost" data-act="unarrive">Desfazer chegada</button></div>`
        : `<div class="r"><button class="btn lime" data-act="arrive">📦 Chegou</button></div>`) + ed;
    } else {
      foot = ed;
    }
  }

  $('#drawer').innerHTML = `
    <div class="dh"><div><span class="badge b-${s}">${labels[s]}</span><h3>${esc(o.name)}</h3></div>
      <button class="x" data-act="close" aria-label="Fechar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    <div class="db">
      <div class="kv"><div><small>CÓDIGO</small><span style="font-family:var(--mono)">${o.id}</span></div><div><small>HUB</small><span>${esc(o.hub)}</span></div>
        <div><small>SOLICITADO EM</small><span>${fmtDT(o.createdAt)}</span></div><div><small>QUANTIDADE</small><span>${o.qty ? esc(o.qty) : '—'}</span></div></div>
      ${link ? `<div class="blk"><small>LINK DE SUGESTÃO</small><p><a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(link)}</a></p></div>` : ''}
      ${o.specs ? `<div class="blk"><small>ESPECIFICAÇÕES</small><p>${esc(o.specs)}</p></div>` : ''}
      ${s==='nao_comprado' ? `<div class="blk" style="border-color:rgba(255,82,82,.3)"><small>MOTIVO DE NÃO TER COMPRADO</small><p>${esc(o.reason)}</p></div>` : ''}
      <div><div class="eyebrow" style="margin-bottom:10px">HISTÓRICO</div><div class="tl">
        <div class="msg sys"><header><span>Sistema</span><span>${fmtDT(o.createdAt)}</span></header>Pedido registrado pela Gestão</div>${thread}</div></div>
    </div>
    ${foot ? `<div class="df">${foot}</div>` : ''}`;
  $('#drawer').classList.add('on'); $('#scrim').classList.add('on'); $('#drawer').setAttribute('aria-hidden','false');

  // abrir como financeiro limpa o alerta de resposta
  if(role==='financeiro' && o.alert==='financeiro'){ /* só limpa ao clicar "visto" ou ao agir */ }
}
function openDrawer(id){ openId = id; drawDrawer(true); }
function closeDrawer(){ openId = null; lastDSig = ''; $('#drawer').classList.remove('on'); $('#scrim').classList.remove('on'); $('#drawer').setAttribute('aria-hidden','true'); }

/* ============ DIÁLOGOS ============ */
function askText({eyebrow,title,label,hint,ok,required=true}){
  return new Promise(res => {
    const d = $('#dAsk'), t = $('#aTxt');
    $('#aEye').textContent = eyebrow; $('#aTitle').textContent = title; $('#aLab').innerHTML = label + (required?' <i>*</i>':'');
    $('#aHint').textContent = hint || ''; $('#aOk').textContent = ok || 'Confirmar'; t.value=''; t.classList.remove('err');
    let done = false;
    const form = $('#fAsk');
    const submit = e => { e.preventDefault(); const v = t.value.trim(); if(required && !v){ t.classList.add('err'); t.focus(); return; } done = true; cleanup(); d.close(); res(v); };
    const onClose = () => { cleanup(); if(!done) res(null); };
    const cleanup = () => { form.removeEventListener('submit', submit); d.removeEventListener('close', onClose); };
    form.addEventListener('submit', submit); d.addEventListener('close', onClose);
    d.showModal(); t.focus();
  });
}

function toast(msg, bad){
  const t = $('#toast'); t.textContent = msg; t.className = 'toast on' + (bad?' bad':'');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.className = 'toast', 2600);
}

let editingId = null;
function setNovoMode(edit){
  const d = $('#dNovo'); if(!d) return;
  const eye = d.querySelector('.eyebrow'), h = d.querySelector('h3'), ok = d.querySelector('button[type=submit]');
  if(eye) eye.textContent = edit ? 'EDITAR PEDIDO' : 'NOVO PEDIDO';
  if(h) h.textContent = edit ? 'Atualize os dados do pedido' : 'O que precisa ser comprado?';
  if(ok) ok.textContent = edit ? 'Salvar alterações' : 'Registrar pedido';
}
function openNovo(){
  editingId = null; setNovoMode(false);
  ['nName','nQty','nLink','nSpec'].forEach(i => { $('#'+i).value=''; $('#'+i).classList.remove('err'); });
  $('#nHub').value = ''; $('#nHub').classList.remove('err');
  $('#dNovo').showModal(); $('#nName').focus();
}
function openEdit(o){
  editingId = o.id; setNovoMode(true);
  $('#nName').value = o.name || ''; $('#nHub').value = o.hub || '';
  $('#nQty').value = o.qty || ''; $('#nLink').value = o.link || ''; $('#nSpec').value = o.specs || '';
  ['nName','nHub','nQty','nLink','nSpec'].forEach(i => $('#'+i).classList.remove('err'));
  $('#dNovo').showModal(); $('#nName').focus();
}
function applyEdit(id, f){
  const o = state.orders.find(x => x.id === id);
  if(!o){ toast('Pedido não encontrado', true); return; }
  const lab = {name:'produto', hub:'hub', qty:'quantidade', link:'link', specs:'especificações'};
  const changed = Object.keys(lab).filter(k => (o[k] || '') !== (f[k] || ''));
  if(!changed.length){ toast('Nada foi alterado'); return; }
  changed.forEach(k => { o[k] = f[k]; });
  o.thread = o.thread || [];
  o.thread.push({ id:uid(), from:'sys', kind:'note', text:'Pedido editado pela Gestão (' + changed.map(k => lab[k]).join(', ') + ')', at:new Date().toISOString() });
  if(o.status === 'pendente') o.alert = 'financeiro';
  touch(o); save(o);
  toast('Pedido atualizado');
  render(); if(typeof drawDrawer === 'function') drawDrawer(true);
}

function toCsv(){
  const rows = [['Código','Produto','Hub','Quantidade','Link','Especificações','Solicitado em','Status','Chegou em','Motivo (não comprado)']];
  filtered().forEach(o => rows.push([o.id,o.name,o.hub,o.qty,o.link,o.specs,fmtDT(o.createdAt),statusOf(o),o.arrivedAt ? fmtDT(o.arrivedAt) : '',o.reason]));
  const csv = '﻿' + rows.map(r => r.map(c => '"' + String(c??'').replace(/"/g,'""') + '"').join(';')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download = 'compras-orion-' + dayKey(nowISO()) + '.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}


/* ============ MANUTENÇÕES DOS HUBS (mesmo banco/coleção dos pedidos; campo kind:'manutencao') ============ */
window.ComprasStore = {
  hubs: HUBS, subs: [],
  list(){ return state.orders.filter(o => o.kind === 'manutencao' && !o.deleted); },
  onChange(cb){ this.subs.push(cb); },
  emit(){ this.subs.forEach(cb => { try{ cb(); }catch(e){ console.warn(e); } }); },
  async add(d){
    await pull();
    const n = Math.max(0, ...state.orders.filter(o => o.kind === 'manutencao').map(o => parseInt(o.id.slice(3)) || 0)) + 1;
    const rec = { id:'MT-' + String(n).padStart(4,'0'), kind:'manutencao', hub:d.hub, tipo:d.tipo, title:d.title, desc:d.desc || '', urgencia:d.urgencia,
      custo:d.custo || '', ocorreuEm:d.ocorreuEm || dayKey(nowISO()), status:'aberta', resolvedAt:null,
      createdAt:nowISO(), updatedAt:nowISO(), thread:[], deleted:false, awaiting:false, alert:null };
    state.orders.push(rec); save(rec); toast('Manutenção ' + rec.id + ' registrada'); return rec;
  },
  update(id, fn){ const o = state.orders.find(x => x.id === id && x.kind === 'manutencao'); if(!o) return; fn(o); touch(o); save(o); },
  toast(m, bad){ toast(m, bad); }
};

/* ============ EVENTOS ============ */
function init(){
  try{ const d = JSON.parse(localStorage.getItem(LS_DATA) || 'null'); if(d && Array.isArray(d.orders)) state = d; }catch{}
  // selects
  $('#fHub').innerHTML = '<option value="">Todos os hubs</option>' + HUBS.map(h => `<option>${esc(h)}</option>`).join('');
  if($('#nHub')) $('#nHub').innerHTML = '<option value="">Selecione o hub…</option>' + HUBS.map(h => `<option>${esc(h)}</option>`).join('');

  $('#q').addEventListener('input', e => { F.q = e.target.value; render(); });
  $('#fHub').addEventListener('change', e => { F.hub = e.target.value; render(); });
  $('#dFrom').addEventListener('change', e => { F.from = e.target.value; render(); });
  $('#dTo').addEventListener('change', e => { F.to = e.target.value; render(); });

  $('#chips').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if(!b) return;
    if(b.dataset.s){ F.status = b.dataset.s; }
    else if('r' in b.dataset){
      const r = b.dataset.r, today = new Date();
      if(r === ''){ F.from = F.to = ''; }
      else { const f = new Date(); if(r !== 'hoje') f.setDate(f.getDate() - (parseInt(r)-1)); F.from = dayKey(f.toISOString()); F.to = dayKey(today.toISOString()); }
      $('#dFrom').value = F.from; $('#dTo').value = F.to;
    }
    render();
  });

  $('#list').addEventListener('click', e => {
    const ab = e.target.closest('[data-arrive]');
    if(ab){ e.stopPropagation(); const o = state.orders.find(x => x.id === ab.dataset.arrive); if(o && o.status === 'comprado' && !o.arrived) arrive(o); return; }
    const r = e.target.closest('.row'); if(r) openDrawer(r.dataset.id);
  });
  $('#scrim').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && openId) closeDrawer(); });

  // dialogs close buttons
  document.querySelectorAll('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

  ['btnNovo','navNovo'].forEach(id => { const el = $('#'+id); if(el) el.addEventListener('click', e => { e.preventDefault(); openNovo(); }); });
  $('#navCsv').addEventListener('click', e => { e.preventDefault(); toCsv(); });
  $('#bell').addEventListener('click', () => { const s = $('#notificacoes'); if(!s.hidden) s.scrollIntoView(); else toast('Sem notificações no momento'); });

  // novo pedido
  if($('#fNovo')) $('#fNovo').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#nName').value.trim(), hub = $('#nHub').value, link = $('#nLink').value.trim();
    $('#nName').classList.toggle('err', !name); $('#nHub').classList.toggle('err', !hub);
    let bad = !name || !hub;
    if(link && !safeUrl(link)){ $('#nLink').classList.add('err'); bad = true; toast('O link precisa começar com http:// ou https://', true); }
    else $('#nLink').classList.remove('err');
    if(bad){ if(!name || !hub) toast('Preencha nome do produto e hub', true); return; }
    const f = { name, hub, link, qty:$('#nQty').value.trim(), specs:$('#nSpec').value.trim() };
    if(editingId){ applyEdit(editingId, f); editingId = null; }
    else await addOrder(f);
    $('#dNovo').close();
  });

  // notificações (gestão responde / financeiro dá "visto")
  $('#np').addEventListener('click', e => {
    const open = e.target.closest('[data-open]'), send = e.target.closest('[data-send]'), dis = e.target.closest('[data-dismiss]');
    if(open) openDrawer(open.dataset.open);
    if(send){
      const o = state.orders.find(x => x.id === send.dataset.send);
      const ta = document.querySelector(`[data-reply="${o.id}"]`); const v = ta.value.trim();
      if(!v){ ta.classList.add('err'); ta.focus(); toast('Escreva a resposta antes de enviar', true); return; }
      answer(o, v);
    }
    if(dis){ const o = state.orders.find(x => x.id === dis.dataset.dismiss); o.alert = null; touch(o); save(o); }
  });

  // ações do drawer
  $('#drawer').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if(!b) return;
    const id = openId; const a = b.dataset.act;
    let o = state.orders.find(x => x.id === id);
    if(a === 'close') return closeDrawer();
    if(!o) return;
    const cur = () => state.orders.find(x => x.id === id);   // o pedido pode ser recarregado do banco enquanto o diálogo está aberto
    if(a === 'buy'){ if(o.awaiting) return; const note = await askText({eyebrow:'COMPRADO',title:'Confirmar compra de ' + o.name,label:'OBSERVAÇÃO <s>(opcional)</s>',hint:'Ex.: nota fiscal, fornecedor, previsão de entrega.',ok:'Marcar como comprado',required:false}); if(note !== null && cur() && !cur().awaiting) buy(cur(), note); }
    if(a === 'nobuy'){ const r = await askText({eyebrow:'NÃO COMPRADO',title:'Por que não foi comprado?',label:'JUSTIFICATIVA',hint:'Obrigatória. A Gestão verá este motivo no pedido.',ok:'Marcar como não comprado'}); if(r && cur()) notBuy(cur(), r); }
    if(a === 'ask'){ const r = await askText({eyebrow:'PEDIR INFORMAÇÃO',title:'O que você precisa saber?',label:'SUA PERGUNTA',hint:'A Gestão recebe uma notificação e a compra fica travada até ela responder.',ok:'Enviar notificação'}); if(r && cur()) ask(cur(), r); }
    if(a === 'reply'){ const v = $('#dReply').value.trim(); if(!v){ $('#dReply').classList.add('err'); toast('Escreva a resposta', true); return; } answer(o, v); }
    if(a === 'undo') undo(o);
    if(a === 'arrive') arrive(o);
    if(a === 'unarrive') unarrive(o);
    if(a === 'edit'){ openEdit(o); return; }
    if(a === 'del'){ if(confirm('Remover o pedido ' + o.id + '?')){ removeOrder(o); closeDrawer(); } }
  });

  render(); setSync(true);
  if(remote){ listen(); window.addEventListener('online', flush); flush(); }
}

init();
