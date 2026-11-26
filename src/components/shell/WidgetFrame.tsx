import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import type { WidgetId } from '../../types/settings';

interface WidgetFrameProps {
  widgetId: WidgetId;
  title: string;
  badge?: ReactNode;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  className?: string;
  children: ReactNode;
}

  export const WidgetFrame = memo(function WidgetFrame({
    widgetId,
    title,
    badge,
    isCollapsed,
    onToggleCollapse,
    className = '',
    children,
  }: WidgetFrameProps) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: widgetId });

    const style: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.55 : 1,
    };

    return (
      <section
        ref={setNodeRef}
        style={style}
        className={`flex flex-col rounded-lg border border-slate-800/95 bg-slate-900/85 shadow-sm ${isDragging ? 'z-30 ring-1 ring-blue-500/60' : ''
          } ${className}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-1.5 px-2 py-1.5">
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              {...attributes}
              {...listeners}
              title="Drag to reorder widget"
              aria-label={`Reorder ${title}`}
              className="cursor-grab rounded p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300 active:cursor-grabbing"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={onToggleCollapse}
              aria-expanded={!isCollapsed}
              className="flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-left transition-colors hover:bg-slate-800/60"
            >
              {isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              )}
              <span className="truncate text-xs font-semibold text-slate-100">
                {title}
              </span>
            </button>
          </div>

          {badge && <div className="shrink-0">{badge}</div>}
        </div>

        {!isCollapsed && (
          <div className="max-h-[540px] overflow-y-auto border-t border-slate-800/80 px-2.5 py-2.5">
            {children}
          </div>
        )}
      </section>
    );
});
