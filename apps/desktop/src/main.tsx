import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// ADR-023: initialize the i18n instance before anything renders. Resources
// are bundled, so init is synchronous and language resolution reads the
// persisted preference / navigator language before first paint.
import "@/i18n";
import { App } from "./app/App";
import "./styles/app.css";
import "./styles/prototype.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Morpho: root container #root is missing");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
