import { describe, expect, it } from 'vitest';
import type { TradeRecord } from '../../types/journal';
import {
  detectCsvDelimiter,
  exportTradesToCsv,
  parseBrokerNumber,
  parseBrokerTradesCsv,
} from '../tradeCsv';

describe('tradeCsv: Real-World MT5 / Prop-Firm CSV Parsing & Export', () => {
  it('strips UTF BOM and detects comma, semicolon, and tab delimiters', () => {
    expect(detectCsvDelimiter('\uFEFFSymbol;Type;Volume;Profit\nEURUSD;buy;1.00;250.00')).toBe(';');
    expect(detectCsvDelimiter('\uFEFFPair\tSide\tLots\tPnL\nXAUUSD\tsell\t0.5\t120.5')).toBe('\t');
    expect(detectCsvDelimiter('Pair,Direction,PnL\nNAS100,long,300')).toBe(',');
  });

  it('normalizes space-formatted numbers, parentheses negatives, currency symbols, and EU decimals', () => {
    expect(parseBrokerNumber('-1 250.50')).toBe(-1250.5);
    expect(parseBrokerNumber('+$2 450.25')).toBe(2450.25);
    expect(parseBrokerNumber('(150.00)')).toBe(-150);
    expect(parseBrokerNumber('1\u00A0000,25')).toBe(1000.25);
    expect(parseBrokerNumber('€1.234,56')).toBe(1234.56);
    expect(parseBrokerNumber('--')).toBeNull();
  });

  it('parses semicolon MT5 statement skipping non-trade balance rows and converting dot timestamps', () => {
    const raw = [
      '\uFEFFOpen Time;Type;Volume;Item;Open Price;S / L;T / P;Close Time;Profit',
      '2026.11.20 14:35:00;balance;0;BALANCE;0;0;0;2026.11.20 14:35:00;50 000.00',
      '2026.11.21 09:30;buy;1.50;EURUSD;1.0850;1.0830;1.0910;2026.11.21 10:45;1 250.50',
      '2026.11.21 11:00;sell;0.50;XAUUSD;2650.0;2660.0;2620.0;2026.11.21 12:15;(320.00)',
    ].join('\n');

    const res = parseBrokerTradesCsv(raw);
    expect(res.delimiter).toBe(';');
    expect(res.warnings).toHaveLength(0);
    expect(res.skippedRows).toBe(1);
    expect(res.parsedRows).toHaveLength(2);

    expect(res.parsedRows[0]).toMatchObject({
      pair: 'EURUSD',
      direction: 'long',
      lotSize: 1.5,
      entryPrice: 1.085,
      outcome: 'win',
      pnlDollars: 1250.5,
      entryTime: '2026-11-21T09:30:00Z',
    });
    expect(res.parsedRows[1]).toMatchObject({
      pair: 'XAUUSD',
      direction: 'short',
      lotSize: 0.5,
      outcome: 'loss',
      pnlDollars: -320,
    });
  });

  it('exports trades to CSV and cleanly re-parses exported rows', () => {
    const trades: TradeRecord[] = [
      {
        id: 't1',
        accountId: 'default',
        pair: 'XAUUSD',
        direction: 'long',
        entryPrice: 2650,
        stopLoss: 2640,
        takeProfit: 2680,
        lotSize: 0.5,
        outcome: 'win',
        pnlDollars: 1500,
        rMultiple: 3,
        strategyId: 's1',
        notes: 'NY AM Sweep, clean displacement',
        screenshotPath: null,
        checklistSnapshot: null,
        setupGrade: 'A+',
        entryTime: '2026-11-24T14:00:00Z',
        exitTime: '2026-11-24T15:30:00Z',
        session: 'NY AM',
        createdAt: '2026-11-24T15:30:00Z',
        updatedAt: '2026-11-24T15:30:00Z',
      },
    ];

    const csv = exportTradesToCsv(trades, 'Funded 100K', { s1: '2022 Model' });
    expect(csv).toContain('Funded 100K');
    expect(csv).toContain('2022 Model');
    expect(csv).toContain('"NY AM Sweep, clean displacement"');

    const reparsed = parseBrokerTradesCsv(csv);
    expect(reparsed.parsedRows).toHaveLength(1);
    expect(reparsed.parsedRows[0]).toMatchObject({
      pair: 'XAUUSD',
      direction: 'long',
      outcome: 'win',
      pnlDollars: 1500,
      rMultiple: 3,
      lotSize: 0.5,
      session: 'NY AM',
      notes: 'NY AM Sweep, clean displacement',
    });
  });
});
