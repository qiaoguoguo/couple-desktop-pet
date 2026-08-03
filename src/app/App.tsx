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
import { ensureDeviceIdentity } from "../sync/deviceIdentity";
import { RelayHttpClient } from "../sync/relayHttpClient";
import { SyncPanel } from "../sync/SyncPanel";
import { useRealtimeSync } from "../sync/useRealtimeSync";
import type { SessionMessage } from "../sync/syncTypes";
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
import type { PetSettings, SyncSettings } from "../settings/settingsTypes";
import {
  getActionDefinition,
  idleActionNames,
  interactionOptions,
  type InteractionActionName,
} from "../assets/builtInPetManifest";
import { selectNextIdleAction } from "../pet-core/idleActionSelector";
import { InteractionMenu } from "../interaction/InteractionMenu";

const bubbleMessage = "我在这里。";
const contextMenuWidth = 132;
const contextMenuHeight = 148;
const contextMenuMargin = 8;
const interactionMenuWidth = 164;
const interactionMenuHeight = 112;

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
  const [interactionMenuPosition, setInteractionMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [pairCode, setPairCode] = useState<{
    code: string;
    expiresAt: string;
  } | null>(null);
  const [sessionMessages, setSessionMessages] = useState<SessionMessage[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);

  const realtimeCallbacks = useMemo(
    () => ({
      onMessage: (message: {
        id: string;
        fromDeviceId: string;
        text: string;
        at: string;
      }) => {
        setSessionMessages((current) => [
          ...current,
          {
            id: message.id,
            direction: "received",
            text: message.text,
            at: message.at,
          },
        ]);

        if (settingsRef.current.bubblesEnabled) {
          setBubble(showBubble(message.text));
        }
      },
    }),
    [],
  );
  const realtime = useRealtimeSync(settings.sync, realtimeCallbacks);
  const syncStatus = useMemo(
    () => ({
      ...realtime.state,
      lastError: syncError ?? realtime.state.lastError,
    }),
    [realtime.state, syncError],
  );

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
    if (!contextMenuPosition && !interactionMenuPosition) {
      return;
    }

    function handlePointerDown(event: globalThis.PointerEvent) {
      const target = event.target instanceof Element ? event.target : null;

      if (
        target?.closest(".pet-context-menu") ||
        target?.closest(".pet-interaction-menu")
      ) {
        return;
      }

      if (contextMenuPosition) {
        setContextMenuPosition(null);
      }

      if (interactionMenuPosition && !target?.closest(".pet-frame-stage")) {
        setInteractionMenuPosition(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setContextMenuPosition(null);
        setInteractionMenuPosition(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenuPosition, interactionMenuPosition]);

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

  const handleSyncChange = useCallback(
    (patch: Partial<SyncSettings>) => {
      handleSettingsChange({
        sync: {
          ...settingsRef.current.sync,
          ...patch,
        },
      });
    },
    [handleSettingsChange],
  );

  const handleCreatePairCode = useCallback(async () => {
    const currentSync = settingsRef.current.sync;
    if (!currentSync.enabled) {
      setSyncError("请先启用远程互动");
      return;
    }

    const identity = ensureDeviceIdentity(currentSync);
    handleSyncChange(identity);
    setSyncError(null);

    const result = await new RelayHttpClient(identity.relayUrl).createPairCode({
      deviceId: identity.deviceId ?? "",
      deviceSecret: identity.deviceSecret ?? "",
      displayName: "星星桌宠",
    });

    if (result.ok) {
      setPairCode({ code: result.code, expiresAt: result.expiresAt });
      return;
    }

    setSyncError(result.message);
  }, [handleSyncChange]);

  const handleAcceptPairCode = useCallback(
    async (code: string) => {
      const identity = ensureDeviceIdentity({
        ...settingsRef.current.sync,
        enabled: true,
      });
      handleSyncChange(identity);
      setSyncError(null);

      const result = await new RelayHttpClient(identity.relayUrl).acceptPairCode({
        deviceId: identity.deviceId ?? "",
        deviceSecret: identity.deviceSecret ?? "",
        displayName: "星星桌宠",
        code,
      });

      if (result.ok) {
        handleSyncChange({
          ...identity,
          pairId: result.pairId,
          peerDeviceId: result.peerDeviceId,
        });
        setPairCode(null);
        setSessionMessages([]);
        return;
      }

      setSyncError(result.message);
    },
    [handleSyncChange],
  );

  const handleSendMessage = useCallback(
    (text: string) => {
      if (
        realtime.state.status !== "connected" ||
        realtime.state.peerPresence !== "online"
      ) {
        setSyncError("对方当前不在线");
        return;
      }

      const result = realtime.client?.sendMessage(text) ?? {
        ok: false as const,
        message: "Relay is not connected",
      };

      if (!result.ok) {
        setSyncError(result.message);
        return;
      }

      setSyncError(null);
      setSessionMessages((current) => [
        ...current,
        {
          id: result.clientMessageId,
          direction: "sent",
          text: text.trim(),
          at: new Date().toISOString(),
        },
      ]);
    },
    [realtime.client, realtime.state.peerPresence, realtime.state.status],
  );

  const handlePetClick = useCallback(() => {
    if (settingsOpen) {
      return;
    }

    setContextMenuPosition(null);
    setInteractionMenuPosition((current) =>
      current ? null : getInteractionMenuPosition(),
    );
  }, [settingsOpen]);

  const handleInteractionSelect = useCallback((action: InteractionActionName) => {
    const option = interactionOptions.find((candidate) => candidate.id === action);

    setInteractionMenuPosition(null);
    setPetState((currentState) =>
      transitionPetState(currentState, {
        type: "INTERACTION_SELECTED",
        action,
        at: Date.now(),
      }),
    );

    if (option && settingsRef.current.bubblesEnabled) {
      setBubble(showBubble(option.bubble));
    }
  }, []);

  const handlePetContextMenu = useCallback((event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    setInteractionMenuPosition(null);
    setContextMenuPosition({
      x: clampMenuAxis(event.clientX, window.innerWidth, contextMenuWidth),
      y: clampMenuAxis(event.clientY, window.innerHeight, contextMenuHeight),
    });
  }, []);

  const handleDragStart = useCallback(() => {
    setInteractionMenuPosition(null);
    setContextMenuPosition(null);
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

    setInteractionMenuPosition(null);
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
        <SyncPanel
          sync={settings.sync}
          status={syncStatus}
          messages={sessionMessages}
          pairCode={pairCode}
          onSyncChange={handleSyncChange}
          onCreatePairCode={handleCreatePairCode}
          onAcceptPairCode={handleAcceptPairCode}
          onSendMessage={handleSendMessage}
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

      <InteractionMenu
        open={Boolean(interactionMenuPosition)}
        x={interactionMenuPosition?.x ?? 0}
        y={interactionMenuPosition?.y ?? 0}
        options={interactionOptions}
        onSelect={handleInteractionSelect}
      />
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

function getInteractionMenuPosition() {
  return {
    x: clampMenuAxis(
      window.innerWidth / 2 - interactionMenuWidth / 2,
      window.innerWidth,
      interactionMenuWidth,
    ),
    y: clampMenuAxis(
      window.innerHeight - interactionMenuHeight - 42,
      window.innerHeight,
      interactionMenuHeight,
    ),
  };
}
