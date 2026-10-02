import {
  lerCredencialAntiga, apagarCredencialAntiga, lerUsuarios, gravarUsuarios, lerConvites, gravarConvites,
  lerCompartilhamentos, gravarCompartilhamentos, PAPEIS, storeDados, prefixoDados, configurarAmbiente, emAmbienteTeste,
  hashSenha, senhaConfere, gerarToken, exigirLogin, codigoRecuperacao, iguaisSeguro, normalizarEmail, emailValido,
  novoId, novoCodigoConvite, perfilPublico, CORS
} from "../lib/auth-comum.mjs";

// Contas do AGRO-ERP.
// GET                                              -> { configurada, migrarSenhaUnica }
// POST { acao:'login', email, senha }              -> { token, usuario }
//      (primeira vez depois da atualização: a senha única antiga + o e-mail informado viram a conta do administrador)
// POST { acao:'definir', nome, email, senha }      -> { token, usuario }  (sistema novo, ainda sem nenhuma conta)
// POST { acao:'cadastrar', codigo, nome, email, senha } -> { token, usuario }  (com convite)
// POST { acao:'eu' }                     (token)   -> { usuario }
// POST { acao:'trocar', senhaAtual, novaSenha } (token) -> { token }
// POST { acao:'recuperar', codigo, email, novaSenha } -> { token, usuario }  (só administrador; código = APP_RECOVERY_CODE ou CERT_ENCRYPTION_KEY)
// Administrador (token de admin):
// POST { acao:'convite-criar', obs }  -> { convite }
// POST { acao:'convite-revogar', codigo }
// POST { acao:'admin-listar' }        -> { usuarios, convites }

const SENHA_TEXTO_ANTIGA = "global::app-password"; // versão bem antiga guardava a senha em texto puro aqui
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...CORS } });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const senhaValida = (s) => typeof s === "string" && s.length >= 6;
const DIAS_CONVITE = 30;

async function senhaTextoAntiga() {
  try { return await storeDados().get(SENHA_TEXTO_ANTIGA, { type: "json" }); } catch { return null; }
}
async function apagarSenhaTextoAntiga() {
  try { await storeDados().delete(SENHA_TEXTO_ANTIGA); } catch {}
}
function senhaTemporaria() {
  const letras = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = ""; for (let i = 0; i < 8; i++) s += letras[Math.floor(Math.random() * letras.length)];
  return s;
}
async function minhasPropriedades(u) {
  const v = await storeDados().get(prefixoDados(u) + "global::workspaces", { type: "json" });
  return Array.isArray(v) ? v : [];
}
function criarUsuario({ nome, email, senha, admin, legado }) {
  const { salt, hash } = hashSenha(senha);
  return { id: novoId(), nome: String(nome || "").trim().slice(0, 80), email: normalizarEmail(email), salt, hash, versao: 1, admin: !!admin, legado: !!legado, ativo: true, criadoEm: new Date().toISOString() };
}
const respostaEntrada = (u) => json({ token: gerarToken(u), usuario: perfilPublico(u) });

