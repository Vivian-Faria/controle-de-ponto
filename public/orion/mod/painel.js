/* GERADO por tools/build_modulos.py a partir de public/painel.html. Não edite à mão. */
(function(){
  const NAME="painel", host=document.getElementById('mod-'+NAME);
  if(!host || host.__mounted) return; host.__mounted = true;
  const root = host.shadowRoot || host.attachShadow({mode:'open'});
  root.innerHTML = '<style>'+"\n  :host{--bg:#050607;--card:#0c0f11;--tx:#f5f7f6;--mut:#8d95a3;--dim:#5d6572;--bd:rgba(255,255,255,.10);--bd2:rgba(255,255,255,.18);\n    --glass:linear-gradient(160deg,rgba(255,255,255,.06),rgba(255,255,255,.016));--pri:#baff1a;--limeglow:rgba(186,255,26,.38);\n    --red:#ff4a4a;--amb:#ffb62e;--grn:#baff1a;--blu:#8ab8ff;\n    --redbg:rgba(255,74,74,.12);--ambbg:rgba(255,182,46,.12);--grnbg:rgba(186,255,26,.10);--blubg:rgba(138,184,255,.12);\n    --disp:\"Space Grotesk\",\"Segoe UI\",system-ui,sans-serif;--body:\"Inter\",system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;--mono:ui-monospace,\"SF Mono\",Menlo,Consolas,monospace}\n  *{box-sizing:border-box}\n  :host{color-scheme:dark}\n  .__body{margin:0;min-height:100vh;-webkit-font-smoothing:antialiased;overflow-x:hidden;font-family:var(--body);color:var(--tx);\n    background:radial-gradient(900px 480px at 82% -10%,rgba(186,255,26,.11),transparent 62%),linear-gradient(rgba(255,255,255,.026) 1px,transparent 1px) 0 0/52px 52px,linear-gradient(90deg,rgba(255,255,255,.026) 1px,transparent 1px) 0 0/52px 52px,var(--bg);background-attachment:fixed}\n  .brand{display:flex;align-items:center;gap:10px;font:700 17px var(--disp);letter-spacing:.04em;margin:0;color:var(--tx)}\n  .brand svg{width:24px;height:24px;flex:none}.brand b{color:var(--pri)}\n  .sweep{transform-origin:16px 16px;animation:spin 3.2s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}\n  a{color:inherit}\n  input,select,button{font:inherit;color:var(--tx);border:1px solid var(--bd2);border-radius:99px;background:rgba(255,255,255,.04);outline:none;color-scheme:dark;transition:.2s}\n  input::placeholder{color:#6a7280}\n  input:focus,select:focus{border-color:var(--pri);box-shadow:0 0 0 3px rgba(186,255,26,.10)}\n  select option{background:#0c0f11;color:var(--tx)}\n  button{cursor:pointer;font-weight:700;background:var(--pri);border-color:var(--pri);color:#071000}\n  button:hover{background:#d4ff5e;border-color:#d4ff5e}\n  button.ghost{background:rgba(255,255,255,.05);color:var(--tx);border-color:var(--bd2);font-weight:600}button.ghost:hover{border-color:var(--pri);color:var(--pri);background:rgba(255,255,255,.05)}\n  button:disabled{opacity:.55;cursor:wait}\n  .chip{display:inline-block;border-radius:99px;font:600 11.5px var(--mono);letter-spacing:.04em;white-space:nowrap}\n  .__body{font-size:14px;line-height:1.5}\n  header{position:sticky;top:0;z-index:40;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;padding:12px 24px;background:rgba(7,9,10,.78);backdrop-filter:blur(16px);border-bottom:1px solid var(--bd)}\n  .ctl{display:flex;flex-wrap:wrap;gap:8px;align-items:center}\n  input,select{padding:9px 14px}\n  input[type=checkbox]{width:auto;padding:0;accent-color:var(--pri)}\n  button{padding:9px 16px;font-size:13.5px}\n  main{max-width:1240px;margin:0 auto;padding:22px 24px 70px}\n  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:22px}\n  .kpi{background:var(--glass);border:1px solid var(--bd);border-radius:22px;padding:18px 20px;backdrop-filter:blur(8px)}\n  .kpi{min-width:0;container-type:inline-size}\n  .kpi b{display:block;font:700 clamp(16px,12cqw,34px)/1.1 var(--disp);letter-spacing:-.03em;margin-top:6px;white-space:nowrap}\n  .kpi span{color:var(--mut);font:500 11px var(--mono);text-transform:uppercase;letter-spacing:.12em}\n  .neg{color:var(--red)}.pos{color:var(--grn)}\n  .wrap{overflow-x:auto;border-radius:22px;border:1px solid var(--bd);background:var(--glass);-webkit-overflow-scrolling:touch}\n  table{width:100%;border-collapse:collapse;background:transparent}\n  .wrap table{border:0}\n  th,td{padding:12px 14px;text-align:left;border-bottom:1px solid var(--bd)}\n  tr:last-child>td{border-bottom:0}\n  th{font:500 11px var(--mono);color:var(--mut);text-transform:uppercase;letter-spacing:.1em;cursor:pointer;user-select:none;white-space:nowrap;background:rgba(255,255,255,.025)}\n  tr.emp{cursor:pointer;transition:.15s}tr.emp:hover{background:rgba(186,255,26,.05)}\n  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}\n  .chip{padding:2px 10px}\n  .c-falta{background:var(--redbg);color:var(--red)}.c-atraso,.c-atrasado-sem-batida,.c-incompleto{background:var(--ambbg);color:var(--amb)}\n  .c-ok{background:var(--grnbg);color:var(--grn)}.c-trabalhou{background:var(--blubg);color:var(--blu)}.c-abonado,.c-feriado{background:var(--blubg);color:var(--blu)}\n  .c-folga,.c-futuro,.c-aguardando{background:rgba(255,255,255,.06);color:var(--mut)}\n  .detail td{background:rgba(0,0,0,.28);padding:0}.detail table{border:0;border-radius:0}.detail td,.detail th{padding:8px 14px;cursor:default}\n  #msg{padding:14px 18px;border-radius:18px;margin-bottom:16px;display:none}#msg.err{display:block;background:var(--redbg);color:var(--red);border:1px solid rgba(255,74,74,.3)}#msg.load{display:block;background:var(--blubg);color:var(--blu);border:1px solid rgba(138,184,255,.25)}\n  .tabs{display:flex;gap:6px;padding:12px 24px;overflow-x:auto;scrollbar-width:none;border-bottom:1px solid var(--bd)}.tabs::-webkit-scrollbar{display:none}\n  .tab{flex:none;background:rgba(255,255,255,.04);border:1px solid var(--bd);color:var(--mut);padding:9px 18px;font-weight:600;font-size:13.5px}\n  .tab:hover{color:var(--tx);background:rgba(255,255,255,.07);border-color:var(--bd2)}\n  .tab.on{background:var(--pri);color:#071000;border-color:var(--pri);box-shadow:0 0 28px -10px var(--limeglow)}\n  .days{display:flex;gap:4px}.days label{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid var(--bd2);border-radius:50%;cursor:pointer;font-size:11.5px;user-select:none;color:var(--mut)}\n  .days input{display:none}.days input:checked+span{background:var(--pri);color:#071000;font-weight:700;border-radius:50%;width:100%;height:100%;display:flex;align-items:center;justify-content:center}\n  .hrow input[type=time]{width:112px}.hrow input[type=number]{width:76px}.mini{padding:5px 12px;font-size:12px}\n  .ok2{color:var(--grn);font-size:12px}.hint{background:var(--blubg);color:#b9d3ff;padding:14px 18px;border-radius:20px;margin-bottom:14px;border:1px solid rgba(138,184,255,.2)}\n  .sec{margin:30px 0 12px;font:700 17px var(--disp);letter-spacing:-.01em}.bar{height:10px;border-radius:5px;background:linear-gradient(90deg,rgba(186,255,26,.5),var(--pri));min-width:2px;box-shadow:0 0 14px -4px var(--limeglow)}\n  .bars td{padding:8px 14px}.best{background:var(--grnbg)}.worst{background:var(--redbg)}.badge{display:inline-block;background:var(--blubg);color:var(--blu);border-radius:99px;padding:0 8px;font-size:11px;margin-left:6px}\n  .ins{background:var(--glass);border:1px solid var(--bd);border-radius:22px;padding:8px 22px;margin-bottom:6px}.ins li{margin:10px 0}\n  .bulk{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}\n  #login{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:99;padding:16px;\n    background:radial-gradient(800px 440px at 80% -10%,rgba(186,255,26,.13),transparent 62%),linear-gradient(rgba(255,255,255,.026) 1px,transparent 1px) 0 0/52px 52px,linear-gradient(90deg,rgba(255,255,255,.026) 1px,transparent 1px) 0 0/52px 52px,var(--bg)}\n  #login .box{background:var(--glass);border:1px solid var(--bd);border-radius:28px;padding:30px;width:min(390px,100%);display:flex;flex-direction:column;gap:14px;backdrop-filter:blur(12px);box-shadow:0 40px 80px -40px #000}\n  #login h2{margin:0}#login input,#login button{padding:14px 18px;font-size:15px}#lerr{color:var(--red);font-size:13px;min-height:18px}\n  .foot{color:var(--dim);font:11px var(--mono);letter-spacing:.06em;margin-top:16px}\n  @media(max-width:700px){\n    header{padding:12px 14px;gap:10px}.ctl{width:100%}.ctl input,.ctl select{flex:1 1 140px;min-width:0}\n    .tabs{padding:10px 14px}main{padding:16px 14px 60px}.kpis{grid-template-columns:1fr 1fr;gap:10px}.kpi{padding:14px 16px;border-radius:20px}\n    th,td{padding:10px 12px}\n  }\n\n/* FUS\u00c3O VISUAL \u2014 camada que faz os m\u00f3dulos (ponto, alertas, equipe, presen\u00e7as, escala) usarem o\n   mesmo design da Central: mesmas cores, fontes, cart\u00f5es e bot\u00f5es, sem cabe\u00e7alho/menu pr\u00f3prio e sem faixas de fundo.\n   Fonte \u00fanica: tools/fusion.css (embutida nos m\u00f3dulos por tools/build_modulos.py e tools/build_escala.py). */\n:host{display:block;\n  --lime:#b8f400;--pri:#b8f400;--grn:#b8f400;--acento:#b8f400;--acento2:#d6ff5e;--foco:#b8f400;--ok:#b8f400;--ok-fundo:rgba(184,244,0,.12);\n  --limeglow:rgba(184,244,0,.30);--limebg:rgba(184,244,0,.10);--grnbg:rgba(184,244,0,.10);\n  --amb:#d9ddcf;--ambbg:rgba(217,221,207,.10);--blue:#ffffff;--blu:#ffffff;--bluebg:rgba(255,255,255,.08);--blubg:rgba(255,255,255,.08);--vio:#9aa39a;--viobg:rgba(154,163,154,.12);\n  --glass:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.012));\n  --line:rgba(255,255,255,.10);--line2:rgba(255,255,255,.18);--bd:rgba(255,255,255,.10);--bd2:rgba(255,255,255,.18);\n  --tx:#f5f7f6;--mut:#8d95a3;--dim:#5d6572;--card:#0c0f0e;\n  --disp:\"Space Grotesk\",\"Segoe UI\",system-ui,sans-serif;--body:\"Inter\",system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;--mono:\"JetBrains Mono\",ui-monospace,Menlo,Consolas,monospace;\n  /* escala */\n  --papel:#070808;--superficie:#0d0f0e;--superficie2:#151816;--tinta:#f5f7f6;--grafite:#8d95a3;--nevoa:#5d6572;--linha:rgba(255,255,255,.10);--linha-forte:rgba(255,255,255,.20);\n  --fonte:\"Inter\",system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;--margem:0px;\n  color:var(--tx);font-family:var(--body)}\n.__body{background:transparent !important;min-height:0 !important;margin:0 !important;padding:0 !important;font-family:var(--body);overflow:visible !important;color:var(--tx)}\n.__body *{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.16) transparent}\n\n/* ---- sem cabe\u00e7alho / marca / navega\u00e7\u00e3o pr\u00f3prios: quem navega \u00e9 a Central ---- */\n.topo,.brand,.marca,.links,.topo-acoes,.hero .waves,.hero .orbit-wrap,.hero h1,.hero .cta,.hero .floats{display:none !important}\nheader:not(.hero){position:static !important;background:transparent !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;border:0 !important;padding:0 0 14px !important;margin:0 !important}\n.nav{display:block !important;position:static !important;margin:0 0 16px !important;padding:0 !important;max-width:none !important}\n.nav-in{background:var(--glass) !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;border:1px solid var(--line) !important;border-radius:18px !important;box-shadow:none !important;padding:10px 14px !important;justify-content:flex-end}\n.hero{display:block !important;position:static !important;margin:0 0 18px !important;padding:0 !important;overflow:visible !important;background:none !important;min-height:0 !important}\n.hero-g{display:block !important}\n.wrap{max-width:none !important;padding:0 !important;margin:0 !important}\nmain{max-width:none !important;gap:30px !important;padding:0 0 40px !important;margin:0 !important}\n.sec-h{margin-bottom:16px !important;gap:12px !important}\n.sec-h h2{font-size:clamp(20px,2vw,26px) !important;max-width:none !important;letter-spacing:-.02em !important}\n.sec-h p{max-width:420px !important;font-size:13px !important}\n.k{min-height:0 !important;border-radius:20px !important}\n.panel,.card{border-radius:20px !important}\n\n/* ---- barra de filtros do Ponto: um cart\u00e3o s\u00f3, igual aos da Central ---- */\nheader .ctl{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 14px;border:1px solid var(--line);border-radius:18px;background:var(--glass)}\nheader .ctl button:nth-last-child(-n+2){display:none !important}   /* \"Alertas\" e \"Sair\": j\u00e1 existem no menu da Central */\n.tabs .tab{font-family:var(--body)}\n\n/* ---- Presen\u00e7as: ocupa a tela toda, em grade, em vez da coluna estreita de celular ---- */\nmain:has(> .filtros){max-width:none !important;padding:0 0 40px !important;gap:16px !important}\n.filtros{position:static !important;margin:0 !important;padding:14px 16px !important;background:var(--glass) !important;border:1px solid var(--line) !important;border-radius:18px !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important}\n.filtros .row{max-width:560px}\n.filtros select,.filtros input[type=date]{font-size:14px !important;padding:10px 16px !important;min-height:0 !important}\n.comp{grid-template-columns:repeat(auto-fit,minmax(180px,1fr)) !important}\n.tc{border-radius:20px !important;padding:16px 12px 14px !important}\n#corpo{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px;align-items:start}\n#corpo>.card{grid-column:1/-1}\n.turno{background:var(--glass);border:1px solid var(--line);border-radius:20px;padding:16px 18px 18px}\n.turno h2{margin:0 0 12px !important;font-size:17px !important}\n.turno .p{border-radius:14px !important}\n.solo .lista{gap:8px}\n\n/* ---- Escala: seletor como cart\u00e3o, sem a faixa de largura total ---- */\n.seletor{background:var(--glass) !important;border:1px solid var(--line) !important;border-radius:18px !important;padding:14px 18px !important;margin:0 0 16px !important}\n.area{padding:0 0 60px !important}\n.lembrete{border-radius:16px !important}\n.status{z-index:60}\n\n/* ---- bot\u00f5es e campos no mesmo desenho da Central ---- */\n.__body button.ghost,.__body .ghost{border-radius:99px}\n.__body input:not([type=checkbox]):not([type=radio]),.__body select{font-family:var(--body)}\n.__body>.tabs{padding:0 0 14px !important;border-bottom:0 !important}\n"+'</style><div class="__body">'+"\n<div id=\"login\"><form class=\"box\" onsubmit=\"__M.painel.doLogin(event)\"><h2 class=\"brand\"><svg viewBox=\"0 0 32 32\" fill=\"none\"><circle cx=\"16\" cy=\"16\" r=\"13\" stroke=\"#baff1a\" stroke-opacity=\".4\" stroke-width=\"1.6\"/><circle cx=\"16\" cy=\"16\" r=\"7.5\" stroke=\"#baff1a\" stroke-opacity=\".6\" stroke-width=\"1.6\"/><g class=\"sweep\"><path d=\"M16 16 L28 10\" stroke=\"#baff1a\" stroke-width=\"2.2\" stroke-linecap=\"round\"/></g><circle cx=\"16\" cy=\"16\" r=\"2.6\" fill=\"#baff1a\"/></svg><span>PONTO<b>.</b></span></h2><span style=\"color:var(--mut)\">Digite a senha de acesso</span>\n  <input type=\"password\" id=\"pw\" placeholder=\"Senha\" autocomplete=\"current-password\" required><button type=\"submit\">Entrar</button><div id=\"lerr\"></div>\n  <a href=\"/\" style=\"display:block;margin-top:14px;text-align:center;color:var(--pri);font-weight:600;text-decoration:none\">\u00c9 freelancer? Registrar meu ponto \u2192</a></form></div>\n<header>\n  <h1 class=\"brand\"><svg viewBox=\"0 0 32 32\" fill=\"none\"><circle cx=\"16\" cy=\"16\" r=\"13\" stroke=\"#baff1a\" stroke-opacity=\".4\" stroke-width=\"1.6\"/><circle cx=\"16\" cy=\"16\" r=\"7.5\" stroke=\"#baff1a\" stroke-opacity=\".6\" stroke-width=\"1.6\"/><g class=\"sweep\"><path d=\"M16 16 L28 10\" stroke=\"#baff1a\" stroke-width=\"2.2\" stroke-linecap=\"round\"/></g><circle cx=\"16\" cy=\"16\" r=\"2.6\" fill=\"#baff1a\"/></svg><span>PAINEL DE PONTO<b>.</b></span></h1>\n  <div class=\"ctl\" id=\"ctl\">\n    <button class=\"ghost\" onclick=\"__M.painel.preset('hoje')\">Hoje</button>\n    <button class=\"ghost\" onclick=\"__M.painel.preset('semana')\">Semana</button>\n    <button class=\"ghost\" onclick=\"__M.painel.preset('mes')\">M\u00eas</button>\n    <input type=\"date\" id=\"d0\"> <span>at\u00e9</span> <input type=\"date\" id=\"d1\">\n    <select id=\"hubf\" onchange=\"__M.painel.render()\"><option value=\"\">Todos os hubs</option></select>\n    <input id=\"q\" placeholder=\"Buscar funcion\u00e1rio\u2026\" oninput=\"__M.painel.render()\">\n    <button onclick=\"__M.painel.load()\">Atualizar</button> <button class=\"ghost\" onclick=\"__M.nav('/central.html')\">\ud83d\udea8 Alertas</button> <button class=\"ghost\" onclick=\"__M.painel.logout()\">Sair</button>\n  </div>\n</header>\n<div class=\"tabs\"><button class=\"tab on\" id=\"t1\" onclick=\"__M.painel.showTab(1)\">Painel</button><button class=\"tab\" id=\"t3\" onclick=\"__M.painel.showTab(3)\">Hubs</button><button class=\"tab\" id=\"t2\" onclick=\"__M.painel.showTab(2)\">Hor\u00e1rios</button><button class=\"tab\" id=\"t4\" onclick=\"__M.painel.showTab(4)\">Freelancers</button></div>\n<main id=\"pg1\">\n  <div id=\"msg\"></div>\n  <div class=\"kpis\" id=\"kpis\"></div>\n  <div class=\"wrap\"><table id=\"tbl\"><thead><tr>\n    <th onclick=\"__M.painel.sortBy('name')\">Funcion\u00e1rio</th><th onclick=\"__M.painel.sortBy('absences')\" class=\"num\">Faltas</th>\n    <th onclick=\"__M.painel.sortBy('early')\" class=\"num\">Chegou cedo</th><th onclick=\"__M.painel.sortBy('late')\" class=\"num\">Atrasos</th><th onclick=\"__M.painel.sortBy('late_min')\" class=\"num\">Min. atraso</th>\n    <th onclick=\"__M.painel.sortBy('worked')\" class=\"num\">Trabalhado</th><th onclick=\"__M.painel.sortBy('expected')\" class=\"num\">Previsto</th>\n    <th onclick=\"__M.painel.sortBy('balance')\" class=\"num\">Saldo</th></tr></thead><tbody id=\"tb\"></tbody></table></div>\n  <div class=\"foot\" id=\"foot\"></div>\n</main>\n<main id=\"pg3\" style=\"display:none\">\n  <div id=\"hubmsg\" class=\"hint\">Cadastre o hub de cada pessoa na aba Hor\u00e1rios para ver os comparativos.</div>\n  <div class=\"sec\" style=\"margin-top:0\">Insights do per\u00edodo</div><div class=\"ins\"><ul id=\"ins\"></ul></div>\n  <div class=\"kpis\" id=\"hkpis\" style=\"margin-top:14px\"></div>\n  <div class=\"sec\">Comparativo entre hubs</div>\n  <div class=\"ctl\" style=\"margin-bottom:10px\">Ordenar/visualizar por: <select id=\"hmetric\" onchange=\"__M.painel.render3()\"></select></div>\n  <div class=\"wrap\"><table class=\"bars\"><tbody id=\"hbars\"></tbody></table></div>\n  <div class=\"wrap\" style=\"margin-top:14px\"><table><thead><tr><th>Hub</th><th class=\"num\">Pessoas</th><th class=\"num\">Faltas</th><th class=\"num\">Absente\u00edsmo</th><th class=\"num\">Atrasos</th><th class=\"num\">Pontualidade</th><th class=\"num\">Atraso m\u00e9dio/pessoa</th><th class=\"num\">Chegou cedo</th><th class=\"num\">Saldo total</th><th class=\"num\">Saldo m\u00e9dio/pessoa</th></tr></thead><tbody id=\"htab\"></tbody></table></div>\n  <div class=\"sec\">Comparativo entre colaboradores</div>\n  <div class=\"ctl\" style=\"margin-bottom:10px\">Hub: <select id=\"hsel\" onchange=\"__M.painel.render3()\"></select> Ordenar por: <select id=\"hsort\" onchange=\"__M.painel.render3()\">\n    <option value=\"late_min\">Mais minutos de atraso</option><option value=\"absences\">Mais faltas</option><option value=\"balance\">Menor saldo de horas</option><option value=\"name\">Nome</option></select></div>\n  <div class=\"wrap\"><table><thead><tr><th>Colaborador</th><th class=\"num\">Faltas</th><th class=\"num\">Atrasos</th><th class=\"num\">Min. atraso</th><th class=\"num\">Chegou cedo</th><th class=\"num\">Pontualidade</th><th class=\"num\">Saldo</th><th class=\"num\">Atraso vs m\u00e9dia do hub</th><th class=\"num\">Saldo vs m\u00e9dia do hub</th></tr></thead><tbody id=\"etab\"></tbody></table></div>\n  <div class=\"foot\">Absente\u00edsmo = faltas \u00f7 dias previstos. Pontualidade = dias sem atraso \u00f7 dias trabalhados. \"vs m\u00e9dia do hub\" compara cada pessoa com a m\u00e9dia do pr\u00f3prio hub.</div>\n</main>\n<main id=\"pg4\" style=\"display:none\"></main>\n<main id=\"pg2\" style=\"display:none\">\n  <div id=\"hmsg\" class=\"hint\" style=\"display:none;background:var(--redbg);color:var(--red)\"></div>\n  <div class=\"hint\">Para cada pessoa, escolha o <b>contrato</b>:<br>\n    <b>6x1</b> \u2014 marque os 6 dias de trabalho (1 folga), entrada e sa\u00edda.<br>\n    <b>12x36</b> \u2014 trabalha dia sim, dia n\u00e3o: informe um dia em que a pessoa trabalha (refer\u00eancia), entrada e sa\u00edda (aceita turno noturno, ex.: 19:00 \u00e0s 07:00).<br>\n    <b>Intermitente</b> \u2014 sem hor\u00e1rio fixo: o painel conta s\u00f3 as horas trabalhadas, sem falta, atraso ou saldo.</div>\n  <div class=\"ctl\" style=\"margin-bottom:12px\"><input id=\"hq\" placeholder=\"Buscar funcion\u00e1rio\u2026\" oninput=\"__M.painel.renderH()\"><span id=\"hcount\" style=\"color:var(--mut)\"></span>\n    <label style=\"display:flex;gap:6px;align-items:center;cursor:pointer\"><input type=\"checkbox\" id=\"showex\" onchange=\"__M.painel.renderH()\"> Mostrar exclu\u00eddos (<span id=\"excnt\">0</span>)</label></div>\n  <div class=\"bulk\">Definir hub para <b>todos os listados</b> (use a busca para filtrar): <input id=\"bulkhub\" list=\"hublist\" placeholder=\"Nome do hub\"> <button class=\"ghost mini\" onclick=\"__M.painel.bulkHub()\">Aplicar aos listados</button></div>\n  <datalist id=\"hublist\"></datalist>\n  <div class=\"wrap\"><table><thead><tr><th>Funcion\u00e1rio</th><th>Hub</th><th>Contrato</th><th>Dias / refer\u00eancia</th><th>Entrada</th><th>Sa\u00edda</th><th>Pausa (min)</th><th></th></tr></thead><tbody id=\"hb\"></tbody></table></div>\n  <div class=\"foot\">Salvo no armazenamento do Netlify (fica guardado mesmo com o seu computador desligado). \"Pausa\" \u00e9 o intervalo n\u00e3o remunerado descontado das horas previstas (deixe 0 se n\u00e3o houver).</div>\n</main>\n\n\n"+'</div>';
  const M = (window.__M = window.__M || {}); M[NAME] = M[NAME] || {};
  const $b = () => root.querySelector('.__body');
  const docP = new Proxy(document, { get(t,p){
    if(p==='getElementById') return id => root.getElementById(id);
    if(p==='querySelector') return s => root.querySelector(s);
    if(p==='querySelectorAll') return s => root.querySelectorAll(s);
    if(p==='body') return $b(); if(p==='documentElement') return host;
    const v = t[p]; return typeof v==='function' ? v.bind(t) : v; } });
  const locP = { get search(){ return M[NAME+'_search'] || ''; }, get href(){ return location.href; }, set href(v){ M.nav(v); }, pathname:'/', origin:location.origin, hash:'',
    replace(v){ M.nav(v); }, assign(v){ M.nav(v); }, reload(){} };
  const histP = { replaceState(){}, pushState(){} };
  root.addEventListener('click', e => { const a = e.target.closest && e.target.closest('[data-scroll]'); if(a){ e.preventDefault(); const el = root.getElementById(a.dataset.scroll); if(el) el.scrollIntoView({behavior:'smooth'}); } });
  (function(document, location, history){

const _fetch=window.fetch.bind(window);
window.fetch=async(u,o={})=>{const r=await _fetch(u,{credentials:'same-origin',...o});if(r.status===401&&!String(u).includes('/api/login'))showLogin();return r};
function showLogin(){document.getElementById('login').style.display='flex';setTimeout(()=>document.getElementById('pw').focus(),50)}
async function doLogin(ev){ev.preventDefault();const e=document.getElementById('lerr');e.textContent='';
  try{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.getElementById('pw').value})});const j=await r.json();
    if(!r.ok)throw new Error(j.error||'Erro');document.getElementById('pw').value='';document.getElementById('login').style.display='none';load()}catch(err){e.textContent=err.message}}
