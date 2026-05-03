/**
 * Invoked only via: node -e "require(join(dirname(process.env.npm_package_json), 'package-hooks.cjs')).run(...)"
 * so Node never resolves script paths relative to a broken cwd (e.g. C:\\Windows when UNC cwd fails).
 */
const path = require('path');
const { spawnSync } = require('child_process');

function getRoot() {
  const j = process.env.npm_package_json;
  if (!j || typeof j !== 'string') {
    console.error('package-hooks: npm_package_json is not set. Run via npm run, not node directly.');
    process.exit(1);
  }
  return path.dirname(j);
}

/**
 * @param {string} scriptName - file under ./scripts (e.g. run-electron-vite.cjs)
 * @param {string[]} [args]
 */
function run(scriptName, args = []) {
  const root = getRoot();
  const scriptPath = path.join(root, 'scripts', scriptName);
  const r = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  const code = r.status === null ? 1 : r.status;
  if (code !== 0) process.exit(code);
}

/**
 * @param {Array<[string, string[]]>} steps
 */
function runChain(steps) {
  const root = getRoot();
  for (const [scriptName, args] of steps) {
    const scriptPath = path.join(root, 'scripts', scriptName);
    const r = spawnSync(process.execPath, [scriptPath, ...(args || [])], {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    });
    const code = r.status === null ? 1 : r.status;
    if (code !== 0) process.exit(code);
  }
}

module.exports = { run, runChain, getRoot };
