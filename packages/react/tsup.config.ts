import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2022',
  dts: true,
  sourcemap: true,
  treeshake: true,
  clean: true,
  // React is a peer dependency — never bundle it.
  external: ['react', 'react-dom'],
})
