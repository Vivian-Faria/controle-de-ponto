// Dá uma "dinâmica de digitação" previsível para os campos de horário
// (Entra/Sai, Início/Fim) — eles são <input type="text"> normais com a
// classe "campo-hora"; este script só formata o que é digitado como
// HH:MM, sem precisar de nenhum widget nativo de horário (que varia muito
// de navegador pra navegador e é difícil de combinar com o tema do site).
//
// Como o valor final continua sendo uma string "HH:MM" normal em
// input.value, nada no escala.js/cadastros.js precisa mudar — eles
// continuam ouvindo "change" e lendo .value como sempre.
//
// Tudo por delegação de evento no document, então funciona automaticamente
// em qualquer campo .campo-hora, inclusive os que o app recria depois via
// innerHTML — não precisa re-registrar nada.
(function () {
  'use strict';

  function soDigitos(v) {
    return (v || '').replace(/\D/g, '').slice(0, 4);
  }

  // Monta a parte da hora a partir dos dígitos já digitados.
  // Primeiro dígito >= 3 não pode começar uma hora de dois dígitos (24h vai
  // só até 23), então já fecha a hora como "0X" e libera o resto pros minutos
  // — é o que faz digitar "830" virar "08:30" direto, sem precisar de um
  // separador manual.
  function montarHora(digitos) {
    if (digitos.length === 0) return { hora: '', resto: '', completa: false };
    const d0 = digitos[0];
    if (digitos.length === 1) {
      if (d0 >= '3') return { hora: '0' + d0, resto: '', completa: true };
      return { hora: d0, resto: '', completa: false };
    }
    const d1 = digitos[1];
    let hora = d0 + d1;
    if (Number(hora) > 23) hora = d0 <= '2' ? d0 + '3' : '23';
    return { hora, resto: digitos.slice(2), completa: true };
  }

  function montarMinuto(digitos) {
    if (digitos.length === 0) return { minuto: '', completo: false };
    const d0 = digitos[0];
    if (digitos.length === 1) {
      if (d0 >= '6') return { minuto: '0' + d0, completo: true };
      return { minuto: d0, completo: false };
    }
    let minuto = digitos[0] + digitos[1];
    if (Number(minuto) > 59) minuto = '59';
    return { minuto, completo: true };
  }

  // Constrói o texto exibido (ex.: "8" -> "8", "08" -> "08:", "08:3" -> "08:3")
  function formatar(raw) {
    const { hora, resto } = montarHora(soDigitos(raw));
    if (!hora) return '';
    if (!resto && hora.length < 2) return hora; // ainda esperando o 2º dígito da hora
    const { minuto } = montarMinuto(resto);
    return minuto ? `${hora}:${minuto}` : `${hora}:`;
  }

  // Fecha o valor em "HH:MM" completo ao sair do campo — completa dígitos
  // soltos (ex.: "08:3" -> "08:30", "9" -> "09:00").
  function finalizar(raw) {
    const { hora, resto } = montarHora(soDigitos(raw));
    if (!hora) return '';
    const horaCheia = hora.length < 2 ? hora.padStart(2, '0') : hora;
    if (!resto) return `${horaCheia}:00`;
    let { minuto } = montarMinuto(resto);
    if (minuto.length < 2) minuto = (minuto + '0').padStart(2, '0');
    return `${horaCheia}:${minuto}`;
  }

  document.addEventListener('focusin', (e) => {
    if (e.target.matches?.('.campo-hora')) e.target.select();
  });

  // Backspace logo depois do ":" apaga o dígito anterior também — sem isso
  // o usuário fica "preso" porque o ":" é recriado na hora pelo formatar().
  document.addEventListener('keydown', (e) => {
    const i = e.target;
    if (!i.matches?.('.campo-hora')) return;

    // O cursor fica sempre no fim (ver o listener de "input" abaixo), então
    // cair bem depois do ":" só acontece quando a hora acabou de ser
    // fechada sozinha (ex.: digitou "08" e apareceu "08:"). Nesse caso um
    // Backspace "normal" apagaria só o ":", que é reposto na hora pelo
    // formatar() — ficaria preso sem conseguir editar a hora de novo. Por
    // isso aqui o Backspace limpa a hora inteira, liberando pra redigitar.
    if (e.key === 'Backspace' && i.selectionStart === i.selectionEnd
      && i.selectionStart === i.value.length && i.value.slice(-1) === ':') {
      e.preventDefault();
      i.value = '';
      i.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const partes = i.value.split(':');
      let h = Number(partes[0] || 0);
      let m = Number(partes[1] || 0);
      const naHora = !i.value.includes(':') || i.selectionStart <= i.value.indexOf(':');
      const delta = e.key === 'ArrowUp' ? 1 : -1;
      if (naHora) h = (h + delta + 24) % 24; else m = (m + delta + 60) % 60;
      i.value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      i.setSelectionRange(naHora ? 2 : 5, naHora ? 2 : 5);
      i.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  document.addEventListener('input', (e) => {
    const i = e.target;
    if (!i.matches?.('.campo-hora')) return;
    const formatado = formatar(i.value);
    if (formatado !== i.value) i.value = formatado;
    i.setSelectionRange(i.value.length, i.value.length);
  });

  // Ao sair do campo, o navegador dispara "change" ANTES de "blur"/"focusout"
  // — então não dá pra completar o valor (ex.: "08:3" -> "08:30") num
  // listener de blur, porque o app já teria lido o valor incompleto antes
  // disso. A saída é ouvir "change" na fase de CAPTURA: ela roda antes de
  // qualquer listener de "change" em fase de bolha (como o do escala.js),
  // então dá tempo de fechar o valor em HH:MM antes do app lê-lo.
  document.addEventListener('change', (e) => {
    const i = e.target;
    if (!i.matches?.('.campo-hora')) return;
    const fechado = finalizar(i.value);
    if (fechado !== i.value) i.value = fechado;
  }, true);
})();
