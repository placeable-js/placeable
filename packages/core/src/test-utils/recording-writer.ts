import type { TransformWriter } from '../gesture/types'
import type { Box } from '../math/types'

/**
 * A {@link TransformWriter} that records every call, so headless tests can
 * assert write cadence and lifecycle without a DOM. Not shipped.
 */
export class RecordingWriter implements TransformWriter {
  readonly applied: Box[] = []
  beginCount = 0
  restoreCount = 0
  releaseCount = 0

  begin(): void {
    this.beginCount += 1
  }

  applyBox(box: Box): void {
    this.applied.push(box)
  }

  restore(): void {
    this.restoreCount += 1
  }

  release(): void {
    this.releaseCount += 1
  }

  /** The most recently applied box, if any. */
  get last(): Box | undefined {
    return this.applied.at(-1)
  }
}
