import { useEffect, useMemo, useRef, useState } from "react";
import type { SyncSettings } from "../settings/settingsTypes";
import { RealtimeClient, type RealtimeClientEvent } from "./realtimeClient";
import type { SyncRuntimeState } from "./syncTypes";

export interface UseRealtimeSyncCallbacks {
  onMessage(message: {
    id: string;
    fromDeviceId: string;
    text: string;
    at: string;
  }): void;
}

export function useRealtimeSync(
  sync: SyncSettings,
  callbacks: UseRealtimeSyncCallbacks,
): { state: SyncRuntimeState; client: RealtimeClient | null } {
  const callbacksRef = useRef(callbacks);
  const [state, setState] = useState<SyncRuntimeState>({
    status: sync.enabled ? "disconnected" : "disabled",
    peerPresence: "unknown",
    peerPresenceChangedAt: null,
    peerLastSeenAt: null,
    lastError: null,
  });

  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  const client = useMemo(() => {
    if (!sync.enabled || !sync.deviceId || !sync.deviceSecret || !sync.pairId) {
      return null;
    }

    return new RealtimeClient({
      relayUrl: sync.relayUrl,
      deviceId: sync.deviceId,
      deviceSecret: sync.deviceSecret,
      pairId: sync.pairId,
      onEvent: (event: RealtimeClientEvent) => {
        if (event.type === "message") {
          callbacksRef.current.onMessage({
            id: event.id,
            fromDeviceId: event.fromDeviceId,
            text: event.text,
            at: event.at,
          });
          return;
        }

        if (event.type === "status") {
          const isConnected = event.status === "connected";
          setState((current) => ({
            ...current,
            status: event.status,
            peerPresence: isConnected ? current.peerPresence : "unknown",
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
            peerPresenceChangedAt: event.changedAt,
            peerLastSeenAt: event.lastSeenAt,
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
        peerPresenceChangedAt: null,
        peerLastSeenAt: null,
        lastError: null,
      });
      return;
    }

    client.connect();
    return () => client.disconnect();
  }, [client, sync.enabled]);

  return { state, client };
}
