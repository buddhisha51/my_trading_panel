import { describe, expect, it } from 'vitest';
import type { MonitorInfo } from '../../types/dock';
import {
  clampExpandedSize,
  formatMonitorLabel,
  getSlideTransform,
  isHorizontalEdge,
  percentToSize,
  sizeToPercent,
} from '../dockMath';

const monitor1080p: MonitorInfo = {
  id: 'PRIMARY',
  friendlyName: 'Primary 1080p',
  x: 0,
  y: 0,
  width: 1920,
  height: 1032,
  scaleFactor: 1,
  isPrimary: true,
};

describe('dockMath', () => {
  it('detects horizontal vs vertical edges', () => {
    expect(isHorizontalEdge('left')).toBe(false);
    expect(isHorizontalEdge('right')).toBe(false);
    expect(isHorizontalEdge('top')).toBe(true);
    expect(isHorizontalEdge('bottom')).toBe(true);
  });

  it('clamps expanded size between 260px and 60% of monitor work area', () => {
    expect(clampExpandedSize('left', monitor1080p, 100)).toBe(260);
    expect(clampExpandedSize('left', monitor1080p, 380)).toBe(380);
    expect(clampExpandedSize('left', monitor1080p, 1600)).toBe(1152); // 60% of 1920
    expect(clampExpandedSize('bottom', monitor1080p, 900)).toBe(619); // 60% of 1032
  });

  it('converts cleanly between pixels and work-area percentage', () => {
    expect(sizeToPercent('left', monitor1080p, 480)).toBe(25);
    expect(percentToSize('left', monitor1080p, 25)).toBe(480);
    expect(percentToSize('left', monitor1080p, 80)).toBe(1152);
  });

  it('computes GPU-composited off-screen CSS transforms per docked edge', () => {
    expect(getSlideTransform('left', false)).toBe('translate3d(-100%, 0, 0)');
    expect(getSlideTransform('right', false)).toBe('translate3d(100%, 0, 0)');
    expect(getSlideTransform('top', false)).toBe('translate3d(0, -100%, 0)');
    expect(getSlideTransform('bottom', false)).toBe('translate3d(0, 100%, 0)');
    expect(getSlideTransform('left', true)).toBe('translate3d(0, 0, 0)');
  });

  it('formats raw Windows monitor IDs into readable labels', () => {
    expect(formatMonitorLabel('\\\\.\\DISPLAY2')).toBe('Display 2');
    expect(formatMonitorLabel('\\\\.\\DISPLAY1')).toBe('Display 1');
    expect(formatMonitorLabel('DISPLAY_3')).toBe('Display 3');
    expect(formatMonitorLabel('BROWSER_PREVIEW')).toBe('Primary');
    expect(formatMonitorLabel(null)).toBe('Primary');
  });
});
