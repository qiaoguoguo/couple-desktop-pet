import { describe, expect, it } from "vitest";
import type { SparkStreakSnapshotV1 } from "../../shared/sparkProtocol";
import {
  formatSparkPair,
  formatSparkRank,
  getSparkCalendarCopy,
} from "./sparkPresentation";

describe("sparkPresentation", () => {
  it("formats pair identity and zero-rank copy", () => {
    expect(formatSparkPair(["小雨", "阿程"])).toBe("小雨 & 阿程");
    expect(formatSparkRank(27)).toBe("27");
    expect(formatSparkRank(null)).toBe("暂未上榜");
  });

  it.each([
    ["qualified_today", "今天的火花已经续上"],
    ["pending_today", "今天等一次互动"],
    ["weekend_protected", "周末休息，火花会替你们守到周一"],
  ] as const)("maps %s calendar state", (calendarState, expected) => {
    expect(
      getSparkCalendarCopy({ calendarState } as SparkStreakSnapshotV1),
    ).toBe(expected);
  });
});
