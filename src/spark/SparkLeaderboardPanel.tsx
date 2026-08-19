import { Link2, RotateCcw, X } from "lucide-react";
import { useEffect } from "react";
import type {
  SparkLeaderboardEntryV1,
  SparkLeaderboardResponseV1,
  SparkLeaderboardSelfV1,
  SparkTier,
} from "../../shared/sparkProtocol";
import type { SyncErrorCode } from "../../shared/syncProtocol";
import { getSparkAsset, getSparkTierLabel } from "./sparkAssets";
import {
  formatSparkCities,
  formatSparkPair,
  formatSparkRank,
  getSparkCalendarCopy,
} from "./sparkPresentation";
import type { SparkLeaderboardState } from "./useSparkStreak";

export interface SparkLeaderboardPanelProps {
  state: SparkLeaderboardState;
  paired: boolean;
  onClose(): void;
  onRetry(): void;
  onOpenBinding(): void;
}

export function SparkLeaderboardPanel({
  state,
  paired,
  onClose,
  onRetry,
  onOpenBinding,
}: SparkLeaderboardPanelProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <section
      className="spark-panel"
      data-testid="spark-panel"
      aria-label="全服火花榜"
    >
      <header className="spark-panel-header">
        <div className="spark-panel-heading">
          <p>续火花</p>
          <h1>全服火花榜</h1>
          <span>看看哪一对把心意守得最久</span>
        </div>
        <button
          type="button"
          className="spark-close-button"
          aria-label="关闭火花榜"
          title="关闭"
          onClick={onClose}
        >
          <X aria-hidden="true" strokeWidth={1.8} />
        </button>
      </header>
      <SparkPanelBody
        state={state}
        paired={paired}
        onRetry={onRetry}
        onOpenBinding={onOpenBinding}
      />
    </section>
  );
}

function SparkPanelBody({
  state,
  paired,
  onRetry,
  onOpenBinding,
}: Pick<SparkLeaderboardPanelProps, "state" | "paired" | "onRetry" | "onOpenBinding">) {
  if (!paired) {
    return (
      <SparkCommandState
        message="和 TA 绑定后，一起把火花续起来"
        label="进入绑定设置"
        onClick={onOpenBinding}
        icon="binding"
      />
    );
  }

  if (state.status === "idle" || state.status === "loading") {
    return <SparkLoadingState />;
  }

  if (state.status === "failed") {
    return <SparkFailureState code={state.code} onRetry={onRetry} onOpenBinding={onOpenBinding} />;
  }

  return <SparkLoadedState response={state.response} />;
}

function SparkLoadedState({ response }: { response: SparkLeaderboardResponseV1 }) {
  const podium = response.top20.slice(0, 3);
  const remaining = response.top20.slice(3);
  return (
    <div className="spark-loaded-state">
      {podium.length === 0 ? (
        <div className="spark-empty-ranking">还没有上榜火花</div>
      ) : (
        <div className="spark-podium" data-testid="spark-podium">
          {podium.map((entry, index) => (
            <PodiumEntry entry={entry} key={`${entry.rank}-${index}`} />
          ))}
        </div>
      )}

      <div className="spark-ranking-list" data-testid="spark-ranking-list">
        {remaining.map((entry, index) => (
          <RankingRow entry={entry} key={`${entry.rank}-${index}`} />
        ))}
      </div>

      <p className="spark-calendar-copy">
        {getSparkCalendarCopy(response.snapshot)}
      </p>
      <SelfStrip self={response.self} />
    </div>
  );
}

function PodiumEntry({ entry }: { entry: SparkLeaderboardEntryV1 }) {
  return (
    <article className="spark-podium-entry">
      <strong className="spark-podium-rank">{entry.rank}</strong>
      <SparkFlame tier={entry.tier} className="spark-podium-flame" />
      <p title={formatSparkPair(entry.displayNames)}>{formatSparkPair(entry.displayNames)}</p>
      <span title={formatSparkCities(entry.cities)}>{formatSparkCities(entry.cities)}</span>
      <b>{entry.streakDays}天</b>
    </article>
  );
}

function RankingRow({ entry }: { entry: SparkLeaderboardEntryV1 }) {
  return (
    <div className="spark-ranking-row">
      <span>{entry.rank}</span>
      <strong title={formatSparkPair(entry.displayNames)}>
        {formatSparkPair(entry.displayNames)}
      </strong>
      <span title={formatSparkCities(entry.cities)}>{formatSparkCities(entry.cities)}</span>
      <b>{entry.streakDays}天</b>
    </div>
  );
}

function SelfStrip({ self }: { self: SparkLeaderboardSelfV1 }) {
  return (
    <div className="spark-self-strip" data-testid="spark-self-strip">
      <SparkFlame tier={self.tier} className="spark-self-flame" />
      <div className="spark-self-rank">
        <span>我的排名</span>
        <strong
          className={
            self.rank === null ? "spark-self-rank-value--unranked" : undefined
          }
        >
          {formatSparkRank(self.rank)}
        </strong>
      </div>
      <div className="spark-self-identity">
        <strong title={formatSparkPair(self.displayNames)}>
          {formatSparkPair(self.displayNames)}
        </strong>
        <span title={formatSparkCities(self.cities)}>{formatSparkCities(self.cities)}</span>
      </div>
      <b className="spark-self-days">{self.streakDays}天</b>
      <span className="spark-tier-label">{getSparkTierLabel(self.tier)}</span>
    </div>
  );
}

function SparkFailureState({
  code,
  onRetry,
  onOpenBinding,
}: {
  code: SyncErrorCode;
  onRetry(): void;
  onOpenBinding(): void;
}) {
  if (code === "auth_failed" || code === "pair_not_found") {
    return (
      <SparkCommandState
        message="绑定信息需要重新确认"
        label="进入绑定设置"
        onClick={onOpenBinding}
        icon="binding"
      />
    );
  }
  return (
    <SparkCommandState
      message={
        code === "rate_limited"
          ? "查看次数有点多，请稍后再试"
          : "火花榜暂时不可用"
      }
      label="重试"
      onClick={onRetry}
      icon="retry"
    />
  );
}

function SparkCommandState({
  message,
  label,
  onClick,
  icon,
}: {
  message: string;
  label: string;
  onClick(): void;
  icon: "binding" | "retry";
}) {
  const Icon = icon === "binding" ? Link2 : RotateCcw;
  return (
    <div className="spark-command-state" role="status">
      <Icon aria-hidden="true" strokeWidth={1.8} />
      <p>{message}</p>
      <button type="button" onClick={onClick}>
        <Icon aria-hidden="true" strokeWidth={1.8} />
        <span>{label}</span>
      </button>
    </div>
  );
}

function SparkLoadingState() {
  return (
    <div className="spark-loading-state" aria-label="火花榜加载中">
      <div className="spark-loading-podium">
        {[0, 1, 2].map((index) => <span key={index} />)}
      </div>
      <div className="spark-loading-rows">
        {[0, 1, 2, 3].map((index) => <span key={index} />)}
      </div>
      <div className="spark-loading-self" />
    </div>
  );
}

function SparkFlame({
  tier,
  className,
}: {
  tier: SparkTier;
  className: string;
}) {
  return <img className={className} src={getSparkAsset(tier)} alt="" />;
}
