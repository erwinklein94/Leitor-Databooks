(() => {
  'use strict';

  const state = {
    pdfRecords: [],
    pdfDiagnostics: [],
    sheetRecords: [],
    sheetDiagnostics: null,
    results: [],
    filteredResults: []
  };

  const $ = (id) => document.getElementById(id);

  const els = {
    pdfFiles: $('pdfFiles'),
    xlsxFile: $('xlsxFile'),
    analyzeBtn: $('analyzeBtn'),
    statusPanel: $('statusPanel'),
    resultsSection: $('resultsSection'),
    diagnosticsSection: $('diagnosticsSection'),
    summaryCards: $('summaryCards'),
    resultTableBody: document.querySelector('#resultTable tbody'),
    detailPanel: $('detailPanel'),
    diagnostics: $('diagnostics'),
    projectFilter: $('projectFilter'),
    tolerance: $('tolerance'),
    headerMode: $('headerMode'),
    exportCsvBtn: $('exportCsvBtn'),
    exportJsonBtn: $('exportJsonBtn'),
    clearBtn: $('clearBtn'),
    searchInput: $('searchInput'),
    statusFilter: $('statusFilter')
  };

  const PROJECT_LABELS = {
    TODOS: 'Todos',
    FMT: 'FMT',
    FERRONORTE: 'FERRONORTE',
    MISTA_MP: 'MALHA PAULISTA - BITOLA MISTA',
    LARGA_MP: 'MALHA PAULISTA - BITOLA LARGA',
    DESCONHECIDO: 'Projeto não identificado'
  };

  const FIELD_LABELS = {
    project: 'Projeto',
    type: 'Tipo de dormente',
    productionDate: 'Data de produção/fabricação',
    chumbadores: 'Lote de ombreiras/chumbadores',
    transferencia: 'Transferência da protensão / desprotensão',
    comp7: 'Compressão axial 7 dias',
    comp14: 'Compressão axial 14 dias',
    tracao14: 'Tração na flexão 14 dias',
    comp28: 'Compressão axial 28 dias',
    tracao28: 'Tração na flexão 28 dias',
    pdfApproval: 'Status A/R no PDF',
    sheetStatus: 'Status da planilha'
  };

  const CRITICAL_FIELDS = new Set(['productionDate', 'chumbadores', 'comp7', 'comp14', 'tracao14', 'comp28', 'tracao28']);

  const normalizeSpaces = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

  const stripAccents = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const normText = (value) => stripAccents(value).toUpperCase().replace(/\s+/g, ' ').trim();

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const normalizeLot = (value) => {
    if (value === null || value === undefined || value === '') return '';
    const m = String(value).match(/\d+/g);
    if (!m) return '';
    const digits = m.join('').replace(/^0+(?=\d)/, '');
    if (!digits) return '';
    return digits.padStart(5, '0');
  };

  const displayLot = (lot) => lot ? lot.padStart(5, '0') : '';

  const parseNumber = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value === null || value === undefined) return null;
    let s = String(value).trim();
    if (!s || s === '_' || s === '-') return null;
    s = s.replace(/\s/g, '');
    const hasComma = s.includes(',');
    const hasDot = s.includes('.');
    if (hasComma && hasDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (hasComma) {
      s = s.replace(',', '.');
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const parseNumberList = (value) => {
    if (Array.isArray(value)) return value.map(parseNumber).filter((n) => n !== null);
    if (typeof value === 'number' && Number.isFinite(value)) return [value];
    if (value === null || value === undefined) return [];
    const s = String(value).replace(/\s+/g, ' ');
    if (!s || s.trim() === '_' || s.trim() === '-') return [];
    const matches = s.match(/-?\d+(?:[,.]\d+)?/g) || [];
    return matches.map(parseNumber).filter((n) => n !== null);
  };

  const formatNumber = (n) => {
    if (n === null || n === undefined || Number.isNaN(n)) return '';
    return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  };

  const formatNumberList = (arr) => {
    const list = Array.isArray(arr) ? arr : parseNumberList(arr);
    return list.length ? list.map(formatNumber).join(' / ') : '';
  };

  const excelSerialToDate = (serial) => {
    if (!Number.isFinite(serial)) return '';
    const utcDays = Math.floor(serial - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    if (Number.isNaN(dateInfo.getTime())) return '';
    return dateInfo.toISOString().slice(0, 10);
  };

  const normalizeDate = (value) => {
    if (!value && value !== 0) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number') return excelSerialToDate(value);
    const s = String(value).trim();
    if (!s || s === '_') return '';
    const br = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (br) {
      const day = br[1].padStart(2, '0');
      const month = br[2].padStart(2, '0');
      let year = br[3];
      if (year.length === 2) year = `20${year}`;
      return `${year}-${month}-${day}`;
    }
    const iso = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return '';
  };

  const formatDateBR = (isoDate) => {
    if (!isoDate) return '';
    const m = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : isoDate;
  };

  const normalizeChumbadores = (value) => {
    if (value === null || value === undefined) return [];
    let s = normText(value);
    if (!s || s === '_' || s === '-') return [];
    s = s
      .replace(/LOTES?( DE)? CHUMBADORES:?/g, ' ')
      .replace(/LOTES? OMBREIRAS:?/g, ' ')
      .replace(/TIPO DE OMBREIRAS:?/g, ' ')
      .replace(/PANDROL|FAST\s*CLIP|E\s*CLIP/g, ' ')
      .replace(/[;,/|+&]/g, ' ')
      .replace(/\bE\b/g, ' ');

    const rawTokens = s.match(/\b(?:[A-Z]{1,4}\s*[- ]?\s*)?\d{2,5}\b/g) || [];
    const tokens = rawTokens.map((token) => token.replace(/[\s-]/g, '').toUpperCase());
    return Array.from(new Set(tokens)).sort();
  };

  const tokensToText = (tokens) => Array.isArray(tokens) && tokens.length ? tokens.join(' / ') : '';

  const canonicalProject = (...parts) => {
    const t = normText(parts.filter(Boolean).join(' '));
    if (!t) return 'DESCONHECIDO';
    if (/(FERRONORTE|FERRO NORTE|\bFN\b)/.test(t)) return 'FERRONORTE';
    if (/FMT/.test(t)) return 'FMT';
    if (/BITOLA MISTA|MISTA MP|FXPFC-41C/.test(t)) return 'MISTA_MP';
    if (/LARGA MP|BITOLA LARGA MP|MALHA PAULISTA.*BITOLA LARGA|FXPFC-01C/.test(t)) return 'LARGA_MP';
    if (/BITOLA LARGA/.test(t) && /MALHA PAULISTA/.test(t)) return 'LARGA_MP';
    return 'DESCONHECIDO';
  };

  const getStatusClass = (status) => {
    if (status === 'OK') return 'ok';
    if (status === 'PARCIAL') return 'warn';
    return 'bad';
  };

  const setMessage = (html, type = 'loading') => {
    els.statusPanel.innerHTML = html ? `<div class="message message--${type}">${html}</div>` : '';
  };

  const asArrayBuffer = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error(`Falha ao ler ${file.name}`));
    reader.readAsArrayBuffer(file);
  });

  const configurePdfJs = () => {
    if (!window.pdfjsLib) throw new Error('Biblioteca PDF.js não carregou. Verifique a internet/CDN ou hospede a biblioteca localmente.');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  };

  const pageToLines = async (page) => {
    const content = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
    const items = content.items
      .filter((item) => normalizeSpaces(item.str))
      .map((item) => ({
        text: normalizeSpaces(item.str),
        x: item.transform[4],
        y: item.transform[5]
      }))
      .sort((a, b) => Math.abs(b.y - a.y) > 2.8 ? b.y - a.y : a.x - b.x);

    const groups = [];
    for (const item of items) {
      let group = groups.find((g) => Math.abs(g.y - item.y) <= 2.8);
      if (!group) {
        group = { y: item.y, items: [] };
        groups.push(group);
      }
      group.items.push(item);
    }
    groups.sort((a, b) => b.y - a.y);
    return groups.map((g) => g.items.sort((a, b) => a.x - b.x).map((i) => i.text).join(' ').replace(/\s+/g, ' ').trim());
  };

  const extractAfterLabel = (text, labelRegex) => {
    const re = new RegExp(`${labelRegex.source}\\s*:?\\s*([^\\n]+)`, labelRegex.flags.includes('i') ? labelRegex.flags : `${labelRegex.flags}i`);
    const match = text.match(re);
    return match ? normalizeSpaces(match[1]) : '';
  };

  const extractLotAndDate = (text) => {
    let m = text.match(/\bLOTE\s*:\s*(\d{3,6})[\s\S]{0,120}?DATA\s+DE\s+PRODU[CÇ][AÃ]O\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (m) return { lot: normalizeLot(m[1]), productionDate: normalizeDate(m[2]) };

    m = text.match(/\b(RUMO[^\n]{0,80})\n\s*(\d{3,6})\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (m) return { lot: normalizeLot(m[2]), productionDate: normalizeDate(m[3]) };

    m = text.match(/\b(\d{4,5})\s+(\d{1,2}\/\d{1,2}\/\d{4})\b/);
    return m ? { lot: normalizeLot(m[1]), productionDate: normalizeDate(m[2]) } : { lot: '', productionDate: '' };
  };

  const extractConcreteValues = (lines) => {
    const concrete = { transferencia: [], comp7: [], comp14: [], tracao14: [], comp28: [], tracao28: [] };
    const lineRegex = /(^|\s)(0[,.]\d+|0|7|14|28)\s+dias\s+(-?\d+(?:[,.]\d+)?)\s+(-?\d+(?:[,.]\d+)?)(?:\s+(-?\d+(?:[,.]\d+)?)\s+(-?\d+(?:[,.]\d+)?))?/i;

    for (const line of lines) {
      const m = line.match(lineRegex);
      if (!m) continue;
      const day = m[2].replace(',', '.');
      const values = [m[3], m[4], m[5], m[6]].filter(Boolean).map(parseNumber).filter((n) => n !== null);
      if (day === '7') concrete.comp7 = values.slice(0, 2);
      else if (day === '14') {
        concrete.comp14 = values.slice(0, 2);
        concrete.tracao14 = values.slice(2, 4);
      } else if (day === '28') {
        concrete.comp28 = values.slice(0, 2);
        concrete.tracao28 = values.slice(2, 4);
      } else if (day.startsWith('0')) {
        concrete.transferencia = values.slice(0, 3);
      }
    }
    return concrete;
  };

  const extractPdfApprovals = (lines) => {
    const joined = lines.join('\n');
    const area = joined.split(/PAR[ÂA]METROS DIMENSIONAIS/i).slice(1).join('\n') || joined;
    const rows = area.split('\n').filter((line) => /\s[AR]\s*$/i.test(line.trim()) && !/Legenda/i.test(line));
    const statuses = rows.map((line) => {
      const m = line.trim().match(/([AR])\s*$/i);
      return m ? m[1].toUpperCase() : '';
    }).filter(Boolean);
    return {
      total: statuses.length,
      rejected: statuses.filter((s) => s === 'R').length,
      approved: statuses.filter((s) => s === 'A').length,
      statuses
    };
  };

  const parsePdfRecord = (pageText, lines, context) => {
    if (!/CERTIFICADO\s+DE\s+QUALIDADE\s+DO\s+LOTE/i.test(pageText)) return null;
    const lotDate = extractLotAndDate(pageText);
    if (!lotDate.lot) return null;

    const type = extractAfterLabel(pageText, /TIPO\s+DE\s+DORMENTE/i);
    const clientLine = (pageText.match(/CLIENTE\s*:\s*([^\n]+)/i) || [])[1] || '';
    const chumbRaw = extractAfterLabel(pageText, /LOTES?(?:\s+DE)?\s+CHUMBADORES/i) || extractAfterLabel(pageText, /LOTE\s+CHUMBADORES/i);
    const notaFiscal = extractAfterLabel(pageText, /Nota\s+fiscal/i);
    const bobinas = extractAfterLabel(pageText, /N[°º]?\s+da\s+Bobina/i);
    const modulus = extractAfterLabel(pageText, /Modulo\s+de\s+Elasticidade/i);
    const ensaiado = extractAfterLabel(pageText, /Dormente\s+ensaiado/i);
    const concrete = extractConcreteValues(lines);
    const approvals = extractPdfApprovals(lines);

    const project = canonicalProject(context.fileName, context.coverText, pageText, type, clientLine);

    return {
      source: 'pdf',
      fileName: context.fileName,
      page: context.pageNumber,
      lot: lotDate.lot,
      productionDate: lotDate.productionDate,
      project,
      type: normalizeSpaces(type),
      client: normalizeSpaces(clientLine),
      chumbadoresRaw: normalizeSpaces(chumbRaw),
      chumbadoresTokens: normalizeChumbadores(chumbRaw),
      notaFiscal: normalizeSpaces(notaFiscal),
      bobinas: normalizeSpaces(bobinas),
      modulus: normalizeSpaces(modulus),
      ensaiado: normalizeSpaces(ensaiado),
      concrete,
      approvals,
      rawText: pageText
    };
  };

  const parsePdfFile = async (file) => {
    configurePdfJs();
    const data = await asArrayBuffer(file);
    const loadingTask = window.pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    const records = [];
    let coverText = '';
    const diagnostics = {
      fileName: file.name,
      pages: pdf.numPages,
      records: 0,
      project: 'DESCONHECIDO',
      lots: [],
      warnings: []
    };

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const lines = await pageToLines(page);
      const text = lines.join('\n');
      if (pageNumber === 1) {
        coverText = text;
        diagnostics.project = canonicalProject(file.name, text);
      }
      const record = parsePdfRecord(text, lines, { fileName: file.name, coverText, pageNumber });
      if (record) records.push(record);
    }

    diagnostics.records = records.length;
    diagnostics.lots = records.map((r) => r.lot);
    if (!records.length) diagnostics.warnings.push('Nenhum certificado de qualidade de lote foi detectado. O PDF pode estar escaneado ou com leitura bloqueada.');
    return { records, diagnostics };
  };

  const findHeaderRow = (rows, mode) => {
    if (mode && mode !== 'auto') {
      const rowIndex = Math.max(0, Number(mode) - 1);
      return Number.isFinite(rowIndex) ? rowIndex : -1;
    }
    let best = { rowIndex: -1, score: 0 };
    rows.slice(0, 15).forEach((row, rowIndex) => {
      const normalized = row.map(normText).join(' | ');
      let score = 0;
      if (/\bLOTE\b/.test(normalized)) score += 3;
      if (/PROJETO/.test(normalized)) score += 2;
      if (/TIPO DE DORMENTE/.test(normalized)) score += 2;
      if (/DATA DE FABRICACAO|DATA DE FABRICAÇÃO/.test(normalized)) score += 2;
      if (/COMP\. AXIAL|COMP AXIAL|TRACAO|TRAÇÃO/.test(normalized)) score += 2;
      if (/STATUS/.test(normalized)) score += 1;
      if (score > best.score) best = { rowIndex, score };
    });
    return best.score >= 5 ? best.rowIndex : -1;
  };

  const makeColumnFinder = (headers) => {
    const normalizedHeaders = headers.map((h) => normText(h));
    return (...patterns) => {
      const regexes = patterns.map((p) => p instanceof RegExp ? p : new RegExp(p, 'i'));
      for (let i = 0; i < normalizedHeaders.length; i++) {
        if (regexes.every((re) => re.test(normalizedHeaders[i]))) return i;
      }
      for (let i = 0; i < normalizedHeaders.length; i++) {
        if (regexes.some((re) => re.test(normalizedHeaders[i]))) return i;
      }
      return -1;
    };
  };

  const getCell = (row, idx) => (idx >= 0 ? row[idx] : undefined);

  const parseSheetFile = async (file, headerMode) => {
    if (!window.XLSX) throw new Error('Biblioteca SheetJS/XLSX não carregou. Verifique a internet/CDN ou hospede a biblioteca localmente.');
    const data = await asArrayBuffer(file);
    const workbook = window.XLSX.read(data, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('A planilha não possui abas.');
    const sheet = workbook.Sheets[sheetName];
    const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
    const headerRow = findHeaderRow(rows, headerMode);
    if (headerRow < 0) throw new Error('Não consegui detectar a linha de cabeçalho da planilha. Tente selecionar manualmente a linha 3.');

    const headers = rows[headerRow].map((v) => normalizeSpaces(v));
    const findCol = makeColumnFinder(headers);
    const cols = {
      pista: findCol(/PISTA/),
      pedido: findCol(/N.?\s*PEDIDO/),
      lote: findCol(/^LOTE$/),
      projeto: findCol(/PROJETO/),
      tipo: findCol(/TIPO DE DORMENTE/),
      total: findCol(/TOTAL DA PRODUCAO/),
      data: findCol(/DATA DE FABRICACAO/),
      comUsp: findCol(/COM USP/),
      tipoOmbreira: findCol(/TIPO DE OMBREIRAS/),
      loteOmbreira: findCol(/LOTE OMBREIRAS/),
      desprotInicio: findCol(/DESPRONTENSAO|DESPROTENSAO/, /INICIO/),
      desprotMeio: findCol(/DESPRONTENSAO|DESPROTENSAO/, /MEIO/),
      desprotFim: findCol(/DESPRONTENSAO|DESPROTENSAO/, /FIM/),
      tempoCura: findCol(/TEMPO DE CURA/),
      comp7: findCol(/COMP.*AXIAL/, /7 DIAS/),
      comp14: findCol(/COMP.*AXIAL/, /14 DIAS/),
      tracao14: findCol(/TRACAO|TRAÇÃO/, /14 DIAS/),
      comp28: findCol(/COMP.*AXIAL/, /28 DIAS/),
      tracao28: findCol(/TRACAO|TRAÇÃO/, /28 DIAS/),
      serie: findCol(/SERIE|SÉRIE/),
      iauditor: findCol(/IAUDITOR/),
      status: findCol(/^STATUS/),
      motivo: findCol(/MOTIVO|ESPECIFICACAO|ESPECIFICAÇÃO/)
    };

    const missingRequired = [];
    if (cols.lote < 0) missingRequired.push('LOTE');
    if (cols.projeto < 0) missingRequired.push('PROJETO');
    if (cols.data < 0) missingRequired.push('DATA DE FABRICAÇÃO');
    if (missingRequired.length) throw new Error(`Cabeçalhos obrigatórios não encontrados: ${missingRequired.join(', ')}.`);

    const records = [];
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r];
      const lot = normalizeLot(getCell(row, cols.lote));
      if (!lot) continue;
      const project = canonicalProject(getCell(row, cols.projeto), getCell(row, cols.tipo));
      const transferencia = [getCell(row, cols.desprotInicio), getCell(row, cols.desprotMeio), getCell(row, cols.desprotFim)]
        .map(parseNumber)
        .filter((n) => n !== null);
      records.push({
        source: 'sheet',
        rowNumber: r + 1,
        lot,
        project,
        projectRaw: normalizeSpaces(getCell(row, cols.projeto)),
        type: normalizeSpaces(getCell(row, cols.tipo)),
        productionDate: normalizeDate(getCell(row, cols.data)),
        totalProduction: getCell(row, cols.total),
        tipoOmbreira: normalizeSpaces(getCell(row, cols.tipoOmbreira)),
        chumbadoresRaw: normalizeSpaces(getCell(row, cols.loteOmbreira)),
        chumbadoresTokens: normalizeChumbadores(getCell(row, cols.loteOmbreira)),
        transferencia,
        comp7: parseNumberList(getCell(row, cols.comp7)),
        comp14: parseNumberList(getCell(row, cols.comp14)),
        tracao14: parseNumberList(getCell(row, cols.tracao14)),
        comp28: parseNumberList(getCell(row, cols.comp28)),
        tracao28: parseNumberList(getCell(row, cols.tracao28)),
        statusRaw: normalizeSpaces(getCell(row, cols.status)),
        motivo: normalizeSpaces(getCell(row, cols.motivo)),
        iauditor: normalizeSpaces(getCell(row, cols.iauditor)),
        serie: normalizeSpaces(getCell(row, cols.serie)),
        rawRow: row
      });
    }

    return {
      records,
      diagnostics: {
        fileName: file.name,
        sheetName,
        headerRow: headerRow + 1,
        rows: rows.length,
        records: records.length,
        columnsFound: Object.fromEntries(Object.entries(cols).filter(([, v]) => v >= 0).map(([k, v]) => [k, `${headers[v]} (col ${v + 1})`])),
        projects: Array.from(new Set(records.map((r) => r.project))).sort()
      }
    };
  };

  const compareDates = (pdfValue, sheetValue) => {
    if (!pdfValue || !sheetValue) return makeCheck('productionDate', pdfValue, sheetValue, 'WARN', 'Data ausente em uma das fontes.');
    return pdfValue === sheetValue
      ? makeCheck('productionDate', formatDateBR(pdfValue), formatDateBR(sheetValue), 'OK', 'Datas iguais.')
      : makeCheck('productionDate', formatDateBR(pdfValue), formatDateBR(sheetValue), 'FAIL', 'Datas diferentes.');
  };

  const makeCheck = (field, pdfValue, sheetValue, level, note = '') => ({
    field,
    label: FIELD_LABELS[field] || field,
    pdfValue: pdfValue ?? '',
    sheetValue: sheetValue ?? '',
    level,
    note,
    critical: CRITICAL_FIELDS.has(field)
  });


  const compareType = (pdfRecord, sheetRecord) => {
    const pdfText = pdfRecord.type || `${pdfRecord.client || ''} ${PROJECT_LABELS[pdfRecord.project] || ''}`;
    const sheetText = sheetRecord.type || `${sheetRecord.projectRaw || ''} ${PROJECT_LABELS[sheetRecord.project] || ''}`;
    const a = normText(pdfText);
    const b = normText(sheetText);
    if (!a || !b) return makeCheck('type', pdfText, sheetText, 'WARN', 'Tipo de dormente ausente em uma das fontes.');
    const sameProject = pdfRecord.project === sheetRecord.project && pdfRecord.project !== 'DESCONHECIDO';
    const sameGauge = (/BITOLA LARGA/.test(a) && /BITOLA LARGA/.test(b)) || (/BITOLA MISTA/.test(a) && /BITOLA MISTA/.test(b));
    if (sameProject || sameGauge) return makeCheck('type', pdfText, sheetText, 'OK', 'Tipo/projeto compatível. Diferenças como USP, FC ou descrição curta foram aceitas.');
    return makeCheck('type', pdfText, sheetText, 'FAIL', 'Tipo de dormente parece diferente.');
  };

  const compareSimpleText = (field, pdfValue, sheetValue, strict = false) => {
    const a = normText(pdfValue);
    const b = normText(sheetValue);
    if (!a || !b) return makeCheck(field, pdfValue, sheetValue, 'WARN', 'Campo ausente em uma das fontes.');
    if (a === b || (!strict && (a.includes(b) || b.includes(a)))) return makeCheck(field, pdfValue, sheetValue, 'OK', 'Textos compatíveis.');
    return makeCheck(field, pdfValue, sheetValue, 'FAIL', 'Textos diferentes.');
  };

  const compareChumbadores = (pdfRecord, sheetRecord) => {
    const a = pdfRecord.chumbadoresTokens || [];
    const b = sheetRecord.chumbadoresTokens || [];
    const pdfText = pdfRecord.chumbadoresRaw || tokensToText(a);
    const sheetText = sheetRecord.chumbadoresRaw || tokensToText(b);
    if (!a.length || !b.length) return makeCheck('chumbadores', pdfText, sheetText, 'WARN', 'Lote de ombreiras/chumbadores ausente em uma das fontes.');
    const equal = a.length === b.length && a.every((token, i) => token === b[i]);
    if (equal) return makeCheck('chumbadores', tokensToText(a), tokensToText(b), 'OK', 'Lotes de chumbadores/ombreiras iguais.');
    const overlap = a.filter((token) => b.includes(token));
    if (overlap.length) return makeCheck('chumbadores', tokensToText(a), tokensToText(b), 'FAIL', `Divergência parcial. Coincidiu: ${overlap.join(' / ')}.`);
    return makeCheck('chumbadores', tokensToText(a), tokensToText(b), 'FAIL', 'Nenhum lote de chumbador/ombreira coincidiu.');
  };

  const compareNumberArrays = (field, pdfValues, sheetValues, tolerance, optional = false) => {
    const a = Array.isArray(pdfValues) ? pdfValues : parseNumberList(pdfValues);
    const b = Array.isArray(sheetValues) ? sheetValues : parseNumberList(sheetValues);
    if (!a.length && !b.length) return null;
    if (!a.length || !b.length) return makeCheck(field, formatNumberList(a), formatNumberList(b), optional ? 'WARN' : 'FAIL', 'Valores ausentes em uma das fontes.');

    const used = new Set();
    let matched = 0;
    const diffs = [];

    a.forEach((av, idx) => {
      let bestIndex = -1;
      let bestDiff = Infinity;
      b.forEach((bv, j) => {
        if (used.has(j)) return;
        const diff = Math.abs(av - bv);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIndex = j;
        }
      });
      if (bestIndex >= 0 && bestDiff <= tolerance) {
        used.add(bestIndex);
        matched += 1;
      } else {
        const comparable = idx < b.length ? b[idx] : b[bestIndex];
        if (comparable !== undefined) diffs.push(`${formatNumber(av)} x ${formatNumber(comparable)} (dif. ${formatNumber(Math.abs(av - comparable))})`);
      }
    });

    const allMatched = matched === a.length && a.length === b.length;
    const subsetMatched = matched === a.length && b.length !== a.length;
    if (allMatched) return makeCheck(field, formatNumberList(a), formatNumberList(b), 'OK', `Dentro da tolerância ${formatNumber(tolerance)}.`);
    if (subsetMatched) return makeCheck(field, formatNumberList(a), formatNumberList(b), optional ? 'OK' : 'WARN', 'Valores do PDF batem; a quantidade de leituras é diferente.');
    if (matched > 0) return makeCheck(field, formatNumberList(a), formatNumberList(b), 'FAIL', `Parte dos valores divergiu. ${diffs.join('; ')}`);
    return makeCheck(field, formatNumberList(a), formatNumberList(b), 'FAIL', `Valores fora da tolerância ${formatNumber(tolerance)}.`);
  };

  const comparePdfApprovals = (pdfRecord) => {
    const approvals = pdfRecord.approvals || { total: 0, rejected: 0, approved: 0 };
    if (!approvals.total) return makeCheck('pdfApproval', 'Não detectado', '', 'WARN', 'Não foi possível detectar linhas de status A/R no PDF.');
    if (approvals.rejected > 0) return makeCheck('pdfApproval', `${approvals.rejected} reprovação(ões) em ${approvals.total} status`, '', 'FAIL', 'O PDF possui ao menos um status R.');
    return makeCheck('pdfApproval', `${approvals.approved}/${approvals.total} aprovados`, '', 'OK', 'Status A/R do PDF sem reprovação detectada.');
  };

  const compareSheetStatus = (sheetRecord) => {
    const status = normText(sheetRecord.statusRaw);
    const motivo = sheetRecord.motivo ? `Motivo: ${sheetRecord.motivo}` : '';
    if (!status) return makeCheck('sheetStatus', '', sheetRecord.statusRaw, 'WARN', 'Status da planilha ausente.');
    if (/REPROV|BLOQUE|NAO LIBER|NÃO LIBER|CANCEL|RUIM/.test(status)) {
      return makeCheck('sheetStatus', '', sheetRecord.statusRaw, 'FAIL', motivo || 'Planilha indica restrição/reprovação.');
    }
    return makeCheck('sheetStatus', '', sheetRecord.statusRaw, 'OK', motivo || 'Status da planilha não indica reprovação.');
  };

  const choosePdfRecord = (sheetRecord, pdfRecordsByLot) => {
    const candidates = pdfRecordsByLot.get(sheetRecord.lot) || [];
    if (!candidates.length) return null;
    const sameProject = candidates.find((r) => r.project === sheetRecord.project);
    return sameProject || candidates[0];
  };

  const classifyResult = (checks, hasPdf) => {
    if (!hasPdf) return { status: 'RUIM', score: 0, reason: 'Lote não encontrado nos PDFs carregados.' };
    const considered = checks.filter(Boolean);
    const ok = considered.filter((c) => c.level === 'OK').length;
    const warn = considered.filter((c) => c.level === 'WARN').length;
    const fail = considered.filter((c) => c.level === 'FAIL').length;
    const criticalFails = considered.filter((c) => c.level === 'FAIL' && c.critical).length;
    const score = considered.length ? Math.round((ok / considered.length) * 100) : 0;

    if (fail === 0 && warn === 0) return { status: 'OK', score, reason: 'Todos os campos comparados bateram.' };
    if (criticalFails >= 2 || score < 40) return { status: 'RUIM', score, reason: 'Muitas divergências ou divergências críticas.' };
    return { status: 'PARCIAL', score, reason: 'Lote encontrado, mas há divergências ou campos ausentes.' };
  };

  const compareRecords = (sheetRecords, pdfRecords, tolerance, projectFilter) => {
    const pdfRecordsByLot = new Map();
    pdfRecords.forEach((r) => {
      if (!pdfRecordsByLot.has(r.lot)) pdfRecordsByLot.set(r.lot, []);
      pdfRecordsByLot.get(r.lot).push(r);
    });

    const filteredSheetRecords = sheetRecords.filter((record) => projectFilter === 'TODOS' || record.project === projectFilter);

    const results = filteredSheetRecords.map((sheetRecord, idx) => {
      const pdfRecord = choosePdfRecord(sheetRecord, pdfRecordsByLot);
      let checks = [];
      if (pdfRecord) {
        checks = [
          compareSimpleText('project', PROJECT_LABELS[pdfRecord.project], PROJECT_LABELS[sheetRecord.project]),
          compareType(pdfRecord, sheetRecord),
          compareDates(pdfRecord.productionDate, sheetRecord.productionDate),
          compareChumbadores(pdfRecord, sheetRecord),
          compareNumberArrays('transferencia', pdfRecord.concrete.transferencia, sheetRecord.transferencia, tolerance, true),
          compareNumberArrays('comp7', pdfRecord.concrete.comp7, sheetRecord.comp7, tolerance),
          compareNumberArrays('comp14', pdfRecord.concrete.comp14, sheetRecord.comp14, tolerance),
          compareNumberArrays('tracao14', pdfRecord.concrete.tracao14, sheetRecord.tracao14, tolerance),
          compareNumberArrays('comp28', pdfRecord.concrete.comp28, sheetRecord.comp28, tolerance),
          compareNumberArrays('tracao28', pdfRecord.concrete.tracao28, sheetRecord.tracao28, tolerance),
          comparePdfApprovals(pdfRecord),
          compareSheetStatus(sheetRecord)
        ].filter(Boolean);
      } else {
        checks = [makeCheck('project', '', PROJECT_LABELS[sheetRecord.project], 'FAIL', 'Sem PDF correspondente.')];
      }

      const classification = classifyResult(checks, Boolean(pdfRecord));
      const okCount = checks.filter((c) => c.level === 'OK').length;
      const failOrWarn = checks.filter((c) => c.level !== 'OK');
      return {
        id: `res-${idx}`,
        lot: sheetRecord.lot,
        project: sheetRecord.project,
        status: classification.status,
        score: classification.score,
        reason: classification.reason,
        okCount,
        totalChecks: checks.length,
        divergences: failOrWarn.map((c) => `${c.label}: ${c.note}`).join(' | '),
        pdfPage: pdfRecord ? `${pdfRecord.fileName}, pág. ${pdfRecord.page}` : 'Não encontrado',
        sheetRow: sheetRecord.rowNumber,
        pdfRecord,
        sheetRecord,
        checks
      };
    });

    const pdfLots = new Set(pdfRecords.filter((r) => projectFilter === 'TODOS' || r.project === projectFilter).map((r) => r.lot));
    const sheetLots = new Set(filteredSheetRecords.map((r) => r.lot));
    const onlyPdf = Array.from(pdfLots).filter((lot) => !sheetLots.has(lot)).sort();
    return { results, onlyPdf };
  };

  const renderSummary = (results, onlyPdf = []) => {
    const total = results.length;
    const ok = results.filter((r) => r.status === 'OK').length;
    const parcial = results.filter((r) => r.status === 'PARCIAL').length;
    const ruim = results.filter((r) => r.status === 'RUIM').length;
    const avg = total ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / total) : 0;

    els.summaryCards.innerHTML = [
      { label: 'Lotes analisados', value: total, cls: '' },
      { label: 'OK', value: ok, cls: 'ok' },
      { label: 'Parciais', value: parcial, cls: 'warn' },
      { label: 'Ruins', value: ruim, cls: 'bad' },
      { label: 'Acerto médio', value: `${avg}%`, cls: '' },
      { label: 'Só no PDF', value: onlyPdf.length, cls: onlyPdf.length ? 'warn' : '' }
    ].map((card) => `<div class="summary-card ${card.cls}"><strong>${card.value}</strong><span>${card.label}</span></div>`).join('');
  };

  const renderResultsTable = () => {
    const query = normText(els.searchInput.value);
    const statusFilter = els.statusFilter.value;
    state.filteredResults = state.results.filter((r) => {
      const statusMatch = statusFilter === 'TODOS' || r.status === statusFilter;
      const haystack = normText(`${r.lot} ${PROJECT_LABELS[r.project]} ${r.status} ${r.divergences} ${r.pdfPage} ${r.sheetRow}`);
      const queryMatch = !query || haystack.includes(query);
      return statusMatch && queryMatch;
    });

    if (!state.filteredResults.length) {
      els.resultTableBody.innerHTML = '<tr><td colspan="9" class="small">Nenhum resultado com os filtros atuais.</td></tr>';
      return;
    }

    els.resultTableBody.innerHTML = state.filteredResults.map((r) => {
      const badgeClass = getStatusClass(r.status);
      const divergencePreview = r.divergences ? escapeHtml(r.divergences).slice(0, 220) : 'Sem divergências';
      return `
        <tr>
          <td><strong>${displayLot(r.lot)}</strong></td>
          <td>${PROJECT_LABELS[r.project] || r.project}</td>
          <td><span class="badge ${badgeClass}">${r.status}</span><div class="small">${escapeHtml(r.reason)}</div></td>
          <td><strong>${r.score}%</strong></td>
          <td>${r.okCount}/${r.totalChecks}</td>
          <td><span class="small">${divergencePreview}${r.divergences.length > 220 ? '...' : ''}</span></td>
          <td><span class="small">${escapeHtml(r.pdfPage)}</span></td>
          <td>${r.sheetRow}</td>
          <td><button class="link-button" data-detail="${r.id}">abrir</button></td>
        </tr>`;
    }).join('');
  };

  const renderDetail = (resultId) => {
    const r = state.results.find((item) => item.id === resultId);
    if (!r) return;
    const statusClass = getStatusClass(r.status);
    const checkRows = r.checks.map((c) => {
      const badge = c.level === 'OK' ? 'ok' : c.level === 'WARN' ? 'warn' : 'bad';
      return `
        <div class="check-row">
          <div class="label">${escapeHtml(c.label)}${c.critical ? ' <span class="small">(crítico)</span>' : ''}</div>
          <div><span class="small">PDF</span><br>${escapeHtml(c.pdfValue || '-')}</div>
          <div><span class="small">Planilha</span><br>${escapeHtml(c.sheetValue || '-')}</div>
          <div><span class="badge ${badge}">${c.level}</span><div class="small">${escapeHtml(c.note)}</div></div>
        </div>`;
    }).join('');

    const pdfRaw = r.pdfRecord ? escapeHtml(r.pdfRecord.rawText.slice(0, 8000)) : 'Sem página PDF correspondente.';
    els.detailPanel.classList.remove('hidden');
    els.detailPanel.innerHTML = `
      <div class="detail-header">
        <div>
          <p class="section-kicker">Detalhe do lote</p>
          <h3>Lote ${displayLot(r.lot)} - ${PROJECT_LABELS[r.project] || r.project}</h3>
          <p class="muted">Planilha linha ${r.sheetRow}. ${escapeHtml(r.pdfPage)}.</p>
        </div>
        <span class="badge ${statusClass}">${r.status}</span>
      </div>
      <div class="detail-grid">
        <div>
          <h3>Comparação campo a campo</h3>
          <div class="comparison-list">${checkRows}</div>
        </div>
        <div>
          <h3>Dados lidos</h3>
          <p class="small"><strong>PDF:</strong> ${escapeHtml(r.pdfRecord ? `${r.pdfRecord.fileName}, página ${r.pdfRecord.page}` : 'não encontrado')}</p>
          <p class="small"><strong>Planilha:</strong> linha ${r.sheetRow}, status: ${escapeHtml(r.sheetRecord.statusRaw || '-')}</p>
          ${r.sheetRecord.motivo ? `<p class="small"><strong>Motivo/observação:</strong> ${escapeHtml(r.sheetRecord.motivo)}</p>` : ''}
          <details class="details-box" open>
            <summary>Texto extraído da página do PDF</summary>
            <pre class="raw-box">${pdfRaw}</pre>
          </details>
        </div>
      </div>`;
    els.detailPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const renderDiagnostics = (onlyPdf = []) => {
    const pdfCards = state.pdfDiagnostics.map((d) => `
      <div class="diagnostic-card">
        <h3>${escapeHtml(d.fileName)}</h3>
        <p class="small">Projeto detectado: <strong>${PROJECT_LABELS[d.project] || d.project}</strong></p>
        <p class="small">Páginas: ${d.pages} | Certificados lidos: ${d.records}</p>
        <p class="small">Lotes: ${d.lots.slice(0, 22).map(displayLot).join(', ')}${d.lots.length > 22 ? '...' : ''}</p>
        ${d.warnings.length ? `<ul>${d.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>` : ''}
      </div>`).join('');

    const s = state.sheetDiagnostics;
    const sheetCard = s ? `
      <div class="diagnostic-card">
        <h3>${escapeHtml(s.fileName)}</h3>
        <p class="small">Aba: <strong>${escapeHtml(s.sheetName)}</strong> | Linha de cabeçalho: ${s.headerRow}</p>
        <p class="small">Registros lidos: ${s.records} | Linhas totais: ${s.rows}</p>
        <p class="small">Projetos: ${s.projects.map((p) => PROJECT_LABELS[p] || p).join(', ')}</p>
        <details>
          <summary>Colunas reconhecidas</summary>
          <ul>${Object.entries(s.columnsFound).map(([k, v]) => `<li><strong>${escapeHtml(k)}</strong>: ${escapeHtml(v)}</li>`).join('')}</ul>
        </details>
      </div>` : '';

    const onlyPdfCard = onlyPdf.length ? `
      <div class="diagnostic-card">
        <h3>Lotes encontrados só no PDF</h3>
        <p class="small">Estes lotes foram lidos nos Data Books, mas não entraram na comparação porque não apareceram na planilha filtrada.</p>
        <p>${onlyPdf.map((lot) => `<span class="pill">${displayLot(lot)}</span>`).join(' ')}</p>
      </div>` : '';

    els.diagnostics.innerHTML = `${sheetCard}${pdfCards}${onlyPdfCard}`;
    els.diagnosticsSection.classList.remove('hidden');
  };

  const toCsvValue = (value) => {
    const s = String(value ?? '');
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const exportCsv = () => {
    if (!state.results.length) return;
    const header = ['lote', 'projeto', 'status', 'acerto_percentual', 'campos_ok', 'campos_total', 'divergencias', 'pdf_pagina', 'linha_planilha'];
    const rows = state.results.map((r) => [
      displayLot(r.lot), PROJECT_LABELS[r.project] || r.project, r.status, r.score, r.okCount, r.totalChecks,
      r.divergences, r.pdfPage, r.sheetRow
    ]);
    const csv = [header, ...rows].map((row) => row.map(toCsvValue).join(';')).join('\n');
    downloadBlob(csv, `comparacao_lotes_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
  };

  const exportJson = () => {
    if (!state.results.length) return;
    const payload = state.results.map((r) => ({
      lote: displayLot(r.lot),
      projeto: PROJECT_LABELS[r.project] || r.project,
      status: r.status,
      acertoPercentual: r.score,
      motivoClassificacao: r.reason,
      pdf: r.pdfRecord ? { arquivo: r.pdfRecord.fileName, pagina: r.pdfRecord.page } : null,
      linhaPlanilha: r.sheetRow,
      divergencias: r.checks.filter((c) => c.level !== 'OK'),
      comparacoes: r.checks
    }));
    downloadBlob(JSON.stringify(payload, null, 2), `comparacao_lotes_${new Date().toISOString().slice(0, 10)}.json`, 'application/json;charset=utf-8');
  };

  const downloadBlob = (content, fileName, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const resetResults = () => {
    state.pdfRecords = [];
    state.pdfDiagnostics = [];
    state.sheetRecords = [];
    state.sheetDiagnostics = null;
    state.results = [];
    state.filteredResults = [];
    els.resultsSection.classList.add('hidden');
    els.diagnosticsSection.classList.add('hidden');
    els.detailPanel.classList.add('hidden');
    els.statusPanel.innerHTML = '';
  };

  const analyze = async () => {
    try {
      resetResults();
      const pdfFiles = Array.from(els.pdfFiles.files || []);
      const xlsxFile = (els.xlsxFile.files || [])[0];
      const tolerance = parseNumber(els.tolerance.value) ?? 0.05;

      if (!pdfFiles.length) throw new Error('Selecione pelo menos um Data Book em PDF.');
      if (!xlsxFile) throw new Error('Selecione a planilha XLSX de controle.');

      els.analyzeBtn.disabled = true;
      setMessage(`Lendo ${pdfFiles.length} PDF(s) e a planilha. Isso pode levar alguns segundos em Data Books grandes...`, 'loading');

      const pdfOutputs = [];
      for (const [index, file] of pdfFiles.entries()) {
        setMessage(`Lendo PDF ${index + 1}/${pdfFiles.length}: <strong>${escapeHtml(file.name)}</strong>`, 'loading');
        pdfOutputs.push(await parsePdfFile(file));
      }
      state.pdfRecords = pdfOutputs.flatMap((out) => out.records);
      state.pdfDiagnostics = pdfOutputs.map((out) => out.diagnostics);

      setMessage(`Lendo planilha: <strong>${escapeHtml(xlsxFile.name)}</strong>`, 'loading');
      const sheetOutput = await parseSheetFile(xlsxFile, els.headerMode.value);
      state.sheetRecords = sheetOutput.records;
      state.sheetDiagnostics = sheetOutput.diagnostics;

      const { results, onlyPdf } = compareRecords(state.sheetRecords, state.pdfRecords, tolerance, els.projectFilter.value);
      state.results = results;
      renderSummary(results, onlyPdf);
      renderResultsTable();
      renderDiagnostics(onlyPdf);
      els.resultsSection.classList.remove('hidden');

      setMessage(`Comparação concluída: <strong>${results.length}</strong> lote(s) analisado(s), <strong>${state.pdfRecords.length}</strong> certificado(s) lido(s) nos PDF(s) e <strong>${state.sheetRecords.length}</strong> linha(s) de produção lida(s) na planilha.`, 'success');
    } catch (err) {
      console.error(err);
      setMessage(`<strong>Não consegui concluir:</strong> ${escapeHtml(err.message || err)}`, 'error');
    } finally {
      els.analyzeBtn.disabled = false;
    }
  };

  els.analyzeBtn.addEventListener('click', analyze);
  els.exportCsvBtn.addEventListener('click', exportCsv);
  els.exportJsonBtn.addEventListener('click', exportJson);
  els.clearBtn.addEventListener('click', resetResults);
  els.searchInput.addEventListener('input', renderResultsTable);
  els.statusFilter.addEventListener('change', renderResultsTable);
  els.resultTableBody.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-detail]');
    if (btn) renderDetail(btn.getAttribute('data-detail'));
  });
})();
