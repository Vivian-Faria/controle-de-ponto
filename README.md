# Painel de Ponto — versão Netlify

Mesmo painel da versão local, mas online: funciona com o seu computador desligado, protegido por senha.
Horários e hubs ficam guardados no Netlify (Blobs). O token da Tangerino fica só nas variáveis de ambiente — nunca no código.

## Estrutura
- `public/index.html` — a página (login, painel, hubs, horários)
- `netlify/functions/api.mjs` — a API: busca os pontos na Tangerino e calcula tudo
- `netlify.toml`, `package.json` — configuração

## Variáveis de ambiente (Netlify → Site configuration → Environment variables)
| Nome | Obrigatória | O que é |
|---|---|---|
| `TANGERINO_TOKEN` | sim | Token de Empregador → Integrações (com ou sem a palavra "Basic") |
| `APP_PASSWORD` | sim | Senha para entrar no painel (use uma forte, 12+ caracteres) |
| `LATE_TOLERANCE_MIN` | não | Tolerância de atraso em minutos (padrão 10) |
| `HOLIDAYS` | não | Feriados AAAA-MM-DD separados por vírgula |
| `SESSION_SECRET` | não | Texto aleatório longo para assinar o login (se vazio, é derivado da senha + token) |

Depois de criar ou mudar variáveis, faça um novo deploy (Deploys → Trigger deploy).

## Limites
- Cada consulta tem ~10 s no Netlify. Se o período for grande demais, o painel avisa para escolher um menor (semana ou quinzena).
- Login: após 8 senhas erradas, bloqueia por 10 minutos.

## Central unificada (`/orion/`)
Página única com Dashboard, Compras, Controle de ponto, Central de alertas, Escala e Presenças, menu lateral e login do ponto.
Sem iframes: cada sistema roda dentro da própria página da Central (Shadow DOM), usando as mesmas APIs e os mesmos dados.
- `public/orion/` — Central (menu, dashboard, James, compras) e `mod/` (módulos gerados).
- `public/escala/` — código da escala (Firebase `escalas-operacional-orion`).
- `tools/build_modulos.py` e `tools/build_escala.py` — regeram `public/orion/mod/*.js` quando `painel.html`, `central.html`, `acompanhar.html`, `equipe-links.html` ou `public/escala/*` mudarem. Rode os dois depois de editar essas páginas.
- `public/orion/financeiro.html` — interface do Financeiro (sem senha).

## Dashboard em tempo real (API admin da Órion)

A Central lê os números pela função `netlify/functions/dash.mjs` (`/api/dash`, só com a sessão de admin).
O token da API **nunca** vai para o navegador: defina no Netlify (Site settings → Environment variables):

- `ORION_ADMIN_TOKEN` (obrigatória): token da API admin.
- `ORION_ADMIN_URL` (opcional): padrão `https://admin.orioncloudkitchens.com.br/api/admin/v1`.
- `ORION_HUB_MAP` (opcional): JSON `{"trecho do nome":"sion|cn|bur|cas|exp"}` para ajustar o reconhecimento dos hubs.

Cada dia fechado é calculado uma vez e guardado (Netlify Blobs, loja `dash`); hoje é recalculado a cada ~60 s. O histórico (60 dias) é preenchido
aos poucos, do mais recente para o mais antigo, respeitando o limite de 60 req/min da API; a função agendada `vigia` também ajuda a manter tudo aquecido.
Diagnóstico dos nomes de hub/unidade que a API devolve: `/api/dash/probe` (logada como admin).

## Operações (`/orion/#/operacoes`)

Página única da gerência: triagem do dia (indicadores de ontem, furos de escala, manutenção, ações e demandas), visita de campo com ficha de saúde (semáforo), plano de ação, demandas de CS, DP, RH e Financeiro e geração de pauta (copiar ou imprimir/PDF).

- Arquivos: `assets/operacoes.js`, `assets/operacoes.css`, `demandas.html` (página pública para CS, DP, RH e Financeiro lançarem demandas).
- Armazenamento: mesma coleção `compras_pedidos` do Firestore, separada pelo campo `kind` (regras do Firestore não mudam): `manutencao` (MT-), `visita` (VS-), `acao` (AC-), `demanda` (DX-). Pedidos não têm `kind`.
- Erros das Varandas = cancelamentos por motivo faltante ou trocado (`falt`/`troc`); embalagem e qualidade não contam. Expedição = relatório de erros da API. Reprocessamento forçado por `LOGV` em `dash.mjs`.
- Limites do semáforo ficam em `LIM` no topo de `operacoes.js`.

- Filtro de período único no topo da página (padrão, 7/14/30 dias, tudo ou de/até) vale para triagem, visitas, ações, demandas e pauta. A triagem tem botão para marcar ação, demanda ou manutenção como resolvida.
- Meta de erros: no máximo 2 por semana em cada hub (`TARGETS.erros` em `central-data.js`). Manutenções podem ser excluídas (exclusão lógica, campo `deleted`).
- O dashboard (KPIs, fluxo por hora, mapa de erros, manutenção) segue hub e período escolhidos; `/api/dash` devolve `hourlyDia` para isso.
