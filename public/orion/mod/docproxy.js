// Faz o código dos módulos (escala) enxergar o "document" do módulo dentro da Central (Shadow DOM).
// Se a página estiver aberta sozinha (fora da Central), devolve o document normal.
export function docFor(name){
  const host = document.getElementById('mod-' + name), root = host && host.shadowRoot;
  if(!root) return document;
  return new Proxy(document, { get(t, p){
    if(p === 'getElementById') return id => root.getElementById(id);
    if(p === 'querySelector') return s => root.querySelector(s);
    if(p === 'querySelectorAll') return s => root.querySelectorAll(s);
    if(p === 'body') return root.querySelector('.__body');
    if(p === 'documentElement') return root;
    if(p === 'activeElement') return root.activeElement;
    if(p === 'addEventListener') return (...a) => root.addEventListener(...a);
    if(p === 'removeEventListener') return (...a) => root.removeEventListener(...a);
    const v = t[p]; return typeof v === 'function' ? v.bind(t) : v; } });
}
