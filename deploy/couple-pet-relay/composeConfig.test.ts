import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

describe("couple pet relay compose config", () => {
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
