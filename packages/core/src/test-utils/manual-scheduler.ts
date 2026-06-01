import type { FrameScheduler } from '../gesture/types'

/**
 * A {@link FrameScheduler} that holds the pending callback until `flush` is
 * called, so tests can drive frames synchronously and assert coalescing.
 * Not shipped.
 */
export class ManualScheduler implements FrameScheduler {
  #pending: (() => void) | null = null
  #scheduledCount = 0

  schedule(callback: () => void): void {
    this.#pending = callback
    this.#scheduledCount += 1
  }

  cancel(): void {
    this.#pending = null
  }

  /** Runs the pending frame, if any. */
  flush(): void {
    const callback = this.#pending
    this.#pending = null
    if (callback !== null) {
      callback()
    }
  }

  /** Number of `schedule` calls observed (to assert per-frame coalescing). */
  get scheduledCount(): number {
    return this.#scheduledCount
  }

  /** Whether a frame is currently pending. */
  get hasPending(): boolean {
    return this.#pending !== null
  }
}
