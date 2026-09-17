import { BoxGeometry, DataTexture, LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PartAsset } from '../kit/loader';

type RGB = readonly [number, number, number];
type Palette = { name: string; colors: readonly RGB[] };
export const ART_PALETTES: Record<string, Palette> = {
  'matter-engine': { name: 'Verdigris / limestone / forest', colors: [[209, 211, 186], [35, 65, 58], [72, 111, 98], [145, 167, 140], [232, 222, 192]] },
  'outrider-ide': { name: 'Petrol / slate / chalk', colors: [[182, 199, 203], [25, 44, 60], [53, 91, 109], [119, 148, 157], [223, 224, 207]] },
  'agent-queue': { name: 'Aubergine / clay / ash', colors: [[204, 187, 178], [57, 41, 61], [117, 75, 91], [162, 130, 128], [227, 216, 198]] },
  'quilt-trader': { name: 'Oxide / umber / parchment', colors: [[215, 194, 157], [65, 48, 41], [137, 65, 43], [185, 128, 79], [236, 219, 184]] },
};

export type PaintingTechnique = 'mineral-strata' | 'knife-gestures' | 'flow-field' | 'woven-pigment';
export const ART_TECHNIQUES: Record<string, PaintingTechnique> = {
  'matter-engine': 'mineral-strata',
  'outrider-ide': 'knife-gestures',
  'agent-queue': 'flow-field',
  'quilt-trader': 'woven-pigment',
};
type PaintingSurface = {
  size: number; seed: number; colors: readonly RGB[]; random: () => number;
  pigment: (x: number, y: number, rgb: RGB, alpha: number, height?: number) => void;
};

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { x = clamp(x); return x * x * (3 - 2 * x); };
const hash = (x: number, y: number, seed: number) => {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967295;
};
function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), u = smooth(x - ix), v = smooth(y - iy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

/** Eroded strata: domain-warped contour bands, mineral blooms and chalk ridges. */
function mineralStrata({ size, seed, colors, random, pigment }: PaintingSurface) {
  const phase = random() * 9, tilt = (random() - .5) * 1.6;
  const layers = 4 + random() * 3;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const warp = noise(u * 3 + phase, v * 2, seed);
    const strata = v * layers + tilt * u + (warp - .5) * 2.4 + .24 * Math.sin(u * 8 + phase);
    const band = Math.floor(strata), edge = strata - band;
    const grain = noise(u * 40, v * 75, seed + 1);
    const rgb = colors[1 + ((band % 4) + 4) % 4];
    pigment(x, y, rgb, .64 + grain * .25, 105 + grain * 70);
    const ridge = 1 - smooth(Math.abs(edge - .08) / (.035 + grain * .055));
    pigment(x, y, colors[4], ridge * .8, 215);
    // Fine parallel scraping follows the warped layers rather than a straight grid.
    const contour = (strata * 13 + grain * .2) % 1;
    if (contour < .075) pigment(x, y, colors[0], .22, 85);
  }
}

/** Dry palette knife: broad angular slabs with bristles and torn pigment edges. */
function knifeGestures({ size, seed, colors, random, pigment }: PaintingSurface) {
  const direction = random() > .5 ? -.65 : .65;
  for (let stroke = 0; stroke < 11; stroke++) {
    const cx = (.12 + random() * .76) * size, cy = (.1 + random() * .8) * size;
    const angle = direction + (stroke % 3 === 0 ? Math.PI / 2 : 0) + (random() - .5) * .55;
    const cs = Math.cos(angle), sn = Math.sin(angle);
    const length = (.28 + random() * .52) * size, width = (.045 + random() * .19) * size;
    const rgb = colors[1 + stroke % 4], opacity = .55 + random() * .4;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = (x - cx) * cs + (y - cy) * sn, v = -(x - cx) * sn + (y - cy) * cs;
      if (Math.abs(u) > length / 2 || Math.abs(v) > width) continue;
      const bristle = noise(u / size * 8, v / size * 210, seed + stroke);
      const edge = noise(u / size * 65, v / size * 40, seed - stroke);
      const mask = smooth((width * (.68 + edge * .32) - Math.abs(v)) / (size * .012))
        * smooth((length / 2 - Math.abs(u)) / (size * .025));
      pigment(x, y, rgb, mask * opacity * (.45 + bristle * .55), 130 + bristle * 90);
    }
  }
}

