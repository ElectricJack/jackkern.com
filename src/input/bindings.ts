import type { Director } from '../camera/director';
import { wheelPixels } from '../camera/travel';

/**
 * Wheel and swipe set pace and direction; arrows choose direction, space pauses/resumes.
 * Returns a disposer so the scene can release all
 * document-level listeners.
 */
export function bindInputs(
  el: HTMLElement,
  director: Director,
): () => void {
  let touchY: number | null = null;
  const onActivity = (): void => director.activity();
  const reading = (event: Event) => el.hasAttribute('data-travelling') || event.target instanceof Element && (
    !!event.target.closest('dialog, .panel, .route-map')
  );

  const onWheel = (event: WheelEvent): void => {
    if (el.dataset.mode === 'static' || reading(event)) return;
    event.preventDefault();
    // The gesture that scrolls a normal page upward travels forward in the villa.
    director.push(-wheelPixels(event));
  };

  const onTouchStart = (event: TouchEvent): void => {
    touchY = null;
    if (el.dataset.mode === 'static' || reading(event)) return;
    touchY = event.touches[0]?.clientY ?? null;
  };

  const onTouchMove = (event: TouchEvent): void => {
    if (el.dataset.mode === 'static' || reading(event)) { touchY = null; return; }
    if (touchY === null) return;
    const y = event.touches[0]?.clientY;
    if (y === undefined) return;

    event.preventDefault();
    // Pulling down travels forward, matching the touchpad gesture.
    director.push(y - touchY);
    touchY = y;
  };

  const onTouchEnd = (): void => {
    touchY = null;
  };

  const onKey = (event: KeyboardEvent): void => {
    if (el.dataset.mode === 'static' || reading(event) || document.querySelector('dialog[open]')) return;
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === ' ' && event.target instanceof Element && event.target.closest('a, button, summary')) return;
    if (event.key === ' ') {
      event.preventDefault();
      if (!event.repeat) director.toggle();
    } else if (['ArrowUp', 'ArrowRight', 'PageDown'].includes(event.key)) {
      event.preventDefault();
      director.step(1);
    } else if (['ArrowDown', 'ArrowLeft', 'PageUp'].includes(event.key)) {
      event.preventDefault();
      director.step(-1);
    }
  };

  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('touchmove', onTouchMove, { passive: false });
  el.addEventListener('touchend', onTouchEnd);
  el.addEventListener('touchcancel', onTouchEnd);
  window.addEventListener('keydown', onKey);
  const activityEvents = ['pointermove', 'pointerdown', 'touchstart', 'touchmove', 'wheel', 'keydown'] as const;
  for (const event of activityEvents) window.addEventListener(event, onActivity, { passive: true });

  return () => {
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('touchstart', onTouchStart);
    el.removeEventListener('touchmove', onTouchMove);
    el.removeEventListener('touchend', onTouchEnd);
    el.removeEventListener('touchcancel', onTouchEnd);
    window.removeEventListener('keydown', onKey);
    for (const event of activityEvents) window.removeEventListener(event, onActivity);
  };
}
