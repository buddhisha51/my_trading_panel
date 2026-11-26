import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { formatZoneClock, getStatusIndicatorLight, NY_TIMEZONE } from '../timezone';

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
});