async function logout(){await fetch('/api/logout');showLogin()}
const $=id=>document.getElementById(id); let DATA=null, sort={k:'absences',dir:-1}, open=new Set();
const iso=d=>d.toISOString().slice(0,10), WD=['','Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const hm=m=>{const s=m<0?'-':'';m=Math.abs(Math.round(m));return s+String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')};
const LBL={trabalhou:'Trabalhou',ok:'OK',falta:'Falta',atraso:'Atraso','atrasado-sem-batida':'Não bateu (atrasado)',incompleto:'Saída sem batida',abonado:'Abonado',feriado:'Feriado',folga:'Folga',futuro:'—',aguardando:'Aguardando'};
function preset(p){const t=new Date();let a=new Date(t);
  if(p==='semana'){a.setDate(t.getDate()-((t.getDay()+6)%7))} if(p==='mes'){a=new Date(t.getFullYear(),t.getMonth(),1)}
  $('d0').value=iso(a);$('d1').value=iso(t);load()}
async function load(){
  $('msg').className='load';$('msg').textContent='Buscando pontos na Tangerino…';
  try{const r=await fetch(`/api/report?start=${$('d0').value}&end=${$('d1').value}`);const j=await r.json();
    if(!r.ok)throw new Error(j.error||r.status);DATA=j;$('msg').className='';fillHubs();render();render3()}
  catch(e){$('msg').className='err';$('msg').textContent='Erro: '+e.message}}
