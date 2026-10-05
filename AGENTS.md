# Gridline

A drawing-set workspace for construction teams in the field — and a frontend
architecture thesis about rendering, memory, and microfrontend boundaries.

## Current state

Pre-alpha. The workspace packages:

- **`packages/platform`** — `@gridline/platform`. Design tokens as CSS custom
  properties, the event bus with its zod contracts, and the UI primitives under
  `./ui` with their stylesheet at `./ui.css`. Takes React, so that the
  primitives can be components; the version comes from the catalog like every
  other copy.
- **`apps/shell`** — `@gridline/shell`. Rspack + React. Renders the chrome from
  the tokens and is the Module Federation host. Loads the viewer's sheet surface,
  the navigator and compare at runtime, and shows active-sheet state published
  on the bus. Owns which of them is on screen: the rail's "Sheet index" opens
  the full-screen grid, any `compare:request` opens compare (from whoever
  publishes it), any `sheet:open` or `compare:closed` switches back to
  the drawing, and the address follows, so Back returns to where you were.
  In compare, the top bar carries the compare title and Exit (also Esc), and
  the rail's "Compare revisions" item is active: leaving is the shell's call.
  Rail items are destinations, not toggles: pressing the one you are on does
  nothing. The sheet stepper in the top
  bar shows only with the drawing.
- **`apps/viewer`** — `@gridline/viewer`. The first remote. Exposes
  `./SheetSurface` and also runs standalone on port 4101. A sheet opens at
  its latest revision, which the viewer reads from the sheet index rather
  than being told; the full-page renderer draws the combined PDF, the set as
  first issued, and says REV 1.
- **`apps/navigator`** — `@gridline/navigator`. The second remote. Exposes
  `./SetNavigator` with two layouts: `grid`, the whole set full-screen
  (`?view=sheets` in the shell), and `panel`, beside the drawing. Runs standalone
  on port 4102 in the grid layout. The grid is virtualised: only the rows near
  the viewport are in the DOM. `?grid=full` draws every card instead, kept as
  the measured baseline. Cards show each sheet's level-0 tile as a thumbnail,
  loaded only while on screen; `?thumbs=0` turns them off. A toggle per
  discipline filters the grid. The panel is the same virtual grid in one
  column of rows, marking the sheet the viewer last painted. In both, a click
  publishes `sheet:open`. On the full-screen grid, arrows and Home/End move
  between sheets as soon as it loads, and Enter opens one; beside a drawing,
  Shift+Up and Shift+Down open the previous and next sheet from anywhere on
  the page. Thumbnails show the latest revision. A reissued sheet carries a
  badge with that revision, and the badge is a button that publishes
  `compare:request` for REV 1 against it.
- **`apps/compare`** — `@gridline/compare`. The third remote. Exposes
  `./SheetCompare`, given a sheet and two revisions as props. The shell shows
  it at `?view=compare&sheet=A-131&from=1&to=3`, in the body beside the rail.
  Owns everything below the shell's top bar: the FROM → TO revision bar, a
  header strip per pane with its zoom, the lock pill over the seam, and the
  bottom zoom bar. The FROM and TO chips are pickers once the sheet index says
  how many revisions exist; choosing publishes `compare:request` again. It can also leave by publishing `compare:closed`, after
  which the shell shows that sheet's drawing. Runs standalone on port 4103.
  Draws the two revisions side by side from their tile pyramids. The panes
  are locked by default, so a drag or wheel in either moves both; "Panes
  unlocked" lets each move on its own, and locking again brings the other
  pane to the one moved last. L toggles; holding Shift unlocks until released. It has its own
  small tile renderer rather than the viewer's: one level at a time per pane,
  over level 0, with no cache budget.
- **`tools/setgen`** — `@gridline/setgen`. Generates the synthetic drawing set the
  rendering work is measured against: 1,500 ARCH E1 sheets as vector PDFs, seeded
  so the set regenerates byte for byte. Plain Node, run locally, never in the
  browser. 51 of those sheets are reissued once or twice, with a few localized
  edits each, so Compare has differences to find. A reissue is written beside
  its sheet (`A-101.r2.pdf`, tiles under `A-101/r2/`), so revision 1 keeps its
  paths and its bytes, and the set checksum is unchanged.

The shell holds no remote addresses. It reads `public/remotes.json` at startup and
registers remotes at runtime, so the build contains no remote URL.

`tools/` holds `serve.mjs`, `setgen/` and `tiler/`; `docs/` holds `perf/` only — there are
no ADRs yet. The directory tree in `README.md` is partly planned, so verify a
path exists before referencing it.

Independent deployment is demonstrated rather than claimed: the measured
checksums are in `README.md`, and the procedure re-runs in about a minute.

