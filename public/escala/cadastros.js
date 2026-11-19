// Página 1 — Cadastros: hubs, turnos com vagas por dia, supervisores, colaboradores, datas especiais e buracos na escala.
import { configuracaoPronta, lerConfig, salvarConfig, ouvirEscalas, lerEscalas, salvarVagasEmLote } from './db.js';
import { entrar, sair, aoMudarLogin, tokenAdmin } from './auth.js';
import { datasDoAno, ROTULO_TIPO } from './feriados.js';
import {
  DIAS_CURTO, DIAS_LONGO, MESES, uid, escapeHtml, porNome, limparNome, normalizaNome,
  ordenaTurnos, faixaDoDia, vagasSemana, plural, parseIso, isoDate, addDays, startOfWeek,
  capitalizar, vagasDe, horas, criarStatus, vagasDoTurno, agregarBuracos, hhmm, nomeParecido
} from './utils.js';

const $ = (s) => document.querySelector(s);
const el = {
  aviso: $('#avisoConfig'), login: $('#telaLogin'), app: $('#telaApp'), form: $('#formLogin'),
  senha: $('#senha'), erroLogin: $('#erroLogin'), sair: $('#btnSair'), conteudo: $('#conteudo'),
  barra: $('#barraSalvar'), salvar: $('#btnSalvar'), descartar: $('#btnDescartar')
};
const mostrarStatus = criarStatus($('#status'));

let cfg = null;        // cópia de trabalho
let original = '';     // último estado salvo (para saber se há alterações)
let aba = 'hubs';
// ---------- telefones dos colaboradores (a central de alertas lê daqui os números para os avisos) ----------
const CENTRAL = 'https://controle-de-ponto-solides.netlify.app';
const telNacional = (v) => { let d = String(v || '').replace(/\D/g, ''); if (d.startsWith('55') && d.length > 11) d = d.slice(2); return d; };
const telValido = (v) => { const d = telNacional(v); return d.length === 10 || d.length === 11; };
const mascaraTel = (v) => {
  const d = telNacional(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};
const colabOk = (c) => telValido(c.tel) || Boolean(c.semTel);
let hubTurnos = '';
let filtroColab = '';

// ---------- estado da geração da escala-base (colaboradores fixos) ----------
const geracaoEstado = { hubId: '', inicio: '', fim: '', gerando: false };

// ---------- estado da aba "Buracos na escala" (vale para todos os hubs) ----------
const buracosEstado = {
  hubId: '', modo: 'semana', ref: new Date(),
  escalas: {}, prontas: false, cancelar: null, chaveFaixa: ''
};

// ---------- estado da aba "Indicadores de confiabilidade" ----------
const indicadoresEstado = {
  hubId: '', modo: 'mes', ref: new Date(), filtro: '',
  escalas: {}, prontas: false, cancelar: null, chaveFaixa: ''
};

// ================= início e login =================
if (!configuracaoPronta()) {
  el.aviso.hidden = false;
} else {
  aoMudarLogin(async (usuario) => {
    if (!usuario) {
      cfg = null;
      el.app.hidden = true;
      el.sair.hidden = true;
      el.barra.hidden = true;
      el.login.hidden = false;
      el.senha.focus();
      return;
    }
    el.login.hidden = true;
    el.sair.hidden = false;
    el.app.hidden = false;
    el.conteudo.innerHTML = '<p class="carregando">Carregando cadastros…</p>';
    try {
      cfg = await lerConfig();
      original = JSON.stringify(cfg);
      renderAba();
    } catch (err) {
      console.error(err);
      el.conteudo.innerHTML = `<div class="aviso"><h2>Não foi possível carregar</h2><p>${err?.code === 'permission-denied'
        ? 'O Firestore recusou a leitura. Confira se as regras do <code>firestore.rules</code> foram publicadas.'
        : 'Verifique a conexão e recarregue a página.'}</p></div>`;
    }
  });
}

function mensagemLogin(codigo) {
  switch (codigo) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/invalid-login-credentials': return 'Senha incorreta.';
    case 'auth/user-not-found': return 'O usuário administrador não existe. Crie-o no Firebase Authentication (veja o README).';
    case 'auth/too-many-requests': return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
    case 'auth/network-request-failed': return 'Sem conexão com a internet.';
    case 'auth/operation-not-allowed': return 'Ative o login por e-mail e senha no Firebase Authentication.';
    case 'auth/invalid-email': return 'O ADMIN_EMAIL em firebase-config.js não é um e-mail válido.';
    default: return `Não foi possível entrar (${codigo || 'erro desconhecido'}).`;
  }
}

el.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  el.erroLogin.textContent = '';
  const btn = el.form.querySelector('button');
  btn.disabled = true;
  try {
    await entrar(el.senha.value);
    el.senha.value = '';
  } catch (err) {
    el.erroLogin.textContent = mensagemLogin(err?.code);
  } finally {
    btn.disabled = false;
  }
});

el.sair.addEventListener('click', () => {
  if (temAlteracoes() && !confirm('Sair sem salvar as alterações?')) return;
  original = '';
  sair();
});

// ================= alterações pendentes =================
const temAlteracoes = () => cfg && JSON.stringify(cfg) !== original;
function marcar() { el.barra.hidden = !temAlteracoes(); }

window.addEventListener('beforeunload', (e) => {
  if (temAlteracoes()) { e.preventDefault(); e.returnValue = ''; }
});

el.descartar.addEventListener('click', () => {
  cfg = JSON.parse(original);
  renderAba();
  marcar();
  mostrarStatus('Alterações descartadas', 'neutro');
});

el.salvar.addEventListener('click', async () => {
  limparCadastros();
  const erro = validar();
  if (erro) {
    aba = erro.aba;
    if (erro.hub) hubTurnos = erro.hub;
    renderAba();
    mostrarStatus(erro.msg, 'erro', true);
    return;
  }
  el.salvar.disabled = true;
  mostrarStatus('Salvando…', 'neutro', true);
  try {
    await salvarConfig(cfg);
    original = JSON.stringify(cfg);
    marcar();
    renderAba();
    mostrarStatus('Alterações salvas');
  } catch (err) {
    console.error(err);
    mostrarStatus(err?.code === 'permission-denied'
      ? 'O Firestore recusou a gravação. Confira o e-mail de admin no firestore.rules.'
      : 'Não foi possível salvar. Verifique a conexão e tente de novo.', 'erro', true);
  } finally {
    el.salvar.disabled = false;
  }
});

function limparCadastros() {
  cfg.hubs.forEach((h) => { h.nome = limparNome(h.nome); });
  cfg.turnos.forEach((t) => { t.nome = limparNome(t.nome); });
  cfg.supervisores.forEach((s) => { s.nome = limparNome(s.nome); });
  cfg.colaboradores = cfg.colaboradores.filter((c) => limparNome(c.nome));
  cfg.colaboradores.forEach((c) => { c.nome = limparNome(c.nome); });
  cfg.datasEspeciais.forEach((d) => { d.nome = limparNome(d.nome); });
}

