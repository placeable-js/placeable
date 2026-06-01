import { expect, test } from '@playwright/test'

/**
 * Real-browser coverage for the DOM ↔ math boundary. The kernels and frame
 * algebra are unit-tested headlessly; what jsdom cannot give us is a live
 * layout from which `computeFrame` reads the ancestor transform stack and
 * `getBoundingClientRect`. These specs render a genuine transformed ancestor
 * (30° rotation + 1.5× zoom) and assert that gestures stay glued to the pointer
 * through that stack — the one thing only a browser can prove.
 */

interface DesignBoxLike {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

interface PlaceableCommit {
  box: DesignBoxLike
  startBox: DesignBoxLike
}

interface PlaceableHarness {
  commits: PlaceableCommit[]
  scale(): number
  attach(kind: 'drag' | 'resize'): void
}

declare global {
  interface Window {
    placeable: PlaceableHarness
    placeableReady?: boolean
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.placeableReady === true)
})

test('computeFrame recovers the ancestor zoom (1.5×) from the live transform stack', async ({
  page,
}) => {
  const scale = await page.evaluate(() => window.placeable.scale())
  expect(scale).toBeCloseTo(1.5, 3)
})

test('a drag tracks the pointer 1:1 through a rotated, scaled ancestor', async ({ page }) => {
  await page.evaluate(() => {
    window.placeable.attach('drag')
  })

  const rect = await page.locator('#target').boundingBox()
  if (!rect) throw new Error('target element has no bounding box')
  const start = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  const dx = 120
  const dy = -80

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 8 })
  await page.mouse.up()

  const commits = await page.evaluate(() => window.placeable.commits)
  expect(commits).toHaveLength(1)
  const commit = commits[0]
  if (!commit) throw new Error('no commit was recorded')

  // viewScale = 1, so the committed design box is the rendered (container) box.
  // The element must follow the cursor 1:1 in screen space despite the ancestor
  // transform — this only holds if computeFrame inverted that stack correctly.
  // Tolerance covers integer clientX/Y rounding in synthesized pointer events.
  expect(Math.abs(commit.box.x - commit.startBox.x - dx)).toBeLessThan(1.5)
  expect(Math.abs(commit.box.y - commit.startBox.y - dy)).toBeLessThan(1.5)
  expect(commit.box.width).toBeCloseTo(commit.startBox.width, 1)
  expect(commit.box.height).toBeCloseTo(commit.startBox.height, 1)
  expect(commit.box.rotation).toBeCloseTo(commit.startBox.rotation, 5)
})

test('an se-handle resize grows the box anchored through the transformed ancestor', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.placeable.attach('resize')
  })

  const rect = await page.locator('#target').boundingBox()
  if (!rect) throw new Error('target element has no bounding box')
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }

  await page.mouse.move(center.x, center.y)
  await page.mouse.down()
  await page.mouse.move(center.x + 150, center.y + 150, { steps: 10 })
  await page.mouse.up()

  const commits = await page.evaluate(() => window.placeable.commits)
  expect(commits).toHaveLength(1)
  const commit = commits[0]
  if (!commit) throw new Error('no commit was recorded')

  // Dragging the SE handle outward (down-right in screen space) grows both axes
  // once the move is projected back through the rotated frame; rotation is
  // untouched by a resize.
  expect(commit.box.width).toBeGreaterThan(commit.startBox.width)
  expect(commit.box.height).toBeGreaterThan(commit.startBox.height)
  expect(commit.box.rotation).toBeCloseTo(commit.startBox.rotation, 5)
})
