import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'url'
import { builtinModules, createRequire } from 'node:module'
import type { Plugin } from 'vite'

/**
 * Bundled `electron.vite.config.*.mjs` often lives under a temp dir, so `import.meta.url` is not
 * the app root. Prefer npm/env/cwd so UNC `\\host\share\proj` is detected for the fix plugins.
 */
function resolveProjectRoot(): string {
  if (process.env.npm_package_json) {
    return path.resolve(path.dirname(process.env.npm_package_json))
  }
  if (process.env.INIT_CWD) {
    const d = path.resolve(process.env.INIT_CWD)
    if (existsSync(path.join(d, 'package.json'))) return d
  }
  const cwd = path.resolve(process.cwd())
  if (existsSync(path.join(cwd, 'package.json'))) return cwd
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)))
}

const projectRoot = resolveProjectRoot()

function normPath(p: string): string {
  return path.normalize(p)
}

function isPathUnderRoot(abs: string, root: string): boolean {
  const a = normPath(abs).toLowerCase()
  const r = normPath(root).toLowerCase()
  return a === r || a.startsWith(r + path.sep)
}

/**
 * On Windows + UNC roots (`\\host\share\...`), Vite can normalize module ids to a bogus
 * POSIX path: `/hostlower/share/rest/...` (single leading slash). That is later joined with
 * `\\host\share\` and duplicates segments (ENOENT …\tinnas\projects\…).
 * Rewrite any id under that bogus prefix back to `path.resolve(rendererRoot, relative)`.
 */
function isWindowsUncProjectRoot(resolved: string): boolean {
  if (process.platform !== 'win32') return false
  const r = path.resolve(resolved)
  if (/^\\\\[^\\]+\\/.test(r)) return true
  const n = r.replace(/\\/g, '/')
  return /^\/\/[^/]+\/[^/]+/.test(n)
}

function bogusUncViteIdPrefixFromRoot(rootAbs: string): string | null {
  const r = path.resolve(rootAbs)
  if (!isWindowsUncProjectRoot(r)) return null
  const segs = r.replace(/\\/g, '/').replace(/^\/+/, '').split('/').filter(Boolean)
  if (segs.length < 2) return null
  return `/${segs[0].toLowerCase()}/${segs.slice(1).join('/')}`
}

