# AgroRP (AGRO-ERP) — manual do projeto para o Claude

Leia este arquivo inteiro antes de mexer em qualquer coisa. Responda sempre em português do Brasil, em linguagem simples: o dono do projeto é produtor rural, não programador.

## O que é

Sistema web de gestão agrícola do **Sítio Santa Izabel** (Abatiá-PR), chamado pelo dono de **AgroRP**. Nasceu inspirado no eProdutor e hoje é usado de verdade, com dados reais. Alguns amigos (no máximo 10) também usam, cada um com as suas propriedades.

Tudo o que o sistema faz fica num arquivo só: `index.html`. O backend são poucas funções do Netlify.

## Estrutura de pastas

| Caminho | O que é |
|---|---|
| `index.html` | O sistema inteiro (HTML + CSS + JS num arquivo só, ~1,5 MB). É aqui que quase toda mudança acontece |
| `netlify/functions/storage.mjs` | Salva e lê os dados no Netlify Blobs |
| `netlify/functions/auth.mjs` + `netlify/lib/auth-comum.mjs` | Contas por e-mail/senha, convites e compartilhamento de propriedade |
| `netlify/functions/certificado.mjs` | Guarda o certificado digital A1 (.pfx) criptografado (AES-256-GCM), lê com node-forge |
| `netlify/functions/sefaz-consulta.mjs`, `sefaz-manifestar.mjs` + `netlify/lib/sefaz-comum.mjs` | Busca de NF-e na SEFAZ (NFeDistribuicaoDFe, SOAP + mTLS) e manifestação de ciência (evento 210210) |
| `netlify/functions/agrofit.mjs` | Consulta ao Agrofit (defensivos) |
| `chuva.html` | Página pública separada de chuva da comunidade (sem login) |
| `Diapp_PWA/` | App separado (PWA). Não mexer sem pedido |
| `Claude outputs/` | Arquivos de trabalho: prints, prévias e **backups reais** em JSON para testes |
| `certificado.mjs`, `sefaz-consulta.mjs` (na raiz) | Cópias antigas. As que valem estão em `netlify/functions/` |
| `versao.txt` | Versão publicada (o `up.bat` soma +0,01 a cada publicação) |

## Como publicar (não usar outros comandos de deploy)

1. **Site de teste:** o dono roda `teste.bat` → envia para a branch `teste` → site `teste--<site>.netlify.app`, com dados separados (faixa vermelha "SITE DE TESTE").
2. **Produção:** o dono roda `up.bat` → pergunta a versão e a mensagem → `git add .`, commit e `git push`. O Netlify publica sozinho.

Não é preciso `netlify deploy`. Não rodar `git push --force` na `main`, `git reset --hard` nem apagar arquivos sem perguntar.

## Regras do código

- **Tudo continua no `index.html`.** Não criar arquivos JS/CSS separados nem usar bibliotecas por CDN. Os gráficos são **SVG puro** (`svgBarChart`, `svgDoughnutChart`, `svgLineChart`): o Chart.js por CDN quebrava com firewall e bloqueador de anúncios.
- **Dados ficam no Netlify Blobs**, separados do código, por chave (`saveKey`). Nunca apagar ou sobrescrever dados do usuário para "consertar" algo: criar uma migração.
- **Migrações e importações (seeds) só rodam uma vez.** Usar `importJaAplicado('<id>')` / `marcarImportAplicado('<id>')` (lista em `state.importsAplicados`). Nunca usar "os dados ainda existem?" como trava: se o usuário apagar, o dado volta sozinho. Cada importação tem `origemImportacao` própria.
- **Lançamentos automáticos mostram a origem** com o selo "🔗 <origem>" no Financeiro (pagamento, compra, nfe, financiamento, vendaAntecipada, relatorioHistorico etc.).
- **Antes de excluir, sempre pedir confirmação** na interface.
- **Tabelas:** todas ordenam ao clicar no cabeçalho (crescente; clicar de novo inverte). Manter isso em tabelas novas, usando `buildGenericTableHtml` quando possível.
- **Formulários:** campos essenciais visíveis e o resto atrás de "▼ Mostrar mais opções" (`field.advanced: true` no `buildGenericFormHtml`).
- **Ao reabrir modal para outro registro, limpar o conteúdo antes** de renderizar (já deu bug de mostrar dados do registro anterior).
- **Rótulo = nome interno do campo.** Já houve bug de campo com nome diferente do rótulo.
- Interface sempre em português; datas no formato dd/mm/aaaa; dinheiro em R$ com vírgula.

