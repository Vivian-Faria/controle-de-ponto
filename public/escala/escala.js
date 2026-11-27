import { docFor } from '/orion/mod/docproxy.js';
const document = docFor('escala-lanc');
// Página 2 — Escala: o supervisor escolhe seu nome e o hub e preenche as vagas.
import {
  configuracaoPronta, ouvirConfig, ouvirEscalas, salvarVaga, lancarAusencia, removerAusencia,
  ouvirAprovacoes, aprovarLancamento
} from './db.js';
import { entrar, sair, aoMudarLogin } from './auth.js';
import { marcosDoDia, ROTULO_TIPO } from './feriados.js';
import {
  DIAS_CURTO, DIAS_LONGO, MESES, isoDate, parseIso, addDays, startOfWeek, capitalizar,
  ordenaTurnos, faixaDoDia, normalizaNome, limparNome, sobrepoe, escapeHtml, porNome,
  vagasDe, plural, criarStatus, cobertura, ehDividida, hhmm, toMin, faixaCurta, horaCurta,
  vagasDoTurno
} from './utils.js';

const $ = (s) => document.querySelector(s);
const el = {
  selSup: $('#selSupervisor'), selHub: $('#selHub'), aviso: $('#aviso'), painel: $('#painel'),
  quadro: $('#quadro'), titulo: $('#tituloPeriodo'), resumo: $('#resumoPeriodo'),
  dlg: $('#dlgDia'), dlgTitulo: $('#dlgTitulo'), dlgCorpo: $('#dlgCorpo'),
  lembrete: $('#lembrete'),
  btnAdmin: $('#btnAdmin'), dlgAdmin: $('#dlgAdmin'), formAdmin: $('#formAdmin'),
  senhaAdmin: $('#senhaAdmin'), erroAdmin: $('#erroAdmin'),
  status: $('#status')
};
const mostrarStatus = criarStatus($('#status'));

