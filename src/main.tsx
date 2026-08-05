import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { App } from "./app/App";
import "./app/app.css";
import { MessageComposerWindow } from "./message/MessageComposerWindow";

const currentWindow = getCurrentWindow();
const Root =
  currentWindow.label === "message-composer" ? MessageComposerWindow : App;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
