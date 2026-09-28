# Gridline

A drawing-set workspace for construction teams in the field.

A construction project ships with 1,500–2,000 large-format drawing sheets. On site, a superintendent needs to open the current revision of a specific sheet, see what changed since they last looked, and mark it up — usually on a tablet, usually on bad connectivity. Gridline is a frontend architecture thesis built around that problem.

## What this project proves

| # | Claim | How |
|---|-------|-----|
| P1 | Large document rendering without blocking the main thread | Tile pyramid + worker-based PDF parse, measured frame times |
| P2 | Bounded memory over an unbounded dataset | Explicit budget + LRU eviction, live perf panel |
| P3 | Virtualized large collections, not just large items | Set Navigator over 2,000 sheets at 60fps |
| P4 | Independently deployed frontends with a real contract | 4 separate pipelines, versioned event bus |
| P5 | Graceful degradation, not collapse | MFE kill-switch demo, offline mode |
| P6 | Knowing when *not* to add an MFE | ADRs, Markup deliberately left as a module |

## Architecture

Four microfrontends composed at runtime via Rspack Module Federation 2.0:

- **Shell** — routing, layout, federation manifest resolution, offline banner
- **Viewer** — tile-based canvas rendering of a single sheet with pan/zoom and markup overlay
- **Navigator** — virtualized thumbnail grid over the full drawing set with discipline filters
- **Compare** — revision diff with dual tile pyramids, onion-skin blend, and sync-zoom

Remotes communicate exclusively through a zod-validated event bus in the shared platform package. No direct imports between remotes, no shared mutable globals.

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
│  ├─ navigator/         # Set browsing remote
│  └─ compare/           # Revision diff remote
├─ tools/
│  ├─ setgen/            # Synthetic drawing-set generator
│  └─ tiler/             # PDF → tile pyramid pipeline
└─ docs/adr/             # Architecture decision records
```

## Status

Pre-alpha. Monorepo foundations in place; workspace packages are being added incrementally.

## License

MIT
