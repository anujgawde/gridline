import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThumbnailLoader } from "../thumbnail-loader";

/* A fetch that never answers until told to, recording the order it was called
   in. Each call is answered by sheet id. */
function controlledFetch() {
  const started: string[] = [];
  const pending = new Map<string, { resolve: () => void; reject: (e: unknown) => void }>();
  const fetch = vi.fn((url: string, init: { signal: AbortSignal }) => {
    const id = url.split("/tiles/")[1]!.split("/")[0]!;
    started.push(id);
    return new Promise<Response>((resolve, reject) => {
      pending.set(id, {
        resolve: () => resolve(new Response(new Blob(["x"]))),
        reject,
      });
      init.signal.addEventListener("abort", () =>
        reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
      );
    });
  });
  const answer = async (id: string) => {
    pending.get(id)!.resolve();
    await flush();
  };
  return { fetch, started, answer };
}

/* Lets queued microtasks and settled promises run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const noop = () => {};

describe("ThumbnailLoader", () => {
  let control: ReturnType<typeof controlledFetch>;

  beforeEach(() => {
    control = controlledFetch();
    vi.stubGlobal("fetch", control.fetch);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x" }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("asks for the level-0 tile of the latest revision", async () => {
    new ThumbnailLoader("http://data.test/").request("A-101", 1, noop, noop);
    await flush();
    expect(control.fetch.mock.calls[0]![0]).toBe("http://data.test/tiles/A-101/l0/0_0.webp");
    new ThumbnailLoader("http://data.test/").request("A-131", 3, noop, noop);
    await flush();
    expect(control.fetch.mock.calls[1]![0]).toBe("http://data.test/tiles/A-131/r3/l0/0_0.webp");
  });

  it("starts no more than its limit at once", async () => {
    const loader = new ThumbnailLoader("http://data.test", 2);
    for (const id of ["A", "B", "C", "D"]) loader.request(id, 1, noop, noop);
    await flush();
    expect(control.started).toEqual(["A", "B"]);
  });

  it("serves one batch in the order it was asked for", async () => {
    const loader = new ThumbnailLoader("http://data.test", 2);
    for (const id of ["A", "B", "C", "D", "E"]) loader.request(id, 1, noop, noop);
    await flush();
    await control.answer("A");
    await control.answer("B");
    expect(control.started).toEqual(["A", "B", "C", "D"]);
  });

  it("serves a newer batch before an older one still waiting", async () => {
    const loader = new ThumbnailLoader("http://data.test", 1);
    for (const id of ["A", "B", "C"]) loader.request(id, 1, noop, noop);
    await flush();
    // A later task asks for two more while B and C are still queued.
    for (const id of ["X", "Y"]) loader.request(id, 1, noop, noop);
    await flush();
    await control.answer("A");
    await control.answer("X");
    await control.answer("Y");
    expect(control.started).toEqual(["A", "X", "Y", "B"]);
  });

  it("drops a withdrawn request that has not started", async () => {
    const loader = new ThumbnailLoader("http://data.test", 1);
    loader.request("A", 1, noop, noop);
    const withdrawB = loader.request("B", 1, noop, noop);
    loader.request("C", 1, noop, noop);
    await flush();
    withdrawB();
    await control.answer("A");
    expect(control.started).toEqual(["A", "C"]);
  });

  it("aborts a withdrawn request in flight, without reporting a failure", async () => {
    const loader = new ThumbnailLoader("http://data.test", 1);
    const onFail = vi.fn();
    const onLoad = vi.fn();
    const withdraw = loader.request("A", 1, onLoad, onFail);
    loader.request("B", 1, noop, noop);
    await flush();
    withdraw();
    await flush();
    expect(onLoad).not.toHaveBeenCalled();
    expect(onFail).not.toHaveBeenCalled();
    // The freed slot goes to the next request.
    expect(control.started).toEqual(["A", "B"]);
  });

  it("hands over an object URL once loaded", async () => {
    const loader = new ThumbnailLoader("http://data.test");
    const onLoad = vi.fn();
    loader.request("A", 1, onLoad, noop);
    await flush();
    await control.answer("A");
    expect(onLoad).toHaveBeenCalledWith("blob:x");
  });
});
