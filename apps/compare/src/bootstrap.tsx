import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@gridline/platform/tokens.css";

import { SheetCompare } from "./sheet-compare";
import "./main.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");

/* A-131 is reissued twice in the generated set, so both ends of the comparison
   exist. */
createRoot(container).render(
  <StrictMode>
    <SheetCompare sheetId="A-131" from={1} to={3} />
  </StrictMode>,
);
