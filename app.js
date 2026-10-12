/* Leitor local de Data Books em PDF. A planilha XLSX é somente saída. */

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

/* ---------- Estado ---------- */
const STATE = { pdfFile:null, pdf:null, extracted:null, activeLotIndex:null, busy:false };

/* ===================================================================
   LEITURA DO PDF  →  lotes e linhas de todas as páginas
   =================================================================== */
async function parsePDF(file, statusCb){
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data:buf,verbosity:0}).promise;
  const lotRecords = [];
  const pages = [];
  try { for (let p=1; p<=pdf.numPages; p++){
    if (p%10===0 && statusCb) statusCb(`Lendo databook… página ${p}/${pdf.numPages}`);
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.map(it=>({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5]
    })).filter(it=>it.str.trim()!=="");
    const flat = items.map(i=>i.str).join(" ");
    const lines=pdfPageLines(items);
    pages.push({number:p, lines});
    const production=parseProductionForm(lines,p);
    if (production) lotRecords.push(production);
    const inspection=parseInspectionForm(lines,p);
    if (inspection) lotRecords.push(inspection);
    lotRecords.push(...parseConcreteForm(items,p));
    if (/CERTIFICADO DE QUALIDADE DO LOTE/i.test(flat)){
      const certificate=parseCertPage(items,p);
      certificate.source="certificate";
      lotRecords.push(certificate);
    }
  }} finally { await pdf.destroy(); }
  return {lots:uniqueLots(lotRecords), pages};
}

/* Um mesmo certificado pode aparecer mais de uma vez no PDF. Consolida as
   páginas repetidas sem misturar lotes diferentes. */
function uniqueLots(lots){
  const unique=[];
  const identity=lot=>{
    const match=String(lot.lote||"").match(/^([A-Z]?)(\d{3,6})(?:[/-](\d{2,4}))?$/i);
    if (!match) return null;
    const year=match[3] ? match[3].slice(-2) : (String(lot.data||"").match(/\/(\d{2,4})$/)||[])[1]?.slice(-2)||"";
    return {base:`${match[1].toUpperCase()}${Number(match[2])}`,year};
  };
  for (const lot of lots){
    const key=identity(lot);
    const original=key&&unique.find(other=>{
      const current=identity(other);
      return current&&current.base===key.base&&(!current.year||!key.year||current.year===key.year);
    });
    if (!original){unique.push(lot);continue;}
    if (!/[/-]\d{2,4}$/.test(original.lote||"") && /[/-]\d{2,4}$/.test(lot.lote||"")) original.lote=lot.lote;
    original.data ||= lot.data;
    original.tipo ||= lot.tipo;
    for (const age of Object.keys(lot.comp))
      if (!original.comp[age] || original.comp[age].filter(value=>value!=="").length<lot.comp[age].filter(value=>value!=="").length)
        original.comp[age]=lot.comp[age];
    for (const age of Object.keys(lot.trac))
      if (!original.trac[age] || original.trac[age].filter(value=>value!=="").length<lot.trac[age].filter(value=>value!=="").length)
        original.trac[age]=lot.trac[age];
    if (lot.temp.length>original.temp.length) original.temp=lot.temp;
    if (["certificate","concrete"].includes(lot.source) && !["certificate","concrete"].includes(original.source)){
      original.page=lot.page;
      original.source=lot.source;
    }
  }
  return unique;
}

function pdfPageLines(items){
  const rows=[];
  for (const item of [...items].sort((a,b)=>b.y-a.y||a.x-b.x)){
    const row=rows[rows.length-1];
    if (!row || Math.abs(row.y-item.y)>2.2) rows.push({y:item.y,items:[item]});
    else row.items.push(item);
  }
  return rows.map(row=>row.items.sort((a,b)=>a.x-b.x).map(item=>item.str).join(" ").replace(/\s+/g," ").trim());
}

