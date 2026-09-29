/* Async boundary — see the same file in apps/shell. SheetSurface imports the
   shared bus, so the standalone entry needs the share scope initialized before
   it loads. Only this app's standalone mode is affected; when the shell loads
   SheetSurface as a remote, the host has already initialized the scope. */
void import("./bootstrap");
