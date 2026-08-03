import { useCallback, useEffect, useMemo, useState } from "react";
import { validatePlatformEmail } from "../../shared/platformProtocol";
import {
  createPlatformApiClient,
  type PlatformApiClient,
  type PlatformRelease,
  type PlatformUser,
} from "./apiClient";
import { browserSessionStore, type SessionStore } from "./sessionStore";
import "./app.css";

export type PlatformRoute =
  | "/"
  | "/invite"
  | "/register"
  | "/login"
  | "/download"
  | "/admin";

interface AppProps {
  apiClient?: PlatformApiClient;
  sessionStore?: SessionStore;
  initialRoute?: PlatformRoute;
  initialInvitationCode?: string;
}

interface AdminLists {
  users: unknown[];
  invitations: unknown[];
  devices: unknown[];
  releases: unknown[];
  downloads: unknown[];
}

export function App({
  apiClient,
  sessionStore = browserSessionStore,
  initialRoute,
  initialInvitationCode = "",
}: AppProps) {
  const resolvedApiClient = useMemo(
    () =>
      apiClient ??
      createPlatformApiClient({
        getToken: () => sessionStore.getToken(),
      }),
    [apiClient, sessionStore],
  );
  const [route, setRoute] = useState<PlatformRoute>(
    initialRoute ?? readInitialRoute(),
  );
  const [invitationCode, setInvitationCode] = useState(initialInvitationCode);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [currentUser, setCurrentUser] = useState<PlatformUser | null>(null);
  const [releases, setReleases] = useState<PlatformRelease[]>([]);
  const [adminLists, setAdminLists] = useState<AdminLists | null>(null);

  const navigate = useCallback((nextRoute: PlatformRoute) => {
    setRoute(nextRoute);
    setError("");
    setNotice("");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", nextRoute);
    }
  }, []);

  useEffect(() => {
    const token = sessionStore.getToken();
    if (!token) {
      setCurrentUser(null);
      return;
    }

    let disposed = false;
    void resolvedApiClient
      .getMe()
      .then((response) => {
        if (!disposed) {
          setCurrentUser(response.user);
        }
      })
      .catch(() => {
        if (!disposed) {
          sessionStore.clearToken();
          setCurrentUser(null);
        }
      });

    return () => {
      disposed = true;
    };
  }, [resolvedApiClient, sessionStore]);

  useEffect(() => {
    if (route !== "/download" || !sessionStore.getToken()) {
      return;
    }

    let disposed = false;
    void resolvedApiClient
      .listReleases("windows")
      .then((response) => {
        if (!disposed) {
          setReleases(response.releases);
        }
      })
      .catch((caughtError) => {
        if (!disposed) {
          setError(readError(caughtError));
        }
      });

    return () => {
      disposed = true;
    };
  }, [resolvedApiClient, route, sessionStore]);

  useEffect(() => {
    if (route !== "/admin" || !sessionStore.getToken()) {
      return;
    }

    let disposed = false;
    void resolvedApiClient
      .getMe()
      .then(async (response) => {
        if (response.user.role !== "admin") {
          throw new Error("需要管理员权限");
        }

        const [users, invitations, devices, releasesList, downloads] =
          await Promise.all([
            resolvedApiClient.listAdminUsers(),
            resolvedApiClient.listAdminInvitations(),
            resolvedApiClient.listAdminDevices(),
            resolvedApiClient.listAdminReleases(),
            resolvedApiClient.listAdminDownloads(),
          ]);

        if (!disposed) {
          setCurrentUser(response.user);
          setAdminLists({
            users: users.users,
            invitations: invitations.invitations,
            devices: devices.devices,
            releases: releasesList.releases,
            downloads: downloads.downloads,
          });
        }
      })
      .catch((caughtError) => {
        if (!disposed) {
          setAdminLists(null);
          setError(readError(caughtError));
        }
      });

    return () => {
      disposed = true;
    };
  }, [resolvedApiClient, route, sessionStore]);

  async function handleVerifyInvitation(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    try {
      await resolvedApiClient.verifyInvitation(invitationCode);
      setRoute("/register");
    } catch (caughtError) {
      setError(readError(caughtError));
    }
  }

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const displayName = String(form.get("displayName") ?? "");
    const emailValidation = validatePlatformEmail(email);
    if (!emailValidation.ok) {
      setError(emailValidation.message);
      return;
    }

    try {
      const response = await resolvedApiClient.register({
        invitationCode,
        email: emailValidation.email,
        password,
        displayName,
      });
      sessionStore.setToken(response.accessToken);
      setCurrentUser(response.user);
      (formElement.elements.namedItem("password") as HTMLInputElement).value = "";
      setNotice("");
      setRoute("/download");
    } catch (caughtError) {
      setError(readError(caughtError));
    }
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    try {
      const response = await resolvedApiClient.login({
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      sessionStore.setToken(response.accessToken);
      setCurrentUser(response.user);
      (formElement.elements.namedItem("password") as HTMLInputElement).value = "";
      setRoute("/download");
    } catch (caughtError) {
      setError(readError(caughtError));
    }
  }

  async function handleDownload(release: PlatformRelease) {
    setError("");

    try {
      await resolvedApiClient.recordDownload(release.id);
      window.open(release.downloadUrl, "_blank");
    } catch (caughtError) {
      setError(readError(caughtError));
    }
  }

  return (
    <main className="platform-shell">
      <nav className="platform-nav" aria-label="平台导航">
        <button type="button" onClick={() => navigate("/")}>
          首页
        </button>
        <button type="button" onClick={() => navigate("/invite")}>
          邀请码
        </button>
        <button type="button" onClick={() => navigate("/login")}>
          账号登录
        </button>
        <button type="button" onClick={() => navigate("/admin")}>
          管理后台
        </button>
      </nav>

      {error ? <p className="platform-error">{error}</p> : null}
      {notice ? <p className="platform-notice">{notice}</p> : null}

      {route === "/" ? (
        <HomePage onNavigate={navigate} />
      ) : route === "/invite" ? (
        <InvitePage
          invitationCode={invitationCode}
          onInvitationCodeChange={setInvitationCode}
          onSubmit={handleVerifyInvitation}
        />
      ) : route === "/register" ? (
        <RegisterPage
          invitationCode={invitationCode}
          onSubmit={handleRegister}
        />
      ) : route === "/login" ? (
        <LoginPage onSubmit={handleLogin} />
      ) : route === "/download" ? (
        <DownloadPage
          currentUser={currentUser}
          releases={releases}
          onDownload={handleDownload}
        />
      ) : (
        <AdminPage currentUser={currentUser} adminLists={adminLists} />
      )}
    </main>
  );
}

