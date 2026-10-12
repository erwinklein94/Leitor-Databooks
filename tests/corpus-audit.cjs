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
  const expected2023=[4,12,79,27,35,82,18,11,20,27,180,44];
  const selected=process.argv[3]?.endsWith('.pdf')?process.argv[3]:null;
  const discovery=process.argv.includes('--discovery');
  const year2023=process.argv.includes('--year-2023');
  const seen=[];
  for (const fileName of fs.readdirSync(folder).filter(name=>name.endsWith('.pdf')&&(!selected||name===selected)).sort()){
    seen.push(fileName);
    const bytes=fs.readFileSync(path.join(folder,fileName));
    context.fixture={arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
    const result=await vm.runInContext('parsePDF(fixture)',context);
    context.result=result;
    const rows=vm.runInContext(`extractWorkbookRows(result,${JSON.stringify(fileName)})`,context);
    const cover=Array.from(vm.runInContext('coverLotIds(result.pages)',context));
    const outside=Array.from(vm.runInContext(`(()=>{const listed=new Set(coverLotIds(result.pages));return result.lots.filter(lot=>{const key=lotIdentity(lot);return key?.year&&!listed.has(key.base+'/'+key.year)}).map(lot=>lot.lote)})()`,context));
    const index=Number(fileName.slice(0,2));
    if (!discovery) assert.equal(result.lots.length,(year2023?expected2023:expectedLots)[index],`${fileName}: quantidade de lotes`);
    assert.equal(rows['Parte 2'].length,result.lots.length,`${fileName}: uma linha por lote`);
    assert.equal(rows['Parte 1'].length,1,`${fileName}: resumo`);
    if (!discovery&&!year2023&&index===0){
      const first=result.lots.find(lot=>lot.lote==='R0501/21');
      assert.equal(first.comp['14'][0],81.1);
      assert.equal(first.comp['28'][1],83.8);
    }
    if (!discovery&&!year2023&&index===6){
      const lot=result.lots.find(lot=>lot.lote==='00078');
      assert.equal(lot.comp['7'][0],65.35);
      assert.equal(lot.trac['28'][1],9.7);
    }
    if (!discovery&&!year2023&&index===10){
      const first=result.lots.find(lot=>lot.lote==='00124/22');
      assert.equal(first.comp['7'][0],60.17);
      assert.equal(first.comp['28'][1],75.9);
    }
    if (!discovery&&year2023&&index===0){
      const first=result.lots.find(lot=>lot.lote==='00211/23');
      assert.equal(first.quantidade,50);
      assert.equal(first.comp['7'][0],57.17);
      assert.equal(first.comp['28'][0],64.25);
    }
    if (!discovery&&year2023&&index===8){
      const lot=result.lots.find(lot=>lot.lote==='00452/23');
      assert.equal(lot.quantidade,96);
      assert.equal(lot.data,'04/10/2023');
      assert.equal(lot.comp['28'],undefined);
    }
    if (!discovery&&year2023&&index===11){
      assert.match(rows['Parte 1'][0][2],/datas dos lotes/);
    }
    const counts={pages:result.pages.length,blankPages:result.pages.filter(page=>!page.lines.length).length,lots:result.lots.length,
      part1:rows['Parte 1'][0].slice(0,4),part1Filled:rows['Parte 1'][0].filter(value=>value!==''&&value!=null).length,part3:rows['Parte 3'].length,
      cover:cover.length,outside:cover.length?outside:[],
      c7:result.lots.filter(l=>l.comp['7']?.length).length,
      c14:result.lots.filter(l=>l.comp['14']?.length).length,
      c28:result.lots.filter(l=>l.comp['28']?.length).length,
      flex28:result.lots.filter(l=>l.trac['28']?.length).length,
      dates:result.lots.filter(l=>l.data).length,
      quantities:result.lots.filter(l=>l.quantidade!=null).length,
      empty:result.lots.filter(l=>!l.comp['28']?.length).map(l=>`${l.lote}@${l.page}`),
      suspect:result.lots.filter(l=>Object.values(l.comp).flat().some(v=>typeof v==='number'&&(v<15||v>110)))
        .map(l=>`${l.lote}@${l.page}`)};
    console.log(fileName,JSON.stringify(counts));
    if (selected){
      console.log('LOT IDS',JSON.stringify(result.lots.map(lot=>lot.lote)));
      console.log('SAMPLE',JSON.stringify(result.lots.slice(0,2)));
      console.log('PART1 FIELDS',JSON.stringify(rows['Parte 1'][0].map((value,index)=>({index,value})).filter(field=>field.value!=='')));
    }
  }
  if (!selected) assert.equal(seen.length,12,'o conjunto de exemplo deve ter 12 PDFs numerados');
}
main().catch(error=>{console.error(error);process.exitCode=1});
