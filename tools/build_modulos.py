#!/usr/bin/env python3
"""Converte as páginas do ponto em módulos nativos da Central (sem iframe).
Cada página vira um módulo JS que monta o HTML/CSS num Shadow DOM da própria página da Central
e roda o JS original com `document`, `location` e `history` apontando para o módulo.
Uso: python3 tools/build_modulos.py   (gera public/orion/mod/*.js)"""
import re, json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, 'public')
OUT = os.path.join(PUB, 'orion', 'mod')
MODS = [  # nome, arquivo html, scripts extras
    ('painel', 'painel.html', ['freela-admin.js']),
    ('alertas', 'central.html', []),
    ('equipe', 'equipe-links.html', []),
    ('acomp', 'acompanhar.html', []),
]
FUSION = open(os.path.join(ROOT, 'tools', 'fusion.css'), encoding='utf-8').read()
OVERRIDE_OLD = ':host{--amb:#d9ddcf;--ambbg:rgba(217,221,207,.10);--blue:#ffffff;--bluebg:rgba(255,255,255,.08);--vio:#9aa39a;--viobg:rgba(154,163,154,.12)}\n.__body{background:transparent !important;min-height:0 !important}\n'

def css_scope(css):
    css = re.sub(r':root\b', ':host', css)
    css = re.sub(r'(^|[},\s])html(?=[\s{,.:>\[])', r'\1:host', css)
    css = re.sub(r'(^|[},\s])body(?=[\s{,.:>\[])', r'\1.__body', css)
    return css

def rewrite_handlers(text, mod, fnames):
    def fix_value(v):
        v = re.sub(r"location\.href\s*=\s*'([^']*)'", r"__M.nav('\1')", v)
        for n in fnames:
            v = re.sub(r'(?<![\w.$])' + n + r'\(', '__M.%s.%s(' % (mod, n), v)
        return v
    return re.sub(r'(\bon[a-z]+=)"([^"]*)"', lambda m: m.group(1) + '"' + fix_value(m.group(2)) + '"', text)

def anchors(text):
    text = re.sub(r'href="#(\w+)"', r'href="#" data-scroll="\1"', text)
    text = text.replace('href="/painel.html"', 'href="#/ponto"').replace('href="/central.html"', 'href="#/alertas"')
    return text

for mod, fname, extras in MODS:
    src = open(os.path.join(PUB, fname), encoding='utf-8').read()
    css = css_scope('\n'.join(re.findall(r'<style[^>]*>(.*?)</style>', src, re.S)))
    body = re.search(r'<body[^>]*>(.*)</body>', src, re.S).group(1)
    body = re.sub(r'<script\b.*?</script>', '', body, flags=re.S)
    js = '\n'.join(s for s in re.findall(r'<script>(.*?)</script>', src, re.S) if 'embed=1' not in s)
    for e in extras:
        js += '\n;\n' + open(os.path.join(PUB, e), encoding='utf-8').read()
    fnames = sorted(set(re.findall(r'(?:^|\n)\s*(?:async\s+)?function\s+(\w+)', js)))
    body = anchors(rewrite_handlers(body, mod, fnames))
    js = anchors(rewrite_handlers(js, mod, fnames))
    expose = ','.join("%s:typeof %s==='function'?%s:undefined" % (n, n, n) for n in fnames)
    out = f"""/* GERADO por tools/build_modulos.py a partir de public/{fname}. Não edite à mão. */
(function(){{
  const NAME={json.dumps(mod)}, host=document.getElementById('mod-'+NAME);
  if(!host || host.__mounted) return; host.__mounted = true;
  const root = host.shadowRoot || host.attachShadow({{mode:'open'}});
  root.innerHTML = '<style>'+{json.dumps(css + '\n' + FUSION)}+'</style><div class="__body">'+{json.dumps(body)}+'</div>';
  const M = (window.__M = window.__M || {{}}); M[NAME] = M[NAME] || {{}};
  const $b = () => root.querySelector('.__body');
  const docP = new Proxy(document, {{ get(t,p){{
    if(p==='getElementById') return id => root.getElementById(id);
    if(p==='querySelector') return s => root.querySelector(s);
    if(p==='querySelectorAll') return s => root.querySelectorAll(s);
    if(p==='body') return $b(); if(p==='documentElement') return host;
    const v = t[p]; return typeof v==='function' ? v.bind(t) : v; }} }});
  const locP = {{ get search(){{ return M[NAME+'_search'] || ''; }}, get href(){{ return location.href; }}, set href(v){{ M.nav(v); }}, pathname:'/', origin:location.origin, hash:'',
    replace(v){{ M.nav(v); }}, assign(v){{ M.nav(v); }}, reload(){{}} }};
  const histP = {{ replaceState(){{}}, pushState(){{}} }};
  root.addEventListener('click', e => {{ const a = e.target.closest && e.target.closest('[data-scroll]'); if(a){{ e.preventDefault(); const el = root.getElementById(a.dataset.scroll); if(el) el.scrollIntoView({{behavior:'smooth'}}); }} }});
  (function(document, location, history){{
{js}
    Object.assign(M[NAME], {{{expose}}});
  }})(docP, locP, histP);
}})();
"""
    open(os.path.join(OUT, mod + '.js'), 'w', encoding='utf-8').write(out)
    print(mod, len(out), 'bytes;', len(fnames), 'funções')