Still to build: a pipeline per app, revision diffing in the compare remote, and the
primitives the navigator needs — the set in `platform` today is the one the
viewer calls, not a full library.

## Commands

| Command | What it does |
|---|---|
| `pnpm install` | Install; creates workspace symlinks |
| `pnpm build` | `turbo run build` across packages |
| `pnpm dev` | All dev servers, persistent |
| `pnpm serve` | Serve each app's built `dist/` as a static host would |
| `pnpm test` | Vitest per package |
| `pnpm setgen` | Generate the synthetic drawing set into `data/sets/v1` |
| `pnpm perf` | Playwright performance specs against the running static servers |
| `pnpm typecheck` | `tsc --noEmit` per package |
| `pnpm lint` | Not configured yet — no-op |

`build` and `typecheck` run in 5 packages; `test` runs in `compare`, `navigator`,
`platform`, `setgen`, `tiler` and `viewer`. `pnpm setgen` is not a Turborepo task — it is run by hand, writes
outside any package's `dist/`, and takes about 20 seconds, so it has no business
in a build graph.

`pnpm dev` serves the shell on 4100, the viewer on 4101, the navigator on
4102 and compare on 4103. Each remote gets its own port, assigned in its `rspack.config.ts`.
`pnpm serve` adds the generated sheet set on 4200, served by `@gridline/setgen` —
a separate origin, because in production drawing data comes from a CDN rather
than from an app's own origin.

`pnpm serve` runs every server under one Turborepo task, and stopping any one of
them stops them all. To take a single remote down for the degradation check,
serve the others by name instead:
`pnpm --filter @gridline/shell --filter @gridline/viewer --filter @gridline/setgen --parallel run serve`.

`pnpm perf` needs `pnpm build && pnpm serve` already running and never starts a
server itself, for the same reason `serve` never triggers a build: a spec that
built its own target could measure bytes nobody has looked at.

The session spec takes two shapes, and they answer different questions rather
than one being a weaker version of the other. `PERF_WALK=stride` (the default)
visits every thirtieth sheet, defeating locality so nothing scores well by
accident. `PERF_WALK=sequential` reads neighbouring sheets in order, which is how
a drawing set is actually read and the only walk that can judge anything built to
exploit locality. **A feature aimed at one cannot be graded by the other** — the
gates in `budgets.ts` were all taken from the stride walk, and the spec asserts
them on that walk alone. `PERF_PREFETCH=0` turns off reading ahead, so the
before/after is two runs rather than a checkout.

`pnpm serve` runs `tools/serve.mjs` against each app's `dist/` on those same
ports, so the remote lookup needs no second copy — the cost is that `dev` and
`serve` cannot run at once. It requires a build first and deliberately never
triggers one, so nothing rebuilds while a claim about the built bytes is being
checked.

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

## Design tokens

Apps never write a raw length. They reference tokens from
`@gridline/platform/tokens.css`, so a value can be corrected in one place.

Units in the token files split on one question: does the value size text and the
space around it, or does it guarantee a physical dimension?

- **Text-relative → `rem`.** The type scale, the spacing scale, and panel
  widths, so the UI honours a raised browser text size.
- **Line heights are unitless ratios**, resolved against the element's own
  font size rather than the step they were authored for.
- **Physical → `px`.** Touch targets are the large group here: 44px is a
  gloved-hand minimum, and a finger does not shrink because someone prefers
  smaller text, so a target expressed in `rem` can fall below its own floor.
  Treat control heights as `min-height`, not `height`. Hairlines, border and
  focus widths, radii, shadow geometry, and scrollbars are also `px` — a 1px
  rule scaled to 1.3px renders as a blur.

Token values carry their px equivalent in a comment, so any of them can still be
checked against the design mockups.

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
- **MSW runs in production, not only in development.** This inverts MSW's own
  guidance and will read as a mistake to anyone who knows the library. It is
  correct here: MSW is not standing in for a server that exists elsewhere, it *is*
  the network layer, so gating it to development would leave the production build
  with no network at all. Do not "fix" it by adding an environment check.
- **Nothing may block the first render indefinitely.** Startup work — the mock
  network, the remote lookup — is bounded and allowed to fail. A service worker
  registration that never settles has to be timed out, not awaited, or a browser
  that refuses service workers gets a blank page. Same rule as an unreachable
  remote: degrade, never hang.
- **Deployment data belongs in files, not in bundles.** The remote lookup is a
  static JSON file on the shell's origin, so a remote's address can change without
  the shell being rebuilt. Generating it from application code — an MSW handler,
  say — puts the addresses back inside the bundle and quietly restores the
  coupling. Validate it on read like any other network payload.
