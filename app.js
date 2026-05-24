/* =====================================================================
   Cruzamento Databook (PDF Cavan) × Planilha (XLSX Rumo)
   Tudo roda no navegador. Sem backend.
   ===================================================================== */

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

/* ---------- Tolerâncias e configuração ---------- */
const CFG = {
  TOL_COMP: 0.1,   // MPa  — compressão axial / desprotensão
  TOL_TRAC: 0.05,  // MPa  — tração na flexão
  TOL_TEMP: 0.5,   // °C
  OK_MIN: 100,     // % para classificar como CONFORME
  WARN_MIN: 60     // % mínimo para PARCIAL; abaixo = NÃO CONFORME
};

/* ---------- Estado ---------- */
const STATE = { pdfFile:null, xlsFile:null, project:"FMT", result:null };

/* ===================================================================
   Utilidades numéricas
   =================================================================== */
function toNum(s){
  if (s === null || s === undefined) return null;
  s = String(s).trim();
  if (!s || s==="_" || s==="#REF!" || s.toUpperCase()==="N/A") return null;
  // remove separador de milhar e troca vírgula decimal
  const cleaned = s.replace(/\s/g,"").replace(/\.(?=\d{3}\b)/g,"").replace(",",".");
  const v = parseFloat(cleaned);
  return isNaN(v) ? null : v;
}
function parsePair(s){
  if (s === null || s === undefined) return [];
  const m = String(s).match(/\d{1,3}[.,]\d{1,2}/g);
  return m ? m.map(x=>parseFloat(x.replace(",","."))) : [];
}
function fmt(v, dec=2){
  if (v===null||v===undefined||isNaN(v)) return null;
  return v.toFixed(dec).replace(".",",");
}

/* ===================================================================
   1) LEITURA DO PDF  →  lista de lotes com seus ensaios
   =================================================================== */
async function parsePDF(file, statusCb){
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data:buf}).promise;
  const lots = [];
  const chumbadores = []; // certificados de fixações (chumbadores/ombreiras) — nível databook
  for (let p=1; p<=pdf.numPages; p++){
    if (p%10===0 && statusCb) statusCb(`Lendo databook… página ${p}/${pdf.numPages}`);
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.map(it=>({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5]
    })).filter(it=>it.str.trim()!=="");
    const flat = items.map(i=>i.str).join(" ");

    // (a) páginas de certificado de qualidade do lote (dormente produzido)
    if (/CERTIFICADO DE QUALIDADE DO LOTE/i.test(flat)){
      lots.push(parseCertPage(items, p));
      continue;
    }
    // (b) páginas da seção 4.3 — certificados de qualidade das FIXAÇÕES (chumbadores).
    //     Dois formatos de fornecedor já vistos nos databooks da Cavan:
    //       • HIPPER FREIOS — "Relatório Técnico de Qualidade"; o lote/rastreabilidade
    //         do chumbador é a CORRIDA ("M___").
    //       • PANDROL — "Certificado de Qualidade / Quality Certificate"; não há corrida,
    //         então o lote/rastreabilidade é a NF (nota fiscal) de cada expedição.
    //     Em ambos não há vínculo lote-a-lote com o dormente — é rastreabilidade do databook.
    //     Gate: a página cita "OMBREIRA" e NÃO é o certificado do lote do dormente.
    if (/OMBREIRA/i.test(flat) && !/CERTIFICADO DE QUALIDADE DO LOTE/i.test(flat) &&
        (/Relat[óo]rio T[ée]cnico de Qualidade/i.test(flat) || /QUALITY CERTIFICATE/i.test(flat) ||
         /CERTIFICADO DE CONFORMIDADE/i.test(flat) || /PANDROL/i.test(flat) || /Rastreabilidade/i.test(flat))){
      const c = parseChumbadorPage(items, p);
      if (c && (c.corridas.length || c.certNum || c.notaFiscal)) chumbadores.push(c);
    }
  }
  return { lots, chumbadores: dedupeChumbadores(chumbadores) };
}

/* Reconstrói as linhas de uma página a partir das posições (y agrupado) */
function pageLines(items, tolY){
  const tol = tolY || 2.6;
  const rows = []; let curY=null, cur=null;
  for (const it of [...items].sort((a,b)=> b.y-a.y || a.x-b.x)){
    if (curY===null || Math.abs(it.y-curY)>tol){ cur={y:it.y,items:[it]}; rows.push(cur); curY=it.y; }
    else { cur.items.push(it); curY=(curY+it.y)/2; }
  }
  return rows.map(r=> r.items.sort((a,b)=>a.x-b.x).map(i=>i.str).join(" ").replace(/\s+/g," ").trim());
}

/* Lê um laudo de FIXAÇÕES (chumbador/ombreira) da seção 4.3.
   Reconhece dois formatos:
   • HIPPER FREIOS ("Relatório Técnico de Qualidade"): nº do certificado, data,
     descrição, fornecedor, material, quantidade e as CORRIDAS ("M___") — que são
     o lote/rastreabilidade do chumbador.
   • PANDROL ("Certificado de Qualidade / Quality Certificate"): pedido, data de
     expedição e NF de cada expedição. Aqui não há corrida, então a NF é o
     identificador de lote/rastreabilidade do chumbador. */
