import { describe, expect, it } from 'vitest';
import {
  formatAcceleratorForDisplay,
  keyboardEventToAccelerator,
  matchesAccelerator,
} from '../hotkeyUtils';

describe('hotkeyUtils', () => {
  it('formats Tauri global shortcut strings for Windows display', () => {
    expect(formatAcceleratorForDisplay('CommandOrControl+Shift+T')).toBe('Ctrl + Shift + T');
    expect(formatAcceleratorForDisplay('CommandOrControl+Alt+S')).toBe('Ctrl + Alt + S');
    expect(formatAcceleratorForDisplay('  ')).toBe('Unbound');
  });

  it('ignores bare modifiers and unmodified keys during recording', () => {
    expect(
      keyboardEventToAccelerator({
        key: 'Control',
        code: 'ControlLeft',
        ctrlKey: true,
        altKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    ).toBeNull();

    expect(
      keyboardEventToAccelerator({
        key: 't',
        code: 'KeyT',
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    ).toBeNull();
  });

  it('normalizes valid shortcut combinations into Tauri accelerator syntax', () => {
    expect(
      keyboardEventToAccelerator({
        key: 't',
        code: 'KeyT',
        ctrlKey: true,
        altKey: false,
        shiftKey: true,
        metaKey: false,
      }),
    ).toBe('CommandOrControl+Shift+T');

    expect(
      keyboardEventToAccelerator({
        key: '/',
        code: 'Slash',
        ctrlKey: true,
        altKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    ).toBe('CommandOrControl+Slash');

    expect(
      keyboardEventToAccelerator({
        key: ',',
        code: 'Comma',
        ctrlKey: true,
        altKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    ).toBe('CommandOrControl+Comma');

    expect(
      keyboardEventToAccelerator({
        key: ' ',
        code: 'Space',
        ctrlKey: false,
        altKey: true,
        shiftKey: false,
        metaKey: false,
      }),
    ).toBe('Alt+Space');

    expect(
      keyboardEventToAccelerator({
        key: 'ArrowUp',
        code: 'ArrowUp',
        ctrlKey: true,
        altKey: false,
        shiftKey: true,
        metaKey: false,
      }),
    ).toBe('CommandOrControl+Shift+Up');
  });

  it('matches browser keydown events accurately against accelerator strings', () => {
    expect(
      matchesAccelerator(
        {
          key: 'T',
          ctrlKey: true,
          altKey: false,
          shiftKey: true,
          metaKey: false,
        },
        'CommandOrControl+Shift+T',
      ),
    ).toBe(true);

    expect(
      matchesAccelerator(
        {
          key: '/',
          ctrlKey: true,
          altKey: false,
          shiftKey: false,
          metaKey: false,
        },
        'CommandOrControl+Slash',
      ),
    ).toBe(true);

    expect(
      matchesAccelerator(
        {
          key: 't',
          ctrlKey: true,
          altKey: false,
          shiftKey: false,
          metaKey: false,
        },
        'CommandOrControl+Shift+T',
      ),
    ).toBe(false);
  });
});
