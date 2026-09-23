// Funções compartilhadas pelas Netlify Functions que falam com a SEFAZ.
// Fica fora de netlify/functions para não virar um endpoint próprio.
import https from "node:https";
import zlib from "node:zlib";
import forge from "node-forge";

export const UF_CODIGO = {
  AC:12, AL:27, AP:16, AM:13, BA:29, CE:23, DF:53, ES:32, GO:52, MA:21,
  MT:51, MS:50, MG:31, PA:15, PB:25, PR:41, PE:26, PI:22, RJ:33, RN:24,
  RS:43, RO:11, RR:14, SC:42, SP:35, SE:28, TO:17
};

// Abre o .pfx com node-forge (evita o "mac verify failure" do OpenSSL 3 com certificados antigos)
export function abrirPfx(pfxBuffer, senha) {
  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfxBuffer.toString("binary")));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, senha);

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const lista = certBags[forge.pki.oids.certBag] || [];
  // Pega o certificado do titular (o que não é de uma autoridade certificadora), se houver cadeia
  const certBag = lista.find((b) => b.cert && !(b.cert.extensions || []).some((e) => e.name === "basicConstraints" && e.cA)) || lista[0];
  if (!certBag || !certBag.cert) throw new Error("Não encontrei um certificado dentro do arquivo .pfx.");

  let keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  let keyBag = (keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] || [])[0];
  if (!keyBag) {
    keyBags = p12.getBags({ bagType: forge.pki.oids.keyBag });
    keyBag = (keyBags[forge.pki.oids.keyBag] || [])[0];
  }
  if (!keyBag || !keyBag.key) throw new Error("Não encontrei a chave privada dentro do arquivo .pfx.");

  return {
    cert: certBag.cert,
    key: keyBag.key,
    certPem: forge.pki.certificateToPem(certBag.cert),
    keyPem: forge.pki.privateKeyToPem(keyBag.key),
    certBase64: forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(certBag.cert)).getBytes())
  };
}

export function chamarSoap({ host, path, envelope, certPem, keyPem, action, timeout = 20000 }) {
  return new Promise((resolve, reject) => {
    const dados = Buffer.from(envelope, "utf8");
    const req = https.request(
      {
        host, path, method: "POST", cert: certPem, key: keyPem,
        headers: {
          "Content-Type": "application/soap+xml; charset=utf-8" + (action ? `; action="${action}"` : ""),
          "Content-Length": dados.length
        },
        timeout
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      }
    );
    req.on("timeout", () => { req.destroy(new Error("Tempo esgotado ao falar com a SEFAZ.")); });
    req.on("error", reject);
    req.write(dados);
    req.end();
  });
}

export function extrairTag(xml, tag) {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "i"));
  return m ? m[1].trim() : null;
}

export function descompactarDocZips(xml) {
  const docs = [];
  const re = /<docZip([^>]*)>([\s\S]*?)<\/docZip>/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const nsu = (attrs.match(/NSU="([^"]+)"/) || [])[1] || "";
    const schema = (attrs.match(/schema="([^"]*)"/) || [])[1] || "";
    try {
      const xmlDoc = zlib.gunzipSync(Buffer.from(m[2], "base64")).toString("utf8");
      docs.push({ nsu, schema, xml: xmlDoc });
    } catch {
      docs.push({ nsu, schema, erro: "não foi possível descompactar" });
    }
  }
  return docs;
}

export function respostaJson(obj, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

/* ---------- Assinatura XMLDSig (enveloped, C14N, RSA-SHA1) no formato exigido pela SEFAZ ---------- */
// O XML é montado já em forma canônica (sem espaços entre tags, atributos em ordem), então a
// canonicalização C14N de infEvento é o próprio texto com o namespace herdado declarado no início.
const NS_NFE = "http://www.portalfiscal.inf.br/nfe";
const NS_DSIG = "http://www.w3.org/2000/09/xmldsig#";

function sha1Base64(texto) {
  const md = forge.md.sha1.create();
  md.update(texto, "utf8");
  return forge.util.encode64(md.digest().getBytes());
}

export function assinarElemento({ elementoSemNs, elementoTag, id, key, certBase64, nsPai = NS_NFE }) {
  // forma canônica do elemento assinado: o namespace herdado do pai aparece na tag de abertura
  const canonico = elementoSemNs.replace(`<${elementoTag} `, `<${elementoTag} xmlns="${nsPai}" `);
  const digest = sha1Base64(canonico);
  const signedInfoCorpo =
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod>` +
    `<Reference URI="#${id}"><Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform>` +
    `<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></Transform>` +
    `</Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod>` +
    `<DigestValue>${digest}</DigestValue></Reference>`;
  const signedInfoCanonico = `<SignedInfo xmlns="${NS_DSIG}">${signedInfoCorpo}</SignedInfo>`;
  const md = forge.md.sha1.create();
  md.update(signedInfoCanonico, "utf8");
  const assinatura = forge.util.encode64(key.sign(md));
  return `<Signature xmlns="${NS_DSIG}"><SignedInfo>${signedInfoCorpo}</SignedInfo>` +
    `<SignatureValue>${assinatura}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${certBase64}</X509Certificate></X509Data></KeyInfo></Signature>`;
}

// Data/hora no fuso de Brasília (UTC-3), um minuto no passado (a SEFAZ rejeita data no futuro)
export function dataHoraBrasilia(agora = Date.now()) {
  const d = new Date(agora - 60 * 1000 - 3 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 19) + "-03:00";
}
