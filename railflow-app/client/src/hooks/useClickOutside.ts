import { useEffect, type RefObject } from 'react';

interface UseClickOutsideOptions {
  enabled?: boolean;
  onEscape?: () => void;
  ignoreRefs?: RefObject<HTMLElement | null>[];
}

export function useClickOutside<T extends HTMLElement = HTMLElement>(
  ref: RefObject<T | null>,
  handler: (event: MouseEvent | TouchEvent) => void,
  options: UseClickOutsideOptions = {}
): void {
  const { enabled = true, onEscape, ignoreRefs = [] } = options;

  useEffect(() => {
    if (!enabled) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      // Click is inside main ref
      if (ref.current && ref.current.contains(target)) {
        return;
      }

      // Click is inside any ignored refs (e.g. trigger buttons)
      for (const ignoreRef of ignoreRefs) {
        if (ignoreRef.current && ignoreRef.current.contains(target)) {
          return;
        }
      }

      handler(event);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onEscape) {
        onEscape();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    if (onEscape) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      if (onEscape) {
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
  }, [ref, handler, enabled, onEscape, ignoreRefs]);
}
