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
  dockWindowAtEdge,
  hideWindow,
  listenForClickThroughRecovered,
  listenForOpenSettings,
  moveWindowForAutoStep,
  closeMessageComposerSurface,
  openMessageComposerSurface,
  quitApp,
  readFocusTimer,
  readSettings as readDesktopSettings,
  resetWindowPosition,
  restoreWindowFromEdgePeek,
  setAlwaysOnTop,
  setClickThrough,
  setInteractiveRegions,
  snapWindowToEdgeIfNeeded,
  moveWindowForPointerDrag,
  writeSettings as writeDesktopSettings,
  writeFocusTimer,
} from "../desktop/windowCommands";
import {
  collectInteractiveRegions,
  observeInteractiveRegions,
} from "../desktop/interactiveRegions";
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
  revealRemoteSurprise,
} from "../sync/remoteMessageQueue";
import { SyncPanel } from "../sync/SyncPanel";
import { useRealtimeSync } from "../sync/useRealtimeSync";
import { useProfileSync } from "../profile/useProfileSync";
import type { SessionMessage } from "../sync/syncTypes";
import { MessageComposerPanel } from "../message/MessageComposerPanel";
import { SurpriseComposerPanel } from "../surprise/SurpriseComposerPanel";
import { recoverSurpriseContentFromFallbackText } from "../surprise/surpriseThemes";
import { getNextScheduledEvent } from "../pet-core/petScheduler";
import {
  createInitialPetState,
  transitionPetState,
  type PetState,
} from "../pet-core/petStateMachine";
import { FramePetStage } from "../renderer/FramePetStage";
import { SettingsPanel } from "../settings/SettingsPanel";
import { ProfilePanel } from "../settings/ProfilePanel";
import {
  loadSettings,
  mergeSettings,
  saveSettings,
  type SettingsPersistenceApi,
} from "../settings/settingsStore";
import type {
  PetSettings,
  ProfileSettings,
  SyncSettings,
} from "../settings/settingsTypes";
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
import type {
  StructuredMessageContent,
  SurpriseMessageContent,
} from "../../shared/syncProtocol";
import type { DeviceProfileV1 } from "../../shared/profileProtocol";
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
import type { EdgeNoticeState } from "../pet/edgeNotice";
import { preloadEdgeFrames } from "../pet/edgeFramePreloader";
import { projectStaticEdgeNotice } from "./edgeNoticeProjection";
import { FocusTimerCompletion } from "../focus-timer/FocusTimerCompletion";
import { FocusTimerPanel } from "../focus-timer/FocusTimerPanel";
import { FocusTimerPill } from "../focus-timer/FocusTimerPill";
import { projectFocusTimerPresentation } from "../focus-timer/focusTimerPresentation";
import { useFocusTimer } from "../focus-timer/useFocusTimer";
import { WeatherPanel } from "../weather/WeatherPanel";
import { usePairWeather } from "../weather/usePairWeather";
import { SparkLeaderboardPanel } from "../spark/SparkLeaderboardPanel";
import { useSparkStreak } from "../spark/useSparkStreak";
import type { SparkStreakSnapshotV1 } from "../../shared/sparkProtocol";

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

type ComposerMode =
  | "message"
  | "surprise"
  | "focus"
  | "weather"
  | "spark"
  | null;
type OpenComposerMode = Exclude<ComposerMode, null>;

function isSurpriseContent(
  content: StructuredMessageContent | undefined,
): content is SurpriseMessageContent {
  return content?.kind === "surprise";
}

function selectSurpriseMotion(
  motions: Parameters<typeof selectMotionForTag>[0],
): string | null {
  return (
    selectMotionForTag(motions, "surprise") ??
    selectMotionForTag(motions, "message")
  );
}

