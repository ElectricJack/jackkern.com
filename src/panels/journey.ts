import type { Director } from '../camera/director';
import type { Rail } from '../camera/rail';
import { paneVisibility, type PanelContent } from './panels';

/** HTML navigation stays separate from the camera; every input moves the same director. */
export function journeyUI(director: Director, rail: Rail, content: PanelContent[], navigate: (index: number) => void = index => director.visit(index)): (u: number) => void {
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
  const label = (stop: string) => titles.get(stop) ?? (stop === 'entry' ? 'Entrance' : stop === 'terrace' ? 'Terrace' : `Courtyard ${stop.slice(3)}`);
  const map = document.getElementById('route-map')!;
  const areas = rail.viewpoints.flatMap((v, index, all) => !v.stop.startsWith('cy-') && all.findIndex(other => other.stop === v.stop) === index ? [{ stop: v.stop, index: director.projectView(v.stop) < 0 ? index : director.projectView(v.stop) }] : []);
  const markers = areas.map(area => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label(area.stop);
    button.dataset.stop = area.stop;
    button.setAttribute('aria-label', `Go directly to ${label(area.stop)}`);
    button.addEventListener('click', () => { next.focus({ preventScroll: true }); navigate(area.index); });
    map.append(button);
    return button;
  });

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
    if (index >= 0) { next.focus({ preventScroll: true }); navigate(index); }
  });
  document.getElementById('begin-walk')!.addEventListener('click', () => {
    next.focus({ preventScroll: true });
    director.fly();
  });
  // The visible forward arrow must not inherit a previous backward journey.
  // Only the explicitly labelled "Fly back" control at the terrace reverses.
  next.addEventListener('click', () => {
    if (director.playing) director.pause();
    else director.fly(director.u >= 1 ? -1 : 1);
  });
  document.getElementById('panels')!.addEventListener('pointerenter', () => director.pause());
  document.getElementById('panels')!.addEventListener('focusin', () => director.pause());
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
      markers.forEach(marker => {
        if (marker.dataset.stop === stop) marker.setAttribute('aria-current', 'location');
        else marker.removeAttribute('aria-current');
      });
      const currentMarker = markers.find(marker => marker.dataset.stop === stop);
      if (currentMarker && map.scrollWidth > map.clientWidth) map.scrollLeft = currentMarker.offsetLeft - map.offsetLeft - (map.clientWidth - currentMarker.offsetWidth) / 2;
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
      : director.playing ? `Heading to ${label(director.destinationStop ?? stop)}` : u <= 0 ? 'Scroll to begin' : 'Scroll to continue';
    if (hint !== lastInstruction) { instruction.textContent = hint; lastInstruction = hint; }
  };
}