function sortBy(k){sort=sort.k===k?{k,dir:-sort.dir}:{k,dir:k==='name'?1:-1};render()}
function val(e,k){return k==='name'?e.name.toLowerCase():e.totals[k]}
function render(){if(!DATA)return;const q=$('q').value.toLowerCase();
  const hf=$('hubf').value;const list=DATA.employees.filter(e=>e.name.toLowerCase().includes(q)&&(!hf||(e.hub||'Sem hub')===hf)).sort((a,b)=>{const x=val(a,sort.k),y=val(b,sort.k);return (x>y?1:x<y?-1:0)*sort.dir});
  const S=k=>list.reduce((s,e)=>s+e.totals[k],0), bal=S('balance');
  $('kpis').innerHTML=[['Funcionários',list.length,''],['Faltas',S('absences'),S('absences')?'neg':''],['Chegaram cedo',S('early'),''],['Atrasos',S('late'),S('late')?'neg':''],
    ['Minutos de atraso',S('late_min'),''],['Saldo total',hm(bal),bal<0?'neg':'pos']].map(([l,v,c])=>`<div class="kpi"><span>${l}</span><b class="${c}">${v}</b></div>`).join('');
  $('tb').innerHTML=list.map(e=>{const t=e.totals,o=open.has(e.id);
    let h=`<tr class="emp" onclick="__M.painel.tog(${e.id})"><td><b>${o?'▾':'▸'} ${e.name}</b>${e.hub?`<span class="badge">${e.hub}</span>`:''}<br><small style="color:${e.custom?'var(--grn)':'var(--amb)'}">${e.custom?e.schedule:e.schedule+' (não cadastrado)'}</small></td>
    <td class="num ${t.absences?'neg':''}">${t.absences}</td><td class="num">${t.early?`<span class="pos">${t.early}×</span> <small>(${t.early_min} min)</small>`:'0'}</td><td class="num ${t.late?'neg':''}">${t.late}</td><td class="num">${t.late_min}</td>
    <td class="num">${hm(t.worked)}</td><td class="num">${hm(t.expected)}</td><td class="num ${t.balance<0?'neg':'pos'}"><b>${hm(t.balance)}</b></td></tr>`;
    if(o)h+=`<tr class="detail"><td colspan="8"><table><thead><tr><th>Data</th><th>Situação</th><th>Batidas</th><th class="num">Trabalhado</th><th class="num">Previsto</th><th class="num">Saldo</th></tr></thead><tbody>`+
      e.days.filter(d=>d.status!=='futuro').map(d=>`<tr><td>${WD[d.weekday]} ${d.date.split('-').reverse().slice(0,2).join('/')}</td>
      <td><span class="chip c-${d.status}">${LBL[d.status]||d.status}</span>${d.late_min?` <small>+${d.late_min} min</small>`:''}${d.early_min?` <small class="pos">cedo ${d.early_min} min</small>`:''}${d.note?` <small>${d.note}</small>`:''}</td>
      <td>${d.marks.map(m=>m[0]+'–'+(m[1]||'?')).join(' · ')||'—'}</td><td class="num">${hm(d.worked)}</td><td class="num">${hm(d.expected)}</td>
      <td class="num ${d.balance<0?'neg':d.balance>0?'pos':''}">${d.balance?hm(d.balance):'—'}</td></tr>`).join('')+`</tbody></table></td></tr>`;
    return h}).join('')||'<tr><td colspan="8">Nenhum resultado.</td></tr>';
  $('foot').textContent=`Período ${DATA.start} a ${DATA.end} · tolerância de atraso: ${DATA.tolerance} min · gerado em ${DATA.generated}`+(DATA.aviso?` · ⚠ ${DATA.aviso}`:'')}
