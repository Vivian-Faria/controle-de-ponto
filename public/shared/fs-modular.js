// Mesmas funções do SDK modular do Firestore (usado pelo app da escala), falando com o banco de documentos da Órion.
if (!window.FSCore) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = '/shared/fs-core.js'; s.onload = ok; s.onerror = () => no(new Error('fs-core.js não carregou')); document.head.appendChild(s); });
const C = window.FSCore;
export const initializeApp = (cfg) => ({ cfg });
export const getFirestore = (app) => new C.Db(app.cfg, 'modular');
export const collection = (db, col) => new C.ColRef(db, col);
export const doc = (db, col, id) => new C.DocRef(db, col, id);
export const where = (f, op, v) => ({ __w: [f, op, v] });
export const query = (colRef, ...ws) => { let q = colRef; for (const w of ws) q = q.where(...w.__w); return q; };
export const getDoc = (ref) => ref.get();
export const getDocs = (q) => q.get();
export const setDoc = (ref, data, opt) => ref.set(data, opt);
export const deleteDoc = (ref) => ref.delete();
export const onSnapshot = (ref, ok, err) => ref.onSnapshot(ok, err);
export const writeBatch = (db) => db.batch();
export const serverTimestamp = C.sentinelas.serverTimestamp;
export const arrayUnion = C.sentinelas.arrayUnion;
export const arrayRemove = C.sentinelas.arrayRemove;
