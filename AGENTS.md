# Gridline

A drawing-set workspace for construction teams in the field — and a frontend
architecture thesis about rendering, memory, and microfrontend boundaries.

## Current state

Pre-alpha. Two workspace packages exist:

- **`packages/platform`** — `@gridline/platform`. Design tokens as CSS custom
  properties, and the event bus with its zod contracts. No UI primitives yet,
  and no React dependency.
- **`apps/shell`** — `@gridline/shell`. An Rspack + React app that renders the
  chrome from the tokens. Not yet a Module Federation host.

`tools/` and `docs/` do not exist. The directory tree in `README.md` is partly
planned, so verify a path exists before referencing it.

Still to build: UI primitives in `platform`, Module Federation wiring between
shell and a remote, runtime manifest resolution, MSW, and CI.

## Commands

| Command | What it does |
|---|---|
| `pnpm install` | Install; creates workspace symlinks |
| `pnpm build` | `turbo run build` across packages |
| `pnpm dev` | All dev servers, persistent |
| `pnpm test` | Vitest per package |
| `pnpm typecheck` | `tsc --noEmit` per package |
| `pnpm lint` | Not configured yet — no-op |

`build` and `typecheck` run in 2 packages; `test` runs in `platform` only.
`pnpm dev` serves the shell on port 4100.

## Monorepo conventions

- **pnpm workspaces + Turborepo.** pnpm installs and links; Turborepo runs
  tasks and caches. Never add a competing task runner.
- **The root holds tooling only** — turbo, typescript, linters, Playwright.
  Runtime dependencies never go at the root, not even ones every app uses.
  A package that doesn't declare its own dependencies isn't independently
  deployable, which breaks the independent-deployability claim this
  architecture rests on.
- **Add deps with `pnpm --filter <pkg> add <dep>`**, `-Dw` only for root tooling.
- **Shared versions use pnpm `catalog:`** in `pnpm-workspace.yaml`, so every
  package still declares the dependency while the version lives in one place.
  This is how the React singleton policy is enforced.
- **Every package extends the root `tsconfig.json`** and adds its own
  `include`. The root config compiles nothing. A package that emits through
  `tsc` adds `outDir` and `rootDir`; an app bundled by Rspack sets `noEmit`
  instead, since the bundler owns the output and `tsc` only checks types.
- **Rspack `output.path` must stay inside `dist/`**, since `turbo.json`
  declares `outputs: ["dist/**"]`. A `remoteEntry.js` emitted outside `dist/`
  will not survive a Turborepo cache restore.

## Code layout

One file, one job. A module's public surface and its implementation are
separate files, so a reader can learn what a module offers without reading how
it works.

- **`types.ts`** holds the exported types and interfaces a module promises.
- **The implementation file** holds the code satisfying them and exports no
  types of its own.
- **`index.ts`** is the module's only entry point and re-exports both. Nothing
  outside a module imports its internals by path; the package `exports` map
  names modules, never files inside them.
- **Types derived from a runtime schema stay beside that schema.** A `z.infer`
  separated from the object it infers from is a second source of truth, which
  is the thing inference exists to prevent.

The split is by role, not by line count. A module exporting one function and no
types doesn't need a `types.ts`.

## Architecture rules

These are not open to convenience:

- **No direct imports between remotes.** The event bus in
  `@gridline/platform` is the only cross-MFE channel. No shared mutable globals.
- **Validate bus payloads with zod on publish and on receive.** A malformed
  event logs and drops; it never throws into a neighbouring remote.
- **Cross-MFE coordinates are always sheet-space**, never screen-space.
- **There is no backend.** No API server, no database, no BFF. Every network
  interaction is Mock Service Worker in the browser. If a task doesn't run in
  a browser, question whether it belongs in this repo.
- **Markup is a module inside `viewer`**, not a fifth MFE. It ships on
  viewer's cadence and has no pipeline of its own, so it fails the boundary
  test below.
- **A thing is an MFE only if it deploys on its own cadence under its own
  pipeline.** That test yields four. Not five, not six.

## Non-goals

No AI/extraction layer, no authoring, no backend, no real auth, no cloud
engineering, no multi-tenancy, no 3D. This list is load-bearing — don't
quietly widen scope past it.

## Performance claims

Every number in this repo must trace to a committed Playwright spec anyone can
re-run. **Never write a performance number into a README, ADR, or perf doc
that wasn't measured on this machine.** Leave a placeholder instead.

Budgets are CI-enforced gates, not aspirations.

## Reference material

- **Turborepo docs ship inside the installed package** — resolve with
  `node -p "require.resolve('turbo/package.json')"` and read `docs/` beside it.
  These match the installed version and need no network.
- Rspack and Module Federation 2.0 move faster than model training data. Read
  their release notes directly rather than trusting generated config.

## Working style

Changes land in small, reviewable steps. Prefer a minimal diff that can be
reasoned about over a large generated scaffold, and confirm the approach
before generating anything substantial — the architectural decisions here are
deliberate and recorded as ADRs.

State the reasoning behind a change alongside the diff, so it can be checked
rather than taken on trust.

Generate the scaffolding; own the measurements. Anything with a number
attached is done by hand.

## Commit messages

Conventional Commits, matching the existing history:

```
<type>(<scope>): <subject>

<body — optional>
```

- **type** — one of `feat`, `fix`, `perf`, `refactor`, `docs`, `test`,
  `build`, `ci`, `chore`
- **scope** — the workspace package the change belongs to (`platform`,
  `shell`, `viewer`, `navigator`, `compare`, `setgen`, `tiler`). Omit it for
  repo-wide changes, as the initial commits do.
- **subject** — lowercase, imperative mood ("add", not "added"), no trailing
  period, 72 characters or fewer
- **body** — optional, wrapped at 72. Explain *why*, not *what*; the diff
  already shows what. Include it when the reasoning isn't obvious from the
  subject.

One logical change per commit. Unrelated changes go in separate commits even
when they land in the same working tree.

---

## Tooling notes (managed)

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
