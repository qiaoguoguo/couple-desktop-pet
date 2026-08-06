import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { App } from "./app/App";
import "./app/app.css";
import {
  CompanionSurfaceRoot,
  readCompanionSurfaceFromLabel,
  readCompanionSurfaceFromLocation,
} from "./sync/companion/CompanionSurfaceRoot";

const surface = readCompanionSurfaceFromLocation() ?? readCompanionSurfaceFromWindowLabel();

function readCompanionSurfaceFromWindowLabel() {
  try {
    return readCompanionSurfaceFromLabel(getCurrentWindow().label);
  } catch {
    return null;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {surface ? <CompanionSurfaceRoot surface={surface} /> : <App />}
  </StrictMode>,
);
