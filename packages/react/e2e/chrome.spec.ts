import { expect, type Page, test } from '@playwright/test'

/**
 * Real-browser smoke for the whole React chrome path: a delegated pointer source
 * on the overlay drives drag/resize/rotate of a target inside a rotated + scaled
 * ancestor, the chrome stays glued after scroll / container-resize / external
 * mutation, and — the load-bearing contract — the React render counter stays
 * **flat** through a gesture and a scroll burst (chrome motion is imperative).
 */

interface BoxLike {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

interface PlaceableHarness {
  commits: Array<{ box: BoxLike; startBox: BoxLike }>
  renderCount: () => number
  select: () => void
  clear: () => void
  sync: () => void
}

declare global {
  interface Window {
    placeable: PlaceableHarness
    placeableReady?: boolean
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/index.html')
  await page.waitForFunction(() => window.placeableReady === true)
})

async function center(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).boundingBox()
  if (!box) throw new Error(`no bounding box for ${selector}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** Flush two animation frames so rAF-coalesced syncs (scroll/resize) land. */
async function flushFrames(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  )
}

async function select(page: Page): Promise<void> {
  await page.evaluate(() => window.placeable.select())
}

test('body-drag moves the target 1:1 in screen space through the rotated, scaled ancestor', async ({
  page,
}) => {
  await select(page)
  const c = await center(page, '[data-placeable-handle="body"]')
  const dx = 120
  const dy = -60

  await page.mouse.move(c.x, c.y)
  await page.mouse.down()
  await page.mouse.move(c.x + dx, c.y + dy, { steps: 8 })
  await page.mouse.up()

  const commits = await page.evaluate(() => window.placeable.commits)
  expect(commits).toHaveLength(1)
  const commit = commits[0]
  if (!commit) throw new Error('no commit recorded')
  // viewScale = 1, so the design delta equals the screen delta — only true if the
  // ancestor transform stack was inverted correctly.
  expect(Math.abs(commit.box.x - commit.startBox.x - dx)).toBeLessThan(1.5)
  expect(Math.abs(commit.box.y - commit.startBox.y - dy)).toBeLessThan(1.5)
  expect(commit.box.rotation).toBeCloseTo(commit.startBox.rotation, 5)
})

test('se-handle resize grows the box with rotation preserved', async ({ page }) => {
  await select(page)
  const se = await center(page, '[data-placeable-handle="se"]')

  await page.mouse.move(se.x, se.y)
  await page.mouse.down()
  await page.mouse.move(se.x + 140, se.y + 140, { steps: 10 })
  await page.mouse.up()

  const commits = await page.evaluate(() => window.placeable.commits)
  expect(commits).toHaveLength(1)
  const commit = commits[0]
  if (!commit) throw new Error('no commit recorded')
  expect(commit.box.width).toBeGreaterThan(commit.startBox.width)
  expect(commit.box.height).toBeGreaterThan(commit.startBox.height)
  expect(commit.box.rotation).toBeCloseTo(commit.startBox.rotation, 5)
})

test('rotate-handle rotation accumulates an angle', async ({ page }) => {
  await select(page)
  const rotate = await center(page, '[data-placeable-handle="rotate"]')

  await page.mouse.move(rotate.x, rotate.y)
  await page.mouse.down()
  await page.mouse.move(rotate.x + 120, rotate.y + 120, { steps: 10 })
  await page.mouse.up()

  const commits = await page.evaluate(() => window.placeable.commits)
  expect(commits).toHaveLength(1)
  const commit = commits[0]
  if (!commit) throw new Error('no commit recorded')
  expect(Math.abs(commit.box.rotation - commit.startBox.rotation)).toBeGreaterThan(0.01)
})

test('the chrome stays glued to the target after an idle scroll', async ({ page }) => {
  await select(page)
  const targetBefore = await center(page, '#target')
  const boxBefore = await center(page, '[data-placeable-box]')
  expect(Math.abs(boxBefore.x - targetBefore.x)).toBeLessThan(1.5)
  expect(Math.abs(boxBefore.y - targetBefore.y)).toBeLessThan(1.5)

  await page.evaluate(() => {
    const viewport = document.getElementById('viewport')
    if (viewport) viewport.scrollTop = 140
  })
  await flushFrames(page)

  const targetAfter = await center(page, '#target')
  const boxAfter = await center(page, '[data-placeable-box]')
  // It actually scrolled, and the overlay (which does NOT scroll) re-glued via syncChrome.
  expect(Math.abs(targetAfter.y - targetBefore.y)).toBeGreaterThan(50)
  expect(Math.abs(boxAfter.x - targetAfter.x)).toBeLessThan(1.5)
  expect(Math.abs(boxAfter.y - targetAfter.y)).toBeLessThan(1.5)
})

test('a ResizeObserver on the target auto-syncs the chrome size', async ({ page }) => {
  await select(page)
  const widthBefore = await page.evaluate(() => {
    const box = document.querySelector<HTMLElement>('[data-placeable-box]')
    return Number.parseFloat(box?.style.width ?? '0')
  })

  await page.evaluate(() => {
    const target = document.getElementById('target')
    if (target) target.style.width = '160px'
  })
  await flushFrames(page)

  const widthAfter = await page.evaluate(() => {
    const box = document.querySelector<HTMLElement>('[data-placeable-box]')
    return Number.parseFloat(box?.style.width ?? '0')
  })
  // 80px → 160px target, rendered at 1.5x, so the chrome box width must grow.
  expect(widthAfter).toBeGreaterThan(widthBefore + 50)
})

test('manual syncChrome() re-glues after an external idle mutation', async ({ page }) => {
  await select(page)
  await page.evaluate(() => {
    // Move the canvas ancestor's CSS `left` — the target's container-space
    // position changes but neither the target's own size nor the container's
    // size changes, so no ResizeObserver fires and no scroll event is emitted.
    // The chrome is therefore NOT auto-synced by the viewport observer.
    const canvas = document.getElementById('canvas')
    if (canvas) canvas.style.left = '250px'
  })
  await flushFrames(page)
  // Chrome is stale — the viewport observer did not fire.
  const targetMoved = await center(page, '#target')
  const boxStale = await center(page, '[data-placeable-box]')
  expect(Math.abs(boxStale.x - targetMoved.x)).toBeGreaterThan(10)

  // ...until the host reconciles explicitly.
  await page.evaluate(() => window.placeable.sync())
  await flushFrames(page)
  const boxSynced = await center(page, '[data-placeable-box]')
  expect(Math.abs(boxSynced.x - targetMoved.x)).toBeLessThan(1.5)
  expect(Math.abs(boxSynced.y - targetMoved.y)).toBeLessThan(1.5)
})

test('React does not re-render during a gesture or a scroll burst', async ({ page }) => {
  await select(page)
  const baseline = await page.evaluate(() => window.placeable.renderCount())

  // A full resize gesture.
  const se = await center(page, '[data-placeable-handle="se"]')
  await page.mouse.move(se.x, se.y)
  await page.mouse.down()
  await page.mouse.move(se.x + 100, se.y + 100, { steps: 12 })
  await page.mouse.up()
  const afterGesture = await page.evaluate(() => window.placeable.renderCount())
  expect(afterGesture).toBe(baseline)

  // A burst of scroll frames.
  for (let i = 1; i <= 6; i++) {
    await page.evaluate((top) => {
      const viewport = document.getElementById('viewport')
      if (viewport) viewport.scrollTop = top
    }, i * 20)
    await flushFrames(page)
  }
  const afterScroll = await page.evaluate(() => window.placeable.renderCount())
  expect(afterScroll).toBe(baseline)
})