## Como a fazenda está organizada no sistema

- **Talhões reais:** Amarelo, Café Novo, Café Velho, Pivô, Pista, Sede, Pasto, Hirome, Santa Izabel 2.
- **Lavoura** = cultura + ano agrícola, ocupando um ou mais talhões com a área plantada.
- **Todo lançamento tem destino:** Lavoura / Só talhão / Geral da fazenda / Máquina ou equipamento (Patrimônio). Rateio entre talhões por área ou igualmente, guardado como "partes".
- **Rentabilidade:** por lavoura, talhão, cultura e máquina, com opção de incluir depreciação e custo de oportunidade (valor do Patrimônio × taxa, padrão 10% a.a.), rateados por área.
- **Análise de solo:** potássio em mg/dm³ (laudos em cmolc/dm³ × 390,983). CTC sempre a pH 7,0. Calagem pelo método da saturação por bases.
- **Café:** espaçamento 3,50 × 0,50 m; pulverizador de 400 L com 2 bicos, cobrindo 2 ruas por passada.

## Como testar antes de entregar

1. Validar a sintaxe do JavaScript do `index.html` depois de qualquer edição.
2. Testar com o backup real mais recente em `Claude outputs/` (ex.: `fazenda-backup-2026-10-31-ajustado.json`): abrir, conferir que nada duplicou, que nada apagado voltou e que os totais batem.
3. Conferir na tela (print) as abas mexidas.
4. Dizer ao dono, em uma frase, o que mudou e lembrar de testar no `teste.bat` antes do `up.bat`.

## Decisões já tomadas (não reabrir sem ele pedir)

- Fica tudo no `index.html` (a página separada "Raio-X do Café" foi incorporada; a pasta `rx/` saiu).
- Custo de produção pelo método SENAR, para todas as culturas: frete com caminhão próprio fica fora; juros de todos os financiamentos entram.
- Das ideias do eProdutor, **não quer**: romaneio com descontos, indicadores em sacas/dólar, extrato de IR, painel de tempo e cotações. Manutenção de máquinas já existe e fica como está.
- Imagens de campo por upload manual (não integrar Climate FieldView).

- Fertilidade: além das classes do Manual PR, o sistema mostra o **equilíbrio das bases na CTC** com as metas do professor/agrônomo (Ca 60%, Mg 20%, K até 5%). K acima de 8% da CTC zera a dose de K₂O; entre 5% e 8% usa o menor valor da faixa. Com pH CaCl₂ acima de 6,0, sugere gesso + sulfato de magnésio no lugar do calcário. Talhão sem lavoura não assume soja: pede a cultura (tomate/hortaliças ainda sem tabela).
- Soja: potássio em cobertura a lanço até V4/V5 (orientação do professor).

## Pendências conhecidas

- Testar a ciência e o download de notas na SEFAZ real (consultar com NSU 0 e dar ciência em 1–2 notas).
- Classificar lançamentos antigos sem destino (filtro "A classificar").
- LCDPR: análise entregue, aguardando decisão.

## Segurança

Nunca escrever senhas, certificado, CPF ou chaves no código ou neste arquivo. Dados sensíveis ficam só no Netlify (variáveis de ambiente e Blobs).
