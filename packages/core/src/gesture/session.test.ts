import { describe, expect, it } from 'vitest'
import { pixelRounding, type RoundingPolicy } from '../coords/rounding'
import { CoordinateSpace } from '../coords/space'
import { containerBox, containerPoint } from '../coords/types'
import type { Box } from '../math/types'
import { frameOf } from '../test-utils/frames'
import { noModifiers, translate } from '../test-utils/input'
import { ManualScheduler } from '../test-utils/manual-scheduler'
import { RecordingWriter } from '../test-utils/recording-writer'
import { bounds as boundsModifier } from './modifiers/bounds'
import { createResize } from './operations/resize'
import { GestureSession, type GestureSessionConfig } from './session'
import type {
  FrameScheduler,
  GestureCallbacks,
  GestureCommit,
  GestureSnapshot,
  Modifier,
} from './types'

interface Events {
  start: GestureSnapshot[]
  change: GestureSnapshot[]
  commit: GestureCommit[]
  cancel: number
}

interface SetupOptions {
  viewScale?: number
  bounds?: Box
  modifiers?: readonly Modifier[]
  rounding?: RoundingPolicy
}

function setup(options: SetupOptions = {}) {
  const space = new CoordinateSpace({
    containerOrigin: { x: 0, y: 0 },
    viewScale: options.viewScale ?? 1,
  })
  const writer = new RecordingWriter()
  const scheduler = new ManualScheduler()
  const events: Events = { start: [], change: [], commit: [], cancel: 0 }
  const callbacks: GestureCallbacks = {
    onStart: (snapshot) => events.start.push(snapshot),
    onChange: (snapshot) => events.change.push(snapshot),
    onCommit: (commit) => events.commit.push(commit),
    onCancel: () => {
      events.cancel += 1
    },
  }
  const config: GestureSessionConfig = {
    operation: translate,
    writer,
    space,
    scheduler,
    callbacks,
    ...(options.bounds !== undefined && { bounds: containerBox(options.bounds) }),
    ...(options.modifiers !== undefined && { modifiers: options.modifiers }),
    ...(options.rounding !== undefined && { rounding: options.rounding }),
  }
  return { session: new GestureSession(config), writer, scheduler, events }
}

const start: Box = { x: 10, y: 10, width: 50, height: 30, rotation: 0 }

describe('GestureSession lifecycle', () => {
  it('captures the start box and fires onStart before any write', () => {
    const { session, writer, events } = setup()
    session.begin(start, containerPoint(100, 100), noModifiers)

    expect(session.phase).toBe('active')
    expect(writer.beginCount).toBe(1)
    expect(writer.applied).toHaveLength(0)
    expect(events.start).toHaveLength(1)
    // Under the identity frame at viewScale 1, design and container coincide.
    expect(events.start[0]).toEqual({ box: start, startBox: start, container: start })
  })

  it('coalesces many updates into one write and one onChange per frame', () => {
    const { session, writer, scheduler, events } = setup()
    session.begin(start, containerPoint(100, 100), noModifiers)
    session.update(containerPoint(110, 100), noModifiers)
    session.update(containerPoint(120, 100), noModifiers)
    session.update(containerPoint(130, 100), noModifiers)

    expect(scheduler.scheduledCount).toBe(1)
    expect(scheduler.hasPending).toBe(true)
    expect(writer.applied).toHaveLength(0)

    scheduler.flush()
    expect(writer.applied).toHaveLength(1)
    expect(events.change).toHaveLength(1)
    // Reflects the latest pointer (delta 30 on x).
    expect(writer.last).toEqual({ ...start, x: 40 })
    expect(events.change[0]?.box).toEqual({ ...start, x: 40 })
    expect(events.change[0]?.container).toEqual({ ...start, x: 40 })
  })

  it('commits once on end, in design space, syncing the final write', () => {
    const { session, writer, scheduler, events } = setup()
    session.begin(start, containerPoint(100, 100), noModifiers)
    session.update(containerPoint(130, 120), noModifiers)
    scheduler.flush()
    session.end(containerPoint(130, 120), noModifiers)

    expect(events.commit).toHaveLength(1)
    expect(events.commit[0]).toEqual({
      box: { ...start, x: 40, y: 30 },
      startBox: start,
    })
    expect(writer.releaseCount).toBe(1)
    expect(writer.restoreCount).toBe(0)
    // The end pass re-applied the final box (flush + end = 2 writes here).
    expect(writer.last).toEqual({ ...start, x: 40, y: 30 })
    expect(session.phase).toBe('idle')
  })

  it('runs a final pass on end even when no frame fired, without an onChange', () => {
    const { session, writer, events } = setup()
    session.begin(start, containerPoint(100, 100), noModifiers)
    session.update(containerPoint(140, 100), noModifiers) // schedules, never flushed
    session.end(containerPoint(140, 100), noModifiers)

    expect(events.change).toHaveLength(0)
    expect(writer.applied).toHaveLength(1) // only the end write
    expect(events.commit[0]?.box).toEqual({ ...start, x: 50 })
  })

  it('cancel reverts the DOM and emits nothing to history', () => {
    const { session, writer, scheduler, events } = setup()
    session.begin(start, containerPoint(100, 100), noModifiers)
    session.update(containerPoint(130, 100), noModifiers)
    scheduler.flush()
    session.cancel()

    expect(writer.restoreCount).toBe(1)
    expect(writer.releaseCount).toBe(0)
    expect(events.cancel).toBe(1)
    expect(events.commit).toHaveLength(0)
    expect(session.phase).toBe('idle')
  })

  it('is reusable for another gesture after a commit', () => {
    const { session, events } = setup()
    session.begin(start, containerPoint(0, 0), noModifiers)
    session.end(containerPoint(10, 0), noModifiers)
    session.begin(start, containerPoint(0, 0), noModifiers)
    session.end(containerPoint(20, 0), noModifiers)

    expect(events.commit).toHaveLength(2)
    expect(events.commit[0]?.box).toEqual({ ...start, x: 20 })
    expect(events.commit[1]?.box).toEqual({ ...start, x: 30 })
  })

  it('is reusable for another gesture after a cancel', () => {
    const { session, events } = setup()
    session.begin(start, containerPoint(0, 0), noModifiers)
    session.cancel()
    session.begin(start, containerPoint(0, 0), noModifiers)
    session.end(containerPoint(5, 0), noModifiers)

    expect(events.cancel).toBe(1)
    expect(events.commit).toHaveLength(1)
  })
})

