import { MarkupStore } from "../store";
import type { Box } from "../types";
import { seededMarkups } from "./seed";

/* One store per sheet and revision, kept for the session.

   Per revision because a markup points at ink, and the same coordinates on an
   earlier issue of the sheet may point at nothing. A store is made the first
   time a sheet is drawn rather than when it is asked for, because only the
   drawn frame knows the page size, and the page is the index's root. */
export class MarkupStores {
  readonly #stores = new Map<string, MarkupStore>();
  readonly #seedCount: number;

  constructor(seedCount = 0) {
    this.#seedCount = seedCount;
  }

  get(sheetId: string, revision: number, page: Box): MarkupStore {
    const key = `${sheetId}@${revision}`;
    let store = this.#stores.get(key);
    if (!store) {
      store = new MarkupStore(sheetId, { page });
      if (this.#seedCount > 0) {
        store.load(seededMarkups(sheetId, revision, page, this.#seedCount));
      }
      this.#stores.set(key, store);
    }
    return store;
  }
}
