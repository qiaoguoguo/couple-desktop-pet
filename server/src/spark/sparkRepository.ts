import type Database from "better-sqlite3";
import {
  getSparkTier,
  type SparkInteractionKind,
  type SparkLeaderboardEntryV1,
  type SparkLeaderboardResponseV1,
  type SparkLeaderboardSelfV1,
  type SparkStreakSnapshotV1,
} from "../../../shared/sparkProtocol.js";
import { RelayError } from "../errors.js";
import {
  getSparkCalendarPoint,
  isSparkSummaryEffective,
  type SparkCalendarPoint,
} from "./sparkCalendar.js";
import { maskSparkNickname } from "./sparkIdentity.js";

interface SparkSummaryRow {
  streak_days: number;
  last_qualified_date: string;
  last_qualified_at: string;
}

interface LeaderboardPairRow extends SparkSummaryRow {
  pair_id: string;
  device_a_id: string;
  device_b_id: string;
  device_a_name: string | null;
  device_b_name: string | null;
  device_a_city: string | null;
  device_b_city: string | null;
}

interface RankedPair {
  row: LeaderboardPairRow;
  streakDays: number;
  rank: number;
}

export class SparkRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly getNow: () => Date = () => new Date(),
  ) {}

  recordQualifiedInteraction(
    pairId: string,
    kind: SparkInteractionKind,
  ): { changed: boolean; snapshot: SparkStreakSnapshotV1 } {
    this.requireActivePair(pairId);
    const point = getSparkCalendarPoint(this.getNow());
    if (point.isWeekend) {
      return { changed: false, snapshot: this.buildSnapshot(pairId, point) };
    }

    const changed = this.db.transaction(() => {
      const inserted = this.db
        .prepare(
          `INSERT OR IGNORE INTO pair_spark_activity_days (
            pair_id, activity_date, first_interaction_kind, first_interaction_at
          ) VALUES (?, ?, ?, ?)`,
        )
        .run(pairId, point.activityDate, kind, point.asOf);
      if (inserted.changes !== 1) {
        return false;
      }

      const previous = this.readSummary(pairId);
      const streakDays =
        previous?.last_qualified_date === point.previousBusinessDate
          ? previous.streak_days + 1
          : 1;
      this.db
        .prepare(
          `INSERT INTO pair_spark_streaks (
            pair_id, streak_days, last_qualified_date, last_qualified_at, updated_at
          ) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(pair_id) DO UPDATE SET
            streak_days = excluded.streak_days,
            last_qualified_date = excluded.last_qualified_date,
            last_qualified_at = excluded.last_qualified_at,
            updated_at = excluded.updated_at`,
        )
        .run(
          pairId,
          streakDays,
          point.activityDate,
          point.asOf,
          point.asOf,
        );
      return true;
    })();

    return { changed, snapshot: this.buildSnapshot(pairId, point) };
  }

  getSnapshot(pairId: string): SparkStreakSnapshotV1 {
    this.requireActivePair(pairId);
    return this.buildSnapshot(pairId, getSparkCalendarPoint(this.getNow()));
  }

  getLeaderboard(
    pairId: string,
    requestingDeviceId: string,
  ): SparkLeaderboardResponseV1 {
    const pair = this.requireActivePair(pairId);
    if (
      requestingDeviceId !== pair.device_a_id &&
      requestingDeviceId !== pair.device_b_id
    ) {
      throw new RelayError("auth_failed", 401, "Device is not part of this pair");
    }

    const point = getSparkCalendarPoint(this.getNow());
    const rows = this.readActivePairs();
    const ranked = rankEffectivePairs(rows, point);
    const requestingRank = ranked.find((entry) => entry.row.pair_id === pairId);
    const selfRow = rows.find((entry) => entry.pair_id === pairId);
    if (!selfRow) {
      throw new RelayError("pair_not_found", 404, "Active pair not found");
    }

    return {
      version: 1,
      snapshot: this.buildSnapshot(pairId, point),
      top20: ranked.slice(0, 20).map(toPublicEntry),
      self: toSelfEntry(
        selfRow,
        requestingDeviceId,
        requestingRank?.streakDays ?? 0,
        requestingRank?.rank ?? null,
      ),
      asOf: point.asOf,
    };
  }

  private buildSnapshot(
    pairId: string,
    point: SparkCalendarPoint,
  ): SparkStreakSnapshotV1 {
    const summary = this.readSummary(pairId);
    const streakDays =
      summary && isSparkSummaryEffective(summary.last_qualified_date, point)
        ? summary.streak_days
        : 0;
    return {
      version: 1,
      pairId,
      streakDays,
      tier: getSparkTier(streakDays),
      calendarState: point.isWeekend
        ? "weekend_protected"
        : summary?.last_qualified_date === point.activityDate
          ? "qualified_today"
          : "pending_today",
      lastQualifiedDate: summary?.last_qualified_date ?? null,
      timezone: "Asia/Shanghai",
      asOf: point.asOf,
      refreshAt: point.refreshAt,
    };
  }

  private readSummary(pairId: string): SparkSummaryRow | undefined {
    return this.db
      .prepare(
        `SELECT streak_days, last_qualified_date, last_qualified_at
        FROM pair_spark_streaks
        WHERE pair_id = ?`,
      )
      .get(pairId) as SparkSummaryRow | undefined;
  }

  private requireActivePair(pairId: string): {
    device_a_id: string;
    device_b_id: string;
  } {
    const row = this.db
      .prepare(
        `SELECT device_a_id, device_b_id
        FROM pairs
        WHERE pair_id = ? AND disabled_at IS NULL`,
      )
      .get(pairId) as
      | { device_a_id: string; device_b_id: string }
      | undefined;
    if (!row) {
      throw new RelayError("pair_not_found", 404, "Active pair not found");
    }
    return row;
  }

  private readActivePairs(): LeaderboardPairRow[] {
    return this.db
      .prepare(
        `SELECT
          p.pair_id,
          p.device_a_id,
          p.device_b_id,
          da.display_name AS device_a_name,
          db.display_name AS device_b_name,
          la.city_name AS device_a_city,
          lb.city_name AS device_b_city,
          COALESCE(s.streak_days, 0) AS streak_days,
          COALESCE(s.last_qualified_date, '') AS last_qualified_date,
          COALESCE(s.last_qualified_at, '') AS last_qualified_at
        FROM pairs p
        JOIN devices da ON da.device_id = p.device_a_id
        JOIN devices db ON db.device_id = p.device_b_id
        LEFT JOIN device_locations la ON la.device_id = p.device_a_id
        LEFT JOIN device_locations lb ON lb.device_id = p.device_b_id
        LEFT JOIN pair_spark_streaks s ON s.pair_id = p.pair_id
        WHERE p.disabled_at IS NULL`,
      )
      .all() as LeaderboardPairRow[];
  }
}

