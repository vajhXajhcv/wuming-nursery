#!/usr/bin/env node
/**
 * Build the TriWorld React app and copy its production assets into
 * public/triworld/ so Astro can include them in the static site.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TRIWORLD_APP = resolve('E:/idea/triworld/app');
const TARGET = resolve(ROOT, 'public', 'triworld');

function run(cmd, args, cwd) {
  const isWin = process.platform === 'win32';
  console.log(`> ${cmd} ${args.join(' ')}`);

  let result;
  if (isWin) {
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

if (!existsSync(TRIWORLD_APP)) {
  console.error(`triworld app not found at ${TRIWORLD_APP}`);
  process.exit(1);
}

if (!existsSync(resolve(TRIWORLD_APP, 'node_modules'))) {
  run('npm', ['install', '--registry=https://registry.npmjs.org'], TRIWORLD_APP);
}

run('npm', ['run', 'build'], TRIWORLD_APP);

const SOURCE = resolve(TRIWORLD_APP, 'dist');
if (!existsSync(SOURCE)) {
  console.error(`Build output not found at ${SOURCE}`);
  process.exit(1);
}

if (existsSync(TARGET)) {
  rmSync(TARGET, { recursive: true, force: true });
}
mkdirSync(TARGET, { recursive: true });
cpSync(SOURCE, TARGET, { recursive: true, force: true });

console.log(`\ntriworld assets copied to ${TARGET}`);
