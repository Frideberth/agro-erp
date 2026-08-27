# Passo a passo — usando o repositório e site que você já tem

## 1. Copie os arquivos novos para dentro do seu repositório antigo

Na pasta do seu repositório antigo (aquele que já está no GitHub e
ligado ao Netlify), copie para dentro dela:

- `index.html` (substitui o antigo)
- `netlify.toml` (arquivo novo, vai na raiz)
- `package.json` (arquivo novo, vai na raiz — se você já tiver um
  `package.json` ali por outro motivo, me avisa antes de sobrescrever)
- a pasta inteira `netlify/` (com `functions/storage.mjs` dentro)

**✅ Confira:** na raiz do seu repositório, agora devem existir
`index.html`, `netlify.toml`, `package.json` e a pasta `netlify/`
lado a lado.

## 2. Suba pro GitHub

```bash
cd caminho/para/seu-repositorio-antigo
git add .
git status
```

**✅ Confira:** o `git status` precisa mostrar `netlify.toml`,
`package.json` e `netlify/functions/storage.mjs` como arquivos
novos (new file). Se `netlify/functions/storage.mjs` não aparecer,
pare aqui — a pasta não foi copiada certo.

```bash
git commit -m "adiciona Netlify Blobs"
git push
```

## 3. Corrija as configurações do site no Netlify

Esse é o ponto mais importante — é bem provável que seja onde travou
antes.

1. No painel do Netlify, abra o site já existente
2. Vá em **Site configuration → Build & deploy → Build settings**
   (ou **Site settings → Build & deploy**, dependendo da versão do
   painel)
3. Clique em **Edit settings** e confira estes três campos:

   | Campo | Valor esperado |
   |---|---|
   | Base directory | *(vazio)* |
   | Build command | *(vazio)* |
   | Publish directory | `.` (ou vazio) |

   Se **Build command** tiver algo escrito (tipo `npm run build` ou
   qualquer outro comando), **apague e deixe em branco** — é a causa
   mais comum desse tipo de falha silenciosa.

4. Salve as alterações

## 4. Force um novo deploy

Como só mudar as configurações não dispara um deploy novo sozinho:

1. Vá na aba **Deploys**
2. Clique em **Trigger deploy → Deploy site** (ou **Clear cache and
   deploy site**, se essa opção aparecer — melhor ainda, garante que
   nada antigo ficou em cache)

**✅ Confira:** o deploy precisa terminar **verde/Published**. Se
ficar vermelho, abre o **Deploy log** e me manda print da parte em
vermelho.

## 5. Confirme a function

Vá na aba **Functions** do site.

**✅ Confira:** deve aparecer **storage** na lista.

Depois, visite no navegador:

```
https://SEU-SITE.netlify.app/.netlify/functions/storage?key=teste
```

**✅ Confira:** deve mostrar só `null`. Se der "Page not found" de
novo mesmo depois disso, me manda print da tela de **Build settings**
do passo 3 — quero ver exatamente o que está preenchido lá.
