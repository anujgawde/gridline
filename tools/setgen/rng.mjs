// Seeded randomness for the synthetic set.
//
// One generator per sheet, seeded from the sheet's own id, rather than one
// stream shared by the whole run. A shared stream would tie a sheet's content
// to the order the loop happened to reach it, so generating one sheet on its own
// would produce different bytes from generating it as part of the full set. Perf
// numbers are only comparable if the set is identical, so the seed has to depend
// on the sheet and nothing else.

// FNV-1a. Small, stable across engines, and nothing here needs a strong hash —
// it only has to spread sheet ids across the seed space the same way every run.
export function hashString(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// mulberry32. A 32-bit state PRNG with no dependencies and no reliance on
// Math.random, which cannot be seeded and so cannot be reproduced.
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The generator a sheet is drawn with. `seed` is the run's seed, `sheetId` the
// sheet's stable identity, so the pair is reproducible from the command line.
export function rngForSheet(seed, sheetId) {
  return mulberry32(hashString(`${seed}:${sheetId}`));
}

// Helpers, so the drawing code reads as intent rather than arithmetic.
export function intBetween(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

export function floatBetween(rng, min, max) {
  return min + rng() * (max - min);
}

export function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}
