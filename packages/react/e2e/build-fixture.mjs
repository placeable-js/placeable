// Bundles the e2e fixture (`app.tsx`) into a self-contained browser ESM module.
// esbuild resolves `@placeable-js/react` to its BUILT `dist` (and from there
// `@placeable-js/core`), plus React, so the smoke exercises exactly the shipped
// bundle. Run by `test:e2e` after `pnpm build`. Output (`app.js`) is gitignored.
import { build } from 'esbuild'

await build({
  entryPoints: ['e2e/fixtures/app.tsx'],
  outfile: 'e2e/fixtures/app.js',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  jsx: 'automatic',
  sourcemap: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
})
