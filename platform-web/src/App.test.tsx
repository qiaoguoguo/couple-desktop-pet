import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { PlatformApiClient } from "./apiClient";
import type { SessionStore } from "./sessionStore";

describe("platform web app", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows the internal test entry and download/login path", () => {
    render(<App apiClient={createApiClient()} sessionStore={createSessionStore()} />);

    expect(screen.getByText("情侣桌宠内测平台")).toBeTruthy();
    expect(screen.getByRole("button", { name: "输入邀请码" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "登录下载" })).toBeTruthy();
  });

  it("verifies an invitation and moves to registration", async () => {
    const apiClient = createApiClient();
    render(
      <App
        apiClient={apiClient}
        sessionStore={createSessionStore()}
        initialRoute="/invite"
      />,
    );

    fireEvent.change(screen.getByLabelText("邀请码"), {
      target: { value: " beta-001 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "验证邀请码" }));

    await waitFor(() =>
      expect(apiClient.verifyInvitation).toHaveBeenCalledWith(" beta-001 "),
    );
    expect(screen.getByText("邀请码可用，请完成注册")).toBeTruthy();
  });

  it("registers, stores token, and shows the download page", async () => {
    const sessionStore = createSessionStore();
    const apiClient = createApiClient();
    render(
      <App
        apiClient={apiClient}
        sessionStore={sessionStore}
        initialRoute="/register"
        initialInvitationCode="BETA-001"
      />,
    );

    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("昵称"), {
      target: { value: "测试用户" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "12345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "注册并进入下载" }));

    await waitFor(() => expect(sessionStore.getToken()).toBe("token_user"));
    expect(screen.getByText("下载桌宠")).toBeTruthy();
  });

  it("logs in, stores token, and shows the download page", async () => {
    const sessionStore = createSessionStore();
    const apiClient = createApiClient();
    render(
      <App
        apiClient={apiClient}
        sessionStore={sessionStore}
        initialRoute="/login"
      />,
    );

    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "12345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => expect(sessionStore.getToken()).toBe("token_user"));
    expect(screen.getByText("下载桌宠")).toBeTruthy();
  });

  it("lists Windows releases and downloads with an authenticated API blob", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const createObjectUrl = vi.fn().mockReturnValue("blob:download-url");
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    });
    const apiClient = createApiClient();
    render(
      <App
        apiClient={apiClient}
        sessionStore={createSessionStore("token_user")}
        initialRoute="/download"
      />,
    );

    expect(await screen.findByText("0.1.0")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "下载 Windows 内测包" }));

    await waitFor(() =>
      expect(apiClient.downloadRelease).toHaveBeenCalledWith("rel_1"),
    );
    expect(apiClient.recordDownload).not.toHaveBeenCalled();
    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(clickSpy).toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalledWith(
      "/releases/couple-pet.exe",
      "_blank",
    );
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:download-url");
  });

  it("shows a login entry instead of an empty download page when unauthenticated", () => {
    const apiClient = createApiClient();

    render(
      <App
        apiClient={apiClient}
        sessionStore={createSessionStore()}
        initialRoute="/download"
      />,
    );

    expect(screen.getByText("请先登录后下载")).toBeTruthy();
    expect(screen.getByRole("button", { name: "去登录" })).toBeTruthy();
    expect(apiClient.listReleases).not.toHaveBeenCalled();
  });

  it("shows admin lists for an admin token", async () => {
    render(
      <App
        apiClient={createApiClient({ admin: true })}
        sessionStore={createSessionStore("token_admin")}
        initialRoute="/admin"
      />,
    );

    expect(await screen.findByText("后台管理")).toBeTruthy();
    expect(screen.getByText("admin@example.com")).toBeTruthy();
    expect(screen.getByText("BETA-001")).toBeTruthy();
    expect(screen.getByText("Windows 桌面")).toBeTruthy();
    expect(screen.getByText("couple-pet.exe")).toBeTruthy();
    expect(screen.getByText("127.0.0.1")).toBeTruthy();
  });

  it("denies admin page for a non-admin user", async () => {
    render(
      <App
        apiClient={createApiClient()}
        sessionStore={createSessionStore("token_user")}
        initialRoute="/admin"
      />,
    );

    expect(await screen.findByText("需要管理员权限")).toBeTruthy();
    expect(screen.getByText("请使用管理员账号登录")).toBeTruthy();
  });

  it("shows a login entry instead of loading admin lists when unauthenticated", () => {
    const apiClient = createApiClient({ admin: true });

    render(
      <App
        apiClient={apiClient}
        sessionStore={createSessionStore()}
        initialRoute="/admin"
      />,
    );

    expect(screen.getByText("请先登录管理员账号")).toBeTruthy();
    expect(screen.getByRole("button", { name: "去登录" })).toBeTruthy();
    expect(apiClient.listAdminUsers).not.toHaveBeenCalled();
  });
});

