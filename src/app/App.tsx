import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { BubbleLayer } from "../bubble/BubbleLayer";
import {
  createHiddenBubble,
  hideBubble,
  showBubble,
  type BubbleState,
} from "../bubble/bubbleStore";
import {
  hideWindow,
  listenForClickThroughRecovered,
  listenForOpenSettings,
  moveWindowForAutoStep,
  closeMessageComposerSurface,
  openMessageComposerSurface,
  quitApp,
  readSettings as readDesktopSettings,
  resetWindowPosition,
  restoreWindowFromEdgePeek,
  setAlwaysOnTop,
  setClickThrough,
  snapWindowToEdgeIfNeeded,
  startWindowDrag,
  writeSettings as writeDesktopSettings,
} from "../desktop/windowCommands";
import { getBuiltInEdgeProfile } from "../assets/builtInEdgeInteraction";
import { ensureDeviceIdentity } from "../sync/deviceIdentity";
import { RelayHttpClient } from "../sync/relayHttpClient";
import { RemoteMessageLayer } from "../sync/RemoteMessageLayer";
import {
  completeRemoteMessageDismissal,
  createEmptyRemoteMessageQueue,
  enqueueRemoteMessage,
  markRemoteMessageDismissing,
  markRemoteMessageHovered,
} from "../sync/remoteMessageQueue";
import { SyncPanel } from "../sync/SyncPanel";
import { useRealtimeSync } from "../sync/useRealtimeSync";
import type { SessionMessage } from "../sync/syncTypes";
import { MessageComposerPanel } from "../message/MessageComposerPanel";
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
  interactionOptions,
  type InteractionMenuSelection,
} from "../assets/builtInPetManifest";
import {
  idleActionNames,
  type PetActionName,
} from "../assets/petActionNames";
import { selectNextIdleBehavior } from "../pet-core/idleBehaviorSelector";
import {
  selectMotionForTag,
  selectNextPetMotion,
} from "../pet-core/motionPoolDirector";
import { InteractionMenu } from "../interaction/InteractionMenu";
import type { ActivityStatus } from "../../shared/activityStatus";
import {
  BUILT_IN_PET_PACKAGE_ID,
  PET_ACTION_DURATION_MS,
  type ImportedPetPackageSummary,
} from "../assets/petPackageContract";
import { createPetPackageCommands } from "../assets/petPackageCommands";
import {
  buildPetPackageRegistry,
  getDefaultPetMotion,
  resolveSelectedPetPackage,
} from "../assets/petPackageRegistry";
import { AppearancePanel } from "../settings/AppearancePanel";
import { ActivityStatusPicker } from "../status/ActivityStatusPicker";
import { PeerStatusCard } from "../status/PeerStatusCard";
import { resolvePeerStatusView } from "../status/peerStatusPresentation";
import { useEdgeInteraction } from "../pet/useEdgeInteraction";
import { preloadEdgeFrames } from "../pet/edgeFramePreloader";

const bubbleMessage = "我在这里。";
const placeholderInteractionMessage = "功能开发中，先陪你待一会儿。";
const contextMenuWidth = 132;
const contextMenuHeight = 148;
const contextMenuMargin = 8;
const interactionMenuHorizontalRadius = 128;
const interactionMenuTopRadius = 148;
const interactionMenuBottomRadius = 96;
const pairCodePollIntervalMs = 2000;
const remoteMessageDismissDelayMs = 800;
const sentMessageBubbleDurationMs = 5000;

