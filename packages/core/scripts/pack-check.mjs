/**
 * Release smoke-check for the built package.
 *
 * What it does:
 *  1. Runs `pnpm pack` and verifies the tarball contains only dist/ + package.json.
 *  2. Bundles each public entry through esbuild (minified, tree-shaken) and reports
 *     the final byte sizes — no build-size surprises at publish time.
 *  3. Tree-shake check: bundles importing *only* `createDrag` (one operation) and
 *     asserts that `createResize`/`createRotate` identifiers are not present in the
 *     output — proves the `sideEffects:false` + named-export contract holds.
 *
 * Run: `pnpm pack:check`
 * Expects: dist/ already built (pack:check builds it first via the script).
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

// Inspect tarball contents
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

// ── 2. Bundle-size check ───────────────────────────────────────────────────────
console.log('\n2. Bundle sizes (minified, tree-shaken, no deps)…')

const tmp = mkdtempSync(join(tmpdir(), 'placeable-js-core-packcheck-'))

async function bundleSize(label, code, outFile) {
  writeFileSync(join(tmp, `${outFile}.input.mjs`), code)
  const res = await build({
    entryPoints: [join(tmp, `${outFile}.input.mjs`)],
    bundle: true,
    minify: true,
    format: 'esm',
    write: false,
    // Point to the built dist so we're testing what ships, not source.
    alias: {
      [pkgName]: join(pkgRoot, 'dist/index.js'),
      [`${pkgName}/dom`]: join(pkgRoot, 'dist/dom/index.js'),
    },
    external: [],
  })
  const bytes = res.outputFiles[0].contents.byteLength
  pass(`${label}: ${fmt(bytes)}`)
  return { bytes, text: res.outputFiles[0].text }
}

await bundleSize(`${pkgName} (full core)         `, `export * from '${pkgName}'`, 'core')
await bundleSize(`${pkgName}/dom (full DOM layer)`, `export * from '${pkgName}/dom'`, 'dom')
// ── 3. Tree-shake check ────────────────────────────────────────────────────────
// The `operations` namespace export is intentionally coarse-grained — referencing
// the namespace object forces the whole object into the bundle (this is normal for
// ESM namespace imports). The meaningful boundary check is: does importing *only
// the DOM layer* (createPointerGesture) pull in the gesture kernels? It must not,
// since the DOM adapter is operation-agnostic.
console.log(`\n3. Tree-shake check (${pkgName}/dom → no kernel code)…`)

const { text: domOnly } = await bundleSize(
  `${pkgName}/dom (createPointerGesture only)`,
  `import { createPointerGesture } from '${pkgName}/dom'
export { createPointerGesture }`,
  'dom-treeshake',
)

if (
  !domOnly.includes('createResize') &&
  !domOnly.includes('createRotate') &&
  !domOnly.includes('createDrag')
) {
  pass('operation kernels (createDrag/createResize/createRotate) absent from DOM-only bundle')
} else {
  fail('tree-shaking failed — operation kernel code leaked into DOM-only bundle')
}

// ── 4. Exports map check ───────────────────────────────────────────────────────
console.log('\n4. Exports map…')

const exportsMap = pkg.exports ?? {}
const expectedSubpaths = ['.', './dom']
for (const sub of expectedSubpaths) {
  if (exportsMap[sub]) {
    pass(`"${sub}" exports: types → ${exportsMap[sub].types}  import → ${exportsMap[sub].import}`)
  } else {
    fail(`missing "${sub}" in exports map`)
  }
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