describe('GestureSession guards', () => {
  it('ignores update and end before begin', () => {
    const { session, scheduler, events } = setup()
    session.update(containerPoint(1, 1), noModifiers)
    session.end(containerPoint(1, 1), noModifiers)
    expect(scheduler.scheduledCount).toBe(0)
    expect(events.commit).toHaveLength(0)
    expect(session.phase).toBe('idle')
  })

  it('ignores a second begin while active', () => {
    const { session, events } = setup()
    session.begin(start, containerPoint(0, 0), noModifiers)
    session.begin({ ...start, x: 999 }, containerPoint(0, 0), noModifiers)
    expect(events.start).toHaveLength(1)
    expect(events.start[0]?.startBox.x).toBe(10)
  })

  it('ignores cancel when idle', () => {
    const { session, writer, events } = setup()
    session.cancel()
    expect(writer.restoreCount).toBe(0)
    expect(events.cancel).toBe(0)
  })

  it('releases the writer on destroy during a gesture and is idempotent', () => {
    const { session, writer, events } = setup()
    session.begin(start, containerPoint(0, 0), noModifiers)
    session.destroy()
    session.destroy()

    expect(writer.releaseCount).toBe(1)
    expect(events.commit).toHaveLength(0)
    expect(events.cancel).toBe(0)
    expect(session.phase).toBe('idle')
  })

  it('does not release the writer on destroy when idle', () => {
    const { session, writer } = setup()
    session.destroy()
    expect(writer.releaseCount).toBe(0)
  })

  it('ignores a frame that fires after the gesture has ended', () => {
    const space = new CoordinateSpace({ containerOrigin: { x: 0, y: 0 }, viewScale: 1 })
    const writer = new RecordingWriter()
    let captured: (() => void) | null = null
    const leaky: FrameScheduler = {
      schedule: (callback) => {
        captured = callback
      },
      cancel: () => {},
    }
    const session = new GestureSession({ operation: translate, writer, space, scheduler: leaky })
    session.begin(start, containerPoint(0, 0), noModifiers)
    session.update(containerPoint(10, 0), noModifiers)
    session.cancel()

    expect(captured).not.toBeNull()
    expect(() => captured?.()).not.toThrow()
    expect(writer.applied).toHaveLength(0)
  })
})

