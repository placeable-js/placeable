# Releasing

Packages publish under the **`@placeable-js`** scope (e.g. `@placeable-js/core` from `packages/core/`).

## One-time setup

1. **npm**: Ensure the `placeable-js` org can publish `@placeable-js/*` (scoped packages are public via `publishConfig` and root `.npmrc`).
2. **GitHub**: Add repository secret **`NPM_TOKEN`** — an npm granular access token with publish rights for the `placeable-js` org (or automation token with publish). The Release workflow maps it to **`NODE_AUTH_TOKEN`** for `setup-node` (required for `npm publish` in CI).

   **If publish fails with `E404` on `@placeable-js/core`:** usually missing/invalid token in CI, or the npm user/token cannot publish to scope `@placeable-js`. Confirm the [npm org `placeable-js`](https://www.npmjs.com/org/placeable-js) exists, you are a member with publish rights, and the token has **Read and write** on that org/scope (enable **Bypass 2FA** for automation if needed).
3. **Legacy name**: The old unscoped [`placeable`](https://www.npmjs.com/package/placeable) placeholder should be deprecated on npm once `@placeable-js/core` is live, with a message pointing to `@placeable-js/core`.

## Day-to-day

1. After user-facing changes, from the repo root:
   ```bash
   pnpm changeset
   ```
   Commit the generated file under `.changeset/`.

2. Merge to **`main`**. The [Release workflow](.github/workflows/release.yml) will either:
   - open a **Version packages** PR (bumps versions + changelogs), or
   - run **`pnpm release`** and publish to npm when that PR is merged.

## Manual release (local)

```bash
pnpm changeset          # if you have not yet added a changeset
pnpm version-packages   # bump versions + CHANGELOG
pnpm release            # build, test, npm publish
```

Requires `npm login` with publish access to `@placeable-js`.
