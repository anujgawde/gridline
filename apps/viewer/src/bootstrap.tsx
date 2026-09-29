import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@gridline/platform/tokens.css";

import { SheetSurface } from "./sheet-surface";
import "./main.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <SheetSurface sheetId="A-101" revision={4} />
  </StrictMode>,
);
