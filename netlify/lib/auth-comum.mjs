// Autenticação do AGRO-ERP com contas de usuário.
// - As contas ficam no store "fazenda-auth", chave "usuarios" (senha em hash scrypt, nunca em texto).
// - O navegador recebe um token assinado (HMAC) com o id do usuário; toda chamada às functions precisa dele.
// - Cada usuário tem o próprio espaço de dados. O administrador que veio da versão antiga ("legado")
//   continua usando as chaves sem prefixo, então os dados que já existiam não precisam ser copiados.
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

const STORE_AUTH = "fazenda-auth";
const CHAVE_COMPARTILHAMENTOS = "compartilhamentos";

// Site de teste (branch deploy / deploy preview): usa stores separados ("-teste"), para nunca mexer nos dados reais.
let ambienteTeste = false;
export function configurarAmbiente(req, context) {
  let host = "";
  try { host = new URL(req.url).hostname; } catch {}
  const ctx = (context && context.deploy && context.deploy.context) || process.env.CONTEXT || "";
  if (process.env.AGRO_AMBIENTE === "teste") { ambienteTeste = true; return; }
  if (ctx) { ambienteTeste = ctx === "branch-deploy" || ctx === "deploy-preview"; return; }
  ambienteTeste = host.indexOf("--") !== -1 && host.indexOf("main--") !== 0; // sem contexto: URL de branch/preview do Netlify
}
export function nomeStore(base) { return ambienteTeste ? base + "-teste" : base; }
export function emAmbienteTeste() { return ambienteTeste; }
const CHAVE_CREDENCIAL_ANTIGA = "credencial"; // versão de senha única (antes das contas)
const CHAVE_USUARIOS = "usuarios";
const CHAVE_CONVITES = "convites";

function segredoBase() {
  const base = process.env.AUTH_SECRET || process.env.CERT_ENCRYPTION_KEY;
  if (!base) throw new Error("Configure a variável de ambiente AUTH_SECRET (ou CERT_ENCRYPTION_KEY) no painel do Netlify.");
  return base;
}
function chaveHmac() { return crypto.createHash("sha256").update("agro-erp-auth:" + segredoBase()).digest(); }
const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const deB64url = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");

export function codigoRecuperacao() { return process.env.APP_RECOVERY_CODE || process.env.CERT_ENCRYPTION_KEY || ""; }

export function iguaisSeguro(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function hashSenha(senha, salt) {
  const s = salt || crypto.randomBytes(16).toString("hex");
  const h = crypto.scryptSync(String(senha), s, 64).toString("hex");
  return { salt: s, hash: h };
}
export function senhaConfere(senha, cred) {
  if (!cred || !cred.hash || !cred.salt) return false;
  const { hash } = hashSenha(senha, cred.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(cred.hash, "hex"));
}

export function storeAuth() { return getStore({ name: nomeStore(STORE_AUTH), consistency: "strong" }); }
export function storeDados() { return getStore({ name: nomeStore("fazenda-dados"), consistency: "strong" }); }
export async function lerCredencialAntiga() { return (await storeAuth().get(CHAVE_CREDENCIAL_ANTIGA, { type: "json" })) || null; }
export async function apagarCredencialAntiga() { try { await storeAuth().delete(CHAVE_CREDENCIAL_ANTIGA); } catch {} }

export async function lerUsuarios() { const v = await storeAuth().get(CHAVE_USUARIOS, { type: "json" }); return Array.isArray(v) ? v : []; }
export async function gravarUsuarios(lista) { await storeAuth().setJSON(CHAVE_USUARIOS, lista); }
export async function lerConvites() { const v = await storeAuth().get(CHAVE_CONVITES, { type: "json" }); return Array.isArray(v) ? v : []; }
export async function gravarConvites(lista) { await storeAuth().setJSON(CHAVE_CONVITES, lista); }
export async function lerCompartilhamentos() { const v = await storeAuth().get(CHAVE_COMPARTILHAMENTOS, { type: "json" }); return Array.isArray(v) ? v : []; }
export async function gravarCompartilhamentos(lista) { await storeAuth().setJSON(CHAVE_COMPARTILHAMENTOS, lista); }
export const PAPEIS = { editor: "Pode editar tudo", campo: "Só Diário de Campo", leitura: "Só visualizar" };
// Chaves que o papel "campo" pode gravar (Diário de Campo baixa estoque de produtos; chuva e imagens de campo)
export const CHAVES_PAPEL_CAMPO = ["operacoes", "produtos", "chuvas", "imagensCampo"];

export const normalizarEmail = (e) => String(e || "").trim().toLowerCase();
export const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizarEmail(e));
export function novoId() { return crypto.randomBytes(9).toString("hex"); }
export function novoCodigoConvite() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O, 1/I
  const b = crypto.randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += letras[b[i] % letras.length];
  return s.slice(0, 4) + "-" + s.slice(4);
}

// O que o navegador pode saber do usuário (sem hash/salt)
export function perfilPublico(u) { return u ? { id: u.id, nome: u.nome || "", email: u.email, admin: !!u.admin } : null; }
// Chave do certificado digital de cada conta (o administrador que veio da versão antiga mantém a chave de sempre)
export function chaveCertificado(u) { return u && u.legado ? "certificado-a1" : "certificado-a1:u:" + u.id; }

// Prefixo das chaves de dados do usuário no store "fazenda-dados"
export function prefixoDados(u) { return u && u.legado ? "" : "u/" + u.id + "/"; }

export function gerarToken(u, dias = 30) {
  const payload = b64url(JSON.stringify({ u: u.id, v: u.versao, exp: Date.now() + dias * 864e5, n: crypto.randomBytes(8).toString("hex") }));
  const assinatura = b64url(crypto.createHmac("sha256", chaveHmac()).update(payload).digest());
  return payload + "." + assinatura;
}

export function tokenDaRequisicao(req) {
  const h = req.headers.get("authorization") || "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return req.headers.get("x-auth-token") || "";
}

// Confere assinatura, validade, se a conta existe e está ativa, e se a senha não foi trocada depois (versão).
// Devolve o usuário (ou null).
export async function usuarioDoToken(token) {
  if (!token || token.indexOf(".") === -1) return null;
  const [payload, assinatura] = token.split(".");
  let esperado;
  try { esperado = b64url(crypto.createHmac("sha256", chaveHmac()).update(payload).digest()); } catch { return null; }
  if (!iguaisSeguro(assinatura, esperado)) return null;
  let dados;
  try { dados = JSON.parse(deB64url(payload).toString("utf8")); } catch { return null; }
  if (!dados || !dados.u || !(dados.exp > Date.now())) return null;
  const u = (await lerUsuarios()).find((x) => x.id === dados.u);
  if (!u || u.ativo === false || u.versao !== dados.v) return null;
  return u;
}

export async function exigirLogin(req) { return usuarioDoToken(tokenDaRequisicao(req)); }
export async function exigirAdmin(req) { const u = await exigirLogin(req); return u && u.admin ? u : null; }

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Auth-Token"
};
export function naoAutorizado() {
  return new Response(JSON.stringify({ error: "Sessão expirada ou sem login. Entre de novo.", naoAutorizado: true }), { status: 401, headers: { "content-type": "application/json", ...CORS } });
}
export function proibido(msg) {
  return new Response(JSON.stringify({ error: msg || "Sem permissão.", proibido: true }), { status: 403, headers: { "content-type": "application/json", ...CORS } });
}
