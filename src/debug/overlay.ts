import type { DebugEntry, DebugLog } from './collect';

const STYLE = `
#debug-overlay { position: fixed; z-index: 10; left: 8px; bottom: 8px; width: min(680px, calc(100vw - 16px)); max-height: 45vh;
  display: flex; flex-direction: column; box-sizing: border-box; border-radius: 6px; background: rgba(24, 21, 18, 0.94); color: #f4f1ea;
  font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; box-shadow: 0 4px 18px rgba(0, 0, 0, 0.3); }
#debug-overlay header { display: flex; gap: 8px; align-items: center; padding: 6px 8px; border-bottom: 1px solid rgba(244, 241, 234, 0.2); }
#debug-overlay header strong { margin-right: auto; }
#debug-overlay button { font: inherit; color: inherit; background: none; border: 1px solid rgba(244, 241, 234, 0.5); border-radius: 4px; padding: 2px 8px; cursor: pointer; }
#debug-overlay ol { margin: 0; padding: 6px 8px 8px 28px; overflow: auto; }
#debug-overlay ol[hidden], #debug-overlay textarea[hidden] { display: none; }
#debug-overlay li { white-space: pre-wrap; word-break: break-word; margin-bottom: 4px; }
#debug-overlay li[data-kind="console.warn"] { color: #f2c46d; }
#debug-overlay li[data-kind="error"], #debug-overlay li[data-kind="rejection"], #debug-overlay li[data-kind="console.error"], #debug-overlay li[data-kind="resource"] { color: #ff9c8a; }
#debug-overlay li.empty { list-style: none; margin-left: -20px; color: rgba(244, 241, 234, 0.7); }
#debug-overlay textarea { margin: 0 8px 8px; height: 8em; font: inherit; }
`;

export function formatEntry(entry: DebugEntry): string {
  return `[+${entry.at}ms] ${entry.kind}: ${entry.message}`;
}

/** What the browser is, for the top of a pasted report. */
export function environment(win: Window & typeof globalThis): string[] {
  let renderer = 'no WebGL';
  try {
    const canvas = win.document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    }
  } catch (error) {
    renderer = `WebGL probe threw: ${error}`;
  }
  return [
    `url: ${win.location.href}`,
    `user agent: ${win.navigator.userAgent}`,
    `webgl: ${renderer}`,
    `viewport: ${win.innerWidth}x${win.innerHeight} @${win.devicePixelRatio}x`,
    `mode: ${win.document.getElementById('app')?.dataset.mode ?? 'unknown'}`,
  ];
}

export function reportText(log: DebugLog, win: Window & typeof globalThis): string {
  const lines = log.entries.length ? log.entries.map(formatEntry) : ['(nothing collected)'];
  return [...environment(win), `entries: ${log.entries.length}`, '', ...lines].join('\n');
}

/** A fixed panel listing everything the collector has seen, with a button that copies it as text. */
export function mountOverlay(log: DebugLog, win: Window & typeof globalThis = window): HTMLElement {
  const doc = win.document;
  const style = doc.createElement('style');
  style.textContent = STYLE;
  doc.head.append(style);

  const root = doc.createElement('section');
  root.id = 'debug-overlay';
  root.setAttribute('aria-label', 'Debug log');
  root.innerHTML =
    '<header><strong>debug</strong><span data-count></span>' +
    '<button type="button" data-action="copy">Copy</button>' +
    '<button type="button" data-action="toggle" aria-expanded="true">Hide</button></header>' +
    '<ol role="log"></ol><textarea readonly hidden aria-label="Debug report"></textarea>';
  const count = root.querySelector('[data-count]') as HTMLElement;
  const list = root.querySelector('ol') as HTMLOListElement;
  const copy = root.querySelector('[data-action="copy"]') as HTMLButtonElement;
  const toggle = root.querySelector('[data-action="toggle"]') as HTMLButtonElement;
  const manual = root.querySelector('textarea') as HTMLTextAreaElement;

  const empty = doc.createElement('li');
  empty.className = 'empty';
  empty.textContent = 'Nothing collected yet: no errors, rejections, console errors or warnings.';

  const append = (entry: DebugEntry): void => {
    empty.remove();
    const item = doc.createElement('li');
    item.dataset.kind = entry.kind;
    item.textContent = formatEntry(entry);
    list.append(item);
    list.scrollTop = list.scrollHeight;
  };
  const updateCount = (): void => {
    count.textContent = `${log.entries.length} ${log.entries.length === 1 ? 'entry' : 'entries'}`;
  };

  if (log.entries.length) log.entries.forEach(append);
  else list.append(empty);
  updateCount();
  log.subscribe((entry) => { append(entry); updateCount(); });

  copy.addEventListener('click', async () => {
    const text = reportText(log, win);
    try {
      await win.navigator.clipboard.writeText(text);
      copy.textContent = 'Copied';
    } catch {
      // No clipboard permission (or an insecure origin): hand over selected text instead.
      manual.hidden = false;
      manual.value = text;
      manual.select();
      copy.textContent = 'Press Ctrl+C';
    }
    win.setTimeout(() => { copy.textContent = 'Copy'; }, 2000);
  });

  toggle.addEventListener('click', () => {
    const open = list.hidden;
    list.hidden = !open;
    if (!open) manual.hidden = true;
    toggle.textContent = open ? 'Hide' : 'Show';
    toggle.setAttribute('aria-expanded', String(open));
  });

  doc.body.append(root);
  return root;
}
