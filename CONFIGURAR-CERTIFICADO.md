# Configurar o armazenamento seguro do certificado

## O que foi feito

Uma Netlify Function nova (`netlify/functions/certificado.mjs`)
guarda o certificado A1 (arquivo + senha) **criptografado** no Netlify
Blobs. Ninguém — nem você olhando o painel do Netlify, nem eu — consegue
ver a senha depois de enviada. Só uma function futura, rodando dentro
do próprio Netlify, vai conseguir descriptografar, na hora de
realmente falar com a SEFAZ (isso ainda não foi construído — é o
próximo passo).

## O que falta você fazer: configurar a chave de criptografia

Essa chave **não pode ficar no código** — precisa ser configurada
direto no painel do Netlify, como uma variável de ambiente.

### Passo 1 — Gerar a chave

No seu computador, abra o terminal e rode:

```bash
openssl rand -base64 32
```

Isso gera um texto tipo `k3F9s...==` (32 bytes em base64). **Copia
esse valor e guarda num lugar seguro** (ex: um gerenciador de senhas)
— se você perder, os certificados salvos anteriormente ficam
inacessíveis (não tem como recuperar sem essa chave, de propósito).

### Passo 2 — Configurar no Netlify

1. No painel do seu site no Netlify, vá em **Project configuration
   → Environment variables** (ou "Site settings → Environment
   variables", dependendo da versão do painel)
2. Clique em **Add a variable**
3. **Key:** `CERT_ENCRYPTION_KEY`
4. **Value:** cole o valor gerado no Passo 1
5. Salve

### Passo 3 — Novo deploy

Variáveis de ambiente só valem a partir do **próximo deploy** — então,
depois de configurar, force um novo deploy (**Deploys → Trigger
deploy → Clear cache and deploy site**).

## Como testar se funcionou

1. Abre o app publicado, vai em **Compras**
2. Rola até o card **"Certificado Digital (A1)"**
3. Deve aparecer o formulário de upload (arquivo + senha) — se
   aparecer um aviso de "CERT_ENCRYPTION_KEY não configurada", volta
   no Passo 2 e confere se salvou certo
4. Sobe seu certificado `.pfx` de teste com a senha
5. Deve aparecer "✅ Certificado configurado" — isso confirma que o
   armazenamento seguro está funcionando

## O que ainda NÃO está pronto

Isso é só a parte de **guardar com segurança**. A busca automática de
notas na SEFAZ (que é o objetivo final) ainda precisa ser construída
— envolve falar o protocolo da SEFAZ (SOAP + autenticação mútua com o
certificado), o que é a próxima etapa, testada primeiro em
homologação antes de usar em produção.