// ---- telefones dos colaboradores (a central de alertas guarda os números; aqui só se pergunta quem ainda está sem) ----
const CENTRAL = location.origin;
const MSG_CADASTRO = 'Cadastre o telefone pelo link de equipe que a central enviou no seu WhatsApp (se perdeu, peça à gestão). Quem não tem celular: marque "Sem celular" naquela página.';
const cadCache = { chave: '', faltam: [] };
// devolve a lista de nomes sem telefone, ou null se a central não respondeu (nesse caso nada é bloqueado)
async function checarTelefones(nomes) {
  try {
    const r = await fetch(`${CENTRAL}/api/alerta/checar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ h: estado.hubId, nomes }), signal: AbortSignal.timeout(6000)
    });
    const j = await r.json();
    return r.ok && Array.isArray(j.faltam) ? j.faltam : null;
  } catch { return null; }
}

// Abaixo desta largura (celular e tablet) a semana mostra um dia por vez
const TELA_COMPACTA = matchMedia('(max-width: 1099px)');

const params = new URLSearchParams(location.search);
const estado = {
  cfg: null,
  supId: params.get('sup') || '',
  hubId: params.get('hub') || '',
  modo: params.get('modo') === 'mes' ? 'mes' : 'semana',
  ref: new Date(),
  escalas: {},
  escalasProntas: false,
  cancelar: null,
  chaveFaixa: '',
  diaAberto: null,   // dia aberto na janela (visão mensal)
  diaSel: null,      // dia mostrado no celular (visão semanal)
  lembrete: { cancelar: null, chaveFaixa: '', escalas: {}, prontas: false },
  aprovacoes: {}, cancelarAprovacoes: null, hubAprovacoes: '',
  souAdmin: false, emailAdmin: '',
  editandoParte: null   // chave "iso|turnoId|idx|pi" da linha aberta pra edição, ou null
};

function mostrarAviso(titulo, texto) {
  el.aviso.innerHTML = `<h2>${titulo}</h2><p>${texto}</p>`;
  el.aviso.hidden = false;
  el.painel.hidden = true;
}

function erroLeitura(err) {
  console.error(err);
  mostrarAviso('Não foi possível carregar a escala', err?.code === 'permission-denied'
    ? 'O Firestore recusou a leitura. Confira se as regras do arquivo <code>firestore.rules</code> foram publicadas.'
    : 'Verifique a conexão com a internet e recarregue a página.');
}

function erroGravacao(err) {
  console.error(err);
  mostrarStatus(err?.code === 'permission-denied'
    ? 'O Firestore recusou a gravação. Confira as regras publicadas.'
    : 'Não foi possível salvar. Verifique a conexão e tente de novo.', 'erro', true);
}

// ================= período e dados =================
function faixaPeriodo() {
  if (estado.modo === 'semana') {
    const ini = startOfWeek(estado.ref);
    return { ini, fim: addDays(ini, 6) };
  }
  const primeiro = new Date(estado.ref.getFullYear(), estado.ref.getMonth(), 1);
  const ultimo = new Date(estado.ref.getFullYear(), estado.ref.getMonth() + 1, 0);
  return { ini: startOfWeek(primeiro), fim: addDays(startOfWeek(ultimo), 6), primeiro };
}

function assinarEscalas() {
  const { ini, fim } = faixaPeriodo();
  const chave = `${isoDate(ini)}|${isoDate(fim)}`;
  if (chave === estado.chaveFaixa) return;
  estado.chaveFaixa = chave;
  estado.cancelar?.();
  estado.escalas = {};
  estado.escalasProntas = false;
  estado.cancelar = ouvirEscalas(isoDate(ini), isoDate(fim), (mapa) => {
    estado.escalas = mapa;
    estado.escalasProntas = true;
    render();
  }, erroLeitura);
}

// Lançamentos aprovados por Ví (por hub, por dia+turno): só avisos de
// quantidade somem, nada é travado.
function assinarAprovacoes() {
  if (estado.hubId === estado.hubAprovacoes) return;
  estado.hubAprovacoes = estado.hubId;
  estado.cancelarAprovacoes?.();
  estado.aprovacoes = {};
  if (!estado.hubId) { estado.cancelarAprovacoes = null; return; }
  estado.cancelarAprovacoes = ouvirAprovacoes(estado.hubId, (aprovacoes) => {
    estado.aprovacoes = aprovacoes;
    render();
  }, () => { /* sem aprovação carregada, os avisos continuam aparecendo normalmente */ });
}
const turnoAprovado = (iso, turnoId) => Boolean(estado.aprovacoes[`${iso}_${turnoId}`]);

const hojeIso = () => isoDate(new Date());
const docDia = (iso, hubId = estado.hubId) => estado.escalas[`${hubId}_${iso}`];
const vagasNoDia = (t, dow) => Number(t.vagas?.[dow]) || 0;
const turnoPorId = (id) => estado.cfg.turnos.find((t) => t.id === id);
const vagasSalvas = (iso, turnoId) => vagasDe(docDia(iso)?.slots?.[turnoId]);
const listaDoTurno = (iso, campo, turnoId) => docDia(iso)?.[campo]?.[turnoId] || [];
const nomeSupervisor = () => estado.cfg.supervisores.find((s) => s.id === estado.supId)?.nome || '';
const turnosDoHub = () => estado.cfg.turnos.filter((t) => t.hubId === estado.hubId);
const supervisoresSobressalentes = () => new Set(
  estado.cfg.colaboradores.filter((c) => c.papel === 'supervisor').map((c) => normalizaNome(c.nome))
);

// Quem faltou/compareceu/confirmou num turno naquele dia — usado tanto para
// montar as vagas cadastradas (situacaoVagas) quanto as extras lançadas além
// da quantidade configurada.
function marcasDoTurno(iso, turnoId) {
  const faltas = new Set(listaDoTurno(iso, 'faltas', turnoId).map(normalizaNome));
  const compareceram = new Set(listaDoTurno(iso, 'compareceram', turnoId).map(normalizaNome));
  const confirmacoes = new Set(listaDoTurno(iso, 'confirmacoes', turnoId).map(normalizaNome));
  const faltou = (nome) => faltas.has(normalizaNome(nome));
  return {
    faltou,
    marcas: {
      compareceu: (nome) => (faltou(nome) ? 'nao' : (compareceram.has(normalizaNome(nome)) ? 'sim' : '')),
      confirmou: (nome) => confirmacoes.has(normalizaNome(nome))
    }
  };
}

// Situação de cada vaga cadastrada de um turno naquele dia.
// A vaga pode ter uma pessoa no turno inteiro ou várias em horários quebrados.
// Quem faltou deixa o seu trecho em aberto.
//
// As pessoas lançadas não ficam presas à posição do slot configurado (podem
// ser lançadas livremente, inclusive além da quantidade prevista) — por isso
// cada vaga real carrega o seu índice de verdade (`idx`, o índice onde está
// salva no Firestore), em vez de supor que as N primeiras posições do array
// são sempre as N vagas configuradas: o nome pode acabar lançado em
// qualquer posição, e contar só pela posição deixava vaga preenchida
// marcada como descoberta.
function situacaoVagas(iso, t, dow) {
  const salvas = vagasSalvas(iso, t.id);
  const { faltou, marcas } = marcasDoTurno(iso, t.id);
  const n = vagasNoDia(t, dow);

  const preenchidas = salvas
    .map((partes, idx) => ({ idx, partes }))
    .filter((x) => x.partes.some((p) => p.nome));
  const vaziasReais = Math.max(n - preenchidas.length, 0);

  // Vaga vazia + folga de um supervisor sobressalente naquele turno = não é furo.
  // Cada folga de supervisor "perdoa" uma vaga vazia; sobrando vagas vazias
  // além disso, seguem contando como furo normalmente.
  const sobressalentes = supervisoresSobressalentes();
  const creditos = listaDoTurno(iso, 'folgas', t.id).filter((nome) => sobressalentes.has(normalizaNome(nome)));
  const dispensadasQtde = Math.min(creditos.length, vaziasReais);

  let proximoIdx = salvas.length;
  const dispensadas = creditos.slice(0, dispensadasQtde)
    .map((nome) => ({ idx: proximoIdx++, partes: [], dispensada: nome }));

  const vagas = [...preenchidas, ...dispensadas].map(({ idx, partes, dispensada }) => ({
    idx, dispensada, ...montarVaga(t, partes, faltou, marcas)
  }));
  return { vagas, necessarias: n - dispensadasQtde };
}

function montarVaga(t, partes, faltou, marcas) {
  const cob = cobertura(t, partes, faltou);
  return {
    partes: partes.map((p) => ({
      ...p,
      faltou: Boolean(p.nome && faltou(p.nome)),
      compareceuEstado: p.nome ? marcas.compareceu(p.nome) : '',
      confirmou: Boolean(p.nome && marcas.confirmou(p.nome))
    })),
    dividida: ehDividida(partes),
    coberta: cob.coberta,
    buracos: cob.buracos,
    vazia: partes.length === 0
  };
}

function turnosDoDia(d) {
  const iso = isoDate(d);
  const dow = d.getDay();
  return ordenaTurnos(turnosDoHub().filter((t) => vagasNoDia(t, dow) > 0
    || vagasSalvas(iso, t.id).some((partes) => partes.length)
    || listaDoTurno(iso, 'folgas', t.id).length
    || listaDoTurno(iso, 'faltas', t.id).length));
}

// Contagem do dia inteiro (todos os turnos do hub), pro selo do calendário e
// pro resumo no topo do diálogo do dia. Usa a mesma conta de saldo
// (lançadas/necessárias) do badge de cada turno — nada de contar vaga por
// posição: quem foi lançado livremente, mesmo em outro índice, conta.
function contagemDia(d) {
  const iso = isoDate(d);
  const dow = d.getDay();
  const c = { total: 0, cobertas: 0, descobertas: 0, faltas: 0 };
  for (const t of turnosDoHub()) {
    c.faltas += listaDoTurno(iso, 'faltas', t.id).length;
    const { necessarias, lancadas } = contagemTurnoDia(iso, dow, t);
    c.total += necessarias;
    c.cobertas += Math.min(lancadas, necessarias || lancadas);
  }
  c.descobertas = c.total - c.cobertas;
  return c;
}

// Todos os nomes lançados (em qualquer hub) naquele dia, para detectar conflitos
function indiceDoDia(iso) {
  const escalados = [];
  const folgas = [];
  for (const d of Object.values(estado.escalas)) {
    if (d.data !== iso) continue;
    const hubNome = estado.cfg.hubs.find((h) => h.id === d.hubId)?.nome || 'outro hub';
    for (const [turnoId, valor] of Object.entries(d.slots || {})) {
      const turno = turnoPorId(turnoId);
      if (!turno) continue;
      vagasDe(valor).forEach((partes, idx) => {
        partes.forEach((p, pi) => {
          const norm = normalizaNome(p.nome);
          // Quem tem horário próprio é comparado pelo trecho que cobre
          const janela = p.inicio || p.fim
            ? { inicio: p.inicio || turno.inicio, fim: p.fim || turno.fim, nome: turno.nome, id: turno.id }
            : turno;
          if (norm) escalados.push({ norm, hubId: d.hubId, hubNome, turno: janela, idx, pi });
        });
      });
    }
    for (const [turnoId, lista] of Object.entries(d.folgas || {})) {
      const turno = turnoPorId(turnoId);
      if (!turno) continue;
      (lista || []).forEach((nome) => {
        const norm = normalizaNome(nome);
        if (norm) folgas.push({ norm, hubId: d.hubId, hubNome, turno });
      });
    }
  }
  return { escalados, folgas };
}

function onde(e) {
  const hub = e.hubId === estado.hubId ? '' : `${e.hubNome}, `;
  return `${hub}${e.turno.nome} (${e.turno.inicio}–${e.turno.fim})`;
}

function alertasVaga(ind, turno, idx, pi, parte) {
  const norm = normalizaNome(parte.nome);
  if (!norm) return [];
  const janela = parte.inicio || parte.fim
    ? { inicio: parte.inicio || turno.inicio, fim: parte.fim || turno.fim }
    : turno;
  const msgs = [];
  const outros = ind.escalados.filter((e) => e.norm === norm && sobrepoe(e.turno, janela)
    && !(e.hubId === estado.hubId && e.turno.id === turno.id && e.idx === idx && e.pi === pi));
  if (outros.length) msgs.push(`Também escalado em ${outros.map(onde).join('; ')}`);
  const deFolga = ind.folgas.filter((f) => f.norm === norm && sobrepoe(f.turno, janela));
  if (deFolga.length) msgs.push(`Está de folga em ${deFolga.map(onde).join('; ')}`);
  return msgs;
}

function alertaFolga(ind, turno, nome) {
  const norm = normalizaNome(nome);
  const esc = ind.escalados.filter((e) => e.norm === norm && sobrepoe(e.turno, turno));
  return esc.length ? `${limparNome(nome)} está de folga, mas escalado em ${esc.map(onde).join('; ')}` : '';
}

// ================= seletores =================
function hubsDoSupervisor() {
  const sup = estado.cfg.supervisores.find((s) => s.id === estado.supId);
  if (!sup) return [];
  const ids = sup.hubIds || [];
  const lista = ids.length ? estado.cfg.hubs.filter((h) => ids.includes(h.id)) : estado.cfg.hubs;
  return [...lista].sort(porNome);
}

function renderSeletores() {
  const sups = [...estado.cfg.supervisores].sort(porNome);
  if (!sups.some((s) => s.id === estado.supId)) estado.supId = '';
  el.selSup.innerHTML = '<option value="">Selecione seu nome</option>'
    + sups.map((s) => `<option value="${s.id}">${escapeHtml(s.nome)}</option>`).join('');
  el.selSup.value = estado.supId;

  const hubs = hubsDoSupervisor();
  if (!hubs.some((h) => h.id === estado.hubId)) estado.hubId = hubs.length === 1 ? hubs[0].id : '';
  el.selHub.disabled = !estado.supId;
  el.selHub.innerHTML = `<option value="">${estado.supId ? 'Selecione o hub' : 'Escolha seu nome primeiro'}</option>`
    + hubs.map((h) => `<option value="${h.id}">${escapeHtml(h.nome)}</option>`).join('');
  el.selHub.value = estado.hubId;
  atualizarDatalist();
  atualizarUrl();
}

function atualizarDatalist() {
  // Nomes são digitados livremente nos campos da escala (sem restrição a
  // cadastrados); nada a atualizar aqui. Mantido por compatibilidade com
  // chamadas existentes (troca de hub, etc.).
}

function atualizarUrl() {
  const p = new URLSearchParams();
  if (estado.supId) p.set('sup', estado.supId);
  if (estado.hubId) p.set('hub', estado.hubId);
  if (estado.modo === 'mes') p.set('modo', 'mes');
  const q = p.toString();
  history.replaceState(null, '', q ? `?${q}` : location.pathname);
}

// ================= render =================
function render() {
  if (!estado.cfg) return;
  const { hubs, supervisores } = estado.cfg;
  if (!hubs.length || !supervisores.length) {
    return mostrarAviso('Nada cadastrado ainda',
      `${hubs.length ? 'Nenhum supervisor' : 'Nenhum hub'} foi cadastrado. Configure em <a href="cadastros.html">Cadastros</a>.`);
  }
  if (!estado.supId || !estado.hubId) {
    return mostrarAviso('Escolha seu nome e o hub',
      'A escala da unidade aparece aqui, com as vagas de cada turno para você preencher.');
  }
  if (!turnosDoHub().length) {
    return mostrarAviso('Este hub ainda não tem turnos',
      'Os turnos e a quantidade de vagas são definidos em <a href="cadastros.html">Cadastros</a>.');
  }
  el.aviso.hidden = true;
  el.painel.hidden = false;
  assinarAprovacoes();

  const foco = capturarFoco();
  if (estado.modo === 'semana') renderSemana(); else renderMes();
  if (estado.diaAberto) renderDialogo();
  restaurarFoco(foco);
  atualizarAvisoTelefones();

  document.querySelectorAll('.alternador button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.modo === estado.modo));
  });
}

function tipoPrincipal(marcos) {
  return marcos[0]?.tipo;
}

function htmlMarcos(marcos) {
  if (!marcos.length) return '';
  return `<ul class="marcos">${marcos.map((m) => `
    <li class="marco marco-${m.tipo}"><span class="marco-tipo">${ROTULO_TIPO[m.tipo]}</span> ${escapeHtml(m.nome)}</li>`).join('')}
  </ul>`;
}

function medidor(c) {
  const pct = c.total ? Math.round((c.cobertas / c.total) * 100) : 0;
  const cls = c.cobertas >= c.total ? 'completo' : '';
  return `<span class="medidor ${cls}" aria-hidden="true"><span style="width:${pct}%"></span></span>`;
}

function htmlContDia(c) {
  const fracao = `<span class="dia-fracao">${c.cobertas}/${c.total}</span>`;
  if (!c.descobertas) return `${fracao}<span class="selo selo-ok">Completo</span>`;
  return `${fracao}<span class="selo selo-furo">${plural(c.descobertas, 'descoberta', 'descobertas')}</span>`;
}

// Linha enxuta: "Nome 08:00 às 17:00", com um lápis pra abrir a edição do
// nome e do horário. Sem tipo de contrato, confirmação, comparecimento ou
// avisos de conflito — decisão da Ví de tirar essa informação da tela.
function htmlLinhaVaga(iso, t, i, pi, p, travado, rotDia, extra) {
  const chave = `${iso}|${t.id}|${i}|${pi}`;
  const dis = travado ? 'disabled' : '';
  const temNome = Boolean(p.nome.trim());
  const rotulo = `${t.nome}, vaga ${i + 1}, ${rotDia}`;
  const quem = escapeHtml(p.nome) || 'pessoa';
  // Hora sem sugestão: só mostra/pré-preenche quando alguém já digitou algo.
  // Pra quem tem nome mas não mexeu no horário, assume o turno inteiro (sem
  // forçar isso visualmente na hora de editar).
  const inicio = p.inicio || (temNome ? t.inicio : ''), fim = p.fim || (temNome ? t.fim : '');

  if (estado.editandoParte !== chave) {
    if (!temNome) {
      return `<div class="linha-vaga vazia">
        <span class="lv-texto lv-nova">+ Adicionar pessoa</span>
        <button type="button" class="btn-icone" data-editar="${chave}" aria-label="Lançar nova pessoa, ${escapeHtml(rotulo)}" ${dis}>✎</button>
      </div>`;
    }
    return `<div class="linha-vaga${p.faltou ? ' faltou' : ''}">
      <span class="lv-texto">${quem} <span class="lv-hora">${inicio} às ${fim}</span></span>
      <button type="button" class="btn-icone" data-editar="${chave}" aria-label="Editar ${escapeHtml(rotulo)}" ${dis}>✎</button>
      <button type="button" class="btn-icone perigo" data-excluir="${chave}"
        aria-label="Excluir ${escapeHtml(p.nome)} desta vaga" ${dis}>×</button>
      ${p.faltou ? '<p class="vaga-furo">Não compareceu. O horário está descoberto.</p>' : ''}
    </div>`;
  }
  return `<div class="linha-vaga editando">
    <div class="parte-nome">
      <input type="text" class="${p.nome ? '' : 'vazio'}" value="${escapeHtml(p.nome)}"
        placeholder="${extra ? 'Pessoa extra' : 'Nome'}" aria-label="${escapeHtml(rotulo)}"
        autocomplete="off" data-parte="${chave}" data-foco="v|${chave}" ${dis}>
    </div>
    <div class="horas">
      <label class="hora"><span>Entra</span>
        <input type="text" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="00:00"
          class="campo-hora" value="${p.inicio}" aria-label="Entrada de ${quem}"
          data-hora="${chave}|inicio" data-foco="hi|${chave}" ${dis}></label>
      <label class="hora"><span>Sai</span>
        <input type="text" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="00:00"
          class="campo-hora" value="${p.fim}" aria-label="Saída de ${quem}"
          data-hora="${chave}|fim" data-foco="hf|${chave}" ${dis}></label>
      <button type="button" class="btn-icone" data-concluir="${chave}" aria-label="Concluir edição">✓</button>
    </div>
    ${p.faltou ? '<p class="vaga-furo">Não compareceu. O horário está descoberto.</p>' : ''}
  </div>`;
}

function htmlVaga(iso, t, i, v, travado, rotDia, extra) {
  if (v.dispensada) return htmlVagaDispensada(iso, t, i, v, travado, rotDia);
  const cls = ['vaga', v.coberta ? 'ocupada' : 'descoberta', extra ? 'extra-nova' : ''].filter(Boolean).join(' ');
  const partes = v.partes.length ? v.partes : [{ nome: '', tipo: '', inicio: '', fim: '' }];
  const corpo = partes.map((p, pi) =>
    htmlLinhaVaga(iso, t, i, pi, p, travado, rotDia, extra)).join('');
  return `<div class="${cls}">${corpo}</div>`;
}

// Vaga sobressalente vazia por folga de supervisor: sem cobrança de furo,
// mas com um campo opcional para quem quiser lançar um reforço mesmo assim.
function htmlVagaDispensada(iso, t, i, v, travado, rotDia) {
  const dis = travado ? 'disabled' : '';
  const chave = `${iso}|${t.id}|${i}|0`;
  return `<div class="vaga dispensada">
    <p class="vaga-dispensa">Folga de ${escapeHtml(v.dispensada)} — vaga sobressalente, não conta como furo</p>
    <input type="text" aria-label="Reforço opcional para ${escapeHtml(t.nome)}, ${rotDia}"
      placeholder="Reforço opcional" autocomplete="off" data-parte="${chave}" data-foco="v|${chave}" ${dis}>
  </div>`;
}

function htmlAusencias(iso, t, ind, travado, rotDia) {
  const folgas = listaDoTurno(iso, 'folgas', t.id);
  const faltas = listaDoTurno(iso, 'faltas', t.id);
  const dis = travado ? 'disabled' : '';
  const alertas = [];
  const chip = (nome, campo) => {
    const a = campo === 'folgas' ? alertaFolga(ind, t, nome) : '';
    if (a) alertas.push(a);
    return `<li class="aus aus-${campo}${a ? ' conflito' : ''}">
      <span class="aus-tipo">${campo === 'folgas' ? 'Folga' : 'Falta'}</span>
      <span class="aus-nome">${escapeHtml(nome)}</span>
      <button type="button" data-remover-aus="${campo}|${iso}|${t.id}" data-nome="${escapeHtml(nome)}"
        aria-label="Retirar ${campo === 'folgas' ? 'folga' : 'falta'} de ${escapeHtml(nome)}" ${dis}>×</button>
    </li>`;
  };
  const total = folgas.length + faltas.length;
  return `<div class="ausencias">
    <p class="aus-rot">Folgas e faltas${total ? ` (${total})` : ''}</p>
    ${total ? `<ul class="aus-lista">${faltas.map((n) => chip(n, 'faltas')).join('')}${folgas.map((n) => chip(n, 'folgas')).join('')}</ul>` : ''}
    ${alertas.map((a) => `<p class="vaga-alerta">${escapeHtml(a)}</p>`).join('')}
    <div class="aus-add">
      <input type="text" aria-label="Nome para lançar folga ou falta em ${escapeHtml(t.nome)}, ${rotDia}"
        placeholder="Nome" data-aus="${iso}|${t.id}" data-foco="a|${iso}|${t.id}" ${dis}>
      <button type="button" data-lancar="folgas" ${dis}>Folga</button>
      <button type="button" data-lancar="faltas" ${dis}>Falta</button>
    </div>
  </div>`;
}

// Selo + aviso do cabeçalho do turno: quantas pessoas foram lançadas contra
// a quantidade configurada. Não trava nada — é só um alerta. "necessarias"
// já desconta vagas dispensadas por folga de supervisor.
// Quantas pessoas eram esperadas (vagas configuradas, descontando dispensa
// por folga de supervisor) e quantas foram lançadas de fato (inclui vagas
// extras, lançadas além da quantidade configurada) num turno, num dia —
// e as próprias vagas prontas pra desenhar na tela.
function contagemTurnoDia(iso, dow, t) {
  const n = vagasNoDia(t, dow);
  const { vagas, necessarias } = situacaoVagas(iso, t, dow);

  // Sem engessamento: quem lidera pode lançar mais ou menos gente do que o
  // configurado, sem sugestão de horário pronta. A lista mostra só quem tem
  // nome lançado (e as vagas dispensadas, que avisam o crédito de folga) —
  // nada de linha vazia "fantasma" pra cada vaga ainda não preenchida.
  // Sempre sobra uma linha em branco no fim pra lançar mais uma pessoa.
  const { faltou, marcas } = marcasDoTurno(iso, t.id);
  const linhasBase = vagas.filter((v) => v.dispensada || v.partes.some((p) => p.nome));
  const maxIdx = vagas.reduce((m, v) => Math.max(m, v.idx), vagasSalvas(iso, t.id).length - 1);
  const linhas = linhasBase.map((v, pos) => ({ i: v.idx, v, extra: pos >= necessarias }));
  linhas.push({ i: maxIdx + 1, v: montarVaga(t, [], faltou, marcas), extra: linhas.length >= necessarias });

  // Quem faltou não conta como cobertura — o horário continua descoberto,
  // mesmo com o nome ainda lançado na vaga (é assim que a Central também conta).
  const pessoasDe = (v) => v.partes.filter((p) => p.nome && !p.faltou).length;
  const lancadas = linhas.reduce((s, x) => s + (x.v.dispensada ? 0 : pessoasDe(x.v)), 0);
  const dispensado = necessarias === 0 && n > 0 && lancadas === 0;

  return { t, n, linhas, necessarias, lancadas, dispensado };
}

// Estado de um turno num dia: "completo" (bateu a conta, ou a diferença já
// foi aprovada), "pendente" (sobrou ou faltou gente e ainda não foi
// aprovado) ou "neutro" (nada configurado pra comparar). Não trava nada —
// é só pra avisar e, se for o caso, esperar aprovação.
function situacaoTurno({ necessarias, lancadas, dispensado }, aprovado) {
  if (dispensado) return { status: 'completo', texto: 'Dispensado' };
  if (!necessarias) return { status: 'neutro', texto: lancadas ? plural(lancadas, 'pessoa lançada', 'pessoas lançadas') : '' };
  if (lancadas === necessarias) return { status: 'completo', texto: 'Completo' };
  const diff = lancadas - necessarias;
  const palavra = diff > 0 ? `Sobram ${plural(diff, 'pessoa', 'pessoas')}` : `Faltam ${plural(-diff, 'pessoa', 'pessoas')}`;
  if (aprovado) return { status: 'completo', texto: 'Completo' };
  return { status: 'pendente', texto: palavra };
}

function htmlContTurno(info, aprovado) {
  const { necessarias, lancadas } = info;
  const { status, texto } = situacaoTurno(info, aprovado);
  if (status === 'neutro') return { status, badge: lancadas ? `<span class="turno-cont">${texto}</span>` : '', aviso: '' };
  if (info.dispensado) return { status, badge: '<span class="turno-cont completo">Dispensado</span>', aviso: '' };
  const badge = `<span class="turno-cont ${status}">${lancadas}/${necessarias}</span>`;
  const aviso = status === 'pendente' ? `${texto} — aguardando sua aprovação` : '';
  return { status, badge, aviso };
}

function htmlDia(d) {
  const iso = isoDate(d);
  const dow = d.getDay();
  const turnos = turnosDoDia(d);
  if (!turnos.length) return '<p class="dia-vazio">Sem turnos neste dia</p>';
  const ind = indiceDoDia(iso);
  const travado = !estado.escalasProntas;
  const rotDia = `${DIAS_LONGO[dow]} ${d.getDate()}`;

  return turnos.map((t) => {
    const info = contagemTurnoDia(iso, dow, t);
    const { linhas } = info;
    const { badge: cont, aviso, status } = htmlContTurno(info, turnoAprovado(iso, t.id));

    const htmlVagas = linhas.map((x) => htmlVaga(iso, t, x.i, x.v, travado, rotDia, x.extra)).join('');

    return `<section class="turno faixa-${faixaDoDia(t.inicio)}${status === 'pendente' ? ' turno-pendente' : ''}">
      <header class="turno-cab">
        <span class="turno-nome">${escapeHtml(t.nome)}</span>
        <span class="turno-hora">${t.inicio}–${t.fim}</span>
        ${cont}
      </header>
      ${aviso ? `<p class="turno-aviso">${escapeHtml(aviso)}${status === 'pendente' && estado.souAdmin
        ? ` <button type="button" class="btn-aprovar" data-aprovar="${iso}|${t.id}">Aprovar</button>` : ''}</p>` : ''}
      <div class="vagas">${htmlVagas}</div>
      ${htmlAusencias(iso, t, ind, travado, rotDia)}
    </section>`;
  }).join('');
}

function somar(tot, c, futuro) {
  tot.total += c.total;
  tot.cobertas += c.cobertas;
  tot.faltas += c.faltas;
  if (futuro) tot.descobertas += c.descobertas;
}
const totalZerado = () => ({ total: 0, cobertas: 0, descobertas: 0, faltas: 0 });

function htmlResumo(tot, incluiHoje) {
  if (!estado.escalasProntas) return 'Carregando escala…';
  if (!tot.total) return 'Nenhuma vaga neste período';
  const pct = Math.round((tot.cobertas / tot.total) * 100);
  const periodo = estado.modo === 'mes' ? 'do mês' : 'da semana';
  let html = `<span class="progresso">
      <span class="prog-barra ${pct >= 100 ? 'completo' : ''}" aria-hidden="true"><span style="width:${pct}%"></span></span>
      <span><strong>${pct}%</strong> da escala ${periodo} preenchida</span>
    </span>
    <span class="resumo-vagas">${tot.cobertas} de ${tot.total} vagas cobertas</span>`;
  if (tot.descobertas) {
    html += ` <span class="pilula pilula-furo">${plural(tot.descobertas, 'descoberta', 'descobertas')}${incluiHoje ? ' a partir de hoje' : ''}</span>`;
  }
  if (tot.faltas) html += ` <span class="pilula pilula-falta">${plural(tot.faltas, 'falta', 'faltas')}</span>`;
  return html;
}

function tituloSemana(ini, fim) {
  if (ini.getMonth() === fim.getMonth()) return `${ini.getDate()} a ${fim.getDate()} de ${MESES[fim.getMonth()]}`;
  return `${ini.getDate()} de ${MESES[ini.getMonth()]} a ${fim.getDate()} de ${MESES[fim.getMonth()]}`;
}

function classesDia(base, iso, hoje, marcos, c) {
  return [base, iso === hoje ? 'hoje' : '', iso < hoje ? 'passado' : '',
    c.descobertas ? 'com-furo' : '', marcos.length ? `tem-${tipoPrincipal(marcos)}` : '']
    .filter(Boolean).join(' ');
}

// Cartão compacto de um turno num dia, pro quadro-resumo da semana: número
// grande (lançadas/necessárias), palavra de status e barrinha colorida.
// Clicar abre o dia pra lançar/revisar de verdade.
function htmlCartaoTurno(iso, info) {
  const { status, texto } = situacaoTurno(info, turnoAprovado(iso, info.t.id));
  const rotulo = `${info.t.nome}: ${texto || 'sem vagas configuradas'}`;
  if (status === 'neutro' && !info.necessarias) {
    return `<button type="button" class="cartao-turno neutro" data-abrir="${iso}" aria-label="${escapeHtml(rotulo)}">
      <span class="ct-num">${info.lancadas || '—'}</span>
      <span class="ct-texto">${escapeHtml(texto || 'sem vaga')}</span>
    </button>`;
  }
  return `<button type="button" class="cartao-turno ${status}" data-abrir="${iso}" aria-label="${escapeHtml(rotulo)}">
    <span class="ct-num">${info.lancadas}/${info.necessarias}</span>
    <span class="ct-texto">${escapeHtml(texto)}</span>
    <span class="ct-barra" aria-hidden="true"></span>
  </button>`;
}

function renderSemana() {
  const { ini, fim } = faixaPeriodo();
  const hoje = hojeIso();
  const turnos = ordenaTurnos(turnosDoHub());
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(ini, i);
    return { d, iso: isoDate(d), marcos: marcosDoDia(isoDate(d), estado.cfg.datasEspeciais) };
  });
  const infos = dias.map(({ d, iso }) => turnos.map((t) => contagemTurnoDia(iso, d.getDay(), t)));

  let necessarias = 0, lancadas = 0, pendentes = 0;
  infos.forEach((linha, i) => linha.forEach((info) => {
    necessarias += info.necessarias;
    lancadas += Math.min(info.lancadas, info.necessarias || info.lancadas);
    if (situacaoTurno(info, turnoAprovado(dias[i].iso, info.t.id)).status === 'pendente') pendentes++;
  }));
  const resumoPct = necessarias ? Math.round((lancadas / necessarias) * 100) : 100;
  const pilPendentes = pendentes
    ? ` <span class="pilula pilula-furo">${plural(pendentes, 'turno aguardando aprovação', 'turnos aguardando aprovação')}</span>` : '';

  if (TELA_COMPACTA.matches) {
    // Celular: faixa com os 7 dias e um dia aberto por vez
    if (!dias.some((x) => x.iso === estado.diaSel)) {
      estado.diaSel = dias.some((x) => x.iso === hoje) ? hoje : dias[0].iso;
    }
    const faixa = dias.map(({ d, iso, marcos }, i) => {
      const sel = iso === estado.diaSel;
      const linha = infos[i];
      const temPendente = linha.some((info) => situacaoTurno(info, turnoAprovado(iso, info.t.id)).status === 'pendente');
      const marca = !linha.some((x) => x.necessarias) ? ''
        : temPendente ? '<span class="cd-marca furo">!</span>' : '<span class="cd-marca ok" aria-hidden="true">✓</span>';
      const cls = ['chip-dia', iso === hoje ? 'hoje' : '', iso < hoje ? 'passado' : '',
        sel ? 'sel' : '', marcos.length ? `tem-${tipoPrincipal(marcos)}` : ''].filter(Boolean).join(' ');
      return `<button type="button" role="tab" class="${cls}" data-dia="${iso}" aria-selected="${sel}">
        <span class="cd-sem">${iso === hoje ? 'Hoje' : DIAS_CURTO[d.getDay()]}</span>
        <span class="cd-num">${d.getDate()}</span>
        ${marca}
      </button>`;
    }).join('');
    const i = dias.findIndex((y) => y.iso === estado.diaSel);
    const x = dias[i];
    el.quadro.className = 'quadro-dia';
    el.quadro.innerHTML = `<div class="faixa-dias" role="tablist" aria-label="Dias da semana">${faixa}</div>
      <article class="dia dia-unico${x.iso === hoje ? ' hoje' : ''}">
        <header class="dia-cab">
          <h2 class="dia-titulo">${DIAS_LONGO[x.d.getDay()]}, ${x.d.getDate()} de ${MESES[x.d.getMonth()]}</h2>
        </header>
        ${htmlMarcos(x.marcos)}
        <div class="cartoes-turno-pilha">${infos[i].map((info) => htmlCartaoTurno(x.iso, info)).join('')}</div>
        <button type="button" class="btn-primario btn-lancar" data-abrir="${x.iso}">Lançar escala deste dia</button>
      </article>`;
  } else {
    el.quadro.className = 'quadro-semana-cartoes';
    const cabecalho = `<div class="cs-linha cs-cab">
      <span class="cs-rotulo" aria-hidden="true"></span>
      ${dias.map(({ d, iso }) => `<button type="button" class="cs-dia-cab${iso === hoje ? ' hoje' : ''}" data-abrir="${iso}">
        <span class="cs-dia-sem">${DIAS_CURTO[d.getDay()]}</span><span class="cs-dia-num">${d.getDate()}</span>
      </button>`).join('')}
    </div>`;
    const linhas = turnos.map((t, ti) => `<div class="cs-linha">
      <span class="cs-rotulo">
        <span class="cs-rotulo-nome">${escapeHtml(t.nome)}</span>
        <span class="cs-rotulo-hora">${t.inicio}–${t.fim}</span>
      </span>
      ${dias.map(({ iso }, di) => htmlCartaoTurno(iso, infos[di][ti])).join('')}
    </div>`).join('');
    el.quadro.innerHTML = turnos.length ? cabecalho + linhas : '<p class="dia-vazio">Sem turnos cadastrados neste hub</p>';
  }
  el.titulo.textContent = tituloSemana(ini, fim);
  el.resumo.innerHTML = `<span class="progresso"><span class="prog-barra" aria-hidden="true"><span style="width:${resumoPct}%"></span></span>
    <span><strong>${resumoPct}%</strong> da escala da semana preenchida</span></span>
    <span class="resumo-vagas">${lancadas} de ${necessarias} vagas necessárias cobertas</span>${pilPendentes}`;
}

// Resumo visual por vaga, agrupado por turno: um quadradinho por vaga.
// Os nomes e detalhes ficam só ao abrir o dia — o quadradinho do mês é só o resumo.
function htmlPontos(d) {
  const iso = isoDate(d);
  const dow = d.getDay();
  const turnos = ordenaTurnos(turnosDoHub().filter((t) => vagasNoDia(t, dow) > 0));
  if (!turnos.length) return '';
  return `<span class="pontos" aria-hidden="true">${turnos.map((t) => {
    const { necessarias, lancadas } = contagemTurnoDia(iso, dow, t);
    const ok = Math.min(lancadas, necessarias);
    return `<span class="pontos-turno">${
      Array.from({ length: necessarias }, (_, i) => `<i class="${i < ok ? 'p-ok' : 'p-furo'}"></i>`).join('')
    }</span>`;
  }).join('')}</span>`;
}

function renderMes() {
  const { ini, fim, primeiro } = faixaPeriodo();
  const hoje = hojeIso();
  const tot = totalZerado();
  let celulas = '';
  for (let d = ini; d <= fim; d = addDays(d, 1)) {
    if (d.getMonth() !== primeiro.getMonth()) { celulas += '<div class="cel fora" aria-hidden="true"></div>'; continue; }
    const iso = isoDate(d);
    const c = contagemDia(d);
    somar(tot, c, iso >= hoje);
    const marcos = marcosDoDia(iso, estado.cfg.datasEspeciais);
    const rotulo = [`${DIAS_LONGO[d.getDay()]}, ${d.getDate()}`,
      ...marcos.map((m) => `${ROTULO_TIPO[m.tipo]}: ${m.nome}`),
      c.total ? `${c.cobertas} de ${c.total} vagas cobertas` : 'sem turnos',
      c.descobertas ? plural(c.descobertas, 'vaga descoberta', 'vagas descobertas') : '',
      c.faltas ? plural(c.faltas, 'falta', 'faltas') : ''].filter(Boolean).join('. ');
    celulas += `<button type="button" class="${classesDia('cel', iso, hoje, marcos, c)}" data-abrir="${iso}" aria-label="${escapeHtml(rotulo)}">
      <span class="cel-topo">
        <span class="cel-num">${d.getDate()}</span>
        ${c.descobertas ? `<span class="cel-furo" aria-hidden="true">${c.descobertas}</span>`
          : c.total ? '<span class="cel-ok" aria-hidden="true">Completo</span>' : ''}
      </span>
      ${marcos.length ? `<span class="cel-marco">${escapeHtml(marcos[0].nome)}</span>` : ''}
      ${htmlPontos(d)}
    </button>`;
  }
  el.quadro.className = 'quadro-mes';
  el.quadro.innerHTML = `<div class="mes-sem" aria-hidden="true">${DIAS_CURTO.map((x) => `<span>${x}</span>`).join('')}</div>
    <div class="mes-grade">${celulas}</div>
    <p class="mes-legenda">
      <span>Toque num dia para ver quem está escalado.</span>
      <span class="leg-pontos"><i class="p-ok"></i> Vaga coberta <i class="p-furo"></i> Vaga descoberta</span>
    </p>`;
  el.titulo.textContent = `${capitalizar(MESES[primeiro.getMonth()])} de ${primeiro.getFullYear()}`;
  const mesAtual = hoje.slice(0, 7) === isoDate(primeiro).slice(0, 7);
  el.resumo.innerHTML = htmlResumo(tot, mesAtual);
}

// ================= dia aberto (visão mensal) =================
function abrirDia(iso) {
  estado.diaAberto = iso;
  renderDialogo();
  if (!el.dlg.open) el.dlg.showModal();
  // <dialog> em modo modal fica numa camada acima de tudo que não está
  // dentro dele — o aviso de "Salvando…"/erro ficava escondido atrás da
  // janela. Movendo o próprio elemento pra dentro do diálogo, ele aparece.
  el.dlg.appendChild(el.status);
}

function renderDialogo() {
  const d = parseIso(estado.diaAberto);
  const c = contagemDia(d);
  const marcos = marcosDoDia(estado.diaAberto, estado.cfg.datasEspeciais);
  el.dlgTitulo.textContent = `${DIAS_LONGO[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
  el.dlgCorpo.innerHTML = `${htmlMarcos(marcos)}
    ${c.total ? `<p class="dlg-resumo">${htmlContDia(c)}</p>` : ''}
    ${htmlDia(d)}`;
}

// ================= foco (a tela se atualiza sozinha quando alguém salva) =================
function capturarFoco() {
  const a = document.activeElement;
  if (!a?.dataset?.foco) return null;
  return { chave: a.dataset.foco, valor: a.value, ini: a.selectionStart, fim: a.selectionEnd };
}
function restaurarFoco(f) {
  if (!f) return;
  const i = document.querySelector(`[data-foco="${CSS.escape(f.chave)}"]`);
  if (!i) return;
  i.value = f.valor;
  i.focus({ preventScroll: true });
  try { i.setSelectionRange(f.ini, f.fim); } catch { /* campo sem seleção */ }
}

// ================= gravação =================
async function gravar(acao, msgOk) {
  mostrarStatus('Salvando…', 'neutro', true);
  try {
    await acao();
    mostrarStatus(msgOk);
  } catch (err) { erroGravacao(err); }
}

function gravarPartes(iso, turnoId, idx, partes, msgOk) {
  const limpas = partes
    .map((p) => ({ nome: limparNome(p.nome), tipo: p.tipo || '', inicio: p.inicio || '', fim: p.fim || '' }))
    .filter((p) => p.nome || p.inicio || p.fim);
  return gravar(() => salvarVaga(estado.hubId, iso, turnoId, idx, { partes: limpas }, nomeSupervisor()), msgOk);
}

// Partes como estão gravadas agora, para alterar só o que mudou
function partesAtuais(iso, turnoId, idx) {
  return (vagasSalvas(iso, turnoId)[idx] || []).map((p) => ({ ...p }));
}

function alterarParte(iso, turnoId, idx, pi, mudanca, msgOk) {
  const partes = partesAtuais(iso, turnoId, idx);
  while (partes.length <= pi) partes.push({ nome: '', tipo: '', inicio: '', fim: '' });
  partes[pi] = { ...partes[pi], ...mudanca };
  return gravarPartes(iso, turnoId, idx, partes, msgOk);
}

// Esvazia a vaga (tira a pessoa daquele card, libera o horário de novo)
function excluirVaga(iso, turnoId, idx, pi) {
  alterarParte(iso, turnoId, idx, pi, { nome: '', tipo: '', inicio: '', fim: '' }, 'Vaga removida');
}

// ---- cadastro de colaboradores: só quem está cadastrado e com telefone (✅) pode ser lançado ----
const colabDe = (nome) => {
  const n = normalizaNome(nome);
  return estado.cfg.colaboradores.find((c) => normalizaNome(c.nome) === n || (c.apelidos || []).some((a) => normalizaNome(a) === n));
};
const telOkLocal = (c) => {
  let d = String(c?.tel || '').replace(/\D/g, ''); if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  return d.length === 10 || d.length === 11 || Boolean(c?.semTel);
};
// 'ok' | 'sem-cadastro' | 'sem-tel'. Enquanto os telefones antigos não foram importados para o cadastro, vale também o que a central já tem.
async function situacaoTelefone(nome) {
  const c = colabDe(nome);
  if (c && telOkLocal(c)) return 'ok';
  const faltam = await checarTelefones([nome]);
  if (faltam && !faltam.length) return 'ok';
  return c ? 'sem-tel' : 'sem-cadastro';
}
// ---- sugestões de colaborador (✅): lista própria, porque o datalist do navegador quase não funciona no celular ----
const sugBox = document.createElement('div');
sugBox.id = 'sugColabs'; sugBox.hidden = true; sugBox.setAttribute('role', 'listbox');
if ('popover' in HTMLElement.prototype) sugBox.setAttribute('popover', 'manual');   // fica por cima até de janelas abertas (dia)
let sugAlvo = null, sugTimer = 0;
function fecharSug() {
  clearTimeout(sugTimer); sugAlvo = null; sugBox.hidden = true;
  try { if (sugBox.matches(':popover-open')) sugBox.hidePopover(); } catch { /* navegador sem popover */ }
}
function posicionarSug() {
  const input = sugAlvo; if (!input) return;
  if (!input.isConnected) return fecharSug();
  const r = input.getBoundingClientRect(), vv = window.visualViewport;
  const topo = vv ? vv.offsetTop : 0, alto = vv ? vv.height : window.innerHeight;
  const abaixo = topo + alto - r.bottom - 8, acima = r.top - topo - 8, emBaixo = abaixo >= 150 || abaixo >= acima;
  const larg = Math.max(r.width, 200);
  sugBox.style.maxHeight = `${Math.max(120, Math.min(280, emBaixo ? abaixo : acima))}px`;
  sugBox.style.width = `${larg}px`;
  sugBox.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - larg - 8))}px`;
  if (emBaixo) { sugBox.style.top = `${r.bottom + 4}px`; sugBox.style.bottom = 'auto'; }
  else { sugBox.style.top = 'auto'; sugBox.style.bottom = `${window.innerHeight - r.top + 4}px`; }
}
function abrirSug(input) {
  clearTimeout(sugTimer);
  if (!input?.isConnected || input.disabled) return fecharSug();
  const q = normalizaNome(input.value);
  const lista = estado.cfg.colaboradores
    .filter((c) => telOkLocal(c) && (!c.hubId || c.hubId === estado.hubId) && (!q || normalizaNome(c.nome).includes(q)))
    .sort(porNome).slice(0, 40);
  if (!lista.length) return fecharSug();
  sugAlvo = input;
  const pai = input.closest('dialog[open]') || document.body;
  if (sugBox.parentNode !== pai) pai.appendChild(sugBox);
  sugBox.innerHTML = lista.map((c) => `<button type="button" role="option" data-nome="${escapeHtml(c.nome)}">✅ ${escapeHtml(c.nome)}</button>`).join('');
  sugBox.hidden = false;
  try { if (!sugBox.matches(':popover-open')) sugBox.showPopover(); } catch { /* navegador sem popover */ }
  posicionarSug();
}
document.addEventListener('focusin', (e) => { if (e.target.matches?.('[data-parte]')) abrirSug(e.target); });
document.addEventListener('input', (e) => { if (e.target.matches?.('[data-parte]')) abrirSug(e.target); });
document.addEventListener('focusout', (e) => {
  if (e.target.matches?.('[data-parte]')) { clearTimeout(sugTimer); sugTimer = setTimeout(fecharSug, 400); }
});
sugBox.addEventListener('mousedown', (e) => e.preventDefault());   // tocar na lista não tira o foco do campo
sugBox.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-nome]'); if (!b || !sugAlvo) return;
  const i = sugAlvo, nome = b.dataset.nome; fecharSug();
  // toque na lista é fácil de errar no celular: pede confirmação antes de lançar o nome
  const [iso, turnoId, idx, pi] = i.dataset.parte.split('|');
  const atual = (partesAtuais(iso, turnoId, Number(idx))[Number(pi)] || {}).nome || '';
  if (nome !== atual && !confirm(atual ? `Trocar "${atual}" por "${nome}"?` : `Lançar "${nome}" nesta vaga?`)) { i.value = atual; i.blur(); return; }
  i.value = nome;
  i.dispatchEvent(new Event('change', { bubbles: true })); i.blur();
});
window.addEventListener('resize', posicionarSug);
window.visualViewport?.addEventListener('resize', posicionarSug);
window.addEventListener('scroll', (e) => { if (e.target !== sugBox && !sugBox.contains(e.target)) posicionarSug(); }, true);

// aviso fixo: colaboradores já escalados (de hoje em diante) neste hub que estão sem cadastro ou sem telefone
async function atualizarAvisoTelefones() {
  const box = $('#cadTel'); if (!box) return;
  if (!estado.hubId) { box.hidden = true; return; }
  const hoje = hojeIso(), diasPorNome = new Map();
  for (const [k, d] of Object.entries(estado.escalas)) {
    if (!k.startsWith(`${estado.hubId}_`) || k.slice(estado.hubId.length + 1) < hoje) continue;
    const iso = k.slice(estado.hubId.length + 1);
    for (const tid of Object.keys(d.slots || {})) for (const partes of vagasDe(d.slots[tid])) for (const p of partes) {
      if (!p?.nome) continue;
      if (!diasPorNome.has(p.nome)) diasPorNome.set(p.nome, new Set());
      diasPorNome.get(p.nome).add(iso);
    }
  }
  const locais = [...diasPorNome.keys()].filter((n) => !telOkLocal(colabDe(n))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const chave = `${estado.hubId}|${locais.join('|')}`;
  if (chave !== cadCache.chave) {
    cadCache.chave = chave; cadCache.faltam = locais.length ? (await checarTelefones(locais)) || locais : [];
    if (cadCache.chave !== chave) return;
  }
  const f = cadCache.faltam;
  if (!f.length) { box.hidden = true; return; }
  const semCad = f.filter((n) => !colabDe(n)), semTel = f.filter((n) => colabDe(n));
  // "Nome (20/11, 21/11)" — pra achar rápido onde corrigir, sem precisar vasculhar a escala.
  const diasCurtos = (nome) => [...(diasPorNome.get(nome) || [])].sort()
    .map((iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`).join(', ');
  const comDias = (lista) => lista.map((n) => `${escapeHtml(n)} (${diasCurtos(n)})`).join(', ');
  box.innerHTML = `<strong>📱 ${f.length === 1 ? '1 colaborador escalado precisa' : `${f.length} colaboradores escalados precisam`} de cadastro</strong>`
    + (semTel.length ? `<br>Sem telefone: ${comDias(semTel)}.` : '')
    + (semCad.length ? `<br>Fora da lista de colaboradores: ${comDias(semCad)}.` : '')
    + '<br>Informe em <a href="cadastros.html">Cadastros → Colaboradores</a> (telefone obrigatório, ou marque "Sem celular").';
  box.hidden = false;
}

