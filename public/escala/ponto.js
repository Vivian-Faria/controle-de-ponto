// Página 3 — Ponto: cada colaborador registra a própria chegada, almoço e
// saída com uma selfie. Sem senha, sem data para trás — é sempre o dia de hoje,
// no momento em que a pessoa está ali.
import { configuracaoPronta, cloudinaryConfigurado, ouvirConfig, ouvirPontoDoDia, enviarFotoPonto, salvarBatida } from './db.js';
import {
  DIAS_LONGO, MESES, isoDate, escapeHtml, porNome, limparNome, normalizaNome, horaAgora, criarStatus
} from './utils.js';

const $ = (s) => document.querySelector(s);
const el = {
  inNome: $('#inNome'), selHub: $('#selHub'), aviso: $('#aviso'), painel: $('#painel'),
  data: $('#pontoData'), passos: $('#passos'), lista: $('#listaColaboradores'), inputFoto: $('#inputFoto')
};
const mostrarStatus = criarStatus($('#status'));

const PASSOS = [
  { campo: 'chegada', rotulo: 'Chegada', acao: 'Registrar chegada' },
  { campo: 'saidaAlmoco', rotulo: 'Saída para o almoço', acao: 'Registrar saída para o almoço' },
  { campo: 'voltaAlmoco', rotulo: 'Volta do almoço', acao: 'Registrar volta do almoço' },
  { campo: 'saida', rotulo: 'Saída', acao: 'Registrar saída' }
];

const hojeIso = isoDate(new Date());
const estado = {
  cfg: null,
  hubId: '',
  nome: '',
  registro: null,      // o que já foi batido hoje, vindo do Firestore
  cancelar: null,
  chaveAtual: '',
  pendente: null,       // campo aguardando a foto ser tirada
  previas: {}           // fotos locais desta sessão, só para o colaborador se ver
};

// ================= início =================
if (!configuracaoPronta()) {
  mostrarAviso('Falta conectar o Firebase',
    'Preencha o arquivo <code>firebase-config.js</code> com os dados do seu projeto.');
} else if (!cloudinaryConfigurado()) {
  mostrarAviso('Falta conectar o Cloudinary',
    'Preencha o arquivo <code>cloudinary-config.js</code> com os dados da sua conta gratuita do Cloudinary. O passo a passo está no README.');
} else {
  ouvirConfig((cfg) => {
    estado.cfg = cfg;
    renderHubs();
    render();
  }, erroLeitura);
}

function mostrarAviso(titulo, texto) {
  el.aviso.innerHTML = `<h2>${titulo}</h2><p>${texto}</p>`;
  el.aviso.hidden = false;
  el.painel.hidden = true;
}
function erroLeitura(err) {
  console.error(err);
  mostrarAviso('Não foi possível carregar', err?.code === 'permission-denied'
    ? 'O Firestore recusou a leitura. Confira se as regras foram publicadas.'
    : 'Verifique a conexão com a internet e recarregue a página.');
}
function erroGravacao(err) {
  console.error(err);
  mostrarStatus(err?.code === 'permission-denied'
    ? 'Não foi possível salvar: as regras do Firestore ou do Storage recusaram.'
    : 'Não foi possível salvar. Verifique a conexão e tente de novo.', 'erro', true);
}

function renderHubs() {
  const hubs = [...estado.cfg.hubs].sort(porNome);
  el.selHub.innerHTML = '<option value="">Selecione o hub</option>'
    + hubs.map((h) => `<option value="${h.id}">${escapeHtml(h.nome)}</option>`).join('');
  el.selHub.value = estado.hubId;
  atualizarDatalist();
}
function atualizarDatalist() {
  const todos = estado.cfg.colaboradores;
  let lista = todos.filter((c) => !c.hubId || c.hubId === estado.hubId);
  if (!lista.length) lista = todos;
  el.lista.innerHTML = [...lista].sort(porNome)
    .map((c) => `<option value="${escapeHtml(c.nome)}"></option>`).join('');
}

// ================= assinatura do registro do dia =================
function assinar() {
  const chave = `${estado.hubId}|${normalizaNome(estado.nome)}`;
  if (chave === estado.chaveAtual) return;
  estado.chaveAtual = chave;
  estado.cancelar?.();
  estado.registro = null;
  estado.previas = {};
  if (!estado.hubId || !normalizaNome(estado.nome)) { render(); return; }
  estado.cancelar = ouvirPontoDoDia(estado.hubId, hojeIso, normalizaNome(estado.nome), (reg) => {
    estado.registro = reg;
    render();
  }, erroLeitura);
}

