import { lerCertificadoDescriptografado } from "./certificado.mjs";
import { UF_CODIGO, abrirPfx, chamarSoap, extrairTag, descompactarDocZips, respostaJson } from "../lib/sefaz-comum.mjs";

// Consulta o webservice NFeDistribuicaoDFe da SEFAZ (Ambiente Nacional) com o certificado A1 guardado.
//
// POST /.netlify/functions/sefaz-consulta
// Por NSU (padrão):  { ambiente, uf, documento, ultNSU }
// Por chave:         { ambiente, uf, documento, chaves: ["44 dígitos", ...] }  (até 5 por chamada)
//   → baixa o XML completo de notas que só vieram como resumo, depois da Ciência da Operação.

const ENDPOINTS = {
  // hom.nfe.fazenda.gov.br foi desativado em 23/05/2022 — o substituto é hom1.nfe.fazenda.gov.br
  homologacao: "hom1.nfe.fazenda.gov.br",
  producao: "www1.nfe.fazenda.gov.br"
};
const PATH = "/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx";

function montarEnvelopeSoap({ tpAmb, cUFAutor, documento, ultNSU, chave }) {
  const tagDoc = documento.length === 11 ? "CPF" : "CNPJ";
  const consulta = chave
    ? `<consChNFe><chNFe>${chave}</chNFe></consChNFe>`
    : `<distNSU><ultNSU>${String(ultNSU || "0").padStart(15, "0")}</ultNSU></distNSU>`;
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>${tpAmb}</tpAmb>
          <cUFAutor>${cUFAutor}</cUFAutor>
          <${tagDoc}>${documento}</${tagDoc}>
          ${consulta}
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;
}

export default async (req) => {
  if (req.method === "OPTIONS") return respostaJson({}, 204);
  if (req.method !== "POST") return respostaJson({ error: "Method Not Allowed" }, 405);

  try {
    const { ambiente, uf, documento, ultNSU, chaves } = (await req.json()) || {};
    if (!uf || !UF_CODIGO[uf]) return respostaJson({ error: "UF inválida ou não informada." }, 400);
    if (!documento || !/^\d{11}$|^\d{14}$/.test(documento)) return respostaJson({ error: "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos), só números." }, 400);

    const cert = await lerCertificadoDescriptografado();
    if (!cert) return respostaJson({ error: "Nenhum certificado configurado ainda. Suba o certificado primeiro." }, 400);

    let pfx;
    try {
      pfx = abrirPfx(Buffer.from(cert.certBase64, "base64"), cert.senha);
    } catch (err) {
      return respostaJson({ error: "Não consegui abrir o certificado: " + String(err.message || err) + " — confira se a senha guardada está correta (remova e suba o certificado de novo, se precisar)." }, 400);
    }

    const tpAmb = ambiente === "producao" ? "1" : "2";
    const host = ambiente === "producao" ? ENDPOINTS.producao : ENDPOINTS.homologacao;

    // ---- Download por chave (notas que só vieram como resumo) ----
    if (Array.isArray(chaves) && chaves.length) {
      const lista = chaves.map((c) => String(c).replace(/\D/g, "")).filter((c) => c.length === 44).slice(0, 5);
      const resultados = [];
      const documentos = [];
      for (const chave of lista) {
        try {
          const resp = await chamarSoap({ host, path: PATH, envelope: montarEnvelopeSoap({ tpAmb, cUFAutor: UF_CODIGO[uf], documento, chave }), certPem: pfx.certPem, keyPem: pfx.keyPem });
          const docs = descompactarDocZips(resp.body);
          const completos = docs.filter((d) => d.schema && d.schema.indexOf("procNFe") !== -1);
          completos.forEach((d) => documentos.push(d));
          resultados.push({ chave, cStat: extrairTag(resp.body, "cStat"), xMotivo: extrairTag(resp.body, "xMotivo"), baixou: completos.length > 0 });
        } catch (err) {
          resultados.push({ chave, cStat: null, xMotivo: "Falha ao conectar: " + String(err.message || err), baixou: false });
        }
      }
      return respostaJson({ ok: true, modo: "chave", resultados, documentos, quantidadeDocumentos: documentos.length });
    }

    // ---- Consulta por NSU ----
    let resposta;
    try {
      resposta = await chamarSoap({ host, path: PATH, envelope: montarEnvelopeSoap({ tpAmb, cUFAutor: UF_CODIGO[uf], documento, ultNSU }), certPem: pfx.certPem, keyPem: pfx.keyPem, timeout: 25000 });
    } catch (err) {
      return respostaJson({ error: "Falha ao conectar na SEFAZ: " + String(err.message || err) }, 502);
    }

    const documentos = descompactarDocZips(resposta.body);
    return respostaJson({
      ok: resposta.status === 200,
      statusHttp: resposta.status,
      cStat: extrairTag(resposta.body, "cStat"),
      xMotivo: extrairTag(resposta.body, "xMotivo"),
      ultNSU: extrairTag(resposta.body, "ultNSU"),
      maxNSU: extrairTag(resposta.body, "maxNSU"),
      quantidadeDocumentos: documentos.length,
      documentos,
      respostaBruta: resposta.body.slice(0, 4000) // só pra diagnóstico
    });
  } catch (err) {
    return respostaJson({ error: String(err.message || err) }, 500);
  }
};