function parseChumbadorPage(items, pageNum){
  const lines = pageLines(items, 3);
  const all = lines.join("\n");

  const isPandrol = /QUALITY CERTIFICATE/i.test(all) || /PANDROL/i.test(all) ||
                    /PEDIDO\s+PANDROL/i.test(all) || /OMBREIRA P\/ ?DORM/i.test(all);

  // ----- Formato PANDROL -----
  if (isPandrol && !/Relat[óo]rio T[ée]cnico de Qualidade/i.test(all)){
    // linha do produto: contém "OMBREIRA" e os números QTD SOLICITADA / QTD EXPEDIDA
    // (números com separador de milhar, ex.: "136.940" e "19.000"). O código do
    // produto "13156" não tem ponto, então não é confundido com quantidade.
    const prodLine = lines.find(l=>/OMBREIRA/i.test(l) && /\d{1,3}(?:\.\d{3})+/.test(l)) ||
                     lines.find(l=>/OMBREIRA/i.test(l)) || "";
    const qNums = prodLine.match(/\b\d{1,3}(?:\.\d{3})+\b/g) || [];
    const qtd = qNums.length ? qNums[qNums.length-1] : null;           // QTD EXPEDIDA = última
    const desc = prodLine.replace(/^\s*\d{4,6}\s+/,"")                  // tira o código do produto
                         .replace(/\s+\d{1,3}(?:\.\d{3})+.*$/,"").trim() || null;
    // linha de dados: pedido pandrol | pedido cliente | recebido em | expedição | NF
    const row  = all.match(/\b(\d{1,3}\.\d{3})\s+(\d{6,12})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2,4}\.\d{3})\b/);
    const nf      = row ? row[5] : ((all.match(/INVOICE\s*N[ºo°]?[\s\S]{0,140}?\b(\d{2,4}\.\d{3})\b/i)||[])[1] || null);
    const dataExp = row ? row[4] : ((all.match(/DISPATCH DATE[\s\S]{0,140}?(\d{2}\/\d{2}\/\d{4})/i)||[])[1] || null);
    const pedido  = row ? row[1] : ((all.match(/PEDIDO\s+PANDROL[\s\S]{0,160}?(\d{1,3}\.\d{3})/i)||[])[1] || null);
    return { certNum:null, data:dataExp, desc, fornecedor:"PANDROL",
             material:null, quantidade:qtd?qtd.replace(/\s/g,""):null,
             notaFiscal:nf?nf.replace(/\s/g,""):null, pedido:pedido||null,
             corridas:[], page:pageNum };
  }

  // ----- Formato HIPPER FREIOS -----
  const certNum = (all.match(/N[ºo°]\s*(?:do\s*Certificado)?\s*:?\s*([0-9]{2,4}\s*\/\s*[0-9]{2})/i)||[])[1];
  const data    = (all.match(/Data\s*:?\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i)||[])[1];
  const desc    = (all.match(/Descri[çc][ãa]o do produto\s+(.+?)\s+(?:Fornecedor|supplier)/i)||[])[1];
  const forn    = (all.match(/Fornecedor[^\n]*?\s([A-Z][A-Z0-9À-Ú&.\- ]{2,}?)(?:\s{2,}|\n|$)/)||[])[1];
  const material= (all.match(/Material\s+(NBR[^\n]+?)(?:\s{2,}|\n|$)/i)||[])[1];
  const qtdMatch= all.match(/Quantidade[\s\S]{0,40}?([0-9]{1,3}(?:[.\s][0-9]{3})*(?:,[0-9]+)?)/i);
  const quantidade = qtdMatch ? qtdMatch[1].replace(/\s/g,"") : null;
  const nf      = (all.match(/Nota\s*Fiscal[\s\S]{0,40}?([0-9]{4,6}(?:\s*[-–]\s*[0-9]{4,6})?)/i)||[])[1];

  // corridas / rastreabilidade: todos os códigos "M" + 2 a 4 dígitos
  const corridas = [...new Set((all.match(/\bM\s?[0-9]{2,4}\b/g)||[]).map(s=>s.replace(/\s/g,"").toUpperCase()))];

  return { certNum: certNum?certNum.replace(/\s/g,""):null, data, desc:desc?desc.trim():null,
           fornecedor:forn?forn.trim():null, material:material?material.trim():null,
           quantidade, notaFiscal:nf?nf.replace(/\s/g,""):null, pedido:null, corridas, page:pageNum };
}

/* Consolida certificados: junta laudos repetidos (mesma chave) unindo as corridas
   e preservando os campos mais completos; lista todas as páginas onde aparecem.
   A chave é o nº de certificado (Hipper Freios) ou, na falta dele, a NF (Pandrol). */