function tog(id){open.has(id)?open.delete(id):open.add(id);render()}

function showTab(n){[1,2,3,4].forEach(i=>{if(!$('pg'+i))return;$('pg'+i).style.display=n===i?'':'none';$('t'+i).className='tab'+(n===i?' on':'')});
  $('ctl').style.display=(n===2||n===4)?'none':'';$('hubf').style.display=n===1?'':'none';$('q').style.display=n===1?'':'none';if(n===2)loadH();if(n===3)render3();if(n===4&&window.loadF)loadF()}
let HE=[];
async function loadH(){const m=$('hmsg');
  try{const r=await fetch('/api/horarios');const j=await r.json();
    if(!r.ok||!j.employees)throw new Error(j.error==='not found'?'A função da API não respondeu. Verifique se o deploy no Netlify terminou sem erro.':(j.error||'Erro ao carregar os funcionários'));
    HE=j.employees;m.style.display='none';renderH()}
  catch(e){m.style.display='block';m.textContent='⚠ '+e.message;HE=[];renderH()}}
function renderH(){const q=$('hq').value.toLowerCase();const showEx=$('showex').checked,ativos=HE.filter(e=>!e.excluded);const list=HE.filter(e=>e.name.toLowerCase().includes(q)&&(showEx||!e.excluded));
  $('hcount').textContent=`${ativos.filter(e=>e.horario).length} de ${ativos.length} com horário cadastrado`;$('excnt').textContent=HE.length-ativos.length;
  $('hublist').innerHTML=hubNames().map(h=>`<option value="${h}">`).join('');
  $('hb').innerHTML=list.map(e=>{if(e.excluded)return `<tr class="hrow" id="h${e.id}" style="opacity:.65"><td><b>${e.name}</b> <span class="badge">excluído</span></td><td colspan="6"><small style="color:var(--mut)">Fora do painel, dos hubs e dos comparativos.</small></td><td><button class="ghost mini" onclick="__M.painel.restaurar(${e.id})">Restaurar</button></td></tr>`;
    const h=e.horario||{type:'6x1',days:[],start:'08:00',end:'17:00',break_min:0},ty=h.type||'6x1';
    const dias=[1,2,3,4,5,6,7].map(d=>`<label><input type="checkbox" data-d="${d}" ${(h.days||[]).includes(d)?'checked':''}><span>${WD[d][0]}</span></label>`).join('');
    const op=(v,t)=>`<option value="${v}" ${ty===v?'selected':''}>${t}</option>`;
    return `<tr class="hrow" id="h${e.id}"><td><b>${e.name}</b><br><small style="color:var(--mut)">Tangerino: ${e.tangerino}</small></td>
    <td><input class="hubin" list="hublist" style="width:130px" placeholder="Hub" value="${(e.hub||'').replace(/"/g,'&quot;')}" onchange="__M.painel.saveHub(${e.id},this.value)"></td>
    <td><select class="ct" onchange="__M.painel.ctChange(${e.id})">${op('6x1','6x1')}${op('12x36','12x36')}${op('intermitente','Intermitente')}</select></td>
    <td><div class="b6"><div class="days">${dias}</div><div style="margin-top:4px"><button class="ghost mini" onclick="__M.painel.pre(${e.id},[2,3,4,5,6,7])">Seg–Sáb</button></div></div>
      <div class="b12"><small style="color:var(--mut)">Um dia em que trabalha</small><br><input type="date" class="an" value="${h.anchor||''}"></div>
      <div class="bi"><small style="color:var(--mut)">Sem horário fixo: conta só as horas trabalhadas</small></div></td>
    <td><input type="time" class="st" value="${h.start||'08:00'}"></td><td><input type="time" class="en" value="${h.end||'17:00'}"></td>
    <td><input type="number" class="bk" min="0" step="5" value="${h.break_min||0}"></td>
    <td><button class="mini" onclick="__M.painel.saveH(${e.id})">Salvar</button> <button class="ghost mini" onclick="__M.painel.copyAll(${e.id})" title="Aplica esta configuração a todos que ainda não têm">Copiar p/ sem horário</button>
      ${e.horario?`<button class="ghost mini" onclick="__M.painel.clearH(${e.id})">Limpar</button>`:''} <button class="ghost mini" style="color:var(--red)" onclick="__M.painel.excluir(${e.id})" title="Tira esta pessoa do painel (não apaga nada no Tangerino)">Excluir</button><div class="ok2" id="m${e.id}"></div></td></tr>`}).join('');
  list.filter(e=>!e.excluded).forEach(e=>ctChange(e.id,true))}