/* Reconstrói linhas a partir das posições (y agrupado), depois extrai campos */
function parseCertPage(items, pageNum){
  // agrupa por linha (y), tolerância 2.2pt
  const rows = [];
  const sorted = [...items].sort((a,b)=> b.y-a.y || a.x-b.x);
  let cur=null, curY=null;
  for (const it of sorted){
    if (curY===null || Math.abs(it.y-curY)>2.2){
      cur = {y:it.y, items:[it]}; rows.push(cur); curY=it.y;
    } else { cur.items.push(it); curY=(curY+it.y)/2; }
  }
  const lineText = r => r.items.sort((a,b)=>a.x-b.x).map(i=>i.str).join(" ").replace(/\s+/g," ").trim();
  const lines = rows.map(lineText);
  const allText = lines.join("\n");

  const lote = (allText.match(/LOTE:\s*([0-9]{3,6})/i)||[])[1] || null;
  const tipo = (allText.match(/TIPO DE DORMENTE:\s*([^\n]+?)(?:\s+LOTE:|$)/i)||[])[1] || null;
  const data = (allText.match(/DATA DE PRODU[ÇC][ÃA]O:\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i)||[])[1] || null;

  // ----- Compressão axial e tração -----
  // A 1ª linha de cura é a DESPROTENSÃO (transferência da protensão). O tempo
  // varia por lote/projeto: FMT/MP usam frações 0,5/0,6/0,7/0,8; o Ferronorte
  // pode trazer valores >= 1 dia (ex.: "1,6 dias"). Tratamos como desprotensão
  // qualquer linha "X dias" cujo X NÃO seja exatamente 7, 14 ou 28.
  // Os valores das bobinas podem vir com vírgula decimal de 1 a 3 casas
  // (ex.: "75,99" no FMT antigo; "37,300" / "39,120" / "35,500" nos databooks
  // de jul/ago 2025 da Cavan Santa Lúcia) OU como inteiros (ex.: "81" no
  // Ferronorte). A captura aceita todas as formas: ponto OU vírgula como
  // separador e de 0 a 3 casas decimais. Atenção: limitar a captura a 2 casas
  // quebrava os databooks de 3 casas — "37,300" virava "37,30" + "0", zerando
  // a 2ª bobina e criando valores de tração fantasmas.
  const comp = {}, trac = {};
  let primeiroDia = null; // ex.: "0,5" ou "1,6" — guarda o tempo de desprotensão do lote
  for (const ln of lines){
    const m = ln.match(/^\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*dias\s+(.*)$/i);
    if (m){
      const diaNum = parseFloat(m[1].replace(",","."));
      const isFixo = (diaNum===7 || diaNum===14 || diaNum===28);
      const key = isFixo ? String(diaNum) : "frac"; // qualquer não-7/14/28 = desprotensão
      if (!isFixo) primeiroDia = m[1].replace(".",",");
      const nums = (m[2].match(/\d{1,3}(?:[.,]\d{1,3})?/g)||[]).map(x=>parseFloat(x.replace(",",".")));
      if (isFixo){
        // 7/14/28 dias: sempre 2 corpos de prova de compressão; tração (14/28)
        // vem nas 2 colunas seguintes, quando presente.
        if (nums.length>=2) comp[key]=[nums[0],nums[1]];
        if (nums.length>=4) trac[key]=[nums[2],nums[3]];
      } else {
        // DESPROTENSÃO: o nº de corpos de prova varia por projeto. FMT e Malha
        // Paulista rompem 2; o Ferronorte (DB 023/25, ago/2025) rompe só 1
        // (ex.: "0,6 dias 25,290"). A tração só começa aos 14 dias, então
        // todos os valores desta linha são compressão (1 a 3 corpos).
        if (nums.length>=1) comp[key]=nums.slice(0,3);
      }
    }
  }

  // ----- Temperatura: tabela à esquerda (x pequeno) -----
  // localizar faixa vertical entre "ACOMPANHAMENTO" e "DIMENSIONAIS"
  let yTop=null, yBot=null;
  for (const it of items){
    if (/ACOMPANHAMENTO/i.test(it.str)) yTop=it.y;
    if (/DIMENSIONAIS/i.test(it.str)) yBot=it.y;
  }
  const tempRows=[];
  if (yTop!==null && yBot!==null){
    // pega itens dentro da faixa e à esquerda (x < 245) -> só a tabela
    const reg = items.filter(it=> it.y < yTop && it.y > yBot && it.x < 245);
    // agrupa por linha
    const tr=[]; let c=null, cy=null;
    for (const it of [...reg].sort((a,b)=> b.y-a.y || a.x-b.x)){
      if (cy===null||Math.abs(it.y-cy)>3){ c={items:[it]}; tr.push(c); cy=it.y; }
      else { c.items.push(it); cy=(cy+it.y)/2; }
    }
    for (const row of tr){
      const s = row.items.sort((a,b)=>a.x-b.x).map(i=>i.str).join(" ");
      const hm = s.match(/(\d{2}):(\d{2})/);
      if (hm){
        const temps = (s.match(/\d{2,3},\d/g)||[]).map(x=>parseFloat(x.replace(",","."))).slice(0,3);
        if (temps.length>=1){   // aceita 1, 2 ou 3 leituras (alguma coluna pode estar vazia)
          tempRows.push({
            hhmm:`${hm[1]}:${hm[2]}`,
            h:parseInt(hm[1])+parseInt(hm[2])/60,
            ini: temps[0] ?? null, meio: temps[1] ?? null, fim: temps[2] ?? null
          });
        }
      }
    }
    tempRows.sort((a,b)=>a.h-b.h);
  }

  return { lote, tipo, data, comp, trac, temp:tempRows, page:pageNum, primeiroDia };
}

