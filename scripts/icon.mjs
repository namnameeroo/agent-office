// desktop/icon.icns 생성. 26×26 픽셀 맵(시안 B · 마스코트)을 정수 배율로 확대해
// PNG로 쓰고 macOS iconutil로 묶는다. 외부 의존성 없음. 실행: node scripts/icon.mjs
import { deflateSync } from "node:zlib";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// 시안 B 픽셀 맵 (AppIcon.dc.html의 PAL_B / ROWS_B 그대로)
const PAL = {
  k: "#2d1e3f",
  n: "#3e2850",
  q: "#5e3458",
  r: "#7e4560",
  Y: "#ffe6a6",
  O: "#2a1d1a",
  H: "#3b2a24",
  S: "#f6c9a4",
  B: "#f4a093",
  M: "#7a3a3a",
  W: "#ffffff",
  L: "#c9c3ba",
  l: "#e6e1d8",
  w: "#fffaf0",
  D: "#c98a55",
  d: "#a8683e",
  e: "#8a5432",
  E: "#2a1d1a",
};
const ROWS = [
  "..kkkkkkkkkkkkkkkkkkkkkk..",
  ".kkkkkkkkqqqqqqqqkkkkkkkk.",
  "kkkkkkkqqqqqqqqqqqqkkkkkkk",
  "kkkkkkqqqqOOOOOOqqqqkYkkkk",
  "kkkkkqqqOOHHHHHHOOqqYYYkkk",
  "kkkkqqqOHHHHHHHHHHOqqYkkkk",
  "kkkkqqOHHHHHHHHHHHHOqqkkkk",
  "kkkqqqOHHHSHHHHSHHHOqqqkkk",
  "kkkqqqOHSSSSSSSSSSHOqqqkkk",
  "nnnqqqOSSEWSSSSEWSSOqqqnnn",
  "nnnqqqOSSEESSSSEESSOqqqnnn",
  "nnnqqqOSBBSSMMSSBBSOqqqnnn",
  "nnnqOOOOOOOOOOOOOOOOOOqnnn",
  "nnnqOllllllllllllllllOqnnn",
  "nnnnOLLLLLLLLLLLLLLLLOnnnn",
  "nnnnOLLLLLLLwwLLLLLLLOnnnn",
  "nnnnOLLLLLLLLLLLLLLLLOnnnn",
  "nnnnOLLLLLLLLLLLLLLLLOnnnn",
  "nnnnOLLLLLLLLLLLLLLLLOnnnn",
  "nnnnOOOOOOOOOOOOOOOOOOnnnn",
  "DDDDDDDDDDDDDDDDDDDDDDDDDD",
  "eeeeeeeeeeeeeeeeeeeeeeeeee",
  "dddddddddddddddddddddddddd",
  "dddddddddddddddddddddddddd",
  ".dddddddddddddddddddddddd.",
  "..dddddddddddddddddddddd..",
];
const N = ROWS.length; // 26

// ---- PNG 인코더 (RGBA, 무필터) ----
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size); // 각 행 앞 필터 바이트 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hex = pixel(x, y);
      if (!hex) continue;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = parseInt(hex.slice(1, 3), 16);
      raw[o + 1] = parseInt(hex.slice(3, 5), 16);
      raw[o + 2] = parseInt(hex.slice(5, 7), 16);
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // 8bit, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// 캔버스 size에 맵을 정수 배율 k로 가운데 그린다. macOS 규격(1024 중 ~824가 그림)에 맞춰
// k = round(size·824/1024 / 26) → 1024:32(832px) 512:16 256:8 128:4 64:2 32:1.
// ponytail: 16px는 k=1도 26px라 안 들어가므로 가운데 16×16만 잘라 쓴다(얼굴+노트북).
function render(size) {
  const k = Math.max(1, Math.round((size * 824) / 1024 / N));
  const off = Math.floor((size - N * k) / 2); // 16px면 음수 → 크롭
  return png(size, (x, y) => {
    const mx = Math.floor((x - off) / k),
      my = Math.floor((y - off) / k);
    if (mx < 0 || my < 0 || mx >= N || my >= N) return null;
    const ch = ROWS[my][mx];
    return ch === "." ? null : PAL[ch];
  });
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const set = join(
  mkdtempSync(join(tmpdir(), "agent-office-icon-")),
  "icon.iconset",
);
mkdirSync(set);
for (const base of [16, 32, 128, 256, 512]) {
  writeFileSync(join(set, `icon_${base}x${base}.png`), render(base));
  writeFileSync(join(set, `icon_${base}x${base}@2x.png`), render(base * 2));
}
const out = join(root, "desktop", "icon.icns");
execFileSync("iconutil", ["-c", "icns", set, "-o", out], { stdio: "inherit" });
rmSync(dirname(set), { recursive: true, force: true });
console.log(`wrote ${out}`);
