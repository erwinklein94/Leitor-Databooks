const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');

async function main(){
  const folder=process.argv[2];
  if (!folder) throw new Error('Informe a pasta dos PDFs de teste.');
  const pdfjsLib=await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
  const root=path.resolve(__dirname,'..');
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const context=vm.createContext({pdfjsLib});
  for (const script of ['legacy-forms.js']) vm.runInContext(fs.readFileSync(path.join(root,script),'utf8'),context);
  vm.runInContext(app.slice(0,app.indexOf('/* Interface: somente PDF')),context);
  pdfjsLib.GlobalWorkerOptions.workerSrc=pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  context.document={getElementById:()=>({addEventListener(){}})};
  for (const script of ['export-schema.js','extraction.js']) vm.runInContext(fs.readFileSync(path.join(root,script),'utf8'),context);
  const expectedLots=[12,48,84,24,12,12,24,30,30,18,32,32];
  const seen=[];
  for (const fileName of fs.readdirSync(folder).filter(name=>name.endsWith('.pdf')&&(!process.argv[3]||name===process.argv[3])).sort()){
    seen.push(fileName);
    const bytes=fs.readFileSync(path.join(folder,fileName));
    context.fixture={arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
    const result=await vm.runInContext('parsePDF(fixture)',context);
    context.result=result;
    const rows=vm.runInContext(`extractWorkbookRows(result,${JSON.stringify(fileName)})`,context);
    const index=Number(fileName.slice(0,2));
    assert.equal(result.lots.length,expectedLots[index],`${fileName}: quantidade de lotes`);
    assert.equal(rows['Parte 2'].length,result.lots.length,`${fileName}: uma linha por lote`);
    assert.equal(rows['Parte 1'].length,1,`${fileName}: resumo`);
    if (index===0){
      const first=result.lots.find(lot=>lot.lote==='R0501/21');
      assert.equal(first.comp['14'][0],81.1);
      assert.equal(first.comp['28'][1],83.8);
    }
    if (index===6){
      const lot=result.lots.find(lot=>lot.lote==='00078');
      assert.equal(lot.comp['7'][0],65.35);
      assert.equal(lot.trac['28'][1],9.7);
    }
    if (index===10){
      const first=result.lots.find(lot=>lot.lote==='00124/22');
      assert.equal(first.comp['7'][0],60.17);
      assert.equal(first.comp['28'][1],75.9);
    }
    const counts={pages:result.pages.length,lots:result.lots.length,
      part1:rows['Parte 1'][0].slice(0,4),part1Filled:rows['Parte 1'][0].filter(value=>value!==''&&value!=null).length,part3:rows['Parte 3'].length,
      c7:result.lots.filter(l=>l.comp['7']?.length).length,
      c14:result.lots.filter(l=>l.comp['14']?.length).length,
      c28:result.lots.filter(l=>l.comp['28']?.length).length,
      flex28:result.lots.filter(l=>l.trac['28']?.length).length,
      dates:result.lots.filter(l=>l.data).length,
      empty:result.lots.filter(l=>!l.comp['28']?.length).map(l=>`${l.lote}@${l.page}`),
      suspect:result.lots.filter(l=>Object.values(l.comp).flat().some(v=>typeof v==='number'&&(v<15||v>110)))
        .map(l=>`${l.lote}@${l.page}`)};
    console.log(fileName,JSON.stringify(counts));
    if (process.argv[3]) console.log('PART1 FIELDS',JSON.stringify(rows['Parte 1'][0].map((value,index)=>({index,value})).filter(field=>field.value!=='')));
  }
  if (!process.argv[3]) assert.equal(seen.length,12,'o conjunto de exemplo deve ter 12 PDFs numerados');
}
main().catch(error=>{console.error(error);process.exitCode=1});
