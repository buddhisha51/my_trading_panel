import type { TradeDirection, TradeOutcome, TradeRecord, UpsertTradePayload } from '../types/journal';
import { normalizeTradePnl, normalizeTradeR } from './drawdownEngine';

export interface CsvParseResult {
  delimiter: ',' | ';' | '\t';
  parsedRows: UpsertTradePayload[];
  skippedRows: number;
  warnings: string[];
}

function stripBom(raw: string): string {
  return raw.replace(/^\uFEFF/, '');
}

/**
 * Detects CSV delimiter (`,`, `;`, or `\t`) by inspecting unquoted separator counts
 * on the header and first data line.
 */
export function detectCsvDelimiter(text: string): ',' | ';' | '\t' {
  const sampleLines = stripBom(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 5);

  const candidates: Array<',' | ';' | '\t'> = ['\t', ';', ','];
  let best: ',' | ';' | '\t' = ',';
  let bestScore = -1;

  for (const delim of candidates) {
    let score = 0;
    for (const line of sampleLines) {
      let inQuotes = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') inQuotes = !inQuotes;
        else if (!inQuotes && ch === delim) score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = delim;
    }
  }
  return bestScore > 0 ? best : ',';
}

export function splitCsvLines(text: string, delimiter: string): string[][] {
  const clean = stripBom(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
      i += 1;
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  row.push(cell.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

/**
 * Normalizes real-world MT5 / Prop-firm numeric strings:
 * strips currency symbols (`$`, `€`, `£`), spaces (`-1 250.50` / `1 000,25`),
 * parentheses negatives (`(150.00)` -> `-150`), and EU comma decimals when unambiguous.
 */
export function parseBrokerNumber(raw: string | undefined | null): number | null {
  if (!raw) return null;
  let text = raw.trim();
  if (!text || text === '-' || text === '--') return null;

  let neg = false;
  if (text.startsWith('(') && text.endsWith(')')) {
    neg = true;
    text = text.slice(1, -1).trim();
  }

  // Strip currency markers, narrow/non-breaking spaces, and regular spaces used as thousand separators
  text = text.replace(/[$€£¥USD\u00A0\u202F\s]/gi, '');
  if (text.startsWith('+')) text = text.slice(1);
  if (text.startsWith('-')) {
    neg = !neg;
    text = text.slice(1);
  }

  // If both `,` and `.` appear, whichever comes last is decimal separator
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    // Only comma present: treat as decimal if <=2 digits after comma or no dot exists (e.g. EU `1250,50`)
    const decimalsLen = text.length - lastComma - 1;
    if (decimalsLen <= 5) {
      text = text.replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  }

  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  return neg ? -Math.abs(parsed) : parsed;
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function parseDirectionToken(raw: string | undefined): TradeDirection | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === 'buy' || v === 'long' || v === 'b') return 'long';
  if (v === 'sell' || v === 'short' || v === 's') return 'short';
  return null;
}

function parseOutcomeToken(raw: string | undefined, pnl: number | null): TradeOutcome {
  if (raw) {
    const v = raw.trim().toLowerCase();
    if (v === 'win' || v === 'loss' || v === 'breakeven' || v === 'partial') {
      return v;
    }
  }
  if (pnl === null || Math.abs(pnl) < 1e-6) return 'breakeven';
  return pnl > 0 ? 'win' : 'loss';
}

function normalizeIsoDateLike(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Convert MT5 `2026.11.20 14:35:00` -> ISO-8601 UTC string
  const mt5Match = trimmed.match(/^(\d{4})\.(\d{2})\.(\d{2})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?/);
  if (mt5Match) {
    const datePart = `${mt5Match[1]}-${mt5Match[2]}-${mt5Match[3]}`;
    const timePart = mt5Match[4] ? (mt5Match[4].length === 5 ? `${mt5Match[4]}:00` : mt5Match[4]) : '00:00:00';
    return `${datePart}T${timePart}Z`;
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseBrokerTradesCsv(rawText: string): CsvParseResult {
  const delimiter = detectCsvDelimiter(rawText);
  const grid = splitCsvLines(rawText, delimiter);
  if (grid.length < 2) {
    return {
      delimiter,
      parsedRows: [],
      skippedRows: 0,
      warnings: ['CSV needs a header row and at least one trade row.'],
    };
  }

  const headers = grid[0].map(normalizeHeader);
  const findCol = (aliases: string[]): number => {
    for (const a of aliases) {
      const idx = headers.indexOf(a);
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const pairCol = findCol(['pair', 'symbol', 'instrument', 'item', 'ticker']);
  const dirCol = findCol(['direction', 'type', 'side', 'cmd', 'action']);
  const lotsCol = findCol(['lots', 'lotsize', 'volume', 'size', 'qty', 'quantity']);
  const pnlCol = findCol(['pnl', 'pnldollars', 'profit', 'netprofit', 'netpl', 'pl']);
  const rCol = findCol(['rmultiple', 'r', 'rr']);
  const outcomeCol = findCol(['outcome', 'result', 'status']);
  const entryCol = findCol(['entry', 'entryprice', 'openprice', 'open']);
  const slCol = findCol(['sl', 'stoploss']);
  const tpCol = findCol(['tp', 'takeprofit']);
  const entryTimeCol = findCol(['entrytime', 'opentime', 'time', 'date']);
  const exitTimeCol = findCol(['exittime', 'closetime']);
  const sessionCol = findCol(['session', 'killzone']);
  const notesCol = findCol(['notes', 'comment', 'comments']);

  const warnings: string[] = [];
  if (pairCol < 0 || pnlCol < 0) {
    warnings.push('Could not identify both Symbol/Pair and Profit/PnL columns.');
    return { delimiter, parsedRows: [], skippedRows: grid.length - 1, warnings };
  }

  const parsedRows: UpsertTradePayload[] = [];
  let skippedRows = 0;

  for (let r = 1; r < grid.length; r += 1) {
    const row = grid[r];
    const rawPair = (row[pairCol] ?? '').trim().toUpperCase();
    if (!rawPair || rawPair === 'BALANCE' || rawPair === 'CREDIT') {
      skippedRows += 1;
      continue;
    }

    const dir =
      (dirCol >= 0 ? parseDirectionToken(row[dirCol]) : null) ??
      ((row[dirCol] ?? '').trim() === '' ? 'long' : null);
    if (!dir) {
      // Skip non-trade rows like MT5 balance/deposit/withdrawal rows
      skippedRows += 1;
      continue;
    }

    const pnl = parseBrokerNumber(row[pnlCol]);
    if (pnl === null) {
      skippedRows += 1;
      continue;
    }

    const outcome = parseOutcomeToken(outcomeCol >= 0 ? row[outcomeCol] : undefined, pnl);
    const lots = lotsCol >= 0 ? parseBrokerNumber(row[lotsCol]) : null;
    const rMult = rCol >= 0 ? parseBrokerNumber(row[rCol]) : null;

    parsedRows.push({
      pair: rawPair.replace(/[^A-Z0-9._-]/g, ''),
      direction: dir,
      entryPrice: entryCol >= 0 ? parseBrokerNumber(row[entryCol]) : null,
      stopLoss: slCol >= 0 ? parseBrokerNumber(row[slCol]) : null,
      takeProfit: tpCol >= 0 ? parseBrokerNumber(row[tpCol]) : null,
      lotSize: lots,
      outcome,
      pnlDollars: pnl,
      rMultiple: rMult,
      strategyId: null,
      notes: notesCol >= 0 ? row[notesCol] || null : null,
      screenshotPath: null,
      checklistSnapshot: null,
      setupGrade: null,
      entryTime: entryTimeCol >= 0 ? normalizeIsoDateLike(row[entryTimeCol]) : null,
      exitTime: exitTimeCol >= 0 ? normalizeIsoDateLike(row[exitTimeCol]) : null,
      session: sessionCol >= 0 ? row[sessionCol] || null : null,
    });
  }

  return { delimiter, parsedRows, skippedRows, warnings };
}

function escapeCsvCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportTradesToCsv(
  trades: TradeRecord[],
  accountName: string,
  strategyNamesById: Record<string, string>,
): string {
  const headers = [
    'ID',
    'Account',
    'Pair',
    'Direction',
    'Outcome',
    'PnL',
    'R',
    'Lots',
    'Entry',
    'SL',
    'TP',
    'Grade',
    'Playbook',
    'Session',
    'EntryTime',
    'ExitTime',
    'Notes',
  ];

  const lines = [headers.join(',')];
  for (const tr of trades) {
    const pnl = normalizeTradePnl(tr.outcome, tr.pnlDollars);
    const rVal = normalizeTradeR(tr.outcome, tr.rMultiple);
    const stratName = tr.strategyId ? strategyNamesById[tr.strategyId] ?? '' : '';
    lines.push(
      [
        tr.id,
        accountName,
        tr.pair,
        tr.direction,
        tr.outcome ?? '',
        pnl !== null ? pnl.toFixed(2) : '',
        rVal !== null ? rVal.toFixed(2) : '',
        tr.lotSize ?? '',
        tr.entryPrice ?? '',
        tr.stopLoss ?? '',
        tr.takeProfit ?? '',
        tr.setupGrade ?? '',
        stratName,
        tr.session ?? '',
        tr.entryTime ?? '',
        tr.exitTime ?? '',
        tr.notes ?? '',
      ]
        .map(escapeCsvCell)
        .join(','),
    );
  }
  return lines.join('\r\n');
}
