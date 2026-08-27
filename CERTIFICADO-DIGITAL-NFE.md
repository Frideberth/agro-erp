# Certificado digital + Notas Fiscais Eletrônicas (NF-e) — o que envolve

## Resumo rápido

**É possível, sim.** Mas é um projeto bem maior que tudo que fizemos
até agora — inclusive maior que o Netlify Blobs. Não é um ajuste no
app atual, é uma peça nova de infraestrutura. E envolve lidar com um
documento sensível: o certificado digital tem **poder de assinatura
legal** em seu nome perante a Receita Federal e a SEFAZ.

---

## Como isso funciona de verdade

1. Toda empresa que recebe uma NF-e (nota fiscal eletrônica) contra o
   seu CNPJ fica **"disponível"** nos servidores da SEFAZ do seu
   estado — mesmo que você nunca tenha "aceitado" nada.
2. Existe um webservice oficial chamado **NFe Distribuição DFe**
   que permite consultar essas notas, autenticando com o **certificado
   digital A1 (arquivo .pfx) ou A3 (cartão/token)** da empresa.
3. A resposta vem em **XML** — um formato de documento estruturado
   contendo todos os produtos, quantidades, valores, fornecedor, etc.
   daquela nota.
4. Dá pra automatizar: bater nesse webservice periodicamente,
   pegar as notas novas, e extrair os produtos pra dentro do seu
   cadastro de Produtos/Financeiro/Contas a Pagar automaticamente.

## Por que isso não cabe no app atual

- O certificado digital **nunca pode ficar no navegador** — ele
  precisa ficar guardado com segurança num servidor, criptografado,
  nunca exposto no código que roda no seu computador
- A comunicação com a SEFAZ usa um protocolo (SOAP + TLS mútuo com o
  certificado) que só dá pra fazer server-side, nunca direto do
  navegador
- Isso exige uma Netlify Function nova (parecida com a do Blobs, só
  que bem mais complexa), rodando Node.js com bibliotecas específicas
  pra esse protocolo

## Sobre a sensibilidade do certificado

Isso merece atenção redobrada, então quero ser bem claro:

- O certificado A1 é um arquivo (.pfx) protegido por senha — quem
  tiver o arquivo **e** a senha pode assinar documentos fiscais e
  contratos em nome da empresa
- Ele precisa ficar **criptografado em repouso** no servidor, nunca em
  texto puro, nunca em log, nunca em lugar acessível por qualquer um
  que tenha acesso ao código
- Certificados A1 têm validade (normalmente 1 ano) e precisam ser
  renovados/trocados manualmente
- Se for certificado A3 (em token/cartão físico), a automação fica
  **bem mais limitada** — geralmente esse tipo não dá pra automatizar
  remotamente, só o A1 (arquivo) permite rodar num servidor sem
  intervenção humana

## O que precisaria, na prática

1. **Um backend de verdade** — isso é literalmente a Fase 2/3 que te
   propus antes (Netlify DB + login real), porque não dá pra guardar
   um certificado desse jeito só com o Blobs simples que temos hoje
2. **Upload seguro do certificado** — uma tela onde você sobe o
   arquivo .pfx e a senha, guardados criptografados
3. **A function de consulta** — que bate no webservice da SEFAZ
   periodicamente (ex: uma vez por dia) buscando notas novas
4. **O parser de XML** — que lê a nota e sugere os produtos pra você
   revisar e confirmar antes de entrar no sistema (recomendo sempre
   ter uma etapa de confirmação manual, pelo menos no início — nota
   fiscal tem nomenclatura de produto diferente da que você usa no
   dia a dia, então um "de-para" ajuda)
5. **Ambiente de homologação primeiro** — a SEFAZ tem um ambiente de
   testes separado do de produção; vale testar lá antes de mexer com
   notas reais

## Como eu sugiro seguirmos, se quiser continuar

Dado o tamanho, eu dividiria assim:

- **Passo 1:** Migrar pra um backend de verdade (retomar a Fase 1/2
  que conversamos — login real + banco de dados), porque isso é
  pré-requisito de segurança pro certificado, não dá pra pular
- **Passo 2:** Function de consulta simples, só testando a conexão
  com a SEFAZ em homologação (sem certificado real ainda, só validando
  a estrutura)
- **Passo 3:** Upload seguro do certificado real + primeira consulta
  de verdade num ambiente de produção
- **Passo 4:** O parser de XML + a tela de revisão/confirmação de
  produtos antes de entrar no sistema

Isso é semanas de trabalho, não um "próximo passo" rápido como os que
fizemos até agora — por isso queria alinhar com você antes de começar
qualquer coisa.

## Antes de decidir, vale considerar

Existem serviços prontos no mercado (ex: NFe.io, Focus NFe, entre
outros) que já fazem essa captura de notas via certificado, com
interface pronta e suporte — e alguns têm planos de baixo custo pra
pequenas empresas. Pode valer a pena comparar o esforço de construir
isso do zero com o de só assinar um desses serviços e integrar a
saída dele (que geralmente já vem em JSON, bem mais simples de
processar) com o seu app. Posso pesquisar opções atuais se quiser.
