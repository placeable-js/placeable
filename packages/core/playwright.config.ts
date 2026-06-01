import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end suite that guards the DOM ↔ math boundary in a real browser: the
 * pure kernels and frame algebra are covered exhaustively by Vitest, but
 * `computeFrame` reads the live ancestor transform stack (`getComputedStyle`)
 * and `getBoundingClientRect`, which jsdom cannot model faithfully. These specs
 * render genuine transformed ancestors and verify that gestures stay glued to
 * the pointer through that stack, across every engine.
 *
 * The fixtures import the *built* bundle (run `pnpm build` first; `test:e2e`
 * does this for you), so what we test is exactly what ships.
 */
const PORT = 4173

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'node e2e/static-server.mjs',
    port: PORT,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
