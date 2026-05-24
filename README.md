# Cruzamento Databook × Planilha — DM de Concreto

Site estático que cruza o **databook de produção (PDF) da Cavan** com a **planilha de controle de qualidade (XLSX) da Rumo**, lote a lote, e aponta o que está **conforme**, **parcial** ou **não conforme**, com o percentual de aderência de cada lote.

Tudo roda **no navegador** — nenhum arquivo é enviado a servidores. Funciona direto no GitHub Pages.

## Arquivos

- `index.html` — estrutura da página (HTML)
- `styles.css` — aparência (CSS)
- `app.js` — lógica: leitura do PDF (PDF.js), leitura do XLSX (SheetJS), cruzamento e telas
- `README.md` — este guia

## Como publicar no GitHub Pages

1. Crie um repositório no GitHub (ex.: `cruzamento-databook`).
2. Suba os arquivos `index.html`, `styles.css` e `app.js` na raiz do repositório (mantendo os três juntos).
3. No GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
4. Em **Branch**, escolha `main` e a pasta `/ (root)`. Salve.
5. Em ~1 minuto o site fica disponível em `https://SEU-USUARIO.github.io/cruzamento-databook/`.

> Pode também colocar dentro de um projeto existente, como uma subpasta (ex.: `Projeto-Hub-Qualidade/cruzamento/`), igual aos outros painéis do hub.

## Como usar

1. Escolha o **projeto** (FMT, Ferronorte, Malha Paulista mista/larga).
2. Suba o **databook (PDF)** da Cavan e a **planilha (XLSX)** da Rumo do mesmo período.
3. Clique em **Cruzar dados**.

### Abas

- **Dashboard** — totais (conformes / parciais / não conformes / sem registro), aderência média e panorama por lote.
- **Comparação lado a lado** — para cada lote, PDF × Planilha em: tipo, data de produção, compressão axial (todos os dias), tração na flexão e cura/temperatura (temperatura máxima e variação máxima por hora, extraídas do PDF). Ao final, o **% de aderência** do lote.
- **Lotes** — tabela com status, aderência e atalho para a comparação.

## Regras de cruzamento

- A chave de match é o **número do lote** (o site ignora o zero à esquerda; PDF `02349` = planilha `2349`).
- Lote que está **na planilha mas não no PDF** → **ignorado** (não é erro), pois a planilha contém todos os projetos.
- Lote que está **no PDF mas não na planilha** → **sinalizado como erro** ("Sem registro na planilha").
- O **% de aderência** considera só os campos presentes nas **duas** fontes (compressão, tração, desprotensão↔0,6 dias e data de produção). Temperatura e tempo de cura aparecem como referência e **não** entram no cálculo, porque a planilha registra poucos pontos — assim não geram falso erro.

## Parâmetros ajustáveis

No topo do `app.js`, no objeto `CFG`:

| Campo | Padrão | O que faz |
|---|---|---|
| `TOL_COMP` | 0,1 MPa | tolerância da compressão axial / desprotensão |
| `TOL_TRAC` | 0,05 MPa | tolerância da tração na flexão |
| `TOL_TEMP` | 0,5 °C | tolerância de temperatura |
| `OK_MIN` | 100 | % mínimo para classificar como **Conforme** |
| `WARN_MIN` | 60 | % mínimo para **Parcial** (abaixo disso, **Não conforme**) |

## Projetos suportados pelo leitor de PDF

- **FMT — bitola larga** (1º dia de cura tipicamente "0,6 dias")
- **Ferronorte — bitola larga** (tipo "Bitola larga"; desprotensão variável, incluindo valores ≥ 1 dia como "1,6 dias"; tolera valores de resistência sem casa decimal, ex.: "81")
- **Malha Paulista — bitola mista** (tipo "Bitola mista"; 1º dia de cura varia por lote: 0,5 / 0,6 / 0,7 / 0,8 dias — o leitor reconhece qualquer fração e a casa com a desprotensão da planilha)
- **Malha Paulista — bitola larga** (tipo "Bitola larga"; mesmo formulário, 1º dia variável 0,5/0,6)