/* Métricas de temperatura derivadas do PDF */
function tempMetrics(tempRows){
  if (!tempRows || !tempRows.length) return {max:null, maxRatePerHour:null, n:0};
  let max=-Infinity;
  const flat=[];
  for (const r of tempRows){
    [r.ini,r.meio,r.fim].forEach(v=>{ if(v!=null){max=Math.max(max,v); flat.push({h:r.h,v});} });
  }
  // maior variação por hora entre leituras consecutivas (usando a média de cada horário)
  const series = tempRows.map(r=>{
    const vs=[r.ini,r.meio,r.fim].filter(v=>v!=null);
    return vs.length ? {h:r.h, v: vs.reduce((a,b)=>a+b,0)/vs.length} : null;
  }).filter(Boolean);
  let maxRate=0;
  for (let i=1;i<series.length;i++){
    const dh=series[i].h-series[i-1].h;
    if (dh>0){ const rate=Math.abs(series[i].v-series[i-1].v)/dh; maxRate=Math.max(maxRate,rate); }
  }
  return {max: max===-Infinity?null:max, maxRatePerHour: series.length>1?maxRate:null, n:tempRows.length};
}

/* Interface: somente PDF de entrada. */
const $ = selector => document.querySelector(selector);
const drop = $("#dropPdf");
const input = $("#filePdf");

