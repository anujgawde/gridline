export interface SheetSource {
  /* Origin the generated drawing set is served from. In production this is a
     CDN in front of object storage, which is why it is an absolute URL and not
     a path on this app's own origin. */
  baseUrl: string;
}
