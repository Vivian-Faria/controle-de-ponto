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
