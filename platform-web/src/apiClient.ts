import type {
  PlatformDevicePlatform,
  PlatformReleaseChannel,
  PlatformRole,
} from "../../shared/platformProtocol";

export interface PlatformUser {
  id: string;
  email: string;
  displayName: string;
  role: PlatformRole;
}

export interface PlatformRelease {
  id: string;
  version: string;
  platform: PlatformDevicePlatform;
  channel: PlatformReleaseChannel;
  fileName: string;
  fileSize: number;
  sha256: string;
  releaseNotes: string;
  publishedAt: string | null;
  downloadUrl: string;
}

export interface PlatformApiClient {
  verifyInvitation(code: string): Promise<unknown>;
  register(input: {
    invitationCode: string;
    email: string;
    password: string;
    displayName: string;
  }): Promise<{ accessToken: string; user: PlatformUser }>;
  login(input: {
    email: string;
    password: string;
  }): Promise<{ accessToken: string; user: PlatformUser }>;
  getMe(): Promise<{ user: PlatformUser }>;
  listReleases(platform: PlatformDevicePlatform): Promise<{
    releases: PlatformRelease[];
  }>;
  recordDownload(releaseId: string): Promise<unknown>;
  downloadRelease(releaseId: string): Promise<Blob>;
  listAdminUsers(): Promise<{ users: unknown[] }>;
  listAdminInvitations(): Promise<{ invitations: unknown[] }>;
  listAdminDevices(): Promise<{ devices: unknown[] }>;
  listAdminReleases(): Promise<{ releases: unknown[] }>;
  listAdminDownloads(): Promise<{ downloads: unknown[] }>;
}

interface ApiClientOptions {
  baseUrl?: string;
  getToken(): string | null;
}

export function createPlatformApiClient(
  options: ApiClientOptions,
): PlatformApiClient {
  const baseUrl =
    options.baseUrl ?? import.meta.env.VITE_PLATFORM_API_BASE_URL ?? "/api";

  async function request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    const token = options.getToken();
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }

    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };

    if (!response.ok) {
      throw new Error(payload.error?.message ?? "请求失败");
    }

    return payload as T;
  }

  async function requestBlob(path: string): Promise<Blob> {
    const headers = new Headers();
    const token = options.getToken();
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers,
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      throw new Error(payload.error?.message ?? "请求失败");
    }

    return response.blob();
  }

  return {
    verifyInvitation(code) {
      return request("/auth/invitations/verify", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
    },
    register(input) {
      return request("/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    login(input) {
      return request("/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    getMe() {
      return request("/me");
    },
    listReleases(platform) {
      return request(`/releases?platform=${encodeURIComponent(platform)}`);
    },
    recordDownload(releaseId) {
      return request("/downloads", {
        method: "POST",
        body: JSON.stringify({ releaseId }),
      });
    },
    downloadRelease(releaseId) {
      return requestBlob(
        `/releases/${encodeURIComponent(releaseId)}/download`,
      );
    },
    listAdminUsers() {
      return request("/admin/users");
    },
    listAdminInvitations() {
      return request("/admin/invitations");
    },
    listAdminDevices() {
      return request("/admin/devices");
    },
    listAdminReleases() {
      return request("/admin/releases");
    },
    listAdminDownloads() {
      return request("/admin/downloads");
    },
  };
}
