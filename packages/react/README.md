# @placeable-js/react

Thin, SSR-safe React adapter for [`@placeable-js/core`](../core): a `useTransformController` hook and a `<TransformChrome />` overlay that add drag / resize / rotate chrome to a host-provided target.

All chrome motion is written **imperatively** by the framework-free controller, so React re-renders only when selection, visibility, or handle configuration changes — never per gesture or scroll frame.

## Install

```bash
npm install @placeable-js/react @placeable-js/core react
```

`react` (>= 18) is a peer dependency.

## Usage

```tsx
'use client'

import { TransformChrome, useTransformController } from '@placeable-js/react'
import { useRef, useState } from 'react'

function Editor() {
  const [container, setContainer] = useState<Element | null>(null)
  const targetRef = useRef<HTMLDivElement>(null)
  const chrome = useTransformController({ container })

  return (
    <div ref={setContainer} style={{ position: 'relative' }}>
      <div ref={targetRef} onPointerDown={() => chrome.setTarget(targetRef.current)} />
      <TransformChrome chrome={chrome} />
    </div>
  )
}
```

The overlay must be a sibling of the scrolled content inside a positioned container. Call `chrome.syncChrome()` after an external idle mutation the library can't observe; scroll and container/target resize are reconciled automatically.

## License

MIT — see [LICENSE](../../LICENSE) in the repository root.
