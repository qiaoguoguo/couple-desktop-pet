import {
  CloudOff,
  Link2,
  RotateCcw,
  Settings,
  X,
} from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from "react";
import type { SyncErrorCode } from "../../shared/syncProtocol";
import type { DeviceProfileV1 } from "../../shared/profileProtocol";
import type {
  PairWeatherEntry,
  PairWeatherResponse,
} from "../../shared/weatherProtocol";
import type { PairWeatherUiState } from "./usePairWeather";
import { WeatherIcon } from "./WeatherIcon";
import {
  formatRainChance,
  formatTemperature,
  formatTemperatureRange,
  formatWeatherUpdateTime,
  getConditionLabel,
  getPeerCareCopy,
  hasStaleWeather,
} from "./weatherPresentation";

export interface WeatherPanelProps {
  state: PairWeatherUiState;
  paired: boolean;
  profileComplete: boolean;
  onClose(): void;
  onRetry(): void;
  onOpenSettings(): void;
  onOpenBinding(): void;
}

interface WeatherPanelCommands {
  onRetry(): void;
  onOpenSettings(): void;
  onOpenBinding(): void;
}

const WeatherPanelCommandsContext = createContext<WeatherPanelCommands | null>(null);

export function WeatherPanel({
  state,
  paired,
  profileComplete,
  onClose,
  onRetry,
  onOpenSettings,
  onOpenBinding,
}: WeatherPanelProps) {
  const view = resolvePanelView(state, paired, profileComplete);

  useEffect(() => {
    function handleDocumentKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => document.removeEventListener("keydown", handleDocumentKeyDown);
  }, [onClose]);

  return (
    <WeatherPanelCommandsContext.Provider
      value={{ onRetry, onOpenSettings, onOpenBinding }}
    >
      <section
        className="weather-panel"
        aria-label="双方天气"
        tabIndex={-1}
      >
        <header className="weather-panel-header">
          <div className="weather-heading-copy">
            <p className="weather-eyebrow">两座城 · 一份牵挂</p>
            <h1>今天也在同一片天空下</h1>
          </div>
          <button
            type="button"
            className="weather-icon-button"
            aria-label="关闭双方天气"
            title="关闭"
            onClick={onClose}
          >
            <X aria-hidden="true" strokeWidth={1.8} />
          </button>
        </header>

        <p className="weather-city-summary" title={view.summary}>
          {view.summary}
        </p>

        {view.body}

        <div className="weather-care-note" aria-live="polite">
          {view.care}
        </div>

        <footer className="weather-panel-footer">
          <div className="weather-update-copy">{view.footer}</div>
          <span className="weather-attribution">WeatherAPI.com</span>
        </footer>
      </section>
    </WeatherPanelCommandsContext.Provider>
  );
}

interface ResolvedPanelView {
  summary: string;
  body: ReactNode;
  care: ReactNode;
  footer: ReactNode;
}

function resolvePanelView(
  state: PairWeatherUiState,
  paired: boolean,
  profileComplete: boolean,
): ResolvedPanelView {
  if (!paired) {
    return commandView(
      "等待相遇",
      "还没有可以一起看天气的 TA",
      "进入绑定设置",
      <Link2 aria-hidden="true" strokeWidth={1.8} />,
      "binding",
    );
  }

  if (!profileComplete) {
    return commandView(
      "基本信息待完成",
      "请先完成基本信息",
      "进入基本信息设置",
      <Settings aria-hidden="true" strokeWidth={1.8} />,
      "settings",
    );
  }

  if (state.status === "idle" || state.status === "loading") {
    return {
      summary: "我和 TA 的城市天气",
      body: <LoadingRows />,
      care: <span className="weather-skeleton weather-skeleton--care" />,
      footer: <span className="weather-skeleton weather-skeleton--footer" />,
    };
  }

  if (state.status === "failed") {
    return failureView(state.code);
  }

  return loadedView(state.response);
}

