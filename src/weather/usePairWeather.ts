import { useCallback, useEffect, useRef, useState } from "react";
import type { SyncErrorCode } from "../../shared/syncProtocol";
import type { PairWeatherResponse } from "../../shared/weatherProtocol";
import { RelayHttpClient } from "../sync/relayHttpClient";
import type { PairWeatherRequest } from "../sync/syncTypes";

export type PairWeatherUiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; response: PairWeatherResponse }
  | { status: "failed"; message: string; code?: SyncErrorCode };

export interface PairWeatherAuth extends PairWeatherRequest {
  relayUrl: string;
}

type PairWeatherClient = Pick<RelayHttpClient, "getPairWeather">;

export interface UsePairWeatherOptions {
  createClient?(relayUrl: string): PairWeatherClient;
}

const createRelayClient = (relayUrl: string): PairWeatherClient =>
  new RelayHttpClient(relayUrl);

export function usePairWeather({
  createClient = createRelayClient,
}: UsePairWeatherOptions = {}) {
  const [state, setState] = useState<PairWeatherUiState>({ status: "idle" });
  const requestSequence = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestSequence.current += 1;
    };
  }, []);

  const open = useCallback(
    async (auth: PairWeatherAuth) => {
      const sequence = ++requestSequence.current;
      setState({ status: "loading" });

      try {
        const result = await createClient(auth.relayUrl).getPairWeather({
          deviceId: auth.deviceId,
          deviceSecret: auth.deviceSecret,
          pairId: auth.pairId,
        });

        if (!mounted.current || sequence !== requestSequence.current) {
          return;
        }

        if (result.ok) {
          const { self, peer } = result;
          setState({ status: "loaded", response: { self, peer } });
          return;
        }

        setState({
          status: "failed",
          code: result.code,
          message: result.message,
        });
      } catch {
        if (mounted.current && sequence === requestSequence.current) {
          setState({
            status: "failed",
            code: "relay_unavailable",
            message: "Relay unavailable",
          });
        }
      }
    },
    [createClient],
  );

  const close = useCallback(() => {
    requestSequence.current += 1;
    setState({ status: "idle" });
  }, []);

  return { state, open, close };
}
