import { defineConfig, type Plugin } from 'vitest/config';
import contract from './kit/contract.json';
import manifest from './content/manifest.json';
import { buildContent } from './tools/content.mjs';
import { devCaptures } from './tools/dev-captures.mjs';
import { layout } from './layout/layout.js';
import { staticMarkup } from './src/fallback/static';
import { panelMarkup } from './src/panels/panels';
import type { Contract, Manifest } from './src/types';

/** Serves content to the scene and injects both scene panels and the no-JS fallback. */
function villaContent(): Plugin {
  const id = 'virtual:content';
  const resolved = '\0' + id;
  // Project root, from Vite. Deriving it from import.meta.url instead would need
  // node: imports, and tsconfig's `types` deliberately omits @types/node.
  let root = '';
  return {
    name: 'villa-content',
    configResolved(config) { root = config.root; },
    configureServer(server) {
      const plan = layout(manifest as Manifest, contract as Contract);
      server.middlewares.use(devCaptures(root, new Set(plan.rail.map((viewpoint) => viewpoint.id))));
    },
    resolveId(source) { return source === id ? resolved : null; },
    async load(file) {
      if (file !== resolved) return null;
      return `export default ${JSON.stringify(await buildContent(root))};`;
    },
    async transformIndexHtml(html) {
      const content = await buildContent(root);
      const plan = layout(manifest as Manifest, contract as Contract);
      return html
        .replace('<!-- fallback -->', staticMarkup(content, plan.rail))
        .replace('<!-- panels -->', panelMarkup(content));
    },
  };
}

export default defineConfig({
  // One real page, no client-side routes: a missing file must be a 404, not
  // index.html served in its place. The SPA fallback turned every missing
  // static image into a 200 text/html that no network panel flags.
  appType: 'mpa',
  plugins: [villaContent()],
  build: { assetsDir: 'bundle', target: 'es2022' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], globals: true },
});
