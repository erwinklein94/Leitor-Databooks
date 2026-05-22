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

## Sobre outros projetos (Ferronorte, Malha Paulista)

A leitura da planilha é genérica (vale para todos os projetos). A leitura do **PDF** foi calibrada no databook do **FMT**. Quando você tiver um databook de outro projeto, basta enviá-lo: se o layout do "Certificado de Qualidade do Lote" for diferente, ajustamos o leitor para reconhecê-lo. O ideal é validar um projeto de cada vez.

---

Processamento 100% local • Rumo · Engenharia de Qualidade
