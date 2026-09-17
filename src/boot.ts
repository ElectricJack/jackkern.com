export type Mode = 'scene' | 'static';

/** Honour reduced motion by default, while letting a visitor explicitly enter the villa. */
export function chooseMode(env: { webgl: boolean; reducedMotion: boolean; capture: boolean; view?: string | null }): Mode {
  if (!env.webgl) return 'static';
  if (env.capture || env.view === 'scene') return 'scene';
  if (env.view === 'list' || env.reducedMotion) return 'static';
  return 'scene';
}
