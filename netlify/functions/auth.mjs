import { getStore } from "@netlify/blobs";
import { lerCredencial, gravarCredencial, senhaConfere, gerarToken, exigirLogin, codigoRecuperacao, iguaisSeguro, CORS } from "../lib/auth-comum.mjs";

// Login do AGRO-ERP.
// GET                                  -> { configurada }
// POST { acao:'login', senha }         -> { token }
// POST { acao:'definir', senha }       -> { token }  (só quando ainda não existe senha)
// POST { acao:'trocar', senhaAtual, novaSenha }   (com token) -> { token }
// POST { acao:'recuperar', codigo, novaSenha }    -> { token }  (código = APP_RECOVERY_CODE, ou CERT_ENCRYPTION_KEY)

const SENHA_ANTIGA = "global::app-password"; // versão antiga guardava a senha em texto puro aqui
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...CORS } });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const senhaValida = (s) => typeof s === "string" && s.length >= 4;

async function senhaAntiga() {
  try { return await getStore({ name: "fazenda-dados", consistency: "strong" }).get(SENHA_ANTIGA, { type: "json" }); } catch { return null; }
}
async function apagarSenhaAntiga() {
  try { await getStore({ name: "fazenda-dados", consistency: "strong" }).delete(SENHA_ANTIGA); } catch {}
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const cred = await lerCredencial();
    if (req.method === "GET") {
      return json({ configurada: !!cred || !!(await senhaAntiga()) });
    }
    if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);
    const body = (await req.json()) || {};

    if (body.acao === "login") {
      if (cred) {
        if (senhaConfere(body.senha || "", cred)) return json({ token: gerarToken(cred) });
        await esperar(700);
        return json({ error: "Senha incorreta." }, 401);
      }
      // migração: senha da versão antiga (texto puro) vira hash e é apagada
      const antiga = await senhaAntiga();
      if (antiga && iguaisSeguro(body.senha || "", antiga)) {
        const nova = await gravarCredencial(body.senha, 0);
        await apagarSenhaAntiga();
        return json({ token: gerarToken(nova), migrada: true });
      }
      await esperar(700);
      return json({ error: antiga ? "Senha incorreta." : "Nenhuma senha definida ainda." }, 401);
    }

    if (body.acao === "definir") {
      if (cred || (await senhaAntiga())) return json({ error: "Já existe uma senha. Use a recuperação se esqueceu." }, 403);
      if (!senhaValida(body.senha)) return json({ error: "A senha precisa ter pelo menos 4 caracteres." }, 400);
      const nova = await gravarCredencial(body.senha, 0);
      return json({ token: gerarToken(nova) });
    }

    if (body.acao === "trocar") {
      if (!(await exigirLogin(req))) return json({ error: "Entre de novo para trocar a senha.", naoAutorizado: true }, 401);
      if (!senhaConfere(body.senhaAtual || "", cred)) { await esperar(700); return json({ error: "Senha atual incorreta." }, 401); }
      if (!senhaValida(body.novaSenha)) return json({ error: "A nova senha precisa ter pelo menos 4 caracteres." }, 400);
      const nova = await gravarCredencial(body.novaSenha, cred.versao);
      return json({ token: gerarToken(nova) });
    }

    if (body.acao === "recuperar") {
      const codigo = codigoRecuperacao();
      if (!codigo || !iguaisSeguro(String(body.codigo || "").trim(), codigo)) { await esperar(1500); return json({ error: "Código de recuperação incorreto." }, 401); }
      if (!senhaValida(body.novaSenha)) return json({ error: "A nova senha precisa ter pelo menos 4 caracteres." }, 400);
      const nova = await gravarCredencial(body.novaSenha, cred ? cred.versao : 0);
      await apagarSenhaAntiga();
      return json({ token: gerarToken(nova) });
    }
    return json({ error: "Ação desconhecida." }, 400);
  } catch (err) {
    return json({ error: String(err.message || err) }, 500);
  }
};