function ctChange(id,init){const r=$('h'+id);if(!r)return;const t=r.querySelector('.ct').value;
  r.querySelector('.b6').style.display=t==='6x1'?'':'none';r.querySelector('.b12').style.display=t==='12x36'?'':'none';r.querySelector('.bi').style.display=t==='intermitente'?'':'none';
  ['.st','.en','.bk'].forEach(c=>r.querySelector(c).style.visibility=t==='intermitente'?'hidden':'');
  if(t==='12x36'&&!init){const st=r.querySelector('.st'),en=r.querySelector('.en');if(st.value==='08:00'&&en.value==='17:00'){st.value='07:00';en.value='19:00'}}}
function pre(id,days){document.querySelectorAll(`#h${id} .days input`).forEach(i=>i.checked=days.includes(+i.dataset.d))}
function readRow(id){const r=$('h'+id),t=r.querySelector('.ct').value;
  return{type:t,days:t==='6x1'?[...r.querySelectorAll('.days input:checked')].map(i=>+i.dataset.d):[],start:r.querySelector('.st').value,end:r.querySelector('.en').value,
    break_min:+r.querySelector('.bk').value||0,anchor:t==='12x36'?r.querySelector('.an').value:undefined}}
function rowError(h){if(h.type==='intermitente')return '';if(!h.start||!h.end)return 'Preencha entrada e saída';
  if(h.type==='6x1'&&h.days.length!==6)return '6x1: marque exatamente 6 dias (1 folga)';if(h.type==='12x36'&&!h.anchor)return '12x36: informe um dia em que a pessoa trabalha';return ''}
async function post(body,path='/api/horarios'){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.error);return j}
async function saveH(id){const h=readRow(id),m=$('m'+id),err=rowError(h);
  if(err){m.textContent=err;m.style.color='var(--red)';return}
  try{await post({id,horario:h});await loadH();const m2=$('m'+id);if(m2){m2.style.color='';m2.textContent='✔ salvo'}}catch(e){alert(e.message)}}
async function saveHub(id,hub){try{await post({id,hub},'/api/hubs');const e=HE.find(x=>x.id===id);if(e)e.hub=hub.trim();fillHubs();$('hublist').innerHTML=hubNames().map(h=>`<option value="${h}">`).join('')}catch(err){alert(err.message)}}
async function bulkHub(){const hub=$('bulkhub').value.trim();const q=$('hq').value.toLowerCase();const ids=HE.filter(e=>e.name.toLowerCase().includes(q)&&!e.excluded).map(e=>e.id);
  if(!ids.length)return;if(!confirm(`${hub?`Definir o hub "${hub}"`:'Remover o hub'} de ${ids.length} funcionário(s) listados?`))return;
  await post({ids,hub},'/api/hubs');await loadH()}
function hubNames(){return [...new Set((HE.length?HE.filter(e=>!e.excluded):(DATA?DATA.employees:[])).map(e=>e.hub).filter(Boolean))].sort()}
function fillHubs(){const cur=$('hubf').value;const names=[...new Set((DATA?DATA.employees:HE).map(e=>e.hub).filter(Boolean))].sort();
  const hasNo=(DATA?DATA.employees:HE).some(e=>!e.hub);
  $('hubf').innerHTML='<option value="">Todos os hubs</option>'+names.concat(hasNo&&names.length?['Sem hub']:[]).map(h=>`<option ${h===cur?'selected':''}>${h}</option>`).join('')}
async function excluir(id){const e=HE.find(x=>x.id===id);if(!e)return;
  if(!confirm('Excluir "'+e.name+'" da lista?\n\nA pessoa deixa de aparecer no painel, nos hubs e nesta aba. Nada é apagado no Tangerino, e dá para restaurar depois (marque "Mostrar excluídos").'))return;
  try{await post({id,excluir:true},'/api/excluir');await loadH();load()}catch(err){alert(err.message)}}
async function restaurar(id){try{await post({id,excluir:false},'/api/excluir');await loadH();load()}catch(err){alert(err.message)}}
async function clearH(id){await post({id,horario:null});await loadH()}
async function copyAll(id){const h=readRow(id),err=rowError(h);const ids=HE.filter(e=>!e.horario&&!e.excluded&&e.id!==id).map(e=>e.id);
  if(err)return alert(err);if(!ids.length)return alert('Nada para copiar.');
  const aviso=h.type==='12x36'?'\n\nAtenção: todos ficarão com o mesmo dia de referência (trabalham nos mesmos dias). Depois, ajuste quem estiver na outra turma.':'';
  if(!confirm(`Aplicar esta configuração (${h.type}) a ${ids.length} funcionários que ainda não têm horário?${aviso}`))return;
  try{await post({ids:[id,...ids],horario:h});await loadH()}catch(e){alert(e.message)}}

