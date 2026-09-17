// @vitest-environment jsdom
import { PerspectiveCamera } from 'three';
import html from '../../index.html?raw';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
import { Director } from '../../src/camera/director';
import { Rail } from '../../src/camera/rail';
import { journeyUI } from '../../src/panels/journey';
import { Panels, projectIndexMarkup } from '../../src/panels/panels';

const plan = layout(manifest, contract), rail = new Rail(plan.rail, plan.path);
const projects = manifest.stops.filter(s => s.kind === 'project');
const content = projects.map(p => ({id:p.id,title:p.title!,html:'<p>A project to read.</p>',screenshots:[]}));

test('a project arrival presents a fully visible card and Continue advances to the next leg', () => {
  document.body.innerHTML = html;
  const director = new Director(rail, new PerspectiveCamera(), projects.map(p => p.id));
  const panels = new Panels(document.getElementById('panels')!, content);
  panels.setRoute(plan.rail, rail.u, rail.length);
  const update = journeyUI(director, rail, content), next = document.getElementById('next-space')!;
  director.jump(0); update(director.u);
  expect(next.textContent).toContain('Begin');
  next.click(); update(director.u);
  expect(next.textContent).toContain('Pause');
  expect(document.getElementById('travel-instruction')!.textContent).toBe('Scroll to set the pace');
  for (let i = 0; i < 2000 && director.playing; i++) director.update(.05);
  update(director.u); panels.update(director.u);
  expect(next.textContent).toContain('Continue');
  const panel = document.querySelector<HTMLElement>('.panel[data-stop="matter-engine"]')!;
  expect(panel.hidden).toBe(false); expect(panel.inert).toBe(false);
  expect(panel.style.getPropertyValue('--pane-opacity')).toBe('1.000');
  const stopped = director.u;
  next.click(); for (let i = 0; i < 120; i++) director.update(1 / 60);
  expect(director.u).toBeGreaterThan(stopped);
  document.body.innerHTML = '';
});

test('project index selection uses the same reading viewpoint as the automatic pause', () => {
  document.body.innerHTML = html;
  const dialog = document.getElementById('project-dialog') as HTMLDialogElement;
  dialog.insertAdjacentHTML('beforeend', projectIndexMarkup(content));
  dialog.close = vi.fn();
  const director = new Director(rail, new PerspectiveCamera(), projects.map(p => p.id));
  const select = vi.spyOn(director, 'glideTo');
  journeyUI(director, rail, content);
  dialog.querySelector<HTMLElement>('[data-project="outrider-ide"]')!.click();
  expect(select).toHaveBeenCalledWith(director.projectView('outrider-ide'));
  expect(rail.viewpoints[select.mock.calls[0][0]].id).toBe('outrider-ide-focal');
  document.body.innerHTML = '';
});

test('countdowns explain automatic departure and opening project details cancels it', () => {
  document.body.innerHTML = html;
  const director = new Director(rail, new PerspectiveCamera(), projects.map(p => p.id));
  const update = journeyUI(director, rail, content);
  const instruction = document.getElementById('travel-instruction')!;
  director.setAutoplay(true); update(director.u);
  expect(instruction.textContent).toBe('Tour begins in 10s');
  director.update(1); update(director.u);
  expect(instruction.textContent).toBe('Tour begins in 9s');
  director.jump(director.readingViews[0]);
  director.setAutoplay(true); update(director.u);
  expect(instruction.textContent).toBe('Continuing in 10s');
  const details = document.createElement('details');
  document.getElementById('panels')!.append(details);
  details.open = true;
  details.dispatchEvent(new Event('toggle'));
  director.update(20); update(director.u);
  expect(director.playing).toBe(false);
  expect(director.autoResumeIn).toBeNull();
  expect(instruction.textContent).toBe('Scroll to continue');
  document.getElementById('next-space')!.click();
  expect(director.playing).toBe(true);
  document.body.innerHTML = '';
});
