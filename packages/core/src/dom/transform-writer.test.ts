import { describe, expect, it } from 'vitest'
import { DomTransformWriter } from './transform-writer'

interface FakeStyle {
  proxy: CSSStyleDeclaration
  values: Record<string, string>
  writes: Record<string, number>
}

function fakeStyle(initial: Record<string, string> = {}): FakeStyle {
  const values: Record<string, string> = {
    transform: '',
    transformOrigin: '',
    width: '',
    height: '',
    willChange: '',
    ...initial,
  }
  const writes: Record<string, number> = {}
  const proxy = new Proxy(values, {
    set(target, prop: string, value: string) {
      target[prop] = value
      writes[prop] = (writes[prop] ?? 0) + 1
      return true
    },
  }) as unknown as CSSStyleDeclaration
  return { proxy, values, writes }
}

function elementWith(style: CSSStyleDeclaration): HTMLElement {
  return { style } as unknown as HTMLElement
}

describe('DomTransformWriter', () => {
  it('promotes and normalises the element on begin', () => {
    const style = fakeStyle()
    new DomTransformWriter(elementWith(style.proxy)).begin()
    expect(style.values.willChange).toBe('transform')
    expect(style.values.transformOrigin).toBe('50% 50%')
  })

  it('writes position and rotation through a single transform string', () => {
    const style = fakeStyle()
    const writer = new DomTransformWriter(elementWith(style.proxy))
    writer.begin()
    writer.applyBox({ x: 10, y: 20, width: 50, height: 30, rotation: Math.PI / 2 })
    expect(style.values.transform).toBe('translate(10px, 20px) rotate(90deg)')
    expect(style.values.width).toBe('50px')
    expect(style.values.height).toBe('30px')
  })

  it('converts radians to degrees exactly at the cardinal angles', () => {
    const style = fakeStyle()
    const writer = new DomTransformWriter(elementWith(style.proxy))
    writer.begin()
    writer.applyBox({ x: 0, y: 0, width: 1, height: 1, rotation: 0 })
    expect(style.values.transform).toContain('rotate(0deg)')
    writer.applyBox({ x: 0, y: 0, width: 1, height: 1, rotation: Math.PI })
    expect(style.values.transform).toContain('rotate(180deg)')
    writer.applyBox({ x: 0, y: 0, width: 1, height: 1, rotation: Math.PI / 4 })
    expect(style.values.transform).toContain('rotate(45deg)')
  })

  it('skips redundant width/height writes', () => {
    const style = fakeStyle()
    const writer = new DomTransformWriter(elementWith(style.proxy))
    writer.begin()
    writer.applyBox({ x: 0, y: 0, width: 50, height: 30, rotation: 0 })
    writer.applyBox({ x: 5, y: 5, width: 50, height: 30, rotation: 0 }) // same size
    writer.applyBox({ x: 5, y: 5, width: 60, height: 30, rotation: 0 }) // width changes

    expect(style.writes.width).toBe(2)
    expect(style.writes.height).toBe(1)
    expect(style.writes.transform).toBe(3) // transform written every frame
  })

  it('restores the exact pre-gesture inline style on cancel', () => {
    const style = fakeStyle({
      transform: 'rotate(5deg)',
      transformOrigin: '0 0',
      width: '5px',
      height: '6px',
      willChange: 'auto',
    })
    const writer = new DomTransformWriter(elementWith(style.proxy))
    writer.begin()
    writer.applyBox({ x: 99, y: 99, width: 99, height: 99, rotation: 0 })
    writer.restore()

    expect(style.values).toMatchObject({
      transform: 'rotate(5deg)',
      transformOrigin: '0 0',
      width: '5px',
      height: '6px',
      willChange: 'auto',
    })
  })

  it('drops the promotion but keeps the box on release', () => {
    const style = fakeStyle({ willChange: 'auto' })
    const writer = new DomTransformWriter(elementWith(style.proxy))
    writer.begin()
    writer.applyBox({ x: 7, y: 8, width: 50, height: 30, rotation: 0 })
    writer.release()

    expect(style.values.willChange).toBe('auto')
    expect(style.values.transform).toBe('translate(7px, 8px) rotate(0deg)')
  })

  it('treats restore/release as no-ops outside a gesture', () => {
    const style = fakeStyle()
    const writer = new DomTransformWriter(elementWith(style.proxy))
    expect(() => writer.restore()).not.toThrow()
    expect(() => writer.release()).not.toThrow()
    expect(style.writes.transform).toBeUndefined()

    writer.begin()
    writer.release()
    expect(() => writer.restore()).not.toThrow() // snapshot already cleared by release
  })
})