function dedupeChumbadores(list){
  const clean = list.filter(c=>c.certNum || c.corridas.length || c.notaFiscal);
  const byKey = new Map();
  const semChave = [];
  const keyOf = c => c.certNum ? "C:"+c.certNum : (c.notaFiscal ? "NF:"+c.notaFiscal : null);
  for (const c of clean){
    const k = keyOf(c);
    if (!k){ semChave.push(c); continue; }
    const prev = byKey.get(k);
    if (!prev){ byKey.set(k, {...c, corridas:[...c.corridas], paginas:[c.page]}); continue; }
    prev.corridas = [...new Set([...prev.corridas, ...c.corridas])].sort();
    prev.paginas.push(c.page);
    prev.data       = prev.data       || c.data;
    prev.desc       = prev.desc       || c.desc;
    prev.fornecedor = prev.fornecedor || c.fornecedor;
    prev.material   = prev.material   || c.material;
    prev.quantidade = prev.quantidade || c.quantidade;
    prev.notaFiscal = prev.notaFiscal || c.notaFiscal;
    prev.pedido     = prev.pedido     || c.pedido;
  }
  const merged = [...byKey.values(), ...semChave.map(c=>({...c, paginas:[c.page]}))];
  merged.sort((a,b)=>a.page-b.page);
  return merged;
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

  // ----- Rastreabilidade do AÇO DE PROTENSÃO (seção "CORTE DE AÇO") -----
  // Esta é a ÚNICA rastreabilidade de matéria-prima que consta na própria página
  // do lote produzido. Traz, por bobina: Nota fiscal, Nº da Bobina e Módulo de
  // Elasticidade. (A página do lote NÃO traz o lote/corrida do CHUMBADOR — esse
  // dado vive só na seção 4.3, em nível de databook.)
  const aco = []; // [{nf, bobina, modulo}]
  {
    let lnNF=null, lnBob=null, lnMod=null;
    for (const ln of lines){
      if (/Nota\s*fiscal/i.test(ln) && lnNF===null) lnNF = ln;
      else if (/N[ºo°]\s*da\s*Bobina/i.test(ln) && lnBob===null) lnBob = ln;
      else if (/M[oó]dulo\s*de\s*Elasticidade/i.test(ln) && lnMod===null) lnMod = ln;
    }
    const grab = (ln, re) => ln ? (ln.replace(re,"").match(/[0-9][0-9.,]*/g)||[]) : [];
    const nfs  = grab(lnNF,  /Nota\s*fiscal\s*:?/i);
    const bobs = grab(lnBob, /N[ºo°]\s*da\s*Bobina\s*:?/i);
    const mods = grab(lnMod, /M[oó]dulo\s*de\s*Elasticidade\s*:?/i);
    const n = Math.max(nfs.length, bobs.length, mods.length);
    for (let i=0;i<n;i++){
      const nf=nfs[i]||null, bo=bobs[i]||null, mo=mods[i]||null;
      if (nf||bo||mo) aco.push({nf, bobina:bo, modulo:mo});
    }
  }

  // ----- Compressão axial e tração -----
  // A 1ª linha de cura é a DESPROTENSÃO (transferência da protensão). O tempo
  // varia por lote/projeto: FMT/MP usam frações 0,5/0,6/0,7/0,8; o Ferronorte
  // pode trazer valores >= 1 dia (ex.: "1,6 dias"). Tratamos como desprotensão
  // qualquer linha "X dias" cujo X NÃO seja exatamente 7, 14 ou 28.
  // Os valores das bobinas podem vir com vírgula decimal (75,99) OU inteiros
  // (ex.: "81"), então a captura aceita as duas formas.
  const comp = {}, trac = {};
  let primeiroDia = null; // ex.: "0,5" ou "1,6" — guarda o tempo de desprotensão do lote
  for (const ln of lines){
    const m = ln.match(/^\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*dias\s+(.*)$/i);
    if (m){
      const diaNum = parseFloat(m[1].replace(",","."));
      const isFixo = (diaNum===7 || diaNum===14 || diaNum===28);
      const key = isFixo ? String(diaNum) : "frac"; // qualquer não-7/14/28 = desprotensão
      if (!isFixo) primeiroDia = m[1].replace(".",",");
      const nums = (m[2].match(/\d{1,3}(?:,\d{1,2})?/g)||[]).map(x=>parseFloat(x.replace(",",".")));
      if (nums.length>=2) comp[key]=[nums[0],nums[1]];
      if (nums.length>=4) trac[key]=[nums[2],nums[3]];
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

  return { lote, tipo, data, comp, trac, temp:tempRows, page:pageNum, primeiroDia, aco };
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

/* ===================================================================
   2) LEITURA DO XLSX  →  mapa lote → registro
   =================================================================== */
const COL = { // 0-based, conforme cabeçalho na linha 3
  PISTA:1, PEDIDO:2, LOTE:3, PROJETO:4, TIPO:5, TOTAL:6, DATA_FAB:7,
  TEMP_INI:14, TEMP_MEIO:15, TEMP_FIM:16,
  DESP_INI:23, DESP_MEIO:24, DESP_FIM:25, TEMPO_CURA:26,
  COMP7:32, COMP14:33, TRAC14:34, COMP28:35, TRAC28:36,
  STATUS:43, MOTIVO:45
};

// normaliza o nome do projeto da planilha para a chave do seletor
function normProject(raw){
  const s = (raw||"").toString().toUpperCase().replace(/\s+/g," ").trim();
  if (s.includes("FMT")) return "FMT";
  if (s.includes("FERRO")) return "FERRONORTE";
  if (s.includes("MALHA PAULISTA") || s.includes("MP")) return "MP"; // bitola definida pelo tipo
  return s;
}
// classifica bitola para Malha Paulista a partir do tipo de dormente
function mpBitola(tipo){
  const t=(tipo||"").toUpperCase();
  if (t.includes("MISTA")) return "MP_MISTA";
  if (t.includes("LARGA")) return "MP_LARGA";
  return null;
}

async function parseXLSX(file){
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, {type:"array", cellDates:true});
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:null});
  // cabeçalho na linha 3 (índice 2); dados a partir do índice 3
  const map = {};
  const all = [];
  for (let i=3;i<rows.length;i++){
    const r = rows[i]; if (!r) continue;
    const loteRaw = r[COL.LOTE];
    if (loteRaw===null||loteRaw===undefined||String(loteRaw).trim()==="") continue;
    const key = String(loteRaw).trim().replace(/^0+/,"");
    const projRaw = r[COL.PROJETO];
    const tipo = r[COL.TIPO];
    let projKey = normProject(projRaw);
    if (projKey==="MP"){ projKey = mpBitola(tipo) || "MP_LARGA"; }
    const rec = {
      lote:key, projeto:projKey, projetoRaw:projRaw, tipo,
      dataFab: r[COL.DATA_FAB],
      comp7:parsePair(r[COL.COMP7]), comp14:parsePair(r[COL.COMP14]), comp28:parsePair(r[COL.COMP28]),
      trac14:parsePair(r[COL.TRAC14]), trac28:parsePair(r[COL.TRAC28]),
      desp:[toNum(r[COL.DESP_INI]),toNum(r[COL.DESP_MEIO]),toNum(r[COL.DESP_FIM])].filter(v=>v!=null),
      tempoCura: r[COL.TEMPO_CURA],
      tempIni:toNum(r[COL.TEMP_INI]), tempMeio:toNum(r[COL.TEMP_MEIO]), tempFim:toNum(r[COL.TEMP_FIM]),
      status:r[COL.STATUS], motivo:r[COL.MOTIVO], row:i+1
    };
    if (map[key]){ rec.dup=true; (map[key].dups=map[key].dups||[]).push(i+1); }
    else { map[key]=rec; }
    all.push(rec);
  }
  return {map, all};
}

/* converte data da planilha (Date|serial|string) para dd/mm/aaaa */
function xlsDate(v){
  if (v==null) return null;
  if (v instanceof Date) return `${String(v.getDate()).padStart(2,"0")}/${String(v.getMonth()+1).padStart(2,"0")}/${v.getFullYear()}`;
  if (typeof v==="number"){ const d=XLSX.SSF ? XLSX.SSF.parse_date_code(v):null; if(d) return `${String(d.d).padStart(2,"0")}/${String(d.m).padStart(2,"0")}/${d.y}`; }
  const s=String(v).trim();
  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);                       // ISO aaaa-mm-dd
  if(m) return `${m[3].padStart(2,"0")}/${m[2].padStart(2,"0")}/${m[1]}`;
  m=s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);                // dd/mm/aaaa
  if(m) return `${m[1].padStart(2,"0")}/${m[2].padStart(2,"0")}/${m[3]}`;
  return s;
}

/* ===================================================================
   3) CRUZAMENTO  PDF × Planilha
   =================================================================== */
function comparePair(pdfArr, xlsArr, tol){
  // compara posicionalmente os corpos de prova existentes em AMBOS
  const out=[]; const n=Math.max(pdfArr.length, xlsArr.length);
  for (let i=0;i<n;i++){
    const a=pdfArr[i]??null, b=xlsArr[i]??null;
    if (a!=null && b!=null){
      out.push({pdf:a, xls:b, ok:Math.abs(a-b)<=tol, delta:Math.abs(a-b)});
    } else {
      out.push({pdf:a, xls:b, ok:null}); // falta em uma fonte → não conta
    }
  }
  return out;
}

