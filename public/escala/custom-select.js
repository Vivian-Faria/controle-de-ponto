// Troca a aparência de todo <select> do site por um menu "de vidro" no
// mesmo tema da página (o <select> nativo continua existindo por trás,
// escondido, guardando o valor de verdade — nada no escala.js/cadastros.js
// precisa saber disso: .value e o evento "change" continuam funcionando
// exatamente como antes).
//
// Reaplica sozinho sempre que o app reconstrói um pedaço da página (o
// código observa o DOM inteiro e pega qualquer <select> novo).
(function () {
  'use strict';
  const MARCA = 'data-vidro';

  function opcoesDe(select) {
    return [...select.options].map((o) => ({
      valor: o.value, rotulo: o.textContent, desabilitada: o.disabled,
    }));
  }

  function copiarMedidas(select, wrap) {
    const cs = getComputedStyle(select);
    wrap.style.width = '100%';
    for (const prop of ['flexGrow', 'flexShrink', 'flexBasis', 'minWidth', 'maxWidth', 'alignSelf']) {
      wrap.style[prop] = cs[prop];
    }
  }

  function enhance(select) {
    if (select.hasAttribute(MARCA) || select.multiple) return;
    select.setAttribute(MARCA, '1');

    const wrap = document.createElement('div');
    wrap.className = 'vidro-select';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vidro-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    const aria = select.getAttribute('aria-label');
    if (aria) btn.setAttribute('aria-label', aria);

    const rotulo = document.createElement('span');
    rotulo.className = 'vidro-rotulo';
    const seta = document.createElement('span');
    seta.className = 'vidro-seta';
    seta.setAttribute('aria-hidden', 'true');
    btn.append(rotulo, seta);

    const pop = document.createElement('div');
    pop.className = 'vidro-pop';
    const ul = document.createElement('ul');
    ul.className = 'vidro-lista';
    ul.setAttribute('role', 'listbox');
    pop.appendChild(ul);

    wrap.append(btn, pop);
    select.insertAdjacentElement('afterend', wrap);
    copiarMedidas(select, wrap);

    // o <select> original fica só como "guardião" do valor — invisível,
    // fora do fluxo, fora da ordem de tabulação.
    Object.assign(select.style, {
      position: 'absolute', width: '1px', height: '1px',
      opacity: '0', pointerEvents: 'none', margin: '0',
    });
    select.tabIndex = -1;

    // um <label> que envolvia o select passa a abrir o menu de vidro.
    // Obs.: clicar em qualquer ponto do <label> faz o navegador reenviar um
    // clique sintético direto ao <select> associado (comportamento nativo de
    // <label>, mesmo com o select escondido) — esse clique extra tem
    // e.target === select e precisa ser ignorado, senão ele reabre o menu
    // bem depois de uma escolha real ter fechado.
    const rotuloPai = select.closest('label');
    if (rotuloPai) {
      rotuloPai.addEventListener('click', (e) => {
        if (wrap.contains(e.target) || e.target === select) return;
        e.preventDefault();
        btn.click();
      });
    }

    let itens = [];
    let aberto = false;
    let ativo = -1;

    function sincronizarRotulo() {
      const op = select.options[select.selectedIndex];
      rotulo.textContent = op ? op.textContent : '';
      rotulo.classList.toggle('vidro-vazio', !op || !op.value);
    }
    function montarLista() {
      itens = opcoesDe(select);
      ul.innerHTML = itens.map((it, i) => `<li role="option" data-i="${i}"
        aria-selected="${i === select.selectedIndex}"${it.desabilitada ? ' aria-disabled="true"' : ''}
        >${it.rotulo}</li>`).join('');
      sincronizarRotulo();
    }
    function destacar() {
      ul.querySelectorAll('li').forEach((li) => {
        li.classList.toggle('ativo', Number(li.dataset.i) === ativo);
      });
    }
    function fechar() {
      if (!aberto) return;
      aberto = false;
      pop.classList.remove('aberto');
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', aoClicarFora, true);
    }
    function aoClicarFora(e) { if (!wrap.contains(e.target)) fechar(); }
    function abrir() {
      if (btn.disabled || aberto) return;
      montarLista();
      aberto = true;
      pop.classList.add('aberto');
      btn.setAttribute('aria-expanded', 'true');
      ativo = select.selectedIndex;
      destacar();
      document.addEventListener('pointerdown', aoClicarFora, true);
      ul.querySelector(`[data-i="${ativo}"]`)?.scrollIntoView({ block: 'nearest' });
    }
    function escolher(i) {
      const it = itens[i];
      if (!it || it.desabilitada) return;
      if (select.value !== it.valor) {
        select.value = it.valor;
        // Um <select> nativo dispara "input" e depois "change" ao escolher
        // uma opção — algumas telas (os cadastros) só ouvem "input" pra
        // saber que algo mudou e mostrar a barra de salvar, então os dois
        // precisam sair daqui pra continuar funcionando como antes.
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      sincronizarRotulo();
      fechar();
      btn.focus();
    }

    btn.addEventListener('click', () => (aberto ? fechar() : abrir()));
    ul.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-i]');
      if (li) escolher(Number(li.dataset.i));
    });
    btn.addEventListener('keydown', (e) => {
      const teclas = ['ArrowDown', 'ArrowUp', 'Enter', ' ', 'Escape', 'Home', 'End', 'Tab'];
      if (teclas.includes(e.key) && e.key !== 'Tab') e.preventDefault();
      if (!aberto) {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) abrir();
        return;
      }
      if (e.key === 'Escape') { fechar(); return; }
      if (e.key === 'Enter' || e.key === ' ') { escolher(ativo); return; }
      if (e.key === 'ArrowDown') { ativo = Math.min(itens.length - 1, ativo + 1); destacar(); }
      if (e.key === 'ArrowUp') { ativo = Math.max(0, ativo - 1); destacar(); }
      if (e.key === 'Home') { ativo = 0; destacar(); }
      if (e.key === 'End') { ativo = itens.length - 1; destacar(); }
      if (aberto) ul.querySelector(`[data-i="${ativo}"]`)?.scrollIntoView({ block: 'nearest' });
    });

    // o resto do app lê/escreve select.value e select.disabled normalmente;
    // este código só precisa ficar sabendo quando isso acontece.
    const protoDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    Object.defineProperty(select, 'value', {
      configurable: true,
      get() { return protoDesc.get.call(select); },
      set(v) {
        protoDesc.set.call(select, v);
        sincronizarRotulo();
        if (aberto) destacar();
      },
    });

    new MutationObserver(montarLista).observe(select, { childList: true });
    new MutationObserver(() => {
      const des = select.disabled;
      btn.disabled = des;
      btn.tabIndex = des ? -1 : 0;
      wrap.classList.toggle('vidro-desabilitado', des);
      copiarMedidas(select, wrap);
    }).observe(select, { attributes: true, attributeFilter: ['disabled'] });

    btn.disabled = select.disabled;
    wrap.classList.toggle('vidro-desabilitado', select.disabled);
    montarLista();
  }

  function varrer(raiz) {
    if (raiz.matches?.('select')) enhance(raiz);
    raiz.querySelectorAll?.('select').forEach(enhance);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => varrer(document.body));
  } else {
    varrer(document.body);
  }

  new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach((n) => { if (n.nodeType === 1) varrer(n); });
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
