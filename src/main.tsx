import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./app/app.css";

async function bootstrapApp() {
  if (import.meta.env.VITE_TAURI_E2E === "1") {
    await import("@wdio/tauri-plugin");
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrapApp();
