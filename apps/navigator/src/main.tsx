/* Async boundary — see apps/shell. SetNavigator imports the shared bus, so the
   standalone entry needs the share scope initialized before it loads. */
void import("./bootstrap");
