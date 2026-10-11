/* Capped so a typo in the address cannot hang the tab building a million
   shapes. */
const MAX_SEEDED = 20_000;

/* How many seeded markups each sheet starts with, read from `?markups=`.

   Diagnostic, not a feature: it puts a known number of shapes on every sheet
   so drawing and hit-testing can be measured at that count. Off unless asked
   for, and anything that is not a positive whole number is off too. */
export function markupSeedCount(search = window.location.search): number {
  const requested = Number(new URLSearchParams(search).get("markups"));
  return Number.isInteger(requested) && requested > 0
    ? Math.min(requested, MAX_SEEDED)
    : 0;
}
