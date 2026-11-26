import type { DateTime } from 'luxon';

export type KillzoneKind = 'killzone' | 'silver_bullet' | 'macro';

export interface KillzoneDefinition {
  id: string;
  label: string;
  kind: KillzoneKind;
  /** 0-23 in America/New_York time */
  startHour: number;
  startMinute: number;
  /** 0-23 in America/New_York time (end <= start implies overnight wrap to next day) */
  endHour: number;
  endMinute: number;
  color: string;
  /** 0 = Sunday .. 6 = Saturday */
  daysActive: number[];
  enabled: boolean;
}

export interface ActiveKillzone extends KillzoneDefinition {
  isActive: boolean;
  startUtc: DateTime;
  endUtc: DateTime;
  nyStart: DateTime;
  nyEnd: DateTime;
  displayStart: DateTime;
  displayEnd: DateTime;
  msToStart: number | null;
  msToEnd: number | null;
  progressPct: number;
}

export interface TimelineBarSegment {
  zone: KillzoneDefinition;
  /** Start percentage across the 24h axis [0..100] */
  leftPct: number;
  /** Width percentage across the 24h axis (0..100] */
  widthPct: number;
  isActive: boolean;
}

export type SessionId = 'sydney' | 'tokyo' | 'london' | 'new_york';

export interface SessionDefinition {
  id: SessionId;
  name: string;
  shortLabel: string;
  ianaTimezone: string;
  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
  color: string;
}

export interface SessionStatus {
  definition: SessionDefinition;
  isOpen: boolean;
  localNow: DateTime;
  displayOpen: DateTime;
  displayClose: DateTime;
  nyOpen: DateTime;
  nyClose: DateTime;
  msToOpen: number | null;
  msToClose: number | null;
  progressPct: number;
  /** Axis segments in reference timezone for 24h overlap visualization (handles midnight wrap) */
  axisSegments: Array<{ leftPct: number; widthPct: number }>;
}

export const DEFAULT_KILLZONES: KillzoneDefinition[] = [
  {
    id: 'asian',
    label: 'Asian Range',
    kind: 'killzone',
    startHour: 20,
    startMinute: 0,
    endHour: 0,
    endMinute: 0,
    color: '#6366F1',
    daysActive: [0, 1, 2, 3, 4],
    enabled: true,
  },
  {
    id: 'london',
    label: 'London Open',
    kind: 'killzone',
    startHour: 2,
    startMinute: 0,
    endHour: 5,
    endMinute: 0,
    color: '#10B981',
    daysActive: [1, 2, 3, 4, 5],
    enabled: true,
  },
  {
    id: 'ny_am_forex',
    label: 'New York AM (Forex)',
    kind: 'killzone',
    startHour: 7,
    startMinute: 0,
    endHour: 10,
    endMinute: 0,
    color: '#F59E0B',
    daysActive: [1, 2, 3, 4, 5],
    enabled: true,
  },
  {
    id: 'ny_am_indices',
    label: 'NY Indices / Equities AM',
    kind: 'killzone',
    startHour: 9,
    startMinute: 30,
    endHour: 11,
    endMinute: 0,
    color: '#FBBF24',
    daysActive: [1, 2, 3, 4, 5],
    enabled: true,
  },
  {
    id: 'london_close',
    label: 'London Close',
    kind: 'killzone',
    startHour: 10,
    startMinute: 0,
    endHour: 12,
    endMinute: 0,
    color: '#8B5CF6',
    daysActive: [1, 2, 3, 4, 5],
    enabled: true,
  },
  {
    id: 'ny_lunch',
    label: 'NY Lunch',
    kind: 'killzone',
    startHour: 12,
    startMinute: 0,
    endHour: 13,
    endMinute: 0,
    color: '#6B7280',
    daysActive: [1, 2, 3, 4, 5],
    enabled: true,
  },
  {
    id: 'ny_pm',
    label: 'New York PM',
    kind: 'killzone',
    startHour: 13,
    startMinute: 30,
    endHour: 16,
    endMinute: 0,
    color: '#EF4444',
    daysActive: [1, 2, 3, 4, 5],
    enabled: true,
  },
];

