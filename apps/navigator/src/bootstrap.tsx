import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@gridline/platform/tokens.css";

import { SetNavigator } from "./set-navigator";
import "./main.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <SetNavigator />
  </StrictMode>,
);
