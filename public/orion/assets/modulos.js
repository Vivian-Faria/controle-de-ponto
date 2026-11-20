/* ============ CENTRAL · módulos (código dos sistemas rodando dentro da própria Central) ============ */
(function(){
const $ = s => document.querySelector(s);
const M = (window.__M = window.__M || {});
M.nav = v => { v = String(v || '');
  if(/^\/painel(\.html)?/.test(v)) return CentralApp.go('ponto');
  if(/^\/central(\.html)?/.test(v)) return CentralApp.go('alertas');
  if(v === '/' || v === '') { location.replace('/'); return; }
  location.href = v; };

/* cada aba aponta para um módulo gerado em /orion/mod/ (ver tools/build_modulos.py) */
const VIEWS = {
  ponto:     [['Painel de ponto', 'painel']],
  alertas:   [['Central de alertas', 'alertas'], ['Links da equipe', 'equipe']],
  escala:    [['Lançamento', 'escala-lanc'], ['Cadastros', 'escala-cad']],
  presencas: [['Acompanhamento do dia', 'acomp']],
};
const loaded = {};
function loadScript(src){ return new Promise((ok, fail) => { const s = document.createElement('script'); if(src.endsWith('.mjs') || src.includes('type=module')) s.type = 'module'; s.src = src; s.onload = ok; s.onerror = () => fail(new Error('Falha ao carregar ' + src)); document.body.appendChild(s); }); }
let ready = Promise.resolve();
async function mount(key){
  if(loaded[key]) return loaded[key];
  return loaded[key] = (async () => {
    if(key === 'acomp'){ await ready; if(!M.acomp_search){ gate(); await ready; } if(!M.acomp_search) throw new Error('Não foi possível gerar o link de acompanhamento. Entre novamente pela tela de acesso.'); }
    if(key === 'escala-lanc' || key === 'escala-cad'){ if(!window.CentralEscala) await loadScript('mod/escala.js?v=' + (window.__V || 1)); return key === 'escala-lanc' ? window.CentralEscala.mountLancamento() : window.CentralEscala.mountCadastros(); }
    await loadScript('mod/' + key + '.js?v=' + (window.__V || 1));
  })().catch(e => { delete loaded[key]; throw e; });      // falha não fica guardada: ao reabrir a aba, tenta de novo
}
async function open(view, i){
  const v = $('#v-' + view), tabs = v.querySelector('.fv-tabs'), ld = v.querySelector('.fv-load'), list = VIEWS[view], key = list[i][1];
  tabs.querySelectorAll('button').forEach((b,k) => b.classList.toggle('on', k === i));
  v.querySelectorAll('.mod').forEach((m,k) => m.hidden = (k !== i));
  if(loaded[key]){ ld.hidden = true; return; }
  ld.hidden = false; ld.textContent = 'Carregando…';
  try{ await mount(key); ld.hidden = true; }catch(e){ ld.hidden = false; ld.textContent = e.message || 'Erro ao carregar o módulo.'; }
}
function render(name){
  const list = VIEWS[name]; if(!list) return;
  const tabs = $('#v-' + name + ' .fv-tabs');
  if(list.length > 1){ tabs.hidden = false; tabs.innerHTML = list.map(t => `<button type="button">${t[0]}</button>`).join(''); tabs.querySelectorAll('button').forEach((b,i) => b.onclick = () => open(name, i)); }
  open(name, 0);
}
window.CentralModules = { render };

/* sessão: mesmo login do ponto (senha administrativa). Também pega o link do acompanhamento do dia. */
function gate(){
  ready = fetch('/api/alerta/equipe-links', {credentials:'same-origin', cache:'no-store'}).then(async r => {
    if(r.status === 401 || r.status === 403){ location.replace('/'); return; }
    document.body.classList.remove('locked');
    if(r.ok){ const j = await r.json().catch(() => ({})); if(j.acompanhar){ try{ M.acomp_search = new URL(j.acompanhar).search; }catch(e){} } }
  }).catch(() => document.body.classList.remove('locked'));   // sem rede/ambiente local: não trava a tela
}
document.addEventListener('DOMContentLoaded', () => {
  gate();
  const lo = $('#logout'); if(lo) lo.addEventListener('click', e => { e.preventDefault(); fetch('/api/logout', {credentials:'same-origin'}).finally(() => location.replace('/')); });
});
})();
