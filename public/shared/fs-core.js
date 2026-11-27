/* Cliente do banco de documentos da Órion (substitui o SDK do Firebase no navegador).
   Fala com /api/fs/<projeto>/... no mesmo endereço do site. Expõe window.FSCore (usado por fs-compat.js e fs-modular.js). */
(function(){
  if (window.FSCore) return;
  var PROJ = { 'central-orion': 'central', 'escalas-operacional-orion': 'escala' };
  var POLL = 2500;

  function api(path, opt){
    return fetch(path, Object.assign({ credentials: 'same-origin', cache: 'no-store' }, opt || {})).then(function(r){
      return r.json().catch(function(){ return null; }).then(function(j){
        if (!r.ok) { var e = new Error((j && j.error) || ('HTTP ' + r.status)); e.status = r.status; e.code = r.status === 403 ? 'permission-denied' : 'unavailable'; throw e; }
        return j;
      });
    });
  }
  var clone = function(v){ return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); };
  var sentinelas = {
    serverTimestamp: function(){ return { $fs: 'ts' }; },
    arrayUnion: function(){ return { $fs: 'union', v: [].slice.call(arguments) }; },
    arrayRemove: function(){ return { $fs: 'remove', v: [].slice.call(arguments) }; }
  };

  // ---- ouvir (consulta periódica por versão) ----
  var ouvintes = new Set();
  function ouvir(buscar, aoReceber, aoErrar){
    var vivo = true, timer = null, ver = null;
    var o = { puxar: puxar };
    function agenda(){ if (vivo) timer = setTimeout(puxar, POLL); }
    function puxar(){
      clearTimeout(timer);
      if (!vivo) return Promise.resolve();
      if (document.hidden && ver !== null) { agenda(); return Promise.resolve(); }
      return buscar(ver).then(function(res){
        if (!vivo) return;
        if (!res.igual) { ver = res.ver; aoReceber(res); }
      }).catch(function(e){ if (vivo && aoErrar) aoErrar(e); }).then(agenda);
    }
    ouvintes.add(o); puxar();
    return function(){ vivo = false; clearTimeout(timer); ouvintes.delete(o); };
  }
  function atualizarTodos(){ ouvintes.forEach(function(o){ o.puxar(); }); }
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) atualizarTodos(); });

  // ---- snapshots (modo: 'compat' => exists é propriedade; 'modular' => exists() é função) ----
  function DocSnap(ref, res, modo){
    this.id = ref.id; this.ref = ref; this._d = res && res.exists ? res.data : undefined; this._upd = res ? res.upd : 0;
    if (modo === 'compat') this.exists = !!(res && res.exists); else { var ex = !!(res && res.exists); this.exists = function(){ return ex; }; }
  }
  DocSnap.prototype.data = function(){ return this._d === undefined ? undefined : clone(this._d); };
  DocSnap.prototype.get = function(f){ return this._d ? this._d[f] : undefined; };
  function QSnap(db, col, docs, modo){
    var self = this;
    this.docs = docs.map(function(d){ return new DocSnap(new DocRef(db, col, d.id), { exists: true, data: d.data, upd: d.upd }, modo); });
    this.size = this.docs.length; this.empty = !this.docs.length;
    this.forEach = function(fn){ self.docs.forEach(fn); };
  }

  function Db(cfg, modo){ this.proj = PROJ[cfg && cfg.projectId] || 'central'; this.modo = modo; }
  function ColRef(db, col, where){ this.db = db; this.col = col; this.id = col; this._where = where || []; }
  function DocRef(db, col, id){ this.db = db; this.col = col; this.id = id; this.path = col + '/' + id; }

  ColRef.prototype.where = function(f, op, v){ return new ColRef(this.db, this.col, this._where.concat([[f, op, v]])); };
  ColRef.prototype.doc = function(id){ return new DocRef(this.db, this.col, id); };
  ColRef.prototype._url = function(ver){ return '/api/fs/' + this.db.proj + '/' + this.col + '?where=' + encodeURIComponent(JSON.stringify(this._where)) + (ver ? '&ver=' + encodeURIComponent(ver) : ''); };
  ColRef.prototype.get = function(){ var s = this; return api(this._url()).then(function(r){ return new QSnap(s.db, s.col, r.docs || [], s.db.modo); }); };
  ColRef.prototype.onSnapshot = function(ok, err){ var s = this; return ouvir(function(ver){ return api(s._url(ver)); }, function(r){ ok(new QSnap(s.db, s.col, r.docs || [], s.db.modo)); }, err); };

  DocRef.prototype._url = function(){ return '/api/fs/' + this.db.proj + '/' + this.col + '/' + encodeURIComponent(this.id); };
  DocRef.prototype.get = function(){ var s = this; return api(this._url()).then(function(r){ return new DocSnap(s, r, s.db.modo); }); };
  DocRef.prototype.onSnapshot = function(ok, err){ var s = this; var ultimo = null;
    return ouvir(function(){ return api(s._url()).then(function(r){ var ver = String(r.exists ? r.upd : 0); if (ver === ultimo) return { igual: true }; ultimo = ver; return { ver: ver, r: r }; }); },
      function(x){ ok(new DocSnap(s, x.r, s.db.modo)); }, err); };
  function escrever(db, ops){ return api('/api/fs/' + db.proj + '/lote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ops: ops }) }).then(function(r){ setTimeout(atualizarTodos, 50); return r; }); }
  DocRef.prototype.set = function(data, opt){ return escrever(this.db, [{ op: 'set', col: this.col, id: this.id, data: data, merge: !!(opt && opt.merge) }]); };
  DocRef.prototype.delete = function(){ return escrever(this.db, [{ op: 'delete', col: this.col, id: this.id }]); };

  // ---- lote e transação ----
  function Lote(db){ this.db = db; this.ops = []; }
  Lote.prototype.set = function(ref, data, opt){ this.ops.push({ op: 'set', col: ref.col, id: ref.id, data: data, merge: !!(opt && opt.merge) }); return this; };
  Lote.prototype.delete = function(ref){ this.ops.push({ op: 'delete', col: ref.col, id: ref.id }); return this; };
  Lote.prototype.commit = function(){ return this.ops.length ? escrever(this.db, this.ops) : Promise.resolve(); };

  Db.prototype.collection = function(c){ return new ColRef(this, c); };
  Db.prototype.doc = function(path){ var p = path.split('/'); return new DocRef(this, p[0], p[1]); };
  Db.prototype.batch = function(){ return new Lote(this); };
  Db.prototype.runTransaction = function(fn){
    var db = this, tentativa = 0;
    function rodar(){
      var lidos = {}, ops = [];
      var tx = {
        get: function(ref){ return ref.get().then(function(s){ lidos[ref.path] = s._upd; return s; }); },
        set: function(ref, data, opt){ ops.push({ op: 'set', col: ref.col, id: ref.id, data: data, merge: !!(opt && opt.merge), ifUpd: lidos[ref.path] }); return tx; },
        delete: function(ref){ ops.push({ op: 'delete', col: ref.col, id: ref.id, ifUpd: lidos[ref.path] }); return tx; }
      };
      return Promise.resolve(fn(tx)).then(function(res){
        return (ops.length ? escrever(db, ops) : Promise.resolve()).then(function(){ return res; });
      }).catch(function(e){ if (e && e.status === 409 && ++tentativa < 6) return rodar(); throw e; });
    }
    return rodar();
  };

  window.FSCore = { Db: Db, ColRef: ColRef, DocRef: DocRef, Lote: Lote, sentinelas: sentinelas, api: api };
})();
