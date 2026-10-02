import {
  exigirLogin, naoAutorizado, proibido, prefixoDados, lerUsuarios, lerCompartilhamentos, storeDados,
  configurarAmbiente, CHAVES_PAPEL_CAMPO, CORS
} from "../lib/auth-comum.mjs";

// Armazenamento chave/valor (Netlify Blobs) do AGRO-ERP.
// GET  /.netlify/functions/storage?key=NOME   -> valor salvo (ou null)
// POST /.netlify/functions/storage  { key, value }
//
// Cada usuário enxerga só o próprio espaço: o servidor põe o prefixo da conta na chave
// ("u/<id>/..."), então o navegador nunca escolhe de quem são os dados.
// A conta do administrador que veio da versão antiga usa as chaves sem prefixo (os dados de sempre).
// Propriedade compartilhada: a chave chega como "sh:<idDoCompartilhamento>::<dado>"; o servidor confere
// se o compartilhamento é com quem está logado, qual o papel, e lê/grava no espaço do dono.

const chavePublica = (k) => typeof k === "string" && k.indexOf("comunidade-chuva::") === 0; // página pública de chuva
const chaveInvalida = (k) => !k || typeof k !== "string" || k.length > 300 || k === "global::app-password" || k.indexOf("u/") === 0;
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...CORS } });

// Devolve { real } com a chave verdadeira no store, ou { resposta } com o erro
async function resolverChave(req, key, gravando) {
  if (chavePublica(key)) return { real: key };
  const u = await exigirLogin(req);
  if (!u) return { resposta: naoAutorizado() };
  const m = /^sh:([a-f0-9]+)::(.+)$/.exec(key);
  if (!m) {
    if (key.indexOf("sh:") === 0) return { resposta: proibido("Chave inválida.") };
    return { real: prefixoDados(u) + key };
  }
  const sh = (await lerCompartilhamentos()).find((c) => c.id === m[1]);
  if (!sh || sh.usuarioId !== u.id) return { resposta: proibido("Esta propriedade não está mais compartilhada com você.") };
  const dono = (await lerUsuarios()).find((x) => x.id === sh.donoId);
  if (!dono || dono.ativo === false) return { resposta: proibido("A conta dona desta propriedade não está ativa.") };
  const dado = m[2];
  if (gravando) {
    if (sh.papel === "leitura") return { resposta: proibido("Você só pode visualizar esta propriedade.") };
    if (sh.papel === "campo" && CHAVES_PAPEL_CAMPO.indexOf(dado) === -1) return { resposta: proibido("Nesta propriedade você só pode lançar no Diário de Campo.") };
  }
  return { real: prefixoDados(dono) + sh.wsId + "::" + dado };
}

export default async (req, context) => {
  configurarAmbiente(req, context);
  const store = storeDados();
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  if (req.method === "GET") {
    const key = new URL(req.url).searchParams.get("key");
    if (key === "__ping__") return json(null);
    if (chaveInvalida(key)) return json(null, 403);
    const r = await resolverChave(req, key, false);
    if (r.resposta) return r.resposta;
    try {
      const value = await store.get(r.real, { type: "json" });
      return json(value === undefined ? null : value);
    } catch {
      return json(null);
    }
  }

  if (req.method === "POST") {
    try {
      const { key, value } = (await req.json()) || {};
      if (chaveInvalida(key)) return json({ error: "chave inválida ou protegida" }, 403);
      const r = await resolverChave(req, key, true);
      if (r.resposta) return r.resposta;
      await store.setJSON(r.real, value);
      return json({ ok: true });
    } catch (err) {
      return json({ error: String(err) }, 500);
    }
  }

  return new Response("Method Not Allowed", { status: 405, headers: CORS });
};
