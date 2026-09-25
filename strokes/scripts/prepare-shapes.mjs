import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import svgpath from 'svgpath';

const root = fileURLToPath(new URL('../', import.meta.url));
const context = { window: {} };
vm.runInNewContext(await readFile(resolve(root, 'data.js'), 'utf8'), context);
const { strokes, items } = context.window.StrokeLessons;
const raw = {};
for (const char of new Set(Object.values(items).map(item => item.source))) {
  raw[char] = JSON.parse(await readFile(resolve(root, `sources/${char.codePointAt(0).toString(16)}.json`), 'utf8'));
}
const shapes = {};
for (const item of strokes) {
  const source = raw[item.source];
  const median = source.medians[item.index];
  const xs = median.map(point => point[0]);
  const ys = median.map(point => point[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = (item.id === 'dian' ? 200 : 620) / Math.max(maxX - minX, maxY - minY);
  const x = 512 - (maxX + minX) / 2 * scale;
  const y = 388 - (maxY + minY) / 2 * scale;
  shapes[item.id] = {
    strokes: [svgpath(source.strokes[item.index]).matrix([scale, 0, 0, scale, x, y]).round(2).toString()],
    medians: [median.map(point => [point[0] * scale + x, point[1] * scale + y])],
    radStrokes: []
  };
}
// A classic script keeps file:// usage independent of fetch permissions.
await writeFile(resolve(root, 'character-data.js'), `// Hanzi Writer Data 2.0.1. Arphic Public License; see vendor/ARPHICPL.TXT.\n// Modified 2026-09-23: repackaged as JavaScript; isolated strokes extracted, uniformly scaled and centered.\nwindow.StrokeCharacters = ${JSON.stringify(raw)};\nwindow.StrokeShapes = ${JSON.stringify(shapes)};\n`);
console.log(`Prepared ${strokes.length} centered stroke shapes.`);
