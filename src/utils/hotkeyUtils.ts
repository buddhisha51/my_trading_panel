/**
 * Formats a Tauri global accelerator (e.g. `CommandOrControl+Shift+T`) into clean,
 * Windows-readable key caps (`Ctrl + Shift + T`).
 */
export function formatAcceleratorForDisplay(accelerator: string): string {
  if (!accelerator.trim()) return 'Unbound';
  return accelerator
    .split('+')
    .map((part) => {
      const p = part.trim();
      if (/^commandorcontrol$/i.test(p) || /^cmdorctrl$/i.test(p) || /^control$/i.test(p)) {
        return 'Ctrl';
      }
      if (/^alt$/i.test(p)) return 'Alt';
      if (/^shift$/i.test(p)) return 'Shift';
      if (/^super$/i.test(p) || /^meta$/i.test(p)) return 'Win';
      if (p.length === 1) return p.toUpperCase();
      return p;
    })
    .join(' + ');
}

const IGNORED_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'OS', 'Dead', 'Unidentified']);

/**
 * Converts a browser KeyboardEvent from a shortcut recorder input into a normalized
 * Tauri global shortcut accelerator string. Returns `null` if only modifier keys are pressed
 * or no modifier is held (global hotkeys require at least Ctrl or Alt to avoid hijacking typing).
 */
export function keyboardEventToAccelerator(
  e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>,
): string | null {
  if (IGNORED_KEYS.has(e.key)) return null;
  if (!e.ctrlKey && !e.altKey && !e.metaKey) return null;

  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');

  let mainKey = e.key;
  if (mainKey === ' ') mainKey = 'Space';
  else if (mainKey === ',') mainKey = 'Comma';
  else if (mainKey === '.') mainKey = 'Period';
  else if (mainKey === '/') mainKey = 'Slash';
  else if (mainKey.length === 1) mainKey = mainKey.toUpperCase();
  else if (/^Arrow/.test(mainKey)) mainKey = mainKey.replace('Arrow', '');

  return [...mods, mainKey].join('+');
}

/**
 * Evaluates whether a local `keydown` event matches a Tauri accelerator string,
 * keeping local window fallback identical to global OS-wide shortcuts.
 */
export function matchesAccelerator(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>,
  accelerator: string,
): boolean {
  if (!accelerator.trim()) return false;
  const parts = accelerator.split('+').map((p) => p.trim().toLowerCase());
  const needsCtrl = parts.some((p) =>
    ['commandorcontrol', 'cmdorctrl', 'ctrl', 'control'].includes(p),
  );
  const needsAlt = parts.includes('alt');
  const needsShift = parts.includes('shift');
  const keyToken = parts.find(
    (p) =>
      !['commandorcontrol', 'cmdorctrl', 'ctrl', 'control', 'alt', 'shift', 'super', 'meta'].includes(
        p,
      ),
  );
  if (!keyToken) return false;

  const hasCtrl = e.ctrlKey || e.metaKey;
  if (hasCtrl !== needsCtrl || e.altKey !== needsAlt || e.shiftKey !== needsShift) {
    return false;
  }

  let evKey = e.key.toLowerCase();
  if (evKey === ' ') evKey = 'space';
  else if (evKey === ',') evKey = 'comma';
  else if (evKey === '.') evKey = 'period';
  else if (evKey === '/') evKey = 'slash';

  return evKey === keyToken;
}