/* ===================== INSIGHTS DE HUBS ===================== */
const pct=v=>(v*100).toFixed(1).replace('.',',')+'%', GOOD=['ok','atraso','incompleto','falta'];
function stats(emps){const t={n:emps.length,abs:0,late:0,late_min:0,early:0,balance:0,sched:0,present:0,latem:0};
  emps.forEach(e=>{const T=e.totals;t.abs+=T.absences;t.late+=T.late;t.late_min+=T.late_min;t.early+=T.early;t.balance+=T.balance;
    e.days.forEach(d=>{if(GOOD.includes(d.status)){t.sched++;if(d.status!=='falta')t.present++;if(d.status==='atraso')t.latem++}})});
  t.absRate=t.sched?t.abs/t.sched:0;t.punct=t.present?1-t.latem/t.present:1;t.balAvg=t.n?t.balance/t.n:0;t.lateAvg=t.n?t.late_min/t.n:0;return t}
const METRICS={absRate:{l:'Absenteísmo (menor é melhor)',f:pct,low:true},punct:{l:'Pontualidade (maior é melhor)',f:pct,low:false},
  lateAvg:{l:'Atraso médio por pessoa (menor é melhor)',f:v=>Math.round(v)+' min',low:true},balAvg:{l:'Saldo médio por pessoa (maior é melhor)',f:hm,low:false}};
function groups(){const g={};DATA.employees.forEach(e=>{const h=e.hub||'Sem hub';(g[h]=g[h]||[]).push(e)});
  return Object.entries(g).map(([name,emps])=>({name,emps,s:stats(emps)}))}
function cmpCls(key,v,arr){if(arr.length<2)return '';const vals=arr.map(a=>a.s[key]),lo=Math.min(...vals),hi=Math.max(...vals);if(lo===hi)return '';
  const low=METRICS[key]?.low??(key==='absRate'||key==='lateAvg');const best=low?lo:hi,worst=low?hi:lo;return v===best?'best':v===worst?'worst':''}
function render3(){if(!DATA){load();return}
  if(!$('hmetric').options.length)$('hmetric').innerHTML=Object.entries(METRICS).map(([k,m])=>`<option value="${k}">${m.l}</option>`).join('');
  const G=groups(),named=G.filter(g=>g.name!=='Sem hub'),all=stats(DATA.employees);
  $('hubmsg').style.display=named.length?'none':'';
  $('hkpis').innerHTML=[['Hubs',named.length,''],['Absenteísmo geral',pct(all.absRate),''],['Pontualidade geral',pct(all.punct),''],['Atraso médio/pessoa',Math.round(all.lateAvg)+' min',''],['Saldo médio/pessoa',hm(all.balAvg),all.balAvg<0?'neg':'pos']]
    .map(([l,v,c])=>`<div class="kpi"><span>${l}</span><b class="${c}">${v}</b></div>`).join('');
  // insights em texto
  const L=[],cmp=G.filter(g=>g.s.sched>0);
  if(named.length>=2&&cmp.length>=2){const by=(k,low)=>[...cmp].sort((a,b)=>low?a.s[k]-b.s[k]:b.s[k]-a.s[k]);
    const wa=by('absRate',false)[0],ba=by('absRate',true)[0],bp=by('punct',false)[0],wp=by('punct',true)[0],wb=by('balAvg',true)[0],bb=by('balAvg',false)[0];
    if(wa.s.absRate>0)L.push(`<b>${wa.name}</b> tem o maior absenteísmo: ${pct(wa.s.absRate)} (média geral ${pct(all.absRate)}). O menor é <b>${ba.name}</b>, com ${pct(ba.s.absRate)}.`);
    if(bp!==wp)L.push(`Pontualidade: <b>${bp.name}</b> lidera com ${pct(bp.s.punct)}; <b>${wp.name}</b> é o mais atrasado, com ${pct(wp.s.punct)}.`);
    if(wb.s.balAvg<0)L.push(`<b>${wb.name}</b> acumula mais horas devedoras: ${hm(wb.s.balAvg)} por pessoa. Melhor saldo: <b>${bb.name}</b> (${hm(bb.s.balAvg)}).`)}
  const top=(k,txt)=>[...DATA.employees].filter(e=>e.totals[k]>0).sort((a,b)=>b.totals[k]-a.totals[k]).slice(0,3);
  const tl=top('late_min');if(tl.length)L.push('Quem mais acumula minutos de atraso: '+tl.map(e=>`<b>${e.name}</b>${e.hub?` (${e.hub})`:''} — ${e.totals.late_min} min`).join('; ')+'.');
  const ta=top('absences');if(ta.length)L.push('Quem mais faltou: '+ta.map(e=>`<b>${e.name}</b>${e.hub?` (${e.hub})`:''} — ${e.totals.absences}`).join('; ')+'.');
  const nd=DATA.employees.filter(e=>!e.hub).length;if(nd&&named.length)L.push(`${nd} colaborador(es) ainda sem hub — cadastre na aba Horários.`);
  const nc=DATA.employees.filter(e=>!e.custom).length;if(nc)L.push(`${nc} colaborador(es) sem horário cadastrado: os números deles usam a escala do Tangerino e podem estar imprecisos.`);
  $('ins').innerHTML=L.length?L.map(x=>`<li>${x}</li>`).join(''):'<li>Sem dados suficientes no período.</li>';
  // barras
  const mk=$('hmetric').value||'absRate',M=METRICS[mk],sorted=[...G].sort((a,b)=>M.low?a.s[mk]-b.s[mk]:b.s[mk]-a.s[mk]);
  const mx=Math.max(...sorted.map(g=>Math.abs(g.s[mk])),1e-9);
  $('hbars').innerHTML=sorted.map((g,i)=>{const v=g.s[mk],neg=mk==='balAvg'&&v<0;const col=sorted.length>1&&mk!=='balAvg'?(i===0?'var(--grn)':i===sorted.length-1?'var(--red)':'var(--pri)'):(neg?'var(--red)':'var(--grn)');
    return `<tr><td style="width:180px"><b>${g.name}</b> <small style="color:var(--mut)">${g.s.n} pessoas</small></td><td><div class="bar" style="width:${Math.max(2,Math.abs(v)/mx*100)}%;background:${col}"></div></td><td class="num" style="width:110px"><b>${M.f(v)}</b></td></tr>`}).join('');
  // tabela comparativa
  $('htab').innerHTML=sorted.map(g=>{const s=g.s,c=k=>cmpCls(k,s[k],cmp);
    return `<tr><td><b>${g.name}</b></td><td class="num">${s.n}</td><td class="num">${s.abs}</td><td class="num ${c('absRate')}">${pct(s.absRate)}</td><td class="num">${s.late}</td><td class="num ${c('punct')}">${pct(s.punct)}</td>
    <td class="num ${c('lateAvg')}">${Math.round(s.lateAvg)} min</td><td class="num">${s.early}</td><td class="num ${s.balance<0?'neg':'pos'}">${hm(s.balance)}</td><td class="num ${c('balAvg')}">${hm(s.balAvg)}</td></tr>`}).join('');
  // colaboradores por hub
  const cur=$('hsel').value;$('hsel').innerHTML='<option value="">Todos</option>'+G.map(g=>`<option ${g.name===cur?'selected':''}>${g.name}</option>`).join('');
  const sel=$('hsel').value,grp=sel?G.find(g=>g.name===sel):{emps:DATA.employees,s:all},ref=grp?grp.s:all,sk=$('hsort').value;
  const rows=(grp?grp.emps:[]).map(e=>({e,s:stats([e])})).sort((a,b)=>sk==='name'?a.e.name.localeCompare(b.e.name):sk==='balance'?a.e.totals.balance-b.e.totals.balance:b.e.totals[sk]-a.e.totals[sk]);
  const dl=v=>v===0?'—':(v>0?'+':'')+Math.round(v)+' min';
  $('etab').innerHTML=rows.map(({e,s})=>{const T=e.totals,dLate=T.late_min-ref.lateAvg,dBal=T.balance-ref.balAvg;
    return `<tr><td><b>${e.name}</b>${!sel&&e.hub?`<span class="badge">${e.hub}</span>`:''}</td><td class="num ${T.absences?'neg':''}">${T.absences}</td><td class="num ${T.late?'neg':''}">${T.late}</td><td class="num">${T.late_min}</td><td class="num">${T.early}</td>
    <td class="num">${pct(s.punct)}</td><td class="num ${T.balance<0?'neg':'pos'}"><b>${hm(T.balance)}</b></td>
    <td class="num ${dLate>0?'neg':dLate<0?'pos':''}">${dl(dLate)}</td><td class="num ${dBal<0?'neg':dBal>0?'pos':''}">${dBal===0?'—':(dBal>0?'+':'')+hm(dBal)}</td></tr>`}).join('')||'<tr><td colspan="9">Sem colaboradores.</td></tr>'}
