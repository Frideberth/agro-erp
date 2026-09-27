import { getStore } from "@netlify/blobs";
import { exigirLogin, naoAutorizado, CORS } from "../lib/auth-comum.mjs";

// Chaves liberadas sem login: a página pública de chuva da comunidade e o teste de conexão
const chavePublica = (k) => typeof k === "string" && (k.indexOf("comunidade-chuva::") === 0 || k === "__ping__");
const chaveBloqueada = (k) => k === "global::app-password";

// Netlify Function que expõe um armazenamento simples de chave/valor
// (Netlify Blobs) para o app "Minha Fazenda". O app HTML fala com esta
// function em /api/storage (veja o redirect em netlify.toml).
//
// GET  /api/storage?key=NOME_DA_CHAVE   -> devolve o valor salvo (ou null)
// POST /api/storage  { key, value }     -> salva o valor

export default async (req) => {
  const store = getStore({ name: "fazenda-dados", consistency: "strong" });

  const cors = CORS;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (key === "__ping__") return new Response(JSON.stringify(null), { headers: { "content-type": "application/json", ...cors } });
    if (chaveBloqueada(key)) return new Response(JSON.stringify(null), { status: 403, headers: { "content-type": "application/json", ...cors } });
    if (!chavePublica(key) && !(await exigirLogin(req))) return naoAutorizado();
    if (!key) {
      return new Response(JSON.stringify(null), {
        headers: { "content-type": "application/json", ...cors }
      });
    }
    try {
      const value = await store.get(key, { type: "json" });
      return new Response(JSON.stringify(value === undefined ? null : value), {
        headers: { "content-type": "application/json", ...cors }
      });
    } catch (err) {
      return new Response(JSON.stringify(null), {
        headers: { "content-type": "application/json", ...cors }
      });
    }
  }

  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { key, value } = body || {};
      if (chaveBloqueada(key)) return new Response(JSON.stringify({ error: "chave protegida" }), { status: 403, headers: { "content-type": "application/json", ...cors } });
      if (!chavePublica(key) && !(await exigirLogin(req))) return naoAutorizado();
      if (!key) {
        return new Response(JSON.stringify({ error: "chave ausente" }), {
          status: 400,
          headers: { "content-type": "application/json", ...cors }
        });
      }
      await store.setJSON(key, value);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json", ...cors }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { "content-type": "application/json", ...cors }
      });
    }
  }

  return new Response("Method Not Allowed", { status: 405, headers: cors });
};