function validar() {
  const hora = /^\d{2}:\d{2}$/;
  for (const h of cfg.hubs) if (!h.nome) return { aba: 'hubs', msg: 'Há um hub sem nome.' };
  for (const t of cfg.turnos) {
    const hub = hubNome(t.hubId);
    if (!t.nome) return { aba: 'turnos', hub: t.hubId, msg: `Há um turno sem nome no hub ${hub}.` };
    if (!hora.test(t.inicio) || !hora.test(t.fim)) {
      return { aba: 'turnos', hub: t.hubId, msg: `Preencha início e fim do turno ${t.nome} (${hub}).` };
    }
    if (t.inicio === t.fim) {
      return { aba: 'turnos', hub: t.hubId, msg: `O turno ${t.nome} (${hub}) começa e termina no mesmo horário.` };
    }
  }
  for (const s of cfg.supervisores) if (!s.nome) return { aba: 'supervisores', msg: 'Há um supervisor sem nome.' };
  // telefone: obrigatório para colaborador novo; quem já existia sem telefone continua salvando, mas fica com ⚠️ e não entra na escala
  const idsAntes = new Set((JSON.parse(original || '{}').colaboradores || []).map((c) => c.id));
  for (const c of cfg.colaboradores) {
    if (c.tel && !telValido(c.tel)) return { aba: 'colaboradores', msg: `O telefone de ${limparNome(c.nome)} está incompleto (use DDD + número).` };
    if (!idsAntes.has(c.id) && limparNome(c.nome) && !colabOk(c)) return { aba: 'colaboradores', msg: `Informe o telefone de ${limparNome(c.nome)} (ou marque "Sem celular" e diga o motivo).` };
  }
  for (const d of cfg.datasEspeciais) {
    if (!d.nome) return { aba: 'datas', msg: 'Há uma data especial sem nome.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data || '')) return { aba: 'datas', msg: `Preencha a data de ${d.nome}.` };
  }
  return null;
}

// ================= auxiliares =================
const hubNome = (id) => cfg.hubs.find((h) => h.id === id)?.nome || 'sem hub';
const hubsOrdenados = () => [...cfg.hubs].sort(porNome);
const numero = (v) => Math.max(0, Math.min(99, parseInt(v, 10) || 0));

function totalHub(hubId) {
  return cfg.turnos.filter((t) => t.hubId === hubId).reduce((s, t) => s + vagasSemana(t), 0);
}

function formatarData(d) {
  const [a, m, dia] = d.data.split('-');
  return d.anual ? `${dia}/${m}, todo ano` : `${dia}/${m}/${a}`;
}

function opcoesTipo(atual) {
  return Object.entries(ROTULO_TIPO)
    .map(([v, r]) => `<option value="${v}"${v === atual ? ' selected' : ''}>${r}</option>`).join('');
}

// Copia texto para a área de transferência, com um jeito alternativo para
// quando a API moderna não está disponível (ex: página aberta sem https).
async function copiarTexto(texto) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(texto);
    return;
  }
  const area = document.createElement('textarea');
  area.value = texto;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(area);
  if (!ok) throw new Error('copia-falhou');
}

function cabecalho(titulo, texto) {
  return `<div class="secao-cab"><h2>${titulo}</h2><p>${texto}</p></div>`;
}

// ================= abas =================
document.querySelector('.abas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-aba]');
  if (!b) return;
  aba = b.dataset.aba;
  renderAba();
});

function renderAba() {
  if (!cfg) return;
  document.querySelectorAll('.abas [data-aba]').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.aba === aba));
  });
  ({ hubs: renderHubs, turnos: renderTurnos, supervisores: renderSupervisores,
    colaboradores: renderColaboradores, datas: renderDatas, buracos: renderBuracos,
    indicadores: renderIndicadores })[aba]();
}

// ---------- Hubs ----------
function renderHubs() {
  const itens = hubsOrdenados().map((h) => {
    const n = cfg.turnos.filter((t) => t.hubId === h.id).length;
    return `<li class="item">
      <input type="text" aria-label="Nome do hub" data-tipo="hub" data-id="${h.id}" data-campo="nome" value="${escapeHtml(h.nome)}">
      <span class="item-meta">${plural(n, 'turno', 'turnos')}, ${totalHub(h.id)} vagas por semana</span>
      <button type="button" class="btn-texto perigo" data-acao="remover-hub" data-id="${h.id}">Remover</button>
    </li>`;
  }).join('');
  el.conteudo.innerHTML = `
    ${cabecalho('Hubs', 'As unidades que têm escala. Cada hub tem seus próprios turnos e vagas.')}
    <form class="linha-add" data-form="hub">
      <label class="sr" for="novoHub">Nome do novo hub</label>
      <input type="text" id="novoHub" placeholder="Nome do hub, ex: Sion" required>
      <button class="btn-primario" type="submit">Adicionar hub</button>
    </form>
    ${cfg.hubs.length ? `<ul class="lista">${itens}</ul>` : '<p class="vazio">Nenhum hub cadastrado. Adicione o primeiro acima.</p>'}`;
}

// ---------- Turnos ----------
function linhaTurno(t) {
  const vagas = t.vagas || [0, 0, 0, 0, 0, 0, 0];
  const base = `data-tipo="turno" data-id="${t.id}"`;
  return `<tr class="faixa-${faixaDoDia(t.inicio)}" data-linha="${t.id}">
    <td class="col-nome"><input type="text" class="in-nome" placeholder="Nome, ex: Almoço" aria-label="Nome do turno" ${base} data-campo="nome" value="${escapeHtml(t.nome)}"></td>
    <td><input type="text" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="00:00"
      class="campo-hora" aria-label="Início" ${base} data-campo="inicio" value="${t.inicio}"></td>
    <td><input type="text" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="00:00"
      class="campo-hora" aria-label="Fim" ${base} data-campo="fim" value="${t.fim}"></td>
    <td class="col-todos"><input type="number" min="0" max="99" inputmode="numeric" placeholder="–" aria-label="Mesmo número de vagas em todos os dias" ${base} data-campo="todos"></td>
    ${vagas.map((v, i) => `<td><input type="number" min="0" max="99" inputmode="numeric" aria-label="Vagas ${DIAS_LONGO[i]}" ${base} data-campo="vaga" data-dia="${i}" value="${v}"></td>`).join('')}
    <td class="col-total" data-total="${t.id}">${vagasSemana(t)}</td>
    <td class="col-acoes">
      <button type="button" class="btn-texto" data-acao="duplicar-turno" data-id="${t.id}">Duplicar</button>
      <button type="button" class="btn-texto perigo" data-acao="remover-turno" data-id="${t.id}">Remover</button>
    </td>
  </tr>`;
}

function renderTurnos() {
  const cab = cabecalho('Turnos e vagas',
    'Para cada hub, defina os turnos e quantas pessoas cada um precisa em cada dia da semana. Use 0 nos dias em que o turno não acontece.');
  if (!cfg.hubs.length) {
    el.conteudo.innerHTML = `${cab}<p class="vazio">Cadastre um hub primeiro, na aba Hubs.</p>`;
    return;
  }
  if (!cfg.hubs.some((h) => h.id === hubTurnos)) hubTurnos = hubsOrdenados()[0].id;
  const turnos = ordenaTurnos(cfg.turnos.filter((t) => t.hubId === hubTurnos));
  el.conteudo.innerHTML = `${cab}
    <div class="chips chips-hub" role="group" aria-label="Hub">
      ${hubsOrdenados().map((h) => `<button type="button" class="chip" data-acao="hub-turnos" data-id="${h.id}" aria-pressed="${h.id === hubTurnos}">${escapeHtml(h.nome)}</button>`).join('')}
    </div>
    ${turnos.length ? `<div class="tabela-rolagem"><table class="tabela-turnos">
      <thead><tr>
        <th>Turno</th><th>Início</th><th>Fim</th><th class="col-todos">Todos</th>
        ${DIAS_CURTO.map((d) => `<th>${d}</th>`).join('')}
        <th>Semana</th><th><span class="sr">Ações</span></th>
      </tr></thead>
      <tbody>${turnos.map(linhaTurno).join('')}</tbody>
    </table></div>` : `<p class="vazio">${escapeHtml(hubNome(hubTurnos))} ainda não tem turnos.</p>`}
    <div class="rodape-turnos">
      <button type="button" class="btn-secundario" data-acao="adicionar-turno">Adicionar turno</button>
      <p class="item-meta" data-total-hub>${turnos.length ? `${totalHub(hubTurnos)} vagas por semana neste hub` : ''}</p>
    </div>
    <p class="dica">Turnos que terminam depois da meia-noite (ex: 18:00 às 01:20) funcionam normalmente. Na coluna Todos, digite um número para repetir nos 7 dias.</p>`;
}

function atualizarTotais(t) {
  const cel = el.conteudo.querySelector(`[data-total="${t.id}"]`);
  if (cel) cel.textContent = vagasSemana(t);
  const hub = el.conteudo.querySelector('[data-total-hub]');
  if (hub) hub.textContent = `${totalHub(t.hubId)} vagas por semana neste hub`;
}

