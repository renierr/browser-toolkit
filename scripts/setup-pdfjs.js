'use strict';

import { get } from 'https';
import { createWriteStream, mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import extractZip from 'extract-zip';
import readline from 'readline/promises';
import { stdin, stdout } from 'process';

const VERSION = '5.4.449';
const DIST_URL = `https://github.com/mozilla/pdf.js/releases/download/v${VERSION}/pdfjs-${VERSION}-dist.zip`;
const TARGET_DIR = join(process.cwd(), 'public', 'pdfjs');

async function confirmPrompt(message) { // CHANGED: helper to ask user
  if (!stdin.isTTY) {
    console.error('No TTY available; aborting to avoid destructive changes.');
    return false;
  }
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const ans = (await rl.question(`${message} (y/N): `)).trim().toLowerCase();
  rl.close();
  return ans === 'y' || ans === 'yes';
}

async function setup() {
  if (existsSync(TARGET_DIR)) {
    const ok = await confirmPrompt(`\`public/pdfjs\` already exists. Remove and continue`);
    if (!ok) {
      console.log('Aborting: existing directory preserved.');
      process.exitCode = 0;
      return;
    }
    console.log('Removing existing PDF.js viewer to update...');
    try {
      rmSync(TARGET_DIR, { recursive: true, force: true });
    } catch (err) {
      console.error('Failed to remove existing directory:', err);
      throw err;
    }
  }

  console.log(`Downloading PDF.js v${VERSION}...`);
  mkdirSync(TARGET_DIR, { recursive: true });

  const zipPath = join(TARGET_DIR, 'pdfjs.zip');
  const file = createWriteStream(zipPath);

  await new Promise((resolve, reject) => {
    const doGet = (url) => {
      get(url, (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          doGet(res.headers.location);
          return;
        }
        if (status !== 200) {
          reject(new Error(`Download failed with status ${status}`));
          return;
        }
        res.pipe(file);
        file.on('finish', resolve);
        file.on('error', reject);
      }).on('error', reject);
    };

    doGet(DIST_URL);
  });

  console.log('Extracting zip...');

  try {
    await extractZip(zipPath, { dir: TARGET_DIR });
    rmSync(zipPath);
    console.log('PDF.js Viewer successfully installed to /public/pdfjs');
  } catch (err) {
    try { if (existsSync(zipPath)) rmSync(zipPath); } catch (_) {}
    console.error('Extraction failed. Ensure the zip file is valid.', err);
    throw err;
  }
}

setup().catch((e) => {
  console.error('Setup failed:', e);
  process.exitCode = 1;
});
