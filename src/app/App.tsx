import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { BubbleLayer } from "../bubble/BubbleLayer";
import {
  createHiddenBubble,
  hideBubble,
  showBubble,
  type BubbleState,
} from "../bubble/bubbleStore";
import {
  hideWindow,
  listenForOpenSettings,
  moveWindowForAutoStep,
  quitApp,
  readSettings as readDesktopSettings,
  resetWindowPosition,
  setAlwaysOnTop,
  setClickThrough,
  startWindowDrag,
  writeSettings as writeDesktopSettings,
} from "../desktop/windowCommands";
import { getNextScheduledEvent } from "../pet-core/petScheduler";
import {
  createInitialPetState,
  transitionPetState,
  type PetState,
} from "../pet-core/petStateMachine";
import { FramePetStage } from "../renderer/FramePetStage";
import { SettingsPanel } from "../settings/SettingsPanel";
import {
  loadSettings,
  mergeSettings,
  saveSettings,
  type SettingsPersistenceApi,
} from "../settings/settingsStore";
import type { PetSettings } from "../settings/settingsTypes";
import {
  getActionDefinition,
  idleActionNames,
} from "../assets/builtInPetManifest";
import { selectNextIdleAction } from "../pet-core/idleActionSelector";

const bubbleMessage = "我在这里。";
const contextMenuWidth = 132;
const contextMenuHeight = 148;
const contextMenuMargin = 8;

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
  const settingsRef = useRef(settings);
  const [bubble, setBubble] = useState<BubbleState>(() => createHiddenBubble());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

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
    settingsRef.current = settings;
  }, [settings]);

  const persistSettings = useCallback(
    (nextSettings: PetSettings) => {
      void saveSettings(settingsApi, nextSettings).catch(() => undefined);
    },
    [settingsApi],
  );

  const openSettingsPanel = useCallback(() => {
    const currentSettings = settingsRef.current;

    if (currentSettings.clickThrough) {
      const nextSettings = mergeSettings({
        ...currentSettings,
        clickThrough: false,
      });

      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      persistSettings(nextSettings);
      runDesktopCommand(() => setClickThrough(false));
    }

    setSettingsOpen(true);
  }, [persistSettings]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listenForOpenSettings(() => {
      openSettingsPanel();
    })
      .then((unsubscribe) => {
        if (disposed) {
          unsubscribe();
          return;
        }

        unlisten = unsubscribe;
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [openSettingsPanel]);

  useEffect(() => {
    if (!bubble.visible) {
      return;
    }

    const hideTimer = window.setTimeout(() => {
      setBubble((current) => hideBubble(current));
    }, 1800);

    return () => window.clearTimeout(hideTimer);
  }, [bubble.id, bubble.visible]);

  useEffect(() => {
    if (!contextMenuPosition) {
      return;
    }

    function handlePointerDown(event: globalThis.PointerEvent) {
      if (
        event.target instanceof Element &&
        event.target.closest(".pet-context-menu")
      ) {
        return;
      }

      setContextMenuPosition(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setContextMenuPosition(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenuPosition]);

  useEffect(() => {
    const schedulerTimer = window.setInterval(() => {
      setPetState((currentState) => {
        const event = getNextScheduledEvent(
          currentState,
          Date.now(),
          settings.autoMoveEnabled,
          getActionDefinition(currentState.action).durationMs,
        );

        if (!event) {
          return currentState;
        }

        if (event.type === "AUTO_MOVE_TICK") {
          runDesktopCommand(() => moveWindowForAutoStep(settings.movementRange));
        }

        if (event.type === "IDLE_ANIMATION_FINISHED") {
          return transitionPetState(currentState, {
            ...event,
            action: selectNextIdleAction(currentState.idleHistory, idleActionNames),
          });
        }

        return transitionPetState(currentState, event);
      });
    }, 250);

    return () => window.clearInterval(schedulerTimer);
  }, [settings.autoMoveEnabled, settings.movementRange]);

  const handleSettingsChange = useCallback(
    (patch: Partial<PetSettings>) => {
      const nextSettings = mergeSettings({ ...settings, ...patch });

      if (patch.clickThrough === true && settingsOpen) {
        setSettingsOpen(false);
      }

      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      persistSettings(nextSettings);
      setPetState((currentState) =>
        transitionPetState(currentState, {
          type: "SETTINGS_CHANGED",
          at: Date.now(),
        }),
      );
    },
    [persistSettings, settings, settingsOpen],
  );

  const handlePetClick = useCallback(() => {
    setPetState((currentState) =>
      transitionPetState(currentState, { type: "PET_CLICKED", at: Date.now() }),
    );

    if (settings.bubblesEnabled) {
      setBubble(showBubble(bubbleMessage));
    }
  }, [settings.bubblesEnabled]);

  const handlePetContextMenu = useCallback((event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    setContextMenuPosition({
      x: clampMenuAxis(event.clientX, window.innerWidth, contextMenuWidth),
      y: clampMenuAxis(event.clientY, window.innerHeight, contextMenuHeight),
    });
  }, []);

  const handleDragStart = useCallback(() => {
    runDesktopCommand(startWindowDrag);
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

  const handleSettingsToggle = useCallback(() => {
    if (settingsOpen) {
      setSettingsOpen(false);
      return;
    }

    openSettingsPanel();
  }, [openSettingsPanel, settingsOpen]);

  const handleContextSettings = useCallback(() => {
    setContextMenuPosition(null);
    openSettingsPanel();
  }, [openSettingsPanel]);

  const handleContextResetPosition = useCallback(() => {
    setContextMenuPosition(null);
    handleResetPosition();
  }, [handleResetPosition]);

  const handleContextHide = useCallback(() => {
    setContextMenuPosition(null);
    runDesktopCommand(hideWindow);
  }, []);

  const handleContextQuit = useCallback(() => {
    setContextMenuPosition(null);
    runDesktopCommand(quitApp);
  }, []);

  return (
    <main className="app-shell">
      <section
        className="pet-surface"
        aria-label="情侣桌宠 MVP"
        onContextMenu={handlePetContextMenu}
      >
        <BubbleLayer message={bubble.message} visible={bubble.visible} />
        <FramePetStage
          action={petState.action}
          scale={settings.scale}
          onPetClick={handlePetClick}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
      </section>

      <button
        className={settingsOpen ? "settings-toggle is-visible" : "settings-toggle is-hidden"}
        type="button"
        aria-expanded={settingsOpen}
        aria-controls="settings-panel"
        onClick={handleSettingsToggle}
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

      {contextMenuPosition ? (
        <div
          className="pet-context-menu"
          role="menu"
          aria-label="桌宠菜单"
          style={{
            left: contextMenuPosition.x,
            top: contextMenuPosition.y,
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button type="button" role="menuitem" onClick={handleContextSettings}>
            设置
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleContextResetPosition}
          >
            重置位置
          </button>
          <button type="button" role="menuitem" onClick={handleContextHide}>
            隐藏
          </button>
          <button type="button" role="menuitem" onClick={handleContextQuit}>
            退出
          </button>
        </div>
      ) : null}
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

function clampMenuAxis(position: number, viewportSize: number, menuSize: number) {
  const max = Math.max(contextMenuMargin, viewportSize - menuSize - contextMenuMargin);

  return Math.min(Math.max(position, contextMenuMargin), max);
}
