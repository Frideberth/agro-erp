import { lerCertificadoDescriptografado } from "./certificado.mjs";
import { UF_CODIGO, abrirPfx, chamarSoap, extrairTag, respostaJson, assinarElemento, dataHoraBrasilia } from "../lib/sefaz-comum.mjs";

// Registra o evento "Ciência da Operação" (210210) nas notas em que você é o destinatário.
// Sem essa manifestação, a SEFAZ só entrega o RESUMO da nota (resNFe) na Distribuição DF-e;
// depois dela, o XML completo fica disponível para download (por chave ou nas próximas consultas).
//
// POST /.netlify/functions/sefaz-manifestar
// body: { ambiente: "producao" | "homologacao", documento: "CPF ou CNPJ", chaves: ["44 dígitos", ...] } (até 20 chaves)
// resposta: { ok, cStat, xMotivo, resultados: [{ chave, cStat, xMotivo, sucesso }] }

const HOSTS = { producao: "www.nfe.fazenda.gov.br", homologacao: "hom1.nfe.fazenda.gov.br" };
const PATH = "/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx";
const ACTION = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento";

// 135 = evento registrado e vinculado; 136 = registrado sem vínculo; 573 = já existia (duplicidade) — os três servem
const SUCESSO = ["135", "136", "573"];

export function montarEnvEvento({ tpAmb, documento, chaves, key, certBase64, dhEvento, idLote }) {
  const tagDoc = documento.length === 11 ? "CPF" : "CNPJ";
  const eventos = chaves.map((chave) => {
    const id = `ID210210${chave}01`;
    const infEvento =
      `<infEvento Id="${id}">` +
      `<cOrgao>91</cOrgao><tpAmb>${tpAmb}</tpAmb><${tagDoc}>${documento}</${tagDoc}><chNFe>${chave}</chNFe>` +
      `<dhEvento>${dhEvento}</dhEvento><tpEvento>210210</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento>` +
      `<detEvento versao="1.00"><descEvento>Ciencia da Operacao</descEvento></detEvento>` +
      `</infEvento>`;
    const assinatura = assinarElemento({ elementoSemNs: infEvento, elementoTag: "infEvento", id, key, certBase64 });
    return `<evento versao="1.00">${infEvento}${assinatura}</evento>`;
  }).join("");
  return `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>${idLote}</idLote>${eventos}</envEvento>`;
}

export default async (req) => {
  if (req.method === "OPTIONS") return respostaJson({}, 204);
  if (req.method !== "POST") return respostaJson({ error: "Method Not Allowed" }, 405);
  try {
    const { ambiente, documento, chaves } = (await req.json()) || {};
    const doc = String(documento || "").replace(/\D/g, "");
    if (!/^\d{11}$|^\d{14}$/.test(doc)) return respostaJson({ error: "Informe o CPF ou CNPJ (só números)." }, 400);
    const lista = (Array.isArray(chaves) ? chaves : []).map((c) => String(c).replace(/\D/g, "")).filter((c) => c.length === 44);
    if (!lista.length) return respostaJson({ error: "Nenhuma chave de acesso válida (44 dígitos)." }, 400);
    if (lista.length > 20) return respostaJson({ error: "No máximo 20 notas por vez." }, 400);

    const cert = await lerCertificadoDescriptografado();
    if (!cert) return respostaJson({ error: "Nenhum certificado configurado ainda." }, 400);
    let pfx;
    try { pfx = abrirPfx(Buffer.from(cert.certBase64, "base64"), cert.senha); }
    catch (err) { return respostaJson({ error: "Não consegui abrir o certificado: " + String(err.message || err) }, 400); }

    const tpAmb = ambiente === "producao" ? "1" : "2";
    const envEvento = montarEnvEvento({
      tpAmb, documento: doc, chaves: lista, key: pfx.key, certBase64: pfx.certBase64,
      dhEvento: dataHoraBrasilia(), idLote: String(Date.now()).slice(-15)
    });
    const envelope =
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
      `<soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">${envEvento}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;

    let resposta;
    try {
      resposta = await chamarSoap({ host: HOSTS[ambiente === "producao" ? "producao" : "homologacao"], path: PATH, envelope, certPem: pfx.certPem, keyPem: pfx.keyPem, action: ACTION });
    } catch (err) {
      return respostaJson({ error: "Falha ao conectar na SEFAZ: " + String(err.message || err) }, 502);
    }

    const corpo = resposta.body;
    const resultados = [];
    const re = /<retEvento[\s\S]*?<\/retEvento>/g;
    let m;
    while ((m = re.exec(corpo))) {
      const bloco = m[0];
      const cStat = extrairTag(bloco, "cStat");
      resultados.push({ chave: extrairTag(bloco, "chNFe"), cStat, xMotivo: extrairTag(bloco, "xMotivo"), sucesso: SUCESSO.includes(cStat) });
    }
    // cStat/xMotivo do lote (fora dos retEvento)
    const semEventos = corpo.replace(re, "");
    return respostaJson({
      ok: resposta.status === 200,
      statusHttp: resposta.status,
      cStat: extrairTag(semEventos, "cStat"),
      xMotivo: extrairTag(semEventos, "xMotivo"),
      resultados,
      respostaBruta: resultados.length ? undefined : corpo.slice(0, 3000)
    });
  } catch (err) {
    return respostaJson({ error: String(err.message || err) }, 500);
  }
};
