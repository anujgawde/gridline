import type { GridlineEventName, GridlineEvents } from "./contracts.js";

export type Handler<K extends GridlineEventName> = (
  payload: GridlineEvents[K],
) => void;

export type BusProblem =
  | { kind: "invalid-publish"; event: GridlineEventName; issues: string }
  | { kind: "invalid-receive"; event: GridlineEventName; issues: string }
  | { kind: "handler-threw"; event: GridlineEventName; error: unknown };

export interface BusOptions {
  /** Defaults to console.warn. Overridden in tests and by the shell's logger. */
  onProblem?: (problem: BusProblem) => void;
}

export interface Bus {
  /** Returns false if the payload failed validation and was dropped. */
  publish<K extends GridlineEventName>(
    event: K,
    payload: GridlineEvents[K],
  ): boolean;
  subscribe<K extends GridlineEventName>(
    event: K,
    handler: Handler<K>,
  ): () => void;
}
