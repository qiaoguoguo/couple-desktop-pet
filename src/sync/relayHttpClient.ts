import {
  isSyncErrorCode,
  type AcceptPairCodeRequest,
  type AcceptPairCodeResponse,
  type CreatePairCodeRequest,
  type CreatePairCodeResponse,
  type PairCodeStatusRequest,
  type PairCodeStatusResponse,
  type SyncErrorCode,
  type UnpairRequest,
  type UnpairResponse,
} from "../../shared/syncProtocol";
import {
  readDeviceProfile,
  validateProfileUpdate,
} from "../../shared/profileProtocol";
import {
  readPairWeatherResponse,
  type PairWeatherResponse,
} from "../../shared/weatherProtocol";
import type {
  LocationSearchRequest,
  LocationSearchResponse,
  PairWeatherRequest,
  SaveProfileRequest,
  SaveProfileResponse,
} from "./syncTypes";

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

  unpair(request: UnpairRequest): Promise<RelayResult<UnpairResponse>> {
    return this.post("/pairs/unpair", request);
  }

  searchLocations(
    request: LocationSearchRequest,
  ): Promise<RelayResult<LocationSearchResponse>> {
    return this.request(
      "/locations/search",
      "POST",
      request,
      readLocationSearchResponse,
    );
  }

  saveProfile(
    request: SaveProfileRequest,
  ): Promise<RelayResult<SaveProfileResponse>> {
    return this.request(
      "/devices/profile",
      "PUT",
      request,
      readSaveProfileResponse,
    );
  }

  getPairWeather(
    request: PairWeatherRequest,
  ): Promise<RelayResult<PairWeatherResponse>> {
    return this.request(
      "/pairs/weather",
      "POST",
      request,
      readPairWeatherResponse,
    );
  }

  private post<T extends object>(
    path: string,
    body: unknown,
  ): Promise<RelayResult<T>> {
    return this.request(path, "POST", body, readUncheckedResponse<T>);
  }

  private async request<T extends object>(
    path: string,
    method: "POST" | "PUT",
    body: unknown,
    readSuccess: (input: unknown) => T | null,
  ): Promise<RelayResult<T>> {
    try {
      const fetchImpl = this.fetchImpl;
      const response = await fetchImpl(new URL(path, this.relayUrl).toString(), {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await response.json()) as unknown;

      if (!response.ok) {
        return readRelayError(json);
      }

      const parsed = readSuccess(json);
      if (parsed === null) {
        return relayUnavailable();
      }

      return { ok: true, ...parsed };
    } catch {
      return relayUnavailable();
    }
  }
}

function readLocationSearchResponse(input: unknown): LocationSearchResponse | null {
  if (
    !isRecord(input) ||
    !Array.isArray(input.locations) ||
    input.locations.length > 5
  ) {
    return null;
  }

  const locations = [];
  for (const location of input.locations) {
    const parsed = validateProfileUpdate({
      version: 1,
      nickname: "profile",
      city: location,
    });
    if (!parsed.ok) {
      return null;
    }
    locations.push(parsed.profile.city);
  }

  return { locations };
}

function readSaveProfileResponse(input: unknown): SaveProfileResponse | null {
  if (!isRecord(input)) {
    return null;
  }

  const profile = readDeviceProfile(input.profile);
  return profile === null ? null : { profile };
}

function readUncheckedResponse<T extends object>(input: unknown): T | null {
  return isRecord(input) ? (input as T) : null;
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

  return relayUnavailable();
}

function relayUnavailable(): {
  ok: false;
  code: "relay_unavailable";
  message: string;
} {
  return { ok: false, code: "relay_unavailable", message: "Relay unavailable" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