async function salvarNome(input) {
  const [iso, turnoId, idx, pi] = input.dataset.parte.split('|');
  const nome = limparNome(input.value);
  input.value = nome;
  const partes = partesAtuais(iso, turnoId, Number(idx));
  const atual = partes[Number(pi)] || { nome: '', tipo: '' };
  if (nome === atual.nome) return;
  // só lança quem está na lista de colaboradores e com telefone cadastrado (✅)
  if (nome) {
    const sit = await situacaoTelefone(nome);
    if (sit !== 'ok') {
      input.value = atual.nome || '';
      alert(sit === 'sem-cadastro'
        ? `"${nome}" não está na lista de colaboradores.\n\nCadastre a pessoa em Cadastros → Colaboradores, com o telefone, e depois lance o nome aqui.`
        : `"${nome}" está cadastrado, mas sem telefone.\n\nInforme o telefone em Cadastros → Colaboradores (ou marque "Sem celular") e depois lance o nome aqui.`);
      return;
    }
  }
  alterarParte(iso, turnoId, Number(idx), Number(pi), { nome, tipo: '' },
    nome ? 'Salvo' : 'Horário liberado');
}

function salvarHora(input) {
  const [iso, turnoId, idx, pi, campo] = input.dataset.hora.split('|');
  const partes = partesAtuais(iso, turnoId, Number(idx));
  const p = partes[Number(pi)];
  if (!p) return;
  const turno = turnoPorId(turnoId);
  const antes = p[campo] || (campo === 'inicio' ? turno.inicio : turno.fim);
  const novo = input.value;
  if (!novo || novo === antes) { input.value = antes; return; }
  p[campo] = novo;
  // Se o próximo trecho começava onde este terminava, acompanha a mudança
  if (campo === 'fim') {
    const prox = partes[Number(pi) + 1];
    if (prox && (prox.inicio || turno.inicio) === antes) prox.inicio = novo;
  }
  if (campo === 'inicio' && Number(pi) > 0) {
    const ant = partes[Number(pi) - 1];
    if (ant && (ant.fim || turno.fim) === antes) ant.fim = novo;
  }
  gravarPartes(iso, turnoId, Number(idx), partes, 'Horário salvo');
}