- **Markup is a module inside `viewer`**, not a fifth MFE. It ships on
  viewer's cadence and has no pipeline of its own, so it fails the boundary
  test below.
- **A thing is an MFE only if it deploys on its own cadence under its own
  pipeline.** That test yields four. Not five, not six.
- **Federation claims are verified against a static server, never the dev
  server.** A dev server is a build tool that also answers HTTP: it rebuilds,
  injects hot-reload code, and applies headers configured under `devServer`, none
  of which exist in a deployed build. The viewer's
  `Access-Control-Allow-Origin` lives there, so cross-origin loading passes under
  `pnpm dev` and fails when deployed, with nothing in the build reporting it. Run
  `pnpm build && pnpm serve` before believing any result. The server stays
  dependency-free on purpose — a server framework restores the conveniences a
  static host would not provide, which is the thing being tested for.
- **A remote that is unreachable must never stop the shell rendering.** Every
  remote slot handles its own load failure, so the failure stays inside that
  slot. Verify it by stopping a remote's server and reloading the shell — the
  chrome must still render. This is claim P5 and it is easy to break by
  accident, because the shell keeps working while the remote is up.
- **Never point a declared remote at `mf-manifest.json`.** The runtime fetches a
  declared manifest during federation init, init gates the entry's async
  boundary, and an unreachable remote then leaves the page empty before React
  starts — with no error any boundary can catch. Declared remotes use a
  `remoteEntry.js` entry, which resolves on first use. Manifests are for remotes
  registered at runtime, after the shell has rendered.
- **A remote's container global must not shadow a browser global.** The
  container is published on `window` under the remote's name unless `library`
  says otherwise, so a remote named `navigator` reads back the browser's
  Navigator object and fails with RUNTIME-002 ("does not contain init"). The
  build reports success. Set `library: { type: "global", name: "gridline_<name>" }`
  whenever the name collides; the remote's name itself does not change.
- **Only modules that hold state in module scope are federation singletons.**
  The bus is shared because it keeps its subscriber map there, and two copies
  are two unconnected mailboxes. UI primitives hold no state, so each app
  bundles its own copy — duplication costs bytes, while sharing them would make
  every primitive a version agreement four apps have to land together. Share the
  minimum; a shared library is a coordinated release.
- **Chrome ownership follows the deploy-cadence test, not visual position.** A
  control drawn over the viewer's canvas can still belong to the shell, and the
  question that settles it is whether adding a feature to one app would force
  another to ship. The viewer's tools are in the canvas overlay it owns; the
  shell's rail launches other apps and so never changes when a viewer tool is
  added. A screen mockup composes all four apps at once and respects none of
  these boundaries — split it by owner before building from it.
- **Shared modules must name subpaths explicitly.** `shared` matches the import
  as written, so `react-dom` does not cover `react-dom/client`, and a package
  does not cover its own subpaths. Use a trailing-slash prefix key. Getting this
  wrong duplicates a dependency that was declared a singleton, and nothing
  reports an error — for the bus it means two mailboxes and events that silently
  never arrive.

## Non-goals

No AI/extraction layer, no authoring, no backend, no real auth, no cloud
engineering, no multi-tenancy, no 3D. This list is load-bearing — don't
quietly widen scope past it.

## Performance claims

Every number in this repo must trace to a committed Playwright spec anyone can
re-run. **Never write a performance number into a README, ADR, or perf doc
that wasn't measured on this machine.** Leave a placeholder instead.

Budgets are gates, not aspirations, and they live in `tests/perf/budgets.ts`.
Each one is a measurement from this machine plus headroom, never a figure
somebody hoped for — a gate catches a change for the worse, so it can only be
set from a known-good reading. They are asserted by the perf specs and run by
hand today; there is no pipeline running them yet. Only the optimised renderer
is graded: the naive one ships permanently for comparison and fails every gate
by construction.

Three further rules, each learned from a gate that was wrong:

- **A gate set from a median is wrong when the spread is wider than the
  headroom.** Set it from the worst reading instead, or it fails on a good day.
- **A gate on a bimodal measurement is a gate on a gap where nothing happens.**
  Anything served from a cache is bimodal — hit or miss, with nothing in between
  — so grade the *share* that hits rather than the average of both. A median
  gate also cannot catch the regression that matters, because losing the cache
  entirely moves the median to the slow population, which any tolerant budget
  already allows.
- **A gate nobody has seen fail is a decoration.** Before trusting a new one,
  break the thing it guards and watch it trip.

Readings are written to `perf-results/`, never `test-results/`: Playwright
empties its own output directory at the start of every run, so results written
there are destroyed by the next spec.

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
