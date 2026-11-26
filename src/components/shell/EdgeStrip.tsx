import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { DateTime } from 'luxon';
import { memo, useEffect, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { isHorizontalEdge } from '../../utils/dockMath';
import { getStatusIndicatorLight } from '../../utils/timezone';

interface EdgeStripProps {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
}

  export const EdgeStrip = memo(function EdgeStrip({
    onMouseEnter,
    onMouseLeave,
    onClick,
  }: EdgeStripProps) {
    const edge = useSettingsStore((s) => s.settings.edge);
    const stripColor = useSettingsStore((s) => s.settings.stripColor);
    const stripOpacity = useSettingsStore((s) => s.settings.stripOpacity);
    const accentColor = useSettingsStore((s) => s.settings.accentColor);
    const statusIndicator = useSettingsStore((s) => s.settings.statusIndicator);
    const killzones = useSettingsStore((s) => s.settings.killzones);

    const [now, setNow] = useState(() => DateTime.utc());
    useEffect(() => {
      const timer = window.setInterval(() => setNow(DateTime.utc()), 15000);
      return () => window.clearInterval(timer);
    }, []);

    const horizontal = isHorizontalEdge(edge);
    const light = getStatusIndicatorLight(now, statusIndicator, killzones);

    const borderStyle =
      edge === 'left'
        ? { borderRight: `2px solid ${light.isActive ? light.color : accentColor}` }
        : edge === 'right'
          ? { borderLeft: `2px solid ${light.isActive ? light.color : accentColor}` }
          : edge === 'top'
            ? { borderBottom: `2px solid ${light.isActive ? light.color : accentColor}` }
            : { borderTop: `2px solid ${light.isActive ? light.color : accentColor}` };

    const ArrowIcon =
      edge === 'left'
        ? ChevronRight
        : edge === 'right'
          ? ChevronLeft
          : edge === 'top'
            ? ChevronDown
            : ChevronUp;

    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open ICT Trading Panel (docked ${edge})`}
        title={`${light.label} — Hover or click to open`}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onClick();
        }}
        style={{
          backgroundColor: stripColor,
          opacity: stripOpacity,
          ...borderStyle,
        }}
        className={`group flex h-full w-full cursor-pointer items-center justify-center transition-opacity duration-150 hover:opacity-100 ${horizontal ? 'flex-row gap-2' : 'flex-col gap-2'
          }`}
      >
        {statusIndicator !== 'none' && (
          <span
            className="rounded-full shrink-0"
            style={{
              width: horizontal ? 18 : 5,
              height: horizontal ? 5 : 28,
              backgroundColor: light.color,
              boxShadow: `0 0 8px ${light.color}`,
            }}
          />
        )}
        <ArrowIcon
          className="h-3 w-3 text-slate-200 opacity-75 transition-opacity group-hover:opacity-100"
          strokeWidth={2.5}
        />
      </div>
    );
});
