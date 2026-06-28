#!/usr/bin/env node
/**
 * Build the kaoyan React app and copy its production assets into
 * public/kaoyan/ so Astro can include them in the static site.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const KAOYAN_APP = resolve('E:/idea/kaoyan-app/app');
const TARGET = resolve(ROOT, 'public', 'kaoyan');

function run(cmd, args, cwd) {
  const isWin = process.platform === 'win32';
  console.log(`> ${cmd} ${args.join(' ')}`);

  let result;
  if (isWin) {
    // npm is a .cmd file on Windows; invoke it through cmd.exe to avoid
    // the Node.js deprecation warning for shell:true + args.
    result = spawnSync('cmd.exe', ['/c', cmd, ...args], {
      cwd,
      stdio: 'inherit',
    });
  } else {
    result = spawnSync(cmd, args, {
      cwd,
      stdio: 'inherit',
    });
  }

  if (result.status !== 0) {
    console.error(`Command failed with exit code ${result.status ?? result.error}`);
    process.exit(1);
  }
}

if (!existsSync(KAOYAN_APP)) {
  console.error(`kaoyan app not found at ${KAOYAN_APP}`);
  process.exit(1);
}

// Install dependencies only if node_modules is missing.
if (!existsSync(resolve(KAOYAN_APP, 'node_modules'))) {
  run('npm', ['install', '--registry=https://registry.npmmirror.com'], KAOYAN_APP);
}

// Build the React app.
run('npm', ['run', 'build'], KAOYAN_APP);

// Copy fresh build output into the Astro public folder.
const SOURCE = resolve(KAOYAN_APP, 'dist');
if (!existsSync(SOURCE)) {
  console.error(`Build output not found at ${SOURCE}`);
  process.exit(1);
}

if (existsSync(TARGET)) {
  rmSync(TARGET, { recursive: true, force: true });
}
mkdirSync(TARGET, { recursive: true });
cpSync(SOURCE, TARGET, { recursive: true, force: true });

console.log(`\nkaoyan assets copied to ${TARGET}`);
