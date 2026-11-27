import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
  formatElapsedDuration,
  formatEntryTimestamp,
  formatZoneClock,
  getStatusIndicatorLight,
  NY_TIMEZONE,
} from '../timezone';

describe('timezone utilities', () => {
  it('formats 24h and 12h zone clocks properly', () => {
    const utcMorning = DateTime.fromISO('2026-07-15T13:30:05Z', { zone: 'utc' });
    // July is EDT (UTC-4) -> 09:30:05 AM NY
    expect(formatZoneClock(utcMorning, NY_TIMEZONE, '24h')).toBe('09:30:05');
    expect(formatZoneClock(utcMorning, NY_TIMEZONE, '12h')).toBe('09:30:05 AM');
  });

  it('detects weekend market closure and active NY AM Forex Killzone', () => {
    // Wednesday 08:15 NY (EDT = UTC-4 -> 12:15 UTC)
    const nyKillzone = DateTime.fromISO('2026-07-15T12:15:00Z', { zone: 'utc' });
    const kz = getStatusIndicatorLight(nyKillzone, 'killzone');
    expect(kz.isActive).toBe(true);
    expect(kz.label).toContain('New York AM (Forex)');

    // Saturday 12:00 NY -> Closed
    const saturday = DateTime.fromISO('2026-07-18T16:00:00Z', { zone: 'utc' });
    const closed = getStatusIndicatorLight(saturday, 'killzone');
    expect(closed.isActive).toBe(false);
    expect(closed.label).toContain('Closed');
  });

  it('formats trade entry timestamps and elapsed running durations from ISO and SQLite UTC', () => {
    const now = DateTime.fromISO('2026-11-27T14:45:30Z', { zone: 'utc' });
    expect(formatElapsedDuration('2026-11-27T14:45:05Z', now)).toBe('25s');
    expect(formatElapsedDuration('2026-11-27 14:31:08', now)).toBe('14m 22s');
    expect(formatElapsedDuration('2026-11-27T12:27:30Z', now)).toBe('2h 18m');
    expect(formatElapsedDuration('2026-11-26T10:33:30Z', now)).toBe('1d 4h 12m');

    const entry = formatEntryTimestamp('2026-11-27 14:30:00', NY_TIMEZONE, '12h', now);
    expect(entry.short).toBe('09:30 AM');
    expect(entry.full).toBe('Nov 27, 09:30:00 AM');
  });
});