function HomePage({
  onNavigate,
}: {
  onNavigate(route: PlatformRoute): void;
}) {
  return (
    <section className="platform-panel">
      <h1>情侣桌宠内测平台</h1>
      <p>邀请码账号、Windows 内测包下载和基础设备绑定入口。</p>
      <div className="platform-actions">
        <button type="button" onClick={() => onNavigate("/invite")}>
          输入邀请码
        </button>
        <button type="button" onClick={() => onNavigate("/login")}>
          登录下载
        </button>
      </div>
    </section>
  );
}

function InvitePage({
  invitationCode,
  onInvitationCodeChange,
  onSubmit,
}: {
  invitationCode: string;
  onInvitationCodeChange(value: string): void;
  onSubmit(event: React.FormEvent): void;
}) {
  return (
    <section className="platform-panel">
      <h1>内测邀请码</h1>
      <form className="platform-form" onSubmit={onSubmit}>
        <label>
          <span>邀请码</span>
          <input
            value={invitationCode}
            onChange={(event) => onInvitationCodeChange(event.currentTarget.value)}
          />
        </label>
        <button type="submit">验证邀请码</button>
      </form>
    </section>
  );
}

function RegisterPage({
  invitationCode,
  onSubmit,
}: {
  invitationCode: string;
  onSubmit(event: React.FormEvent<HTMLFormElement>): void;
}) {
  return (
    <section className="platform-panel">
      <h1>邀请码可用，请完成注册</h1>
      <p>当前邀请码：{invitationCode || "未填写"}</p>
      <form className="platform-form" onSubmit={onSubmit}>
        <label>
          <span>邮箱</span>
          <input name="email" type="email" autoComplete="email" />
        </label>
        <label>
          <span>昵称</span>
          <input name="displayName" autoComplete="nickname" />
        </label>
        <label>
          <span>密码</span>
          <input name="password" type="password" autoComplete="new-password" />
        </label>
        <button type="submit">注册并进入下载</button>
      </form>
    </section>
  );
}