// ---------- Supervisores ----------
function renderSupervisores() {
  const hubs = hubsOrdenados();
  const itens = [...cfg.supervisores].sort(porNome).map((s) => `<li class="item item-empilhado">
    <div class="item-linha">
      <input type="text" aria-label="Nome do supervisor" data-tipo="sup" data-id="${s.id}" data-campo="nome" value="${escapeHtml(s.nome)}">
      <button type="button" class="btn-texto perigo" data-acao="remover-sup" data-id="${s.id}">Remover</button>
    </div>
    ${hubs.length ? `<div class="chips" role="group" aria-label="Hubs de ${escapeHtml(s.nome)}">
      ${hubs.map((h) => `<button type="button" class="chip" data-acao="hub-sup" data-id="${s.id}" data-hub="${h.id}" aria-pressed="${(s.hubIds || []).includes(h.id)}">${escapeHtml(h.nome)}</button>`).join('')}
    </div>` : '<p class="item-meta">Cadastre hubs para vincular.</p>'}
  </li>`).join('');
  el.conteudo.innerHTML = `
    ${cabecalho('Supervisores', 'Quem lança a escala. Marque os hubs de cada supervisor; se nenhum estiver marcado, ele vê todos.')}
    <form class="linha-add" data-form="sup">
      <label class="sr" for="novoSup">Nome do novo supervisor</label>
      <input type="text" id="novoSup" placeholder="Nome do supervisor" required>
      <button class="btn-primario" type="submit">Adicionar supervisor</button>
    </form>
    ${cfg.supervisores.length ? `<ul class="lista">${itens}</ul>` : '<p class="vazio">Nenhum supervisor cadastrado.</p>'}`;
}

// ---------- Colaboradores ----------
function renderColaboradores() {
  const opcoesHub = hubsOrdenados().map((h) => `<option value="${h.id}">${escapeHtml(h.nome)}</option>`).join('');
  el.conteudo.innerHTML = `
    ${cabecalho('Colaboradores', 'Cadastre aqui todo colaborador, com o telefone (obrigatório): só quem está cadastrado e com ✅ pode ser lançado na escala, e a central de alertas usa esses números para os avisos do turno. Se alguém aparecer com grafias diferentes nos Indicadores, use o campo "Outras grafias já usadas" para unificar. Marque como supervisor quem fica na operação de forma sobressalente: quando a folga dele for lançada e a vaga ficar vazia, ela não conta como furo na escala. Marque como fixo quem tem um padrão de dias da semana + 1 turno sempre igual, para gerar a escala-base automaticamente.')}
    <form class="add-colabs" data-form="colab">
      <label class="campo campo-largo">
        <span>Nome e telefone, um por linha (telefone obrigatório)</span>
        <textarea id="novosColabs" rows="3" placeholder="Caio - (31) 99999-0000&#10;Rafael - 31 98888-1111" required></textarea>
      </label>
      <label class="campo">
        <span>Hub</span>
        <select id="hubNovosColabs"><option value="">Qualquer hub</option>${opcoesHub}</select>
      </label>
      <button class="btn-primario" type="submit">Adicionar</button>
    </form>
    <div class="lista-cab">
      <h3>${plural(cfg.colaboradores.length, 'colaborador', 'colaboradores')}</h3>
      <label class="sr" for="buscaColab">Buscar colaborador</label>
      <input type="search" id="buscaColab" placeholder="Buscar" value="${escapeHtml(filtroColab)}">
    </div>
    <div class="lista-cab"><button type="button" class="btn-texto" data-acao="importar-tel">Importar telefones já cadastrados na central</button><span class="item-meta" id="resumoTel"></span></div>
    <ul class="lista" id="listaColabs"></ul>
    ${htmlGeracaoBase()}`;
  renderListaColabs();
}

function painelFixo(c) {
  if (!c.fixo) return '';
  if (!c.hubId) return '<div class="fixo-painel"><p class="item-meta">Defina o hub acima para configurar o padrão fixo.</p></div>';
  const turnos = ordenaTurnos(cfg.turnos.filter((t) => t.hubId === c.hubId));
  if (!turnos.length) return '<div class="fixo-painel"><p class="item-meta">Esse hub ainda não tem turnos cadastrados.</p></div>';
  const dias = c.diasFixos || [false, true, true, true, true, true, false];
  return `<div class="fixo-painel">
    <label class="campo campo-inline">
      <span>Turno fixo</span>
      <select aria-label="Turno fixo de ${escapeHtml(c.nome)}" data-tipo="colab" data-id="${c.id}" data-campo="turnoFixo">
        <option value="">Escolha o turno</option>
        ${turnos.map((t) => `<option value="${t.id}"${t.id === c.turnoFixoId ? ' selected' : ''}>${escapeHtml(t.nome)} (${t.inicio}–${t.fim})</option>`).join('')}
      </select>
    </label>
    <div class="chips chips-dias" role="group" aria-label="Dias fixos de ${escapeHtml(c.nome)}">
      ${DIAS_CURTO.map((d, i) => `<button type="button" class="chip" data-acao="colab-dia" data-id="${c.id}" data-dia="${i}"
        aria-pressed="${Boolean(dias[i])}">${d}</button>`).join('')}
    </div>
  </div>`;
}

function garantirDatasGeracao() {
  if (!geracaoEstado.inicio) geracaoEstado.inicio = isoDate(new Date());
  if (!geracaoEstado.fim) geracaoEstado.fim = isoDate(addDays(new Date(), 6));
}

function htmlGeracaoBase() {
  garantirDatasGeracao();
  const hubs = hubsOrdenados();
  const fixos = cfg.colaboradores.filter((c) => c.fixo && c.turnoFixoId && c.hubId && (c.diasFixos || []).some(Boolean));
  return `<div class="geracao-base">
    <h3>Gerar escala-base</h3>
    <p class="item-meta">Preenche automaticamente as vagas ainda vazias dos colaboradores fixos, no período escolhido. Não mexe em vagas já preenchidas manualmente, nem duplica quem já está escalado naquele turno e dia.</p>
    ${fixos.length ? '' : '<p class="vazio">Nenhum colaborador fixo configurado ainda — marque "Fixo" em algum colaborador acima.</p>'}
    <div class="geracao-linha">
      <label class="campo"><span>Hub</span>
        <select data-geracao="hub" ${fixos.length ? '' : 'disabled'}>
          <option value="">Todos os hubs</option>
          ${hubs.map((h) => `<option value="${h.id}"${h.id === geracaoEstado.hubId ? ' selected' : ''}>${escapeHtml(h.nome)}</option>`).join('')}
        </select>
      </label>
      <label class="campo"><span>De</span><input type="date" data-geracao="inicio" value="${geracaoEstado.inicio}" ${fixos.length ? '' : 'disabled'}></label>
      <label class="campo"><span>Até</span><input type="date" data-geracao="fim" value="${geracaoEstado.fim}" ${fixos.length ? '' : 'disabled'}></label>
      <button type="button" class="btn-secundario" data-acao="gerar-base" ${fixos.length && !geracaoEstado.gerando ? '' : 'disabled'}>${geracaoEstado.gerando ? 'Gerando…' : 'Gerar'}</button>
    </div>
  </div>`;
}

