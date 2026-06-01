/**
 * Launches tsup --watch and the static dev server concurrently, then tears
 * both down cleanly on SIGINT/SIGTERM.
 *
 * Run: `pnpm dev:play`    (from packages/core)
 *   or: `pnpm dev`        (from the repo root)
 */
import { spawn } from 'node:child_process'

const PORT = process.env.PORT ?? 4173

function spawnInherited(cmd, args, options = {}) {
  const child = spawn(cmd, args, { stdio: 'inherit', shell: false, ...options })
  child.on('error', (err) => {
    process.stderr.write(`dev-play: failed to start "${cmd}": ${err.message}\n`)
    teardown()
    process.exit(1)
  })
  return child
}

// `pnpm exec` resolves workspace-root binaries regardless of where node_modules/.bin lives.
const watcher = spawnInherited('pnpm', ['exec', 'tsup', '--watch'])
const server = spawnInherited('node', ['e2e/static-server.mjs'], {
  env: { ...process.env, PORT: String(PORT) },
})

console.log(`\nplayground → http://localhost:${PORT}/\n`)

function teardown() {
  watcher.kill()
  server.kill()
}
process.on('SIGINT', teardown)
process.on('SIGTERM', teardown)
watcher.on('exit', () => server.kill())
server.on('exit', () => watcher.kill())
