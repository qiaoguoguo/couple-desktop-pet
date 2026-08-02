import { useCallback, useEffect, useMemo, useState } from "react";
import { BubbleLayer } from "../bubble/BubbleLayer";
import {
  createHiddenBubble,
  hideBubble,
  showBubble,
  type BubbleState,
} from "../bubble/bubbleStore";
import {
  readSettings as readDesktopSettings,
  resetWindowPosition,
  setAlwaysOnTop,
  setClickThrough,
  writeSettings as writeDesktopSettings,
} from "../desktop/windowCommands";
import { getNextScheduledEvent } from "../pet-core/petScheduler";
import {
  createInitialPetState,
  transitionPetState,
  type PetState,
} from "../pet-core/petStateMachine";
import { PixiPetStage } from "../renderer/PixiPetStage";
import { SettingsPanel } from "../settings/SettingsPanel";
import {
  loadSettings,
  mergeSettings,
  saveSettings,
  type SettingsPersistenceApi,
} from "../settings/settingsStore";
import type { PetSettings } from "../settings/settingsTypes";
import type { PetActionName } from "../assets/builtInPetManifest";

const bubbleMessage = "我在这里。";

const actionByState: Record<PetState["name"], PetActionName> = {
  idle: "idle",
  walking: "walk",
  dragging: "drag",
  happy: "happy",
  sleeping: "sleep",
};

export function App() {
  const settingsApi = useMemo<SettingsPersistenceApi>(
    () => ({
      readSettings: readDesktopSettings,
      writeSettings: writeDesktopSettings,
    }),
    [],
  );
  const [petState, setPetState] = useState<PetState>(() =>
    createInitialPetState(Date.now()),
  );
  const [settings, setSettings] = useState<PetSettings>(() => mergeSettings({}));
  const [bubble, setBubble] = useState<BubbleState>(() => createHiddenBubble());
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    let disposed = false;

    async function hydrateSettings() {
      const loadedSettings = await loadSettings(settingsApi);

      if (!disposed) {
        setSettings(mergeSettings(loadedSettings));
      }
    }

    void hydrateSettings();

    return () => {
      disposed = true;
    };
  }, [settingsApi]);

  useEffect(() => {
    runDesktopCommand(() => setAlwaysOnTop(settings.alwaysOnTop));
  }, [settings.alwaysOnTop]);

  useEffect(() => {
    runDesktopCommand(() => setClickThrough(settings.clickThrough));
  }, [settings.clickThrough]);

  useEffect(() => {
    if (!bubble.visible) {
      return;
    }

    const hideTimer = window.setTimeout(() => {
      setBubble((current) => hideBubble(current));
    }, 1800);

    return () => window.clearTimeout(hideTimer);
  }, [bubble.visible, bubble.message]);

  useEffect(() => {
    const schedulerTimer = window.setInterval(() => {
      setPetState((currentState) => {
        const event = getNextScheduledEvent(
          currentState,
          Date.now(),
          settings.autoMoveEnabled,
        );

        return event ? transitionPetState(currentState, event) : currentState;
      });
    }, 250);

    return () => window.clearInterval(schedulerTimer);
  }, [settings.autoMoveEnabled]);

  const persistSettings = useCallback(
    (nextSettings: PetSettings) => {
      void saveSettings(settingsApi, nextSettings).catch(() => undefined);
    },
    [settingsApi],
  );

  const handleSettingsChange = useCallback(
    (patch: Partial<PetSettings>) => {
      const nextSettings = mergeSettings({ ...settings, ...patch });

      setSettings(nextSettings);
      persistSettings(nextSettings);
      setPetState((currentState) =>
        transitionPetState(currentState, {
          type: "SETTINGS_CHANGED",
          at: Date.now(),
        }),
      );
    },
    [persistSettings, settings],
  );

  const handlePetClick = useCallback(() => {
    setPetState((currentState) =>
      transitionPetState(currentState, { type: "PET_CLICKED", at: Date.now() }),
    );

    if (settings.bubblesEnabled) {
      setBubble(showBubble(bubbleMessage));
    }
  }, [settings.bubblesEnabled]);

  const handleDragStart = useCallback(() => {
    setPetState((currentState) =>
      transitionPetState(currentState, { type: "DRAG_STARTED", at: Date.now() }),
    );
  }, []);

  const handleDragEnd = useCallback(() => {
    setPetState((currentState) =>
      transitionPetState(currentState, { type: "DRAG_ENDED", at: Date.now() }),
    );
  }, []);

  const handleResetPosition = useCallback(() => {
    runDesktopCommand(resetWindowPosition);
  }, []);

  return (
    <main className="app-shell">
      <section className="pet-surface" aria-label="情侣桌宠 MVP">
        <BubbleLayer message={bubble.message} visible={bubble.visible} />
        <PixiPetStage
          action={actionByState[petState.name]}
          scale={settings.scale}
          onPetClick={handlePetClick}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
      </section>

      <button
        className="settings-toggle"
        type="button"
        aria-expanded={settingsOpen}
        aria-controls="settings-panel"
        onClick={() => setSettingsOpen((open) => !open)}
      >
        设置
      </button>

      <div id="settings-panel" className={settingsOpen ? "settings-dock" : "settings-dock is-hidden"}>
        <SettingsPanel
          settings={settings}
          onChange={handleSettingsChange}
          onResetPosition={handleResetPosition}
        />
      </div>
    </main>
  );
}

function runDesktopCommand(command: () => Promise<void>) {
  try {
    void command().catch(() => undefined);
  } catch {
    // Desktop commands are stubbed in browser-only development until Task 6.
  }
}