/** Pigment ribbons advected through a smooth field, with fine trailing ink filaments. */
function flowField({ size, seed, colors, random, pigment }: PaintingSurface) {
  const phase = random() * 8, turn = (random() - .5) * 2;
  for (let path = 0; path < 64; path++) {
    let x = random() * size, y = random() * size;
    const radius = size * (path < 18 ? .018 + random() * .035 : .0015 + random() * .004);
    const rgb = colors[1 + path % 4], steps = 75 + Math.floor(random() * 90);
    for (let step = 0; step < steps; step++) {
      const u = x / size, v = y / size;
      const angle = turn + (noise(u * 3 + phase, v * 3, seed) - .5) * 5;
      const r = radius * (.3 + .7 * Math.sin(Math.PI * step / steps));
      for (let yy = Math.floor(y - r); yy <= y + r; yy++) for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
        const distance = Math.hypot(xx - x, yy - y) / r;
        if (distance >= 1) continue;
        const fiber = .7 + .3 * Math.sin(distance * 36 + path);
        pigment(xx, yy, rgb, (1 - distance) * fiber * .5, 145 + fiber * 45);
      }
      x += Math.cos(angle) * size * .006; y += Math.sin(angle) * size * .006;
      if (x < -radius || x > size + radius || y < -radius || y > size + radius) break;
    }
  }
}

/** Interlaced impasto: ragged warp/weft bands alternate over and under each other. */
function wovenPigment({ size, seed, colors, random, pigment }: PaintingSurface) {
  const columns = 4 + Math.floor(random() * 3), rows = 4 + Math.floor(random() * 3);
  const phase = random() * 5, tilt = (random() - .5) * .35;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const a = (u + tilt * (v - .5)) * columns + .12 * Math.sin(v * 9 + phase);
    const b = v * rows + .13 * Math.sin(u * 11 + phase);
    const col = Math.floor(a), row = Math.floor(b), fu = a - col, fv = b - row;
    const grain = noise(u * 80, v * 80, seed);
    const warp = smooth((.43 + grain * .06 - Math.abs(fu - .5)) * 30);
    const weft = smooth((.39 + grain * .09 - Math.abs(fv - .5)) * 30);
    const verticalOnTop = (col + row) % 2 === 0;
    const vertical = verticalOnTop ? warp > .2 : weft < .2;
    const coverage = Math.max(warp, weft);
    const bristle = vertical ? noise(u * 230, v * 7, seed + 1) : noise(u * 7, v * 230, seed + 1);
    const swatch = vertical ? col : row + 2;
    pigment(x, y, colors[1 + ((swatch % 4) + 4) % 4], coverage * (.68 + bristle * .25), 120 + bristle * 95);
    // Worn seam catches the light where one paint strip crosses another.
    const seam = vertical ? Math.abs(fu - .16) : Math.abs(fv - .16);
    if (seam < .018) pigment(x, y, colors[4], coverage * .45, 210);
  }
}

const PAINT: Record<PaintingTechnique, (surface: PaintingSurface) => void> = {
  'mineral-strata': mineralStrata, 'knife-gestures': knifeGestures,
  'flow-field': flowField, 'woven-pigment': wovenPigment,
};

/** Deterministic pigment and packed height/roughness/metalness maps. No downloads,
 * canvas dependency, or per-frame texture work; one composition per hanging. */