async function gerarEscalaBase() {
  const fixos = cfg.colaboradores.filter((c) => c.fixo && c.turnoFixoId && c.hubId && (c.diasFixos || []).some(Boolean)
    && (!geracaoEstado.hubId || c.hubId === geracaoEstado.hubId));
  if (!fixos.length) { mostrarStatus('Nenhum colaborador fixo para esse hub.', 'neutro'); return; }
  const ini = parseIso(geracaoEstado.inicio);
  const fim = parseIso(geracaoEstado.fim);
  if (ini > fim) { mostrarStatus('A data final precisa ser igual ou depois da inicial.', 'erro'); return; }

  geracaoEstado.gerando = true;
  renderAba();
  mostrarStatus('Gerando escala-base…', 'neutro', true);
  try {
    const escalas = await lerEscalas(isoDate(ini), isoDate(fim));
    const escritas = [];
    const reservadasNesteLote = new Set();

    for (let d = new Date(ini); d <= fim; d = addDays(d, 1)) {
      const iso = isoDate(d);
      const dow = d.getDay();
      for (const c of fixos) {
        if (!c.diasFixos[dow]) continue;
        const turno = cfg.turnos.find((t) => t.id === c.turnoFixoId && t.hubId === c.hubId);
        if (!turno) continue;
        const n = Number(turno.vagas?.[dow]) || 0;
        if (!n) continue;
        const doc = escalas[`${c.hubId}_${iso}`];
        const salvas = vagasDe(doc?.slots?.[turno.id]);
        const jaEscalado = salvas.some((partes) => partes.some((p) => normalizaNome(p.nome) === normalizaNome(c.nome)));
        if (jaEscalado) continue;
        let indiceLivre = -1;
        for (let i = 0; i < n; i++) {
          const chave = `${c.hubId}_${iso}_${turno.id}_${i}`;
          const ocupada = (salvas[i] || []).length > 0 || reservadasNesteLote.has(chave);
          if (!ocupada) { indiceLivre = i; reservadasNesteLote.add(chave); break; }
        }
        if (indiceLivre === -1) continue;
        escritas.push({
          hubId: c.hubId, dataIso: iso, turnoId: turno.id, indice: indiceLivre,
          dados: { partes: [{ nome: c.nome, tipo: 'fixo', inicio: '', fim: '' }] },
          supervisor: 'Geração automática (escala-base)'
        });
      }
    }

    if (!escritas.length) {
      mostrarStatus('Nada para gerar: já está tudo preenchido, ou não há vagas suficientes no período.', 'neutro');
    } else {
      await salvarVagasEmLote(escritas);
      mostrarStatus(`${plural(escritas.length, 'vaga preenchida', 'vagas preenchidas')} automaticamente.`);
    }
  } catch (err) {
    console.error(err);
    mostrarStatus('Não foi possível gerar a escala-base. Verifique a conexão e tente de novo.', 'erro', true);
  } finally {
    geracaoEstado.gerando = false;
    renderAba();
  }
}