export function App() {
  const settingsApi = useMemo<SettingsPersistenceApi>(
    () => ({
      readSettings: readDesktopSettings,
      writeSettings: writeDesktopSettings,
    }),
    [],
  );
  const petPackageApi = useMemo(() => createPetPackageCommands(), []);
  const [petState, setPetState] = useState<PetState>(() =>
    createInitialPetState(Date.now()),
  );
  const [activeMotionId, setActiveMotionId] = useState<string | null>(null);
  const [settings, setSettings] = useState<PetSettings>(() => mergeSettings({}));
  const settingsRef = useRef(settings);
  const motionHistoryRef = useRef<string[]>([]);
  const [importedPetPackages, setImportedPetPackages] = useState<
    ImportedPetPackageSummary[]
  >([]);
  const [petPackageError, setPetPackageError] = useState<string | null>(null);
  const [bubble, setBubble] = useState<BubbleState>(() => createHiddenBubble());
  const [remoteMessages, setRemoteMessages] = useState(() =>
    createEmptyRemoteMessageQueue(),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [messageComposerOpen, setMessageComposerOpen] = useState(false);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
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
  const remoteMessageClickThroughOverrideRef = useRef(false);
  const petSurfaceRef = useRef<HTMLElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const statusPickerReturnFocusRef = useRef<HTMLElement | null>(null);
  const edgeDragPointerHeldRef = useRef(false);

  const petPackages = useMemo(
    () =>
      buildPetPackageRegistry(
        importedPetPackages,
        petPackageApi.convertFileSrc,
      ),
    [importedPetPackages, petPackageApi],
  );
  const selectedPetPackage = useMemo(
    () =>
      resolveSelectedPetPackage(
        petPackages,
        settings.appearance.selectedPetPackageId,
      ),
    [petPackages, settings.appearance.selectedPetPackageId],
  );
  const selectedPeerPetPackageId = settings.sync.peerDeviceId
    ? settings.appearance.peerPetPackageByDeviceId[settings.sync.peerDeviceId] ??
      null
    : null;
  const selectedPeerPetPackage = useMemo(
    () =>
      selectedPeerPetPackageId
        ? petPackages.find((pkg) => pkg.id === selectedPeerPetPackageId) ?? null
        : null,
    [petPackages, selectedPeerPetPackageId],
  );
  const peerStatusPetPackage =
    selectedPeerPetPackage ??
    petPackages.find((pkg) => pkg.id === BUILT_IN_PET_PACKAGE_ID) ??
    selectedPetPackage;
  const activeMotion = useMemo(
    () =>
      selectedPetPackage.motions[
        activeMotionId ?? selectedPetPackage.defaultMotionId
      ] ?? getDefaultPetMotion(selectedPetPackage),
    [activeMotionId, selectedPetPackage],
  );
  const activeRemoteMessage = remoteMessages.active;
  const isRemoteMessageActive = Boolean(activeRemoteMessage);
  const refreshPetPackages = useCallback(async () => {
    const packages = await petPackageApi.listPetPackages();
    setImportedPetPackages(packages);
    return packages;
  }, [petPackageApi]);

  const setVisibleMotion = useCallback(
    (motionId: string) => {
      if (!selectedPetPackage.motions[motionId]) {
        return;
      }

      setActiveMotionId(motionId);
      motionHistoryRef.current = [
        ...motionHistoryRef.current.slice(-7),
        motionId,
      ];
    },
    [selectedPetPackage.motions],
  );

  const setVisibleMotionForAction = useCallback(
    (action: PetActionName) => {
      setVisibleMotion(action);
    },
    [setVisibleMotion],
  );

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

        const messageMotionId = selectMotionForTag(
          selectedPetPackage.motions,
          "message",
        );

        if (messageMotionId) {
          setVisibleMotion(messageMotionId);
        }

        setRemoteMessages((current) => enqueueRemoteMessage(current, message));
      },
    }),
    [selectedPetPackage.motions, setVisibleMotion],
  );
  const realtime = useRealtimeSync(settings.sync, realtimeCallbacks);
  const syncStatus = useMemo(
    () => ({
      ...realtime.state,
      lastError: syncError ?? realtime.state.lastError,
    }),
    [realtime.state, syncError],
  );
  const peerStatusView = useMemo(
    () =>
      resolvePeerStatusView({
        paired: Boolean(settings.sync.pairId && settings.sync.peerDeviceId),
        connectionStatus: realtime.state.status,
        peerPresence: realtime.state.peerPresence,
        peerActivityStatus: realtime.state.peerActivityStatus,
      }),
    [
      realtime.state.peerActivityStatus,
      realtime.state.peerPresence,
      realtime.state.status,
      settings.sync.pairId,
      settings.sync.peerDeviceId,
    ],
  );
  const peerStatusImageCandidates = useMemo(() => {
    const motionFallbackUrl =
      getDefaultPetMotion(peerStatusPetPackage).frames[0] ?? null;

    if (peerStatusView?.variant === "offline") {
      return [
        peerStatusPetPackage.offlinePortraitUrl,
        peerStatusPetPackage.portraitUrl,
        peerStatusPetPackage.previewUrl,
        motionFallbackUrl,
      ];
    }

    return [
      peerStatusPetPackage.portraitUrl,
      peerStatusPetPackage.previewUrl,
      motionFallbackUrl,
    ];
  }, [peerStatusPetPackage, peerStatusView?.variant]);
  const {
    state: edgeInteractionState,
    renderState: edgeInteractionRenderState,
    snapAfterDrag: snapEdgeAfterDrag,
    requestExitThen: requestEdgeExitThen,
    handlePhaseComplete: handleEdgePhaseComplete,
    handlePointerEnter: handleEdgePointerEnter,
    handleLoadError: handleEdgeLoadError,
  } = useEdgeInteraction({
    packageId: selectedPetPackage.id,
    snapWindowToEdgeIfNeeded,
    restoreWindowFromEdgePeek,
    resetWindowPosition,
    preloadFrames: preloadEdgeFrames,
    getProfile: getBuiltInEdgeProfile,
  });
  const isEdgeInteractionActive = Boolean(edgeInteractionState);
  const shouldShowPeerStatus =
    Boolean(peerStatusView) &&
    !settingsOpen &&
    !messageComposerOpen &&
    !activeRemoteMessage &&
    !interactionMenuPosition &&
    !statusPickerOpen &&
    !isEdgeInteractionActive;

  useEffect(() => {
    const defaultMotion = getDefaultPetMotion(selectedPetPackage);

    setActiveMotionId(defaultMotion.id);
    motionHistoryRef.current = [defaultMotion.id];
  }, [selectedPetPackage.id, selectedPetPackage]);

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
    let disposed = false;

    void petPackageApi
      .listPetPackages()
      .then((packages) => {
        if (!disposed) {
          setImportedPetPackages(packages);
        }
      })
      .catch(() => {
        if (!disposed) {
          setImportedPetPackages([]);
        }
      });

    return () => {
      disposed = true;
    };
  }, [petPackageApi]);

  useEffect(() => {
    runDesktopCommand(() => setAlwaysOnTop(settings.alwaysOnTop));
  }, [settings.alwaysOnTop]);

  useEffect(() => {
    runDesktopCommand(() => setClickThrough(settings.clickThrough));
  }, [settings.clickThrough]);

  useEffect(() => {
    const shouldDisableClickThroughForRemoteMessage =
      Boolean(remoteMessages.active) && settings.clickThrough;

    if (
      shouldDisableClickThroughForRemoteMessage &&
      !remoteMessageClickThroughOverrideRef.current
    ) {
      remoteMessageClickThroughOverrideRef.current = true;
      runDesktopCommand(() => setClickThrough(false));
      return;
    }

    if (
      !shouldDisableClickThroughForRemoteMessage &&
      remoteMessageClickThroughOverrideRef.current
    ) {
      remoteMessageClickThroughOverrideRef.current = false;

      if (settings.clickThrough) {
        runDesktopCommand(() => setClickThrough(true));
      }
    }
  }, [remoteMessages.active, settings.clickThrough]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const persistSettings = useCallback(
    (nextSettings: PetSettings) => {
      void saveSettings(settingsApi, nextSettings).catch(() => undefined);
    },
    [settingsApi],
  );

  const persistRecoveredClickThrough = useCallback(() => {
    const currentSettings = settingsRef.current;

    if (!currentSettings.clickThrough) {
      return;
    }

    const nextSettings = mergeSettings({
      ...currentSettings,
      clickThrough: false,
    });

    settingsRef.current = nextSettings;
    setSettings(nextSettings);
    persistSettings(nextSettings);
  }, [persistSettings]);

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
    setStatusPickerOpen(false);
  }, [persistSettings]);

  const closeSettingsPanel = useCallback(() => {
    setSettingsOpen(false);
  }, []);

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
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listenForClickThroughRecovered(() => {
      persistRecoveredClickThrough();
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
  }, [persistRecoveredClickThrough]);

  useEffect(() => {
    if (!bubble.visible) {
      return;
    }

    const hideTimer = window.setTimeout(() => {
      setBubble((current) => hideBubble(current));
    }, bubble.durationMs);

    return () => window.clearTimeout(hideTimer);
  }, [bubble.durationMs, bubble.id, bubble.visible]);

  useEffect(() => {
    const activeMessage = remoteMessages.active;

    if (!activeMessage || activeMessage.stage !== "hovered") {
      return;
    }

    setRemoteMessages((current) =>
      markRemoteMessageDismissing(current, activeMessage.id),
    );
  }, [remoteMessages.active]);

  useEffect(() => {
    const activeMessage = remoteMessages.active;

    if (!activeMessage || activeMessage.stage !== "dismissing") {
      return;
    }

    const dismissTimer = window.setTimeout(() => {
      setRemoteMessages((current) =>
        completeRemoteMessageDismissal(current, activeMessage.id),
      );
    }, remoteMessageDismissDelayMs);

    return () => window.clearTimeout(dismissTimer);
  }, [remoteMessages.active]);

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
        if (isRemoteMessageActive || isEdgeInteractionActive) {
          return currentState;
        }

        const currentActionDurationMs =
          activeMotion.durationMs ??
          selectedPetPackage.actions[currentState.action]?.durationMs ??
          PET_ACTION_DURATION_MS;
        const event = getNextScheduledEvent(
          currentState,
          Date.now(),
          settings.autoMoveEnabled,
          currentActionDurationMs,
        );

        if (!event) {
          return currentState;
        }

        if (event.type === "AUTO_MOVE_TICK") {
          setVisibleMotionForAction("walk");
          runDesktopCommand(() => moveWindowForAutoStep(settings.movementRange));
        }

        if (event.type === "IDLE_TIMEOUT") {
          setVisibleMotionForAction("sleep");
        }

        if (event.type === "IDLE_ANIMATION_FINISHED") {
          const nextMotionId = selectNextPetMotion({
            motions: selectedPetPackage.motions,
            defaultMotionId: selectedPetPackage.defaultMotionId,
            history: motionHistoryRef.current,
          });
          setVisibleMotion(nextMotionId);

          const nextBehavior = selectNextIdleBehavior({
            history: currentState.idleHistory,
            idleActions: idleActionNames,
            ambientEnabled: true,
          });

          if (nextBehavior.source === "ambient-interaction") {
            setVisibleMotionForAction(nextBehavior.action);
            return transitionPetState(currentState, {
              type: "AMBIENT_INTERACTION_SELECTED",
              action: nextBehavior.action,
              returnTo: "idle-breathe",
              at: event.at,
            });
          }

          return transitionPetState(currentState, {
            ...event,
            action: nextBehavior.action,
          });
        }

        if (
          event.type === "ANIMATION_FINISHED" &&
          (currentState.name === "interacting" || currentState.name === "walking")
        ) {
          setVisibleMotionForAction(currentState.returnTo ?? "idle-breathe");
        }

        return transitionPetState(currentState, event);
      });
    }, 250);

    return () => window.clearInterval(schedulerTimer);
  }, [
    activeMotion.durationMs,
    isEdgeInteractionActive,
    isRemoteMessageActive,
    selectedPetPackage,
    setVisibleMotion,
    setVisibleMotionForAction,
    settings.autoMoveEnabled,
    settings.movementRange,
  ]);

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

  const handleImportPetPackage = useCallback(async () => {
    setPetPackageError(null);

    const selectedPath = await open({
      multiple: false,
      filters: [{ name: "桌宠资源包", extensions: ["cdpet", "zip"] }],
    });

    if (typeof selectedPath !== "string") {
      return;
    }

    try {
      const imported = await petPackageApi.importPetPackage(selectedPath);
      await refreshPetPackages();
      handleSettingsChange({
        appearance: {
          ...settingsRef.current.appearance,
          selectedPetPackageId: imported.id,
        },
      });
    } catch (error) {
      setPetPackageError(
        error instanceof Error ? error.message : "导入形象资源包失败",
      );
    }
  }, [handleSettingsChange, petPackageApi, refreshPetPackages]);

  const handleSelectPetPackage = useCallback(
    (packageId: string) => {
      setPetPackageError(null);
      handleSettingsChange({
        appearance: {
          ...settingsRef.current.appearance,
          selectedPetPackageId: packageId,
        },
      });
    },
    [handleSettingsChange],
  );

  const handleSelectPeerPetPackage = useCallback(
    (packageId: string) => {
      const peerDeviceId = settingsRef.current.sync.peerDeviceId;

      if (!peerDeviceId) {
        return;
      }

      const nextPeerPackageByDeviceId = {
        ...settingsRef.current.appearance.peerPetPackageByDeviceId,
      };

      if (packageId) {
        nextPeerPackageByDeviceId[peerDeviceId] = packageId;
      } else {
        delete nextPeerPackageByDeviceId[peerDeviceId];
      }

      setPetPackageError(null);
      handleSettingsChange({
        appearance: {
          ...settingsRef.current.appearance,
          peerPetPackageByDeviceId: nextPeerPackageByDeviceId,
        },
      });
    },
    [handleSettingsChange],
  );

  const handleDeletePetPackage = useCallback(
    async (packageId: string) => {
      setPetPackageError(null);

      if (packageId === BUILT_IN_PET_PACKAGE_ID) {
        setPetPackageError("内置形象不能删除");
        return;
      }

      if (settingsRef.current.appearance.selectedPetPackageId === packageId) {
        setPetPackageError("当前正在使用的形象不能删除");
        return;
      }

      if (
        Object.values(
          settingsRef.current.appearance.peerPetPackageByDeviceId,
        ).includes(packageId)
      ) {
        setPetPackageError("对方形象正在使用，不能删除");
        return;
      }

      try {
        await petPackageApi.deletePetPackage(packageId);
        await refreshPetPackages();
      } catch (error) {
        setPetPackageError(
          error instanceof Error ? error.message : "删除形象资源包失败",
        );
      }
    },
    [petPackageApi, refreshPetPackages],
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

  const clearLocalPair = useCallback(() => {
    handleSyncChange({ pairId: null, peerDeviceId: null });
    setPairCode(null);
    setSessionMessages([]);
    setSyncError(null);
  }, [handleSyncChange]);

  const handleUnpair = useCallback(async () => {
    const currentSync = settingsRef.current.sync;

    if (
      currentSync.pairId &&
      currentSync.relayUrl &&
      currentSync.deviceId &&
      currentSync.deviceSecret
    ) {
      const result = await new RelayHttpClient(currentSync.relayUrl).unpair({
        deviceId: currentSync.deviceId,
        deviceSecret: currentSync.deviceSecret,
        pairId: currentSync.pairId,
      });

      if (!result.ok && result.code !== "pair_not_found") {
        setSyncError(readUnpairUserMessage(result.code, result.message));
        return;
      }
    }

    clearLocalPair();
  }, [clearLocalPair]);

  useEffect(() => {
    if (!pairCode) {
      return;
    }

    const activePairCode = pairCode;
    let disposed = false;
    let timerId: number | undefined;
    const expiresAtMs = Date.parse(activePairCode.expiresAt);

    function clearTimer() {
      if (timerId !== undefined) {
        window.clearTimeout(timerId);
        timerId = undefined;
      }
    }

    function stopWithError(message: string) {
      clearTimer();
      setPairCode(null);
      setSyncError(message);
    }

    function scheduleNextPoll() {
      if (disposed) {
        return;
      }

      if (!Number.isFinite(expiresAtMs)) {
        stopWithError("绑定码状态异常，请重新生成");
        return;
      }

      const remainingMs = expiresAtMs - Date.now();
      if (remainingMs <= 0) {
        stopWithError("绑定码已过期，请重新生成");
        return;
      }

      timerId = window.setTimeout(() => {
        void pollPairCodeStatus();
      }, Math.min(pairCodePollIntervalMs, remainingMs));
    }

    async function pollPairCodeStatus() {
      const currentSync = settingsRef.current.sync;

      if (
        !currentSync.enabled ||
        !currentSync.deviceId ||
        !currentSync.deviceSecret
      ) {
        scheduleNextPoll();
        return;
      }

      if (currentSync.pairId) {
        clearTimer();
        setPairCode(null);
        return;
      }

      const result = await new RelayHttpClient(currentSync.relayUrl).getPairCodeStatus({
        deviceId: currentSync.deviceId,
        deviceSecret: currentSync.deviceSecret,
        code: activePairCode.code,
      });

      if (disposed) {
        return;
      }

      if (!result.ok) {
        setSyncError(readRelayUserMessage(result.code, result.message));

        if (
          result.code === "invalid_code" ||
          result.code === "code_expired" ||
          result.code === "code_consumed" ||
          result.code === "auth_failed"
        ) {
          setPairCode(null);
          return;
        }

        scheduleNextPoll();
        return;
      }

      if (result.status === "paired") {
        handleSyncChange({
          ...currentSync,
          pairId: result.pairId,
          peerDeviceId: result.peerDeviceId,
        });
        setPairCode(null);
        setSessionMessages([]);
        setSyncError(null);
        return;
      }

      if (result.status === "expired") {
        stopWithError("绑定码已过期，请重新生成");
        return;
      }

      if (result.status === "consumed") {
        stopWithError("绑定码已失效，请重新生成");
        return;
      }

      setSyncError(null);
      scheduleNextPoll();
    }

    scheduleNextPoll();

    return () => {
      disposed = true;
      clearTimer();
    };
  }, [handleSyncChange, pairCode]);

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
      displayName: "Q 版桌宠",
    });

    if (result.ok) {
      setPairCode({ code: result.code, expiresAt: result.expiresAt });
      return;
    }

    setSyncError(readRelayUserMessage(result.code, result.message));
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
        displayName: "Q 版桌宠",
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

      setSyncError(readRelayUserMessage(result.code, result.message));
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
        return { ok: false as const, message: "对方当前不在线" };
      }

      const result = realtime.client?.sendMessage(text) ?? {
        ok: false as const,
        message: "Relay is not connected",
      };

      if (!result.ok) {
        setSyncError(result.message);
        return { ok: false as const, message: result.message };
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

      if (settingsRef.current.bubblesEnabled) {
        setBubble(
          showBubble("消息已送出", { durationMs: sentMessageBubbleDurationMs }),
        );
      }

      const messageMotionId = selectMotionForTag(
        selectedPetPackage.motions,
        "message",
      );

      if (messageMotionId) {
        setVisibleMotion(messageMotionId);
      }

      return { ok: true as const };
    },
    [
      realtime.client,
      realtime.state.peerPresence,
      realtime.state.status,
      selectedPetPackage.motions,
      setVisibleMotion,
    ],
  );

  const handleRemoteMessageAcknowledge = useCallback((messageId: string) => {
    setRemoteMessages((current) =>
      markRemoteMessageHovered(current, messageId),
    );
  }, []);

  const openInteractionMenu = useCallback(() => {
    if (messageComposerOpen) {
      return;
    }

    setStatusPickerOpen(false);
    setContextMenuPosition(null);
    setInteractionMenuPosition((current) =>
      current ? null : getInteractionMenuPosition(),
    );
  }, [messageComposerOpen]);

  const handlePetClick = useCallback(() => {
    if (settingsOpen) {
      return;
    }

    requestEdgeExitThen(openInteractionMenu);
  }, [openInteractionMenu, requestEdgeExitThen, settingsOpen]);

  const openMessageComposerPanel = useCallback(() => {
    setInteractionMenuPosition(null);
    setStatusPickerOpen(false);
    setContextMenuPosition(null);
    runDesktopCommand(openMessageComposerSurface);
    setBubble((current) => hideBubble(current));
    setMessageComposerOpen(true);
  }, []);

  const closeStatusPicker = useCallback(() => {
    setStatusPickerOpen(false);

    const returnFocusElement = statusPickerReturnFocusRef.current;
    const focusTarget = returnFocusElement?.isConnected
      ? returnFocusElement
      : petSurfaceRef.current;

    focusTarget?.focus();
    statusPickerReturnFocusRef.current = null;
  }, []);

  const dismissStatusPicker = useCallback(() => {
    setStatusPickerOpen(false);
    statusPickerReturnFocusRef.current = null;
  }, []);

  const openStatusPicker = useCallback(() => {
    statusPickerReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setStatusPickerOpen(true);
    setBubble((current) => hideBubble(current));
  }, []);

  const handleActivityStatusSelect = useCallback(
    (activityStatus: ActivityStatus | null) => {
      closeStatusPicker();
      handleSyncChange({ activityStatus });

      const result = realtime.client?.setActivityStatus(activityStatus) ?? {
        synced: false,
      };

      if (!result.synced && settingsRef.current.bubblesEnabled) {
        setBubble(
          showBubble("状态已保存，连接后会同步。", { durationMs: 5000 }),
        );
      }
    },
    [closeStatusPicker, handleSyncChange, realtime.client],
  );

  const handleInteractionSelect = useCallback((selection: InteractionMenuSelection) => {
    setInteractionMenuPosition(null);

    if (selection === "send-message") {
      const sendable =
        settingsRef.current.sync.enabled &&
        Boolean(settingsRef.current.sync.pairId) &&
        realtime.state.status === "connected" &&
        realtime.state.peerPresence === "online";

      if (!sendable) {
        setBubble(showBubble("对方在线后再发消息吧。", { durationMs: 5000 }));
        return;
      }

      openMessageComposerPanel();
      return;
    }

    if (selection === "open-status") {
      openStatusPicker();
      return;
    }

    if (selectedPetPackage.motions[selection]) {
      setVisibleMotion(selection);
      setPetState((currentState) =>
        transitionPetState(currentState, {
          type: "INTERACTION_SELECTED",
          action: selection,
          returnTo: "idle-breathe",
          at: Date.now(),
        }),
      );
      return;
    }

    if (settingsRef.current.bubblesEnabled) {
      setBubble(
        showBubble(placeholderInteractionMessage, { durationMs: 4000 }),
      );
    }

    setVisibleMotion(
      selectNextPetMotion({
        motions: selectedPetPackage.motions,
        defaultMotionId: selectedPetPackage.defaultMotionId,
        history: motionHistoryRef.current,
      }),
    );
    setPetState((currentState) =>
      transitionPetState(currentState, {
        type: "INTERACTION_SELECTED",
        action: selection,
        returnTo: "idle-breathe",
        at: Date.now(),
      }),
    );
  }, [
    openMessageComposerPanel,
    openStatusPicker,
    realtime.state.peerPresence,
    realtime.state.status,
    selectedPetPackage,
    setVisibleMotion,
  ]);

  const closeMessageComposerPanel = useCallback(() => {
    setMessageComposerOpen(false);
    runDesktopCommand(closeMessageComposerSurface);
  }, []);

  const handleMessageComposerSubmit = useCallback(
    (text: string) => handleSendMessage(text),
    [handleSendMessage],
  );

  const handlePetContextMenu = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const nextPosition = {
        x: clampMenuAxis(event.clientX, window.innerWidth, contextMenuWidth),
        y: clampMenuAxis(event.clientY, window.innerHeight, contextMenuHeight),
      };

      function openContextMenu() {
        setInteractionMenuPosition(null);
        setContextMenuPosition(nextPosition);
      }

      if (statusPickerOpen) {
        dismissStatusPicker();
      }

      requestEdgeExitThen(openContextMenu);
    },
    [
      dismissStatusPicker,
      requestEdgeExitThen,
      statusPickerOpen,
    ],
  );

  useEffect(() => {
    if (!contextMenuPosition) {
      return;
    }

    contextMenuRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus();
  }, [contextMenuPosition]);

  const handleDragStart = useCallback(() => {
    setInteractionMenuPosition(null);
    setStatusPickerOpen(false);
    setContextMenuPosition(null);
    const startDrag = () => {
      runDesktopCommand(startWindowDrag);
      setVisibleMotionForAction("drag");
      setPetState((currentState) =>
        transitionPetState(currentState, {
          type: "DRAG_STARTED",
          at: Date.now(),
        }),
      );
    };

    if (edgeInteractionState) {
      edgeDragPointerHeldRef.current = true;
      requestEdgeExitThen(() => {
        if (edgeDragPointerHeldRef.current) {
          startDrag();
        }
      });
      return;
    }

    startDrag();
  }, [edgeInteractionState, requestEdgeExitThen, setVisibleMotionForAction]);

  const handleDragEnd = useCallback(() => {
    if (edgeInteractionState) {
      edgeDragPointerHeldRef.current = false;
      return;
    }

    setVisibleMotionForAction("idle-breathe");
    setPetState((currentState) =>
      transitionPetState(currentState, { type: "DRAG_ENDED", at: Date.now() }),
    );
    void snapEdgeAfterDrag().catch(() => undefined);
  }, [edgeInteractionState, setVisibleMotionForAction, snapEdgeAfterDrag]);

  const handleResetPosition = useCallback(() => {
    runDesktopCommand(resetWindowPosition);
  }, []);

  const handleSettingsToggle = useCallback(() => {
    if (settingsOpen) {
      setSettingsOpen(false);
      return;
    }

    setInteractionMenuPosition(null);
    setStatusPickerOpen(false);
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
        ref={petSurfaceRef}
        className="pet-surface"
        aria-label="情侣桌宠 MVP"
        tabIndex={-1}
        onContextMenu={handlePetContextMenu}
      >
        <BubbleLayer
          message={bubble.message}
          visible={bubble.visible && !isEdgeInteractionActive}
        />
        <FramePetStage
          action={petState.action}
          motion={activeMotion}
          scale={settings.scale}
          petPackage={selectedPetPackage}
          edgeInteraction={edgeInteractionRenderState}
          onEdgePhaseComplete={handleEdgePhaseComplete}
          onEdgePointerEnter={handleEdgePointerEnter}
          onEdgeLoadError={handleEdgeLoadError}
          onPetClick={handlePetClick}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
        <RemoteMessageLayer
          message={isEdgeInteractionActive ? null : activeRemoteMessage}
          onAcknowledge={handleRemoteMessageAcknowledge}
        />
        {shouldShowPeerStatus && peerStatusView ? (
          <PeerStatusCard
            view={peerStatusView}
            imageCandidates={peerStatusImageCandidates}
          />
        ) : null}
        {messageComposerOpen ? (
          <MessageComposerPanel
            onSubmit={handleMessageComposerSubmit}
            onClose={closeMessageComposerPanel}
          />
        ) : null}
        {statusPickerOpen ? (
          <ActivityStatusPicker
            currentStatus={settings.sync.activityStatus}
            onSelect={handleActivityStatusSelect}
            onClose={closeStatusPicker}
          />
        ) : null}
      </section>

      {settingsOpen ? (
        <button
          className="settings-toggle is-visible"
          type="button"
          aria-expanded={true}
          aria-controls="settings-panel"
          onClick={handleSettingsToggle}
        >
          设置
        </button>
      ) : null}

      <div id="settings-panel" className={settingsOpen ? "settings-dock" : "settings-dock is-hidden"}>
        <div className="settings-dock-header">
          <h2>设置</h2>
          <button type="button" aria-label="关闭设置" onClick={closeSettingsPanel}>
            关闭
          </button>
        </div>
        <div className="settings-dock-body">
          <AppearancePanel
            packages={petPackages}
            selectedPackageId={selectedPetPackage.id}
            peerDeviceId={settings.sync.peerDeviceId}
            selectedPeerPackageId={
              selectedPeerPetPackageId
            }
            error={petPackageError}
            onImportPackage={handleImportPetPackage}
            onSelectPackage={handleSelectPetPackage}
            onSelectPeerPackage={handleSelectPeerPetPackage}
            onDeletePackage={handleDeletePetPackage}
          />
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
            onUnpair={handleUnpair}
          />
        </div>
      </div>

      {contextMenuPosition && !isEdgeInteractionActive ? (
        <div
          ref={contextMenuRef}
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
        open={Boolean(interactionMenuPosition) && !isEdgeInteractionActive}
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

function clampCenterAxis(
  position: number,
  viewportSize: number,
  beforeExtent: number,
  afterExtent: number,
) {
  const min = beforeExtent + contextMenuMargin;
  const max = viewportSize - afterExtent - contextMenuMargin;

  if (min > max) {
    return viewportSize / 2;
  }

  return Math.min(Math.max(position, min), max);
}

function getInteractionMenuPosition() {
  return {
    x: clampCenterAxis(
      window.innerWidth / 2,
      window.innerWidth,
      interactionMenuHorizontalRadius,
      interactionMenuHorizontalRadius,
    ),
    y: clampCenterAxis(
      window.innerHeight / 2 + 28,
      window.innerHeight,
      interactionMenuTopRadius,
      interactionMenuBottomRadius,
    ),
  };
}

function readRelayUserMessage(code: string, fallback: string) {
  if (code === "device_already_paired") {
    return "这台设备已在中继服务中完成绑定，请稍等自动同步或重新打开设置查看。";
  }

  return fallback;
}

function readUnpairUserMessage(code: string, fallback: string) {
  if (code === "relay_unavailable") {
    return "无法连接中继，取消绑定失败，请稍后重试。";
  }

  if (code === "auth_failed") {
    return "设备认证失败，取消绑定失败，请检查本机绑定信息。";
  }

  return fallback;
}
