/* ============ Central · Manutenções dos hubs ============
   Registro de manutenções por hub (só documentação, o Financeiro não atua). Guardado no mesmo banco dos pedidos
   (coleção compras_pedidos, campo kind:'manutencao'), então não precisa de regra nova no Firestore.
   Alimenta o indicador de manutenção do dashboard (window.Manut). */
(function(){
const TIPOS = ['Elétrica','Hidráulica','Refrigeração (freezer/geladeira)','Ar-condicionado','Equipamento de cozinha','Estrutura / civil','Mobiliário','Internet / TI','Outros'];
const URG = { baixa:'Baixa', media:'Média', alta:'Alta' };
const HUBID = { 'Varanda Sion':'sion', 'Varanda Cidade Nova':'cn', 'Varanda Buritis':'bur', 'Varanda Castelo':'cas', 'Expedição Órion Sion':'exp' };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dayKey = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
const fmtD = k => k ? k.split('-').reverse().join('/') : '';
const F = { q:'', hub:'', tipo:'', status:'todos', dias:30 };
let editing = null;

const St = () => window.ComprasStore;
const all = () => (St() ? St().list() : []);
const from = dias => { if(!dias) return ''; const d = new Date(); d.setDate(d.getDate() - dias + 1); return dayKey(d); };
const inPeriod = (o, dias) => !dias || (o.ocorreuEm || '') >= from(dias);

/* ---- API para o dashboard ---- */
window.Manut = {
  tipos: TIPOS, hubId: n => HUBID[n] || '',
  /** { total, abertas, porHub:{sion:n,...}, porTipo:{tipo:n}, urgentes } nos últimos `dias` */
  resumo(dias, de, ate){      // com de/ate (AAAA-MM-DD) usa exatamente a janela escolhida no dashboard
    const r = { total:0, abertas:0, urgentes:0, porHub:{}, porTipo:{}, custo:0 };
    all().filter(o => de ? ((o.ocorreuEm || '') >= de && (o.ocorreuEm || '') <= (ate || '9999')) : inPeriod(o, dias)).forEach(o => {
      r.total++; if(o.status !== 'resolvida') r.abertas++; if(o.urgencia === 'alta') r.urgentes++;
      const h = HUBID[o.hub]; if(h) r.porHub[h] = (r.porHub[h] || 0) + 1;
      r.porTipo[o.tipo] = (r.porTipo[o.tipo] || 0) + 1;
      const c = parseFloat(String(o.custo || '').replace(/\./g,'').replace(',','.')); if(isFinite(c)) r.custo += c;
    });
    return r;
  }
};

function filtered(){
  const q = F.q.trim().toLowerCase();
  return all().filter(o => {
    if(F.hub && o.hub !== F.hub) return false;
    if(F.tipo && o.tipo !== F.tipo) return false;
    if(F.status === 'abertas' && o.status === 'resolvida') return false;
    if(F.status === 'resolvidas' && o.status !== 'resolvida') return false;
    if(!inPeriod(o, F.dias)) return false;
    if(q && ![o.id,o.title,o.desc,o.hub,o.tipo].join(' ').toLowerCase().includes(q)) return false;
    return true;
  }).sort((a,b) => (b.ocorreuEm || '').localeCompare(a.ocorreuEm || '') || b.createdAt.localeCompare(a.createdAt));
}

function bars(host, entries, max){
  host.innerHTML = entries.length ? entries.map(([n,v]) => `<div class="mn-bar"><span>${esc(n)}</span><div><i style="width:${v ? Math.max(4, v/max*100) : 0}%"></i></div><b>${v}</b></div>`).join('')
    : '<div class="mn-empty">Nada registrado neste período.</div>';
}

function render(){
  if(!St() || !$('#cp-man')) return;
  const hubs = St().hubs;
  const sel = (id, first, opts, cur) => { const el = $(id); if(!el || el.dataset.ok === '1') return; el.dataset.ok = '1'; el.innerHTML = `<option value="">${first}</option>` + opts.map(o => `<option>${esc(o)}</option>`).join(''); el.value = cur; };
  sel('#mnHub', 'Todos os hubs', hubs, F.hub); sel('#mnTipo', 'Todos os tipos', TIPOS, F.tipo);
  if($('#mHub') && !$('#mHub').dataset.ok){ $('#mHub').dataset.ok = '1'; $('#mHub').innerHTML = '<option value="">Selecione o hub…</option>' + hubs.map(h => `<option>${esc(h)}</option>`).join(''); }
  if($('#mTipo') && !$('#mTipo').dataset.ok){ $('#mTipo').dataset.ok = '1'; $('#mTipo').innerHTML = '<option value="">Selecione…</option>' + TIPOS.map(h => `<option>${esc(h)}</option>`).join(''); }

  const per = all().filter(o => inPeriod(o, F.dias));
  const abertas = per.filter(o => o.status !== 'resolvida').length;
  const porHub = hubs.map(h => [h, per.filter(o => o.hub === h).length]).sort((a,b) => b[1]-a[1]);
  const porTipo = TIPOS.map(t => [t, per.filter(o => o.tipo === t).length]).filter(x => x[1]).sort((a,b) => b[1]-a[1]);
  const top = porHub[0] && porHub[0][1] ? porHub[0][0].replace(/^Varanda /,'') : '—';
  $('#mnStats').innerHTML = `<div><small>REGISTRADAS</small><strong>${per.length}</strong></div>
    <div class="am"><small>EM ABERTO</small><strong>${abertas}</strong></div>
    <div class="gr"><small>RESOLVIDAS</small><strong>${per.length - abertas}</strong></div>
    <div><small>HUB COM MAIS MANUTENÇÃO</small><strong style="font-size:24px">${esc(top)}</strong></div>`;
  bars($('#mnHubs'), porHub, Math.max(1, ...porHub.map(x => x[1])));
  bars($('#mnTipos'), porTipo.slice(0,6), Math.max(1, ...porTipo.map(x => x[1])));

  const defs = [['todos','Todas'],['abertas','Em aberto'],['resolvidas','Resolvidas']];
  $('#mnChips').innerHTML = defs.map(([k,l]) => `<button class="chip ${F.status===k?'on':''}" data-s="${k}">${l}</button>`).join('') + '<span class="sep"></span>'
    + [[7,'7 dias'],[30,'30 dias'],[90,'90 dias'],[0,'Tudo']].map(([k,l]) => `<button class="chip ${F.dias===k?'on':''}" data-d="${k}">${l}</button>`).join('');

  const list = filtered();
  const fora = all().filter(o => !inPeriod(o, F.dias)).length;
  $('#mnCount').innerHTML = esc(list.length + ' de ' + all().length + ' registros') + (fora ? ` · <button type="button" class="chip" data-d="0" style="vertical-align:middle">${fora} fora do período · ver tudo</button>` : '');
  $('#mnList').innerHTML = list.length ? list.map(o => `<article class="row mn-row u-${esc(o.urgencia)} ${o.status==='resolvida'?'ok':''}" data-id="${esc(o.id)}">
      <div class="id">${esc(o.id)}</div>
      <div class="nm-col"><div class="nm">${esc(o.title)}</div>
        <div class="meta"><span>${esc(o.tipo)}</span><span>Urgência ${esc(URG[o.urgencia] || '')}</span>${o.custo ? `<span>R$ ${esc(o.custo)}</span>` : ''}${o.desc ? '<span>📋 detalhes</span>' : ''}</div></div>
      <div class="hub-tag">${esc(o.hub)}</div><div class="dt">${fmtD(o.ocorreuEm)}</div>
      <div class="op-btns"><button type="button" class="btn ghost sm mn-st" data-tog="${esc(o.id)}">${o.status==='resolvida' ? '✓ Resolvida' : 'Marcar resolvida'}</button><button type="button" class="btn ghost sm" data-del="${esc(o.id)}" aria-label="Excluir manutenção">Excluir</button></div></article>`).join('')
    : `<div class="empty"><b>${all().length ? 'Nada encontrado com esses filtros' : 'Nenhuma manutenção registrada ainda'}</b>${all().length ? 'Ajuste a busca, o hub ou o período.' : 'Clique em “Nova manutenção” para registrar a primeira.'}</div>`;
}

function openDlg(o){
  editing = o ? o.id : null;
  $('#mEye').textContent = o ? 'EDITAR MANUTENÇÃO' : 'NOVA MANUTENÇÃO';
  $('#mTit').textContent = o ? 'Atualize o registro' : 'O que precisou de conserto?';
  $('#mOk').textContent = o ? 'Salvar alterações' : 'Registrar manutenção';
  $('#mTitle').value = o ? o.title : ''; $('#mHub').value = o ? o.hub : ''; $('#mTipo').value = o ? o.tipo : '';
  $('#mData').max = dayKey(new Date()); $('#mData').value = o ? o.ocorreuEm : dayKey(new Date()); $('#mUrg').value = o ? o.urgencia : 'media';
  $('#mCusto').value = o ? o.custo : ''; $('#mDesc').value = o ? o.desc : '';
  ['mTitle','mHub','mTipo'].forEach(i => $('#'+i).classList.remove('err'));
  const dl = $('#mDel'); if(dl){ dl.hidden = !o; dl.textContent = 'Excluir manutenção'; dl.dataset.arm = ''; }
  $('#dMan').showModal(); $('#mTitle').focus();
}

function apaga(id){ St().update(id, o => { o.deleted = true; o.deletedAt = new Date().toISOString(); }); St().toast('Manutenção excluída'); render(); }

function init(){
  if(!$('#cp-man')) return;
  document.addEventListener('click', e => {
    const t = e.target.closest('#cpTabs [data-cp]');
    if(t){
      const man = t.dataset.cp === 'man';
      document.querySelectorAll('#cpTabs button').forEach(b => b.classList.toggle('on', b === t));
      $('#cp-man').hidden = !man; $('#cp-ped').hidden = man;
      const nb = $('#btnNovo'); if(nb) nb.style.display = man ? 'none' : '';
      if(man) render();
      return;
    }
    const c = e.target.closest('#mnChips .chip, #mnCount .chip');
    if(c){ if(c.dataset.s) F.status = c.dataset.s; if('d' in c.dataset) F.dias = +c.dataset.d; render(); return; }
    const dr = e.target.closest('[data-del]');
    if(dr){ e.stopPropagation(); if(dr.dataset.arm !== '1'){ dr.dataset.arm = '1'; dr.textContent = 'Confirmar exclusão?'; setTimeout(() => { if(dr.isConnected){ dr.dataset.arm = ''; dr.textContent = 'Excluir'; } }, 4000); return; } apaga(dr.dataset.del); return; }
    if(e.target.closest('#mDel')){ const b = $('#mDel'); if(b.dataset.arm !== '1'){ b.dataset.arm = '1'; b.textContent = 'Confirmar exclusão?'; setTimeout(() => { b.dataset.arm = ''; b.textContent = 'Excluir manutenção'; }, 4000); return; } if(editing){ apaga(editing); $('#dMan').close(); editing = null; } return; }
    const tg = e.target.closest('[data-tog]');
    if(tg){ e.stopPropagation(); const id = tg.dataset.tog; St().update(id, o => { if(o.status === 'resolvida'){ o.status = 'aberta'; o.resolvedAt = null; } else { o.status = 'resolvida'; o.resolvedAt = new Date().toISOString(); } }); return; }
    const row = e.target.closest('#mnList .mn-row');
    if(row){ const o = all().find(x => x.id === row.dataset.id); if(o) openDlg(o); }
  });
  $('#btnMan').addEventListener('click', () => openDlg(null));
  $('#mnQ').addEventListener('input', e => { F.q = e.target.value; render(); });
  $('#mnHub').addEventListener('change', e => { F.hub = e.target.value; render(); });
  $('#mnTipo').addEventListener('change', e => { F.tipo = e.target.value; render(); });
  $('#fMan').addEventListener('submit', async e => {
    e.preventDefault();
    const d = { title:$('#mTitle').value.trim(), hub:$('#mHub').value, tipo:$('#mTipo').value, ocorreuEm:$('#mData').value, urgencia:$('#mUrg').value, custo:$('#mCusto').value.trim(), desc:$('#mDesc').value.trim() };
    $('#mTitle').classList.toggle('err', !d.title); $('#mHub').classList.toggle('err', !d.hub); $('#mTipo').classList.toggle('err', !d.tipo);
    if(!d.title || !d.hub || !d.tipo){ St().toast('Preencha o que aconteceu, o hub e o tipo', true); return; }
    const today = dayKey(new Date());
    if(!d.ocorreuEm){ $('#mData').classList.add('err'); St().toast('Informe a data em que aconteceu', true); return; }
    if(d.ocorreuEm > today){ $('#mData').classList.add('err'); St().toast('A data não pode ser no futuro', true); return; }
    $('#mData').classList.remove('err');
    if(editing){ St().update(editing, o => Object.assign(o, d)); St().toast('Manutenção atualizada'); editing = null; }
    else await St().add(d);
    // o registro novo nunca pode sumir da lista: se ficou fora do período ou dos filtros, abre o filtro para mostrá-lo
    let msg = '';
    if(F.dias && d.ocorreuEm < from(F.dias)){ F.dias = 0; msg = 'Registrada com data de ' + fmtD(d.ocorreuEm) + ', fora do período filtrado: mostrando todo o período'; }
    if(F.hub && F.hub !== d.hub){ F.hub = ''; $('#mnHub').value = ''; }
    if(F.tipo && F.tipo !== d.tipo){ F.tipo = ''; $('#mnTipo').value = ''; }
    if(F.status === 'resolvidas') F.status = 'todos';
    F.q = ''; $('#mnQ').value = '';
    if(msg) St().toast(msg);
    $('#dMan').close();
    render();
  });
  if(St()) St().onChange(render);
  render();
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