// traz os telefones que os líderes já cadastraram na central de alertas (só para quem está logado como administrador)
async function importarTelefones() {
  mostrarStatus('Buscando os telefones na central…', 'neutro', true);
  try {
    const idToken = await tokenAdmin();
    if (!idToken) throw new Error('sem login');
    const r = await fetch(`${CENTRAL}/api/alerta/tel-export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
    let preenchidos = 0, criados = 0;
    for (const [hubId, lista] of Object.entries(j.hubs || {})) {
      for (const x of lista) {
        const nome = limparNome(x.nome); if (!nome) continue;
        const tel = telNacional(x.tel);
        if (!x.semTel && !telValido(tel)) continue;
        let c = cfg.colaboradores.find((k) => normalizaNome(k.nome) === normalizaNome(nome) && (!k.hubId || k.hubId === hubId))
          || cfg.colaboradores.find((k) => normalizaNome(k.nome) === normalizaNome(nome));
        if (!c) { c = { id: uid('col'), nome, hubId }; cfg.colaboradores.push(c); criados++; }
        if (colabOk(c)) continue;
        if (x.semTel) { c.semTel = true; c.motivoSemTel = x.motivo || 'informado pelo líder'; } else c.tel = tel;
        preenchidos++;
      }
    }
    marcar(); renderAba();
    mostrarStatus(`${preenchidos} telefone${preenchidos === 1 ? '' : 's'} importado${preenchidos === 1 ? '' : 's'}${criados ? `, ${criados} colaborador${criados === 1 ? '' : 'es'} novo${criados === 1 ? '' : 's'}` : ''}. Clique em Salvar para guardar.`, 'ok', true);
  } catch (e) {
    console.error(e);
    mostrarStatus('Não consegui importar da central agora. Tente de novo em instantes.', 'erro', true);
  }
}

function renderListaColabs() {
  const alvo = $('#listaColabs');
  if (!alvo) return;
  const busca = normalizaNome(filtroColab);
  const lista = [...cfg.colaboradores].sort(porNome).filter((c) => !busca || normalizaNome(c.nome).includes(busca));
  if (!cfg.colaboradores.length) { alvo.outerHTML = '<p class="vazio" id="listaColabs">Nenhum colaborador cadastrado.</p>'; return; }
  const resumo = $('#resumoTel'); if (resumo) { const ok = cfg.colaboradores.filter(colabOk).length; resumo.textContent = ` ✅ ${ok} de ${cfg.colaboradores.length} com telefone`; }
  alvo.innerHTML = lista.length ? lista.map((c) => `<li class="item item-empilhado">
    <div class="item-linha">
      <span class="tel-ok" data-ok="${c.id}" title="${colabOk(c) ? 'Telefone cadastrado' : 'Falta o telefone'}">${colabOk(c) ? '✅' : '⚠️'}</span>
      <input type="text" aria-label="Nome do colaborador" data-tipo="colab" data-id="${c.id}" data-campo="nome" value="${escapeHtml(c.nome)}">
      <input type="tel" inputmode="tel" placeholder="(31) 99999-0000" aria-label="Telefone de ${escapeHtml(c.nome)}" data-tipo="colab" data-id="${c.id}" data-campo="tel" value="${escapeHtml(mascaraTel(c.tel))}"${c.semTel ? ' disabled' : ''}>
      <button type="button" class="chip" data-acao="semcel-colab" data-id="${c.id}" aria-pressed="${Boolean(c.semTel)}" title="${escapeHtml(c.motivoSemTel || 'Marque se a pessoa não tem celular')}">Sem celular</button>
      <select aria-label="Hub de ${escapeHtml(c.nome)}" data-tipo="colab" data-id="${c.id}" data-campo="hub">
        <option value="">Qualquer hub</option>
        ${hubsOrdenados().map((h) => `<option value="${h.id}"${h.id === c.hubId ? ' selected' : ''}>${escapeHtml(h.nome)}</option>`).join('')}
      </select>
      <button type="button" class="chip chip-supervisor" data-acao="supervisor-colab" data-id="${c.id}"
        aria-pressed="${c.papel === 'supervisor'}" title="Supervisor sobressalente: folga não conta como furo">Supervisor</button>
      <button type="button" class="chip chip-fixo" data-acao="fixo-colab" data-id="${c.id}"
        aria-pressed="${Boolean(c.fixo)}" title="Tem padrão fixo: dias da semana + 1 turno">Fixo</button>
      <button type="button" class="btn-texto perigo" data-acao="remover-colab" data-id="${c.id}">Remover</button>
    </div>
    <label class="campo campo-apelidos">
      <span>Outras grafias já usadas (opcional, separadas por vírgula)</span>
      <input type="text" placeholder="ex.: Jiule, Julie Helena" data-tipo="colab" data-id="${c.id}" data-campo="apelidos"
        value="${escapeHtml((c.apelidos || []).join(', '))}">
    </label>
    ${painelFixo(c)}
  </li>`).join('') : '<li class="item-meta">Ninguém encontrado com esse nome.</li>';
}

// ---------- Feriados e datas ----------
function renderDatas() {
  const ano = new Date().getFullYear();
  const cadastradas = [...cfg.datasEspeciais].sort((a, b) => a.data.slice(5).localeCompare(b.data.slice(5)));
  const itens = cadastradas.map((d) => `<li class="item">
    <span class="item-data">${formatarData(d)}</span>
    <input type="text" aria-label="Nome da data" data-tipo="data" data-id="${d.id}" data-campo="nome" value="${escapeHtml(d.nome)}">
    <select aria-label="Tipo" data-tipo="data" data-id="${d.id}" data-campo="tipo">${opcoesTipo(d.tipo)}</select>
    <button type="button" class="btn-texto perigo" data-acao="remover-data" data-id="${d.id}">Remover</button>
  </li>`).join('');
  const automaticas = datasDoAno(ano).map((d) => {
    const dt = parseIso(d.data);
    return `<li><span class="item-data">${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}</span> ${escapeHtml(d.nome)} <span class="item-meta">${ROTULO_TIPO[d.tipo]}</span></li>`;
  }).join('');
  el.conteudo.innerHTML = `
    ${cabecalho('Feriados e datas', 'Aparecem marcados no calendário da escala. Os feriados nacionais e as principais datas comemorativas já estão incluídos; cadastre aqui os feriados da cidade e outras datas importantes para a operação.')}
    <form class="add-data" data-form="data">
      <label class="campo"><span>Data</span><input type="date" id="novaDataDia" required></label>
      <label class="campo campo-largo"><span>Nome</span><input type="text" id="novaDataNome" placeholder="Ex: Assunção de Nossa Senhora" required></label>
      <label class="campo"><span>Tipo</span><select id="novaDataTipo">${opcoesTipo('feriado')}</select></label>
      <label class="check"><input type="checkbox" id="novaDataAnual" checked> Repete todo ano</label>
      <button class="btn-primario" type="submit">Adicionar data</button>
    </form>
    ${cadastradas.length ? `<ul class="lista">${itens}</ul>` : '<p class="vazio">Nenhuma data cadastrada por você ainda.</p>'}
    <details class="automaticas">
      <summary>Datas incluídas automaticamente em ${ano}</summary>
      <ul>${automaticas}</ul>
    </details>`;
}

// ---------- Buracos na escala: vagas abertas por operação/hub/data/faixa ----------
function faixaBuracos() {
  if (buracosEstado.modo === 'semana') {
    const ini = startOfWeek(buracosEstado.ref);
    return { ini, fim: addDays(ini, 6) };
  }
  const primeiro = new Date(buracosEstado.ref.getFullYear(), buracosEstado.ref.getMonth(), 1);
  const ultimo = new Date(buracosEstado.ref.getFullYear(), buracosEstado.ref.getMonth() + 1, 0);
  return { ini: primeiro, fim: ultimo, primeiro };
}

function tituloPeriodoBuracos() {
  const { ini, fim, primeiro } = faixaBuracos();
  if (buracosEstado.modo === 'mes') return `${capitalizar(MESES[primeiro.getMonth()])} de ${primeiro.getFullYear()}`;
  const a = ini.getDate(), b = fim.getDate();
  return ini.getMonth() === fim.getMonth()
    ? `${a} a ${b} de ${MESES[fim.getMonth()]}`
    : `${a} de ${MESES[ini.getMonth()]} a ${b} de ${MESES[fim.getMonth()]}`;
}

function assinarBuracos() {
  const { ini, fim } = faixaBuracos();
  const chave = `${isoDate(ini)}|${isoDate(fim)}`;
  if (chave === buracosEstado.chaveFaixa) return;
  buracosEstado.chaveFaixa = chave;
  buracosEstado.cancelar?.();
  buracosEstado.escalas = {};
  buracosEstado.prontas = false;
  buracosEstado.cancelar = ouvirEscalas(isoDate(ini), isoDate(fim), (m) => {
    buracosEstado.escalas = m;
    buracosEstado.prontas = true;
    renderBuracos();
  }, () => mostrarStatus('Não foi possível carregar a escala do período.', 'erro', true));
}

// Para cada dia do período, em cada hub (ou só no filtrado) e cada turno com
// vagas necessárias naquele dia da semana, lista os trechos de horário que
// seguem sem gente suficiente — reaproveitando o mesmo cálculo de cobertura
// usado na página da escala.
function apurarBuracos() {
  const { ini, fim } = faixaBuracos();
  const hubs = buracosEstado.hubId ? hubsOrdenados().filter((h) => h.id === buracosEstado.hubId) : hubsOrdenados();
  const dias = [];
  for (let d = new Date(ini); d <= fim; d = addDays(d, 1)) {
    const iso = isoDate(d);
    const dow = d.getDay();
    const porHub = [];
    for (const hub of hubs) {
      const turnos = ordenaTurnos(cfg.turnos.filter((t) => t.hubId === hub.id));
      const linhas = [];
      for (const t of turnos) {
        if (!Number(t.vagas?.[dow])) continue;
        const vagas = vagasDoTurno(cfg, buracosEstado.escalas, hub.id, t, iso, dow).filter((v) => !v.dispensada);
        if (!vagas.length) continue;
        const agregados = agregarBuracos(vagas.map((v) => v.buracos));
        if (agregados.length) linhas.push({ turno: t, agregados, necessarias: vagas.length });
      }
      if (linhas.length) porHub.push({ hub, linhas });
    }
    if (porHub.length) dias.push({ iso, dt: new Date(d), porHub });
  }
  return dias;
}

// Mesma informação da lista, em texto simples, pronta para colar num grupo.
function textoBuracos(dias, tituloPeriodo) {
  if (!dias.length) return `Buracos na escala — ${tituloPeriodo}\n\nNenhum buraco em aberto nesse período.`;
  const linhas = [`Buracos na escala — ${tituloPeriodo}`, ''];
  for (const { dt, porHub } of dias) {
    linhas.push(`${capitalizar(DIAS_LONGO[dt.getDay()])}, ${dt.getDate()} de ${MESES[dt.getMonth()]}`);
    for (const { hub, linhas: linhasTurno } of porHub) {
      linhas.push(`  ${hub.nome}`);
      for (const { turno, agregados } of linhasTurno) {
        const trechos = agregados.map(([a, b, n]) => `${hhmm(a)}–${hhmm(b)} (falta${n > 1 ? 'm' : ''} ${plural(n, 'pessoa', 'pessoas')})`).join(', ');
        linhas.push(`    ${turno.nome}: ${trechos}`);
      }
    }
    linhas.push('');
  }
  return linhas.join('\n').trim();
}

function htmlListaBuracos() {
  if (!buracosEstado.prontas) return '<p class="carregando">Carregando…</p>';
  const dias = apurarBuracos();
  if (!dias.length) return '<p class="vazio">Nenhum buraco em aberto nesse período — ou nenhuma vaga necessária cadastrada ainda.</p>';
  let totalTrechos = 0, totalMinutos = 0;
  const corpo = dias.map(({ iso, dt, porHub }) => {
    const blocosHub = porHub.map(({ hub, linhas }) => {
      const blocosTurno = linhas.map(({ turno, agregados, necessarias }) => {
        const trechos = agregados.map(([a, b, n]) => {
          totalTrechos++; totalMinutos += (b - a) * n;
          return `<li class="buraco-trecho"><span class="buraco-horario">${hhmm(a)}–${hhmm(b)}</span>
            <span class="buraco-qtd">falta${n > 1 ? 'm' : ''} ${plural(n, 'pessoa', 'pessoas')}</span></li>`;
        }).join('');
        return `<div class="buraco-turno">
          <p class="buraco-turno-titulo">${escapeHtml(turno.nome)} <span class="item-meta">(${plural(necessarias, 'vaga necessária', 'vagas necessárias')})</span></p>
          <ul class="buraco-trechos">${trechos}</ul>
        </div>`;
      }).join('');
      return `<div class="buraco-hub"><h4>${escapeHtml(hub.nome)}</h4>${blocosTurno}</div>`;
    }).join('');
    return `<div class="buraco-dia">
      <h3>${DIAS_LONGO[dt.getDay()]}, ${dt.getDate()} de ${MESES[dt.getMonth()]}</h3>
      ${blocosHub}
    </div>`;
  }).join('');
  return `<p class="resumo-buracos">${plural(totalTrechos, 'trecho aberto', 'trechos abertos')} no período, somando ${horas(totalMinutos)} de vagas descobertas.</p>${corpo}`;
}

function renderBuracos() {
  const hubs = hubsOrdenados();
  if (!hubs.length) {
    el.conteudo.innerHTML = `${cabecalho('Buracos na escala', 'Mostra, por hub e por dia, os horários que ainda precisam de gente.')}<p class="vazio">Cadastre um hub primeiro, na aba Hubs.</p>`;
    return;
  }
  assinarBuracos();
  el.conteudo.innerHTML = `
    ${cabecalho('Buracos na escala', 'Para cada operação, mostra os trechos de horário que ainda não têm gente suficiente escalada, somando furos de vagas vazias e de vagas parcialmente cobertas.')}
    <div class="chips chips-hub" role="group" aria-label="Hub">
      <button type="button" class="chip" data-acao="buracos-hub" data-id="" aria-pressed="${!buracosEstado.hubId}">Todos os hubs</button>
      ${hubs.map((h) => `<button type="button" class="chip" data-acao="buracos-hub" data-id="${h.id}" aria-pressed="${h.id === buracosEstado.hubId}">${escapeHtml(h.nome)}</button>`).join('')}
    </div>
    <div class="barra-periodo">
      <div class="nav-periodo">
        <button type="button" class="btn-icone" data-acao="buracos-anterior" aria-label="Período anterior">‹</button>
        <button type="button" class="btn-icone" data-acao="buracos-proximo" aria-label="Próximo período">›</button>
        <h3>${tituloPeriodoBuracos()}</h3>
      </div>
      <div class="barra-dir">
        <button type="button" class="btn-texto" data-acao="buracos-copiar">Copiar lista</button>
        <div class="alternador" role="group" aria-label="Visualização">
          <button type="button" data-acao="buracos-modo" data-valor="semana" aria-pressed="${buracosEstado.modo === 'semana'}">Semana</button>
          <button type="button" data-acao="buracos-modo" data-valor="mes" aria-pressed="${buracosEstado.modo === 'mes'}">Mês</button>
        </div>
      </div>
    </div>
    <div id="buracosLista">${htmlListaBuracos()}</div>`;
}

// ---------- Indicadores de confiabilidade ----------
const CLASSES_INDICADOR = ['Confiável', 'Em observação', 'Não confiável', 'Sem dados suficientes'];

function faixaIndicadores() {
  if (indicadoresEstado.modo === 'semana') {
    const ini = startOfWeek(indicadoresEstado.ref);
    return { ini, fim: addDays(ini, 6) };
  }
  const primeiro = new Date(indicadoresEstado.ref.getFullYear(), indicadoresEstado.ref.getMonth(), 1);
  const ultimo = new Date(indicadoresEstado.ref.getFullYear(), indicadoresEstado.ref.getMonth() + 1, 0);
  return { ini: primeiro, fim: ultimo, primeiro };
}

function tituloPeriodoIndicadores() {
  const { ini, fim, primeiro } = faixaIndicadores();
  if (indicadoresEstado.modo === 'mes') return `${capitalizar(MESES[primeiro.getMonth()])} de ${primeiro.getFullYear()}`;
  const a = ini.getDate(), b = fim.getDate();
  return ini.getMonth() === fim.getMonth()
    ? `${a} a ${b} de ${MESES[fim.getMonth()]}`
    : `${a} de ${MESES[ini.getMonth()]} a ${b} de ${MESES[fim.getMonth()]}`;
}

function assinarIndicadores() {
  const { ini, fim } = faixaIndicadores();
  const chave = `${isoDate(ini)}|${isoDate(fim)}`;
  if (chave === indicadoresEstado.chaveFaixa) return;
  indicadoresEstado.chaveFaixa = chave;
  indicadoresEstado.cancelar?.();
  indicadoresEstado.escalas = {};
  indicadoresEstado.prontas = false;
  indicadoresEstado.cancelar = ouvirEscalas(isoDate(ini), isoDate(fim), (m) => {
    indicadoresEstado.escalas = m;
    indicadoresEstado.prontas = true;
    renderIndicadores();
  }, () => mostrarStatus('Não foi possível carregar a escala do período.', 'erro', true));
}

// Para cada pessoa que apareceu escalada no período (em qualquer hub, ou só
// no filtrado), calcula: quantas vezes foi escalada, % de confirmação de
// horário e % de comparecimento (excluindo quem ainda está pendente de
// marcação), e a classificação conforme os limites configuráveis.
function apurarIndicadores() {
  const { ini, fim } = faixaIndicadores();
  const hubs = indicadoresEstado.hubId ? hubsOrdenados().filter((h) => h.id === indicadoresEstado.hubId) : hubsOrdenados();
  const porPessoa = new Map();
  // Três formas de reconhecer a mesma pessoa, da mais certa para a mais
  // arriscada: 1) grafia cadastrada em "outras grafias" do colaborador (match
  // exato, sem chance de juntar gente diferente); 2) nome parecido com um
  // nome cadastrado; 3) nome parecido com outra grafia já vista nesta mesma
  // apuração (para quem nem está mais cadastrado). As duas últimas usam
  // distância de edição com tolerância curta, pra não juntar pessoas
  // diferentes com nomes parecidos (ex.: "Maria Silva" e "Maria Souza").
  const nomesCadastro = (cfg.colaboradores || []).map((c) => c.nome);
  const porApelido = new Map();
  for (const c of cfg.colaboradores || []) {
    for (const apelido of c.apelidos || []) {
      const chaveApelido = normalizaNome(apelido);
      if (chaveApelido) porApelido.set(chaveApelido, normalizaNome(c.nome));
    }
  }
  const nomesVistos = [];
  const chaveCanonica = (nomeBruto) => {
    const direta = normalizaNome(nomeBruto);
    if (porPessoa.has(direta)) return direta;
    if (porApelido.has(direta)) return porApelido.get(direta);
    const doCadastro = nomeParecido(nomeBruto, nomesCadastro);
    if (doCadastro) return normalizaNome(doCadastro);
    const parecido = nomeParecido(nomeBruto, nomesVistos);
    if (parecido) return normalizaNome(parecido);
    return direta;
  };
  const pessoa = (nomeBruto) => {
    const chave = chaveCanonica(nomeBruto);
    if (!porPessoa.has(chave)) {
      const doCadastro = nomesCadastro.find((n) => normalizaNome(n) === chave);
      const nomeExibicao = doCadastro || nomeBruto;
      nomesVistos.push(nomeExibicao);
      porPessoa.set(chave, { nome: nomeExibicao, hubs: new Set(), escalado: 0, confirmados: 0, sim: 0, nao: 0 });
    }
    return porPessoa.get(chave);
  };

  for (let d = new Date(ini); d <= fim; d = addDays(d, 1)) {
    const iso = isoDate(d);
    const dow = d.getDay();
    for (const hub of hubs) {
      for (const t of cfg.turnos.filter((x) => x.hubId === hub.id)) {
        const n = Number(t.vagas?.[dow]) || 0;
        if (!n) continue;
        const doc = indicadoresEstado.escalas[`${hub.id}_${iso}`];
        const salvas = vagasDe(doc?.slots?.[t.id]);
        const confirmSet = new Set((doc?.confirmacoes?.[t.id] || []).map(normalizaNome));
        const simSet = new Set((doc?.compareceram?.[t.id] || []).map(normalizaNome));
        const naoSet = new Set((doc?.faltas?.[t.id] || []).map(normalizaNome));
        for (let i = 0; i < n; i++) {
          for (const p of (salvas[i] || [])) {
            if (!p.nome) continue;
            const pe = pessoa(p.nome);
            pe.hubs.add(hub.nome);
            pe.escalado++;
            const chaveNome = normalizaNome(p.nome);
            if (confirmSet.has(chaveNome)) pe.confirmados++;
            if (naoSet.has(chaveNome)) pe.nao++;
            else if (simSet.has(chaveNome)) pe.sim++;
          }
        }
      }
    }
  }

  const limites = cfg.limitesConfiabilidade || { confiavel: 90, naoConfiavel: 70 };
  return [...porPessoa.values()].map((pe) => {
    const pctConfirmacao = pe.escalado ? Math.round((pe.confirmados / pe.escalado) * 100) : null;
    const marcadas = pe.sim + pe.nao;
    const pctComparecimento = marcadas ? Math.round((pe.sim / marcadas) * 100) : null;
    let classe = 'Sem dados suficientes';
    if (pctConfirmacao !== null && pctComparecimento !== null) {
      if (pctConfirmacao < limites.naoConfiavel || pctComparecimento < limites.naoConfiavel) classe = 'Não confiável';
      else if (pctConfirmacao >= limites.confiavel && pctComparecimento >= limites.confiavel) classe = 'Confiável';
      else classe = 'Em observação';
    }
    return { nome: pe.nome, hubs: [...pe.hubs].sort((a, b) => a.localeCompare(b, 'pt-BR')),
      escalado: pe.escalado, pctConfirmacao, pctComparecimento, classe };
  }).sort(porNome);
}

function classeCss(classe) {
  return { 'Confiável': 'confiavel', 'Em observação': 'observacao', 'Não confiável': 'nao-confiavel', 'Sem dados suficientes': 'sem-dados' }[classe];
}

function htmlTabelaIndicadores() {
  if (!indicadoresEstado.prontas) return '<p class="carregando">Carregando…</p>';
  let pessoas = apurarIndicadores();
  if (indicadoresEstado.filtro) pessoas = pessoas.filter((p) => p.classe === indicadoresEstado.filtro);
  if (!pessoas.length) return '<p class="vazio">Ninguém escalado nesse período (ou nesse filtro).</p>';
  const linhas = pessoas.map((p) => `<tr>
    <td>${escapeHtml(p.nome)}</td>
    <td class="item-meta">${p.hubs.map(escapeHtml).join(', ')}</td>
    <td>${p.escalado}</td>
    <td>${p.pctConfirmacao === null ? '—' : `${p.pctConfirmacao}%`}</td>
    <td>${p.pctComparecimento === null ? '—' : `${p.pctComparecimento}%`}</td>
    <td><span class="selo-indicador ${classeCss(p.classe)}">${p.classe}</span></td>
  </tr>`).join('');
  return `<div class="tabela-rolagem"><table class="tabela-indicadores">
    <thead><tr><th>Nome</th><th>Hub(s)</th><th>Vezes escalado</th><th>% confirmação</th><th>% comparecimento</th><th>Classificação</th></tr></thead>
    <tbody>${linhas}</tbody>
  </table></div>`;
}

function renderIndicadores() {
  const hubs = hubsOrdenados();
  if (!hubs.length) {
    el.conteudo.innerHTML = `${cabecalho('Indicadores de confiabilidade', 'Mede, por colaborador, quanto ele confirma o horário combinado e comparece de fato.')}<p class="vazio">Cadastre um hub primeiro, na aba Hubs.</p>`;
    return;
  }
  assinarIndicadores();
  const limites = cfg.limitesConfiabilidade || { confiavel: 90, naoConfiavel: 70 };
  el.conteudo.innerHTML = `
    ${cabecalho('Indicadores de confiabilidade', '% de confirmação = confirmações / vezes escalado. % de comparecimento = compareceu / (compareceu + não compareceu), sem contar quem ainda está pendente de marcação. Os dois vêm das marcações feitas direto na grade da escala.')}
    <div class="limites-indicador">
      <label class="campo campo-inline"><span>Confiável a partir de (%)</span>
        <input type="number" min="0" max="100" data-tipo="limites" data-campo="confiavel" value="${limites.confiavel}"></label>
      <label class="campo campo-inline"><span>Não confiável abaixo de (%)</span>
        <input type="number" min="0" max="100" data-tipo="limites" data-campo="naoConfiavel" value="${limites.naoConfiavel}"></label>
    </div>
    <div class="chips chips-hub" role="group" aria-label="Hub">
      <button type="button" class="chip" data-acao="indic-hub" data-id="" aria-pressed="${!indicadoresEstado.hubId}">Todos os hubs</button>
      ${hubs.map((h) => `<button type="button" class="chip" data-acao="indic-hub" data-id="${h.id}" aria-pressed="${h.id === indicadoresEstado.hubId}">${escapeHtml(h.nome)}</button>`).join('')}
    </div>
    <div class="chips chips-classe" role="group" aria-label="Classificação">
      <button type="button" class="chip" data-acao="indic-filtro" data-valor="" aria-pressed="${!indicadoresEstado.filtro}">Todas</button>
      ${CLASSES_INDICADOR.map((c) => `<button type="button" class="chip" data-acao="indic-filtro" data-valor="${c}" aria-pressed="${indicadoresEstado.filtro === c}">${c}</button>`).join('')}
    </div>
    <div class="barra-periodo">
      <div class="nav-periodo">
        <button type="button" class="btn-icone" data-acao="indic-anterior" aria-label="Período anterior">‹</button>
        <button type="button" class="btn-icone" data-acao="indic-proximo" aria-label="Próximo período">›</button>
        <h3>${tituloPeriodoIndicadores()}</h3>
      </div>
      <div class="alternador" role="group" aria-label="Visualização">
        <button type="button" data-acao="indic-modo" data-valor="semana" aria-pressed="${indicadoresEstado.modo === 'semana'}">Semana</button>
        <button type="button" data-acao="indic-modo" data-valor="mes" aria-pressed="${indicadoresEstado.modo === 'mes'}">Mês</button>
      </div>
    </div>
    <div id="indicadoresLista">${htmlTabelaIndicadores()}</div>`;
}

// ================= eventos do conteúdo =================
el.conteudo.addEventListener('input', (e) => {
  const i = e.target;
  if (i.id === 'buscaColab') { filtroColab = i.value; renderListaColabs(); return; }
  if (i.dataset.geracao) {
    if (i.dataset.geracao === 'hub') geracaoEstado.hubId = i.value;
    else if (i.dataset.geracao === 'inicio') geracaoEstado.inicio = i.value;
    else if (i.dataset.geracao === 'fim') geracaoEstado.fim = i.value;
    return;
  }
  const { tipo, id, campo } = i.dataset;
  if (!tipo) return;

  if (tipo === 'hub') cfg.hubs.find((x) => x.id === id).nome = i.value;
  else if (tipo === 'sup') cfg.supervisores.find((x) => x.id === id).nome = i.value;
  else if (tipo === 'colab') {
    const c = cfg.colaboradores.find((x) => x.id === id);
    if (campo === 'hub') c.hubId = i.value;
    else if (campo === 'turnoFixo') c.turnoFixoId = i.value;
    else if (campo === 'tel') {
      c.tel = telNacional(i.value); i.value = mascaraTel(c.tel);
      const s = document.querySelector(`[data-ok="${id}"]`); if (s) s.textContent = colabOk(c) ? '✅' : '⚠️';
      const r = $('#resumoTel'); if (r) r.textContent = ` ✅ ${cfg.colaboradores.filter(colabOk).length} de ${cfg.colaboradores.length} com telefone`;
    } else if (campo === 'apelidos') {
      c.apelidos = i.value.split(',').map(limparNome).filter(Boolean);
    } else c.nome = i.value;
  } else if (tipo === 'data') {
    cfg.datasEspeciais.find((x) => x.id === id)[campo] = i.value;
  } else if (tipo === 'turno') {
    const t = cfg.turnos.find((x) => x.id === id);
    if (campo === 'vaga') {
      t.vagas[Number(i.dataset.dia)] = numero(i.value);
      atualizarTotais(t);
    } else if (campo === 'todos') {
      if (i.value === '') return;
      const n = numero(i.value);
      t.vagas = Array(7).fill(n);
      i.closest('tr').querySelectorAll('[data-campo="vaga"]').forEach((x) => { x.value = n; });
      atualizarTotais(t);
    } else {
      t[campo] = i.value;
      if (campo === 'inicio') i.closest('tr').className = `faixa-${faixaDoDia(i.value)}`;
    }
  } else if (tipo === 'limites') {
    cfg.limitesConfiabilidade = cfg.limitesConfiabilidade || { confiavel: 90, naoConfiavel: 70 };
    cfg.limitesConfiabilidade[campo] = Math.max(0, Math.min(100, parseInt(i.value, 10) || 0));
  }
  marcar();
});

el.conteudo.addEventListener('submit', (e) => {
  e.preventDefault();
  const tipo = e.target.dataset.form;

  if (tipo === 'hub') {
    const nome = limparNome($('#novoHub').value);
    if (!nome) return;
    if (cfg.hubs.some((h) => normalizaNome(h.nome) === normalizaNome(nome))) {
      mostrarStatus('Já existe um hub com esse nome.', 'erro');
      return;
    }
    cfg.hubs.push({ id: uid('hub'), nome });
    renderAba();
    $('#novoHub').focus();
  }

  if (tipo === 'sup') {
    const nome = limparNome($('#novoSup').value);
    if (!nome) return;
    cfg.supervisores.push({ id: uid('sup'), nome, hubIds: [] });
    renderAba();
    $('#novoSup').focus();
  }

  if (tipo === 'colab') {
    const hubId = $('#hubNovosColabs').value;
    const linhas = $('#novosColabs').value.split('\n').map((l) => l.trim()).filter(Boolean);
    const nomes = [], ruins = [];
    for (const l of linhas) {
      const m = /^(.*?)[\s,;|–-]*((?:\+?55)?\s*\(?\d{2}\)?[\s.-]*9?[\s.-]?\d{4}[\s.-]?\d{4})\s*$/.exec(l);
      const nome = m && limparNome(m[1]);
      if (!m || !nome || !telValido(m[2])) { ruins.push(l); continue; }
      nomes.push({ nome, tel: telNacional(m[2]) });
    }
    if (ruins.length) {
      mostrarStatus(`Informe o nome e o telefone (com DDD) em cada linha. Revise: ${ruins.slice(0, 3).join(' | ')}${ruins.length > 3 ? '…' : ''}`, 'erro', true);
      return;
    }
    const existentes = new Set(cfg.colaboradores.map((c) => normalizaNome(c.nome)));
    let novos = 0;
    for (const { nome, tel } of nomes) {
      if (existentes.has(normalizaNome(nome))) continue;
      existentes.add(normalizaNome(nome));
      cfg.colaboradores.push({ id: uid('col'), nome, hubId, tel });
      novos++;
    }
    const repetidos = nomes.length - novos;
    renderAba();
    $('#hubNovosColabs').value = hubId;
    mostrarStatus(`${plural(novos, 'colaborador adicionado', 'colaboradores adicionados')}${repetidos ? `, ${repetidos} já existia${repetidos > 1 ? 'm' : ''}` : ''}`, novos ? 'ok' : 'neutro');
  }

  if (tipo === 'data') {
    const data = $('#novaDataDia').value;
    const nome = limparNome($('#novaDataNome').value);
    if (!data || !nome) return;
    cfg.datasEspeciais.push({ id: uid('data'), data, nome, tipo: $('#novaDataTipo').value, anual: $('#novaDataAnual').checked });
    renderAba();
  }
  marcar();
});

el.conteudo.addEventListener('click', (e) => {
  const b = e.target.closest('[data-acao]');
  if (!b) return;
  const { acao, id } = b.dataset;
  let focar = '';

  switch (acao) {
    case 'remover-hub': {
      const h = cfg.hubs.find((x) => x.id === id);
      const n = cfg.turnos.filter((t) => t.hubId === id).length;
      if (!confirm(`Remover o hub ${h.nome}?${n ? ` ${plural(n, 'turno', 'turnos')} dele também ${n > 1 ? 'serão removidos' : 'será removido'}.` : ''}`)) return;
      cfg.hubs = cfg.hubs.filter((x) => x.id !== id);
      cfg.turnos = cfg.turnos.filter((t) => t.hubId !== id);
      cfg.supervisores.forEach((s) => { s.hubIds = (s.hubIds || []).filter((x) => x !== id); });
      cfg.colaboradores.forEach((c) => { if (c.hubId === id) c.hubId = ''; });
      break;
    }
    case 'hub-turnos':
      hubTurnos = id;
      break;
    case 'adicionar-turno': {
      const t = { id: uid('turno'), hubId: hubTurnos, nome: '', inicio: '09:00', fim: '15:00', vagas: [1, 1, 1, 1, 1, 1, 1] };
      cfg.turnos.push(t);
      focar = `[data-id="${t.id}"][data-campo="nome"]`;
      break;
    }
    case 'duplicar-turno': {
      const t = cfg.turnos.find((x) => x.id === id);
      const copia = { ...t, id: uid('turno'), nome: `${t.nome} (cópia)`, vagas: [...t.vagas] };
      cfg.turnos.push(copia);
      focar = `[data-id="${copia.id}"][data-campo="nome"]`;
      break;
    }
    case 'remover-turno': {
      const t = cfg.turnos.find((x) => x.id === id);
      if (!confirm(`Remover o turno ${t.nome || 'sem nome'}? Os nomes já lançados nele deixam de aparecer na escala.`)) return;
      cfg.turnos = cfg.turnos.filter((x) => x.id !== id);
      break;
    }
    case 'supervisor-colab': {
      const c = cfg.colaboradores.find((x) => x.id === id);
      c.papel = c.papel === 'supervisor' ? '' : 'supervisor';
      b.setAttribute('aria-pressed', String(c.papel === 'supervisor'));
      marcar();
      return; // sem redesenhar, para manter o foco no botão
    }
    case 'hub-sup': {
      const s = cfg.supervisores.find((x) => x.id === id);
      const hub = b.dataset.hub;
      s.hubIds = s.hubIds || [];
      s.hubIds = s.hubIds.includes(hub) ? s.hubIds.filter((x) => x !== hub) : [...s.hubIds, hub];
      b.setAttribute('aria-pressed', String(s.hubIds.includes(hub)));
      marcar();
      return; // sem redesenhar, para manter o foco no botão
    }
    case 'remover-sup': {
      const s = cfg.supervisores.find((x) => x.id === id);
      if (!confirm(`Remover o supervisor ${s.nome}?`)) return;
      cfg.supervisores = cfg.supervisores.filter((x) => x.id !== id);
      break;
    }
    case 'semcel-colab': {
      const c = cfg.colaboradores.find((x) => x.id === id);
      if (c.semTel) { c.semTel = false; c.motivoSemTel = ''; } else {
        const motivo = (prompt(`Por que ${c.nome} não tem celular? (ex.: não usa celular)`) || '').trim();
        if (motivo.length < 3) return;
        c.semTel = true; c.motivoSemTel = motivo; c.tel = '';
      }
      break;
    }
    case 'importar-tel':
      importarTelefones();
      return;
    case 'remover-colab':
      cfg.colaboradores = cfg.colaboradores.filter((x) => x.id !== id);
      break;
    case 'fixo-colab': {
      const c = cfg.colaboradores.find((x) => x.id === id);
      c.fixo = !c.fixo;
      if (c.fixo && !c.diasFixos) c.diasFixos = [false, true, true, true, true, true, false];
      break;
    }
    case 'colab-dia': {
      const c = cfg.colaboradores.find((x) => x.id === id);
      const dia = Number(b.dataset.dia);
      c.diasFixos = c.diasFixos || [false, true, true, true, true, true, false];
      c.diasFixos[dia] = !c.diasFixos[dia];
      b.setAttribute('aria-pressed', String(c.diasFixos[dia]));
      marcar();
      return; // sem redesenhar, para manter o foco no botão
    }
    case 'gerar-base':
      gerarEscalaBase();
      return;
    case 'indic-hub':
      indicadoresEstado.hubId = id;
      renderIndicadores();
      return;
    case 'indic-filtro':
      indicadoresEstado.filtro = b.dataset.valor;
      renderIndicadores();
      return;
    case 'indic-modo':
      indicadoresEstado.modo = b.dataset.valor;
      indicadoresEstado.chaveFaixa = '';
      renderIndicadores();
      return;
    case 'indic-anterior':
    case 'indic-proximo': {
      const passo = acao === 'indic-proximo' ? 1 : -1;
      indicadoresEstado.ref = indicadoresEstado.modo === 'semana' ? addDays(indicadoresEstado.ref, passo * 7)
        : new Date(indicadoresEstado.ref.getFullYear(), indicadoresEstado.ref.getMonth() + passo, 1);
      indicadoresEstado.chaveFaixa = '';
      renderIndicadores();
      return;
    }
    case 'remover-data':
      cfg.datasEspeciais = cfg.datasEspeciais.filter((x) => x.id !== id);
      break;
    case 'buracos-hub':
      buracosEstado.hubId = id;
      renderBuracos();
      return;
    case 'buracos-modo':
      buracosEstado.modo = b.dataset.valor;
      buracosEstado.chaveFaixa = '';
      renderBuracos();
      return;
    case 'buracos-anterior':
    case 'buracos-proximo': {
      const passo = acao === 'buracos-proximo' ? 1 : -1;
      buracosEstado.ref = buracosEstado.modo === 'semana' ? addDays(buracosEstado.ref, passo * 7)
        : new Date(buracosEstado.ref.getFullYear(), buracosEstado.ref.getMonth() + passo, 1);
      buracosEstado.chaveFaixa = '';
      renderBuracos();
      return;
    }
    case 'buracos-copiar': {
      const texto = textoBuracos(apurarBuracos(), tituloPeriodoBuracos());
      copiarTexto(texto)
        .then(() => mostrarStatus('Lista copiada — já pode colar no grupo.'))
        .catch(() => mostrarStatus('Não foi possível copiar. Tente selecionar e copiar manualmente.', 'erro', true));
      return;
    }
    default:
      return;
  }
  renderAba();
  marcar();
  if (focar) el.conteudo.querySelector(focar)?.focus();
});
