import { act, fireEvent, render, screen } from '@testing-library/react';
import { DateTime } from 'luxon';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDockStore } from '../../../stores/dockStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { DEFAULT_SETTINGS, DEFAULT_WIDGET_LAYOUT } from '../../../types/settings';
import { SettingsOverlay } from '../../settings/SettingsOverlay';
import { WidgetStack } from '../WidgetStack';

describe('Per-widget resize', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS },
      widgetLayout: DEFAULT_WIDGET_LAYOUT.map((w) => ({ ...w, isCollapsed: false })),
      hydrated: true,
    });
    useDockStore.setState({
      isResizing: false,
      isHotkeysOpen: false,
      isSettingsOpen: false,
    });
  });

  it('provides a bottom resize handle for every widget, commits customHeight on drag, and resets on click/double-click', async () => {
    const { container } = render(<WidgetStack now={DateTime.utc()} layout="vertical" />);

    const handles = screen.getAllByRole('separator', { name: /^Resize /i });
    expect(handles.length).toBe(DEFAULT_WIDGET_LAYOUT.length);

    const biasHandle = screen.getByRole('separator', { name: 'Resize Daily Bias Quick-Strip' });
    const biasSection = biasHandle.closest('section') as HTMLElement;
    const biasBody = biasSection.querySelector('.overflow-y-auto.border-t') as HTMLElement;
    expect(biasBody.style.height).toBe('');

    Object.defineProperty(biasBody, 'getBoundingClientRect', {
      value: () => ({ height: 240, width: 320, top: 0, left: 0, right: 320, bottom: 240 }),
      configurable: true,
    });

    await act(async () => {
      fireEvent.pointerDown(biasHandle, { button: 0, clientY: 200 });
    });
    expect(useDockStore.getState().isResizing).toBe(true);

    await act(async () => {
      fireEvent(window, new PointerEvent('pointermove', { clientY: 310 }));
    });
    expect(biasBody.style.height).toBe('350px');

    await act(async () => {
      fireEvent(window, new PointerEvent('pointerup', { clientY: 310 }));
    });
    expect(useDockStore.getState().isResizing).toBe(false);
    expect(
      useSettingsStore.getState().widgetLayout.find((w) => w.widgetId === 'daily-bias')?.customHeight,
    ).toBe(350);
    expect(biasBody.style.height).toBe('350px');

    // Clicking the reset pill restores Auto height
    const resetBtn = screen.getByRole('button', { name: 'Reset Daily Bias Quick-Strip height' });
    await act(async () => {
      fireEvent.click(resetBtn);
    });
    expect(
      useSettingsStore.getState().widgetLayout.find((w) => w.widgetId === 'daily-bias')?.customHeight,
    ).toBeNull();
    expect(biasBody.style.height).toBe('');

    // Ensure other widgets also appear in container without errors
    expect(container.querySelectorAll('section').length).toBe(DEFAULT_WIDGET_LAYOUT.length);
  });

  it('allows setting and clearing widget customHeight in SettingsOverlay Widgets tab', async () => {
    render(<SettingsOverlay initialTab="widgets" />);

    const input = screen.getByLabelText('ICT Killzones & Macros height (px)') as HTMLInputElement;
    expect(input.value).toBe('');

    await act(async () => {
      fireEvent.change(input, { target: { value: '420' } });
      fireEvent.blur(input);
    });
    expect(
      useSettingsStore
        .getState()
        .widgetLayout.find((w) => w.widgetId === 'killzone-timeline')?.customHeight,
    ).toBe(420);

    const clearBtn = screen.getByRole('button', {
      name: 'Reset ICT Killzones & Macros height to Auto',
    });
    await act(async () => {
      fireEvent.click(clearBtn);
    });
    expect(
      useSettingsStore
        .getState()
        .widgetLayout.find((w) => w.widgetId === 'killzone-timeline')?.customHeight,
    ).toBeNull();
  });

  it('provides right-side width resize handles in horizontal mode (top/bottom edges) and resets width on click', async () => {
    render(<WidgetStack now={DateTime.utc()} layout="horizontal" />);

    const handles = screen.getAllByRole('separator', { name: /^Resize .* width$/i });
    expect(handles.length).toBe(DEFAULT_WIDGET_LAYOUT.length);

    const biasWidthHandle = screen.getByRole('separator', {
      name: 'Resize Daily Bias Quick-Strip width',
    });
    const biasSection = biasWidthHandle.closest('section') as HTMLElement;
    expect(biasSection.style.width).toBe('330px');

    Object.defineProperty(biasSection, 'getBoundingClientRect', {
      value: () => ({ height: 240, width: 330, top: 0, left: 0, right: 330, bottom: 240 }),
      configurable: true,
    });

    await act(async () => {
      fireEvent.pointerDown(biasWidthHandle, { button: 0, clientX: 330 });
    });
    expect(useDockStore.getState().isResizing).toBe(true);

    await act(async () => {
      fireEvent(window, new PointerEvent('pointermove', { clientX: 480 }));
    });
    expect(biasSection.style.width).toBe('480px');

    await act(async () => {
      fireEvent(window, new PointerEvent('pointerup', { clientX: 480 }));
    });
    expect(useDockStore.getState().isResizing).toBe(false);
    expect(
      useSettingsStore.getState().widgetLayout.find((w) => w.widgetId === 'daily-bias')?.customWidth,
    ).toBe(480);

    const resetBtn = screen.getByRole('button', { name: 'Reset Daily Bias Quick-Strip width' });
    await act(async () => {
      fireEvent.click(resetBtn);
    });
    expect(
      useSettingsStore.getState().widgetLayout.find((w) => w.widgetId === 'daily-bias')?.customWidth,
    ).toBeNull();
    expect(biasSection.style.width).toBe('330px');
  });
});
