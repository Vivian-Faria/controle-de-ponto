// Feriados nacionais e datas comemorativas calculados automaticamente.
// Feriados municipais/estaduais e outras datas são cadastrados na página de Cadastros.
import { isoDate, addDays } from './utils.js';

export const ROTULO_TIPO = {
  feriado: 'Feriado',
  facultativo: 'Ponto facultativo',
  comemorativa: 'Data comemorativa'
};
const PESO = { feriado: 3, facultativo: 2, comemorativa: 1 };

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher)
function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}
// n-ésimo domingo do mês (mes0: 0 = janeiro)
function nDomingo(ano, mes0, n) {
  const primeiro = 1 + ((7 - new Date(ano, mes0, 1).getDay()) % 7);
  return new Date(ano, mes0, primeiro + (n - 1) * 7);
}
// Dia seguinte à 4ª quinta-feira de novembro
function blackFriday(ano) {
  const primeiraQuinta = 1 + ((4 - new Date(ano, 10, 1).getDay() + 7) % 7);
  return new Date(ano, 10, primeiraQuinta + 22);
}

const cache = new Map();
export function datasDoAno(ano) {
  if (cache.has(ano)) return cache.get(ano);
  const p = pascoa(ano);
  const f = (m, d) => isoDate(new Date(ano, m - 1, d));
  const lista = [
    { data: f(1, 1), nome: 'Confraternização Universal', tipo: 'feriado' },
    { data: isoDate(addDays(p, -48)), nome: 'Carnaval', tipo: 'facultativo' },
    { data: isoDate(addDays(p, -47)), nome: 'Carnaval', tipo: 'facultativo' },
    { data: isoDate(addDays(p, -2)), nome: 'Sexta-feira Santa', tipo: 'feriado' },
    { data: isoDate(p), nome: 'Páscoa', tipo: 'comemorativa' },
    { data: f(4, 21), nome: 'Tiradentes', tipo: 'feriado' },
    { data: f(5, 1), nome: 'Dia do Trabalhador', tipo: 'feriado' },
    { data: isoDate(nDomingo(ano, 4, 2)), nome: 'Dia das Mães', tipo: 'comemorativa' },
    { data: f(6, 12), nome: 'Dia dos Namorados', tipo: 'comemorativa' },
    { data: isoDate(addDays(p, 60)), nome: 'Corpus Christi', tipo: 'facultativo' },
    { data: isoDate(nDomingo(ano, 7, 2)), nome: 'Dia dos Pais', tipo: 'comemorativa' },
    { data: f(9, 7), nome: 'Independência do Brasil', tipo: 'feriado' },
    { data: f(10, 12), nome: 'Nossa Senhora Aparecida e Dia das Crianças', tipo: 'feriado' },
    { data: f(11, 2), nome: 'Finados', tipo: 'feriado' },
    { data: f(11, 15), nome: 'Proclamação da República', tipo: 'feriado' },
    { data: f(11, 20), nome: 'Dia da Consciência Negra', tipo: 'feriado' },
    { data: isoDate(blackFriday(ano)), nome: 'Black Friday', tipo: 'comemorativa' },
    { data: f(12, 24), nome: 'Véspera de Natal', tipo: 'comemorativa' },
    { data: f(12, 25), nome: 'Natal', tipo: 'feriado' },
    { data: f(12, 31), nome: 'Véspera de Ano Novo', tipo: 'comemorativa' }
  ].sort((a, b) => a.data.localeCompare(b.data));
  cache.set(ano, lista);
  return lista;
}

// Datas especiais de um dia: as automáticas + as cadastradas (que podem repetir todo ano)
export function marcosDoDia(iso, cadastradas = []) {
  const lista = datasDoAno(Number(iso.slice(0, 4))).filter((x) => x.data === iso);
  for (const c of cadastradas) {
    if (!c.data) continue;
    const bate = c.anual ? c.data.slice(5) === iso.slice(5) : c.data === iso;
    if (bate) lista.push({ data: iso, nome: c.nome, tipo: c.tipo || 'feriado' });
  }
  return lista.sort((a, b) => PESO[b.tipo] - PESO[a.tipo]);
}
