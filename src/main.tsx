import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./app/app.css";
import {
  CompanionSurfaceRoot,
  readCompanionSurfaceFromLocation,
} from "./sync/companion/CompanionSurfaceRoot";

const surface = readCompanionSurfaceFromLocation();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {surface ? <CompanionSurfaceRoot surface={surface} /> : <App />}
  </StrictMode>,
);
