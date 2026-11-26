import { beforeEach, describe, expect, it } from 'vitest';
import { useSettingsStore } from '../settingsStore';
import { DEFAULT_SETTINGS, DEFAULT_WIDGET_LAYOUT } from '../../types/settings';

describe('settingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS },
      widgetLayout: DEFAULT_WIDGET_LAYOUT.map((w) => ({ ...w })),
      hydrated: false,
      saving: false,
    });
  });

  it('persists updated settings across re-hydration', async () => {
    await useSettingsStore.getState().hydrate();
    await useSettingsStore.getState().updateSettings({
      edge: 'right',
      expandedSize: 440,
      panelOpacity: 0.85,
      timeFormat: '12h',
    });

    // Reset in-memory state and re-hydrate from storage layer
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS },
      hydrated: false,
    });

    await useSettingsStore.getState().hydrate();
    const { settings } = useSettingsStore.getState();
    expect(settings.edge).toBe('right');
    expect(settings.expandedSize).toBe(440);
    expect(settings.panelOpacity).toBe(0.85);
    expect(settings.timeFormat).toBe('12h');
  });

  it('toggles visibility, sets custom height, and reorders widgets cleanly', async () => {
    await useSettingsStore.getState().hydrate();
    await useSettingsStore.getState().toggleWidgetVisibility('news-feed');
    await useSettingsStore.getState().setWidgetHeight('daily-bias', 340);
    await useSettingsStore.getState().setWidgetHeight('risk-calculator', 50); // clamped to MIN_WIDGET_HEIGHT (120)
    await useSettingsStore.getState().setWidgetWidth('daily-bias', 460);
    await useSettingsStore.getState().setWidgetWidth('risk-calculator', 100); // clamped to MIN_WIDGET_WIDTH (240)
    await useSettingsStore.getState().moveWidget('session-clock', 'up');
    await useSettingsStore.getState().reorderWidgets('risk-calculator', 'killzone-timeline');

    const layout = useSettingsStore.getState().widgetLayout;
    expect(layout[0].widgetId).toBe('session-clock');
    expect(layout[1].widgetId).toBe('risk-calculator');
    expect(layout[2].widgetId).toBe('killzone-timeline');
    expect(layout.find((w) => w.widgetId === 'news-feed')?.isVisible).toBe(false);
    expect(layout.find((w) => w.widgetId === 'daily-bias')?.customHeight).toBe(340);
    expect(layout.find((w) => w.widgetId === 'risk-calculator')?.customHeight).toBe(120);
    expect(layout.find((w) => w.widgetId === 'daily-bias')?.customWidth).toBe(460);
    expect(layout.find((w) => w.widgetId === 'risk-calculator')?.customWidth).toBe(240);

    await useSettingsStore.getState().setWidgetHeight('daily-bias', null);
    await useSettingsStore.getState().setWidgetWidth('daily-bias', null);
    expect(
      useSettingsStore.getState().widgetLayout.find((w) => w.widgetId === 'daily-bias')?.customHeight,
    ).toBeNull();
    expect(
      useSettingsStore.getState().widgetLayout.find((w) => w.widgetId === 'daily-bias')?.customWidth,
    ).toBeNull();
  });
});
