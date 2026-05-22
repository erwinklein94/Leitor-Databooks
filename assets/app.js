(() => {
  'use strict';

  const state = {
    pdfRecords: [],
    pdfDiagnostics: [],
    sheetRecords: [],
    sheetDiagnostics: null,
    results: [],
    filteredResults: [],
    activeTab: 'classification'
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
    readbackTableBody: document.querySelector('#readbackTable tbody'),
    detailPanel: $('detailPanel'),
    diagnostics: $('diagnostics'),
    projectFilter: $('projectFilter'),
    tolerance: $('tolerance'),
    headerMode: $('headerMode'),
    exportCsvBtn: $('exportCsvBtn'),
    exportJsonBtn: $('exportJsonBtn'),
    clearBtn: $('clearBtn'),
    searchInput: $('searchInput'),
    statusFilter: $('statusFilter'),
    tabButtons: document.querySelectorAll('[data-tab]'),
    classificationPanel: $('classificationPanel'),
    readbackPanel: $('readbackPanel')
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
    lot: 'Lote',
    project: 'Projeto',
    type: 'Tipo de dormente',
    productionDate: 'Data de produção/fabricação',
    chumbadores: 'Lote de ombreiras/chumbadores',
    transferencia: 'Transferência da protensão / desprotensão',
    tempoCura: 'Tempo de cura',
    tempMax: 'Temperatura máxima',
    tempHourlyVariation: 'Variação máxima por hora',
    tempSpread: 'Variação máxima na leitura',
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

  const parseDurationHours = (value) => {
    if (value === null || value === undefined || value === '' || value === '_') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.getUTCHours() + value.getUTCMinutes() / 60 + value.getUTCSeconds() / 3600;
    }
    const raw = String(value).trim();
    const normalized = normText(raw);
    const timeMatch = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (timeMatch) {
      return Number(timeMatch[1]) + Number(timeMatch[2]) / 60 + Number(timeMatch[3] || 0) / 3600;
    }
    const n = parseNumber(value);
    if (n === null) return null;
    if (/DIA|DIAS/.test(normalized)) return n * 24;
    // A planilha costuma guardar "TEMPO DE CURA (Horas)" como fração de dia do Excel.
    if (n > 0 && n < 2) return n * 24;
    return n;
  };

  const formatHours = (hours) => {
    if (hours === null || hours === undefined || Number.isNaN(hours)) return '';
    return `${formatNumber(hours)} h`;
  };

  const timeToHours = (time) => {
    const m = String(time || '').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    return Number(m[1]) + Number(m[2]) / 60 + Number(m[3] || 0) / 3600;
  };

  const summarizeTemperatures = (readings) => {
    const validReadings = (readings || [])
      .map((r) => ({ ...r, temps: (r.temps || []).filter((n) => n !== null && Number.isFinite(n)) }))
      .filter((r) => r.temps.length);
    const allTemps = validReadings.flatMap((r) => r.temps);
    if (!allTemps.length) {
      return { readings: [], maxTemp: null, maxTempAt: '', maxSpread: null, maxSpreadAt: '', maxHourlyVariation: null, maxHourlyInfo: '' };
    }

    let maxTemp = -Infinity;
    let maxTempAt = '';
    validReadings.forEach((r) => {
      r.temps.forEach((t, index) => {
        if (t > maxTemp) {
          maxTemp = t;
          maxTempAt = `${r.time || 'leitura'}${r.labels && r.labels[index] ? ` (${r.labels[index]})` : ''}`;
        }
      });
    });

    let maxSpread = null;
    let maxSpreadAt = '';
    validReadings.forEach((r) => {
      if (r.temps.length < 2) return;
      const spread = Math.max(...r.temps) - Math.min(...r.temps);
      if (maxSpread === null || spread > maxSpread) {
        maxSpread = spread;
        maxSpreadAt = r.time || 'leitura';
      }
    });

    let maxHourlyVariation = null;
    let maxHourlyInfo = '';
    const maxSensors = Math.max(...validReadings.map((r) => r.temps.length));
    for (let sensor = 0; sensor < maxSensors; sensor++) {
      const points = validReadings
        .map((r) => ({ time: r.time || '', hours: r.hours ?? timeToHours(r.time), temp: r.temps[sensor], label: r.labels && r.labels[sensor] ? r.labels[sensor] : `posição ${sensor + 1}` }))
        .filter((pnt) => pnt.hours !== null && pnt.temp !== undefined && Number.isFinite(pnt.temp))
        .sort((a, b) => a.hours - b.hours);
      for (let i = 1; i < points.length; i++) {
        const dt = points[i].hours - points[i - 1].hours;
        if (dt <= 0) continue;
        const hourly = Math.abs(points[i].temp - points[i - 1].temp) / dt;
        if (maxHourlyVariation === null || hourly > maxHourlyVariation) {
          maxHourlyVariation = hourly;
          maxHourlyInfo = `${points[i - 1].time} → ${points[i].time} (${points[i].label})`;
        }
      }
    }

    return { readings: validReadings, maxTemp, maxTempAt, maxSpread, maxSpreadAt, maxHourlyVariation, maxHourlyInfo };
  };

  const formatTemperatureSummary = (summary) => {
    if (!summary || summary.maxTemp === null || summary.maxTemp === undefined) return 'Não lido';
    const parts = [`máx. ${formatNumber(summary.maxTemp)} ºC${summary.maxTempAt ? ` em ${summary.maxTempAt}` : ''}`];
    if (summary.maxHourlyVariation !== null && summary.maxHourlyVariation !== undefined) {
      parts.push(`variação máx. por hora ${formatNumber(summary.maxHourlyVariation)} ºC/h${summary.maxHourlyInfo ? ` (${summary.maxHourlyInfo})` : ''}`);
    }
    if (summary.maxSpread !== null && summary.maxSpread !== undefined) {
      parts.push(`variação máx. na mesma leitura ${formatNumber(summary.maxSpread)} ºC${summary.maxSpreadAt ? ` às ${summary.maxSpreadAt}` : ''}`);
    }
    return parts.join('; ');
  };

  const formatStrengthBlock = (source) => {
    const comp7 = source.comp7 || [];
    const comp14 = source.comp14 || [];
    const comp28 = source.comp28 || [];
    const transferencia = source.transferencia || [];
    return [
      transferencia.length ? `Transf.: ${formatNumberList(transferencia)}` : '',
      comp7.length ? `7d: ${formatNumberList(comp7)}` : '',
      comp14.length ? `14d: ${formatNumberList(comp14)}` : '',
      comp28.length ? `28d: ${formatNumberList(comp28)}` : ''
    ].filter(Boolean).join(' | ') || 'Não lido';
  };

  const formatTractionBlock = (source) => {
    const tracao14 = source.tracao14 || [];
    const tracao28 = source.tracao28 || [];
    return [
      tracao14.length ? `14d: ${formatNumberList(tracao14)}` : '',
      tracao28.length ? `28d: ${formatNumberList(tracao28)}` : ''
    ].filter(Boolean).join(' | ') || 'Não lido';
  };

  const formatCureAndTemperatureBlock = (record, source) => {
    if (!record) return 'Não encontrado';
    const concrete = record.concrete || {};
    const cureHours = record.tempoCuraHours ?? concrete.curaHoras;
    const rawCure = record.tempoCuraRaw || concrete.curaRaw || '';
    const tempSummary = record.temperatureSummary || { maxTemp: null };
    const parts = [];
    if (cureHours !== null && cureHours !== undefined) parts.push(`Tempo cura: ${formatHours(cureHours)}${rawCure ? ` (${rawCure})` : ''}`);
    else if (rawCure) parts.push(`Tempo cura: ${rawCure}`);
    else parts.push('Tempo cura: não lido');
    parts.push(`Temperatura: ${formatTemperatureSummary(tempSummary)}`);
    if (source === 'pdf' && record.temperatureReadings && record.temperatureReadings.length) {
      parts.push(`${record.temperatureReadings.length} leitura(s) de temperatura`);
    }
    return parts.join(' | ');
  };

  const levelToUiClass = (level) => {
    if (level === 'OK') return 'ok';
    if (level === 'WARN') return 'warn';
    if (level === 'FAIL') return 'bad';
    return 'neutral';
  };

  const getCheckLevelMap = (checks = []) => {
    const map = new Map();
    checks.forEach((check) => map.set(check.field, check));
    return map;
  };

  const getMetricDisplay = (record, field) => {
    if (!record) return { value: 'Não encontrado', note: '' };
    const concrete = record.concrete || record || {};
    const tempSummary = record.temperatureSummary || {};
    const mapArray = (arr) => (arr && arr.length ? formatNumberList(arr) : 'Não lido');

    switch (field) {
      case 'transferencia':
        return { value: mapArray(concrete.transferencia || []), note: '' };
      case 'comp7':
        return { value: mapArray(concrete.comp7 || []), note: '' };
      case 'comp14':
        return { value: mapArray(concrete.comp14 || []), note: '' };
      case 'comp28':
        return { value: mapArray(concrete.comp28 || []), note: '' };
      case 'tracao14':
        return { value: mapArray(concrete.tracao14 || []), note: '' };
      case 'tracao28':
        return { value: mapArray(concrete.tracao28 || []), note: '' };
      case 'tempoCura': {
        const cureHours = record.tempoCuraHours ?? concrete.curaHoras;
        const rawCure = record.tempoCuraRaw || concrete.curaRaw || '';
        if (cureHours !== null && cureHours !== undefined) {
          return { value: formatHours(cureHours), note: rawCure && !String(rawCure).includes(String(cureHours)) ? rawCure : '' };
        }
        return { value: rawCure || 'Não lido', note: '' };
      }
      case 'tempMax':
        return {
          value: tempSummary.maxTemp === null || tempSummary.maxTemp === undefined ? 'Não lido' : `${formatNumber(tempSummary.maxTemp)} ºC`,
          note: tempSummary.maxTempAt || ''
        };
      case 'tempHourlyVariation':
        return {
          value: tempSummary.maxHourlyVariation === null || tempSummary.maxHourlyVariation === undefined ? 'Não lido' : `${formatNumber(tempSummary.maxHourlyVariation)} ºC/h`,
          note: tempSummary.maxHourlyInfo || ''
        };
      case 'tempSpread':
        return {
          value: tempSummary.maxSpread === null || tempSummary.maxSpread === undefined ? 'Não lido' : `${formatNumber(tempSummary.maxSpread)} ºC`,
          note: tempSummary.maxSpreadAt ? `às ${tempSummary.maxSpreadAt}` : ''
        };
      default:
        return { value: 'Não lido', note: '' };
    }
  };

  const renderMetricCards = (record, fields, checkMap, emptyText = 'Não encontrado') => {
    if (!record) return `<div class="metric-card-grid"><div class="metric-card metric-card--empty"><div class="metric-card__value">${escapeHtml(emptyText)}</div></div></div>`;
    return `<div class="metric-card-grid">${fields.map(({ field, title, unit }) => {
      const info = getMetricDisplay(record, field);
      const check = checkMap.get(field);
      const uiClass = levelToUiClass(check?.level);
      const badgeText = check?.level === 'FAIL' ? 'Divergente' : check?.level === 'WARN' ? 'Parcial' : check?.level === 'OK' ? 'Igual' : '';
      const value = info.value || 'Não lido';
      return `
        <div class="metric-card ${uiClass !== 'neutral' ? `metric-card--${uiClass}` : ''}">
          <div class="metric-card__head">
            <span class="metric-card__title">${escapeHtml(title)}</span>
            ${badgeText ? `<span class="metric-chip metric-chip--${uiClass}">${badgeText}</span>` : ''}
          </div>
          <div class="metric-card__value">${escapeHtml(value)}${unit && value !== 'Não lido' && !String(value).includes(unit) ? ` <span class="metric-card__unit">${escapeHtml(unit)}</span>` : ''}</div>
          ${info.note ? `<div class="metric-card__note">${escapeHtml(info.note)}</div>` : ''}
        </div>`;
    }).join('')}</div>`;
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
    const concrete = { transferencia: [], comp7: [], comp14: [], tracao14: [], comp28: [], tracao28: [], curaRaw: '', curaDias: null, curaHoras: null };
    const lineRegex = /(^|\s)(0[,.]\d+|0|7|14|28)\s+dias\s+(-?\d+(?:[,.]\d+)?)\s+(-?\d+(?:[,.]\d+)?)(?:\s+(-?\d+(?:[,.]\d+)?)\s+(-?\d+(?:[,.]\d+)?))?/i;

    for (const line of lines) {
      const m = line.match(lineRegex);
      if (!m) continue;
      const dayRaw = m[2];
      const day = dayRaw.replace(',', '.');
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
        concrete.curaRaw = `${dayRaw} dias`;
        concrete.curaDias = parseNumber(dayRaw);
        concrete.curaHoras = concrete.curaDias !== null ? concrete.curaDias * 24 : null;
      }
    }
    return concrete;
  };

  const extractTemperatureReadings = (lines) => {
    const start = lines.findIndex((line) => /ACOMPANHAMENTO\s+DE\s+TEMPERATURA/i.test(line));
    if (start < 0) return [];
    const end = lines.findIndex((line, index) => index > start && /PAR[ÂA]METROS\s+DIMENSIONAIS/i.test(line));
    const relevant = lines.slice(start, end > start ? end : lines.length);
    const readings = [];
    for (const line of relevant) {
      const m = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/);
      if (!m) continue;
      if (!/[º°]\s*C/i.test(m[2])) continue;
      const temps = (m[2].match(/-?\d{1,3}(?:[,.]\d+)?\s*(?:º\s*C|°\s*C|C)?/gi) || [])
        .map((token) => parseNumber(token.replace(/[º°]?\s*C/gi, '')))
        .filter((n) => n !== null && n > -30 && n < 120)
        .slice(0, 3);
      if (!temps.length) continue;
      readings.push({
        time: m[1],
        hours: timeToHours(m[1]),
        temps,
        labels: ['Início', 'Meio', 'Fim'].slice(0, temps.length)
      });
    }
    return readings;
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
    const temperatureReadings = extractTemperatureReadings(lines);
    const temperatureSummary = summarizeTemperatures(temperatureReadings);
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
      temperatureReadings,
      temperatureSummary,
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
      tempInicial: findCol(/TEMPERATURA/, /INICIAL|INICIO/),
      tempMeio: findCol(/TEMPERATURA/, /MEIO/),
      tempFinal: findCol(/TEMPERATURA/, /FINAL|FIM/),
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
      const tempValues = [getCell(row, cols.tempInicial), getCell(row, cols.tempMeio), getCell(row, cols.tempFinal)]
        .map(parseNumber)
        .filter((n) => n !== null);
      const temperatureReadings = tempValues.length ? [{ time: 'Planilha', hours: null, temps: tempValues, labels: ['Inicial', 'Meio', 'Final'].slice(0, tempValues.length) }] : [];
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
        tempoCuraRaw: normalizeSpaces(getCell(row, cols.tempoCura)),
        tempoCuraHours: parseDurationHours(getCell(row, cols.tempoCura)),
        temperatureReadings,
        temperatureSummary: summarizeTemperatures(temperatureReadings),
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

  const makeCheck = (field, pdfValue, sheetValue, level, note = '', extra = {}) => ({
    field,
    label: FIELD_LABELS[field] || field,
    pdfValue: pdfValue ?? '',
    sheetValue: sheetValue ?? '',
    level,
    note,
    critical: CRITICAL_FIELDS.has(field),
    ...extra
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


  const compareDuration = (pdfHours, sheetHours, toleranceHours = 0.5) => {
    const pdfText = formatHours(pdfHours);
    const sheetText = formatHours(sheetHours);
    if ((pdfHours === null || pdfHours === undefined) && (sheetHours === null || sheetHours === undefined)) {
      return makeCheck('tempoCura', '', '', 'WARN', 'Tempo de cura não foi lido em nenhuma das fontes.', { skipScore: true });
    }
    if (pdfHours === null || pdfHours === undefined || sheetHours === null || sheetHours === undefined) {
      return makeCheck('tempoCura', pdfText, sheetText, 'WARN', 'Tempo de cura ausente em uma das fontes.');
    }
    const diff = Math.abs(pdfHours - sheetHours);
    return diff <= toleranceHours
      ? makeCheck('tempoCura', pdfText, sheetText, 'OK', `Diferença de ${formatNumber(diff)} h dentro da tolerância ${formatNumber(toleranceHours)} h.`)
      : makeCheck('tempoCura', pdfText, sheetText, 'FAIL', `Diferença de ${formatNumber(diff)} h fora da tolerância ${formatNumber(toleranceHours)} h.`);
  };


  const comparePdfTemperatureLimits = (pdfRecord, options = {}) => {
    const summary = pdfRecord?.temperatureSummary || {};
    const extra = options.skipScore ? { skipScore: true } : {};
    const checks = [];

    if (summary.maxTemp === null || summary.maxTemp === undefined) {
      checks.push(makeCheck('tempMax', 'Não lido', 'Limite: 60 ºC', 'WARN', 'Temperatura máxima não foi lida no Data Book.', extra));
    } else if (summary.maxTemp <= 60) {
      checks.push(makeCheck('tempMax', `${formatNumber(summary.maxTemp)} ºC${summary.maxTempAt ? ` em ${summary.maxTempAt}` : ''}`, 'Limite: 60 ºC', 'OK', 'Temperatura máxima dentro do limite de 60 ºC.', extra));
    } else {
      checks.push(makeCheck('tempMax', `${formatNumber(summary.maxTemp)} ºC${summary.maxTempAt ? ` em ${summary.maxTempAt}` : ''}`, 'Limite: 60 ºC', 'FAIL', 'Temperatura máxima ultrapassou 60 ºC.', { ...extra, critical: true }));
    }

    if (summary.maxHourlyVariation === null || summary.maxHourlyVariation === undefined) {
      checks.push(makeCheck('tempHourlyVariation', 'Não lido', 'Limite: 20 ºC/h', 'WARN', 'Variação de temperatura por hora não foi lida no Data Book.', extra));
    } else if (summary.maxHourlyVariation <= 20) {
      checks.push(makeCheck('tempHourlyVariation', `${formatNumber(summary.maxHourlyVariation)} ºC/h${summary.maxHourlyInfo ? ` (${summary.maxHourlyInfo})` : ''}`, 'Limite: 20 ºC/h', 'OK', 'Variação máxima por hora dentro do limite de 20 ºC/h.', extra));
    } else {
      checks.push(makeCheck('tempHourlyVariation', `${formatNumber(summary.maxHourlyVariation)} ºC/h${summary.maxHourlyInfo ? ` (${summary.maxHourlyInfo})` : ''}`, 'Limite: 20 ºC/h', 'FAIL', 'Variação de temperatura ultrapassou 20 ºC dentro de uma hora.', { ...extra, critical: true }));
    }

    return checks;
  };

  const compareTemperatureMetric = (field, pdfValue, sheetValue, toleranceTemp = 0.5) => {
    const pdfText = pdfValue === null || pdfValue === undefined ? '' : `${formatNumber(pdfValue)} ºC`;
    const sheetText = sheetValue === null || sheetValue === undefined ? '' : `${formatNumber(sheetValue)} ºC`;
    if ((pdfValue === null || pdfValue === undefined) && (sheetValue === null || sheetValue === undefined)) {
      return makeCheck(field, '', '', 'WARN', 'Temperatura não lida nas duas fontes.', { skipScore: true });
    }
    if (pdfValue === null || pdfValue === undefined || sheetValue === null || sheetValue === undefined) {
      return makeCheck(field, pdfText, sheetText, 'WARN', 'Temperatura ausente em uma das fontes.', { skipScore: true });
    }
    const diff = Math.abs(pdfValue - sheetValue);
    return diff <= toleranceTemp
      ? makeCheck(field, pdfText, sheetText, 'OK', `Diferença de ${formatNumber(diff)} ºC.`)
      : makeCheck(field, pdfText, sheetText, 'FAIL', `Diferença de ${formatNumber(diff)} ºC.`, { skipScore: false });
  };

  const buildReadback = (pdfRecord, sheetRecord, tolerance) => {
    if (!sheetRecord) {
      const checks = [
        makeCheck('lot', displayLot(pdfRecord.lot), 'Não encontrado', 'FAIL', 'Lote do Data Book não existe na planilha.'),
        ...comparePdfTemperatureLimits(pdfRecord, { skipScore: true })
      ];
      return { checks, score: 0, okCount: 0, totalChecks: 1 };
    }

    const pdfConcrete = pdfRecord.concrete || {};
    const sheetConcrete = {
      transferencia: sheetRecord.transferencia || [],
      comp7: sheetRecord.comp7 || [],
      comp14: sheetRecord.comp14 || [],
      comp28: sheetRecord.comp28 || [],
      tracao14: sheetRecord.tracao14 || [],
      tracao28: sheetRecord.tracao28 || []
    };
    const checks = [
      makeCheck('lot', displayLot(pdfRecord.lot), displayLot(sheetRecord.lot), pdfRecord.lot === sheetRecord.lot ? 'OK' : 'FAIL', pdfRecord.lot === sheetRecord.lot ? 'Lotes iguais.' : 'Lotes diferentes.'),
      compareType(pdfRecord, sheetRecord),
      compareDates(pdfRecord.productionDate, sheetRecord.productionDate),
      compareDuration(pdfConcrete.curaHoras, sheetRecord.tempoCuraHours, 0.5),
      compareNumberArrays('comp7', pdfConcrete.comp7, sheetConcrete.comp7, tolerance),
      compareNumberArrays('comp14', pdfConcrete.comp14, sheetConcrete.comp14, tolerance),
      compareNumberArrays('comp28', pdfConcrete.comp28, sheetConcrete.comp28, tolerance),
      compareNumberArrays('tracao14', pdfConcrete.tracao14, sheetConcrete.tracao14, tolerance),
      compareNumberArrays('tracao28', pdfConcrete.tracao28, sheetConcrete.tracao28, tolerance),
      ...comparePdfTemperatureLimits(pdfRecord, { skipScore: true })
    ].filter(Boolean);

    const countable = checks.filter((c) => !c.skipScore);
    const okCount = countable.filter((c) => c.level === 'OK').length;
    const totalChecks = countable.length;
    const score = totalChecks ? Math.round((okCount / totalChecks) * 100) : 0;
    return { checks, score, okCount, totalChecks };
  };

  const chooseSheetRecord = (pdfRecord, sheetRecordsByLot) => {
    const candidates = sheetRecordsByLot.get(pdfRecord.lot) || [];
    if (!candidates.length) return null;
    const sameProject = candidates.find((r) => r.project === pdfRecord.project);
    return sameProject || candidates[0];
  };

  const classifyResult = (checks) => {
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
    const sheetRecordsByLot = new Map();
    sheetRecords.forEach((r) => {
      if (!sheetRecordsByLot.has(r.lot)) sheetRecordsByLot.set(r.lot, []);
      sheetRecordsByLot.get(r.lot).push(r);
    });

    // Regra operacional: o Data Book é a base da auditoria.
    // Lotes que existem apenas na planilha são ignorados, porque podem pertencer a outro Data Book.
    // Lotes que existem no Data Book e não existem na planilha viram erro.
    const filteredPdfRecords = pdfRecords.filter((record) => projectFilter === 'TODOS' || record.project === projectFilter);

    const results = filteredPdfRecords.map((pdfRecord, idx) => {
      const sheetRecord = chooseSheetRecord(pdfRecord, sheetRecordsByLot);
      let checks = [];
      let classification;

      if (sheetRecord) {
        checks = [
          compareSimpleText('project', PROJECT_LABELS[pdfRecord.project], PROJECT_LABELS[sheetRecord.project]),
          compareType(pdfRecord, sheetRecord),
          compareDates(pdfRecord.productionDate, sheetRecord.productionDate),
          compareChumbadores(pdfRecord, sheetRecord),
          compareNumberArrays('transferencia', pdfRecord.concrete.transferencia, sheetRecord.transferencia, tolerance, true),
          compareDuration(pdfRecord.concrete.curaHoras, sheetRecord.tempoCuraHours, 0.5),
          ...comparePdfTemperatureLimits(pdfRecord),
          compareNumberArrays('comp7', pdfRecord.concrete.comp7, sheetRecord.comp7, tolerance),
          compareNumberArrays('comp14', pdfRecord.concrete.comp14, sheetRecord.comp14, tolerance),
          compareNumberArrays('tracao14', pdfRecord.concrete.tracao14, sheetRecord.tracao14, tolerance),
          compareNumberArrays('comp28', pdfRecord.concrete.comp28, sheetRecord.comp28, tolerance),
          compareNumberArrays('tracao28', pdfRecord.concrete.tracao28, sheetRecord.tracao28, tolerance),
          comparePdfApprovals(pdfRecord),
          compareSheetStatus(sheetRecord)
        ].filter(Boolean);
        classification = classifyResult(checks);
      } else {
        checks = [
          makeCheck('sheetStatus', `${pdfRecord.fileName}, pág. ${pdfRecord.page}`, 'Não encontrado', 'FAIL', 'Lote existe no Data Book, mas não foi encontrado na planilha.')
        ];
        classification = { status: 'RUIM', score: 0, reason: 'Lote está no Data Book, mas não foi encontrado na planilha.' };
      }

      const readback = buildReadback(pdfRecord, sheetRecord, tolerance);
      const okCount = checks.filter((c) => c.level === 'OK').length;
      const failOrWarn = checks.filter((c) => c.level !== 'OK');
      return {
        id: `res-${idx}`,
        lot: pdfRecord.lot,
        project: pdfRecord.project,
        status: classification.status,
        score: classification.score,
        reason: classification.reason,
        okCount,
        totalChecks: checks.length,
        divergences: failOrWarn.map((c) => `${c.label}: ${c.note}`).join(' | '),
        pdfPage: `${pdfRecord.fileName}, pág. ${pdfRecord.page}`,
        sheetRow: sheetRecord ? sheetRecord.rowNumber : 'Não encontrado',
        pdfRecord,
        sheetRecord,
        checks,
        readback
      };
    });

    const pdfLots = new Set(filteredPdfRecords.map((r) => r.lot));
    const sheetLotsInFilter = new Set(
      sheetRecords
        .filter((r) => projectFilter === 'TODOS' || r.project === projectFilter)
        .map((r) => r.lot)
    );
    const onlyPdf = Array.from(pdfLots).filter((lot) => !sheetLotsInFilter.has(lot)).sort();
    const ignoredSheetOnly = Array.from(sheetLotsInFilter).filter((lot) => !pdfLots.has(lot)).sort();
    return { results, onlyPdf, ignoredSheetOnly };
  };

  const setActiveTab = (tab) => {
    state.activeTab = tab;
    els.tabButtons.forEach((button) => {
      const active = button.getAttribute('data-tab') === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (els.classificationPanel) els.classificationPanel.classList.toggle('hidden', tab !== 'classification');
    if (els.readbackPanel) els.readbackPanel.classList.toggle('hidden', tab !== 'readback');
  };

  const renderSummary = (results, onlyPdf = [], ignoredSheetOnly = []) => {
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
      { label: 'Só no Data Book', value: onlyPdf.length, cls: onlyPdf.length ? 'bad' : '' },
      { label: 'Só na planilha ignorados', value: ignoredSheetOnly.length, cls: '' }
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
      renderReadbackTable();
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
    renderReadbackTable();
  };

  const renderReadbackTable = () => {
    if (!els.readbackTableBody) return;
    const rows = state.filteredResults;
    if (!rows.length) {
      els.readbackTableBody.innerHTML = '<tr><td colspan="13" class="small">Nenhum lote para mostrar com os filtros atuais.</td></tr>';
      return;
    }

    const strengthFields = [
      { field: 'transferencia', title: 'Transf.' },
      { field: 'comp7', title: '7 dias' },
      { field: 'comp14', title: '14 dias' },
      { field: 'comp28', title: '28 dias' }
    ];
    const pdfCureFields = [
      { field: 'tempoCura', title: 'Tempo de cura' },
      { field: 'tempMax', title: 'Temp. máxima' },
      { field: 'tempHourlyVariation', title: 'Var. máx./hora' },
      { field: 'tempSpread', title: 'Var. mesma leitura' }
    ];
    const sheetCureFields = [
      { field: 'tempoCura', title: 'Tempo de cura' }
    ];
    const tractionFields = [
      { field: 'tracao14', title: '14 dias' },
      { field: 'tracao28', title: '28 dias' }
    ];

    els.readbackTableBody.innerHTML = rows.map((r) => {
      const pdf = r.pdfRecord;
      const sheet = r.sheetRecord ? {
        ...r.sheetRecord,
        concrete: {
          transferencia: r.sheetRecord.transferencia || [],
          comp7: r.sheetRecord.comp7 || [],
          comp14: r.sheetRecord.comp14 || [],
          comp28: r.sheetRecord.comp28 || [],
          tracao14: r.sheetRecord.tracao14 || [],
          tracao28: r.sheetRecord.tracao28 || []
        }
      } : null;
      const checkMap = getCheckLevelMap(r.readback?.checks || []);
      const diverging = (r.readback?.checks || [])
        .filter((c) => c.level !== 'OK' && !c.skipScore)
        .map((c) => c.label)
        .join(', ') || 'Sem divergências nos campos desta aba';
      return `
        <tr>
          <td><strong>${displayLot(r.lot)}</strong><div class="small">${PROJECT_LABELS[r.project] || r.project}</div></td>
          <td><span class="badge ${getStatusClass(r.status)}">${r.status}</span><div class="small">Leitura: <strong>${r.readback?.score ?? 0}%</strong> (${r.readback?.okCount ?? 0}/${r.readback?.totalChecks ?? 0})</div></td>
          <td>${escapeHtml(pdf?.type || '-')}</td>
          <td>${escapeHtml(sheet?.type || '-')}</td>
          <td>${escapeHtml(formatDateBR(pdf?.productionDate) || '-')}</td>
          <td>${escapeHtml(formatDateBR(sheet?.productionDate) || '-')}</td>
          <td>${renderMetricCards(pdf, strengthFields, checkMap, 'Não lido no PDF')}</td>
          <td>${renderMetricCards(sheet, strengthFields, checkMap, 'Não lido na planilha')}</td>
          <td>${renderMetricCards(pdf, pdfCureFields, checkMap, 'Não lido no PDF')}</td>
          <td>${renderMetricCards(sheet, sheetCureFields, checkMap, 'Não lido na planilha')}</td>
          <td>${renderMetricCards(pdf, tractionFields, checkMap, 'Não lido no PDF')}</td>
          <td>${renderMetricCards(sheet, tractionFields, checkMap, 'Não lido na planilha')}</td>
          <td class="small">${escapeHtml(diverging)}</td>
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
          <p class="small"><strong>Planilha:</strong> ${r.sheetRecord ? `linha ${r.sheetRow}, status: ${escapeHtml(r.sheetRecord.statusRaw || '-')}` : 'lote não encontrado'}</p>
          ${r.sheetRecord && r.sheetRecord.motivo ? `<p class="small"><strong>Motivo/observação:</strong> ${escapeHtml(r.sheetRecord.motivo)}</p>` : ''}
          <details class="details-box" open>
            <summary>Texto extraído da página do PDF</summary>
            <pre class="raw-box">${pdfRaw}</pre>
          </details>
        </div>
      </div>`;
    els.detailPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const renderDiagnostics = (onlyPdf = [], ignoredSheetOnly = []) => {
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
        <h3>Lotes encontrados só no Data Book</h3>
        <p class="small">Estes lotes viram erro, porque aparecem no Data Book carregado e não foram encontrados na planilha.</p>
        <p>${onlyPdf.map((lot) => `<span class="pill">${displayLot(lot)}</span>`).join(' ')}</p>
      </div>` : '';

    const ignoredSheetCard = ignoredSheetOnly.length ? `
      <div class="diagnostic-card">
        <h3>Lotes ignorados porque estão só na planilha</h3>
        <p class="small">Estes lotes não existem nos PDFs carregados, então não são considerados erro do Data Book.</p>
        <p>${ignoredSheetOnly.map((lot) => `<span class="pill">${displayLot(lot)}</span>`).join(' ')}</p>
      </div>` : '';

    els.diagnostics.innerHTML = `${sheetCard}${pdfCards}${onlyPdfCard}${ignoredSheetCard}`;
    els.diagnosticsSection.classList.remove('hidden');
  };

  const toCsvValue = (value) => {
    const s = String(value ?? '');
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const exportCsv = () => {
    if (!state.results.length) return;
    const header = ['lote', 'projeto', 'status', 'acerto_percentual', 'acerto_leitura_percentual', 'campos_ok', 'campos_total', 'divergencias', 'pdf_pagina', 'linha_planilha', 'pdf_compressao', 'planilha_compressao', 'pdf_tempo_temperatura', 'planilha_tempo_temperatura', 'pdf_tracao', 'planilha_tracao'];
    const rows = state.results.map((r) => [
      displayLot(r.lot), PROJECT_LABELS[r.project] || r.project, r.status, r.score, r.readback?.score ?? '', r.okCount, r.totalChecks,
      r.divergences, r.pdfPage, r.sheetRow, formatStrengthBlock(r.pdfRecord?.concrete || {}), formatStrengthBlock(r.sheetRecord || {}),
      formatCureAndTemperatureBlock(r.pdfRecord, 'pdf'), formatCureAndTemperatureBlock(r.sheetRecord, 'sheet'),
      formatTractionBlock(r.pdfRecord?.concrete || {}), formatTractionBlock(r.sheetRecord || {})
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
      acertoLeituraPercentual: r.readback?.score ?? null,
      motivoClassificacao: r.reason,
      pdf: r.pdfRecord ? { arquivo: r.pdfRecord.fileName, pagina: r.pdfRecord.page } : null,
      linhaPlanilha: r.sheetRow,
      divergencias: r.checks.filter((c) => c.level !== 'OK'),
      comparacoes: r.checks,
      leituraLadoALado: r.readback
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
    if (els.readbackTableBody) els.readbackTableBody.innerHTML = '';
    setActiveTab('classification');
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

      const { results, onlyPdf, ignoredSheetOnly } = compareRecords(state.sheetRecords, state.pdfRecords, tolerance, els.projectFilter.value);
      state.results = results;
      renderSummary(results, onlyPdf, ignoredSheetOnly);
      renderResultsTable();
      renderDiagnostics(onlyPdf, ignoredSheetOnly);
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
  els.tabButtons.forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.getAttribute('data-tab')));
  });
  els.resultTableBody.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-detail]');
    if (btn) renderDetail(btn.getAttribute('data-detail'));
  });
})();