function crossCheck(pdfLots, xls, project){
  const lots=[];
  const xlsMatchedKeys = new Set();

  for (const pl of pdfLots){
    const key = (pl.lote||"").replace(/^0+/,"");
    const x = xls.map[key] || null;
    if (x) xlsMatchedKeys.add(key);

    const fields=[]; // cada campo: {grupo,nome,sub,pdf,xls,cmp[], status}
    const addPairField=(grupo,nome,sub,pdfArr,xlsArr,tol)=>{
      const cmp = (x) ? comparePair(pdfArr||[], xlsArr||[], tol) : (pdfArr||[]).map(a=>({pdf:a,xls:null,ok:null}));
      fields.push({grupo,nome,sub,kind:"pair",cmp,tol});
    };

    // --- Identificação ---
    fields.push({grupo:"Identificação",nome:"Tipo de dormente",kind:"text",
      pdf:pl.tipo, xls:x?x.tipo:null});
    fields.push({grupo:"Identificação",nome:"Data de produção",kind:"date",
      pdf:pl.data, xls:x?xlsDate(x.dataFab):null,
      ok: (x && pl.data && xlsDate(x.dataFab)) ? (pl.data===xlsDate(x.dataFab)) : null});

    // --- Compressão axial ---
    // 1º dia (fração variável: 0,5 / 0,6 / 0,7 / 0,8) ↔ desprotensão na planilha
    if (pl.comp["frac"]) addPairField("Compressão axial", (pl.primeiroDia||"0,5")+" dias", "desprotensão na planilha", pl.comp["frac"], x?x.desp:[], CFG.TOL_COMP);
    addPairField("Compressão axial","7 dias","MPa",pl.comp["7"], x?x.comp7:[], CFG.TOL_COMP);
    addPairField("Compressão axial","14 dias","MPa",pl.comp["14"], x?x.comp14:[], CFG.TOL_COMP);
    addPairField("Compressão axial","28 dias","MPa",pl.comp["28"], x?x.comp28:[], CFG.TOL_COMP);

    // --- Tração na flexão ---
    addPairField("Tração na flexão","14 dias","MPa",pl.trac["14"], x?x.trac14:[], CFG.TOL_TRAC);
    addPairField("Tração na flexão","28 dias","MPa",pl.trac["28"], x?x.trac28:[], CFG.TOL_TRAC);

    // --- Temperatura / cura (informativo: planilha quase não tem) ---
    const tm = tempMetrics(pl.temp);
    fields.push({grupo:"Cura e temperatura",nome:"Tempo de cura (leituras)",kind:"info",
      pdf: pl.temp.length? pl.temp.map(t=>t.hhmm).join(" · ") : null,
      xls: x && x.tempoCura ? formatHora(x.tempoCura) : null});
    fields.push({grupo:"Cura e temperatura",nome:"Temperatura máxima",kind:"info",
      pdf: tm.max!=null? fmt(tm.max,1)+" °C" : null,
      xls: x ? maxXlsTemp(x) : null});
    fields.push({grupo:"Cura e temperatura",nome:"Variação máx. por hora",kind:"info",
      pdf: tm.maxRatePerHour!=null? fmt(tm.maxRatePerHour,1)+" °C/h" : null,
      xls: null});

    // --- Cálculo do % de aderência (só campos comparáveis em ambas as fontes) ---
    let ok=0, tot=0, hasCritical=false, criticalBad=false;
    for (const f of fields){
      if (f.kind==="pair"){
        for (const c of f.cmp){ if (c.ok!==null){ tot++; if(c.ok) ok++; else { criticalBad=true; } } }
        if (f.cmp.some(c=>c.ok!==null)) hasCritical=true;
      } else if (f.kind==="date" && f.ok!==null){
        tot++; if(f.ok) ok++; else criticalBad=true;
      } else if (f.kind==="text" && f.pdf!=null && f.xls!=null){
        // tipo: comparação leve (contém núcleo)
        const norm=s=>s.toString().toUpperCase().replace(/[^A-Z]/g,"");
        const a=norm(f.pdf), b=norm(f.xls);
        f.ok = a.includes(b.slice(0,4)) || b.includes(a.slice(0,4)) || a.includes("FMT")&&b.includes("FMT");
        tot++; if(f.ok) ok++;
      }
    }
    const pct = tot? Math.round(100*ok/tot) : null;

    let status;
    if (!x) status="ghost";                       // no PDF, ausente na planilha → ERRO
    else if (pct===null) status="warn";
    else if (pct>=CFG.OK_MIN) status="ok";
    else if (pct>=CFG.WARN_MIN) status="warn";
    else status="bad";

    lots.push({lote:pl.lote, key, status, pct, fields, hasXls:!!x,
      tipo:pl.tipo, data:pl.data, tempMetrics:tm, page:pl.page, aco:pl.aco||[],
      xlsStatus: x?x.status:null, xlsMotivo: x?x.motivo:null,
      okCount:ok, totCount:tot});
  }

  // lotes da planilha (do projeto selecionado) que NÃO estão no PDF → ignorados (não é erro)
  const ignored = xls.all.filter(r=>{
    const inProj = projectMatches(r.projeto, project);
    return inProj && !xlsMatchedKeys.has(r.lote);
  });

  // lotes cruzados que aparecem mais de uma vez na planilha (usamos a 1ª linha)
  const dups = [];
  for (const key of xlsMatchedKeys){
    const rec = xls.map[key];
    if (rec && rec.dups && rec.dups.length){
      dups.push({lote: rec.lote, linhas: [rec.row, ...rec.dups]});
    }
  }

  return {lots, ignored, dups, project};
}

function projectMatches(recProj, sel){
  if (sel===recProj) return true;
  // FMT no databook pode constar como FMT; planilha idem
  return false;
}

function maxXlsTemp(x){
  const vs=[x.tempIni,x.tempMeio,x.tempFim].filter(v=>v!=null);
  return vs.length? fmt(Math.max(...vs),1)+" °C" : null;
}
function formatHora(v){
  if (v==null) return null;
  if (v instanceof Date) return `${String(v.getHours()).padStart(2,"0")}:${String(v.getMinutes()).padStart(2,"0")}`;
  if (typeof v==="number"){ const tot=Math.round(v*24*60); return `${String(Math.floor(tot/60)).padStart(2,"0")}:${String(tot%60).padStart(2,"0")}`; }
  return String(v);
}

/* ===================================================================
   4) UI — wiring
   =================================================================== */
const $ = s=>document.querySelector(s);
function setupDrop(dropId, inputId, nameId, subId, icId, accept, onFile){
  const drop=$( "#"+dropId), input=$("#"+inputId);
  drop.addEventListener("click",()=>input.click());
  input.addEventListener("change",e=>{ if(e.target.files[0]) onFile(e.target.files[0]); });
  ["dragover","dragenter"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("drag");}));
  ["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("drag");}));
  drop.addEventListener("drop",e=>{ const f=e.dataTransfer.files[0]; if(f) onFile(f); });
}
function fileLabel(f){ const kb=f.size/1024; return kb>1024? (kb/1024).toFixed(1)+" MB" : Math.round(kb)+" KB"; }

setupDrop("dropPdf","filePdf","pdfName","pdfSub","icPdf","application/pdf",f=>{
  STATE.pdfFile=f; $("#dropPdf").classList.add("has");
  $("#pdfName").textContent=f.name; $("#pdfSub").textContent=fileLabel(f); checkReady();
});
setupDrop("dropXls","fileXls","xlsName","xlsSub","icXls",".xlsx",f=>{
  STATE.xlsFile=f; $("#dropXls").classList.add("has");
  $("#xlsName").textContent=f.name; $("#xlsSub").textContent=fileLabel(f); checkReady();
});
$("#projSel").addEventListener("change",e=>{ STATE.project=e.target.value; });

