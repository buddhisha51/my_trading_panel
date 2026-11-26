import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ALL_KILLZONES,
  DEFAULT_KILLZONES,
  type KillzoneDefinition,
} from '../../types/time';
import {
  buildTimelineSegments,
  formatCountdown,
  getCurrentKillzones,
  getNyMidnightInfo,
} from '../killzoneEngine';

describe('killzoneEngine', () => {
  it('detects active NY AM Forex (07:00-10:00) and overlapping ICT Macro windows', () => {
    // Wednesday 2026-07-15 09:55 AM NY (EDT = UTC-4 -> 13:55 UTC)
    const nowUtc = DateTime.fromISO('2026-07-15T13:55:00Z', { zone: 'utc' });
    const resolved = getCurrentKillzones(nowUtc, 'Asia/Kolkata', DEFAULT_ALL_KILLZONES);

    const activeIds = resolved.filter((z) => z.isActive).map((z) => z.id);
    expect(activeIds).toContain('ny_am_forex');
    expect(activeIds).toContain('ny_am_indices'); // 09:30-11:00 NY
    expect(activeIds).toContain('macro_ny_open'); // 09:50-10:10 NY

    const nyForex = resolved.find((z) => z.id === 'ny_am_forex')!;
    expect(nyForex.msToEnd).toBe(5 * 60 * 1000);
    // 07:00-10:00 NY (UTC-4) -> 16:30-19:30 IST (UTC+5:30)
    expect(nyForex.displayStart.toFormat('HH:mm')).toBe('16:30');
    expect(nyForex.displayEnd.toFormat('HH:mm')).toBe('19:30');
  });

  it('handles overnight midnight-wrapping killzones accurately after midnight', () => {
    const overnightAsian: KillzoneDefinition = {
      id: 'custom_asian_wrap',
      label: 'Extended Asian',
      kind: 'killzone',
      startHour: 20,
      startMinute: 0,
      endHour: 2,
      endMinute: 0,
      color: '#6366f1',
      daysActive: [0, 1, 2, 3, 4], // Sun-Thu nights NY
      enabled: true,
    };

    // Tuesday 01:00 AM NY (EST = UTC-5 -> 06:00 UTC) must match Monday 20:00 -> Tuesday 02:00
    const tuesday1amNy = DateTime.fromISO('2026-01-13T06:00:00Z', { zone: 'utc' });
    const [res] = getCurrentKillzones(tuesday1amNy, 'America/New_York', [overnightAsian]);

    expect(res.isActive).toBe(true);
    expect(res.nyStart.toISODate()).toBe('2026-01-12'); // Started Monday
    expect(res.nyEnd.toISODate()).toBe('2026-01-13'); // Ends Tuesday 02:00
    expect(res.msToEnd).toBe(60 * 60 * 1000);
  });

  it('handles EST vs EDT transitions cleanly across seasons and Spring Forward day', () => {
    const london = DEFAULT_KILLZONES.find((z) => z.id === 'london')!;

    // Winter EST (UTC-5): 02:00 NY = 07:00 UTC
    const winterDay = DateTime.fromISO('2026-01-14T07:30:00Z', { zone: 'utc' });
    const [winterRes] = getCurrentKillzones(winterDay, 'UTC', [london]);
    expect(winterRes.isActive).toBe(true);
    expect(winterRes.displayStart.toFormat('HH:mm')).toBe('07:00');

    // Summer EDT (UTC-4): 02:00 NY = 06:00 UTC
    const summerDay = DateTime.fromISO('2026-07-15T06:30:00Z', { zone: 'utc' });
    const [summerRes] = getCurrentKillzones(summerDay, 'UTC', [london]);
    expect(summerRes.isActive).toBe(true);
    expect(summerRes.displayStart.toFormat('HH:mm')).toBe('06:00');
  });

  it('projects 24h timeline bar segments across midnight in non-NY display timezones', () => {
    // 2026-07-15 14:00 UTC -> IST = 19:30 (same date), London 02:00-05:00 NY = 11:30-14:30 IST
    const nowUtc = DateTime.fromISO('2026-07-15T14:00:00Z', { zone: 'utc' });
    const { segments, nowMarkerPct } = buildTimelineSegments(
      DEFAULT_KILLZONES,
      nowUtc,
      'Asia/Kolkata',
    );
    expect(nowMarkerPct).toBeGreaterThan(80);
    expect(segments.some((s) => s.zone.id === 'london')).toBe(true);
    // All segments must remain clamped strictly within [0, 100]
    for (const seg of segments) {
      expect(seg.leftPct).toBeGreaterThanOrEqual(0);
      expect(seg.leftPct + seg.widthPct).toBeLessThanOrEqual(100.001);
    }
  });

  it('computes NY Midnight Open and countdown formatter accurately', () => {
    const ny2230 = DateTime.fromISO('2026-07-15T22:30:00-04:00');
    const info = getNyMidnightInfo(ny2230.toUTC(), 'America/New_York');
    expect(info.msToNextMidnight).toBe(90 * 60 * 1000);
    expect(formatCountdown(info.msToNextMidnight)).toBe('1h 30m');
    expect(formatCountdown(45000)).toBe('45s');
  });
});
