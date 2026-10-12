# Leitor de Data Books — DM de Concreto

Site estático para ler **um Data Book em PDF**, apresentar os dados extraídos e exportar um arquivo Excel com as abas **Parte 1**, **Parte 2** e **Parte 3**. Os cabeçalhos e a ordem das colunas correspondem à planilha *Controle de Data Books.xlsx* usada como referência.

O processamento ocorre no navegador. O PDF não é enviado a um servidor.

A interface usa apenas preto, branco e cinza, com espaçamento compacto para mostrar mais informações na mesma tela. É possível alternar entre os temas claro e escuro.

## Uso

1. Selecione ou arraste um Data Book em PDF.
2. Clique em **Extrair dados**.
3. Na lista **Lotes encontrados**, escolha **Todos os lotes** para ver um lote por linha ou selecione um lote para consultar separadamente os dados e as leituras de temperatura.
4. Revise os valores mostrados nas três partes. As Partes 1 e 3 contêm informações gerais do Data Book; a Parte 2 contém uma linha por lote.
5. Clique em **Exportar Excel · todos os lotes** e copie as linhas necessárias para a planilha oficial.

O site aceita somente PDF como entrada. A biblioteca XLSX é usada apenas para gerar o arquivo de saída.

## O que é extraído

- **Parte 1:** identificação do Data Book, dados da capa, análises de areia e brita presentes nos formulários do compilado, resumo dos ensaios por lote e médias dos ensaios diários de cimento. Quando há mais de uma amostra distinta de agregado, os valores aparecem na mesma célula, separados por ponto e vírgula.
- **Parte 2:** uma linha por lote reconhecido, com resistências, temperaturas e intervalo entre leituras. O leitor reconhece certificados de qualidade de lote e os formulários FQA 014.06, 014.07 e 014.09 do conjunto de exemplos de 2021 e 2022. No FQA 014.07, os resultados são associados às colunas pela posição na página, inclusive quando não há rótulos individuais de compressão e flexão.
- **Parte 3:** uma linha por ensaio diário de cimento reconhecido.

Campos sem evidência suficiente ficam vazios. Nos exemplos de 2021 e 2022, não foram encontrados registros de curva térmica nem a tabela diária de cimento exigida pela Parte 3; esses campos permanecem vazios. Valores impressos como `>75,0` são preservados como texto, sem tratá-los como medição exata. O site avisa sobre lotes sem resultado de 28 dias, números de compressão atípicos e anos da capa diferentes das datas dos lotes; confira esses pontos no PDF antes de colá-los no controle oficial. PDFs digitalizados como imagem precisam de OCR antes do envio.

## Arquivos do site

- `index.html`: interface de envio, leitura e exportação.
- `app.js`: leitura do PDF e interação da página.
- `legacy-forms.js`: leitura dos formulários de produção, rastreabilidade do concreto e inspeção encontrados no conjunto de exemplo.
- `extraction.js`: extração para as três partes e geração do Excel.
- `export-schema.js`: cabeçalhos das três abas de referência.
- `styles.css`: aparência.

## Publicação

O site funciona como página estática. Publique os arquivos HTML, CSS e JS juntos no GitHub Pages ou em outro servidor estático. PDF.js e SheetJS são carregados por CDN, portanto o navegador precisa de acesso à internet para inicializar as bibliotecas.

## Verificação

`tests/extraction.test.cjs` valida os cabeçalhos, a organização das linhas e a montagem das três abas de saída. `tests/legacy-forms.test.cjs` valida o mapeamento dos campos dos formulários. `tests/pdf-flow.test.cjs` valida a leitura de um PDF gerado no teste; com `DATABOOK_TEST_PDF` apontando para um Data Book local, também verifica um exemplo real. `tests/corpus-audit.cjs <pasta>` lê os 12 PDFs do compilado, nomeados de `00.pdf` a `11.pdf` na ordem do ZIP, e confere a quantidade de lotes e valores amostrados sem incluir os documentos no repositório.
