/* Troca o "firebase" (SDK compat) das páginas da Central pelo banco de documentos da Órion. Mesmas chamadas, outro destino. */
(function(){
  var apps = {};
  window.firebase = {
    initializeApp: function(cfg){ apps.cfg = cfg; return {}; },
    firestore: function(){ return apps.db || (apps.db = new FSCore.Db(apps.cfg, 'compat')); }
  };
  window.firebase.firestore.FieldValue = { serverTimestamp: FSCore.sentinelas.serverTimestamp, arrayUnion: FSCore.sentinelas.arrayUnion, arrayRemove: FSCore.sentinelas.arrayRemove };
})();
