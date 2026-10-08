/* A single throttled run is noisy: the CPU throttle, the network emulation and
   whatever else the machine is doing all move it. One sample is not a
   measurement, it is an anecdote, so every figure here is a median over repeats
   and carries its own spread.

   Median rather than mean, because one slow outlier — a GC, a background
   process — drags a mean and leaves no trace in the reported number. */
export interface Stat {
  median: number | null;
  min: number | null;
  max: number | null;
  samples: number;
}

export function summarize(values: (number | null)[]): Stat {
  const present = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (present.length === 0) {
    return { median: null, min: null, max: null, samples: 0 };
  }
  // The empty case returned above, so every index below is in range.
  const mid = Math.floor(present.length / 2);
  const median =
    present.length % 2 === 0
      ? (present[mid - 1]! + present[mid]!) / 2
      : present[mid]!;
  return {
    median: Math.round(median),
    min: Math.round(present[0]!),
    max: Math.round(present[present.length - 1]!),
    samples: present.length,
  };
}

/* "412 ms (389–520, n=5)" — the number, and enough beside it to see whether it
   is stable. A spread this wide on a budget this tight is itself a finding. */
export function format(stat: Stat, unit = "ms") {
  if (stat.median === null) return "no reading";
  return `${stat.median} ${unit} (${stat.min}–${stat.max}, n=${stat.samples})`;
}
