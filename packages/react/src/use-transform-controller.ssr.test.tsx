// @vitest-environment node
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTransformController } from './use-transform-controller'

vi.mock('@placeable-js/core/dom', () => ({
  // On the server the controller must never be constructed (it reads the DOM).
  createTransformController: vi.fn(() => {
    throw new Error('controller must not be created during SSR')
  }),
}))

function Chrome({ container }: { container: Element | null }) {
  const { state, chromeRef } = useTransformController({ container })
  if (!state.visible) {
    return null
  }
  return <div data-placeable-chrome ref={chromeRef} />
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('useTransformController (SSR)', () => {
  it('renders no chrome markup on the server', () => {
    const html = renderToString(<Chrome container={null} />)
    expect(html).toBe('')
  })

  it('does not warn about useLayoutEffect during server rendering', () => {
    const errors: unknown[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args)
    })
    renderToString(<Chrome container={null} />)
    spy.mockRestore()

    const layoutEffectWarning = errors.some((entry) =>
      String((entry as unknown[])[0] ?? '').includes('useLayoutEffect'),
    )
    expect(layoutEffectWarning).toBe(false)
  })
})