function checkReady(){
  const ready = STATE.pdfFile && STATE.xlsFile;
  $("#runBtn").disabled = !ready;
  $("#statusTxt").textContent = ready ? "Pronto para cruzar." :
    (STATE.pdfFile? "Falta a planilha (XLSX)." : STATE.xlsFile? "Falta o databook (PDF)." : "Aguardando os dois arquivos.");
}

function setStatus(txt, busy){
  $("#statusTxt").textContent=txt;
  $("#statusLine").classList.toggle("busy", !!busy);
}

$("#runBtn").addEventListener("click", async ()=>{
  STATE.project=$("#projSel").value;
  $("#runBtn").disabled=true;
  setStatus("Lendo databook (PDF)…", true);
  try{
    const pdf = await parsePDF(STATE.pdfFile, t=>setStatus(t,true));
    const pdfLots = pdf.lots;
    if (!pdfLots.length){ setStatus("Nenhum certificado de qualidade encontrado no PDF. Confira o arquivo.", false); $("#runBtn").disabled=false; return; }
    setStatus("Lendo planilha (XLSX)…", true);
    const xls = await parseXLSX(STATE.xlsFile);
    setStatus("Cruzando lote a lote…", true);
    await new Promise(r=>setTimeout(r,120));
    const result = crossCheck(pdfLots, xls, STATE.project);
    result.chumbadores = pdf.chumbadores || [];
    STATE.result = result;
    render(result);
    setStatus(`Concluído: ${result.lots.length} lotes do databook conferidos.`, false);
    $("#tabs").classList.add("show");
    $("#resetBtn").style.display="inline-flex";
    $("#projPill").style.display="inline-flex";
    $("#projPillTxt").textContent = window.PROJECT_LABELS[result.project]||result.project;
    document.getElementById("tabs").scrollIntoView({behavior:"smooth",block:"start"});
  }catch(err){
    console.error(err);
    setStatus("Erro ao processar: "+err.message, false);
  }
  $("#runBtn").disabled=false;
});

$("#resetBtn").addEventListener("click", ()=>{
  STATE.pdfFile=STATE.xlsFile=STATE.result=null;
  ["dropPdf","dropXls"].forEach(d=>$("#"+d).classList.remove("has"));
  $("#pdfName").textContent="Selecionar ou arrastar"; $("#pdfSub").textContent="Certificados de qualidade do lote";
  $("#xlsName").textContent="Selecionar ou arrastar"; $("#xlsSub").textContent="Controle de fabricação";
  $("#filePdf").value=""; $("#fileXls").value="";
  $("#tabs").classList.remove("show"); $("#resetBtn").style.display="none"; $("#projPill").style.display="none";
  ["dash","cmp","lots","chumb"].forEach(p=>$("#panel-"+p).innerHTML="");
  $("#chumbBadge").textContent="0";
  checkReady(); setStatus("Aguardando os dois arquivos.", false);
  window.scrollTo({top:0,behavior:"smooth"});
});

/* tabs */
document.querySelectorAll(".tab").forEach(t=>t.addEventListener("click",()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(x=>x.classList.remove("active"));
  t.classList.add("active");
  $("#panel-"+t.dataset.tab).classList.add("active");
}));

/* ===================================================================
   5) RENDER
   =================================================================== */
function statusChip(s){
  const map={ok:["ok","Conforme"],warn:["warn","Parcial"],bad:["bad","Não conforme"],ghost:["ghost","Sem registro na planilha"]};
  const [c,l]=map[s]||["ghost","—"];
  return `<span class="chip ${c}"><span class="d"></span>${l}</span>`;
}

function render(res){
  renderDash(res); renderCmp(res); renderLots(res); renderChumb(res);
  $("#cmpBadge").textContent=res.lots.length;
  $("#lotsBadge").textContent=res.lots.length;
  $("#chumbBadge").textContent=(res.chumbadores&&res.chumbadores.length)||0;
}