export function App() {
  const settingsApi = useMemo<SettingsPersistenceApi>(
    () => ({
      readSettings: readDesktopSettings,
      writeSettings: writeDesktopSettings,
    }),
    [],
  );
  const focusTimerApi = useMemo(
    () => ({ readFocusTimer, writeFocusTimer }),
    [],
  );
  const focusTimer = useFocusTimer({ api: focusTimerApi });
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
  const [composerMode, setComposerMode] = useState<ComposerMode>(null);
  const [focusTimerControlsOpen, setFocusTimerControlsOpen] = useState(false);
  const [focusCompletionVisibleSince, setFocusCompletionVisibleSince] =
    useState<number | null>(null);
  const [focusPresentationNow, setFocusPresentationNow] = useState(() =>
    Date.now(),
  );
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
  const settingsClickThroughTemporaryRestoreRef = useRef(false);
  const petSurfaceRef = useRef<HTMLElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const statusPickerReturnFocusRef = useRef<HTMLElement | null>(null);
  const edgeDragPointerHeldRef = useRef(false);
  const pendingPointerDragDeltaRef = useRef({ x: 0, y: 0 });
  const pointerDragFrameRef = useRef<number | null>(null);
  const pointerDragMoveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const customPointerDragActiveRef = useRef(false);
  const composerTransitionGenerationRef = useRef(0);
  const composerOpenTaskRef = useRef<Promise<boolean> | null>(null);
  const composerRestoreTaskRef = useRef<Promise<boolean> | null>(null);
  const composerNativeSurfaceOpenRef = useRef(false);
  const profileRetryConnectionActiveRef = useRef(false);
  const sparkSnapshotHandlerRef = useRef<
    (snapshot: SparkStreakSnapshotV1) => void
  >(() => undefined);
  const profileSync = useProfileSync({
    settings,
    updateSettings: (nextSettings) => {
      settingsRef.current = nextSettings;
      setSettings(nextSettings);
    },
    persistSettings: (nextSettings) => saveSettings(settingsApi, nextSettings),
  });
  const pairWeather = usePairWeather();

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
  const composerSurfaceActive = composerMode !== null;
  const transientSurfaceOwnerActive =
    composerSurfaceActive || isRemoteMessageActive;
  const focusReminderSurfaceOwnerActive =
    composerSurfaceActive ||
    isRemoteMessageActive ||
    settingsOpen ||
    statusPickerOpen ||
    Boolean(contextMenuPosition) ||
    Boolean(interactionMenuPosition);
  const focusTimerPresentation = useMemo(
    () =>
      projectFocusTimerPresentation(
        focusTimer.state,
        focusReminderSurfaceOwnerActive,
        focusPresentationNow,
        focusCompletionVisibleSince,
      ),
    [
      focusCompletionVisibleSince,
      focusPresentationNow,
      focusReminderSurfaceOwnerActive,
      focusTimer.state,
    ],
  );
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
        content?: StructuredMessageContent;
      }) => {
        const resolvedContent =
          message.content === undefined
            ? recoverSurpriseContentFromFallbackText(message.text)
            : message.content;
        const remoteMessage = {
          id: message.id,
          fromDeviceId: message.fromDeviceId,
          text: message.text,
          at: message.at,
          ...(resolvedContent === null ? {} : { content: resolvedContent }),
        };

        setSessionMessages((current) => [
          ...current,
          {
            id: message.id,
            direction: "received",
            text: message.text,
            at: message.at,
          },
        ]);

        const messageMotionId = isSurpriseContent(resolvedContent ?? undefined)
          ? selectSurpriseMotion(selectedPetPackage.motions)
          : selectMotionForTag(selectedPetPackage.motions, "message");

        if (messageMotionId) {
          setVisibleMotion(messageMotionId);
        }

        setRemoteMessages((current) => enqueueRemoteMessage(current, remoteMessage));
      },
      onPeerProfile: profileSync.rememberPeer,
      onSparkSnapshot: (snapshot: SparkStreakSnapshotV1) => {
        sparkSnapshotHandlerRef.current(snapshot);
      },
    }),
    [profileSync.rememberPeer, selectedPetPackage.motions, setVisibleMotion],
  );
  const realtime = useRealtimeSync(settings.sync, realtimeCallbacks);
  const sparkRelayClient = useMemo(
    () => new RelayHttpClient(settings.sync.relayUrl),
    [settings.sync.relayUrl],
  );
  const sparkStreak = useSparkStreak(
    settings.sync,
    sparkRelayClient,
    realtime.state.status,
  );
  sparkSnapshotHandlerRef.current = sparkStreak.acceptSnapshot;
  useEffect(() => {
    if (realtime.state.status !== "connected") {
      profileRetryConnectionActiveRef.current = false;
      return;
    }

    if (
      profileSync.saveState === "pending" &&
      !profileRetryConnectionActiveRef.current
    ) {
      profileRetryConnectionActiveRef.current = true;
      void profileSync.retryPendingProfile();
    }
  }, [
    profileSync.retryPendingProfile,
    profileSync.saveState,
    realtime.state.status,
  ]);
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
    handleLoadError: handleEdgeLoadError,
  } = useEdgeInteraction({
    packageId: selectedPetPackage.id,
    snapWindowToEdgeIfNeeded,
    restoreWindowFromEdgePeek,
    dockWindowAtEdge,
    resetWindowPosition,
    preloadFrames: preloadEdgeFrames,
    getProfile: getBuiltInEdgeProfile,
  });
  const isEdgeInteractionActive = Boolean(edgeInteractionState);
  const stableEdgeNotice = useMemo(
    () =>
      isEdgeInteractionActive
        ? projectStaticEdgeNotice(remoteMessages)
        : null,
    [isEdgeInteractionActive, remoteMessages],
  );
  const shouldShowPeerStatus =
    Boolean(peerStatusView) &&
    !settingsOpen &&
    !composerSurfaceActive &&
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

  const syncInteractiveRegions = useCallback(() => {
    runDesktopCommand(() =>
      setInteractiveRegions(
        collectInteractiveRegions(),
        window.devicePixelRatio || 1,
      ),
    );
  }, []);

  useEffect(() => observeInteractiveRegions(syncInteractiveRegions), [
    syncInteractiveRegions,
  ]);

  useEffect(() => {
    syncInteractiveRegions();
  }, [
    activeRemoteMessage?.id,
    activeRemoteMessage?.stage,
    bubble.id,
    bubble.visible,
    composerMode,
    contextMenuPosition,
    interactionMenuPosition,
    isEdgeInteractionActive,
    focusTimer.state.status,
    focusTimerControlsOpen,
    focusTimerPresentation,
    peerStatusView?.variant,
    settings.scale,
    settingsOpen,
    statusPickerOpen,
    syncInteractiveRegions,
  ]);

  useEffect(() => {
    if (
      focusTimer.state.status !== "completed-unacknowledged" ||
      focusTimer.state.collapsed
    ) {
      setFocusCompletionVisibleSince(null);
      return;
    }

    if (focusReminderSurfaceOwnerActive) {
      setFocusCompletionVisibleSince(null);
      return;
    }

    if (focusCompletionVisibleSince === null) {
      const visibleAt = Date.now();
      setFocusCompletionVisibleSince(visibleAt);
      setFocusPresentationNow(visibleAt);
    }
  }, [
    focusCompletionVisibleSince,
    focusReminderSurfaceOwnerActive,
    focusTimer.state,
  ]);

  useEffect(() => {
    if (
      focusTimer.state.status !== "completed-unacknowledged" ||
      focusTimer.state.collapsed ||
      focusReminderSurfaceOwnerActive ||
      focusCompletionVisibleSince === null
    ) {
      return;
    }

    const timerId = window.setInterval(() => {
      setFocusPresentationNow(Date.now());
    }, 250);

    return () => window.clearInterval(timerId);
  }, [
    focusCompletionVisibleSince,
    focusReminderSurfaceOwnerActive,
    focusTimer.state,
  ]);

  useEffect(() => {
    if (
      focusTimerPresentation === "collapsed" &&
      focusTimer.state.status === "completed-unacknowledged" &&
      !focusTimer.state.collapsed
    ) {
      focusTimer.collapse();
    }
  }, [focusTimer.collapse, focusTimer.state, focusTimerPresentation]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const persistSettings = useCallback(
    (nextSettings: PetSettings) => {
      void saveSettings(settingsApi, nextSettings).catch(() => undefined);
    },
    [settingsApi],
  );

  const restoreComposerPanel = useCallback((): Promise<boolean> => {
    composerTransitionGenerationRef.current += 1;

    if (composerRestoreTaskRef.current) {
      return composerRestoreTaskRef.current;
    }

    let restoreTask: Promise<boolean>;
    restoreTask = (async () => {
      const pendingOpen = composerOpenTaskRef.current;
      if (pendingOpen) {
        await pendingOpen;
      }

      if (!composerNativeSurfaceOpenRef.current) {
        setComposerMode(null);
        return true;
      }

      try {
        await closeMessageComposerSurface();
      } catch {
        return false;
      }

      composerNativeSurfaceOpenRef.current = false;
      setComposerMode(null);
      return true;
    })().finally(() => {
      if (composerRestoreTaskRef.current === restoreTask) {
        composerRestoreTaskRef.current = null;
      }
    });
    composerRestoreTaskRef.current = restoreTask;
    return restoreTask;
  }, []);

  const showSettingsPanel = useCallback(() => {
    const currentSettings = settingsRef.current;

    if (currentSettings.clickThrough) {
      settingsClickThroughTemporaryRestoreRef.current = true;
      runDesktopCommand(() => setClickThrough(false));
    }

    setContextMenuPosition(null);
    setInteractionMenuPosition(null);
    setSettingsOpen(true);
    setStatusPickerOpen(false);
    setBubble((current) => hideBubble(current));
  }, []);

  const openSettingsPanel = useCallback(() => {
    if (composerSurfaceActive) {
      return;
    }

    if (
      composerOpenTaskRef.current ||
      composerNativeSurfaceOpenRef.current
    ) {
      void restoreComposerPanel().then((restored) => {
        if (restored) {
          showSettingsPanel();
        }
      });
      return;
    }

    showSettingsPanel();
  }, [composerSurfaceActive, restoreComposerPanel, showSettingsPanel]);

  const closeSettingsPanel = useCallback(() => {
    setSettingsOpen(false);

    if (!settingsClickThroughTemporaryRestoreRef.current) {
      return;
    }

    settingsClickThroughTemporaryRestoreRef.current = false;

    if (settingsRef.current.clickThrough) {
      runDesktopCommand(() => setClickThrough(true));
    }
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

    void listenForClickThroughRecovered(() => undefined)
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
  }, []);

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

    const messageId = activeMessage.id;
    const dismissTimer = window.setTimeout(() => {
      setRemoteMessages((current) =>
        completeRemoteMessageDismissal(current, messageId),
      );
    }, remoteMessageDismissDelayMs);

    return () => {
      window.clearTimeout(dismissTimer);
    };
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
        settingsClickThroughTemporaryRestoreRef.current = false;
        closeSettingsPanel();
      }

      if (patch.clickThrough === false) {
        settingsClickThroughTemporaryRestoreRef.current = false;
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
    [closeSettingsPanel, persistSettings, settings, settingsOpen],
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

  const storeAcceptedPair = useCallback(
    (
      sync: SyncSettings,
      pairId: string,
      peerDeviceId: string,
      peerProfile?: DeviceProfileV1,
    ) => {
      const current = settingsRef.current;
      handleSettingsChange({
        sync: { ...sync, pairId, peerDeviceId },
        profile:
          peerProfile === undefined
            ? current.profile
            : storePeerProfile(current.profile, peerDeviceId, peerProfile),
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
        storeAcceptedPair(
          currentSync,
          result.pairId,
          result.peerDeviceId,
          result.peerProfile,
        );
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
  }, [pairCode, storeAcceptedPair]);

  const handleCreatePairCode = useCallback(async () => {
    const current = settingsRef.current;
    const currentSync = current.sync;
    if (current.profile.local === null) {
      setSyncError("请先完成基本信息");
      return;
    }

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
      profile: current.profile.local,
    });

    if (result.ok) {
      await profileSync.markLocalProfileSynced(current.profile.local);
      setPairCode({ code: result.code, expiresAt: result.expiresAt });
      return;
    }

    setSyncError(readRelayUserMessage(result.code, result.message));
  }, [handleSyncChange, profileSync.markLocalProfileSynced]);

  const handleAcceptPairCode = useCallback(
    async (code: string) => {
      const current = settingsRef.current;
      if (current.profile.local === null) {
        setSyncError("请先完成基本信息");
        return;
      }

      const identity = ensureDeviceIdentity({
        ...current.sync,
        enabled: true,
      });
      handleSyncChange(identity);
      setSyncError(null);

      const result = await new RelayHttpClient(identity.relayUrl).acceptPairCode({
        deviceId: identity.deviceId ?? "",
        deviceSecret: identity.deviceSecret ?? "",
        displayName: "Q 版桌宠",
        code,
        profile: current.profile.local,
      });

      if (result.ok) {
        await profileSync.markLocalProfileSynced(current.profile.local);
        storeAcceptedPair(
          identity,
          result.pairId,
          result.peerDeviceId,
          result.peerProfile,
        );
        setPairCode(null);
        setSessionMessages([]);
        return;
      }

      setSyncError(readRelayUserMessage(result.code, result.message));
    },
    [
      handleSyncChange,
      profileSync.markLocalProfileSynced,
      storeAcceptedPair,
    ],
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

  const handleSendSurprise = useCallback(
    (content: SurpriseMessageContent, fallbackText: string) => {
      if (
        realtime.state.status !== "connected" ||
        realtime.state.peerPresence !== "online"
      ) {
        setSyncError("对方当前不在线");
        return { ok: false as const, message: "对方当前不在线" };
      }

      const result = realtime.client?.sendMessage(fallbackText, content) ?? {
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
          text: fallbackText.trim(),
          at: new Date().toISOString(),
        },
      ]);

      if (settingsRef.current.bubblesEnabled) {
        setBubble(
          showBubble("小心意已送出", {
            durationMs: sentMessageBubbleDurationMs,
          }),
        );
      }

      const surpriseMotionId = selectSurpriseMotion(selectedPetPackage.motions);

      if (surpriseMotionId) {
        setVisibleMotion(surpriseMotionId);
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

  const handleRemoteSurpriseReveal = useCallback((messageId: string) => {
    setRemoteMessages((current) => revealRemoteSurprise(current, messageId));
  }, []);

  const handleRemoteSurpriseDismiss = useCallback((messageId: string) => {
    setRemoteMessages((current) =>
      markRemoteMessageDismissing(current, messageId),
    );
  }, []);

  const handleEdgeNoticeActivate = useCallback(
    (notice: NonNullable<EdgeNoticeState["active"]>) => {
      if (notice.kind === "presence") {
        return;
      }

      requestEdgeExitThen(() => undefined);
    },
    [requestEdgeExitThen],
  );

  const handleEdgeRecovery = useCallback(() => {
    void handleEdgeLoadError();
  }, [handleEdgeLoadError]);

  const openInteractionMenu = useCallback(() => {
    if (settingsOpen || transientSurfaceOwnerActive) {
      return;
    }

    setStatusPickerOpen(false);
    setContextMenuPosition(null);
    setInteractionMenuPosition((current) =>
      current ? null : getInteractionMenuPosition(),
    );
  }, [settingsOpen, transientSurfaceOwnerActive]);

  const handlePetClick = useCallback(() => {
    if (settingsOpen || transientSurfaceOwnerActive) {
      return;
    }

    requestEdgeExitThen(openInteractionMenu);
  }, [
    openInteractionMenu,
    requestEdgeExitThen,
    settingsOpen,
    transientSurfaceOwnerActive,
  ]);

  const openComposerPanel = useCallback((mode: OpenComposerMode) => {
    if (
      settingsOpen ||
      transientSurfaceOwnerActive ||
      composerOpenTaskRef.current ||
      composerRestoreTaskRef.current
    ) {
      return Promise.resolve(false);
    }

    setInteractionMenuPosition(null);
    setStatusPickerOpen(false);
    setContextMenuPosition(null);
    const generation = ++composerTransitionGenerationRef.current;

    let openTask: Promise<boolean>;
    openTask = (async () => {
      try {
        await openMessageComposerSurface(mode);
      } catch {
        return false;
      }

      composerNativeSurfaceOpenRef.current = true;
      if (composerTransitionGenerationRef.current !== generation) {
        return false;
      }

      setBubble((current) => hideBubble(current));
      setComposerMode(mode);
      return true;
    })().finally(() => {
      if (composerOpenTaskRef.current === openTask) {
        composerOpenTaskRef.current = null;
      }
    });
    composerOpenTaskRef.current = openTask;
    return openTask;
  }, [settingsOpen, transientSurfaceOwnerActive]);

  const openMessageComposerPanel = useCallback(() => {
    void openComposerPanel("message");
  }, [openComposerPanel]);

  const openSurpriseComposerPanel = useCallback(() => {
    void openComposerPanel("surprise");
  }, [openComposerPanel]);

  const requestPairWeather = useCallback(() => {
    const { relayUrl, deviceId, deviceSecret, pairId } =
      settingsRef.current.sync;

    if (!relayUrl || !deviceId || !deviceSecret || !pairId) {
      return;
    }

    void pairWeather.open({ relayUrl, deviceId, deviceSecret, pairId });
  }, [pairWeather.open]);

  const openWeatherPanel = useCallback(() => {
    void openComposerPanel("weather").then((opened) => {
      if (opened) {
        requestPairWeather();
      }
    });
  }, [openComposerPanel, requestPairWeather]);

  const openSparkPanel = useCallback(() => {
    void openComposerPanel("spark").then((opened) => {
      if (opened) {
        void sparkStreak.requestLeaderboard();
      }
    });
  }, [openComposerPanel, sparkStreak.requestLeaderboard]);

  const openFocusTimerPanel = useCallback(() => {
    setBubble((current) => hideBubble(current));

    if (
      focusTimer.state.status === "running" ||
      focusTimer.state.status === "paused"
    ) {
      setFocusTimerControlsOpen(true);
      return;
    }

    if (focusTimer.state.status === "completed-unacknowledged") {
      const visibleAt = Date.now();
      focusTimer.expand();
      setFocusCompletionVisibleSince(visibleAt);
      setFocusPresentationNow(visibleAt);
      return;
    }

    void openComposerPanel("focus");
  }, [focusTimer.expand, focusTimer.state, openComposerPanel]);

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
    if (settingsOpen || transientSurfaceOwnerActive) {
      return;
    }

    statusPickerReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setStatusPickerOpen(true);
    setBubble((current) => hideBubble(current));
  }, [settingsOpen, transientSurfaceOwnerActive]);

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

    if (selection === "open-focus-timer") {
      openFocusTimerPanel();
      return;
    }

    if (selection === "open-weather") {
      openWeatherPanel();
      return;
    }

    if (selection === "open-spark") {
      openSparkPanel();
      return;
    }

    const sendable =
      settingsRef.current.sync.enabled &&
      Boolean(settingsRef.current.sync.pairId) &&
      realtime.state.status === "connected" &&
      realtime.state.peerPresence === "online";

    if (selection === "send-message") {
      if (!sendable) {
        setBubble(showBubble("对方在线后再发消息吧。", { durationMs: 5000 }));
        return;
      }

      openMessageComposerPanel();
      return;
    }

    if (selection === "send-surprise") {
      if (!sendable) {
        setBubble(showBubble("对方在线后再发消息吧。", { durationMs: 5000 }));
        return;
      }

      openSurpriseComposerPanel();
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
    openFocusTimerPanel,
    openSparkPanel,
    openSurpriseComposerPanel,
    openStatusPicker,
    openWeatherPanel,
    realtime.state.peerPresence,
    realtime.state.status,
    selectedPetPackage,
    setVisibleMotion,
  ]);

  const closeComposerPanel = useCallback(async () => {
    const closingMode = composerMode;
    const restored = await restoreComposerPanel();
    if (restored && closingMode === "weather") {
      pairWeather.close();
    }
    if (restored && closingMode === "spark") {
      sparkStreak.clearLeaderboard();
    }

    return restored;
  }, [
    composerMode,
    pairWeather.close,
    restoreComposerPanel,
    sparkStreak.clearLeaderboard,
  ]);

  const openSettingsFromWeather = useCallback(() => {
    void closeComposerPanel().then((restored) => {
      if (restored) {
        showSettingsPanel();
      }
    });
  }, [closeComposerPanel, showSettingsPanel]);

  const handleFocusTimerStart = useCallback(
    (minutes: number) => {
      focusTimer.start(minutes);
      setFocusTimerControlsOpen(false);
      closeComposerPanel();
    },
    [closeComposerPanel, focusTimer.start],
  );

  const handleFocusTimerEnd = useCallback(() => {
    setFocusTimerControlsOpen(false);
    focusTimer.end();
  }, [focusTimer.end]);

  const handleFocusTimerAcknowledge = useCallback(() => {
    setFocusCompletionVisibleSince(null);
    focusTimer.acknowledge();
  }, [focusTimer.acknowledge]);

  const handleFocusTimerRepeat = useCallback(() => {
    setFocusCompletionVisibleSince(null);
    setFocusTimerControlsOpen(false);
    focusTimer.repeat();
  }, [focusTimer.repeat]);

  const handleFocusTimerExpand = useCallback(() => {
    const visibleAt = Date.now();
    focusTimer.expand();
    setFocusCompletionVisibleSince(visibleAt);
    setFocusPresentationNow(visibleAt);
  }, [focusTimer.expand]);

  const handleMessageComposerSubmit = useCallback(
    (text: string) => handleSendMessage(text),
    [handleSendMessage],
  );

  const handlePetContextMenu = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (
        isEdgeInteractionActive ||
        settingsOpen ||
        transientSurfaceOwnerActive
      ) {
        return;
      }

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
      isEdgeInteractionActive,
      requestEdgeExitThen,
      settingsOpen,
      statusPickerOpen,
      transientSurfaceOwnerActive,
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

  const enqueuePointerDragMove = useCallback((delta: { x: number; y: number }) => {
    const runMove = () =>
      moveWindowForPointerDrag(delta.x, delta.y).catch(() => undefined);
    const nextMove = pointerDragMoveQueueRef.current.then(runMove, runMove);

    pointerDragMoveQueueRef.current = nextMove;
    return nextMove;
  }, []);

  const flushPendingPointerDrag = useCallback((): Promise<void> => {
    if (pointerDragFrameRef.current !== null) {
      window.cancelAnimationFrame(pointerDragFrameRef.current);
      pointerDragFrameRef.current = null;
    }

    const delta = pendingPointerDragDeltaRef.current;

    if (delta.x === 0 && delta.y === 0) {
      return pointerDragMoveQueueRef.current;
    }

    pendingPointerDragDeltaRef.current = { x: 0, y: 0 };
    return enqueuePointerDragMove(delta);
  }, [enqueuePointerDragMove]);

  const clearPendingPointerDrag = useCallback(() => {
    if (pointerDragFrameRef.current !== null) {
      window.cancelAnimationFrame(pointerDragFrameRef.current);
      pointerDragFrameRef.current = null;
    }

    pendingPointerDragDeltaRef.current = { x: 0, y: 0 };
  }, []);

  useEffect(
    () => () => {
      if (pointerDragFrameRef.current !== null) {
        window.cancelAnimationFrame(pointerDragFrameRef.current);
        pointerDragFrameRef.current = null;
      }
    },
    [],
  );

  const handleDragMove = useCallback(
    (delta: { x: number; y: number }) => {
      if (
        !customPointerDragActiveRef.current &&
        !edgeDragPointerHeldRef.current
      ) {
        return;
      }

      pendingPointerDragDeltaRef.current = {
        x: pendingPointerDragDeltaRef.current.x + delta.x,
        y: pendingPointerDragDeltaRef.current.y + delta.y,
      };

      if (!customPointerDragActiveRef.current) {
        return;
      }

      if (pointerDragFrameRef.current !== null) {
        return;
      }

      pointerDragFrameRef.current = window.requestAnimationFrame(() => {
        pointerDragFrameRef.current = null;
        flushPendingPointerDrag();
      });
    },
    [flushPendingPointerDrag],
  );

  const handleDragStart = useCallback(() => {
    setInteractionMenuPosition(null);
    setStatusPickerOpen(false);
    setContextMenuPosition(null);
    const startDrag = () => {
      customPointerDragActiveRef.current = true;
      setVisibleMotionForAction("drag");
      setPetState((currentState) =>
        transitionPetState(currentState, {
          type: "DRAG_STARTED",
          at: Date.now(),
        }),
      );
      void flushPendingPointerDrag();
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
  }, [
    edgeInteractionState,
    flushPendingPointerDrag,
    requestEdgeExitThen,
    setVisibleMotionForAction,
  ]);

  const handleDragEnd = useCallback(() => {
    void (async () => {
      if (edgeInteractionState) {
        edgeDragPointerHeldRef.current = false;

        if (!customPointerDragActiveRef.current) {
          clearPendingPointerDrag();
        }

        return;
      }

      await flushPendingPointerDrag();
      customPointerDragActiveRef.current = false;
      setVisibleMotionForAction("idle-breathe");
      setPetState((currentState) =>
        transitionPetState(currentState, { type: "DRAG_ENDED", at: Date.now() }),
      );
      await snapEdgeAfterDrag().catch(() => undefined);
    })();
  }, [
    clearPendingPointerDrag,
    edgeInteractionState,
    flushPendingPointerDrag,
    setVisibleMotionForAction,
    snapEdgeAfterDrag,
  ]);

  const handleResetPosition = useCallback(() => {
    runDesktopCommand(resetWindowPosition);
  }, []);

  const handleSettingsToggle = useCallback(() => {
    if (settingsOpen) {
      closeSettingsPanel();
      return;
    }

    openSettingsPanel();
  }, [closeSettingsPanel, openSettingsPanel, settingsOpen]);

  const handleContextSettings = useCallback(() => {
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

  const sparkSnapshotCandidate =
    "snapshot" in sparkStreak.snapshotState
      ? sparkStreak.snapshotState.snapshot ?? null
      : null;
  const sparkSnapshotMatchesPair =
    sparkSnapshotCandidate?.pairId === settings.sync.pairId;
  const currentSparkSnapshot = sparkSnapshotMatchesPair
    ? sparkSnapshotCandidate
    : null;
  const currentSparkAvailability =
    sparkSnapshotCandidate !== null && !sparkSnapshotMatchesPair
      ? "loading"
      : sparkStreak.snapshotState.status === "ready"
        ? "available"
        : sparkStreak.snapshotState.status === "failed"
          ? "unavailable"
          : "loading";
  const currentSparkLeaderboardState =
    sparkStreak.leaderboardState.status === "ready" &&
    sparkStreak.leaderboardState.response.snapshot.pairId !==
      settings.sync.pairId
      ? ({ status: "loading" } as const)
      : sparkStreak.leaderboardState;

  return (
    <main className="app-shell">
      <section
        ref={petSurfaceRef}
        className={`pet-surface${composerSurfaceActive ? " composer-active" : ""}`}
        aria-label="情侣桌宠 MVP"
        aria-hidden={composerSurfaceActive ? "true" : undefined}
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
          edgeNotice={stableEdgeNotice}
          onEdgeLoadError={handleEdgeRecovery}
          onEdgeNoticeActivate={handleEdgeNoticeActivate}
          onPetClick={handlePetClick}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
        >
          {shouldShowPeerStatus && peerStatusView ? (
            <PeerStatusCard
              view={peerStatusView}
              imageCandidates={peerStatusImageCandidates}
            />
          ) : null}
        </FramePetStage>
        {(focusTimer.state.status === "running" ||
          focusTimer.state.status === "paused") &&
        !focusReminderSurfaceOwnerActive ? (
          <FocusTimerPill
            state={focusTimer.state}
            now={focusTimer.now}
            controlsOpen={focusTimerControlsOpen}
            onToggleControls={() =>
              setFocusTimerControlsOpen((current) => !current)
            }
            onPause={focusTimer.pause}
            onResume={focusTimer.resume}
            onEnd={handleFocusTimerEnd}
            edge={isEdgeInteractionActive}
            edgeSide={edgeInteractionState?.side}
          />
        ) : null}
        {focusTimer.state.status === "completed-unacknowledged" ? (
          <FocusTimerCompletion
            state={focusTimer.state}
            presentation={focusTimerPresentation}
            onAcknowledge={handleFocusTimerAcknowledge}
            onRepeat={handleFocusTimerRepeat}
            onExpand={handleFocusTimerExpand}
            edge={isEdgeInteractionActive}
            edgeSide={edgeInteractionState?.side}
          />
        ) : null}
        <RemoteMessageLayer
          message={
            isEdgeInteractionActive || settingsOpen ? null : activeRemoteMessage
          }
          onAcknowledge={handleRemoteMessageAcknowledge}
          onReveal={handleRemoteSurpriseReveal}
          onDismiss={handleRemoteSurpriseDismiss}
        />
        {statusPickerOpen ? (
          <ActivityStatusPicker
            currentStatus={settings.sync.activityStatus}
            onSelect={handleActivityStatusSelect}
            onClose={closeStatusPicker}
          />
        ) : null}
      </section>

      {composerSurfaceActive ? (
        <div className="composer-surface">
          {composerMode === "message" ? (
            <MessageComposerPanel
              onSubmit={handleMessageComposerSubmit}
              onClose={closeComposerPanel}
            />
          ) : null}
          {composerMode === "surprise" ? (
            <SurpriseComposerPanel
              onSubmit={handleSendSurprise}
              onClose={closeComposerPanel}
            />
          ) : null}
          {composerMode === "focus" ? (
            <FocusTimerPanel
              initialMinutes={
                focusTimer.state.status === "idle"
                  ? focusTimer.state.lastDurationMinutes
                  : focusTimer.state.durationMinutes
              }
              onStart={handleFocusTimerStart}
              onClose={closeComposerPanel}
            />
          ) : null}
          {composerMode === "weather" ? (
            <div
              className="weather-composer-region"
              data-desktop-interactive-region=""
              style={{ width: 424, height: 466 }}
            >
              <WeatherPanel
                state={pairWeather.state}
                paired={Boolean(
                  settings.sync.pairId && settings.sync.peerDeviceId,
                )}
                profileComplete={profileSync.isComplete}
                onClose={closeComposerPanel}
                onRetry={requestPairWeather}
                onOpenSettings={openSettingsFromWeather}
                onOpenBinding={openSettingsFromWeather}
              />
            </div>
          ) : null}
          {composerMode === "spark" ? (
            <div
              className="spark-composer-region"
              data-desktop-interactive-region=""
            >
              <SparkLeaderboardPanel
                state={currentSparkLeaderboardState}
                paired={Boolean(
                  settings.sync.pairId && settings.sync.peerDeviceId,
                )}
                onClose={closeComposerPanel}
                onRetry={sparkStreak.requestLeaderboard}
                onOpenBinding={openSettingsFromWeather}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {settingsOpen ? (
        <button
          className="settings-toggle is-visible"
          type="button"
          aria-expanded={true}
          aria-controls="settings-panel"
          data-desktop-interactive-region=""
          onClick={handleSettingsToggle}
        >
          设置
        </button>
      ) : null}

      <div
        id="settings-panel"
        className={settingsOpen ? "settings-dock" : "settings-dock is-hidden"}
        data-desktop-interactive-region=""
      >
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
          <ProfilePanel
            profile={settings.profile.local}
            searchState={profileSync.searchState}
            searchResults={profileSync.searchResults}
            saveState={profileSync.saveState}
            onSearch={profileSync.searchCities}
            onSave={profileSync.saveLocalProfile}
          />
          <SyncPanel
            sync={settings.sync}
            status={syncStatus}
            messages={sessionMessages}
            pairCode={pairCode}
            profileComplete={profileSync.isComplete}
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
          data-desktop-interactive-region=""
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
        paired={Boolean(settings.sync.pairId && settings.sync.peerDeviceId)}
        snapshot={currentSparkSnapshot}
        sparkAvailability={currentSparkAvailability}
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

function storePeerProfile(
  profileSettings: ProfileSettings,
  deviceId: string,
  incoming: DeviceProfileV1,
): ProfileSettings {
  const peers = profileSettings.peerByDeviceId;
  const existing = Object.prototype.hasOwnProperty.call(peers, deviceId)
    ? peers[deviceId]
    : undefined;
  if (existing && !isNewerProfile(incoming, existing)) {
    return profileSettings;
  }

  return {
    ...profileSettings,
    peerByDeviceId: Object.fromEntries([
      ...Object.entries(peers).filter(([storedId]) => storedId !== deviceId),
      [deviceId, incoming],
    ]),
  };
}

function isNewerProfile(
  incoming: DeviceProfileV1,
  existing: DeviceProfileV1,
): boolean {
  const incomingTime = Date.parse(incoming.updatedAt);
  const existingTime = Date.parse(existing.updatedAt);
  if (Number.isFinite(incomingTime) && Number.isFinite(existingTime)) {
    return incomingTime > existingTime;
  }

  return incoming.updatedAt > existing.updatedAt;
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
