// Aba "Freelancers" do painel administrativo: jornadas, ajustes e acompanhamento do envio ao DP.
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const brl = v => v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dmy = d => d.split("-").reverse().join("/");
  const ROT = { entrada: "Entrada", saida_almoco: "Saída almoço", retorno_almoco: "Retorno almoço", saida_final: "Saída final" };
  const DPROT = { pendente: "Pendente de envio", enviado: "Enviado", falha: "Falha no envio", aguardando: "Jornada não concluída", nao_aplica: "—" };
  const DPCLS = { pendente: "c-atraso", enviado: "c-ok", falha: "c-falta", aguardando: "c-folga", nao_aplica: "c-folga" };
  let D = null;

  const root = $("pg4");
  const t = new Date(), iso = d => d.toISOString().slice(0, 10);
  root.innerHTML = `
    <div id="fmsg" class="hint" style="display:none"></div>
    <div class="ctl" style="margin-bottom:12px">
      <input type="date" id="f0"> <span>até</span> <input type="date" id="f1">
      <select id="fun"><option value="">Todas as unidades</option></select>
      <select id="fdp"><option value="">Todos os envios ao DP</option><option value="pendente">Pendente de envio</option><option value="enviado">Enviado</option><option value="falha">Falha no envio</option></select>
      <select id="fst"><option value="">Todas as jornadas</option><option value="concluida">Concluídas</option><option value="inc">Incompletas / em aberto</option></select>
      <input id="fq" placeholder="Buscar nome…">
      <button id="fgo">Atualizar</button>
      <button class="ghost" id="fsend">Enviar / reenviar pendentes ao DP</button>
      <button class="ghost" id="ftest">Testar conexão com o DP</button>
      <button class="ghost" id="fcsv">Exportar CSV</button>
    </div>
    <div class="kpis" id="fk"></div>
    <div class="wrap"><table><thead><tr><th>Data</th><th>Freelancer</th><th>Unidade</th><th>Entrada</th><th>Saída alm.</th><th>Retorno</th><th>Saída final</th><th class="num">Horas</th><th class="num">A receber</th><th>Envio ao DP</th><th></th></tr></thead><tbody id="fb"></tbody></table></div>
    <div class="foot">Valores são o <b>valor calculado a receber</b> (R$ 12,50/h), não confirmação de pagamento. CPF e Pix aparecem mascarados; use “Ver dados” para o completo. Batidas registradas não podem ser editadas — só é possível preencher uma batida que faltou (com motivo, registrado) ou cancelar uma jornada.</div>
    <dialog id="fdlg" style="border:1px solid var(--bd);border-radius:12px;background:var(--card);color:var(--tx);max-width:420px;width:92vw"><form method="dialog" id="fform" style="display:flex;flex-direction:column;gap:10px">
      <b id="fdt"></b><div id="fdb"></div><div id="fde" style="color:var(--red);min-height:18px"></div>
      <div class="ctl" style="justify-content:flex-end"><button class="ghost" value="cancel">Fechar</button><button id="fok" value="ok">Salvar</button></div></form></dialog>`;
  $("f0").value = iso(new Date(t.getFullYear(), t.getMonth(), 1)); $("f1").value = iso(t);
  const msg = (m, bad) => { const e = $("fmsg"); e.style.display = m ? "" : "none"; e.innerHTML = m; e.style.background = bad ? "var(--redbg)" : "var(--blubg)"; e.style.color = bad ? "var(--red)" : "var(--blu)"; };
  async function api(path, body) {
    const r = await fetch(path, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); if (!r.ok && r.status !== 401) throw new Error(j.error || "Erro " + r.status); return j;
  }
  window.loadF = async function () {
    msg("Carregando…");
    try {
      D = await api(`/api/freela/admin/jornadas?start=${$("f0").value}&end=${$("f1").value}`);
      if (!$("fun").dataset.ok) { $("fun").innerHTML = '<option value="">Todas as unidades</option>' + D.unidades.map(u => `<option>${esc(u)}</option>`).join(""); $("fun").dataset.ok = 1; }
      msg(D.dp_configurado ? "" : "<b>Integração com o DP ainda não ativada.</b> As jornadas concluídas ficam guardadas como “Pendente de envio”. Para ativar, defina <code>DP_API_TOKEN</code> nas variáveis de ambiente do Netlify (Site configuration → Environment variables) e faça um novo deploy. Enquanto isso, use “Exportar CSV”.", true);
      draw();
    } catch (e) { msg(esc(e.message), true); }
  };
  function draw() {
    if (!D) return; const T = D.totais, q = $("fq").value.toLowerCase(), u = $("fun").value, dp = $("fdp").value, st = $("fst").value;
    $("fk").innerHTML = [["Jornadas concluídas", T.jornadas], ["Total a receber", brl(T.valor)], ["Pendentes de envio", T.pendente || 0], ["Enviadas ao DP", T.enviado || 0], ["Falhas no envio", T.falha || 0], ["Incompletas", T.incompletas || 0]]
      .map(([a, b]) => `<div class="kpi"><span>${a}</span><b>${esc(b)}</b></div>`).join("");
    const L = D.jornadas.filter(j => (!q || j.nome.toLowerCase().includes(q)) && (!u || j.unidade === u) && (!dp || j.dp.status === dp) && (!st || (st === "concluida" ? j.status === "concluida" : j.status !== "concluida")));
    $("fb").innerHTML = L.length ? L.map(j => {
      const m = k => j.marks[k] || "—", inc = j.status !== "concluida" && j.status !== "cancelada";
      const dpTxt = j.cancelada ? `<span class="chip c-folga" title="${esc(j.motivoCancel)}">Cancelada</span>` : `<span class="chip ${DPCLS[j.dp.status]}" ${j.dp.erro ? `title="${esc(j.dp.erro)}"` : ""}>${DPROT[j.dp.status]}</span>${j.dp.tentativas ? ` <small style="color:var(--mut)">${j.dp.tentativas}×</small>` : ""}${j.dp.erro && j.dp.status !== "enviado" ? `<br><small style="color:var(--mut)">${esc(j.dp.erro).slice(0, 70)}</small>` : ""}`;
      return `<tr><td>${dmy(j.data)}</td><td><b>${esc(j.nome)}</b><br><small style="color:var(--mut)">${esc(j.cpf)} · Pix ${esc(j.pix)}</small>${j.ajustes.length ? `<br><span class="badge">ajustada (${j.ajustes.length})</span>` : ""}</td><td>${esc(j.unidade)}</td>
        <td>${m("entrada")}</td><td>${m("saida_almoco")}</td><td>${m("retorno_almoco")}</td><td>${m("saida_final")}${inc ? `<br><span class="chip c-atraso">${j.incompleta ? "Incompleta" : esc(j.statusRotulo)}</span>` : ""}</td>
        <td class="num">${j.horas || "—"}</td><td class="num">${brl(j.valor)}</td><td>${dpTxt}</td>
        <td style="min-width:160px"><button class="ghost mini" data-a="ver" data-id="${esc(j.id)}">Ver dados</button>
        ${inc ? `<button class="ghost mini" data-a="ajustar" data-id="${esc(j.id)}">Ajustar</button>` : ""}
        ${j.status === "concluida" && j.dp.status !== "enviado" ? `<button class="ghost mini" data-a="enviar" data-id="${esc(j.id)}">${j.dp.status === "falha" ? "Reenviar" : "Enviar"}</button>` : ""}
        ${!j.cancelada && j.dp.status !== "enviado" ? `<button class="ghost mini" style="color:var(--red)" data-a="cancelar" data-id="${esc(j.id)}">Cancelar</button>` : ""}</td></tr>`;
    }).join("") : `<tr><td colspan="11" style="text-align:center;color:var(--mut);padding:24px">Nenhuma jornada neste filtro.</td></tr>`;
  }
  function dlg(titulo, html, onOk) {
    $("fdt").textContent = titulo; $("fdb").innerHTML = html; $("fde").textContent = ""; const d = $("fdlg"), ok = $("fok");
    ok.style.display = onOk ? "" : "none";
    ok.onclick = async ev => { ev.preventDefault(); try { await onOk(); d.close(); loadF(); } catch (e) { $("fde").textContent = e.message; } };
    d.showModal();
  }
  $("fdb").addEventListener("click", async ev => {
    const b = ev.target.closest("button[data-foto]"); if (!b) return;
    try { const r = await api("/api/freela/admin/foto?id=" + encodeURIComponent(b.dataset.id) + "&tipo=" + encodeURIComponent(b.dataset.foto)); const i = new Image(); i.src = r.foto; i.style.cssText = "max-width:100%;border-radius:8px;margin-top:6px"; b.nextElementSibling.replaceChildren(i); b.remove(); } catch (e) { $("fde").textContent = e.message; }
  });
  $("fb").addEventListener("click", async ev => {
    const b = ev.target.closest("button[data-a]"); if (!b) return; const id = b.dataset.id, j = D.jornadas.find(x => x.id === id), a = b.dataset.a;
    try {
      if (a === "ver") { const f = await api("/api/freela/admin/jornada?id=" + encodeURIComponent(id)); dlg("Dados de " + f.nome, `<p>CPF: <b>${esc(f.cpf_completo)}</b><br>Chave Pix: <b>${esc(f.pix_completo)}</b><br>Unidade: ${esc(f.unidade)}<br>Código da jornada: <small>${esc(f.id)}</small></p>
        <h4 style="margin:12px 0 6px">Evidências das batidas</h4>${(f.evidencias || []).map(e => `<div style="border-top:1px solid var(--bd);padding:8px 0;font-size:13px"><b>${esc(e.rotulo)}</b> · ${esc(new Date(e.em).toLocaleTimeString("pt-BR"))}<br>
          ${e.lat != null ? `📍 <a href="https://www.google.com/maps?q=${e.lat},${e.lon}" target="_blank" rel="noopener">${e.lat.toFixed(5)}, ${e.lon.toFixed(5)}</a>${e.prec != null ? ` (±${e.prec} m)` : ""}` : `<span style="color:var(--red)">📍 sem localização</span>`} · IP ${esc(e.ip || "?")}<br>
          <small style="color:var(--mut)">${esc(e.ua || "")}</small><br>${e.foto ? `<button class="ghost mini" type="button" data-foto="${esc(e.tipo)}" data-id="${esc(f.id)}">Ver foto</button><div></div>` : ""}</div>`).join("") || "<small style='color:var(--mut)'>Sem registros (jornadas antigas não tinham foto/local).</small>"}`); }
      if (a === "enviar") { const r = await api("/api/freela/admin/enviar", { ids: [id] }); if (r.error) msg(esc(r.error), true); loadF(); }
      if (a === "cancelar") dlg("Cancelar jornada de " + j.nome, `<p>A jornada não é apagada: fica registrada como cancelada e não vai ao DP.</p><input id="fmot" placeholder="Motivo (obrigatório)" style="width:100%">`, async () => { await api("/api/freela/admin/cancelar", { id, motivo: $("fmot").value }); });
      if (a === "ajustar") {
        const faltam = Object.keys(ROT).filter(k => !j.marks[k]); if (!faltam.length) return;
        dlg("Preencher batida de " + j.nome, `<p>Só é possível preencher uma batida que faltou. O ajuste fica registrado com o motivo.</p>
          <select id="ftp" style="width:100%;margin-bottom:8px">${faltam.map(k => `<option value="${k}">${ROT[k]}</option>`).join("")}</select>
          <div class="ctl"><input type="date" id="fdt2" value="${esc(j.data)}"><input type="time" id="fhr"></div>
          <input id="fmot" placeholder="Motivo (obrigatório)" style="width:100%;margin-top:8px">`,
          async () => { await api("/api/freela/admin/ajustar", { id, tipo: $("ftp").value, data: $("fdt2").value, hora: $("fhr").value, motivo: $("fmot").value }); });
      }
    } catch (e) { msg(esc(e.message), true); }
  });
  $("fgo").onclick = loadF; ["fq", "fun", "fdp", "fst"].forEach(i => $(i).addEventListener("input", draw));
  $("fsend").onclick = async () => {
    try { msg("Enviando…"); const r = await api(`/api/freela/admin/enviar?start=${$("f0").value}&end=${$("f1").value}`, {});
      await loadF(); if (r.error) msg(esc(r.error), true); else msg(`Envio concluído: ${r.enviados} enviado(s), ${r.falhas} com falha${r.restantes ? `, ${r.restantes} restante(s) — clique de novo` : ""}.`, r.falhas > 0);
    } catch (e) { msg(esc(e.message), true); }
  };
  $("ftest").onclick = async () => {
    try { msg("Testando…"); const r = await api("/api/freela/admin/dp-teste");
      if (!r.ok) return msg(esc(r.error), true);
      const sem = r.unidades.filter(u => !u.hub_no_dp).map(u => u.unidade);
      msg(`<b>Conexão com o DP OK.</b> Hubs no DP: ${r.hubs.map(esc).join(", ")}.${sem.length ? ` <b>Atenção:</b> sem hub correspondente no DP: ${sem.map(esc).join(", ")} — essas jornadas não serão enviadas até o hub existir no DP (ou definir <code>DP_HUB_MAP</code>).` : ""}`, sem.length > 0);
    } catch (e) { msg(esc(e.message), true); }
  };
  $("fcsv").onclick = () => { location.href = `/api/freela/admin/export.csv?start=${$("f0").value}&end=${$("f1").value}`; };
})();
