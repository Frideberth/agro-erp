import { exigirLogin, naoAutorizado, configurarAmbiente, CORS } from "../lib/auth-comum.mjs";

// Consulta o Agrofit (MAPA) pela AgroAPI da Embrapa.
//
// GET /.netlify/functions/agrofit?marca=Verdavis            -> produtos formulados com essa marca
// GET /.netlify/functions/agrofit?marca=Verdavis&debug=1    -> inclui a resposta bruta da API (para conferir os campos)
//
// Variáveis de ambiente no Netlify (Site configuration → Environment variables):
//   AGROAPI_CONSUMER_KEY     (Consumer Key da aplicação criada no portal AgroAPI)
//   AGROAPI_CONSUMER_SECRET  (Consumer Secret)
//   AGROAPI_BASE             (opcional; padrão https://api.cnptia.embrapa.br)

const BASE = (process.env.AGROAPI_BASE || "https://api.cnptia.embrapa.br").replace(/\/+$/, "");
let tokenCache = { valor: "", expira: 0 };

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...CORS } });
}

async function obterToken() {
  if (tokenCache.valor && Date.now() < tokenCache.expira - 60000) return tokenCache.valor;
  const key = process.env.AGROAPI_CONSUMER_KEY, secret = process.env.AGROAPI_CONSUMER_SECRET;
  if (!key || !secret) throw Object.assign(new Error("Faltam as chaves da AgroAPI. No Netlify, em Site configuration → Environment variables, crie AGROAPI_CONSUMER_KEY e AGROAPI_CONSUMER_SECRET e publique de novo."), { codigo: "sem-chave" });
  const r = await fetch(BASE + "/token", {
    method: "POST",
    headers: { "Authorization": "Basic " + Buffer.from(key + ":" + secret).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials"
  });
  const txt = await r.text();
  let d = null; try { d = JSON.parse(txt); } catch {}
  if (!r.ok || !d || !d.access_token) throw Object.assign(new Error("A AgroAPI recusou as chaves (HTTP " + r.status + "). Confira a Consumer Key/Secret e se a aplicação está inscrita na API Agrofit. Resposta: " + txt.slice(0, 300)), { codigo: "token" });
  tokenCache = { valor: d.access_token, expira: Date.now() + (Number(d.expires_in) || 3600) * 1000 };
  return tokenCache.valor;
}

// a API pode devolver listas, objetos com "data"/"content"/"items" ou campos com nomes um pouco diferentes: lê de forma tolerante
function comoLista(d) {
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") for (const k of ["data", "content", "items", "results", "produtos", "produtos_formulados"]) if (Array.isArray(d[k])) return d[k];
  return d && typeof d === "object" ? [d] : [];
}
function campo(o, ...nomes) { for (const n of nomes) if (o && o[n] != null && o[n] !== "") return o[n]; return undefined; }
function textos(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.flatMap(textos);
  if (typeof v === "object") { const t = campo(v, "nome", "descricao", "ingrediente_ativo", "cultura", "marca_comercial", "classe", "valor"); return t ? textos(t) : []; }
  return [String(v).trim()].filter(Boolean);
}
function simplificar(p) {
  const det = comoLista(campo(p, "ingrediente_ativo_detalhado", "ingredientes_ativos_detalhados", "ingredienteAtivoDetalhado") || []);
  let ingredientes = det.map((i) => ({
    nome: String(campo(i, "ingrediente_ativo", "nome", "nome_comum") || "").trim(),
    grupoQuimico: String(campo(i, "grupo_quimico", "grupoQuimico") || "").trim(),
    concentracao: [campo(i, "concentracao", "concentracao_valor"), campo(i, "unidade_medida", "unidade")].filter((x) => x != null && x !== "").join(" ")
  })).filter((i) => i.nome);
  if (!ingredientes.length) ingredientes = textos(campo(p, "ingrediente_ativo", "ingredientes_ativos", "ingredienteAtivo")).map((t) => {
    // formato comum: "Picoxistrobina (estrobilurina) (100 g/L)"
    const m = /^([^()]+?)\s*(?:\(([^)]*)\))?\s*(?:\(([^)]*)\))?$/.exec(t);
    return m ? { nome: m[1].trim(), grupoQuimico: (m[2] || "").trim(), concentracao: (m[3] || "").trim() } : { nome: t, grupoQuimico: "", concentracao: "" };
  });
  const usos = comoLista(campo(p, "indicacao_uso", "indicacoes_uso", "indicacaoUso") || []);
  const culturas = [...new Set(usos.map((u) => String(campo(u, "cultura", "nome_cultura") || "").trim()).filter(Boolean))].sort();
  const pragas = [...new Set(usos.flatMap((u) => textos(campo(u, "praga_nome_comum", "praga_comum", "praga"))))].slice(0, 40);
  const docs = comoLista(campo(p, "documento_cadastrado", "documentos", "documentos_cadastrados") || []);
  const bula = docs.find((d) => /bula/i.test(String(campo(d, "tipo_documento", "descricao", "tipo") || ""))) || docs[0];
  return {
    registro: String(campo(p, "numero_registro", "nr_registro", "registro") || ""),
    marcas: textos(campo(p, "marca_comercial", "marcas_comerciais", "marca")),
    titular: textos(campo(p, "titular_registro", "titular", "empresa")).join(", "),
    classes: textos(campo(p, "classe_categoria_agronomica", "classe", "classes")),
    formulacao: textos(campo(p, "formulacao")).join(", "),
    modoAcaoTexto: textos(campo(p, "modo_acao", "modoAcao")).join(", "),
    ingredientes, culturas, pragas,
    bulaUrl: bula ? String(campo(bula, "url", "link", "endereco") || "") : ""
  };
}

