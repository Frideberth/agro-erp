# mac verify failure — resolvido de vez (sem precisar de NODE_OPTIONS)

## O que mudou

A tentativa anterior (variável `NODE_OPTIONS=--openssl-legacy-provider`)
não é confiável — não achei confirmação de que o Netlify realmente
aplica essa configuração dentro da function rodando de verdade (só
encontrei relatos sobre isso valendo no processo de *build*, não na
execução).

Troquei de abordagem: agora o certificado é lido usando a biblioteca
**node-forge** (implementação de PKCS12 em JavaScript puro, sem
depender do OpenSSL do sistema pra nada). Testei isso aqui do meu lado
criando um certificado de propósito com a mesma criptografia antiga que
causa o erro — o Node nativo rejeitou ("Unsupported PKCS12 PFX data"),
e o `node-forge` abriu sem problema.

**Se você não configurou a variável `NODE_OPTIONS` antes, não precisa
mexer nela agora — pode deixar como está ou remover, tanto faz.**

## O que fazer agora

1. Sobe os arquivos atualizados (`certificado.mjs`, `sefaz-consulta.mjs`
   e `package.json` — esse último tem uma dependência nova,
   `node-forge`, que o Netlify instala sozinho no próximo build)

```bash
git add . && git commit -m "corrige leitura do certificado (node-forge)" && git push
```

2. Como o `package.json` mudou (dependência nova), force um deploy com
   **cache limpo**: no painel do Netlify, **Deploys → Trigger deploy
   → Clear cache and deploy site** — isso garante que o `node-forge`
   seja instalado do zero

3. **Remove o certificado atual** na aba Compras (botão "Remover
   certificado") e **sobe ele de novo** — agora a validação acontece
   já na hora do upload, então se a senha estiver errada, você vai
   saber na hora, com uma mensagem clara, em vez de só descobrir
   depois ao testar a consulta

4. Se subir sem erro, testa a consulta na SEFAZ de novo

## Se ainda der erro

Agora, se a senha realmente estiver errada, a mensagem vai ser bem
mais clara ("PKCS#12 MAC could not be verified. Invalid password?")
em vez do genérico "mac verify failure" — o que já ajuda bastante a
diferenciar "senha errada" de "problema técnico".