// Nome como já está gravado na lista (para retirar exatamente o mesmo texto)
function nomeNaLista(iso, campo, turnoId, nome) {
  return listaDoTurno(iso, campo, turnoId).find((x) => normalizaNome(x) === normalizaNome(nome));
}

function lancar(input, campo) {
  const nome = limparNome(input.value);
  const tipo = campo === 'folgas' ? 'folga' : 'falta';
  if (!nome) {
    mostrarStatus(`Digite o nome antes de lançar a ${tipo}`, 'neutro');
    input.focus();
    return;
  }
  const [iso, turnoId] = input.dataset.aus.split('|');
  input.value = '';
  if (nomeNaLista(iso, campo, turnoId, nome)) {
    mostrarStatus(`${nome} já tem ${tipo} lançada neste turno`, 'neutro');
    return;
  }
  const noOutro = nomeNaLista(iso, campo === 'folgas' ? 'faltas' : 'folgas', turnoId, nome);
  gravar(() => lancarAusencia(estado.hubId, iso, turnoId, noOutro || nome, campo, nomeSupervisor()),
    `${capitalizar(tipo)} lançada para ${nome}`);
}

// ================= eventos =================
el.selSup.addEventListener('change', () => {
  estado.supId = el.selSup.value;
  estado.hubId = '';
  renderSeletores();
  render();
});
el.selHub.addEventListener('change', () => {
  estado.hubId = el.selHub.value;
  atualizarDatalist();
  atualizarUrl();
  render();
});

