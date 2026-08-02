# Passo a passo — publicar do zero (com checagem em cada etapa)

Vamos refazer tudo com calma. Em cada etapa tem um "✅ Confira" — não
pule pra próxima sem confirmar aquele item, porque foi exatamente
numa dessas que algo deu errado da última vez.

---

## 1. Confira os arquivos localmente

Dentro da pasta `netlify-project` (a que eu te mandei), você precisa
ter exatamente isto:

```
netlify-project/
├── index.html
├── netlify.toml
├── package.json
└── netlify/
    └── functions/
        └── storage.mjs
```

**✅ Confira:** abra a pasta no seu computador e confirme que a
subpasta `netlify` (com `functions` dentro, e `storage.mjs` dentro
dela) realmente existe e não ficou de fora quando você baixou/copiou
os arquivos.

---

## 2. Crie um repositório novo e limpo no GitHub

Para evitar qualquer configuração antiga bagunçada, vamos usar um
repositório **novo**.

1. Acesse [github.com/new](https://github.com/new)
2. Nome: `minha-fazenda` (ou o que preferir)
3. Deixe **Public** ou **Private**, tanto faz
4. **Não** marque nenhuma opção de criar README/gitignore — deixe
   totalmente vazio
5. Clique em **Create repository**

**✅ Confira:** você deve cair numa página vazia do GitHub, com
instruções de `git remote add origin...`. Isso significa que o
repositório foi criado vazio, do jeito que precisamos.

---

## 3. Suba os arquivos

No terminal, **dentro da pasta `netlify-project`**:

```bash
cd caminho/para/netlify-project
git init
git add .
git status
```

**✅ Confira:** o resultado do `git status` (ou de `git add .` com
`git status` logo depois) precisa listar **os 5 itens** da estrutura
acima como "new file", incluindo
`netlify/functions/storage.mjs`. Se esse arquivo não aparecer na
lista, ele não vai pro GitHub — pare aqui e confirme que a pasta
`netlify` realmente está dentro de `netlify-project` antes de
continuar.

Se estiver tudo certo:

```bash
git commit -m "primeira versão"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/minha-fazenda.git
git push -u origin main
```

**✅ Confira:** recarregue a página do repositório no GitHub (no
navegador). Você deve ver os 5 itens listados lá, incluindo a pasta
`netlify` — clique nela e confirme que `functions/storage.mjs`
aparece dentro.

---

## 4. Conecte no Netlify (site novo, do zero)

Se você já tinha criado um site no Netlify numa tentativa anterior,
**delete esse site antigo primeiro** (Site settings → General → Danger
zone → Delete this site), pra não herdar nenhuma configuração
manual que tenha ficado torta.

1. No painel do Netlify, clique em **Add new site → Import an
   existing project**
2. Escolha **GitHub** e autorize se pedir
3. Selecione o repositório `minha-fazenda`
4. Na tela de configuração do build, confira **exatamente** isto
   antes de clicar em Deploy:

   | Campo | Valor esperado |
   |---|---|
   | Base directory | *(vazio)* |
   | Build command | *(vazio)* |
   | Publish directory | `.` (ou vazio) |

   Se o Netlify preencher **Build command** com algo tipo
   `npm run build`, **apague esse campo e deixe em branco** — nosso
   projeto não tem passo de build, só a function.

**✅ Confira:** antes de clicar em "Deploy", os três campos da
tabela acima precisam bater. Isso é o ponto que mais costuma dar
problema.

5. Clique em **Deploy site**

---

## 5. Acompanhe o deploy

No painel, vá em **Deploys** e clique no deploy que acabou de rodar.

**✅ Confira:** o status precisa ficar **verde / "Published"**. Se
ficar vermelho/"Failed", clique em **Deploy log** e me manda um
print da parte que tem erro em vermelho — normalmente é uma
mensagem clara tipo "Cannot find module" ou similar.

Ainda na página do site, vá na aba **Functions** (no menu lateral).

**✅ Confira:** deve aparecer uma function chamada **storage** na
lista. Se a lista estiver vazia, o deploy não reconheceu a pasta
`netlify/functions` — normalmente é porque o **Base directory** do
passo 4 não ficou vazio.

---

## 6. Teste a function isoladamente

Copie a URL do seu site (algo como `https://nome-aleatorio.netlify.app`)
e visite, no navegador:

```
https://SEU-SITE.netlify.app/.netlify/functions/storage?key=teste
```

**✅ Confira:** a página deve mostrar só `null` (sem formatação,
texto puro). Se aparecer "Page not found" aqui, alguma etapa anterior
não completou — volta no passo 5 e olha a aba Functions de novo.

---

## 7. Teste o app

Agora sim, abra `https://SEU-SITE.netlify.app` (sem nada depois),
aperte **F12** pra abrir o console do navegador, e recarregue a
página.

**✅ Confira:** no console deve aparecer a mensagem
`Netlify Blobs: conectado com sucesso.` — se aparecer um aviso
amarelo em vez disso, me manda o texto exato da mensagem.

Se tudo isso bateu, teste abrindo o mesmo link em outro navegador ou
celular — os dados devem ser os mesmos dos dois lados.

---

Qualquer "✅ Confira" que não bater, para naquele ponto e me manda um
print — assim eu sei exatamente em qual das 7 etapas travou, em vez
de a gente ficar tentando adivinhar.
