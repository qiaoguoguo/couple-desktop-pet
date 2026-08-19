import { useEffect, useMemo, useRef, useState } from "react";
import type { DeviceProfileV1 } from "../../shared/profileProtocol";
import type { SparkStreakSnapshotV1 } from "../../shared/sparkProtocol";
import type { SyncSettings } from "../settings/settingsTypes";
import type { StructuredMessageContent } from "../../shared/syncProtocol";
import { RealtimeClient, type RealtimeClientEvent } from "./realtimeClient";
import type { SyncRuntimeState } from "./syncTypes";

export interface UseRealtimeSyncCallbacks {
  onMessage(message: {
    id: string;
    fromDeviceId: string;
    text: string;
    at: string;
    content?: StructuredMessageContent;
  }): void;
  onPeerProfile?(peerDeviceId: string, profile: DeviceProfileV1): void;
  onSparkSnapshot?(snapshot: SparkStreakSnapshotV1): void;
}

export function useRealtimeSync(
  sync: SyncSettings,
  callbacks: UseRealtimeSyncCallbacks,
): { state: SyncRuntimeState; client: RealtimeClient | null } {
  const callbacksRef = useRef(callbacks);
  const [e2eOverrideState, setE2eOverrideState] =
    useState<SyncRuntimeState | null>(null);
  const [state, setState] = useState<SyncRuntimeState>({
    status: sync.enabled ? "disconnected" : "disabled",
    peerPresence: "unknown",
    peerActivityStatus: null,
    peerPresenceChangedAt: null,
    peerLastSeenAt: null,
    lastError: null,
  });

  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  useEffect(() => {
    if (import.meta.env.VITE_TAURI_E2E === "1") {
      let cancelled = false;
      let unsubscribeState = () => {};
      let unsubscribeMessages = () => {};

      void import("./e2eRealtimeOverride").then((module) => {
        if (cancelled) {
          return;
        }
        unsubscribeState = module.subscribeToE2eRealtimeOverride(setE2eOverrideState);
        unsubscribeMessages = module.subscribeToE2eIncomingMessages((message) => {
          callbacksRef.current.onMessage(message);
        });
      });

      return () => {
        cancelled = true;
        unsubscribeState();
        unsubscribeMessages();
      };
    }

    return undefined;
  }, []);

  const client = useMemo(() => {
    if (!sync.enabled || !sync.deviceId || !sync.deviceSecret || !sync.pairId) {
      return null;
    }

    return new RealtimeClient({
      relayUrl: sync.relayUrl,
      deviceId: sync.deviceId,
      deviceSecret: sync.deviceSecret,
      pairId: sync.pairId,
      activityStatus: sync.activityStatus,
      onEvent: (event: RealtimeClientEvent) => {
        if (event.type === "message") {
          callbacksRef.current.onMessage({
            id: event.id,
            fromDeviceId: event.fromDeviceId,
            text: event.text,
            at: event.at,
            ...(event.content === undefined ? {} : { content: event.content }),
          });
          return;
        }

        if (event.type === "peerProfile") {
          callbacksRef.current.onPeerProfile?.(
            event.peerDeviceId,
            event.profile,
          );
          return;
        }

        if (event.type === "spark") {
          callbacksRef.current.onSparkSnapshot?.(event.snapshot);
          return;
        }

        if (event.type === "status") {
          const isConnected = event.status === "connected";
          setState((current) => ({
            ...current,
            status: event.status,
            peerPresence: isConnected ? current.peerPresence : "unknown",
            peerActivityStatus: isConnected ? current.peerActivityStatus : null,
            peerPresenceChangedAt: isConnected
              ? current.peerPresenceChangedAt
              : null,
            peerLastSeenAt: isConnected ? current.peerLastSeenAt : null,
          }));
          return;
        }

        if (event.type === "presence") {
          setState((current) => ({
            ...current,
            peerPresence: event.peerPresence,
            peerActivityStatus:
              event.peerPresence === "online" ? null : current.peerActivityStatus,
            peerPresenceChangedAt: event.changedAt,
            peerLastSeenAt: event.lastSeenAt,
          }));
          return;
        }

        if (event.type === "peerStatus") {
          setState((current) => ({
            ...current,
            peerActivityStatus: event.peerActivityStatus,
          }));
          return;
        }

        if (event.type === "error") {
          setState((current) => ({ ...current, lastError: event.message }));
        }
      },
    });
  }, [sync.deviceId, sync.deviceSecret, sync.enabled, sync.pairId, sync.relayUrl]);

  useEffect(() => {
    if (!client) {
      setState({
        status: sync.enabled ? "disconnected" : "disabled",
        peerPresence: "unknown",
        peerActivityStatus: null,
        peerPresenceChangedAt: null,
        peerLastSeenAt: null,
        lastError: null,
      });
      return;
    }

    client.connect();
    return () => client.disconnect();
  }, [client, sync.enabled]);

  return { state: e2eOverrideState ?? state, client };
}
