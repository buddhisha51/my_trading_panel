import type { DateTime } from 'luxon';
import type { OngoingTradeRecord } from '../types/journal';
import type { TimeFormat } from '../types/settings';
import type { KillzoneDefinition } from '../types/time';
import { getCurrentKillzones, NY_ZONE } from './killzoneEngine';
import { getCurrentSessions, isFxWeekendClosed } from './sessionEngine';
import { formatElapsedDuration, parseUtcTimestamp } from './timezone';

export const TRADE_RISK_REMINDER_INTERVAL_MS = 15 * 60 * 1000;

export interface DesktopAlertMessage {
  token: string;
  title: string;
  body: string;
}

export interface TimeWindowAlertSnapshot {
  activeKillzones: Record<string, { label: string; nyEndHm: string }>;
  openSessions: Record<string, { name: string; closeLabel: string }>;
}

function formatTimeHm(dt: DateTime, format: TimeFormat): string {
  return format === '12h' ? dt.toFormat('hh:mm a') : dt.toFormat('HH:mm');
}

/**
 * Evaluates Killzone (start & end) and Forex Session (start & end) alerts by comparing the
 * previous check snapshot against the current instant.
 */
export function evaluateMarketTimeAlerts(params: {
  now: DateTime;
  killzones: KillzoneDefinition[];
  displayTimezone: string;
  timeFormat: TimeFormat;
  prevSnapshot: TimeWindowAlertSnapshot | null;
}): {
  alerts: DesktopAlertMessage[];
  nextSnapshot: TimeWindowAlertSnapshot;
} {
  const { now, killzones, displayTimezone, timeFormat, prevSnapshot } = params;
  const alerts: DesktopAlertMessage[] = [];
  const nextActiveKzs: Record<string, { label: string; nyEndHm: string }> = {};
  const nextOpenSessions: Record<string, { name: string; closeLabel: string }> = {};

  const weekendClosed = isFxWeekendClosed(now);

  // 1. Killzones (start & end)
  if (!weekendClosed) {
    const activeKzs = getCurrentKillzones(now, NY_ZONE, killzones).filter(
      (z) => z.isActive && z.kind === 'killzone',
    );
    for (const kz of activeKzs) {
      const nyStartHm = kz.nyStart.toFormat('HH:mm');
      const nyEndHm = kz.nyEnd.toFormat('HH:mm');
      nextActiveKzs[kz.id] = { label: kz.label, nyEndHm };

      if (!prevSnapshot || !prevSnapshot.activeKillzones[kz.id]) {
        alerts.push({
          token: `kz-start:${kz.id}:${kz.nyStart.toISODate()}`,
          title: `Killzone Started: ${kz.label}`,
          body: `NY ${nyStartHm}–${nyEndHm} is now live.`,
        });
      }
    }
  }

  if (prevSnapshot) {
    for (const [id, prevMeta] of Object.entries(prevSnapshot.activeKillzones)) {
      if (!nextActiveKzs[id]) {
        const nyDate = now.setZone(NY_ZONE).toISODate() ?? '';
        alerts.push({
          token: `kz-end:${id}:${nyDate}`,
          title: `Killzone Ended: ${prevMeta.label}`,
          body: `${prevMeta.label} window closed (NY ${prevMeta.nyEndHm}).`,
        });
      }
    }
  }

  // 2. Global Forex Sessions (Sydney, Tokyo, London, New York) start & end
  const sessions = getCurrentSessions(now, displayTimezone);
  const nowMs = now.toMillis();

  for (const s of sessions) {
    if (!s.isOpen) continue;
    const closeLabel = formatTimeHm(s.displayClose, timeFormat);
    const openLabel = formatTimeHm(s.displayOpen, timeFormat);
    nextOpenSessions[s.definition.id] = {
      name: s.definition.name,
      closeLabel,
    };

    const openedJustNow =
      !prevSnapshot && Math.abs(nowMs - s.displayOpen.toMillis()) <= 120_000;
    const transitionedOpen = Boolean(prevSnapshot && !prevSnapshot.openSessions[s.definition.id]);

    if (openedJustNow || transitionedOpen) {
      alerts.push({
        token: `sess-start:${s.definition.id}:${s.nyOpen.toISODate()}`,
        title: `${s.definition.name} Session Started`,
        body: `Market open (${openLabel}–${closeLabel}).`,
      });
    }
  }

  if (prevSnapshot) {
    for (const [id, prevMeta] of Object.entries(prevSnapshot.openSessions)) {
      if (!nextOpenSessions[id]) {
        const nyDate = now.setZone(NY_ZONE).toISODate() ?? '';
        alerts.push({
          token: `sess-end:${id}:${nyDate}`,
          title: `${prevMeta.name} Session Ended`,
          body: `${prevMeta.name} session closed at ${prevMeta.closeLabel}.`,
        });
      }
    }
  }

  return {
    alerts,
    nextSnapshot: {
      activeKillzones: nextActiveKzs,
      openSessions: nextOpenSessions,
    },
  };
}

