# Comparador Data Book CAVAN x Controle RUMO

Site estático para GitHub Pages que compara lotes de dormentes de concreto entre:

- Data Books CAVAN em PDF;
- planilha de controle de fabricação/qualidade da RUMO em XLSX.

O processamento acontece 100% no navegador. Nenhum arquivo é enviado para servidor.

## Como usar

1. Abra o site no navegador.
2. Selecione um ou mais Data Books em PDF.
3. Selecione a planilha XLSX de controle.
4. Escolha o projeto ou mantenha "Todos os projetos detectados".
5. Clique em **Comparar lotes**.
6. Use a tabela final para abrir o detalhe de cada lote.
7. Exporte o resultado em CSV ou JSON, se necessário.

## Como publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Envie estes arquivos mantendo a estrutura:

```text
index.html
assets/app.js
assets/styles.css
README.md
```

3. No GitHub, acesse **Settings > Pages**.
4. Em **Build and deployment**, selecione:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/root`
5. Salve e aguarde o GitHub publicar o link.

## Dependências externas

O site usa CDN para carregar:

- PDF.js, para ler PDFs no navegador;
- SheetJS/XLSX, para ler arquivos XLSX no navegador.

Se a empresa quiser rodar em ambiente sem internet, baixe essas duas bibliotecas e substitua os links CDN no `index.html` por arquivos locais em `assets/vendor/`.

## Projetos reconhecidos

O leitor tenta detectar automaticamente:

- FMT;
- FERRONORTE;
- MALHA PAULISTA - BITOLA MISTA;
- MALHA PAULISTA - BITOLA LARGA.

A detecção usa o nome do arquivo, o texto da capa do Data Book e o cabeçalho do certificado do lote.

## Campos comparados

A versão inicial compara os principais pontos operacionais:

- lote;
- projeto;
- tipo de dormente de forma compatível;
- data de produção/fabricação;
- lote de ombreiras/chumbadores;
- transferência da protensão/desprotensão, quando legível;
- compressão axial aos 7, 14 e 28 dias;
- tração na flexão aos 14 e 28 dias;
- status A/R detectado no PDF;
- status e motivo/observação da planilha.

## Classificação

- **OK**: campos comparados bateram dentro da tolerância.
- **PARCIAL**: o lote foi encontrado, mas existe divergência, aviso ou campo ausente.
- **RUIM**: lote não encontrado no PDF, muitas divergências ou divergência crítica forte.

A tolerância numérica padrão é `0,05`, mas pode ser ajustada na tela.

## Limitações conhecidas

- PDFs escaneados sem texto selecionável não serão lidos corretamente. Eles precisam passar por OCR antes.
- A leitura do PDF depende da organização textual extraída pelo navegador. O detalhe por lote mostra o texto bruto extraído para auditoria.
- A ferramenta não substitui a aprovação formal da qualidade. Ela acelera a triagem e mostra onde revisar.
- Quando a planilha contém mais leituras do que o PDF mostra, a ferramenta aceita os valores do PDF como compatíveis se eles aparecerem na planilha, mas informa essa situação no detalhe.

## Estrutura técnica

- `index.html`: interface principal.
- `assets/styles.css`: estilo visual responsivo.
- `assets/app.js`: leitura de PDFs, leitura de XLSX, normalização, comparação, classificação e exportação.

## Aparência visual

Esta versão usa o mesmo padrão visual do Hub de Qualidade: tema escuro/claro, cartão principal com marca Rumo, gradientes em azul institucional, botão amarelo de ação e link de retorno para a página principal.

