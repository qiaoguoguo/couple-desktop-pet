import { describe, expect, it } from "vitest";
import { readPlatformConfig } from "./config.js";

describe("platform config", () => {
  it("defaults CORS origins to local platform web origins", () => {
    const config = readPlatformConfig({});

    expect(config.corsOrigins).toEqual([
      "http://127.0.0.1:19080",
      "http://localhost:19080",
    ]);
  });

  it("parses CORS origins from comma separated env", () => {
    const config = readPlatformConfig({
      PLATFORM_CORS_ORIGINS: " https://pet.example.com, http://127.0.0.1:19080 ",
    });

    expect(config.corsOrigins).toEqual([
      "https://pet.example.com",
      "http://127.0.0.1:19080",
    ]);
  });
});
