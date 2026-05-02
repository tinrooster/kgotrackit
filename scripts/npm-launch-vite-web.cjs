/**
 * Loaded via: node -e "require(…join(dirname(npm_package_json),'scripts','npm-launch-vite-web.cjs'))"
 * so Node never resolves ./scripts relative to C:\Windows when the project lives on a UNC path.
 */
const path = require('path');
const { spawnSync } = require('child_process');

const pkgJson = process.env.npm_package_json;
if (!pkgJson) {
  console.error('Run: npm run build:web   or   npm run preview:web');
  process.exit(1);
}

const root = path.dirname(pkgJson);
const event = process.env.npm_lifecycle_event || '';
const sub = /^preview(?::|$)/.test(event) ? 'preview' : 'build';
const script = path.join(root, 'scripts', 'vite-web.mjs');

const result = spawnSync(process.execPath, [script, sub], { stdio: 'inherit' });
process.exit(result.status === null ? 1 : result.status);
