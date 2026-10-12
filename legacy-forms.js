/* Formulários de Data Books com FQA 014.06, 014.07 e 014.09.
   O FQA 014.07 tem vários lotes por página e sete posições de ensaio:
   desprotensão, compressão/flexão aos 7, 14 e 28 dias. A posição na
   página distingue colunas ausentes; não deslocar os números para a esquerda. */

function formDate(value){
  const match=String(value||"").match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (!match) return null;
  const year=match[3].length===2?`20${match[3]}`:match[3];
  return `${match[1].padStart(2,"0")}/${match[2].padStart(2,"0")}/${year}`;
}
function formLotNumber(value){
  const match=String(value||"").match(/\b([A-Z]?\d{4,6}(?:[/-]\d{2,4})?)\b/i);
  return match ? match[1].toUpperCase().replace(/-/g,"/") : null;
}
function formType(text){
  return (String(text).match(/\bBitola\s+(?:Larga|Mista|M[eé]trica|Estreita)\b/i)||[])[0]||null;
}
function formRecord(lote,page,source){
  return {lote,tipo:null,data:null,comp:{},trac:{},temp:[],page,source};
}
function parseProductionForm(lines,page){
  const text=lines.join("\n");
  if (!/CONTROLE DE QUALIDADE DE PRODU[ÇC][ÃA]O/i.test(text) || !/CORTE DE FIOS DE PROTENS[ÃA]O/i.test(text)) return null;
  const lotLine=lines.find(line=>/^\s*Lote\s*[:.]?\s*[A-Z]?\d{4,6}[/-]\d{2,4}\b/i.test(line));
  const lote=lotLine&&formLotNumber(lotLine);
  if (!lote) return null;
  const record=formRecord(lote,page,"production");
  record.tipo=formType(text);
  const dateLine=lines.find(line=>/Data de prepara[çc][ãa]o|Data de prepara[çc][ãa]o dos moldes/i.test(line));
  record.data=formDate(dateLine);
  return record;
}
function parseInspectionForm(lines,page){
  const text=lines.join("\n");
  if (!/INSPE[ÇC][ÕO]ES?\s+(?:E\s+)?(?:DE\s+)?QUALIDADE|INSPE[ÇC][ÕO]ES?\s+DE\s+DORMENTES/i.test(text)) return null;
  const lotLine=lines.find(line=>/^\s*Lote.{0,20}Pista/i.test(line));
  const lote=lotLine&&formLotNumber(lotLine.replace(/^.*?Pista\s*[:.]?/i,""));
  if (!lote) return null;
  const record=formRecord(lote,page,"inspection");
  record.tipo=formType(text);
  const dateLine=lines.find(line=>/Data concretagem/i.test(line));
  record.data=formDate(dateLine);
  return record;
}
function formMeasurement(str){
  const clean=String(str||"").trim();
  if (!/^>?\s*\d{1,3}(?:[.,]\d{1,3})?$/.test(clean)) return null;
  return clean.startsWith(">") ? clean.replace(/\s+/g,"").replace(".",",") : Number(clean.replace(",","."));
}
function parseConcreteForm(items,page){
  const text=items.map(item=>item.str).join(" ");
  if (!/CONTROLE TECNOL[ÓO]GICO DO CONCRETO/i.test(text) || !/RASTREABILIDADE/i.test(text)) return [];
  const compHeaders=items.filter(item=>/Comp\.\s*Axial/i.test(item.str)).sort((a,b)=>a.x-b.x);
  const flexHeaders=items.filter(item=>/Tra[çc][ãa]o\s+Flex[ãa]o/i.test(item.str)).sort((a,b)=>a.x-b.x);
  let centers;
  if (compHeaders.length>=3 && flexHeaders.length>=3){
    const first=compHeaders[0].x;
    const offset=first<450?30:13;
    centers=[first-(first<450?46:33)];
    for (let i=0;i<3;i++) centers.push(compHeaders[i].x+offset,flexHeaders[i].x+offset);
  } else {
    // Alguns FQA 014.07 omitem os rótulos Comp. Axial / Tração Flexão.
    // Os três cabeçalhos de idade mantêm as sete colunas nas mesmas posições.
    const days=[7,14,28].map(day=>items.find(item=>new RegExp(`^0?${day}\\s+DIAS\\s*\\(MPa\\)`,'i').test(item.str)));
    if (days.some(day=>!day)) return [];
    centers=[days[0].x-57];
    for (const day of days) centers.push(day.x-14,day.x+39);
  }
  const lotItems=items.filter(item=>item.x<110 && /^(?:[A-Z]?\d{4,6}(?:[/-]\d{2,4})?)$/i.test(item.str.trim()))
    .sort((a,b)=>b.y-a.y);
  const records=[];
  for (const anchor of lotItems){
    const lote=formLotNumber(anchor.str);
    if (!lote) continue;
    const record=formRecord(lote,page,"concrete");
    const nearby=items.filter(item=>item.y<anchor.y-2 && item.y>anchor.y-17);
    const productionDate=nearby.find(item=>item.x>120 && item.x<330 && formDate(item.str));
    record.data=productionDate?formDate(productionDate.str):null;
    const rows=[];
    for (const item of nearby.filter(item=>item.x>centers[0]-20 && formMeasurement(item.str)!==null).sort((a,b)=>b.y-a.y)){
      let row=rows.find(row=>Math.abs(row.y-item.y)<2);
      if (!row){row={y:item.y,items:[]};rows.push(row);}
      row.items.push(item);
    }
    const measurements=rows.filter(row=>row.items.length>=3).slice(0,2);
    if (!measurements.length) continue;
    const paired=measurements.map(row=>{
      const cells=Array(7).fill("");
      for (const item of row.items){
        const distances=centers.map(center=>Math.abs(center-item.x));
        const slot=distances.indexOf(Math.min(...distances));
        if (distances[slot]<=19) cells[slot]=formMeasurement(item.str);
      }
      return cells;
    });
    const at=slot=>paired.map(row=>row[slot]);
    const set=(target,age,slot)=>{const values=at(slot);if(values.some(value=>value!=="")) target[age]=values;};
    set(record.comp,"frac",0);
    set(record.comp,"7",1);set(record.trac,"7",2);
    set(record.comp,"14",3);set(record.trac,"14",4);
    set(record.comp,"28",5);set(record.trac,"28",6);
    records.push(record);
  }
  return records;
}