function fileLabel(file){
  const mb=file.size/(1024*1024);
  return mb>=1?`${mb.toFixed(1).replace(".",",")} MB`:`${Math.max(1,Math.round(file.size/1024))} KB`;
}
function setStatus(message,busy=false,error=false){
  $("#statusTxt").textContent=message;
  $("#statusLine").classList.toggle("busy",busy);
  $("#statusLine").classList.toggle("error",error);
}
function clearResults(){
  STATE.pdf=null;
  STATE.extracted=null;
  STATE.activeLotIndex=null;
  $("#exportBtn").disabled=true;
  $("#results").hidden=true;
  $("#reviewNotice").hidden=true;
  $("#reviewNotice").textContent="";
  $("#lotExplorer").innerHTML="";
  $("#panel-extract").innerHTML="";
}
function reviewMessages(pdf,extracted){
  const notes=[];
  const withoutTests=pdf.lots.filter(lot=>!lot.comp["28"]?.length);
  if (withoutTests.length) notes.push(`${withoutTests.length} lote(s) sem resultado de compressão aos 28 dias no PDF: ${withoutTests.slice(0,8).map(lot=>lot.lote).join(", ")}${withoutTests.length>8?"…":""}.`);
  const atypical=pdf.lots.filter(lot=>Object.values(lot.comp).flat().some(value=>typeof value==="number"&&(value<15||value>110)));
  if (atypical.length) notes.push(`Valores de compressão atípicos no texto do PDF; confira os lotes ${atypical.map(lot=>lot.lote).join(", ")} na página indicada.`);
  const lotYears=new Set(pdf.lots.map(lot=>String(lot.data||"").match(/\/(20\d{2})$/)?.[1]).filter(Boolean));
  const coverYears=[...String(extracted["Parte 1"][0][2]).matchAll(/20\d{2}/g)].map(match=>match[0]);
  if (lotYears.size && coverYears.some(year=>!lotYears.has(year))) notes.push("O período impresso na capa contém um ano diferente das datas dos lotes. Confira a capa do PDF.");
  return notes;
}
function selectPdf(file){
  if (STATE.busy || !file) return;
  if (!/\.pdf$/i.test(file.name) && file.type!=="application/pdf"){
    setStatus("Selecione um arquivo PDF de Data Book.",false,true);
    return;
  }
  clearResults();
  STATE.pdfFile=file;
  drop.classList.add("has");
  $("#pdfName").textContent=file.name;
  $("#pdfSub").textContent=fileLabel(file);
  $("#runBtn").disabled=false;
  $("#resetBtn").hidden=false;
  setStatus("PDF pronto para leitura.");
}
drop.addEventListener("click",()=>input.click());
drop.addEventListener("keydown",event=>{
  if (event.key==="Enter" || event.key===" "){
    event.preventDefault(); input.click();
  }
});
input.addEventListener("change",event=>selectPdf(event.target.files[0]));
for (const eventName of ["dragenter","dragover"]){
  drop.addEventListener(eventName,event=>{event.preventDefault();drop.classList.add("drag");});
}
for (const eventName of ["dragleave","drop"]){
  drop.addEventListener(eventName,event=>{event.preventDefault();drop.classList.remove("drag");});
}
drop.addEventListener("drop",event=>selectPdf(event.dataTransfer.files[0]));

$("#runBtn").addEventListener("click",async()=>{
  if (!STATE.pdfFile || STATE.busy) return;
  STATE.busy=true;
  $("#runBtn").disabled=true;
  $("#exportBtn").disabled=true;
  setStatus("Lendo páginas do PDF…",true);
  try{
    const pdf=await parsePDF(STATE.pdfFile,message=>setStatus(message,true));
    if (!pdf.pages.some(page=>page.lines.length))
      throw new Error("O PDF não contém texto selecionável. Faça OCR antes de enviá-lo.");
    setStatus("Organizando as três partes…",true);
    const extracted=extractWorkbookRows(pdf,STATE.pdfFile.name);
    STATE.pdf=pdf;
    STATE.extracted=extracted;
    const notes=reviewMessages(pdf,extracted);
    $("#reviewNotice").textContent=notes.join(" ");
    $("#reviewNotice").hidden=!notes.length;
    showLotView(null);
    $("#resultMeta").textContent=`${pdf.pages.length} página(s) lida(s) · ${extracted["Parte 2"].length} lote(s) · ${extracted["Parte 3"].length} ensaio(s) de cimento`;
    $("#results").hidden=false;
    $("#exportBtn").disabled=false;
    setStatus("Extração concluída. Revise os campos e exporte o Excel.");
    $("#results").scrollIntoView({behavior:"smooth",block:"start"});
  }catch(error){
    console.error(error);
    clearResults();
    setStatus(`Não foi possível ler o PDF: ${error.message}`,false,true);
  }finally{
    STATE.busy=false;
    $("#runBtn").disabled=false;
  }
});

$("#lotExplorer").addEventListener("click",event=>{
  const button=event.target.closest("button[data-lot-index]");
  if (!button || !STATE.pdf) return;
  const index=button.dataset.lotIndex==="all" ? null : Number(button.dataset.lotIndex);
  if (index!==null && (!Number.isInteger(index) || index<0 || index>=STATE.pdf.lots.length)) return;
  showLotView(index);
});

$("#resetBtn").addEventListener("click",()=>{
  if (STATE.busy) return;
  STATE.pdfFile=null;
  input.value="";
  drop.classList.remove("has","drag");
  $("#pdfName").textContent="Selecionar ou arrastar um PDF";
  $("#pdfSub").textContent="Data Book com texto selecionável";
  $("#runBtn").disabled=true;
  $("#resetBtn").hidden=true;
  clearResults();
  setStatus("Aguardando um Data Book em PDF.");
});
