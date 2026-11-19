#!/usr/bin/env python3
"""Gera public/orion/mod/escala.js: monta Lançamento e Cadastros da escala dentro da Central (Shadow DOM, sem iframe)."""
import re, json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
E = os.path.join(ROOT, 'public', 'escala')
OUT = os.path.join(ROOT, 'public', 'orion', 'mod', 'escala.js')
def scope(css):
    css = re.sub(r':root\b', ':host', css)
    css = re.sub(r'(^|[},\s])html(?=[\s{,.:>\[])', r'\1:host', css)
    css = re.sub(r'(^|[},\s])body(?=[\s{,.:>\[])', r'\1.__body', css)
    return css
FUSION = open(os.path.join(ROOT, 'tools', 'fusion.css'), encoding='utf-8').read()
OVER = ':host{display:block}\n.__body{background:transparent !important;min-height:0 !important}\n.topo{display:none !important}\n'
css = scope(open(os.path.join(E, 'style.css'), encoding='utf-8').read())
def body_of(f):
    s = open(os.path.join(E, f), encoding='utf-8').read()
    b = re.search(r'<body[^>]*>(.*)</body>', s, re.S).group(1)
    return re.sub(r'<script\b.*?</script>', '', b, flags=re.S)
sup = ''
for f in ['custom-select.js', 'hora-mascara.js']:
    sup += '\n;(function(document){\n' + open(os.path.join(E, f), encoding='utf-8').read() + '\n})(__docP);\n'
out = f"""/* GERADO por tools/build_escala.py a partir de public/escala/. Não edite à mão. */
(function(){{
  const CSS = {json.dumps(css + '\n' + FUSION)};
  const HTML = {{'escala-lanc': {json.dumps(body_of('index.html'))}, 'escala-cad': {json.dumps(body_of('cadastros.html'))}}};
  const CLS = {{'escala-lanc':'', 'escala-cad':'pagina-cadastros'}};
  function build(name){{
    const host = document.getElementById('mod-' + name); if(host.shadowRoot) return host.shadowRoot;
    const root = host.attachShadow({{mode:'open'}});
    root.addEventListener('click', e => {{ const a = e.target.closest && e.target.closest('a[href]'); if(!a) return; const h = a.getAttribute('href') || ''; const tab = /cadastros\\.html/.test(h) ? 2 : /index\\.html/.test(h) ? 1 : 0; if(tab){{ e.preventDefault(); const b = document.querySelector('#v-escala .fv-tabs button:nth-child(' + tab + ')'); if(b) b.click(); }} }});
    root.innerHTML = '<style>' + CSS + '</style><div class="__body ' + CLS[name] + '">' + HTML[name] + '</div>';
    return root;
  }}
  function docProxy(root, host){{ return new Proxy(document, {{ get(t,p){{
    if(p==='getElementById') return id => root.getElementById(id);
    if(p==='querySelector') return s => root.querySelector(s);
    if(p==='querySelectorAll') return s => root.querySelectorAll(s);
    if(p==='body') return root.querySelector('.__body'); if(p==='documentElement') return root;
    if(p==='addEventListener') return (...a) => root.addEventListener(...a);
    if(p==='removeEventListener') return (...a) => root.removeEventListener(...a);
    const v = t[p]; return typeof v==='function' ? v.bind(t) : v; }} }}); }}
  function support(name, root){{ const __docP = docProxy(root);
{sup}
  }}
  async function mount(name, js){{
    const root = build(name); support(name, root);
    await import(js);
  }}
  window.CentralEscala = {{
    mountLancamento: () => mount('escala-lanc', '/escala/escala.js'),
    mountCadastros: () => mount('escala-cad', '/escala/cadastros.js'),
  }};
}})();
"""
open(OUT, 'w', encoding='utf-8').write(out)
print('escala.js', len(out), 'bytes')