function renderDash(res){
  const lots=res.lots;
  const n=lots.length;
  const ok=lots.filter(l=>l.status==="ok").length;
  const warn=lots.filter(l=>l.status==="warn").length;
  const bad=lots.filter(l=>l.status==="bad").length;
  const ghost=lots.filter(l=>l.status==="ghost").length;
  const withXls=lots.filter(l=>l.hasXls);
  const avg = withXls.length? Math.round(withXls.reduce((a,l)=>a+(l.pct||0),0)/withXls.length) : 0;

  const ghostList = lots.filter(l=>l.status==="ghost");
  const sorted=[...lots].sort((a,b)=>(a.pct??-1)-(b.pct??-1));

  let html = `
  <div class="kpis">
    <div class="kpi"><div class="lab">Lotes no databook</div><div class="val">${n}</div><div class="sub">certificados lidos do PDF</div></div>
    <div class="kpi k-ok"><div class="lab">Conformes</div><div class="val">${ok}</div><div class="sub">100% dos parâmetros batem</div></div>
    <div class="kpi k-warn"><div class="lab">Parciais</div><div class="val">${warn}</div><div class="sub">${CFG.WARN_MIN}% a 99% de aderência</div></div>
    <div class="kpi k-bad"><div class="lab">Não conformes</div><div class="val">${bad}</div><div class="sub">abaixo de ${CFG.WARN_MIN}%</div></div>
    <div class="kpi ${ghost?'k-ghost':''}"><div class="lab">Sem registro</div><div class="val">${ghost}</div><div class="sub">no PDF, ausentes na planilha</div></div>
  </div>`;

  // barra de aderência média
  html += `
  <div class="section">
    <div class="section-h"><h3>Aderência média do databook</h3><p>Média do % de batimento entre os lotes que existem nas duas fontes.</p></div>
    <div class="section-b">
      <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
        <div style="font-size:52px;font-weight:900;letter-spacing:-2px;color:var(--rumo-green)">${avg}<span style="font-size:24px">%</span></div>
        <div style="flex:1;min-width:220px">
          <div style="height:14px;border-radius:999px;background:var(--line);overflow:hidden;display:flex">
            <div style="width:${(ok/n*100)||0}%;background:var(--ok)"></div>
            <div style="width:${(warn/n*100)||0}%;background:var(--warn)"></div>
            <div style="width:${(bad/n*100)||0}%;background:var(--bad)"></div>
            <div style="width:${(ghost/n*100)||0}%;background:var(--ghost)"></div>
          </div>
          <div class="legend" style="margin-top:12px">
            <span><i style="background:var(--ok)"></i>Conforme (${ok})</span>
            <span><i style="background:var(--warn)"></i>Parcial (${warn})</span>
            <span><i style="background:var(--bad)"></i>Não conforme (${bad})</span>
            <span><i style="background:var(--ghost)"></i>Sem registro (${ghost})</span>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  // erros: lotes no PDF ausentes na planilha
  if (ghostList.length){
    html += `<div class="notice warn"><span class="ni">⚠</span><div><b>${ghostList.length} lote(s) no databook não constam na planilha</b> — isso é sinalizado como erro: ${ghostList.map(l=>`<span class="mono">${l.lote}</span>`).join(", ")}.</div></div>`;
  }
  // ignorados
  if (res.ignored.length){
    html += `<div class="notice info"><span class="ni">ℹ</span><div><b>${res.ignored.length} lote(s) da planilha do projeto ${window.PROJECT_LABELS[res.project]||res.project} não estão neste databook</b> e foram ignorados (não contam como erro), conforme a regra definida.</div></div>`;
  }
  // duplicados na planilha
  if (res.dups && res.dups.length){
    html += `<div class="notice warn"><span class="ni">⚠</span><div><b>${res.dups.length} lote(s) aparecem mais de uma vez na planilha</b> — usei a primeira ocorrência de cada: ${res.dups.map(d=>`<span class="mono">${d.lote}</span>`).join(", ")}. Vale conferir se há linhas repetidas.</div></div>`;
  }
  // chumbadores (fixações) lidos da seção 4.3 do databook
  if (res.chumbadores && res.chumbadores.length){
    const corr=[...new Set(res.chumbadores.flatMap(c=>c.corridas))].sort();
    const ids = corr.length ? corr : [...new Set(res.chumbadores.map(c=>c.notaFiscal).filter(Boolean))].map(n=>"NF "+n).sort();
    const rotulo = corr.length ? "corrida(s)" : "nota(s) fiscal(is)";
    html += `<div class="notice info"><span class="ni">ℹ</span><div><b>${res.chumbadores.length} laudo(s) de chumbador/fixação</b> lidos da seção 4.3 — ${ids.length} ${rotulo}: ${ids.map(c=>`<span class="mono">${c}</span>`).join(", ")}. Esses laudos valem para o databook inteiro (o lote do chumbador não consta na página de cada lote). Detalhes na aba <b>Chumbadores</b>.</div></div>`;
  }

  // mini panorama de lotes
  html += `
  <div class="section">
    <div class="section-h"><h3>Panorama por lote</h3><p>Ordenado do pior para o melhor. Clique para ver a comparação detalhada.</p></div>
    <div class="section-b"><div class="lotbars">
      ${sorted.map(l=>lotBarHTML(l)).join("")}
    </div></div>
  </div>`;

  $("#panel-dash").innerHTML=html;
  // clique abre comparação
  $("#panel-dash").querySelectorAll(".lotbar").forEach(el=>{
    el.addEventListener("click",()=>openComparison(el.dataset.key));
  });
}

function lotBarHTML(l){
  if (l.status==="ghost"){
    return `<div class="lotbar ghost" data-key="${l.key}">
      <div class="ln">${l.lote}</div><div class="pc">sem registro<br>na planilha</div></div>`;
  }
  return `<div class="lotbar ${l.status}" data-key="${l.key}">
    <div class="ln">${l.lote}</div>
    <div class="pc">${l.pct??"—"}<span style="font-size:13px">%</span></div>
    <div class="track"><div class="fill" style="width:${l.pct??0}%"></div></div>
  </div>`;
}

function openComparison(key){
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(x=>x.classList.remove("active"));
  document.querySelector('.tab[data-tab="cmp"]').classList.add("active");
  $("#panel-cmp").classList.add("active");
  const card=$("#panel-cmp").querySelector(`.cmp-lot[data-key="${key}"]`);
  if (card){
    card.classList.add("open");
    setTimeout(()=>card.scrollIntoView({behavior:"smooth",block:"center"}),60);
  }
}

/* ----- Comparação lado a lado ----- */
function renderCmp(res){
  let html = `
  <div class="notice info"><span class="ni">ℹ</span><div>A coluna <b>% de aderência</b> considera apenas os campos presentes nas <b>duas</b> fontes (compressão, tração, desprotensão e data). Temperatura e tempo de cura aparecem como referência — a planilha registra poucos pontos, então não entram no cálculo para não gerar falso erro.</div></div>
  <div class="section">
    <div class="section-h" style="gap:18px">
      <div class="filters" style="flex:1">
        <button class="fbtn on" data-f="all">Todos</button>
        <button class="fbtn" data-f="ok">Conformes</button>
        <button class="fbtn" data-f="warn">Parciais</button>
        <button class="fbtn" data-f="bad">Não conformes</button>
        <button class="fbtn" data-f="ghost">Sem registro</button>
        <div class="search"><input id="cmpSearch" placeholder="Buscar lote…" /></div>
      </div>
      <button class="btn btn-ghost" id="expandAll" style="padding:8px 14px;font-size:12.5px">Expandir tudo</button>
    </div>
    <div class="section-b" id="cmpList">
      ${res.lots.map(l=>cmpCardHTML(l)).join("")}
    </div>
  </div>`;
  $("#panel-cmp").innerHTML=html;

  // toggles
  $("#panel-cmp").querySelectorAll(".cmp-head").forEach(h=>{
    h.addEventListener("click",()=>h.parentElement.classList.toggle("open"));
  });
  // filtros
  let curF="all", curQ="";
  const apply=()=>{
    $("#panel-cmp").querySelectorAll(".cmp-lot").forEach(c=>{
      const okF = curF==="all" || c.dataset.status===curF;
      const okQ = !curQ || c.dataset.lote.includes(curQ);
      c.style.display = (okF&&okQ)?"":"none";
    });
  };
  $("#panel-cmp").querySelectorAll(".fbtn").forEach(b=>b.addEventListener("click",()=>{
    $("#panel-cmp").querySelectorAll(".fbtn").forEach(x=>x.classList.remove("on"));
    b.classList.add("on"); curF=b.dataset.f; apply();
  }));
  $("#cmpSearch").addEventListener("input",e=>{curQ=e.target.value.trim();apply();});
  let expanded=false;
  $("#expandAll").addEventListener("click",()=>{
    expanded=!expanded;
    $("#panel-cmp").querySelectorAll(".cmp-lot").forEach(c=>c.classList.toggle("open",expanded));
    $("#expandAll").textContent=expanded?"Recolher tudo":"Expandir tudo";
  });
}

function cmpCardHTML(l){
  const meta = l.hasXls
    ? `Tipo PDF: <b>${l.tipo||"—"}</b> · Produção: <b>${l.data||"—"}</b>`
    : `<b>Este lote não foi encontrado na planilha</b>`;
  const pctBlock = l.hasXls
    ? `<div class="pct-big">${l.pct??"—"}%</div>`
    : `<div>${statusChip("ghost")}</div>`;

  let rowsHTML="";
  if (l.hasXls){
    let lastGrp=null;
    for (const f of l.fields){
      if (f.grupo!==lastGrp){ rowsHTML+=`<tr class="grp-row"><td colspan="4">${f.grupo}</td></tr>`; lastGrp=f.grupo; }
      rowsHTML+=fieldRowHTML(f);
    }
  }

  // --- Rastreabilidade do aço de protensão (só consta no PDF) ---
  // Esta é a rastreabilidade de matéria-prima que a PÁGINA DO LOTE traz.
  // A planilha não tem coluna equivalente, então é informativo (não entra no %).
  const aco = l.aco||[];
  const acoBlock = aco.length ? `
    <div class="cmp-body" style="border-top:1px dashed var(--line)">
      <div class="aco-head">Rastreabilidade do aço de protensão (seção “Corte de aço” do PDF)</div>
      <table class="cmp">
        <thead><tr><th style="width:22%">Bobina</th><th style="width:26%">Nota fiscal</th><th style="width:34%">Nº da bobina</th><th style="width:18%">Mód. elast.</th></tr></thead>
        <tbody>
          ${aco.map((b,i)=>`<tr>
            <td class="field-name">Bobina ${String(i+1).padStart(2,"0")}</td>
            <td class="v mono ${b.nf?"":"miss"}">${b.nf||"sem dado"}</td>
            <td class="v mono ${b.bobina?"":"miss"}">${b.bobina||"sem dado"}</td>
            <td class="v mono ${b.modulo?"":"miss"}">${b.modulo||"—"}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      <div class="aco-note">A página do lote não registra o lote/corrida do <b>chumbador</b> — essa rastreabilidade fica na aba <b>Chumbadores</b> (seção 4.3), em nível de databook.</div>
    </div>` : "";

  const hasBody = l.hasXls || aco.length>0;

  return `
  <div class="cmp-lot ${l.status}" data-key="${l.key}" data-lote="${l.lote}" data-status="${l.status}">
    <div class="cmp-head">
      <div class="lot-id">${l.lote}</div>
      <div class="grow"><div class="lot-meta">${meta}</div>
        ${l.hasXls?`<div style="margin-top:4px">${statusChip(l.status)} <span class="delta">${l.okCount}/${l.totCount} parâmetros conferem</span></div>`:""}
      </div>
      ${pctBlock}
      ${hasBody?'<span class="caret">▼</span>':""}
    </div>
    ${l.hasXls?`<div class="cmp-body"><table class="cmp">
      <thead><tr><th style="width:32%">Parâmetro</th><th style="width:28%">Databook (PDF)</th><th style="width:28%">Planilha (Rumo)</th><th class="res" style="width:12%">Resultado</th></tr></thead>
      <tbody>${rowsHTML}</tbody></table></div>`:""}
    ${acoBlock}
  </div>`;
}

function fieldRowHTML(f){
  const nameCell = `<td class="field-name">${f.nome}${f.sub?`<div class="field-sub">${f.sub}</div>`:""}</td>`;

  if (f.kind==="pair"){
    const pdfTxt = f.cmp.map(c=>c.pdf!=null?fmt(c.pdf):"–").join("  /  ");
    const xlsTxt = f.cmp.map(c=>c.xls!=null?fmt(c.xls):"–").join("  /  ");
    const anyCmp = f.cmp.some(c=>c.ok!==null);
    let res;
    if (!anyCmp){ res=`<span class="cell-na">sem par</span>`; }
    else{
      const allOk=f.cmp.every(c=>c.ok!==false);
      const bad=f.cmp.filter(c=>c.ok===false);
      res = allOk ? `<span class="cell-ok">✓ bate</span>`
                  : `<span class="cell-bad">✕ ${bad.length} difere</span>`;
    }
    const pdfClass = pdfTxt.replace(/[\s\/–]/g,"")===""?"v miss":"v";
    const xlsClass = xlsTxt.replace(/[\s\/–]/g,"")===""?"v miss":"v";
    return `<tr>${nameCell}
      <td class="${pdfClass}">${pdfTxt.replace(/[\s\/–]/g,"")===""?"sem dado":pdfTxt}</td>
      <td class="${xlsClass}">${xlsTxt.replace(/[\s\/–]/g,"")===""?"sem dado":xlsTxt}</td>
      <td class="res">${res}</td></tr>`;
  }
  if (f.kind==="date"){
    const res = f.ok===null?`<span class="cell-na">—</span>`:(f.ok?`<span class="cell-ok">✓ bate</span>`:`<span class="cell-bad">✕ difere</span>`);
    return `<tr>${nameCell}<td class="v ${f.pdf?'':'miss'}">${f.pdf||"sem dado"}</td><td class="v ${f.xls?'':'miss'}">${f.xls||"sem dado"}</td><td class="res">${res}</td></tr>`;
  }
  if (f.kind==="text"){
    const res = f.ok===undefined?`<span class="cell-na">—</span>`:(f.ok?`<span class="cell-ok">✓ compatível</span>`:`<span class="cell-bad">✕ revisar</span>`);
    return `<tr>${nameCell}<td class="v ${f.pdf?'':'miss'}">${f.pdf||"sem dado"}</td><td class="v ${f.xls?'':'miss'}">${f.xls||"sem dado"}</td><td class="res">${res}</td></tr>`;
  }
  // info
  return `<tr>${nameCell}<td class="v ${f.pdf?'':'miss'}">${f.pdf||"sem dado"}</td><td class="v ${f.xls?'':'miss'}">${f.xls||"sem dado"}</td><td class="res"><span class="cell-na">referência</span></td></tr>`;
}

/* ----- Aba Lotes (lista compacta) ----- */
function renderLots(res){
  const lots=[...res.lots].sort((a,b)=>(a.pct??-1)-(b.pct??-1));
  let html=`
  <div class="section">
    <div class="section-h" style="gap:18px">
      <div class="filters" style="flex:1">
        <button class="fbtn on" data-f="all">Todos</button>
        <button class="fbtn" data-f="ok">Conformes</button>
        <button class="fbtn" data-f="warn">Parciais</button>
        <button class="fbtn" data-f="bad">Não conformes</button>
        <button class="fbtn" data-f="ghost">Sem registro</button>
        <div class="search"><input id="lotsSearch" placeholder="Buscar lote…" /></div>
      </div>
    </div>
    <div class="section-b" style="padding:0">
      <table class="cmp" style="font-size:13.5px">
        <thead><tr>
          <th style="padding-left:22px">Lote</th><th>Status</th><th>Aderência</th>
          <th>Parâmetros OK</th><th>Temp. máx (PDF)</th><th>Status planilha</th><th>Pág. PDF</th>
        </tr></thead>
        <tbody id="lotsBody">
          ${lots.map(l=>lotRowHTML(l)).join("")}
        </tbody>
      </table>
    </div>
  </div>`;
  $("#panel-lots").innerHTML=html;

  $("#panel-lots").querySelectorAll("#lotsBody tr").forEach(tr=>{
    tr.style.cursor="pointer";
    tr.addEventListener("click",()=>openComparison(tr.dataset.key));
  });
  let curF="all",curQ="";
  const apply=()=>{
    $("#panel-lots").querySelectorAll("#lotsBody tr").forEach(tr=>{
      const okF=curF==="all"||tr.dataset.status===curF;
      const okQ=!curQ||tr.dataset.lote.includes(curQ);
      tr.style.display=(okF&&okQ)?"":"none";
    });
  };
  $("#panel-lots").querySelectorAll(".fbtn").forEach(b=>b.addEventListener("click",()=>{
    $("#panel-lots").querySelectorAll(".fbtn").forEach(x=>x.classList.remove("on"));
    b.classList.add("on");curF=b.dataset.f;apply();
  }));
  $("#lotsSearch").addEventListener("input",e=>{curQ=e.target.value.trim();apply();});
}

function lotRowHTML(l){
  const pct = l.hasXls? `<b style="font-size:15px">${l.pct??"—"}%</b>` : "—";
  const okc = l.hasXls? `${l.okCount}/${l.totCount}` : "—";
  const tmax = l.tempMetrics&&l.tempMetrics.max!=null? fmt(l.tempMetrics.max,1)+" °C":"—";
  const st = l.xlsStatus? String(l.xlsStatus).trim() : "—";
  return `<tr data-key="${l.key}" data-lote="${l.lote}" data-status="${l.status}">
    <td class="mono" style="padding-left:22px;font-weight:600">${l.lote}</td>
    <td>${statusChip(l.status)}</td>
    <td>${pct}</td>
    <td class="mono">${okc}</td>
    <td class="mono">${tmax}</td>
    <td style="font-size:12px;color:var(--ink-soft)">${st}</td>
    <td class="mono" style="color:var(--ghost)">${l.page}</td>
  </tr>`;
}
/* ===================================================================
   6) ABA CHUMBADORES (fixações) — seção 4.3 do databook
   -------------------------------------------------------------------
   IMPORTANTE: o databook NÃO vincula o chumbador a cada lote produzido.
   A página do "Certificado de Qualidade do Lote" só registra a
   rastreabilidade do AÇO de protensão (bobinas). Os chumbadores/ombreiras
   têm laudos próprios do fornecedor, válidos para todo o databook, cujo
   lote/rastreabilidade é a CORRIDA ("M___"). É isso que esta aba consolida.
   =================================================================== */
function renderChumb(res){
  const list = res.chumbadores || [];
  const allCorridas = [...new Set(list.flatMap(c=>c.corridas))].sort();
  // identificador de lote/rastreabilidade de cada laudo: corrida(s) ou, na falta, a NF
  const rastreabOf = c => c.corridas.length ? c.corridas.join(", ") : (c.notaFiscal ? "NF "+c.notaFiscal : "—");
  const idOf = c => c.certNum || (c.notaFiscal ? "NF "+c.notaFiscal : (c.pedido ? "Pedido "+c.pedido : "—"));
  // chips do topo: corridas, se houver; senão as NFs (caso Pandrol)
  const usaCorrida = allCorridas.length>0;
  const chips = usaCorrida ? allCorridas
    : [...new Set(list.map(c=>c.notaFiscal).filter(Boolean))].sort();
  const fornecedores = [...new Set(list.map(c=>c.fornecedor).filter(Boolean))];

  let html = `
  <div class="notice info"><span class="ni">ℹ</span><div>
    <b>O lote do chumbador não aparece na página de cada lote produzido.</b>
    No databook da Cavan, a página do “Certificado de Qualidade do Lote” traz a rastreabilidade
    do <b>aço de protensão</b> (bobinas), e os <b>chumbadores/ombreiras</b> têm laudos próprios do
    fornecedor na <b>seção 4.3</b> — válidos para o databook inteiro. O identificador de lote do
    chumbador é a <b>corrida</b> (“M___”, laudos Hipper Freios) ou a <b>nota fiscal</b> de cada
    expedição (laudos Pandrol). Abaixo estão os laudos lidos do PDF.
  </div></div>`;

  if (!list.length){
    html += `<div class="notice warn"><span class="ni">⚠</span><div>Não encontrei laudos de fixações/chumbadores neste PDF (seção 4.3). Se o databook tiver outro layout, me envie que ajusto o leitor.</div></div>`;
    $("#panel-chumb").innerHTML = html;
    return;
  }

  // resumo: identificadores de lote (corridas ou NFs) utilizados no databook
  html += `
  <div class="section">
    <div class="section-h"><h3>Lotes de chumbador neste databook</h3>
      <p>${chips.length} ${usaCorrida?"corrida(s)":"nota(s) fiscal(is)"} distinta(s), em ${list.length} laudo(s)${fornecedores.length?` — fornecedor(es): ${fornecedores.join(", ")}`:""}.</p></div>
    <div class="section-b">
      <div class="chips-wrap">
        ${chips.map(c=>`<span class="chip-corrida mono">${usaCorrida?c:"NF "+c}</span>`).join("")}
      </div>
    </div>
  </div>`;

  // tabela de laudos
  html += `
  <div class="section">
    <div class="section-h"><h3>Laudos de qualidade — fixações (seção 4.3)</h3>
      <p>Cada laudo do fornecedor, com o lote/rastreabilidade que ele certifica.</p></div>
    <div class="section-b" style="padding:0">
      <table class="cmp" style="font-size:13px">
        <thead><tr>
          <th style="padding-left:22px">Certificado / NF</th><th>Data</th>
          <th>Produto</th><th>Fornecedor</th>
          <th>Lote / rastreabilidade</th><th>Qtd.</th><th>Pág. PDF</th>
        </tr></thead>
        <tbody>
          ${list.map(c=>`<tr>
            <td class="mono" style="padding-left:22px;font-weight:600">${idOf(c)}</td>
            <td class="mono">${c.data||"—"}</td>
            <td style="font-size:12px">${c.desc||"—"}</td>
            <td style="font-size:12px">${c.fornecedor||"—"}</td>
            <td class="mono">${rastreabOf(c)}</td>
            <td class="mono">${c.quantidade||"—"}</td>
            <td class="mono" style="color:var(--ghost)">${(c.paginas&&c.paginas.length?c.paginas:[c.page]).join(", ")}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
  </div>`;

  $("#panel-chumb").innerHTML = html;
}
