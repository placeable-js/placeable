# placeable

Headless DOM transform gestures for editors and interfaces.

## Packages

| npm | Description |
|-----|-------------|
| [`@placeable-js/core`](https://www.npmjs.com/package/@placeable-js/core) | Headless core + `dom` entry (pointer gesture adapter) |

```bash
npm install @placeable-js/core
```

Future: `@placeable-js/react` (React bindings).

## Repository layout

```text
packages/core/     →  @placeable-js/core   (published)
packages/react/    →  @placeable-js/react  (planned)
```

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm pack:check
```

See [RELEASING.md](./RELEASING.md) for versioning and npm publish.
