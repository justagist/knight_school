#!/usr/bin/env node
// Raster the bundled SVG logo to the PNG sizes iOS / Android home-screen
// adders look for. Run when the logo changes; output is committed.
//
//   node scripts/build-icons.mjs
//
// Outputs:
//   public/icon-180.png  — apple-touch-icon (iOS Safari)
//   public/icon-192.png  — PWA manifest
//   public/icon-512.png  — PWA manifest (full-res)
//
// The SVG source is public/icon-512.svg.

import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const src = resolve(root, 'public/icon-512.svg');
const svg = readFileSync(src);

const sizes = [
  { out: 'icon-180.png', px: 180 },
  { out: 'icon-192.png', px: 192 },
  { out: 'icon-512.png', px: 512 },
];

for (const { out, px } of sizes) {
  const dst = resolve(root, 'public', out);
  await sharp(svg)
    .resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(dst);
  // eslint-disable-next-line no-console
  console.log(`wrote ${out} (${px}×${px})`);
}
