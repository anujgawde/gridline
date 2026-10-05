/* Thumbnail fetches outstanding at once, by default. Four of the six
   connections a browser opens per origin, leaving two for anything else that
   fetches from the same origin — the viewer's tiles come from there too.

   Six would overlap more round trips: each request waits a full one before its
   first byte, and a screenful at four took 5.9 s where its bytes need about
   3. It was declined to keep that headroom.

   Anything issued beyond what the browser will run sits in its own queue,
   which cannot be reordered or emptied; held here instead, the queue can be
   both. */
const MAX_IN_FLIGHT = 4;

interface Job {
  url: string;
  /* Requests made in the same task share a batch. */
  batch: number;
  onLoad: (objectUrl: string) => void;
  onFail: () => void;
  abort?: AbortController;
}

/* Fetches sheet thumbnails — each sheet's level-0 tile, the whole sheet in one
   512 px image — a few at a time, and lets any request be withdrawn.

   Order is newest batch first, and within a batch the order they were asked
   for. A batch is every request made in one task: the cards a grid shows
   together, which it asks for top to bottom. Newest batch first because a
   fling down the list requests cards it passes, and the ones someone has
   stopped on are the last to ask; served in arrival order they would wait
   behind thumbnails already scrolled away. In the order asked within a batch,
   because served newest first a screenful fills from its bottom corner up.

   Fetched rather than set as an image's `src`, so a request can be aborted when
   its card leaves the screen. Nothing is cached here: the files are served
   immutable, so the browser's HTTP cache already holds them. */
export class ThumbnailLoader {
  #queue: Job[] = [];
  #inFlight = new Set<Job>();
  #batch = 0;
  #batchOpen = false;
  #pumpScheduled = false;

  constructor(
    private readonly baseUrl: string,
    private readonly maxInFlight = MAX_IN_FLIGHT,
  ) {}

  /* Returns a function that withdraws the request: dropped if still waiting,
     aborted if in flight, and a no-op once it has loaded. The caller owns the
     object URL passed to `onLoad` and must revoke it. */
  /* The thumbnail is the revision a click opens — the latest — so a reissued
     card never previews a drawing nobody will be shown. Its tiles sit one
     directory down, as the tiler writes them. */
  request(
    sheetId: string,
    revision: number,
    onLoad: (objectUrl: string) => void,
    onFail: () => void,
  ) {
    if (!this.#batchOpen) {
      this.#batch += 1;
      this.#batchOpen = true;
      queueMicrotask(() => {
        this.#batchOpen = false;
      });
    }

    const job: Job = {
      url: `${this.baseUrl.replace(/\/$/, "")}/tiles/${encodeURIComponent(sheetId)}${revision > 1 ? `/r${revision}` : ""}/l0/0_0.webp`,
      batch: this.#batch,
      onLoad,
      onFail,
    };
    this.#queue.push(job);
    this.#schedulePump();

    return () => {
      const waiting = this.#queue.indexOf(job);
      if (waiting !== -1) this.#queue.splice(waiting, 1);
      job.abort?.abort();
    };
  }

  /* Deferred to the end of the task, so a whole batch is queued before any of
     it starts — started as each request arrives, the first few of a screen
     would go out ahead of the order the rest are served in. */
  #schedulePump() {
    if (this.#pumpScheduled) return;
    this.#pumpScheduled = true;
    queueMicrotask(() => {
      this.#pumpScheduled = false;
      this.#pump();
    });
  }

  #pump() {
    while (this.#inFlight.size < this.maxInFlight && this.#queue.length > 0) {
      this.#start(this.#takeNext());
    }
  }

  /* The first job of the newest batch. Jobs are queued in request order, so
     the first one found in the highest batch is the earliest asked for. */
  #takeNext(): Job {
    let pick = 0;
    for (let i = 1; i < this.#queue.length; i += 1) {
      if (this.#queue[i]!.batch > this.#queue[pick]!.batch) pick = i;
    }
    return this.#queue.splice(pick, 1)[0]!;
  }

  #start(job: Job) {
    const abort = new AbortController();
    job.abort = abort;
    this.#inFlight.add(job);

    fetch(job.url, { signal: abort.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`${job.url} responded ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (!abort.signal.aborted) job.onLoad(URL.createObjectURL(blob));
      })
      .catch((error: unknown) => {
        /* An abort is a card that left the screen, not a failure. A missing
           thumbnail leaves the box empty; it never fails the grid. */
        if ((error as { name?: string })?.name === "AbortError") return;
        console.error("[navigator] thumbnail failed", error);
        job.onFail();
      })
      .finally(() => {
        this.#inFlight.delete(job);
        this.#pump();
      });
  }
}
