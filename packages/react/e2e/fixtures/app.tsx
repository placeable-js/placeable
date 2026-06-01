import { TransformChrome, useTransformController } from '@placeable-js/react'
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

interface BoxLike {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

interface Harness {
  commits: Array<{ box: BoxLike; startBox: BoxLike }>
  renderCount: () => number
  select: () => void
  clear: () => void
  sync: () => void
}

// Module-level so the harness can read them without re-rendering the tree.
const commits: Harness['commits'] = []
let renderCount = 0

function App() {
  const [container, setContainer] = useState<Element | null>(null)
  const targetRef = useRef<HTMLDivElement>(null)
  const api = useTransformController({
    container,
    callbacks: {
      onCommit: (commit) => {
        commits.push({ box: { ...commit.box }, startBox: { ...commit.startBox } })
      },
    },
  })

  // Counts every App render. The hot paths (gesture, scroll) are imperative, so
  // this must stay flat through a drag and a scroll burst — the perf contract.
  renderCount += 1

  useEffect(() => {
    const harness: Harness = {
      commits,
      renderCount: () => renderCount,
      select: () => api.setTarget(targetRef.current),
      clear: () => api.setTarget(null),
      sync: () => api.syncChrome(),
    }
    const w = window as unknown as { placeable: Harness; placeableReady: boolean }
    w.placeable = harness
    w.placeableReady = true
  })

  return (
    <div id="stage" style={{ position: 'relative', width: 700, height: 520 }}>
      <div
        id="viewport"
        ref={setContainer}
        style={{
          position: 'relative',
          width: 700,
          height: 520,
          overflow: 'auto',
          background: '#f4f4f5',
          border: '1px solid #d4d4d8',
        }}
      >
        {/* Tall scrolled content so the viewport actually scrolls. */}
        <div id="content" style={{ position: 'relative', width: 1200, height: 1600 }}>
          {/* A transformed ancestor: uniform 1.5x zoom + 30deg rotation. */}
          <div
            id="canvas"
            style={{
              position: 'absolute',
              left: 200,
              top: 150,
              transform: 'rotate(30deg) scale(1.5)',
              transformOrigin: '0 0',
            }}
          >
            <div
              id="target"
              ref={targetRef}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: 80,
                height: 40,
                background: '#2563eb',
                touchAction: 'none',
              }}
            />
          </div>
        </div>
      </div>
      {/* The chrome overlay is a sibling of the scroll viewport (container space),
          so it does NOT scroll with the content — syncChrome must re-glue it. */}
      <TransformChrome chrome={api} />
    </div>
  )
}

const rootEl = document.getElementById('root')
if (rootEl !== null) {
  createRoot(rootEl).render(<App />)
}
