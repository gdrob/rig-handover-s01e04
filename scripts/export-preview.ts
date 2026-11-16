import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';

const repoRoot = await realpath(fileURLToPath(new URL('..', import.meta.url)));
const argument = process.argv[2];
if (!argument || !isAbsolute(argument)) {
  throw new Error('Usage: tsx --env-file-if-exists=.env scripts/export-preview.ts /absolute/path/outside-repo/index.html');
}

// Resolve existing ancestors too: a symlink outside the repo must not lead a preview into it.
async function destinationPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    return resolve(await destinationPath(dirname(path)), relative(dirname(path), path));
  }
}

const output = await destinationPath(resolve(argument));
const fromRepo = relative(repoRoot, output);
if (fromRepo === '' || (!fromRepo.startsWith('..' + '/') && fromRepo !== '..' && !isAbsolute(fromRepo))) {
  throw new Error('Previews must be saved outside the repository.');
}

const response = await createApp().request('/digest/2026-10-28');
if (response.status !== 200) throw new Error(`Digest export returned HTTP ${response.status}.`);
const html = await response.text();
if (!/^<!doctype html>/i.test(html) || !/<\/html>\s*$/i.test(html) || !/<style\b/i.test(html)
    || /<(?:script|link|iframe|img|audio|video)\b/i.test(html) || /@import\b|url\s*\(/i.test(html)) {
  throw new Error('Digest export must be a complete HTML document with inline styles and no external resources.');
}

await mkdir(dirname(output), { recursive: true });
await writeFile(output, html, 'utf8');
console.log(`Saved digest preview to ${output}`);
