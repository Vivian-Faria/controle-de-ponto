// Login do administrador (página de Cadastros).
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { obterApp } from './db.js';
import { ADMIN_EMAIL } from './firebase-config.js';

let auth;
const obterAuth = () => (auth ??= getAuth(obterApp()));

export const entrar = (senha) => signInWithEmailAndPassword(obterAuth(), ADMIN_EMAIL, senha);
export const sair = () => signOut(obterAuth());
export const tokenAdmin = () => obterAuth().currentUser?.getIdToken();
export const aoMudarLogin = (cb) => onAuthStateChanged(obterAuth(), cb);