export default async (req, context) => {
  configurarAmbiente(req, context);
  if (req.method === "OPTIONS") return json({}, 204);
  if (req.method !== "GET") return json({ error: "Method Not Allowed" }, 405);
  const usuario = await exigirLogin(req);
  if (!usuario) return naoAutorizado();
  const url = new URL(req.url);
  const marca = (url.searchParams.get("marca") || "").trim();
  const debug = url.searchParams.get("debug") === "1";
  if (marca.length < 3) return json({ error: "Digite pelo menos 3 letras do nome comercial." }, 400);
  try {
    const token = await obterToken();
    const tentativas = [
      "/agrofit/v1/search/produtos-formulados?marca_comercial=" + encodeURIComponent(marca),
      "/agrofit/v1/search/produtos-formulados?marca=" + encodeURIComponent(marca)
    ];
    let ultimo = null;
    for (const caminho of tentativas) {
      const r = await fetch(BASE + caminho, { headers: { "Authorization": "Bearer " + token, "Accept": "application/json" } });
      const txt = await r.text();
      let d = null; try { d = JSON.parse(txt); } catch {}
      ultimo = { status: r.status, caminho, inicio: txt.slice(0, 600) };
      if (r.status === 401) { tokenCache = { valor: "", expira: 0 }; return json({ error: "A AgroAPI não aceitou o acesso (401). Confira se a aplicação está inscrita na API Agrofit.", detalhe: ultimo }, 502); }
      if (!r.ok || d == null) continue;
      const itens = comoLista(d).map(simplificar).filter((i) => i.registro || i.marcas.length || i.ingredientes.length);
      return json({ ok: true, consulta: marca, itens: itens.slice(0, 25), total: itens.length, ...(debug ? { bruto: comoLista(d).slice(0, 2), caminho } : {}) });
    }
    return json({ error: "A AgroAPI não respondeu como esperado.", detalhe: ultimo }, 502);
  } catch (err) {
    return json({ error: String(err.message || err), codigo: err.codigo || "" }, err.codigo === "sem-chave" ? 503 : 502);
  }
};
