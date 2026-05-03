/**
 * Run electron-builder from project root (same UNC/cwd rationale as run-electron-vite.cjs).
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const ebBin =
  process.platform === 'win32'
    ? path.join(projectRoot, 'node_modules', '.bin', 'electron-builder.cmd')
    : path.join(projectRoot, 'node_modules', '.bin', 'electron-builder');
const args = process.argv.slice(2);

if (!fs.existsSync(ebBin)) {
  console.error('electron-builder not found in node_modules/.bin - run npm install');
  process.exit(1);
}

const result = spawnSync(ebBin, args, {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env },
});

process.exit(result.status === null ? 1 : result.status);
