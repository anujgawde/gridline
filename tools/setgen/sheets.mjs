// What the set *is* — disciplines, sheet numbers, titles. Pure metadata: this
// module knows nothing about PDF, so the numbering can be tested without
// producing a byte.
//
// Numbering is a rule rather than a random draw, and allocation is greedy and
// prefix-stable: the sheet at index n is the same sheet whatever `--count` is.
// That matters because a perf run at 1,500 sheets and a spot check at 24 have to
// be talking about the same A-101.

// Series are numbered blocks: A-1xx holds A-101 through A-199, so a block holds
// 99 sheets and a single letter code tops out at nine blocks — 891 sheets. That
// ceiling is the reason architectural work is split across A, AD and AI rather
// than carrying half the set under one code: at 2,000 sheets the architectural
// half is ~1,000 sheets and does not fit. Large sets are numbered this way for
// the same reason.
const SHEETS_PER_SERIES = 99;

// `weight` is a share of the set, out of 100. Proportions follow a real
// commercial set: the architectural family (A, AD, AI) is half of it, civil is a
// handful of site sheets.
export const DISCIPLINES = [
  {
    code: "C",
    name: "Civil",
    weight: 4,
    series: [{ base: 100, title: "SITE PLAN" }],
  },
  {
    code: "A",
    name: "Architectural",
    weight: 30,
    series: [
      { base: 100, title: "FLOOR PLAN", unit: "LEVEL" },
      { base: 200, title: "EXTERIOR ELEVATION" },
      { base: 300, title: "BUILDING SECTION" },
      { base: 400, title: "ENLARGED PLAN" },
      { base: 500, title: "WALL SECTION" },
      { base: 600, title: "REFLECTED CEILING PLAN", unit: "LEVEL" },
      { base: 700, title: "ROOF PLAN" },
    ],
  },
  {
    code: "AD",
    name: "Architectural Details",
    weight: 12,
    series: [
      { base: 100, title: "PLAN DETAIL" },
      { base: 200, title: "SECTION DETAIL" },
      { base: 300, title: "DOOR AND WINDOW SCHEDULE" },
    ],
  },
  {
    code: "AI",
    name: "Interiors",
    weight: 8,
    series: [
      { base: 100, title: "INTERIOR ELEVATION" },
      { base: 200, title: "FINISH PLAN", unit: "LEVEL" },
    ],
  },
  {
    code: "S",
    name: "Structural",
    weight: 16,
    series: [
      { base: 200, title: "FRAMING PLAN", unit: "LEVEL" },
      { base: 300, title: "FOUNDATION PLAN" },
      { base: 400, title: "STRUCTURAL DETAIL" },
      { base: 500, title: "COLUMN SCHEDULE" },
    ],
  },
  {
    code: "M",
    name: "Mechanical",
    weight: 15,
    series: [
      { base: 300, title: "HVAC PLAN", unit: "LEVEL" },
      { base: 400, title: "PIPING PLAN", unit: "LEVEL" },
      { base: 500, title: "MECHANICAL DETAIL" },
      { base: 600, title: "EQUIPMENT SCHEDULE" },
    ],
  },
  {
    code: "E",
    name: "Electrical",
    weight: 15,
    series: [
      { base: 500, title: "POWER PLAN", unit: "LEVEL" },
      { base: 600, title: "LIGHTING PLAN", unit: "LEVEL" },
      { base: 700, title: "ELECTRICAL DETAIL" },
      { base: 800, title: "PANEL SCHEDULE" },
    ],
  },
];

// Greedy proportional allocation. At each step the slot goes to whichever bucket
// is furthest behind its share, measured as (assigned + 1) / weight. Ties go to
// the earlier bucket, so the sequence is fully determined. Nothing is ever
// reallocated, which is what makes every prefix stable.
function allocate(buckets, total) {
  const assigned = buckets.map(() => 0);
  const order = [];
  for (let slot = 0; slot < total; slot += 1) {
    let best = 0;
    let bestCost = Infinity;
    for (let i = 0; i < buckets.length; i += 1) {
      const cost = (assigned[i] + 1) / buckets[i].weight;
      if (cost < bestCost) {
        bestCost = cost;
        best = i;
      }
    }
    assigned[best] += 1;
    order.push(best);
  }
  return order;
}

function seriesTitle(series, ordinal) {
  const suffix = series.unit
    ? `${series.unit} ${String(ordinal).padStart(2, "0")}`
    : String(ordinal).padStart(2, "0");
  return `${series.title} ${suffix}`;
}

// The set, in generation order. Display order is a sorting concern — a set is
// read grouped by discipline, but that belongs to whatever renders the index,
// not to how the sheets are produced.
export function buildSheetList(count) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`count must be a positive integer, received ${count}`);
  }

  const order = allocate(DISCIPLINES, count);
  const perDiscipline = DISCIPLINES.map(() => 0);
  const sheets = [];

  for (let index = 0; index < order.length; index += 1) {
    const discipline = DISCIPLINES[order[index]];
    const nth = perDiscipline[order[index]];
    perDiscipline[order[index]] += 1;

    // Series within a discipline carry equal weight, so this is a round-robin —
    // but expressed through the same allocator, so it stays prefix-stable too.
    const seriesIndex = nth % discipline.series.length;
    const series = discipline.series[seriesIndex];
    const ordinal = Math.floor(nth / discipline.series.length) + 1;

    if (ordinal > SHEETS_PER_SERIES) {
      throw new Error(
        `series ${discipline.code}-${series.base} overflowed ${SHEETS_PER_SERIES} sheets at count ${count}`,
      );
    }

    sheets.push({
      index,
      sheetId: `${discipline.code}-${series.base + ordinal}`,
      discipline: discipline.code,
      disciplineName: discipline.name,
      series: series.base,
      title: seriesTitle(series, ordinal),
      revision: 1,
    });
  }

  return sheets;
}
