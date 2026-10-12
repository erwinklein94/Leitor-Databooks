/* Extração para as três abas do Controle de Data Books.
   Células sem evidência inequívoca no PDF ficam vazias. */

function plain(value){
  return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}
function safeCell(value){
  if (value==null) return "";
  return String(value).replace(/[\u0000-\u001f]/g," ").replace(/\s+/g," ").trim();
}
function displayNumber(value){ return value==null?"":String(value).replace(".",","); }
function cellNumber(text){
  const match=String(text||"").match(/-?\d{1,5}(?:[.,]\d{1,4})?/);
  return match ? Number(match[0].replace(",",".")) : "";
}
function textAfterLabel(line,label){
  const tokens=[...line.matchAll(/[\p{L}\p{N}]+/gu)].map(match=>({
    value:plain(match[0]),end:match.index+match[0].length
  }));
  const sought=plain(label).split(" ").filter(Boolean);
  if (sought.length===0) return null;
  for (let start=0;start<=tokens.length-sought.length;start++){
    if (sought.every((word,offset)=>tokens[start+offset].value===word))
      return line.slice(tokens[start+sought.length-1].end).replace(/^\s*(?:\([^)]*\)\s*)?[:：=–-]?\s*/,"");
  }
  return null;
}
function fieldValue(lines, aliases, text=false){
  for (let i=0;i<lines.length;i++){
    const raw=safeCell(lines[i]);
    const tail=aliases.map(alias=>textAfterLabel(raw,alias)).find(value=>value!==null);
    if (tail==null || !tail.trim()) continue;
    if (text){
      return safeCell(tail).slice(0,180);
    }
    const value=cellNumber(tail);
    if (value!=="") return value;
  }
  return "";
}
function asRecord(headers, values){
  return headers.map((_,index)=>values[index]??"");
}
function maxIntervalMinutes(readings){
  let maximum=null, previous=null;
  for (const reading of readings){
    const parts=reading.hhmm.match(/^(\d{2}):(\d{2})$/);
    if (!parts) continue;
    let current=Number(parts[1])*60+Number(parts[2]);
    if (previous!=null){
      if (current<previous) current+=1440;
      const gap=current-previous;
      if (gap>0) maximum=Math.max(maximum||0,gap);
    }
    previous=current;
  }
  return maximum??"";
}
function minimum(values){
  const nums=(values||[]).filter(value=>Number.isFinite(value));
  return nums.length?Math.min(...nums):"";
}
function lotSummary(lots, picker){
  return lots.map(lot=>{
    const values=picker(lot).filter(value=>value!==""&&value!=null);
    return values.length?`${lot.lote||"?"}: ${values.map(displayNumber).join(" / ")}`:"";
  }).filter(Boolean).join("; ");
}
function relevantLines(pages, category){
  if (!category) return pages.flatMap(page=>page.lines);
  const aliases={
    "Agregado miúdo":["agregado miúdo","areia"],
    "Agregado graúdo":["agregado graúdo","brita"],
    "Aço":["aço","fio de protensão"],
    "Cimento":["cimento"],
    "Concreto":["concreto"],
    "Produção":["produção"],
    "Complementos":[]
  }[category]||[];
  if (!aliases.length) return pages.flatMap(page=>page.lines);
  return pages.filter(page=>aliases.some(alias=>plain(page.lines.slice(0,25).join(" ")).includes(plain(alias)))).flatMap(page=>page.lines);
}
function firstPageField(pages, aliases, text=false){
  for (const page of pages){
    const value=fieldValue(page.lines,aliases,text);
    if (value!=="") return value;
  }
  return "";
}
function averageField(rows,index){
  const values=rows.map(row=>row[index]).filter(value=>Number.isFinite(value));
  return values.length?Math.round(values.reduce((sum,value)=>sum+value,0)/values.length*100)/100:"";
}
function extractPart1(pdf, fileName,cementRows){
  const headers=EXPORT_HEADERS["Parte 1"];
  const row=Array(headers.length).fill("");
  row[0]=fileName.replace(/\.pdf$/i,"");
  row[1]=firstPageField(pdf.pages.slice(0,2),["Unidade industrial:","Fornecedor:","Unidade:","Fabricante:"],true);
  row[2]=firstPageField(pdf.pages.slice(0,2),["Período de produção:"],true) || [...new Set(pdf.lots.map(lot=>lot.data).filter(Boolean))].join("; ");
  row[3]=firstPageField(pdf.pages.slice(0,2),["Produto:"],true) || [...new Set(pdf.lots.map(lot=>lot.tipo).filter(Boolean))].join("; ");
  row[4]=lotSummary(pdf.lots,lot=>lot.temp.map(reading=>`${reading.hhmm} (${[reading.ini,reading.meio,reading.fim].map(displayNumber).join("/")})`));
  row[5]=firstPageField(pdf.pages,["Temperatura ambiente no início da concretagem","Temperatura ambiente:"],false);
  row[6]=firstPageField(pdf.pages,["Temperatura do concreto no início da concretagem","Temperatura do concreto:"],false);

  // Lê uma medição somente quando o rótulo aparece no texto da página.
  for (let index=7;index<headers.length;index++){
    if (index>=43 && index<=55) continue; // cimento vem da tabela diária, não de rótulos soltos
    const header=headers[index];
    const [first, ...rest]=header.split("\n");
    const category=(first.match(/^(?:[\d.]+[a-z]?|C\d+)\s*[•–-]\s*(.*)$/i)||[])[1]||"";
    const label=rest.join(" ").trim();
    if (!label) continue;
    const lines=relevantLines(pdf.pages,category);
    const text=/certificado|quantidades|refugos|compatibilidade|entrega|justificativa|plano de inspeção|água para preparação|propriedades físicas/i.test(label);
    row[index]=fieldValue(lines,[label,label.replace(/\s*\([^)]*\)\s*$/,"")],text);
  }
  const summaryFields={
    58:lotSummary(pdf.lots,lot=>lot.comp["7"]||[]),
    59:lotSummary(pdf.lots,lot=>lot.comp["14"]||[]),
    60:lotSummary(pdf.lots,lot=>lot.comp["28"]||[]),
    61:lotSummary(pdf.lots,lot=>lot.trac["14"]||[]),
    62:lotSummary(pdf.lots,lot=>lot.trac["28"]||[])
  };
  for (const [index,value] of Object.entries(summaryFields)) if (value!=="") row[Number(index)]=value;
  const gaps=pdf.lots.map(lot=>maxIntervalMinutes(lot.temp)).filter(value=>value!=="");
  if (gaps.length) row[71]=Math.max(...gaps);
  const cementColumns={43:2,44:4,45:5,46:3,49:6,50:13,51:14,52:15,53:16,55:10};
  for (const [target,source] of Object.entries(cementColumns)) row[Number(target)]=averageField(cementRows,source);
  const quantity=firstPageField(pdf.pages.slice(0,2),["Quantidade:"],true);
  if (quantity) row[69]=quantity;
  return asRecord(headers,row);
}
function extractPart2(pdf,fileName){
  return pdf.lots.map(lot=>{
    const c7=lot.comp["7"]||[], c14=lot.comp["14"]||[], c28=lot.comp["28"]||[];
    const f14=lot.trac["14"]||[], f28=lot.trac["28"]||[];
    const values=[fileName.replace(/\.pdf$/i,""),lot.lote||"",lot.data||"",lot.page,
      c7[0]??"",c7[1]??"",c14[0]??"",c14[1]??"",c28[0]??"",c28[1]??"",
      f14[0]??"",f14[1]??"",f28[0]??"",f28[1]??"",
      tempMetrics(lot.temp).max??"",maxIntervalMinutes(lot.temp),
      lot.temp.map(reading=>reading.hhmm).join("; "),minimum(c28),minimum(f28)];
    return asRecord(EXPORT_HEADERS["Parte 2"],values);
  });
}
function parseBrazilianNumber(value){
  if (/^\d{1,3}\.\d{3}$/.test(value)) return Number(value.replace(".",""));
  return Number(value.replace(",","."));
}
function cementTableRows(page,fileName){
  const heading=plain(page.lines.slice(0,12).join(" "));
  if (!heading.includes("blaine") || !heading.includes("mgo") || !heading.includes("so3")) return [];
  const rows=[];
  for (const line of page.lines){
    const match=line.match(/^\s*(\d{2}\/\d{2}\/\d{4})\s+(.+)$/);
    if (!match) continue;
    const measurements=(match[2].match(/-?\d+(?:[.,]\d+)?/g)||[]).slice(0,15).map(parseBrazilianNumber);
    if (measurements.length!==15) continue;
    const row=[fileName.replace(/\.pdf$/i,""),match[1],...measurements];
    row.push(measurements[0]<=6.5?"Dentro do limite":"Acima do limite");
    rows.push(asRecord(EXPORT_HEADERS["Parte 3"],row));
  }
  return rows;
}
function extractPart3(pdf,fileName){
  const aliases=[
    null,null,["Perda ao fogo"],["Óxido de magnésio","MgO"],["Trióxido de enxofre","SO3"],
    ["Resíduo insolúvel"],["Finura #200","Peneira 200"],["Finura #400","Peneira 400"],
    ["Blaine"],["Água de consistência","Consistência normal"],["Início de pega"],
    ["Fim de pega"],["Expansibilidade"],["Compressão 1 dia","Resistência 1 dia"],
    ["Compressão 3 dias","Resistência 3 dias"],["Compressão 7 dias","Resistência 7 dias"],
    ["Compressão 28 dias","Resistência 28 dias"]
  ];
  const rows=[];
  for (const page of pdf.pages){
    const tableRows=cementTableRows(page,fileName);
    if (tableRows.length){ rows.push(...tableRows); continue; }
    const pageText=plain(page.lines.join(" "));
    if (!/certificado de cimento|boletim de ensaio de cimento|boletim de ensaios de cimento/.test(pageText)) continue;
    const row=Array(EXPORT_HEADERS["Parte 3"].length).fill("");
    row[0]=fileName.replace(/\.pdf$/i,"");
    const dateLine=page.lines.find(line=>/\bdata\b|emissão|ensaio/i.test(line)&&/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(line));
    row[1]=(dateLine&&dateLine.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/)||[])[0]||"";
    for (let index=2;index<=16;index++) row[index]=fieldValue(page.lines,aliases[index]);
    const count=row.slice(2,17).filter(value=>value!=="").length;
    if (count<2) continue;
    row[17]=row[2]===""?"":(row[2]<=6.5?"Dentro do limite":"Acima do limite");
    rows.push(row);
  }
  return rows;
}
function extractWorkbookRows(pdf,fileName){
  const cementRows=extractPart3(pdf,fileName);
  return {
    "Parte 1":[extractPart1(pdf,fileName,cementRows)],
    "Parte 2":extractPart2(pdf,fileName),
    "Parte 3":cementRows
  };
}
function escapeExtracted(value){
  return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function renderExtracted(data){
  const sections=Object.entries(EXPORT_HEADERS).map(([name,headers])=>{
    const rows=data[name];
    const filled=rows.reduce((sum,row)=>sum+row.slice(1).filter(value=>value!==""&&value!=null).length,0);
    const body=rows.length?rows.map(row=>`<tr>${row.map(value=>`<td>${escapeExtracted(value)}</td>`).join("")}</tr>`).join("")
      :`<tr><td colspan="${headers.length}" class="extract-empty">Nenhum registro correspondente identificado no PDF.</td></tr>`;
    const id=`parte-${name.split(" ")[1]}`;
    return `<div class="section extract-section" id="${id}"><div class="section-h"><h3>${name}</h3><p>${headers.length} colunas · ${rows.length} registro(s) · ${filled} célula(s) preenchida(s)</p></div>
      <div class="section-b extract-scroll"><table class="extract-table"><thead><tr>${headers.map(header=>`<th>${escapeExtracted(header).replace(/\n/g,"<br>")}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div></div>`;
  }).join("");
  document.getElementById("panel-extract").innerHTML=`<nav class="extract-nav" aria-label="Ir para uma parte"><a href="#parte-1">Parte 1 · Resumo</a><a href="#parte-2">Parte 2 · Lotes</a><a href="#parte-3">Parte 3 · Cimento</a></nav><div class="notice info"><span class="ni">ℹ</span><div>Os cabeçalhos e a ordem das colunas reproduzem as abas Parte 1, Parte 2 e Parte 3. Na Parte 1, os números de cimento da tabela diária são médias. Células vazias indicam dados não identificados com segurança no PDF. Confira os valores antes de colá-los na planilha oficial.</div></div>${sections}`;
}
function exportExtracted(){
  if (!STATE.extracted) return;
  const wb=XLSX.utils.book_new();
  for (const [name,headers] of Object.entries(EXPORT_HEADERS)){
    const rows=[headers,...STATE.extracted[name]];
    const ws=XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"]=headers.map(header=>({wch:Math.min(42,Math.max(17,header.split("\n").pop().length+2))}));
    ws["!autofilter"]={ref:`A1:${XLSX.utils.encode_col(headers.length-1)}${Math.max(2,rows.length)}`};
    XLSX.utils.book_append_sheet(wb,ws,name);
  }
  const base=STATE.pdfFile.name.replace(/\.pdf$/i,"").replace(/[<>:"/\\|?*]/g,"_").slice(0,80);
  XLSX.writeFile(wb,`${base} - dados extraidos.xlsx`);
}
document.getElementById("exportBtn").addEventListener("click",exportExtracted);
document.getElementById("exportBtnBottom").addEventListener("click",exportExtracted);
