/** Verify browser-discovered icons at any deployment base, including subpaths.
 * Usage: node tools/verify-icons.mjs https://example.com/project/
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:4173/');
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  // Use the portfolio's reading mode to avoid spinning up an unrelated 3D scene.
  const url = new URL(base); url.searchParams.set('view', 'list');
  await page.goto(url.href);
  const links = await page.locator('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]').evaluateAll(nodes => nodes.map(node => ({ rel: node.rel, href: node.href, type: node.type })));
  assert.equal(links.length, 4, 'ICO, SVG, Apple icon, and manifest must be discoverable');
  const get = async (href) => {
    const url = new URL(href, base);
    assert.equal(url.origin, base.origin);
    assert.ok(url.pathname.startsWith(base.pathname), 'Icon must stay inside the deployment base');
    const response = await page.request.get(url.href);
    assert.equal(response.status(), 200, url.href);
    return response.body();
  };
  for (const link of links) {
    const body = await get(link.href);
    if (link.type === 'image/svg+xml') assert.match(body.toString(), /<svg\b/);
    else if (link.rel === 'icon') {
      assert.equal(body.readUInt16LE(2), 1);
      assert.equal(body.readUInt16LE(4), 2);
      for (const [i, size] of [16, 32].entries()) {
        const offset = body.readUInt32LE(6 + i * 16 + 12);
        const png = PNG.sync.read(body.subarray(offset, offset + body.readUInt32LE(6 + i * 16 + 8)));
        assert.equal(png.width, size); assert.equal(png.height, size);
      }
    } else if (link.rel === 'apple-touch-icon') {
      const png = PNG.sync.read(body);
      assert.equal(png.width, 180); assert.equal(png.height, 180);
      assert.ok(png.data.every((value, index) => index % 4 !== 3 || value === 255), 'Apple icon must be opaque');
    } else {
      const manifest = JSON.parse(body);
      assert.equal(new URL(manifest.scope, link.href).href, base.href);
      assert.equal(new URL(manifest.start_url, link.href).href, base.href);
      assert.deepEqual(manifest.icons.map(icon => icon.sizes), ['192x192', '512x512']);
      for (const icon of manifest.icons) {
        const png = PNG.sync.read(await get(new URL(icon.src, link.href).href));
        assert.equal(`${png.width}x${png.height}`, icon.sizes);
      }
    }
  }
  console.log(`Icon discovery, formats, dimensions and deployment paths passed: ${base}`);
} finally {
  await browser.close();
}
