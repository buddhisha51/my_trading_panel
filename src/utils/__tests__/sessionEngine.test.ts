import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
  getActiveSessionOverlap,
  getCurrentSessions,
  isFxWeekendClosed,
} from '../sessionEngine';

describe('sessionEngine', () => {
  it('uses true local hours and detects London/NY overlap across summer DST', () => {
    // Wed 2026-07-15 14:30 UTC:
    // London BST (UTC+1) = 15:30 (Open 08-17)
    // NY EDT (UTC-4) = 10:30 (Open 08-17)
    // Tokyo JST (UTC+9) = 23:30 (Closed)
    // Sydney AEST (UTC+10) = 00:30 Thu (Closed)
    const nowUtc = DateTime.fromISO('2026-07-15T14:30:00Z', { zone: 'utc' });
    const statuses = getCurrentSessions(nowUtc, 'America/New_York');

    const byId = Object.fromEntries(statuses.map((s) => [s.definition.id, s]));
    expect(byId.london.isOpen).toBe(true);
    expect(byId.new_york.isOpen).toBe(true);
    expect(byId.tokyo.isOpen).toBe(false);
    expect(byId.sydney.isOpen).toBe(false);

    // London 08:00-17:00 BST -> 03:00-12:00 EDT in NY
    expect(byId.london.nyOpen.toFormat('HH:mm')).toBe('03:00');
    expect(byId.london.nyClose.toFormat('HH:mm')).toBe('12:00');

    const overlap = getActiveSessionOverlap(statuses);
    expect(overlap?.label).toBe('London / NY Peak Overlap');
  });

  it('keeps Tokyo 09:00-18:00 local and handles Sydney/Tokyo overlap', () => {
    // Wed 2026-07-15 02:00 UTC -> Tokyo 11:00 JST, Sydney 12:00 AEST (both open)
    const nowUtc = DateTime.fromISO('2026-07-15T02:00:00Z', { zone: 'utc' });
    const statuses = getCurrentSessions(nowUtc, 'UTC');
    const overlap = getActiveSessionOverlap(statuses);
    expect(overlap?.label).toBe('Sydney / Tokyo Overlap');
  });

  it('identifies global FX weekend closure accurately', () => {
    const fridayAfterCloseNy = DateTime.fromISO('2026-07-17T22:00:00Z', { zone: 'utc' }); // 18:00 NY Fri
    const saturday = DateTime.fromISO('2026-07-18T12:00:00Z', { zone: 'utc' });
    const wednesday = DateTime.fromISO('2026-07-15T12:00:00Z', { zone: 'utc' });

    expect(isFxWeekendClosed(fridayAfterCloseNy)).toBe(true);
    expect(isFxWeekendClosed(saturday)).toBe(true);
    expect(isFxWeekendClosed(wednesday)).toBe(false);
  });
});
