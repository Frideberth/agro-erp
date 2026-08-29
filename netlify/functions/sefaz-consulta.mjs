import https from "node:https";
import zlib from "node:zlib";
import forge from "node-forge";
import { lerCertificadoDescriptografado } from "./certificado.mjs";

// Function que consulta o webservice NFeDistribuicaoDFe da SEFAZ,
// usando o certificado A1 guardado (via certificado.mjs).
//
// Usa a biblioteca node-forge (implementação de PKCS12 em JavaScript
// puro) pra abrir o certificado, em vez do suporte nativo do Node —
// isso evita o erro "mac verify failure" que acontece com muitos
// certificados brasileiros mais antigos, porque o OpenSSL 3.x (usado
// pelo Node de fábrica) desativou por padrão os algoritmos de
// criptografia que essas Autoridades Certificadoras costumavam usar.
//
// ATENÇÃO — ainda não testada contra o servidor real da SEFAZ (só o
// carregamento do certificado foi validado de verdade): o protocolo
// SOAP da SEFAZ é notoriamente sensível a detalhes (a própria
// comunidade de desenvolvedores relata erros de "endpoint
// não encontrado" mesmo com tudo aparentemente certo). Trate isso
// como um ponto de partida pra debugar com o retorno real deles,
// não como algo definitivo.
//
// POST /.netlify/functions/sefaz-consulta
// body: { ambiente: "homologacao" | "producao", uf: "MT", documento: "12345678000199", ultNSU: "000000000000000" }

const UF_CODIGO = {
  AC:12, AL:27, AP:16, AM:13, BA:29, CE:23, DF:53, ES:32, GO:52, MA:21,
  MT:51, MS:50, MG:31, PA:15, PB:25, PR:41, PE:26, PI:22, RJ:33, RN:24,
  RS:43, RO:11, RR:14, SC:42, SP:35, SE:28, TO:17
};

const ENDPOINTS = {
  homologacao: "hom.nfe.fazenda.gov.br",
  producao: "www1.nfe.fazenda.gov.br"
};
const PATH = "/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx";

function pfxParaPem(pfxBuffer, senha) {
  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfxBuffer.toString("binary")));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, senha);

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = (certBags[forge.pki.oids.certBag] || [])[0];
  if (!certBag || !certBag.cert) throw new Error("Não encontrei um certificado dentro do arquivo .pfx.");
  const certPem = forge.pki.certificateToPem(certBag.cert);

  let keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  let keyBag = (keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] || [])[0];
  if (!keyBag) {
    keyBags = p12.getBags({ bagType: forge.pki.oids.keyBag });
    keyBag = (keyBags[forge.pki.oids.keyBag] || [])[0];
  }
  if (!keyBag || !keyBag.key) throw new Error("Não encontrei a chave privada dentro do arquivo .pfx.");
  const keyPem = forge.pki.privateKeyToPem(keyBag.key);

  return { certPem, keyPem };
}

function montarEnvelopeSoap({ tpAmb, cUFAutor, documento, ultNSU }) {
  const tagDoc = documento.length === 11 ? "CPF" : "CNPJ";
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>${tpAmb}</tpAmb>
          <cUFAutor>${cUFAutor}</cUFAutor>
          <${tagDoc}>${documento}</${tagDoc}>
          <distNSU>
            <ultNSU>${String(ultNSU || "0").padStart(15, "0")}</ultNSU>
          </distNSU>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;
}

function chamarSefaz({ host, certPem, keyPem, envelope }) {
  return new Promise((resolve, reject) => {
    const dados = Buffer.from(envelope, "utf8");
    const req = https.request(
      {
        host,
        path: PATH,
        method: "POST",
        cert: certPem,
        key: keyPem,
        headers: {
          "Content-Type": "application/soap+xml; charset=utf-8",
          "Content-Length": dados.length
        },
        timeout: 25000
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") });
        });
      }
    );
    req.on("timeout", () => { req.destroy(new Error("Tempo esgotado ao falar com a SEFAZ.")); });
    req.on("error", reject);
    req.write(dados);
    req.end();
  });
}

function extrairTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].trim() : null;
}

function descompactarDocZips(xml) {
  const docs = [];
  const re = /<docZip[^>]*NSU="([^"]+)"[^>]*schema="([^"]*)"[^>]*>([\s\S]*?)<\/docZip>/g;
  let m;
  while ((m = re.exec(xml))) {
    try {
      const gz = Buffer.from(m[3], "base64");
      const xmlDoc = zlib.gunzipSync(gz).toString("utf8");
      docs.push({ nsu: m[1], schema: m[2], xml: xmlDoc });
    } catch {
      docs.push({ nsu: m[1], schema: m[2], erro: "não foi possível descompactar" });
    }
  }
  return docs;
}

export default async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: cors });

  try {
    const body = await req.json();
    const { ambiente, uf, documento, ultNSU } = body || {};
    if (!uf || !UF_CODIGO[uf]) {
      return new Response(JSON.stringify({ error: "UF inválida ou não informada." }), { status: 400, headers: { "content-type": "application/json", ...cors } });
    }
    if (!documento || !/^\d{11}$|^\d{14}$/.test(documento)) {
      return new Response(JSON.stringify({ error: "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos), só números." }), { status: 400, headers: { "content-type": "application/json", ...cors } });
    }

    const cert = await lerCertificadoDescriptografado();
    if (!cert) {
      return new Response(JSON.stringify({ error: "Nenhum certificado configurado ainda. Suba o certificado primeiro." }), { status: 400, headers: { "content-type": "application/json", ...cors } });
    }

    let certPem, keyPem;
    try {
      const pfxBuffer = Buffer.from(cert.certBase64, "base64");
      const convertido = pfxParaPem(pfxBuffer, cert.senha);
      certPem = convertido.certPem;
      keyPem = convertido.keyPem;
    } catch (err) {
      return new Response(JSON.stringify({ error: "Não consegui abrir o certificado: " + String(err.message || err) + " — confira se a senha guardada está correta (remova e suba o certificado de novo, se precisar)." }), { status: 400, headers: { "content-type": "application/json", ...cors } });
    }

    const tpAmb = ambiente === "producao" ? "1" : "2";
    const host = ambiente === "producao" ? ENDPOINTS.producao : ENDPOINTS.homologacao;
    const envelope = montarEnvelopeSoap({ tpAmb, cUFAutor: UF_CODIGO[uf], documento, ultNSU });

    let resposta;
    try {
      resposta = await chamarSefaz({
        host,
        certPem,
        keyPem,
        envelope
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Falha ao conectar na SEFAZ: " + String(err.message || err) }), { status: 502, headers: { "content-type": "application/json", ...cors } });
    }

    const cStat = extrairTag(resposta.body, "cStat");
    const xMotivo = extrairTag(resposta.body, "xMotivo");
    const ultNSURetorno = extrairTag(resposta.body, "ultNSU");
    const maxNSU = extrairTag(resposta.body, "maxNSU");
    const documentos = descompactarDocZips(resposta.body);

    return new Response(JSON.stringify({
      ok: resposta.status === 200,
      statusHttp: resposta.status,
      cStat, xMotivo, ultNSU: ultNSURetorno, maxNSU,
      quantidadeDocumentos: documentos.length,
      documentos,
      respostaBruta: resposta.body.slice(0, 4000) // só pra diagnóstico, corta pra não ficar gigante
    }), { headers: { "content-type": "application/json", ...cors } });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err.message || err) }), { status: 500, headers: { "content-type": "application/json", ...cors } });
  }
};
