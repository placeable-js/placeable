'use client'

import { useEffect, useLayoutEffect } from 'react'

/**
 * `useLayoutEffect` in the browser, `useEffect` on the server.
 *
 * `useLayoutEffect` emits a warning when run during SSR (it cannot do anything
 * useful before paint on the server). Switching to `useEffect` when there is no
 * DOM keeps the behavior identical on the client while staying silent on the
 * server. Used only for controller lifecycle/measurement — never for node
 * binding, which uses ref callbacks.
 */
export const useIsomorphicLayoutEffect =
  typeof document !== 'undefined' ? useLayoutEffect : useEffect
