// Login do administrador (página de Cadastros e Escala). A sessão fica no servidor da Central (cookie), sem Firebase Auth no navegador.
import { ADMIN_EMAIL } from './firebase-config.js';

let usuario = null;
const ouvintes = new Set();
const avisa = () => ouvintes.forEach((cb) => cb(usuario));
const lerStatus = async () => {
  try { const j = await (await fetch('/api/escala/status', { credentials: 'same-origin', cache: 'no-store' })).json(); usuario = j.ok ? { email: j.email || ADMIN_EMAIL } : null; }
  catch { usuario = null; }
};

export async function entrar(senha) {
  const r = await fetch('/api/escala/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ senha }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || 'Senha incorreta.'); e.code = 'auth/invalid-credential'; throw e; }
  usuario = { email: j.email || ADMIN_EMAIL }; avisa();
}
export async function sair() { await fetch('/api/escala/sair', { credentials: 'same-origin' }).catch(() => {}); usuario = null; avisa(); }
export const tokenAdmin = async () => (usuario ? 'sessao' : null);
export function aoMudarLogin(cb) {
  ouvintes.add(cb);
  lerStatus().then(() => cb(usuario));
  return () => ouvintes.delete(cb);
}
