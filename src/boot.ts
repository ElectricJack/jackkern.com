export type Mode = 'scene' | 'static';

/** Reduced motion is honoured for visitors but not for the capture run that produces the static images themselves. */
export function chooseMode(env: { webgl: boolean; reducedMotion: boolean; capture: boolean }): Mode {
  if (!env.webgl) return 'static';
  if (env.reducedMotion && !env.capture) return 'static';
  return 'scene';
}
