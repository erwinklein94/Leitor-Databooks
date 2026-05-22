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
6. Use a aba **Classificação** para ver os lotes OK, parciais e ruins.
7. Use a aba **Leitura lado a lado** para conferir exatamente o que o leitor conseguiu capturar do PDF e da planilha.
8. Exporte o resultado em CSV ou JSON, se necessário.

## Aba Leitura lado a lado

A aba mostra, para cada lote do Data Book:

- lote e projeto;
- tipo de dormente lido no PDF e na planilha;
- data de produção/fabricação;
- compressão axial em todos os dias capturados pelo leitor;
- tempo de cura;
- temperatura máxima encontrada;
- maior variação por hora calculada a partir das leituras do PDF;
- maior variação na mesma leitura de temperatura, comparando início/meio/fim quando houver;
- tração na flexão em todos os dias capturados pelo leitor;
- percentual de acerto da leitura contra a planilha.

O percentual da aba de leitura considera lote, tipo, data, tempo de cura, compressão axial e tração na flexão. Temperatura entra no percentual quando houver valor nas duas fontes. Quando só o PDF possui temperatura, ela é exibida como informação de auditoria, sem penalizar automaticamente o percentual.

## Como publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Envie estes arquivos mantendo a estrutura:

```text
index.html
assets/app.js
assets/styles.css
README.md
.nojekyll
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

A versão compara os principais pontos operacionais:

- lote;
- projeto;
- tipo de dormente de forma compatível;
- data de produção/fabricação;
- lote de ombreiras/chumbadores;
- transferência da protensão/desprotensão, quando legível;
- tempo de cura;
- temperatura máxima e variações calculadas, quando legíveis;
- compressão axial aos 7, 14 e 28 dias;
- tração na flexão aos 14 e 28 dias;
- status A/R detectado no PDF;
- status e motivo/observação da planilha.

## Classificação

A comparação usa o Data Book como base da auditoria:

- lotes que aparecem **apenas na planilha** são ignorados, pois podem pertencer a outro Data Book;
- lotes que aparecem **no Data Book e não aparecem na planilha** são classificados como **RUIM**.

Regras de status:

- **OK**: campos comparados bateram dentro da tolerância.
- **PARCIAL**: o lote foi encontrado nas duas fontes, mas existe divergência, aviso ou campo ausente.
- **RUIM**: lote do Data Book não encontrado na planilha, muitas divergências ou divergência crítica forte.

A tolerância numérica padrão é `0,05`, mas pode ser ajustada na tela. Para tempo de cura, a tolerância operacional usada na comparação é de `0,5 hora`.

## Limitações conhecidas

- PDFs escaneados sem texto selecionável não serão lidos corretamente. Eles precisam passar por OCR antes.
- A leitura do PDF depende da organização textual extraída pelo navegador. O detalhe por lote mostra o texto bruto extraído para auditoria.
- A ferramenta não substitui a aprovação formal da qualidade. Ela acelera a triagem e mostra onde revisar.
- Quando a planilha contém mais leituras do que o PDF mostra, a ferramenta aceita os valores do PDF como compatíveis se eles aparecerem na planilha, mas informa essa situação no detalhe.

## Estrutura técnica

- `index.html`: interface principal.
- `assets/styles.css`: estilo visual responsivo.
- `assets/app.js`: leitura de PDFs, leitura de XLSX, normalização, comparação, classificação, aba lado a lado e exportação.

## Aparência visual

Esta versão usa o mesmo padrão visual do Hub de Qualidade: tema escuro/claro, cartão principal com marca Rumo, gradientes em azul institucional, botão amarelo de ação e link de retorno para a página principal.


## Regra de temperatura

A temperatura não é comparada com a planilha, pois a planilha pode não conter esse dado. O site valida a temperatura diretamente pelo Data Book:

- temperatura máxima do lote deve ser menor ou igual a 60 ºC;
- variação máxima normalizada por hora deve ser menor ou igual a 20 ºC/h.

Esses limites aparecem na aba **Leitura lado a lado** e também entram como validação do lote quando o Data Book traz leituras de temperatura.