function loadedView(response: PairWeatherResponse): ResolvedPanelView {
  const unavailableCount = [response.self, response.peer].filter(
    (entry) => entry.status === "unavailable",
  ).length;
  const allMissingConfiguration = [response.self, response.peer].every(
    (entry) =>
      entry.status === "unavailable" && entry.reason === "weather_not_configured",
  );
  const selfNeedsProfile =
    response.self.status === "unavailable" &&
    response.self.reason === "profile_incomplete";

  let care: ReactNode = getPeerCareCopy(response.peer);
  if (allMissingConfiguration) {
    care = "天气服务暂时未配置";
  } else if (unavailableCount === 2 && !selfNeedsProfile) {
    care = "天气暂时走神了，晚点再一起看看。";
  } else if (selfNeedsProfile) {
    care = (
      <>
        <span>请先完成基本信息</span>
        <PanelCommand kind="settings" label="进入基本信息设置" />
      </>
    );
  }

  return {
    summary: `${citySummary(response.self, "我")} · ${citySummary(response.peer, "TA")}`,
    body: (
      <div className="weather-rows">
        <WeatherRow owner="self" label="我" entry={response.self} />
        <WeatherRow owner="peer" label="TA" entry={response.peer} />
      </div>
    ),
    care,
    footer: <WeatherFooter response={response} />,
  };
}

function failureView(code?: SyncErrorCode): ResolvedPanelView {
  if (code === "profile_incomplete") {
    return commandView(
      "基本信息待完成",
      "请先完成基本信息",
      "进入基本信息设置",
      <Settings aria-hidden="true" strokeWidth={1.8} />,
      "settings",
    );
  }

  if (code === "pair_not_found" || code === "auth_failed") {
    return commandView(
      "等待相遇",
      "还没有可以一起看天气的 TA",
      "进入绑定设置",
      <Link2 aria-hidden="true" strokeWidth={1.8} />,
      "binding",
    );
  }

  const isMissingConfiguration = code === "weather_not_configured";
  const copy = isMissingConfiguration
    ? "天气服务暂时未配置"
    : code === "rate_limited"
      ? "看天气的次数有点多，请稍后再试"
      : "天气暂时走神了，晚点再一起看看。";

  return {
    summary: "我和 TA 的城市天气",
    body: (
      <div className="weather-panel-state" role="status">
        <CloudOff aria-hidden="true" strokeWidth={1.8} />
        <p>{copy}</p>
        {!isMissingConfiguration ? (
          <PanelCommand kind="retry" label="重试" />
        ) : null}
      </div>
    ),
    care: "等天气更新好，再一起看看 TA 那边。",
    footer: "等待下次更新",
  };
}

function commandView(
  summary: string,
  message: string,
  label: string,
  icon: ReactNode,
  kind: "settings" | "binding",
): ResolvedPanelView {
  return {
    summary,
    body: (
      <div className="weather-panel-state" role="status">
        {icon}
        <p>{message}</p>
        <PanelCommand kind={kind} label={label} />
      </div>
    ),
    care:
      kind === "binding"
        ? "等 TA 来到身边，再一起看看天空。"
        : "选好城市，再看看今天的天空。",
    footer: "等待两座城的消息",
  };
}

function PanelCommand({
  kind,
  label,
}: {
  kind: "retry" | "settings" | "binding";
  label: string;
}) {
  const panel = useWeatherPanelCommands();
  const Icon =
    kind === "retry" ? RotateCcw : kind === "settings" ? Settings : Link2;
  const handler =
    kind === "retry"
      ? panel.onRetry
      : kind === "settings"
        ? panel.onOpenSettings
        : panel.onOpenBinding;

  return (
    <button type="button" className="weather-command" onClick={handler}>
      <Icon aria-hidden="true" strokeWidth={1.8} />
      <span>{label}</span>
    </button>
  );
}

