import { defineConfig, devices } from '@playwright/test'

/**
 * Real-browser smoke for the React adapter. The headless controller and the
 * thin binding are covered exhaustively by Vitest; what only a browser can prove
 * is the *whole chrome path* — a delegated pointer source on the overlay driving
 * drag/resize/rotate of a target inside a rotated + scaled ancestor, the chrome
 * staying glued after scroll/resize, and — the load-bearing performance
 * contract — **zero React re-renders during a gesture or a scroll burst**.
 *
 * The fixture loads an esbuild bundle of the *built* `@placeable-js/react` +
 * `@placeable-js/core` (run `pnpm build && node e2e/build-fixture.mjs`, which
 * `test:e2e` does for you), so what we test is exactly what ships.
 */
const PORT = 4174

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
