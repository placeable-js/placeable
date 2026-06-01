import { applyToPoint, multiply, scaling, translation } from '../math/matrix'
import type { Box, Matrix, Vec2 } from '../math/types'
import {
  type ClientBox,
  type ClientPoint,
  type ContainerBox,
  type ContainerPoint,
  clientBox,
  clientPoint,
  containerBox,
  containerPoint,
  type DesignBox,
  type DesignPoint,
  designBox,
  designPoint,
} from './types'

/** Inputs that define how the three coordinate spaces relate. */
export interface CoordinateSpaceConfig {
  /** Client-space coordinates of the container element's top-left corner. */
  readonly containerOrigin: Vec2
  /** Uniform zoom: design px → view px. Must be greater than zero. */
  readonly viewScale: number
  /** Container-space offset of the design origin (pan). Defaults to `(0, 0)`. */
  readonly pan?: Vec2
}

function scaleBox(box: Box, position: Vec2, factor: number): Box {
  return {
    x: position.x,
    y: position.y,
    width: box.width * factor,
    height: box.height * factor,
    rotation: box.rotation,
  }
}

/**
 * Converts points and boxes between the `client → container → design` spaces.
 *
 * The relationship is `container = client - containerOrigin` and
 * `container = design * viewScale + pan`. Built once from measured inputs;
 * it performs no DOM reads itself — the adapter feeds it measured values.
 */
export class CoordinateSpace {
  readonly #viewScale: number
  readonly #containerFromClient: Matrix
  readonly #clientFromContainer: Matrix
  readonly #designFromContainer: Matrix
  readonly #containerFromDesign: Matrix

  constructor(config: CoordinateSpaceConfig) {
    const { containerOrigin, viewScale } = config
    if (!(viewScale > 0)) {
      throw new RangeError(`CoordinateSpace: viewScale must be > 0 (received ${viewScale})`)
    }
    const pan = config.pan ?? { x: 0, y: 0 }

    this.#viewScale = viewScale
    this.#containerFromClient = translation(-containerOrigin.x, -containerOrigin.y)
    this.#clientFromContainer = translation(containerOrigin.x, containerOrigin.y)
    this.#designFromContainer = multiply(scaling(1 / viewScale), translation(-pan.x, -pan.y))
    this.#containerFromDesign = multiply(translation(pan.x, pan.y), scaling(viewScale))
  }

  /** The active zoom factor (design px → view px). */
  get viewScale(): number {
    return this.#viewScale
  }

  clientToContainer(p: ClientPoint): ContainerPoint {
    const r = applyToPoint(this.#containerFromClient, p)
    return containerPoint(r.x, r.y)
  }

  containerToClient(p: ContainerPoint): ClientPoint {
    const r = applyToPoint(this.#clientFromContainer, p)
    return clientPoint(r.x, r.y)
  }

  containerToDesign(p: ContainerPoint): DesignPoint {
    const r = applyToPoint(this.#designFromContainer, p)
    return designPoint(r.x, r.y)
  }

  designToContainer(p: DesignPoint): ContainerPoint {
    const r = applyToPoint(this.#containerFromDesign, p)
    return containerPoint(r.x, r.y)
  }

  clientToDesign(p: ClientPoint): DesignPoint {
    return this.containerToDesign(this.clientToContainer(p))
  }

  designToClient(p: DesignPoint): ClientPoint {
    return this.containerToClient(this.designToContainer(p))
  }

  clientToContainerBox(b: ClientBox): ContainerBox {
    const position = applyToPoint(this.#containerFromClient, { x: b.x, y: b.y })
    return containerBox(scaleBox(b, position, 1))
  }

  containerToClientBox(b: ContainerBox): ClientBox {
    const position = applyToPoint(this.#clientFromContainer, { x: b.x, y: b.y })
    return clientBox(scaleBox(b, position, 1))
  }

  containerToDesignBox(b: ContainerBox): DesignBox {
    const position = applyToPoint(this.#designFromContainer, { x: b.x, y: b.y })
    return designBox(scaleBox(b, position, 1 / this.#viewScale))
  }

  designToContainerBox(b: DesignBox): ContainerBox {
    const position = applyToPoint(this.#containerFromDesign, { x: b.x, y: b.y })
    return containerBox(scaleBox(b, position, this.#viewScale))
  }
}
