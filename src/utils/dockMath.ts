import type { DockEdge, MonitorInfo } from '../types/dock';

export const MIN_EXPANDED_SIZE = 260;
export const MAX_EXPANDED_RATIO = 0.6;
export const MIN_COLLAPSED_THICKNESS = 2;
export const MAX_COLLAPSED_THICKNESS = 24;

export function isHorizontalEdge(edge: DockEdge): boolean {
  return edge === 'top' || edge === 'bottom';
}

export function getMonitorAxisLength(edge: DockEdge, monitor: MonitorInfo | undefined): number {
  if (!monitor) return 1920;
  return isHorizontalEdge(edge) ? monitor.height : monitor.width;
}

export function clampExpandedSize(
  edge: DockEdge,
  monitor: MonitorInfo | undefined,
  requestedPx: number,
): number {
  const axis = getMonitorAxisLength(edge, monitor);
  const maxPx = Math.max(1, Math.round(axis * MAX_EXPANDED_RATIO));
  const minPx = Math.min(MIN_EXPANDED_SIZE, maxPx);
  return Math.max(minPx, Math.min(maxPx, Math.round(requestedPx)));
}

export function sizeToPercent(
  edge: DockEdge,
  monitor: MonitorInfo | undefined,
  px: number,
): number {
  const axis = getMonitorAxisLength(edge, monitor);
  if (axis <= 0) return 20;
  return Number(((px / axis) * 100).toFixed(1));
}

export function percentToSize(
  edge: DockEdge,
  monitor: MonitorInfo | undefined,
  percent: number,
): number {
  const axis = getMonitorAxisLength(edge, monitor);
  return clampExpandedSize(edge, monitor, Math.round((percent / 100) * axis));
}

/**
 * Returns the CSS transform value for off-screen collapsed vs on-screen expanded
 * so all slide animations run strictly on the GPU compositor inside the transparent HWND.
 */
export function getSlideTransform(edge: DockEdge, slideVisible: boolean): string {
  if (slideVisible) {
    return 'translate3d(0, 0, 0)';
  }
  switch (edge) {
    case 'left':
      return 'translate3d(-100%, 0, 0)';
    case 'right':
      return 'translate3d(100%, 0, 0)';
    case 'top':
      return 'translate3d(0, -100%, 0)';
    case 'bottom':
      return 'translate3d(0, 100%, 0)';
  }
}
