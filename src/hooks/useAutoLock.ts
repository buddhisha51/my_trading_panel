import { useEffect } from 'react';
import { tauriBridge } from '../services/tauriBridge';
import { useDockStore } from '../stores/dockStore';

function isEditableElement(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  ) {
    return true;
  }
  return Boolean(el.closest('[data-canvas-active], [data-lock-open]'));
}

/**
 * Automatically locks the panel open and clears `WS_EX_NOACTIVATE` whenever the user
 * interacts with form inputs, TipTap, or the Konva drawing canvas, preventing accidental
 * mouse-out collapses or lost focus while typing.
 */
export function useAutoLock() {
  const setAutoLocked = useDockStore((s) => s.setAutoLocked);

  useEffect(() => {
    let blurTimer: number | null = null;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (isEditableElement(target)) {
        void tauriBridge.setFocusable(true, true);
        void setAutoLocked(true);
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      if (blurTimer !== null) {
        window.clearTimeout(blurTimer);
        blurTimer = null;
      }
      if (isEditableElement(e.target as Element | null)) {
        void setAutoLocked(true);
      }
    };

    const handleFocusOut = () => {
      if (blurTimer !== null) {
        window.clearTimeout(blurTimer);
      }
      blurTimer = window.setTimeout(() => {
        blurTimer = null;
        if (!isEditableElement(document.activeElement)) {
          void setAutoLocked(false);
        }
      }, 120);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      if (blurTimer !== null) window.clearTimeout(blurTimer);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, [setAutoLocked]);
}
