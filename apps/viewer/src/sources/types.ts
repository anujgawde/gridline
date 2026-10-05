export interface SheetSource {
  /* Origin the drawing set is served from. In production this is a CDN in front
     of object storage, which is why it is an absolute URL rather than a path on
     this app's own origin. */
  baseUrl: string;
}

export interface SheetIndexEntry {
  sheetId: string;
  title: string;
  discipline: string;
  /* A sheet number is not a page number. "A-101" means nothing to a PDF reader,
     so something has to hold the mapping — and in a set of 1,500 that something
     is the reason a navigator exists at all. */
  pageNumber: number;
  /* The latest revision issued. The viewer always shows this one. */
  revision: number;
}
