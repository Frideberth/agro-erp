import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

// Netlify Function que guarda o certificado digital A1 (arquivo .pfx +
// senha) de forma CRIPTOGRAFADA no Netlify Blobs — nunca em texto puro.
//
// A chave de criptografia vem de uma variável de ambiente
// (CERT_ENCRYPTION_KEY), configurada só no painel do Netlify — nunca
// no código, nunca acessível pelo navegador.
//
// Esta function NUNCA devolve o certificado nem a senha descriptografados
// pro navegador — só confirma se está configurado ou não. A leitura
// descriptografada só vai acontecer, no futuro, dentro de uma outra
// function server-side, na hora de falar com a SEFAZ.
//
// GET  /.netlify/functions/certificado           -> { configurado, nomeArquivo, atualizadoEm }
// POST /.netlify/functions/certificado           -> { certBase64, senha, nomeArquivo } grava
// DELETE /.netlify/functions/certificado         -> remove o certificado guardado

const STORE_NAME = "certificados";
const BLOB_KEY = "certificado-a1";

function getEncryptionKey() {
  const raw = process.env.CERT_ENCRYPTION_KEY;
  if (!raw) return null;
  try {
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) return null; // AES-256 exige chave de 32 bytes
    return key;
  } catch {
    return null;
  }
}

function encrypt(plaintext, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    cipher: encrypted.toString("base64")
  };
}

function decrypt(payload, key) {
  const iv = Buffer.from(payload.iv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const cipherBuf = Buffer.from(payload.cipher, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(cipherBuf), decipher.final()]);
  return decrypted.toString("utf8");
}

export default async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const store = getStore({ name: STORE_NAME, consistency: "strong" });
  const key = getEncryptionKey();

  if (req.method === "GET") {
    if (!key) {
      return new Response(JSON.stringify({ configurado: false, erro: "CERT_ENCRYPTION_KEY não configurada no Netlify." }), {
        headers: { "content-type": "application/json", ...cors }
      });
    }
    try {
      const meta = await store.get(BLOB_KEY, { type: "json" });
      if (!meta) {
        return new Response(JSON.stringify({ configurado: false }), {
          headers: { "content-type": "application/json", ...cors }
        });
      }
      return new Response(JSON.stringify({
        configurado: true,
        nomeArquivo: meta.nomeArquivo || "",
        atualizadoEm: meta.atualizadoEm || ""
      }), { headers: { "content-type": "application/json", ...cors } });
    } catch {
      return new Response(JSON.stringify({ configurado: false }), {
        headers: { "content-type": "application/json", ...cors }
      });
    }
  }

  if (req.method === "POST") {
    if (!key) {
      return new Response(JSON.stringify({ error: "CERT_ENCRYPTION_KEY não configurada no Netlify. Configure essa variável de ambiente antes de subir o certificado." }), {
        status: 500, headers: { "content-type": "application/json", ...cors }
      });
    }
    try {
      const body = await req.json();
      const { certBase64, senha, nomeArquivo } = body || {};
      if (!certBase64 || !senha) {
        return new Response(JSON.stringify({ error: "Certificado e senha são obrigatórios." }), {
          status: 400, headers: { "content-type": "application/json", ...cors }
        });
      }
      const payloadPlano = JSON.stringify({ certBase64, senha });
      const encriptado = encrypt(payloadPlano, key);
      const registro = {
        ...encriptado,
        nomeArquivo: nomeArquivo || "certificado.pfx",
        atualizadoEm: new Date().toISOString()
      };
      await store.setJSON(BLOB_KEY, registro);
      return new Response(JSON.stringify({ ok: true, atualizadoEm: registro.atualizadoEm }), {
        headers: { "content-type": "application/json", ...cors }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500, headers: { "content-type": "application/json", ...cors }
      });
    }
  }

  if (req.method === "DELETE") {
    try {
      await store.delete(BLOB_KEY);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json", ...cors }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500, headers: { "content-type": "application/json", ...cors }
      });
    }
  }

  return new Response("Method Not Allowed", { status: 405, headers: cors });
};

// Exportada só para uso futuro (dentro de outra function server-side,
// nunca chamada a partir do navegador): descriptografa o certificado
// guardado, quando chegar a hora de falar de verdade com a SEFAZ.
export async function lerCertificadoDescriptografado() {
  const key = getEncryptionKey();
  if (!key) throw new Error("CERT_ENCRYPTION_KEY não configurada.");
  const store = getStore({ name: STORE_NAME, consistency: "strong" });
  const registro = await store.get(BLOB_KEY, { type: "json" });
  if (!registro) return null;
  const plano = decrypt(registro, key);
  return JSON.parse(plano); // { certBase64, senha }
}
