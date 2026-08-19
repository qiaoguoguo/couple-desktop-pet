import { describe, expect, it } from "vitest";
import {
  getSparkCalendarPoint,
  isSparkSummaryEffective,
} from "./sparkCalendar.js";

describe("getSparkCalendarPoint", () => {
  it("uses Beijing midnight rather than the host timezone", () => {
    expect(
      getSparkCalendarPoint(new Date("2026-08-14T15:59:59.000Z")),
    ).toEqual({
      activityDate: "2026-08-14",
      isWeekend: false,
      previousBusinessDate: "2026-08-13",
      refreshAt: "2026-08-14T16:00:00.000Z",
      asOf: "2026-08-14T15:59:59.000Z",
    });

    expect(
      getSparkCalendarPoint(new Date("2026-08-14T16:00:00.000Z")),
    ).toMatchObject({
      activityDate: "2026-08-15",
      isWeekend: true,
      previousBusinessDate: "2026-08-14",
      refreshAt: "2026-08-15T16:00:00.000Z",
    });
  });

  it.each([
    ["2026-08-15T02:00:00.000Z", "2026-08-15", true, "2026-08-14"],
    ["2026-08-16T02:00:00.000Z", "2026-08-16", true, "2026-08-14"],
    ["2026-08-16T18:00:00.000Z", "2026-08-17", false, "2026-08-14"],
  ] as const)(
    "classifies %s",
    (now, activityDate, isWeekend, previousBusinessDate) => {
      expect(getSparkCalendarPoint(new Date(now))).toMatchObject({
        activityDate,
        isWeekend,
        previousBusinessDate,
      });
    },
  );

  it.each([
    ["2026-08-31T16:00:00.000Z", "2026-09-01", "2026-08-31"],
    ["2026-12-31T16:00:00.000Z", "2027-01-01", "2026-12-31"],
  ] as const)("handles calendar rollover at %s", (now, date, previous) => {
    expect(getSparkCalendarPoint(new Date(now))).toMatchObject({
      activityDate: date,
      previousBusinessDate: previous,
    });
  });

  it("treats a Chinese public holiday as an ordinary weekday", () => {
    expect(
      getSparkCalendarPoint(new Date("2026-10-01T02:00:00.000Z")),
    ).toMatchObject({
      activityDate: "2026-10-01",
      isWeekend: false,
      previousBusinessDate: "2026-09-30",
    });
  });
});

describe("isSparkSummaryEffective", () => {
  it("keeps Friday effective through Monday and resets after Monday is missed", () => {
    const monday = getSparkCalendarPoint(new Date("2026-08-17T02:00:00.000Z"));
    const tuesday = getSparkCalendarPoint(new Date("2026-08-18T02:00:00.000Z"));

    expect(isSparkSummaryEffective("2026-08-14", monday)).toBe(true);
    expect(isSparkSummaryEffective("2026-08-17", monday)).toBe(true);
    expect(isSparkSummaryEffective("2026-08-14", tuesday)).toBe(false);
    expect(isSparkSummaryEffective(null, tuesday)).toBe(false);
  });

  it("protects Friday across the weekend", () => {
    const sunday = getSparkCalendarPoint(new Date("2026-08-16T02:00:00.000Z"));
    expect(isSparkSummaryEffective("2026-08-14", sunday)).toBe(true);
    expect(isSparkSummaryEffective("2026-08-13", sunday)).toBe(false);
  });
});
