import { act, fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import { useDockStore } from '../../stores/dockStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { DEFAULT_SETTINGS, DEFAULT_WIDGET_LAYOUT } from '../../types/settings';
import {
  clearSavedScrollPositions,
  getSavedScrollPosition,
  usePreservedScroll,
} from '../usePreservedScroll';

function ScrollHarness({ scrollKey }: { scrollKey: string }) {
  const ref = usePreservedScroll<HTMLDivElement>(scrollKey);
  return (
    <div ref={ref} data-testid="scroll-box" className="h-40 overflow-y-auto">
      <div className="h-96">Tall content</div>
    </div>
  );
}

describe('usePreservedScroll', () => {
  beforeEach(() => {
    clearSavedScrollPositions();
    localStorage.clear();
  });

  it('remembers scrollTop and scrollLeft across unmount and remount during runtime', () => {
    const { getByTestId, unmount } = render(<ScrollHarness scrollKey="panel-test" />);
    const box = getByTestId('scroll-box');

    Object.defineProperty(box, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(box, 'clientHeight', { value: 300, configurable: true });
    box.scrollTop = 340;
    box.scrollLeft = 45;
    fireEvent.scroll(box);

    expect(getSavedScrollPosition('panel-test')).toEqual({ top: 340, left: 45 });

    unmount();

    const second = render(<ScrollHarness scrollKey="panel-test" />);
    const remountedBox = second.getByTestId('scroll-box');
    expect(remountedBox.scrollTop).toBe(340);
    expect(remountedBox.scrollLeft).toBe(45);

    // Explicitly scrolling back to 0 updates the remembered position
    Object.defineProperty(remountedBox, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(remountedBox, 'clientHeight', { value: 300, configurable: true });
    remountedBox.scrollTop = 0;
    remountedBox.scrollLeft = 0;
    fireEvent.scroll(remountedBox);

    second.unmount();
    const third = render(<ScrollHarness scrollKey="panel-test" />);
    expect(third.getByTestId('scroll-box').scrollTop).toBe(0);
    expect(third.getByTestId('scroll-box').scrollLeft).toBe(0);
  });

  it('restores WidgetStack and WidgetFrame scroll positions when hover-slide collapses and reopens', () => {
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, edge: 'left' },
      widgetLayout: DEFAULT_WIDGET_LAYOUT.map((w) => ({ ...w, isCollapsed: false })),
      hydrated: true,
    });
    useDockStore.setState({
      phase: 'expanded',
      slideVisible: true,
      isPinned: false,
      isAutoLocked: false,
      isSettingsOpen: false,
      isHotkeysOpen: false,
    });

    const { container } = render(<App />);

    const stackEl = container.querySelector('.flex-1.overflow-y-auto') as HTMLElement | null;
    const widgetBodies = container.querySelectorAll('.overflow-y-auto.border-t');
    expect(stackEl).toBeTruthy();
    expect(widgetBodies.length).toBeGreaterThan(0);

    const firstWidgetBody = widgetBodies[0] as HTMLElement;

    Object.defineProperty(stackEl!, 'scrollHeight', { value: 2400, configurable: true });
    Object.defineProperty(stackEl!, 'clientHeight', { value: 700, configurable: true });
    stackEl!.scrollTop = 520;
    fireEvent.scroll(stackEl!);

    Object.defineProperty(firstWidgetBody, 'scrollHeight', { value: 900, configurable: true });
    Object.defineProperty(firstWidgetBody, 'clientHeight', { value: 540, configurable: true });
    firstWidgetBody.scrollTop = 185;
    fireEvent.scroll(firstWidgetBody);

    // User hovers away -> slide collapses and PanelContainer unmounts
    act(() => {
      useDockStore.setState({ phase: 'collapsed', slideVisible: false });
    });
    expect(container.querySelector('.flex-1.overflow-y-auto')).toBeNull();

    // User hovers back onto strip -> slide opens again -> exact scroll offsets restored
    act(() => {
      useDockStore.setState({ phase: 'expanded', slideVisible: true });
    });

    const reopenedStackEl = container.querySelector('.flex-1.overflow-y-auto') as HTMLElement | null;
    const reopenedBodies = container.querySelectorAll('.overflow-y-auto.border-t');
    expect(reopenedStackEl).toBeTruthy();
    expect(reopenedStackEl!.scrollTop).toBe(520);
    expect((reopenedBodies[0] as HTMLElement).scrollTop).toBe(185);
  });

  it('isolates vertical vs horizontal scroll offsets across all 4 dock edges and avoids cropping cards on top/bottom', () => {
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, edge: 'left' },
      widgetLayout: DEFAULT_WIDGET_LAYOUT.map((w) => ({ ...w, isCollapsed: false })),
      hydrated: true,
    });
    useDockStore.setState({
      phase: 'expanded',
      slideVisible: true,
      isPinned: false,
      isAutoLocked: false,
      isSettingsOpen: false,
      isHotkeysOpen: false,
    });

    const { container } = render(<App />);
    const leftStack = container.querySelector('.flex-1.flex-col.overflow-y-auto') as HTMLElement;
    expect(leftStack).toBeTruthy();

    Object.defineProperty(leftStack, 'scrollHeight', { value: 2400, configurable: true });
    Object.defineProperty(leftStack, 'clientHeight', { value: 700, configurable: true });
    leftStack.scrollTop = 360;
    fireEvent.scroll(leftStack);

    // Move dock to TOP edge while scrolled down on LEFT
    act(() => {
      useSettingsStore.setState((s) => ({
        settings: { ...s.settings, edge: 'top' },
      }));
    });

    const topStack = container.querySelector('.flex-1.flex-row.overflow-x-auto') as HTMLElement;
    expect(topStack).toBeTruthy();
    expect(topStack.scrollTop).toBe(0);
    expect(topStack.className).toContain('overflow-y-auto');
    expect(topStack.className).not.toContain('overflow-y-hidden');

    const topCards = topStack.querySelectorAll('section');
    expect(topCards.length).toBe(DEFAULT_WIDGET_LAYOUT.length);
    topCards.forEach((card) => {
      expect(card.className).toContain('max-h-full');
    });

    // Pan horizontally on TOP and move to BOTTOM edge
    Object.defineProperty(topStack, 'scrollWidth', { value: 3200, configurable: true });
    Object.defineProperty(topStack, 'clientWidth', { value: 1200, configurable: true });
    topStack.scrollLeft = 480;
    fireEvent.scroll(topStack);

    act(() => {
      useSettingsStore.setState((s) => ({
        settings: { ...s.settings, edge: 'bottom' },
      }));
    });
    const bottomStack = container.querySelector('.flex-1.flex-row.overflow-x-auto') as HTMLElement;
    expect(bottomStack).toBeTruthy();
    expect(bottomStack.scrollLeft).toBe(480);
    expect(bottomStack.scrollTop).toBe(0);

    // Move to RIGHT edge -> restores vertical scroll without leaking horizontal scrollLeft
    act(() => {
      useSettingsStore.setState((s) => ({
        settings: { ...s.settings, edge: 'right' },
      }));
    });
    const rightStack = container.querySelector('.flex-1.flex-col.overflow-y-auto') as HTMLElement;
    expect(rightStack).toBeTruthy();
    expect(rightStack.scrollTop).toBe(360);
    expect(rightStack.scrollLeft).toBe(0);
  });
});
