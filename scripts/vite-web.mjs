/**
 * Vite (and esbuild) spawn CMD on Windows; CMD does not support a UNC current directory,
 * so builds from \\server\share\... fall back to C:\Windows and fail to find the config.
 * pushd maps the UNC path to a temporary drive letter so the child process has a valid cwd.
 * Use relative --config and vite path after pushd so config bundling does not turn UNC into
 * broken file:// URLs (package entry resolution then fails for vite and @vitejs/plugin-react).
 */
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const subcommand = process.argv[2] || 'build';
if (subcommand !== 'build' && subcommand !== 'preview') {
  console.error('Usage: node scripts/vite-web.mjs build|preview');
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const configFile = path.join(root, 'vite.config.web.ts');
/** After pushd, cwd is a drive letter; relative paths avoid UNC in Vite/esbuild config bundling. */
const viteBinRel = 'node_modules\\vite\\bin\\vite.js';
const configRel = 'vite.config.web.ts';

function isWindowsUncPath(absPath) {
  if (process.platform !== 'win32') return false;
  const normalized = path.normalize(absPath).replace(/\//g, '\\');
  return normalized.startsWith('\\\\');
}

const nodeArgs = [viteBin, subcommand, '--config', configFile];

if (isWindowsUncPath(root)) {
  const winRoot = path.normalize(root).replace(/\//g, '\\');
  const cmdLine = [
    'pushd',
    `"${winRoot}"`,
    '&&',
    `"${process.execPath}"`,
    viteBinRel,
    subcommand,
    '--config',
    configRel,
    '&&',
    'popd',
  ].join(' ');
  execSync(cmdLine, { stdio: 'inherit', shell: 'cmd.exe' });
} else {
  const result = spawnSync(process.execPath, nodeArgs, {
    stdio: 'inherit',
    cwd: root,
    shell: false,
  });
  process.exit(result.status === null ? 1 : result.status);
}