function mudarPeriodo(passo) {
  if (estado.modo === 'semana') estado.ref = addDays(estado.ref, passo * 7);
  else estado.ref = new Date(estado.ref.getFullYear(), estado.ref.getMonth() + passo, 1);
  estado.diaSel = null;
  assinarEscalas();
  render();
}
$('#btnAnterior').addEventListener('click', () => mudarPeriodo(-1));
$('#btnProximo').addEventListener('click', () => mudarPeriodo(1));
$('#btnHoje').addEventListener('click', () => {
  estado.ref = new Date();
  estado.diaSel = null;
  assinarEscalas();
  render();
});

TELA_COMPACTA.addEventListener('change', () => render());

$('#dlgFechar').addEventListener('click', () => el.dlg.close());
el.dlg.addEventListener('close', () => { estado.diaAberto = null; document.body.appendChild(el.status); });

// ================= login da administradora (pra aprovar lançamentos aqui mesmo) =================
function mensagemLoginAdmin(codigo) {
  switch (codigo) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/invalid-login-credentials': return 'Senha incorreta.';
    case 'auth/too-many-requests': return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
    case 'auth/network-request-failed': return 'Sem conexão com a internet.';
    default: return `Não foi possível entrar (${codigo || 'erro desconhecido'}).`;
  }
}

