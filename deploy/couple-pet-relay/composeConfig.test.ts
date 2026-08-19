import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

describe("couple pet relay compose config", () => {
  it("excludes generated state from the Docker context without excluding sources", () => {
    const rules = readFileSync(".dockerignore", "utf8")
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    expect(rules).toEqual(
      expect.arrayContaining([
        "**/node_modules",
        "**/node_modules/**",
        "**/dist",
        "**/dist/**",
        "**/.data",
        "**/.data/**",
      ]),
    );
    for (const requiredPath of [
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "server",
      "server/",
      "server/**",
      "shared",
      "shared/",
      "shared/**",
    ]) {
      expect(rules).not.toContain(requiredPath);
    }
  });

  it("installs the Alpine native addon toolchain before dependencies", () => {
    const dockerfile = readFileSync("server/Dockerfile", "utf8");
    const nativeToolchainStep = dockerfile.indexOf(
      "RUN apk add --no-cache python3 make g++",
    );
    const dependencyInstallStep = dockerfile.indexOf(
      "RUN pnpm install --frozen-lockfile --filter couple-desktop-pet-relay...",
    );

    expect(nativeToolchainStep).toBeGreaterThan(-1);
    expect(dependencyInstallStep).toBeGreaterThan(nativeToolchainStep);
  });

  it("publishes relay port and persists sqlite data", () => {
    const source = readFileSync("deploy/couple-pet-relay/compose.yaml", "utf8");
    const compose = parse(source) as {
      services: Record<
        string,
        {
          environment?: Record<string, string | number>;
          ports?: string[];
          volumes?: string[];
        }
      >;
      volumes: Record<string, unknown>;
    };
    const relay = compose.services.relay;

    expect(relay.ports).toEqual(["8787:8787"]);
    expect(relay.environment?.RELAY_HOST).toBe("0.0.0.0");
    expect(relay.environment?.RELAY_PORT).toBe(8787);
    expect(relay.environment?.RELAY_DATABASE_PATH).toBe(
      "/app/server/.data/relay.sqlite",
    );
    expect(relay.volumes).toContain("relay-data:/app/server/.data");
    expect(compose.volumes).toHaveProperty("relay-data");
  });
});
