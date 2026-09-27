// Autenticação do AGRO-ERP: a senha fica só no servidor (hash scrypt) e o navegador recebe um token
// assinado (HMAC) que precisa ser enviado em toda chamada às functions.
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

const STORE_AUTH = "fazenda-auth";
const CHAVE_CREDENCIAL = "credencial";

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

export function storeAuth() { return getStore({ name: STORE_AUTH, consistency: "strong" }); }
export async function lerCredencial() { return (await storeAuth().get(CHAVE_CREDENCIAL, { type: "json" })) || null; }
export async function gravarCredencial(senha, versaoAnterior) {
  const { salt, hash } = hashSenha(senha);
  const cred = { salt, hash, versao: (Number(versaoAnterior) || 0) + 1, atualizadoEm: new Date().toISOString() };
  await storeAuth().setJSON(CHAVE_CREDENCIAL, cred);
  return cred;
}

export function gerarToken(cred, dias = 30) {
  const payload = b64url(JSON.stringify({ v: cred.versao, exp: Date.now() + dias * 864e5, n: crypto.randomBytes(8).toString("hex") }));
  const assinatura = b64url(crypto.createHmac("sha256", chaveHmac()).update(payload).digest());
  return payload + "." + assinatura;
}

export function tokenDaRequisicao(req) {
  const h = req.headers.get("authorization") || "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return req.headers.get("x-auth-token") || "";
}

// Confere assinatura, validade e se a senha não foi trocada depois (versão)
export async function tokenValido(token) {
  if (!token || token.indexOf(".") === -1) return false;
  const [payload, assinatura] = token.split(".");
  let esperado;
  try { esperado = b64url(crypto.createHmac("sha256", chaveHmac()).update(payload).digest()); } catch { return false; }
  if (!iguaisSeguro(assinatura, esperado)) return false;
  let dados;
  try { dados = JSON.parse(deB64url(payload).toString("utf8")); } catch { return false; }
  if (!dados || !(dados.exp > Date.now())) return false;
  const cred = await lerCredencial();
  return !!cred && cred.versao === dados.v;
}

export async function exigirLogin(req) { return tokenValido(tokenDaRequisicao(req)); }

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Auth-Token"
};
export function naoAutorizado() {
  return new Response(JSON.stringify({ error: "Sessão expirada ou sem login. Entre de novo.", naoAutorizado: true }), { status: 401, headers: { "content-type": "application/json", ...CORS } });
}
