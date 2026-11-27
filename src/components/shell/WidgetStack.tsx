import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  horizontalListSortingStrategy,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Layers } from 'lucide-react';
import { DateTime } from 'luxon';
import { usePreservedScroll } from '../../hooks/usePreservedScroll';
import { useDailyBiasStore } from '../../stores/dailyBiasStore';
import { useDockStore } from '../../stores/dockStore';
import { useJournalStore } from '../../stores/journalStore';
import { useMarketStore } from '../../stores/marketStore';
import { useNotesStore } from '../../stores/notesStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useStrategiesStore } from '../../stores/strategiesStore';
import { WIDGET_CATALOG, type WidgetId } from '../../types/settings';
import { getUpcomingHighImpactAlerts } from '../../utils/calendarAlerts';
import {
  DailyBiasWidget,
  getBiasSummaryBadge,
} from '../widgets/DailyBiasWidget';
import { EconomicCalendarWidget } from '../widgets/EconomicCalendarWidget';
import {
  getKillzoneWidgetBadge,
  KillzoneTimelineWidget,
} from '../widgets/KillzoneTimelineWidget';
import { NewsFeedWidget } from '../widgets/NewsFeedWidget';
import { OngoingTradesWidget } from '../widgets/OngoingTradesWidget';
import { QuickNotesWidget } from '../widgets/QuickNotesWidget';
import { RiskCalculatorWidget } from '../widgets/RiskCalculatorWidget';
import {
  getSessionWidgetBadge,
  SessionClockWidget,
} from '../widgets/SessionClockWidget';
import { StrategiesWidget } from '../widgets/StrategiesWidget';
import { TradeJournalWidget } from '../widgets/TradeJournalWidget';
import { WidgetFrame } from './WidgetFrame';

interface WidgetStackProps {
  now: DateTime;
  layout: 'vertical' | 'horizontal' | 'grid';
}