export const DEFAULT_SILVER_BULLETS: KillzoneDefinition[] = [
  {
    id: 'sb_london',
    label: 'SB London',
    kind: 'silver_bullet',
    startHour: 3,
    startMinute: 0,
    endHour: 4,
    endMinute: 0,
    color: '#14B8A6',
    daysActive: [1, 2, 3, 4, 5],
    enabled: true,
  },
  {
    id: 'sb_ny_am',
    label: 'SB NY AM',
    kind: 'silver_bullet',
    startHour: 10,
    startMinute: 0,
    endHour: 11,
    endMinute: 0,
    color: '#F97316',
    daysActive: [1, 2, 3, 4, 5],
    enabled: true,
  },
  {
    id: 'sb_ny_pm',
    label: 'SB NY PM',
    kind: 'silver_bullet',
    startHour: 14,
    startMinute: 0,
    endHour: 15,
    endMinute: 0,
    color: '#EC4899',
    daysActive: [1, 2, 3, 4, 5],
    enabled: true,
  },
];

export const DEFAULT_MACROS: KillzoneDefinition[] = [
  {
    id: 'macro_london',
    label: 'London Macro',
    kind: 'macro',
    startHour: 2,
    startMinute: 33,
    endHour: 3,
    endMinute: 0,
    color: '#34D399',
    daysActive: [1, 2, 3, 4, 5],
    enabled: true,
  },
  {
    id: 'macro_ny_pre',
    label: 'NY Pre-Open Macro',
    kind: 'macro',
    startHour: 8,
    startMinute: 50,
    endHour: 9,
    endMinute: 10,
    color: '#38BDF8',
    daysActive: [1, 2, 3, 4, 5],
    enabled: true,
  },
  {
    id: 'macro_ny_open',
    label: 'NY 9:50 Macro',
    kind: 'macro',
    startHour: 9,
    startMinute: 50,
    endHour: 10,
    endMinute: 10,
    color: '#38BDF8',
    daysActive: [1, 2, 3, 4, 5],
    enabled: true,
  },
  {
    id: 'macro_ny_late',
    label: 'NY 10:50 Macro',
    kind: 'macro',
    startHour: 10,
    startMinute: 50,
    endHour: 11,
    endMinute: 10,
    color: '#38BDF8',
    daysActive: [1, 2, 3, 4, 5],
    enabled: true,
  },
  {
    id: 'macro_ny_lunch',
    label: 'NY 13:10 Macro',
    kind: 'macro',
    startHour: 13,
    startMinute: 10,
    endHour: 13,
    endMinute: 40,
    color: '#A78BFA',
    daysActive: [1, 2, 3, 4, 5],
    enabled: true,
  },
  {
    id: 'macro_ny_close',
    label: 'NY MOC Macro',
    kind: 'macro',
    startHour: 15,
    startMinute: 15,
    endHour: 15,
    endMinute: 45,
    color: '#F472B6',
    daysActive: [1, 2, 3, 4, 5],
    enabled: true,
  },
];

export const DEFAULT_ALL_KILLZONES: KillzoneDefinition[] = [
  ...DEFAULT_KILLZONES,
  ...DEFAULT_SILVER_BULLETS,
  ...DEFAULT_MACROS,
];

export function cloneDefaultKillzones(): KillzoneDefinition[] {
  return DEFAULT_ALL_KILLZONES.map((z) => ({
    ...z,
    daysActive: [...z.daysActive],
  }));
}

export const DEFAULT_SESSIONS: SessionDefinition[] = [
  {
    id: 'sydney',
    name: 'Sydney',
    shortLabel: 'SYD',
    ianaTimezone: 'Australia/Sydney',
    openHour: 8,
    openMinute: 0,
    closeHour: 17,
    closeMinute: 0,
    color: '#06B6D4',
  },
  {
    id: 'tokyo',
    name: 'Tokyo',
    shortLabel: 'TYO',
    ianaTimezone: 'Asia/Tokyo',
    openHour: 9,
    openMinute: 0,
    closeHour: 18,
    closeMinute: 0,
    color: '#6366F1',
  },
  {
    id: 'london',
    name: 'London',
    shortLabel: 'LDN',
    ianaTimezone: 'Europe/London',
    openHour: 8,
    openMinute: 0,
    closeHour: 17,
    closeMinute: 0,
    color: '#10B981',
  },
  {
    id: 'new_york',
    name: 'New York',
    shortLabel: 'NYC',
    ianaTimezone: 'America/New_York',
    openHour: 8,
    openMinute: 0,
    closeHour: 17,
    closeMinute: 0,
    color: '#F59E0B',
  },
];
