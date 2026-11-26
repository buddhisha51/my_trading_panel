export type HotkeyActionId =
  | 'togglePanel'
  | 'toggleFullscreen'
  | 'screenSnip'
  | 'togglePin';

export interface HotkeyConfig {
  enabled: boolean;
  togglePanel: string;
  toggleFullscreen: string;
  screenSnip: string;
  togglePin: string;
}

export const DEFAULT_HOTKEYS: HotkeyConfig = {
  enabled: true,
  togglePanel: 'CommandOrControl+Shift+T',
  toggleFullscreen: 'CommandOrControl+Shift+F',
  screenSnip: 'CommandOrControl+Shift+S',
  togglePin: 'CommandOrControl+Shift+P',
};

export interface HotkeyActionMeta {
  id: HotkeyActionId;
  title: string;
  description: string;
}

export const GLOBAL_HOTKEY_META: HotkeyActionMeta[] = [
  {
    id: 'togglePanel',
    title: 'Toggle Slide Panel',
    description: 'Expand or collapse the docked panel over TradingView / MT5.',
  },
  {
    id: 'toggleFullscreen',
    title: 'Full-Screen Workspace',
    description: 'Expand to full-screen review dashboard and return cleanly to edge.',
  },
  {
    id: 'screenSnip',
    title: 'Quick Screen Snip',
    description: 'Launch Windows Snipping Tool (ms-screenclip:) across any monitor.',
  },
  {
    id: 'togglePin',
    title: 'Pin / Unpin Panel',
    description: 'Lock the expanded panel open or re-enable hover auto-collapse.',
  },
];

export interface StaticShortcutInfo {
  keys: string;
  action: string;
  scope: 'Panel Navigation' | 'ICT Drawing Canvas' | 'Rich Note Editor';
}

export const STATIC_SHORTCUTS: StaticShortcutInfo[] = [
  { keys: 'Ctrl + /', action: 'Open or close this Hotkey Cheat Sheet', scope: 'Panel Navigation' },
  { keys: 'Ctrl + ,', action: 'Open or close Panel Settings', scope: 'Panel Navigation' },
  { keys: 'Esc', action: 'Close Settings / Cheat Sheet / Exit Full-Screen', scope: 'Panel Navigation' },
  { keys: 'Ctrl + Z', action: 'Undo canvas drawing step', scope: 'ICT Drawing Canvas' },
  { keys: 'Ctrl + Shift + Z', action: 'Redo canvas drawing step', scope: 'ICT Drawing Canvas' },
  { keys: 'Ctrl + V', action: 'Paste screenshot directly onto canvas background', scope: 'ICT Drawing Canvas' },
  { keys: 'Delete / Backspace', action: 'Remove selected shape on canvas', scope: 'ICT Drawing Canvas' },
  { keys: 'Double-Click Text', action: 'Edit existing canvas text annotation', scope: 'ICT Drawing Canvas' },
  { keys: 'Ctrl + V', action: 'Paste screenshot image as Note attachment & markup', scope: 'Rich Note Editor' },
  { keys: 'Ctrl + B / I / U', action: 'Bold, Italic, Underline formatting', scope: 'Rich Note Editor' },
];
