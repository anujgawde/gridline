/* Async boundary — deliberately the only thing in this file.

   @gridline/platform/bus is a shared module, and Module Federation has to
   initialize the share scope before any shared module can be resolved. A
   synchronous top-level import of one from the entry chunk runs too early and
   fails with "Invalid loadShareSync function call".

   A dynamic import splits everything below it into its own chunk, which loads
   after initialization. The alternative is marking the share eager, but that
   bundles it into the initial chunk and gives up the runtime resolution that is
   the reason for sharing it. */
void import("./bootstrap");
