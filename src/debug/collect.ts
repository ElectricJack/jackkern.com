/**
 * `?debug=1` collects what the page reports as going wrong, so a visitor can
 * copy it out of a browser without opening developer tools. This half only
 * listens; `overlay.ts` draws the list and loads on demand.
 */
export type DebugKind = 'error' | 'rejection' | 'console.error' | 'console.warn' | 'resource';
export type DebugEntry = { kind: DebugKind; message: string; at: number };

export interface DebugLog {
  readonly entries: DebugEntry[];
  subscribe(listener: (entry: DebugEntry) => void): () => void;
  /** Detach every listener and give console its methods back. */
  dispose(): void;
}

/** `?debug` and `?debug=1` turn it on; `?debug=0` and `?debug=false` do not. */
export function debugRequested(search: string): boolean {
  const value = new URLSearchParams(search).get('debug');
  return value !== null && value !== '0' && value !== 'false';
}

/** Readable text for anything thrown, rejected or logged. */
export function describe(value: unknown): string {
  if (value instanceof Error) {
    // V8 puts "Name: message" at the top of the stack; Firefox and Safari do not.
    const head = `${value.name}: ${value.message}`;
    if (!value.stack) return head;
    return value.stack.includes(value.message) ? value.stack : `${head}\n${value.stack}`;
  }
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

type Levels = 'error' | 'warn';

export function installCollector(win: Window & typeof globalThis): DebugLog {
  const entries: DebugEntry[] = [];
  const listeners = new Set<(entry: DebugEntry) => void>();
  let reporting = false;

  const add = (kind: DebugKind, message: string): void => {
    const entry = { kind, message, at: Math.round(win.performance.now()) };
    entries.push(entry);
    // A listener that logs an error of its own must not feed itself forever.
    if (reporting) return;
    reporting = true;
    try {
      for (const listener of listeners) listener(entry);
    } finally {
      reporting = false;
    }
  };

  const sourceOf = (element: Element): string =>
    (element as HTMLImageElement).currentSrc || element.getAttribute('src') || element.getAttribute('href') || '';

  // Capture phase: a failed <img>, <script> or <link> fires a non-bubbling
  // error event on the element, which only a capturing listener on window sees.
  const onError = (event: Event): void => {
    const target = event.target;
    if (target instanceof win.Element) {
      add('resource', `failed to load <${target.localName}> ${sourceOf(target)}`);
      return;
    }
    const error = event as ErrorEvent;
    add('error', error.error ? describe(error.error) : `${error.message} (${error.filename}:${error.lineno}:${error.colno})`);
  };
  const onRejection = (event: Event): void => add('rejection', describe((event as PromiseRejectionEvent).reason));

  win.addEventListener('error', onError, true);
  win.addEventListener('unhandledrejection', onRejection);

  const originals = {} as Record<Levels, (...args: unknown[]) => void>;
  for (const level of ['error', 'warn'] as const) {
    const original = win.console[level];
    originals[level] = original;
    win.console[level] = (...args: unknown[]) => {
      add(`console.${level}`, args.map(describe).join(' '));
      original.apply(win.console, args);
    };
  }

  // Module scripts run after the document is parsed, so an eager image may
  // already have failed before these listeners existed.
  for (const image of win.document.images) {
    if (image.complete && image.getAttribute('src') && image.naturalWidth === 0) {
      add('resource', `failed to load <img> ${sourceOf(image)}`);
    }
  }

  return {
    entries,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      win.removeEventListener('error', onError, true);
      win.removeEventListener('unhandledrejection', onRejection);
      for (const level of ['error', 'warn'] as const) win.console[level] = originals[level];
      listeners.clear();
    },
  };
}
