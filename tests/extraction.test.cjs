const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.equal((html.match(/type="file"/g)||[]).length,1);
assert.match(html,/<input[^>]+id="filePdf"[^>]+accept="\.pdf,application\/pdf"/);
assert.doesNotMatch(html,/fileXls|dropXls|projSel|Planilha de fabricação/);
const elements={};
const context = vm.createContext({
  document: { getElementById: id => (elements[id] ||= {innerHTML:'',addEventListener() {}}) },
  STATE: {},
  tempMetrics: readings => ({ max: Math.max(...readings.flatMap(r => [r.ini, r.meio, r.fim].filter(x => x != null))) })
});
for (const file of ['export-schema.js', 'extraction.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}
const run = code => vm.runInContext(code, context);
assert.deepEqual(Array.from(run('Object.values(EXPORT_HEADERS).map(headers => headers.length)')), [77, 19, 18]);
assert.equal(run('fieldValue(["Perda ao fogo (%) 3,4"], ["Perda ao fogo"])'), 3.4);
assert.equal(run('fieldValue(["Compressão do concreto: 3 ou 7 dias (MPa)"], ["Compressão do concreto: 3 ou 7 dias (MPa)"])'), '');

const pdf = {
  pages: [{ number: 1, lines: ['Certificado de cimento', 'Data: 12/10/2026', 'Perda ao fogo (%) 3,4', 'MgO (%) 2,1'] }],
  lots: [{ lote:'123', data:'12/10/2026', tipo:'Dormente', page:2,
    comp:{7:[31.1,32.2],14:[35.1,36.2],28:[41.3,42.4]},
    trac:{14:[5.1,5.2],28:[6.3,6.4]},
    temp:[{hhmm:'08:00',ini:25,meio:26,fim:27},{hhmm:'09:30',ini:30,meio:31,fim:32}]
  }]
};
context.fixture = pdf;
const extracted = run('extractWorkbookRows(fixture, "DB 123.pdf")');
assert.equal(extracted['Parte 1'][0].length, 77);
assert.equal(extracted['Parte 1'][0][71], 90);
assert.equal(extracted['Parte 2'][0].length, 19);
assert.equal(extracted['Parte 2'][0][8], 41.3);
assert.equal(extracted['Parte 2'][0][14], 32);
assert.equal(extracted['Parte 2'][0][17], 41.3);
assert.equal(extracted['Parte 3'][0][2], 3.4);
assert.equal(extracted['Parte 3'][0][3], 2.1);
assert.equal(extracted['Parte 3'][0][17], 'Dentro do limite');
context.STATE={pdf,extracted,activeLotIndex:null};
run('showLotView(null)');
assert.match(elements.lotExplorer.innerHTML,/Todos os lotes/);
assert.match(elements.lotExplorer.innerHTML,/data-lot-index="0"/);
assert.match(elements.lotExplorer.innerHTML,/Lote 123/);
assert.match(elements['panel-extract'].innerHTML,/Parte 1/);
run('showLotView(0)');
assert.match(elements.lotExplorer.innerHTML,/Leituras de temperatura/);
assert.match(elements.lotExplorer.innerHTML,/09:30/);
assert.doesNotMatch(elements['panel-extract'].innerHTML,/extract-table/);
assert.equal(context.STATE.activeLotIndex,0);
const saved={sheets:[]};
context.STATE={extracted,pdfFile:{name:'DB 123.pdf'}};
context.XLSX={
  utils:{
    book_new:()=>saved,
    aoa_to_sheet:rows=>({rows}),
    encode_col:index=>String.fromCharCode(65+index),
    book_append_sheet:(book,sheet,name)=>book.sheets.push({name,sheet})
  },
  writeFile:(book,name)=>{book.filename=name}
};
run('exportExtracted()');
assert.deepEqual(saved.sheets.map(item=>item.name), ['Parte 1','Parte 2','Parte 3']);
assert.equal(saved.sheets[0].sheet.rows[0].length,77);
assert.equal(saved.sheets[1].sheet.rows[1][1],'123');
assert.equal(saved.sheets[2].sheet.rows[0].length,18);
assert.match(saved.filename,/dados extraidos\.xlsx$/);
console.log('Extração: cabeçalhos, valores e tamanhos das três abas verificados.');
