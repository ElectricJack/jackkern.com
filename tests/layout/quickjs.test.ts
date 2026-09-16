import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getQuickJS } from 'quickjs-emscripten';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';

const layoutDir = join(__dirname, '..', '..', 'layout');

test('layout.js produces the identical hash inside QuickJS', async () => {
  const QuickJS = await getQuickJS();
  const runtime = QuickJS.newRuntime();
  runtime.setModuleLoader((name) => readFileSync(join(layoutDir, name.replace(/^\.\//, '')), 'utf8'));
  const vm = runtime.newContext();
  vm.unwrapResult(
    vm.evalCode(`globalThis.manifest = ${JSON.stringify(manifest)}; globalThis.contract = ${JSON.stringify(contract)};`),
  ).dispose();
  const result = vm.evalCode(
    `import { layout } from './layout.js'; globalThis.out = JSON.stringify(layout(globalThis.manifest, globalThis.contract));`,
    'main.mjs',
    { type: 'module' },
  );
  if (result.error) {
    const err = vm.dump(result.error);
    result.error.dispose();
    throw new Error('QuickJS: ' + JSON.stringify(err));
  }
  result.value.dispose();
  const outHandle = vm.getProp(vm.global, 'out');
  const out = JSON.parse(vm.getString(outHandle));
  outHandle.dispose();
  vm.dispose();
  runtime.dispose();

  const native = layout(manifest, contract);
  expect(out.hash).toBe(native.hash);
  expect(out.placements.length).toBe(native.placements.length);
});
