import { describe, expect, it } from "vitest";

import { tileIndexUrl, tileUrl } from "../paths";

const base = { baseUrl: "http://localhost:4200/", sheetId: "A-131" };

describe("tile paths", () => {
  it("keeps revision 1 at the paths the set always had", () => {
    const ref = { ...base, revision: 1 };
    expect(tileIndexUrl(ref)).toBe("http://localhost:4200/tiles/A-131/tile-index.json");
    expect(tileUrl(ref, 2, 3, 1)).toBe("http://localhost:4200/tiles/A-131/l2/3_1.webp");
  });

  it("nests a reissue under its sheet", () => {
    const ref = { ...base, revision: 3 };
    expect(tileIndexUrl(ref)).toBe("http://localhost:4200/tiles/A-131/r3/tile-index.json");
    expect(tileUrl(ref, 0, 0, 0)).toBe("http://localhost:4200/tiles/A-131/r3/l0/0_0.webp");
  });
});
