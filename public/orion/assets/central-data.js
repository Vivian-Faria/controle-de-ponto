/* ============================================================
   DADOS FICTÍCIOS DA CENTRAL
   Tudo que os painéis mostram passa por CentralData.load().
   Agora busca os dados reais em /api/dash; sem API, usa exemplos.
   ============================================================ */
(function(){
  const HUBS = [
    {id:'sion',  name:'Varanda Sion',        short:'Sion',        color:'#b8f400'},
    {id:'cn',    name:'Varanda Cidade Nova', short:'Cidade Nova', color:'#ffffff'},
    {id:'bur',   name:'Varanda Buritis',     short:'Buritis',     color:'#8a8e84'},
    {id:'cas',   name:'Varanda Castelo',     short:'Castelo',     color:'#4f8f00'},
    {id:'exp',   name:'Expedição Órion Sion',short:'Expedição',   color:'#7fe0a8'},
  ];
  const ERR_TYPES = [
    {id:'falt', name:'Item faltando',   color:'#b8f400'},
    {id:'troc', name:'Item trocado',    color:'#ffffff'},
    {id:'emb',  name:'Embalagem',       color:'#8a8e84'},
    {id:'atr',  name:'Atraso na coleta',color:'#3d6b00'},
  ];
  // metas (editáveis depois)
  const TARGETS = {
    prod:   {label:'Produtividade',        unit:'ped/h/pessoa', dir:'up',   goal:30, dec:1, short:'PRODUTIVIDADE', def:'Pedidos totais por hora de funcionamento ÷ pessoas na escala'},
    cancel: {label:'Taxa de cancelamento', unit:'%',            dir:'down', goal:3.0, dec:1, short:'CANCELAMENTO',  def:'Cancelamentos ÷ pedidos totais'},
    assert: {label:'Assertividade',        unit:'%',            dir:'up',   goal:98.0,dec:1, short:'ASSERTIVIDADE', def:'Pedidos sem erro reportado ÷ pedidos totais'},
    tempo:  {label:'Tempo de processamento',unit:'min',         dir:'down', goal:12,  dec:1, short:'TEMPO DE PROC.',def:'Pedido pronto − pedido recebido (média)'},
    erros:  {label:'Erros por dia',        unit:'erros/dia',    dir:'down', goal:6,   dec:1, short:'ERROS / DIA',   def:'Erros reportados por dia'},
  };
  // perfil de cada hub: [pedidos/dia, pessoas, cancel%, erro%, tempo, horasAbertas]
  const PROFILE = {sion:[420,9,2.6,1.3,10.8,12], cn:[360,8,3.8,2.1,13.4,12], bur:[300,7,2.9,1.6,11.9,11], cas:[250,6,4.4,2.7,14.6,11], exp:[520,12,1.9,0.9,9.2,13]};
  const HOUR_SHAPE = [0,0,0,0,0,0,0,0,0,0,.35,.8,1,.9,.55,.4,.5,.75,1.15,1.35,1.2,.8,.35,.1]; // fração do pico por hora

  function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
  const DAYS = 60;
  function build(){
    const today = new Date(); today.setHours(0,0,0,0);
    const out = {hubs:HUBS, errTypes:ERR_TYPES, targets:TARGETS, days:[], byHub:{}, hourly:{}};
    for(let i=DAYS-1;i>=0;i--){ const d = new Date(today); d.setDate(d.getDate()-i); out.days.push(d.toISOString().slice(0,10)); }
    HUBS.forEach((h,hi) => {
      const r = rng(1000 + hi*77), P = PROFILE[h.id]; const rows = [];
      out.days.forEach((iso,di) => {
        const dow = new Date(iso+'T12:00').getDay();
        const wk = [.78,.82,.9,.96,1.12,1.3,1.22][dow];            // sexta/sáb/dom mais fortes
        const trend = 1 + (di-DAYS)/DAYS*0.04 + Math.sin(di/6+hi)*0.04;
        const pedidos = Math.round(P[0]*wk*trend*(0.93+r()*0.14));
        const pessoas = Math.max(3, Math.round(P[1]*(0.85+wk*0.18) + (r()-.5)*1.6));
        const horas = P[5];
        const cancel = Math.round(pedidos*(P[2]/100)*(0.7+r()*0.6));
        const erTot = Math.max(0, Math.round(pedidos*(P[3]/100)*(0.55+r()*0.9)));
        const sp = [.38,.27,.2,.15]; const errs = {}; let left = erTot;
        ERR_TYPES.forEach((t,ti) => { const v = ti===3 ? left : Math.min(left, Math.round(erTot*sp[ti]*(0.7+r()*0.6))); errs[t.id] = v; left -= v; });
        const tempo = +(P[4]*(0.88+r()*0.26)*(1+(wk-1)*0.35)).toFixed(1);
        rows.push({date:iso,pedidos,pessoas,horas,cancel,erros:erTot,errTipos:errs,tempo});
      });
      out.byHub[h.id] = rows;
      out.hourly[h.id] = HOUR_SHAPE.map((f,hh) => ({h:hh, pedidos: Math.round(P[0]/ (P[5]*0.55) * f), pessoas: f===0?0:Math.max(2,Math.round(P[1]*(0.55+Math.min(f,1.1)*0.5)))}));
    });
    return out;
  }
  let mock = null, ultimo = null;
  const hm = ms => new Date(ms).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  /* Dados reais: /api/dash (função do servidor que fala com a API admin; o token nunca chega ao navegador).
     Se a API não estiver configurada/acessível, cai nos dados de exemplo e diz o motivo. */
  async function real(){
    const r = await fetch('/api/dash', {credentials:'same-origin', cache:'no-store'});
    const j = await r.json().catch(() => ({}));
    if(r.status === 200 && j.days && j.days.length){
      j.hubs = HUBS; j.errTypes = ERR_TYPES; j.targets = TARGETS; j.meta = j.meta || {}; j.meta.live = true; return j;
    }
    const m = {live:false, reason: r.status === 401 ? 'sessão' : r.status === 503 ? 'sem-token' : r.status === 202 ? 'carregando' : 'erro', msg: j.error || ('HTTP ' + r.status)};
    if(j.meta) m.progresso = j.meta;
    throw m;
  }
  function demo(m){ if(!mock) mock = build(); return Object.assign({}, mock, {meta: Object.assign({live:false}, m || {})}); }
  window.CentralData = {
    HUBS, ERR_TYPES, TARGETS, hm,
    load(){
      return real().then(d => (ultimo = d)).catch(m => {
        if(m && m.live === false){ if(ultimo && m.reason !== 'sem-token') return Object.assign({}, ultimo, {meta: Object.assign({}, ultimo.meta, {aviso: m.msg})}); return demo(m); }
        return demo({reason:'erro', msg: String(m && m.message || m)});
      });
    },
  };
})();
