import { useEffect, type RefObject } from 'react';

/**
 * Closes a native `<details>` element when a pointer press happens outside it.
 * Native `<details>` popovers otherwise stay open until the summary is toggled.
 */
export function useDetailsOutsideClose(ref: RefObject<HTMLDetailsElement | null>): void {
  useEffect(() => {
    function onPointerDown(event: PointerEvent): void {
      const details = ref.current;
      if (details?.open && !details.contains(event.target as Node)) {
        details.open = false;
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [ref]);
}
