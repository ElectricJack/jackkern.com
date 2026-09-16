import { defineConfig, type Plugin } from 'vitest/config';
import { buildContent } from './tools/content.mjs';
import { panelMarkup } from './src/panels/panels';

/** Serves `virtual:content` and injects the panel sections into index.html. */
function villaContent(): Plugin {
  const id = 'virtual:content';
  const resolved = '\0' + id;
  // Project root, from Vite. Deriving it from import.meta.url instead would need
  // node: imports, and tsconfig's `types` deliberately omits @types/node.
  let root = '';
  return {
    name: 'villa-content',
    configResolved(config) { root = config.root; },
    resolveId(source) { return source === id ? resolved : null; },
    async load(file) {
      if (file !== resolved) return null;
      return `export default ${JSON.stringify(await buildContent(root))};`;
    },
    async transformIndexHtml(html) {
      return html.replace('<!-- panels -->', panelMarkup(await buildContent(root)));
    },
  };
}

export default defineConfig({
  plugins: [villaContent()],
  build: { assetsDir: 'bundle', target: 'es2022' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], globals: true },
});
