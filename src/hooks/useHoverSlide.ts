import { useCallback, useEffect, useRef } from 'react';
import { useDockStore } from '../stores/dockStore';
import { useSettingsStore } from '../stores/settingsStore';

const EDGE_DEAD_ZONE_PX = 10;

export function useHoverSlide() {
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const edge = useSettingsStore((s) => s.settings.edge);
  const hoverOpenDelayMs = useSettingsStore((s) => s.settings.hoverOpenDelayMs);
  const hoverCloseDelayMs = useSettingsStore((s) => s.settings.hoverCloseDelayMs);

  const phase = useDockStore((s) => s.phase);
  const isPinned = useDockStore((s) => s.isPinned);
  const isAutoLocked = useDockStore((s) => s.isAutoLocked);
  const isSettingsOpen = useDockStore((s) => s.isSettingsOpen);
  const isHotkeysOpen = useDockStore((s) => s.isHotkeysOpen);
  const isResizing = useDockStore((s) => s.isResizing);
  const isDragging = useDockStore((s) => s.isDragging);
  const isReorderingWidgets = useDockStore((s) => s.isReorderingWidgets);
  const expandPanel = useDockStore((s) => s.expandPanel);
  const collapsePanel = useDockStore((s) => s.collapsePanel);

  const clearTimers = useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const handleStripEnter = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (phase === 'expanded' || phase === 'expanding' || phase === 'fullscreen') return;

    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
    }
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null;
      void expandPanel();
    }, Math.max(0, hoverOpenDelayMs));
  }, [expandPanel, hoverOpenDelayMs, phase]);

  const handleStripLeave = useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const handlePanelEnter = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (phase === 'collapsing') {
      void expandPanel();
    }
  }, [expandPanel, phase]);

  const handlePanelLeave = useCallback(
    (clientX: number, clientY: number, rect: DOMRect | null) => {
      if (
        isPinned ||
        isAutoLocked ||
        isSettingsOpen ||
        isHotkeysOpen ||
        isResizing ||
        isDragging ||
        isReorderingWidgets
      )
        return;
      if (phase === 'collapsed' || phase === 'collapsing' || phase === 'fullscreen') return;

      // Ignore accidental jitter along the docked outer screen edge (10px dead zone)
      if (rect) {
        if (edge === 'left' && clientX <= rect.left + EDGE_DEAD_ZONE_PX) return;
        if (edge === 'right' && clientX >= rect.right - EDGE_DEAD_ZONE_PX) return;
        if (edge === 'top' && clientY <= rect.top + EDGE_DEAD_ZONE_PX) return;
        if (edge === 'bottom' && clientY >= rect.bottom - EDGE_DEAD_ZONE_PX) return;
      }

      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        void collapsePanel();
      }, Math.max(0, hoverCloseDelayMs));
    },
    [
      collapsePanel,
      edge,
      hoverCloseDelayMs,
      isAutoLocked,
      isDragging,
      isPinned,
      isReorderingWidgets,
      isResizing,
      isHotkeysOpen,
      isSettingsOpen,
      phase,
    ],
  );

  const openImmediately = useCallback(() => {
    clearTimers();
    void expandPanel();
  }, [clearTimers, expandPanel]);

  return {
    handleStripEnter,
    handleStripLeave,
    handlePanelEnter,
    handlePanelLeave,
    openImmediately,
    clearTimers,
  };
}