function LoginPage({
  onSubmit,
}: {
  onSubmit(event: React.FormEvent<HTMLFormElement>): void;
}) {
  return (
    <section className="platform-panel">
      <h1>登录下载</h1>
      <form className="platform-form" onSubmit={onSubmit}>
        <label>
          <span>邮箱</span>
          <input name="email" type="email" autoComplete="email" />
        </label>
        <label>
          <span>密码</span>
          <input name="password" type="password" autoComplete="current-password" />
        </label>
        <button type="submit">登录</button>
      </form>
    </section>
  );
}

function DownloadPage({
  currentUser,
  releases,
  onDownload,
}: {
  currentUser: PlatformUser | null;
  releases: PlatformRelease[];
  onDownload(release: PlatformRelease): void;
}) {
  return (
    <section className="platform-panel">
      <h1>下载桌宠</h1>
      <p>{currentUser ? `${currentUser.displayName}，请选择内测包。` : "请选择内测包。"}</p>
      <div className="platform-table-wrap">
        <table>
          <thead>
            <tr>
              <th>版本</th>
              <th>平台</th>
              <th>文件</th>
              <th>大小</th>
              <th>sha256</th>
              <th>说明</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {releases.map((release) => (
              <tr key={release.id}>
                <td>{release.version}</td>
                <td>{release.platform}</td>
                <td>{release.fileName}</td>
                <td>{release.fileSize}</td>
                <td>{release.sha256}</td>
                <td>{release.releaseNotes}</td>
                <td>
                  <button type="button" onClick={() => onDownload(release)}>
                    下载 Windows 内测包
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AdminPage({
  currentUser,
  adminLists,
}: {
  currentUser: PlatformUser | null;
  adminLists: AdminLists | null;
}) {
  if (currentUser && currentUser.role !== "admin") {
    return <section className="platform-panel">请使用管理员账号登录</section>;
  }

  if (!adminLists) {
    return <section className="platform-panel">后台数据加载中</section>;
  }

  return (
    <section className="platform-panel">
      <h1>后台管理</h1>
      <AdminTable title="用户" rows={adminLists.users} />
      <AdminTable title="邀请码" rows={adminLists.invitations} />
      <AdminTable title="设备" rows={adminLists.devices} />
      <AdminTable title="版本" rows={adminLists.releases} />
      <AdminTable title="下载记录" rows={adminLists.downloads} />
    </section>
  );
}

function AdminTable({ title, rows }: { title: string; rows: unknown[] }) {
  const objects = rows.map((row) =>
    typeof row === "object" && row !== null ? (row as Record<string, unknown>) : {},
  );
  const columns = Array.from(
    new Set(objects.flatMap((row) => Object.keys(row))),
  );

  return (
    <section className="admin-section">
      <h2>{title}</h2>
      <div className="platform-table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {objects.map((row, index) => (
              <tr key={String(row.id ?? index)}>
                {columns.map((column) => (
                  <td key={column}>{String(row[column] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function readInitialRoute(): PlatformRoute {
  const pathname = window.location.pathname;
  if (
    pathname === "/invite" ||
    pathname === "/register" ||
    pathname === "/login" ||
    pathname === "/download" ||
    pathname === "/admin"
  ) {
    return pathname;
  }

  return "/";
}

function readError(error: unknown): string {
  return error instanceof Error ? error.message : "请求失败";
}
