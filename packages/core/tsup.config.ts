import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/dom/index.ts'],
  // The DOM adapter entry needs the DOM lib for declaration emit; the core
  // entry is unaffected by its presence. Core purity is enforced by the
  // separate no-DOM `tsconfig.json` in `typecheck`.
  tsconfig: 'tsconfig.dom.json',
  format: ['esm'],
  target: 'es2022',
  dts: true,
  sourcemap: true,
  treeshake: true,
  clean: true,
})
