/* ============================================================
   DADOS DA CENTRAL — somente dados reais
   Tudo que os painéis mostram passa por CentralData.load(), que busca em /api/dash.
   Sem API, os painéis ficam vazios (nunca há dados de exemplo).
   ============================================================ */
(function(){
  const HUBS = [
    {id:'sion',  name:'Varanda Sion',        short:'Varanda Sion', color:'#b8f400', tempoGoal:7},
    {id:'cn',    name:'Varanda CN',          short:'Varanda CN', color:'#ffffff', tempoGoal:7},
    {id:'bur',   name:'Varanda Buritis',     short:'Buritis',     color:'#8a8e84', tempoGoal:7},
    {id:'cas',   name:'Varanda Castelo',     short:'Castelo',     color:'#4f8f00', tempoGoal:7},
    {id:'exp',   name:'Expedição Órion Sion',short:'Expedição',   color:'#7fe0a8', tempoGoal:3},
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
    cancel: {label:'Taxa de cancelamento', unit:'%',            dir:'down', goal:1.0, dec:1, short:'CANCELAMENTO',  def:'Cancelamentos ÷ pedidos totais'},
    assert: {label:'Assertividade',        unit:'%',            dir:'up',   goal:98.0,dec:1, short:'ASSERTIVIDADE', def:'Pedidos sem erro reportado ÷ pedidos totais'},
    tempo:  {label:'Tempo de processamento',unit:'min',         dir:'down', goal:7,   dec:1, short:'TEMPO DE PROC.',def:'Pedido pronto − pedido recebido (média)'},
    erros:  {label:'Erros por dia',        unit:'erros/dia',    dir:'down', goal:3,   dec:1, short:'ERROS / DIA',   def:'Erros reportados por dia'},
  };
  let ultimo = null;
  const hm = ms => new Date(ms).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  /* Dados reais: /api/dash (função do servidor que fala com a API admin; o token nunca chega ao navegador).
     Se a API não estiver configurada/acessível, devolve um conjunto VAZIO e o motivo. */
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
  function vazio(m){ const o = {hubs:HUBS, errTypes:ERR_TYPES, targets:TARGETS, days:[], byHub:{}, hourly:{}, meta:Object.assign({live:false}, m || {})};
    HUBS.forEach(h => { o.byHub[h.id] = []; o.hourly[h.id] = Array.from({length:24}, (_, i) => ({h:i, pedidos:0, pessoas:0})); }); return o; }
  window.CentralData = {
    HUBS, ERR_TYPES, TARGETS, hm,
    load(){
      return real().then(d => (ultimo = d)).catch(m => {
        if(m && m.live === false){ if(ultimo && m.reason !== 'sem-token') return Object.assign({}, ultimo, {meta: Object.assign({}, ultimo.meta, {aviso: m.msg})}); return vazio(m); }
        return vazio({reason:'erro', msg: String(m && m.message || m)});
      });
    },
  };
})();