export function WidgetStack({ now, layout }: WidgetStackProps) {
  const widgetLayout = useSettingsStore((s) => s.widgetLayout);
  const settings = useSettingsStore((s) => s.settings);
  const toggleWidgetCollapsed = useSettingsStore((s) => s.toggleWidgetCollapsed);
  const setWidgetHeight = useSettingsStore((s) => s.setWidgetHeight);
  const setWidgetWidth = useSettingsStore((s) => s.setWidgetWidth);
  const reorderWidgets = useSettingsStore((s) => s.reorderWidgets);

  const entriesByPair = useDailyBiasStore((s) => s.entriesByPair);
  const weeklyByPair = useDailyBiasStore((s) => s.weeklyByPair);
  const monthlyByPair = useDailyBiasStore((s) => s.monthlyByPair);
  const notesCount = useNotesStore((s) => s.notes.length);
  const strategiesCount = useStrategiesStore((s) => s.strategies.length);
  const ongoingCount = useJournalStore((s) => s.ongoingTrades.length);
  const journalMetrics = useJournalStore((s) => s.metrics);
  const events = useMarketStore((s) => s.events);
  const newsCount = useMarketStore((s) => s.news.length);
  const setSettingsOpen = useDockStore((s) => s.setSettingsOpen);
  const setReorderingWidgets = useDockStore((s) => s.setReorderingWidgets);
  const stackScrollRef = usePreservedScroll<HTMLDivElement>(`widget-stack:${layout}`);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visibleWidgets = widgetLayout.filter((w) => w.isVisible);
  const visibleIds = visibleWidgets.map((w) => w.widgetId);

  const strategy =
    layout === 'horizontal'
      ? horizontalListSortingStrategy
      : layout === 'grid'
        ? rectSortingStrategy
        : verticalListSortingStrategy;

  const containerClass =
    layout === 'horizontal'
      ? 'flex min-h-0 min-w-0 flex-row items-start gap-2.5 overflow-x-auto overflow-y-auto p-2.5'
      : layout === 'grid'
        ? 'grid min-h-0 min-w-0 grid-cols-1 items-start gap-4 overflow-auto p-5 md:grid-cols-2 xl:grid-cols-3'
        : 'flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto overflow-x-hidden p-2.5';

  const frameClassName =
    layout === 'horizontal'
      ? 'max-h-full shrink-0'
      : layout === 'vertical'
        ? 'w-full min-w-0 shrink-0'
        : 'min-w-0';

  const handleHorizontalWheel =
    layout === 'horizontal'
      ? (e: React.WheelEvent<HTMLDivElement>) => {
          if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.deltaY === 0) return;
          const container = e.currentTarget;
          let node = e.target as HTMLElement | null;
          while (node && node !== container) {
            const overflowY = window.getComputedStyle(node).overflowY;
            const canScrollY =
              (overflowY === 'auto' || overflowY === 'scroll') &&
              node.scrollHeight > node.clientHeight + 1;
            if (canScrollY) {
              const atTop = node.scrollTop <= 0 && e.deltaY < 0;
              const atBottom =
                node.scrollTop + node.clientHeight >= node.scrollHeight - 1 && e.deltaY > 0;
              if (!atTop && !atBottom) return;
            }
            node = node.parentElement;
          }
          if (container.scrollWidth > container.clientWidth) {
            container.scrollLeft += e.deltaY;
          }
        }
      : undefined;

  const handleDragEnd = (event: DragEndEvent) => {
    setReorderingWidgets(false);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      void reorderWidgets(active.id as WidgetId, over.id as WidgetId);
    }
  };

  if (visibleWidgets.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-700 p-6">
          <Layers className="h-6 w-6 text-slate-500" />
          <p className="text-xs text-slate-400">All widgets are hidden.</p>
          <button
            type="button"
            onClick={() => void setSettingsOpen(true)}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
          >
            Configure Widgets
          </button>
        </div>
      </div>
    );
  }

  const renderBadge = (id: WidgetId, milestone: number) => {
    if (id === 'killzone-timeline') {
      const b = getKillzoneWidgetBadge(
        now,
        settings.killzones,
        settings.showSilverBullets,
        settings.showMacros,
      );
      return (
        <span
          className="rounded px-1.5 py-0.5 font-mono text-[10px] font-medium"
          style={{
            backgroundColor: `${b.color}22`,
            color: b.active ? b.color : '#94a3b8',
          }}
        >
          {b.text}
        </span>
      );
    }
    if (id === 'session-clock') {
      const b = getSessionWidgetBadge(now);
      return (
        <span
          className="rounded px-1.5 py-0.5 font-mono text-[10px] font-medium"
          style={{
            backgroundColor: `${b.color}22`,
            color: b.active ? b.color : '#94a3b8',
          }}
        >
          {b.text}
        </span>
      );
    }
    if (id === 'daily-bias') {
      const b = getBiasSummaryBadge(
        entriesByPair[settings.selectedBiasPair],
        settings.selectedBiasPair,
        weeklyByPair[settings.selectedBiasPair]?.biasDaily ?? null,
        monthlyByPair[settings.selectedBiasPair]?.biasDaily ?? null,
      );
      return (
        <span
          className="rounded px-1.5 py-0.5 font-mono text-[10px] font-medium"
          style={{
            backgroundColor: `${b.color}22`,
            color: b.color,
          }}
        >
          {b.text}
        </span>
      );
    }
    if (id === 'risk-calculator') {
      return (
        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
          {settings.selectedInstrument}
        </span>
      );
    }
    if (id === 'quick-notes') {
      return (
        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
          {notesCount}
        </span>
      );
    }
    if (id === 'strategies') {
      return (
        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
          {strategiesCount}
        </span>
      );
    }
    if (id === 'ongoing-trades') {
      return (
        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
          {ongoingCount}
        </span>
      );
    }
    if (id === 'trade-journal') {
      const ddAlert = journalMetrics.dailyDdBreached || journalMetrics.maxDdBreached;
      const pnl = journalMetrics.netPnl;
      return (
        <span
          className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${ddAlert
              ? 'bg-rose-500/20 text-rose-300'
              : pnl >= 0
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-rose-500/15 text-rose-300'
            }`}
        >
          {ddAlert ? 'DD ALERT' : `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(0)}`}
        </span>
      );
    }
    if (id === 'economic-calendar') {
      const imminent = getUpcomingHighImpactAlerts(
        events,
        now,
        settings.volatilityThresholdMin || 15,
      );
      if (imminent.length > 0) {
        return (
          <span className="rounded bg-rose-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-rose-300">
            {Math.max(1, Math.round(imminent[0].minutesUntil))}m!
          </span>
        );
      }
      return (
        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
          {events.length}
        </span>
      );
    }
    if (id === 'news-feed') {
      return (
        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
          {newsCount}
        </span>
      );
    }
    return (
      <span
        className="rounded px-1.5 py-0.5 text-[10px] font-medium"
        style={{
          backgroundColor: `${settings.accentColor}22`,
          color: settings.accentColor,
        }}
      >
        M{milestone}
      </span>
    );
  };

  const renderWidgetBody = (id: WidgetId, description: string) => {
    switch (id) {
      case 'killzone-timeline':
        return <KillzoneTimelineWidget now={now} />;
      case 'session-clock':
        return <SessionClockWidget now={now} />;
      case 'daily-bias':
        return <DailyBiasWidget />;
      case 'risk-calculator':
        return <RiskCalculatorWidget />;
      case 'quick-notes':
        return <QuickNotesWidget />;
      case 'strategies':
        return <StrategiesWidget />;
      case 'ongoing-trades':
        return <OngoingTradesWidget />;
      case 'trade-journal':
        return <TradeJournalWidget />;
      case 'economic-calendar':
        return <EconomicCalendarWidget now={now} />;
      case 'news-feed':
        return <NewsFeedWidget />;
      default:
        return (
          <p className="text-[11px] leading-relaxed text-slate-400">
            {description}
          </p>
        );
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={() => setReorderingWidgets(true)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setReorderingWidgets(false)}
    >
      <SortableContext items={visibleIds} strategy={strategy}>
        <div
          key={layout}
          ref={stackScrollRef}
          onWheel={handleHorizontalWheel}
          className={`flex-1 ${containerClass}`}
        >
          {visibleWidgets.map((layoutItem) => {
            const meta = WIDGET_CATALOG.find((m) => m.id === layoutItem.widgetId);
            if (!meta) return null;
            return (
              <WidgetFrame
                key={meta.id}
                widgetId={meta.id}
                title={meta.title}
                badge={renderBadge(meta.id, meta.milestone)}
                isCollapsed={layout === 'grid' ? false : layoutItem.isCollapsed}
                resizeAxis={layout === 'horizontal' ? 'horizontal' : 'vertical'}
                customHeight={layoutItem.customHeight}
                customWidth={layoutItem.customWidth ?? null}
                className={frameClassName}
                onToggleCollapse={() => void toggleWidgetCollapsed(meta.id)}
                onResizeHeight={(h) => void setWidgetHeight(meta.id, h)}
                onResizeWidth={(w) => void setWidgetWidth(meta.id, w)}
              >
                {renderWidgetBody(meta.id, meta.description)}
              </WidgetFrame>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
