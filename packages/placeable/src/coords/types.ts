import type { Box, Vec2 } from '../math/types'

declare const brand: unique symbol

/** Nominal tag attached to a structural type so spaces cannot be mixed. */
type Brand<T, B extends string> = T & { readonly [brand]: B }

/** A point in client (viewport) pixels — e.g. from a pointer event. */
export type ClientPoint = Brand<Vec2, 'client'>
/** A point in container (view) pixels — the scrollport/canvas viewport. */
export type ContainerPoint = Brand<Vec2, 'container'>
/** A point in design (model/document) pixels — independent of zoom and pan. */
export type DesignPoint = Brand<Vec2, 'design'>

/** A box in client pixels. */
export type ClientBox = Brand<Box, 'client'>
/** A box in container pixels. */
export type ContainerBox = Brand<Box, 'container'>
/** A box in design pixels. */
export type DesignBox = Brand<Box, 'design'>

/** Tags a vector as a client-space point. */
export function clientPoint(x: number, y: number): ClientPoint {
  return { x, y } as ClientPoint
}

/** Tags a vector as a container-space point. */
export function containerPoint(x: number, y: number): ContainerPoint {
  return { x, y } as ContainerPoint
}

/** Tags a vector as a design-space point. */
export function designPoint(x: number, y: number): DesignPoint {
  return { x, y } as DesignPoint
}

/** Tags a box as living in client space. */
export function clientBox(box: Box): ClientBox {
  return box as ClientBox
}

/** Tags a box as living in container space. */
export function containerBox(box: Box): ContainerBox {
  return box as ContainerBox
}

/** Tags a box as living in design space. */
export function designBox(box: Box): DesignBox {
  return box as DesignBox
}