describe('GestureSession configuration', () => {
  it('runs with defaults and no callbacks', () => {
    const space = new CoordinateSpace({ containerOrigin: { x: 0, y: 0 }, viewScale: 1 })
    const writer = new RecordingWriter()
    const scheduler = new ManualScheduler()
    const session = new GestureSession({ operation: translate, writer, space, scheduler })

    expect(session.phase).toBe('idle')
    expect(() => {
      session.begin(start, containerPoint(0, 0), noModifiers)
      session.update(containerPoint(10, 0), noModifiers)
      scheduler.flush()
      session.end(containerPoint(10, 0), noModifiers)
      session.begin(start, containerPoint(0, 0), noModifiers)
      session.cancel()
    }).not.toThrow()
    expect(writer.releaseCount).toBe(1)
    expect(writer.restoreCount).toBe(1)
  })

  it('falls back to the rAF scheduler when none is provided', () => {
    const space = new CoordinateSpace({ containerOrigin: { x: 0, y: 0 }, viewScale: 1 })
    const session = new GestureSession({
      operation: translate,
      writer: new RecordingWriter(),
      space,
    })
    expect(session.phase).toBe('idle')
  })

  it('does not compute an onChange snapshot when no handler is set', () => {
    const space = new CoordinateSpace({ containerOrigin: { x: 0, y: 0 }, viewScale: 1 })
    const writer = new RecordingWriter()
    const scheduler = new ManualScheduler()
    const session = new GestureSession({
      operation: translate,
      writer,
      space,
      scheduler,
      callbacks: {},
    })
    session.begin(start, containerPoint(0, 0), noModifiers)
    session.update(containerPoint(10, 0), noModifiers)
    expect(() => scheduler.flush()).not.toThrow()
    expect(writer.applied).toHaveLength(1)
  })

  it('threads bounds and the modifier chain through the context', () => {
    const region: Box = { x: 0, y: 0, width: 100, height: 100, rotation: 0 }
    const { session, scheduler, events } = setup({
      bounds: region,
      modifiers: [boundsModifier],
    })
    const edge: Box = { x: 90, y: 0, width: 20, height: 20, rotation: 0 }
    session.begin(edge, containerPoint(0, 0), noModifiers)
    session.update(containerPoint(20, 0), noModifiers) // would translate to x=110
    scheduler.flush()
    session.end(containerPoint(20, 0), noModifiers)

    expect(events.commit[0]?.box.x).toBe(80) // clamped within bounds
  })

  it('applies the rounding policy to the commit but not to onChange', () => {
    const { session, scheduler, events } = setup({ rounding: pixelRounding() })
    session.begin(start, containerPoint(0, 0), noModifiers)
    session.update(containerPoint(10.6, 0), noModifiers)
    scheduler.flush()
    session.end(containerPoint(10.6, 0), noModifiers)

    expect(events.change[0]?.box.x).toBeCloseTo(20.6, 6) // live, unrounded
    expect(events.commit[0]?.box.x).toBe(21) // rounded
  })

  it('converts the commit into design space under a non-identity viewScale', () => {
    // Local boxes are container px under the identity frame; at viewScale 2 they
    // are halved into design px. A container delta of 20 is a design delta of 10.
    const { session, events } = setup({ viewScale: 2 })
    session.begin({ ...start, x: 0, y: 0 }, containerPoint(0, 0), noModifiers)
    session.end(containerPoint(20, 0), noModifiers)

    expect(events.commit[0]?.box.x).toBe(10)
    expect(events.commit[0]?.box.width).toBe(25)
  })
})

describe('GestureSession with a per-gesture matrixFrame', () => {
  it('drives a resize through a scaled frame and commits the local box', () => {
    // localFromContainer scales container→local ×2; the kernel sees local px.
    const frame = frameOf({ scale: 2 })
    const writer = new RecordingWriter()
    const scheduler = new ManualScheduler()
    const space = new CoordinateSpace({ containerOrigin: { x: 0, y: 0 }, viewScale: 1 })
    const commits: GestureCommit[] = []
    const session = new GestureSession({
      operation: createResize({ handle: 'e' }),
      writer,
      space,
      scheduler,
      callbacks: { onCommit: (commit) => commits.push(commit) },
    })

    const box: Box = { x: 0, y: 0, width: 100, height: 100, rotation: 0 }
    // The east handle sits at local (100,50) → container (50,25); drag it +20 local (+10 container).
    session.begin(box, containerPoint(50, 25), noModifiers, frame)
    session.end(containerPoint(60, 25), noModifiers)

    // Local width grows by 20 → 120; west edge fixed. Readout: container = local×0.5,
    // then design = container÷viewScale(1) → design width = 60.
    expect(commits[0]?.box.width).toBe(60)
    expect(commits[0]?.box.x).toBe(0)
  })

  it('cancels the frame zoom against a matching viewScale (Model A: design = local)', () => {
    // Model A — zoom is a CSS transform on an ancestor: the frame carries the ×2
    // rendering scale (localFromContainer ×0.5 ⇒ container = local×2) and the host
    // sets viewScale = 2, so the two cancel and design space is the unzoomed model
    // box. This is the recommended/native path and the single-source-of-scale claim.
    const frame = frameOf({ scale: 0.5 })
    const writer = new RecordingWriter()
    const scheduler = new ManualScheduler()
    const space = new CoordinateSpace({ containerOrigin: { x: 0, y: 0 }, viewScale: 2 })
    const commits: GestureCommit[] = []
    const session = new GestureSession({
      operation: createResize({ handle: 'e' }),
      writer,
      space,
      scheduler,
      callbacks: { onCommit: (commit) => commits.push(commit) },
    })

    const box: Box = { x: 0, y: 0, width: 100, height: 100, rotation: 0 }
    // East handle at local (100,50) → container (200,100); drag +40 container (+20 local).
    session.begin(box, containerPoint(200, 100), noModifiers, frame)
    session.end(containerPoint(240, 100), noModifiers)

    // Local width 100→120; container = local×2 (width 240); design = container÷2 ⇒ design = local.
    expect(commits[0]?.box.width).toBe(120)
    expect(commits[0]?.box.x).toBe(0)
  })
})
