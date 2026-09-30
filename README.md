# Gridline

A drawing-set workspace for construction teams in the field.

A construction project ships with 1,500–2,000 large-format drawing sheets. On site, a superintendent needs to open the current revision of a specific sheet, see what changed since they last looked, and mark it up — usually on a tablet, usually on bad connectivity. Gridline is a frontend architecture thesis built around that problem.

## Architecture

Four microfrontends composed at runtime via Rspack Module Federation 2.0:

- **Shell** — routing, layout, federation manifest resolution, offline banner
- **Viewer** — tile-based canvas rendering of a single sheet with pan/zoom and markup overlay
- **Navigator** — virtualized thumbnail grid over the full drawing set with discipline filters
- **Compare** — revision diff with dual tile pyramids, onion-skin blend, and sync-zoom

Remotes communicate exclusively through a zod-validated event bus in the shared platform package. No direct imports between remotes, no shared mutable globals.

## Independent deployment, demonstrated

"Independently deployable" is the claim this architecture rests on, so it is measured rather than asserted. The shell holds no remote addresses: it reads them from a static `remotes.json` on its own origin at startup and registers remotes at runtime, after it has rendered.

Two consequences follow, and both are checkable by hand.

**A remote can be rebuilt without the host being rebuilt.**

```bash
pnpm build
find apps/shell/dist -type f | sort | xargs shasum -a 256 | shasum -a 256

# change something in apps/viewer, then rebuild that app alone
turbo run build --filter=@gridline/viewer

find apps/shell/dist -type f | sort | xargs shasum -a 256 | shasum -a 256
```

Measured on this machine, 2026-09-29, over three consecutive viewer builds:

```
shell/dist   before  fdf22dc7ba3d372fcafd30839ab93a7b15feaebb991dc407d2e26160b5c2751c
shell/dist   after   fdf22dc7ba3d372fcafd30839ab93a7b15feaebb991dc407d2e26160b5c2751c

viewer/dist  before  f7b4dfecebf3de711e9298f126a9b94b53181e96db41bde692ce4a093ee2eeff
viewer/dist  after   8ef18bb5f50962477ba055e440dcf72f208b5d4cac35ee12bf7126ff3be2c833
```

Reloading the shell served those identical bytes and rendered the new viewer, with shared-bus state still arriving from it.

**A remote can be replaced with no build at all.**

With a second viewer build served on another port, editing the deployed `remotes.json` and reloading is sufficient — no bundler runs. The shell's JavaScript is byte-identical across the swap:

```
shell/dist, excluding remotes.json   41ee0066d3ee51d61122a2150ac3913d4f6ef0b57e73c11967e6721086b03b41
```

Only the data file differs, which is the point: addresses are deployment data, not compiled code. A remote's location can change without the host being rebuilt or redeployed.

Both properties are verified against `pnpm serve`, a dependency-free static file server over each app's `dist/`, rather than a dev server. A dev server applies headers and conveniences that a static host does not, so results from one do not transfer to the other.

## Stack

| Concern | Choice |
|---------|--------|
| Framework | React 19 + TypeScript (strict) |
| Federation | Rspack Module Federation 2.0 |
| Rendering | Canvas 2D + OffscreenCanvas |
| PDF parse | pdf.js in a dedicated worker |
| State | Zustand (per-MFE) + shared platform store |
| Styling | Tailwind + CSS custom properties from platform |
| Persistence | IndexedDB for tiles, markups, sheet index |
| Network | Mock Service Worker (MSW) — no backend |
| Input | Hand-rolled gesture layer over Pointer Events |
| Testing | Vitest (unit) + Playwright (e2e + perf traces) |

## No backend — by design

There is no API server, no database, no BFF. All network interactions are mocked in-browser with MSW. This isn't a shortcut — it lets us script the exact conditions the performance claims depend on: 3G latency, tile failure rates, mid-session disconnects. The measurements are more reproducible than they would be against a real server.

## Project structure

```
gridline/
├─ packages/platform/    # @gridline/platform — tokens, UI primitives, event bus, stores
├─ apps/
│  ├─ shell/             # Host app
│  ├─ viewer/            # Sheet rendering remote
│  ├─ navigator/         # Set browsing remote (planned)
│  └─ compare/           # Revision diff remote (planned)
├─ tools/
│  ├─ serve.mjs          # Static file server for the production builds
│  ├─ setgen/            # Synthetic drawing-set generator
│  └─ tiler/             # PDF → tile pyramid pipeline (planned)
└─ docs/adr/             # Architecture decision records (planned)
```

Entries marked planned do not exist yet.

## The test data is generated, and regenerates identically

Rendering claims are only comparable if every run measures the same document, so the drawing set is generated rather than sampled, and generated deterministically.

```bash
pnpm setgen
# 1500 sheets, 42.2 MB, ~20s
# set checksum b95b5f468d12b08a5bbb9d78ac394c8ad54ee6cdd36fc8bff0a66fcfe76739be
```

`tools/setgen` produces 1,500 ARCH E1 sheets (30 × 42 in) as vector PDFs — column grids, subdivided floor plates, hatching, room tags, dimension strings and a ruled title block, at a density that is non-trivial to rasterize. Sheet numbering follows discipline convention: `A-101`, `AD-201`, `S-304`, `M-412`, `E-508`.

Each sheet is drawn from a generator seeded by its own sheet number, not from one stream shared across the run. Regenerating a single sheet therefore reproduces exactly the bytes the full run wrote, so generation can be partial without changing the set. Every timestamp the PDF writer would otherwise take from the clock is pinned, since one unpinned date makes a checksum record when a run happened rather than what it produced.

The output is not committed — the seed is the reproducibility mechanism, so the set is regenerated rather than carried in git. The set checksum above is one hash over all 1,500 per-sheet checksums, taken in sheet-number order: comparing that single line is comparing the whole set.

## Status

Pre-alpha. The platform package ships design tokens and the event bus. The shell renders its chrome from those tokens and composes the viewer remote at runtime over Module Federation, with active-sheet state crossing the bus between them. Both apps run from their production builds on separate origins. The synthetic drawing set generates.

Sheet rendering itself — the tile pyramid, the worker-confined parse, the gesture layer — is next. The navigator and compare remotes, UI primitives, and per-app deployment pipelines are not built yet.

## License

MIT
