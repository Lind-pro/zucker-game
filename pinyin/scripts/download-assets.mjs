import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const context = { window: {} };
vm.runInNewContext(await readFile(resolve(root, 'data.js'), 'utf8'), context);
const names = new Set(Object.values(context.window.PinyinData.audioNames));
for (const vowel of ['a', 'o', 'e', 'yi', 'wu', 'yu']) {
  for (let tone = 1; tone <= 4; tone++) names.add(`${vowel}${tone}`);
}
const source = 'https://raw.githubusercontent.com/hugolpz/audio-cmn/ff9ed3d0c631195bd2c06f39450f3264c7124040/64k/syllabs/';
await mkdir(resolve(root, 'audio'), { recursive: true });
await mkdir(resolve(root, 'vendor'), { recursive: true });

async function download(url, path) {
  try { if ((await readFile(resolve(root, path))).length) return; } catch (_) {}
  const { stdout: buffer } = await promisify(execFile)('curl', [
    '-fsSL', '--retry', '3', '--retry-all-errors', '--connect-timeout', '10', '--max-time', '30', url
  ], { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 });
  if (!buffer.length) throw new Error(`Empty file: ${url}`);
  await writeFile(resolve(root, path), buffer);
}
await download('https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js', 'vendor/lucide.min.js');
await download('https://unpkg.com/lucide@0.468.0/LICENSE', 'vendor/LICENSE');
for (const name of names) await download(`${source}cmn-${name}.mp3`, `audio/${name}.mp3`);
console.log(`Downloaded ${names.size} recordings and Lucide icons.`);
