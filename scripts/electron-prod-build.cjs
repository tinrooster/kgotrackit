/**
 * Production pipeline: electron-vite build + electron-builder, always from project root.
 * See scripts/run-electron-vite.cjs for why cwd is forced.
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const electronViteCli = path.join(projectRoot, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js');
const ebBin =
  process.platform === 'win32'
    ? path.join(projectRoot, 'node_modules', '.bin', 'electron-builder.cmd')
    : path.join(projectRoot, 'node_modules', '.bin', 'electron-builder');

function runStep(title, fn) {
  const r = fn();
  if (r === null || (typeof r.status === 'number' && r.status !== 0)) {
    const code = r === null ? 1 : r.status;
    console.error(`[electron-prod-build] "${title}" failed with exit code ${code}`);
    process.exit(code);
  }
}

if (!fs.existsSync(electronViteCli)) {
  console.error('electron-vite not found - run npm install');
  process.exit(1);
}

runStep('electron-vite build', () =>
  spawnSync(process.execPath, [electronViteCli, 'build'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env },
  })
);

if (!fs.existsSync(ebBin)) {
  console.error('electron-builder not found in node_modules/.bin - run npm install');
  process.exit(1);
}

runStep('electron-builder', () =>
  spawnSync(ebBin, [], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env },
  })
);
