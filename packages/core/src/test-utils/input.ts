import { createDrag } from '../gesture/operations/drag'
import type { GestureOperation, ModifierKeys } from '../gesture/types'

/** All modifier keys released — the common case for synthetic input. */
export const noModifiers: ModifierKeys = { shift: false, alt: false, meta: false, ctrl: false }

/**
 * Translate operation used to exercise the session pipeline end-to-end. Backed
 * by the shipped {@link createDrag} kernel. Not shipped.
 */
export const translate: GestureOperation = createDrag()
