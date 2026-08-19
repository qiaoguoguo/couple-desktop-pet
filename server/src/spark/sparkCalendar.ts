const BEIJING_TIME_ZONE = "Asia/Shanghai";
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: BEIJING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export interface SparkCalendarPoint {
  activityDate: string;
  isWeekend: boolean;
  previousBusinessDate: string;
  refreshAt: string;
  asOf: string;
}

export function getSparkCalendarPoint(now: Date): SparkCalendarPoint {
  if (!Number.isFinite(now.getTime())) {
    throw new RangeError("Spark calendar time must be valid");
  }

  const activityDate = formatBeijingDate(now);
  const dayOfWeek = getDayOfWeek(activityDate);
  return {
    activityDate,
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    previousBusinessDate: getPreviousBusinessDate(activityDate),
    refreshAt: getNextBeijingMidnight(activityDate),
    asOf: now.toISOString(),
  };
}

export function isSparkSummaryEffective(
  lastQualifiedDate: string | null,
  point: SparkCalendarPoint,
): boolean {
  return (
    lastQualifiedDate !== null &&
    (lastQualifiedDate === point.activityDate ||
      lastQualifiedDate === point.previousBusinessDate)
  );
}

function formatBeijingDate(now: Date): string {
  const parts = DATE_FORMATTER.formatToParts(now);
  const year = readPart(parts, "year");
  const month = readPart(parts, "month");
  const day = readPart(parts, "day");
  return `${year}-${month}-${day}`;
}

function readPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  const value = parts.find((part) => part.type === type)?.value;
  if (value === undefined) {
    throw new Error(`Missing Beijing date part: ${type}`);
  }
  return value;
}

function getPreviousBusinessDate(activityDate: string): string {
  let candidate = addDays(activityDate, -1);
  while (isWeekendDate(candidate)) {
    candidate = addDays(candidate, -1);
  }
  return candidate;
}

function isWeekendDate(date: string): boolean {
  const day = getDayOfWeek(date);
  return day === 0 || day === 6;
}

function getDayOfWeek(date: string): number {
  return parseUtcDate(date).getUTCDay();
}

function addDays(date: string, days: number): string {
  const value = parseUtcDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function parseUtcDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function getNextBeijingMidnight(activityDate: string): string {
  const nextLocalDate = parseUtcDate(addDays(activityDate, 1));
  return new Date(nextLocalDate.getTime() - BEIJING_OFFSET_MS).toISOString();
}
