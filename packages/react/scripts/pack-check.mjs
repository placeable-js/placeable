/**
 * Release smoke-check for the built React adapter.
 *
 * What it does:
 *  1. Runs `pnpm pack` and verifies the tarball contains only dist/ + package.json.
 *  2. Bundles the public entry through esbuild (minified, tree-shaken) with
 *     `react`/`react-dom` and `@placeable-js/core` marked external — proving the
 *     adapter never bundles its peer/core deps — and reports the byte size.
 *  3. Asserts the exports map exposes the single root entry.
 *
 * Run: `pnpm pack:check` (builds dist first via the script).
 */

import { execSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const pkgRoot = join(fileURLToPath(import.meta.url), '..', '..')
const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'))

function fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function pass(msg) {
  console.log(`  \u2705 ${msg}`)
}
function fail(msg) {
  console.error(`  \u274c ${msg}`)
  process.exitCode = 1
}

const pkgName = pkg.name
console.log(`\n${pkgName}@${pkg.version} — pack:check\n`)

// ── 1. Pack ────────────────────────────────────────────────────────────────────
console.log('1. Packing…')
const tarball = execSync('pnpm pack --pack-destination .', {
  cwd: pkgRoot,
  encoding: 'utf8',
}).trim()
const tarPath = join(pkgRoot, tarball.split('\n').at(-1).trim())

const tarList = execSync(`tar -tzf "${tarPath}"`, { encoding: 'utf8' })
  .trim()
  .split('\n')
  .map((l) => l.replace(/^package\//, ''))

const allowed = new Set(['package.json', 'LICENSE', 'README.md', './'])
const unexpected = tarList.filter((f) => f && !f.startsWith('dist/') && !allowed.has(f))
if (unexpected.length === 0) {
  pass(`tarball contains only dist/ + package.json (${tarList.length} entries)`)
} else {
  fail(`unexpected tarball entries: ${unexpected.join(', ')}`)
}

// ── 2. Bundle-size check (peer + core stay external) ────────────────────────────
console.log('\n2. Bundle size (minified; react/core external)…')

const tmp = mkdtempSync(join(tmpdir(), 'placeable-js-react-packcheck-'))
writeFileSync(join(tmp, 'entry.input.mjs'), `export * from '${pkgName}'`)

const res = await build({
  entryPoints: [join(tmp, 'entry.input.mjs')],
  bundle: true,
  minify: true,
  format: 'esm',
  write: false,
  alias: { [pkgName]: join(pkgRoot, 'dist/index.js') },
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@placeable-js/core',
    '@placeable-js/core/dom',
  ],
})
const out = res.outputFiles[0]
pass(`${pkgName} (full adapter): ${fmt(out.contents.byteLength)}`)

// External deps keep their bare `import … from "@placeable-js/core/dom"`; if the
// engine had been inlined that specifier would be gone (and the bundle far larger).
if (out.text.includes('@placeable-js/core')) {
  pass('@placeable-js/core left external (no core engine bundled)')
} else {
  fail('core engine leaked into the adapter bundle — @placeable-js/core was not external')
}
if (/from"react"|from *['"]react['"]/.test(out.text) || out.text.includes('jsx-runtime')) {
  pass('react / jsx-runtime left external (peer dependency not bundled)')
} else {
  fail('react was bundled — it must stay an external peer dependency')
}

// ── 3. Exports map check ───────────────────────────────────────────────────────
console.log('\n3. Exports map…')
const exportsMap = pkg.exports ?? {}
if (exportsMap['.']) {
  pass(`"." exports: types → ${exportsMap['.'].types}  import → ${exportsMap['.'].import}`)
} else {
  fail('missing "." in exports map')
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────')
if (process.exitCode === 1) {
  console.log('pack:check FAILED — see ❌ above')
} else {
  console.log('pack:check PASSED ✅')
}
console.log(`tarball: ${tarball.split('\n').at(-1).trim()}`)
console.log('────────────────────────────────────\n')