if (configuracaoPronta()) {
  aoMudarLogin((usuario) => {
    estado.souAdmin = Boolean(usuario);
    estado.emailAdmin = usuario?.email || '';
    el.btnAdmin.textContent = estado.souAdmin ? 'Sair (admin)' : 'Entrar como admin';
    render();
  });
}

el.btnAdmin.addEventListener('click', () => {
  if (estado.souAdmin) { sair(); return; }
  el.erroAdmin.textContent = '';
  el.senhaAdmin.value = '';
  el.dlgAdmin.showModal();
  el.senhaAdmin.focus();
});
$('#dlgAdminFechar').addEventListener('click', () => el.dlgAdmin.close());
el.dlgAdmin.addEventListener('click', (e) => { if (e.target === el.dlgAdmin) el.dlgAdmin.close(); });
el.formAdmin.addEventListener('submit', async (e) => {
  e.preventDefault();
  el.erroAdmin.textContent = '';
  const btn = el.formAdmin.querySelector('button');
  btn.disabled = true;
  try {
    await entrar(el.senhaAdmin.value);
    el.senhaAdmin.value = '';
    el.dlgAdmin.close();
  } catch (err) {
    el.erroAdmin.textContent = mensagemLoginAdmin(err?.code);
  } finally {
    btn.disabled = false;
  }
});
el.dlg.addEventListener('click', (e) => { if (e.target === el.dlg) el.dlg.close(); });

