/* ============ CENTRAL · shell + dashboard ============ */
(function(){
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const nf = (v,d=1) => Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const svgNS = 'http://www.w3.org/2000/svg';
const Dd = window.CentralData;

/* ---------- navegação e menu lateral ---------- */
const ROUTES = {dashboard:'Dashboard', operacoes:'Operações', compras:'Compras', ponto:'Controle de ponto', alertas:'Central de alertas', escala:'Escala', presencas:'Presenças'};
const rendered = {};
let opsOk = false;
function opsGate(){
  let o = document.getElementById('opsGate');
  if(!o){
    o = document.createElement('div'); o.id = 'opsGate';
    o.style.cssText = 'position:fixed;inset:0;z-index:90;background:rgba(10,10,10,.92);display:flex;align-items:center;justify-content:center;padding:20px';
    o.innerHTML = '<form style="background:#161616;border:1px solid #2c2c2c;border-radius:16px;padding:28px;width:300px;text-align:center;color:#eee;font-family:inherit"><div style="font-size:11px;letter-spacing:.14em;color:#baff1a;margin-bottom:8px">OPERAÇÕES</div><h2 style="margin:0 0 6px;font-size:20px">Área restrita</h2><p style="margin:0 0 16px;font-size:13px;color:#999">Digite o PIN de 4 dígitos.</p><input id="opsPin" type="password" inputmode="numeric" pattern="\\d{4}" maxlength="4" autocomplete="off" style="width:100%;box-sizing:border-box;text-align:center;font-size:28px;letter-spacing:.5em;padding:10px;background:#0c0c0c;color:#fff;border:1px solid #333;border-radius:10px"><div id="opsErr" style="min-height:18px;font-size:12px;color:#ff6b6b;margin:8px 0"></div><button type="submit" style="width:100%;padding:11px;border:0;border-radius:10px;background:#baff1a;color:#111;font-weight:700;cursor:pointer">Entrar</button><a href="#/dashboard" id="opsVoltar" style="display:block;margin-top:12px;font-size:12px;color:#888">Voltar ao Dashboard</a></form>';
    document.body.appendChild(o);
    o.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault(); const pin = $('#opsPin').value, err = $('#opsErr'); err.textContent = '';
      try{
        const r = await fetch('/api/ops/pin', {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({pin})});
        const j = await r.json().catch(() => ({}));
        if(!r.ok){ err.textContent = j.error || 'Não foi possível validar.'; $('#opsPin').value = ''; return; }
        opsOk = true; document.body.classList.remove('ops-locked'); o.remove(); go('operacoes', false);
      }catch(x){ err.textContent = 'Sem conexão. Tente de novo.'; }
    });
  }
  o.hidden = false; setTimeout(() => { const i = $('#opsPin'); i && i.focus(); }, 50);
}
document.body.classList.add('ops-locked');
fetch('/api/ops/status', {credentials:'same-origin'}).then(r => r.json()).then(j => { if(j.ok){ opsOk = true; document.body.classList.remove('ops-locked'); if(location.hash === '#/operacoes') go('operacoes', false); } }).catch(() => {});
function go(name, push){
  if(!ROUTES[name]) name = 'dashboard';
  if(name === 'operacoes' && !opsOk){
    $$('.view').forEach(v => v.hidden = true); $$('.sb a.it').forEach(a => a.classList.toggle('on', a.dataset.go === name));
    $('#crumb').innerHTML = 'CENTRAL <b>/ Operações</b>'; if(push !== false) history.replaceState(null,'','#/operacoes');
    opsGate(); return;
  }
  const og = document.getElementById('opsGate'); if(og) og.remove();
  $$('.view').forEach(v => { const on = v.id === 'v-' + name; v.hidden = !on; if(on){ v.classList.remove('in'); void v.offsetWidth; v.classList.add('in'); } });
  $$('.sb a.it').forEach(a => a.classList.toggle('on', a.dataset.go === name));
  $('#crumb').innerHTML = 'CENTRAL <b>/ ' + ROUTES[name] + '</b>';
  document.title = ROUTES[name] + ' · Central Órion';
  if(push !== false) history.replaceState(null,'','#/' + name);
  if(!rendered[name]){ rendered[name] = true; (window.CentralModules && CentralModules.render) && CentralModules.render(name); }
  if(name === 'dashboard') drawDashboard(false);
  document.dispatchEvent(new CustomEvent('central:view', {detail:name}));
  const dm = $('#dataPill'); if(dm) dm.style.visibility = name === 'dashboard' ? 'visible' : 'hidden';
  window.scrollTo({top:0});
  if(!document.body.classList.contains('pinned')) setSb(false);
}
const setSb = on => document.body.classList.toggle('sb-open', on);
function initShell(){
  $('#burger').addEventListener('click', () => setSb(!document.body.classList.contains('sb-open')));
  const edge = $('#edge'), sb = $('#sb'); let t;
  edge.addEventListener('mouseenter', () => { clearTimeout(t); setSb(true); });
  sb.addEventListener('mouseenter', () => clearTimeout(t));
  sb.addEventListener('mouseleave', () => { if(!document.body.classList.contains('pinned')) t = setTimeout(() => setSb(false), 380); });
  $('#shade').addEventListener('click', () => setSb(false));
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && !document.querySelector('dialog[open]')) setSb(false); });
  $$('.sb a.it').forEach(a => a.addEventListener('click', e => { e.preventDefault(); go(a.dataset.go); }));
  $('#pin').addEventListener('click', () => {
    const on = document.body.classList.toggle('pinned');
    try{ localStorage.setItem('orion_sb_pin', on ? '1' : '0'); }catch(e){}
    if(on) setSb(true);
  });
  try{ if(localStorage.getItem('orion_sb_pin') === '1' && innerWidth >= 1280){ document.body.classList.add('pinned'); } }catch(e){}
  window.addEventListener('hashchange', () => { if(!/^#\//.test(location.hash)) return; go((location.hash.match(/#\/(\w+)/) || [])[1], false); });
  const tick = () => { const c = $('#clock'); if(c) c.textContent = new Date().toLocaleString('pt-BR',{weekday:'short',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).replace('.',''); };
  tick(); setInterval(tick, 15000);
}

/* ---------- cálculo dos indicadores ---------- */
let D = null;
const S = {period:14, end:0, custom:null, sel:new Set(), metric:'prod'};
const KEYS = ['prod','cancel','assert','tempo','erros'];
function agg(slices){           // slices: lista de arrays de linhas (um array por hub)
  let ped=0, canc=0, err=0, tp=0, pph=0, ppl=0, errDia=0, nSl=0, tgS=0, pgS=0, prodOk=false;
  slices.forEach(rows => {
    const n = rows.length || 1; let p=0, e=0, vp=0, vh=0, vpe=0, vn=0;
    rows.forEach(r => { p += r.pedidos; e += r.erros; canc += r.cancel; tp += r.tempo*r.pedidos; if(r.cabecas > 0){ vp += r.pedidos; vh += r.cabecas; vn++; } });   // produtividade só conta dias com escala lançada
    tgS += p * ((D.hubs.find(x => x.id === rows.hid) || {}).tempoGoal ?? D.targets.tempo.goal);
    ped += p; err += e; if(vn){ pph += vp; ppl += vh; pgS += vh * ((D.hubs.find(x => x.id === rows.hid) || {}).prodGoal ?? D.targets.prod.goal); prodOk = true; } if(rows.some(r => r.pedidos > 0)){ errDia += e / n * 7; nSl++; }          // erros por semana, por hub: média dos hubs com dados
  });
  return {ped, prod: prodOk ? pph/(ppl||1) : null, cancel: canc/(ped||1)*100, assert: (1-err/(ped||1))*100, tempo: tp/(ped||1), erros: errDia / (nSl || 1), errTot: err, tg: ped ? tgS/ped : D.targets.tempo.goal, pg: ppl ? pgS/ppl : D.targets.prod.goal};
}
const errRoll = (ids, idx) => ids.reduce((a,id) => a + D.byHub[id].slice(Math.max(0, idx-6), idx+1).reduce((b,r) => b + r.erros, 0), 0) / (ids.length || 1);     // erros nos 7 dias até o dia idx (média por hub): comparável à meta semanal
const wEnd = () => D.days.length - (S.end || 0);                    // fim da janela (0 = até hoje; >0 quando o período escolhido termina antes)
const lastN = (id, n) => Object.assign(D.byHub[id].slice(Math.max(0, wEnd()-n), wEnd()), {hid:id});
const winDays = n => D.days.slice(Math.max(0, wEnd()-n), wEnd());
const hubRows = (id, n) => lastN(id, n);
const brD = iso => iso.slice(8,10) + '/' + iso.slice(5,7);
const perTxt = n => S.custom ? 'período de <b>' + brD(S.custom.from) + ' a ' + brD(S.custom.to) + '</b> (' + n + ' dia' + (n>1?'s':'') + ')' : 'últimos <b>' + n + ' dias</b>';
const prevN = (id, n) => { const p = Object.assign(D.byHub[id].slice(Math.max(0, wEnd()-2*n), wEnd()-n), {hid:id}); return p.length >= n ? p : lastN(id, n); };     // sem histórico completo do período anterior, não inventa variação
const gl = (k, m) => (k === 'tempo' && m && m.tg) ? m.tg : (k === 'prod' && m && m.pg) ? m.pg : D.targets[k].goal;       // meta do indicador (a de tempo varia por hub)
function gap(k, v, mult, m){
  if(v == null) return 0;
  const T = D.targets[k]; const G = gl(k, m)*(mult||1);
  if(k === 'assert') return ((100-v) - (100-T.goal)) / (100-T.goal);
  return T.dir === 'up' ? (G - v)/G : (v - G)/G;
}
const status = (k,v,mu,m) => { const g = gap(k,v,mu,m); return g <= 0 ? 'ok' : g <= .15 ? 'wa' : 'bd'; };
const score = m => Math.round(KEYS.reduce((a,k) => { const g = gap(k,m[k],1,m); return a + (g <= 0 ? 100 : 100 - Math.min(65, g*200)); }, 0) / KEYS.length);
const band = s => s >= 85 ? 'ok' : s >= 65 ? 'wa' : 'bd';
const fmtM = (k,v) => v == null ? '—' : nf(v, D.targets[k].dec);
const temDados = id => (D.byHub[id] || []).some(r => r.pedidos > 0);
const hubsComDados = () => D.hubs.filter(h => temDados(h.id));
const selHubs = () => D.hubs.filter(h => S.sel.has(h.id) && temDados(h.id));

/* ---------- helpers de gráfico ---------- */
function tipFor(host){ let t = host.querySelector('.tip'); if(!t){ t = document.createElement('div'); t.className = 'tip'; host.appendChild(t); } return t; }
function showTip(host, html, x, y){
  const t = tipFor(host); t.innerHTML = html; t.classList.add('on');
  const w = host.clientWidth, tw = t.offsetWidth;
  t.style.left = Math.max(4, Math.min(w - tw - 4, x - tw/2)) + 'px'; t.style.top = Math.max(0, y - t.offsetHeight - 14) + 'px';
}
const hideTip = host => { const t = host.querySelector('.tip'); if(t) t.classList.remove('on'); };
const shortDate = iso => iso.slice(8,10) + '/' + iso.slice(5,7);
function pathLen(pts){ let L = 0; for(let i=1;i<pts.length;i++) L += Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]); return Math.ceil(L) + 4; }

function lineChart(host, o){
  const W = 640, H = o.h || 260, pl = 42, pr = 14, pt = 14, pb = 26, n = o.labels.length;
  const all = o.series.flatMap(s => s.vals).concat(o.goal != null ? [o.goal] : []);
  let lo = Math.min(...all), hi = Math.max(...all); const sp = (hi-lo) || 1; lo -= sp*.12; hi += sp*.12; if(o.zero) lo = Math.max(0, lo);
  const X = i => pl + (W-pl-pr) * (n === 1 ? .5 : i/(n-1)), Y = v => pt + (H-pt-pb) * (1 - (v-lo)/(hi-lo));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${o.aria||'Gráfico de linhas'}">`;
  for(let i=0;i<=4;i++){ const v = lo + (hi-lo)*i/4, y = Y(v); s += `<line class="gl" x1="${pl}" x2="${W-pr}" y1="${y}" y2="${y}"/><text x="${pl-7}" y="${y+3}" text-anchor="end">${o.fmt(v)}</text>`; }
  const step = Math.ceil(n/7); for(let i=0;i<n;i+=step) s += `<text x="${X(i)}" y="${H-7}" text-anchor="middle">${shortDate(o.labels[i])}</text>`;
  if(o.goal != null) s += `<line class="tg" x1="${pl}" x2="${W-pr}" y1="${Y(o.goal)}" y2="${Y(o.goal)}"/><text x="${W-pr}" y="${Y(o.goal)-5}" text-anchor="end" style="fill:var(--lime)">META ${o.fmt(o.goal)}</text>`;
  o.series.forEach((se,si) => { const pts = se.vals.map((v,i) => [X(i), Y(v)]); s += `<polyline class="ln" style="--l:${pathLen(pts)};animation-delay:${si*.08}s" stroke="${se.color}" points="${pts.map(p => p.join(',')).join(' ')}"/>`; });
  s += `<line id="cur" y1="${pt}" y2="${H-pb}" stroke="rgba(255,255,255,.25)" style="display:none"/><g id="dots"></g><rect x="${pl}" y="${pt}" width="${W-pl-pr}" height="${H-pt-pb}" fill="transparent" class="hit"/></svg>`;
  host.innerHTML = s; const svg = host.querySelector('svg');
  const hit = svg.querySelector('.hit'), cur = svg.querySelector('#cur'), dots = svg.querySelector('#dots');
  hit.addEventListener('mousemove', e => {
    const r = svg.getBoundingClientRect(), vx = (e.clientX - r.left)/r.width*W; const i = Math.max(0, Math.min(n-1, Math.round((vx-pl)/((W-pl-pr)/(n-1||1)))));
    cur.style.display = ''; cur.setAttribute('x1', X(i)); cur.setAttribute('x2', X(i));
    dots.innerHTML = o.series.map(se => `<circle cx="${X(i)}" cy="${Y(se.vals[i])}" r="4.5" fill="${se.color}" stroke="#060606" stroke-width="2"/>`).join('');
    const sorted = o.series.map(se => ({se, v: se.vals[i]})).sort((a,b) => o.dirUp === false ? a.v-b.v : b.v-a.v);
    showTip(host, `<b>${shortDate(o.labels[i])}</b>` + sorted.map(x => `<div><i style="background:${x.se.color}"></i>${x.se.name}: ${o.fmt(x.v)}${o.unit?' '+o.unit:''}</div>`).join(''), X(i)/W*host.clientWidth, Y(sorted[0].v)/H*svg.getBoundingClientRect().height);
  });
  hit.addEventListener('mouseleave', () => { cur.style.display = 'none'; dots.innerHTML = ''; hideTip(host); });
}

function barH(host, o){
  const W = 640, rowH = 44, H = o.items.length*rowH + 10, pl = 118, pr = 78;
  const max = Math.max(...o.items.map(i => i.val), o.goal||0) * 1.12;
  const X = v => pl + (W-pl-pr) * v/max;
  let s = `<svg viewBox="0 0 ${W} ${H+16}" role="img" aria-label="${o.aria||'Comparativo entre hubs'}">`;
  o.items.forEach((it,i) => {
    const y = 6 + i*rowH;
    s += `<text class="lab" x="0" y="${y+20}">${it.name}</text><rect x="${pl}" y="${y+6}" width="${W-pl-pr}" height="22" rx="8" fill="rgba(255,255,255,.04)"/>`
      + `<rect class="bar" style="animation-delay:${i*.07}s" x="${pl}" y="${y+6}" width="${Math.max(4,X(it.val)-pl)}" height="22" rx="8" fill="${it.color}" opacity=".92"/>`
      + `<text class="val" x="${X(it.val)+8}" y="${y+22}">${o.fmt(it.val)}</text><circle cx="${W-8}" cy="${y+17}" r="4.5" fill="var(--${it.st==='ok'?'lime':it.st==='wa'?'amber':'red'})"/>`;
  });
  if(o.goal != null) s += `<line class="tg" x1="${X(o.goal)}" x2="${X(o.goal)}" y1="0" y2="${H}"/><text x="${X(o.goal)}" y="${H+12}" text-anchor="middle" style="fill:var(--lime)">META ${o.fmt(o.goal)}</text>`;
  host.innerHTML = s + '</svg>';
}

function stacked(host, labels, series){       // series: [{name,color,vals}]
  const W = 640, H = 250, pl = 34, pr = 6, pt = 10, pb = 24, n = labels.length;
  const tot = labels.map((_,i) => series.reduce((a,s) => a + s.vals[i], 0)), max = Math.max(...tot, 1) * 1.1;
  const bw = (W-pl-pr)/n, Y = v => pt + (H-pt-pb)*(1 - v/max);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Erros por dia, por tipo">`;
  for(let i=0;i<=4;i++){ const v = max*i/4, y = Y(v); s += `<line class="gl" x1="${pl}" x2="${W-pr}" y1="${y}" y2="${y}"/><text x="${pl-6}" y="${y+3}" text-anchor="end">${Math.round(v)}</text>`; }
  labels.forEach((l,i) => {
    let acc = 0; const x = pl + i*bw + bw*.16, w = bw*.68;
    series.forEach(se => { const v = se.vals[i]; if(!v) return; const y1 = Y(acc+v), y0 = Y(acc); s += `<rect class="barv" style="animation-delay:${i*.02}s" x="${x}" y="${y1}" width="${w}" height="${Math.max(0,y0-y1-1)}" rx="2" fill="${se.color}"/>`; acc += v; });
    if(i % Math.ceil(n/8) === 0) s += `<text x="${x+w/2}" y="${H-7}" text-anchor="middle">${shortDate(l)}</text>`;
    s += `<rect x="${pl+i*bw}" y="${pt}" width="${bw}" height="${H-pt-pb}" fill="transparent" data-i="${i}"/>`;
  });
  host.innerHTML = s + '</svg>';
  host.querySelectorAll('rect[data-i]').forEach(r => {
    r.addEventListener('mousemove', () => { const i = +r.dataset.i; const rect = host.querySelector('svg').getBoundingClientRect();
      showTip(host, `<b>${shortDate(labels[i])} · ${tot[i]} erros</b>` + series.map(se => `<div><i style="background:${se.color}"></i>${se.name}: ${se.vals[i]}</div>`).join(''), (pl+(i+.5)*bw)/W*rect.width, Y(tot[i])/H*rect.height); });
    r.addEventListener('mouseleave', () => hideTip(host));
  });
}

function spark(vals, color){
  const W = 120, H = 34, lo = Math.min(...vals), hi = Math.max(...vals), sp = (hi-lo)||1;
  const pts = vals.map((v,i) => [i/(vals.length-1)*W, 3 + (H-6)*(1-(v-lo)/sp)]);
  return `<svg class="sp" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" points="${pts.map(p => p.join(',')).join(' ')}"/></svg>`;
}

/* ---------- dashboard ---------- */
function deltaHTML(k, cur, prev){
  const d = prev ? (cur-prev)/prev*100 : 0, up = D.targets[k].dir === 'up';
  const good = Math.abs(d) < .3 ? 'eq' : ((d > 0) === up ? 'up' : 'dn');
  return `<span class="dl ${good}">${Math.abs(d)<.3?'▬':d>0?'▲':'▼'} ${nf(Math.abs(d),1)}% <span style="color:var(--dim)">vs. período anterior</span></span>`;
}
function drawDashboard(first, quiet){
  if(!D) return;
  setTimeout(() => drawErros(false), 0);
  { const v = $('#v-dashboard'); if(v) v.classList.toggle('quiet', !!quiet); }
  const wx = $('#v-dashboard .wrapx'), vz = !D.days.length; if(wx) wx.classList.toggle('vazio', vz);
  if(vz){ const m = D.meta || {}; $('#dashVazio').innerHTML = m.reason === 'carregando' ? '<b>Atualizando os dados da operação…</b><span>Estamos buscando os números reais na API. Eles aparecem aqui assim que chegarem.</span>' : '<b>Sem dados reais para mostrar agora.</b><span>' + (m.msg || 'A API não respondeu.') + ' Nenhum número de exemplo é exibido; o painel tenta de novo sozinho.</span>'; return; }
  const sh = selHubs(), n = S.period;
  if(!sh.length) return;
  // chips
  $('#hubChips').innerHTML = D.hubs.map(h => `<button class="hchip ${S.sel.has(h.id)&&temDados(h.id)?'on':''} ${temDados(h.id)?'':'nodata'}" ${temDados(h.id)?'':'title="Sem dados ainda"'} style="--c:${h.color}" data-h="${h.id}"><i></i>${h.short}</button>`).join('');
  $$('#hubChips .hchip').forEach(b => b.onclick = () => toggleHub(b.dataset.h));
  $$('#periodSeg button').forEach(b => b.classList.toggle('on', !S.custom && +b.dataset.p === n));
  { const f = $('#dFrom'), t = $('#dTo'); if(f && D.days.length){ f.min = t.min = D.days[0]; f.max = t.max = D.days[D.days.length-1]; if(S.custom){ f.value = S.custom.from; t.value = S.custom.to; } else { f.value = winDays(n)[0] || ''; t.value = winDays(n).slice(-1)[0] || ''; } $('#perBox').classList.toggle('on', !!S.custom); } }
  // KPIs da rede (hubs selecionados)
  const cur = agg(sh.map(h => lastN(h.id,n))), prev = agg(sh.map(h => prevN(h.id,n)));
  const daily = KEYS.reduce((o,k) => (o[k] = [], o), {});
  for(let i=Math.min(n,wEnd());i>=1;i--){ const m = agg(sh.map(h => [D.byHub[h.id][wEnd()-i]])); m.erros = errRoll(sh.map(h => h.id), wEnd()-i); KEYS.forEach(k => daily[k].push(m[k] ?? daily[k][daily[k].length-1] ?? 0)); }
  $('#kpis').innerHTML = KEYS.map(k => { const T = D.targets[k], mu = 1, GL = gl(k,cur)*mu, st = status(k,cur[k],mu,cur), col = `var(--${st==='ok'?'lime':st==='wa'?'amber':'red'})`;
    const w = Math.max(8, Math.min(100, T.dir==='up' ? cur[k]/GL*100 : GL/cur[k]*100));
    return `<div class="card kpi" style="--k:${col};--w:${w}%"><small>${T.short}</small><strong>${fmtM(k,cur[k])}<u>${T.unit}</u></strong>${k==='prod' && !(escDias(sh,n,false) >= Math.max(3, sh.length*n/2) && escDias(sh,n,true) >= Math.max(3, sh.length*n/2)) ? '<span class="dl eq"><span style="color:var(--dim)">sem comparação: poucos dias com escala</span></span>' : deltaHTML(k,cur[k],prev[k])}${spark(daily[k],col)}<div class="meta">META ${T.dir==='up'?'≥':'≤'} ${fmtM(k,GL)} ${T.unit}${k==='erros' ? ' POR HUB · ' + cur.errTot + ' NO PERÍODO' : ''}</div></div>`; }).join('');
  // saúde por hub
  const all = hubsComDados().map(h => { const m = agg([lastN(h.id,n)]); return {h, m, sc: score(m)}; });
  const order = [...all].sort((a,b) => b.sc - a.sc);
  $('#hubCards').innerHTML = all.map(x => { const b = band(x.sc), len = 2*Math.PI*40*x.sc/100;
    return `<div class="card hub s-${b} ${S.sel.has(x.h.id)?'':'off'}" style="--c:${x.h.color}" data-h="${x.h.id}" title="Clique para incluir/excluir da comparação">
      <div class="t"><b><i></i>${x.h.short}</b><span class="rk">#${order.indexOf(x)+1}</span></div>
      <div class="ring"><svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="40"/><circle class="fg" cx="50" cy="50" r="40" style="--len:${len}"/></svg><div><strong>${x.sc}</strong><span>SAÚDE</span></div></div>
      <div class="ml"><div data-k="ped">Pedidos totais<b>${nf(x.m.ped,0)}</b></div>${KEYS.map(k => `<div class="s-${status(k,x.m[k],1,x.m)}" data-k="${k}">${D.targets[k].label.replace('Taxa de c','C').replace(' de processamento',' proc.').replace(' por semana','/sem')}<b><span class="dot"></span>${fmtM(k,x.m[k])}${k==='cancel'||k==='assert'?'%':k==='tempo'?'′':''}</b></div>`).join('')}</div></div>`; }).join('');
  $('#hubCards').insertAdjacentHTML('beforeend', D.hubs.filter(h => !temDados(h.id)).map(h => `<div class="card hub nodata-card" style="--c:${h.color}"><div class="t"><b><i></i>${h.short}</b></div><div class="nd"><strong>—</strong><span>SEM DADOS AINDA</span><p>Esta unidade ainda não tem pedidos na API.</p></div></div>`).join(''));
  $$('#hubCards .hub').forEach(c => c.onclick = () => toggleHub(c.dataset.h));
  // comparativo (abas + barras + linhas)
  $('#mTabs').innerHTML = KEYS.map(k => `<button class="${S.metric===k?'on':''}" data-k="${k}">${D.targets[k].label}</button>`).join('');
  $$('#mTabs button').forEach(b => b.onclick = () => { S.metric = b.dataset.k; drawDashboard(false); });
  const k = S.metric, T = D.targets[k];
  $('#mDefT').textContent = T.label + ' (' + T.unit + ')';
  $('#mDef').textContent = T.def + ' · ' + (T.dir==='up' ? 'quanto maior, melhor' : 'quanto menor, melhor');
  const items = sh.map(h => { const mm = agg([lastN(h.id,n)]), v = mm[k]; return {name:h.short, color:h.color, val:v, st:status(k,v,1,mm), tg:k==='prod' ? mm.pg : mm.tg}; }).sort((a,b) => T.dir==='up' ? b.val-a.val : a.val-b.val);
  const tgs = [...new Set(items.map(i => i.tg))], gSel = (k === 'tempo' || k === 'prod') ? (tgs.length === 1 ? tgs[0] : null) : T.goal;
  barH($('#cBar'), {items, goal:gSel, fmt:v => fmtM(k,v), aria:'Comparativo de '+T.label+' entre hubs'});
  const labels = winDays(n);
  lineChart($('#cLine'), {labels, goal:gSel, fmt:v => nf(v, T.dec), unit:T.unit, dirUp:T.dir==='up', aria:'Evolução diária de '+T.label,
    series: sh.map(h => ({id:h.id, name:h.short, color:h.color, vals: lastN(h.id,n).map((_,i,arr) => k === 'erros' ? errRoll([h.id], Math.max(0, wEnd()-n) + i) : agg([[arr[i]]])[k]).reduce((o,v) => (o.push(v ?? o[o.length-1] ?? 0), o), [])}))});
  $('#cLegend').innerHTML = sh.map(h => `<span><i style="background:${h.color}"></i>${h.short}</span>`).join('');
  // erros
  const nn = n, lbl = winDays(nn);
  stacked($('#cErr'), lbl, D.errTypes.map(t => ({name:t.name, color:t.color, vals: lbl.map((_,i) => sh.reduce((a,h) => a + lastN(h.id,nn)[i].errTipos[t.id], 0))})));
  $('#errLegend').innerHTML = D.errTypes.map(t => `<span><i style="background:${t.color}"></i>${t.name}</span>`).join('');
  const totT = D.errTypes.map(t => ({t, v: sh.reduce((a,h) => a + lastN(h.id,n).reduce((b,r) => b + r.errTipos[t.id], 0), 0)})), mx = Math.max(...totT.map(x => x.v), 1);
  $('#errRank').innerHTML = totT.sort((a,b) => b.v-a.v).map(x => `<div style="--c:${x.t.color}"><span>${x.t.name}</span><b>${x.v}</b><div class="bg"><i style="width:${x.v/mx*100}%"></i></div></div>`).join('');
  const hd = winDays(n), hmMax = Math.max(...sh.flatMap(h => hubRows(h.id,n).map(r => r.erros)), 1);
  $('#errHeat').innerHTML = `<table class="hm"><thead><tr><th></th>${hd.map(d => `<th>${d.slice(8)}</th>`).join('')}</tr></thead><tbody>` +
    sh.map(h => `<tr><td>${h.short}</td>${hubRows(h.id,n).map((r,i) => { const a = r.erros/hmMax; return `<td style="background:rgba(${Math.round(184+a*71)},${Math.round(244+a*11)},${Math.round(a*255)},${.1+a*.75});color:${a>.55?'#0a0d00':'#fff'};animation-delay:${i*.03}s" title="${shortDate(r.date)} · ${r.erros} erros">${r.erros}</td>`; }).join('')}</tr>`).join('') + '</tbody></table>';
  drawMaint(sh, n);
  // fluxo por hora
  hourly(sh, n);
  jarvis(first === true || !$('#jvText').dataset.plain);
  // pontos de atenção
  const att = []; sh.forEach(h => { const m = agg([lastN(h.id,n)]); KEYS.forEach(kk => { const g = gap(kk,m[kk],1,m); if(g > 0) att.push({h, kk, g, v:m[kk], m}); }); });
  att.sort((a,b) => b.g-a.g);
  $('#attn').innerHTML = att.slice(0,6).map(a => { const T = D.targets[a.kk]; return `<li class="s-${status(a.kk,a.v,1,a.m)}"><span class="ic"></span><div><b>${a.h.short}</b> · ${T.label}: <b>${fmtM(a.kk,a.v)} ${T.unit}</b><small>meta ${T.dir==='up'?'≥':'≤'} ${fmtM(a.kk,gl(a.kk,a.m))} · ${nf(a.g*100,0)}% fora da meta</small></div></li>`; }).join('') || '<li class="s-ok"><span class="ic"></span><div>Todos os hubs selecionados dentro da meta 🎯</div></li>';
}
function hrAt(id, hh, n){      // média por dia, na janela escolhida (hub + período); sem o detalhe diário, cai na média fixa do servidor
  const w = D.hourlyDia && D.hourlyDia[id] ? D.hourlyDia[id].slice(Math.max(0, wEnd()-n), wEnd()) : null;
  if(w){ const k = Math.max(1, w.length); return {pedidos: Math.round(w.reduce((a,d) => a + d.p[hh], 0)/k), pessoas: Math.round(w.reduce((a,d) => a + d.q[hh], 0)/k)}; }
  const x = D.hourly && D.hourly[id] && D.hourly[id][hh]; return x ? {pedidos:x.pedidos, pessoas:x.pessoas} : {pedidos:0, pessoas:0};
}
function hourly(sh, n){
  const host = $('#cHour'), hrs = [...Array(14)].map((_,i) => i+10);
  const ped = hrs.map(h => sh.reduce((a,x) => a + hrAt(x.id,h,n).pedidos, 0)), pes = hrs.map(h => sh.reduce((a,x) => a + hrAt(x.id,h,n).pessoas, 0));
  const W = 640, H = 250, pl = 34, pr = 30, pt = 12, pb = 24, bw = (W-pl-pr)/hrs.length, mx = Math.max(...ped,1)*1.15, mp = Math.max(...pes,1)*1.3;
  const Y = v => pt + (H-pt-pb)*(1-v/mx), Yp = v => pt + (H-pt-pb)*(1-v/mp);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Pedidos por hora do dia e pessoas na escala">`;
  for(let i=0;i<=4;i++){ const v = mx*i/4; s += `<line class="gl" x1="${pl}" x2="${W-pr}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${pl-6}" y="${Y(v)+3}" text-anchor="end">${Math.round(v)}</text>`; }
  hrs.forEach((h,i) => { const x = pl + i*bw + bw*.14; s += `<rect class="barv" style="animation-delay:${i*.03}s" x="${x}" y="${Y(ped[i])}" width="${bw*.72}" height="${H-pb-Y(ped[i])}" rx="4" fill="var(--lime)" opacity=".85"/><text x="${x+bw*.36}" y="${H-7}" text-anchor="middle">${h}h</text><rect x="${pl+i*bw}" y="${pt}" width="${bw}" height="${H-pt-pb}" fill="transparent" data-i="${i}"/>`; });
  const pts = pes.map((v,i) => [pl+(i+.5)*bw, Yp(v)]); s += `<polyline class="ln" style="--l:${pathLen(pts)}" stroke="#ffffff" points="${pts.map(p => p.join(',')).join(' ')}"/>`;
  host.innerHTML = s + '</svg>';
  host.querySelectorAll('rect[data-i]').forEach(r => { r.addEventListener('mousemove', () => { const i = +r.dataset.i, rect = host.querySelector('svg').getBoundingClientRect();
    showTip(host, `<b>${hrs[i]}h</b><div><i style="background:var(--lime)"></i>Pedidos/h: ${ped[i]}</div><div><i style="background:#ffffff"></i>Pessoas na escala: ${pes[i]}</div><div>Produtividade: ${nf(ped[i]/Math.max(pes[i],1),2)}</div>`, (pl+(i+.5)*bw)/W*rect.width, Y(ped[i])/H*rect.height); });
    r.addEventListener('mouseleave', () => hideTip(host)); });
}
function toggleHub(id){ if(!temDados(id)) return; $('#jvText').dataset.plain = ''; if(S.sel.has(id)){ if(S.sel.size > 1) S.sel.delete(id); } else S.sel.add(id); drawDashboard(false); }


/* ---------- assistente: análise por regras sobre os dados do dashboard ---------- */
let jvTok = 0;
const cls = st => st==='bd' ? 'bad' : st==='wa' ? 'war' : '';
function analyze(sh, n){
  const rows = sh.map(h => { const m = agg([lastN(h.id,n)]), p = agg([prevN(h.id,n)]); return {h, m, p, sc: score(m)}; });
  const net = agg(sh.map(h => lastN(h.id,n))), netP = agg(sh.map(h => prevN(h.id,n)));
  const netScore = Math.round(rows.reduce((a,r) => a + r.sc, 0)/rows.length);
  const best = [...rows].sort((a,b) => b.sc-a.sc)[0], worst = [...rows].sort((a,b) => a.sc-b.sc)[0];
  return {rows, net, netP, netScore, best, worst};
}
function worstMetric(r){ return KEYS.map(k => ({k, g:gap(k,r.m[k],1,r.m)})).sort((a,b) => b.g-a.g)[0]; }
function errTop(h, n){ const t = D.errTypes.map(e => ({e, v: lastN(h.id,n).reduce((a,r) => a + r.errTipos[e.id], 0)})).sort((a,b) => b.v-a.v); const tot = t.reduce((a,x) => a + x.v, 0) || 1; return {name:t[0].e.name, pct:Math.round(t[0].v/tot*100)}; }
function peakGap(sh){   // hora com maior carga por pessoa, só nos dias com escala lançada (sem escala não há "por pessoa")
  let best = null;
  for(let h=10; h<24; h++){
    let p = 0, q = 0;
    sh.forEach(x => {
      const w = D.hourlyDia && D.hourlyDia[x.id] ? D.hourlyDia[x.id].slice(Math.max(0, wEnd()-S.period), wEnd()) : null;
      if(w) w.forEach(d => { const tot = d.q.reduce((a,b) => a + b, 0); if(tot > 0){ p += d.p[h]; q += d.q[h]; } });
    });
    if(q > 0 && (!best || p/q > best.r)) best = {h, r:p/q};
  }
  return best;
}
const escDias = (sh, n, prev) => sh.reduce((a,h) => a + (prev ? prevN(h.id,n) : lastN(h.id,n)).filter(r => r.cabecas > 0).length, 0);
function advice(r, n){
  const w = worstMetric(r), T = D.targets[w.k], tip = {
    cancel:'investigue os motivos de cancelamento por turno (ruptura de item? demora de preparo?) e revise a disponibilidade do cardápio.',
    assert:'reforce a conferência na expedição antes do fechamento do pedido; o tipo de erro mais comum é “' + errTop(r.h,n).name.toLowerCase() + '” (' + errTop(r.h,n).pct + '% dos erros).',
    tempo:'revise a distribuição de pessoas no pico e a ordem de preparo; tempo alto costuma indicar gargalo na bancada ou equipe curta no horário de maior volume.',
    prod:'a produtividade abaixo da meta sugere equipe superdimensionada para o volume (ou fluxo lento). Reavalie a escala dos turnos de menor movimento.',
    erros:'faça um alinhamento rápido com a equipe sobre os erros do dia anterior e cheque se o checklist de coleta está sendo seguido.'}[w.k];
  return {w, T, tip};
}

/* ---------- Manutenção dos hubs (dados reais, vêm da aba Compras → Manutenções) ---------- */
function manData(sh, n){
  if(!window.Manut) return null;
  const wd = winDays(n), r = Manut.resumo(n, wd[0], wd[wd.length-1], sh.map(h => h.id)); const items = sh.map(h => ({h, v:r.porHub[h.id] || 0}));
  return {r, items, tot: items.reduce((a,x) => a + x.v, 0)};
}
function drawMaint(sh, n){
  const host = $('#cMan'); if(!host) return;
  const d = manData(sh, n); if(!d) return;
  const avg = d.tot / Math.max(1, d.items.length);
  $('#manSub').textContent = S.custom ? brD(S.custom.from) + ' A ' + brD(S.custom.to) : 'ÚLTIMOS ' + n + ' DIAS';
  $('#manHint').textContent = d.tot ? d.tot + ' registro' + (d.tot>1?'s':'') + ' · ' + d.r.abertas + ' em aberto' : '';
  if(!d.tot){ host.innerHTML = '<div class="mn-empty">Nenhuma manutenção registrada neste período. Registre em Compras → Manutenções dos hubs.</div>'; $('#manRank').innerHTML = ''; return; }
  const items = d.items.map(x => ({name:x.h.short, color:x.h.color, val:x.v, st: x.v >= 3 && x.v >= avg*1.5 ? 'bad' : x.v > avg ? 'wa' : 'ok'})).sort((a,b) => b.val-a.val);
  barH(host, {items, fmt:v => String(v), aria:'Manutenções por hub'});
  const tp = Object.entries(d.r.porTipo).sort((a,b) => b[1]-a[1]).slice(0,6), mx = Math.max(...tp.map(x => x[1]), 1);
  $('#manRank').innerHTML = tp.map(([t,v]) => `<div style="--c:var(--lime)"><span>${t}</span><b>${v}</b><div class="bg"><i style="width:${v/mx*100}%"></i></div></div>`).join('');
}
function manLine(sh, n){
  const d = manData(sh, n); if(!d || !d.tot) return '';
  const top = [...d.items].sort((a,b) => b.v-a.v)[0], pct = Math.round(top.v/d.tot*100);
  const tp = Object.entries(d.r.porTipo).sort((a,b) => b[1]-a[1])[0];
  return `Em manutenção, <b>${top.h.short}</b> concentra <b>${top.v}</b> de ${d.tot} registros (${pct}%) no período (${n} dia${n>1?'s':''})${tp ? `, sobretudo <b>${tp[0].toLowerCase()}</b>` : ''}${d.r.abertas ? `. Há <b class="war">${d.r.abertas} em aberto</b>` : ''}. ${pct >= 50 && d.tot >= 3 ? 'Vale uma vistoria preventiva nesse hub.' : ''}`;
}
function briefing(){
  const sh = selHubs(), n = S.period, a = analyze(sh, n), nm = sh.length > 1 ? 'dos hubs selecionados' : 'do ' + sh[0].short;
  const L = []; const dN = (a.net.prod - a.netP.prod)/(a.netP.prod||1)*100;
  const eC = escDias(sh,n,false), eP = escDias(sh,n,true), tot = sh.length*n, confia = eC >= Math.max(3, tot/2) && eP >= Math.max(3, tot/2);   // só compara com o período anterior se ambos tiverem escala em metade dos dias ou mais
  const cob = eC < tot ? ` (média de ${eC} de ${tot} dias com escala lançada)` : '';
  L.push(`<p>Panorama ${S.custom ? 'do' : 'dos'} ${perTxt(n)} ${nm}: saúde operacional <b class="${cls(band(a.netScore))}">${a.netScore}/100</b>. A produtividade está em <b>${nf(a.net.prod,1)}</b> pedidos por pessoa ao dia${confia ? ` (${dN>=0?'+':''}${nf(dN,1)}% vs. período anterior)` : ' (sem variação: faltam dias com escala lançada para comparar)'}${cob} e o tempo médio de processamento é <b>${nf(a.net.tempo,1)} min</b>.</p>`);
  const items = [];
  if(sh.length > 1){
    items.push(`<b>${a.best.h.short}</b> lidera com índice ${a.best.sc}. <b class="${cls(band(a.worst.sc))}">${a.worst.h.short}</b> é o ponto mais frágil (${a.worst.sc}).`);
    const ad = advice(a.worst, n); items.push(`Em <b>${a.worst.h.short}</b>, ${ad.T.label.toLowerCase()} é o que mais pesa (${fmtM(ad.w.k,a.worst.m[ad.w.k])} ${ad.T.unit}, meta ${D.targets[ad.w.k].dir==='up'?'≥':'≤'} ${fmtM(ad.w.k,gl(ad.w.k,a.worst.m))}). Recomendo: ${ad.tip}`);
    const bad2 = a.rows.filter(r => r !== a.worst && band(r.sc) !== 'ok').sort((x,y) => x.sc-y.sc)[0];
    if(bad2){ const b2 = advice(bad2,n); items.push(`<b>${bad2.h.short}</b> também pede atenção em ${b2.T.label.toLowerCase()} (${fmtM(b2.w.k,bad2.m[b2.w.k])} ${b2.T.unit}).`); }
  } else { const ad = advice(a.rows[0], n), ok = band(a.rows[0].sc) === 'ok';
    items.push(ok ? 'Todos os indicadores estão perto da meta. Mantenha o ritmo e monitore a tendência dos próximos dias.' : `O principal desvio é ${ad.T.label.toLowerCase()} (${fmtM(ad.w.k,a.rows[0].m[ad.w.k])} ${ad.T.unit}). Recomendo: ${ad.tip}`); }
  const pk = peakGap(sh); if(pk) items.push(`O horário mais pressionado é às <b>${pk.h}h</b>, com ${nf(pk.r,1)} pedidos por pessoa na escala. Vale reforçar esse intervalo antes de aumentar a equipe no restante do dia.`);
  const best7 = lastN(sh[0].id, 7); const wk = {}; sh.forEach(h => lastN(h.id, Math.min(28,n*2)).forEach(r => { const d = new Date(r.date+'T12:00').getDay(); wk[d] = (wk[d]||0) + r.erros; }));
  const wd = Object.entries(wk).sort((x,y) => y[1]-x[1])[0]; if(wd) items.push(`Os erros se concentram às <b>${['domingos','segundas','terças','quartas','quintas','sextas','sábados'][wd[0]]}</b>; prepare um reforço de conferência nesse dia.`);
  const ml = manLine(sh, n); if(ml) items.push(ml);
  return {intro:L[0], items, speak: a.netScore, a};
}
function answer(q){
  q = q.toLowerCase(); const sh = selHubs(), n = S.period;
  if(q.includes('manuten')||q.includes('conserto')){ const ml = manLine(D.hubs, n); return {intro:'<p>Sobre manutenção dos hubs:</p>', items:[ml || 'Ainda não há manutenções registradas neste período. Registre em Compras → Manutenções dos hubs.']}; }
  const hub = hubsComDados().find(h => q.includes(h.short.toLowerCase()) || q.includes(h.name.toLowerCase()));
  const key = q.includes('cancel') ? 'cancel' : q.includes('assert') ? 'assert' : (q.includes('tempo')||q.includes('process')) ? 'tempo' : q.includes('produt') ? 'prod' : (q.includes('erro')) ? 'erros' : null;
  if(hub){ const m = agg([lastN(hub.id,n)]), r = {h:hub, m, sc:score(m)}, ad = advice(r,n);
    return {intro:`<p><b>${hub.name}</b>: índice de saúde <b class="${cls(band(r.sc))}">${r.sc}/100</b> nos últimos ${n} dias.</p>`, items: KEYS.map(k => `${D.targets[k].label}: <b class="${cls(status(k,m[k],1,m))}">${fmtM(k,m[k])} ${D.targets[k].unit}</b> (meta ${D.targets[k].dir==='up'?'≥':'≤'} ${fmtM(k,gl(k,m))})`).concat([band(r.sc)==='ok' ? 'Operação saudável; nada urgente.' : 'Prioridade: ' + ad.tip])}; }
  if(key){ const T = D.targets[key], list = hubsComDados().map(h => { const mm = agg([lastN(h.id,n)]); return {h, v:mm[key], m:mm}; }).sort((a,b) => T.dir==='up' ? b.v-a.v : a.v-b.v);
    return {intro:`<p><b>${T.label}</b> (${T.def.toLowerCase()}). Meta ${T.dir==='up'?'≥':'≤'} ${fmtM(key,T.goal)} ${T.unit}${key==='tempo'?' (Expedição: ≤ 3 min)':key==='prod'?' (Varandas: ≥ 25; Expedição: ≥ 30)':''}.</p>`, items: list.map((x,i) => `${i+1}º <b>${x.h.short}</b>: <b class="${cls(status(key,x.v,1,x.m))}">${fmtM(key,x.v)} ${T.unit}</b>`)}; }
  if(q.includes('agir')||q.includes('priorid')||q.includes('urgent')){ const a = analyze(D.hubs, n), top = a.rows.map(r => ({r, w:worstMetric(r)})).sort((x,y) => y.w.g-x.w.g).slice(0,3);
    return {intro:'<p>Onde eu agiria primeiro:</p>', items: top.map(x => { const ad = advice(x.r,n); return `<b>${x.r.h.short}</b> — ${ad.T.label.toLowerCase()} (${fmtM(ad.w.k,x.r.m[ad.w.k])} ${ad.T.unit}). ${ad.tip}`; })}; }
  if(q.includes('pior')||q.includes('fraco')){ const a = analyze(D.hubs, n); const ad = advice(a.worst,n); return {intro:`<p>O hub mais frágil é <b class="bad">${a.worst.h.name}</b> (índice ${a.worst.sc}).</p>`, items:[ad.tip]}; }
  if(q.includes('melhor')||q.includes('destaque')){ const a = analyze(D.hubs, n); return {intro:`<p>O destaque é <b>${a.best.h.name}</b> (índice ${a.best.sc}).</p>`, items:[`Produtividade ${nf(a.best.m.prod,2)} · cancelamento ${nf(a.best.m.cancel,1)}% · tempo ${nf(a.best.m.tempo,1)} min.`]}; }
  return briefing();
}
function say(res){
  const tok = ++jvTok, box = $('#jvText'), orb = $('#orb');
  const html = res.intro + '<ul style="padding:0">' + res.items.map(i => '<li>' + i + '</li>').join('') + '</ul>';
  box.innerHTML = ''; box.dataset.plain = (res.intro + ' ' + res.items.join('. ')).replace(/<[^>]+>/g,'');
  BR.talk(true); box.classList.add('caret');
  const tmp = document.createElement('div'); tmp.innerHTML = html; const total = tmp.textContent.length; let shown = 0;
  const walk = () => { if(tok !== jvTok) return; shown = Math.min(total, shown + 5); box.innerHTML = clip(html, shown); if(shown < total) setTimeout(walk, 14); else { box.classList.remove('caret'); BR.talk(false); } };
  walk();
}
function clip(html, n){        // corta o HTML mantendo as tags (efeito de digitação)
  let out = '', cnt = 0, i = 0, stack = [];
  while(i < html.length && cnt < n){
    if(html[i] === '<'){ const j = html.indexOf('>', i), tag = html.slice(i, j+1); out += tag; const m = tag.match(/^<(\/)?(\w+)/); if(m){ if(m[1]) stack.pop(); else if(!/\/>$/.test(tag)) stack.push(m[2]); } i = j+1; }
    else { out += html[i]; cnt++; i++; }
  }
  return out + stack.reverse().map(t => '</' + t + '>').join('');
}
/* ---------- James: cérebro em rede neural ---------- */
const BR = { big:null, small:null, talk(v){ if(this.big) this.big.talk(v); if(this.small) this.small.talk(v); } };
function initBrains(){
  if(BR.big || !window.Brain3D) return;
  const L = $('#brainL'), S = $('#orb');
  L.innerHTML = '<canvas aria-label="James, assistente da Central" role="img"></canvas>'; S.innerHTML = '<canvas aria-hidden="true"></canvas>';
  BR.big = Brain3D.mount(L.firstChild); BR.small = Brain3D.mount(S.firstChild, {small:true, start:2});
}
function drawFlow(sh){
  const a = analyze(sh, S.period), col = `var(--${band(a.netScore)==='ok'?'lime':band(a.netScore)==='wa'?'amber':'red'})`;
  initBrains();
  const best = a.best.h.short, worst = a.worst.h.short;
  $('#jvScore').innerHTML = `<div>SAÚDE DA REDE<strong style="color:${col}">${a.netScore}</strong></div><div>DESTAQUE<strong style="font-size:18px;color:#fff">${best}</strong></div><div>ATENÇÃO<strong style="font-size:18px;color:#fff">${worst}</strong></div>`;
}
function jarvis(first){
  const sh = selHubs(); drawFlow(sh);
  $('#jvChips').innerHTML = ['Resumo','Onde devo agir?','Pior hub','Melhor hub','Cancelamento','Tempo de processamento'].map(t => `<button type="button">${t}</button>`).join('');
  $$('#jvChips button').forEach(b => b.onclick = () => say(b.textContent === 'Resumo' ? briefing() : answer(b.textContent)));
  if(first) say(briefing());
}

function initJarvis(){
  $('#jvForm').addEventListener('submit', e => { e.preventDefault(); const v = $('#jvInput').value.trim(); if(v){ say(answer(v)); $('#jvInput').value = ''; } });
  $('#jvAgain').onclick = () => say(briefing());
}


function toastDash(t){ const p = $('#dataPill'); if(!p) return; const o = p.textContent; p.textContent = t; setTimeout(() => setPill(D && D.meta), 2600); }
/* ---------- tempo real: pílula de status + atualização automática ---------- */
function setPill(m){
  const p = $('#dataPill'), nt = $('#v-dashboard .note'); if(!p) return; m = m || {};
  if(m.live){
    p.classList.remove('demo'); p.classList.add('live');
    p.textContent = 'AO VIVO · ' + Dd.hm(m.atualizado || Date.now()) + (m.pendente ? ' · carregando histórico ' + m.carregados + '/' + m.total + ' dias' : '');
    if(nt) nt.innerHTML = '<b>Dados reais</b> da API Órion, atualizados automaticamente' + (m.aviso ? ' · <span style="color:var(--amber)">' + m.aviso + '</span>' : '') + (m.semHub ? ' · ' + m.semHub + ' registros sem hub reconhecido (veja o diagnóstico em /api/dash/probe)' : '') + (m.semEscala ? ' · ' + m.semEscala + ' dia(s) de hub sem escala lançada: pessoas estimadas em 1.' : '') + '.';
  } else {
    p.classList.add('demo'); p.classList.remove('live');
    const t = {'sem-token':'API NÃO CONFIGURADA', 'sessão':'FAÇA LOGIN PARA VER OS DADOS'}[m.reason] || 'API INDISPONÍVEL';
    if(m.reason === 'carregando'){ p.textContent = 'ATUALIZANDO…'; if(nt) nt.innerHTML = '<b>Atualizando</b> os dados da operação. Os números aparecem assim que a API responder.'; return; }
    p.textContent = 'SEM DADOS · ' + t;
    if(nt) nt.innerHTML = '<b>Sem dados reais agora.</b> ' + (m.msg ? 'Motivo: ' + m.msg + '. ' : '') + 'Nenhum número de exemplo é exibido; o painel tenta de novo sozinho.';
  }
}
let refT = null, lastSig = '';
const sigD = x => JSON.stringify([x.days, x.byHub, x.hourly, x.meta && x.meta.live, x.meta && x.meta.pendente]);   // só redesenha se os números mudaram
function agendaRefresh(){
  clearTimeout(refT);
  const m = (D && D.meta) || {}, rapido = m.pendente || (m.live === false && m.reason === 'carregando');
  refT = setTimeout(() => {
    if(document.hidden || $('#v-dashboard').hidden){ agendaRefresh(); return; }
    Dd.load().then(nd => { const mudou = sigD(nd) !== lastSig; D = nd; if(S.custom){ const a = D.days.indexOf(S.custom.from), b = D.days.indexOf(S.custom.to); if(a >= 0 && b >= 0){ S.period = b - a + 1; S.end = D.days.length - 1 - b; } } if(!S.sel.size) D.hubs.forEach(h => S.sel.add(h.id)); setPill(nd.meta); if(mudou){ lastSig = sigD(nd); drawDashboard(false, true); } agendaRefresh(); });
  }, rapido ? 12000 : 60000);
}

/* ---------- init ---------- */
document.addEventListener('DOMContentLoaded', () => {
  initShell();
  Dd.load().then(data => {
    D = data; D.hubs.forEach(h => S.sel.add(h.id)); initJarvis();
    $$('#periodSeg button').forEach(b => b.onclick = () => { S.period = +b.dataset.p; S.end = 0; S.custom = null; $('#jvText').dataset.plain = ''; drawDashboard(false); });
    const aplica = () => { const f = $('#dFrom').value, t = $('#dTo').value; if(!f || !t) return; let a = D.days.indexOf(f), b = D.days.indexOf(t);
      if(a < 0 || b < 0){ toastDash('Escolha datas dentro dos últimos ' + D.days.length + ' dias carregados.'); return; }
      if(a > b){ [a,b] = [b,a]; }
      S.period = b - a + 1; S.end = D.days.length - 1 - b; S.custom = {from:D.days[a], to:D.days[b]}; $('#jvText').dataset.plain = ''; drawDashboard(false); };
    $('#dFrom').onchange = aplica; $('#dTo').onchange = aplica;
    if(window.ComprasStore) ComprasStore.onChange(() => { if(window.CentralApp && D && !$('#v-dashboard').hidden) drawMaint(selHubs(), S.period); });
window.CentralApp = {go, get data(){return D},  agg, lastN, status, score, band, fmtM, nf, KEYS};
    setPill(D.meta); lastSig = sigD(D); agendaRefresh();
    const start = (location.hash.match(/#\/(\w+)/) || [])[1] || 'dashboard';
    go(start, false); if(start !== 'dashboard') drawDashboard(true);
  });
});

/* ---------- card explicativo ao passar o mouse nos indicadores dos cards de saúde ---------- */
(function(){
  let tip = null;
  const get = () => tip || (tip = Object.assign(document.createElement('div'), {className:'tip hubtip'}), document.body.appendChild(tip), tip);
  const SIT = {ok:['dentro da meta','var(--lime)'], wa:['perto da meta','var(--amber,#ffb020)'], bd:['fora da meta','var(--red,#ff5a4d)']};
  function html(hid, k){
    const h = D.hubs.find(x => x.id === hid), n = S.period, m = agg([lastN(hid, n)]), dias = lastN(hid, n).length;
    if(k === 'ped') return `<b>PEDIDOS TOTAIS · ${h.short}</b><p>Todos os pedidos criados no hub dentro do horário de funcionamento, cancelados incluídos.</p><div>Total no período: <em>${nf(m.ped,0)}</em></div><div>Média por dia: <em>${nf(m.ped/(dias||1),0)}</em></div>`;
    const T = D.targets[k], mu = k === 'erros' ? 1 : 1, g = gl(k, m), st = status(k, m[k], mu, m), sit = SIT[st] || SIT.ok;
    const meta = (T.dir === 'up' ? '≥ ' : (k === 'cancel' ? '< ' : '≤ ')) + nf(g, T.dec) + ' ' + T.unit;
    const ex = hid === 'exp', cancs = Math.round(m.cancel/100*m.ped), errs = Math.round((100-m.assert)/100*m.ped);
    const calc = {
      prod:   `Pedidos totais ÷ pessoas escaladas no dia (média dos dias com escala lançada).`,
      cancel: `Cancelados ÷ pedidos totais. No período: ${nf(cancs,0)} de ${nf(m.ped,0)} pedidos.`,
      assert: ex ? `1 − (erros reportados pelas lojas ÷ pedidos totais). No período: ${nf(errs,0)} erros em ${nf(m.ped,0)} pedidos.` : `1 − (pedidos cancelados por erro operacional ÷ pedidos totais). No período: ${nf(errs,0)} cancelados por erro em ${nf(m.ped,0)} pedidos.`,
      tempo:  `Pedido pronto para coleta − pedido criado, em média ponderada pelos pedidos de cada dia.`,
      erros:  ex ? `Erros reportados pelas lojas ÷ dias do período (${dias} dia${dias>1?'s':''}).` : `Pedidos cancelados por erro operacional ÷ dias do período (${dias} dia${dias>1?'s':''}).`
    }[k];
    return `<b>${T.label.toUpperCase()} · ${h.short}</b><p>${calc}</p><div>Atual: <em>${fmtM(k, m[k])} ${T.unit}</em></div><div>Meta: <em>${meta}</em></div><div><i style="background:${sit[1]}"></i>${m[k] == null ? 'sem dados no período' : sit[0]}</div>`;
  }
  function pos(e){ const t = get(), w = t.offsetWidth, hh = t.offsetHeight; let x = e.clientX + 16, y = e.clientY - hh - 14;
    if(x + w > innerWidth - 8) x = e.clientX - w - 16; if(y < 8) y = e.clientY + 18; t.style.left = Math.max(8, x) + 'px'; t.style.top = y + 'px'; }
  document.addEventListener('DOMContentLoaded', () => {
    const box = $('#hubCards'); if(!box) return;
    box.addEventListener('mouseover', e => { const r = e.target.closest('.ml > div[data-k]'); if(!r || !D) return; const c = r.closest('.hub'); if(!c || !c.dataset.h) return;
      const t = get(); t.innerHTML = html(c.dataset.h, r.dataset.k); t.classList.add('on'); pos(e); });
    box.addEventListener('mousemove', e => { if(tip && tip.classList.contains('on')) pos(e); });
    box.addEventListener('mouseout', e => { const r = e.target.closest('.ml > div[data-k]'); if(r && tip && !(e.relatedTarget && r.contains(e.relatedTarget))) tip.classList.remove('on'); });
  });
})();

/* ---------- registro de erros (diário permanente) ---------- */
const ER = {key:'', data:null, f:{tipo:'', loja:'', q:''}, t:null};
const escH = v => String(v ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const hubNome = id => id ? ((D.hubs.find(h => h.id === id) || {}).short || id) : 'Hub não mapeado';
const dtBR = iso => iso ? iso.slice(8,10) + '/' + iso.slice(5,7) + ' ' + iso.slice(11,16) : '—';
function errosFiltrados(){
  const d = ER.data; if(!d) return [];
  const q = ER.f.q.trim().toLowerCase();
  return d.registros.filter(r => (!r.hub || S.sel.has(r.hub)) && (!ER.f.tipo || r.tipo === ER.f.tipo) && (!ER.f.loja || r.hub === ER.f.loja)
    && (!q || [r.reportadoPor, r.produto, r.troca, r.comentario, r.pedidoRef, r.unidade].join(' ').toLowerCase().includes(q)));
}
function drawErros(force){
  if(!D || !D.days || !D.days.length || !$('#elBody')) return;
  const dias = winDays(S.period); if(!dias.length) return;
  const de = dias[0], ate = dias[dias.length-1], key = de + '|' + ate + '|' + ((D.meta && D.meta.atualizado) || '');
  if(!force && key === ER.key){ renderErros(); return; }
  ER.key = key; clearTimeout(ER.t);
  fetch('/api/dash/erros?conferir=1&de=' + de + '&ate=' + ate, {credentials:'same-origin'}).then(r => r.ok ? r.json() : Promise.reject()).then(j => {
    if(ER.key !== key) return;          // resposta de um filtro antigo: ignora
    ER.data = j; renderErros();
    if(j.diasSemRegistro && j.diasSemRegistro.length) ER.t = setTimeout(() => drawErros(true), 25000);       // diário ainda sendo completado
  }).catch(() => { $('#elInfo').textContent = 'Não foi possível carregar o registro de erros agora.'; });
}

/* ---------- seletor próprio (mesma paleta; o nativo usa o azul do sistema) ---------- */
function ddSync(sel){
  if(!sel) return; let w = sel.nextElementSibling; if(!w || !w.classList.contains('dd')){ sel.style.display = 'none'; w = document.createElement('div'); w.className = 'dd'; w.innerHTML = '<button type="button" class="ddb"></button><div class="ddm"></div>'; sel.after(w);
    w.querySelector('.ddb').onclick = e => { e.stopPropagation(); const o = w.classList.contains('open'); $$('.dd.open').forEach(x => x.classList.remove('open')); if(!o) w.classList.add('open'); };
    document.addEventListener('click', () => w.classList.remove('open')); }
  const cur = sel.options[sel.selectedIndex];
  w.querySelector('.ddb').textContent = cur ? cur.textContent : '';
  const m = w.querySelector('.ddm'); m.innerHTML = [...sel.options].map(o => `<div class="ddi${o.value === sel.value ? ' on' : ''}" data-v="${escH(o.value)}">${escH(o.textContent)}</div>`).join('');
  m.querySelectorAll('.ddi').forEach(i => i.onclick = e => { e.stopPropagation(); sel.value = i.dataset.v; w.classList.remove('open'); sel.dispatchEvent(new Event('change')); ddSync(sel); });
}
const limpaMotivo = t => String(t || '').replace(/^Cancelamento realizado pelo motivo de:\s*/i, '').replace(/\s*Cliente considerado fraudulento\?.*$/i, '').replace(/\s+/g, ' ').trim();
const MOT = {order__missing_item:'Item faltando no pedido', order__order_late:'Pedido atrasado', CUSTOMER_NOT_FOUND:'Cliente não encontrado'};
const orig = r => r.origem === 'cancelamento' ? 'cancelamento' : 'loja';
function renderErros(){
  const d = ER.data; if(!d) return; const all = d.registros.filter(r => !r.hub || S.sel.has(r.hub)), rows = errosFiltrados();
  const por = (f, src) => src.reduce((o, r) => { const k = f(r) || '(vazio)'; o[k] = (o[k] || 0) + 1; return o; }, {});
  const nomeOrig = r => r.origem === 'cancelamento' ? hubNome(r.hub) : (r.reportadoPor || '—');
  const hubs = Object.entries(por(r => hubNome(r.hub), all)).sort((a,b) => b[1]-a[1]);
  const cf = d.conferencia, pend = (d.diasSemRegistro || []).length;
  $('#elInfo').innerHTML = `<div class="elkpi"><div><strong>${all.length}</strong><span>erros no período</span></div>` + hubs.map(([h,n]) => `<div><strong>${n}</strong><span>${escH(h)}</span></div>`).join('') + '</div>'
    + `<p class="elnote"><b>Expedição:</b> erros abertos pelas lojas parceiras no portal da Órion. <b>Varandas:</b> pedidos cancelados por erro de montagem (item faltante, errado, trocado ou não enviado).</p>`
    + `<p class="elnote dim">${brD(d.de)} a ${brD(d.ate)}` + (d.naoContados ? ` · ${d.naoContados} registros documentados que não entram na conta (embalagem, qualidade e outros motivos)` : '') + (pend ? ` · <span class="wac">completando o diário: ${pend} dia(s) pendente(s)</span>` : cf ? (cf.confere ? ` · <span class="okc">✔ relatório de erros conferido com a API (${cf.totalDiario} de ${cf.totalApi})</span>` : ` · <span class="wac">diário com ${cf.totalDiario} de ${cf.totalApi} erros da API — atualizando</span>`) : '') + '</p>';
  const lj = Object.entries(por(nomeOrig, all)).sort((a,b) => b[1]-a[1]), mx = lj.length ? lj[0][1] : 1;
  $('#elRank').innerHTML = '<div class="elrt">Quem mais aparece</div>' + lj.slice(0, 8).map(([n,v]) => `<div class="r"><span>${escH(n)}</span><b>${v}</b><i style="width:${Math.max(5, v/mx*100)}%"></i></div>`).join('');
  const optT = '<option value="">Todos os tipos</option>' + D.errTypes.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  const hubIds = [...new Set(all.map(r => r.hub).filter(Boolean))].sort((a,b) => hubNome(a).localeCompare(hubNome(b)));      // origem = só os hubs
  if(ER.f.loja && !hubIds.includes(ER.f.loja)) ER.f.loja = '';
  const optL = '<option value="">Todos os hubs</option>' + hubIds.map(id => `<option value="${id}">${escH(hubNome(id))}</option>`).join('');
  const sT = $('#elTipo'), sL = $('#elLoja'); if(sT.options.length !== D.errTypes.length + 1) sT.innerHTML = optT; if(sL.dataset.n !== hubIds.join(',')){ sL.innerHTML = optL; sL.dataset.n = hubIds.join(','); }
  sT.value = ER.f.tipo; sL.value = ER.f.loja; ddSync(sT); ddSync(sL);
  const tn = Object.fromEntries(D.errTypes.map(t => [t.id, t]));
  const lista = rows;
  $('#elBody').innerHTML = lista.slice(0, 300).map(r => { const t = tn[r.tipo] || {name:r.tipo, color:'#888'}, canc = r.origem === 'cancelamento', hc = (D.hubs.find(h => h.id === r.hub) || {}).color || '#888';
    const txt = canc ? (MOT[r.comentario] || limpaMotivo(r.comentario) || 'Sem descrição') : (r.comentario || 'Sem descrição');
    return `<div class="erow">
      <div class="ec-when"><b>${dtBR(r.reportadoEm).slice(0,5)}</b><span>${dtBR(r.reportadoEm).slice(6)}</span></div>
      <div class="ec-org"><b><i style="background:${hc}"></i>${escH(nomeOrig(r))}</b><span>${canc ? 'Cancelamento por erro' : 'Reportado pela loja · ' + escH(hubNome(r.hub))}</span></div>
      <div class="ec-tipo"><span class="tg" style="color:${t.color};border-color:${t.color}">${escH(t.name)}</span></div>
      <div class="ec-txt">${r.produto ? '<b>' + escH(r.produto) + '</b>' : ''}${r.troca ? '<em>enviado no lugar: <u>' + escH(r.troca) + '</u></em>' : ''}<p>${escH(txt)}</p>${r.conclusao ? '<em>Conclusão: ' + escH(r.conclusao) + '</em>' : ''}</div>
      <div class="ec-ped"><b>${r.pedidoRef ? '#' + escH(r.pedidoRef) : '—'}</b><span>${r.pedidoTotal != null ? 'R$ ' + nf(r.pedidoTotal, 2) : ''}</span><span>${r.pedidoCriadoEm ? 'pedido de ' + dtBR(r.pedidoCriadoEm).slice(0,5) : ''}</span></div></div>`; }).join('') || '<div class="eempty">Nenhum erro com esses filtros.</div>';
  $('#elFoot').textContent = lista.length > 300 ? `Mostrando 300 de ${lista.length}. Use os filtros ou baixe o CSV para ver todos.` : `${lista.length} registro${lista.length===1?'':'s'} listado${lista.length===1?'':'s'}.`;
}
document.addEventListener('DOMContentLoaded', () => {
  const on = (id, ev, fn) => { const e = $(id); if(e) e.addEventListener(ev, fn); };
  on('#elTipo', 'change', e => { ER.f.tipo = e.target.value; renderErros(); });
  on('#elLoja', 'change', e => { ER.f.loja = e.target.value; renderErros(); });
  on('#elQ', 'input', e => { ER.f.q = e.target.value; renderErros(); });
  on('#elCsv', 'click', () => {
    const rows = errosFiltrados(), cols = ['dia','reportadoEm','reportadoPor','negocio','unidade','hubApi','hub','tipo','produto','troca','trocaAutorizada','perdaFinanceira','comentario','conclusao','finalizadoEm','pedidoRef','pedidoId','pedidoTotal','pedidoCriadoEm','pedidoCanceladoEm','id'];
    const q = v => '"' + String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
    const csv = '﻿' + cols.join(';') + '\n' + rows.map(r => cols.map(c => q(r[c])).join(';')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'})); a.download = 'erros-orion-' + (ER.data ? ER.data.de + '_a_' + ER.data.ate : 'periodo') + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
});
})();
