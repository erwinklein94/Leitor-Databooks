# Leitor de Data Books — DM de Concreto

Site estático para ler **um Data Book em PDF**, apresentar os dados extraídos e exportar um arquivo Excel com as abas **Parte 1**, **Parte 2** e **Parte 3**. Os cabeçalhos e a ordem das colunas correspondem à planilha *Controle de Data Books.xlsx* usada como referência.

O processamento ocorre no navegador. O PDF não é enviado a um servidor.

## Uso

1. Selecione ou arraste um Data Book em PDF.
2. Clique em **Extrair dados**.
3. Revise os valores mostrados nas três partes.
4. Clique em **Exportar Excel** e copie as linhas necessárias para a planilha oficial.

O site aceita somente PDF como entrada. A biblioteca XLSX é usada apenas para gerar o arquivo de saída.

## O que é extraído

- **Parte 1:** identificação do Data Book, dados da capa, medições encontradas nas páginas, resumo dos ensaios por lote e médias dos ensaios diários de cimento.
- **Parte 2:** uma linha por certificado de qualidade de lote reconhecido, com resistências, temperaturas e intervalo entre leituras.
- **Parte 3:** uma linha por ensaio diário de cimento reconhecido.

Campos sem evidência suficiente ficam vazios. PDFs digitalizados como imagem precisam de OCR antes do envio. Confira os dados extraídos antes de colá-los no controle oficial.

## Arquivos do site

- `index.html`: interface de envio, leitura e exportação.
- `app.js`: leitura do PDF e interação da página.
- `extraction.js`: extração para as três partes e geração do Excel.
- `export-schema.js`: cabeçalhos das três abas de referência.
- `styles.css`: aparência.

## Publicação

O site funciona como página estática. Publique os arquivos HTML, CSS, JS e a pasta `assets` juntos no GitHub Pages ou em outro servidor estático. PDF.js e SheetJS são carregados por CDN, portanto o navegador precisa de acesso à internet para inicializar as bibliotecas.

## Verificação

`tests/extraction.test.cjs` valida os cabeçalhos, a organização das linhas e a montagem das três abas de saída. `tests/pdf-flow.test.cjs` valida a leitura de um PDF gerado no teste; com `DATABOOK_TEST_PDF` apontando para um Data Book local, também verifica um exemplo real.
