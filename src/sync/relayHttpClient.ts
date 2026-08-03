import {
  isSyncErrorCode,
  type AcceptPairCodeRequest,
  type AcceptPairCodeResponse,
  type CreatePairCodeRequest,
  type CreatePairCodeResponse,
  type PairCodeStatusRequest,
  type PairCodeStatusResponse,
  type SyncErrorCode,
} from "../../shared/syncProtocol";

export type RelayResult<T> =
  | ({ ok: true } & T)
  | { ok: false; code: SyncErrorCode; message: string };

type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const defaultFetch: FetchFn = (input, init) => globalThis.fetch(input, init);

export class RelayHttpClient {
  constructor(
    private readonly relayUrl: string,
    private readonly fetchImpl: FetchFn = defaultFetch,
  ) {}

  createPairCode(
    request: CreatePairCodeRequest,
  ): Promise<RelayResult<CreatePairCodeResponse>> {
    return this.post("/pair-codes", request);
  }

  acceptPairCode(
    request: AcceptPairCodeRequest,
  ): Promise<RelayResult<AcceptPairCodeResponse>> {
    return this.post("/pairs/accept", request);
  }

  getPairCodeStatus(
    request: PairCodeStatusRequest,
  ): Promise<RelayResult<PairCodeStatusResponse>> {
    return this.post("/pair-codes/status", request);
  }

  private async post<T>(path: string, body: unknown): Promise<RelayResult<T>> {
    try {
      const fetchImpl = this.fetchImpl;
      const response = await fetchImpl(new URL(path, this.relayUrl).toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await response.json()) as unknown;

      if (!response.ok) {
        return readRelayError(json);
      }

      return { ok: true, ...(json as T) };
    } catch {
      return { ok: false, code: "relay_unavailable", message: "Relay unavailable" };
    }
  }
}

function readRelayError(
  input: unknown,
): { ok: false; code: SyncErrorCode; message: string } {
  if (
    isRecord(input) &&
    isRecord(input.error) &&
    typeof input.error.code === "string" &&
    isSyncErrorCode(input.error.code) &&
    typeof input.error.message === "string"
  ) {
    return {
      ok: false,
      code: input.error.code as SyncErrorCode,
      message: input.error.message,
    };
  }

  return { ok: false, code: "relay_unavailable", message: "Relay unavailable" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
