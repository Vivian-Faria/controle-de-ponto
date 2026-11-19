/* ============ CENTRAL · módulos reais (mesmo site, mesmos dados) ============ */
(function(){
const $ = s => document.querySelector(s);
const E = '?embed=1';
const FRAMES = {
  ponto:     [['Painel de ponto', '/painel.html' + E]],
  alertas:   [['Central de alertas', '/central.html' + E], ['Links da equipe', '/equipe-links.html' + E]],
  escala:    [['Lançamento', '/escala/index.html' + E], ['Cadastros', '/escala/cadastros.html' + E]],
  presencas: [['Acompanhamento do dia', null]],
};
let acompanharUrl = null, ready = Promise.resolve();
const urlOf = (name, i) => { const u = FRAMES[name][i][1]; if(u) return u;
  return acompanharUrl ? acompanharUrl + (acompanharUrl.includes('?') ? '&' : '?') + 'embed=1' : null; };
function open(name, i){
  const v = $('#v-' + name), fr = v.querySelector('iframe'), ld = v.querySelector('.fv-load'), u = urlOf(name, i);
  v.querySelectorAll('.fv-tabs button').forEach((b,k) => b.classList.toggle('on', k === i));
  if(!u && name === 'presencas' && !open._retry){ ld.hidden = false; ld.textContent = 'Carregando…'; ready.then(() => { open._retry = true; open(name, i); open._retry = false; }); return; }
  if(!u){ ld.hidden = false; ld.textContent = 'Não foi possível gerar o link de acompanhamento. Entre novamente pela tela de acesso.'; return; }
  ld.hidden = false; ld.textContent = 'Carregando…'; fr.onload = () => { ld.hidden = true; }; fr.src = u;
}
function render(name){
  if(!FRAMES[name]) return;
  const v = $('#v-' + name), tabs = v.querySelector('.fv-tabs');
  if(FRAMES[name].length > 1){ tabs.hidden = false; tabs.innerHTML = FRAMES[name].map((t,i) => `<button type="button">${t[0]}</button>`).join(''); tabs.querySelectorAll('button').forEach((b,i) => b.onclick = () => open(name, i)); }
  open(name, 0);
}
window.CentralModules = { render };

/* sessão: o login é o mesmo do ponto (senha administrativa). Também pega o link do acompanhamento do dia. */
function gate(){
  ready = fetch('/api/alerta/equipe-links', {credentials:'same-origin', cache:'no-store'}).then(async r => {
    if(r.status === 401 || r.status === 403){ location.replace('/'); return; }
    document.body.classList.remove('locked');
    if(r.ok){ const j = await r.json().catch(() => ({})); acompanharUrl = j.acompanhar || null; if(acompanharUrl && $('#v-presencas iframe').src === '' ) { /* será aberto ao entrar na aba */ } }
  }).catch(() => document.body.classList.remove('locked'));   // sem rede/ambiente local: não trava a tela
  return ready;
}
document.addEventListener('DOMContentLoaded', () => {
  gate();
  const lo = $('#logout'); if(lo) lo.addEventListener('click', e => { e.preventDefault(); fetch('/api/logout', {credentials:'same-origin'}).finally(() => location.replace('/')); });
});
})();
