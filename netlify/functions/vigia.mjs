// Roda a cada 5 minutos: cruza a escala com as batidas de ponto e dispara os alertas de furo (ver alerta.mjs).
import { vigiar, registrarFalha, registrarOk, isoOf } from "./alerta.mjs";
import { presencasDoDia, sign } from "./api.mjs";
import { reenviarPendentesAuto } from "./freela.mjs";

export default async () => {
  try {
    const hoje = isoOf(Date.now()), ontem = isoOf(Date.now() - 86400000);
    const presencas = [...await presencasDoDia(ontem), ...await presencasDoDia(hoje)];
    const r = await vigiar({ sign, presencas, reler: async () => [...await presencasDoDia(ontem), ...await presencasDoDia(hoje)] }); await registrarOk();
    try { r.dp = await reenviarPendentesAuto(); } catch (e) { r.dp = { erro: e.message }; }      // envio ao DP nunca depende de ação manual
    return new Response(JSON.stringify(r), { headers: { "Content-Type": "application/json" } });
  } catch (e) { await registrarFalha(e.message).catch(() => {}); return new Response("erro: " + e.message, { status: 500 }); }
};
export const config = { schedule: "*/5 * * * *" };
