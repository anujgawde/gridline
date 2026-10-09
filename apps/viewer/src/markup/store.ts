import { bounds, hits } from "./geometry";
import { Quadtree } from "./quadtree";
import { Markup } from "./schema";
import type { MarkupDraft, MarkupPatch, Point } from "./schema";
import type { MarkupStoreOptions } from "./types";

/* How many edits undo can walk back. The oldest drops off past it. */
export const HISTORY_LIMIT = 200;

/* Each entry holds whole shapes, not diffs, so applying either direction is
   one put or one drop. `order` is the shape's place in the stack, kept so an
   undone delete returns at the same depth rather than on top. */
type Entry =
  | { op: "add"; shape: Markup; order: number }
  | { op: "remove"; shape: Markup; order: number }
  | { op: "update"; before: Markup; after: Markup };

/* One sheet's markups. The shape map, the spatial index and the history live
   here together and nothing else mutates them, so they cannot disagree. */
export class MarkupStore {
  readonly #sheetId: string;
  readonly #newId: () => string;
  readonly #now: () => Date;
  readonly #shapes = new Map<string, Markup>();
  /* Stacking order: higher is drawn later and wins a hit-test. */
  readonly #order = new Map<string, number>();
  readonly #index: Quadtree;
  readonly #listeners = new Set<() => void>();
  #undo: Entry[] = [];
  #redo: Entry[] = [];
  #nextOrder = 1;
  /* Only ever rises, so a number freed by undo is never handed out again. */
  #nextNumber = 1;
  #snapshot: readonly Markup[] = [];

  constructor(sheetId: string, options: MarkupStoreOptions) {
    this.#sheetId = sheetId;
    this.#index = new Quadtree(options.page);
    this.#newId = options.newId ?? (() => crypto.randomUUID());
    this.#now = options.now ?? (() => new Date());
  }

  /* In stacking order, bottom first: the order 5.3 draws them in. The same
     array is returned until something changes, which is what
     useSyncExternalStore needs from a snapshot. */
  get markups(): readonly Markup[] {
    return this.#snapshot;
  }

  get canUndo(): boolean {
    return this.#undo.length > 0;
  }

  get canRedo(): boolean {
    return this.#redo.length > 0;
  }

  get(id: string): Markup | undefined {
    return this.#shapes.get(id);
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /* Throws on an invalid draft. A tool producing one is a bug in this
     module, not input from outside it. */
  add(draft: MarkupDraft): Markup {
    const shape = Markup.parse({
      ...draft,
      id: this.#newId(),
      number: this.#nextNumber,
      sheetId: this.#sheetId,
      createdAt: this.#now().toISOString(),
    });
    this.#nextNumber++;
    const order = this.#nextOrder++;
    this.#put(shape, order);
    this.#record({ op: "add", shape, order });
    return shape;
  }

  remove(id: string): boolean {
    const shape = this.#shapes.get(id);
    if (!shape) return false;
    const order = this.#order.get(id)!;
    this.#drop(id);
    this.#record({ op: "remove", shape, order });
    return true;
  }

  /* One call is one undo step. A drag commits here once, on release, not on
     every move. */
  update(id: string, patch: MarkupPatch): Markup | undefined {
    const before = this.#shapes.get(id);
    if (!before) return undefined;
    const after = Markup.parse({
      ...before,
      ...patch,
      id: before.id,
      number: before.number,
      sheetId: before.sheetId,
      createdAt: before.createdAt,
    });
    this.#put(after, this.#order.get(id)!);
    this.#record({ op: "update", before, after });
    return after;
  }

  /* The topmost markup under a point, or null. The index narrows by box, the
     exact test decides. `tolerance` is in sheet units. */
  hitTest(point: Point, tolerance: number): Markup | null {
    const [x, y] = point;
    const near = this.#index.query({
      x: x - tolerance,
      y: y - tolerance,
      w: tolerance * 2,
      h: tolerance * 2,
    });
    let top: Markup | null = null;
    let topOrder = -Infinity;
    for (const id of near) {
      const shape = this.#shapes.get(id)!;
      const order = this.#order.get(id)!;
      if (order > topOrder && hits(shape, point, tolerance)) {
        top = shape;
        topOrder = order;
      }
    }
    return top;
  }

  undo(): boolean {
    const entry = this.#undo.pop();
    if (!entry) return false;
    this.#apply(entry, "back");
    this.#redo.push(entry);
    this.#changed();
    return true;
  }

  redo(): boolean {
    const entry = this.#redo.pop();
    if (!entry) return false;
    this.#apply(entry, "forward");
    this.#undo.push(entry);
    this.#changed();
    return true;
  }

  #apply(entry: Entry, direction: "forward" | "back"): void {
    if (entry.op === "update") {
      const shape = direction === "forward" ? entry.after : entry.before;
      this.#put(shape, this.#order.get(shape.id)!);
      return;
    }
    const adding = (entry.op === "add") === (direction === "forward");
    if (adding) this.#put(entry.shape, entry.order);
    else this.#drop(entry.shape.id);
  }

  /* A new edit forks history, so whatever was undone can't be redone. */
  #record(entry: Entry): void {
    this.#undo.push(entry);
    if (this.#undo.length > HISTORY_LIMIT) this.#undo.shift();
    this.#redo = [];
    this.#changed();
  }

  #put(shape: Markup, order: number): void {
    this.#shapes.set(shape.id, shape);
    this.#order.set(shape.id, order);
    this.#index.insert(shape.id, bounds(shape));
  }

  #drop(id: string): void {
    this.#shapes.delete(id);
    this.#order.delete(id);
    this.#index.remove(id);
  }

  #changed(): void {
    this.#snapshot = [...this.#shapes.values()].sort(
      (a, b) => this.#order.get(a.id)! - this.#order.get(b.id)!,
    );
    for (const listener of this.#listeners) listener();
  }
}
