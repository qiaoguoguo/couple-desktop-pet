import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

describe("couple pet platform compose config", () => {
  it("isolates platform services and exposes only web/api ports", () => {
    const source = readFileSync(
      "deploy/couple-pet-platform/compose.yaml",
      "utf8",
    );
    const compose = parse(source) as {
      services: Record<string, { ports?: string[]; volumes?: string[] }>;
    };

    expect(Object.keys(compose.services).sort()).toEqual([
      "platform-api",
      "platform-web",
      "postgres",
    ]);
    expect(compose.services["platform-web"].ports).toEqual(["19080:80"]);
    expect(compose.services["platform-api"].ports).toEqual(["19081:3000"]);
    expect(compose.services.postgres.ports ?? []).toEqual([]);
    expect(source).not.toContain("/opt/qherp");
  });
});
