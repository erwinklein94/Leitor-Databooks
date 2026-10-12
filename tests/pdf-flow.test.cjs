const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {pathToFileURL}=require('node:url');

async function main(){
  const pdfjsLib = await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
  const {PDFDocument,StandardFonts}=require('pdf-lib');
  const root=path.resolve(__dirname,'..');
  const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const parser=source.slice(0,source.indexOf('/* Interface: somente PDF'));
  const context=vm.createContext({pdfjsLib});
  vm.runInContext(parser,context);
  pdfjsLib.GlobalWorkerOptions.workerSrc=pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  const pdf=await PDFDocument.create();
  const page=pdf.addPage([595,842]);
  const font=await pdf.embedFont(StandardFonts.Helvetica);
  const lines=['CERTIFICADO DE QUALIDADE DO LOTE','LOTE: 123','TIPO DE DORMENTE: DOR-ME',
    'DATA DE PRODUCAO: 12/10/2026','7 dias 30,10 31,20',
    '14 dias 35,10 36,20 5,10 5,20','28 dias 41,30 42,40 6,30 6,40'];
  lines.forEach((line,index)=>page.drawText(line,{x:50,y:780-index*24,size:12,font}));
  const bytes=await pdf.save();
  context.fixture={arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
  const parsed=await vm.runInContext('parsePDF(fixture)',context);
  assert.equal(parsed.pages.length,1);
  assert.equal(parsed.lots.length,1);
  assert.equal(parsed.lots[0].lote,'123');
  assert.equal(parsed.lots[0].comp['28'][0],41.3);
  console.log('PDF real de teste: lote e ensaios extraídos.');
  if (process.env.DATABOOK_TEST_PDF){
    const realBytes=fs.readFileSync(process.env.DATABOOK_TEST_PDF);
    context.fixture={arrayBuffer:async()=>Uint8Array.from(realBytes).buffer};
    const real=await vm.runInContext('parsePDF(fixture)',context);
    context.document={getElementById:()=>({addEventListener(){}})};
    for (const script of ['export-schema.js','extraction.js'])
      vm.runInContext(fs.readFileSync(path.join(root,script),'utf8'),context);
    context.real=real;
    const rows=vm.runInContext('extractWorkbookRows(real,"DB 034-26.pdf")',context);
    assert.ok(real.lots.length>=2);
    assert.equal(rows['Parte 2'].length,2);
    assert.equal(rows['Parte 2'][0][1],'03148');
    assert.equal(rows['Parte 2'][0][4],55.91);
    assert.equal(rows['Parte 3'].length,17);
    assert.equal(rows['Parte 3'][0][1],'02/07/2026');
    assert.equal(rows['Parte 3'][0][2],5.32);
    assert.equal(rows['Parte 3'][0][8],5960);
    assert.equal(rows['Parte 3'][2][17],'Acima do limite');
    assert.equal(rows['Parte 1'][0][43],6.26);
    console.log(`Databook real: ${real.lots.length} lotes, ${rows['Parte 3'].length} ensaios de cimento.`);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
