import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Resvg } from "@resvg/resvg-js";
import { R_PATH } from "@repo/ui/logo-mark";

const size = 128;
const color = "#111827";

const svg = `<svg width="${size}" height="${size}" viewBox="-6 -5 90 90" xmlns="http://www.w3.org/2000/svg"><path d="${R_PATH}" fill="${color}"/></svg>`;

const png = new Resvg(svg, { fitTo: { mode: "width", value: size } })
  .render()
  .asPng();

const outPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../public/logo.png",
);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, png);

console.log(`Wrote ${outPath} (${png.length} bytes)`);