preset('semana');

;
// Aba "Freelancers" do painel administrativo: jornadas, ajustes e acompanhamento do envio ao DP.
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const brl = v => v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dmy = d => d.split("-").reverse().join("/");
  const ROT = { entrada: "Entrada", saida_almoco: "Saída almoço", retorno_almoco: "Retorno almoço", saida_final: "Saída final" };
  const DPROT = { pendente: "Pendente de envio", enviado: "Enviado", falha: "Falha no envio", aguardando: "Jornada não concluída", nao_aplica: "—" };
  const DPCLS = { pendente: "c-atraso", enviado: "c-ok", falha: "c-falta", aguardando: "c-folga", nao_aplica: "c-folga" };
  let D = null;

  const root = $("pg4");
  const t = new Date(), iso = d => d.toISOString().slice(0, 10);
  root.innerHTML = `
    <div id="fmsg" class="hint" style="display:none"></div>
    <div class="ctl" style="margin-bottom:12px">
      <input type="date" id="f0"> <span>até</span> <input type="date" id="f1">
      <select id="fun"><option value="">Todas as unidades</option></select>
      <select id="fdp"><option value="">Todos os envios ao DP</option><option value="pendente">Pendente de envio</option><option value="enviado">Enviado</option><option value="falha">Falha no envio</option></select>
      <select id="fst"><option value="">Todas as jornadas</option><option value="concluida">Concluídas</option><option value="inc">Incompletas / em aberto</option></select>
      <input id="fq" placeholder="Buscar nome…">
      <button id="fgo">Atualizar</button>
      <button class="ghost" id="fsend">Enviar / reenviar pendentes ao DP</button>
      <button class="ghost" id="ftest">Testar conexão com o DP</button>
      <button class="ghost" id="fcsv">Exportar CSV</button>
    </div>
    <div class="kpis" id="fk"></div>
    <div class="wrap"><table><thead><tr><th>Data</th><th>Freelancer</th><th>Unidade</th><th>Entrada</th><th>Saída alm.</th><th>Retorno</th><th>Saída final</th><th class="num">Horas</th><th class="num">A receber</th><th>Envio ao DP</th><th></th></tr></thead><tbody id="fb"></tbody></table></div>
    <div class="foot">Valores são o <b>valor calculado a receber</b> (R$ 12,50/h), não confirmação de pagamento. CPF e Pix aparecem mascarados; use “Ver dados” para o completo. Batidas registradas não podem ser editadas — só é possível preencher uma batida que faltou (com motivo, registrado) ou cancelar uma jornada.</div>
    <dialog id="fdlg" style="border:1px solid var(--bd);border-radius:12px;background:var(--card);color:var(--tx);max-width:420px;width:92vw"><form method="dialog" id="fform" style="display:flex;flex-direction:column;gap:10px">
      <b id="fdt"></b><div id="fdb"></div><div id="fde" style="color:var(--red);min-height:18px"></div>
      <div class="ctl" style="justify-content:flex-end"><button class="ghost" value="cancel">Fechar</button><button id="fok" value="ok">Salvar</button></div></form></dialog>`;
  $("f0").value = iso(new Date(t.getFullYear(), t.getMonth(), 1)); $("f1").value = iso(t);
  const msg = (m, bad) => { const e = $("fmsg"); e.style.display = m ? "" : "none"; e.innerHTML = m; e.style.background = bad ? "var(--redbg)" : "var(--blubg)"; e.style.color = bad ? "var(--red)" : "var(--blu)"; };
  async function api(path, body) {
    const r = await fetch(path, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); if (!r.ok && r.status !== 401) throw new Error(j.error || "Erro " + r.status); return j;
  }
  window.loadF = async function () {
    msg("Carregando…");
    try {
      D = await api(`/api/freela/admin/jornadas?start=${$("f0").value}&end=${$("f1").value}`);
      if (!$("fun").dataset.ok) { $("fun").innerHTML = '<option value="">Todas as unidades</option>' + D.unidades.map(u => `<option>${esc(u)}</option>`).join(""); $("fun").dataset.ok = 1; }
      msg(D.dp_configurado ? "" : "<b>Integração com o DP ainda não ativada.</b> As jornadas concluídas ficam guardadas como “Pendente de envio”. Para ativar, defina <code>DP_API_TOKEN</code> nas variáveis de ambiente do Netlify (Site configuration → Environment variables) e faça um novo deploy. Enquanto isso, use “Exportar CSV”.", true);
      draw();
    } catch (e) { msg(esc(e.message), true); }
  };
  function draw() {
    if (!D) return; const T = D.totais, q = $("fq").value.toLowerCase(), u = $("fun").value, dp = $("fdp").value, st = $("fst").value;
    $("fk").innerHTML = [["Jornadas concluídas", T.jornadas], ["Total a receber", brl(T.valor)], ["Pendentes de envio", T.pendente || 0], ["Enviadas ao DP", T.enviado || 0], ["Falhas no envio", T.falha || 0], ["Incompletas", T.incompletas || 0]]
      .map(([a, b]) => `<div class="kpi"><span>${a}</span><b>${esc(b)}</b></div>`).join("");
    const L = D.jornadas.filter(j => (!q || j.nome.toLowerCase().includes(q)) && (!u || j.unidade === u) && (!dp || j.dp.status === dp) && (!st || (st === "concluida" ? j.status === "concluida" : j.status !== "concluida")));
    $("fb").innerHTML = L.length ? L.map(j => {
      const m = k => j.marks[k] || "—", inc = j.status !== "concluida" && j.status !== "cancelada";
      const dpTxt = j.cancelada ? `<span class="chip c-folga" title="${esc(j.motivoCancel)}">Cancelada</span>` : `<span class="chip ${DPCLS[j.dp.status]}" ${j.dp.erro ? `title="${esc(j.dp.erro)}"` : ""}>${DPROT[j.dp.status]}</span>${j.dp.tentativas ? ` <small style="color:var(--mut)">${j.dp.tentativas}×</small>` : ""}${j.dp.erro && j.dp.status !== "enviado" ? `<br><small style="color:var(--mut)">${esc(j.dp.erro).slice(0, 70)}</small>` : ""}`;
      return `<tr><td>${dmy(j.data)}</td><td><b>${esc(j.nome)}</b><br><small style="color:var(--mut)">${esc(j.cpf)} · Pix ${esc(j.pix)}</small>${j.ajustes.length ? `<br><span class="badge">ajustada (${j.ajustes.length})</span>` : ""}</td><td>${esc(j.unidade)}</td>
        <td>${m("entrada")}</td><td>${m("saida_almoco")}</td><td>${m("retorno_almoco")}</td><td>${m("saida_final")}${inc ? `<br><span class="chip c-atraso">${j.incompleta ? "Incompleta" : esc(j.statusRotulo)}</span>` : ""}${j.longa ? `<br><span class="chip c-atraso">Jornada longa: conferir</span>` : ""}</td>
        <td class="num">${j.horas || "—"}</td><td class="num">${brl(j.valor)}</td><td>${dpTxt}</td>
        <td style="min-width:160px"><button class="ghost mini" data-a="ver" data-id="${esc(j.id)}">Ver dados</button>
        ${inc ? `<button class="ghost mini" data-a="ajustar" data-id="${esc(j.id)}">Ajustar</button>` : ""}
        ${j.status === "concluida" && j.dp.status === "enviado" && !j.dp.reaberta ? `<button class="ghost mini" data-a="fotos" data-id="${esc(j.id)}">Reenviar fotos</button>` : ""}
        ${j.status === "concluida" && j.dp.status !== "enviado" ? `<button class="ghost mini" data-a="enviar" data-id="${esc(j.id)}">${j.dp.status === "falha" ? "Reenviar" : "Enviar"}</button>` : ""}
        ${!j.cancelada && j.dp.status !== "enviado" ? `<button class="ghost mini" style="color:var(--red)" data-a="cancelar" data-id="${esc(j.id)}">Cancelar</button>` : ""}</td></tr>`;
    }).join("") : `<tr><td colspan="11" style="text-align:center;color:var(--mut);padding:24px">Nenhuma jornada neste filtro.</td></tr>`;
  }
  function dlg(titulo, html, onOk) {
    $("fdt").textContent = titulo; $("fdb").innerHTML = html; $("fde").textContent = ""; const d = $("fdlg"), ok = $("fok");
    ok.style.display = onOk ? "" : "none";
    ok.onclick = async ev => { ev.preventDefault(); try { await onOk(); d.close(); loadF(); } catch (e) { $("fde").textContent = e.message; } };
    d.showModal();
  }
  $("fdb").addEventListener("click", async ev => {
    const b = ev.target.closest("button[data-foto]"); if (!b) return;
    try { const r = await api("/api/freela/admin/foto?id=" + encodeURIComponent(b.dataset.id) + "&tipo=" + encodeURIComponent(b.dataset.foto)); const i = new Image(); i.src = r.foto; i.style.cssText = "max-width:100%;border-radius:8px;margin-top:6px"; b.nextElementSibling.replaceChildren(i); b.remove(); } catch (e) { $("fde").textContent = e.message; }
  });
  $("fb").addEventListener("click", async ev => {
    const b = ev.target.closest("button[data-a]"); if (!b) return; const id = b.dataset.id, j = D.jornadas.find(x => x.id === id), a = b.dataset.a;
    try {
      if (a === "ver") { const f = await api("/api/freela/admin/jornada?id=" + encodeURIComponent(id)); dlg("Dados de " + f.nome, `<p>CPF: <b>${esc(f.cpf_completo)}</b><br>Chave Pix: <b>${esc(f.pix_completo)}</b><br>Unidade: ${esc(f.unidade)}<br>Código da jornada: <small>${esc(f.id)}</small></p>
        <h4 style="margin:12px 0 6px">Evidências das batidas</h4>${(f.evidencias || []).map(e => `<div style="border-top:1px solid var(--bd);padding:8px 0;font-size:13px"><b>${esc(e.rotulo)}</b> · ${esc(new Date(e.em).toLocaleTimeString("pt-BR"))}<br>
          ${e.lat != null ? `📍 <a href="https://www.google.com/maps?q=${e.lat},${e.lon}" target="_blank" rel="noopener">${e.lat.toFixed(5)}, ${e.lon.toFixed(5)}</a>${e.prec != null ? ` (±${e.prec} m)` : ""}` : `<span style="color:var(--red)">📍 sem localização</span>`} · IP ${esc(e.ip || "?")}<br>
          <small style="color:var(--mut)">${esc(e.ua || "")}</small><br>${e.foto ? `<button class="ghost mini" type="button" data-foto="${esc(e.tipo)}" data-id="${esc(f.id)}">Ver foto</button><div></div>` : ""}</div>`).join("") || "<small style='color:var(--mut)'>Sem registros (jornadas antigas não tinham foto/local).</small>"}`); }
      if (a === "fotos") { const r = await api("/api/freela/admin/enviar", { ids: [id], forcar: true }); if (r.error) msg(esc(r.error), true); else msg("Fotos reenviadas ao DP.", false); loadF(); }
      if (a === "enviar") { const r = await api("/api/freela/admin/enviar", { ids: [id] }); if (r.error) msg(esc(r.error), true); loadF(); }
      if (a === "cancelar") dlg("Cancelar jornada de " + j.nome, `<p>A jornada não é apagada: fica registrada como cancelada e não vai ao DP.</p><input id="fmot" placeholder="Motivo (obrigatório)" style="width:100%">`, async () => { await api("/api/freela/admin/cancelar", { id, motivo: $("fmot").value }); });
      if (a === "ajustar") {
        const faltam = Object.keys(ROT).filter(k => !j.marks[k]); if (!faltam.length) return;
        dlg("Preencher batida de " + j.nome, `<p>Só é possível preencher uma batida que faltou. O ajuste fica registrado com o motivo.</p>
          <select id="ftp" style="width:100%;margin-bottom:8px">${faltam.map(k => `<option value="${k}">${ROT[k]}</option>`).join("")}</select>
          <div class="ctl"><input type="date" id="fdt2" value="${esc(j.data)}"><input type="time" id="fhr"></div>
          <input id="fmot" placeholder="Motivo (obrigatório)" style="width:100%;margin-top:8px">`,
          async () => { await api("/api/freela/admin/ajustar", { id, tipo: $("ftp").value, data: $("fdt2").value, hora: $("fhr").value, motivo: $("fmot").value }); });
      }
    } catch (e) { msg(esc(e.message), true); }
  });
  $("fgo").onclick = loadF; ["fq", "fun", "fdp", "fst"].forEach(i => $(i).addEventListener("input", draw));
  $("fsend").onclick = async () => {
    try { msg("Enviando…"); const r = await api(`/api/freela/admin/enviar?start=${$("f0").value}&end=${$("f1").value}`, {});
      await loadF(); if (r.error) msg(esc(r.error), true); else msg(`Envio concluído: ${r.enviados} enviado(s), ${r.falhas} com falha${r.restantes ? `, ${r.restantes} restante(s) — clique de novo` : ""}.`, r.falhas > 0);
    } catch (e) { msg(esc(e.message), true); }
  };
  $("ftest").onclick = async () => {
    try { msg("Testando…"); const r = await api("/api/freela/admin/dp-teste");
      if (!r.ok) return msg(esc(r.error), true);
      const sem = r.unidades.filter(u => !u.hub_no_dp).map(u => u.unidade);
      msg(`<b>Conexão com o DP OK.</b> Hubs no DP: ${r.hubs.map(esc).join(", ")}.${sem.length ? ` <b>Atenção:</b> sem hub correspondente no DP: ${sem.map(esc).join(", ")} — essas jornadas não serão enviadas até o hub existir no DP (ou definir <code>DP_HUB_MAP</code>).` : ""}`, sem.length > 0);
    } catch (e) { msg(esc(e.message), true); }
  };
  $("fcsv").onclick = () => { location.href = `/api/freela/admin/export.csv?start=${$("f0").value}&end=${$("f1").value}`; };
})();

    Object.assign(M[NAME], {api:typeof api==='function'?api:undefined,bulkHub:typeof bulkHub==='function'?bulkHub:undefined,clearH:typeof clearH==='function'?clearH:undefined,cmpCls:typeof cmpCls==='function'?cmpCls:undefined,copyAll:typeof copyAll==='function'?copyAll:undefined,ctChange:typeof ctChange==='function'?ctChange:undefined,dlg:typeof dlg==='function'?dlg:undefined,doLogin:typeof doLogin==='function'?doLogin:undefined,draw:typeof draw==='function'?draw:undefined,excluir:typeof excluir==='function'?excluir:undefined,fillHubs:typeof fillHubs==='function'?fillHubs:undefined,groups:typeof groups==='function'?groups:undefined,hubNames:typeof hubNames==='function'?hubNames:undefined,load:typeof load==='function'?load:undefined,loadH:typeof loadH==='function'?loadH:undefined,logout:typeof logout==='function'?logout:undefined,post:typeof post==='function'?post:undefined,pre:typeof pre==='function'?pre:undefined,preset:typeof preset==='function'?preset:undefined,readRow:typeof readRow==='function'?readRow:undefined,render:typeof render==='function'?render:undefined,render3:typeof render3==='function'?render3:undefined,renderH:typeof renderH==='function'?renderH:undefined,restaurar:typeof restaurar==='function'?restaurar:undefined,rowError:typeof rowError==='function'?rowError:undefined,saveH:typeof saveH==='function'?saveH:undefined,saveHub:typeof saveHub==='function'?saveHub:undefined,showLogin:typeof showLogin==='function'?showLogin:undefined,showTab:typeof showTab==='function'?showTab:undefined,sortBy:typeof sortBy==='function'?sortBy:undefined,stats:typeof stats==='function'?stats:undefined,tog:typeof tog==='function'?tog:undefined,val:typeof val==='function'?val:undefined});
  })(docP, locP, histP);
})();