document.addEventListener('change', (e) => {
  const i = e.target;
  if (i.matches?.('[data-parte]')) salvarNome(i);
  else if (i.matches?.('input[data-hora]')) salvarHora(i);
});

// Enter na vaga pula para a próxima
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const i = e.target;
  if (i.matches?.('[data-parte]')) {
    e.preventDefault();
    const campos = [...document.querySelectorAll('[data-parte]:not([disabled])')]
      .filter((x) => x.offsetParent !== null);
    const prox = campos[campos.indexOf(i) + 1];
    if (prox) prox.focus(); else i.blur();
  } else if (i.matches?.('[data-aus]')) {
    e.preventDefault();
    i.blur();
  }
});

document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const ds = b.dataset;
  if (ds.editar) {
    estado.editandoParte = ds.editar;
    render();
    document.querySelector(`[data-foco="v|${CSS.escape(ds.editar)}"]`)?.focus();
  } else if (ds.concluir) {
    estado.editandoParte = null;
    render();
  } else if (ds.excluir) {
    const [iso, turnoId, idx, pi] = ds.excluir.split('|');
    excluirVaga(iso, turnoId, Number(idx), Number(pi));
  } else if (ds.aprovar) {
    const [iso, turnoId] = ds.aprovar.split('|');
    gravar(() => aprovarLancamento(estado.hubId, iso, turnoId, estado.emailAdmin || 'admin'), 'Lançamento aprovado');
  } else if (ds.lancar) {
    lancar(b.closest('.aus-add').querySelector('[data-aus]'), ds.lancar);
  } else if (ds.removerAus) {
    const [campo, iso, turnoId] = ds.removerAus.split('|');
    gravar(() => removerAusencia(estado.hubId, iso, turnoId, ds.nome, campo, nomeSupervisor()),
      campo === 'folgas' ? 'Folga retirada' : 'Falta retirada');
  } else if (ds.dia) {
    estado.diaSel = ds.dia;
    render();
    document.querySelector('.dia-unico')?.scrollIntoView({ block: 'nearest' });
  } else if (ds.abrir) {
    abrirDia(ds.abrir);
  } else if (ds.modo && ds.modo !== estado.modo) {
    estado.modo = ds.modo;
    atualizarUrl();
    assinarEscalas();
    render();
  }
});