export function paintingPixels(room: string, variant: number, size: number,
  technique: PaintingTechnique = ART_TECHNIQUES[room] ?? 'mineral-strata') {
  const palette = ART_PALETTES[room] ?? ART_PALETTES['matter-engine'];
  let seed = variant + 7919;
  for (const char of room) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  const initialSeed = seed;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const color = new Uint8Array(size * size * 4), surface = new Uint8Array(color.length);
  const pigment = (x: number, y: number, rgb: RGB, alpha: number, height = 140) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (Math.floor(y) * size + Math.floor(x)) * 4;
    for (let c = 0; c < 3; c++) color[i + c] = color[i + c] * (1 - alpha) + rgb[c] * alpha;
    surface[i] = surface[i] * (1 - alpha) + height * alpha;
  };
  // Plaster-like ground: three scales of noise plus fine canvas tooth.
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const n = noise(x / size * 5, y / size * 5, initialSeed) * .6
      + noise(x / size * 21, y / size * 21, initialSeed + 1) * .28
      + hash(x, y, initialSeed) * .12;
    for (let c = 0; c < 3; c++) color[i + c] = palette.colors[0][c] * (.8 + n * .24);
    color[i + 3] = 255;
    surface.set([95 + n * 55, 235, 0, 255], i);
  }
  PAINT[technique]({ size, seed: initialSeed, colors: palette.colors, random, pigment });
  const line = (x: number, y: number, dx: number, dy: number, rgb: RGB, alpha: number) => {
    const steps = Math.ceil(Math.hypot(dx, dy) * 1.5);
    for (let s = 0; s < steps; s++) pigment(x + dx * s / steps, y + dy * s / steps, rgb, alpha, 75);
  };
  // Sgraffito scratches scrape back through the paint in loose, overlapping bundles.
  for (let scratch = 0; scratch < (technique === 'knife-gestures' ? 230 : 110); scratch++) {
    const x = random() * size, y = random() * size;
    const dx = (random() - .45) * size * .3, dy = (random() - .6) * size * .4;
    line(x, y, technique === 'woven-pigment' && scratch % 2 ? 0 : dx,
      technique === 'woven-pigment' && !(scratch % 2) ? 0 : dy,
      palette.colors[scratch % 3 === 0 ? 1 : 4], .2 + random() * .45);
  }
  // Concentrated thrown paint, satellite droplets, and a few gravity drips.
  for (let cluster = 0; cluster < 3; cluster++) {
    const cx = (.2 + random() * .6) * size, cy = (.15 + random() * .7) * size;
    const rgb = palette.colors[cluster === 1 ? 4 : 1];
    for (let drop = 0; drop < 100; drop++) {
      const x = cx + (random() - .5) * size * .7, y = cy + (random() - .5) * size * .5;
      const radius = (.001 + random() ** 4 * .015) * size;
      for (let yy = Math.floor(y - radius); yy <= y + radius; yy++) for (let xx = Math.floor(x - radius); xx <= x + radius; xx++) {
        if (Math.hypot(xx - x, yy - y) <= radius) pigment(xx, yy, rgb, .8, 220);
      }
      if (drop < 4) line(x, y, size * .006, size * (.02 + random() * .1), rgb, .65);
    }
  }
  // One gold-leaf gesture per work: orbit, blade, sun, or sweeping ribbon.
  // Only that mask becomes metallic; the scratched paint remains matte.
  const goldX = (random() - .5) * .18, goldY = (random() - .5) * .18;
  const goldScale = .8 + random() * .4, goldAngle = (random() - .5) * .6;
  const goldCos = Math.cos(goldAngle), goldSin = Math.sin(goldAngle);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x / size - .5 - goldX, dy = y / size - .5 - goldY;
    const u = .5 + (dx * goldCos - dy * goldSin) / goldScale;
    const v = .5 + (dx * goldSin + dy * goldCos) / goldScale;
    if (variant % 4 === 1 && (v < .14 || v > .87) || variant % 4 === 3 && (u < .08 || u > .92)) continue;
    const grain = noise(u * 70, v * 70, initialSeed + 3), tooth = hash(x, y, initialSeed + 4);
    let distance: number;
    switch (variant % 4) {
      case 0: distance = Math.abs(Math.hypot(u - .53, (v - .48) * 1.1) - .235) - .027; break;
      case 1: distance = Math.abs(u - (.43 + .12 * Math.sin(v * 4))) - .048 * Math.sin(clamp((v - .14) / .73) * Math.PI); break;
      case 2: distance = Math.hypot((u - .61) * 1.07, v - .37) - .14; break;
      default: distance = Math.abs(v - (.58 - .2 * u + .035 * Math.sin(u * 7))) - .032 * Math.sin(clamp((u - .08) / .84) * Math.PI);
    }
    const mask = clamp((.004 + (grain - .5) * .013 - distance) * size);
    if (!mask) continue;
    const i = (y * size + x) * 4;
    const foil = .83 + grain * .17;
    pigment(x, y, [219 * foil, 173 * foil, 77 * foil], mask, 170 + grain * 65);
    surface[i + 1] = surface[i + 1] * (1 - mask) + (50 + tooth * 30) * mask;
    surface[i + 2] = 255 * mask;
  }
  return { color, surface };
}

/** Assets are generated lazily with their room and cached across streaming visits. */
export function wallArtFactory(mobile: boolean) {
  const cache = new Map<string, PartAsset>();
  return (room: string, variant: number): PartAsset => {
    const key = `${room}:${variant}`;
    const existing = cache.get(key);
    if (existing) return existing;
    const size = mobile ? 192 : 384;
    const pixels = paintingPixels(room, variant, size);
    const color = new DataTexture(pixels.color, size, size), surface = new DataTexture(pixels.surface, size, size);
    color.colorSpace = SRGBColorSpace;
    for (const texture of [color, surface]) {
      texture.magFilter = LinearFilter; texture.minFilter = LinearMipmapLinearFilter;
      texture.flipY = true;
      texture.generateMipmaps = true; texture.needsUpdate = true;
    }
    const paint = new MeshStandardMaterial({ map: color, metalness: 1, metalnessMap: surface,
      roughness: 1, roughnessMap: surface, bumpMap: surface, bumpScale: .008, envMapIntensity: 3 });
    paint.name = `${ART_TECHNIQUES[room]} / ${ART_PALETTES[room]?.name ?? room} / ${variant + 1}`;
    const frame = new MeshStandardMaterial({ color: 0x9a927f, roughness: .78 });
    // Keep the original wall-panel footprint and inward (-Z) facing convention.
    const backing = new BoxGeometry(1.64, 1.64, .075).translate(0, 1.92, 0);
    const face = new PlaneGeometry(1.54, 1.54).rotateY(Math.PI).translate(0, 1.92, -.041);
    const geometry = mergeGeometries([backing, face], true)!;
    backing.dispose(); face.dispose();
    const asset = { geometry, material: [frame, paint] };
    cache.set(key, asset);
    return asset;
  };
}
