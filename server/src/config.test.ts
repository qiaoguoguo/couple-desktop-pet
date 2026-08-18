import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readRelayConfig } from "./config.js";

let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "couple-pet-config-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("readRelayConfig weather settings", () => {
  it("reads a trimmed key and defaults the request timeout", () => {
    const config = readRelayConfig({
      RELAY_DATABASE_PATH: join(tempDir, "relay.sqlite"),
      WEATHER_API_KEY: "  secret-key  ",
    });

    expect(config.weatherApiKey).toBe("secret-key");
    expect(config.weatherRequestTimeoutMs).toBe(5000);
  });

  it("treats a blank key as not configured", () => {
    const config = readRelayConfig({
      RELAY_DATABASE_PATH: join(tempDir, "relay.sqlite"),
      WEATHER_API_KEY: "   ",
    });

    expect(config.weatherApiKey).toBeNull();
  });

  it.each([
    ["1000", 1000],
    ["2750", 2750],
    ["30000", 30000],
  ])("accepts timeout %s", (value, expected) => {
    const config = readRelayConfig({
      RELAY_DATABASE_PATH: join(tempDir, "relay.sqlite"),
      WEATHER_REQUEST_TIMEOUT_MS: value,
    });

    expect(config.weatherRequestTimeoutMs).toBe(expected);
  });

  it.each(["999", "30001", "2500.5", "not-a-number", ""])(
    "defaults invalid timeout %j",
    (value) => {
      const config = readRelayConfig({
        RELAY_DATABASE_PATH: join(tempDir, "relay.sqlite"),
        WEATHER_REQUEST_TIMEOUT_MS: value,
      });

      expect(config.weatherRequestTimeoutMs).toBe(5000);
    },
  );
});
