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
    window.history.replaceState(null, "", "/");
  });

  it("shows the social desktop pet landing page", () => {
    render(<App apiClient={createApiClient()} sessionStore={createSessionStore()} />);

    const navigation = screen.getByRole("navigation", { name: "平台导航" });
    expect(navigation.textContent).toContain("桌宠互动");
    expect(navigation.textContent).toContain("形象工坊");
    expect(navigation.textContent).toContain("连续天数");
    expect(navigation.textContent).toContain("下载");
    expect(navigation.textContent).toContain("登录");
    expect(navigation.textContent).not.toContain("邀请码");
    expect(navigation.textContent).not.toContain("管理后台");
    expect(
      screen.getByRole("heading", {
        name: /每天见一面，\s*屏幕也会变温柔/,
      }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "加入内测" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "先下载体验" })).toBeTruthy();
    expect(screen.getByText("今天也想你啦～ 晚安")).toBeTruthy();
    expect(screen.getByText("我也是呀～ 记得早点休息哦")).toBeTruthy();
    expect(screen.getByText("Windows")).toBeTruthy();
    expect(screen.getByText("macOS")).toBeTruthy();
    expect(screen.getByText("Android")).toBeTruthy();
    expect(screen.getByText("连续互动")).toBeTruthy();
    expect(screen.getByText("27")).toBeTruthy();
    expect(screen.getByText("本周暖心榜")).toBeTruthy();
    expect(screen.getByText("查看更多")).toBeTruthy();
    expect(screen.getByText("绑定好友")).toBeTruthy();
    expect(screen.getByText("互发消息")).toBeTruthy();
    expect(screen.getByText("桌宠串门")).toBeTruthy();
    expect(screen.getByText("互动天数")).toBeTruthy();
    expect(
      screen.getByText(
        "对方的小人会来你的屏幕边打招呼，把问候变成可见的小动作。",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/看着 TA/)).toBeNull();
    expect(screen.getByText("上传参考图")).toBeTruthy();
    expect(screen.getByText("生成多版 Q 版形象")).toBeTruthy();
    expect(screen.getByText("导入桌面端")).toBeTruthy();
    expect(screen.getByText("即将开放预约体验")).toBeTruthy();
  });

  it("navigates from the landing CTAs to invitation and download flows", () => {
    render(<App apiClient={createApiClient()} sessionStore={createSessionStore()} />);

    fireEvent.click(screen.getByRole("button", { name: "加入内测" }));
    expect(screen.getByRole("heading", { name: "内测邀请码" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "情侣桌宠" }));
    fireEvent.click(screen.getByRole("button", { name: "先下载体验" }));
    expect(screen.getByRole("heading", { name: "请先登录后下载" })).toBeTruthy();
  });

  it("keeps invitation off the home navigation but reachable from the CTA", () => {
    render(
      <App
        apiClient={createApiClient()}
        sessionStore={createSessionStore()}
        initialRoute="/"
      />,
    );

    expect(screen.queryByRole("button", { name: "邀请码" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "加入内测" }));

    expect(screen.getByRole("heading", { name: "内测邀请码" })).toBeTruthy();
  });

  it("scrolls landing navigation buttons to matching homepage sections", () => {
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    try {
      render(<App apiClient={createApiClient()} sessionStore={createSessionStore()} />);

      fireEvent.click(screen.getByRole("button", { name: "形象工坊" }));

      const workshopSection = screen
        .getByRole("heading", { name: "自由捏造属于你们的小人" })
        .closest("section");
      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "start",
      });
      expect(scrollIntoView.mock.contexts[0]).toBe(workshopSection);
    } finally {
      if (originalScrollIntoView) {
        Object.defineProperty(Element.prototype, "scrollIntoView", {
          configurable: true,
          value: originalScrollIntoView,
        });
      } else {
        delete (Element.prototype as Partial<Element>).scrollIntoView;
      }
    }
  });

  it("keeps landing content reachable on a mobile viewport", () => {
    vi.stubGlobal("innerWidth", 390);
    vi.stubGlobal("innerHeight", 844);
    window.dispatchEvent(new Event("resize"));

    render(<App apiClient={createApiClient()} sessionStore={createSessionStore()} />);

    expect(
      screen.getByRole("heading", {
        name: /每天见一面，\s*屏幕也会变温柔/,
      }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "桌宠互动" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "形象工坊" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "连续天数" })).toBeTruthy();
    expect(screen.getByText("自由捏造属于你们的小人")).toBeTruthy();
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
