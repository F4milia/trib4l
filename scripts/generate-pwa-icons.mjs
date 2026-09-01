#!/usr/bin/env node
//
// Generates the PWA icon set from the locked palette. Deterministic and
// dependency-free: the same command produces byte-identical files, so the
// committed PNGs can be regenerated and diffed rather than trusted.
//
// PROVISIONAL. This is not a brand mark -- it is the masonry motif
// (f4milia-design-system.md: Tower progress renders as stacked masonry blocks,
// never a smooth bar) drawn in nothing but parchment, deep-slate and
// terracotta, with zero radius. It exists so the shell is installable and
// testable without inventing a logo, which is a decision for James (decision
// 16 in stream-a-blockers.md). Replace before any public install.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const PARCHMENT = [0xf7, 0xf4, 0xf0];
const DEEP_SLATE = [0x1a, 0x1a, 0x1a];
const TERRACOTTA = [0xbc, 0x47, 0x2e];

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// Five courses of masonry, bottom-weighted, one terracotta block per the
// palette rule that terracotta marks the live/confirmed row and nothing else.
function pixel(x, y, size) {
  const unit = size / 16;
  const gx = Math.floor(x / unit);
  const gy = Math.floor(y / unit);
  if (gx < 2 || gx > 13 || gy < 3 || gy > 13) return DEEP_SLATE;

  const course = gy - 3; // 0..10
  const courseIndex = Math.floor(course / 2);
  if (course % 2 === 1) return DEEP_SLATE; // the mortar seam, visible on purpose

  // Running bond: alternate courses offset by half a block.
  const offset = courseIndex % 2 === 0 ? 0 : 2;
  const withinBlock = (gx - 2 + offset) % 4;
  if (withinBlock === 3) return DEEP_SLATE; // vertical seam

  // One whole block, not a fragment: at courseIndex 1 the bond is offset by 2,
  // so gx 8..10 is a single block bounded by seams on both sides.
  const isLiveBlock = courseIndex === 1 && gx >= 8 && gx <= 10;
  return isLiveBlock ? TERRACOTTA : PARCHMENT;
}

function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y, size);
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [180, 192, 512]) {
  const file = `public/icons/icon-${size}.png`;
  writeFileSync(file, png(size));
  console.log(`wrote ${file}`);
}
