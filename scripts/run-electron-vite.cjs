/**
 * Run electron-vite with cwd = project root (directory above this script).
 * Fixes Windows when CMD cannot use a UNC path as cwd (falls back to C:\\Windows),
 * which would otherwise prevent electron.vite.config from being found.
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const electronViteCli = path.join(projectRoot, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js');
const args = process.argv.slice(2);

if (!args.length) {
  console.error('Usage: node scripts/run-electron-vite.cjs <dev|build|preview> [extra args...]');
  process.exit(1);
}

if (!fs.existsSync(electronViteCli)) {
  console.error('electron-vite not found at', electronViteCli, '- run npm install');
  process.exit(1);
}

const result = spawnSync(process.execPath, [electronViteCli, ...args], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: { ...process.env },
});

process.exit(result.status === null ? 1 : result.status);