function remapUncBogusIdToDiskAbs(
  prefix: string | null,
  id: string,
  rendererRoot: string,
): string | null {
  if (!prefix) return null
  const spec = id.split('?')[0]
  const idSlash = spec.replace(/\\/g, '/')
  if (!idSlash.startsWith('/') || idSlash.startsWith('//')) return null
  if (/^\/[a-z]:\//i.test(idSlash)) return null
  const idLower = idSlash.toLowerCase()
  const pLower = prefix.toLowerCase()
  if (!idLower.startsWith(pLower + '/') && idLower !== pLower) return null
  const remainder = idSlash.slice(prefix.length).replace(/^\/+/, '')
  return normPath(path.resolve(rendererRoot, remainder))
}

function resolveFileWithExtensions(candidate: string): string | null {
  const base = normPath(candidate)
  if (existsSync(base)) {
    const st = statSync(base)
    if (st.isFile()) return normPath(path.resolve(base))
    if (st.isDirectory()) {
      for (const idx of ['index.tsx', 'index.ts', 'index.jsx', 'index.js']) {
        const p = path.join(base, idx)
        if (existsSync(p)) return normPath(path.resolve(p))
      }
    }
  }
  for (const ext of ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs']) {
    const p = base + ext
    if (existsSync(p)) return normPath(path.resolve(p))
  }
  return null
}

function fixWinUncBogusViteAbsoluteIds(rendererRoot: string): Plugin {
  const prefix = bogusUncViteIdPrefixFromRoot(rendererRoot)
  return {
    name: 'fix-win-unc-bogus-vite-absolute-ids',
    enforce: 'pre',
    resolveId(id, importer) {
      const self = remapUncBogusIdToDiskAbs(prefix, id, rendererRoot)
      if (self) return self

      if (!importer || importer.startsWith('\0') || !id.startsWith('.')) return null
      const impRaw = importer.split('?')[0]

      if (prefix) {
        const importerDisk = remapUncBogusIdToDiskAbs(prefix, impRaw, rendererRoot)
        if (importerDisk) {
          const hit = resolveFileWithExtensions(
            normPath(path.resolve(path.dirname(importerDisk), id)),
          )
          if (hit) return hit
        }
      }

      if (!path.isAbsolute(impRaw)) {
        const absImp = normPath(path.join(rendererRoot, impRaw))
        if (existsSync(absImp)) {
          const hit = resolveFileWithExtensions(
            normPath(path.resolve(path.dirname(absImp), id)),
          )
          if (hit) return hit
        }
      } else if (/^\\\\[^\\]+\\/.test(impRaw)) {
        const absImp = normPath(impRaw)
        if (existsSync(absImp)) {
          const hit = resolveFileWithExtensions(
            normPath(path.resolve(path.dirname(absImp), id)),
          )
          if (hit) return hit
        }
      }

      return null
    },
    async load(id) {
      const spec = id.split('?')[0]

      const bogus = remapUncBogusIdToDiskAbs(prefix, id, rendererRoot)
      if (bogus) {
        try {
          return await readFile(bogus, 'utf-8')
        } catch {
          return null
        }
      }

      if (process.platform !== 'win32') return null
      const disk = normPath(spec)
      if (!path.isAbsolute(disk) || !isPathUnderRoot(disk, rendererRoot)) return null
      try {
        if (existsSync(disk)) {
          const st = statSync(disk)
          if (st.isFile()) return await readFile(disk, 'utf-8')
        }
      } catch {
        return null
      }
      const resolved = resolveFileWithExtensions(disk)
      if (!resolved) return null
      try {
        return await readFile(resolved, 'utf-8')
      } catch {
        return null
      }
    },
  }
}

const nodeBuiltinsExternal = builtinModules.flatMap((m) => [m, `node:${m}`])

/**
 * On Windows UNC roots, Vite's package.json entry resolution (`tryFsResolve`) often fails with
 * "Failed to resolve entry for package …" even though files exist. Node's resolver handles UNC
 * correctly; return an absolute path so Rollup skips the broken path.
 */
const SCRIPT_EXT_RE =
  /\.(tsx?|jsx?|mjs|cjs|mts|cts|json|vue|svelte|css|scss|sass|less)$/i

/**
 * UNC + alias resolution can yield absolute ids without an extension (e.g. …/src/contexts/AuthContext).
 * Vite's import-analysis then parses them as plain JS and errors on JSX. Force .tsx/.ts/etc. via disk.
 */
function ensureResolvedFileExtension(rendererRoot: string): Plugin {
  return {
    name: 'ensure-resolved-file-extension-unc',
    enforce: 'post',
    resolveId(id) {
      const q = id.indexOf('?')
      const spec = q >= 0 ? id.slice(0, q) : id
      if (!path.isAbsolute(spec) || spec.startsWith('\0')) return null
      const disk = normPath(spec)
      if (!isPathUnderRoot(disk, rendererRoot)) return null
      const nm = `${path.sep}node_modules${path.sep}`
      if (disk.includes(nm)) return null
      if (SCRIPT_EXT_RE.test(disk)) return null
      const hit = resolveFileWithExtensions(disk)
      if (!hit) return null
      return q >= 0 ? `${hit}${id.slice(q)}` : hit
    },
  }
}

function resolveBareNpmSpecifiersWithNode(projectRoot: string): Plugin {
  const require = createRequire(path.join(projectRoot, 'package.json'))
  return {
    name: 'resolve-bare-npm-node-for-unc',
    enforce: 'pre',
    resolveId(id, importer) {
      const spec = id.split('?')[0]
      if (!spec || spec.startsWith('\0') || spec.startsWith('vite:') || spec.startsWith('file:'))
        return null
      if (path.isAbsolute(spec)) return null
      if (spec.startsWith('.') || spec.startsWith('/')) return null
      if (spec.startsWith('@/')) return null

      const paths: string[] = [projectRoot]
      if (importer && !importer.startsWith('\0')) {
        const from = path.dirname(importer.split('?')[0])
        if (path.isAbsolute(from)) paths.unshift(from)
      }

      try {
        const resolved = require.resolve(spec, { paths: [...new Set(paths)] })
        if (!path.isAbsolute(resolved)) return null
        return normPath(resolved)
      } catch {
        return null
      }
    },
  }
}

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: path.join(projectRoot, 'electron/main.ts'),
      },
      rollupOptions: {
        external: ['electron-squirrel-startup']
      }
    }
  },
  preload: {
    build: {
      lib: {
        entry: path.join(projectRoot, 'electron/preload.ts'),
        // electron-store@10 is ESM-only; electron-vite defaults to ssr.noExternal:true which
        // forces bundling and trips Vite's resolver. Emit ESM preload and keep the dep external.
        formats: ['es'],
      },
      rollupOptions: {
        external: ['electron', /^electron\/.+/, 'electron-store', ...nodeBuiltinsExternal],
      },
    },
  },
  renderer: {
    // Must be absolute: `root: '.'` follows process.cwd(), which can be C:\\Windows when UNC cwd fails.
    root: projectRoot,
    build: {
      rollupOptions: {
        input: {
          index: path.join(projectRoot, 'index.html'),
        },
      }
    },
    resolve: {
      alias: {
        '@': path.join(projectRoot, 'src'),
        // Root index.html may still reference /src/*; map to disk (UNC-safe) for Rollup.
        '/src': path.join(projectRoot, 'src'),
        // CJS deps (e.g. pngjs → qrcode) pull `buffer`; Vite's package entry resolver fails on UNC.
        buffer: path.join(projectRoot, 'node_modules', 'buffer', 'index.js'),
      },
    },
    plugins: [
      fixWinUncBogusViteAbsoluteIds(projectRoot),
      resolveBareNpmSpecifiersWithNode(projectRoot),
      react(),
      ensureResolvedFileExtension(projectRoot),
    ],
  },
}) 