// ================= lembrete de prazo (seg/sex 14h–16h, vale para todos os hubs) =================
// Regra: nada antes das 14h; contagem das 14h às 16h; "prazo encerrado" visível
// pelas 24h seguintes; depois disso, some — até a próxima segunda ou sexta.
// Usa a hora real do aparelho a cada verificação (não a hora do carregamento
// da página), então funciona igual depois de recarregar ou noutro dispositivo.
function ultimaOcorrencia(agora, diaSemana, hora) {
  for (let i = 0; i < 8; i++) {
    const d = addDays(agora, -i);
    if (d.getDay() === diaSemana) {
      const marca = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hora, 0, 0, 0);
      if (marca <= agora) return marca;
    }
  }
  return null;
}
function janelaLancamento(agora, diaSemana) {
  const inicio = ultimaOcorrencia(agora, diaSemana, 14);
  if (!inicio) return null;
  const fimContagem = new Date(inicio.getTime() + 2 * 3600000);
  const fimEncerrado = new Date(fimContagem.getTime() + 24 * 3600000);
  if (agora < fimContagem) return { estado: 'contagem', inicio, fim: fimContagem, diaSemana };
  if (agora < fimEncerrado) return { estado: 'encerrado', inicio, fim: fimContagem, diaSemana };
  return null;
}
function janelaAtual() {
  const agora = new Date();
  return janelaLancamento(agora, 1) || janelaLancamento(agora, 5); // 1 = segunda, 5 = sexta
}

// "Lançada" = pelo menos uma vaga preenchida na semana-alvo, em qualquer hub.
// "Completa" = nenhum buraco em nenhuma vaga necessária da semana-alvo.
function materializarSemana(escalasMap, ini, fim) {
  let temVaga = false, temBuraco = false, temNecessidade = false;
  for (let d = new Date(ini); d <= fim; d = addDays(d, 1)) {
    const iso = isoDate(d);
    const dow = d.getDay();
    for (const hub of estado.cfg.hubs) {
      for (const t of estado.cfg.turnos.filter((x) => x.hubId === hub.id)) {
        if (!Number(t.vagas?.[dow])) continue;
        temNecessidade = true;
        for (const v of vagasDoTurno(estado.cfg, escalasMap, hub.id, t, iso, dow)) {
          if (v.dispensada) continue;
          if (!v.vazia) temVaga = true;
          if (!v.coberta) temBuraco = true;
        }
      }
    }
  }
  return { lancada: temVaga, completa: temNecessidade && !temBuraco };
}

function assinarLembrete(ini, fim) {
  const chave = `${isoDate(ini)}|${isoDate(fim)}`;
  if (chave === estado.lembrete.chaveFaixa) return;
  estado.lembrete.chaveFaixa = chave;
  estado.lembrete.cancelar?.();
  estado.lembrete.escalas = {};
  estado.lembrete.prontas = false;
  estado.lembrete.cancelar = ouvirEscalas(isoDate(ini), isoDate(fim), (mapa) => {
    estado.lembrete.escalas = mapa;
    estado.lembrete.prontas = true;
    montarLembrete();
  }, () => {});
}

function montarLembrete() {
  if (!el.lembrete || !estado.cfg) return;
  const janela = janelaAtual();
  if (!janela) { el.lembrete.hidden = true; return; }

  const semanaAlvoIni = janela.diaSemana === 1 ? startOfWeek(janela.inicio) : addDays(startOfWeek(janela.inicio), 7);
  const semanaAlvoFim = addDays(semanaAlvoIni, 6);
  assinarLembrete(semanaAlvoIni, semanaAlvoFim);
  const txtSemana = tituloSemana(semanaAlvoIni, semanaAlvoFim);

  el.lembrete.hidden = false;
  if (!estado.lembrete.prontas) {
    el.lembrete.className = 'lembrete';
    el.lembrete.innerHTML = '<span>Verificando a escala…</span>';
    return;
  }
  const { lancada, completa } = materializarSemana(estado.lembrete.escalas, semanaAlvoIni, semanaAlvoFim);
  const situacao = completa
    ? 'Cobertura completa.'
    : (lancada ? 'Escala lançada, mas ainda com vagas descobertas.' : 'Escala ainda não lançada.');

  if (janela.estado === 'contagem') {
    const restante = janela.fim.getTime() - Date.now();
    const h = Math.max(0, Math.floor(restante / 3600000));
    const m = Math.max(0, Math.floor((restante % 3600000) / 60000));
    el.lembrete.className = `lembrete lembrete-contagem ${completa ? 'lembrete-ok' : 'lembrete-alerta'}`;
    el.lembrete.innerHTML = `<strong>Prazo até 16h para lançar a escala da semana de ${txtSemana}</strong>
      <span>Faltam ${h}h${String(m).padStart(2, '0')} · ${situacao}</span>`;
  } else {
    el.lembrete.className = `lembrete lembrete-fechado ${completa ? 'lembrete-ok' : 'lembrete-alerta'}`;
    el.lembrete.innerHTML = `<strong>Prazo encerrado</strong>
      <span>Semana de ${txtSemana}: ${situacao}</span>`;
  }
}

setInterval(montarLembrete, 30000);

// ================= início =================
if (!configuracaoPronta()) {
  el.selSup.disabled = true;
  mostrarAviso('Falta conectar o Firebase',
    'Preencha o arquivo <code>firebase-config.js</code> com os dados do seu projeto. O passo a passo está no README.');
} else {
  el.selSup.innerHTML = '<option>Carregando…</option>';
  el.selSup.disabled = true;
  ouvirConfig((cfg) => {
    estado.cfg = cfg;
    el.selSup.disabled = false;
    renderSeletores();
    assinarEscalas();
    render();
    montarLembrete();
  }, erroLeitura);
}
