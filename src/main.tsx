import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { App } from "./app/App";
import "./app/app.css";
import { shouldRenderMessageComposer } from "./app/rootMode";
import { MessageComposerWindow } from "./message/MessageComposerWindow";

const Root = shouldRenderMessageComposer({
  locationHash: window.location.hash,
  readWindowLabel: () => getCurrentWindow().label,
})
  ? MessageComposerWindow
  : App;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