export interface OngoingTradeRiskAssessment {
  missingSl: boolean;
  missingTp: boolean;
  needsAttention: boolean;
  severity: 'critical' | 'warning' | 'ok';
  shortBadge: string | null;
  warningMessage: string | null;
}

export function inspectOngoingTradeRisk(
  trade: OngoingTradeRecord,
): OngoingTradeRiskAssessment {
  const missingSl =
    trade.stopLoss === null || !Number.isFinite(trade.stopLoss) || trade.stopLoss <= 0;
  const missingTp =
    trade.takeProfit === null || !Number.isFinite(trade.takeProfit) || trade.takeProfit <= 0;

  if (missingSl && missingTp) {
    return {
      missingSl: true,
      missingTp: true,
      needsAttention: true,
      severity: 'critical',
      shortBadge: 'NO SL & TP',
      warningMessage: 'SL & TP not set — unhedged position risk (15m alert active)',
    };
  }
  if (missingSl) {
    return {
      missingSl: true,
      missingTp: false,
      needsAttention: true,
      severity: 'critical',
      shortBadge: 'NO SL',
      warningMessage: 'Stop Loss missing — downside unprotected (15m alert active)',
    };
  }
  if (missingTp) {
    return {
      missingSl: false,
      missingTp: true,
      needsAttention: true,
      severity: 'warning',
      shortBadge: 'NO TP',
      warningMessage: 'Take Profit target not assigned (15m alert active)',
    };
  }

  return {
    missingSl: false,
    missingTp: false,
    needsAttention: false,
    severity: 'ok',
    shortBadge: null,
    warningMessage: null,
  };
}

export interface OngoingRiskSummary {
  unprotectedCount: number;
  missingSlCount: number;
  missingTpCount: number;
  soonestNextReminderMs: number | null;
}

export function getOngoingRiskSummary(
  trades: OngoingTradeRecord[],
  now: DateTime,
  reminderIntervalMs: number = TRADE_RISK_REMINDER_INTERVAL_MS,
): OngoingRiskSummary {
  let unprotectedCount = 0;
  let missingSlCount = 0;
  let missingTpCount = 0;
  let soonestNextReminderMs: number | null = null;

  for (const trade of trades) {
    const risk = inspectOngoingTradeRisk(trade);
    if (!risk.needsAttention) continue;
    unprotectedCount += 1;
    if (risk.missingSl) missingSlCount += 1;
    if (risk.missingTp) missingTpCount += 1;

    const opened = parseUtcTimestamp(trade.openedAt);
    if (opened) {
      const elapsedMs = Math.max(0, now.toMillis() - opened.toMillis());
      const remainder = elapsedMs % reminderIntervalMs;
      const untilNext = reminderIntervalMs - remainder;
      if (soonestNextReminderMs === null || untilNext < soonestNextReminderMs) {
        soonestNextReminderMs = untilNext;
      }
    }
  }

  return {
    unprotectedCount,
    missingSlCount,
    missingTpCount,
    soonestNextReminderMs,
  };
}

/**
 * Emits recurring 15-minute market-check reminder alerts for any ongoing position
 * missing Stop Loss or Take Profit (`elapsed >= 15m, 30m, 45m, ...`).
 */
export function getUnprotectedTradeReminders(
  trades: OngoingTradeRecord[],
  now: DateTime,
  reminderIntervalMs: number = TRADE_RISK_REMINDER_INTERVAL_MS,
): DesktopAlertMessage[] {
  const out: DesktopAlertMessage[] = [];

  for (const trade of trades) {
    const risk = inspectOngoingTradeRisk(trade);
    if (!risk.needsAttention) continue;

    const opened = parseUtcTimestamp(trade.openedAt);
    if (!opened) continue;

    const elapsedMs = Math.max(0, now.toMillis() - opened.toMillis());
    const bucket = Math.floor(elapsedMs / reminderIntervalMs);
    if (bucket < 1) continue;

    const missingText =
      risk.missingSl && risk.missingTp
        ? 'SL & TP'
        : risk.missingSl
          ? 'Stop Loss'
          : 'Take Profit';
    const mask = `${risk.missingSl ? 'sl' : ''}${risk.missingTp ? 'tp' : ''}`;
    const ranLabel = formatElapsedDuration(trade.openedAt, now);

    out.push({
      token: `trade-risk:${trade.id}:b${bucket}:${mask}`,
      title: risk.missingSl
        ? `Check Market: ${trade.pair} Missing SL`
        : `Check Market: ${trade.pair} Missing TP`,
      body: `${trade.pair} ${trade.direction.toUpperCase()} ran ${ranLabel} without ${missingText}. Review chart & assign risk levels.`,
    });
  }

  return out;
}
