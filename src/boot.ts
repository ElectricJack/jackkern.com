export type Mode = 'scene' | 'static';

/** The villa is the landing page; reading mode is an explicit choice or a graphics fallback. */
export function chooseMode(env: { webgl: boolean; capture: boolean; view?: string | null }): Mode {
  if (!env.webgl) return 'static';
  if (env.capture || env.view === 'scene') return 'scene';
  if (env.view === 'list') return 'static';
  return 'scene';
}
