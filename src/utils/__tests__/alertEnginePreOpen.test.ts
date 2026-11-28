import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { DEFAULT_KILLZONES } from '../../types/time';
import { evaluatePreOpenAlerts } from '../alertEngine';

describe('alertEngine: evaluatePreOpenAlerts', () => {
  it('fires pre-open alerts for upcoming Killzones and Sessions within leadMinutes on weekdays', () => {
    // Tuesday 2026-11-24 01:55:00 America/New_York = 5m before London Open KZ (02:00 NY)
    const now = DateTime.fromObject(
      { year: 2026, month: 11, day: 24, hour: 1, minute: 55, second: 0 },
      { zone: 'America/New_York' },
    ).toUTC();

    const alerts = evaluatePreOpenAlerts({
      now,
      killzones: DEFAULT_KILLZONES,
      displayTimezone: 'America/New_York',
      timeFormat: '24h',
      leadMinutes: 5,
      includeSilverBullets: true,
    });

    const kzAlert = alerts.find((a) => a.token.startsWith('pre-kz:london:'));
    expect(kzAlert).toBeTruthy();
    expect(kzAlert?.title).toContain('Opening in 5m: London Open');
    expect(kzAlert?.chimeKind).toBe('preopen');
  });

  it('stays quiet during FX weekend close and when leadMinutes <= 0', () => {
    // Saturday 2026-11-28 10:00 NY (FX market closed)
    const saturday = DateTime.fromObject(
      { year: 2026, month: 11, day: 28, hour: 10, minute: 0, second: 0 },
      { zone: 'America/New_York' },
    ).toUTC();

    expect(
      evaluatePreOpenAlerts({
        now: saturday,
        killzones: DEFAULT_KILLZONES,
        displayTimezone: 'America/New_York',
        timeFormat: '24h',
        leadMinutes: 5,
      }),
    ).toHaveLength(0);

    // Weekday but leadMinutes = 0 disables pre-open alerts
    const tue = DateTime.fromObject(
      { year: 2026, month: 11, day: 24, hour: 1, minute: 55, second: 0 },
      { zone: 'America/New_York' },
    ).toUTC();
    expect(
      evaluatePreOpenAlerts({
        now: tue,
        killzones: DEFAULT_KILLZONES,
        displayTimezone: 'America/New_York',
        timeFormat: '24h',
        leadMinutes: 0,
      }),
    ).toHaveLength(0);
  });
});
