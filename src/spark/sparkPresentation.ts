import type { SparkStreakSnapshotV1 } from "../../shared/sparkProtocol";

export function formatSparkPair(pair: [string, string]): string {
  return `${pair[0]} & ${pair[1]}`;
}

export function formatSparkCities(cities: [string, string]): string {
  return `${cities[0]} · ${cities[1]}`;
}

export function formatSparkRank(rank: number | null): string {
  return rank === null ? "暂未上榜" : String(rank);
}

export function getSparkCalendarCopy(
  snapshot: Pick<SparkStreakSnapshotV1, "calendarState">,
): string {
  switch (snapshot.calendarState) {
    case "qualified_today":
      return "今天的火花已经续上";
    case "pending_today":
      return "今天等一次互动";
    case "weekend_protected":
      return "周末休息，火花会替你们守到周一";
  }
}
