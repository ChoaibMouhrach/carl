import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Resvg } from "@resvg/resvg-js";
import { R_PATH } from "@repo/ui/logo-mark";

const width = 1200;
const height = 630;

// Text-free so it renders identically in any build environment (no fonts).
const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="${width}" y2="${height}" gradientUnits="userSpaceOnUse">
      <stop stop-color="#8b5cf6"/>
      <stop offset="1" stop-color="#6d28d9"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <g transform="translate(450 165) scale(3.3333) translate(6 5)">
    <path d="${R_PATH}" fill="#ffffff"/>
  </g>
</svg>`;

const png = new Resvg(svg, { fitTo: { mode: "width", value: width } })
  .render()
  .asPng();

const outPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../public/og.png",
);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, png);

console.log(`Wrote ${outPath} (${png.length} bytes)`);
