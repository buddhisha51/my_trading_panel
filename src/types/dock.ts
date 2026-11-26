export type DockEdge = 'left' | 'right' | 'top' | 'bottom';

export type DockPhase =
  | 'collapsed'
  | 'expanding'
  | 'expanded'
  | 'collapsing'
  | 'fullscreen';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MonitorInfo {
  id: string;
  friendlyName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
  isPrimary: boolean;
}

export interface DockGeometry {
  collapsed: Rect;
  expanded: Rect;
  clampedExpandedSize: number;
  minExpandedSize: number;
  maxExpandedSize: number;
}

export interface DockAppliedResponse {
  monitorId: string;
  edge: DockEdge;
  geometry: DockGeometry;
  fellBackToPrimary: boolean;
}

export interface DockSnapResult {
  monitorId: string;
  edge: DockEdge;
  geometry: DockGeometry;
}
