/**
 * jackkern.com — the whole of the page's behaviour.
 *
 * Three jobs: the theme toggle, the nav's current-section marker, and the
 * footer year. Everything else on the page is HTML and CSS, and the page is
 * fully readable if this file never loads.
 */
(() => {
  'use strict';

  const root = document.documentElement;

  /* ----------------------------------------------------------- theme -- */

  const toggle = document.getElementById('theme-toggle');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  /** What the page is actually showing right now. */
  const isDark = () =>
    root.dataset.theme ? root.dataset.theme === 'dark' : systemDark.matches;

  const paint = () => {
    if (!toggle) return;
    const dark = isDark();
    toggle.setAttribute('aria-pressed', String(dark));
    // The accessible name stays "Dark mode" and aria-pressed carries the
    // state, which is what a toggle button is supposed to do.
    toggle.title = dark ? 'Dark mode on' : 'Dark mode off';
  };

  if (toggle) {
    toggle.hidden = false;
    paint();

    toggle.addEventListener('click', () => {
      root.dataset.theme = isDark() ? 'light' : 'dark';
      try {
        localStorage.setItem('theme', root.dataset.theme);
      } catch (e) {
        /* Blocked storage: the choice just does not survive a reload. */
      }
      paint();
    });
  }

  // Follow the OS while the visitor has not made an explicit choice.
  systemDark.addEventListener('change', () => {
    if (!root.dataset.theme) paint();
  });

  /* ------------------------------------------------------------- nav -- */

  const links = new Map();
  document.querySelectorAll('.nav__list a[href^="#"]').forEach((a) => {
    const section = document.getElementById(a.hash.slice(1));
    if (section) links.set(section, a);
  });

  if (links.size && 'IntersectionObserver' in window) {
    const seen = new Set();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) seen.add(entry.target);
          else seen.delete(entry.target);
        }

        // Document order decides ties, so scrolling down always advances.
        let current = null;
        for (const section of links.keys()) if (seen.has(section)) current = section;

        for (const [section, link] of links) {
          if (section === current) link.setAttribute('aria-current', 'true');
          else link.removeAttribute('aria-current');
        }
      },
      // A band across the upper third: a section counts as "current" once its
      // heading has cleared the sticky header.
      { rootMargin: '-20% 0px -70% 0px' }
    );

    for (const section of links.keys()) observer.observe(section);
  }

  /* ---------------------------------------------------------- header -- */

  const header = document.querySelector('.site-header');

  if (header) {
    let ticking = false;

    const update = () => {
      header.dataset.stuck = String(window.scrollY > 4);
      ticking = false;
    };

    addEventListener(
      'scroll',
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(update);
      },
      { passive: true }
    );

    update();
  }

  /* ------------------------------------------------------------ year -- */

  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
