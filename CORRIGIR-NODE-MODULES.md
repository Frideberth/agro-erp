# Corrigindo: node_modules commitado no repositório

Isso provavelmente está impedindo a function de ser empacotada
corretamente. Vamos limpar isso.

## 1. Confira o `.gitignore`

Abra o arquivo `.gitignore` na raiz do seu repositório (pelo GitHub
mesmo, clicando nele) e veja se a linha `node_modules` está lá.

**✅ Confira:** se a linha `node_modules` (ou `node_modules/`) não
existir no arquivo, é essa a causa raiz. Adicione essa linha:

```
node_modules
```

## 2. Remova o node_modules do controle de versão

No terminal, na pasta do repositório:

```bash
git rm -r --cached node_modules
git add .gitignore
git commit -m "remove node_modules do repositorio"
git push
```

(O `--cached` remove só do Git, sem apagar a pasta do seu
computador.)

**✅ Confira:** depois do push, recarregue a página do repositório no
GitHub — a pasta `node_modules` não deve mais aparecer na listagem
de arquivos.

## 3. Force um novo deploy com cache limpo

No painel do Netlify:

1. Vá em **Deploys**
2. **Trigger deploy → Clear cache and deploy site**

Isso é importante — precisa ser especificamente "Clear cache", não
só "Deploy site", pra garantir que ele reinstale as dependências do
zero.

## 4. Confira o log da etapa "Building" desta vez

Enquanto o deploy roda (ou depois que terminar), clica na setinha
`>` ao lado de **Building** no log e procura por:

- Uma linha mencionando `npm install` ou `Installing dependencies`
- Qualquer menção a `@netlify/blobs`
- Qualquer linha com `Functions bundling` ou `Packaging Functions`

**✅ Confira:** se aparecer algum erro em vermelho relacionado a
"blobs" ou "Cannot find module", me manda o texto exato — é a pista
que faltava.

## 5. Teste de novo

```
https://agro-erp.netlify.app/.netlify/functions/storage?key=teste
```

Deve mostrar `null` desta vez.
