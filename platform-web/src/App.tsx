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

const petPreviewImages = {
  idle: new URL(
    "../../src/assets/pets/star-sleeper/idle-breathe-01.png",
    import.meta.url,
  ).href,
  wave: new URL(
    "../../src/assets/pets/star-sleeper/act-wave-01.png",
    import.meta.url,
  ).href,
  typing: new URL(
    "../../src/assets/pets/star-sleeper/act-typing-01.png",
    import.meta.url,
  ).href,
  walking: new URL(
    "../../src/assets/pets/star-sleeper/walk-01.png",
    import.meta.url,
  ).href,
};

const ritualItems = [
  {
    title: "绑定好友",
    description: "通过专属邀请码，找到你的那个 TA。",
  },
  {
    title: "互发消息",
    description: "给对方发一张小纸条，让思念轻轻抵达。",
  },
  {
    title: "桌宠串门",
    description: "对方的小人会来到桌面，看着 TA 在做什么。",
  },
  {
    title: "互动天数",
    description: "每一次互动都算数，见证你们的小坚持。",
  },
];

const workshopSteps = [
  "上传参考图",
  "生成多版 Q 版形象",
  "选择喜欢版本",
  "下载资源包",
  "导入桌面端",
];

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
      const blob = await resolvedApiClient.downloadRelease(release.id);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = release.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (caughtError) {
      setError(readError(caughtError));
    }
  }

  return (
    <main className="platform-shell">
      <nav className="platform-nav" aria-label="平台导航">
        <button
          type="button"
          className="platform-brand"
          onClick={() => navigate("/")}
        >
          情侣桌宠
        </button>
        <div className="platform-nav-links">
          <button type="button" onClick={() => navigate("/")}>
            首页
          </button>
          <button type="button" onClick={() => navigate("/")}>
            桌宠互动
          </button>
          <button type="button" onClick={() => navigate("/")}>
            形象工坊
          </button>
          <button type="button" onClick={() => navigate("/")}>
            连续天数
          </button>
          <button type="button" onClick={() => navigate("/download")}>
            下载
          </button>
        </div>
        <div className="platform-nav-account">
          <button type="button" onClick={() => navigate("/login")}>
            账号登录
          </button>
          <button
            type="button"
            className="platform-admin-link"
            onClick={() => navigate("/admin")}
          >
            管理后台
          </button>
        </div>
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
        sessionStore.getToken() ? (
          <DownloadPage
            currentUser={currentUser}
            releases={releases}
            onDownload={handleDownload}
          />
        ) : (
          <AuthRequiredPage
            title="请先登录后下载"
            onNavigateLogin={() => navigate("/login")}
          />
        )
      ) : (
        sessionStore.getToken() ? (
          <AdminPage currentUser={currentUser} adminLists={adminLists} />
        ) : (
          <AuthRequiredPage
            title="请先登录管理员账号"
            onNavigateLogin={() => navigate("/login")}
          />
        )
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
    <>
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-copy">
          <p className="landing-kicker">轻社交桌宠 · Windows 内测中</p>
          <h1 id="landing-title">每天见一面，屏幕也会变温柔</h1>
          <p className="landing-subtitle">
            下载桌面端，导入彼此的小人。消息、串门和连续互动，让陪伴变成可看见的日常。
          </p>
          <div className="landing-actions">
            <button
              type="button"
              className="primary-action"
              onClick={() => onNavigate("/invite")}
            >
              加入内测
            </button>
            <button
              type="button"
              className="secondary-action"
              onClick={() => onNavigate("/download")}
            >
              先下载体验
            </button>
          </div>
          <p className="platform-support">
            Windows 内测中 · 后续支持 macOS / Linux
          </p>
        </div>

        <div className="landing-stage" aria-label="桌宠互动预览">
          <div className="message-bubble">
            今天也想你啦，晚安。
          </div>
          <div className="screen-pair" aria-hidden="true">
            <div className="pet-window pet-window-left">
              <img src={petPreviewImages.wave} alt="" />
              <span>我的桌面</span>
            </div>
            <div className="visit-path" />
            <div className="pet-window pet-window-right">
              <img src={petPreviewImages.typing} alt="" />
              <span>对方来访</span>
            </div>
          </div>
          <div className="streak-card">
            <p>连续互动 27 天</p>
            <strong>27</strong>
            <span>天</span>
            <small>我们的小日常，正在变成习惯</small>
          </div>
          <div className="leaderboard-preview" aria-label="本周暖心榜">
            <h2>本周暖心榜</h2>
            <ol>
              <li>
                <span>星星不睡觉</span>
                <strong>56 天</strong>
              </li>
              <li>
                <span>云朵与海</span>
                <strong>48 天</strong>
              </li>
              <li>
                <span>桃子汽水</span>
                <strong>41 天</strong>
              </li>
            </ol>
          </div>
        </div>
      </section>

      <section className="ritual-strip" aria-label="桌宠互动流程">
        {ritualItems.map((item) => (
          <article key={item.title} className="ritual-item">
            <img src={petPreviewImages.walking} alt="" />
            <h2>{item.title}</h2>
            <p>{item.description}</p>
          </article>
        ))}
      </section>

      <section className="workshop-preview" aria-labelledby="workshop-title">
        <div>
          <p className="landing-kicker">形象工坊即将开放</p>
          <h2 id="workshop-title">自由捏造属于你们的小人</h2>
          <p>
            之后可以用参考图生成多版 Q 版形象，再下载资源包导入桌面端。本轮仅开放预约体验展示，不接入真实 AI 生图服务。
          </p>
        </div>
        <div className="workshop-steps">
          {workshopSteps.map((step, index) => (
            <div key={step} className="workshop-step">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step}</strong>
            </div>
          ))}
        </div>
        <div className="workshop-pets" aria-hidden="true">
          <img src={petPreviewImages.idle} alt="" />
          <img src={petPreviewImages.wave} alt="" />
        </div>
        <button
          type="button"
          className="secondary-action workshop-action"
          onClick={() => onNavigate("/invite")}
        >
          即将开放预约体验
        </button>
      </section>
    </>
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

function AuthRequiredPage({
  title,
  onNavigateLogin,
}: {
  title: string;
  onNavigateLogin(): void;
}) {
  return (
    <section className="platform-panel">
      <h1>{title}</h1>
      <button type="button" onClick={onNavigateLogin}>
        去登录
      </button>
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
