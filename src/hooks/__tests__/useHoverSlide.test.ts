import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDockStore } from '../../stores/dockStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { DEFAULT_SETTINGS } from '../../types/settings';
import { useHoverSlide } from '../useHoverSlide';

describe('useHoverSlide', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        hoverOpenDelayMs: 300,
        hoverCloseDelayMs: 500,
        animationDurationMs: 200,
      },
      hydrated: true,
    });
    useDockStore.setState({
      phase: 'collapsed',
      slideVisible: false,
      isPinned: false,
      isAutoLocked: false,
      isSettingsOpen: false,
      isResizing: false,
      isDragging: false,
    });
  });

  it('respects hover open debounce and cancels if cursor leaves early', async () => {
    const expandSpy = vi.spyOn(useDockStore.getState(), 'expandPanel');
    const { result } = renderHook(() => useHoverSlide());

    act(() => {
      result.current.handleStripEnter();
    });
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(expandSpy).not.toHaveBeenCalled();

    // Cursor leaves before 300ms -> canceled
    act(() => {
      result.current.handleStripLeave();
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(expandSpy).not.toHaveBeenCalled();

    // Cursor enters and stays >= 300ms -> opens
    act(() => {
      result.current.handleStripEnter();
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(expandSpy).toHaveBeenCalledTimes(1);
  });

  it('refuses to collapse when pinned or auto-locked', async () => {
    const collapseSpy = vi.spyOn(useDockStore.getState(), 'collapsePanel');
    useDockStore.setState({ phase: 'expanded', slideVisible: true, isPinned: true });

    const { result } = renderHook(() => useHoverSlide());
    act(() => {
      result.current.handlePanelLeave(500, 200, new DOMRect(0, 0, 380, 1000));
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(collapseSpy).not.toHaveBeenCalled();

    // Unpinned, but autoLocked while typing -> still refuses collapse
    act(() => {
      useDockStore.setState({ isPinned: false, isAutoLocked: true });
    });
    act(() => {
      result.current.handlePanelLeave(500, 200, new DOMRect(0, 0, 380, 1000));
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(collapseSpy).not.toHaveBeenCalled();
  });

  it('ignores mouse leave inside the 10px docked outer edge dead zone', async () => {
    const collapseSpy = vi.spyOn(useDockStore.getState(), 'collapsePanel');
    useDockStore.setState({ phase: 'expanded', slideVisible: true, isPinned: false });

    const { result } = renderHook(() => useHoverSlide());
    act(() => {
      result.current.handlePanelLeave(4, 200, new DOMRect(0, 0, 380, 1000));
    });
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    expect(collapseSpy).not.toHaveBeenCalled();
  });

  it('reverses slide-out and expands again if cursor re-enters during collapsing', async () => {
    const expandSpy = vi.spyOn(useDockStore.getState(), 'expandPanel');
    useDockStore.setState({ phase: 'collapsing', slideVisible: false });

    const { result } = renderHook(() => useHoverSlide());
    await act(async () => {
      result.current.handlePanelEnter();
    });
    expect(expandSpy).toHaveBeenCalledTimes(1);
  });
});
