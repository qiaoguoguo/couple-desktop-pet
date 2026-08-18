import { beforeEach, describe, expect, it } from "vitest";
import { FixedWindowRateLimiter } from "./requestRateLimiter.js";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

let now: number;
let limiter: FixedWindowRateLimiter;

beforeEach(() => {
  now = Date.parse("2026-08-18T04:00:00.000Z");
  limiter = new FixedWindowRateLimiter(() => now);
});

describe("FixedWindowRateLimiter", () => {
  it("tracks remaining requests and resets exactly at the window boundary", () => {
    for (let index = 0; index < 10; index += 1) {
      expect(limiter.consume("search:device:dev_a", 10, MINUTE_MS)).toEqual({
        allowed: true,
        remaining: 9 - index,
      });
    }

    expect(limiter.consume("search:device:dev_a", 10, MINUTE_MS)).toEqual({
      allowed: false,
      retryAfterMs: MINUTE_MS,
    });

    now += MINUTE_MS - 1;
    expect(limiter.consume("search:device:dev_a", 10, MINUTE_MS)).toEqual({
      allowed: false,
      retryAfterMs: 1,
    });

    now += 1;
    expect(limiter.consume("search:device:dev_a", 10, MINUTE_MS)).toEqual({
      allowed: true,
      remaining: 9,
    });
  });

  it("limits search devices and source IPs independently to 10 per minute", () => {
    consumeAllowed("search:device:dev_a", 10, MINUTE_MS);
    consumeAllowed("search:ip:203.0.113.10", 10, MINUTE_MS);

    expect(limiter.consume("search:device:dev_a", 10, MINUTE_MS).allowed).toBe(false);
    expect(limiter.consume("search:ip:203.0.113.10", 10, MINUTE_MS).allowed).toBe(false);
    expect(limiter.consume("search:device:dev_b", 10, MINUTE_MS)).toEqual({
      allowed: true,
      remaining: 9,
    });
  });

  it("supports the profile 10-per-hour and weather 30-per-minute policies", () => {
    consumeAllowed("profile:device:dev_a", 10, HOUR_MS);
    consumeAllowed("weather:device:dev_a", 30, MINUTE_MS);

    expect(limiter.consume("profile:device:dev_a", 10, HOUR_MS)).toEqual({
      allowed: false,
      retryAfterMs: HOUR_MS,
    });
    expect(limiter.consume("weather:device:dev_a", 30, MINUTE_MS)).toEqual({
      allowed: false,
      retryAfterMs: MINUTE_MS,
    });
  });

  it("evicts unrelated windows exactly when their reset time is reached", () => {
    limiter.consume("search:device:dev_a", 10, MINUTE_MS);
    limiter.consume("search:ip:203.0.113.10", 10, MINUTE_MS);
    expect(limiter.getRetainedEntryCount()).toBe(2);

    now += MINUTE_MS - 1;
    limiter.consume("search:device:dev_b", 10, MINUTE_MS);
    expect(limiter.getRetainedEntryCount()).toBe(3);

    now += 1;
    limiter.consume("search:device:dev_c", 10, MINUTE_MS);
    expect(limiter.getRetainedEntryCount()).toBe(2);
  });
});

function consumeAllowed(key: string, limit: number, windowMs: number): void {
  for (let index = 0; index < limit; index += 1) {
    expect(limiter.consume(key, limit, windowMs).allowed).toBe(true);
  }
}
