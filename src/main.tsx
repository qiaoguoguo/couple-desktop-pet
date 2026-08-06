import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./app/app.css";
import {
  CompanionSurfaceRoot,
  readCompanionSurfaceFromSearch,
} from "./sync/companion/CompanionSurfaceRoot";

const surface = readCompanionSurfaceFromSearch();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {surface ? <CompanionSurfaceRoot surface={surface} /> : <App />}
  </StrictMode>,
);