function rankEffectivePairs(
  rows: LeaderboardPairRow[],
  point: SparkCalendarPoint,
): RankedPair[] {
  const effective = rows
    .map((row) => ({
      row,
      streakDays: isSparkSummaryEffective(row.last_qualified_date || null, point)
        ? row.streak_days
        : 0,
    }))
    .filter((entry) => entry.streakDays > 0)
    .sort(
      (left, right) =>
        right.streakDays - left.streakDays ||
        right.row.last_qualified_at.localeCompare(left.row.last_qualified_at) ||
        left.row.pair_id.localeCompare(right.row.pair_id),
    );

  let previousDays = -1;
  let rank = 0;
  return effective.map((entry, index) => {
    if (entry.streakDays !== previousDays) {
      rank = index + 1;
      previousDays = entry.streakDays;
    }
    return { ...entry, rank };
  });
}

function toPublicEntry(entry: RankedPair): SparkLeaderboardEntryV1 {
  return {
    rank: entry.rank,
    displayNames: [
      maskSparkNickname(readName(entry.row.device_a_name)),
      maskSparkNickname(readName(entry.row.device_b_name)),
    ],
    cities: [readCity(entry.row.device_a_city), readCity(entry.row.device_b_city)],
    streakDays: entry.streakDays,
    tier: getSparkTier(entry.streakDays),
  };
}

function toSelfEntry(
  row: LeaderboardPairRow,
  requestingDeviceId: string,
  streakDays: number,
  rank: number | null,
): SparkLeaderboardSelfV1 {
  const stableNames: [string, string] = [
    readName(row.device_a_name),
    readName(row.device_b_name),
  ];
  const stableCities: [string, string] = [
    readCity(row.device_a_city),
    readCity(row.device_b_city),
  ];
  const requesterIsA = requestingDeviceId === row.device_a_id;
  return {
    rank,
    displayNames: requesterIsA ? stableNames : [stableNames[1], stableNames[0]],
    cities: requesterIsA ? stableCities : [stableCities[1], stableCities[0]],
    streakDays,
    tier: getSparkTier(streakDays),
  };
}

function readName(value: string | null): string {
  return value?.trim() || "昵称待设置";
}

function readCity(value: string | null): string {
  return value?.trim() || "城市待设置";
}