O leitor também tolera lotes em que a coluna "Fim" da tabela de temperatura está vazia.

### Como o site distingue FMT de Malha Paulista larga

Ambos são "bitola larga", então a separação não é pela bitola e sim pela combinação **projeto + tipo** na planilha: FMT tem projeto "FMT" (tipo "Bitola Larga FMT USP"); a Malha Paulista larga tem projeto "MALHA PAULISTA" com tipo iniciando em "Bitola Larga MP" (inclusive variações como "C.T reto", "C.T curvo", "TR-68", "UIC-60"). A diferença textual no tipo de dormente (ex.: "Bitola larga" no databook vs "Bitola Larga MP C.T reto" na planilha) é tratada como **compatível** e não conta como erro.

### Ferronorte — bitola larga (validado)

O databook do **Ferronorte** (DB 004/26 — Cavan Santa Lúcia, janeiro/2026, 14 lotes) foi lido e conferido lote a lote. O layout do "Certificado de Qualidade do Lote" é o mesmo formulário FQA 014.32, então o leitor reconhece os 14 certificados sem mudança de estrutura. Dois ajustes foram necessários para tratar variações que não apareciam no FMT:

1. **Tempo de desprotensão maior que 1 dia.** No FMT/MP a 1ª linha de cura era sempre uma fração (0,5 / 0,6 / 0,7 / 0,8 dias). O Ferronorte trouxe lotes com desprotensão em **"1,6 dias"** (lote 02482). O leitor agora trata como desprotensão **qualquer** linha "X dias" cujo X não seja exatamente 7, 14 ou 28 — frações ou valores ≥ 1 dia.
2. **Valor de resistência sem casa decimal.** Algumas células vinham como inteiro (ex.: compressão "81" em vez de "81,00", lote 02419). O leitor antes exigia vírgula decimal e desalinhava a linha; agora aceita inteiros e decimais na mesma captura.

Ambos os ajustes são generalizações: tudo que o FMT e a Malha Paulista já liam continua igual.

### Databooks Cavan Santa Lúcia — julho/agosto 2025 (validado)

Foram conferidos lote a lote mais três databooks no mesmo formulário FQA 014.32, somando **115 certificados** lidos sem nenhuma pendência:

- **DB 019/25 — FMT, julho/2025** (52 lotes, tipo "Bitola larga - FMT")
- **DB 020/25 — Malha Paulista, julho/2025** (13 lotes, tipo "Bitola larga")
- **DB 021/25 — FMT, agosto/2025** (50 lotes, tipo "Bitola larga - FMT"; inclui lote com desprotensão em "1,6 dias")

Um único ajuste foi necessário para tratá-los:

### Databooks Cavan Santa Lúcia — agosto/setembro 2025 (validado)

Mais três databooks no mesmo formulário FQA 014.32 foram conferidos lote a lote, somando **40 certificados** lidos sem nenhuma pendência:

- **DB 022/25 — Malha Paulista, agosto/2025** (10 lotes, tipo "Bitola larga")
- **DB 023/25 — Ferronorte, agosto/2025** (18 lotes, tipo "Bitola larga"; cliente "RUMO - FERRONORTE")
- **DB 024/25 — Malha Paulista BL, setembro/2025** (12 lotes, tipo "Bitola larga")

### Databooks Cavan Santa Lúcia — setembro 2025, 2ª leva (validado, sem ajuste)

Mais três databooks foram conferidos lote a lote, somando **57 certificados** lidos sem nenhuma pendência — e desta vez **nenhum ajuste no leitor foi necessário**, pois as generalizações anteriores (3 casas decimais e desprotensão de 1 a 3 corpos de prova) já cobriam todas as variações:

- **DB 025/25 — Ferronorte, setembro/2025** (26 lotes, tipo "Bitola larga"; desprotensão de 1 corpo, como o DB 023)
- **DB 026/25 — FMT, setembro/2025** (24 lotes, tipo "Bitola larga - FMT")
- **DB 027/25 — Malha Paulista BM, setembro/2025** (7 lotes, tipo **"Bitola mista"**; já reconhecido pelo leitor, casado com `MP_MISTA` na planilha)