export default async (req, context) => {
  configurarAmbiente(req, context);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const usuarios = await lerUsuarios();
    if (req.method === "GET") {
      const antiga = !usuarios.length && (!!(await lerCredencialAntiga()) || !!(await senhaTextoAntiga()));
      return json({ configurada: usuarios.length > 0 || antiga, migrarSenhaUnica: antiga, ambienteTeste: emAmbienteTeste() });
    }
    if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);
    const body = (await req.json()) || {};
    const acao = body.acao;

    if (acao === "login") {
      const email = normalizarEmail(body.email);
      if (!usuarios.length) {
        // Migração: a senha única da versão anterior vira a conta do administrador, com o e-mail informado
        if (!emailValido(email)) return json({ error: "Digite um e-mail válido. Ele passa a ser o seu login." }, 400);
        const cred = await lerCredencialAntiga();
        const texto = cred ? null : await senhaTextoAntiga();
        const ok = cred ? senhaConfere(body.senha || "", cred) : (texto && iguaisSeguro(body.senha || "", texto));
        if (!ok) { await esperar(700); return json({ error: cred || texto ? "Senha incorreta." : "Nenhuma conta criada ainda." }, 401); }
        const admin = cred
          ? { id: novoId(), nome: String(body.nome || "").trim(), email, salt: cred.salt, hash: cred.hash, versao: (Number(cred.versao) || 0) + 1, admin: true, legado: true, ativo: true, criadoEm: new Date().toISOString() }
          : criarUsuario({ nome: body.nome, email, senha: body.senha, admin: true, legado: true });
        await gravarUsuarios([admin]);
        await apagarCredencialAntiga();
        await apagarSenhaTextoAntiga();
        return json({ token: gerarToken(admin), usuario: perfilPublico(admin), migrada: true });
      }
      const u = usuarios.find((x) => x.email === email);
      if (!u || !senhaConfere(body.senha || "", u)) { await esperar(700); return json({ error: "E-mail ou senha incorretos." }, 401); }
      if (u.ativo === false) return json({ error: "Esta conta está desativada. Fale com o administrador." }, 403);
      return respostaEntrada(u);
    }

    if (acao === "definir") {
      if (usuarios.length || (await lerCredencialAntiga()) || (await senhaTextoAntiga())) return json({ error: "O sistema já tem conta. Entre com seu e-mail e senha." }, 403);
      if (!emailValido(body.email)) return json({ error: "Digite um e-mail válido." }, 400);
      if (!senhaValida(body.senha)) return json({ error: "A senha precisa ter pelo menos 6 caracteres." }, 400);
      const admin = criarUsuario({ nome: body.nome, email: body.email, senha: body.senha, admin: true, legado: true });
      admin.aceiteTermosEm = new Date().toISOString();
      await gravarUsuarios([admin]);
      return respostaEntrada(admin);
    }

    if (acao === "cadastrar") {
      const codigo = String(body.codigo || "").trim().toUpperCase();
      const convites = await lerConvites();
      const cv = convites.find((c) => c.codigo === codigo);
      if (!cv || cv.usadoPor || cv.revogado || (cv.expira && cv.expira < new Date().toISOString())) { await esperar(1000); return json({ error: "Convite inválido, já usado ou vencido. Peça um novo ao administrador." }, 400); }
      if (!String(body.nome || "").trim()) return json({ error: "Digite seu nome." }, 400);
      if (!emailValido(body.email)) return json({ error: "Digite um e-mail válido." }, 400);
      if (usuarios.some((x) => x.email === normalizarEmail(body.email))) return json({ error: "Já existe uma conta com esse e-mail. Use \"Entrar\"." }, 400);
      if (!senhaValida(body.senha)) return json({ error: "A senha precisa ter pelo menos 6 caracteres." }, 400);
      if (!body.aceiteTermos) return json({ error: "Para criar a conta, marque que leu e aceita os termos de uso e privacidade." }, 400);
      const u = criarUsuario({ nome: body.nome, email: body.email, senha: body.senha, admin: false, legado: false });
      u.aceiteTermosEm = new Date().toISOString();
      usuarios.push(u);
      await gravarUsuarios(usuarios);
      cv.usadoPor = u.id; cv.usadoEm = new Date().toISOString();
      await gravarConvites(convites);
      return respostaEntrada(u);
    }

    if (acao === "recuperar") {
      const codigo = codigoRecuperacao();
      if (!codigo || !iguaisSeguro(String(body.codigo || "").trim(), codigo)) { await esperar(1500); return json({ error: "Código de recuperação incorreto." }, 401); }
      if (!senhaValida(body.novaSenha)) return json({ error: "A nova senha precisa ter pelo menos 6 caracteres." }, 400);
      const email = normalizarEmail(body.email);
      const u = usuarios.find((x) => x.email === email && x.admin);
      if (!u) return json({ error: "Esse e-mail não é de um administrador. Quem não é administrador pede a nova senha ao administrador." }, 400);
      const { salt, hash } = hashSenha(body.novaSenha);
      Object.assign(u, { salt, hash, versao: (u.versao || 0) + 1, ativo: true });
      await gravarUsuarios(usuarios);
      return respostaEntrada(u);
    }

    // Daqui para baixo precisa estar logado
    const eu = await exigirLogin(req);
    if (!eu) return json({ error: "Entre de novo.", naoAutorizado: true }, 401);
    const meu = usuarios.find((x) => x.id === eu.id);

    if (acao === "eu") return json({ usuario: perfilPublico(meu) });

    if (acao === "trocar") {
      if (!senhaConfere(body.senhaAtual || "", meu)) { await esperar(700); return json({ error: "Senha atual incorreta." }, 401); }
      if (!senhaValida(body.novaSenha)) return json({ error: "A nova senha precisa ter pelo menos 6 caracteres." }, 400);
      const { salt, hash } = hashSenha(body.novaSenha);
      Object.assign(meu, { salt, hash, versao: (meu.versao || 0) + 1 });
      await gravarUsuarios(usuarios);
      return json({ token: gerarToken(meu) });
    }

    if (acao === "alterar-nome") {
      const nome = String(body.nome || "").trim().slice(0, 80);
      if (!nome) return json({ error: "Digite o nome." }, 400);
      meu.nome = nome;
      await gravarUsuarios(usuarios);
      return json({ usuario: perfilPublico(meu) });
    }

    if (acao === "excluir-conta") {
      if (meu.admin) return json({ error: "A conta do administrador não pode ser excluída por aqui." }, 400);
      if (!senhaConfere(body.senha || "", meu)) { await esperar(700); return json({ error: "Senha incorreta." }, 401); }
      const store = storeDados();
      let apagadas = 0;
      try {
        const { blobs } = await store.list({ prefix: prefixoDados(meu) });
        for (const b of blobs || []) { await store.delete(b.key); apagadas++; }
      } catch {}
      const shs = await lerCompartilhamentos();
      await gravarCompartilhamentos(shs.filter((c) => c.donoId !== meu.id && c.usuarioId !== meu.id));
      await gravarUsuarios(usuarios.filter((x) => x.id !== meu.id));
      return json({ ok: true, apagadas });
    }

    // ---- Compartilhar propriedade ----
    if (acao === "compartilhados-comigo") {
      const shs = (await lerCompartilhamentos()).filter((c) => c.usuarioId === meu.id);
      return json({ compartilhados: shs.map((c) => {
        const dono = usuarios.find((x) => x.id === c.donoId);
        return { id: c.id, wsNome: c.wsNome, papel: c.papel, dono: perfilPublico(dono), donoAtivo: !!dono && dono.ativo !== false };
      }).filter((c) => c.donoAtivo) });
    }
    if (acao === "compartilhamentos-ws") {
      const shs = (await lerCompartilhamentos()).filter((c) => c.donoId === meu.id && c.wsId === String(body.wsId || ""));
      return json({ compartilhamentos: shs.map((c) => ({ id: c.id, papel: c.papel, criadoEm: c.criadoEm, usuario: perfilPublico(usuarios.find((x) => x.id === c.usuarioId)) })) });
    }
    if (acao === "compartilhar") {
      const wsId = String(body.wsId || "");
      const papel = String(body.papel || "");
      if (!PAPEIS[papel]) return json({ error: "Escolha o que a pessoa pode fazer." }, 400);
      const ws = (await minhasPropriedades(meu)).find((w) => w.id === wsId);
      if (!ws) return json({ error: "Só o dono pode compartilhar esta propriedade." }, 403);
      const alvo = usuarios.find((x) => x.email === normalizarEmail(body.email));
      if (!alvo) return json({ error: "Não existe conta com esse e-mail. A pessoa precisa criar a conta primeiro (com um convite do administrador)." }, 404);
      if (alvo.id === meu.id) return json({ error: "Esse e-mail é o seu." }, 400);
      const shs = await lerCompartilhamentos();
      const ja = shs.find((c) => c.donoId === meu.id && c.wsId === wsId && c.usuarioId === alvo.id);
      if (ja) { ja.papel = papel; ja.wsNome = ws.nome; }
      else shs.push({ id: novoId(), donoId: meu.id, wsId, wsNome: ws.nome, usuarioId: alvo.id, papel, criadoEm: new Date().toISOString() });
      await gravarCompartilhamentos(shs);
      return json({ ok: true, usuario: perfilPublico(alvo) });
    }
    if (acao === "alterar-papel" || acao === "descompartilhar") {
      const shs = await lerCompartilhamentos();
      const c = shs.find((x) => x.id === String(body.id || ""));
      if (!c || (c.donoId !== meu.id && !(acao === "descompartilhar" && c.usuarioId === meu.id))) return json({ error: "Compartilhamento não encontrado." }, 404);
      if (acao === "alterar-papel") {
        if (!PAPEIS[body.papel]) return json({ error: "Papel inválido." }, 400);
        c.papel = body.papel;
        await gravarCompartilhamentos(shs);
      } else {
        await gravarCompartilhamentos(shs.filter((x) => x.id !== c.id));
      }
      return json({ ok: true });
    }

    if (!meu.admin) return json({ error: "Só o administrador pode fazer isso." }, 403);

    if (acao === "admin-ativar") {
      const alvo = usuarios.find((x) => x.id === String(body.id || ""));
      if (!alvo) return json({ error: "Conta não encontrada." }, 404);
      if (alvo.id === meu.id) return json({ error: "Você não pode desativar a sua própria conta." }, 400);
      alvo.ativo = !!body.ativo;
      if (!alvo.ativo) alvo.versao = (alvo.versao || 0) + 1; // derruba as sessões abertas
      await gravarUsuarios(usuarios);
      return json({ ok: true });
    }
    if (acao === "admin-redefinir-senha") {
      const alvo = usuarios.find((x) => x.id === String(body.id || ""));
      if (!alvo) return json({ error: "Conta não encontrada." }, 404);
      const temporaria = senhaTemporaria();
      const { salt, hash } = hashSenha(temporaria);
      Object.assign(alvo, { salt, hash, versao: (alvo.versao || 0) + 1 });
      await gravarUsuarios(usuarios);
      return json({ ok: true, senhaTemporaria: temporaria, usuario: perfilPublico(alvo) });
    }

    if (acao === "convite-criar") {
      const convites = await lerConvites();
      const cv = { codigo: novoCodigoConvite(), obs: String(body.obs || "").trim().slice(0, 80), criadoEm: new Date().toISOString(), expira: new Date(Date.now() + DIAS_CONVITE * 864e5).toISOString(), criadoPor: meu.id };
      convites.push(cv);
      await gravarConvites(convites);
      return json({ convite: cv });
    }
    if (acao === "convite-revogar") {
      const convites = await lerConvites();
      const cv = convites.find((c) => c.codigo === String(body.codigo || "").toUpperCase());
      if (!cv) return json({ error: "Convite não encontrado." }, 404);
      if (cv.usadoPor) return json({ error: "Esse convite já foi usado." }, 400);
      cv.revogado = true;
      await gravarConvites(convites);
      return json({ ok: true });
    }
    if (acao === "admin-listar") {
      const convites = await lerConvites();
      return json({
        usuarios: usuarios.map((u) => ({ ...perfilPublico(u), ativo: u.ativo !== false, criadoEm: u.criadoEm })),
        convites: convites.map((c) => ({ codigo: c.codigo, obs: c.obs, criadoEm: c.criadoEm, expira: c.expira, revogado: !!c.revogado, usadoPor: c.usadoPor ? perfilPublico(usuarios.find((u) => u.id === c.usadoPor)) : null, usadoEm: c.usadoEm }))
      });
    }
    return json({ error: "Ação desconhecida." }, 400);
  } catch (err) {
    return json({ error: String(err.message || err) }, 500);
  }
};
