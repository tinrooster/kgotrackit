const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const currentVersion = String(packageJson.version || '1.0.0');
const versionMatch = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)$/);

if (!versionMatch) {
  console.error(`Unsupported version format: "${currentVersion}". Expected MAJOR.MINOR.PATCH.`);
  process.exit(1);
}

const majorVersion = Number(versionMatch[1]);
const minorVersion = Number(versionMatch[2]);
const patchVersion = Number(versionMatch[3]);

const nextVersion = `${majorVersion}.${minorVersion}.${patchVersion + 1}`;
packageJson.version = nextVersion;

fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
console.log(`Version bumped: ${currentVersion} -> ${nextVersion}`);
