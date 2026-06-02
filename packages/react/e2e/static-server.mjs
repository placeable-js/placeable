// Zero-dependency static file server for the React Playwright e2e fixture. Serves
// the package root over HTTP so the fixture can load the esbuild-bundled
// `app.js` (which bundles the *built* `@placeable-js/react` + `@placeable-js/core`
// and React) with real module resolution — `file://` blocks module CORS, so a
// real origin is required. Started by `webServer` in `playwright.config.ts`; not
// part of the shipped package.
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = join(fileURLToPath(import.meta.url), '..', '..')
const port = Number(process.env.PORT ?? 4174)

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

const server = createServer(async (req, res) => {
  const requestPath = new URL(req.url ?? '/', `http://localhost:${port}`).pathname
  const relative = requestPath === '/' ? '/e2e/fixtures/index.html' : requestPath
  const filePath = normalize(join(packageRoot, decodeURIComponent(relative)))

  // Refuse to serve anything outside the package root (path-traversal guard).
  if (filePath !== packageRoot && !filePath.startsWith(packageRoot + sep)) {
    res.statusCode = 403
    res.end('Forbidden')
    return
  }

  try {
    const body = await readFile(filePath)
    res.setHeader('Content-Type', CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream')
    res.end(body)
  } catch {
    res.statusCode = 404
    res.end('Not found')
  }
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    process.stderr.write(
      `static-server: port ${port} is already in use.\n` +
        `  • Open http://localhost:${port}/ if a dev server is already running, or\n` +
        `  • Stop it: kill $(lsof -t -i:${port})   (or pick another port: PORT=4175 ...)\n`,
    )
    process.exit(1)
  }
  throw err
})

server.listen(port, () => {
  process.stdout.write(`static-server: serving ${packageRoot} on http://localhost:${port}\n`)
})
