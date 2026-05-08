import { useEffect, useRef, useState, type RefObject } from 'react';

interface UseHorizontalScrollHintsOptions {
  pulseStorageKey: string;
  pulseDurationMs?: number;
}

interface HorizontalScrollHintsState<T extends HTMLElement> {
  scrollRef: RefObject<T | null>;
  isOverflowing: boolean;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  shouldPulseRightHint: boolean;
}

export function useHorizontalScrollHints<T extends HTMLElement>({
  pulseStorageKey,
  pulseDurationMs = 760,
}: UseHorizontalScrollHintsOptions): HorizontalScrollHintsState<T> {
  const scrollRef = useRef<T | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [shouldPulseRightHint, setShouldPulseRightHint] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.sessionStorage.getItem(pulseStorageKey) !== '1';
  });

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) {
      return;
    }

    const updateScrollHints = () => {
      const nextIsOverflowing = scrollElement.scrollWidth > scrollElement.clientWidth + 1;
      const maxScrollLeft = scrollElement.scrollWidth - scrollElement.clientWidth;
      setIsOverflowing((previous) => (previous === nextIsOverflowing ? previous : nextIsOverflowing));
      setCanScrollLeft(scrollElement.scrollLeft > 2);
      setCanScrollRight(maxScrollLeft - scrollElement.scrollLeft > 2);
    };

    updateScrollHints();
    const resizeObserver = new ResizeObserver(updateScrollHints);
    resizeObserver.observe(scrollElement);
    scrollElement.addEventListener('scroll', updateScrollHints, { passive: true });
    window.addEventListener('resize', updateScrollHints);

    return () => {
      resizeObserver.disconnect();
      scrollElement.removeEventListener('scroll', updateScrollHints);
      window.removeEventListener('resize', updateScrollHints);
    };
  }, []);

  useEffect(() => {
    if (!shouldPulseRightHint || !isOverflowing || !canScrollRight) {
      return;
    }
    const timer = window.setTimeout(() => {
      setShouldPulseRightHint(false);
      window.sessionStorage.setItem(pulseStorageKey, '1');
    }, pulseDurationMs);
    return () => window.clearTimeout(timer);
  }, [shouldPulseRightHint, isOverflowing, canScrollRight, pulseDurationMs, pulseStorageKey]);

  return {
    scrollRef,
    isOverflowing,
    canScrollLeft,
    canScrollRight,
    shouldPulseRightHint,
  };
}