function LoadingRows() {
  return (
    <div className="weather-rows" aria-label="天气加载中">
      {(["self", "peer"] as const).map((owner) => (
        <div
          className="weather-person-row weather-person-row--loading"
          data-testid={`weather-row-${owner}`}
          key={owner}
        >
          <div className="weather-person-identity">
            <span className="weather-skeleton weather-skeleton--label" />
            <span className="weather-skeleton weather-skeleton--name" />
            <span className="weather-skeleton weather-skeleton--city" />
          </div>
          <div className="weather-current">
            <span className="weather-skeleton weather-skeleton--icon" />
            <span className="weather-skeleton weather-skeleton--temperature" />
          </div>
          <div className="weather-metrics">
            <span className="weather-skeleton weather-skeleton--metric" />
            <span className="weather-skeleton weather-skeleton--metric" />
          </div>
        </div>
      ))}
    </div>
  );
}

function WeatherRow({
  owner,
  label,
  entry,
}: {
  owner: "self" | "peer";
  label: "我" | "TA";
  entry: PairWeatherEntry;
}) {
  return (
    <div
      className="weather-person-row"
      data-testid={`weather-row-${owner}`}
      data-status={entry.status}
    >
      <ProfileIdentity label={label} profile={entry.profile} />
      {entry.status === "ready" ? (
        <>
          <div className="weather-current">
            <WeatherIcon
              className="weather-condition-icon"
              condition={entry.weather.condition}
            />
            <div className="weather-current-copy">
              <strong className="weather-temperature">
                {formatTemperature(entry.weather.currentTemperatureC)}
              </strong>
              <span className="weather-condition-text">
                {entry.weather.conditionText ||
                  getConditionLabel(entry.weather.condition)}
              </span>
            </div>
          </div>
          <div className="weather-metrics">
            <span>{formatTemperatureRange(entry.weather)}</span>
            <span>{formatRainChance(entry.weather.rainChancePercent)}</span>
          </div>
        </>
      ) : (
        <div className="weather-row-unavailable">
          <CloudOff aria-hidden="true" strokeWidth={1.8} />
          <span>
            {entry.reason === "profile_incomplete" && owner === "peer"
              ? "等待 TA 设置城市"
              : entry.reason === "profile_incomplete"
                ? "请先完成基本信息"
                : "天气暂时不可用"}
          </span>
        </div>
      )}
    </div>
  );
}

function ProfileIdentity({
  label,
  profile,
}: {
  label: "我" | "TA";
  profile: DeviceProfileV1;
}) {
  const city = profile.city?.name ?? "城市待设置";

  return (
    <div className="weather-person-identity">
      <span className="weather-person-label">{label}</span>
      <strong className="weather-person-name" title={profile.nickname}>
        {profile.nickname}
      </strong>
      <span className="weather-city-name" title={city}>
        {city}
      </span>
    </div>
  );
}

function WeatherFooter({ response }: { response: PairWeatherResponse }) {
  const updates = [
    response.self.status === "ready"
      ? `我 ${formatWeatherUpdateTime(response.self.weather.fetchedAt)}`
      : null,
    response.peer.status === "ready"
      ? `TA ${formatWeatherUpdateTime(response.peer.weather.fetchedAt)}`
      : null,
  ].filter((value): value is string => value !== null);

  return (
    <>
      {updates.map((update) => (
        <span key={update}>{update}</span>
      ))}
      {hasStaleWeather(response) ? (
        <span className="weather-stale-copy">天气暂时没有更新</span>
      ) : null}
    </>
  );
}

function citySummary(entry: PairWeatherEntry, label: "我" | "TA") {
  return (
    entry.profile.city?.name ?? (label === "TA" ? "等待 TA" : "城市待设置")
  );
}

function useWeatherPanelCommands(): WeatherPanelCommands {
  const commands = useContext(WeatherPanelCommandsContext);
  if (commands === null) {
    throw new Error("Weather panel commands are unavailable");
  }
  return commands;
}
