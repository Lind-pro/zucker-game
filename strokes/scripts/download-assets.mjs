import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import vm from 'node:vm';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const context = { window: {} };
vm.runInNewContext(await readFile(resolve(root, 'data.js'), 'utf8'), context);
const { items } = context.window.StrokeLessons;
for (const directory of ['vendor', 'audio', 'sources']) await mkdir(resolve(root, directory), { recursive: true });

async function download(url, destination) {
  const target = resolve(root, destination);
  try { if ((await readFile(target)).length) return; } catch (_) {}
  const { stdout } = await exec('curl', ['-fsSL', '--retry', '3', '--retry-all-errors', '--connect-timeout', '10', '--max-time', '30', url], { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 });
  if (!stdout.length) throw new Error(`Empty asset: ${url}`);
  await writeFile(target, stdout);
}

await download('https://unpkg.com/hanzi-writer@3.7.3/dist/hanzi-writer.min.js', 'vendor/hanzi-writer.min.js');
await download('https://unpkg.com/hanzi-writer@3.7.3/LICENSE', 'vendor/HANZI-WRITER-LICENSE');
await download('https://unpkg.com/hanzi-writer-data@2.0.1/ARPHICPL.TXT', 'vendor/ARPHICPL.TXT');
const raw = {};
for (const char of new Set(Object.values(items).map(item => item.source))) {
  const file = `sources/${char.codePointAt(0).toString(16)}.json`;
  await download(`https://unpkg.com/hanzi-writer-data@2.0.1/${encodeURIComponent(char)}.json`, file);
  raw[char] = JSON.parse(await readFile(resolve(root, file), 'utf8'));
}
console.log(`Downloaded ${Object.keys(raw).length} character shapes.`);

const audioSource = 'https://raw.githubusercontent.com/hugolpz/audio-cmn/ff9ed3d0c631195bd2c06f39450f3264c7124040/64k/syllabs/';
for (const name of new Set(Object.values(items).flatMap(item => item.audio))) {
  await download(`${audioSource}cmn-${name}.mp3`, `sources/${name}.mp3`);
}
for (const item of Object.values(items)) {
  const files = item.audio.map(name => resolve(root, `sources/${name}.mp3`));
  if (files.length === 1) {
    await writeFile(resolve(root, `audio/${item.id}.mp3`), await readFile(files[0]));
  } else {
    // Trim silence on each syllable before joining compound stroke names.
    const filters = files.map((_, i) => `[${i}:a]silenceremove=start_periods=1:start_threshold=-42dB,areverse,silenceremove=start_periods=1:start_threshold=-42dB,areverse,apad=pad_dur=0.09[a${i}]`);
    filters.push(`${files.map((_, i) => `[a${i}]`).join('')}concat=n=${files.length}:v=0:a=1[out]`);
    await exec('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...files.flatMap(file => ['-i', file]), '-filter_complex', filters.join(';'), '-map', '[out]', '-ar', '22050', '-b:a', '64k', resolve(root, `audio/${item.id}.mp3`)]);
  }
}
console.log(`Prepared ${Object.keys(items).length} local audio files.`);
await import('./prepare-shapes.mjs');
