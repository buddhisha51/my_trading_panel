import { useCallback, useLayoutEffect, useRef } from 'react';

export interface ScrollPosition {
  top: number;
  left: number;
}

const scrollRegistry = new Map<string, ScrollPosition>();

/** Read the last recorded in-memory scroll offset for a container key during this run. */
export function getSavedScrollPosition(key: string): ScrollPosition | undefined {
  return scrollRegistry.get(key);
}

/** Save an in-memory scroll offset for a container key during this run. */
export function setSavedScrollPosition(key: string, pos: ScrollPosition): void {
  scrollRegistry.set(key, {
    top: Math.max(0, pos.top),
    left: Math.max(0, pos.left),
  });
}

/** Reset all saved scroll offsets (intended for tests). */
export function clearSavedScrollPositions(): void {
  scrollRegistry.clear();
}

/**
 * Remembers and restores `scrollTop` and `scrollLeft` across component unmounts
 * (e.g., when the hover-slide panel collapses on mouse leave and reopens on hover).
 */
export function usePreservedScroll<T extends HTMLElement = HTMLDivElement>(key: string) {
  const elRef = useRef<T | null>(null);

  useLayoutEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const saved = scrollRegistry.get(key);
    let pending: ScrollPosition | null =
      saved && (saved.top > 0 || saved.left > 0) ? { ...saved } : null;
    let isApplying = false;
    let rafId: number | null = null;

    const applySaved = () => {
      if (!pending) return;
      isApplying = true;
      el.scrollTop = pending.top;
      el.scrollLeft = pending.left;

      const reachedTop = Math.abs(el.scrollTop - pending.top) <= 1;
      const reachedLeft = Math.abs(el.scrollLeft - pending.left) <= 1;
      if (reachedTop && reachedLeft) {
        pending = null;
      }

      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        rafId = null;
        isApplying = false;
        if (pending && el.isConnected) {
          el.scrollTop = pending.top;
          el.scrollLeft = pending.left;
          if (
            Math.abs(el.scrollTop - pending.top) <= 1 &&
            Math.abs(el.scrollLeft - pending.left) <= 1
          ) {
            pending = null;
          }
        }
      });
    };

    if (pending) {
      applySaved();
    } else {
      // Ensure switching scroll keys on a reused element doesn't inherit a prior orientation's offset
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }

    const cancelPendingRestore = () => {
      pending = null;
      isApplying = false;
    };

    const handleScroll = () => {
      if (isApplying) return;
      // Ignore synthetic 0,0 clamps fired before async children finish restoring scrollHeight.
      if (pending && el.scrollTop === 0 && el.scrollLeft === 0) {
        return;
      }
      pending = null;
      setSavedScrollPosition(key, { top: el.scrollTop, left: el.scrollLeft });
    };

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && pending
        ? new ResizeObserver(() => {
            if (pending) applySaved();
          })
        : null;

    if (resizeObserver) {
      resizeObserver.observe(el);
      for (const child of Array.from(el.children)) {
        resizeObserver.observe(child);
      }
    }

    el.addEventListener('scroll', handleScroll, { passive: true });
    el.addEventListener('wheel', cancelPendingRestore, { passive: true });
    el.addEventListener('touchstart', cancelPendingRestore, { passive: true });
    el.addEventListener('pointerdown', cancelPendingRestore, { passive: true });

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      resizeObserver?.disconnect();
      el.removeEventListener('scroll', handleScroll);
      el.removeEventListener('wheel', cancelPendingRestore);
      el.removeEventListener('touchstart', cancelPendingRestore);
      el.removeEventListener('pointerdown', cancelPendingRestore);

      const canScrollV = el.scrollHeight > el.clientHeight;
      const canScrollH = el.scrollWidth > el.clientWidth;
      if (
        !pending &&
        (el.scrollTop > 0 ||
          el.scrollLeft > 0 ||
          (canScrollV && el.clientHeight > 0) ||
          (canScrollH && el.clientWidth > 0))
      ) {
        setSavedScrollPosition(key, { top: el.scrollTop, left: el.scrollLeft });
      }
    };
  }, [key]);

  return useCallback((node: T | null) => {
    elRef.current = node;
  }, []);
}