Com isso, o leitor está validado lote a lote em **9 databooks / 212 certificados** (FMT jul/ago/set, Malha Paulista larga jul/ago/set, Malha Paulista mista set e Ferronorte ago/set), todos no formulário FQA 014.32, sem nenhuma pendência de leitura.

### Databooks Cavan Santa Lúcia — outubro/novembro 2025 (validado; novo projeto Contratrilho)

Mais três databooks foram conferidos lote a lote, somando **81 certificados** lidos sem nenhuma pendência. O leitor de PDF **não precisou de ajuste** — as generalizações anteriores já cobriam tudo:

- **DB 028/25 — Mista, outubro/2025** (39 lotes, tipo "Bitola mista")
- **DB 029/25 — Ferronorte, outubro/2025** (25 lotes, tipo "Bitola larga"; desprotensão de 1 corpo)
- **DB 030/25 — Contratrilho BL, outubro–novembro/2025** (17 lotes, tipo "Bitola larga"; desprotensão de 2 corpos, valores em 3 casas decimais; referência "≥ 30,0 MPa")

O DB 030 trouxe um **projeto novo**: o **Contratrilho** (dormente de bitola larga para trecho de contratrilho). No certificado, o tipo é apenas "Bitola larga" e a leitura dos ensaios é idêntica aos demais. Como é um projeto próprio, foram adicionados:

- uma opção **"Contratrilho — bitola larga"** no seletor (`index.html`), com a chave `CONTRATILHO`;
- o reconhecimento no `normProject` (`app.js`), tolerando as grafias **"CONTRATRILHO", "CONTRATILHO"** e **"CONTRA TRILHO"** que a planilha possa usar (a grafia exata da coluna *Projeto* da Rumo para esse contrato ainda não foi confirmada — quando você enviar uma planilha de Contratrilho, conferimos e ajustamos se preciso).

Resumo geral: leitor validado em **12 databooks / 293 certificados**, cobrindo FMT, Malha Paulista (larga e mista), Ferronorte e Contratrilho.

### Databooks Cavan Santa Lúcia — out/nov a jan (validado, sem ajuste)

Mais quatro databooks foram conferidos lote a lote, somando **63 certificados** lidos sem nenhuma pendência. O leitor **não precisou de ajuste** (tipos e formatos já cobertos):

- **DB 031/25 — Malha Paulista bitola larga, out–nov/2025** (17 lotes, tipo "Bitola larga")
- **DB 033/25 — Ferronorte, dezembro/2025** (15 lotes, tipo "Bitola larga"; desprotensão de 1 corpo)
- **DB 034/25 — Mista, dezembro/2025** (28 lotes, tipo "Bitola mista")
- **DB 035/25 — Mista, janeiro** (3 lotes, tipo "Bitola mista"; lotes de 4 dígitos sem zero à esquerda, ex.: "1379" — o cruzamento já normaliza isso)

Duas observações de **origem** (não são erro de leitura): o DB 035 traz lotes numerados sem o zero à esquerda — o cruzamento usa o número sem zeros à esquerda, então casa normalmente com a planilha. E o DB 031 (MP larga) repete os mesmos lotes/valores do DB 030 (Contratrilho); o leitor lê os dois fielmente, mas vale conferir na origem se há sobreposição ou rotulagem trocada entre esses arquivos.

Resumo geral atualizado: leitor validado em **16 databooks / 356 certificados**, cobrindo FMT, Malha Paulista (larga e mista), Ferronorte e Contratrilho.

## Sobre outros projetos

A leitura da planilha é genérica (vale para todos os projetos). A leitura do **PDF** foi calibrada no FMT e validada também no Ferronorte e na Malha Paulista. Quando você tiver um databook de um projeto novo, basta enviá-lo: se o layout do "Certificado de Qualidade do Lote" for diferente, ajustamos o leitor para reconhecê-lo. O ideal é validar um projeto de cada vez.

---

Processamento 100% local • Rumo · Engenharia de Qualidade