// ================= render =================
function render() {
  if (!estado.cfg) return;
  if (!estado.cfg.hubs.length) {
    return mostrarAviso('Nada cadastrado ainda', 'Nenhum hub foi cadastrado. Configure em <a href="cadastros.html">Cadastros</a>.');
  }
  if (!estado.hubId || !limparNome(estado.nome)) {
    return mostrarAviso('Digite seu nome e escolha o hub', 'Depois disso aparecem os passos do seu ponto de hoje.');
  }
  el.aviso.hidden = true;
  el.painel.hidden = false;

  const hoje = new Date();
  el.data.textContent = `${DIAS_LONGO[hoje.getDay()]}, ${hoje.getDate()} de ${MESES[hoje.getMonth()]}`;

  const reg = estado.registro;
  const feitos = PASSOS.map((p) => Boolean(reg?.[p.campo]?.hora));
  const proximo = feitos.indexOf(false);

  el.passos.innerHTML = PASSOS.map((p, i) => {
    const feito = feitos[i];
    const bloqueado = !feito && i !== proximo;
    if (feito) return htmlPassoFeito(p, reg[p.campo]);
    if (bloqueado) return htmlPassoBloqueado(p);
    return htmlPassoAtual(p);
  }).join('');

  if (proximo === -1) {
    el.passos.insertAdjacentHTML('beforeend', '<p class="passos-fim">Ponto completo por hoje. Bom descanso!</p>');
  }
}

function htmlPassoFeito(p, dados) {
  const preview = estado.previas[p.campo];
  return `<article class="passo feito">
    <div class="passo-txt">
      <span class="passo-check" aria-hidden="true">✓</span>
      <div>
        <p class="passo-rot">${p.rotulo}</p>
        <p class="passo-hora">${escapeHtml(dados.hora)}</p>
      </div>
    </div>
    ${preview ? `<img class="passo-foto" src="${preview}" alt="Foto de ${p.rotulo.toLowerCase()}">` : ''}
    <button type="button" class="btn-texto" data-corrigir="${p.campo}">Refazer</button>
  </article>`;
}
function htmlPassoBloqueado(p) {
  return `<article class="passo bloqueado">
    <p class="passo-rot">${p.rotulo}</p>
    <p class="passo-obs">Disponível depois da etapa anterior</p>
  </article>`;
}
function htmlPassoAtual(p) {
  return `<article class="passo atual">
    <p class="passo-rot">${p.rotulo}</p>
    <button type="button" class="btn-camera" data-tirar="${p.campo}">
      <span class="btn-camera-icone" aria-hidden="true">📷</span> ${p.acao}
    </button>
  </article>`;
}

// ================= captura e envio da foto =================
function comprimir(blob) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const max = 720;
      const escala = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      canvas.toBlob((menor) => resolve(menor || blob), 'image/jpeg', 0.72);
    };
    img.onerror = () => resolve(blob);
    img.src = URL.createObjectURL(blob);
  });
}

el.inNome.addEventListener('input', () => { estado.nome = el.inNome.value; });
el.inNome.addEventListener('change', () => { estado.nome = limparNome(el.inNome.value); assinar(); render(); });
el.selHub.addEventListener('change', () => {
  estado.hubId = el.selHub.value;
  atualizarDatalist();
  assinar();
  render();
});

document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const campo = b.dataset.tirar || b.dataset.corrigir;
  if (!campo) return;
  if (!limparNome(estado.nome)) { mostrarStatus('Digite seu nome primeiro', 'neutro'); return; }
  estado.pendente = campo;
  el.inputFoto.value = '';
  el.inputFoto.click();
});

el.inputFoto.addEventListener('change', async () => {
  const campo = estado.pendente;
  const arquivo = el.inputFoto.files?.[0];
  estado.pendente = null;
  if (!campo || !arquivo) return;

  estado.previas[campo] = URL.createObjectURL(arquivo);
  render();
  mostrarStatus('Enviando foto…', 'neutro', true);
  try {
    const hora = horaAgora();
    const menor = await comprimir(arquivo);
    const nome = limparNome(estado.nome);
    const chave = normalizaNome(nome);
    const foto = await enviarFotoPonto(estado.hubId, hojeIso, chave, campo, menor);
    await salvarBatida(estado.hubId, hojeIso, chave, nome, campo, hora, foto);
    mostrarStatus(`${PASSOS.find((p) => p.campo === campo).rotulo} registrada às ${hora}`);
  } catch (err) {
    if (err?.code === 'cloudinary/preset-invalido') {
      mostrarStatus('Não foi possível enviar a foto: confira o cloudinary-config.js (nome da conta e do preset).', 'erro', true);
    } else {
      erroGravacao(err);
    }
  }
});