function createSessionStore(initialToken: string | null = null): SessionStore {
  let token = initialToken;

  return {
    getToken: () => token,
    setToken: (nextToken) => {
      token = nextToken;
    },
    clearToken: () => {
      token = null;
    },
  };
}

function createApiClient(options: { admin?: boolean } = {}): PlatformApiClient {
  return {
    verifyInvitation: vi.fn().mockResolvedValue({
      ok: true,
      invitation: { code: "BETA-001", expiresAt: null },
    }),
    register: vi.fn().mockResolvedValue({
      accessToken: "token_user",
      user: {
        id: "usr_1",
        email: "user@example.com",
        displayName: "测试用户",
        role: "user",
      },
    }),
    login: vi.fn().mockResolvedValue({
      accessToken: options.admin ? "token_admin" : "token_user",
      user: options.admin
        ? {
            id: "usr_admin",
            email: "admin@example.com",
            displayName: "管理员",
            role: "admin",
          }
        : {
            id: "usr_1",
            email: "user@example.com",
            displayName: "测试用户",
            role: "user",
          },
    }),
    getMe: vi.fn().mockResolvedValue({
      user: options.admin
        ? {
            id: "usr_admin",
            email: "admin@example.com",
            displayName: "管理员",
            role: "admin",
          }
        : {
            id: "usr_1",
            email: "user@example.com",
            displayName: "测试用户",
            role: "user",
          },
    }),
    listReleases: vi.fn().mockResolvedValue({
      releases: [
        {
          id: "rel_1",
          version: "0.1.0",
          platform: "windows",
          channel: "internal",
          fileName: "couple-pet.exe",
          fileSize: 1024,
          sha256: "hash-win",
          releaseNotes: "Windows 内测包",
          publishedAt: "2026-08-03T12:00:00.000Z",
          downloadUrl: "/releases/rel_1/download",
        },
      ],
    }),
    recordDownload: vi.fn().mockResolvedValue({ ok: true }),
    downloadRelease: vi.fn().mockResolvedValue(new Blob(["windows-build"])),
    listAdminUsers: vi.fn().mockResolvedValue({
      users: [{ id: "usr_admin", email: "admin@example.com", role: "admin" }],
    }),
    listAdminInvitations: vi.fn().mockResolvedValue({
      invitations: [{ id: "inv_1", code: "BETA-001", status: "unused" }],
    }),
    listAdminDevices: vi.fn().mockResolvedValue({
      devices: [{ id: "dev_1", deviceName: "Windows 桌面" }],
    }),
    listAdminReleases: vi.fn().mockResolvedValue({
      releases: [{ id: "rel_1", fileName: "couple-pet.exe", version: "0.1.0" }],
    }),
    listAdminDownloads: vi.fn().mockResolvedValue({
      downloads: [{ id: "dle_1", ip: "127.0.0.1", userAgent: "vitest" }],
    }),
  };
}
