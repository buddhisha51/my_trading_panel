import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tauriBridge } from '../../../services/tauriBridge';
import { useDockStore } from '../../../stores/dockStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { DEFAULT_HOTKEYS } from '../../../types/hotkeys';
import { SettingsOverlay } from '../../settings/SettingsOverlay';
import { FullScreenDashboard } from '../FullScreenDashboard';
import { HotkeySheetModal } from '../HotkeySheetModal';
import { TitleBar } from '../TitleBar';
import { WidgetFrame } from '../WidgetFrame';

describe('Milestone 5 Polish: Hotkey Cheat Sheet, Key Recorder & Backup Round-Trip', () => {
  beforeEach(async () => {
    localStorage.clear();
    useDockStore.setState({
      isHotkeysOpen: false,
      isSettingsOpen: false,
      hotkeyConflicts: {},
    });
    await useSettingsStore.getState().updateSettings({
      hotkeys: { ...DEFAULT_HOTKEYS },
      notificationsEnabled: true,
    });
  });

  it('opens the Hotkey Cheat Sheet from TitleBar and displays live shortcuts + conflicts', async () => {
    render(<TitleBar />);
    const cheatSheetBtn = screen.getByRole('button', {
      name: /Keyboard Shortcuts Cheat Sheet/i,
    });
    await act(async () => {
      fireEvent.click(cheatSheetBtn);
    });

    expect(useDockStore.getState().isHotkeysOpen).toBe(true);

    act(() => {
      useDockStore.getState().setHotkeyConflicts({
        screenSnip: 'Could not register CommandOrControl+Shift+S globally (in use by Windows)',
      });
    });

    render(<HotkeySheetModal />);
    expect(screen.getByRole('dialog', { name: /Keyboard Shortcuts Cheat Sheet/i })).toBeTruthy();
    expect(screen.getByText(/Global Hotkeys \(Work Over TradingView & MT5\)/i)).toBeTruthy();
    expect(screen.getByText(/Panel Navigation/i)).toBeTruthy();
    expect(screen.getByText(/ICT Drawing Canvas/i)).toBeTruthy();
    expect(screen.getByText(/Rich Note Editor/i)).toBeTruthy();
    expect(screen.getByText('Ctrl + Shift + T')).toBeTruthy();
    expect(screen.getAllByText('Ctrl + /').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Ctrl + Z')).toBeTruthy();
    expect(
      screen.getByText(/Could not register CommandOrControl\+Shift\+S globally/i),
    ).toBeTruthy();
  });

  it('records custom global shortcuts and toggles restore strategy in SettingsOverlay Keys tab', async () => {
    render(<SettingsOverlay initialTab="keys" />);

    expect(screen.getByText(/Global Hotkeys/i)).toBeTruthy();
    expect(screen.getByText(/Alerts & Notifications/i)).toBeTruthy();
    expect(screen.getByText(/Full Backup & Restore/i)).toBeTruthy();

    const toggleShortcutBtn = screen.getByText('Ctrl + Shift + T').closest('button');
    expect(toggleShortcutBtn).toBeTruthy();
    fireEvent.click(toggleShortcutBtn!);

    expect(screen.getByText('Press keys...')).toBeTruthy();
    await act(async () => {
      fireEvent.keyDown(toggleShortcutBtn!, {
        key: 'k',
        code: 'KeyK',
        ctrlKey: true,
        altKey: true,
        shiftKey: false,
        metaKey: false,
      });
    });

    expect(useSettingsStore.getState().settings.hotkeys.togglePanel).toBe(
      'CommandOrControl+Alt+K',
    );
    expect(screen.getByText('Ctrl + Alt + K')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'replace' }));
    expect(screen.getByRole('button', { name: /Import \(replace\)/i })).toBeTruthy();
  });

  it('exports and imports settings backup snapshot in browser preview mode and rejects invalid archives', async () => {
    await useSettingsStore.getState().updateSettings({
      expandedSize: 510,
      notificationsEnabled: false,
    });

    const exported = await tauriBridge.exportBackup();
    expect(exported.manifest.schemaVersion).toBe(1);
    expect(exported.filename.endsWith('.json')).toBe(true);
    expect(exported.bytes.length).toBeGreaterThan(20);

    localStorage.clear();
    const summary = await tauriBridge.importBackup(exported.bytes, 'replace');
    expect(summary.mode).toBe('replace');
    expect(summary.tablesRestored).toBeGreaterThanOrEqual(1);

    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().settings.expandedSize).toBe(510);
    expect(useSettingsStore.getState().settings.notificationsEnabled).toBe(false);

    const invalidBytes = Array.from(new TextEncoder().encode(JSON.stringify({ invalid: true })));
    await expect(tauriBridge.importBackup(invalidBytes, 'merge')).rejects.toThrow(
      'Invalid backup archive format',
    );
  });

  it('invokes quitApp and displays app version in both TitleBar and FullScreenDashboard', async () => {
    const quitSpy = vi.spyOn(tauriBridge, 'quitApp').mockResolvedValue();

    const { unmount } = render(<TitleBar />);
    expect(screen.getByText(`v${__APP_VERSION__}`)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Quit Application/i }));
    });
    expect(quitSpy).toHaveBeenCalledTimes(1);
    unmount();

    render(<FullScreenDashboard />);
    expect(screen.getByText(`v${__APP_VERSION__}`)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Quit Application/i }));
    });
    expect(quitSpy).toHaveBeenCalledTimes(2);

    quitSpy.mockRestore();
  });

  it('keeps widget shortcuts in WidgetFrame ShortcutHoverPopover and separates Global Keys in SettingsOverlay', async () => {
    const { DndContext } = await import('@dnd-kit/core');
    render(
      <DndContext>
        <WidgetFrame
          widgetId="risk-calculator"
          title="Risk & Lot Calculator"
          isCollapsed={false}
          onToggleCollapse={() => {}}
        >
          <div>Risk Content</div>
        </WidgetFrame>
      </DndContext>,
    );

    const helpBtn = screen.getByRole('button', { name: 'Risk & Lot Calculator Controls shortcuts' });
    fireEvent.click(helpBtn);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.getAttribute('data-lock-open')).toBe('true');
    expect(tooltip.style.width).toContain('min(300px,');
    expect(tooltip.style.width).toContain('100vw');
    expect(tooltip.textContent).toContain('Track Trade →');
    expect(tooltip.textContent).not.toContain('Ctrl + Shift + T');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Global Keys/i }));
    });
    expect(useDockStore.getState().isSettingsOpen).toBe(true);
    expect(useDockStore.getState().settingsTab).toBe('keys');

    render(<SettingsOverlay initialTab="keys" />);
    expect(screen.getByRole('button', { name: /Test Chime/i })).toBeTruthy();
  });
});
