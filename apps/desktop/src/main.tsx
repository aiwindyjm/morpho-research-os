import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
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
