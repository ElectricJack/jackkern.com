import type { Director } from '../camera/director';
import type { Rail } from '../camera/rail';
import { paneVisibility, type PanelContent } from './panels';

/** HTML navigation stays separate from the camera; every input moves the same director. */
export function journeyUI(director: Director, rail: Rail, content: PanelContent[]): (u: number) => void {
  const app = document.getElementById('app')!;
  const welcome = document.getElementById('welcome')!;
  const farewell = document.getElementById('farewell')!;
  const progress = document.getElementById('walk-progress')!;
  const percent = document.getElementById('walk-percent')!;
  const room = document.getElementById('room-name')!;
  const instruction = document.getElementById('travel-instruction')!;
  const next = document.getElementById('next-space') as HTMLButtonElement;
  const dialog = document.getElementById('project-dialog') as HTMLDialogElement;
  const toggle = document.getElementById('index-toggle')!;
  const titles = new Map(content.map((c) => [c.id, c.title]));

  toggle.addEventListener('click', (event) => {
    if (app.dataset.mode !== 'scene') return;
    event.preventDefault();
    director.pause();
    dialog.showModal();
  });
  document.getElementById('index-close')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    }
    const link = (event.target as Element).closest<HTMLAnchorElement>('[data-project]');
    if (!link) return;
    event.preventDefault();
    const index = director.projectView(link.dataset.project!);
    dialog.close();
    if (index >= 0) director.glideTo(index);
  });
  document.getElementById('begin-walk')!.addEventListener('click', () => {
    next.focus({ preventScroll: true });
    director.fly();
  });
  next.addEventListener('click', () => director.toggle());
  app.addEventListener('toggle', (event) => {
    if (event.target instanceof HTMLDetailsElement && event.target.open) director.pause();
  }, true);

  const note = (element: HTMLElement, opacity: number) => {
    // Navigation buttons retain focus until the user moves it deliberately.
    const active = element.contains(document.activeElement);
    element.hidden = opacity < 0.002 && !active;
    element.inert = opacity < 0.15 && !active;
    element.style.setProperty('--note-opacity', String(active ? Math.max(opacity, 0.35) : opacity));
  };
  let lastPercent = -1;
  let lastStop = '';
  let lastAction = '';
  let lastInstruction = '';
  return (u) => {
    note(welcome, paneVisibility(u, 0, 1 / rail.length, 5 / rail.length));
    note(farewell, paneVisibility(u, 1, 1, 4 / rail.length));
    progress.style.setProperty('--progress', String(u));
    const rounded = Math.round(u * 100);
    if (rounded !== lastPercent) {
      percent.textContent = String(rounded).padStart(2, '0');
      lastPercent = rounded;
    }
    const stop = rail.viewpoints[rail.nearest(u)].stop;
    if (stop !== lastStop) {
      app.dataset.place = stop;
      room.textContent = titles.get(stop) ?? (stop === 'entry' ? 'The courtyard' : stop === 'terrace' ? 'The terrace' : `Courtyard ${stop.slice(3)}`);
      lastStop = stop;
    }
    const action = director.playing ? 'Pause' : u >= 1 ? 'Fly back' : u <= 0 ? 'Begin' : director.atProject ? 'Continue' : 'Resume';
    if (action !== lastAction) {
      next.innerHTML = `${action} <span aria-hidden="true">${director.playing ? 'Ⅱ' : u >= 1 ? '↺' : '→'}</span>`;
      next.setAttribute('aria-label', `${action} the flight`);
      lastAction = action;
    }
    const countdown = director.autoResumeIn;
    const hint = countdown !== null ? `${u <= 0 ? 'Tour begins' : 'Continuing'} in ${Math.ceil(countdown)}s`
      : director.playing ? 'Scroll to set the pace' : u <= 0 ? 'Scroll to begin' : 'Scroll to continue';
    if (hint !== lastInstruction) { instruction.textContent = hint; lastInstruction = hint; }
  };
}
